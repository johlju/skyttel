import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import { erasureContent } from './erasure-content.js';
import { type ErasureScope, erasureProjection } from './erasure-projection.js';

// Call inside the maintenance owner's immediate transaction. Only documented
// typed paths are references; arbitrary field names and text remain ordinary data.
export function eraseHouseholdContent(
  database: Database.Database,
  householdId: string,
  actorId: string,
  scope: ErasureScope,
) {
  const content = erasureContent(database, householdId, actorId);
  const projection = erasureProjection(content, scope);
  for (const [index, draft] of content.drafts.entries()) {
    const next = projection.drafts[index];
    if (
      !['changes', 'relationships', 'objectTypes', 'relationshipTypes'].every((key) =>
        isDeepStrictEqual(draft[key as keyof typeof next], next[key as keyof typeof next]),
      )
    )
      database
        .prepare(
          'UPDATE map_draft SET version = version + 1, changes = ?, relationships = ?, objectTypes = ?, relationshipTypes = ? WHERE householdId = ? AND userId = ?',
        )
        .run(
          JSON.stringify(next.changes),
          JSON.stringify(next.relationships),
          JSON.stringify(next.objectTypes),
          JSON.stringify(next.relationshipTypes),
          householdId,
          draft.userId,
        );
  }
  for (const [index, saved] of content.saves.entries()) {
    const { receipt } = projection.saves[index];
    if (
      !receipt.changes.length &&
      !receipt.relationships?.length &&
      !receipt.objectTypes?.length &&
      !receipt.relationshipTypes?.length
    ) {
      database
        .prepare('DELETE FROM map_save WHERE householdId = ? AND userId = ? AND operationId = ?')
        .run(householdId, saved.userId, saved.operationId);
      database
        .prepare(
          'DELETE FROM historical_operation WHERE householdId = ? AND userId = ? AND operationId = ?',
        )
        .run(householdId, saved.userId, saved.operationId);
    } else if (!isDeepStrictEqual(receipt, saved.receipt)) {
      database
        .prepare(
          'UPDATE map_save SET receipt = ? WHERE householdId = ? AND userId = ? AND operationId = ?',
        )
        .run(JSON.stringify(receipt), householdId, saved.userId, saved.operationId);
      database
        .prepare(
          'UPDATE historical_operation SET draftHash = NULL WHERE householdId = ? AND userId = ? AND operationId = ?',
        )
        .run(householdId, saved.userId, saved.operationId);
    }
  }
  for (const [index, historical] of content.history.entries()) {
    const { changes } = projection.history[index];
    const receipt = database
      .prepare('SELECT 1 FROM map_save WHERE householdId = ? AND userId = ? AND operationId = ?')
      .get(householdId, historical.userId, historical.operationId);
    if (!changes.length && !receipt)
      database
        .prepare('DELETE FROM map_history WHERE householdId = ? AND id = ?')
        .run(householdId, historical.id);
    else if (!isDeepStrictEqual(changes, historical.changes))
      database
        .prepare('UPDATE map_history SET changes = ? WHERE householdId = ? AND id = ?')
        .run(JSON.stringify(changes), householdId, historical.id);
  }
  for (const id of scope.relationships)
    database
      .prepare('DELETE FROM map_relationship WHERE householdId = ? AND id = ?')
      .run(householdId, id);
  for (const id of scope.objects) {
    database
      .prepare('DELETE FROM map_object WHERE householdId = ? AND id = ?')
      .run(householdId, id);
    database
      .prepare('DELETE FROM personal_position WHERE householdId = ? AND objectId = ?')
      .run(householdId, id);
  }
  for (const image of projection.images)
    database
      .prepare('DELETE FROM profile_image WHERE householdId = ? AND id = ?')
      .run(householdId, image.id);
  for (const [kind, table, ids] of [
    ['objectType', 'object_type', scope.objectTypes],
    ['relationshipType', 'relationship_type', scope.relationshipTypes],
  ] as const)
    for (const id of ids) {
      database.prepare('DELETE FROM removed_type WHERE kind = ? AND typeId = ?').run(kind, id);
      database
        .prepare(`DELETE FROM ${table} WHERE householdId = ? AND id = ?`)
        .run(householdId, id);
    }
  return { images: projection.images.length };
}
