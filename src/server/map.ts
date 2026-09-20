import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import { draftConflicts, resolvedObjectValue } from '../shared/draft-conflicts.js';
import type {
  MapDraft,
  MapObject,
  MapState,
  ObjectType,
  ObjectValue,
  SaveReceipt,
} from '../shared/map.js';
import { householdAccess } from './households.js';

import { MapError } from './map-error.js';
import { mapOperations } from './map-operations.js';
import { relationships } from './relationships.js';

export { MapError } from './map-error.js';

export function householdMap(database: Database.Database, userId: string, householdId: string) {
  const edges = relationships(database, householdId);
  const operations = mapOperations(database, userId, householdId);
  function authorize() {
    if (!householdAccess(database, userId, householdId)) throw new MapError('forbidden', 403);
  }
  function draft(): MapDraft {
    const row = database
      .prepare(
        'SELECT version, changes, relationships FROM map_draft WHERE householdId = ? AND userId = ?',
      )
      .get(householdId, userId) as
      | { version: number; changes: string; relationships: string }
      | undefined;
    return row
      ? {
          version: row.version,
          changes: JSON.parse(row.changes),
          ...(row.relationships !== '[]' ? { relationships: JSON.parse(row.relationships) } : {}),
        }
      : { version: 0, changes: [] };
  }
  function writeDraft(value: MapDraft) {
    database
      .prepare(`INSERT INTO map_draft (householdId, userId, version, changes, relationships) VALUES (?, ?, ?, ?, ?) ON CONFLICT(householdId, userId)
      DO UPDATE SET version = excluded.version, changes = excluded.changes, relationships = excluded.relationships`)
      .run(
        householdId,
        userId,
        value.version,
        JSON.stringify(value.changes),
        JSON.stringify(value.relationships ?? []),
      );
    return value;
  }
  function object(id: string) {
    const row = database
      .prepare(
        'SELECT id, householdId, typeId, revision, name, description, identity FROM map_object WHERE householdId = ? AND id = ? AND deleted = 0',
      )
      .get(householdId, id) as (MapObject & { identity: string | null }) | undefined;
    if (row && row.identity === null) delete (row as Partial<MapObject>).identity;
    return row;
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
  function readState(): MapState {
    return {
      userId,
      contentVersion: operations.contentVersion(),
      relationshipTypes: edges.types(),
      relationships: edges.read(),
      types: database
        .prepare(
          "SELECT * FROM object_type WHERE householdId = ? ORDER BY CASE WHEN name = 'Person' THEN 0 ELSE 1 END, name, id",
        )
        .all(householdId) as ObjectType[],
      objects: database
        .prepare(
          'SELECT id, householdId, typeId, revision, name, description, identity FROM map_object WHERE householdId = ? AND deleted = 0 ORDER BY name, id',
        )
        .all(householdId)
        .map((row) => {
          const value = row as MapObject;
          if (value.identity === null) delete value.identity;
          return value;
        }),
      draft: draft(),
    };
  }

  return {
    registerOperation(body: Record<string, unknown>) {
      return transaction(() => ({ operation: operations.register(body, draft()) }));
    },
    operation(operationId: string) {
      return transaction(() => ({ operation: operations.read(operationId) }));
    },
    operations() {
      return transaction(() => ({ operations: operations.list() }));
    },
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
      return transaction(readState);
    },
    resolve(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        const current = checkedDraft(body.version);
        if (body.choice !== 'saved' && body.choice !== 'proposed')
          throw new MapError('invalid_request', 400);
        const conflict = draftConflicts(readState()).find((item) =>
          isDeepStrictEqual(item, body.conflict),
        );
        if (!conflict) throw new MapError('resolution_conflict');
        if (body.choice === 'proposed' && conflict.duplicates)
          throw new MapError('duplicate_relationship');
        if (body.choice === 'proposed' && conflict.missingEndpoints)
          throw new MapError('endpoint_conflict');
        if (body.choice === 'proposed' && conflict.type === null)
          throw new MapError('type_conflict');
        if (conflict.kind === 'object') {
          const change = current.changes.find((item) => item.id === conflict.id);
          if (!change) throw new MapError('resolution_conflict');
          if (body.choice === 'saved') {
            current.changes = current.changes.filter((item) => item.id !== conflict.id);
          } else {
            if (!conflict.current && change.before) throw new MapError('object_conflict');
            change.after = resolvedObjectValue(change, conflict.current);
            change.before = conflict.current;
            if (conflict.type) change.type = conflict.type;
            if (!change.after) edges.removeObject(current, change.id);
          }
          edges.reconcileObjectRemovals(current);
        } else {
          const change = current.relationships?.find((item) => item.id === conflict.id);
          if (!change) throw new MapError('resolution_conflict');
          if (body.choice === 'saved') {
            current.relationships = current.relationships?.filter(
              (item) => item.id !== conflict.id,
            );
          } else {
            if (!conflict.current && change.before) throw new MapError('relationship_conflict');
            const before = change.before;
            change.before = conflict.current;
            if (conflict.type) change.type = conflict.type;
            // Keep triggers from draft edits, but drop dependencies on detached saved endpoints.
            if (change.removedWithObjects)
              change.removedWithObjects = change.removedWithObjects.filter(
                (id) =>
                  (before?.sourceId !== id && before?.targetId !== id) ||
                  change.before?.sourceId === id ||
                  change.before?.targetId === id,
              );
          }
        }
        return writeDraft({ ...current, version: current.version + 1 });
      });
    },
    proposeRelationship(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        const result = edges.propose(checkedDraft(body.version), body);
        return {
          ...writeDraft(result.draft),
          ...(result.existingId ? { existingId: result.existingId } : {}),
        };
      });
    },
    propose(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
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
            typeof value.typeId !== 'string' ||
            (value.identity !== undefined &&
              !['unspecified', 'unresolved'].includes(value.identity))
          )
            throw new MapError('invalid_request', 400);
          after = {
            typeId: value.typeId,
            name: value.name.trim(),
            description: value.description,
            ...(value.identity ? { identity: value.identity } : {}),
          };
        }
        const typeId = after?.typeId ?? before?.typeId ?? existing?.type.id;
        const type = database
          .prepare('SELECT * FROM object_type WHERE householdId = ? AND id = ?')
          .get(householdId, typeId ?? '') as ObjectType | undefined;
        if (!type) throw new MapError('invalid_type', 400);
        current.changes = current.changes.filter((change) => change.id !== id);
        if (before || after) current.changes.push({ id, before, after, type });
        if (!after) edges.removeObject(current, id);
        edges.reconcileObjectRemovals(current);
        return writeDraft({ ...current, version: current.version + 1 });
      });
    },
    discard(version: unknown) {
      return transaction(() => {
        operations.assertEditable();
        return writeDraft({ version: checkedDraft(version).version + 1, changes: [] });
      });
    },
    save(body: Record<string, unknown>) {
      // Registration commits before applying so interruption cannot erase the attempt.
      const registered = transaction(() => operations.register(body, draft()));
      const outcome = transaction(() => {
        if (registered.contentVersion !== operations.contentVersion())
          throw new MapError('content_conflict');
        const previous = operations.find(registered.operationId);
        if (!previous) throw new MapError('operation_conflict');
        const result = operations.result(previous);
        if (result.status === 'succeeded') return { receipt: result.receipt };
        if (result.status === 'rejected')
          throw new MapError(result.error, previous.errorStatus ?? 409);
        try {
          // A savepoint rolls back every map write before recording a terminal rejection.
          return database.transaction(() => {
            const current = checkedDraft(body.version);
            if (operations.hash(current) !== previous.draftHash)
              throw new MapError('operation_conflict');
            if (!current.changes.length && !current.relationships?.length)
              throw new MapError('empty_draft');
            const receipt: SaveReceipt = {
              contentVersion: operations.contentVersion(),
              operationId: registered.operationId,
              householdId,
              userId,
              draftVersion: current.version,
              savedAt: new Date().toISOString(),
              changes: [],
            };
            for (const change of current.changes) {
              if (change.after?.identity === 'unresolved')
                throw new MapError('unresolved_identity');
              const saved = object(change.id);
              if (JSON.stringify(saved ?? null) !== JSON.stringify(change.before))
                throw new MapError('object_conflict');
              const type = database
                .prepare('SELECT * FROM object_type WHERE householdId = ? AND id = ?')
                .get(householdId, change.type.id) as ObjectType | undefined;
              if (!type || type.revision !== change.type.revision)
                throw new MapError('type_conflict');
              const after = change.after
                ? {
                    id: change.id,
                    householdId,
                    typeId: change.after.typeId,
                    revision: (saved?.revision ?? 0) + 1,
                    name: change.after.name,
                    description: change.after.description,
                    ...(change.after.identity ? { identity: change.after.identity } : {}),
                  }
                : null;
              if (after) {
                if (
                  !saved &&
                  database.prepare('SELECT 1 FROM map_object WHERE id = ?').get(change.id)
                )
                  throw new MapError('object_conflict');
                database
                  .prepare(`INSERT INTO map_object (id, householdId, typeId, revision, name, description, identity) VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET typeId = excluded.typeId, revision = excluded.revision, name = excluded.name, description = excluded.description, identity = excluded.identity`)
                  .run(
                    after.id,
                    householdId,
                    after.typeId,
                    after.revision,
                    after.name,
                    after.description,
                    after.identity ?? null,
                  );
              } else
                database
                  .prepare(
                    'UPDATE map_object SET deleted = 1, revision = revision + 1 WHERE householdId = ? AND id = ?',
                  )
                  .run(householdId, change.id);
              receipt.changes.push({ before: change.before, after, type });
            }
            const relationshipChanges = edges.save(current);
            if (relationshipChanges.length) receipt.relationships = relationshipChanges;
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
            operations.complete(registered.operationId);
            return { receipt };
          })();
        } catch (error) {
          if (!(error instanceof MapError)) throw error;
          operations.reject(registered.operationId, error);
          return { error };
        }
      });
      if ('error' in outcome) throw outcome.error;
      return outcome;
    },
  };
}
