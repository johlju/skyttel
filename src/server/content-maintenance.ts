import type Database from 'better-sqlite3';
import { householdAccess } from './households.js';
import { MapError } from './map-error.js';

export interface ContentMaintenance {
  id: string;
  householdId: string;
  actorId: string;
  kind: 'import' | 'erase';
  phase: 'prepared' | 'cleanup' | 'completed' | 'failed';
  contentVersion: number;
  requestHash: string;
  payload: string | null;
  counts: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export function assertContentAvailable(database: Database.Database, householdId: string) {
  if (
    database
      .prepare(`SELECT 1 FROM content_maintenance WHERE
    (householdId = ? AND phase IN ('prepared', 'cleanup'))
    OR (kind = 'erase' AND phase = 'cleanup') LIMIT 1`)
      .get(householdId)
  )
    throw new MapError('content_maintenance');
}

export function assertContentVersion(
  database: Database.Database,
  householdId: string,
  expected: unknown,
) {
  const current = database
    .prepare('SELECT contentVersion FROM household WHERE id = ?')
    .get(householdId) as { contentVersion: number };
  // Pre-generation clients belong to generation one; they cannot mutate a replacement.
  if ((expected ?? 1) !== current.contentVersion) throw new MapError('content_conflict');
  return current.contentVersion;
}

/** Status and recovery remain available while the content gate is closed. */
export function contentMaintenance(
  database: Database.Database,
  householdId: string,
  actorId: string,
) {
  function authorize() {
    if (householdAccess(database, actorId, householdId)?.role !== 'administrator')
      throw new MapError('forbidden', 403);
  }
  function read(id: string) {
    authorize();
    const row = database
      .prepare('SELECT * FROM content_maintenance WHERE householdId = ? AND id = ?')
      .get(householdId, id) as ContentMaintenance | undefined;
    if (!row) throw new MapError('maintenance_unavailable', 404);
    return row;
  }
  return {
    read,
    begin(
      input: {
        id: string;
        kind: ContentMaintenance['kind'];
        contentVersion: number;
        payload: string;
        requestHash: string;
      },
      validate: () => void,
    ) {
      return database
        .transaction(() => {
          authorize();
          assertContentAvailable(database, householdId);
          assertContentVersion(database, householdId, input.contentVersion);
          validate();
          const now = new Date().toISOString();
          database
            .prepare(`INSERT INTO content_maintenance
          (id, householdId, actorId, kind, phase, contentVersion, requestHash, payload, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, 'prepared', ?, ?, ?, ?, ?)`)
            .run(
              input.id,
              householdId,
              actorId,
              input.kind,
              input.contentVersion,
              input.requestHash,
              input.payload,
              now,
              now,
            );
          return read(input.id);
        })
        .immediate();
    },
    apply(id: string, replace: (job: ContentMaintenance) => Record<string, number>) {
      return database
        .transaction(() => {
          const job = read(id);
          if (job.phase !== 'prepared') return job;
          assertContentVersion(database, householdId, job.contentVersion);
          const counts = replace(job);
          database
            .prepare('UPDATE household SET contentVersion = contentVersion + 1 WHERE id = ?')
            .run(householdId);
          database
            .prepare(`UPDATE content_maintenance SET phase = 'cleanup', payload = NULL,
          counts = ?, contentVersion = contentVersion + 1, updatedAt = ? WHERE householdId = ? AND id = ?`)
            .run(JSON.stringify(counts), new Date().toISOString(), householdId, id);
          return read(id);
        })
        .immediate();
    },
    finish(id: string) {
      return database
        .transaction(() => {
          const job = read(id);
          if (job.phase === 'cleanup')
            database
              .prepare(`UPDATE content_maintenance
          SET phase = 'completed', payload = NULL, error = NULL, updatedAt = ? WHERE householdId = ? AND id = ?`)
              .run(new Date().toISOString(), householdId, id);
          return read(id);
        })
        .immediate();
    },
    fail(id: string, error: string) {
      return database
        .transaction(() => {
          const job = read(id);
          if (job.phase === 'prepared')
            database
              .prepare(`UPDATE content_maintenance
          SET phase = 'failed', payload = NULL, error = ?, updatedAt = ? WHERE householdId = ? AND id = ?`)
              .run(error, new Date().toISOString(), householdId, id);
          return read(id);
        })
        .immediate();
    },
  };
}
