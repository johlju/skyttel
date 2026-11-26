import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import OpenAI from 'openai';
import type { InitialItem, LiveCreateParams } from 'openai/resources/live/live';
import { SidebandWS } from 'openai/resources/live/sideband/ws';
import { conversationConsentRevoked } from '../shared/conversation-consent.js';
import { sessionWarningMessage } from '../shared/session-activity.js';
import type { TextAssistantView } from '../shared/text-assistant.js';
import { unconfirmedPlaybackIdleMs, type VoiceAssistantView } from '../shared/voice-assistant.js';
import { voiceErrorGroup } from '../shared/voice-error.js';
import { newConversationMessage } from './assistant-feedback.js';
import { voiceAssistantInstructions } from './assistant-instructions.js';
import {
  type AssistantObservationContext,
  backendTaskObservationContext,
  type ObserveAssistant,
  voiceDelegationObservationContext,
  withBackendObservationRequest,
} from './assistant-observation.js';
import type { Config } from './config.js';
import { voiceConversationModel } from './conversation-capacity.js';
import type { ConversationConsentProvenance } from './conversation-consent.js';
import {
  boundedLiveHistory,
  type LiveHandoff,
  type LiveModelProfile,
  type LiveSideband,
  type LiveSidebandFactory,
  type LiveUsage,
  type LiveUsageAttempt,
} from './live-provider.js';
import { MapError } from './map.js';
import type { LocalDispatch } from './text-assistant-mcp.js';
import { VoiceMessageRefusal } from './voice-message-refusal.js';
import { voiceWork } from './voice-work.js';

type Voice = Partial<ConversationConsentProvenance> & {
  view: VoiceAssistantView;
  usage: LiveUsageAttempt;
  path: string;
  headers: Headers;
  assistant: TextAssistantView;
  channel: LiveSideband;
  heartbeat: number;
  microphoneOn: boolean;
  speakerActive?: boolean;
  playbackPendingSince?: number;
  deliveryConnectionId?: string;
  finalized: boolean;
  timer: NodeJS.Timeout;
  deadlineTimer?: NodeJS.Timeout;
  warningTimer?: NodeJS.Timeout;
  warnedUntil?: number;
  quietAt?: number;
  warn: () => void;
  access: () => number;
  closed?: Promise<void>;
  finish?: () => void;
  work?: ReturnType<typeof voiceWork>;
};

function startupErrorCode(error: unknown) {
  if (error instanceof OpenAI.APIConnectionTimeoutError) return 'voice_provider_timeout';
  if (error instanceof OpenAI.APIError) {
    if (error.status === 408) return 'voice_provider_timeout';
    if (error.status === 401) return 'voice_provider_authentication_failed';
    if (error.status === 403 || error.status === 404) return 'voice_provider_access_denied';
    if (error.status === 429) return 'voice_provider_limit';
    if (error.status === 400 || error.status === 422) return 'voice_provider_rejected';
    if (error.status && error.status >= 500) return 'voice_provider_unavailable';
  }
  return 'voice_connection_failed';
}

function validDeliveryConnectionId(value: unknown) {
  return value === undefined || (typeof value === 'string' && /^[\w-]{1,128}$/.test(value));
}

export function voiceAssistantRoutes({
  config,
  dispatch,
  liveFetch,
  liveSideband,
  liveUsage,
  recordUsage,
  interrupt,
  liveHandoff,
  transcript,
  contextUsage,
  prepareVoiceContext,
  voiceInput,
  observe,
  observationResetGeneration,
  liveProfile = voiceConversationModel,
  now = () => Date.now(),
  voiceAccess,
  voiceDeliveryAvailable,
  expireVoiceWork,
}: {
  now?: () => number;
  voiceAccess: (sessionId: string) =>
    | (Partial<ConversationConsentProvenance> & {
        expiresAt: number;
        guard: () => number;
      })
    | undefined;
  voiceDeliveryAvailable: (sessionId: string, connectionId: string) => boolean;
  expireVoiceWork: (sessionId: string) => void;
  config: Config;
  dispatch: LocalDispatch;
  liveFetch?: typeof fetch;
  liveSideband?: LiveSidebandFactory;
  liveUsage?: LiveUsage;
  recordUsage?: LiveUsage;
  interrupt: (sessionId: string, revision?: number) => void;
  liveHandoff?: (sessionId: string) => LiveHandoff;
  transcript?: (
    sessionId: string,
    role: 'user' | 'assistant',
    text: string,
    utteranceStart: boolean,
    eventId: string,
  ) => ((requestId?: string) => void) | undefined;
  contextUsage?: (
    sessionId: string,
    contextRevision: number,
    source: string,
    ratio?: unknown,
  ) => void;
  prepareVoiceContext?: (
    sessionId: string,
    signal?: AbortSignal,
    voiceLink?: { traceId: string; spanId: string },
  ) => Promise<TextAssistantView | undefined>;
  voiceInput?: (sessionId: string, pending: boolean, text?: string) => void;
  observe?: ObserveAssistant;
  observationResetGeneration: (sessionId: string) => number | undefined;
  liveProfile?: LiveModelProfile;
}) {
  if (
    liveProfile.provider !== 'openai' ||
    !/^[a-z0-9.-]+$/.test(liveProfile.model) ||
    !Number.isSafeInteger(liveProfile.tokens) ||
    liveProfile.tokens <= 0
  )
    throw new Error('invalid_live_profile');
  const routes = new Hono();
  const voices = new Map<string, Voice>();
  const starting = new Set<() => number>();
  const client = config.openaiApiKey
    ? new OpenAI({
        apiKey: config.openaiApiKey,
        baseURL: 'https://api.openai.com/v1',
        fetch: liveFetch,
        maxRetries: 0,
        timeout: 30_000,
        logLevel: 'off',
      })
    : null;
  const base = '/households/:id/text-assistant/:sessionId/voice';
  function headers(source: Headers) {
    const value = new Headers({ origin: config.origin, 'content-type': 'application/json' });
    for (const name of ['Cookie', 'X-Skyttel-Build']) {
      const item = source.get(name);
      if (item) value.set(name, item);
    }
    return value;
  }
  async function assistant(path: string, requestHeaders: Headers): Promise<TextAssistantView> {
    const response = await dispatch(
      new Request(`${config.origin}${path}`, { headers: requestHeaders }),
    );
    if (!response.ok) {
      const refusal = await response.json().catch(() => null);
      throw new MapError(refusal?.error ?? 'voice_access_lost', response.status as 401 | 403 | 404);
    }
    return response.json();
  }
  function report(usage: LiveUsageAttempt) {
    try {
      recordUsage?.({ ...usage });
      liveUsage?.({ ...usage });
    } catch {
      console.error(JSON.stringify({ event: 'live_usage_unavailable' }));
    }
  }
  function record(voice: Voice) {
    report(voice.usage);
  }
  function observationContext(voice: Voice): AssistantObservationContext {
    return {
      owner: 'voice',
      traceId: voice.view.id,
      spanId: voice.view.id,
      voiceSessionId: voice.view.id,
      providerCallId: voice.usage.attemptId,
    };
  }
  function close(voice: Voice, error?: string) {
    if (voice.closed) return voice.closed;
    const authorityEnded = error === 'voice_session_expired' || error === 'voice_access_lost';
    const canceling = authorityEnded ? undefined : voice.work?.stop();
    if (authorityEnded) voice.work?.retire();
    voice.view.phase = 'closing';
    voice.view.error = error;
    if (error) {
      voice.view.errorGroup = voiceErrorGroup(error, 'interrupted');
      voice.view.diagnosticId = voice.usage.attemptId;
      console.error(
        JSON.stringify({
          event: 'voice_interrupted',
          diagnosticId: voice.usage.attemptId,
          stage: 'session',
          code: error,
          group: voice.view.errorGroup,
        }),
      );
    }
    clearInterval(voice.timer);
    clearTimeout(voice.deadlineTimer);
    clearTimeout(voice.warningTimer);
    let resolve!: () => void;
    voice.closed = new Promise<void>((done) => {
      resolve = done;
    });
    let finished = false;
    const timeout = setTimeout(finish, 2000);
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      voice.finish = undefined;
      voice.finalized = true;
      voice.view.phase = error ? 'error' : 'closed';
      voice.usage.endedAt = new Date().toISOString();
      voice.usage.outcome = voice.view.usageFinal ? 'closed' : 'interrupted';
      const status =
        error === 'voice_connection_lost'
          ? 'disconnected'
          : error
            ? 'failed'
            : voice.view.usageFinal
              ? 'completed'
              : 'incomplete';
      observe?.({
        at: now(),
        sessionId: voice.assistant.id,
        consentTextVersion: voice.consentTextVersion,
        conversationConsentTextVersion: voice.conversationConsentTextVersion,
        context: observationContext(voice),
        kind: 'voice_completed',
        status,
        ...(status === 'incomplete' ? { evidenceGap: 'missing_end' as const } : {}),
        data: {
          model: liveProfile.model,
          endedAt: now(),
          ...(error
            ? { error: status === 'disconnected' ? 'voice_disconnected' : 'voice_failed' }
            : {}),
        },
      });
      record(voice);
      voice.channel.close();
      setTimeout(() => voices.delete(voice.view.id), 60_000).unref();
      // Task invalidation was synchronous; do not keep the media session open
      // indefinitely waiting for its ordinary status refresh.
      void Promise.race([canceling, new Promise((done) => setTimeout(done, 2000).unref())]).finally(
        resolve,
      );
    }
    voice.finish = finish;
    try {
      voice.channel.send({ type: 'session.close' });
      if (authorityEnded) {
        if (voice.channel.socket.readyState !== 0) finish();
        // The SDK queues sends while connecting. Let its opening handshake
        // flush the close instead of dropping it, within the same close cap.
        else voice.channel.socket.on('open', () => voice.finish?.());
      }
    } catch {
      finish();
    }
    return voice.closed;
  }
  routes.post(base, async (context) => {
    if (context.req.header('Origin') !== config.origin)
      return context.json({ error: 'forbidden' }, 403);
    const requestHeaders = headers(context.req.raw.headers);
    const path = `/api/households/${encodeURIComponent(context.req.param('id'))}/text-assistant/${encodeURIComponent(context.req.param('sessionId'))}`;
    let current = await assistant(path, requestHeaders);
    if (!client)
      return context.json({ error: 'voice_unavailable', voiceErrorGroup: 'administration' }, 503);
    const body = await context.req.json().catch(() => null);
    if (
      typeof body?.sdp !== 'string' ||
      !body.sdp ||
      body.sdp.length > 12000 ||
      !validDeliveryConnectionId(body.deliveryConnectionId)
    )
      return context.json({ error: 'invalid_request' }, 400);
    if (
      (current.phase === 'working' &&
        !(body.newConversation === true && current.resetDiscardPending)) ||
      body.revision !== current.revision ||
      body.draftVersion !== current.review.version ||
      body.contentVersion !== current.review.contentVersion
    )
      return context.json({ error: 'assistant_draft_changed' }, 409);
    let history: InitialItem[] | undefined;
    if (body.history !== undefined) {
      if (
        body.newConversation === true ||
        !Array.isArray(body.history) ||
        body.history.length > 2000
      )
        return context.json({ error: 'invalid_request' }, 400);
      history = [];
      let characters = 0;
      for (const row of body.history) {
        if (
          !row ||
          !['user', 'assistant'].includes(row.role) ||
          typeof row.text !== 'string' ||
          (row.partial !== undefined && typeof row.partial !== 'boolean')
        )
          return context.json({ error: 'invalid_request' }, 400);
        characters += row.text.length;
        if (characters > 500_000) return context.json({ error: 'invalid_request' }, 400);
        const status = row.partial ? ('incomplete' as const) : ('completed' as const);
        history.push(
          row.role === 'user'
            ? { role: 'user', content: [{ type: 'input_text', text: row.text }], status }
            : { role: 'assistant', content: [{ type: 'output_text', text: row.text }], status },
        );
      }
    }
    for (const previous of voices.values()) if (previous.path === path) await close(previous);
    const sessionId = context.req.param('sessionId');
    const access = voiceAccess(sessionId);
    if (!access) throw new MapError('voice_session_expired', 401);
    const usage: LiveUsageAttempt = {
      attemptId: randomUUID(),
      sessionId: null,
      model: liveProfile.model,
      startedAt: new Date().toISOString(),
      endedAt: null,
      seconds: null,
      final: false,
      outcome: 'starting',
    };
    const voiceId = randomUUID();
    const consentTextVersion = access.consentTextVersion ?? current.consentTextVersion;
    const conversationConsentTextVersion =
      access.conversationConsentTextVersion ?? current.consentTextVersion;
    let observationStarted = false;
    let providerObservationStarted = false;
    let providerObservationEnded = false;
    // Required ledger start must commit before any billable provider request.
    recordUsage?.({ ...usage });
    try {
      liveUsage?.({ ...usage });
    } catch {
      console.error(JSON.stringify({ event: 'live_usage_unavailable' }));
    }
    const startup = new AbortController();
    const abortedStartup = () => startup.abort();
    context.req.raw.signal.addEventListener('abort', abortedStartup, { once: true });
    if (context.req.raw.signal.aborted) startup.abort();
    let activeVoice: Voice | undefined;
    let startupObservationEnded = false;
    const finishStartupObservation = (status: 'failed' | 'canceled') => {
      if (!observationStarted || activeVoice || startupObservationEnded) return;
      startupObservationEnded = true;
      observe?.({
        at: now(),
        sessionId,
        consentTextVersion,
        conversationConsentTextVersion,
        context: {
          owner: 'voice',
          traceId: voiceId,
          spanId: voiceId,
          voiceSessionId: voiceId,
          providerCallId: usage.attemptId,
        },
        kind: 'voice_completed',
        status,
        data: {
          model: liveProfile.model,
          endedAt: now(),
          error: status === 'canceled' ? 'voice_canceled' : 'voice_failed',
        },
      });
    };
    const providerObservation = (
      outcome: 'started' | 'completed' | 'failed' | 'aborted',
      content: { input?: unknown; output?: unknown } = {},
    ) => {
      providerObservationStarted = true;
      providerObservationEnded = outcome !== 'started';
      observe?.({
        at: now(),
        sessionId,
        consentTextVersion,
        conversationConsentTextVersion,
        context: {
          owner: 'voice',
          traceId: voiceId,
          spanId: usage.attemptId,
          parentSpanId: voiceId,
          voiceSessionId: voiceId,
          providerCallId: usage.attemptId,
        },
        kind: 'voice_attempt',
        status:
          outcome === 'started'
            ? 'incomplete'
            : outcome === 'aborted'
              ? 'canceled'
              : outcome === 'completed'
                ? 'completed'
                : 'failed',
        data: {
          model: liveProfile.model,
          outcome,
          startedAt: usage.startedAt,
          ...(outcome !== 'started' ? { endedAt: now() } : {}),
          ...content,
          ...(['failed', 'aborted'].includes(outcome)
            ? { error: outcome === 'aborted' ? 'voice_canceled' : 'voice_failed' }
            : {}),
        },
      });
    };
    let deadlineTimer: NodeJS.Timeout | undefined;
    let warningTimer: NodeJS.Timeout | undefined;
    let expired = false;
    let endReason = 'voice_session_expired';
    let effectiveDeadline = access.expiresAt;
    const expire = (reason = endReason) => {
      endReason = reason;
      expired = true;
      startup.abort();
      expireVoiceWork(sessionId);
      if (activeVoice) void close(activeVoice, endReason);
    };
    const scheduleWarning = (delay: number) => {
      clearTimeout(warningTimer);
      warningTimer = setTimeout(warn, Math.max(1, delay)).unref();
      if (activeVoice) activeVoice.warningTimer = warningTimer;
    };
    const warn = () => {
      clearTimeout(warningTimer);
      warningTimer = undefined;
      const voice = activeVoice;
      if (expired || voice?.closed) return;
      if (!voice) return scheduleWarning(250);
      try {
        const end = access.guard();
        if (end !== effectiveDeadline) {
          check();
          return;
        }
        if (end <= now()) return expire();
        if (voice.warnedUntil === end) return;
        if (end - now() > 5 * 60_000) return scheduleWarning(end - now() - 5 * 60_000);
        if (
          voice.quietAt === undefined ||
          now() - voice.quietAt > 1000 ||
          !voice.work?.readyForSummary()
        )
          return scheduleWarning(250);
        voice.channel.send({
          type: 'session.commentary.append',
          delegation_id: null,
          content: sessionWarningMessage,
        });
        voice.warnedUntil = end;
      } catch {
        expire(effectiveDeadline <= now() ? 'voice_session_expired' : 'voice_access_lost');
      }
    };
    const check = () => {
      if (expired) throw new MapError(endReason, 401);
      try {
        const expiresAt = access.guard();
        const previousDeadline = effectiveDeadline;
        effectiveDeadline = expiresAt;
        if (!Number.isFinite(expiresAt) || expiresAt <= now())
          throw new MapError('voice_session_expired', 401);
        if (deadlineTimer && previousDeadline === expiresAt) return expiresAt;
        clearTimeout(deadlineTimer);
        deadlineTimer = setTimeout(
          () => {
            deadlineTimer = undefined;
            // A real action may have moved the inactivity bound. Re-read the
            // same authoritative policy at its previously effective deadline.
            try {
              check();
            } catch {
              // check() synchronously retires the rejected lease.
            }
          },
          Math.max(1, expiresAt - now()),
        ).unref();
        if (activeVoice) activeVoice.deadlineTimer = deadlineTimer;
        scheduleWarning(expiresAt - now() - 5 * 60_000);
        return expiresAt;
      } catch (error) {
        expire(effectiveDeadline <= now() ? 'voice_session_expired' : 'voice_access_lost');
        throw error;
      }
    };
    let stage = 'prepare';
    starting.add(check);
    try {
      check();
      observe?.({
        at: now(),
        sessionId,
        consentTextVersion,
        conversationConsentTextVersion,
        context: {
          owner: 'voice',
          traceId: voiceId,
          spanId: voiceId,
          voiceSessionId: voiceId,
          providerCallId: usage.attemptId,
        },
        kind: 'voice_started',
        status: 'incomplete',
        data: {
          model: liveProfile.model,
          startedAt: now(),
          input: {
            model: liveProfile.model,
            instructions: voiceAssistantInstructions,
            store: false,
            delegation: { type: 'client' },
          },
        },
      });
      observationStarted = true;
      current =
        (await prepareVoiceContext?.(sessionId, startup.signal, {
          traceId: voiceId,
          spanId: voiceId,
        })) ?? current;
      check();
      current = await assistant(path, requestHeaders);
      check();
      if (current.contextSummaryState === 'failed')
        return context.json({ error: 'assistant_context_summary_failed' }, 409);
      if (current.contextSummaryState === 'summarizing')
        return context.json({ error: 'assistant_busy' }, 409);
      const retained = liveHandoff?.(sessionId);
      let currentHistoryItem: InitialItem | undefined;
      if (retained) {
        history = retained.dialogue.length
          ? retained.dialogue.map(({ role, text, partial }) =>
              role === 'user'
                ? {
                    role,
                    content: [{ type: 'input_text', text }],
                    status: partial ? 'incomplete' : 'completed',
                  }
                : {
                    role,
                    content: [{ type: 'output_text', text }],
                    status: partial ? 'incomplete' : 'completed',
                  },
            )
          : undefined;
        if (retained.currentState)
          currentHistoryItem = {
            role: 'assistant',
            content: [{ type: 'output_text', text: retained.currentState }],
            status: 'completed',
          };
      }
      const initialHistory = boundedLiveHistory(history ?? [], currentHistoryItem);
      stage = 'create';
      const liveSession: LiveCreateParams['session'] = {
        model: liveProfile.model,
        audio: { output: { voice: 'marin' } },
        delegation: { type: 'client' },
        store: false,
        instructions: voiceAssistantInstructions,
        // Historical rows only seed the provider. They never become voiceWork's
        // pending user fragments, which alone can authorize a fresh save.
        ...(initialHistory.length ? { input: initialHistory } : {}),
        client: {
          data_channel: {
            allowed_client_events: ['session.close'],
            allowed_server_events: [
              { type: 'session.started' },
              { type: 'session.closed' },
              { type: 'session.input_transcript.delta' },
              { type: 'session.output_transcript.delta' },
              { type: 'session.delegation.created' },
              { type: 'error' },
            ],
          },
        },
      };
      providerObservation('started', { input: liveSession });
      const result = await client.live.create(
        {
          session: liveSession,
          transport: { type: 'webrtc', sdp: body.sdp },
        },
        { signal: startup.signal },
      );
      if (
        !/^[\w-]{1,200}$/.test(result.session.id) ||
        result.transport.type !== 'webrtc' ||
        typeof result.transport.sdp !== 'string'
      )
        throw new Error('invalid_live_response');
      providerObservation('completed', { output: result.session });
      usage.sessionId = result.session.id;
      stage = 'sideband';
      const channel = liveSideband
        ? liveSideband(client, result.session.id)
        : new SidebandWS(client, { session_id: result.session.id, graceful_close: true });
      const voice: Voice = {
        access: check,
        warn,
        deadlineTimer,
        warningTimer,
        view: { id: voiceId, phase: 'connecting', seconds: null, usageFinal: false },
        path,
        headers: requestHeaders,
        assistant: current,
        consentTextVersion,
        conversationConsentTextVersion,
        channel,
        usage,
        heartbeat: now(),
        microphoneOn: body.microphoneOn !== false,
        deliveryConnectionId: body.deliveryConnectionId,
        finalized: false,
        timer: setInterval(() => {
          if (now() - voice.heartbeat > 10_000) void close(voice, 'voice_connection_lost');
        }, 1000).unref(),
      };
      activeVoice = voice;
      // Keep the old generation for delayed results after this voice is retired.
      const resetGeneration = observationResetGeneration(sessionId);
      const observeWork = (
        kind: 'voice_event' | 'voice_commentary' | 'backend_request' | 'backend_result',
        data: unknown,
      ) => {
        const identifiers = data as {
          delegationId?: string | null;
          requestId?: string;
          status?: 'completed' | 'failed' | 'canceled' | 'disconnected' | 'incomplete';
          delegation?: { id?: string };
          view?: TextAssistantView;
        };
        const requestId =
          kind !== 'voice_event' && typeof identifiers.requestId === 'string'
            ? identifiers.requestId
            : undefined;
        const backend =
          requestId && resetGeneration !== undefined
            ? backendTaskObservationContext(sessionId, requestId, resetGeneration)
            : undefined;
        const execution =
          requestId && (kind === 'backend_request' || kind === 'backend_result')
            ? voiceDelegationObservationContext(voiceId, requestId)
            : undefined;
        const event = data as {
          event?: { delegation_id?: string | null; delegation?: { id?: string } };
          direction?: string;
        };
        const delegationId =
          kind === 'voice_event'
            ? event.direction === 'outgoing'
              ? event.event?.delegation_id
              : event.event?.delegation?.id
            : identifiers.delegationId;
        observe?.({
          at: now(),
          sessionId,
          consentTextVersion,
          conversationConsentTextVersion,
          context: {
            ...observationContext(voice),
            spanId: randomUUID(),
            parentSpanId: voiceId,
            ...execution,
            ...(delegationId !== undefined ? { delegationId } : {}),
            ...(backend ? { links: [{ traceId: backend.traceId, spanId: backend.spanId }] } : {}),
          },
          ...((kind === 'backend_request' || kind === 'backend_result') && !backend
            ? { evidenceGap: 'unknown_parent' as const }
            : {}),
          kind,
          status:
            kind === 'backend_request'
              ? 'incomplete'
              : (identifiers.status ??
                (identifiers.view?.taskStatus === 'canceled'
                  ? 'canceled'
                  : identifiers.view?.error
                    ? 'failed'
                    : 'completed')),
          data,
        });
      };
      const send = channel.send.bind(channel);
      channel.send = (event) => {
        try {
          send(event);
        } catch (error) {
          observeWork('voice_event', { event, direction: 'outgoing', status: 'failed' });
          throw error;
        }
        observeWork('voice_event', { event, direction: 'outgoing' });
      };
      // Provider creation may resolve despite an abort. Attach only to close
      // that session; no work or provider event may regain its authority.
      if (expired) void close(voice, endReason);
      check();
      const contextRevision = current.contextRevision ?? 0;
      contextUsage?.(context.req.param('sessionId'), contextRevision, voice.view.id);
      channel.on('error', () => {
        void close(voice, 'voice_provider_failed');
      });
      channel.on('close', () => {
        if (!voice.closed) void close(voice, 'voice_connection_lost');
      });
      channel.on('session.usage.updated', (event) => {
        if (voice.finalized) return;
        if (!voice.closed && typeof event.context_window?.usage_ratio === 'number')
          contextUsage?.(
            context.req.param('sessionId'),
            contextRevision,
            voice.view.id,
            event.context_window.usage_ratio,
          );
        if (
          !Number.isFinite(event.usage?.seconds) ||
          event.usage.seconds < 0 ||
          event.usage.seconds > Number.MAX_SAFE_INTEGER
        )
          return;
        voice.view.seconds = Math.max(voice.view.seconds ?? 0, event.usage.seconds);
        voice.usage.seconds = voice.view.seconds;
        record(voice);
      });
      channel.on('session.closed', (event) => {
        if (voice.finalized) return;
        if (event.session?.id !== usage.sessionId) return;
        if (
          Number.isFinite(event.usage?.seconds) &&
          event.usage.seconds <= Number.MAX_SAFE_INTEGER &&
          event.usage.seconds >= (voice.view.seconds ?? 0)
        ) {
          voice.view.seconds = event.usage.seconds;
          voice.view.usageFinal = true;
          voice.usage.seconds = event.usage.seconds;
          voice.usage.final = true;
        }
        void close(voice);
        voice.finish?.();
      });
      voice.work = voiceWork({
        requestNewConversation:
          body.freshConversationControls === true
            ? () => {
                voice.view.newConversationRequested = true;
              }
            : undefined,
        now,
        confirmBrowserInput: body.confirmBrowserInput === true,
        allowed: () => {
          if (voice.closed) return false;
          try {
            check();
            return true;
          } catch {
            return false;
          }
        },
        observe: (kind, data) =>
          observeWork(kind, kind === 'voice_event' ? { event: data, direction: 'incoming' } : data),
        channel,
        initial:
          body.newConversation === true
            ? {
                ...current,
                completedReplies: current.completedReplies?.filter(
                  (reply) =>
                    reply.resetContextRevision === undefined ||
                    reply.resetContextRevision !== current.contextRevision,
                ),
              }
            : current,
        response: (value) => {
          if (value?.id !== voice.view.response?.id)
            voice.playbackPendingSince = value ? now() : undefined;
          voice.view.response = value;
        },
        refusal: (value) => {
          voice.view.refusal = value;
        },
        delivered: (value) => {
          voice.view.replyDelivery ??= [];
          voice.view.replyDelivery.push(value);
        },
        transcript: (role, text, utteranceStart, eventId) => {
          if (role === 'assistant' && voice.playbackPendingSince !== undefined)
            voice.playbackPendingSince = now();
          return transcript?.(sessionId, role, text, utteranceStart, eventId);
        },
        input: (pending, text) => voiceInput?.(context.req.param('sessionId'), pending, text),
        interrupt: (revision) => interrupt(context.req.param('sessionId'), revision),
        request: async (action, body, signal, observation) => {
          // A new send gets a new position in the work queue. Replacement
          // delivery connections apply only to subsequent instructions.
          check();
          const request = new Request(`${config.origin}${path}${action ? `/${action}` : ''}`, {
            method: action && !action.startsWith('messages/') ? 'POST' : 'GET',
            headers: requestHeaders,
            body: action
              ? JSON.stringify(
                  action === 'messages'
                    ? {
                        ...(body as Record<string, unknown>),
                        deliveryConnectionId: voice.deliveryConnectionId,
                      }
                    : body,
                )
              : undefined,
            signal,
          });
          const response = await (observation
            ? withBackendObservationRequest(
                {
                  requestId: observation.requestId,
                  voiceLink: { traceId: voiceId, spanId: voiceId },
                },
                () => dispatch(request),
              )
            : dispatch(request));
          check();
          if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
            const code = body?.error;
            const refusal =
              action === 'messages'
                ? VoiceMessageRefusal.fromResponse(response.status, code)
                : undefined;
            if (refusal) throw refusal;
            throw new Error(typeof code === 'string' ? code : 'voice_request_failed');
          }
          const result = await response.json();
          check();
          return result;
        },
        update: (view, working) => {
          // A spoken task can finish after the current conversation has advanced.
          // Polls read the current conversation independently of this task's view.
          if (!voice.closed)
            voice.view.phase = working
              ? 'working'
              : view.phase === 'recovery'
                ? 'recovery'
                : 'listening';
        },
        failed: () => {
          void close(voice, 'voice_connection_lost');
        },
      });
      voices.set(voice.view.id, voice);
      const aborted = () => {
        void close(voice, 'voice_connection_lost');
      };
      context.req.raw.signal.addEventListener('abort', aborted, { once: true });
      if (context.req.raw.signal.aborted) aborted();
      try {
        if (channel.socket.readyState !== 1)
          await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
              clearTimeout(timeout);
              startup.signal.removeEventListener('abort', aborted);
            };
            const aborted = () => {
              cleanup();
              reject(new Error('live_start_interrupted'));
            };
            const timeout = setTimeout(() => {
              cleanup();
              reject(new Error('live_attach_timeout'));
            }, 10_000);
            channel.socket.on('open', () => {
              cleanup();
              resolve();
            });
            channel.socket.on('error', () => {
              cleanup();
              reject(new Error('live_attach_failed'));
            });
            startup.signal.addEventListener('abort', aborted, { once: true });
            if (startup.signal.aborted) aborted();
          });
        check();
        voice.assistant = await assistant(path, requestHeaders);
        check();
        if (voice.closed) throw new Error('live_start_interrupted');
        voice.view.phase = voice.assistant.phase === 'recovery' ? 'recovery' : 'listening';
        if (body.newConversation === true) {
          // A spoken reset retains its reply after release. Typed/toolbar
          // resets follow the retained capture mode instead.
          const voiced = voice.assistant.resetSource === 'voice' || body.microphoneOn !== false;
          const reply = voice.assistant.reply ?? newConversationMessage(voice.assistant.review);
          voice.assistant = { ...voice.assistant, replyVoiced: voiced };
          const completedReset = voice.assistant.completedReplies?.some(
            (reply) =>
              reply.resetContextRevision !== undefined &&
              reply.resetContextRevision === voice.assistant.contextRevision,
          );
          if (completedReset) voice.work?.answer(voice.assistant, body.microphoneOn !== false);
          else if (voiced)
            channel.send({
              type: 'session.commentary.append',
              delegation_id: null,
              content: reply,
            });
        }
        usage.outcome = 'active';
        record(voice);
        return context.json(
          { voice: voice.view, assistant: voice.assistant, sdp: result.transport.sdp },
          201,
        );
      } catch (error) {
        await close(voice, 'voice_connection_failed');
        throw error;
      } finally {
        context.req.raw.signal.removeEventListener('abort', aborted);
      }
    } catch (error) {
      if (providerObservationStarted && !providerObservationEnded)
        providerObservation(startup.signal.aborted ? 'aborted' : 'failed');
      finishStartupObservation(startup.signal.aborted ? 'canceled' : 'failed');
      usage.outcome = 'failed';
      usage.endedAt = new Date().toISOString();
      report(usage);
      if (error instanceof MapError && error.code === conversationConsentRevoked)
        return context.json({ error: error.code }, 403);
      const code = expired ? endReason : startupErrorCode(error);
      console.error(
        JSON.stringify({
          event: 'voice_start_failed',
          diagnosticId: usage.attemptId,
          stage,
          code,
          providerStatus: error instanceof OpenAI.APIError ? error.status : undefined,
          providerRequestId:
            error instanceof OpenAI.APIError &&
            typeof error.requestID === 'string' &&
            /^[\w-]{1,200}$/.test(error.requestID)
              ? error.requestID
              : undefined,
        }),
      );
      return context.json(
        { error: code, voiceErrorGroup: voiceErrorGroup(code), diagnosticId: usage.attemptId },
        expired ? 401 : 503,
      );
    } finally {
      starting.delete(check);
      context.req.raw.signal.removeEventListener('abort', abortedStartup);
      if (!activeVoice || activeVoice.closed) {
        clearTimeout(deadlineTimer);
        clearTimeout(warningTimer);
      }
      if (usage.outcome === 'starting') {
        finishStartupObservation(startup.signal.aborted ? 'canceled' : 'failed');
        usage.outcome = 'failed';
        usage.endedAt = new Date().toISOString();
        report(usage);
      }
    }
  });
  routes.post(`${base}/:voiceId/:action`, async (context) => {
    const voice = voices.get(context.req.param('voiceId'));
    const path = `/api/households/${encodeURIComponent(context.req.param('id'))}/text-assistant/${encodeURIComponent(context.req.param('sessionId'))}`;
    if (!voice || voice.path !== path)
      return context.json({ error: 'voice_session_expired', voiceErrorGroup: 'interrupted' }, 404);
    if (context.req.header('Origin') !== config.origin)
      return context.json({ error: 'forbidden' }, 403);
    voice.access();
    // Stop must revoke a retained reset dispatch before its status read can
    // wait for that same reset to finish.
    if (context.req.param('action') === 'stop') await close(voice);
    voice.assistant = await assistant(path, headers(context.req.raw.headers));
    voice.access();
    if (context.req.param('action') === 'interrupt') {
      if (voice.closed || !voice.work) return context.json({ error: 'voice_session_expired' }, 409);
      const body = await context.req.json().catch(() => null);
      if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        (body.interruptedThroughMs !== undefined &&
          (!Number.isFinite(body.interruptedThroughMs) || body.interruptedThroughMs < 0))
      )
        return context.json({ error: 'invalid_request' }, 400);
      const canceled = await voice.work.interruptSpeech(body.interruptedThroughMs);
      return context.json({ voice: voice.view, assistant: canceled });
    }
    if (context.req.param('action') === 'poll') {
      const body = await context.req.json().catch(() => null);
      if (
        !Number.isSafeInteger(body?.revision) ||
        body.revision < 0 ||
        !Number.isSafeInteger(body?.draftVersion) ||
        body.draftVersion < 0 ||
        !Number.isSafeInteger(body?.contentVersion) ||
        body.contentVersion < 1 ||
        !validDeliveryConnectionId(body.deliveryConnectionId)
      )
        return context.json({ error: 'invalid_request' }, 400);
      if (
        body.deliveryConnectionId !== undefined &&
        body.deliveryConnectionId !== voice.deliveryConnectionId &&
        voiceDeliveryAvailable(context.req.param('sessionId'), body.deliveryConnectionId)
      ) {
        voice.deliveryConnectionId = body.deliveryConnectionId;
      }
      voice.microphoneOn = body.microphoneOn !== false;
      voice.speakerActive = body.speakerActive === true;
      if (!voice.view.response || body.playedResponseId === voice.view.response.id)
        voice.playbackPendingSince = undefined;
      else if (
        voice.playbackPendingSince !== undefined &&
        (voice.speakerActive || body.microphoneActive === true)
      )
        voice.playbackPendingSince = now();
      voice.work?.rendered(body);
      voice.work?.activity(body.microphoneActive === true && body.microphoneOn === true);
      voice.work?.speaker(body.speakerActive === true);
      // Confirming input can start collection using this poll's media state.
      voice.view.inputVersion = voice.work?.confirmInput(
        body.confirmedInputVersion,
        body.playedResponseId,
      );
      voice.work?.answer(voice.assistant, body.microphoneOn === true);
      voice.quietAt =
        body.microphoneActive !== true && body.speakerActive !== true ? now() : undefined;
      voice.warn();
      voice.view.summaryReady = voice.work?.readyForSummary() ?? true;
      voice.heartbeat = now();
    } else if (context.req.param('action') !== 'stop')
      return context.json({ error: 'not_found' }, 404);
    return context.json({ voice: voice.view, assistant: voice.assistant });
  });
  return {
    routes,
    revalidate: () => {
      // Run after requests that can replace a login or revoke access, including
      // OAuth callbacks and mutations whose response later fails. No dispatch
      // occurs here: the captured guard checks server state synchronously.
      for (const check of [
        ...starting,
        ...[...voices.values()].filter((voice) => !voice.closed).map((voice) => voice.access),
      ]) {
        try {
          check();
        } catch {
          // The guard synchronously retires its voice before throwing.
        }
      }
    },
    hasActiveVoice: (id: string, includeListening = true) =>
      [...voices.values()].some(
        (voice) =>
          voice.assistant.id === id &&
          !voice.closed &&
          ((includeListening && voice.microphoneOn) ||
            voice.speakerActive ||
            (voice.playbackPendingSince !== undefined &&
              now() - voice.playbackPendingSince < unconfirmedPlaybackIdleMs) ||
            !voice.work?.readyForSummary()),
      ),

    retireSessionWork: (sessionId: string, requestId?: string) => {
      for (const voice of voices.values())
        if (voice.assistant.id === sessionId && !voice.closed) voice.work?.retire(requestId);
    },
    summarizeSession: async (sessionId: string, signal: AbortSignal) => {
      const active = [...voices.values()].filter((voice) => voice.assistant.id === sessionId);
      for (const voice of active) {
        // An accepted delegate can race the last browser poll. Finish its
        // checked result before retiring context, rather than canceling it.
        while (!voice.closed && voice.work && !voice.work.readyForSummary()) {
          if (signal.aborted) throw new Error('context_handoff_interrupted');
          voice.heartbeat = now();
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await close(voice);
      }
    },
    // Live has no context-clearing event. Close the old provider session; the
    // browser reconnects with its existing microphone stream and pause state.
    newConversation: (view: TextAssistantView, deferVoiceClose = false) => {
      for (const voice of voices.values()) {
        if (voice.assistant.id !== view.id || voice.closed) continue;
        voice.assistant = view;
        voice.work?.reset(view);
        if (!deferVoiceClose) void close(voice);
      }
    },
    stopSession: (sessionId: string, switched = false) => {
      for (const voice of voices.values())
        if (voice.assistant.id === sessionId)
          void close(voice, switched ? undefined : 'voice_access_lost');
    },
    close: async () => {
      await Promise.all([...voices.values()].map((voice) => close(voice)));
      voices.clear();
    },
  };
}
