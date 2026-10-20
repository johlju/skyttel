import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import type { MapDraft, ObjectType } from '../shared/map.js';
import { proposedObjectTypes } from '../shared/map.js';
import { resolveTypeDefinition } from '../shared/type-definition.js';
import { definitionRestorations } from './definition-restoration.js';
import { definitionUsage } from './definition-usage.js';
import { MapError } from './map-error.js';
import { mapTombstones } from './map-tombstones.js';

export function objectTypes(database: Database.Database, householdId: string, userId: string) {
  const tombstones = mapTombstones(database, householdId);
  const restorations = definitionRestorations(database, householdId);
  const usage = definitionUsage(database, householdId, userId);
  function read(includeRemoved = false): ObjectType[] {
    return database
      .prepare(`SELECT t.* FROM object_type t
      WHERE t.householdId = ? ${includeRemoved ? '' : "AND NOT EXISTS (SELECT 1 FROM removed_type WHERE kind = 'objectType' AND typeId = t.id)"} ORDER BY CASE WHEN t.name = 'Person' THEN 0 ELSE 1 END, t.name, t.id`)
      .all(householdId) as ObjectType[];
  }
  function validate(value: unknown): Pick<ObjectType, 'name' | 'description'> {
    const type = value as Partial<ObjectType> | null;
    if (
      !type ||
      Object.keys(type).some(
        (key) => !['id', 'householdId', 'revision', 'name', 'description'].includes(key),
      ) ||
      typeof type.name !== 'string' ||
      !type.name.trim() ||
      type.name.length > 200 ||
      typeof type.description !== 'string' ||
      type.description.length > 2000
    )
      throw new MapError('invalid_type_definition', 400);
    return { name: type.name.trim(), description: type.description };
  }
  return {
    read,
    restore(draft: MapDraft, id: string, removed: ObjectType, contentVersion: number) {
      const change = draft.objectTypes?.find((change) => change.id === id);
      if (
        !change?.after ||
        read().some((type) => type.id === id) ||
        !isDeepStrictEqual(
          read(true).find((type) => type.id === id),
          removed,
        )
      )
        throw new MapError('type_conflict');
      const after = {
        ...change.after,
        id,
        householdId,
        revision: removed.revision + 1,
        ...validate({ name: change.after.name, description: change.after.description }),
      };

      change.after = after;
      restorations.grant('objectType', change, removed, contentVersion);
      return { ...draft, version: draft.version + 1 };
    },
    effective(draft: MapDraft) {
      return proposedObjectTypes(read(), draft.objectTypes);
    },
    resolve(draft: MapDraft, id: string, current: ObjectType | null, choice: 'saved' | 'proposed') {
      const change = draft.objectTypes?.find((item) => item.id === id);
      if (!change) throw new MapError('type_conflict');
      if (choice === 'saved' || (!current && !change.after)) {
        draft.objectTypes = draft.objectTypes?.filter((item) => item.id !== id);
      } else if (change.after && current) {
        const resolved = resolveTypeDefinition('objectType', change.before, change.after, current);
        const after = {
          ...resolved,
          ...validate({ name: resolved.name, description: resolved.description }),
        };

        change.before = current;
        change.after = after;
        delete change.restoration;
      } else {
        if (!current && change.after) throw new MapError('type_conflict');
        if (!change.after) usage.assertUnused('objectType', id, draft);
        change.before = current;
      }
      const type =
        choice === 'saved'
          ? (draft.objectTypes?.find((item) => item.id === id)?.after ?? current)
          : change.after;
      for (const proposal of draft.changes)
        if (proposal.type.id === id && type) {
          proposal.type = type;
        }
      return { ...draft, version: draft.version + 1 };
    },
    propose(draft: MapDraft, body: Record<string, unknown>) {
      if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
        throw new MapError('invalid_type_definition', 400);
      const existing = draft.objectTypes?.find((item) => item.id === body.id);
      const before = existing
        ? existing.before
        : (read().find((item) => item.id === body.id) ?? null);
      if (!before && !existing) tombstones.assertCreation('objectType', body.id);
      if ((before?.revision ?? null) !== body.baseRevision) throw new MapError('type_conflict');
      if (body.value === null) {
        if (!before && !existing) throw new MapError('type_conflict');
        usage.assertUnused('objectType', body.id, draft);
        draft.objectTypes = (draft.objectTypes ?? []).filter((item) => item.id !== body.id);
        if (before) draft.objectTypes.push({ id: body.id, before, after: null });
        return { ...draft, version: draft.version + 1 };
      }
      const after: ObjectType = {
        id: body.id,
        householdId,
        revision: (existing?.restoration?.definition.revision ?? before?.revision ?? 0) + 1,
        ...validate(body.value),
      };

      draft.objectTypes = [
        ...(draft.objectTypes ?? []).filter((item) => item.id !== body.id),
        {
          id: body.id,
          before,
          after,
          ...(existing?.restoration ? { restoration: existing.restoration } : {}),
        },
      ];
      for (const change of draft.changes)
        if (change.type.id === body.id) {
          change.type = after;
        }
      return { ...draft, version: draft.version + 1 };
    },
    save(draft: MapDraft) {
      for (const change of draft.objectTypes ?? []) {
        const current = read().find((item) => item.id === change.id) ?? null;
        if (!isDeepStrictEqual(current, change.before)) throw new MapError('type_conflict');
        if (change.restoration)
          restorations.assertAtSave(
            'objectType',
            change,
            read(true).find((type) => type.id === change.id),
          );
        else if (!current) tombstones.assertCreation('objectType', change.id);
        if (!change.after) {
          usage.assertUnused('objectType', change.id, draft);
          tombstones.removeType('objectType', change.id);
          continue;
        }
        validate({ name: change.after.name, description: change.after.description });
        database
          .prepare(`INSERT INTO object_type (id, householdId, revision, name, description) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, name = excluded.name, description = excluded.description`)
          .run(
            change.id,
            householdId,
            change.after.revision,
            change.after.name,
            change.after.description,
          );
        if (change.restoration) tombstones.restoreType('objectType', change.id);
      }
      return (draft.objectTypes ?? []).map(({ id, before, after }) => ({ id, before, after }));
    },
  };
}
