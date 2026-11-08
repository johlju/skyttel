import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicEvaluationText } from './public-output.js';
import { type Attempt, type ScenarioGroup, scenarioGroups } from './types.js';

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
/** Raw verdicts are immutable; behavioral qualification always names its scope. */
export function summarizeProfile(
  attempts: Attempt[],
  scenarios: { id: string; group?: ScenarioGroup; steps: { id: string }[] }[],
  profile: string,
  modality: 'text' | 'voice',
  repetitions: number[],
) {
  const values = attempts.filter(
    (attempt) => attempt.profile === profile && attempt.modality === modality,
  );
  const baseValues = values.filter((attempt) => !attempt.followUpFor);
  const followUps = values.filter((attempt) => attempt.followUpFor);
  const assessed = (attempt: Attempt, kind: NonNullable<Attempt['assessment']>['kind']) =>
    attempt.outcome === 'fail' &&
    attempt.assessment?.kind === kind &&
    Boolean(attempt.assessment.reason.trim()) &&
    !attempt.assessment.stateFailures.length &&
    attempt.assessment.evidence.length > 0 &&
    attempt.assessment.evidence.every((item) => item.outcome === 'pass');
  const repliesFor = (attempt: Attempt) =>
    followUps.filter(
      (reply) =>
        reply.scenario === attempt.scenario &&
        reply.repetition === attempt.repetition &&
        reply.followUpFor === attempt.step &&
        reply.step === attempt.followUpSelection?.selected,
    );
  const completedReply = (attempt: Attempt) => {
    if (!assessed(attempt, 'necessary_clarification') || !attempt.followUpSelection?.selected)
      return undefined;
    const matches = repliesFor(attempt);
    return matches.length === 1 &&
      matches[0].outcome === 'pass' &&
      matches[0].assistedElapsedMs != null
      ? matches[0]
      : undefined;
  };
  const completionTime = (attempt: Attempt) =>
    attempt.outcome === 'pass'
      ? attempt.elapsedMs
      : (completedReply(attempt)?.assistedElapsedMs ?? null);
  const plannedValues = values.filter(
    (attempt) =>
      repetitions.includes(attempt.repetition) &&
      scenarios.some(
        (scenario) =>
          scenario.id === attempt.scenario &&
          scenario.steps.some((step) => step.id === (attempt.followUpFor ?? attempt.step)),
      ),
  );
  const unresolvedAssessments: Pick<Attempt, 'scenario' | 'step' | 'repetition'>[] = [];
  function unresolved({ scenario, step, repetition }: (typeof unresolvedAssessments)[number]) {
    if (
      !unresolvedAssessments.some(
        (item) =>
          item.scenario === scenario && item.step === step && item.repetition === repetition,
      )
    )
      unresolvedAssessments.push({ scenario, step, repetition });
  }
  for (const attempt of plannedValues) {
    const required =
      !attempt.followUpFor ||
      plannedValues.some(
        (parent) =>
          !parent.followUpFor &&
          parent.scenario === attempt.scenario &&
          parent.repetition === attempt.repetition &&
          parent.step === attempt.followUpFor &&
          parent.followUpSelection?.selected === attempt.step,
      );
    if (
      attempt.assessment?.kind === 'inconclusive' ||
      ['inconclusive', 'error', 'aborted'].includes(attempt.outcome) ||
      (required && attempt.outcome === 'not_run')
    )
      unresolved(attempt);
  }
  for (const scenario of scenarios)
    for (const repetition of repetitions)
      for (const step of scenario.steps) {
        const matches = baseValues.filter(
          (attempt) =>
            attempt.scenario === scenario.id &&
            attempt.step === step.id &&
            attempt.repetition === repetition,
        );
        if (matches.length !== 1) {
          unresolved({ scenario: scenario.id, step: step.id, repetition });
        } else if (assessed(matches[0], 'necessary_clarification')) {
          const replies = repliesFor(matches[0]);
          const safeInability =
            (scenario.group ?? 'everyday') !== 'everyday' &&
            replies.length === 1 &&
            assessed(replies[0], 'safe_inability');
          if (!completedReply(matches[0]) && !safeInability)
            unresolved({
              scenario: scenario.id,
              step: matches[0].followUpSelection?.selected ?? step.id,
              repetition,
            });
        }
      }
  const correctnessFailures = plannedValues
    .filter((attempt) => {
      const hardFailure = attempt.fixed.some(
        (failure) =>
          ['unrequested_save_attempt', 'save_receipts_history', 'saved_map_changed'].includes(
            failure,
          ) || failure.startsWith('changed_type_'),
      );
      const group =
        scenarios.find((scenario) => scenario.id === attempt.scenario)?.group ?? 'everyday';
      return (
        hardFailure ||
        (attempt.outcome === 'fail' &&
          !(
            attempt.assessment?.kind === 'inconclusive' &&
            attempt.assessment.stateFailures.every(
              (failure) => failure === 'unfinished_instructions',
            )
          ) &&
          !assessed(attempt, 'necessary_clarification') &&
          !(group !== 'everyday' && assessed(attempt, 'safe_inability')))
      );
    })
    .map(({ scenario, step, repetition }) => ({ scenario, step, repetition }));
  function summarizeGroup(group: ScenarioGroup) {
    const selected = scenarios.filter((scenario) => (scenario.group ?? 'everyday') === group);
    const groupIds = new Set(selected.map((scenario) => scenario.id));
    const groupValues = baseValues.filter((attempt) => groupIds.has(attempt.scenario));
    const scenarioTimes: { scenario: string; medianMs: number; minMs: number; maxMs: number }[] =
      [];
    const totals: number[] = [];
    let qualified = repetitions.length > 0 && selected.length > 0;
    let completedScenarios = 0;
    for (const scenario of selected) {
      const times: number[] = [];
      for (const repetition of repetitions) {
        const steps = scenario.steps.map((step) =>
          groupValues.filter(
            (attempt) =>
              attempt.scenario === scenario.id &&
              attempt.step === step.id &&
              attempt.repetition === repetition,
          ),
        );
        if (
          !scenario.steps.length ||
          steps.some((matches) => matches.length !== 1 || completionTime(matches[0]) === null)
        ) {
          qualified = false;
          continue;
        }
        const time = steps.reduce((sum, matches) => sum + (completionTime(matches[0]) ?? 0), 0);
        times.push(time);
        const index = repetitions.indexOf(repetition);
        totals[index] = (totals[index] ?? 0) + time;
      }
      if (times.length === repetitions.length && repetitions.length) {
        completedScenarios++;
        scenarioTimes.push({
          scenario: scenario.id,
          medianMs: median(times),
          minMs: Math.min(...times),
          maxMs: Math.max(...times),
        });
      }
    }
    return {
      qualified,
      selectedScenarios: selected.length,
      completedScenarios,
      safeInabilities:
        group === 'everyday'
          ? 0
          : plannedValues.filter(
              (attempt) => groupIds.has(attempt.scenario) && assessed(attempt, 'safe_inability'),
            ).length,
      correctnessFailures: correctnessFailures.filter((failure) => groupIds.has(failure.scenario)),
      scenarioTimes,
      totals,
      meanScenarioMedianMs:
        qualified && scenarioTimes.length
          ? scenarioTimes.reduce((sum, item) => sum + item.medianMs, 0) / scenarioTimes.length
          : null,
      outcomes: outcomeCounts(groupValues),
      directSteps: groupValues.filter((attempt) => attempt.outcome === 'pass').length,
      assistedSteps: groupValues.filter((attempt) => completedReply(attempt)).length,
      unresolvedAssessments: unresolvedAssessments.filter((attempt) =>
        groupIds.has(attempt.scenario),
      ),
      backendCostUsd: totalCost(
        values.filter((attempt) => groupIds.has(attempt.scenario)),
        'backendCostUsd',
      ),
      judgeCostUsd: totalCost(
        values.filter((attempt) => groupIds.has(attempt.scenario)),
        'judgeCostUsd',
      ),
      voiceCostUsd: totalCost(
        values.filter((attempt) => groupIds.has(attempt.scenario)),
        'voiceCostUsd',
      ),
    };
  }
  const groups = Object.fromEntries(
    scenarioGroups.map((group) => [group, summarizeGroup(group)]),
  ) as Record<ScenarioGroup, ReturnType<typeof summarizeGroup>>;
  const rawQualified =
    repetitions.length > 0 &&
    scenarios.length > 0 &&
    scenarios.every(
      (scenario) =>
        scenario.steps.length > 0 &&
        repetitions.every((repetition) =>
          scenario.steps.every((step) => {
            const matches = baseValues.filter(
              (attempt) =>
                attempt.scenario === scenario.id &&
                attempt.step === step.id &&
                attempt.repetition === repetition,
            );
            return (
              matches.length === 1 && matches[0].outcome === 'pass' && matches[0].elapsedMs !== null
            );
          }),
        ),
    );
  const finalQualified =
    groups.everyday.qualified && !correctnessFailures.length && !unresolvedAssessments.length;
  const assistedCompletions = baseValues.filter((attempt) => completedReply(attempt));
  return {
    profile,
    modality,
    qualified: rawQualified,
    finalQualified,
    qualificationScope: 'everyday' as const,
    fullCatalogQualified:
      !correctnessFailures.length &&
      !unresolvedAssessments.length &&
      Object.values(groups)
        .filter((group) => group.selectedScenarios)
        .every((group) => group.qualified) &&
      scenarios.length > 0,
    groups,
    correctnessFailures,
    unresolvedAssessments,
    assistance: {
      replies: followUps.filter((attempt) => attempt.outcome !== 'not_run').length,
      completedSteps: assistedCompletions.map((attempt) => {
        const reply = completedReply(attempt);
        return {
          scenario: attempt.scenario,
          step: attempt.step,
          repetition: attempt.repetition,
          elapsedMs: reply?.assistedElapsedMs ?? null,
          additionalCalls: reply?.providerCalls ?? null,
          backendCostUsd: reply ? totalCost([attempt, reply], 'backendCostUsd') : null,
          additionalBackendCostUsd: reply?.backendCostUsd ?? null,
          judgeCostUsd: reply ? totalCost([attempt, reply], 'judgeCostUsd') : null,
          voiceCostUsd: reply ? totalCost([attempt, reply], 'voiceCostUsd') : null,
        };
      }),
      outcomes: outcomeCounts(followUps),
      interpretation:
        'Original outcomes remain unchanged. Only evidence-backed necessary clarification followed by verified completion qualifies as assisted completion.',
    },
    meanScenarioMedianMs: finalQualified ? groups.everyday.meanScenarioMedianMs : null,
    totals: groups.everyday.totals,
    scenarioTimes: groups.everyday.scenarioTimes,
    outcomes: outcomeCounts(baseValues),
    backendCostUsd: totalCost(values, 'backendCostUsd'),
    judgeCostUsd: totalCost(values, 'judgeCostUsd'),
    voiceCostUsd: totalCost(values, 'voiceCostUsd'),
  };
}
function outcomeCounts(values: Attempt[]) {
  return Object.fromEntries(
    ['pass', 'fail', 'inconclusive', 'error', 'aborted', 'not_run'].map((outcome) => [
      outcome,
      values.filter((attempt) => attempt.outcome === outcome).length,
    ]),
  );
}
function totalCost(values: Attempt[], key: 'backendCostUsd' | 'judgeCostUsd' | 'voiceCostUsd') {
  return values.length && values.every((attempt) => attempt[key] != null)
    ? values.reduce((sum, attempt) => sum + (attempt[key] ?? 0), 0)
    : null;
}
export function compareProfiles(reference: ProfileSummary, candidate: ProfileSummary) {
  const scenarios = (summary: ProfileSummary) =>
    summary.scenarioTimes
      .map((item) => item.scenario)
      .sort()
      .join('\n');
  if (reference.qualificationScope !== candidate.qualificationScope)
    return {
      label: 'Ej jämförbart',
      recommendation: 'Otillräckligt underlag för ett modellbyte.',
      limitations: 'Olika kvalificeringsomfattning eller scenarier.',
    };
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
  if (scenarios(reference) !== scenarios(candidate))
    return {
      label: 'Ej jämförbart',
      recommendation: 'Otillräckligt underlag för ett modellbyte.',
      limitations: 'Olika scenarier i tidsunderlaget.',
    };
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
  const referenceCost =
    reference.qualificationScope === 'everyday'
      ? (reference.groups?.everyday.backendCostUsd ?? null)
      : reference.backendCostUsd;
  const candidateCost =
    candidate.qualificationScope === 'everyday'
      ? (candidate.groups?.everyday.backendCostUsd ?? null)
      : candidate.backendCostUsd;
  const label = deltaMs < 0 ? '🔴 Röd: sämre' : faster ? '🟢 Grön: snabbare' : 'Oförändrat';
  return {
    label,
    deltaSeconds: deltaMs / 1000,
    percent,
    consistent,
    faster,
    recommendation: `Båda modellerna uppfyller kraven${candidate.qualificationScope === 'everyday' ? ' för vardaglig användning' : ''}. Bedöm redovisad svarstid och kostnad innan modellval.`,
    costDifferenceUsd:
      referenceCost !== null && candidateCost !== null ? candidateCost - referenceCost : null,
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

type ScopeField =
  | 'assistance'
  | 'qualificationScope'
  | 'fullCatalogQualified'
  | 'groups'
  | 'correctnessFailures'
  | 'unresolvedAssessments'
  | 'judgeCostUsd'
  | 'voiceCostUsd';
type ProfileSummary = Omit<ReturnType<typeof summarizeProfile>, ScopeField> &
  Partial<Pick<ReturnType<typeof summarizeProfile>, ScopeField>>;
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
              {
                ...reference.summary,
                finalQualified: reference.summary.qualificationScope
                  ? reference.summary.finalQualified
                  : reference.summary.qualified,
              },
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
