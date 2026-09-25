import type { MapDraft, MapObject, MapState, ObjectMerge, ObjectValue } from './map.js';
import { proposedRelationships } from './map.js';

export function mergeObjects(state: MapState) {
  const objects = new Map(state.objects.map((value) => [value.id, value]));
  for (const change of state.draft.changes) {
    if (change.after)
      objects.set(change.id, {
        ...change.after,
        id: change.id,
        householdId: change.type.householdId,
        revision: change.before?.revision ?? 0,
      });
    else objects.delete(change.id);
  }
  return objects;
}
export function mergeFacts(value: ObjectValue): Record<string, unknown> {
  const { financialFacts, customValues, ...simple } = value;
  const facts: Record<string, unknown> = {};
  for (const key of ['typeId', 'name', 'description', 'identity', 'lifecycle', 'profileImageId'])
    facts[key] = simple[key as keyof typeof simple];
  for (const [key, fact] of Object.entries(financialFacts ?? {}))
    facts[`financialFacts:${key}`] = fact;
  // A custom field's ID has meaning only within its object type.
  for (const [key, fact] of Object.entries(customValues ?? {}))
    facts[`customValues:${value.typeId}:${key}`] = fact;
  return facts;
}
export function mergeNeedsChoice(key: string, left: unknown, right: unknown) {
  return (
    JSON.stringify(left) !== JSON.stringify(right) || (key === 'identity' && left === 'unresolved')
  );
}
export function mergeConnections(state: MapState, ids: string[]) {
  return [...proposedRelationships(state.relationships, state.draft.relationships).values()].filter(
    (edge) =>
      ids.includes(edge.sourceId) || (edge.targetId !== null && ids.includes(edge.targetId)),
  );
}
export function mergeFor(draft: MapDraft, kind: string, id: unknown) {
  if (kind !== 'object' && kind !== 'relationship') return undefined;
  return draft.changes.find(
    (change) =>
      change.merge &&
      (kind === 'object'
        ? [change.merge.survivorId, change.merge.absorbedId].includes(id as string)
        : change.merge.relationships.some((edge) => edge.id === id)),
  )?.merge;
}
export function withoutMerge(draft: MapDraft, merge: ObjectMerge): MapDraft {
  const ids = [merge.survivorId, merge.absorbedId];
  const edgeIds = merge.relationships.map((edge) => edge.id);
  return {
    ...draft,
    changes: [
      ...draft.changes.filter((change) => !ids.includes(change.id)),
      ...merge.previousChanges,
    ],
    relationships: [
      ...(draft.relationships ?? []).filter((change) => !edgeIds.includes(change.id)),
      ...merge.previousRelationships,
    ],
  };
}
export function mergeValues(
  left: MapObject,
  right: MapObject,
  choices: Record<string, unknown>,
): ObjectValue | null {
  const a = mergeFacts(left);
  const b = mergeFacts(right);
  const value: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  const financial: Record<string, unknown> = {};
  const typeChoice = choices.typeId;
  const typeId =
    a.typeId === b.typeId
      ? a.typeId
      : typeChoice === 'survivor'
        ? a.typeId
        : typeChoice === 'absorbed'
          ? b.typeId
          : undefined;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const differs = mergeNeedsChoice(key, a[key], b[key]);
    const choice = choices[key];
    if (differs && !['survivor', 'absorbed', 'omit'].includes(choice as string)) return null;
    const fact = !differs
      ? a[key]
      : choice === 'survivor'
        ? a[key]
        : choice === 'absorbed'
          ? b[key]
          : undefined;
    if (fact === undefined) continue;
    if (key.startsWith('financialFacts:')) financial[key.slice(15)] = fact;
    else if (key.startsWith('customValues:')) {
      const prefix = `customValues:${typeId}:`;
      if (!key.startsWith(prefix)) return null;
      custom[key.slice(prefix.length)] = fact;
    } else value[key] = fact;
  }
  return {
    ...value,
    ...(Object.keys(custom).length ? { customValues: custom } : {}),
    ...(Object.keys(financial).length ? { financialFacts: financial } : {}),
  } as unknown as ObjectValue;
}
