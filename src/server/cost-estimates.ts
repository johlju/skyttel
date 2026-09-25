import type {
  CostAssumptions,
  CostCategory,
  CostIssue,
  CostMonth,
  CostRateCard,
} from '../shared/costs.js';

export const currentRates: CostRateCard = {
  id: 'openai-2026-09-25',
  checkedAt: '2026-09-25',
  liveUsdPerMinute: 0.05,
  liveMinimumSeconds: 15,
  terra: {
    threshold: 272_000,
    short: { input: 2, cached: 0.2, cacheWrite: 2.5, output: 12 },
    long: { input: 4, cached: 0.4, cacheWrite: 5, output: 18 },
  },
  sources: [
    { title: 'GPT-Live', url: 'https://developers.openai.com/api/docs/models/gpt-live-1' },
    { title: 'GPT-5.6 Terra', url: 'https://developers.openai.com/api/docs/models/gpt-5.6-terra' },
    { title: 'Cache', url: 'https://developers.openai.com/api/docs/guides/prompt-caching' },
    {
      title: 'Live-initiering',
      url: 'https://developers.openai.com/api/docs/guides/voice-latency-cost',
    },
    { title: 'Render', url: 'https://render.com/pricing' },
  ],
};

export const defaultAssumptions: CostAssumptions = {
  sekPerUsd: 10,
  computeUsd: 7,
  diskGb: 1,
  diskUsdPerGb: 0.25,
  workspace: 'hobby',
  workspaceUsd: 0,
};

export type TokenCounts = Record<
  'input' | 'cached' | 'cacheWrite' | 'output' | 'reasoning',
  number | null
>;
export type Measurement =
  | { kind: 'live'; seconds: number | null; final: boolean; outcome: string }
  | {
      kind: 'terra';
      usage: TokenCounts;
      outcome: string;
      model: string | null;
      tier: string | null;
    };
export interface CostAttempt {
  id: string;
  kind: Measurement['kind'];
  month: string;
  startedAt: string;
  endedAt: string | null;
  measurement: string;
  rates: string;
}

function category(): CostCategory {
  return {
    attempts: 0,
    uncertainAttempts: 0,
    unpricedAttempts: 0,
    estimatedUsd: 0,
    estimatedSek: 0,
    issues: [],
  };
}
function issue(category: CostCategory, code: CostIssue) {
  const found = category.issues.find((item) => item.code === code);
  if (found) found.count++;
  else category.issues.push({ code, count: 1 });
}

export function summarizeAttempts(attempts: CostAttempt[], sekPerUsd: number) {
  const live: CostMonth['live'] = {
    ...category(),
    seconds: { known: 0, missing: 0 },
    estimatedBillableSeconds: 0,
  };
  const terra: CostMonth['terra'] = {
    ...category(),
    usage: {
      input: { known: 0, missing: 0 },
      cached: { known: 0, missing: 0 },
      cacheWrite: { known: 0, missing: 0 },
      output: { known: 0, missing: 0 },
      reasoning: { known: 0, missing: 0 },
    },
  };
  const cards = new Map<string, CostRateCard>();
  for (const attempt of attempts) {
    const rate: CostRateCard = JSON.parse(attempt.rates);
    const value: Measurement = JSON.parse(attempt.measurement);
    cards.set(rate.id, rate);
    if (value.kind === 'live') {
      live.attempts++;
      if (value.seconds === null) {
        live.seconds.missing++;
        live.unpricedAttempts++;
        issue(live, 'missing_usage');
      } else {
        live.seconds.known += value.seconds;
        const estimated = Math.max(rate.liveMinimumSeconds, value.seconds);
        live.estimatedBillableSeconds += estimated;
        live.estimatedUsd += (estimated / 60) * rate.liveUsdPerMinute;
      }
      if (!value.final || !attempt.endedAt) {
        live.uncertainAttempts++;
        issue(live, 'unfinished');
      }
      continue;
    }
    terra.attempts++;
    const { input, cached, cacheWrite, output, reasoning } = value.usage;
    for (const name of Object.keys(value.usage) as (keyof TokenCounts)[]) {
      const count = value.usage[name];
      if (count === null) terra.usage[name].missing++;
      else terra.usage[name].known += count;
    }
    let uncertain = false;
    if (!attempt.endedAt || value.outcome !== 'completed') {
      issue(terra, 'unfinished');
      uncertain = true;
    }
    if (Object.values(value.usage).some((count) => count === null)) {
      issue(terra, 'missing_usage');
      uncertain = true;
    }
    const inconsistent =
      (input !== null && cached !== null && cacheWrite !== null && cached + cacheWrite > input) ||
      (reasoning !== null && output !== null && reasoning > output);
    const unsupportedModel = value.model !== null && value.model !== 'gpt-5.6-terra';
    const unsupportedTier = value.tier !== null && value.tier !== 'default';
    if (inconsistent || unsupportedModel || unsupportedTier) {
      if (inconsistent) issue(terra, 'inconsistent_usage');
      if (unsupportedModel) issue(terra, 'unsupported_model');
      if (unsupportedTier) issue(terra, 'unsupported_tier');
      terra.unpricedAttempts++;
      terra.uncertainAttempts++;
      continue;
    }
    if (value.model === null) issue(terra, 'assumed_requested_model');
    if (value.tier === null) issue(terra, 'assumed_standard');
    const completeInput = input !== null && cached !== null && cacheWrite !== null;
    if (input === null || output === null || !completeInput) terra.unpricedAttempts++;
    if (input !== null) {
      const prices = input > rate.terra.threshold ? rate.terra.long : rate.terra.short;
      if (completeInput)
        terra.estimatedUsd +=
          ((input - cached - cacheWrite) * prices.input +
            cached * prices.cached +
            cacheWrite * prices.cacheWrite) /
          1_000_000;
      if (output !== null) terra.estimatedUsd += (output * prices.output) / 1_000_000;
    }
    if (uncertain) terra.uncertainAttempts++;
  }
  live.estimatedSek = live.estimatedUsd * sekPerUsd;
  terra.estimatedSek = terra.estimatedUsd * sekPerUsd;
  return { live, terra, rates: cards.size ? [...cards.values()] : [currentRates] };
}
