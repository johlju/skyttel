export interface CostAssumptions {
  sekPerUsd: number;
  computeUsd: number;
  diskGb: number;
  diskUsdPerGb: number;
  workspace: 'hobby' | 'pro' | 'scale' | 'custom';
  workspaceUsd: number;
}

export interface CostRateCard {
  id: string;
  checkedAt: string;
  liveUsdPerMinute: number;
  liveMinimumSeconds: number;
  terra: {
    threshold: number;
    short: { input: number; cached: number; cacheWrite: number; output: number };
    long: { input: number; cached: number; cacheWrite: number; output: number };
  };
  sources: { title: string; url: string }[];
}

export type CostIssue =
  | 'unfinished'
  | 'missing_usage'
  | 'inconsistent_usage'
  | 'unsupported_model'
  | 'unsupported_tier'
  | 'assumed_requested_model'
  | 'assumed_standard';

export interface CostCategory {
  attempts: number;
  uncertainAttempts: number;
  unpricedAttempts: number;
  estimatedUsd: number;
  estimatedSek: number;
  issues: { code: CostIssue; count: number }[];
}

export interface CostCount {
  known: number;
  missing: number;
}

export interface CostMonth {
  month: string;
  generatedAt: string;
  coverageStartedAt: string;
  coverageIncomplete: boolean;
  recordingUnavailable: boolean;
  assumptions: CostAssumptions & { version: number; updatedAt: string | null };
  assumptionHistory: (CostAssumptions & { version: number; updatedAt: string })[];
  rates: CostRateCard[];
  render: { estimatedUsd: number; estimatedSek: number };
  live: CostCategory & { seconds: CostCount; estimatedBillableSeconds: number };
  terra: CostCategory & {
    usage: Record<'input' | 'cached' | 'cacheWrite' | 'output' | 'reasoning', CostCount>;
  };
  total: { estimatedUsd: number; estimatedSek: number; incomplete: boolean };
}
