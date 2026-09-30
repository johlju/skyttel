import type {
  BuiltinProperty,
  CustomField,
  ObjectType,
  RelationshipType,
  TypeSection,
} from './map.js';
import { objectProperties, orderedReferences } from './object-properties.js';

export const definitionScalarFields = {
  objectType: ['name', 'description'],
  relationshipType: ['name', 'description', 'forwardLabel', 'reverseLabel'],
};
type DefinitionKind = keyof typeof definitionScalarFields;
type Facts = Map<string, unknown>;

export function typeDefinitionFacts(kind: DefinitionKind, value: object): Facts {
  const record = value as Record<string, unknown>;
  const result: Facts = new Map(definitionScalarFields[kind].map((key) => [key, record[key]]));
  result.set(
    'fieldOrder',
    ((record.fields ?? []) as CustomField[]).map(({ id }) => id),
  );
  result.set(
    'sectionOrder',
    (record.sections as TypeSection[] | undefined)?.map(({ id }) => id),
  );
  for (const section of (record.sections ?? []) as TypeSection[]) {
    result.set(`section:${section.id}`, true);
    result.set(`section:${section.id}:name`, section.name);
  }
  for (const field of (record.fields ?? []) as CustomField[]) {
    result.set(`field:${field.id}`, true);
    for (const key of ['name', 'description', 'kind', 'sectionId'] as const)
      result.set(`field:${field.id}:${key}`, field[key]);
  }
  if (kind === 'objectType') {
    result.set('builtins', record.builtins === undefined ? undefined : true);
    result.set('propertyOrder', record.propertyOrder);
    for (const field of (record.builtins ?? []) as BuiltinProperty[]) {
      result.set(`builtin:${field.key}`, true);
      result.set(`builtin:${field.key}:name`, field.name);
      result.set(`builtin:${field.key}:sectionId`, field.sectionId);
    }
  }
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
  function ordered<T extends { id: string }>(items: T[], key: string) {
    const order = (values.get(key) ?? []) as string[];
    const original = ((base as ObjectType)[key === 'fieldOrder' ? 'fields' : 'sections'] ?? []).map(
      ({ id }) => id,
    );
    return orderedReferences(
      order,
      items.map(({ id }) => id),
      original,
    ).flatMap((id) => items.filter((item) => item.id === id));
  }
  const fields = [...values]
    .filter(
      ([key, value]) => key.startsWith('field:') && key.split(':').length === 2 && value === true,
    )
    .map(([key]) => ({
      id: key.slice(6),
      name: values.get(`${key}:name`),
      description: values.get(`${key}:description`),
      kind: values.get(`${key}:kind`),
      ...(values.get(`${key}:sectionId`) !== undefined
        ? { sectionId: values.get(`${key}:sectionId`) }
        : {}),
    }));
  if (fields.length) result.fields = ordered(fields, 'fieldOrder');
  else delete result.fields;
  const builtins =
    kind === 'objectType'
      ? [...values]
          .filter(
            ([key, value]) =>
              key.startsWith('builtin:') && key.split(':').length === 2 && value === true,
          )
          .map(([key]) => ({
            key: key.slice(8),
            name: values.get(`${key}:name`),
            sectionId: values.get(`${key}:sectionId`),
          }))
      : [];
  if (kind === 'objectType') {
    if (values.get('builtins') !== undefined || builtins.length) result.builtins = builtins;
    else delete result.builtins;
    const available = objectProperties(result as unknown as ObjectType).map(({ ref }) => ref);
    const original = objectProperties(base as ObjectType).map(({ ref }) => ref);
    if (values.get('propertyOrder') !== undefined || builtins.length)
      result.propertyOrder = orderedReferences(
        (values.get('propertyOrder') ?? []) as string[],
        available,
        original,
      );
    else delete result.propertyOrder;
  }
  const sections = [...values]
    .filter(
      ([key, value]) => key.startsWith('section:') && key.split(':').length === 2 && value === true,
    )
    .map(([key]) => ({ id: key.slice(8), name: values.get(`${key}:name`) }));
  // Keep a section required by an independent field edit while reversing
  // another presentation fact. Hiding never removes the field or its value.
  for (const field of [...fields, ...builtins]) {
    if (!field.sectionId || sections.some(({ id }) => id === field.sectionId)) continue;
    const section = ((base as ObjectType).sections ?? []).find(({ id }) => id === field.sectionId);
    if (section) sections.push(section);
  }
  if (values.get('sectionOrder') !== undefined || sections.length)
    result.sections = ordered(sections, 'sectionOrder');
  else delete result.sections;
  return result as T;
}

/** Merge definition facts identically for conflict previews, saving and undo. */
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
  for (const field of [...(result.fields ?? []), ...((result as ObjectType).builtins ?? [])]) {
    if (!field.sectionId || result.sections?.some(({ id }) => id === field.sectionId)) continue;
    const section = after.sections?.find(({ id }) => id === field.sectionId);
    if (section) result.sections = [...(result.sections ?? []), section];
  }
  return { ...result, revision: current.revision + 1 };
}
