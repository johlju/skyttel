import { financialFields } from './financial-facts.js';
import type { BuiltinProperty, CustomField, ObjectType } from './map.js';
import { objectTypePresentation } from './map.js';

export const builtinProperties = [
  { key: 'description', label: 'Beskrivning' },
  ...financialFields,
] as const;
export type ObjectProperty =
  | { ref: string; kind: 'custom'; field: CustomField; name: string; sectionId: string }
  | { ref: string; kind: 'builtin'; field: BuiltinProperty; name: string; sectionId: string };

export function objectProperties(
  type: Pick<ObjectType, 'fields' | 'sections' | 'builtins' | 'propertyOrder'>,
) {
  const custom: ObjectProperty[] = objectTypePresentation(type).fields.map((field) => ({
    ref: `field:${field.id}`,
    kind: 'custom',
    field,
    name: field.name,
    sectionId: field.sectionId,
  }));
  const builtin: ObjectProperty[] = (type.builtins ?? []).map((field) => ({
    ref: `builtin:${field.key}`,
    kind: 'builtin',
    field,
    name: field.name,
    sectionId: field.sectionId,
  }));
  const entries = [...custom, ...builtin];
  return [
    ...(type.propertyOrder ?? []).flatMap((ref) => entries.filter((entry) => entry.ref === ref)),
    ...entries.filter((entry) => !type.propertyOrder?.includes(entry.ref)),
  ];
}

/** Retain independent identities beside their nearest surviving predecessor. */
export function orderedReferences(order: string[], available: string[], original: string[]) {
  const result = order.filter((ref) => available.includes(ref));
  for (const ref of available.filter((ref) => !result.includes(ref))) {
    const previous = original
      .slice(0, original.indexOf(ref))
      .reverse()
      .find((ref) => result.includes(ref));
    const index = previous
      ? result.indexOf(previous) + 1
      : original.includes(ref)
        ? 0
        : result.length;
    result.splice(index, 0, ref);
  }
  return result;
}

/** Presentation changes describe canonical references, never changes to their values. */
export function builtinPresentationChanges(before: ObjectType | null, after: ObjectType | null) {
  const describe = (type: ObjectType | null, key: BuiltinProperty['key']) => {
    const field = type?.builtins?.find((field) => field.key === key);
    return field
      ? `${field.name} · ${type?.sections?.find(({ id }) => id === field.sectionId)?.name ?? 'Dold, behåll värden'}`
      : 'Utanför typens avsnitt';
  };
  const changes = builtinProperties.flatMap(({ key, label }) => {
    const previous = describe(before, key),
      next = describe(after, key);
    return previous === next
      ? []
      : [`Placering av gemensam egenskap ${label}: ${previous} → ${next}`];
  });
  if (
    (before?.propertyOrder !== undefined || after?.propertyOrder !== undefined) &&
    JSON.stringify(before?.propertyOrder) !== JSON.stringify(after?.propertyOrder)
  ) {
    const names = (type: ObjectType | null) =>
      objectProperties(type ?? {})
        .map(({ name }) => name)
        .join(', ') || 'Inga';
    changes.push(`Egenskapernas ordning: ${names(before)} → ${names(after)}`);
  }
  return changes;
}
