import { isDeepStrictEqual } from 'node:util';
import { voiceAssistantInstructions } from '../../src/server/assistant-instructions.js';
import type { LiveUsageAttempt } from '../../src/server/live-provider.js';
import type { EvaluationBudget } from './budget.js';
import registry from './profiles.json' with { type: 'json' };
export type LiveEvaluationProfile = {
  id: string;
  provider: 'openai';
  model: string;
  tokens: number;
  usdPerMinute: number;
  checkedAt: string;
  sources: string[];
  backend: string;
  billingMode?: 'usage-estimate';
};

export function verifiedLiveProfile(profile: LiveEvaluationProfile) {
  if (profile.provider !== 'openai')
    throw new Error(`evaluation_provider_unsupported:${profile.provider}`);
  if (
    !/^[a-z0-9.-]+$/.test(profile.model) ||
    !Number.isSafeInteger(profile.tokens) ||
    profile.tokens <= 0 ||
    !Number.isFinite(profile.usdPerMinute) ||
    profile.usdPerMinute <= 0 ||
    (profile.billingMode !== undefined && profile.billingMode !== 'usage-estimate') ||
    !profile.sources.length ||
    !profile.checkedAt
  )
    throw new Error('evaluation_live_profile_unverified');
  return profile;
}

/** Fixed speaking/listening configuration checked against the actual outgoing
 * session before payment. Historical input remains scenario/application data. */
export function commonLiveSession(profile: LiveEvaluationProfile) {
  return {
    model: profile.model,
    audio: { output: { voice: 'marin' } },
    delegation: { type: 'client' },
    store: false,
    instructions: voiceAssistantInstructions,
    client: {
      data_channel: {
        allowed_client_events: ['session.close'],
        allowed_server_events: [
          'session.started',
          'session.closed',
          'session.input_transcript.delta',
          'session.output_transcript.delta',
          'session.delegation.created',
          'error',
        ].map((type) => ({ type })),
      },
    },
  };
}

/** A dialog reservation includes audio, startup, collection and intermediate
 * judge waits. Partial usage never releases the outstanding hold. */
export function budgetedLive(
  budget: EvaluationBudget,
  maximumSeconds: number,
  record: (usage: LiveUsageAttempt) => void,
  transport: typeof fetch = fetch,
  profile: LiveEvaluationProfile = registry.profiles.find(
    (profile) => profile.role === 'voice',
  ) as LiveEvaluationProfile,
  options?: { requiredSession: unknown; recordDispatch?: (body: unknown) => void },
) {
  verifiedLiveProfile(profile);
  const estimated = profile.billingMode === 'usage-estimate';
  if (estimated && !budget.estimatesAllowed) throw new Error('evaluation_estimate_not_authorized');
  if (!Number.isSafeInteger(maximumSeconds) || maximumSeconds <= 0 || maximumSeconds > 3420)
    throw new Error('evaluation_live_time_limit');
  const pending: string[] = [];
  const reservations = new Map<string, string>();
  let sessions = 0;
  return {
    fetch: (async (url, init) => {
      const body = JSON.parse(String(init?.body));
      const endpoint = new URL(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      );
      if (
        endpoint.origin !== 'https://api.openai.com' ||
        endpoint.pathname !== '/v1/live/sessions' ||
        body.session?.model !== profile.model
      )
        throw new Error('evaluation_live_profile_mismatch');
      if (options) {
        const { input: _history, ...conditions } = body.session;
        if (
          body.transport?.type !== 'webrtc' ||
          !isDeepStrictEqual(conditions, options.requiredSession)
        )
          throw new Error('evaluation_live_session_conditions_mismatch');
      }
      if (++sessions > 2) throw new Error('evaluation_live_start_limit');
      const reservation = budget.reserve('voice', (maximumSeconds * profile.usdPerMinute) / 60);
      pending.push(reservation);
      budget.beginCall();
      options?.recordDispatch?.(body);
      return transport(url, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(30_000),
        ]),
      });
    }) as typeof fetch,
    usage(usage: LiveUsageAttempt) {
      record(structuredClone(usage));
      if (!reservations.has(usage.attemptId) && pending.length)
        reservations.set(usage.attemptId, pending.shift() as string);
      const reservation = reservations.get(usage.attemptId);
      if (reservation && usage.endedAt) {
        reservations.delete(usage.attemptId);
        const known =
          usage.model === profile.model &&
          usage.final &&
          usage.seconds !== null &&
          Number.isFinite(usage.seconds) &&
          usage.seconds >= 0 &&
          usage.seconds <= maximumSeconds;
        if (known && estimated)
          budget.estimate(
            reservation,
            (Math.max(15, usage.seconds as number) * profile.usdPerMinute) / 60,
            'Reported final duration with a 15-second initialization allowance; short-session final charge unresolved.',
          );
        else
          budget.settle(
            reservation,
            known ? ((usage.seconds as number) * profile.usdPerMinute) / 60 : null,
          );
      }
    },
  };
}
