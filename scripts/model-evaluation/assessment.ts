import { retainedWorkRequirement } from './retained-work.js';
import type {
  Attempt,
  Expected,
  JudgeInput,
  JudgeResult,
  Scenario,
  ScenarioStep,
} from './types.js';

/** Assess an explicit advanced limit without replacing the automated verdict. */
export async function assessInability({
  scenario,
  step,
  attempt,
  sources,
  check,
  context,
  judge,
}: {
  scenario: Scenario;
  step: ScenarioStep;
  attempt: Attempt;
  sources: JudgeInput['sources'];
  check: (expected: Expected) => Promise<string[]>;
  context: () => string;
  judge?: (input: JudgeInput) => Promise<JudgeResult>;
}) {
  if (
    !scenario.group ||
    scenario.group === 'everyday' ||
    !step.safeInability ||
    attempt.outcome !== 'fail' ||
    attempt.assessment !== undefined ||
    attempt.fixed.some(
      (failure) =>
        !['effective_objects', 'effective_relationships', 'new_types', 'save_incomplete'].includes(
          failure,
        ),
    )
  )
    return;
  const expected = {
    ...step.safeInability,
    preservedRequests: step.safeInability.preservedRequests ?? (step.text ? [step.text] : []),
  };
  const stateFailures = await check(expected);
  if (!expected.preservedRequests.length) stateFailures.push('unfinished_instructions');
  const requirements = Object.keys(sources).flatMap((source) => [
    ...[
      'Explain the capability limit, preserve all unfinished meaning and constraints, and identify the work that remains. Do not claim completion or invent facts. A failed completion requirement is not permission to ignore a correctness failure.',
      ...expected.requirements,
    ].map((text, index) => ({
      id: `${source}-inability-${index}`,
      source: source as 'backend' | 'voice',
      text,
    })),
    {
      id: `${source}-retention`,
      source: source as 'backend' | 'voice',
      text: retainedWorkRequirement,
    },
  ]);
  let evidence: JudgeResult = [];
  let assessmentFailed = false;
  if (!stateFailures.length && judge && Object.values(sources).every((source) => source.complete)) {
    try {
      evidence = await judge({
        context: `${context()}\nOriginal automated outcome: ${JSON.stringify({ outcome: attempt.outcome, fixed: attempt.fixed, content: attempt.content })}`,
        sources,
        requirements,
      });
    } catch {
      // The provider's budget/unknown-charge stop stays authoritative. The
      // optional assessment must not rewrite the application's raw verdict.
      assessmentFailed = true;
    }
  }
  const verified =
    !stateFailures.length &&
    requirements.length > 0 &&
    evidence.length === requirements.length &&
    requirements.every(
      (requirement) =>
        evidence.filter((item) => item.id === requirement.id && item.outcome === 'pass').length ===
        1,
    );
  if (
    evidence.length === requirements.length &&
    requirements.every(
      (requirement) => evidence.filter((item) => item.id === requirement.id).length === 1,
    ) &&
    evidence.some((item) => item.id.endsWith('-retention') && item.outcome === 'fail')
  )
    stateFailures.push('unfinished_instructions');
  attempt.assessment = {
    kind: verified ? 'safe_inability' : 'inconclusive',
    stateFailures,
    evidence,
    reason: verified
      ? evidence.map((item) => item.reason).join(' ')
      : assessmentFailed
        ? 'Optional assessment failed; the original automated outcome is preserved and existing run-stop/accounting rules still apply.'
        : 'The declared safe state, unfinished meaning or explanation could not all be verified. Historical transcript presence alone is insufficient.',
  };
}
