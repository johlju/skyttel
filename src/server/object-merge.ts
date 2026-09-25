import { isDeepStrictEqual } from 'node:util';
import type { MapDraft, MapState, ObjectMerge } from '../shared/map.js';
import { proposedRelationshipTypes } from '../shared/map.js';
import { mergeConnections, mergeFor, mergeObjects, mergeValues } from '../shared/object-merge.js';
import { readFinancialFacts } from './financial-facts.js';
import { readLifecycle } from './lifecycle.js';
import { MapError } from './map-error.js';
import type { objectTypes } from './object-types.js';
import { readCustomValues } from './object-types.js';
import type { profileImages } from './profile-images.js';
import type { relationships } from './relationships.js';

export function assertMergeEditable(draft: MapDraft, kind: string, id: unknown) {
  if (mergeFor(draft, kind, id)) throw new MapError('merge_review_required');
}

export function proposeMerge(
  state: MapState,
  body: Record<string, unknown>,
  types: ReturnType<typeof objectTypes>,
  edges: ReturnType<typeof relationships>,
  images: ReturnType<typeof profileImages>,
): MapDraft {
  const ids = [body.survivorId, body.absorbedId];
  if (
    ids.some((id) => typeof id !== 'string') ||
    ids[0] === ids[1] ||
    typeof body.identityConfirmed !== 'boolean'
  )
    throw new MapError('invalid_request', 400);
  for (const id of ids) assertMergeEditable(state.draft, 'object', id);
  const objects = mergeObjects(state);
  const left = objects.get(ids[0] as string);
  const right = objects.get(ids[1] as string);
  if (!left || !right) throw new MapError('object_conflict');
  const connections = mergeConnections(state, ids as string[]);
  for (const edge of connections) assertMergeEditable(state.draft, 'relationship', edge.id);
  const sourceTypes = types
    .effective(state.draft)
    .filter((type) => [left.typeId, right.typeId].includes(type.id));
  const sourceEdgeTypes = proposedRelationshipTypes(
    state.relationshipTypes,
    state.draft.relationshipTypes,
  ).filter((type) => connections.some((edge) => edge.typeId === type.id));
  const reviewed = body.reviewed as
    | {
        objects?: unknown[];
        relationships?: unknown[];
        types?: unknown[];
        relationshipTypes?: unknown[];
      }
    | undefined;
  if (
    !reviewed ||
    !isDeepStrictEqual(reviewed.objects, [left, right]) ||
    !isDeepStrictEqual(reviewed.types, sourceTypes) ||
    !isDeepStrictEqual(reviewed.relationshipTypes, sourceEdgeTypes) ||
    !isDeepStrictEqual(reviewed.relationships, connections)
  )
    throw new MapError('merge_conflict');
  const choices = body.choices;
  if (!choices || typeof choices !== 'object' || Array.isArray(choices))
    throw new MapError('merge_choices_required');
  const value = mergeValues(left, right, choices as Record<string, unknown>);
  if (!value) throw new MapError('merge_choices_required');
  const type = types.effective(state.draft).find((item) => item.id === value.typeId);
  if (
    !type ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    typeof value.description !== 'string'
  )
    throw new MapError('invalid_request', 400);
  readCustomValues(value.customValues, type);
  readFinancialFacts(value.financialFacts);
  readLifecycle(value.lifecycle);
  if (!body.identityConfirmed) value.identity = 'unresolved';
  const merge: ObjectMerge = {
    survivorId: left.id,
    absorbedId: right.id,
    identityConfirmed: body.identityConfirmed,
    objects: [left, right],
    types: sourceTypes,
    relationships: connections,
    relationshipTypes: sourceEdgeTypes,
    objectNames: Object.fromEntries(
      [...objects]
        .filter(([id]) => connections.some((edge) => edge.sourceId === id || edge.targetId === id))
        .map(([id, object]) => [id, object.name]),
    ),
    previousChanges: state.draft.changes.filter((change) => ids.includes(change.id)),
    previousRelationships: (state.draft.relationships ?? []).filter((change) =>
      connections.some((edge) => edge.id === change.id),
    ),
  };
  if (value.profileImageId) {
    if (value.profileImageId === left.profileImageId)
      images.validate(value.profileImageId, left.id);
    else {
      images.validate(value.profileImageId, right.id);
      const sourceImageId = value.profileImageId;
      value.profileImageId = images.insert(left.id, images.read(sourceImageId));
      merge.imageCopy = {
        sourceObjectId: right.id,
        sourceImageId,
        copiedImageId: value.profileImageId,
      };
    }
  }
  let draft = structuredClone(state.draft);
  const ownLeft = draft.changes.find((change) => change.id === left.id);
  const ownRight = draft.changes.find((change) => change.id === right.id);
  draft.changes = draft.changes.filter((change) => !ids.includes(change.id));
  draft.changes.push({
    id: left.id,
    before: ownLeft ? ownLeft.before : left,
    after: value,
    type,
    merge,
    ...(ownLeft?.restoreRevision !== undefined ? { restoreRevision: ownLeft.restoreRevision } : {}),
  });
  const edgeChoices = body.relationships as { id: string; action: string }[] | undefined;
  if (
    !Array.isArray(edgeChoices) ||
    edgeChoices.some((item) => !item || typeof item !== 'object' || typeof item.id !== 'string') ||
    edgeChoices.length !== connections.length ||
    new Set(edgeChoices.map((item) => item.id)).size !== connections.length ||
    connections.some(
      (edge) =>
        !edgeChoices.some(
          (choice) => choice.id === edge.id && ['keep', 'remove'].includes(choice.action),
        ),
    )
  )
    throw new MapError('merge_choices_required');
  // Remove the whole affected edge set before adding redirected edges so order
  // cannot decide which colliding relationship survives.
  for (const edge of connections) {
    const own = state.draft.relationships?.find((change) => change.id === edge.id);
    draft = edges.propose(draft, {
      id: edge.id,
      baseRevision: own ? (own.before?.revision ?? null) : edge.revision || null,
      value: null,
    }).draft;
  }
  for (const edge of connections) {
    if (edgeChoices.find((choice) => choice.id === edge.id)?.action === 'remove') continue;
    const own = state.draft.relationships?.find((change) => change.id === edge.id);
    const result = edges.propose(draft, {
      id: edge.id,
      baseRevision: own ? (own.before?.revision ?? null) : edge.revision || null,
      value: {
        ...edge,
        sourceId: edge.sourceId === right.id ? left.id : edge.sourceId,
        targetId: edge.targetId === right.id ? left.id : edge.targetId,
      },
    });
    if (result.existingId) throw new MapError('duplicate_relationship');
    const proposal = result.draft.relationships?.find((change) => change.id === edge.id);
    if (proposal && own?.restoreRevision !== undefined)
      proposal.restoreRevision = own.restoreRevision;
    draft = result.draft;
  }
  const rightType = types.effective(draft).find((item) => item.id === right.typeId);
  if (!rightType) throw new MapError('invalid_type', 400);
  const rightBefore = ownRight ? ownRight.before : right;
  if (rightBefore)
    draft.changes.push({ id: right.id, before: rightBefore, after: null, type: rightType });
  return { ...draft, version: state.draft.version + 1 };
}
