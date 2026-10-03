import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SaveCheck } from '../shared/save-check.js';
import { householdMap, MapError } from './map.js';

/** Complete only existing immutable attempts. Each map save is synchronous and
 * serialized by SQLite: another save either already committed or observes the
 * same terminal receipt/rejection. No model work or fresh operation is admitted. */
export function checkSaves(
  database: Database.Database,
  actorId: string,
  householdId: string,
  ids?: string[],
): SaveCheck {
  const map = householdMap(database, actorId, householdId);
  const selected =
    ids ??
    map
      .operations()
      .operations.filter((item) => item.status === 'pending')
      .map((item) => item.operationId);
  for (const id of selected) {
    const operation = map.operation(id).operation;
    if (operation?.status !== 'pending') continue;
    try {
      map.save({
        operationId: operation.operationId,
        version: operation.draftVersion,
        contentVersion: operation.contentVersion,
      });
    } catch (failure) {
      // A terminal rejection is a checked unsaved outcome. Access and transport
      // failures remain failed checks and must never be presented as unsaved.
      if (
        !(failure instanceof MapError) ||
        failure.status !== 409 ||
        map.operation(id).operation?.status !== 'rejected'
      )
        throw failure;
    }
  }
  const operations = selected
    .map((id) => map.operation(id).operation)
    .filter((item) => item !== null);
  const successful = operations.find((item) => item.status === 'succeeded');
  return {
    id: createHash('sha256')
      .update(
        JSON.stringify(
          selected.map((id) => [
            id,
            operations.find((item) => item.operationId === id)?.status ?? 'missing',
          ]),
        ),
      )
      .digest('hex'),
    reply: successful
      ? 'Kontrollen visar att hela utkastet sparades. Ändringarna finns i hushållets karta.'
      : 'Kontrollen visar att utkastet inte sparades. Dina osparade ändringar ligger kvar.',
    receipt: successful?.status === 'succeeded' ? successful.receipt : undefined,
    operations,
  };
}
