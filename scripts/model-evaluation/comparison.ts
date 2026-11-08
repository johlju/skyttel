import { createHash } from 'node:crypto';
import { type ApplicationVersion, validApplicationIdentity } from './application.js';
import { aggregateMetrics } from './metrics.js';
import preparedPlan from './optimization-comparison-plan.json' with { type: 'json' };
import { type EvaluationProfile, verifiedProfile } from './provider.js';
import { summarizeProfile } from './report.js';
import type { Attempt, Scenario } from './types.js';

export type ComparisonPlan = {
  id: string;
  modality: 'text';
  models: string[];
  effort: EvaluationProfile['effort'];
  repetitions: number[];
  targetScenarios: string[];
  targetMaximumRatio: number;
  otherMaximumRatio: number;
  maximumRelativeRange: number;
};
export type ApplicationComparison = {
  baseline: ApplicationVersion;
  candidate: ApplicationVersion;
  plan?: ComparisonPlan;
};
export type ComparisonRun = {
  contractId: string;
  plan: ComparisonPlan;
  profile: EvaluationProfile;
  versions: ApplicationVersion[];
  order: { repetition: number; application: ApplicationVersion }[];
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** A shared contract excludes the two application identities by design. Only
 * their implementation varies; all evaluator conditions and order are fixed. */
export function prepareComparison(
  selection: ApplicationComparison,
  scenarios: Scenario[],
  suppliedProfile: EvaluationProfile,
  conditions: {
    catalog: unknown;
    audio: unknown;
    judge: unknown;
    followUps: boolean;
    counting?: unknown;
    evaluator?: unknown;
  },
): ComparisonRun {
  const plan = structuredClone(selection.plan ?? preparedPlan) as ComparisonPlan;
  const profile = verifiedProfile(suppliedProfile.id, suppliedProfile);
  const versions = [selection.baseline, selection.candidate].map((version) => ({ ...version }));
  if (
    versions[0].id === versions[1].id ||
    versions.some((version) => !validApplicationIdentity(version)) ||
    !plan.id ||
    plan.modality !== 'text' ||
    !plan.repetitions.length ||
    new Set(plan.repetitions).size !== plan.repetitions.length ||
    plan.repetitions.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    !plan.targetScenarios.length ||
    new Set(plan.targetScenarios).size !== plan.targetScenarios.length ||
    plan.targetScenarios.some(
      (id) =>
        !scenarios.some(
          (scenario) => scenario.id === id && (scenario.group ?? 'everyday') === 'everyday',
        ),
    ) ||
    !Number.isFinite(plan.targetMaximumRatio) ||
    plan.targetMaximumRatio <= 0 ||
    plan.targetMaximumRatio > 1 ||
    !Number.isFinite(plan.otherMaximumRatio) ||
    plan.otherMaximumRatio < 1 ||
    !Number.isFinite(plan.maximumRelativeRange) ||
    plan.maximumRelativeRange < 0
  )
    throw new Error('evaluation_comparison_plan_invalid');
  if (
    profile.role !== 'backend' ||
    !plan.models.includes(profile.model) ||
    plan.effort !== profile.effort
  )
    throw new Error('evaluation_comparison_profile_mismatch');
  const contractId = createHash('sha256')
    .update(
      canonical({
        format: 'skyttel-application-comparison-v1',
        measurement: { text: 'text-delivery-v2', summary: 'summary-execution-v1' },
        assistanceTiming: 'immediate-scripted-reply-excluding-evaluator-gaps-v1',
        plan,
        profile,
        conditions,
      }),
    )
    .digest('hex');
  return {
    contractId,
    plan,
    profile,
    versions,
    order: plan.repetitions.flatMap((repetition, index) =>
      (index % 2 ? [...versions].reverse() : versions).map((application) => ({
        repetition,
        application,
      })),
    ),
  };
}

/** Compare application changes within one exact model, keeping raw outcomes
 * and all mandatory correctness evidence ahead of everyday speed thresholds. */
export function compareApplicationVersions(
  attempts: Attempt[],
  scenarios: Scenario[],
  run: ComparisonRun,
) {
  const versions = run.versions.map(({ id, commit }) => {
    const values = attempts.filter(
      (attempt) =>
        attempt.applicationVersion === id &&
        attempt.profile === run.profile.id &&
        attempt.modality === run.plan.modality,
    );
    return {
      id,
      commit,
      attempts: values,
      metrics: aggregateMetrics(values),
      summary: summarizeProfile(
        values,
        scenarios,
        run.profile.id,
        run.plan.modality,
        run.plan.repetitions,
      ),
    };
  });
  const [baseline, candidate] = versions;
  const rows = scenarios
    .filter((scenario) => (scenario.group ?? 'everyday') === 'everyday')
    .map((scenario) => {
      const a = baseline.summary.scenarioTimes.find((item) => item.scenario === scenario.id);
      const b = candidate.summary.scenarioTimes.find((item) => item.scenario === scenario.id);
      const range = (value: typeof a) =>
        value && value.medianMs > 0 ? (value.maxMs - value.minMs) / value.medianMs : null;
      return {
        scenario: scenario.id,
        target: run.plan.targetScenarios.includes(scenario.id),
        baseline: a ?? null,
        candidate: b ?? null,
        ratio: a && b && a.medianMs > 0 ? b.medianMs / a.medianMs : null,
        relativeRange: { baseline: range(a), candidate: range(b) },
      };
    });
  const reasons: string[] = [];
  let status: 'accepted' | 'rejected' | 'inconclusive' = 'accepted';
  if (versions.some((version) => version.summary.correctnessFailures.length)) {
    status = 'rejected';
    reasons.push('mandatory_correctness_failed');
  } else if (versions.some((version) => !version.summary.finalQualified)) {
    status = 'inconclusive';
    reasons.push('mandatory_evidence_incomplete');
  }
  const comparable = versions.every((version) =>
    version.attempts.every((attempt) => {
      const scenario = scenarios.find((item) => item.id === attempt.scenario);
      if (!scenario || !run.plan.repetitions.includes(attempt.repetition)) return true;
      if (
        attempt.comparisonContract !== run.contractId ||
        attempt.applicationCommit !== version.commit
      )
        return false;
      if (attempt.outcome !== 'pass') return attempt.elapsedMs === null;
      const step = scenario.steps.find((item) => item.id === (attempt.followUpFor ?? attempt.step));
      return (
        attempt.timing?.contract ===
          (step?.transition === 'summary' ? 'summary-execution-v1' : 'text-delivery-v2') &&
        attempt.timing.successfulCompletionMs === attempt.elapsedMs &&
        attempt.elapsedMs !== null &&
        Number.isFinite(attempt.elapsedMs) &&
        attempt.elapsedMs >= 0
      );
    }),
  );
  if (!comparable) {
    if (status !== 'rejected') status = 'inconclusive';
    reasons.push('comparison_contract_or_delivery_evidence_mismatch');
  }
  const variable = rows.some(
    (row) =>
      row.ratio === null ||
      row.relativeRange.baseline === null ||
      row.relativeRange.candidate === null ||
      row.relativeRange.baseline > run.plan.maximumRelativeRange ||
      row.relativeRange.candidate > run.plan.maximumRelativeRange,
  );
  if (variable) {
    if (status !== 'rejected') status = 'inconclusive';
    reasons.push('missing_timing_or_excessive_variation');
  }
  if (
    status === 'accepted' &&
    rows.some(
      (row) =>
        row.ratio !== null &&
        row.ratio > (row.target ? run.plan.targetMaximumRatio : run.plan.otherMaximumRatio),
    )
  ) {
    status = 'rejected';
    reasons.push('declared_wait_threshold_failed');
  }
  return {
    contractId: run.contractId,
    plan: run.plan,
    model: run.profile.model,
    effort: run.profile.effort,
    modality: run.plan.modality,
    status,
    reasons,
    versions,
    scenarios: rows,
    advanced: (['long_conversation', 'complex'] as const).map((group) => ({
      group,
      baseline: baseline.summary.groups[group],
      candidate: candidate.summary.groups[group],
      capabilityRegression:
        candidate.summary.groups[group].completedScenarios <
          baseline.summary.groups[group].completedScenarios ||
        candidate.summary.groups[group].safeInabilities >
          baseline.summary.groups[group].safeInabilities,
    })),
    limitation: `${run.plan.repetitions.length} repetitions provide initial evidence, not a statistically secure ranking. Advanced capability limits and raw failures remain separate from everyday wait thresholds.`,
    productionModelChanged: false,
  };
}
