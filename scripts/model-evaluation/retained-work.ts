import type { PendingPart } from '../../src/shared/text-assistant.js';
import type { Attempt, Expected, JudgeInput, JudgeResult, NamedRelationship } from './types.js';

export const relationshipWordingRequirement =
  'Assess every observedState.expected.relationships entry with verbMeaning against the complete observed map. ' +
  'The chosen edge wording, its actual endpoints and direction must express that independently declared role. ' +
  'A different category or a natural verb phrase is valid; a reversed phrase must still express the same role. ' +
  'A neutral or unrelated phrase alone does not prove a login, contact, ownership or other specified role. ' +
  'Fixed endpoint checks do not establish this semantic fact. Judge the recorded state, never a success claim.';

/** Independent semantic obligation; structural pending-state checks alone
 * cannot establish that an unfinished request can safely be continued. */
export const retainedWorkRequirement =
  'Assess retained work from the independently declared original requests in ' +
  'observedState.expected.preservedRequests, the verified completed map/draft work ' +
  'and the active waiting/ready pendingParts together. Every unfinished action, ' +
  'target, value, uncertainty, prohibition and save restriction must remain ' +
  'recoverable from active pending work; exact wording and one part per request ' +
  'are not required. The declared requests state obligations, never evidence ' +
  'that those obligations survived. Recoverability must come from actual active ' +
  'parts, including their structured clarification evidence, and verified ' +
  'completed work. Already verified completed work need not remain pending. ' +
  'Apply authoritative user clarifications and corrections in order: a newer ' +
  'explicit correction replaces the earlier choice or value, while restrictions ' +
  'not changed by the user remain binding. A model paraphrase is not a user ' +
  'correction. Historical messages, summaries, a question or a success claim ' +
  'alone do not prove retained work. Missing, withdrawn or completed pending ' +
  'parts cannot retain unfinished work. Judge this state obligation independently ' +
  'of whether a scripted answer exists; do not infer retention from nonempty text.';

/** Ordinary content assessment must carry declared retention even when there
 * are no explicit response requirements or a short reply uses a target step. */
export function contentRequirements(
  sources: JudgeInput['sources'],
  requirements: string[],
  expected: Expected,
  evidence?: Record<string, unknown>,
): JudgeInput['requirements'] {
  const relationships =
    (evidence?.expected as { relationships?: NamedRelationship[] } | undefined)?.relationships ??
    [];
  const semanticWording = relationships.some((edge) => edge.verbMeaning !== undefined);
  return Object.keys(sources).flatMap((source) => [
    ...requirements.map((text, index) => ({
      id: `${source}-${index}`,
      source: source as 'backend' | 'voice',
      text,
    })),
    ...(semanticWording
      ? [
          {
            id: `${source}-relationship-words`,
            source: source as 'backend' | 'voice',
            text: relationshipWordingRequirement,
          },
        ]
      : []),
    ...(expected.preservedRequests?.length
      ? [
          {
            id: `${source}-retention`,
            source: source as 'backend' | 'voice',
            text: retainedWorkRequirement,
          },
        ]
      : []),
  ]);
}

/** A substituted judge must meet the same retention evidence contract as the
 * provider adapter. Missing, duplicated or unexpected verdict IDs cannot pass. */
export function checkedContentVerdicts(
  requirements: JudgeInput['requirements'],
  result: JudgeResult,
): JudgeResult {
  const mandatory = (id: string) => id.endsWith('-retention') || id.endsWith('-relationship-words');
  if (!requirements.some(({ id }) => mandatory(id))) return result;
  if (
    result.length === requirements.length &&
    requirements.every(({ id }) => result.filter((item) => item.id === id).length === 1)
  )
    return result;
  return requirements.map(({ id }) => {
    const matches = result.filter((item) => item.id === id);
    return !mandatory(id) && matches.length === 1
      ? matches[0]
      : {
          id,
          outcome: 'inconclusive',
          reason:
            'The content judge did not return exactly one verdict for every declared requirement.',
        };
  });
}

/** Declared retention verifies preservation, not completion of active work
 * belonging to this request or its clarifications. Wording is not identity. */
export function retainWaitingTiming(
  result: Attempt,
  expected: Expected,
  pendingParts: PendingPart[] | undefined,
  requestIds: string[],
) {
  if (
    !expected.preservedRequests?.length ||
    !pendingParts?.some(
      (part) =>
        ['waiting', 'ready'].includes(part.status) &&
        (requestIds.includes(part.messageId) ||
          (part.evidence && requestIds.includes(part.evidence.messageId))),
    )
  )
    return;
  result.elapsedMs = null;
  if (result.timing) {
    result.timing.successfulCompletionMs = null;
    result.timing.firstVerifiedUsefulMs = null;
  }
  if (result.assistedElapsedMs !== undefined) result.assistedElapsedMs = null;
}
