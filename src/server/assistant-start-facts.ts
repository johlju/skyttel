import type { TextAssistantReview } from '../shared/text-assistant.js';

/** Names, search phrases and short IDs must match words, not other words' substrings. */
export function assistantFactMention(text: string, value: string) {
  const words = (input: string) =>
    input
      .toLocaleLowerCase('sv')
      .split(/[^\p{L}\p{N}_-]+/u)
      .filter(Boolean)
      .join(' ');
  const phrase = words(value);
  return Boolean(phrase && ` ${words(text)} `.includes(` ${phrase} `));
}

function indirectReference(message: string) {
  return /\b(?:den|det|samma|sista|senaste|förslaget|namnet|hon|han|hen|henne|honom|hennes|hans|hens|de|dem|dom|deras|dessa|båda)\b/u.test(
    message.toLocaleLowerCase('sv'),
  );
}

/** Recent mentions supply candidates, never a resolved identity. Stop at the
 * closest explicit request; allow at most two turns for an indirect chain. */
export function assistantFactReferences(message: string, earlier: readonly string[]) {
  if (!indirectReference(message)) return [];
  const references: string[] = [];
  for (const previous of earlier.slice(-2).reverse()) {
    references.unshift(previous);
    if (!indirectReference(previous)) break;
  }
  return references;
}

export function assistantFactRelevanceText(
  message: string,
  earlier: readonly string[],
  references: readonly string[] = [],
) {
  return [message, ...references, ...assistantFactReferences(message, earlier)]
    .join(' ')
    .toLocaleLowerCase('sv');
}

/** Context selection grants no authority and never proves that omitted facts
 * are absent. Full draft reads and the independent checker remain available. */
export function assistantStartDraft(
  review: TextAssistantReview,
  message: string,
  earlier: readonly string[],
  references: readonly string[] = [],
) {
  const normalized = message.toLocaleLowerCase('sv');
  if (
    /^\s*(?:kan du\s+)?(?:beskriv|visa|granska|kontrollera|sammanfatta|läs|lista)\s+(?:(?:hela|mitt|ditt|det|aktuella|nuvarande|enbart|bara|endast)\s+)*utkast(?:et)?(?:[.!?]|$|\s+(?:nu|tack|och)\b)/u.test(
      normalized,
    )
  )
    return { ...review, complete: true };
  const indirect = /\b(?:den|det|samma|sista|senaste|förslaget|namnet)\b/u.test(normalized);
  const text = assistantFactRelevanceText(message, earlier, references);
  const words = new Set(text.split(/[^\p{L}\p{N}_-]+/u));
  const mentioned = (id: string, name?: string) =>
    assistantFactMention(text, id) ||
    Boolean(
      name &&
        (assistantFactMention(text, name) ||
          name
            .toLocaleLowerCase('sv')
            .split(/\s+/u)
            .some(
              (word) =>
                word.length >= 2 &&
                !['min', 'mitt', 'mina', 'den', 'det', 'en', 'ett', 'ny', 'nya'].includes(word) &&
                words.has(word),
            )),
    );
  const ids = new Set<string>();
  const soleProposal =
    review.changes.length === 1 &&
    !review.relationships?.length &&
    !review.objectTypes?.length &&
    !review.relationshipTypes?.length;
  const changes = review.changes.filter(
    (change) =>
      (indirect && soleProposal) ||
      mentioned(change.id, change.after?.name) ||
      mentioned(change.id, change.before?.name),
  );
  for (const change of changes) {
    ids.add(change.id);
    if (change.before) ids.add(change.before.typeId);
    if (change.after) ids.add(change.after.typeId);
  }
  const relationships = review.relationships?.filter(
    (change) =>
      mentioned(change.id) ||
      [change.before, change.after].some(
        (value) => value && [value.sourceId, value.targetId].some((id) => ids.has(id)),
      ),
  );
  for (const change of relationships ?? [])
    for (const value of [change.before, change.after])
      if (value) for (const id of [value.sourceId, value.targetId, value.typeId]) ids.add(id);
  const selected = (value: {
    id: string;
    name?: string;
    forwardLabel?: string;
    reverseLabel?: string;
  }) =>
    ids.has(value.id) ||
    [value.name, value.forwardLabel, value.reverseLabel].some(
      (label) =>
        label &&
        (mentioned(value.id, label) ||
          // Conservative candidates for inflected type labels in unfinished work,
          // such as Betalar/betalningen. This never establishes target identity.
          (references.length > 0 &&
            label
              .toLocaleLowerCase('sv')
              .split(/\s+/u)
              .some(
                (word) =>
                  word.length >= 5 &&
                  [...words].some(
                    (candidate) =>
                      candidate.length >= 5 && candidate.slice(0, 5) === word.slice(0, 5),
                  ),
              ))),
    );
  return {
    version: review.version,
    contentVersion: review.contentVersion,
    readyToSave: review.readyToSave,
    complete: false,
    totals: {
      changes: review.changes.length,
      relationships: review.relationships?.length ?? 0,
      objectTypes: review.objectTypes?.length ?? 0,
      relationshipTypes: review.relationshipTypes?.length ?? 0,
      conflicts: review.conflicts.length,
      unresolvedIdentities: review.unresolvedIdentities.length,
    },
    changes,
    relationships,
    objectTypes: review.objectTypes?.filter((change) =>
      selected({ ...change.before, ...change.after, id: change.id }),
    ),
    relationshipTypes: review.relationshipTypes?.filter((change) =>
      selected({ ...change.before, ...change.after, id: change.id }),
    ),
    current: review.current && {
      types: review.current.types.filter(selected),
      relationshipTypes: review.current.relationshipTypes.filter(selected),
    },
    conflicts: review.conflicts.filter((value) => ids.has(value.id)),
    unresolvedIdentities: review.unresolvedIdentities.filter((value) => ids.has(value.id)),
  };
}
