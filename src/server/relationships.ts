import type Database from 'better-sqlite3';
import type {
  MapDraft,
  MapRelationship,
  RelationshipChange,
  RelationshipType,
  RelationshipValue,
} from '../shared/map.js';
import { proposedRelationships } from '../shared/map.js';
import { MapError } from './map-error.js';

// All operations run inside the map's authorized, immediate transaction.
export function relationships(database: Database.Database, householdId: string) {
  function read(): MapRelationship[] {
    return database
      .prepare(
        'SELECT id, householdId, typeId, revision, sourceId, targetId, knowledge FROM map_relationship WHERE householdId = ? AND deleted = 0 ORDER BY id',
      )
      .all(householdId) as MapRelationship[];
  }
  function types(): RelationshipType[] {
    return database
      .prepare('SELECT * FROM relationship_type WHERE householdId = ? ORDER BY name, id')
      .all(householdId) as RelationshipType[];
  }
  function effective(draft: MapDraft) {
    return [...proposedRelationships(read(), draft.relationships).values()];
  }

  function endpoint(id: string, draft: MapDraft) {
    const proposed = draft.changes.find((change) => change.id === id);
    if (proposed) return proposed.after;
    return database
      .prepare('SELECT identity FROM map_object WHERE householdId = ? AND id = ? AND deleted = 0')
      .get(householdId, id) as { identity?: string } | undefined;
  }
  function sameEndpoints(left: RelationshipValue, right: RelationshipValue) {
    return (
      left.typeId === right.typeId &&
      left.sourceId === right.sourceId &&
      left.targetId === right.targetId
    );
  }
  return {
    read,
    types,
    removeObject(draft: MapDraft, id: string) {
      for (const value of effective(draft)) {
        if (value.sourceId !== id && value.targetId !== id) continue;
        const existing = draft.relationships?.find((change) => change.id === value.id);
        const before = existing ? existing.before : value;
        draft.relationships = (draft.relationships ?? []).filter(
          (change) => change.id !== value.id,
        );
        if (before)
          draft.relationships.push({
            id: value.id,
            before,
            after: null,
            type:
              existing?.type ??
              (types().find((type) => type.id === value.typeId) as RelationshipType),
          });
      }
    },
    propose(draft: MapDraft, body: Record<string, unknown>) {
      if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
        throw new MapError('invalid_request', 400);
      const existing = draft.relationships?.find((change) => change.id === body.id);
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
          typeof value.typeId !== 'string' ||
          typeof value.sourceId !== 'string' ||
          !['known', 'unknown', 'none', 'uncertain', 'unresolved'].includes(value.knowledge) ||
          (['known', 'uncertain'].includes(value.knowledge)
            ? typeof value.targetId !== 'string'
            : value.targetId !== null)
        )
          throw new MapError('invalid_request', 400);
        after = {
          typeId: value.typeId,
          sourceId: value.sourceId,
          targetId: value.targetId,
          knowledge: value.knowledge,
        };
        if (
          !endpoint(after.sourceId, draft) ||
          (after.targetId !== null && !endpoint(after.targetId, draft))
        )
          throw new MapError('invalid_endpoint', 400);
        const duplicate = effective(draft).find(
          (value) => value.id !== body.id && sameEndpoints(value, after as RelationshipValue),
        );
        if (duplicate) {
          // An add selects the existing relationship; an edit must not erase another one.
          if (before || existing) throw new MapError('duplicate_relationship');
          return { draft, existingId: duplicate.id };
        }
      }
      const type = types().find(
        (type) => type.id === (after?.typeId ?? before?.typeId ?? existing?.type.id),
      );
      if (!type) throw new MapError('invalid_type', 400);
      const changes = (draft.relationships ?? []).filter((change) => change.id !== body.id);
      if (before || after) changes.push({ id: body.id, before, after, type });
      return { draft: { ...draft, version: draft.version + 1, relationships: changes } };
    },
    save(draft: MapDraft): RelationshipChange[] {
      const current = read();
      const changes = [...(draft.relationships ?? [])];
      const final = effective({ ...draft, relationships: changes });
      for (const value of final) {
        const source = endpoint(value.sourceId, draft);
        const target = value.targetId === null ? null : endpoint(value.targetId, draft);
        if (!source || (value.targetId !== null && !target))
          throw new MapError('endpoint_conflict');
        if (
          value.knowledge === 'unresolved' ||
          source.identity === 'unresolved' ||
          target?.identity === 'unresolved'
        )
          throw new MapError('unresolved_identity');
      }
      for (let index = 0; index < final.length; index++) {
        if (final.slice(index + 1).some((value) => sameEndpoints(final[index], value)))
          throw new MapError('duplicate_relationship');
      }
      for (const change of changes) {
        const saved = current.find((value) => value.id === change.id) ?? null;
        if (JSON.stringify(saved) !== JSON.stringify(change.before))
          throw new MapError('relationship_conflict');
        if (
          !types().some(
            (type) => type.id === change.type.id && type.revision === change.type.revision,
          )
        )
          throw new MapError('type_conflict');
        if (
          !saved &&
          database.prepare('SELECT 1 FROM map_relationship WHERE id = ?').get(change.id)
        )
          throw new MapError('relationship_conflict');
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
              revision: (change.before?.revision ?? 0) + 1,
            }
          : null;
        if (after)
          database
            .prepare(`INSERT INTO map_relationship (id, householdId, typeId, revision, sourceId, targetId, knowledge) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET typeId = excluded.typeId, revision = excluded.revision, sourceId = excluded.sourceId, targetId = excluded.targetId, knowledge = excluded.knowledge, deleted = 0`)
            .run(
              after.id,
              householdId,
              after.typeId,
              after.revision,
              after.sourceId,
              after.targetId,
              after.knowledge,
            );
        else
          database
            .prepare(
              'UPDATE map_relationship SET revision = revision + 1 WHERE householdId = ? AND id = ?',
            )
            .run(householdId, change.id);
        return { ...change, after };
      });
    },
  };
}
