import { Client } from 'langsmith/client';
import type { RunCreate, RunUpdate } from 'langsmith/schemas';
import type { TraceDeliveryError } from '../shared/trace-sending.js';
import { TraceJsonFailure, traceEventByteLimit, traceJson } from './trace-json.js';
import type { ConnectTraceDelivery } from './trace-sending.js';

class DeliveryFailure extends Error {
  constructor(readonly category: TraceDeliveryError) {
    // The pinned SDK treats this prefix as nonretryable. This module owns retries.
    super('AbortError: trace delivery');
  }
}
type Operation =
  | { kind: 'create'; run: RunCreate }
  | { kind: 'update'; id: string; run: RunUpdate };
type Queued = {
  kind: Operation['kind'];
  id: string;
  json: string;
  generation: number;
  bytes: number;
  expiresAt: number;
};

const serializedByteBudget = 16 * 1024 * 1024;
// Conservatively reserve an event each for the projected graph, projection
// JSON, detached graph, mapped envelope, active parsed run, SDK prepared run,
// SDK JSON and UTF-8 body. Native fetch can copy the BufferSource body after
// SDK serialization returns (replacing that phase's temporary JSON string).
// Aliases are charged too. Admission JSON becomes the
// queued immutable string; its construction uses only remaining queue bytes.
// This is encoded-size accounting, not a claim about V8 heap allocation.
const queuedByteBudget = serializedByteBudget - 8 * traceEventByteLimit;

export interface LangSmithDeliveryOptions {
  endpoint: string;
  project: string;
  apiKey: string;
  workspaceId?: string;
  now?: () => number;
  fetch?: typeof fetch;
}

/** Inspected published langsmith@0.11.1, imported from its tracing-client
 * export. Direct create/update never use its batch queue or failed-trace dump.
 * The SDK forces four caller retries: DeliveryFailure's nonretryable prefix
 * disables them so this module owns retries. Only JSON snapshots reach its
 * serializer, avoiding fallback substitution and payload-bearing warnings.
 * Explicit defaults prevent ambient masking, sampling and runtime metadata.
 *
 * This does not wrap OpenAI (installed 7.43.0) or change ModelClient's custom
 * long-running fetch/caller signal. Export cancellation belongs only here.
 * Direct ingestion derives trace_id and dotted_order from id/parent_run_id.
 * Omit both derived fields: supplying trace_id alone is rejected even on
 * updates. No parent-order cache is needed: docs.langchain.com/langsmith/trace-with-api.
 * Reinspect matching published source and wire tests before upgrading. */
export function langSmithDelivery(options: LangSmithDeliveryOptions): ConnectTraceDelivery {
  return (sending) => {
    // The pinned SDK applies the same quote handling to the supplied values.
    // Validate that final interpretation too: nested quotes must not become
    // an empty key inside its constructor and select CLI profile authentication.
    const unquote = (value: string) =>
      value
        .trim()
        .replace(/^"(.*)"$/, '$1')
        .replace(/^'(.*)'$/, '$1');
    const apiKey = unquote(options.apiKey);
    const endpoint = unquote(options.endpoint);
    if (!unquote(apiKey).trim() || !unquote(endpoint).trim() || !options.project.trim())
      throw new Error('invalid_trace_configuration');
    const destination = new URL(endpoint);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname);
    if (
      destination.origin !== endpoint ||
      (destination.protocol !== 'https:' && !(destination.protocol === 'http:' && loopback))
    )
      throw new Error('invalid_trace_configuration');
    // The pinned SDK warns about ambient agent addressing before honoring the
    // explicit project. Those warnings can contain the raw environment value.
    if (process.env.LANGSMITH_AGENT_ID || process.env.LANGSMITH_AGENT_ENVIRONMENT)
      throw new Error('unsupported_trace_environment');
    let running = false;
    let shuttingDown = false;
    let generation = 0;
    let retainedBytes = 0;
    const pending: Queued[] = [];
    let active:
      | {
          generation: number;
          controller: AbortController;
          discarded: boolean;
          timedOut: boolean;
          bytes: number;
          expiresAt: number;
        }
      | undefined;
    let draining: Promise<void> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const clock = options.now ?? (() => performance.now());
    function time() {
      try {
        const value = clock();
        if (!Number.isFinite(value)) throw new Error('invalid_trace_clock');
        return value;
      } catch {
        throw new DeliveryFailure('export');
      }
    }
    function discard(category: TraceDeliveryError | null) {
      generation++;
      clearTimeout(expiryTimer);
      let count = pending.length;
      retainedBytes -= pending.reduce((sum, entry) => sum + entry.bytes, 0);
      pending.length = 0;
      if (active && !active.discarded) {
        active.discarded = true;
        count++;
        active.controller.abort();
      }
      sending.dropped(category, count);
    }
    function pruneExpired() {
      const at = time();
      let count = 0;
      for (let index = pending.length - 1; index >= 0; index--) {
        const entry = pending[index];
        if (entry.expiresAt > at) continue;
        retainedBytes -= entry.bytes;
        pending.splice(index, 1);
        count++;
      }
      if (active && !active.discarded && active.expiresAt <= at) {
        active.discarded = true;
        active.controller.abort();
        count++;
      }
      if (count) sending.dropped('expired', count);
    }
    function scheduleExpiry() {
      clearTimeout(expiryTimer);
      try {
        let next = active && !active.discarded ? active.expiresAt : Infinity;
        for (const entry of pending) next = Math.min(next, entry.expiresAt);
        if (next === Infinity) return;
        expiryTimer = setTimeout(
          () => {
            try {
              pruneExpired();
              scheduleExpiry();
            } catch {
              discard('export');
            }
          },
          Math.max(1, next - time()),
        ).unref();
      } catch {
        discard('export');
      }
    }
    const client = new Client({
      apiUrl: endpoint,
      apiKey,
      workspaceId: options.workspaceId ?? '',
      autoBatchTracing: false,
      hideInputs: false,
      hideOutputs: false,
      hideMetadata: false,
      omitTracedRuntimeInfo: true,
      tracingSamplingRate: 1,
      tracingMode: 'langsmith',
      debug: false,
      headers: {},
      disablePromptCache: true,
      timeout_ms: 5000,
      callerOptions: { maxConcurrency: 1, maxRetries: 0 },
      fetchImplementation: async (input, init) => {
        try {
          const current = active;
          if (!running || !current || current.generation !== generation)
            throw new DeliveryFailure('export');
          if (time() >= current.expiresAt) throw new DeliveryFailure('expired');
          if (!(init?.body instanceof Uint8Array) || init.body.byteLength !== current.bytes)
            throw new DeliveryFailure('export');
          if (init.body.byteLength > traceEventByteLimit) throw new DeliveryFailure('oversized');
          const signal = AbortSignal.any([
            current.controller.signal,
            ...(init?.signal ? [init.signal] : []),
          ]);
          const response = await (options.fetch ?? fetch)(input, {
            ...init,
            signal,
            redirect: 'error',
          });
          const successful = response.ok;
          const status = response.status;
          // LangSmith uses 429 for several rate/usage limits. Suspend
          // conservatively; this does not establish a monthly-quota cause.
          const suspension =
            status === 401 || status === 403 ? 'credentials' : status === 429 ? 'quota' : undefined;
          if (suspension) {
            // Known status is authoritative. Cleanup cannot replace it with a
            // transient error or delay durable suspension behind a response body.
            try {
              void response.body?.cancel().catch(() => {});
            } catch {}
            throw new DeliveryFailure(suspension);
          }
          let abort!: () => void;
          const aborted = new Promise<never>((_resolve, reject) => {
            abort = () => reject(new DeliveryFailure(current.timedOut ? 'timeout' : 'network'));
            signal.addEventListener('abort', abort, { once: true });
            if (signal.aborted) abort();
          });
          try {
            await Promise.race([response.body?.cancel(), aborted]);
          } finally {
            signal.removeEventListener('abort', abort);
          }
          if (!successful) throw new DeliveryFailure('network');
          return new Response(null, { status: 204 });
        } catch (error) {
          throw error instanceof DeliveryFailure
            ? error
            : new DeliveryFailure(
                active?.timedOut || init?.signal?.aborted ? 'timeout' : 'network',
              );
        }
      },
    });
    async function drain() {
      while (running && pending.length) {
        pruneExpired();
        const entry = pending.shift();
        if (!entry) return;
        const current = {
          generation: entry.generation,
          controller: new AbortController(),
          discarded: false,
          timedOut: false,
          bytes: entry.bytes,
          expiresAt: entry.expiresAt,
        };
        active = current;
        scheduleExpiry();
        try {
          for (let attempt = 0; attempt <= 2; attempt++) {
            if (!running || entry.generation !== generation || current.discarded) break;
            const remaining = entry.expiresAt - time();
            if (remaining <= 0) {
              sending.dropped('expired');
              break;
            }
            current.controller = new AbortController();
            current.timedOut = false;
            const timer = setTimeout(
              () => {
                current.timedOut = true;
                current.controller.abort();
              },
              Math.min(5000, remaining),
            ).unref();
            try {
              if (!running || entry.generation !== generation) break;
              if (entry.kind === 'create') {
                const { session_name, ...run } = JSON.parse(entry.json) as RunCreate;
                await client.createRun({ ...run, project_name: session_name });
              } else await client.updateRun(entry.id, JSON.parse(entry.json) as RunUpdate);
              if (entry.generation === generation && !current.discarded) {
                if (time() >= entry.expiresAt) sending.dropped('expired');
                else sending.delivered();
              }
              break;
            } catch (error) {
              if (entry.generation !== generation || current.discarded) break;
              const category = error instanceof DeliveryFailure ? error.category : 'export';
              if (category === 'expired' || time() >= entry.expiresAt) {
                sending.dropped('expired');
                break;
              }
              if (
                error instanceof DeliveryFailure &&
                (error.category === 'credentials' || error.category === 'quota')
              ) {
                try {
                  sending.suspend(error.category);
                } catch {
                  // Suspension fences delivery even if its durable write fails.
                }
                break;
              }
              const final = attempt === 2 || !['network', 'timeout'].includes(category);
              sending.dropped(category, final ? 1 : 0);
              if (final) break;
            } finally {
              clearTimeout(timer);
            }
          }
        } finally {
          retainedBytes -= entry.bytes;
          active = undefined;
          scheduleExpiry();
        }
      }
    }
    function pump() {
      if (draining || !running || !pending.length) return;
      draining = drain()
        .catch(() => discard('export'))
        .finally(() => {
          draining = undefined;
          pump();
        });
    }
    return {
      start() {
        running = true;
        pump();
      },
      stop() {
        running = false;
        discard(null);
      },
      async shutdown() {
        shuttingDown = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            (async () => {
              while (draining) await draining;
            })(),
            new Promise<void>((resolve) => {
              timer = setTimeout(resolve, 2000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
          this.stop();
        }
      },
      observe(event) {
        const context = event.context;
        if (!running || !context || (context.owner === 'backend' && !event.taskId)) return;
        const data = event.data as Record<string, unknown>;
        let creating: boolean;
        let name: string;
        let type: string;
        let content: Record<string, unknown>;
        let instantaneous = false;
        switch (event.kind) {
          case 'task_started':
          case 'task_completed':
            creating = event.kind === 'task_started';
            name = 'Skyttel backend task';
            type = 'chain';
            content = data;
            break;
          case 'mcp_started':
          case 'mcp_completed':
          case 'mcp_failed':
            creating = event.kind === 'mcp_started';
            name = String(data.name);
            type = 'tool';
            content = (creating ? data.args : (data.result ?? data)) as Record<string, unknown>;
            break;
          case 'model_attempt':
            creating = data.outcome === 'started';
            name = 'Skyttel model attempt';
            type = 'llm';
            content = ((creating ? data.input : data.output) as Record<string, unknown>) ?? data;
            break;
          case 'voice_started':
          case 'voice_completed':
            creating = event.kind === 'voice_started';
            name = 'Skyttel voice session';
            type = 'chain';
            content = (creating ? data.input : data) as Record<string, unknown>;
            break;
          case 'voice_attempt':
            creating = data.outcome === 'started';
            name = 'Skyttel Live creation';
            type = 'llm';
            content = ((creating ? data.input : data.output) as Record<string, unknown>) ?? data;
            break;
          case 'voice_event':
          case 'voice_commentary':
            creating = true;
            instantaneous = true;
            name = event.kind === 'voice_event' ? String(data.type) : 'Skyttel voice commentary';
            type = 'chain';
            content = data;
            break;
          case 'backend_request':
          case 'backend_result':
            creating = event.kind === 'backend_request' || !context.requestId;
            instantaneous = !context.requestId;
            name = 'Skyttel voice delegation';
            type = 'chain';
            content = data;
            break;
          default:
            // Complete actions belong to model-attempt output. Voice traces are
            // separate; never replace a model response with one action here.
            return;
        }
        if (shuttingDown) {
          sending.dropped(null);
          return;
        }
        pruneExpired();
        if (pending.length + (active ? 1 : 0) >= 1000 || retainedBytes >= queuedByteBudget) {
          sending.dropped('capacity');
          return;
        }
        const status = event.status ?? 'incomplete';
        const metadata = {
          owner: context.owner,
          conversation_id: event.sessionId,
          consent_text_version: event.consentTextVersion,
          request_id: context.requestId,
          task_id: event.taskId,
          provider_call_id: context.providerCallId,
          tool_execution_id: context.toolExecutionId,
          voice_session_id: context.voiceSessionId,
          delegation_id: context.delegationId,
          links: context.links,
          ...(event.kind === 'model_attempt'
            ? {
                model: data.model,
                resolved_model: data.resolvedModel,
                outcome: data.outcome,
                completeness: data.completeness,
                usage: data.usage,
                provider_request_id: data.providerRequestId,
                response_id: data.responseId,
              }
            : {}),
          status,
          evidence_gap: event.evidenceGap,
        };
        const common = {
          parent_run_id: context.parentSpanId,
          extra: { metadata },
        };
        const operation: Operation = creating
          ? {
              kind: 'create',
              run: {
                ...common,
                id: context.spanId,
                name,
                run_type: type,
                session_name: options.project,
                start_time: event.at,
                ...(instantaneous ? { end_time: event.at } : {}),
                ...(instantaneous && status !== 'completed' ? { error: `observed_${status}` } : {}),
                inputs: content,
              },
            }
          : {
              kind: 'update',
              id: context.spanId,
              run: {
                ...common,
                end_time: event.at,
                outputs: content,
                ...(status !== 'completed' ? { error: `observed_${status}` } : {}),
              },
            };
        try {
          const at = time();
          const age = Math.max(0, (options.now ?? Date.now)() - event.at);
          const expiresAt = at + 60000 - age;
          if (!Number.isFinite(expiresAt)) throw new DeliveryFailure('export');
          if (expiresAt <= at) {
            sending.dropped('expired');
            return;
          }
          const available = queuedByteBudget - retainedBytes;
          const json = traceJson(operation.run, Math.min(traceEventByteLimit, available));
          const bytes = Buffer.byteLength(json);
          pending.push({
            kind: operation.kind,
            id: context.spanId,
            json,
            generation,
            bytes,
            expiresAt,
          });
          retainedBytes += bytes;
        } catch (error) {
          sending.dropped(
            error instanceof TraceJsonFailure
              ? error.category === 'oversized' &&
                queuedByteBudget - retainedBytes < traceEventByteLimit
                ? 'capacity'
                : error.category
              : 'export',
          );
          return;
        }
        pump();
        scheduleExpiry();
      },
    };
  };
}
