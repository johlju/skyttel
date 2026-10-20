import type { ObjectType, RelationshipType } from './map.js';

export const definitionScalarFields = {
  objectType: ['name', 'description'],
  relationshipType: ['name', 'description', 'forwardLabel', 'reverseLabel'],
};
type DefinitionKind = keyof typeof definitionScalarFields;
type Facts = Map<string, unknown>;

export function typeDefinitionFacts(kind: DefinitionKind, value: object): Facts {
  const record = value as Record<string, unknown>;
  const result: Facts = new Map(definitionScalarFields[kind].map((key) => [key, record[key]]));
  return result;
}

export function applyTypeDefinitionFacts<T extends object>(
  kind: DefinitionKind,
  base: T,
  values: Facts,
): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of definitionScalarFields[kind]) {
    if (values.get(key) === undefined) delete result[key];
    else result[key] = values.get(key);
  }
  return result as T;
}

/** Merge definition facts identically for conflict previews and saving. */
export function resolveTypeDefinition<T extends ObjectType | RelationshipType>(
  kind: DefinitionKind,
  before: T | null,
  after: T,
  current: T,
): T {
  if (!before) return { ...after, revision: current.revision + 1 };
  const previous = typeDefinitionFacts(kind, before);
  const proposed = typeDefinitionFacts(kind, after);
  const merged = typeDefinitionFacts(kind, current);
  for (const key of new Set([...previous.keys(), ...proposed.keys()])) {
    const left = previous.get(key),
      right = proposed.get(key);
    const equal =
      Array.isArray(left) && Array.isArray(right)
        ? left.length === right.length && left.every((value, index) => value === right[index])
        : left === right;
    if (!equal) merged.set(key, right);
  }
  const result = applyTypeDefinitionFacts(kind, current, merged);
  return { ...result, revision: current.revision + 1 };
}
