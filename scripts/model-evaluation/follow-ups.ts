import type {
  Attempt,
  Expected,
  JudgeInput,
  JudgeResult,
  Scenario,
  ScenarioStep,
} from './types.js';

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
  questionPending,
  sources,
  checkWaiting,
  judge,
}: {
  step: ScenarioStep;
  attempt: Attempt;
  questionPending: boolean;
  sources: JudgeInput['sources'];
  checkWaiting: (expected: Expected) => Promise<string[]>;
  judge?: (input: JudgeInput) => Promise<JudgeResult>;
}) {
  if (
    !step.followUps?.length ||
    attempt.outcome !== 'fail' ||
    (step.expected.saves ?? 0) !== 0 ||
    !questionPending ||
    !judge ||
    !attempt.content?.length ||
    attempt.content.some((item) => item.outcome !== 'pass') ||
    Object.values(sources).some((source) => !source.complete)
  )
    return undefined;

  const candidates: NonNullable<Attempt['followUpSelection']>['candidates'] = [];
  attempt.followUpSelection = { candidates, reason: 'No reply selected.' };
  for (const reply of step.followUps) {
    if ((reply.waiting.saves ?? 0) !== 0) throw new Error('evaluation_follow_up_save_not_allowed');
    const fixed = await checkWaiting(reply.waiting);
    if (fixed.length) {
      candidates.push({ id: reply.id, fixed });
      continue;
    }
    const requirements = Object.keys(sources).map((source) => ({
      id: `${source}-follow-up`,
      source: source as 'backend' | 'voice',
      text: reply.when,
    }));
    let content: JudgeResult;
    try {
      content = await judge({
        context:
          'Select a catalog reply only when its question is explicitly asked. This selection does not decide whether the question was necessary or change any original verdict.',
        sources,
        requirements,
      });
    } catch (error) {
      attempt.followUpSelection.reason = `Reply selection failed: ${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    }
    // Unknown, missing, duplicate or additional verdicts never select a reply.
    const complete =
      content.length === requirements.length &&
      requirements.every(
        (requirement) =>
          content.filter((item) => item.id === requirement.id && item.outcome === 'pass').length ===
          1,
      );
    candidates.push({ id: reply.id, fixed, content });
    if (!complete) fixed.push('follow_up_question_not_matched');
  }
  const matched = candidates.filter((candidate) => !candidate.fixed.length);
  const selected = matched.length === 1 ? matched[0].id : undefined;
  attempt.followUpSelection = {
    selected,
    candidates,
    reason: selected
      ? 'One safe waiting state and explicit question matched.'
      : 'No unique verified question and safe waiting state matched.',
  };
  return step.followUps.find((reply) => reply.id === selected);
}
