import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import OpenAI from 'openai';
import { SidebandWS } from 'openai/resources/live/sideband/ws';
import type { TextAssistantView } from '../shared/text-assistant.js';
import type { VoiceAssistantView } from '../shared/voice-assistant.js';
import { voiceAssistantInstructions } from './assistant-instructions.js';
import type { Config } from './config.js';
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

export function voiceAssistantRoutes({
  config,
  dispatch,
  liveFetch,
  liveSideband,
  liveUsage,
  recordUsage,
  interrupt,
}: {
  config: Config;
  dispatch: LocalDispatch;
  liveFetch?: typeof fetch;
  liveSideband?: LiveSidebandFactory;
  liveUsage?: LiveUsage;
  recordUsage?: LiveUsage;
  interrupt: (sessionId: string, revision: number) => void;
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
    if (!response.ok) throw new MapError('voice_access_lost', response.status as 401 | 403 | 404);
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
    const current = await assistant(path, requestHeaders);
    if (!client) return context.json({ error: 'voice_unavailable' }, 503);
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
    for (const previous of voices.values()) if (previous.path === path) await close(previous);
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
    try {
      const result = await client.live.create(
        {
          session: {
            model: 'gpt-live-1',
            audio: { output: { voice: 'marin' } },
            delegation: { type: 'client' },
            store: false,
            instructions: voiceAssistantInstructions,
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
      channel.on('error', () => {
        void close(voice, 'voice_provider_failed');
      });
      channel.on('close', () => {
        if (!voice.closed) void close(voice, 'voice_connection_lost');
      });
      channel.on('session.usage.updated', (event) => {
        if (voice.finalized) return;
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
        interrupt: (revision) => interrupt(context.req.param('sessionId'), revision),
        request: async (action, body, signal) => {
          const response = await dispatch(
            new Request(`${config.origin}${path}${action ? `/${action}` : ''}`, {
              method: action ? 'POST' : 'GET',
              headers: requestHeaders,
              body: action ? JSON.stringify(body) : undefined,
              signal,
            }),
          );
          if (!response.ok) throw new Error('voice_request_failed');
          return response.json();
        },
        update: (view) => {
          voice.assistant = view;
          if (!voice.closed)
            voice.view.phase =
              view.phase === 'working'
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
    } catch {
      usage.outcome = 'failed';
      usage.endedAt = new Date().toISOString();
      report(usage);
      return context.json({ error: 'voice_connection_failed' }, 503);
    }
  });
  routes.post(`${base}/:voiceId/:action`, async (context) => {
    const voice = voices.get(context.req.param('voiceId'));
    const path = `/api/households/${encodeURIComponent(context.req.param('id'))}/text-assistant/${encodeURIComponent(context.req.param('sessionId'))}`;
    if (!voice || voice.path !== path) return context.json({ error: 'voice_session_expired' }, 404);
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
      voice.heartbeat = Date.now();
    } else return context.json({ error: 'not_found' }, 404);
    return context.json({ voice: voice.view, assistant: voice.assistant });
  });
  return {
    routes,
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
