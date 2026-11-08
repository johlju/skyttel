import type { TextAssistantReview } from '../shared/text-assistant.js';

type Operation = { name: string; arguments: Record<string, unknown> };
export type QueuedRequestReference = Pick<
  TextAssistantReview,
  | 'version'
  | 'contentVersion'
  | 'changes'
  | 'relationships'
  | 'objectTypes'
  | 'relationshipTypes'
  | 'current'
>;

/** Missing saved-map facts and over-budget references require clarification.
 * Never truncate a reference and then present it as complete evidence. */
export function captureQueuedReference(review: TextAssistantReview): QueuedRequestReference | null {
  const reference: QueuedRequestReference = {
    version: review.version,
    contentVersion: review.contentVersion,
    changes: review.changes,
    relationships: review.relationships,
    objectTypes: review.objectTypes,
    relationshipTypes: review.relationshipTypes,
    current: review.current && {
      types: review.current.types,
      relationshipTypes: review.current.relationshipTypes,
    },
  };
  const records = [
    reference.changes,
    reference.relationships,
    reference.objectTypes,
    reference.relationshipTypes,
    reference.current?.types,
    reference.current?.relationshipTypes,
  ].reduce((count, collection) => count + (collection?.length ?? 0), 0);
  return records <= 128 && Buffer.byteLength(JSON.stringify(reference)) <= 32_768
    ? structuredClone(reference)
    : null;
}

/** Only facts relevant to this proposed batch reach the independent checker. */
export function queuedActionReference(
  reference: QueuedRequestReference,
  operations: readonly Operation[],
) {
  const ids = new Set<unknown>();
  for (const operation of operations) {
    const args = operation.arguments;
    for (const value of [args, args.value, args.conflict]) {
      if (!value || typeof value !== 'object') continue;
      for (const key of ['id', 'sourceId', 'targetId', 'typeId'])
        ids.add((value as Record<string, unknown>)[key]);
    }
  }
  const relationships = reference.relationships?.filter((change) => ids.has(change.id));
  for (const change of relationships ?? []) {
    for (const value of [change.before, change.after]) {
      if (!value) continue;
      ids.add(value.sourceId);
      ids.add(value.targetId);
      ids.add(value.typeId);
    }
  }
  const changes = reference.changes.filter((change) => ids.has(change.id));
  for (const change of changes) {
    ids.add(change.before?.typeId);
    ids.add(change.after?.typeId);
  }
  return {
    source: 'admitted_private_draft_only',
    draft: {
      version: reference.version,
      contentVersion: reference.contentVersion,
      changes,
      relationships,
      objectTypes: reference.objectTypes?.filter((change) => ids.has(change.id)),
      relationshipTypes: reference.relationshipTypes?.filter((change) => ids.has(change.id)),
      current: reference.current && {
        types: reference.current.types.filter((type) => ids.has(type.id)),
        relationshipTypes: reference.current.relationshipTypes.filter((type) => ids.has(type.id)),
      },
    },
  };
}
