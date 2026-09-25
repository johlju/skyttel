import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ErasureSelection, ErasureStatus } from '../shared/household-erasure.js';
import { AdministrationError } from './administration.js';
import { type ContentMaintenance, contentMaintenance } from './content-maintenance.js';
import { eraseHouseholdContent } from './erase-household-content.js';
import { planErasure } from './erasure-content.js';
import type { ErasureScope } from './erasure-projection.js';
import { invalidateHouseholdExports } from './household-export.js';
import { invalidateHouseholdImports } from './household-import.js';
import { MapError } from './map-error.js';

const running = new WeakMap<Database.Database, Map<string, Promise<ErasureStatus>>>();

export function erasureStatus(job: ContentMaintenance): ErasureStatus {
  return {
    operationId: job.id,
    phase: job.phase,
    counts: {
      objects: 0,
      relationships: 0,
      objectTypes: 0,
      relationshipTypes: 0,
      images: 0,
      ...JSON.parse(job.counts),
    },
  };
}

export function latestErasure(database: Database.Database, householdId: string) {
  return database
    .prepare(
      "SELECT * FROM content_maintenance WHERE householdId = ? AND kind = 'erase' ORDER BY createdAt DESC, rowid DESC LIMIT 1",
    )
    .get(householdId) as ContentMaintenance | undefined;
}

/** A busy reader is a pending cleanup, never evidence that the old pages vanished. */
function reclaimPages(database: Database.Database) {
  const timeout = database.pragma('busy_timeout', { simple: true }) as number;
  database.pragma('busy_timeout = 0');
  try {
    const checkpoint = () => {
      const result = database.pragma('wal_checkpoint(TRUNCATE)') as {
        busy: number;
        log: number;
        checkpointed: number;
      }[];
      return (
        result.length === 1 &&
        result[0].busy === 0 &&
        result[0].log === 0 &&
        result[0].checkpointed === 0
      );
    };
    if (!checkpoint()) return false;
    database.pragma('temp_store = MEMORY');
    database.exec('VACUUM');
    return (
      checkpoint() &&
      database.pragma('freelist_count', { simple: true }) === 0 &&
      database.pragma('quick_check', { simple: true }) === 'ok' &&
      (database.pragma('foreign_key_check') as unknown[]).length === 0
    );
  } finally {
    database.pragma(`busy_timeout = ${timeout}`);
  }
}

export function resumeErasure(
  database: Database.Database,
  householdId: string,
  actorId: string,
  operationId: string,
) {
  const maintenance = contentMaintenance(database, householdId, actorId);
  const initial = maintenance.read(operationId);
  if (initial.kind !== 'erase') throw new AdministrationError('erasure_unavailable', 404);
  const key = `${householdId}:${operationId}`;
  let jobs = running.get(database);
  if (!jobs) {
    jobs = new Map();
    running.set(database, jobs);
  }
  const existing = jobs.get(key);
  if (existing) return existing;
  const job = Promise.resolve()
    .then(async () => {
      try {
        let current = maintenance.read(operationId);
        if (current.phase === 'prepared') {
          await invalidateHouseholdExports(database, householdId);
          await invalidateHouseholdImports(database, householdId);
          database.pragma('secure_delete = ON');
          current = maintenance.apply(operationId, (pending) => {
            const payload = JSON.parse(pending.payload as string) as {
              scope: ErasureScope;
              counts: ErasureStatus['counts'];
            };
            const erased = eraseHouseholdContent(database, householdId, actorId, payload.scope);
            return { ...payload.counts, ...erased };
          });
        }
        if (current.phase === 'cleanup' && reclaimPages(database))
          current = maintenance.finish(operationId);
        return erasureStatus(current);
      } catch (error) {
        if (error instanceof MapError || error instanceof AdministrationError) throw error;
        // Keep the durable phase and gate. No selected text, IDs or SQL in logs.
        console.error(JSON.stringify({ event: 'erasure_recovery_pending' }));
        return erasureStatus(maintenance.read(operationId));
      }
    })
    .finally(() => {
      jobs.delete(key);
    });
  jobs.set(key, job);
  return job;
}

export function executeErasure(
  database: Database.Database,
  householdId: string,
  actorId: string,
  input: { operationId: string; selection: ErasureSelection; token: string },
) {
  const maintenance = contentMaintenance(database, householdId, actorId);
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const existing = database
    .prepare('SELECT * FROM content_maintenance WHERE householdId = ? AND id = ?')
    .get(householdId, input.operationId) as ContentMaintenance | undefined;
  if (existing) {
    maintenance.read(input.operationId);
    if (existing.kind !== 'erase' || existing.requestHash !== requestHash)
      throw new AdministrationError('operation_conflict', 409);
    return resumeErasure(database, householdId, actorId, input.operationId);
  }
  const { review, scope } = planErasure(database, householdId, actorId, input.selection);
  const counts = {
    objects: scope.objects.length,
    relationships: scope.relationships.length,
    objectTypes: scope.objectTypes.length,
    relationshipTypes: scope.relationshipTypes.length,
    images: review.images,
  };
  maintenance.begin(
    {
      id: input.operationId,
      kind: 'erase',
      contentVersion: review.contentVersion,
      requestHash,
      payload: JSON.stringify({ scope, counts }),
    },
    () => {
      if (planErasure(database, householdId, actorId, input.selection).review.token !== input.token)
        throw new AdministrationError('erasure_review_changed', 409);
    },
  );
  return resumeErasure(database, householdId, actorId, input.operationId);
}
