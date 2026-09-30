import type Database from 'better-sqlite3';
import type { MapDraft, ObjectValue, RelationshipValue } from '../shared/map.js';
import { MapError } from './map-error.js';

export function definitionUsage(database: Database.Database, householdId: string, userId: string) {
  function otherDrafts(): MapDraft[] {
    return (
      database
        .prepare(
          'SELECT changes, relationships, objectTypes, relationshipTypes FROM map_draft WHERE householdId = ? AND userId != ?',
        )
        .all(householdId, userId) as Record<string, string>[]
    ).map((row) => ({
      version: 0,
      changes: JSON.parse(row.changes),
      relationships: JSON.parse(row.relationships),
      objectTypes: JSON.parse(row.objectTypes),
      relationshipTypes: JSON.parse(row.relationshipTypes),
    }));
  }
  return {
    assertRelationshipFieldKindUnused(id: string, fieldId: string, kind: string, draft: MapDraft) {
      const uses = (value: Pick<RelationshipValue, 'typeId' | 'customValues'> | null) =>
        value?.typeId === id && Object.hasOwn(value.customValues ?? {}, fieldId);
      const saved = database
        .prepare(
          'SELECT id, typeId, customValues FROM map_relationship WHERE householdId = ? AND typeId = ? AND deleted = 0',
        )
        .all(householdId, id) as { id: string; typeId: string; customValues: string | null }[];
      if (
        saved.some((edge) => {
          if (!edge.customValues || !Object.hasOwn(JSON.parse(edge.customValues), fieldId))
            return false;
          const own = draft.relationships?.find((change) => change.id === edge.id);
          return own ? uses(own.after) : true;
        }) ||
        otherDrafts().some(
          (other) =>
            other.relationships?.some((change) => uses(change.after)) ||
            other.relationshipTypes?.some(
              (change) =>
                change.id === id &&
                change.after?.fields?.some((field) => field.id === fieldId && field.kind !== kind),
            ),
        ) ||
        draft.relationships?.some(
          (change) =>
            uses(change.after) &&
            change.type.fields?.find((field) => field.id === fieldId)?.kind !== kind,
        )
      )
        throw new MapError('field_kind_in_use');
    },
    assertUnused(
      kind: 'objectType' | 'relationshipType',
      id: string,
      draft: MapDraft,
      fieldId?: string,
    ) {
      const others = otherDrafts();
      if (kind === 'objectType') {
        const objects = new Map(
          (
            database
              .prepare(
                'SELECT id, typeId, customValues FROM map_object WHERE householdId = ? AND deleted = 0',
              )
              .all(householdId) as { id: string; typeId: string; customValues: string | null }[]
          ).map((row) => [
            row.id,
            {
              typeId: row.typeId,
              customValues: row.customValues ? JSON.parse(row.customValues) : {},
            },
          ]),
        );
        for (const change of draft.changes) {
          if (change.after)
            objects.set(change.id, {
              typeId: change.after.typeId,
              customValues: change.after.customValues ?? {},
            });
          else objects.delete(change.id);
        }
        const uses = (value: Pick<ObjectValue, 'typeId' | 'customValues'> | null) =>
          value?.typeId === id && (!fieldId || Object.hasOwn(value.customValues ?? {}, fieldId));
        if (
          [...objects.values()].some(uses) ||
          others.some(
            (other) =>
              other.changes.some((change) => uses(change.after)) ||
              other.objectTypes?.some(
                (change) =>
                  change.id === id &&
                  change.after &&
                  (!fieldId || change.after.fields?.some((field) => field.id === fieldId)),
              ),
          )
        )
          throw new MapError(fieldId ? 'field_in_use' : 'definition_in_use');
      } else {
        const edges = new Map(
          (
            database
              .prepare(
                'SELECT id, typeId, customValues FROM map_relationship WHERE householdId = ? AND deleted = 0',
              )
              .all(householdId) as { id: string; typeId: string; customValues: string | null }[]
          ).map((edge) => [
            edge.id,
            { ...edge, customValues: edge.customValues ? JSON.parse(edge.customValues) : {} },
          ]),
        );
        for (const change of draft.relationships ?? []) {
          if (change.after)
            edges.set(change.id, {
              id: change.id,
              typeId: change.after.typeId,
              customValues: change.after.customValues ?? {},
            });
          else edges.delete(change.id);
        }
        const uses = (value: Pick<RelationshipValue, 'typeId' | 'customValues'> | null) =>
          value?.typeId === id && (!fieldId || Object.hasOwn(value.customValues ?? {}, fieldId));
        if (
          [...edges.values()].some(uses) ||
          others.some(
            (other) =>
              other.relationships?.some((change) => uses(change.after)) ||
              other.relationshipTypes?.some(
                (change) =>
                  change.id === id &&
                  change.after &&
                  (!fieldId || change.after.fields?.some((field) => field.id === fieldId)),
              ),
          )
        )
          throw new MapError(fieldId ? 'field_in_use' : 'definition_in_use');
      }
    },
  };
}
