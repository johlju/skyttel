import type { AssistantObservation } from '../../src/server/assistant-observation.js';
import type { ProviderCall } from './provider.js';

const mcpObservationScope = {
  scope: 'observed_task_spans',
  limitation:
    'Counts and durations cover observed MCP spans with a task identity, not total application calls. Admission, dequeue, polling and other unbound calls are outside this measurement. Complete describes observed span pairs, not total application coverage.',
} as const;

export type ModelMetrics = {
  count: number | null;
  elapsedMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  providerCachedTokens: number | null;
  providerCacheWriteTokens: number | null;
  contextBytes: number | null;
  costUsd: number | null;
};
export type EvaluationMetrics = {
  model: Record<ProviderCall['kind'], ModelMetrics>;
  mcp: typeof mcpObservationScope & {
    count: number | null;
    elapsedMs: number | null;
    complete: boolean;
  };
  readCache: { hits: null; limitation: string };
};
const numeric = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
function sum(values: (number | null)[]): number | null {
  return values.every((value) => value !== null)
    ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
    : null;
}

/** Only admitted usage fields become shareable measurements. An absent
 * field stays unknown, including a missing cached-token or cost value. */
export function modelMetrics(calls?: ProviderCall[]): ModelMetrics {
  const values = calls?.map((call) => {
    const usage = call.response?.usage as
      | {
          input_tokens?: number;
          output_tokens?: number;
          input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
          output_tokens_details?: { reasoning_tokens?: number };
        }
      | undefined;
    return {
      count: 1,
      elapsedMs: call.endedAt === undefined ? null : numeric(call.endedAt - call.startedAt),
      inputTokens: numeric(usage?.input_tokens),
      outputTokens: numeric(usage?.output_tokens),
      reasoningTokens: numeric(usage?.output_tokens_details?.reasoning_tokens),
      providerCachedTokens: numeric(usage?.input_tokens_details?.cached_tokens),
      providerCacheWriteTokens: numeric(usage?.input_tokens_details?.cache_write_tokens),
      contextBytes: numeric(call.contextBytes),
      costUsd: numeric(call.costUsd),
    } satisfies ModelMetrics;
  });
  const fields: (keyof ModelMetrics)[] = [
    'count',
    'elapsedMs',
    'inputTokens',
    'outputTokens',
    'reasoningTokens',
    'providerCachedTokens',
    'providerCacheWriteTokens',
    'contextBytes',
    'costUsd',
  ];
  return Object.fromEntries(
    fields.map((field) => [field, values ? sum(values.map((value) => value[field])) : null]),
  ) as ModelMetrics;
}

export function evaluationMetrics(
  calls: ProviderCall[] | undefined,
  events: AssistantObservation[],
): EvaluationMetrics {
  const mcp = events.filter(
    (event) =>
      Boolean(event.taskId) && ['mcp_started', 'mcp_completed', 'mcp_failed'].includes(event.kind),
  );
  const spans = new Map<string, AssistantObservation[]>();
  let unidentified = false;
  for (const event of mcp) {
    const id = event.context?.toolExecutionId ?? event.context?.spanId;
    if (!id) {
      unidentified = true;
      continue;
    }
    spans.set(id, [...(spans.get(id) ?? []), event]);
  }
  const durations = [...spans.values()].map((span) => {
    const starts = span.filter((event) => event.kind === 'mcp_started');
    const ends = span.filter((event) => event.kind !== 'mcp_started');
    return starts.length === 1 && ends.length === 1 ? numeric(ends[0].at - starts[0].at) : null;
  });
  const observed = events.some((event) => event.kind === 'task_started');
  return {
    model: {
      backend: modelMetrics(calls?.filter((call) => call.kind === 'backend')),
      summary: modelMetrics(calls?.filter((call) => call.kind === 'summary')),
      judge: modelMetrics(calls?.filter((call) => call.kind === 'judge')),
    },
    mcp: {
      ...mcpObservationScope,
      count: observed && !unidentified ? spans.size : null,
      elapsedMs: observed && !unidentified ? sum(durations) : null,
      complete: observed && !unidentified && durations.every((value) => value !== null),
    },
    readCache: {
      hits: null,
      limitation:
        'Read-cache hits are not exposed by this application observation contract. Provider cached tokens are measured separately; absent values are unknown.',
    },
  };
}

export function aggregateMetrics(attempts: { metrics?: EvaluationMetrics }[]): EvaluationMetrics {
  const metrics = attempts.map((attempt) => attempt.metrics);
  const observed = metrics.length > 0 && metrics.every((value) => value !== undefined);
  const model = Object.fromEntries(
    (['backend', 'summary', 'judge'] as const).map((kind) => {
      const empty = modelMetrics();
      return [
        kind,
        Object.fromEntries(
          Object.keys(empty).map((field) => [
            field,
            observed
              ? sum(metrics.map((value) => value?.model[kind][field as keyof ModelMetrics] ?? null))
              : null,
          ]),
        ),
      ];
    }),
  ) as EvaluationMetrics['model'];
  return {
    model,
    mcp: {
      ...mcpObservationScope,
      count: observed ? sum(metrics.map((value) => value?.mcp.count ?? null)) : null,
      elapsedMs: observed ? sum(metrics.map((value) => value?.mcp.elapsedMs ?? null)) : null,
      complete: observed && metrics.every((value) => value?.mcp.complete),
    },
    readCache: evaluationMetrics(undefined, []).readCache,
  };
}
