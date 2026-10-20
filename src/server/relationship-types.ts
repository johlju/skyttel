import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import { resolvedRelationshipType } from '../shared/draft-conflicts.js';
import type { MapDraft, RelationshipType } from '../shared/map.js';
import { proposedRelationshipTypes } from '../shared/map.js';
import { definitionRestorations } from './definition-restoration.js';
import { definitionUsage } from './definition-usage.js';
import { MapError } from './map-error.js';
import { mapTombstones } from './map-tombstones.js';

export function relationshipTypes(database: Database.Database, householdId: string, userId = '') {
  const tombstones = mapTombstones(database, householdId);
  const restorations = definitionRestorations(database, householdId);
  const usage = definitionUsage(database, householdId, userId);
  function read(includeRemoved = false): RelationshipType[] {
    return database
      .prepare(`SELECT t.*, l.forwardLabel, l.reverseLabel FROM relationship_type t
      LEFT JOIN relationship_type_labels l ON l.typeId = t.id
      WHERE t.householdId = ? ${includeRemoved ? '' : "AND NOT EXISTS (SELECT 1 FROM removed_type WHERE kind = 'relationshipType' AND typeId = t.id)"} ORDER BY t.name, t.id`)
      .all(householdId)
      .map((row) => {
        const { forwardLabel, reverseLabel, ...type } = row as RelationshipType;
        return {
          ...type,
          ...(forwardLabel ? { forwardLabel } : {}),
          ...(reverseLabel ? { reverseLabel } : {}),
        };
      });
  }
  function validate(value: unknown) {
    const type = value as Partial<RelationshipType> | null;
    if (
      !type ||
      Object.keys(type).some(
        (key) =>
          ![
            'id',
            'householdId',
            'revision',
            'name',
            'description',
            'forwardLabel',
            'reverseLabel',
          ].includes(key),
      ) ||
      typeof type.name !== 'string' ||
      !type.name.trim() ||
      type.name.length > 200 ||
      typeof type.description !== 'string' ||
      type.description.length > 2000 ||
      typeof type.forwardLabel !== 'string' ||
      !type.forwardLabel.trim() ||
      type.forwardLabel.length > 200 ||
      typeof type.reverseLabel !== 'string' ||
      !type.reverseLabel.trim() ||
      type.reverseLabel.length > 200
    )
      throw new MapError('invalid_relationship_type', 400);
    return {
      name: type.name.trim(),
      description: type.description,
      forwardLabel: type.forwardLabel.trim(),
      reverseLabel: type.reverseLabel.trim(),
    };
  }
  function validateDefinition(type: RelationshipType) {
    return validate({
      name: type.name,
      description: type.description,
      forwardLabel: type.forwardLabel ?? type.name,
      reverseLabel: type.reverseLabel ?? type.name,
    });
  }
  return {
    read,
    restore(draft: MapDraft, id: string, removed: RelationshipType, contentVersion: number) {
      const change = draft.relationshipTypes?.find((change) => change.id === id);
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
        ...validateDefinition(change.after),
      };

      change.after = after;
      restorations.grant('relationshipType', change, removed, contentVersion);
      return { ...draft, version: draft.version + 1 };
    },
    effective(draft: MapDraft) {
      return proposedRelationshipTypes(read(), draft.relationshipTypes);
    },
    resolve(
      draft: MapDraft,
      id: string,
      current: RelationshipType | null,
      choice: 'saved' | 'proposed',
    ) {
      const change = draft.relationshipTypes?.find((item) => item.id === id);
      if (!change) throw new MapError('type_conflict');
      if (choice === 'saved' || (!current && !change.after)) {
        draft.relationshipTypes = draft.relationshipTypes?.filter((item) => item.id !== id);
      } else {
        if (current) {
          change.after = resolvedRelationshipType(change, current);
        } else if (change.after) throw new MapError('type_conflict');
        if (!change.after) usage.assertUnused('relationshipType', id, draft);
        change.before = current;
        delete change.restoration;
      }
      const type =
        choice === 'saved'
          ? (draft.relationshipTypes?.find((item) => item.id === id)?.after ?? current)
          : change.after;
      if (type) validateDefinition(type);
      for (const proposal of draft.relationships ?? [])
        if (proposal.type.id === id && type) {
          proposal.type = type;
        }
      return { ...draft, version: draft.version + 1 };
    },
    propose(draft: MapDraft, body: Record<string, unknown>) {
      if (typeof body.id !== 'string' || !/^[\w-]{1,128}$/.test(body.id))
        throw new MapError('invalid_relationship_type', 400);
      const existing = draft.relationshipTypes?.find((item) => item.id === body.id);
      const before = existing
        ? existing.before
        : (read().find((type) => type.id === body.id) ?? null);
      if (!before && !existing) tombstones.assertCreation('relationshipType', body.id);
      if ((before?.revision ?? null) !== body.baseRevision) throw new MapError('type_conflict');
      if (body.value === null) {
        if (!before && !existing) throw new MapError('type_conflict');
        usage.assertUnused('relationshipType', body.id, draft);
        draft.relationshipTypes = (draft.relationshipTypes ?? []).filter(
          (item) => item.id !== body.id,
        );
        if (before) draft.relationshipTypes.push({ id: body.id, before, after: null });
        return { ...draft, version: draft.version + 1 };
      }
      const after: RelationshipType = {
        id: body.id,
        householdId,
        revision: (existing?.restoration?.definition.revision ?? before?.revision ?? 0) + 1,
        ...validate(body.value),
      };

      draft.relationshipTypes = [
        ...(draft.relationshipTypes ?? []).filter((item) => item.id !== body.id),
        {
          id: body.id,
          before,
          after,
          ...(existing?.restoration ? { restoration: existing.restoration } : {}),
        },
      ];
      for (const change of draft.relationships ?? [])
        if (change.type.id === after.id) {
          change.type = after;
        }
      return { ...draft, version: draft.version + 1 };
    },
    save(draft: MapDraft) {
      for (const change of draft.relationshipTypes ?? []) {
        const current = read().find((type) => type.id === change.id) ?? null;
        if (!isDeepStrictEqual(current, change.before)) throw new MapError('type_conflict');
        if (change.restoration)
          restorations.assertAtSave(
            'relationshipType',
            change,
            read(true).find((type) => type.id === change.id),
          );
        else if (!current) tombstones.assertCreation('relationshipType', change.id);
        if (!change.after) {
          usage.assertUnused('relationshipType', change.id, draft);
          tombstones.removeType('relationshipType', change.id);
          continue;
        }
        validateDefinition(change.after);
        database
          .prepare(`INSERT INTO relationship_type (id, householdId, revision, name, description) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, name = excluded.name, description = excluded.description`)
          .run(
            change.id,
            householdId,
            change.after.revision,
            change.after.name,
            change.after.description,
          );
        if (change.restoration) tombstones.restoreType('relationshipType', change.id);
        if (change.after.forwardLabel && change.after.reverseLabel)
          database
            .prepare(`INSERT INTO relationship_type_labels (typeId, forwardLabel, reverseLabel) VALUES (?, ?, ?)
          ON CONFLICT(typeId) DO UPDATE SET forwardLabel = excluded.forwardLabel, reverseLabel = excluded.reverseLabel`)
            .run(change.id, change.after.forwardLabel, change.after.reverseLabel);
        else
          database.prepare('DELETE FROM relationship_type_labels WHERE typeId = ?').run(change.id);
      }
      return (draft.relationshipTypes ?? []).map(({ id, before, after }) => ({
        id,
        before,
        after,
      }));
    },
  };
}
