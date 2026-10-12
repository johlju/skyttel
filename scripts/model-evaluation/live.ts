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
    !profile.sources.length ||
    !profile.checkedAt
  )
    throw new Error('evaluation_live_profile_unverified');
  return profile;
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
) {
  verifiedLiveProfile(profile);
  if (!Number.isSafeInteger(maximumSeconds) || maximumSeconds <= 0 || maximumSeconds > 3420)
    throw new Error('evaluation_live_time_limit');
  const pending: string[] = [];
  const reservations = new Map<string, string>();
  let sessions = 0;
  return {
    fetch: (async (url, init) => {
      const endpoint = new URL(
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
      );
      if (
        endpoint.origin !== 'https://api.openai.com' ||
        endpoint.pathname !== '/v1/live/sessions' ||
        JSON.parse(String(init?.body)).session?.model !== profile.model
      )
        throw new Error('evaluation_live_profile_mismatch');
      if (++sessions > 2) throw new Error('evaluation_live_start_limit');
      const reservation = budget.reserve('voice', (maximumSeconds * profile.usdPerMinute) / 60);
      pending.push(reservation);
      budget.beginCall();
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
        budget.settle(
          reservation,
          usage.model === profile.model &&
            usage.final &&
            usage.seconds !== null &&
            usage.seconds <= maximumSeconds
            ? (usage.seconds * profile.usdPerMinute) / 60
            : null,
        );
      }
    },
  };
}
