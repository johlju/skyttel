import type {
  CustomValues,
  MapDraft,
  MapState,
  ObjectType,
  RelationshipType,
  SaveReceipt,
} from '../shared/map.js';
import { proposedObjectTypes, proposedRelationshipTypes } from '../shared/map.js';
import { MapError } from './map-error.js';
import type { mapTombstones } from './map-tombstones.js';
import { inverseChange } from './undo-facts.js';

function restoreFields(
  state: MapState,
  draft: MapDraft,
  type: ObjectType,
  historical: ObjectType,
  values: CustomValues = {},
) {
  const current = state.types.find((item) => item.id === type.id) ?? null;
  const privateType = state.draft.objectTypes?.find((item) => item.id === type.id);
  const required = Object.keys(values).flatMap((id) => {
    const field = historical.fields?.find((item) => item.id === id);
    const effective = type.fields?.find((item) => item.id === id);
    const saved = current?.fields?.find((item) => item.id === id);
    if (field && privateType && (effective?.kind !== field.kind || saved?.kind !== field.kind)) {
      const before = privateType.before?.fields?.find((item) => item.id === id);
      const after = privateType.after?.fields?.find((item) => item.id === id);
      if (!privateType.after || before?.kind !== after?.kind)
        throw new MapError('undo_draft_overlap');
    }
    return field && effective?.kind !== field.kind ? [field] : [];
  });
  if (!required.length) return;
  const own = draft.objectTypes?.find((item) => item.id === type.id);
  const fields = new Map((current ?? type).fields?.map((field) => [field.id, field]));
  for (const field of required) {
    if (
      state.draft.changes.some(
        (change) =>
          change.after?.typeId === type.id &&
          Object.hasOwn(change.after.customValues ?? {}, field.id) &&
          change.type.fields?.find((item) => item.id === field.id)?.kind !== field.kind,
      )
    )
      throw new MapError('undo_draft_overlap');
    const saved = fields.get(field.id);
    if (current && saved?.kind === field.kind) throw new MapError('undo_draft_overlap');
    fields.set(field.id, saved ? { ...saved, kind: field.kind } : field);
  }
  const desired = { ...(current ?? type), fields: [...fields.values()] };
  const change = current
    ? inverseChange('objectType', { before: desired, after: current }, current, own)
    : { ...own, before: null, after: desired };
  if (!change?.after) throw new MapError('undo_unavailable');
  const after = { ...change.after, revision: type.revision };
  if (current) after.revision = current.revision + 1;
  draft.objectTypes = [
    ...(draft.objectTypes ?? []).filter((item) => item.id !== type.id),
    {
      ...own,
      ...change,
      id: type.id,
      // A later removal or kind change requires an explicit definition choice.
      before: change.before ? { ...change.before, revision: historical.revision } : null,
      after,
      undo: true,
    },
  ];
  for (const proposal of draft.changes)
    if (proposal.type.id === type.id && proposal.type.revision === type.revision)
      proposal.type = after;
}

export function undoSave(
  state: MapState,
  receipt: SaveReceipt,
  tombstones: ReturnType<typeof mapTombstones>,
  retainedTypes: ObjectType[],
  retainedEdgeTypes: RelationshipType[],
): MapDraft {
  const draft = structuredClone(state.draft);
  for (const saved of receipt.objectTypes ?? []) {
    const current = state.types.find((type) => type.id === saved.id) ?? null;
    const own = draft.objectTypes?.find((change) => change.id === saved.id);
    const change = inverseChange('objectType', saved, current, own);
    if (!change) continue;
    const restoreRevision =
      !current && change.after ? tombstones.revision('objectType', saved.id) : undefined;
    if (change.after)
      change.after = { ...change.after, revision: (current?.revision ?? restoreRevision ?? 0) + 1 };
    draft.objectTypes = [
      ...(draft.objectTypes ?? []).filter((item) => item.id !== saved.id),
      {
        ...change,
        id: saved.id,
        undo: true,
        ...(restoreRevision !== undefined ? { restoreRevision } : {}),
      },
    ];
  }
  for (const saved of receipt.relationshipTypes ?? []) {
    const current = state.relationshipTypes.find((type) => type.id === saved.id) ?? null;
    const own = draft.relationshipTypes?.find((change) => change.id === saved.id);
    const change = inverseChange('relationshipType', saved, current, own);
    if (!change) continue;
    const restoreRevision =
      !current && change.after ? tombstones.revision('relationshipType', saved.id) : undefined;
    if (change.after)
      change.after = { ...change.after, revision: (current?.revision ?? restoreRevision ?? 0) + 1 };
    draft.relationshipTypes = [
      ...(draft.relationshipTypes ?? []).filter((item) => item.id !== saved.id),
      {
        ...change,
        id: saved.id,
        undo: true,
        ...(restoreRevision !== undefined ? { restoreRevision } : {}),
      },
    ];
  }
  const types = proposedObjectTypes(state.types, draft.objectTypes);
  const edgeTypes = proposedRelationshipTypes(state.relationshipTypes, draft.relationshipTypes);
  const restoredFields = new Map<
    string,
    { type: ObjectType; historical: ObjectType; values: CustomValues }
  >();
  for (const saved of receipt.changes) {
    const id = saved.after?.id ?? saved.before?.id;
    if (!id) throw new MapError('undo_unavailable');
    const current = state.objects.find((item) => item.id === id) ?? null;
    const own = draft.changes.find((item) => item.id === id);
    const change = inverseChange('object', saved, current, own);
    if (!change) continue;
    const typeId = change.after?.typeId ?? current?.typeId ?? saved.type.id;
    let type =
      types.find((item) => item.id === typeId) ?? retainedTypes.find((item) => item.id === typeId);
    if (!type) throw new MapError('undo_unavailable');
    if (change.after && !types.some((item) => item.id === typeId)) {
      if (draft.objectTypes?.some((item) => item.id === typeId))
        throw new MapError('undo_draft_overlap');
      const restoreRevision = tombstones.revision('objectType', typeId);
      type = { ...type, revision: restoreRevision + 1 };
      draft.objectTypes = [
        ...(draft.objectTypes ?? []),
        { id: typeId, before: null, after: type, restoreRevision },
      ];
      types.push(type);
    }
    if (change.after) {
      const restoredValues = Object.fromEntries(
        Object.entries(change.after.customValues ?? {}).filter(
          ([id]) =>
            !current ||
            !change.undoFields ||
            change.undoFields.includes('objectMeaning') ||
            change.undoFields.includes('typeId') ||
            change.undoFields.includes(`customValues:${id}`),
        ),
      );
      const historical = saved.beforeType ?? saved.type;
      if (historical.id === typeId)
        restoredFields.set(typeId, {
          type,
          historical,
          values: { ...restoredFields.get(typeId)?.values, ...restoredValues },
        });
    }
    draft.changes = [
      ...draft.changes.filter((item) => item.id !== id),
      {
        ...change,
        id,
        type,
        beforeType: state.types.find((item) => item.id === change.before?.typeId),
        undo: true,
        ...(!current && change.after ? { restoreRevision: tombstones.revision('object', id) } : {}),
      },
    ];
  }
  for (const { type, historical, values } of restoredFields.values())
    restoreFields(state, draft, type, historical, values);
  for (const saved of receipt.relationships ?? []) {
    const current = state.relationships.find((item) => item.id === saved.id) ?? null;
    const own = draft.relationships?.find((item) => item.id === saved.id);
    const change = inverseChange('relationship', saved, current, own);
    if (!change) continue;
    const typeId = change.after?.typeId ?? current?.typeId ?? saved.type.id;
    let type =
      edgeTypes.find((item) => item.id === typeId) ??
      retainedEdgeTypes.find((item) => item.id === typeId);
    if (!type) throw new MapError('undo_unavailable');
    if (change.after && !edgeTypes.some((item) => item.id === typeId)) {
      if (draft.relationshipTypes?.some((item) => item.id === typeId))
        throw new MapError('undo_draft_overlap');
      const restoreRevision = tombstones.revision('relationshipType', typeId);
      type = { ...type, revision: restoreRevision + 1 };
      draft.relationshipTypes = [
        ...(draft.relationshipTypes ?? []),
        { id: typeId, before: null, after: type, restoreRevision },
      ];
      edgeTypes.push(type);
    }
    draft.relationships = [
      ...(draft.relationships ?? []).filter((item) => item.id !== saved.id),
      {
        ...change,
        id: saved.id,
        type,
        undo: true,
        objectNames: saved.objectNames,
        ...(!current && change.after
          ? { restoreRevision: tombstones.revision('relationship', saved.id) }
          : {}),
      },
    ];
  }
  for (const change of draft.changes) {
    if (
      !change.after &&
      state.draft.relationships?.some(
        (own) =>
          own.after && (own.after.sourceId === change.id || own.after.targetId === change.id),
      )
    )
      throw new MapError('undo_draft_overlap');
  }
  for (const change of draft.relationships ?? []) {
    if (
      change.after &&
      state.draft.changes.some(
        (own) =>
          !own.after && (own.id === change.after?.sourceId || own.id === change.after?.targetId),
      )
    )
      throw new MapError('undo_draft_overlap');
  }
  return { ...draft, version: draft.version + 1 };
}
