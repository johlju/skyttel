import { createHash, randomUUID } from 'node:crypto';
import type { EvaluationBudget } from './budget.js';
import { type EvaluationProfile, modelCost, verifiedProfile } from './provider.js';

/** A reproducible 4 MiB supplement to a captured complete application request.
 * Bytes bound storage only. They are never converted into a claimed token count.
 * The probe does not change the application's prompts, outputs or context limit. */
export function providerBoundaryPayload(captured: Record<string, unknown>) {
  if (!Array.isArray(captured.input)) throw new Error('evaluation_probe_capture_missing');
  const data = Array.from({ length: 64_000 }, (_, index) =>
    createHash('sha256').update(`skyttel-context-boundary-v1:${index}`).digest('hex'),
  ).join('\n');
  return {
    ...structuredClone(captured),
    input: [
      ...structuredClone(captured.input),
      {
        role: 'user',
        content: JSON.stringify({ historical: true, untrusted: true, contextBoundaryData: data }),
      },
    ],
  };
}

/** Separate capability seam, not normal application work. Exact counting and
 * its documented fee must be supplied explicitly and use this same ledger.
 * A count beyond normal input limits receives its own larger reservation.
 * Unknown rejection usage retains the hold and stops further calls. */
export async function probeProviderContextLimit(options: {
  profile: EvaluationProfile;
  payload: Record<string, unknown>;
  budget: EvaluationBudget;
  apiKey: string;
  origin: 'provider' | 'controlled';
  counting?: {
    source: string;
    feeUsd: number;
    count: (payload: Record<string, unknown>) => Promise<number>;
  };
  transport?: typeof fetch;
  record?: (evidence: unknown) => void;
}) {
  const profile = verifiedProfile(options.profile.id, options.profile);
  const payload = structuredClone(options.payload);
  const count = options.counting;
  if (!count?.source || !Number.isFinite(count.feeUsd) || count.feeUsd < 0)
    throw new Error('evaluation_probe_verified_counting_required');
  const serialized = JSON.stringify(payload);
  if (
    !options.apiKey ||
    profile.role !== 'backend' ||
    payload.model !== profile.model ||
    payload.service_tier !== 'default' ||
    (payload.reasoning as { effort?: string })?.effort !== profile.effort ||
    payload.max_output_tokens !== profile.maxOutputTokens ||
    Buffer.byteLength(serialized) > 9 * 1024 * 1024
  )
    throw new Error('evaluation_probe_payload_invalid');
  // The selected source request must use the same verified 30m write policy.
  const lifetimes: unknown[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (
        ['prompt_cache_options', 'prompt_cache_breakpoint'].includes(key) &&
        child &&
        typeof child === 'object'
      )
        lifetimes.push((child as { ttl?: unknown }).ttl);
      visit(child);
    }
  };
  visit(payload);
  if (lifetimes.some((ttl) => ttl !== undefined && ttl !== '30m'))
    throw new Error('evaluation_probe_cache_policy_unverified');
  const payloadSha256 = createHash('sha256').update(serialized).digest('hex');
  const countCharge = options.budget.reserve('context_boundary_counting', count.feeUsd);
  const countingStartedAt = Date.now();
  let inputTokens = Number.NaN;
  let countSettled = false;
  try {
    options.budget.beginCall();
    inputTokens = await count.count(structuredClone(payload));
    options.budget.settle(countCharge, count.feeUsd);
    countSettled = true;
  } catch (error) {
    options.budget.settle(countCharge, null);
    throw error;
  } finally {
    options.record?.({
      kind: 'context_boundary_counting',
      callId: countCharge,
      startedAt: countingStartedAt,
      endedAt: Date.now(),
      payloadSha256,
      source: count.source,
      reservationUsd: count.feeUsd,
      costUsd: countSettled ? count.feeUsd : null,
      inputTokens: Number.isFinite(inputTokens) ? inputTokens : null,
    });
  }
  if (
    !Number.isSafeInteger(inputTokens) ||
    inputTokens <= profile.tokens - profile.maxOutputTokens ||
    inputTokens > 16_777_216
  )
    throw new Error('evaluation_probe_oversized_count_required');
  const long = inputTokens > profile.prices.longContextThreshold;
  const maximumUsd =
    (inputTokens *
      Math.max(profile.prices.input, profile.prices.cacheWrite) *
      (long ? profile.prices.longInputMultiplier : 1) +
      profile.maxOutputTokens *
        profile.prices.output *
        (long ? profile.prices.longOutputMultiplier : 1)) /
    1e6;
  const charge = options.budget.reserve('context_boundary_probe', maximumUsd);
  const callId = randomUUID();
  const startedAt = Date.now();
  let response: Record<string, unknown> | undefined;
  let requestId: string | null = null;
  let costUsd: number | null = null;
  let status: number | null = null;
  try {
    options.budget.beginCall();
    const result = await (options.transport ?? fetch)('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}`, 'content-type': 'application/json' },
      body: serialized,
    });
    response = (await result.json()) as Record<string, unknown>;
    requestId = result.headers.get('x-request-id');
    status = result.status;
    costUsd = modelCost(profile, response);
  } finally {
    options.budget.settle(charge, costUsd);
    options.record?.({
      kind: 'context_boundary_probe',
      callId,
      startedAt,
      endedAt: Date.now(),
      payload,
      payloadSha256,
      inputTokens,
      counting: { source: count.source, feeUsd: count.feeUsd, charge: countCharge },
      maximumUsd,
      costUsd,
      response,
      requestId,
      status,
      origin: options.origin,
    });
  }
  return {
    origin: options.origin,
    payloadSha256,
    inputTokens,
    maximumUsd,
    costUsd,
    requestId,
    status,
    successfulCompletionMs: null,
    boundary:
      status === 400 &&
      requestId &&
      (response?.error as { code?: string } | undefined)?.code === 'context_length_exceeded'
        ? options.origin === 'provider'
          ? 'provider_context_rejection'
          : 'controlled_context_rejection'
        : 'inconclusive',
  };
}
