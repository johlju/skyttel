import { isDeepStrictEqual } from 'node:util';
import type { PendingPart } from '../../src/shared/text-assistant.js';
import rawCatalog from './catalog.json' with { type: 'json' };
import type { Expected, Scenario } from './types.js';

const scenario = (rawCatalog.scenarios as Scenario[]).find((item) => item.id === 'unknown-user');
if (!scenario?.steps[0].text || !scenario.steps[0].clarification)
  throw new Error('evaluation_pending_fixture_missing');
export const pendingContext = {
  startVariant: 'known-cloud-user',
  request: scenario.steps[0].text,
  continuation:
    'Låt det nya sambandet gå till Lo Berg. Behåll alla befintliga samband och spara inte.',
  waiting: {
    ...scenario.steps[0].clarification,
    preservedRequests: [scenario.steps[0].text],
    requirements: scenario.steps[0].clarification.requirements,
  } satisfies Expected,
  completed: {
    addRelationships: [
      {
        source: 'cloud',
        target: 'lo',
        type: 'Används av',
        verb: 'används av',
        verbMeaning: 'Norrsken Molnlagring används av Lo Berg.',
      },
    ],
    requirements: [
      'Det nya sambandet är osparat. Påstå inte att något är sparat eller att annat arbete är slutfört.',
    ],
    saves: 0,
  } satisfies Expected,
};

/** Exact request and stable identity are the supplemental fixture's contract.
 * A question, old transcript or a replacement part is not preserved work. */
export function checkPendingContext(
  parts: PendingPart[],
  original: PendingPart | undefined,
  messageId: string | undefined,
  completing: boolean,
  waitingAfterClarification = false,
) {
  const matches = parts.filter(
    (part) =>
      part.request === pendingContext.request &&
      part.messageId === (original?.messageId ?? messageId) &&
      part.kind === 'change' &&
      (!original || part.id === original.id),
  );
  const part = matches.length === 1 ? matches[0] : undefined;
  const valid =
    part &&
    (waitingAfterClarification
      ? ['waiting', 'ready'].includes(part.status) &&
        part.evidence?.messageId === messageId &&
        part.evidence?.text === pendingContext.continuation &&
        part.dependsOnDraft === original?.dependsOnDraft &&
        isDeepStrictEqual(part.operations, original.operations)
      : completing
        ? part.status === 'completed'
        : ['waiting', 'ready'].includes(part.status) &&
          (!original || isDeepStrictEqual(part, original)));
  return { part, failures: valid ? [] : ['pending_request_identity'] };
}
