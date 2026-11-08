import type { AssistantObservation } from '../../src/server/assistant-observation.js';
import type { Attempt } from './types.js';

/** Full payloads go to the private stream; in-memory MCP diagnostics need
 * only identity and timing. Other events retain their semantic evidence. */
export function retainedObservation(
  event: AssistantObservation,
  record?: (event: AssistantObservation) => void,
): AssistantObservation {
  record?.(event);
  if (record && ['mcp_started', 'mcp_completed', 'mcp_failed'].includes(event.kind)) {
    const data = event.data as { name: string; startedAt?: number };
    return { ...event, data: { name: data.name, startedAt: data.startedAt } };
  }
  return structuredClone(event);
}

export function modelActions(events: AssistantObservation[]) {
  return events
    .filter((event) => event.kind === 'model_action')
    .map((event) => {
      const data = event.data as { name: string; arguments: string; callId: string };
      return {
        name: data.name,
        completion: (JSON.parse(data.arguments) as { completion?: string }).completion,
        callId: data.callId,
      };
    });
}

/** Status reads emit MCP diagnostics too; only task MCP calls represent
 * conversation activity that should extend voice quiet observation. */
export function lastVoiceActivityAt(events: AssistantObservation[], fallback: number) {
  return (
    events.findLast(
      (event) =>
        !['mcp_started', 'mcp_completed', 'mcp_failed'].includes(event.kind) ||
        Boolean(event.taskId),
    )?.at ?? fallback
  );
}

export function concludeAttempt(result: Attempt, elapsedMs: number | null) {
  result.outcome =
    result.fixed.length || result.content?.some((item) => item.outcome === 'fail')
      ? 'fail'
      : elapsedMs === null || result.content?.some((item) => item.outcome === 'inconclusive')
        ? 'inconclusive'
        : 'pass';
  result.elapsedMs = result.outcome === 'pass' ? elapsedMs : null;
}

export function failAttempt(
  result: Attempt,
  error: unknown,
  observedEndMs: number,
  stop: { stopped: boolean; reason: string | null; attempted: boolean },
) {
  result.outcome = stop.stopped ? (stop.attempted ? 'aborted' : 'not_run') : 'error';
  result.reason = stop.stopped
    ? (stop.reason ?? 'evaluation_stopped')
    : error instanceof Error
      ? error.message
      : 'evaluation_step_failed';
  result.observedEndMs = result.outcome === 'not_run' ? undefined : observedEndMs;
  if (stop.stopped) {
    result.fixed = [];
    result.content = undefined;
    result.elapsedMs = null;
  }
}

/** Metadata only for shareable diagnostics. Raw words and payloads remain in
 * the private chain. Arrival order cannot invent missing provider identities. */
export function observationDiagnostics(events: AssistantObservation[], origin: number) {
  const requests = events
    .filter((event) => event.kind === 'backend_request')
    .map((event) => {
      const data = event.data as { delegationId: string; requestId: string };
      return {
        atMs: event.at - origin,
        delegationId: data.delegationId,
        requestId: data.requestId,
      };
    });
  const links = requests.map((request) => ({
    delegationId: request.delegationId,
    requestId: request.requestId,
    requestAtMs: request.atMs,
    modelActionIds: events
      .filter((event) => event.taskId === request.requestId && event.kind === 'model_action')
      .map((event) => (event.data as { callId: string }).callId),
    backendResults: events.filter(
      (event) =>
        event.kind === 'backend_result' &&
        (event.data as { delegationId?: string }).delegationId === request.delegationId,
    ).length,
  }));
  const missing = links.flatMap((link) =>
    link.backendResults === 1
      ? []
      : [
          {
            delegationId: link.delegationId,
            reason: link.backendResults
              ? 'Ambiguous backend result identity.'
              : 'Backend result not observed.',
          },
        ],
  );
  const mcp = events
    .filter((event) => event.kind === 'mcp_completed')
    .map((event) => {
      const data = event.data as { name: string; startedAt: number };
      return {
        name: data.name,
        taskId: event.taskId,
        startedMs: data.startedAt - origin,
        elapsedMs: event.at - data.startedAt,
      };
    });
  const outputs = events.filter(
    (event) =>
      event.kind === 'voice_event' && (event.data as { role?: string }).role === 'assistant',
  );
  // Status-only recovery can resolve an earlier unknown result. Preserve its
  // history, but join usage once to the latest classification of each call.
  // Missing provider identities cannot justify merging unrelated observations.
  const workHistory = new Map<string | AssistantObservation, AssistantObservation[]>();
  for (const event of events.filter((event) => event.kind === 'work_result')) {
    const { providerCallId } = event.data as { providerCallId?: string };
    const key = providerCallId || event;
    const history = workHistory.get(key) ?? [];
    history.push(event);
    workHistory.set(key, history);
  }
  const workResults = [...workHistory.values()].map((history) => {
    const event = history[history.length - 1];
    const data = event.data as {
      providerCallId?: string;
      executionMode: string;
      disposition: string;
      reason?: string;
    };
    const attempt = events.findLast(
      (candidate) =>
        candidate.kind === 'model_attempt' &&
        Boolean(data.providerCallId) &&
        (candidate.data as { attemptId?: string }).attemptId === data.providerCallId &&
        (candidate.data as { endedAt?: unknown }).endedAt != null,
    )?.data as
      | {
          usage?: unknown;
          outcome?: string;
          responseId?: string;
          providerRequestId?: string;
        }
      | undefined;
    return {
      atMs: event.at - origin,
      taskId: event.taskId,
      ...data,
      classificationHistory: history.map((observation) => {
        const { disposition, reason } = observation.data as {
          disposition: string;
          reason?: string;
        };
        return { atMs: observation.at - origin, disposition, ...(reason ? { reason } : {}) };
      }),
      usage: attempt?.usage ?? null,
      outcome: attempt?.outcome ?? null,
      responseId: attempt?.responseId ?? null,
      providerRequestId: attempt?.providerRequestId ?? null,
    };
  });
  return {
    workResults,
    eventCounts: Object.fromEntries(
      [...new Set(events.map((event) => event.kind))].map((kind) => [
        kind,
        events.filter((event) => event.kind === kind).length,
      ]),
    ),
    links,
    missing,
    firstBackendRequestMs: requests[0]?.atMs ?? null,
    firstBackendResultMs: events.find((event) => event.kind === 'backend_result')?.at
      ? (events.find((event) => event.kind === 'backend_result')?.at ?? origin) - origin
      : null,
    firstOutputMs: outputs[0]?.at ? outputs[0].at - origin : null,
    lastOutputMs: outputs.at(-1)?.at ? (outputs.at(-1)?.at ?? origin) - origin : null,
    mcp,
    limitation:
      'Offsets and arrival times are observations, not proof of acoustic audibility or of no later output.',
  };
}
