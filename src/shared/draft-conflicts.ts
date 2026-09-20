import { type FinancialFact, type FinancialFacts, financialFields } from './financial-facts.js';
import type {
  DraftChange,
  MapObject,
  MapRelationship,
  MapState,
  ObjectValue,
  TypeDefinition,
} from './map.js';
import { proposedRelationships } from './map.js';

export type DraftConflict = {
  id: string;
  connections?: MapRelationship[];
  duplicates?: MapRelationship[];
  missingEndpoints?: string[];
  type?: TypeDefinition | null;
} & (
  | { kind: 'object'; current: MapObject | null }
  | { kind: 'relationship'; current: MapRelationship | null }
);

export function resolvedObjectValue(
  change: DraftChange,
  current: MapObject | null,
): ObjectValue | null {
  const { before, after } = change;
  if (!before || !after || !current) return after;
  const field = <K extends keyof ObjectValue>(key: K): ObjectValue[K] =>
    after[key] === before[key] ? current[key] : after[key];
  const identity = field('identity');
  const financialFacts: FinancialFacts = {};
  const sameFact = (left?: FinancialFact, right?: FinancialFact) =>
    left?.knowledge === right?.knowledge &&
    left?.value === right?.value &&
    left?.reportedOn === right?.reportedOn;
  for (const { key } of financialFields) {
    // The value, certainty and date describe one fact and must stay together.
    const fact = sameFact(after.financialFacts?.[key], before.financialFacts?.[key])
      ? current.financialFacts?.[key]
      : after.financialFacts?.[key];
    if (fact) financialFacts[key] = fact;
  }
  return {
    typeId: field('typeId'),
    name: field('name'),
    description: field('description'),
    ...(identity ? { identity } : {}),
    ...(Object.keys(financialFacts).length ? { financialFacts } : {}),
  };
}

export function draftConflicts(state: MapState): DraftConflict[] {
  const conflicts: DraftConflict[] = state.draft.changes.flatMap((change) => {
    const current = state.objects.find((object) => object.id === change.id) ?? null;
    const type =
      state.types.find(
        (item) => item.id === (resolvedObjectValue(change, current)?.typeId ?? change.type.id),
      ) ?? null;
    const changedType = type?.id !== change.type.id || type?.revision !== change.type.revision;
    const connections = change.after
      ? []
      : state.relationships.filter(
          (edge) =>
            (edge.sourceId === change.id || edge.targetId === change.id) &&
            !state.draft.relationships?.some(
              (proposal) => proposal.id === edge.id && !proposal.after,
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
  for (const change of state.draft.relationships ?? []) {
    const current = state.relationships.find((value) => value.id === change.id) ?? null;
    const type = state.relationshipTypes.find((item) => item.id === change.type.id) ?? null;
    const changedType = type?.revision !== change.type.revision;
    const duplicates = change.after
      ? [...proposedRelationships(state.relationships, state.draft.relationships).values()].filter(
          (edge) =>
            edge.id !== change.id &&
            edge.typeId === change.after?.typeId &&
            edge.sourceId === change.after.sourceId &&
            edge.targetId === change.after.targetId,
        )
      : [];
    const missingEndpoints = change.after
      ? [change.after.sourceId, change.after.targetId].filter((id): id is string => {
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
