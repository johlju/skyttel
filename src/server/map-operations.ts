import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { MapDraft, SaveOperation, SaveReceipt } from '../shared/map.js';
import { MapError } from './map-error.js';

interface OperationRow {
  operationId: string;
  householdId: string;
  userId: string;
  draftVersion: number;
  contentVersion: number;
  createdAt: string;
  status: 'pending' | 'succeeded' | 'rejected';
  draftHash: string | null;
  error: string | null;
  errorStatus: 400 | 409 | null;
}

// Call only inside the map's authorized transaction.
export function mapOperations(database: Database.Database, userId: string, householdId: string) {
  function contentVersion() {
    return (
      database.prepare('SELECT contentVersion FROM household WHERE id = ?').get(householdId) as {
        contentVersion: number;
      }
    ).contentVersion;
  }
  function find(operationId: string) {
    return database
      .prepare(
        'SELECT * FROM map_operation WHERE householdId = ? AND userId = ? AND operationId = ? AND contentVersion = ?',
      )
      .get(householdId, userId, operationId, contentVersion()) as OperationRow | undefined;
  }
  function result(row: OperationRow): SaveOperation {
    const common = {
      operationId: row.operationId,
      householdId: row.householdId,
      userId: row.userId,
      draftVersion: row.draftVersion,
      contentVersion: row.contentVersion,
      createdAt: row.createdAt,
    };
    if (row.status === 'rejected')
      return { ...common, status: 'rejected', error: row.error as string };
    if (row.status === 'succeeded') {
      const saved = database
        .prepare(
          'SELECT receipt FROM map_save WHERE householdId = ? AND userId = ? AND operationId = ?',
        )
        .get(householdId, userId, row.operationId) as { receipt: string };
      return { ...common, status: 'succeeded', receipt: JSON.parse(saved.receipt) as SaveReceipt };
    }
    return { ...common, status: 'pending' };
  }
  function hash(draft: MapDraft) {
    return createHash('sha256').update(JSON.stringify(draft)).digest('hex');
  }
  function assertEditable() {
    if (
      database
        .prepare(
          "SELECT 1 FROM map_operation WHERE householdId = ? AND userId = ? AND contentVersion = ? AND status = 'pending' LIMIT 1",
        )
        .get(householdId, userId, contentVersion())
    )
      throw new MapError('operation_pending');
  }
  return {
    contentVersion,
    find,
    result,
    hash,
    assertEditable,
    complete(operationId: string) {
      database
        .prepare(
          "UPDATE map_operation SET status = 'succeeded', draftHash = NULL WHERE householdId = ? AND userId = ? AND operationId = ?",
        )
        .run(householdId, userId, operationId);
    },
    reject(operationId: string, error: MapError) {
      database
        .prepare(
          "UPDATE map_operation SET status = 'rejected', draftHash = NULL, error = ?, errorStatus = ? WHERE householdId = ? AND userId = ? AND operationId = ?",
        )
        .run(error.code, error.status, householdId, userId, operationId);
    },
    register(body: Record<string, unknown>, draft: MapDraft) {
      const generation = body.contentVersion === undefined ? 1 : body.contentVersion;
      if (
        Object.keys(body).some(
          (key) => key !== 'version' && key !== 'operationId' && key !== 'contentVersion',
        ) ||
        typeof body.operationId !== 'string' ||
        !/^[\w-]{1,128}$/.test(body.operationId) ||
        !Number.isSafeInteger(body.version) ||
        (body.version as number) < 0 ||
        !Number.isSafeInteger(generation) ||
        (generation as number) < 1
      )
        throw new MapError('invalid_request', 400);
      if (generation !== contentVersion()) throw new MapError('content_conflict');
      if (
        database
          .prepare('SELECT 1 FROM retired_operation WHERE householdId = ? AND operationId = ?')
          .get(householdId, body.operationId)
      )
        throw new MapError('content_conflict');
      const previous = find(body.operationId);
      if (previous) {
        if (previous.draftVersion !== body.version) throw new MapError('operation_conflict');
        return result(previous);
      }
      assertEditable();
      const error = draft.version !== body.version ? 'draft_conflict' : null;
      database
        .prepare(
          `INSERT INTO map_operation
          (operationId, householdId, userId, draftVersion, contentVersion, createdAt, status, draftHash, error, errorStatus)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.operationId,
          householdId,
          userId,
          body.version,
          generation,
          new Date().toISOString(),
          error ? 'rejected' : 'pending',
          error ? null : hash(draft),
          error,
          error ? 409 : null,
        );
      return result(find(body.operationId) as OperationRow);
    },
    read(operationId: string) {
      const row = find(operationId);
      return row ? result(row) : null;
    },
    list() {
      const rows = database
        .prepare(
          `SELECT * FROM map_operation WHERE householdId = ? AND userId = ? AND contentVersion = ?
          AND status = 'pending' UNION ALL SELECT * FROM (
            SELECT * FROM map_operation WHERE householdId = ? AND userId = ? AND contentVersion = ?
            AND status != 'pending' ORDER BY createdAt DESC, operationId DESC LIMIT 20
          ) ORDER BY createdAt DESC, operationId DESC`,
        )
        .all(
          householdId,
          userId,
          contentVersion(),
          householdId,
          userId,
          contentVersion(),
        ) as OperationRow[];
      return rows.map(result);
    },
  };
}
