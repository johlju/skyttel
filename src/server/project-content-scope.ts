import type { MapDraft } from '../shared/map.js';

/** Rehome typed working snapshots; immutable receipts and free-form values stay intact. */
export function projectDraftScope<T extends MapDraft>(value: T, householdId: string): T {
  const projected = structuredClone(value);
  function scope(value: { householdId: string } | null | undefined) {
    if (value) value.householdId = householdId;
  }
  for (const change of [...projected.changes, ...(projected.relationships ?? [])]) {
    scope(change.before);
    if (change.after && 'householdId' in change.after)
      scope(change.after as { householdId: string });
    scope(change.type);
    scope(change.beforeType);
  }
  for (const { suppressed } of projected.relationships ?? []) {
    if (!suppressed) continue;
    scope(suppressed.before);
    if (suppressed.after && 'householdId' in suppressed.after)
      scope(suppressed.after as { householdId: string });
    scope(suppressed.type);
    scope(suppressed.beforeType);
  }
  for (const change of [...(projected.objectTypes ?? []), ...(projected.relationshipTypes ?? [])]) {
    if (change.restoration) {
      // An archive carries historical proposals, never authority granted in its old generation.
      // Returning to that historical basis leaves a normal, explicitly reviewable conflict.
      change.before = change.restoration.definition;
      delete change.restoration;
    }
    scope(change.before);
    scope(change.after);
  }
  return projected;
}
