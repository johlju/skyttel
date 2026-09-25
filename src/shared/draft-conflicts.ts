import { type FinancialFact, type FinancialFacts, financialFields } from './financial-facts.js';
import type {
  CustomValues,
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
  TypeDefinition,
} from './map.js';
import {
  compatibleCustomFields,
  proposedObjectTypes,
  proposedRelationships,
  proposedRelationshipTypes,
} from './map.js';

export type DraftConflict = {
  id: string;
  connections?: MapRelationship[];
  duplicates?: MapRelationship[];
  missingEndpoints?: string[];
  type?: TypeDefinition | null;
} & (
  | { kind: 'object'; current: MapObject | null }
  | { kind: 'relationship'; current: MapRelationship | null }
  | { kind: 'objectType'; current: ObjectType | null }
  | { kind: 'relationshipType'; current: RelationshipType | null }
);

function sameFact(left?: FinancialFact, right?: FinancialFact) {
  return (
    left?.knowledge === right?.knowledge &&
    left?.value === right?.value &&
    left?.reportedOn === right?.reportedOn
  );
}

export function resolvedRelationshipType(
  change: RelationshipTypeChange,
  current: RelationshipType,
): RelationshipType | null {
  const { before, after } = change;
  if (!after) return null;
  const field = <K extends 'name' | 'description' | 'forwardLabel' | 'reverseLabel'>(key: K) =>
    before && after[key] === before[key] ? current[key] : after[key];
  return {
    ...after,
    revision: current.revision + 1,
    name: field('name'),
    description: field('description'),
    forwardLabel: field('forwardLabel'),
    reverseLabel: field('reverseLabel'),
  };
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
  const financialFacts: FinancialFacts = {};
  for (const { key } of financialFields) {
    // The value, certainty and date describe one fact and must stay together.
    const fact = sameFact(after.financialFacts?.[key], before.financialFacts?.[key])
      ? current.financialFacts?.[key]
      : after.financialFacts?.[key];
    if (fact) financialFacts[key] = fact;
  }
  const customKeys = new Set([
    ...Object.keys(before.customValues ?? {}),
    ...Object.keys(after.customValues ?? {}),
    ...Object.keys(current.customValues ?? {}),
  ]);
  // Field identity belongs to its type. A type change and its corrected
  // values are one choice; only fields of the same type can merge separately.
  const changingType = before.typeId !== after.typeId || before.typeId !== current.typeId;
  const meaning =
    after.typeId === before.typeId &&
    [...customKeys].every((key) => after.customValues?.[key] === before.customValues?.[key])
      ? current
      : after;
  const customValues: CustomValues = changingType ? { ...meaning.customValues } : {};
  for (const key of changingType ? [] : customKeys) {
    const value =
      after.customValues?.[key] === before.customValues?.[key]
        ? current.customValues?.[key]
        : after.customValues?.[key];
    if (value !== undefined) customValues[key] = value;
  }
  return {
    typeId: changingType ? meaning.typeId : field('typeId'),
    name: field('name'),
    description: field('description'),
    ...(identity ? { identity } : {}),
    ...(lifecycle ? { lifecycle } : {}),
    ...(profileImageId ? { profileImageId } : {}),
    ...(Object.keys(financialFacts).length ? { financialFacts } : {}),
    ...(Object.keys(customValues).length ? { customValues } : {}),
  };
}

export function resolvedRelationshipValue(
  change: RelationshipChange,
  current: MapRelationship | null,
): RelationshipValue | null {
  const { before, after } = change;
  if (!before || !after || !current) return after;
  // Meaning, endpoints and certainty describe one relationship fact.
  const meaning = ['typeId', 'sourceId', 'targetId', 'knowledge'] as const;
  const value = meaning.every((key) => after[key] === before[key]) ? current : after;
  const lifecycle = after.lifecycle === before.lifecycle ? current.lifecycle : after.lifecycle;
  const endDate = sameFact(after.endDate, before.endDate) ? current.endDate : after.endDate;
  return {
    typeId: value.typeId,
    sourceId: value.sourceId,
    targetId: value.targetId,
    knowledge: value.knowledge,
    ...(lifecycle ? { lifecycle } : {}),
    ...(endDate ? { endDate } : {}),
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
    const changedType =
      type?.id !== change.type.id ||
      type?.revision !== change.type.revision ||
      (change.after &&
        type &&
        !compatibleCustomFields(change.after.customValues, change.type, type));
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
    if ((current?.revision ?? null) !== (change.before?.revision ?? null))
      conflicts.push({ kind: 'objectType', id: change.id, current });
  }
  for (const change of state.draft.relationshipTypes ?? []) {
    const current = state.relationshipTypes.find((type) => type.id === change.id) ?? null;
    if ((current?.revision ?? null) !== (change.before?.revision ?? null))
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
          if (id === null) return false;
          const proposal = state.draft.changes.find((item) => item.id === id);
          return proposal ? !proposal.after : !state.objects.some((item) => item.id === id);
        })
      : [];
    if (
      (current?.revision ?? null) !== (change.before?.revision ?? null) ||
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
