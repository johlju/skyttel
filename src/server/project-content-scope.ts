import type {
  DraftChange,
  DraftRelationshipChange,
  MapDraft,
  ObjectMerge,
  SaveReceipt,
} from '../shared/map.js';

/** Rehome typed working snapshots; immutable receipts and free-form values stay intact. */
function projector(householdId: string) {
  function scope(value: { householdId: string } | null | undefined) {
    if (value) value.householdId = householdId;
  }
  function relationship(
    value: DraftRelationshipChange | NonNullable<SaveReceipt['relationships']>[number],
  ) {
    scope(value.before);
    if (value.after && 'householdId' in value.after) scope(value.after as { householdId: string });
    scope(value.type);
    if ('beforeType' in value) scope(value.beforeType);
  }
  function merge(value: ObjectMerge | NonNullable<SaveReceipt['changes'][number]['merge']>) {
    for (const item of [
      ...value.objects,
      ...value.types,
      ...value.relationships,
      ...value.relationshipTypes,
    ])
      scope(item);
    if ('previousChanges' in value) for (const item of value.previousChanges) object(item);
    if ('previousRelationships' in value)
      for (const item of value.previousRelationships) relationship(item);
  }
  function object(value: DraftChange | SaveReceipt['changes'][number]) {
    scope(value.before);
    if (value.after && 'householdId' in value.after) scope(value.after as { householdId: string });
    scope(value.type);
    scope(value.beforeType);
    if (value.merge) merge(value.merge);
  }
  return { scope, object, relationship };
}

export function projectDraftScope<T extends MapDraft>(value: T, householdId: string): T {
  const projected = structuredClone(value);
  const project = projector(householdId);
  for (const change of projected.changes) project.object(change);
  for (const change of projected.relationships ?? []) project.relationship(change);
  for (const change of [...(projected.objectTypes ?? []), ...(projected.relationshipTypes ?? [])]) {
    project.scope(change.before);
    project.scope(change.after);
  }
  return projected;
}

export function projectReceiptScope(value: SaveReceipt, householdId: string): SaveReceipt {
  const projected = structuredClone(value);
  const project = projector(householdId);
  for (const change of projected.changes) project.object(change);
  for (const change of projected.relationships ?? []) project.relationship(change);
  for (const change of [...(projected.objectTypes ?? []), ...(projected.relationshipTypes ?? [])]) {
    project.scope(change.before);
    project.scope(change.after);
  }
  return projected;
}
