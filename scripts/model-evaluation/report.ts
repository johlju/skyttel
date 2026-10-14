import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicEvaluationText } from './public-output.js';
import type { Attempt } from './types.js';

export type RecordType =
  | 'manifest'
  | 'local_verification'
  | 'judge_control'
  | 'attempt'
  | 'diagnostic'
  | 'comparison'
  | 'recommendation';
export function evaluationReporter(directory: string, issue: number) {
  if (!Number.isSafeInteger(issue) || issue <= 0) throw new Error('evaluation_run_issue_required');
  let sequence = 0;
  return async (type: RecordType, title: string, data: unknown, prose = '') => {
    await mkdir(directory, { recursive: true });
    const record = { format: 'skyttel-model-evaluation', version: 1, issue, type, data };
    const json = publicEvaluationText(JSON.stringify(record, null, 2));
    const stem = `${String(++sequence).padStart(4, '0')}-${type}`;
    await writeFile(join(directory, `${stem}.json`), `${json}\n`, { flag: 'wx' });
    await writeFile(
      join(directory, `${stem}.md`),
      publicEvaluationText(
        `## ${title}\n\n${prose ? `${prose}\n\n` : ''}\`\`\`json\n${json}\n\`\`\`\n`,
      ),
      { flag: 'wx' },
    );
    return join(directory, `${stem}.md`);
  };
}

const median = (numbers: number[]) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
};
/** Scenario medians have equal weight; repetitions retain their own summed
 * times. A missing or unsuccessful attempt has no successful completion time. */
export function summarizeProfile(
  attempts: Attempt[],
  scenarios: { id: string; steps: { id: string }[] }[],
  profile: string,
  modality: 'text' | 'voice',
  repetitions: number[],
) {
  const values = attempts.filter(
    (attempt) => attempt.profile === profile && attempt.modality === modality,
  );
  const baseValues = values.filter((attempt) => !attempt.followUpFor);
  const followUps = values.filter((attempt) => attempt.followUpFor);
  const assistedCompletions = baseValues.filter(
    (attempt) =>
      attempt.outcome === 'fail' &&
      attempt.followUpSelection?.selected &&
      followUps.some(
        (reply) =>
          reply.scenario === attempt.scenario &&
          reply.repetition === attempt.repetition &&
          reply.followUpFor === attempt.step &&
          reply.step === attempt.followUpSelection?.selected &&
          reply.outcome === 'pass',
      ),
  );
  const totals: number[] = [];
  const scenarioTimes: { scenario: string; medianMs: number; minMs: number; maxMs: number }[] = [];
  let qualified = repetitions.length > 0 && scenarios.length > 0;
  for (const scenario of scenarios) {
    const times: number[] = [];
    for (const repetition of repetitions) {
      const steps = scenario.steps.map((step) =>
        values.filter(
          (attempt) =>
            attempt.scenario === scenario.id &&
            attempt.step === step.id &&
            attempt.repetition === repetition,
        ),
      );
      if (
        steps.some(
          (matches) =>
            matches.length !== 1 || matches[0].outcome !== 'pass' || matches[0].elapsedMs === null,
        )
      ) {
        qualified = false;
        continue;
      }
      const time = steps.reduce((sum, matches) => sum + (matches[0].elapsedMs ?? 0), 0);
      times.push(time);
      const index = repetitions.indexOf(repetition);
      totals[index] = (totals[index] ?? 0) + time;
    }
    if (times.length === repetitions.length)
      scenarioTimes.push({
        scenario: scenario.id,
        medianMs: median(times),
        minMs: Math.min(...times),
        maxMs: Math.max(...times),
      });
  }
  return {
    profile,
    modality,
    qualified,
    finalQualified: qualified,
    assistance: {
      replies: followUps.filter((attempt) => attempt.outcome !== 'not_run').length,
      completedSteps: assistedCompletions.map(({ scenario, step, repetition }) => ({
        scenario,
        step,
        repetition,
      })),
      outcomes: Object.fromEntries(
        ['pass', 'fail', 'inconclusive', 'error', 'aborted', 'not_run'].map((outcome) => [
          outcome,
          followUps.filter((attempt) => attempt.outcome === outcome).length,
        ]),
      ),
      interpretation:
        'Assisted completion preserves the original verdict; review whether each extra question was necessary before qualification.',
    },
    meanScenarioMedianMs:
      qualified && scenarioTimes.length
        ? scenarioTimes.reduce((sum, item) => sum + item.medianMs, 0) / scenarioTimes.length
        : null,
    totals,
    scenarioTimes,
    outcomes: Object.fromEntries(
      ['pass', 'fail', 'inconclusive', 'error', 'aborted', 'not_run'].map((outcome) => [
        outcome,
        baseValues.filter((attempt) => attempt.outcome === outcome).length,
      ]),
    ),
    backendCostUsd: values.every((attempt) => attempt.backendCostUsd !== null)
      ? values.reduce((sum, attempt) => sum + (attempt.backendCostUsd ?? 0), 0)
      : null,
  };
}
export function compareProfiles(reference: ProfileSummary, candidate: ProfileSummary) {
  if (!reference.finalQualified && reference.outcomes.fail > 0 && candidate.finalQualified)
    return {
      label: 'Ej jämförbart',
      recommendation:
        'Den kvalificerade kandidaten kan väljas för kravuppfyllelse; hastigheten kan inte jämföras med den underkända referensen.',
    };
  if (
    !reference.finalQualified ||
    !candidate.finalQualified ||
    reference.meanScenarioMedianMs === null ||
    candidate.meanScenarioMedianMs === null
  )
    return { label: 'Ej jämförbart', recommendation: 'Otillräckligt underlag för ett modellbyte.' };
  if (reference.totals.length !== candidate.totals.length)
    return {
      label: 'Ej jämförbart',
      recommendation: 'Otillräckligt underlag för ett modellbyte.',
      limitations: 'Olika antal upprepningar: jämför tidsunderlag från samma upprepningsplan.',
    };
  const deltaMs = reference.meanScenarioMedianMs - candidate.meanScenarioMedianMs;
  const percent = (100 * deltaMs) / reference.meanScenarioMedianMs;
  const consistent = reference.totals.every((total, index) => candidate.totals[index] < total);
  const faster = deltaMs > 0;
  const label = deltaMs < 0 ? '🔴 Röd: sämre' : faster ? '🟢 Grön: snabbare' : 'Oförändrat';
  return {
    label,
    deltaSeconds: deltaMs / 1000,
    percent,
    consistent,
    faster,
    recommendation:
      'Båda modellerna uppfyller kraven. Bedöm redovisad svarstid och kostnad innan modellval.',
    costDifferenceUsd:
      reference.backendCostUsd !== null && candidate.backendCostUsd !== null
        ? candidate.backendCostUsd - reference.backendCostUsd
        : null,
    limitations:
      'Kvalificering ger ingen statistiskt säker rangordning; redovisa antalet upprepningar.',
    regressions: candidate.scenarioTimes.flatMap((item) => {
      const old = reference.scenarioTimes.find((value) => value.scenario === item.scenario);
      return old && item.medianMs > old.medianMs
        ? [{ scenario: item.scenario, deltaSeconds: (item.medianMs - old.medianMs) / 1000 }]
        : [];
    }),
  };
}

type ProfileSummary = Omit<ReturnType<typeof summarizeProfile>, 'assistance'> &
  Partial<Pick<ReturnType<typeof summarizeProfile>, 'assistance'>>;
export type RecordedReference = {
  issue: number;
  url: string;
  commit: string;
  catalogSha256: string;
  judgeSha256?: string;
  followUps?: boolean;
  summary: ProfileSummary;
};

/** Recorded references contribute to the same decision as current profiles,
 * without scheduling provider calls for the reference model. */
export function compareEvaluationProfiles(
  summaries: ProfileSummary[],
  references: RecordedReference[],
  current: {
    commit: string;
    catalogSha256: string;
    judgeSha256: string;
    followUps?: boolean;
    baselineProfiles: Partial<Record<'text' | 'voice', string>>;
  },
) {
  const comparisons = summaries.flatMap((candidate) => {
    const reference = summaries.find(
      (item) =>
        item.modality === candidate.modality &&
        item.profile === current.baselineProfiles[candidate.modality],
    );
    return reference && reference !== candidate
      ? [
          {
            reference: reference.profile,
            candidate: candidate.profile,
            baseline: true,
            ...compareProfiles(reference, candidate),
          },
        ]
      : [];
  });
  const historicalComparisons = references.flatMap((reference) =>
    summaries
      .filter((candidate) => candidate.modality === reference.summary.modality)
      .map((candidate) => ({
        reference: reference.summary.profile,
        referenceIssue: reference.issue,
        referenceUrl: reference.url,
        candidate: candidate.profile,
        baseline: reference.summary.profile === current.baselineProfiles[candidate.modality],
        ...(reference.commit === current.commit &&
        reference.catalogSha256 === current.catalogSha256 &&
        reference.judgeSha256 === current.judgeSha256 &&
        (reference.followUps ?? false) === (current.followUps ?? false)
          ? compareProfiles(
              { ...reference.summary, finalQualified: reference.summary.qualified },
              candidate,
            )
          : {
              label: 'Ej jämförbart',
              recommendation:
                'Ändrad eller okänd kod, katalog, bedömarkonfiguration eller följdsvarspolicy: bedöm skillnaderna innan jämförelse.',
              changed: {
                commit: reference.commit !== current.commit,
                catalog: reference.catalogSha256 !== current.catalogSha256,
                judge: reference.judgeSha256 !== current.judgeSha256,
                followUps: (reference.followUps ?? false) !== (current.followUps ?? false),
              },
            }),
      })),
  );
  const eligible = [...comparisons, ...historicalComparisons].filter(
    (item) =>
      item.baseline &&
      !('changed' in item) &&
      item.recommendation !== 'Otillräckligt underlag för ett modellbyte.',
  );
  const basis =
    eligible.find((item) => 'faster' in item && item.faster && item.consistent) ??
    eligible.find((item) => !('faster' in item)) ??
    eligible[0];
  return {
    comparisons,
    historicalComparisons,
    recommendation: basis?.recommendation ?? 'Otillräckligt underlag för ett modellbyte.',
    recommendationBasis: basis ?? null,
  };
}
