import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DraftBatchRequest } from '../shared/draft-batch.js';
import type { MapDraft } from '../shared/map.js';
import { MapError } from './map-error.js';

function hash(value: unknown) {
  return createHash('sha256')
    .update(
      JSON.stringify(value, (_key, item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? Object.fromEntries(
              Object.keys(item)
                .sort()
                .map((key) => [key, item[key]]),
            )
          : item,
      ),
    )
    .digest('hex');
}

/** Call only inside the map's authorized immediate transaction. */
export function mapDraftBatches(database: Database.Database, householdId: string, userId: string) {
  type Row = {
    operationId: string;
    contentVersion: number;
    fromVersion: number;
    version: number;
    appliedCount: number;
    requestHash: string;
    draftHash: string;
  };
  function find(operationId: string) {
    return database
      .prepare(`SELECT operationId, contentVersion, fromVersion, version, appliedCount, requestHash, draftHash
      FROM draft_batch_outcome WHERE householdId = ? AND userId = ? AND operationId = ?`)
      .get(householdId, userId, operationId) as Row | undefined;
  }
  function result(row: Row, draft: MapDraft) {
    return {
      operationId: row.operationId,
      status: 'committed',
      contentVersion: row.contentVersion,
      fromVersion: row.fromVersion,
      version: row.version,
      appliedCount: row.appliedCount,
      currentDraft: row.draftHash === hash(draft),
    };
  }
  return {
    read(operationId: string, contentVersion: number, draft: MapDraft) {
      const row = find(operationId);
      if (row && row.contentVersion !== contentVersion) throw new MapError('content_conflict');
      return row ? result(row, draft) : null;
    },
    apply(body: DraftBatchRequest, draft: () => MapDraft, apply: () => Record<string, unknown>) {
      const operationId = body.operationId === undefined ? randomUUID() : body.operationId;
      if (typeof operationId !== 'string' || !/^[\w-]{1,128}$/.test(operationId))
        throw new MapError('invalid_request', 400);
      const requestHash = hash({ ...body, operationId });
      const previous = find(operationId);
      if (previous) {
        if (previous.contentVersion !== body.contentVersion) throw new MapError('content_conflict');
        if (previous.requestHash !== requestHash) throw new MapError('operation_conflict');
        return result(previous, draft());
      }
      if (
        database
          .prepare('SELECT 1 FROM retired_operation WHERE householdId = ? AND operationId = ?')
          .get(householdId, operationId)
      )
        throw new MapError('content_conflict');
      const applied = apply();
      const value = {
        ...applied,
        operationId,
        status: 'committed',
        fromVersion: body.version,
        appliedCount: Array.isArray(applied.applied) ? applied.applied.length : 0,
      };
      const current = draft();
      const draftHash = hash(current);
      database
        .prepare(`INSERT INTO draft_batch_outcome
        (householdId, userId, operationId, contentVersion, fromVersion, version, appliedCount, requestHash, draftHash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          householdId,
          userId,
          operationId,
          body.contentVersion,
          body.version,
          current.version,
          value.appliedCount,
          requestHash,
          draftHash,
        );
      return { ...value, currentDraft: true };
    },
  };
}
