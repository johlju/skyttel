import { randomUUID } from 'node:crypto';
import { modelTransport } from '../../src/server/model-client.js';
import type { EvaluationBudget } from './budget.js';
import registry from './profiles.json' with { type: 'json' };

export type EvaluationProfile = {
  id: string;
  provider: 'openai';
  model: string;
  role: 'backend' | 'judge';
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  tokens: number;
  maxInputTokens: number;
  modelMaxOutputTokens: number;
  maxOutputTokens: number;
  serviceTier: 'default';
  checkedAt: string;
  prices: {
    input: number;
    cached: number;
    cacheWrite: number;
    output: number;
    longContextThreshold: number;
    longInputMultiplier: number;
    longOutputMultiplier: number;
  };
  sources: string[];
};
export function verifiedProfile(id: string, temporary?: EvaluationProfile): EvaluationProfile {
  const value = temporary ?? registry.profiles.find((profile) => profile.id === id);
  if (value && value.provider !== 'openai')
    throw new Error(`evaluation_provider_unsupported:${value.provider}`);
  if (
    !value ||
    !('prices' in value) ||
    !value.prices ||
    value.provider !== 'openai' ||
    !/^[a-z0-9.-]+$/.test(value.model) ||
    !['low', 'medium', 'high', 'xhigh', 'max'].includes(value.effort) ||
    !['backend', 'judge'].includes(value.role) ||
    value.serviceTier !== 'default' ||
    !value.sources.length ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.checkedAt) ||
    !Number.isSafeInteger(value.maxInputTokens) ||
    value.maxInputTokens <= 0 ||
    value.tokens < value.maxInputTokens + value.maxOutputTokens ||
    !Number.isSafeInteger(value.modelMaxOutputTokens) ||
    !Number.isSafeInteger(value.maxOutputTokens) ||
    value.maxOutputTokens <= 0 ||
    value.modelMaxOutputTokens < value.maxOutputTokens ||
    Object.values(value.prices).some((price) => !Number.isFinite(price) || price < 0)
  )
    throw new Error('evaluation_invalid_profile');
  return value as EvaluationProfile;
}

export type ProviderCall = {
  id: string;
  startedAt: number;
  endedAt?: number;
  kind: 'backend' | 'summary' | 'judge';
  model: string;
  request: Record<string, unknown>;
  response?: Record<string, unknown>;
  costUsd: number | null;
  reservationUsd: number;
  outcome: string;
  requestId?: string;
  context?: { scenario: string; step: string; modality: 'text' | 'voice'; repetition: number };
  profile: string;
};
export function requestMaximum(
  profile: EvaluationProfile,
  outputLimit: number,
  exactInput?: number,
) {
  const input = exactInput ?? profile.maxInputTokens;
  if (
    !Number.isSafeInteger(input) ||
    input < 0 ||
    input > profile.maxInputTokens ||
    !Number.isSafeInteger(outputLimit) ||
    outputLimit <= 0 ||
    outputLimit > profile.maxOutputTokens
  )
    throw new Error('evaluation_context_limit');
  const long = input > profile.prices.longContextThreshold;
  return (
    (input *
      Math.max(profile.prices.input, profile.prices.cacheWrite) *
      (long ? profile.prices.longInputMultiplier : 1) +
      outputLimit * profile.prices.output * (long ? profile.prices.longOutputMultiplier : 1)) /
    1e6
  );
}
export function modelCost(
  profile: EvaluationProfile,
  response: Record<string, unknown>,
): number | null {
  const usage = response.usage as
    | {
        input_tokens?: number;
        output_tokens?: number;
        input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
        output_tokens_details?: { reasoning_tokens?: number };
      }
    | undefined;
  const values = [
    usage?.input_tokens,
    usage?.output_tokens,
    usage?.input_tokens_details?.cached_tokens,
    usage?.input_tokens_details?.cache_write_tokens,
    usage?.output_tokens_details?.reasoning_tokens,
  ];
  if (values.some((value) => !Number.isSafeInteger(value) || Number(value) < 0)) return null;
  const [input, output, cached, write, reasoning] = values as number[];
  if (cached + write > input || reasoning > output) return null;
  const long = input > profile.prices.longContextThreshold;
  return (
    (((input - cached - write) * profile.prices.input +
      cached * profile.prices.cached +
      write * profile.prices.cacheWrite) *
      (long ? profile.prices.longInputMultiplier : 1)) /
      1e6 +
    (output * profile.prices.output * (long ? profile.prices.longOutputMultiplier : 1)) / 1e6
  );
}

/** The complete outgoing SDK payload is the reservation boundary. SDK retries
 * are disabled by callers. Failures without usage keep their reservation. */
export function budgetedProvider(
  profile: EvaluationProfile,
  budget: EvaluationBudget,
  {
    transport = modelTransport,
    record,
    countInput,
  }: {
    transport?: typeof fetch;
    record: (call: ProviderCall) => void;
    countInput?: (payload: Record<string, unknown>) => Promise<number>;
  },
) {
  let calls = 0;
  let begun = false;
  let context: ProviderCall['context'];
  return {
    profile,
    beginStep(_audioMs = 0, step?: ProviderCall['context']) {
      calls = 0;
      context = step;
      begun = true;
    },
    fetch: (async (url, init) => {
      const parsedUrl = new URL(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      );
      if (parsedUrl.origin !== 'https://api.openai.com' || parsedUrl.pathname !== '/v1/responses')
        throw new Error('evaluation_unverified_endpoint');
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const limit = payload.max_output_tokens;
      if (
        payload.model !== profile.model ||
        payload.service_tier !== 'default' ||
        (payload.reasoning as { effort?: string })?.effort !== profile.effort ||
        typeof limit !== 'number' ||
        !Number.isSafeInteger(limit) ||
        limit <= 0 ||
        limit > profile.maxOutputTokens
      )
        throw new Error('evaluation_request_profile_mismatch');
      if (!begun || ++calls > (profile.role === 'judge' ? 1 : 48))
        throw new Error('evaluation_call_limit');
      const kind =
        profile.role === 'judge' ? 'judge' : context?.step === 'summary' ? 'summary' : 'backend';
      const exact = countInput ? await countInput(payload) : undefined;
      const maximum = requestMaximum(profile, limit, exact);
      const reservation = budget.reserve(kind, maximum);
      const call: ProviderCall = {
        id: randomUUID(),
        startedAt: Date.now(),
        kind,
        context,
        profile: profile.id,
        model: profile.model,
        request: payload,
        costUsd: null,
        reservationUsd: maximum,
        outcome: 'started',
      };
      record(structuredClone(call));
      try {
        budget.beginCall();
        const response = await transport(url, init);
        call.response = await response
          .clone()
          .json()
          .catch(() => undefined);
        call.requestId = response.headers.get('x-request-id') ?? undefined;
        call.costUsd = call.response ? modelCost(profile, call.response) : null;
        call.outcome = response.ok
          ? String(call.response?.status ?? 'unknown')
          : `http_${response.status}`;
        if (
          response.ok &&
          (call.response?.model !== profile.model || call.response?.service_tier !== 'default')
        ) {
          budget.stop('evaluation_reported_profile_mismatch');
          throw new Error('evaluation_reported_profile_mismatch');
        }
        return response;
      } catch (error) {
        call.outcome = init?.signal?.aborted ? 'aborted' : 'error';
        throw error;
      } finally {
        call.endedAt = Date.now();
        budget.settle(reservation, call.costUsd);
        record(structuredClone(call));
      }
    }) as typeof fetch,
  };
}
