import type { RelationshipType, RelationshipValue } from './map.js';
import { relationshipVerb } from './relationship-verb.js';

/** Grouping, direction and the effective forward verb identify a relationship. */
export function equivalentRelationships(left: RelationshipValue, right: RelationshipValue) {
  if (
    left.typeId !== right.typeId ||
    left.sourceId !== right.sourceId ||
    left.targetId !== right.targetId
  )
    return false;
  return relationshipVerb(left) === relationshipVerb(right);
}

/** Find the local ungrouped category using the same definition as proposal creation. */
export function ungroupedRelationshipType(types: readonly RelationshipType[]) {
  return types.find(
    (type) =>
      type.name === 'Samband' &&
      type.description === 'Hushållets samband utan särskilt vald gruppering.',
  );
}
