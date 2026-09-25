import { isDeepStrictEqual } from 'node:util';
import type {
  DraftChange,
  DraftRelationshipChange,
  MapDraft,
  MapObject,
  MapRelationship,
  ObjectMerge,
  RelationshipChange,
  SaveReceipt,
} from '../shared/map.js';
import type { erasureContent } from './erasure-content.js';

type Content = ReturnType<typeof erasureContent>;
type Change = DraftChange | SaveReceipt['changes'][number];
export type ErasureScope = {
  objects: string[];
  relationships: string[];
  objectTypes: string[];
  relationshipTypes: string[];
};
// Review and execution share the exact projection of every surviving typed path.
export function erasureProjection(content: Content, scope: ErasureScope) {
  const affected = erasurePredicates(scope);
  const names = (value: Record<string, string> | undefined) =>
    value && Object.fromEntries(Object.entries(value).filter(([id]) => !affected.objects.has(id)));
  function cleanEdge<T extends RelationshipChange>(change: T): T {
    return { ...change, ...(change.objectNames ? { objectNames: names(change.objectNames) } : {}) };
  }
  function cleanMerge<
    T extends
      | NonNullable<DraftChange['merge']>
      | NonNullable<SaveReceipt['changes'][number]['merge']>,
  >(merge: T): T {
    const result = {
      ...merge,
      relationships: merge.relationships.filter(
        (edge) => !affected.relationships.has(edge.id) && !affected.edgeValue(edge),
      ),
      relationshipTypes: merge.relationshipTypes.filter(
        (type) => !affected.relationshipTypes.has(type.id),
      ),
      objectNames: names(merge.objectNames) ?? {},
    };
    if ('previousChanges' in result) {
      const draftMerge = result as ObjectMerge;
      draftMerge.previousChanges = draftMerge.previousChanges.flatMap(cleanDraftObject);
      draftMerge.previousRelationships = draftMerge.previousRelationships.flatMap(cleanDraftEdge);
    }
    return result;
  }
  const objectMeaning = (value: MapObject) => ({
    typeId: value.typeId,
    customValues: value.customValues,
  });
  const edgeMeaning = (value: MapRelationship) => ({
    typeId: value.typeId,
    sourceId: value.sourceId,
    targetId: value.targetId,
    knowledge: value.knowledge,
  });
  const facts = (value: object) =>
    Object.fromEntries(
      Object.entries(value).filter(
        ([key, item]) =>
          !['id', 'householdId', 'revision', 'deleted'].includes(key) && item !== undefined,
      ),
    );
  function cleanDraftObject(change: DraftChange): DraftChange[] {
    if (affected.objects.has(change.id)) return [];
    let next = { ...change };
    if (affected.objectChange(change)) {
      const current = content.objects.find((object) => object.id === change.id);
      if (
        !current ||
        affected.objectValue(current) ||
        !change.before ||
        !change.after ||
        change.merge
      )
        return [];
      const type = content.allTypes.get(current.typeId);
      if (!type) return [];
      // Remove only erased type/custom meaning. Original expected/proposed
      // independent facts and revision remain, so newer edits still conflict.
      next = {
        ...change,
        before: { ...change.before, ...objectMeaning(current) },
        after: { ...change.after, ...objectMeaning(current) },
        type,
      };
      delete next.beforeType;
      if (next.undoFields)
        next.undoFields = next.undoFields.filter(
          (key) => key !== 'objectMeaning' && key !== 'typeId' && !key.startsWith('customValues:'),
        );
      if (isDeepStrictEqual(facts(next.before as MapObject), facts(next.after as object)))
        return [];
    }
    if (next.merge) next.merge = cleanMerge(next.merge);
    return [next];
  }
  function cleanDraftEdge(change: DraftRelationshipChange): DraftRelationshipChange[] {
    if (affected.relationships.has(change.id)) return [];
    let next = cleanEdge(change);
    if (affected.edgeChange(change)) {
      const current = content.relationships.find((edge) => edge.id === change.id);
      if (!current || affected.edgeValue(current) || !change.before || !change.after) return [];
      const type = content.allEdgeTypes.get(current.typeId);
      if (!type) return [];
      next = {
        ...next,
        before: { ...change.before, ...edgeMeaning(current) },
        after: { ...change.after, ...edgeMeaning(current) },
        type,
      };
      if (next.undoFields) next.undoFields = next.undoFields.filter((key) => key !== 'meaning');
      if (isDeepStrictEqual(facts(next.before as MapRelationship), facts(next.after as object)))
        return [];
    }
    if (next.removedWithObjects)
      next.removedWithObjects = next.removedWithObjects.filter((id) => !affected.objects.has(id));
    return [next];
  }
  const drafts = content.drafts.map((draft) => {
    return {
      ...draft,
      changes: draft.changes.flatMap(cleanDraftObject),
      relationships: draft.relationships.flatMap(cleanDraftEdge),
      objectTypes: draft.objectTypes.filter((change) => !affected.objectTypes.has(change.id)),
      relationshipTypes: draft.relationshipTypes.filter(
        (change) => !affected.relationshipTypes.has(change.id),
      ),
    };
  });
  const saves = content.saves.map((saved) => {
    const receipt: SaveReceipt = {
      ...saved.receipt,
      changes: saved.receipt.changes
        .filter((change) => !affected.objectChange(change))
        .map((change) => ({
          ...change,
          ...(change.merge ? { merge: cleanMerge(change.merge) } : {}),
        })),
      ...(saved.receipt.relationships
        ? {
            relationships: saved.receipt.relationships
              .filter((change) => !affected.edgeChange(change))
              .map(cleanEdge),
          }
        : {}),
      ...(saved.receipt.objectTypes
        ? {
            objectTypes: saved.receipt.objectTypes.filter(
              (change) => !affected.objectTypes.has(change.id),
            ),
          }
        : {}),
      ...(saved.receipt.relationshipTypes
        ? {
            relationshipTypes: saved.receipt.relationshipTypes.filter(
              (change) => !affected.relationshipTypes.has(change.id),
            ),
          }
        : {}),
    };
    return { ...saved, receipt };
  });
  const history = content.history.map((row) => ({
    ...row,
    changes: row.changes
      .filter((change) => !affected.objectChange(change))
      .map((change) => ({
        ...change,
        ...(change.merge ? { merge: cleanMerge(change.merge) } : {}),
      })),
  }));
  const beforeImages = imageReferences(content);
  const afterImages = imageReferences({
    objects: content.objects.filter((object) => !affected.objects.has(object.id)),
    drafts,
    saves,
    history,
  });
  const images = content.images.filter(
    (image) =>
      affected.objects.has(image.objectId) ||
      (beforeImages.get(image.id)?.has(image.objectId) &&
        !afterImages.get(image.id)?.has(image.objectId)),
  );
  return { drafts, saves, history, images };
}

// Image ownership is part of each reference. Arbitrary text or custom keys do
// not retain an image; unrelated pre-existing orphan rows are outside this scope.
function imageReferences(content: Pick<Content, 'objects' | 'drafts' | 'saves' | 'history'>) {
  const references = new Map<string, Set<string>>();
  function image(id: string | undefined, objectId: string) {
    if (!id) return;
    const owners = references.get(id) ?? new Set<string>();
    owners.add(objectId);
    references.set(id, owners);
  }
  function changeImages(change: Change) {
    const id = 'id' in change ? change.id : (change.after?.id ?? change.before?.id);
    if (id) {
      image(change.before?.profileImageId, id);
      image(change.after?.profileImageId, id);
    }
    const merge = change.merge;
    if (!merge) return;
    for (const object of merge.objects) image(object.profileImageId, object.id);
    if (merge.imageCopy) {
      image(merge.imageCopy.sourceImageId, merge.imageCopy.sourceObjectId);
      image(merge.imageCopy.copiedImageId, merge.survivorId);
    }
    if ('previousChanges' in merge)
      for (const previous of merge.previousChanges) changeImages(previous);
  }
  for (const object of content.objects) image(object.profileImageId, object.id);
  for (const draft of content.drafts) for (const change of draft.changes) changeImages(change);
  for (const saved of content.saves)
    for (const change of saved.receipt.changes) changeImages(change);
  for (const historical of content.history)
    for (const change of historical.changes) changeImages(change);
  return references;
}

export function erasurePredicates(scope: ErasureScope) {
  const objects = new Set(scope.objects);
  const relationships = new Set(scope.relationships);
  const objectTypes = new Set(scope.objectTypes);
  const relationshipTypes = new Set(scope.relationshipTypes);
  const objectValue = (value: { typeId: string; id?: string } | null) =>
    Boolean(value && ((value.id && objects.has(value.id)) || objectTypes.has(value.typeId)));
  const edgeValue = (value: { typeId: string; sourceId: string; targetId: string | null } | null) =>
    Boolean(
      value &&
        (relationshipTypes.has(value.typeId) ||
          objects.has(value.sourceId) ||
          (value.targetId && objects.has(value.targetId))),
    );
  function edgeChange(change: RelationshipChange) {
    return (
      relationships.has(change.id) ||
      edgeValue(change.before) ||
      edgeValue(change.after) ||
      relationshipTypes.has(change.type.id)
    );
  }
  function objectChange(change: Change): boolean {
    const id = 'id' in change ? change.id : (change.after?.id ?? change.before?.id);
    return Boolean(
      (id && objects.has(id)) ||
        objectValue(change.before) ||
        objectValue(change.after) ||
        objectTypes.has(change.type.id) ||
        (change.beforeType && objectTypes.has(change.beforeType.id)) ||
        (change.merge &&
          (change.merge.objects.some(objectValue) ||
            change.merge.types.some((type) => objectTypes.has(type.id)))),
    );
  }
  const namesTouched = (names: Record<string, string> | undefined) =>
    Object.keys(names ?? {}).some((id) => objects.has(id));
  const edgeTouched = (change: RelationshipChange) =>
    edgeChange(change) ||
    namesTouched(change.objectNames) ||
    ('removedWithObjects' in change &&
      (change as NonNullable<MapDraft['relationships']>[number]).removedWithObjects?.some((id) =>
        objects.has(id),
      ));
  function objectTouched(change: Change): boolean {
    const merge = change.merge;
    return Boolean(
      objectChange(change) ||
        (merge &&
          (namesTouched(merge.objectNames) ||
            merge.relationships.some((edge) => relationships.has(edge.id) || edgeValue(edge)) ||
            merge.relationshipTypes.some((type) => relationshipTypes.has(type.id)) ||
            ('previousChanges' in merge &&
              ((merge as ObjectMerge).previousChanges.some(objectTouched) ||
                (merge as ObjectMerge).previousRelationships.some(edgeTouched))))),
    );
  }
  return {
    objectChange,
    edgeChange,
    objectTouched,
    edgeTouched,
    objectValue,
    edgeValue,
    objects,
    relationships,
    objectTypes,
    relationshipTypes,
  };
}
