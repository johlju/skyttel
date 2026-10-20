import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import {
  type ConflictChoices,
  combineConflictProperties,
  conflictBasis,
  conflictCombinationError,
  conflictProperties,
  conflictPropertyValue,
  sameConflictValue,
} from '../shared/conflict-properties.js';
import { conflictRemovalPlan } from '../shared/conflict-removal.js';
import { specialConflict } from '../shared/conflict-special.js';
import { removedConflictDefinition } from '../shared/definition-restoration.js';
import {
  draftConflicts,
  resolvedObjectValue,
  resolvedRelationshipValue,
} from '../shared/draft-conflicts.js';
import {
  type DraftProposalKind,
  draftDiscardPlan,
  draftProposalRefs,
} from '../shared/draft-discard.js';
import type {
  MapDraft,
  MapObject,
  MapState,
  ObjectType,
  ObjectValue,
  SaveReceipt,
} from '../shared/map.js';
import { isObjectIconId } from '../shared/object-icons.js';
import type {
  RelationshipFormOutcome,
  RelationshipFormResult,
} from '../shared/relationship-form.js';
import { assistantTaskAccess } from './assistant-auth.js';
import { contentOwner } from './content-identities.js';
import { assertContentAvailable, assertContentVersion } from './content-maintenance.js';
import { householdAccess } from './households.js';
import { readLifecycle } from './lifecycle.js';
import { MapError } from './map-error.js';
import { mapOperations } from './map-operations.js';
import { mapTombstones } from './map-tombstones.js';
import { objectTypes } from './object-types.js';
import { type EncodedImage, profileImages } from './profile-images.js';
import { readProperties } from './properties.js';
import { relationshipFormAttempts } from './relationship-form-attempts.js';
import { relationshipTypes } from './relationship-types.js';
import { relationships } from './relationships.js';

export { MapError } from './map-error.js';

export function householdMap(database: Database.Database, actorId: string, householdId: string) {
  const userId = database
    .transaction(() => {
      assistantTaskAccess.getStore()?.();
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
    // Runs inside the same immediate transaction as a mutation or save registration.
    assistantTaskAccess.getStore()?.();
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
        'SELECT id, householdId, typeId, revision, name, identity, lifecycle, profileImageId, iconId, properties FROM map_object WHERE householdId = ? AND id = ? AND deleted = 0',
      )
      .get(householdId, id);
    return row ? readObject(row) : undefined;
  }
  function readObject(row: unknown): MapObject {
    const {
      identity,

      lifecycle,
      profileImageId,
      iconId,
      properties,
      ...value
    } = row as Omit<
      MapObject,
      'identity' | 'lifecycle' | 'profileImageId' | 'iconId' | 'properties'
    > & {
      identity: MapObject['identity'] | null;

      properties: string | null;
      lifecycle: MapObject['lifecycle'] | null;
      profileImageId: string | null;
      iconId: string | null;
    };
    return {
      ...value,
      ...(identity ? { identity } : {}),

      ...(properties ? { properties: JSON.parse(properties) } : {}),
      ...(lifecycle ? { lifecycle } : {}),
      ...(profileImageId ? { profileImageId } : {}),
      ...(iconId ? { iconId } : {}),
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
  function removeProposal(current: MapDraft, body: Record<string, unknown>) {
    if (typeof body.id !== 'string') throw new MapError('invalid_request', 400);
    if (!['object', 'relationship', 'objectType', 'relationshipType'].includes(String(body.kind)))
      throw new MapError('invalid_request', 400);
    if (!draftProposalRefs(current).some(({ kind, id }) => kind === body.kind && id === body.id))
      throw new MapError('draft_conflict');
    if (body.kind === 'object') {
      const change = current.changes.find((item) => item.id === body.id);
      if (!change?.before) edges.removeObject(current, body.id);
      current.changes = current.changes.filter((item) => item.id !== body.id);
      edges.reconcileObjectRemovals(current);
    } else if (body.kind === 'relationship') {
      current.relationships = current.relationships?.filter((item) => item.id !== body.id);
    } else if (body.kind === 'objectType') {
      current.objectTypes = current.objectTypes?.filter((item) => item.id !== body.id);
    } else if (body.kind === 'relationshipType') {
      current.relationshipTypes = current.relationshipTypes?.filter((item) => item.id !== body.id);
    } else throw new MapError('invalid_request', 400);
    return current;
  }
  function readState(): MapState {
    const removed = database
      .prepare(
        'SELECT id, householdId, typeId, revision, name, identity, lifecycle, profileImageId, iconId, properties FROM map_object WHERE householdId = ? AND deleted = 1 ORDER BY name, id',
      )
      .all(householdId)
      .map(readObject);
    const removedTypes = new Map<string, ObjectType>();
    if (removed.length) {
      // Deletion receipts retain the field meanings at removal, even if a type changes later.
      const receipts = database
        .prepare(`SELECT s.receipt FROM map_history h
        JOIN map_save s ON s.householdId = h.householdId AND s.userId = h.userId AND s.operationId = h.operationId
        WHERE h.householdId = ? ORDER BY h.id DESC`)
        .all(householdId) as { receipt: string }[];
      for (const row of receipts) {
        const receipt = JSON.parse(row.receipt) as SaveReceipt;
        for (const change of receipt.changes)
          if (change.before && !change.after && !removedTypes.has(change.before.id))
            removedTypes.set(change.before.id, change.beforeType ?? change.type);
      }
    }
    const allTypes = removed.length ? types.read(true) : [];
    const removedObjects = removed.map((object) => ({
      object,
      type: removedTypes.get(object.id) ?? allTypes.find((type) => type.id === object.typeId),
    }));
    const state: MapState = {
      userId,
      contentVersion: operations.contentVersion(),
      relationshipTypes: edges.types(),
      relationships: edges.read(),
      types: types.read(),
      objects: database
        .prepare(
          'SELECT id, householdId, typeId, revision, name, identity, lifecycle, profileImageId, iconId, properties FROM map_object WHERE householdId = ? AND deleted = 0 ORDER BY name, id',
        )
        .all(householdId)
        .map(readObject),
      draft: draft(),
      ...(removedObjects.length ? { removedObjects } : {}),
    };
    const objectDefinitionIds = new Set(state.draft.objectTypes?.map((change) => change.id));
    const relationshipDefinitionIds = new Set(
      state.draft.relationshipTypes?.map((change) => change.id),
    );
    const objectTypes = types
      .read(true)
      .filter(
        (type) =>
          objectDefinitionIds.has(type.id) && !state.types.some((active) => active.id === type.id),
      );
    const relationshipTypes = edgeTypes
      .read(true)
      .filter(
        (type) =>
          relationshipDefinitionIds.has(type.id) &&
          !state.relationshipTypes.some((active) => active.id === type.id),
      );
    if (objectTypes.length || relationshipTypes.length)
      state.removedDefinitions = { objectTypes, relationshipTypes };
    const conflicts = draftConflicts(state);
    if (conflicts.length) {
      const actors: NonNullable<MapState['conflictActors']> = {};
      const propertyActors: NonNullable<MapState['conflictPropertyActors']> = {};
      const remainingProperties = new Map(
        conflicts.map((conflict) => [
          `${conflict.kind}:${conflict.id}`,
          new Set(conflictProperties(state, conflict).map((field) => field.key)),
        ]),
      );
      const receipts = database
        .prepare(
          `SELECT s.receipt FROM map_history h JOIN map_save s ON s.householdId = h.householdId AND s.userId = h.userId AND s.operationId = h.operationId WHERE h.householdId = ? ORDER BY h.id DESC`,
        )
        .all(householdId) as { receipt: string }[];
      for (const row of receipts) {
        const receipt = JSON.parse(row.receipt) as SaveReceipt;
        for (const conflict of conflicts) {
          const key = `${conflict.kind}:${conflict.id}`;
          const changes =
            conflict.kind === 'object'
              ? receipt.changes
              : conflict.kind === 'relationship'
                ? receipt.relationships
                : conflict.kind === 'objectType'
                  ? receipt.objectTypes
                  : receipt.relationshipTypes;
          const change = changes?.find(
            (change) =>
              ('id' in change ? change.id : (change.after?.id ?? change.before?.id)) ===
              conflict.id,
          );
          if (!change) continue;
          const name = receipt.actorName?.trim().split(/\s+/)[0];
          const actor = name ? { name, savedAt: receipt.savedAt } : undefined;
          if (
            !actors[key] &&
            actor &&
            (change.after?.revision ?? null) === (conflict.current?.revision ?? null)
          )
            actors[key] = actor;
          for (const property of remainingProperties.get(key) ?? []) {
            const before = conflictPropertyValue(change.before, property);
            const after = conflictPropertyValue(change.after, property);
            if (sameConflictValue(before, after)) continue;
            // Stop at the latest actual write, including a receipt without known authorship.
            remainingProperties.get(key)?.delete(property);
            if (
              actor &&
              sameConflictValue(after, conflictPropertyValue(conflict.current, property))
            ) {
              propertyActors[key] ??= {};
              propertyActors[key][property] = actor;
            }
          }
        }
      }
      if (Object.keys(actors).length) state.conflictActors = actors;
      if (Object.keys(propertyActors).length) state.conflictPropertyActors = propertyActors;
    }
    return state;
  }

  function imageChange(body: Record<string, unknown>) {
    operations.assertEditable();
    const current = checkedDraft(body.version, body.contentVersion);
    if (body.contentVersion !== operations.contentVersion()) throw new MapError('content_conflict');
    if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
      throw new MapError('invalid_request', 400);
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
        WHERE h.householdId = ? ORDER BY h.id DESC`)
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
        const current = checkedDraft(body.version, body.contentVersion);
        if (
          body.command === undefined &&
          body.choices === undefined &&
          body.choice !== 'saved' &&
          body.choice !== 'proposed'
        )
          throw new MapError('invalid_request', 400);
        const conflict = draftConflicts(readState()).find((item) =>
          isDeepStrictEqual(item, body.conflict),
        );
        if (!conflict) throw new MapError('resolution_conflict');
        if (body.command !== undefined) {
          const state = readState();
          if (!isDeepStrictEqual(body.basis, conflictBasis(state, conflict)))
            throw new MapError('resolution_conflict');
          const special = specialConflict(state, conflict);
          if (body.command === 'definition-choice' && special?.kind === 'removed-definition') {
            if (body.definitionChoice !== 'saved' && body.definitionChoice !== 'proposed')
              throw new MapError('invalid_request', 400);
            if (body.definitionChoice === 'saved') {
              if (conflict.kind === 'objectType')
                current.objectTypes = current.objectTypes?.filter(
                  (change) => change.id !== conflict.id,
                );
              else
                current.relationshipTypes = current.relationshipTypes?.filter(
                  (change) => change.id !== conflict.id,
                );
              return writeDraft({ ...current, version: current.version + 1 });
            }
            const definition = removedConflictDefinition(state, conflict);
            if (!definition) throw new MapError('type_conflict');
            return writeDraft(
              conflict.kind === 'objectType'
                ? types.restore(current, conflict.id, definition, state.contentVersion)
                : edgeTypes.restore(current, conflict.id, definition, state.contentVersion),
            );
          }
          if (body.command === 'removal-choices' && special?.kind === 'own-removal') {
            if (
              !body.removalChoices ||
              typeof body.removalChoices !== 'object' ||
              Array.isArray(body.removalChoices)
            )
              throw new MapError('invalid_request', 400);
            const resolved = conflictRemovalPlan(
              state,
              conflict,
              body.removalChoices as ConflictChoices,
            );
            if (!resolved) throw new MapError('invalid_resolution', 400);
            edges.reconcileObjectRemovals(resolved.draft);
            return writeDraft({ ...resolved.draft, version: current.version + 1 });
          }
          if (
            body.command !== 'discard-proposal' ||
            !special?.action ||
            special.kind === 'own-removal'
          )
            throw new MapError('invalid_resolution', 400);
          if (conflict.kind === 'object')
            current.changes = current.changes.filter((change) => change.id !== conflict.id);
          else if (conflict.kind === 'relationship')
            current.relationships = current.relationships?.filter(
              (change) => change.id !== conflict.id,
            );
          else throw new MapError('invalid_resolution', 400);
          edges.reconcileObjectRemovals(current);
          return writeDraft({ ...current, version: current.version + 1 });
        }
        if (body.choices !== undefined) {
          const state = readState();
          if (!isDeepStrictEqual(body.basis, conflictBasis(state, conflict)))
            throw new MapError('resolution_conflict');
          if (!body.choices || typeof body.choices !== 'object' || Array.isArray(body.choices))
            throw new MapError('invalid_request', 400);
          const fields = conflictProperties(state, conflict);
          const choices = body.choices as ConflictChoices;
          if (
            Object.entries(choices).some(
              ([key, value]) =>
                !fields.some((field) => field.key === key) ||
                !['saved', 'proposed'].includes(value),
            )
          )
            throw new MapError('invalid_request', 400);
          const value = combineConflictProperties(fields, choices);
          if (
            !fields.length ||
            !value ||
            fields.some(
              (field) =>
                !sameConflictValue(field.saved, field.proposed) &&
                !field.automatic &&
                !choices[field.key],
            )
          )
            throw new MapError('resolution_choices_required', 400);
          if (conflictCombinationError(state, conflict, value))
            throw new MapError('invalid_resolution', 400);
          if (
            fields.every(
              (field) =>
                sameConflictValue(field.saved, field.proposed) ||
                (field.automatic ?? choices[field.key]) === 'saved',
            )
          ) {
            if (conflict.kind === 'object')
              current.changes = current.changes.filter((change) => change.id !== conflict.id);
            else if (conflict.kind === 'relationship')
              current.relationships = current.relationships?.filter(
                (change) => change.id !== conflict.id,
              );
            else if (conflict.kind === 'objectType')
              current.objectTypes = current.objectTypes?.filter(
                (change) => change.id !== conflict.id,
              );
            else
              current.relationshipTypes = current.relationshipTypes?.filter(
                (change) => change.id !== conflict.id,
              );
            edges.reconcileObjectRemovals(current);
            return writeDraft({ ...current, version: current.version + 1 });
          }
          if (conflict.kind === 'object') {
            const change = current.changes.find((item) => item.id === conflict.id);
            if (!change || !conflict.current) throw new MapError('resolution_conflict');
            const type = types.effective(current).find((type) => type.id === value.typeId);
            if (!type) throw new MapError('type_conflict');
            const after = value as unknown as ObjectValue;
            readProperties(after.properties);

            readLifecycle(after.lifecycle);
            if (after.profileImageId) images.validate(after.profileImageId, change.id);
            change.before = conflict.current;
            change.beforeType = types.read().find((type) => type.id === conflict.current?.typeId);
            change.type = type;
            change.after = after;

            return writeDraft({ ...current, version: current.version + 1 });
          }
          if (conflict.kind === 'relationship') {
            const change = current.relationships?.find((item) => item.id === conflict.id);
            if (!change || !conflict.current) throw new MapError('resolution_conflict');
            change.before = conflict.current;

            return writeDraft(
              edges.propose(current, {
                id: conflict.id,
                baseRevision: conflict.current.revision,
                value,
              }).draft,
            );
          }
          const change = (
            conflict.kind === 'objectType' ? current.objectTypes : current.relationshipTypes
          )?.find((item) => item.id === conflict.id);
          if (!change || !conflict.current) throw new MapError('resolution_conflict');
          change.before = conflict.current;
          delete change.restoration;
          const definitions = conflict.kind === 'objectType' ? types : edgeTypes;
          return writeDraft(
            definitions.propose(current, {
              id: conflict.id,
              baseRevision: conflict.current.revision,
              value,
            }),
          );
        }
        if (conflict.kind === 'objectType') {
          if (body.choice !== 'saved' && body.choice !== 'proposed')
            throw new MapError('invalid_request', 400);
          return writeDraft(types.resolve(current, conflict.id, conflict.current, body.choice));
        }
        if (conflict.kind === 'relationshipType') {
          if (body.choice !== 'saved' && body.choice !== 'proposed')
            throw new MapError('invalid_request', 400);
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
          } else {
            if (!conflict.current && change.before) throw new MapError('object_conflict');
            change.after = resolvedObjectValue(change, conflict.current);
            change.before = conflict.current;
            change.beforeType = types.read().find((type) => type.id === conflict.current?.typeId);
            if (conflict.type) change.type = conflict.type;

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
          } else {
            if (!conflict.current && change.before) throw new MapError('relationship_conflict');
            const before = change.before;
            change.after = resolvedRelationshipValue(change, conflict.current);
            change.before = conflict.current;
            change.beforeType = edgeTypes
              .read()
              .find((type) => type.id === conflict.current?.typeId);
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
        for (const change of current.relationships ?? [])
          if (change.after && change.id === conflict.id) {
            edges.assertValid(current, change.after, change.id);
          }
        return writeDraft({ ...current, version: current.version + 1 });
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
        const result = edges.propose(current, body);
        return {
          ...writeDraft(result.draft),
          ...(result.existingId ? { existingId: result.existingId } : {}),
        };
      });
    },
    relationshipFormOutcome(stagingId: string, contentVersion: number): RelationshipFormResult {
      return transaction(() => {
        assertContentVersion(database, householdId, contentVersion);
        const attempts = relationshipFormAttempts(database, householdId, userId, contentVersion);
        return { outcome: attempts.outcome(stagingId), state: readState() };
      });
    },
    proposeRelationshipForm(body: Record<string, unknown>): RelationshipFormResult {
      return transaction(() => {
        if (!Number.isSafeInteger(body.contentVersion) || (body.contentVersion as number) < 1)
          throw new MapError('invalid_request', 400);
        if (!Number.isSafeInteger(body.typeRevision) || (body.typeRevision as number) < 0)
          throw new MapError('invalid_request', 400);
        assertContentVersion(database, householdId, body.contentVersion);
        const attempts = relationshipFormAttempts(
          database,
          householdId,
          userId,
          body.contentVersion as number,
        );
        const previous = attempts.previous(body);
        if (previous) return { outcome: previous, state: readState() };
        operations.assertEditable();
        const current = checkedDraft(body.version, body.contentVersion);
        const result = edges.propose(current, body, true);
        let outcome: RelationshipFormOutcome;
        if (result.existingId)
          outcome = {
            status: 'duplicate',
            stagingId: body.stagingId as string,
            relationshipId: result.existingId,
          };
        else {
          writeDraft(result.draft);
          outcome = {
            status: 'staged',
            stagingId: body.stagingId as string,
            relationshipId: body.id as string,
            draftVersion: result.draft.version,
            value:
              result.draft.relationships?.find((change) => change.id === body.id)?.after ?? null,
          };
        }
        attempts.record(body, outcome);
        return { outcome, state: readState() };
      });
    },
    proposeRelationshipType(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        return writeDraft(edgeTypes.propose(checkedDraft(body.version, body.contentVersion), body));
      });
    },
    propose(body: Record<string, unknown>, image?: EncodedImage) {
      return transaction(() => {
        operations.assertEditable();
        const current = checkedDraft(body.version, body.contentVersion);
        if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
          throw new MapError('invalid_request', 400);
        const id = body.id;
        if (
          body.stagingId !== undefined &&
          (typeof body.stagingId !== 'string' ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.stagingId))
        )
          throw new MapError('invalid_request', 400);
        const existing = current.changes.find((change) => change.id === id);
        const before = existing ? existing.before : (object(id) ?? null);
        if ((before?.revision ?? null) !== body.baseRevision) throw new MapError('object_conflict');
        let after: ObjectValue | null = null;
        if (body.value !== null) {
          const value = body.value as Partial<ObjectValue> | undefined;
          if (
            !value ||
            Object.keys(value).some((key) =>
              ['description', 'financialFacts', 'customValues'].includes(key),
            ) ||
            typeof value.name !== 'string' ||
            !value.name.trim() ||
            value.name.length > 200 ||
            typeof value.typeId !== 'string' ||
            (value.identity !== undefined &&
              !['unspecified', 'unresolved'].includes(value.identity))
          )
            throw new MapError('invalid_request', 400);
          const type = types.effective(current).find((item) => item.id === value.typeId);
          if (!type) throw new MapError('invalid_type', 400);
          if (body.typeRevision !== undefined && body.typeRevision !== type.revision)
            throw new MapError('type_conflict');

          const properties = readProperties(
            value.properties,
            existing ? existing.after?.properties : before?.properties,
          );

          const lifecycle = readLifecycle(value.lifecycle);
          // Older/manual clients that edit other facts must retain the image.
          const imageId = Object.hasOwn(value, 'profileImageId')
            ? value.profileImageId
            : existing
              ? existing.after?.profileImageId
              : before?.profileImageId;
          const profileImageId =
            imageId == null || image ? undefined : images.validate(imageId, id);
          const iconChoice = Object.hasOwn(value, 'iconId')
            ? value.iconId
            : existing
              ? existing.after?.iconId
              : before?.iconId;
          if (iconChoice != null && !isObjectIconId(iconChoice))
            throw new MapError('invalid_request', 400);
          const iconId = iconChoice ?? undefined;
          after = {
            typeId: value.typeId,
            name: value.name.trim(),
            ...(value.identity ? { identity: value.identity } : {}),
            ...(properties ? { properties } : {}),
            ...(lifecycle ? { lifecycle } : {}),
            ...(profileImageId ? { profileImageId } : {}),
            ...(iconId ? { iconId } : {}),
          };
        }
        const typeId = after?.typeId ?? before?.typeId ?? existing?.type.id;
        const type = types.effective(current).find((item) => item.id === typeId);
        if (!type) throw new MapError('invalid_type', 400);
        // Insert only after all form values are valid, inside the same draft transaction.
        if (image) {
          if (!after) throw new MapError('invalid_request', 400);
          after.profileImageId = images.insert(id, image);
        }
        const beforeType =
          existing?.beforeType ?? types.read().find((item) => item.id === before?.typeId);
        current.changes = current.changes.filter((change) => change.id !== id);
        if (before || after)
          current.changes.push({
            proposedAt: new Date().toISOString(),
            ...(typeof body.stagingId === 'string' ? { stagingId: body.stagingId } : {}),
            id,
            before,
            after,
            type,
            ...(beforeType ? { beforeType } : {}),
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
        removeProposal(current, body);
        return writeDraft({ ...current, version: current.version + 1 });
      });
    },
    discardReview(body: Record<string, unknown>) {
      return transaction(() => {
        operations.assertEditable();
        const current = checkedDraft(body.version, body.contentVersion);
        const after =
          body.kind === 'all'
            ? { version: current.version, changes: [] }
            : removeProposal(structuredClone(current), body);
        const plan = draftDiscardPlan(
          readState(),
          after,
          body.kind as DraftProposalKind | 'all',
          body.id as string,
        );
        if (body.confirmation === undefined) return { plan };
        if (!isDeepStrictEqual(body.confirmation, plan)) throw new MapError('draft_conflict');
        writeDraft({ ...after, version: current.version + 1 });
        return { plan, state: readState() };
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
              if (!type || type.revision !== change.type.revision)
                throw new MapError('type_conflict');
              if (change.after) {
                readProperties(change.after.properties);
                if (change.after.iconId !== undefined && !isObjectIconId(change.after.iconId))
                  throw new MapError('invalid_request', 400);

                if (change.after.profileImageId)
                  images.validate(change.after.profileImageId, change.id);
              }
              const after = change.after
                ? {
                    id: change.id,
                    householdId,
                    typeId: change.after.typeId,
                    revision: (saved?.revision ?? 0) + 1,
                    name: change.after.name,
                    ...(change.after.properties ? { properties: change.after.properties } : {}),
                    ...(change.after.iconId ? { iconId: change.after.iconId } : {}),
                    ...(change.after.profileImageId
                      ? { profileImageId: change.after.profileImageId }
                      : {}),
                    ...(change.after.identity ? { identity: change.after.identity } : {}),
                    ...(change.after.lifecycle ? { lifecycle: change.after.lifecycle } : {}),
                  }
                : null;
              if (after) {
                if (!saved) tombstones.assertCreation('object', change.id);
                database
                  .prepare(`INSERT INTO map_object (id, householdId, typeId, revision, name, identity, lifecycle, profileImageId, iconId, properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET typeId = excluded.typeId, revision = excluded.revision, name = excluded.name, identity = excluded.identity, lifecycle = excluded.lifecycle, profileImageId = excluded.profileImageId, iconId = excluded.iconId, properties = excluded.properties, deleted = 0`)
                  .run(
                    after.id,
                    householdId,
                    after.typeId,
                    after.revision,
                    after.name,
                    after.identity ?? null,
                    after.lifecycle ?? null,
                    after.profileImageId ?? null,
                    after.iconId ?? null,
                    after.properties ? JSON.stringify(after.properties) : null,
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
