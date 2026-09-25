import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ErasureKind, ErasureReview, ErasureSelection } from '../shared/household-erasure.js';
import type {
  DraftChange,
  MapDraft,
  MapObject,
  MapRelationship,
  ObjectMerge,
  ObjectType,
  RelationshipChange,
  RelationshipType,
  SaveReceipt,
} from '../shared/map.js';
import { AdministrationError } from './administration.js';
import { contentOwner } from './content-identities.js';
import { type ErasureScope, erasurePredicates, erasureProjection } from './erasure-projection.js';

type DraftRow = {
  userId: string;
  version: number;
  changes: string;
  relationships: string;
  objectTypes: string;
  relationshipTypes: string;
};
type SaveRow = { userId: string; operationId: string; receipt: string };
type HistoryRow = { id: number; userId: string; operationId: string; changes: string };
type Change = DraftChange | SaveReceipt['changes'][number];
export function erasureContent(database: Database.Database, householdId: string, actorId: string) {
  const objects: MapObject[] = (
    database
      .prepare('SELECT * FROM map_object WHERE householdId = ? ORDER BY id')
      .all(householdId) as (MapObject & { financialFacts: string; customValues: string })[]
  ).map((row) => ({
    ...row,
    financialFacts: row.financialFacts ? JSON.parse(row.financialFacts) : undefined,
    customValues: row.customValues ? JSON.parse(row.customValues) : undefined,
  }));
  const relationships: MapRelationship[] = (
    database
      .prepare('SELECT * FROM map_relationship WHERE householdId = ? ORDER BY id')
      .all(householdId) as (MapRelationship & { endDate: string })[]
  ).map((row) => ({ ...row, endDate: row.endDate ? JSON.parse(row.endDate) : undefined }));
  const objectTypes = database
    .prepare('SELECT * FROM object_type WHERE householdId = ? ORDER BY id')
    .all(householdId) as ObjectType[];
  const relationshipTypes = database
    .prepare('SELECT * FROM relationship_type WHERE householdId = ? ORDER BY id')
    .all(householdId) as RelationshipType[];
  for (const type of objectTypes) {
    const row = database
      .prepare('SELECT fields FROM object_type_fields WHERE typeId = ?')
      .get(type.id) as { fields: string } | undefined;
    if (row) type.fields = JSON.parse(row.fields);
  }
  for (const type of relationshipTypes) {
    const row = database
      .prepare('SELECT forwardLabel, reverseLabel FROM relationship_type_labels WHERE typeId = ?')
      .get(type.id) as { forwardLabel: string; reverseLabel: string } | undefined;
    if (row) Object.assign(type, row);
  }
  const ownerId = contentOwner(database, householdId, actorId);
  const drafts = (
    database
      .prepare('SELECT * FROM map_draft WHERE householdId = ? ORDER BY userId')
      .all(householdId) as DraftRow[]
  ).map((row) => ({
    ...row,
    changes: JSON.parse(row.changes) as MapDraft['changes'],
    relationships: JSON.parse(row.relationships) as NonNullable<MapDraft['relationships']>,
    objectTypes: JSON.parse(row.objectTypes) as NonNullable<MapDraft['objectTypes']>,
    relationshipTypes: JSON.parse(row.relationshipTypes) as NonNullable<
      MapDraft['relationshipTypes']
    >,
  }));
  const saves = (
    database
      .prepare('SELECT * FROM map_save WHERE householdId = ? ORDER BY userId, operationId')
      .all(householdId) as SaveRow[]
  ).map((row) => ({ ...row, receipt: JSON.parse(row.receipt) as SaveReceipt }));
  const history = (
    database
      .prepare('SELECT * FROM map_history WHERE householdId = ? ORDER BY id')
      .all(householdId) as HistoryRow[]
  ).map((row) => ({ ...row, changes: JSON.parse(row.changes) as SaveReceipt['changes'] }));
  const images = database
    .prepare('SELECT id, objectId, createdBy FROM profile_image WHERE householdId = ? ORDER BY id')
    .all(householdId) as { id: string; objectId: string; createdBy: string }[];
  const positions = database
    .prepare('SELECT * FROM personal_position WHERE householdId = ? ORDER BY userId, objectId')
    .all(householdId) as { userId: string; objectId: string }[];
  const visibleImages = new Set(
    objects.flatMap((object) => (object.profileImageId ? [object.profileImageId] : [])),
  );
  for (const image of images) if (image.createdBy === ownerId) visibleImages.add(image.id);
  const { contentVersion } = database
    .prepare('SELECT contentVersion FROM household WHERE id = ?')
    .get(householdId) as { contentVersion: number };
  const allObjects = new Map(objects.map((object) => [object.id, object]));
  const allEdges = new Map(relationships.map((edge) => [edge.id, edge]));
  const allTypes = new Map(objectTypes.map((type) => [type.id, type]));
  const allEdgeTypes = new Map(relationshipTypes.map((type) => [type.id, type]));
  const visible = {
    object: new Set(objects.map((object) => object.id)),
    relationship: new Set(relationships.map((edge) => edge.id)),
    objectType: new Set(objectTypes.map((type) => type.id)),
    relationshipType: new Set(relationshipTypes.map((type) => type.id)),
  };
  const merges: NonNullable<Change['merge']>[] = [];
  function edgeChange(change: RelationshipChange, publicChange: boolean) {
    for (const value of [change.before, change.after])
      if (value) {
        const edge = { ...value, id: change.id } as MapRelationship;
        if (!allEdges.has(edge.id) || (publicChange && !visible.relationship.has(edge.id)))
          allEdges.set(edge.id, edge);
        if (publicChange) visible.relationship.add(edge.id);
      }
    if (change.type)
      allEdgeTypes.set(change.type.id, allEdgeTypes.get(change.type.id) ?? change.type);
  }
  function objectChange(change: Change, publicChange: boolean) {
    const id = 'id' in change ? change.id : (change.after?.id ?? change.before?.id);
    for (const value of [change.before, change.after])
      if (value && id) {
        const object = { ...value, id } as MapObject;
        if (!allObjects.has(id) || (publicChange && !visible.object.has(id)))
          allObjects.set(id, object);
        if (publicChange) visible.object.add(id);
        if (publicChange && object.profileImageId) visibleImages.add(object.profileImageId);
      }
    for (const type of [change.type, change.beforeType])
      if (type) allTypes.set(type.id, allTypes.get(type.id) ?? type);
    const merge = change.merge;
    if (!merge) return;
    merges.push(merge);
    for (const object of merge.objects) {
      if (!allObjects.has(object.id) || (publicChange && !visible.object.has(object.id)))
        allObjects.set(object.id, object);
      if (publicChange) visible.object.add(object.id);
      if (publicChange && object.profileImageId) visibleImages.add(object.profileImageId);
    }
    for (const edge of merge.relationships) {
      if (!allEdges.has(edge.id) || (publicChange && !visible.relationship.has(edge.id)))
        allEdges.set(edge.id, edge);
      if (publicChange) visible.relationship.add(edge.id);
    }
    if ('previousChanges' in merge) {
      for (const prior of (merge as ObjectMerge).previousChanges) objectChange(prior, publicChange);
      for (const prior of (merge as ObjectMerge).previousRelationships)
        edgeChange(prior, publicChange);
    }
  }
  for (const draft of drafts) {
    const own = draft.userId === ownerId;
    for (const change of draft.changes) objectChange(change, own);
    for (const change of draft.relationships) edgeChange(change, own);
    for (const change of draft.objectTypes)
      for (const type of [change.before, change.after])
        if (type) {
          allTypes.set(type.id, allTypes.get(type.id) ?? type);
          if (own) visible.objectType.add(type.id);
        }
    for (const change of draft.relationshipTypes)
      for (const type of [change.before, change.after])
        if (type) {
          allEdgeTypes.set(type.id, allEdgeTypes.get(type.id) ?? type);
          if (own) visible.relationshipType.add(type.id);
        }
  }
  for (const { receipt } of saves) {
    for (const change of receipt.changes) objectChange(change, true);
    for (const change of receipt.relationships ?? []) edgeChange(change, true);
    for (const change of receipt.objectTypes ?? [])
      for (const type of [change.before, change.after])
        if (type) {
          allTypes.set(type.id, allTypes.get(type.id) ?? type);
          visible.objectType.add(type.id);
        }
    for (const change of receipt.relationshipTypes ?? [])
      for (const type of [change.before, change.after])
        if (type) {
          allEdgeTypes.set(type.id, allEdgeTypes.get(type.id) ?? type);
          visible.relationshipType.add(type.id);
        }
  }
  for (const row of history) for (const change of row.changes) objectChange(change, true);
  return {
    objects,
    relationships,
    objectTypes,
    relationshipTypes,
    drafts,
    saves,
    history,
    images,
    positions,
    visibleImages,
    contentVersion,
    allObjects,
    allEdges,
    allTypes,
    allEdgeTypes,
    merges,
    visible,
  };
}

export function readErasureSelection(value: unknown): ErasureSelection {
  if (!Array.isArray(value) || !value.length || value.length > 1000)
    throw new AdministrationError('invalid_request', 400);
  const kinds: ErasureKind[] = ['object', 'relationship', 'objectType', 'relationshipType'];
  if (
    value.some(
      (item) =>
        !item ||
        typeof item !== 'object' ||
        !kinds.includes(item.kind) ||
        typeof item.id !== 'string' ||
        !/^[\w-]{1,128}$/.test(item.id),
    )
  )
    throw new AdministrationError('invalid_request', 400);
  return value
    .map(({ kind, id }) => ({ kind, id }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

export function planErasure(
  database: Database.Database,
  householdId: string,
  actorId: string,
  selection: ErasureSelection,
): { review: ErasureReview; scope: ErasureScope } {
  const content = erasureContent(database, householdId, actorId);
  const ids = (kind: ErasureKind) =>
    new Set(selection.filter((item) => item.kind === kind).map((item) => item.id));
  const objects = ids('object');
  const relationships = ids('relationship');
  const objectTypes = ids('objectType');
  const relationshipTypes = ids('relationshipType');
  const catalogs = {
    object: content.allObjects,
    relationship: content.allEdges,
    objectType: content.allTypes,
    relationshipType: content.allEdgeTypes,
  };
  if (
    selection.some(
      (item) => !catalogs[item.kind].has(item.id) || !content.visible[item.kind].has(item.id),
    )
  )
    throw new AdministrationError('erasure_unavailable', 404);
  for (const object of content.objects) if (objectTypes.has(object.typeId)) objects.add(object.id);
  for (const draft of content.drafts)
    for (const change of draft.changes)
      if (
        change.after &&
        !content.objects.some((object) => object.id === change.id) &&
        objectTypes.has(change.after.typeId)
      )
        objects.add(change.id);
  let expanded: boolean;
  do {
    const count = objects.size;
    for (const merge of content.merges)
      if ([merge.survivorId, merge.absorbedId].some((id) => objects.has(id))) {
        objects.add(merge.survivorId);
        objects.add(merge.absorbedId);
      }
    expanded = objects.size !== count;
  } while (expanded);
  for (const edge of content.relationships)
    if (
      objects.has(edge.sourceId) ||
      (edge.targetId && objects.has(edge.targetId)) ||
      relationshipTypes.has(edge.typeId)
    )
      relationships.add(edge.id);
  for (const draft of content.drafts)
    for (const change of draft.relationships)
      if (
        change.after &&
        !content.relationships.some((edge) => edge.id === change.id) &&
        (objects.has(change.after.sourceId) ||
          (change.after.targetId && objects.has(change.after.targetId)) ||
          relationshipTypes.has(change.after.typeId))
      )
        relationships.add(change.id);
  const scope = {
    objects: [...objects],
    relationships: [...relationships],
    objectTypes: [...objectTypes],
    relationshipTypes: [...relationshipTypes],
  };
  const affected = erasurePredicates(scope);
  const projection = erasureProjection(content, scope);
  const named = (
    kind: ErasureKind,
    selected: Set<string>,
    catalog: Map<string, MapObject | MapRelationship | ObjectType | RelationshipType>,
  ) =>
    [...selected]
      .filter((id) => content.visible[kind].has(id))
      .sort()
      .map((id) => {
        const value = catalog.get(id);
        return { id, name: value && 'name' in value ? value.name : id };
      });
  const token = createHash('sha256')
    .update(
      JSON.stringify({
        selection,
        objects: content.objects,
        relationships: content.relationships,
        objectTypes: content.objectTypes,
        relationshipTypes: content.relationshipTypes,
        drafts: content.drafts,
        saves: content.saves,
        history: content.history,
        images: content.images,
        positions: content.positions,
        contentVersion: content.contentVersion,
      }),
    )
    .digest('hex');
  const review: ErasureReview = {
    token,
    selection,
    contentVersion: content.contentVersion,
    objects: named('object', objects, content.allObjects),
    relationships: named('relationship', relationships, content.allEdges),
    objectTypes: named('objectType', objectTypes, content.allTypes),
    relationshipTypes: named('relationshipType', relationshipTypes, content.allEdgeTypes),
    privateObjects: [...objects].filter((id) => !content.visible.object.has(id)).length,
    privateRelationships: [...relationships].filter((id) => !content.visible.relationship.has(id))
      .length,
    images: projection.images.length,
    imageVersions: projection.images
      .filter((image) => content.visibleImages.has(image.id))
      .map(({ id, objectId }) => ({ id, objectId })),
    privateImages: projection.images.filter((image) => !content.visibleImages.has(image.id)).length,
    positions: content.positions.filter((position) => objects.has(position.objectId)).length,
    historyChanges: content.saves.reduce(
      (count, { receipt }) =>
        count +
        receipt.changes.filter(affected.objectTouched).length +
        (receipt.relationships ?? []).filter(affected.edgeTouched).length +
        (receipt.objectTypes ?? []).filter((change) => objectTypes.has(change.id)).length +
        (receipt.relationshipTypes ?? []).filter((change) => relationshipTypes.has(change.id))
          .length,
      content.history
        .filter(
          (row) =>
            !content.saves.some(
              (save) => save.userId === row.userId && save.operationId === row.operationId,
            ),
        )
        .reduce((count, row) => count + row.changes.filter(affected.objectTouched).length, 0),
    ),
    privateChanges: content.drafts.reduce(
      (count, draft) =>
        count +
        draft.changes.filter(affected.objectTouched).length +
        draft.relationships.filter(affected.edgeTouched).length +
        draft.objectTypes.filter((change) => objectTypes.has(change.id)).length +
        draft.relationshipTypes.filter((change) => relationshipTypes.has(change.id)).length,
      0,
    ),
  };
  return { review, scope };
}

export function reviewErasure(
  database: Database.Database,
  householdId: string,
  actorId: string,
  selection: ErasureSelection,
) {
  return planErasure(database, householdId, actorId, selection).review;
}
