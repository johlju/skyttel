import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import {
  draftConflicts,
  resolvedObjectValue,
  resolvedRelationshipValue,
} from '../shared/draft-conflicts.js';
import type { MapDraft, MapObject, MapState, ObjectValue, SaveReceipt } from '../shared/map.js';
import { compatibleCustomFields } from '../shared/map.js';
import { mergeFor, withoutMerge } from '../shared/object-merge.js';
import { contentOwner } from './content-identities.js';
import { assertContentAvailable, assertContentVersion } from './content-maintenance.js';
import { readFinancialFacts } from './financial-facts.js';
import { householdAccess } from './households.js';
import { readLifecycle } from './lifecycle.js';
import { MapError } from './map-error.js';
import { mapOperations } from './map-operations.js';
import { mapTombstones } from './map-tombstones.js';
import { undoSave } from './map-undo.js';
import { assertMergeEditable, proposeMerge } from './object-merge.js';
import { objectTypes, readCustomValues } from './object-types.js';
import { type EncodedImage, profileImages } from './profile-images.js';
import { projectReceiptScope } from './project-content-scope.js';
import { relationshipTypes } from './relationship-types.js';
import { relationships } from './relationships.js';
import { keepIndependent } from './undo-facts.js';

export { MapError } from './map-error.js';

export function householdMap(database: Database.Database, actorId: string, householdId: string) {
  const userId = database
    .transaction(() => {
      if (!householdAccess(database, actorId, householdId)) throw new MapError('forbidden', 403);
      assertContentAvailable(database, householdId);
      return contentOwner(database, householdId, actorId);
    })
    .immediate();
  const images = profileImages(database, householdId, userId);
  const edges = relationships(database, householdId);
  const types = objectTypes(database, householdId, userId);
  const edgeTypes = relationshipTypes(database, householdId, userId);
  const operations = mapOperations(database, userId, householdId);
  const tombstones = mapTombstones(database, householdId);
  function authorize() {
    if (!householdAccess(database, actorId, householdId)) throw new MapError('forbidden', 403);
    assertContentAvailable(database, householdId);
    if (contentOwner(database, householdId, actorId) !== userId)
      throw new MapError('content_conflict');
  }
  function draft(): MapDraft {
    const row = database
      .prepare(
        'SELECT version, changes, relationships, objectTypes, relationshipTypes FROM map_draft WHERE householdId = ? AND userId = ?',
      )
      .get(householdId, userId) as
      | {
          version: number;
          changes: string;
          relationships: string;
          objectTypes: string;
          relationshipTypes: string;
        }
      | undefined;
    return row
      ? {
          version: row.version,
          changes: JSON.parse(row.changes),
          ...(row.relationships !== '[]' ? { relationships: JSON.parse(row.relationships) } : {}),
          ...(row.objectTypes !== '[]' ? { objectTypes: JSON.parse(row.objectTypes) } : {}),
          ...(row.relationshipTypes !== '[]'
            ? { relationshipTypes: JSON.parse(row.relationshipTypes) }
            : {}),
        }
      : { version: 0, changes: [] };
  }
  function writeDraft(value: MapDraft) {
    database
      .prepare(`INSERT INTO map_draft (householdId, userId, version, changes, relationships, objectTypes, relationshipTypes) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(householdId, userId)
      DO UPDATE SET version = excluded.version, changes = excluded.changes, relationships = excluded.relationships, objectTypes = excluded.objectTypes, relationshipTypes = excluded.relationshipTypes`)
      .run(
        householdId,
        userId,
        value.version,
        JSON.stringify(value.changes),
        JSON.stringify(value.relationships ?? []),
        JSON.stringify(value.objectTypes ?? []),
        JSON.stringify(value.relationshipTypes ?? []),
      );
    images.prune();
    return value;
  }
  function object(id: string) {
    const row = database
      .prepare(
        'SELECT id, householdId, typeId, revision, name, description, identity, financialFacts, customValues, lifecycle, profileImageId FROM map_object WHERE householdId = ? AND id = ? AND deleted = 0',
      )
      .get(householdId, id);
    return row ? readObject(row) : undefined;
  }
  function readObject(row: unknown): MapObject {
    const { identity, financialFacts, customValues, lifecycle, profileImageId, ...value } =
      row as Omit<
        MapObject,
        'identity' | 'financialFacts' | 'customValues' | 'lifecycle' | 'profileImageId'
      > & {
        identity: MapObject['identity'] | null;
        financialFacts: string | null;
        customValues: string | null;
        lifecycle: MapObject['lifecycle'] | null;
        profileImageId: string | null;
      };
    return {
      ...value,
      ...(identity ? { identity } : {}),
      ...(financialFacts ? { financialFacts: JSON.parse(financialFacts) } : {}),
      ...(customValues ? { customValues: JSON.parse(customValues) } : {}),
      ...(lifecycle ? { lifecycle } : {}),
      ...(profileImageId ? { profileImageId } : {}),
    };
  }
  function checkedDraft(version: unknown, contentVersion: unknown) {
    assertContentVersion(database, householdId, contentVersion);
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
      types: types.read(),
      objects: database
        .prepare(
          'SELECT id, householdId, typeId, revision, name, description, identity, financialFacts, customValues, lifecycle, profileImageId FROM map_object WHERE householdId = ? AND deleted = 0 ORDER BY name, id',
        )
        .all(householdId)
        .map(readObject),
      draft: draft(),
    };
  }

  function imageChange(body: Record<string, unknown>) {
    operations.assertEditable();
    const current = checkedDraft(body.version, body.contentVersion);
    if (body.contentVersion !== operations.contentVersion()) throw new MapError('content_conflict');
    if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
      throw new MapError('invalid_request', 400);
    assertMergeEditable(current, 'object', body.id);
    const existing = current.changes.find((change) => change.id === body.id);
    const saved = object(body.id) ?? null;
    const before = existing ? existing.before : saved;
    const after = existing ? existing.after : saved;
    if (!after) throw new MapError('object_conflict');
    if ((before?.revision ?? null) !== body.baseRevision || !isDeepStrictEqual(before, saved))
      throw new MapError('object_conflict');
    const type = types.effective(current).find((item) => item.id === after.typeId);
    if (!type || (existing && !isDeepStrictEqual(existing.type, type)))
      throw new MapError('type_conflict');
    return { current, existing, before, after, type, id: body.id };
  }
  return {
    image(id: string) {
      return transaction(() => images.read(id));
    },
    checkImageChange(body: Record<string, unknown>) {
      transaction(() => {
        imageChange(body);
      });
    },
    proposeImage(body: Record<string, unknown>, image: EncodedImage | null) {
      return transaction(() => {
        const { current, existing, before, after, type, id } = imageChange(body);
        const value = { ...after };
        if (image) value.profileImageId = images.insert(id, image);
        else delete value.profileImageId;
        current.changes = current.changes.filter((change) => change.id !== id);
        current.changes.push({ ...existing, id, before, after: value, type });
        return writeDraft({ ...current, version: current.version + 1 });
      });
    },
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
    undo(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        checkedDraft(body.version, body.contentVersion);
        if (typeof body.operationId !== 'string' || typeof body.userId !== 'string')
          throw new MapError('invalid_request', 400);
        const row = database
          .prepare(
            'SELECT receipt FROM map_save WHERE householdId = ? AND userId = ? AND operationId = ?',
          )
          .get(householdId, body.userId, body.operationId) as { receipt: string } | undefined;
        if (!row) throw new MapError('undo_unavailable');
        const receipt = JSON.parse(row.receipt) as SaveReceipt;
        const ownDraft = draft();
        if (
          receipt.changes.some((change) =>
            mergeFor(ownDraft, 'object', change.after?.id ?? change.before?.id),
          ) ||
          receipt.relationships?.some((change) => mergeFor(ownDraft, 'relationship', change.id))
        )
          throw new MapError('undo_draft_overlap');
        const proposed = undoSave(
          readState(),
          projectReceiptScope(receipt, householdId),
          tombstones,
          types.read(true),
          edgeTypes.read(true),
        );
        types.validateUndo(proposed);
        edgeTypes.validateUndo(proposed);
        return writeDraft(proposed);
      });
    },
    resolve(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        const current = checkedDraft(body.version, body.contentVersion);
        if (body.choice !== 'saved' && body.choice !== 'proposed')
          throw new MapError('invalid_request', 400);
        const conflict = draftConflicts(readState()).find((item) =>
          isDeepStrictEqual(item, body.conflict),
        );
        if (!conflict) throw new MapError('resolution_conflict');
        if (conflict.kind === 'object' || conflict.kind === 'relationship')
          assertMergeEditable(current, conflict.kind, conflict.id);
        if (conflict.kind === 'objectType') {
          return writeDraft(types.resolve(current, conflict.id, conflict.current, body.choice));
        }
        if (conflict.kind === 'relationshipType') {
          return writeDraft(edgeTypes.resolve(current, conflict.id, conflict.current, body.choice));
        }
        if (body.choice === 'proposed' && conflict.duplicates)
          throw new MapError('duplicate_relationship');
        if (body.choice === 'proposed' && conflict.missingEndpoints)
          throw new MapError('endpoint_conflict');
        if (body.choice === 'proposed' && conflict.type === null)
          throw new MapError('type_conflict');
        if (conflict.kind === 'object') {
          const change = current.changes.find((item) => item.id === conflict.id);
          if (!change) throw new MapError('resolution_conflict');
          if (body.choice === 'saved' || (!conflict.current && !change.after)) {
            current.changes = current.changes.filter((item) => item.id !== conflict.id);
            const remaining = keepIndependent('object', change, conflict.current);
            if (remaining)
              current.changes.push({
                ...change,
                ...remaining,
                beforeType: types.read().find((type) => type.id === remaining.before?.typeId),
                undo: undefined,
                undoFields: undefined,
                type:
                  types.effective(current).find((item) => item.id === remaining.after?.typeId) ??
                  change.type,
              });
          } else {
            if (!conflict.current && change.before) {
              if (!change.undo) throw new MapError('object_conflict');
              if (change.after) change.restoreRevision = tombstones.revision('object', change.id);
            }
            change.after = resolvedObjectValue(change, conflict.current);
            change.before = conflict.current;
            change.beforeType = types.read().find((type) => type.id === conflict.current?.typeId);
            if (conflict.type) change.type = conflict.type;
            if (change.after) readCustomValues(change.after.customValues, change.type);
            if (!change.after) edges.removeObject(current, change.id);
          }
          edges.reconcileObjectRemovals(current);
        } else {
          const change = current.relationships?.find((item) => item.id === conflict.id);
          if (!change) throw new MapError('resolution_conflict');
          if (body.choice === 'saved' || (!conflict.current && !change.after)) {
            current.relationships = current.relationships?.filter(
              (item) => item.id !== conflict.id,
            );
            const remaining = keepIndependent('relationship', change, conflict.current);
            if (remaining)
              current.relationships?.push({
                ...change,
                ...remaining,
                undo: undefined,
                undoFields: undefined,
                type:
                  edgeTypes
                    .effective(current)
                    .find((item) => item.id === remaining.after?.typeId) ?? change.type,
              });
          } else {
            if (!conflict.current && change.before) {
              if (!change.undo) throw new MapError('relationship_conflict');
              if (change.after)
                change.restoreRevision = tombstones.revision('relationship', change.id);
            }
            const before = change.before;
            change.after = resolvedRelationshipValue(change, conflict.current);
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
    merge(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        checkedDraft(body.version, body.contentVersion);
        return writeDraft(proposeMerge(readState(), body, types, edges, images));
      });
    },
    proposeObjectType(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        return writeDraft(types.propose(checkedDraft(body.version, body.contentVersion), body));
      });
    },
    proposeRelationship(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        const current = checkedDraft(body.version, body.contentVersion);
        assertMergeEditable(current, 'relationship', body.id);
        const result = edges.propose(current, body);
        return {
          ...writeDraft(result.draft),
          ...(result.existingId ? { existingId: result.existingId } : {}),
        };
      });
    },
    proposeRelationshipType(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        return writeDraft(edgeTypes.propose(checkedDraft(body.version, body.contentVersion), body));
      });
    },
    propose(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        const current = checkedDraft(body.version, body.contentVersion);
        if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
          throw new MapError('invalid_request', 400);
        const id = body.id;
        assertMergeEditable(current, 'object', id);
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
          const type = types.effective(current).find((item) => item.id === value.typeId);
          if (!type) throw new MapError('invalid_type', 400);
          if (body.typeRevision !== undefined && body.typeRevision !== type.revision)
            throw new MapError('type_conflict');
          const customValues = readCustomValues(value.customValues, type);
          const financialFacts = readFinancialFacts(value.financialFacts);
          const lifecycle = readLifecycle(value.lifecycle);
          // Older/manual clients that edit other facts must retain the image.
          const imageId = Object.hasOwn(value, 'profileImageId')
            ? value.profileImageId
            : existing
              ? existing.after?.profileImageId
              : before?.profileImageId;
          const profileImageId = imageId == null ? undefined : images.validate(imageId, id);
          after = {
            typeId: value.typeId,
            name: value.name.trim(),
            description: value.description,
            ...(value.identity ? { identity: value.identity } : {}),
            ...(financialFacts ? { financialFacts } : {}),
            ...(customValues ? { customValues } : {}),
            ...(lifecycle ? { lifecycle } : {}),
            ...(profileImageId ? { profileImageId } : {}),
          };
        }
        const typeId = after?.typeId ?? before?.typeId ?? existing?.type.id;
        const type = types.effective(current).find((item) => item.id === typeId);
        if (!type) throw new MapError('invalid_type', 400);
        const beforeType =
          existing?.beforeType ?? types.read().find((item) => item.id === before?.typeId);
        current.changes = current.changes.filter((change) => change.id !== id);
        if (before || after)
          current.changes.push({
            id,
            before,
            after,
            type,
            ...(beforeType ? { beforeType } : {}),
            ...(existing?.restoreRevision !== undefined
              ? { restoreRevision: existing.restoreRevision }
              : {}),
            ...(existing?.undo ? { undo: true } : {}),
            ...(existing?.undoFields ? { undoFields: existing.undoFields } : {}),
          });
        if (!after) edges.removeObject(current, id);
        edges.reconcileObjectRemovals(current);
        return writeDraft({ ...current, version: current.version + 1 });
      });
    },
    discard(version: unknown, contentVersion?: unknown) {
      return transaction(() => {
        operations.assertEditable();
        return writeDraft({
          version: checkedDraft(version, contentVersion).version + 1,
          changes: [],
        });
      });
    },
    discardChange(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        const current = checkedDraft(body.version, body.contentVersion);
        if (typeof body.id !== 'string') throw new MapError('invalid_request', 400);
        const merge = mergeFor(current, body.kind as string, body.id);
        if (merge)
          return writeDraft({ ...withoutMerge(current, merge), version: current.version + 1 });
        if (body.kind === 'object') {
          const change = current.changes.find((item) => item.id === body.id);
          if (!change) throw new MapError('draft_conflict');
          if (!change.before) edges.removeObject(current, change.id);
          current.changes = current.changes.filter((item) => item.id !== body.id);
          edges.reconcileObjectRemovals(current);
        } else if (body.kind === 'relationship') {
          current.relationships = current.relationships?.filter((item) => item.id !== body.id);
        } else if (body.kind === 'objectType') {
          current.objectTypes = current.objectTypes?.filter((item) => item.id !== body.id);
        } else if (body.kind === 'relationshipType') {
          current.relationshipTypes = current.relationshipTypes?.filter(
            (item) => item.id !== body.id,
          );
        } else throw new MapError('invalid_request', 400);
        return writeDraft({ ...current, version: current.version + 1 });
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
            const current = checkedDraft(body.version, body.contentVersion);
            if (operations.hash(current) !== previous.draftHash)
              throw new MapError('operation_conflict');
            if (
              !current.changes.length &&
              !current.relationships?.length &&
              !current.objectTypes?.length &&
              !current.relationshipTypes?.length
            )
              throw new MapError('empty_draft');
            const receipt: SaveReceipt = {
              contentVersion: operations.contentVersion(),
              operationId: registered.operationId,
              householdId,
              userId,
              draftVersion: current.version,
              savedAt: new Date().toISOString(),
              actorName: (
                database.prepare('SELECT name FROM user WHERE id = ?').get(actorId) as {
                  name: string;
                }
              ).name,
              changes: [],
            };
            const previousTypes = types.read();
            const previousEdgeTypes = edgeTypes.read();
            const definitionChanges = types.save(current);
            if (definitionChanges.length) receipt.objectTypes = definitionChanges;
            const relationshipDefinitions = edgeTypes.save(current);
            if (relationshipDefinitions.length) receipt.relationshipTypes = relationshipDefinitions;
            for (const change of current.changes) {
              if (change.after?.identity === 'unresolved')
                throw new MapError('unresolved_identity');
              const saved = object(change.id);
              if (!isDeepStrictEqual(saved ?? null, change.before))
                throw new MapError('object_conflict');
              const removedType = !change.after
                ? current.objectTypes?.find((item) => item.id === change.type.id && !item.after)
                    ?.before
                : null;
              const type =
                removedType ?? types.read(!change.after).find((item) => item.id === change.type.id);
              if (
                !type ||
                type.revision !== change.type.revision ||
                (change.after &&
                  !compatibleCustomFields(change.after.customValues, change.type, type))
              )
                throw new MapError('type_conflict');
              if (change.after) {
                readCustomValues(change.after.customValues, type);
                if (change.after.profileImageId)
                  images.validate(change.after.profileImageId, change.id);
              }
              const after = change.after
                ? {
                    id: change.id,
                    householdId,
                    typeId: change.after.typeId,
                    revision: (saved?.revision ?? change.restoreRevision ?? 0) + 1,
                    name: change.after.name,
                    description: change.after.description,
                    ...(change.after.customValues
                      ? { customValues: change.after.customValues }
                      : {}),
                    ...(change.after.profileImageId
                      ? { profileImageId: change.after.profileImageId }
                      : {}),
                    ...(change.after.identity ? { identity: change.after.identity } : {}),
                    ...(change.after.lifecycle ? { lifecycle: change.after.lifecycle } : {}),
                    ...(change.after.financialFacts
                      ? { financialFacts: change.after.financialFacts }
                      : {}),
                  }
                : null;
              if (after) {
                if (!saved) tombstones.assertCreation('object', change.id, change.restoreRevision);
                database
                  .prepare(`INSERT INTO map_object (id, householdId, typeId, revision, name, description, identity, financialFacts, customValues, lifecycle, profileImageId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET typeId = excluded.typeId, revision = excluded.revision, name = excluded.name, description = excluded.description, identity = excluded.identity, financialFacts = excluded.financialFacts, customValues = excluded.customValues, lifecycle = excluded.lifecycle, profileImageId = excluded.profileImageId, deleted = 0`)
                  .run(
                    after.id,
                    householdId,
                    after.typeId,
                    after.revision,
                    after.name,
                    after.description,
                    after.identity ?? null,
                    after.financialFacts ? JSON.stringify(after.financialFacts) : null,
                    after.customValues ? JSON.stringify(after.customValues) : null,
                    after.lifecycle ?? null,
                    after.profileImageId ?? null,
                  );
              } else
                database
                  .prepare(
                    'UPDATE map_object SET deleted = 1, revision = revision + 1 WHERE householdId = ? AND id = ?',
                  )
                  .run(householdId, change.id);
              const beforeType = change.before
                ? previousTypes.find((item) => item.id === change.before?.typeId)
                : undefined;
              receipt.changes.push({
                before: change.before,
                after,
                type,
                ...(change.merge
                  ? {
                      merge: {
                        survivorId: change.merge.survivorId,
                        absorbedId: change.merge.absorbedId,
                        identityConfirmed: change.merge.identityConfirmed,
                        objects: change.merge.objects,
                        types: change.merge.types,
                        relationships: change.merge.relationships,
                        relationshipTypes: change.merge.relationshipTypes,
                        objectNames: change.merge.objectNames,
                        ...(change.merge.imageCopy ? { imageCopy: change.merge.imageCopy } : {}),
                      },
                    }
                  : {}),
                ...(beforeType && !isDeepStrictEqual(beforeType, type) ? { beforeType } : {}),
              });
            }
            const relationshipChanges = edges.save(current, previousEdgeTypes);
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
            database
              .prepare('INSERT INTO map_save VALUES (?, ?, ?, ?, ?)')
              .run(body.operationId, householdId, userId, current.version, JSON.stringify(receipt));
            writeDraft({ version: current.version + 1, changes: [] });
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
