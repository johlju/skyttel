import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import OpenAI from 'openai';
import type { InitialItem } from 'openai/resources/live/live';
import { SidebandWS } from 'openai/resources/live/sideband/ws';
import { conversationConsentRevoked } from '../shared/conversation-consent.js';
import type { TextAssistantView } from '../shared/text-assistant.js';
import type { VoiceAssistantView } from '../shared/voice-assistant.js';
import { voiceErrorGroup } from '../shared/voice-error.js';
import { voiceAssistantInstructions } from './assistant-instructions.js';
import type { Config } from './config.js';
import { voiceConversationModel } from './conversation-capacity.js';
import type {
  LiveSideband,
  LiveSidebandFactory,
  LiveUsage,
  LiveUsageAttempt,
} from './live-provider.js';
import { MapError } from './map.js';
import type { LocalDispatch } from './text-assistant-mcp.js';
import { voiceWork } from './voice-work.js';

type Voice = {
  view: VoiceAssistantView;
  usage: LiveUsageAttempt;
  path: string;
  headers: Headers;
  assistant: TextAssistantView;
  channel: LiveSideband;
  heartbeat: number;
  finalized: boolean;
  timer: NodeJS.Timeout;
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

export function voiceAssistantRoutes({
  config,
  dispatch,
  liveFetch,
  liveSideband,
  liveUsage,
  recordUsage,
  interrupt,
  conversation,
  transcript,
  contextUsage,
  prepareVoiceContext,
}: {
  config: Config;
  dispatch: LocalDispatch;
  liveFetch?: typeof fetch;
  liveSideband?: LiveSidebandFactory;
  liveUsage?: LiveUsage;
  recordUsage?: LiveUsage;
  interrupt: (sessionId: string, revision?: number) => void;
  conversation?: (
    sessionId: string,
  ) => { role: 'user' | 'assistant'; text: string; partial?: boolean }[];
  transcript?: (sessionId: string, role: 'user' | 'assistant', text: string) => void;
  contextUsage?: (
    sessionId: string,
    contextRevision: number,
    source: string,
    ratio?: unknown,
  ) => void;
  prepareVoiceContext?: (sessionId: string) => Promise<TextAssistantView | undefined>;
}) {
  const routes = new Hono();
  const voices = new Map<string, Voice>();
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
  function close(voice: Voice, error?: string) {
    if (voice.closed) return voice.closed;
    const canceling = voice.work?.stop();
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
    if (typeof body?.sdp !== 'string' || !body.sdp || body.sdp.length > 12000)
      return context.json({ error: 'invalid_request' }, 400);
    if (
      current.phase === 'working' ||
      body.revision !== current.revision ||
      body.draftVersion !== current.review.version ||
      body.contentVersion !== current.review.contentVersion
    )
      return context.json({ error: 'assistant_draft_changed' }, 409);
    current = (await prepareVoiceContext?.(context.req.param('sessionId'))) ?? current;
    current = await assistant(path, requestHeaders);
    if (current.contextSummaryState === 'failed')
      return context.json({ error: 'assistant_context_summary_failed' }, 409);
    if (current.contextSummaryState === 'summarizing')
      return context.json({ error: 'assistant_busy' }, 409);
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
    const retained = conversation?.(context.req.param('sessionId'));
    if (retained) {
      history = retained.length
        ? retained.map(({ role, text, partial }) =>
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
    }
    const usage: LiveUsageAttempt = {
      attemptId: randomUUID(),
      sessionId: null,
      model: 'gpt-live-1',
      startedAt: new Date().toISOString(),
      endedAt: null,
      seconds: null,
      final: false,
      outcome: 'starting',
    };
    // Required ledger start must commit before any billable provider request.
    recordUsage?.({ ...usage });
    try {
      liveUsage?.({ ...usage });
    } catch {
      console.error(JSON.stringify({ event: 'live_usage_unavailable' }));
    }
    let stage = 'create';
    try {
      const result = await client.live.create(
        {
          session: {
            model: voiceConversationModel.model,
            audio: { output: { voice: 'marin' } },
            delegation: { type: 'client' },
            store: false,
            instructions: voiceAssistantInstructions,
            // Historical rows only seed the provider. They never become voiceWork's
            // pending user fragments, which alone can authorize a fresh save.
            ...(history ? { input: history } : {}),
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
          },
          transport: { type: 'webrtc', sdp: body.sdp },
        },
        { signal: context.req.raw.signal },
      );
      if (
        !/^[\w-]{1,200}$/.test(result.session.id) ||
        result.transport.type !== 'webrtc' ||
        typeof result.transport.sdp !== 'string'
      )
        throw new Error('invalid_live_response');
      usage.sessionId = result.session.id;
      stage = 'sideband';
      const channel = liveSideband
        ? liveSideband(client, result.session.id)
        : new SidebandWS(client, { session_id: result.session.id, graceful_close: true });
      const voice: Voice = {
        view: { id: randomUUID(), phase: 'connecting', seconds: null, usageFinal: false },
        path,
        headers: requestHeaders,
        assistant: current,
        channel,
        usage,
        heartbeat: Date.now(),
        finalized: false,
        timer: setInterval(() => {
          if (Date.now() - voice.heartbeat > 10_000) void close(voice, 'voice_connection_lost');
        }, 1000).unref(),
      };
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
        channel,
        initial: current,
        response: (value) => {
          voice.view.response = value;
        },
        delivered: (value) => {
          voice.view.replyDelivery ??= [];
          voice.view.replyDelivery.push(value);
        },
        transcript: (role, text) => transcript?.(context.req.param('sessionId'), role, text),
        interrupt: (revision) => interrupt(context.req.param('sessionId'), revision),
        request: async (action, body, signal) => {
          const response = await dispatch(
            new Request(`${config.origin}${path}${action ? `/${action}` : ''}`, {
              method: action && !action.startsWith('messages/') ? 'POST' : 'GET',
              headers: requestHeaders,
              body: action ? JSON.stringify(body) : undefined,
              signal,
            }),
          );
          if (!response.ok) throw new Error('voice_request_failed');
          return response.json();
        },
        update: (view, working) => {
          voice.assistant = view;
          // The voice works only with a task that was said. A written message
          // is the conversation's work.
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
            const timeout = setTimeout(() => reject(new Error('live_attach_timeout')), 10_000);
            channel.socket.on('open', () => {
              clearTimeout(timeout);
              resolve();
            });
            channel.socket.on('error', () => {
              clearTimeout(timeout);
              reject(new Error('live_attach_failed'));
            });
          });
        voice.assistant = await assistant(path, requestHeaders);
        if (voice.closed) throw new Error('live_start_interrupted');
        voice.view.phase = voice.assistant.phase === 'recovery' ? 'recovery' : 'listening';
        if (body.newConversation === true && voice.assistant.reply) {
          // A spoken reset retains its reply after release. Typed/toolbar
          // resets follow the retained capture mode instead.
          const voiced = voice.assistant.resetSource === 'voice' || body.microphoneOn !== false;
          const reply = voice.assistant.reply;
          voice.assistant = { ...voice.assistant, replyVoiced: voiced };
          if (voiced)
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
      usage.outcome = 'failed';
      usage.endedAt = new Date().toISOString();
      report(usage);
      if (error instanceof MapError && error.code === conversationConsentRevoked)
        return context.json({ error: error.code }, 403);
      const code = startupErrorCode(error);
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
        503,
      );
    }
  });
  routes.post(`${base}/:voiceId/:action`, async (context) => {
    const voice = voices.get(context.req.param('voiceId'));
    const path = `/api/households/${encodeURIComponent(context.req.param('id'))}/text-assistant/${encodeURIComponent(context.req.param('sessionId'))}`;
    if (!voice || voice.path !== path)
      return context.json({ error: 'voice_session_expired', voiceErrorGroup: 'interrupted' }, 404);
    if (context.req.header('Origin') !== config.origin)
      return context.json({ error: 'forbidden' }, 403);
    voice.assistant = await assistant(path, headers(context.req.raw.headers));
    if (context.req.param('action') === 'stop') await close(voice);
    else if (context.req.param('action') === 'poll') {
      const body = await context.req.json().catch(() => null);
      if (
        !Number.isSafeInteger(body?.revision) ||
        body.revision < 0 ||
        !Number.isSafeInteger(body?.draftVersion) ||
        body.draftVersion < 0 ||
        !Number.isSafeInteger(body?.contentVersion) ||
        body.contentVersion < 1
      )
        return context.json({ error: 'invalid_request' }, 400);
      voice.work?.rendered(body);
      voice.work?.answer(voice.assistant, body.microphoneOn === true);
      voice.view.summaryReady = voice.work?.readyForSummary() ?? true;
      voice.heartbeat = Date.now();
    } else return context.json({ error: 'not_found' }, 404);
    return context.json({ voice: voice.view, assistant: voice.assistant });
  });
  return {
    routes,
    summarizeSession: async (sessionId: string, signal: AbortSignal) => {
      const active = [...voices.values()].filter((voice) => voice.assistant.id === sessionId);
      for (const voice of active) {
        // An accepted delegate can race the last browser poll. Finish its
        // checked result before retiring context, rather than canceling it.
        const deadline = Date.now() + 120_000;
        while (!voice.closed && voice.work && !voice.work.readyForSummary()) {
          if (signal.aborted || Date.now() > deadline)
            throw new Error('context_handoff_interrupted');
          voice.heartbeat = Date.now();
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
        if (deferVoiceClose) voice.work?.stop();
        else void close(voice);
      }
    },
    stopSession: (sessionId: string) => {
      for (const voice of voices.values())
        if (voice.assistant.id === sessionId) void close(voice, 'voice_access_lost');
    },
    close: async () => {
      await Promise.all([...voices.values()].map((voice) => close(voice)));
      voices.clear();
    },
  };
}
