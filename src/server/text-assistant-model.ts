import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
import type { ResponseInputItem, Tool } from 'openai/resources/responses/responses';
import { textConversationModel } from './conversation-capacity.js';
import { MapError } from './map-error.js';
import { ModelClient } from './model-client.js';

export interface TextModelProfile {
  provider: 'openai';
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  tokens: number;
  maxOutputTokens: number;
}

export interface TextModelAttempt {
  attemptId: string;
  startedAt: string;
  endedAt: string | null;
  model: string;
  resolvedModel?: string | null;
  serviceTier?: string | null;
  requestId: string | null;
  responseId: string | null;
  outcome: 'started' | 'completed' | 'failed' | 'aborted' | 'incomplete';
  completeness: 'unknown' | 'partial' | 'complete';
  usage: {
    input: number | null;
    cached: number | null;
    cacheWrite: number | null;
    output: number | null;
    reasoning: number | null;
  };
}
export type TextModelUsage = (attempt: TextModelAttempt) => void;
/** Ephemeral evidence has its own sink; cost records never receive content. */
export type TextModelEvidence = (
  attempt: TextModelAttempt,
  content: { input?: unknown; output?: unknown },
) => void;
const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const identifier = (value: unknown) =>
  typeof value === 'string' && /^[\w-]{1,200}$/.test(value) ? value : null;

export function textModel(
  apiKey: string,
  modelFetch?: typeof fetch,
  record?: TextModelUsage,
  profile?: TextModelProfile,
  observe?: TextModelEvidence,
  selectProfile?: () => TextModelProfile,
) {
  if (
    profile &&
    (profile.provider !== 'openai' ||
      !/^[a-z0-9.-]+$/.test(profile.model) ||
      !['low', 'medium', 'high', 'xhigh', 'max'].includes(profile.effort) ||
      !Number.isSafeInteger(profile.tokens) ||
      !Number.isSafeInteger(profile.maxOutputTokens) ||
      profile.maxOutputTokens <= 0 ||
      profile.tokens <= profile.maxOutputTokens)
  )
    throw new Error('invalid_model_profile');
  const client = new ModelClient({
    apiKey,
    baseURL: 'https://api.openai.com/v1',
    fetch: modelFetch,
    maxRetries: 0,
    logLevel: 'off',
  });
  return async (
    instructions: string,
    input: ResponseInputItem[],
    tools: Tool[],
    signal: AbortSignal,
    maxOutputTokens?: number,
  ) => {
    const selected = profile ?? selectProfile?.();
    const outputLimit = maxOutputTokens ?? selected?.maxOutputTokens;
    if (
      outputLimit !== undefined &&
      (!Number.isSafeInteger(outputLimit) ||
        outputLimit <= 0 ||
        (selected && outputLimit > selected.maxOutputTokens))
    )
      throw new Error('invalid_model_output_limit');
    const attempt: TextModelAttempt = {
      attemptId: randomUUID(),
      startedAt: new Date().toISOString(),
      endedAt: null,
      model: selected?.model ?? textConversationModel.model,
      requestId: null,
      responseId: null,
      outcome: 'started',
      completeness: 'unknown',
      usage: { input: null, cached: null, cacheWrite: null, output: null, reasoning: null },
    };
    const request = {
      model: attempt.model,
      reasoning: { effort: selected?.effort ?? textConversationModel.effort },
      ...(profile ? { service_tier: 'default' as const } : {}),
      store: false as const,
      prompt_cache_options: { ttl: '30m' as const },
      parallel_tool_calls: true,
      instructions,
      input,
      tools,
      ...(outputLimit === undefined ? {} : { max_output_tokens: outputLimit }),
    };
    // Match the occupancy estimate used by the conversation. Keep exact work
    // intact when even this local input plus the selected output budget cannot fit.
    if (
      selected &&
      Buffer.byteLength(JSON.stringify(request)) / 3 + (outputLimit ?? 0) >= selected.tokens
    )
      throw new MapError('assistant_context_capacity', 409);
    const evidence = (content: { input?: unknown; output?: unknown }) => {
      try {
        observe?.({ ...attempt }, content);
      } catch {
        // Diagnostic consumers cannot change the request or its result.
      }
    };
    record?.({ ...attempt });
    evidence({ input: request });
    let output: unknown;
    try {
      const response = await client.responses.create(request, { signal });
      output = response;
      attempt.requestId = identifier(response._request_id);
      attempt.responseId = identifier(response.id);
      attempt.resolvedModel =
        response.model == null
          ? null
          : response.model === attempt.model
            ? attempt.model
            : 'unsupported';
      attempt.serviceTier =
        response.service_tier == null
          ? null
          : response.service_tier === 'default'
            ? 'default'
            : 'unsupported';
      const usage = response.usage;
      attempt.usage = {
        input: count(usage?.input_tokens),
        cached: count(usage?.input_tokens_details?.cached_tokens),
        cacheWrite: count(usage?.input_tokens_details?.cache_write_tokens),
        output: count(usage?.output_tokens),
        reasoning: count(usage?.output_tokens_details?.reasoning_tokens),
      };
      attempt.completeness = Object.values(attempt.usage).every((value) => value !== null)
        ? 'complete'
        : Object.values(attempt.usage).some((value) => value !== null)
          ? 'partial'
          : 'unknown';
      attempt.outcome = response.status === 'completed' ? 'completed' : 'incomplete';
      if (profile && (response.model !== profile.model || response.service_tier !== 'default'))
        throw new Error('model_profile_mismatch');
      if (!profile && selected && response.model !== selected.model)
        throw new MapError('assistant_model_unsupported', 409);
      return response;
    } catch (error) {
      attempt.outcome = signal.aborted ? 'aborted' : 'failed';
      if (error instanceof OpenAI.APIError) attempt.requestId = identifier(error.requestID);
      if (!signal.aborted && selectProfile) {
        const status = error instanceof OpenAI.APIError ? error.status : undefined;
        const code =
          error instanceof MapError
            ? error.code
            : error instanceof OpenAI.APIError && error.code === 'context_length_exceeded'
              ? 'assistant_context_capacity'
              : status === 401 || status === 403 || status === 404
                ? 'assistant_model_access'
                : status === 400 || status === 422
                  ? 'assistant_model_unsupported'
                  : 'assistant_model_temporary';
        console.error(
          JSON.stringify({
            event: 'assistant_model_failed',
            reference: attempt.attemptId,
            at: attempt.endedAt ?? new Date().toISOString(),
            model: attempt.model,
            effort: selected?.effort,
            category: code,
          }),
        );
        throw new MapError(code, 409);
      }
      throw error;
    } finally {
      attempt.endedAt = new Date().toISOString();
      // A usage sink cannot turn an already completed map operation into a
      // failure. Its consumer records its own operational health separately.
      try {
        record?.({ ...attempt });
      } catch {
        console.error(JSON.stringify({ event: 'model_usage_unavailable' }));
      }
      evidence({ output });
    }
  };
}
