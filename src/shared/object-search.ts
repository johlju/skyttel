import type { ObjectType, ObjectValue } from './map.js';
import { propertyValueText } from './properties.js';

const normalize = (value: string) => value.normalize('NFC').toLocaleLowerCase('sv');

export function searchWords(query: string) {
  return normalize(query).trim().split(/\s+/).filter(Boolean);
}

export function searchFieldMatches(field: { label: string; value: string }, word: string) {
  return normalize(`${field.label} ${field.value}`).includes(word);
}

/** Search only an object's own information, never its relationships. */
export function objectMatchesQuery(
  object: ObjectValue,
  type: ObjectType | undefined,
  query: string,
) {
  const fields = [
    { label: 'Namn', value: object.name },
    { label: 'Typ', value: type?.name ?? '' },
    ...(object.properties ?? []).map((property) => ({
      label: property.label,
      value: propertyValueText(property),
    })),
  ];
  return searchWords(query).every((word) =>
    fields.some((field) => searchFieldMatches(field, word)),
  );
}
