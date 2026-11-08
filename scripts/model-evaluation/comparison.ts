import { createHash } from 'node:crypto';
import { type ApplicationVersion, validApplicationIdentity } from './application.js';
import { type LiveEvaluationProfile, verifiedLiveProfile } from './live.js';
import { aggregateMetrics } from './metrics.js';
import preparedPlan from './optimization-comparison-plan.json' with { type: 'json' };
import preparedVoicePlan from './optimization-voice-comparison-plan.json' with { type: 'json' };
import { type EvaluationProfile, verifiedProfile } from './provider.js';
import { summarizeProfile } from './report.js';
import type { Attempt, Scenario } from './types.js';

export type ComparisonPlan = {
  id: string;
  modality: 'text' | 'voice';
  models: string[];
  effort: EvaluationProfile['effort'];
  repetitions: number[];
  targetScenarios: string[];
  targetMaximumRatio: number;
  otherMaximumRatio: number;
  maximumRelativeRange: number;
  /** Keep whole dialogs intact, deferring their declared cancellation work. */
  executionOrder?: 'ordinary-before-stop-v1';
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
  voiceProfile?: LiveEvaluationProfile;
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
    voice?: LiveEvaluationProfile;
    playback?: unknown;
  },
): ComparisonRun {
  const voice = conditions.voice ? verifiedLiveProfile(conditions.voice) : undefined;
  const plan = structuredClone(
    selection.plan ?? { ...preparedPlan, ...(voice ? preparedVoicePlan : {}) },
  ) as ComparisonPlan;
  const profile = verifiedProfile(suppliedProfile.id, suppliedProfile);
  const versions = [selection.baseline, selection.candidate].map((version) => ({ ...version }));
  if (
    versions[0].id === versions[1].id ||
    versions.some((version) => !validApplicationIdentity(version)) ||
    !plan.id ||
    plan.modality !== (voice ? 'voice' : 'text') ||
    !plan.repetitions.length ||
    new Set(plan.repetitions).size !== plan.repetitions.length ||
    plan.repetitions.some((value) => !Number.isSafeInteger(value) || value <= 0) ||
    !plan.targetScenarios.length ||
    new Set(plan.targetScenarios).size !== plan.targetScenarios.length ||
    plan.targetScenarios.some(
      (id) =>
        !scenarios.some(
          (scenario) =>
            scenario.id === id &&
            (scenario.group ?? 'everyday') === 'everyday' &&
            (!voice || scenario.voice),
        ),
    ) ||
    !Number.isFinite(plan.targetMaximumRatio) ||
    plan.targetMaximumRatio <= 0 ||
    plan.targetMaximumRatio > 1 ||
    !Number.isFinite(plan.otherMaximumRatio) ||
    plan.otherMaximumRatio < 1 ||
    !Number.isFinite(plan.maximumRelativeRange) ||
    plan.maximumRelativeRange < 0 ||
    (plan.executionOrder !== undefined && plan.executionOrder !== 'ordinary-before-stop-v1')
  )
    throw new Error('evaluation_comparison_plan_invalid');
  if (
    profile.role !== 'backend' ||
    !plan.models.includes(profile.model) ||
    plan.effort !== profile.effort ||
    (voice && voice.backend !== profile.id)
  )
    throw new Error('evaluation_comparison_profile_mismatch');
  const contractId = createHash('sha256')
    .update(
      canonical({
        format: 'skyttel-application-comparison-v1',
        measurement: {
          text: 'text-delivery-v2',
          voice: 'voice-rendered-v1',
          summary: 'summary-execution-v1',
        },
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
    voiceProfile: voice,
    versions,
    order: plan.repetitions.flatMap((repetition, index) =>
      (index % 2 ? [...versions].reverse() : versions).map((application) => ({
        repetition,
        application,
      })),
    ),
  };
}

/** Preserve the declared variant order within each ordinary/Stop group.
 * The default keeps every scenario of one application together. */
export function comparisonScenarioOrder(
  run: ComparisonRun,
  repetition: number,
  scenarios: Scenario[],
) {
  const selected = scenarios.filter((scenario) => run.plan.modality !== 'voice' || scenario.voice);
  const dialogs = run.order
    .filter((entry) => entry.repetition === repetition)
    .flatMap(({ application }) => selected.map((scenario) => ({ application, scenario })));
  if (run.plan.executionOrder !== 'ordinary-before-stop-v1') return dialogs;
  const stopped = ({ scenario }: (typeof dialogs)[number]) =>
    scenario.steps.some((step) => step.userStop);
  return [...dialogs.filter((dialog) => !stopped(dialog)), ...dialogs.filter(stopped)];
}

/** Compare application changes within one exact model, keeping raw outcomes
 * and all mandatory correctness evidence ahead of everyday speed thresholds. */
export function compareApplicationVersions(
  attempts: Attempt[],
  scenarios: Scenario[],
  run: ComparisonRun,
  separateSegment = false,
) {
  const selectedScenarios = scenarios.filter(
    (scenario) => run.plan.modality !== 'voice' || scenario.voice,
  );
  const attemptProfile = run.voiceProfile?.id ?? run.profile.id;
  const versions = run.versions.map(({ id, commit, conversationWorkMode }) => {
    const values = attempts.filter(
      (attempt) =>
        attempt.applicationVersion === id &&
        attempt.profile === attemptProfile &&
        attempt.modality === run.plan.modality,
    );
    return {
      id,
      commit,
      conversationWorkMode: conversationWorkMode ?? 'sequential',
      attempts: values,
      metrics: aggregateMetrics(values),
      summary: summarizeProfile(
        values,
        selectedScenarios,
        attemptProfile,
        run.plan.modality,
        run.plan.repetitions,
      ),
    };
  });
  const [baseline, candidate] = versions;
  const rows = selectedScenarios
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
      if (attempt.outcome !== 'pass')
        return (
          attempt.elapsedMs === null &&
          (run.plan.modality !== 'voice' ||
            !['necessary_clarification', 'safe_inability'].includes(
              attempt.assessment?.kind ?? '',
            ) ||
            validVoicePlayback(attempt))
        );
      const step = scenario.steps.find((item) => item.id === (attempt.followUpFor ?? attempt.step));
      return (
        attempt.timing?.contract ===
          (step?.transition === 'summary'
            ? 'summary-execution-v1'
            : run.plan.modality === 'voice'
              ? 'voice-rendered-v1'
              : 'text-delivery-v2') &&
        attempt.timing.successfulCompletionMs === attempt.elapsedMs &&
        attempt.elapsedMs !== null &&
        Number.isFinite(attempt.elapsedMs) &&
        attempt.elapsedMs >= 0 &&
        (run.plan.modality !== 'voice' ||
          step?.transition === 'summary' ||
          validVoicePlayback(attempt))
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
  if (separateSegment) {
    if (status !== 'rejected') status = 'inconclusive';
    reasons.push('continuation_segment_requires_aggregation');
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

export function validVoicePlayback(attempt: Attempt) {
  const proof = attempt.playback;
  const input = proof?.input;
  const end = proof?.renderedEnd;
  const wait =
    attempt.outcome === 'pass' ? attempt.elapsedMs : attempt.timing?.observedResponseEndMs;
  return Boolean(
    proof?.contract === 'voice-rendered-v1' &&
      attempt.timing?.contract === 'voice-rendered-v1' &&
      input &&
      end &&
      !proof.interruption &&
      !proof.error &&
      /^[a-f0-9]{64}$/.test(input.sha256) &&
      /^[a-f0-9]{64}$/.test(proof.recordingSha256 ?? '') &&
      Number.isSafeInteger(input.speechFrames) &&
      input.speechFrames > 0 &&
      input.speechFrames <= input.frames &&
      Number.isFinite(input.ended.lower) &&
      Number.isFinite(input.ended.upper) &&
      input.ended.lower <= input.ended.upper &&
      Number.isFinite(end.lower) &&
      Number.isFinite(end.upper) &&
      end.lower <= end.upper &&
      proof.lastActiveFrame !== null &&
      proof.lastActiveFrame !== undefined &&
      Number.isSafeInteger(proof.frames) &&
      (proof.frames ?? 0) > 0 &&
      proof.candidates.some(
        (candidate) =>
          candidate.outcome === 'recognized' &&
          candidate.profile &&
          candidate.callId &&
          candidate.recordingSha256 === proof.recordingSha256 &&
          candidate.requiredResponse?.length === 1 &&
          candidate.requiredResponse[0].id === 'voice-rendered-response' &&
          candidate.requiredResponse[0].outcome === 'pass',
      ) &&
      wait !== null &&
      wait !== undefined &&
      Number.isFinite(wait) &&
      Math.max(0, wait) >= Math.max(0, end.upper - input.ended.upper),
  );
}
