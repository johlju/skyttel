import type Database from 'better-sqlite3';
import type {
  MapDraft,
  MapObject,
  MapState,
  ObjectType,
  ObjectValue,
  SaveReceipt,
} from '../shared/map.js';
import { householdAccess } from './households.js';

export class MapError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 409 = 409,
  ) {
    super(code);
  }
}

export function householdMap(database: Database.Database, userId: string, householdId: string) {
  function authorize() {
    if (!householdAccess(database, userId, householdId)) throw new MapError('forbidden', 403);
  }
  function draft(): MapDraft {
    const row = database
      .prepare('SELECT version, changes FROM map_draft WHERE householdId = ? AND userId = ?')
      .get(householdId, userId) as { version: number; changes: string } | undefined;
    return row
      ? { version: row.version, changes: JSON.parse(row.changes) }
      : { version: 0, changes: [] };
  }
  function writeDraft(value: MapDraft) {
    database
      .prepare(`INSERT INTO map_draft VALUES (?, ?, ?, ?) ON CONFLICT(householdId, userId)
      DO UPDATE SET version = excluded.version, changes = excluded.changes`)
      .run(householdId, userId, value.version, JSON.stringify(value.changes));
    return value;
  }
  function object(id: string) {
    return database
      .prepare(
        'SELECT id, householdId, typeId, revision, name, description FROM map_object WHERE householdId = ? AND id = ? AND deleted = 0',
      )
      .get(householdId, id) as MapObject | undefined;
  }
  function checkedDraft(version: unknown) {
    if (!Number.isSafeInteger(version) || (version as number) < 0)
      throw new MapError('invalid_request', 400);
    const current = draft();
    if (current.version !== version) throw new MapError('draft_conflict');
    return current;
  }
  function transaction<T>(action: () => T): T {
    return database
      .transaction(() => {
        authorize();
        return action();
      })
      .immediate();
  }
  return {
    history() {
      return transaction(() => ({
        history: (
          database
            .prepare(`SELECT s.receipt FROM map_history h
        JOIN map_save s ON s.householdId = h.householdId AND s.userId = h.userId AND s.operationId = h.operationId
        WHERE h.householdId = ? ORDER BY h.id`)
            .all(householdId) as { receipt: string }[]
        ).map((row) => JSON.parse(row.receipt) as SaveReceipt),
      }));
    },
    read(): MapState {
      return transaction(() => ({
        types: database
          .prepare('SELECT * FROM object_type WHERE householdId = ? ORDER BY name, id')
          .all(householdId) as ObjectType[],
        objects: database
          .prepare(
            'SELECT id, householdId, typeId, revision, name, description FROM map_object WHERE householdId = ? AND deleted = 0 ORDER BY name, id',
          )
          .all(householdId) as MapObject[],
        draft: draft(),
      }));
    },
    propose(body: Record<string, unknown>) {
      return transaction(() => {
        const current = checkedDraft(body.version);
        if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
          throw new MapError('invalid_request', 400);
        const id = body.id;
        const existing = current.changes.find((change) => change.id === id);
        const before = existing ? existing.before : (object(id) ?? null);
        if ((before?.revision ?? null) !== body.baseRevision) throw new MapError('object_conflict');
        let after: ObjectValue | null = null;
        if (body.value !== null) {
          const value = body.value as Partial<ObjectValue> | undefined;
          if (
            !value ||
            typeof value.name !== 'string' ||
            !value.name.trim() ||
            value.name.length > 200 ||
            typeof value.description !== 'string' ||
            value.description.length > 2000 ||
            typeof value.typeId !== 'string'
          )
            throw new MapError('invalid_request', 400);
          after = { typeId: value.typeId, name: value.name.trim(), description: value.description };
        }
        const typeId = after?.typeId ?? before?.typeId ?? existing?.type.id;
        const type = database
          .prepare('SELECT * FROM object_type WHERE householdId = ? AND id = ?')
          .get(householdId, typeId ?? '') as ObjectType | undefined;
        if (!type) throw new MapError('invalid_type', 400);
        current.changes = current.changes.filter((change) => change.id !== id);
        if (before || after) current.changes.push({ id, before, after, type });
        return writeDraft({ version: current.version + 1, changes: current.changes });
      });
    },
    discard(version: unknown) {
      return transaction(() =>
        writeDraft({ version: checkedDraft(version).version + 1, changes: [] }),
      );
    },
    save(body: Record<string, unknown>) {
      return transaction(() => {
        if (Object.keys(body).some((key) => key !== 'version' && key !== 'operationId'))
          throw new MapError('invalid_request', 400);
        if (typeof body.operationId !== 'string' || !/^[\w-]{1,128}$/.test(body.operationId))
          throw new MapError('invalid_request', 400);
        const previous = database
          .prepare(
            'SELECT draftVersion, receipt FROM map_save WHERE householdId = ? AND userId = ? AND operationId = ?',
          )
          .get(householdId, userId, body.operationId) as
          | { draftVersion: number; receipt: string }
          | undefined;
        if (previous) {
          if (previous.draftVersion !== body.version) throw new MapError('operation_conflict');
          return { receipt: JSON.parse(previous.receipt) as SaveReceipt };
        }
        const current = checkedDraft(body.version);
        if (!current.changes.length) throw new MapError('empty_draft');
        const receipt: SaveReceipt = {
          operationId: body.operationId,
          householdId,
          userId,
          draftVersion: current.version,
          savedAt: new Date().toISOString(),
          changes: [],
        };
        for (const change of current.changes) {
          const saved = object(change.id);
          if (JSON.stringify(saved ?? null) !== JSON.stringify(change.before))
            throw new MapError('object_conflict');
          const type = database
            .prepare('SELECT * FROM object_type WHERE householdId = ? AND id = ?')
            .get(householdId, change.type.id) as ObjectType | undefined;
          if (!type || type.revision !== change.type.revision) throw new MapError('type_conflict');
          const after = change.after
            ? {
                id: change.id,
                householdId,
                typeId: change.after.typeId,
                revision: (saved?.revision ?? 0) + 1,
                name: change.after.name,
                description: change.after.description,
              }
            : null;
          if (after) {
            if (!saved && database.prepare('SELECT 1 FROM map_object WHERE id = ?').get(change.id))
              throw new MapError('object_conflict');
            database
              .prepare(`INSERT INTO map_object (id, householdId, typeId, revision, name, description) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET typeId = excluded.typeId, revision = excluded.revision, name = excluded.name, description = excluded.description`)
              .run(
                after.id,
                householdId,
                after.typeId,
                after.revision,
                after.name,
                after.description,
              );
          } else
            database
              .prepare(
                'UPDATE map_object SET deleted = 1, revision = revision + 1 WHERE householdId = ? AND id = ?',
              )
              .run(householdId, change.id);
          receipt.changes.push({ before: change.before, after, type });
        }
        database
          .prepare(
            'INSERT INTO map_history (householdId, userId, operationId, savedAt, changes) VALUES (?, ?, ?, ?, ?)',
          )
          .run(
            householdId,
            userId,
            body.operationId,
            receipt.savedAt,
            JSON.stringify(receipt.changes),
          );
        writeDraft({ version: current.version + 1, changes: [] });
        database
          .prepare('INSERT INTO map_save VALUES (?, ?, ?, ?, ?)')
          .run(body.operationId, householdId, userId, current.version, JSON.stringify(receipt));
        return { receipt };
      });
    },
  };
}
