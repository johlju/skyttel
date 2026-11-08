import type { LiveUsageAttempt } from '../../src/server/live-provider.js';
import type { ApplicationVersion } from './application.js';
import rawCatalog from './catalog.json' with { type: 'json' };
import type { ComparisonPlan, ComparisonRun } from './comparison.js';
import { validVoicePlayback } from './comparison.js';
import { scriptedDialogTiming } from './dialog-timing.js';
import type { EvaluationPlan } from './evaluate.js';
import plan from './overlap-comparison-plan.json' with { type: 'json' };
import type { ProviderCall } from './provider.js';
import { summarizeProfile } from './report.js';
import type { Attempt, Catalog, Expected, Scenario, ScenarioStep } from './types.js';
import { validVoiceStopEvidence } from './user-stop.js';

export type ScenarioVoiceUsage = {
  scenario: string;
  applicationVersion?: string;
  repetition: number;
  sessions: LiveUsageAttempt[];
  costUsd: number | null;
};

const catalog = rawCatalog as Catalog;
const source = (id: string) => {
  const scenario = catalog.scenarios.find((item) => item.id === id);
  if (!scenario) throw new Error('evaluation_overlap_fixture_missing');
  return structuredClone(scenario);
};

/** Separate versioned experiment scope. Exact existing utterance IDs preserve
 * the approved audio/text binding; the ordinary catalog is never rewritten. */
export function overlapScenarios(): Scenario[] {
  const success = source('change-price-payment');
  success.id = 'overlap-success';
  const clarification = source('two-ambiguities');
  clarification.id = 'overlap-clarification';
  const stop = source('change-price-payment');
  stop.id = 'overlap-early-stop';
  stop.title = 'Tidigt stopp av pågående uppdrag';
  const step = stop.steps[0];
  const complete = structuredClone(step.expected);
  complete.requirements = [];
  const unchanged: Expected = { saveAttempts: 0, saves: 0, requirements: [] };
  step.expected = unchanged;
  delete step.followUps;
  step.userStop = {
    trigger: 'first-working-after-input',
    maximumObservationMs: 5000,
    allowedStates: [
      unchanged,
      { ...unchanged, objects: complete.objects },
      {
        ...unchanged,
        addRelationships: complete.addRelationships,
        removeRelationships: complete.removeRelationships,
      },
      complete,
    ],
  };
  return [success, clarification, stop];
}

export function overlapComparison(input: { directory: string; modality: 'text' | 'voice' }) {
  const version = (mode: 'sequential' | 'overlap'): ApplicationVersion => ({
    id: mode,
    directory: input.directory,
    commit: plan.applicationCommit,
    conversationWorkMode: mode,
  });
  return {
    baseline: version('sequential'),
    candidate: version('overlap'),
    plan: {
      ...plan,
      id: `${plan.id}-${input.modality}`,
      modality: input.modality,
    } as ComparisonPlan,
  };
}

/** Builds the concrete runner configuration from the common verified profiles.
 * The caller must supply the final clean evaluator identity and local evidence;
 * constructing this object starts no provider work and grants no authorization. */
export function overlapEvaluationPlan(input: {
  shared: Omit<
    EvaluationPlan,
    'applicationComparison' | 'scenarioSet' | 'repetitions' | 'followUps'
  >;
  applicationDirectory: string;
}): EvaluationPlan {
  return {
    ...input.shared,
    followUps: true,
    repetitions: [...plan.repetitions],
    scenarioSet: overlapScenarios(),
    applicationComparison: overlapComparison({
      directory: input.applicationDirectory,
      modality: input.shared.voice ? 'voice' : 'text',
    }),
  };
}

function distribution(values: (number | null | undefined)[]) {
  if (!values.length || values.some((value) => value == null || !Number.isFinite(value)))
    return null;
  const sorted = (values as number[]).toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    median,
    min: sorted[0],
    max: sorted.at(-1) as number,
    relativeRange: median > 0 ? ((sorted.at(-1) ?? 0) - sorted[0]) / median : null,
  };
}

/** Recheck the approved selection's complete source-specific waiting proof.
 * A matching reply name alone never certifies necessity or safe waiting. */
function approvedQuestion(parent: Attempt, step: ScenarioStep) {
  const reply = step.followUps?.find((item) => item.id === parent.followUpSelection?.selected);
  const matches = parent.followUpSelection?.candidates.filter((item) => !item.fixed.length);
  if (!reply || matches?.length !== 1 || matches[0].id !== reply.id) return false;
  const required = (parent.modality === 'voice' ? ['backend', 'voice'] : ['backend']).flatMap(
    (source) => [
      `${source}-follow-up`,
      `${source}-necessary`,
      `${source}-retention`,
      ...reply.waiting.requirements.map((_text, index) => `${source}-waiting-${index}`),
    ],
  );
  const evidence = matches[0].content;
  return (
    evidence?.length === required.length &&
    required.every(
      (id) => evidence.filter((item) => item.id === id && item.outcome === 'pass').length === 1,
    )
  );
}

/** Cancellation remains aborted in ordinary qualification. This report alone
 * assesses the separately declared Stop endpoint, retaining every raw attempt
 * and per-outcome cost. Extra work cannot be inferred from ordinary scope/work
 * calls or from cancellation; unknown attribution is explicit. */
export function compareOverlap(
  attempts: Attempt[],
  run: ComparisonRun,
  voiceUsage: ScenarioVoiceUsage[] = [],
  providerCalls: ProviderCall[] = [],
  separateSegment = false,
) {
  const rows = Object.entries(plan.outcomes).map(([scenario, outcome]) => {
    const versions = run.versions.map((version) => {
      const values = attempts.filter(
        (attempt) =>
          attempt.scenario === scenario &&
          attempt.applicationVersion === version.id &&
          attempt.profile === (run.voiceProfile?.id ?? run.profile.id) &&
          attempt.modality === run.plan.modality,
      );
      const repetitions = run.plan.repetitions.map((repetition) => {
        const selected = values.filter((attempt) => attempt.repetition === repetition);
        const scripted = outcome === 'early_stop';
        const scenarioDefinition = overlapScenarios().find((item) => item.id === scenario);
        const expectedSteps = scenarioDefinition?.steps ?? [];
        const qualification = summarizeProfile(
          selected,
          scenarioDefinition ? [scenarioDefinition] : [],
          run.voiceProfile?.id ?? run.profile.id,
          run.plan.modality,
          [repetition],
        );
        const ordered: Attempt[] = [];
        const verifiedQuestions: Attempt[] = [];
        let directSteps = 0;
        const correctnessValid = expectedSteps.every((step) => {
          const matches = selected.filter(
            (attempt) => attempt.step === step.id && !attempt.followUpFor,
          );
          if (matches.length !== 1) return false;
          const parent = matches[0];
          ordered.push(parent);
          if (scripted)
            return (
              parent.comparisonContract === run.contractId &&
              parent.applicationCommit === version.commit &&
              parent.outcome === 'aborted' &&
              parent.scriptedStop?.verdict === 'pass' &&
              parent.scriptedStop?.endpointMs !== null &&
              (run.plan.modality !== 'voice' || validVoiceStopEvidence(parent))
            );
          if (parent.outcome === 'pass') directSteps++;
          else {
            const completed = qualification.assistance.completedSteps.some(
              (item) => item.step === step.id,
            );
            const replies = selected.filter(
              (attempt) =>
                attempt.followUpFor === parent.step &&
                attempt.step === parent.followUpSelection?.selected,
            );
            if (!completed || !approvedQuestion(parent, step) || replies.length !== 1) return false;
            verifiedQuestions.push(parent);
            ordered.push(replies[0]);
          }
          return true;
        });
        const deliveryValid = ordered.every(
          (attempt) =>
            attempt.comparisonContract === run.contractId &&
            attempt.applicationCommit === version.commit &&
            (run.plan.modality === 'voice'
              ? validVoicePlayback(attempt)
              : attempt.timing?.contract === 'text-delivery-v2'),
        );
        const correctnessFailures = selected.filter(
          (attempt) =>
            attempt.scriptedStop?.verdict === 'fail' ||
            qualification.correctnessFailures.some((failure) => failure.step === attempt.step) ||
            (attempt.outcome === 'fail' && !verifiedQuestions.includes(attempt)),
        );
        const assistanceValid = selected.every(
          (attempt) =>
            !attempt.followUpFor || attempt.outcome === 'not_run' || ordered.includes(attempt),
        );
        const dialogTiming = scripted
          ? undefined
          : scriptedDialogTiming(ordered, verifiedQuestions);
        const valid =
          correctnessValid &&
          !correctnessFailures.length &&
          (scripted ||
            (qualification.fullCatalogQualified &&
              assistanceValid &&
              deliveryValid &&
              dialogTiming?.status === 'complete'));
        const endpointMs = valid
          ? scripted
            ? (ordered[0]?.scriptedStop?.endpointMs ?? null)
            : (dialogTiming?.endpointMs ?? null)
          : null;
        return {
          repetition,
          valid,
          completion: valid
            ? scripted
              ? 'stopped'
              : verifiedQuestions.length
                ? 'assisted'
                : 'direct'
            : null,
          directSteps,
          assistedSteps: verifiedQuestions.length,
          correctnessFailures,
          endpointMs,
          endpointBounds: valid
            ? scripted && endpointMs !== null
              ? (ordered[0]?.scriptedStop?.endpointBounds ??
                (run.plan.modality === 'text' ? { lower: endpointMs, upper: endpointMs } : null))
              : (dialogTiming?.applicationWaitMs ?? null)
            : null,
          dialogTiming,
          attempts: selected,
        };
      });
      const costs = (
        field: 'backendCostUsd' | 'judgeCostUsd' | 'voiceCostUsd' | 'playbackAssessmentCostUsd',
      ) =>
        values.length &&
        values.every((attempt) => attempt[field] !== null && attempt[field] !== undefined)
          ? values.reduce((sum, attempt) => sum + (attempt[field] ?? 0), 0)
          : null;
      const sessions = voiceUsage.filter(
        (entry) => entry.scenario === scenario && entry.applicationVersion === version.id,
      );
      const voiceCost =
        sessions.length === run.plan.repetitions.length &&
        sessions.every((entry) => entry.costUsd !== null)
          ? sessions.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0)
          : null;
      const workAccounting = values.flatMap((attempt) =>
        (attempt.diagnostics?.workResults ?? []).map((work) => {
          const matches = providerCalls.filter(
            (call) =>
              call.endedAt !== undefined &&
              ((work.providerRequestId !== null && work.providerRequestId === call.requestId) ||
                (work.responseId !== null && work.responseId === call.response?.id)),
          );
          const billing = matches.length === 1 ? matches[0] : undefined;
          return {
            repetition: attempt.repetition,
            step: attempt.step,
            ...work,
            billing: billing
              ? {
                  callId: billing.id,
                  profile: billing.profile,
                  costUsd: billing.costUsd,
                  reservationUsd: billing.reservationUsd,
                  outcome: billing.outcome,
                  usage: billing.response?.usage ?? null,
                }
              : null,
            billingLimitation: billing
              ? null
              : 'No unique terminal provider identity joins this work result to billing. Missing or canceled usage is unknown, never zero.',
          };
        }),
      );
      return {
        version: version.id,
        repetitions,
        timing: distribution(repetitions.map((item) => item.endpointMs)),
        completionTiming: {
          direct: distribution(
            repetitions
              .filter((item) => item.completion === 'direct')
              .map((item) => item.endpointMs),
          ),
          assisted: distribution(
            repetitions
              .filter((item) => item.completion === 'assisted')
              .map((item) => item.endpointMs),
          ),
        },
        timingBounds: {
          lower: distribution(repetitions.map((item) => item.endpointBounds?.lower)),
          upper: distribution(repetitions.map((item) => item.endpointBounds?.upper)),
        },
        costs: {
          backend: costs('backendCostUsd'),
          judge: costs('judgeCostUsd'),
          voice: run.plan.modality === 'text' ? 0 : voiceCost,
          recognition: run.plan.modality === 'text' ? 0 : costs('playbackAssessmentCostUsd'),
        },
        voiceSessions: sessions,
        workAccounting: {
          required: workAccounting.filter((work) => work.disposition === 'used'),
          unused: workAccounting.filter((work) => work.disposition === 'discarded'),
          unknown: workAccounting.filter(
            (work) => !['used', 'discarded'].includes(work.disposition),
          ),
          extra: null,
        },
        work: values.map((attempt) => ({
          repetition: attempt.repetition,
          step: attempt.step,
          results: attempt.diagnostics?.workResults ?? null,
          metrics: attempt.metrics ?? null,
          providerCalls: attempt.providerCalls ?? null,
        })),
        extraWorkAttribution: null,
        extraWorkLimitation:
          'Used work is required; discarded work is unused. Neither disposition alone proves speculative extra work. Compare actual same-endpoint counts and costs; unjoined billing and absent work observations stay unknown.',
      };
    });
    const [baseline, candidate] = versions;
    const maximumRatio =
      outcome === 'success'
        ? plan.targetMaximumRatio
        : outcome === 'early_stop'
          ? plan.stopMaximumRatio
          : plan.otherMaximumRatio;
    return {
      scenario,
      outcome,
      versions,
      maximumRatio,
      ratio:
        baseline.timing && candidate.timing && baseline.timing.median > 0
          ? candidate.timing.median / baseline.timing.median
          : null,
      ratioBounds:
        baseline.timingBounds.lower &&
        baseline.timingBounds.upper &&
        candidate.timingBounds.lower &&
        candidate.timingBounds.upper &&
        baseline.timingBounds.lower.median > 0 &&
        baseline.timingBounds.upper.median > 0
          ? {
              lower: candidate.timingBounds.lower.median / baseline.timingBounds.upper.median,
              upper: candidate.timingBounds.upper.median / baseline.timingBounds.lower.median,
            }
          : null,
    };
  });
  const failures = rows.flatMap((row) =>
    row.versions.flatMap((version) =>
      version.repetitions.flatMap((repetition) => repetition.correctnessFailures),
    ),
  );
  const incomplete =
    separateSegment ||
    rows.some(
      (row) =>
        row.ratio === null ||
        row.ratioBounds === null ||
        row.versions.some(
          (version) =>
            version.repetitions.some((repetition) => !repetition.valid) ||
            version.timing?.relativeRange == null ||
            version.timing.relativeRange > plan.maximumRelativeRange ||
            Object.values(version.costs).some((cost) => cost === null),
        ),
    );
  return {
    contract: 'overlap-outcomes-v1',
    comparisonContract: run.contractId,
    scope: separateSegment
      ? 'continuation segment only; complete comparison requires validated aggregation'
      : 'three declared scenarios only; no full-catalog qualification',
    model: run.profile.model,
    effort: run.profile.effort,
    modality: run.plan.modality,
    status: failures.length ? 'rejected' : incomplete ? 'inconclusive' : 'collected',
    waitDecision: failures.length
      ? 'rejected'
      : incomplete
        ? 'inconclusive'
        : rows.every((row) => row.ratioBounds !== null && row.ratioBounds.upper <= row.maximumRatio)
          ? 'thresholds_met'
          : rows.some((row) => row.ratioBounds !== null && row.ratioBounds.lower > row.maximumRatio)
            ? 'thresholds_failed'
            : 'inconclusive',
    rows,
    defaultDecision: 'retain sequential',
    productionDefaultChanged: false,
    accountingScope:
      'Outcome rows keep scenario work separate. Judge calibration, optional counting fees and shared outstanding holds remain in the single run ledger and are additional to these rows, never omitted from actual total spending.',
    decision:
      'Executed correctness, outcome-specific timing and actual cost must support a separately reviewed default change. Collected measurements alone do not authorize it.',
  };
}
