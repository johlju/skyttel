import { retainedWorkRequirement } from './retained-work.js';
import type {
  Attempt,
  Expected,
  FollowUp,
  JudgeInput,
  JudgeResult,
  Scenario,
  ScenarioStep,
} from './types.js';

export type ScenarioExchange = {
  step: ScenarioStep;
  parent?: string;
  target?: ScenarioStep;
  /** Authenticated requests belonging to the target and its clarifications. */
  requestIds?: string[];
  startedAt?: number;
  previousResponseEndAt?: number;
  evaluationOverheadMs?: number;
};

/** Exclude harness gaps using each modality's measured submission and completion. */
export function assistedExchangeTiming(
  exchange: ScenarioExchange,
  {
    submittedAt,
    completedAt,
    outcome,
  }: { submittedAt: number; completedAt: number | undefined; outcome: Attempt['outcome'] },
): Pick<Attempt, 'assistedWallElapsedMs' | 'assistedEvaluationOverheadMs' | 'assistedElapsedMs'> {
  if (exchange.startedAt === undefined) return {};
  const wallElapsedMs = completedAt === undefined ? undefined : completedAt - exchange.startedAt;
  const evaluationOverheadMs =
    (exchange.evaluationOverheadMs ?? 0) +
    Math.max(0, submittedAt - (exchange.previousResponseEndAt ?? submittedAt));
  return {
    assistedWallElapsedMs: wallElapsedMs,
    assistedEvaluationOverheadMs: evaluationOverheadMs,
    assistedElapsedMs:
      outcome === 'pass' && wallElapsedMs !== undefined
        ? wallElapsedMs - evaluationOverheadMs
        : null,
  };
}

/** Continued work has its own safe-state contract, separate from the parent's. */
export function followUpStep(parent: ScenarioStep, reply: FollowUp): ScenarioStep {
  const retained = reply.safeInability?.preservedRequests;
  return {
    id: reply.id,
    text: reply.text,
    expected: { requirements: reply.requirements },
    ...(reply.safeInability
      ? {
          safeInability: {
            ...reply.safeInability,
            preservedRequests: retained?.length
              ? [...new Set([...(parent.text ? [parent.text] : []), ...retained])]
              : [],
          },
        }
      : {}),
  };
}

/** Catalog replies are optional inputs, never replacement verdicts or retries. */
export function scenarioUtterances(scenario: Scenario, followUps = false) {
  const ids = scenario.steps.flatMap((step) => [
    step.id,
    ...(step.followUps ?? []).map((reply) => reply.id),
  ]);
  if (new Set(ids).size !== ids.length) throw new Error('evaluation_duplicate_step_ids');
  return scenario.steps.flatMap((step) => [
    ...(!step.transition && step.text ? [{ id: step.id, text: step.text }] : []),
    ...(followUps ? (step.followUps ?? []).map(({ id, text }) => ({ id, text })) : []),
  ]);
}

export async function selectFollowUp({
  step,
  attempt,
  stateFailures,
  questionPending,
  sources,
  checkWaiting,
  waitingContext,
  judge,
  repliesEnabled = true,
}: {
  step: ScenarioStep;
  attempt: Attempt;
  stateFailures: string[];
  questionPending: boolean;
  sources: JudgeInput['sources'];
  checkWaiting: (expected: Expected) => Promise<string[]>;
  waitingContext?: () => string;
  judge?: (input: JudgeInput) => Promise<JudgeResult>;
  repliesEnabled?: boolean;
}) {
  if (
    (!step.followUps?.length && !step.clarification) ||
    !['pass', 'fail'].includes(attempt.outcome) ||
    (attempt.outcome === 'pass' && !step.clarification) ||
    !questionPending
  )
    return undefined;

  // A passing waiting-state contract is still an unanswered request. Keep
  // the raw verdict and observed response boundary, never successful timing.
  if (attempt.outcome === 'pass') {
    attempt.elapsedMs = null;
    if (attempt.timing) attempt.timing.successfulCompletionMs = null;
    if (attempt.assistedElapsedMs !== undefined) attempt.assistedElapsedMs = null;
    attempt.assessment = {
      kind: 'inconclusive',
      reason:
        'A pending question requires a verified safe waiting contract and retained unfinished meaning.',
      stateFailures: [],
      evidence: [],
    };
  }
  if (
    attempt.fixed.some((failure) => !stateFailures.includes(failure)) ||
    !judge ||
    !attempt.content?.length ||
    Object.values(sources).some((source) => !source.complete)
  )
    return undefined;

  const candidates: NonNullable<Attempt['followUpSelection']>['candidates'] = [];
  const matched: typeof candidates = [];
  let originalRequestLost = false;
  let verifiedQuestions: {
    id: string;
    kind: 'necessary_clarification' | 'unnecessary_clarification';
    evidence: JudgeResult;
    waiting: Expected;
    fixed: string[];
  }[] = [];
  const waitingContracts = [
    ...(step.clarification
      ? [{ id: `${step.id}:clarification`, waiting: step.clarification, reply: undefined }]
      : []),
    ...(step.followUps ?? []).map((reply) => ({ id: reply.id, waiting: reply.waiting, reply })),
  ];
  attempt.followUpSelection = { candidates, reason: 'No reply selected.' };
  for (const { id, waiting, reply } of waitingContracts) {
    if ((waiting.saves ?? 0) !== 0) throw new Error('evaluation_follow_up_save_not_allowed');
    // A separate waiting contract must verify the clarification and independent
    // work when the original completion requirements cannot yet be satisfied.
    if (
      (!reply && !waiting.requirements.length) ||
      (!waiting.requirements.length &&
        ((step.expected.saves ?? 0) !== 0 ||
          attempt.content.some((item) => item.outcome !== 'pass'))) ||
      !waitingContext
    ) {
      candidates.push({ id, fixed: ['follow_up_waiting_contract_missing'] });
      continue;
    }
    const retained = {
      ...waiting,
      preservedRequests: [
        ...new Set([...(waiting.preservedRequests ?? []), ...(step.text ? [step.text] : [])]),
      ],
    };
    const fixed = await checkWaiting(retained);
    if (!retained.preservedRequests.length) fixed.push('unfinished_instructions');
    if (
      !reply &&
      step.text &&
      waiting.preservedRequests?.includes(step.text) &&
      fixed.includes('unfinished_instructions')
    )
      originalRequestLost = true;
    if (!reply && (!step.text || !waiting.preservedRequests?.includes(step.text)))
      fixed.push('unfinished_instructions');
    if (fixed.length) {
      candidates.push({ id, fixed });
      continue;
    }
    const requirements = Object.keys(sources).flatMap((source) => [
      ...(reply && repliesEnabled
        ? [{ id: `${source}-follow-up`, source: source as 'backend' | 'voice', text: reply.when }]
        : []),
      {
        id: `${source}-necessary`,
        source: source as 'backend' | 'voice',
        text: 'The extra question is necessary and relevant because safe continuation needs a missing choice, fact or permission that the current request, recognized input and available facts do not determine. This includes permission for a relevant alternative when the requested representation is unavailable. A matching or missing scripted reply alone does not establish necessity; asking again about an already unambiguous action or target is unnecessary.',
      },
      {
        id: `${source}-retention`,
        source: source as 'backend' | 'voice',
        text: retainedWorkRequirement,
      },
      ...waiting.requirements.map((text, index) => ({
        id: `${source}-waiting-${index}`,
        source: source as 'backend' | 'voice',
        text,
      })),
    ]);
    let content: JudgeResult;
    try {
      content = await judge({
        context:
          'Assess the explicit question, its necessity and the complete safe waiting contract independently of whether a scripted reply matches. Preserve all original verdicts.\n' +
          (waitingContext?.() ?? ''),
        sources,
        requirements,
      });
    } catch (error) {
      attempt.followUpSelection.reason = `Reply selection failed: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    }
    // Unknown, missing, duplicate or additional verdicts never select a reply.
    const wellFormed =
      content.length === requirements.length &&
      requirements.every(
        (requirement) => content.filter((item) => item.id === requirement.id).length === 1,
      );
    if (
      wellFormed &&
      content.some((item) => item.id.endsWith('-retention') && item.outcome === 'fail')
    ) {
      originalRequestLost = true;
      fixed.push('unfinished_instructions');
    }
    const unnecessary =
      wellFormed &&
      content.some((item) => item.id.endsWith('-necessary') && item.outcome === 'fail') &&
      content
        .filter((item) => !item.id.endsWith('-necessary') && !item.id.endsWith('-follow-up'))
        .every((item) => item.outcome === 'pass');
    const questionEvidence = content.filter((item) => !item.id.endsWith('-follow-up'));
    const necessary = wellFormed && questionEvidence.every((item) => item.outcome === 'pass');
    const complete = wellFormed && content.every((item) => item.outcome === 'pass');
    const candidate = { id, fixed, content };
    candidates.push(candidate);
    if (necessary || unnecessary)
      verifiedQuestions.push({
        id,
        kind: necessary ? 'necessary_clarification' : 'unnecessary_clarification',
        evidence: questionEvidence,
        waiting: retained,
        fixed,
      });
    if (reply && repliesEnabled && complete) matched.push(candidate);
    if (!complete)
      fixed.push(unnecessary ? 'unnecessary_question' : 'follow_up_question_not_matched');
  }
  const selected = matched.length === 1 ? matched[0].id : undefined;
  // Without a unique supported reply, a safe map and relevant question alone
  // cannot establish correctness: the active original request must survive.
  if (!selected) {
    const retainedQuestions: typeof verifiedQuestions = [];
    for (const question of verifiedQuestions) {
      const failures = step.text
        ? await checkWaiting({
            ...question.waiting,
            preservedRequests: [
              ...new Set([...(question.waiting.preservedRequests ?? []), step.text]),
            ],
          })
        : ['unfinished_instructions'];
      if (failures.length) question.fixed.push(...failures);
      else retainedQuestions.push(question);
    }
    verifiedQuestions = retainedQuestions;
  }
  attempt.followUpSelection = {
    selected,
    candidates,
    reason: selected
      ? 'One safe waiting state and explicit question matched.'
      : verifiedQuestions.some((question) => question.kind === 'necessary_clarification')
        ? 'A necessary safe question is verified, but no unique enabled scripted reply matched; continuation is untested.'
        : 'No unique verified question and safe waiting state matched.',
  };
  const assessment =
    verifiedQuestions.find((question) => question.id === selected) ??
    verifiedQuestions.find((question) => question.kind === 'necessary_clarification') ??
    verifiedQuestions.find((question) => question.kind === 'unnecessary_clarification');
  if (assessment) {
    attempt.assessment = {
      kind: assessment.kind,
      reason: assessment.evidence
        .filter((item) => item.id.endsWith('-necessary'))
        .map((item) => item.reason)
        .join(' '),
      stateFailures: [],
      evidence: assessment.evidence,
    };
  } else if (originalRequestLost) {
    attempt.assessment = {
      kind: 'correctness_failure',
      reason:
        'The declared waiting state does not retain the unfinished request meaning and constraints.',
      stateFailures: ['unfinished_instructions'],
      evidence: [],
    };
  }
  return step.followUps?.find((reply) => reply.id === selected);
}
