import { createHash } from 'node:crypto';
import { TraceJsonFailure, traceJson } from './trace-json.js';

/** Reviewed, opt-in, in-memory observations shared by evaluation and live export.
 * This module owns no storage, transport or retries. Production never imports
 * evaluation recorders. Sink failures cannot become application failures.
 *
 * Backend owns task, model and MCP spans exactly once, including delegated
 * work. Voice owns its separate session trace, transcripts, Live events and
 * delegation links. sessionId is the conversation identity, not a trace root.
 * Each task has its own traceId/root spanId; each MCP execution has its own
 * stable spanId/toolExecutionId and an explicit parentSpanId when known.
 * requestId identifies the accepted message; taskId identifies its execution.
 * providerCallId identifies a model attempt, not a response or tool execution.
 * Cross-trace links require explicit identities, never timestamp inference.
 *
 * A start has status incomplete until an observed ending updates that span.
 * Completion of a task says nothing about the conversation or voice lifetime.
 * Missing parentage/endings remain gaps; cancellation, disconnect and failure
 * are separate outcomes. Consumers must not synthesize a successful ending.
 *
 * Permitted content is exact model action arguments, MCP arguments and text
 * results, conversation/transcript text and selected backend result fields.
 * Content can contain household information. Never add provider objects,
 * audio, credentials, headers, environment or unreviewed metadata to it.
 * New event kinds or fields require an explicit projection below. */
export type AssistantObservationContext = {
  owner: 'backend' | 'voice';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  voiceSessionId?: string;
  delegationId?: string | null;
  requestId?: string;
  providerCallId?: string;
  toolExecutionId?: string;
  links?: { traceId: string; spanId: string }[];
};

/** Explicit protocol mapping shared by the backend and its voice caller. The
 * session/reset-generation/request tuple identifies one accepted task. Its SHA-256
 * UUID (version 8) lets a voice link name a backend root before delivery, without
 * creating that span, guessing an observed outcome or keeping a payload store. */
export function backendTaskObservationContext(
  sessionId: string,
  requestId: string,
  resetGeneration: number,
): AssistantObservationContext {
  const bytes = createHash('sha256')
    .update(
      JSON.stringify(['skyttel-backend-task-v2', sessionId, String(resetGeneration), requestId]),
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  const traceId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { owner: 'backend', traceId, spanId: traceId, requestId };
}

export type ObservationStatus = 'incomplete' | 'completed' | 'failed' | 'canceled' | 'disconnected';

export type AssistantObservation = {
  at: number;
  sessionId: string;
  taskId?: string;
  revision?: number;
  consentTextVersion?: number;
  context?: AssistantObservationContext;
  status?: ObservationStatus;
  evidenceGap?: 'unknown_parent' | 'missing_end' | 'excluded_content';
  kind:
    | 'task_started'
    | 'task_completed'
    | 'model_attempt'
    | 'model_action'
    | 'mcp_started'
    | 'mcp_completed'
    | 'mcp_failed'
    | 'voice_started'
    | 'voice_completed'
    | 'voice_event'
    | 'voice_commentary'
    | 'backend_request'
    | 'backend_result';
  data: unknown;
};
export type ObserveAssistant = (event: AssistantObservation) => void;

type ProjectArray = <T>(
  source: readonly unknown[],
  project: (value: unknown) => T | undefined,
) => T[];

function projectionArrays(limit?: number): ProjectArray {
  let remaining = limit;
  return (source, project) => {
    const result = [];
    if (remaining !== undefined) remaining -= 2;
    for (const value of source) {
      const item = project(value);
      if (item === undefined) continue;
      if (remaining !== undefined) {
        const json = traceJson(item, remaining);
        remaining -= Buffer.byteLength(json) + (result.length ? 1 : 0);
        if (remaining < 0) throw new TraceJsonFailure('oversized');
      }
      result.push(item);
    }
    return result;
  };
}

const fields = (value: unknown, names: readonly string[]) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    names
      .filter((name) => {
        const item = source[name];
        return item === null || ['string', 'boolean', 'number'].includes(typeof item);
      })
      .map((name) => [name, source[name]]),
  );
};

/** The voice handoff contains checked reply/receipt identity and presentation.
 * Full map, draft and receipt changes already belong to backend-owned MCP text
 * results, not a duplicate voice-side copy of the backend's whole view. The
 * evaluation consumers use delegationId for correlation and read full domain
 * evidence separately through authenticated application HTTP endpoints. */
function backendResult(value: unknown, project: ProjectArray) {
  const source = value as Record<string, unknown> | undefined;
  const admitted = fields(value, [
    'id',
    'revision',
    'taskId',
    'taskStatus',
    'phase',
    'reply',
    'modelReply',
    'requiredNotice',
    'questionPending',
    'saveBlocked',
    'displayedSelection',
    'canceled',
    'discarded',
  ]);
  for (const name of ['questions', 'newQuestions'])
    if (Array.isArray(source?.[name]) && source[name].every((item) => typeof item === 'string'))
      admitted[name] = source[name];
  if (source?.error) admitted.error = 'backend_failed';
  if (source?.result) {
    admitted.result = fields(source.result, ['kind', 'message']);
    const changes = (source.result as { changes?: unknown }).changes;
    if (Array.isArray(changes))
      (admitted.result as Record<string, unknown>).changes = project(changes, (change) =>
        fields(change, ['subject', 'action']),
      );
  }
  if (source?.receipt)
    admitted.receipt = fields(source.receipt, [
      'contentVersion',
      'operationId',
      'draftVersion',
      'householdId',
      'userId',
      'savedAt',
      'actorName',
    ]);
  for (const name of ['selection', 'displayedItem'])
    if (source?.[name])
      admitted[name] = fields(source[name], [
        'kind',
        'id',
        'objectId',
        'revision',
        'draftVersion',
        'contentVersion',
      ]);
  return admitted;
}

const safeErrors = new Set([
  'tool_failed',
  'tool_canceled',
  'tool_incomplete',
  'task_failed',
  'task_canceled',
  'task_incomplete',
  'voice_failed',
  'voice_disconnected',
]);
function errorFields(value: unknown, names: readonly string[]) {
  const admitted = fields(value, names);
  const error = (value as { error?: unknown })?.error;
  if (error !== undefined)
    admitted.error =
      typeof error === 'string' && safeErrors.has(error) ? error : 'observation_failed';
  return admitted;
}

/** The only content admitted from an MCP envelope is its text result and error
 * flag. Tool arguments already cross the application's tool schema boundary.
 * Neither provider metadata nor additional MCP content types are trace data. */
function data(event: AssistantObservation, project: ProjectArray) {
  switch (event.kind) {
    case 'task_started':
    case 'task_completed':
      return errorFields(event.data, ['source', 'startedAt', 'endedAt']);
    case 'mcp_started':
      return { ...fields(event.data, ['name']), args: (event.data as { args?: unknown })?.args };
    case 'mcp_completed': {
      const admitted = fields(event.data, ['name', 'startedAt']);
      const source = (event.data as { result?: { content?: unknown } })?.result;
      const result = fields(source, ['isError']);
      result.content = Array.isArray(source?.content)
        ? project(source.content, (item) => {
            const value = item as { type?: unknown; text?: unknown } | null;
            return value?.type === 'text' && typeof value.text === 'string'
              ? { type: 'text', text: value.text }
              : undefined;
          })
        : [];
      return { ...admitted, result };
    }
    case 'mcp_failed':
      return errorFields(event.data, ['name', 'startedAt']);
    case 'model_action':
      return fields(event.data, ['name', 'arguments', 'callId']);
    case 'model_attempt':
      return {
        ...fields(event.data, [
          'attemptId',
          'startedAt',
          'endedAt',
          'model',
          'resolvedModel',
          'serviceTier',
          'providerRequestId',
          'responseId',
          'outcome',
          'completeness',
        ]),
        usage: fields((event.data as { usage?: unknown })?.usage, [
          'input',
          'cached',
          'cacheWrite',
          'output',
          'reasoning',
        ]),
      };
    case 'voice_started':
    case 'voice_completed':
      return errorFields(event.data, ['model', 'startedAt', 'endedAt']);
    case 'voice_event': {
      const admitted = fields(event.data, [
        'type',
        'role',
        'event_id',
        'client_event_id',
        'answerId',
        'delta',
        'start_ms',
        'end_ms',
        'offset_ms',
      ]);
      const delegation = fields((event.data as { delegation?: unknown })?.delegation, [
        'id',
        'target',
        'type',
      ]);
      if (Object.keys(delegation).length) admitted.delegation = delegation;
      return admitted;
    }
    case 'voice_commentary':
      return fields(event.data, ['delegationId', 'content', 'revision']);
    case 'backend_request':
      return fields(event.data, ['delegationId', 'requestId', 'text', 'context']);
    case 'backend_result':
      return {
        ...fields(event.data, ['delegationId', 'requestId']),
        view: backendResult((event.data as { view?: unknown })?.view, project),
      };
  }
}

/** Project before calling any consumer and detach all mutable content. Invalid
 * serialization and synchronous/asynchronous consumer errors stop here. The
 * consumer must enqueue synchronously; application work never awaits export. */
export function assistantObservationBoundary(
  sink?: ObserveAssistant,
  delivery?: { maxBytes: number; failed: (category: 'oversized' | 'export') => void },
): ObserveAssistant | undefined {
  if (!sink) return undefined;
  function failed(category: 'oversized' | 'export') {
    try {
      delivery?.failed(category);
    } catch {
      /* Reporting cannot fail application work. */
    }
  }
  return (event) => {
    try {
      const project = projectionArrays(delivery?.maxBytes);
      const context =
        event.context &&
        fields(event.context, [
          'owner',
          'traceId',
          'spanId',
          'parentSpanId',
          'voiceSessionId',
          'delegationId',
          'requestId',
          'providerCallId',
          'toolExecutionId',
        ]);
      if (context && event.context?.links)
        context.links = project(event.context.links, (link) => fields(link, ['traceId', 'spanId']));
      // JSON also rejects cyclic values and BigInt. Do not silently truncate or
      // stringify failed content as if it were the exact observed value.
      const projected = {
        ...fields(event, [
          'at',
          'sessionId',
          'taskId',
          'revision',
          'consentTextVersion',
          'status',
          'evidenceGap',
          'kind',
        ]),
        ...(context ? { context } : {}),
        data: data(event, project),
      };
      const admitted: AssistantObservation = JSON.parse(
        delivery ? traceJson(projected, delivery.maxBytes) : JSON.stringify(projected),
      );
      const result = sink(admitted) as unknown;
      if (result && typeof (result as Promise<void>).catch === 'function')
        void (result as Promise<void>).catch(() => failed('export'));
    } catch (error) {
      failed(error instanceof TraceJsonFailure ? error.category : 'export');
      // The exporter owns its safe delivery-health category. Never log a
      // diagnostic payload or raw exception here or turn it into map failure.
    }
  };
}
