import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import type {
  DraftRelationshipChange,
  MapDraft,
  MapRelationship,
  RelationshipType,
  RelationshipValue,
  SavedRelationshipChange,
  SaveReceipt,
} from '../shared/map.js';
import { proposedRelationships } from '../shared/map.js';
import { readLifecycle } from './lifecycle.js';
import { MapError } from './map-error.js';
import { mapTombstones } from './map-tombstones.js';
import { readProperties } from './properties.js';
import { relationshipTypes } from './relationship-types.js';

// All operations run inside the map's authorized, immediate transaction.
export function relationships(database: Database.Database, householdId: string) {
  const definitions = relationshipTypes(database, householdId);
  const tombstones = mapTombstones(database, householdId);
  function read(): MapRelationship[] {
    return database
      .prepare(
        'SELECT id, householdId, typeId, revision, sourceId, targetId, lifecycle, properties FROM map_relationship WHERE householdId = ? AND deleted = 0 ORDER BY id',
      )
      .all(householdId)
      .map((row) => {
        const { lifecycle, properties, ...value } = row as Omit<
          MapRelationship,
          'lifecycle' | 'properties'
        > & {
          lifecycle: MapRelationship['lifecycle'] | null;

          properties: string | null;
        };
        return {
          ...value,

          ...(properties ? { properties: JSON.parse(properties) } : {}),
          ...(lifecycle ? { lifecycle } : {}),
        };
      });
  }
  const types = definitions.read;
  function effective(draft: MapDraft) {
    return [...proposedRelationships(read(), draft.relationships).values()];
  }

  function savedEndpoint(id: string) {
    return database
      .prepare('SELECT identity FROM map_object WHERE householdId = ? AND id = ? AND deleted = 0')
      .get(householdId, id) as { identity?: string } | undefined;
  }
  function endpoint(id: string, draft: MapDraft) {
    const proposed = draft.changes.find((change) => change.id === id);
    if (proposed) {
      if (!proposed.after) return null;
      const saved = database
        .prepare('SELECT householdId, deleted FROM map_object WHERE id = ?')
        .get(id) as { householdId: string; deleted: number } | undefined;
      if (proposed.before ? !saved || saved.deleted || saved.householdId !== householdId : saved)
        return null;
      return proposed.after;
    }
    return savedEndpoint(id);
  }
  function sameEndpoints(left: RelationshipValue, right: RelationshipValue) {
    return (
      left.typeId === right.typeId &&
      left.sourceId === right.sourceId &&
      left.targetId === right.targetId
    );
  }
  function assertEndpoints(draft: MapDraft, value: RelationshipValue) {
    if (
      !value.sourceId ||
      !value.targetId ||
      !endpoint(value.sourceId, draft) ||
      !endpoint(value.targetId, draft)
    )
      throw new MapError('invalid_endpoint', 400);
  }
  function removedRevision(id: string) {
    return (
      database
        .prepare(
          'SELECT revision FROM map_relationship WHERE householdId = ? AND id = ? AND deleted = 1',
        )
        .get(householdId, id) as { revision: number } | undefined
    )?.revision;
  }
  function endpointRecovery(draft: MapDraft, change: DraftRelationshipChange | undefined) {
    if (!change?.before || !change.after || read().some(({ id }) => id === change.id)) return;
    if (change.endpointRecovery?.removedRevision === removedRevision(change.id))
      return change.endpointRecovery;
    const missing = [change.after.sourceId, change.after.targetId].filter((id): id is string =>
      Boolean(id && !endpoint(id, draft)),
    );
    if (!missing.length) return;
    const history = database
      .prepare(`SELECT s.receipt FROM map_history h
      JOIN map_save s ON s.householdId = h.householdId AND s.userId = h.userId AND s.operationId = h.operationId
      WHERE h.householdId = ? ORDER BY h.id DESC`)
      .all(householdId) as { receipt: string }[];
    for (const row of history) {
      const receipt = JSON.parse(row.receipt) as SaveReceipt;
      const removal = receipt.relationships?.find(({ id }) => id === change.id);
      if (!removal) continue;
      if (
        !removal.after &&
        removal.before &&
        removal.before.revision + 1 === removedRevision(change.id) &&
        receipt.changes.some(
          ({ before, after }) =>
            before &&
            !after &&
            missing.includes(before.id) &&
            (removal.before?.sourceId === before.id || removal.before?.targetId === before.id),
        )
      )
        return { removedRevision: removal.before.revision + 1 };
      return;
    }
  }
  function assertValid(draft: MapDraft, value: RelationshipValue, id: string) {
    assertEndpoints(draft, value);
    if (effective(draft).some((other) => other.id !== id && sameEndpoints(other, value)))
      throw new MapError('duplicate_relationship');
  }
  function objectNames(
    draft: MapDraft,
    before: RelationshipValue | null,
    after: RelationshipValue | null,
    previous: Record<string, string> = {},
  ) {
    const names = new Map<string, string>();
    for (const id of [before?.sourceId, before?.targetId, after?.sourceId, after?.targetId]) {
      if (!id) continue;
      const saved = database
        .prepare('SELECT name FROM map_object WHERE householdId = ? AND id = ?')
        .get(householdId, id) as { name: string } | undefined;
      const name =
        (Object.hasOwn(previous, id) ? previous[id] : undefined) ??
        saved?.name ??
        draft.changes.find((change) => change.id === id)?.after?.name;
      if (name !== undefined) names.set(id, name);
    }
    return Object.fromEntries(names);
  }
  function reconcileObjectRemovals(draft: MapDraft) {
    const removedObjects = draft.changes.filter((change) => !change.after);
    draft.relationships = draft.relationships?.flatMap((change) => {
      const causes = change.removedWithObjects;
      // Explicit deletions and older drafts without provenance keep their proposals.
      if (!causes) return [change];
      change.removedWithObjects = removedObjects
        .filter(
          ({ id }) =>
            causes.includes(id) ||
            change.before?.sourceId === id ||
            change.before?.targetId === id ||
            change.suppressed?.after?.sourceId === id ||
            change.suppressed?.after?.targetId === id,
        )
        .map(({ id }) => id);
      if (change.removedWithObjects.length) return [change];
      return change.suppressed ? [change.suppressed] : [];
    });
  }
  return {
    read,
    types,
    reconcileObjectRemovals,
    assertValid,
    removeObject(draft: MapDraft, id: string) {
      const retainedRemoval = draft.changes.some(
        (change) => change.id === id && change.before && !change.after,
      );
      // Deletion consequences include both saved endpoints and this owner's edits.
      for (const value of [...read(), ...effective(draft)]) {
        if (value.sourceId !== id && value.targetId !== id) continue;
        const existing = draft.relationships?.find((change) => change.id === value.id);
        // A second endpoint removal adds a cause during reconciliation, never a nested snapshot.
        // Separately requested deletions retain their independent intent.
        if (existing && !existing.after) continue;
        const before = existing ? existing.before : value;
        if (!retainedRemoval && !before) {
          draft.relationships = draft.relationships?.filter((change) => change.id !== value.id);
          continue;
        }
        const removal: DraftRelationshipChange = {
          id: value.id,
          before,
          after: null,
          removedWithObjects: [id],
          ...(existing && retainedRemoval ? { suppressed: structuredClone(existing) } : {}),
          beforeType:
            existing?.beforeType ?? definitions.read().find((type) => type.id === before?.typeId),
          objectNames: existing?.objectNames ?? objectNames(draft, before, null),
          type:
            existing && existing.type.id === before?.typeId
              ? existing.type
              : (definitions
                  .effective(draft)
                  .find(
                    (type) => type.id === (before?.typeId ?? value.typeId),
                  ) as RelationshipType),
        };
        if (existing) Object.assign(existing, removal);
        else {
          draft.relationships ??= [];
          draft.relationships.push(removal);
        }
      }
    },
    propose(draft: MapDraft, body: Record<string, unknown>, duplicateOutcome = false) {
      if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
        throw new MapError('invalid_request', 400);
      const existing = draft.relationships?.find((change) => change.id === body.id);
      const recovery = endpointRecovery(draft, existing);
      const before = existing
        ? existing.before
        : (read().find((value) => value.id === body.id) ?? null);
      if ((before?.revision ?? null) !== body.baseRevision)
        throw new MapError('relationship_conflict');
      let after: RelationshipValue | null = null;
      if (body.value !== null) {
        const value = body.value as RelationshipValue | undefined;
        if (
          !value ||
          Object.keys(value).some((key) =>
            ['knowledge', 'endDate', 'customValues'].includes(key),
          ) ||
          typeof value.typeId !== 'string' ||
          typeof value.sourceId !== 'string' ||
          typeof value.targetId !== 'string'
        )
          throw new MapError('invalid_request', 400);
        const lifecycle = readLifecycle(value.lifecycle);
        after = {
          typeId: value.typeId,
          sourceId: value.sourceId,
          targetId: value.targetId,
          ...(lifecycle ? { lifecycle } : {}),
        };
        assertEndpoints(draft, after);
      }
      const type = definitions
        .effective(draft)
        .find((type) => type.id === (after?.typeId ?? before?.typeId ?? existing?.type.id));
      if (!type) throw new MapError('invalid_type', 400);
      if (after) {
        const value = body.value as RelationshipValue;
        const previous = existing?.after ?? before;
        const properties = readProperties(value.properties, previous?.properties);
        if (properties) after.properties = properties;
      }
      if (body.typeRevision !== undefined && body.typeRevision !== type.revision)
        throw new MapError('type_conflict');
      if (after) {
        const duplicate = effective(draft).find(
          (value) => value.id !== body.id && sameEndpoints(value, after),
        );
        if (duplicate) {
          // An add selects the existing relationship; an edit must not erase another one.
          if (!duplicateOutcome && (before || existing))
            throw new MapError('duplicate_relationship');
          return { draft, existingId: duplicate.id };
        }
      }
      const beforeType =
        existing?.beforeType ?? definitions.read().find((item) => item.id === before?.typeId);
      const changes = (draft.relationships ?? []).filter((change) => change.id !== body.id);
      if (before || after)
        changes.push({
          proposedAt: new Date().toISOString(),
          ...(recovery && after ? { endpointRecovery: recovery } : {}),
          id: body.id,
          before,
          after,
          type,
          ...(beforeType ? { beforeType } : {}),
          objectNames: objectNames(draft, before, after, existing?.objectNames),
        });
      return { draft: { ...draft, version: draft.version + 1, relationships: changes } };
    },
    save(draft: MapDraft, previousTypes: RelationshipType[]): SavedRelationshipChange[] {
      const current = read();
      const changes = (draft.relationships ?? []).filter((change) => change.before || change.after);
      const final = effective({ ...draft, relationships: changes });
      for (const value of final) {
        // Objects have already been written in this same atomic save transaction.
        const source = savedEndpoint(value.sourceId);
        const target = value.targetId ? savedEndpoint(value.targetId) : undefined;
        if (!source || !target) throw new MapError('endpoint_conflict');
        if (source.identity === 'unresolved' || target?.identity === 'unresolved')
          throw new MapError('unresolved_identity');
      }
      for (let index = 0; index < final.length; index++) {
        if (final.slice(index + 1).some((value) => sameEndpoints(final[index], value)))
          throw new MapError('duplicate_relationship');
      }
      for (const change of changes) {
        const saved = current.find((value) => value.id === change.id) ?? null;
        const recovery =
          !saved &&
          change.endpointRecovery &&
          removedRevision(change.id) === change.endpointRecovery.removedRevision;
        if (!recovery && !isDeepStrictEqual(saved, change.before))
          throw new MapError('relationship_conflict');
        const removedType = !change.after
          ? draft.relationshipTypes?.find((item) => item.id === change.type.id && !item.after)
              ?.before
          : null;
        if (
          !(removedType ? [removedType] : types()).some(
            (type) => type.id === change.type.id && type.revision === change.type.revision,
          )
        )
          throw new MapError('type_conflict');
        if (change.after) {
          const type = types().find((type) => type.id === change.after?.typeId);
          if (!type) throw new MapError('type_conflict');
          readProperties(change.after.properties);
        }
        if (!saved && !recovery) tombstones.assertCreation('relationship', change.id);
      }
      // Temporarily remove changed edges so endpoint swaps do not violate the unique index.
      for (const change of changes)
        database
          .prepare('UPDATE map_relationship SET deleted = 1 WHERE householdId = ? AND id = ?')
          .run(householdId, change.id);
      return changes.map((change) => {
        const after = change.after
          ? {
              ...change.after,
              id: change.id,
              householdId,
              revision:
                (change.endpointRecovery?.removedRevision ?? change.before?.revision ?? 0) + 1,
            }
          : null;
        if (after)
          database
            .prepare(`INSERT INTO map_relationship (id, householdId, typeId, revision, sourceId, targetId, lifecycle, properties) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET typeId = excluded.typeId, revision = excluded.revision, sourceId = excluded.sourceId, targetId = excluded.targetId, lifecycle = excluded.lifecycle, properties = excluded.properties, deleted = 0`)
            .run(
              after.id,
              householdId,
              after.typeId,
              after.revision,
              after.sourceId,
              after.targetId,
              after.lifecycle ?? null,
              after.properties ? JSON.stringify(after.properties) : null,
            );
        else
          database
            .prepare(
              'UPDATE map_relationship SET revision = revision + 1 WHERE householdId = ? AND id = ?',
            )
            .run(householdId, change.id);
        // A retained proposal can refer to an edge already removed by another
        // save. History describes the actual map state, not that draft baseline.
        const before = current.find((value) => value.id === change.id) ?? null;
        const beforeType = previousTypes.find((type) => type.id === before?.typeId);
        return {
          id: change.id,
          before,
          after,
          type: change.type,
          ...(beforeType &&
          (beforeType.id !== change.type.id || beforeType.revision !== change.type.revision)
            ? { beforeType }
            : {}),
          // Build shared snapshots from saved objects, never cached private draft names.
          objectNames: objectNames(draft, before, after),
        };
      });
    },
  };
}
