import { isDeepStrictEqual } from 'node:util';
import type Database from 'better-sqlite3';
import type { CustomField, CustomValues, MapDraft, ObjectType } from '../shared/map.js';
import { compatibleCustomFields, proposedObjectTypes } from '../shared/map.js';
import { definitionUsage } from './definition-usage.js';
import { MapError } from './map-error.js';
import { mapTombstones } from './map-tombstones.js';
import { keepIndependent } from './undo-facts.js';

export function readCustomValues(value: unknown, type: ObjectType): CustomValues | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MapError('invalid_custom_value', 400);
  const result: CustomValues = {};
  for (const [id, answer] of Object.entries(value)) {
    const field = type.fields?.find((item) => item.id === id);
    if (!field) throw new MapError('invalid_custom_value', 400);
    const valid =
      field.kind === 'boolean'
        ? typeof answer === 'boolean'
        : field.kind === 'number'
          ? typeof answer === 'number' && Number.isFinite(answer)
          : typeof answer === 'string' &&
            (field.kind === 'text'
              ? answer.length <= 2000
              : /^\d{4}-\d{2}-\d{2}$/.test(answer) &&
                !Number.isNaN(Date.parse(answer)) &&
                new Date(answer).toISOString().slice(0, 10) === answer);
    if (!valid) throw new MapError('invalid_custom_value', 400);
    result[id] = answer;
  }
  return Object.keys(result).length ? result : undefined;
}

function resolvedDefinition(before: ObjectType | null, after: ObjectType, current: ObjectType) {
  const revision = current.revision + 1;
  if (!before) return { ...after, revision };
  const fields = new Map(current.fields?.map((field) => [field.id, field]));
  for (const field of before.fields ?? [])
    if (!after.fields?.some((item) => item.id === field.id)) fields.delete(field.id);
  for (const proposed of after.fields ?? []) {
    const original = before.fields?.find((field) => field.id === proposed.id);
    const saved = fields.get(proposed.id);
    fields.set(
      proposed.id,
      original && saved
        ? {
            id: proposed.id,
            name: proposed.name === original.name ? saved.name : proposed.name,
            description:
              proposed.description === original.description
                ? saved.description
                : proposed.description,
            kind: proposed.kind === original.kind ? saved.kind : proposed.kind,
          }
        : proposed,
    );
  }
  return {
    ...after,
    revision,
    name: after.name === before.name ? current.name : after.name,
    description: after.description === before.description ? current.description : after.description,
    ...(fields.size ? { fields: [...fields.values()] } : {}),
  };
}

export function objectTypes(database: Database.Database, householdId: string, userId: string) {
  const tombstones = mapTombstones(database, householdId);
  const usage = definitionUsage(database, householdId, userId);
  function read(includeRemoved = false): ObjectType[] {
    return (
      database
        .prepare(`SELECT t.*, f.fields FROM object_type t LEFT JOIN object_type_fields f ON f.typeId = t.id
      WHERE t.householdId = ? ${includeRemoved ? '' : "AND NOT EXISTS (SELECT 1 FROM removed_type WHERE kind = 'objectType' AND typeId = t.id)"} ORDER BY CASE WHEN t.name = 'Person' THEN 0 ELSE 1 END, t.name, t.id`)
        .all(householdId) as (ObjectType & { fields: string | null })[]
    ).map(({ fields, ...type }) => ({
      ...type,
      ...(fields && fields !== '[]' ? { fields: JSON.parse(fields) } : {}),
    }));
  }
  function validate(value: unknown): Pick<ObjectType, 'name' | 'description' | 'fields'> {
    const type = value as Partial<ObjectType> | null;
    if (
      !type ||
      typeof type.name !== 'string' ||
      !type.name.trim() ||
      type.name.length > 200 ||
      typeof type.description !== 'string' ||
      type.description.length > 2000 ||
      !Array.isArray(type.fields) ||
      type.fields.length > 100
    )
      throw new MapError('invalid_type_definition', 400);
    const ids = new Set<string>();
    const fields: CustomField[] = type.fields.map((field) => {
      if (
        !field ||
        typeof field.id !== 'string' ||
        !/^[\w-]{1,128}$/.test(field.id) ||
        ['__proto__', 'constructor', 'prototype'].includes(field.id) ||
        ids.has(field.id) ||
        typeof field.name !== 'string' ||
        !field.name.trim() ||
        field.name.length > 200 ||
        typeof field.description !== 'string' ||
        field.description.length > 2000 ||
        !['text', 'number', 'date', 'boolean'].includes(field.kind)
      )
        throw new MapError('invalid_type_definition', 400);
      ids.add(field.id);
      return {
        id: field.id,
        name: field.name.trim(),
        description: field.description,
        kind: field.kind,
      };
    });
    return {
      name: type.name.trim(),
      description: type.description,
      ...(fields.length ? { fields } : {}),
    };
  }
  function checkFields(
    before: ObjectType | null,
    after: ObjectType,
    draft: MapDraft,
    deferKindChanges = false,
  ) {
    for (const field of before?.fields ?? []) {
      const next = after.fields?.find((item) => item.id === field.id);
      if (!next) {
        usage.assertUnused('objectType', after.id, draft, field.id);
        continue;
      }
      if (next.kind === field.kind || deferKindChanges) continue;
      const objects = database
        .prepare(
          'SELECT id, customValues FROM map_object WHERE householdId = ? AND typeId = ? AND deleted = 0',
        )
        .all(householdId, after.id) as { id: string; customValues: string | null }[];
      const drafts = database
        .prepare('SELECT changes FROM map_draft WHERE householdId = ? AND userId != ?')
        .all(householdId, userId) as { changes: string }[];
      const used =
        objects.some((object) => {
          if (!object.customValues || !Object.hasOwn(JSON.parse(object.customValues), field.id))
            return false;
          const change = draft.changes.find((item) => item.id === object.id);
          if (change)
            return (
              change.after?.typeId === after.id &&
              Object.hasOwn(change.after.customValues ?? {}, field.id)
            );
          return true;
        }) ||
        drafts
          .flatMap((item) => JSON.parse(item.changes) as MapDraft['changes'])
          .some(
            (change) =>
              change.after?.typeId === after.id &&
              Object.hasOwn(change.after.customValues ?? {}, field.id),
          ) ||
        draft.changes.some(
          (change) =>
            change.after?.typeId === after.id &&
            Object.hasOwn(change.after.customValues ?? {}, field.id) &&
            change.type.fields?.find((item) => item.id === field.id)?.kind !== next.kind,
        );
      if (used) throw new MapError('field_kind_in_use');
    }
  }
  return {
    read,
    validateUndo(draft: MapDraft) {
      for (const change of draft.objectTypes ?? []) {
        if (!change.after) usage.assertUnused('objectType', change.id, draft);
        else {
          const current = read().find((type) => type.id === change.id) ?? null;
          validate({ ...change.after, fields: change.after.fields ?? [] });
          checkFields(
            current ?? read(true).find((type) => type.id === change.id) ?? null,
            change.after,
            draft,
            // Conflicting definitions must be reviewed first. Resolution and
            // atomic saving both enforce usage against the chosen definition.
            current?.revision !== change.before?.revision,
          );
        }
      }
    },
    effective(draft: MapDraft) {
      return proposedObjectTypes(read(), draft.objectTypes);
    },
    resolve(draft: MapDraft, id: string, current: ObjectType | null, choice: 'saved' | 'proposed') {
      const change = draft.objectTypes?.find((item) => item.id === id);
      if (!change) throw new MapError('type_conflict');
      if (choice === 'saved' || (!current && !change.after)) {
        draft.objectTypes = draft.objectTypes?.filter((item) => item.id !== id);
        const remaining = keepIndependent('objectType', change, current);
        if (remaining?.after)
          draft.objectTypes?.push({
            id,
            ...remaining,
            after: {
              ...remaining.after,
              revision: (current?.revision ?? remaining.before?.revision ?? 0) + 1,
            },
          });
      } else if (change.after && current) {
        const resolved = resolvedDefinition(change.before, change.after, current);
        const after = { ...resolved, ...validate({ ...resolved, fields: resolved.fields ?? [] }) };
        checkFields(current, after, draft);
        change.before = current;
        change.after = after;
      } else {
        if (!current && change.after) {
          change.restoreRevision = tombstones.revision('objectType', id);
          change.after.revision = change.restoreRevision + 1;
        }
        if (!change.after) usage.assertUnused('objectType', id, draft);
        change.before = current;
      }
      const type =
        choice === 'saved'
          ? (draft.objectTypes?.find((item) => item.id === id)?.after ?? current)
          : change.after;
      for (const proposal of draft.changes)
        if (proposal.type.id === id && type) {
          // Keeping today's definition leaves incompatible historical values
          // visible as an object conflict until they are edited or discarded.
          if (
            choice === 'saved' &&
            proposal.after &&
            !compatibleCustomFields(proposal.after.customValues, proposal.type, type)
          )
            continue;
          if (proposal.after) readCustomValues(proposal.after.customValues, type);
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
        revision: (before?.revision ?? existing?.restoreRevision ?? 0) + 1,
        ...validate(body.value),
      };
      checkFields(before, after, draft);
      if (existing?.after)
        checkFields(
          {
            ...existing.after,
            fields: existing.after.fields?.filter(
              (field) => !before?.fields?.some((saved) => saved.id === field.id),
            ),
          },
          after,
          draft,
        );
      draft.objectTypes = [
        ...(draft.objectTypes ?? []).filter((item) => item.id !== body.id),
        {
          id: body.id,
          before,
          after,
          ...(existing?.restoreRevision !== undefined
            ? { restoreRevision: existing.restoreRevision }
            : {}),
          ...(existing?.undo ? { undo: true as const } : {}),
          ...(existing?.undoFields ? { undoFields: existing.undoFields } : {}),
        },
      ];
      for (const change of draft.changes)
        if (change.type.id === body.id) {
          if (change.after) readCustomValues(change.after.customValues, after);
          change.type = after;
        }
      return { ...draft, version: draft.version + 1 };
    },
    save(draft: MapDraft) {
      for (const change of draft.objectTypes ?? []) {
        const current = read().find((item) => item.id === change.id) ?? null;
        if (!isDeepStrictEqual(current, change.before)) throw new MapError('type_conflict');
        if (!current) tombstones.assertCreation('objectType', change.id, change.restoreRevision);
        if (!change.after) {
          usage.assertUnused('objectType', change.id, draft);
          tombstones.removeType('objectType', change.id);
          continue;
        }
        checkFields(
          current ?? read(true).find((type) => type.id === change.id) ?? null,
          change.after,
          draft,
        );
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
        database
          .prepare(
            'INSERT INTO object_type_fields (typeId, fields) VALUES (?, ?) ON CONFLICT(typeId) DO UPDATE SET fields = excluded.fields',
          )
          .run(change.id, JSON.stringify(change.after.fields ?? []));
        tombstones.restoreType('objectType', change.id);
      }
      return draft.objectTypes ?? [];
    },
  };
}
