import { restorationIsCurrent } from './definition-restoration.js';
import type {
  DraftChange,
  MapObject,
  MapRelationship,
  MapState,
  ObjectType,
  ObjectValue,
  RelationshipChange,
  RelationshipType,
  RelationshipTypeChange,
  RelationshipValue,
} from './map.js';
import { proposedObjectTypes, proposedRelationships, proposedRelationshipTypes } from './map.js';
import { resolvedProperties } from './property-merge.js';
import { resolveTypeDefinition } from './type-definition.js';

export type DraftConflict = {
  id: string;
  connections?: MapRelationship[];
  duplicates?: MapRelationship[];
  missingEndpoints?: string[];
  type?: ObjectType | RelationshipType | null;
} & (
  | { kind: 'object'; current: MapObject | null }
  | { kind: 'relationship'; current: MapRelationship | null }
  | { kind: 'objectType'; current: ObjectType | null }
  | { kind: 'relationshipType'; current: RelationshipType | null }
);

export function resolvedRelationshipType(
  change: RelationshipTypeChange,
  current: RelationshipType,
): RelationshipType | null {
  const { before, after } = change;
  if (!after) return null;
  return resolveTypeDefinition('relationshipType', before, after, current);
}

export function resolvedObjectValue(
  change: DraftChange,
  current: MapObject | null,
): ObjectValue | null {
  const { before, after } = change;
  if (!before || !after || !current) return after;
  const field = <K extends keyof ObjectValue>(key: K): ObjectValue[K] =>
    after[key] === before[key] ? current[key] : after[key];
  const identity = field('identity');
  const lifecycle = field('lifecycle');
  const profileImageId = field('profileImageId');
  const iconId = field('iconId');
  const properties =
    before.properties || current.properties || after.properties
      ? resolvedProperties(before.properties, current.properties, after.properties)
      : undefined;
  return {
    typeId: field('typeId'),
    name: field('name'),
    ...(identity ? { identity } : {}),
    ...(lifecycle ? { lifecycle } : {}),
    ...(profileImageId ? { profileImageId } : {}),
    ...(iconId ? { iconId } : {}),
    ...(properties ? { properties } : {}),
  };
}

export function resolvedRelationshipValue(
  change: RelationshipChange,
  current: MapRelationship | null,
): RelationshipValue | null {
  const { before, after } = change;
  if (!before || !after || !current) return after;
  const meaning = ['typeId', 'sourceId', 'targetId'] as const;
  const value = meaning.every((key) => after[key] === before[key]) ? current : after;
  const lifecycle = after.lifecycle === before.lifecycle ? current.lifecycle : after.lifecycle;
  const properties =
    before.properties || current.properties || after.properties
      ? resolvedProperties(before.properties, current.properties, after.properties)
      : undefined;
  return {
    ...(properties ? { properties } : {}),
    typeId: value.typeId,
    sourceId: value.sourceId,
    targetId: value.targetId,
    ...(lifecycle ? { lifecycle } : {}),
  };
}

export function draftConflicts(state: MapState): DraftConflict[] {
  const types = proposedObjectTypes(state.types, state.draft.objectTypes);
  const edgeTypes = proposedRelationshipTypes(
    state.relationshipTypes,
    state.draft.relationshipTypes,
  );
  const conflicts: DraftConflict[] = state.draft.changes.flatMap((change) => {
    const current = state.objects.find((object) => object.id === change.id) ?? null;
    const type =
      (change.after ? types : [...types, ...state.types]).find(
        (item) =>
          item.id ===
          (resolvedObjectValue(change, current)?.typeId ?? current?.typeId ?? change.type.id),
      ) ?? null;
    const changedType = type?.id !== change.type.id || type?.revision !== change.type.revision;
    const connections = change.after
      ? []
      : state.relationships.filter(
          (edge) =>
            (edge.sourceId === change.id || edge.targetId === change.id) &&
            !state.draft.relationships?.some(
              (proposal) =>
                proposal.id === edge.id &&
                (!proposal.after ||
                  (proposal.after.sourceId !== change.id && proposal.after.targetId !== change.id)),
            ),
        );
    return (current?.revision ?? null) !== (change.before?.revision ?? null) ||
      connections.length ||
      changedType
      ? [
          {
            kind: 'object' as const,
            id: change.id,
            current,
            ...(connections.length ? { connections } : {}),
            ...(changedType ? { type } : {}),
          },
        ]
      : [];
  });
  for (const change of state.draft.objectTypes ?? []) {
    const current = state.types.find((type) => type.id === change.id) ?? null;
    if (
      (current?.revision ?? null) !== (change.before?.revision ?? null) ||
      (change.restoration &&
        !restorationIsCurrent(state, { kind: 'objectType', id: change.id }, change.restoration))
    )
      conflicts.push({ kind: 'objectType', id: change.id, current });
  }
  for (const change of state.draft.relationshipTypes ?? []) {
    const current = state.relationshipTypes.find((type) => type.id === change.id) ?? null;
    if (
      (current?.revision ?? null) !== (change.before?.revision ?? null) ||
      (change.restoration &&
        !restorationIsCurrent(
          state,
          { kind: 'relationshipType', id: change.id },
          change.restoration,
        ))
    )
      conflicts.push({ kind: 'relationshipType', id: change.id, current });
  }
  for (const change of state.draft.relationships ?? []) {
    const current = state.relationships.find((value) => value.id === change.id) ?? null;
    const after = resolvedRelationshipValue(change, current);
    const type =
      (after ? edgeTypes : [...edgeTypes, ...state.relationshipTypes]).find(
        (item) => item.id === (after?.typeId ?? current?.typeId ?? change.type.id),
      ) ?? null;
    const changedType = type?.id !== change.type.id || type?.revision !== change.type.revision;
    const duplicates = after
      ? [...proposedRelationships(state.relationships, state.draft.relationships).values()].filter(
          (edge) =>
            edge.id !== change.id &&
            edge.typeId === after.typeId &&
            edge.sourceId === after.sourceId &&
            edge.targetId === after.targetId,
        )
      : [];
    const missingEndpoints = after
      ? [after.sourceId, after.targetId].filter((id): id is string => {
          const proposal = state.draft.changes.find((item) => item.id === id);
          return proposal ? !proposal.after : !state.objects.some((item) => item.id === id);
        })
      : [];
    if (
      ((current || !change.endpointRecovery) &&
        (current?.revision ?? null) !== (change.before?.revision ?? null)) ||
      duplicates.length ||
      missingEndpoints.length ||
      changedType
    )
      conflicts.push({
        kind: 'relationship',
        id: change.id,
        current,
        ...(duplicates.length ? { duplicates } : {}),
        ...(missingEndpoints.length ? { missingEndpoints } : {}),
        ...(changedType ? { type } : {}),
      });
  }
  return conflicts;
}
