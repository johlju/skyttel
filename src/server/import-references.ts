import { isDeepStrictEqual } from 'node:util';
import type {
  CustomValues,
  DraftChange,
  DraftRelationshipChange,
  ObjectType,
  ObjectValue,
  RelationshipType,
  SavedRelationshipChange,
  SaveReceipt,
} from '../shared/map.js';
import { isObjectIconId } from '../shared/object-icons.js';
import { readFinancialFacts } from './financial-facts.js';
import type { ImportContent } from './import-schema.js';
import { MapError } from './map-error.js';
import { readCustomValues } from './object-types.js';

function requireReference(condition: unknown): asserts condition {
  if (!condition) throw new MapError('invalid_archive', 400);
}
function unique<T>(rows: T[], key: (row: T) => string) {
  requireReference(new Set(rows.map(key)).size === rows.length);
}

/** Walk typed references only. Free text and custom-value strings are never identities. */
export function validateImportReferences(
  content: ImportContent,
  identity: (
    kind: 'object' | 'relationship' | 'objectType' | 'relationshipType',
    id: string,
  ) => void = () => {},
) {
  const householdId = content.household.id;
  const owners = new Set(content.identities.map((row) => row.id));
  const objects = new Set(content.objects.map((row) => row.id));
  const liveObjects = new Set(content.objects.filter((row) => !row.deleted).map((row) => row.id));
  const removedTypes = new Set(content.removedTypes.map((row) => `${row.kind}:${row.typeId}`));
  for (const row of content.objects)
    if (!row.deleted)
      requireReference(
        row.identity !== 'unresolved' && !removedTypes.has(`objectType:${row.typeId}`),
      );
  for (const row of content.relationships)
    if (!row.deleted)
      requireReference(
        liveObjects.has(row.sourceId) &&
          (row.targetId === null || liveObjects.has(row.targetId)) &&
          row.knowledge !== 'unresolved' &&
          !removedTypes.has(`relationshipType:${row.typeId}`),
      );
  unique(
    content.relationships.filter((row) => !row.deleted),
    (row) => JSON.stringify([row.typeId, row.sourceId, row.targetId]),
  );
  const objectTypes = new Map(
    content.objectTypes.map((row) => [
      row.id,
      {
        ...row,
        fields: content.objectTypeFields.find((fields) => fields.typeId === row.id)?.fields,
        sections:
          content.objectTypeFields.find((fields) => fields.typeId === row.id)?.sections ??
          undefined,
      },
    ]),
  );
  const relationshipTypes = new Map(
    content.relationshipTypes.map((row) => [
      row.id,
      {
        ...row,
        fields: content.relationshipTypeFields.find((fields) => fields.typeId === row.id)?.fields,
        sections:
          content.relationshipTypeFields.find((fields) => fields.typeId === row.id)?.sections ??
          undefined,
      },
    ]),
  );
  const images = new Map(content.images.map((row) => [row.id, row]));
  for (const name of [
    'identities',
    'objectTypes',
    'relationshipTypes',
    'objects',
    'relationships',
    'images',
    'history',
  ] as const)
    unique(content[name] as { id: string | number }[], (row) => String(row.id));
  for (const rows of [
    content.objectTypeFields,
    content.relationshipTypeLabels,
    content.relationshipTypeFields,
  ])
    unique<{ typeId: string }>(rows, (row) => row.typeId);
  for (const rows of [content.drafts, content.viewSettings])
    unique<{ userId: string }>(rows, (row) => row.userId);
  for (const rows of [content.saves, content.operations, content.history])
    unique<{ userId: string; operationId: string }>(
      rows,
      (row) => `${row.userId}:${row.operationId}`,
    );
  unique(content.positions, (row) => `${row.userId}:${row.objectId}`);
  unique(content.removedTypes, (row) => `${row.kind}:${row.typeId}`);
  for (const row of content.objectTypeFields) {
    const type = objectTypes.get(row.typeId);
    requireReference(type);
    unique(row.fields, (field) => field.id);
    definition(type);
  }
  for (const row of content.relationshipTypeFields) {
    const type = relationshipTypes.get(row.typeId);
    requireReference(type);
    edgeDefinition(type);
  }
  for (const row of content.relationshipTypeLabels)
    requireReference(relationshipTypes.has(row.typeId));
  for (const row of content.removedTypes)
    requireReference((row.kind === 'objectType' ? objectTypes : relationshipTypes).has(row.typeId));
  for (const name of [
    'objectTypes',
    'relationshipTypes',
    'objects',
    'relationships',
    'drafts',
    'saves',
    'history',
    'operations',
    'positions',
    'viewSettings',
    'images',
  ] as const) {
    for (const row of content[name]) {
      requireReference(row.householdId === householdId);
      if ('userId' in row) requireReference(owners.has(row.userId));
      if ('createdBy' in row) requireReference(owners.has(row.createdBy));
    }
  }
  // Historical snapshots and private creations are also valid retained identities.
  function collect(
    changes: {
      before: { id: string } | null;
      after: { id?: string; typeId: string } | null;
      id?: string;
      merge?: { objects: { id: string }[]; previousChanges?: DraftChange[] };
    }[],
  ) {
    for (const change of changes) {
      const id = change.id ?? change.before?.id ?? change.after?.id;
      requireReference(id);
      objects.add(id);
      identity('object', id);
      for (const value of change.merge?.objects ?? []) objects.add(value.id);
      if (change.merge?.previousChanges) collect(change.merge.previousChanges);
    }
  }
  for (const draft of content.drafts) collect(draft.changes);
  for (const save of content.saves) collect(save.receipt.changes);

  function definition(type: ObjectType) {
    identity('objectType', type.id);
    presentation(type);
  }
  function presentation(type: Pick<ObjectType, 'fields' | 'sections'>) {
    unique(type.fields ?? [], (field) => field.id);
    unique(type.sections ?? [], (section) => section.id);
    for (const section of type.sections ?? [])
      requireReference(!['__proto__', 'constructor', 'prototype'].includes(section.id));
    for (const field of type.fields ?? []) {
      requireReference(type.sections === undefined || field.sectionId !== undefined);
      requireReference(
        field.sectionId === undefined ||
          field.sectionId === '' ||
          type.sections?.some((section) => section.id === field.sectionId),
      );
    }
  }
  function edgeDefinition(type: RelationshipType) {
    identity('relationshipType', type.id);
    presentation(type);
  }
  function names(values: Record<string, string> | undefined) {
    for (const id of Object.keys(values ?? {})) requireReference(objects.has(id));
  }
  function object(
    value: ObjectValue & { id?: string },
    id: string,
    types: ObjectType[],
    deleted = false,
  ) {
    identity('object', id);
    identity('objectType', value.typeId);
    for (const type of types) definition(type);
    requireReference(value.id === undefined || value.id === id);
    const type = types.find((item) => item.id === value.typeId) ?? objectTypes.get(value.typeId);
    requireReference(type);
    if (!deleted) readCustomValues(value.customValues, type);
    readFinancialFacts(value.financialFacts);
    requireReference(value.iconId === undefined || isObjectIconId(value.iconId));
    if (value.profileImageId) requireReference(images.get(value.profileImageId)?.objectId === id);
  }
  function relationship(
    value: {
      typeId: string;
      id?: string;
      sourceId: string;
      targetId: string | null;
      knowledge: string;
      endDate?: unknown;
      customValues?: CustomValues;
    },
    types: Map<string, RelationshipType>,
    deleted = false,
  ) {
    identity('relationshipType', value.typeId);
    if (value.id) identity('relationship', value.id);
    identity('object', value.sourceId);
    if (value.targetId) identity('object', value.targetId);
    requireReference(types.has(value.typeId) && objects.has(value.sourceId));
    requireReference(value.targetId === null || objects.has(value.targetId));
    requireReference(
      value.knowledge === 'known' || value.knowledge === 'uncertain'
        ? value.targetId !== null
        : value.targetId === null,
    );
    const type = types.get(value.typeId);
    requireReference(type);
    edgeDefinition(type);
    if (!deleted) readCustomValues(value.customValues, type);
    if (value.endDate) readFinancialFacts({ endDate: value.endDate });
  }
  function changes(
    changes: DraftChange[] | SaveReceipt['changes'],
    types: ObjectType[],
    edgeTypes: Map<string, RelationshipType>,
  ) {
    for (const change of changes) {
      const id = 'id' in change ? change.id : (change.before?.id ?? change.after?.id);
      requireReference(id && (change.before || change.after));
      const meanings = [change.type, ...(change.beforeType ? [change.beforeType] : []), ...types];
      if (change.before)
        object(change.before, id, [...(change.beforeType ? [change.beforeType] : []), ...meanings]);
      if (change.after) object(change.after, id, meanings);
      const merge = change.merge;
      if (!merge) continue;
      requireReference(
        merge.survivorId !== merge.absorbedId &&
          objects.has(merge.survivorId) &&
          objects.has(merge.absorbedId),
      );
      requireReference(
        merge.objects.some((item) => item.id === merge.survivorId) &&
          merge.objects.some((item) => item.id === merge.absorbedId),
      );
      for (const value of merge.objects) object(value, value.id, merge.types);
      names(merge.objectNames);
      const mergedTypes = new Map<string, RelationshipType>([
        ...edgeTypes,
        ...merge.relationshipTypes.map((item): [string, RelationshipType] => [item.id, item]),
      ]);
      for (const value of merge.relationships) relationship(value, mergedTypes);
      if (merge.imageCopy) {
        requireReference(
          images.get(merge.imageCopy.sourceImageId)?.objectId === merge.imageCopy.sourceObjectId,
        );
        requireReference(images.get(merge.imageCopy.copiedImageId)?.objectId === merge.survivorId);
      }
      if ('previousChanges' in merge)
        changesNested(merge.previousChanges, merge.types, mergedTypes);
      if ('previousRelationships' in merge)
        for (const value of merge.previousRelationships) edgeChange(value, mergedTypes);
    }
  }
  const changesNested = changes;
  function edgeChange(
    change: DraftRelationshipChange | SavedRelationshipChange,
    types: Map<string, RelationshipType>,
  ) {
    identity('relationship', change.id);
    requireReference(!change.before || change.before.id === change.id);
    if (change.after && 'id' in change.after) requireReference(change.after.id === change.id);
    edgeDefinition(change.type);
    const beforeType = 'beforeType' in change ? change.beforeType : undefined;
    if (beforeType) edgeDefinition(beforeType);
    const meanings = new Map([...types, [change.type.id, change.type]]);
    if (change.before)
      relationship(
        change.before,
        new Map([...meanings, ...(beforeType ? [[beforeType.id, beforeType] as const] : [])]),
      );
    if (change.after) relationship(change.after, meanings);
    names(change.objectNames);
    if ('removedWithObjects' in change)
      for (const id of change.removedWithObjects ?? []) requireReference(objects.has(id));
  }
  for (const row of content.objects) {
    const { customValues, financialFacts, profileImageId, iconId, lifecycle, identity, ...value } =
      row;
    object(
      {
        ...value,
        ...(customValues ? { customValues } : {}),
        ...(financialFacts ? { financialFacts } : {}),
        ...(profileImageId ? { profileImageId } : {}),
        ...(iconId ? { iconId } : {}),
        ...(lifecycle ? { lifecycle } : {}),
        ...(identity ? { identity } : {}),
      },
      row.id,
      [],
      Boolean(row.deleted),
    );
  }
  for (const row of content.relationships)
    relationship(
      { ...row, endDate: row.endDate ?? undefined, customValues: row.customValues ?? undefined },
      relationshipTypes,
      Boolean(row.deleted),
    );
  for (const draft of content.drafts) {
    for (const change of draft.objectTypes) {
      identity('objectType', change.id);
      if (change.before) definition(change.before);
      if (change.after) definition(change.after);
      requireReference(
        (!change.before || change.before.id === change.id) &&
          (!change.after || change.after.id === change.id),
      );
    }
    for (const change of draft.relationshipTypes) {
      identity('relationshipType', change.id);
      if (change.before) edgeDefinition(change.before);
      if (change.after) edgeDefinition(change.after);
      requireReference(
        (!change.before || change.before.id === change.id) &&
          (!change.after || change.after.id === change.id),
      );
    }
    const types = draft.objectTypes.flatMap((change) =>
      [change.before, change.after].filter((value) => value !== null),
    );
    const edgeTypes = new Map<string, RelationshipType>([
      ...relationshipTypes,
      ...draft.relationshipTypes.flatMap((change) =>
        [change.before, change.after]
          .filter((type) => type !== null)
          .map((type): [string, RelationshipType] => [type.id, type]),
      ),
    ]);
    changes(draft.changes, types, edgeTypes);
    for (const change of draft.relationships) edgeChange(change, edgeTypes);
  }
  const saves = new Map(content.saves.map((row) => [`${row.userId}:${row.operationId}`, row]));
  for (const row of content.saves) {
    const receipt = row.receipt;
    for (const change of receipt.objectTypes ?? []) {
      identity('objectType', change.id);
      if (change.before) definition(change.before);
      if (change.after) definition(change.after);
      requireReference(
        (!change.before || change.before.id === change.id) &&
          (!change.after || change.after.id === change.id),
      );
    }
    for (const change of receipt.relationshipTypes ?? []) {
      identity('relationshipType', change.id);
      if (change.before) edgeDefinition(change.before);
      if (change.after) edgeDefinition(change.after);
      requireReference(
        (!change.before || change.before.id === change.id) &&
          (!change.after || change.after.id === change.id),
      );
    }
    requireReference(
      receipt.operationId === row.operationId &&
        receipt.userId === row.userId &&
        receipt.draftVersion === row.draftVersion,
    );
    changes(
      receipt.changes,
      receipt.objectTypes?.flatMap((change) =>
        [change.before, change.after].filter((value) => value !== null),
      ) ?? [],
      relationshipTypes,
    );
    for (const change of receipt.relationships ?? []) edgeChange(change, relationshipTypes);
  }
  requireReference(content.history.length === content.saves.length);
  for (const row of content.history) {
    const save = saves.get(`${row.userId}:${row.operationId}`);
    requireReference(
      save &&
        save.receipt.savedAt === row.savedAt &&
        isDeepStrictEqual(save.receipt.changes, row.changes),
    );
  }
  for (const row of content.operations) {
    const save = saves.get(`${row.userId}:${row.operationId}`);
    if (row.status === 'succeeded')
      requireReference(
        save &&
          save.draftVersion === row.draftVersion &&
          save.receipt.contentVersion === row.contentVersion,
      );
    else requireReference(!save);
  }
  let offset = 0;
  for (const row of content.positions) identity('object', row.objectId);
  for (const row of content.images) {
    requireReference(objects.has(row.objectId));
    requireReference(row.offset === offset);
    offset += row.length;
  }
  return offset;
}
