import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { householdAccess } from './households.js';
import { MapError } from './map-error.js';

/** Resolve private ownership only through a previously verified login binding. */
export function contentOwner(database: Database.Database, householdId: string, actorId: string) {
  if (!householdAccess(database, actorId, householdId)) throw new MapError('forbidden', 403);
  const bound = database
    .prepare('SELECT id FROM content_identity WHERE householdId = ? AND userId = ?')
    .get(householdId, actorId) as { id: string } | undefined;
  if (bound) return bound.id;
  const id = randomUUID();
  database
    .prepare(`INSERT INTO content_identity (householdId, id, name, userId)
    SELECT ?, ?, name, id FROM user WHERE id = ?`)
    .run(householdId, id, actorId);
  return id;
}
