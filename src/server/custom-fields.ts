import type { CustomField, CustomValues, ObjectType } from '../shared/map.js';
import { MapError } from './map-error.js';

export function readCustomValues(
  value: unknown,
  type: Pick<ObjectType, 'fields'>,
): CustomValues | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MapError('invalid_custom_value', 400);
  const result: CustomValues = {};
  for (const [id, answer] of Object.entries(value)) {
    const field = type.fields?.find((item) => item.id === id);
    if (!field) throw new MapError('invalid_custom_value', 400);
    const valid =
      field.kind === 'boolean'
        ? typeof answer === 'boolean'
        : field.kind === 'number'
          ? typeof answer === 'number' && Number.isFinite(answer)
          : typeof answer === 'string' &&
            (field.kind === 'text'
              ? answer.length <= 2000
              : /^\d{4}-\d{2}-\d{2}$/.test(answer) &&
                !Number.isNaN(Date.parse(answer)) &&
                new Date(answer).toISOString().slice(0, 10) === answer);
    if (!valid) throw new MapError('invalid_custom_value', 400);
    result[id] = answer;
  }
  return Object.keys(result).length ? result : undefined;
}

export function readCustomFields(value: unknown): CustomField[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new MapError('invalid_type_definition', 400);
  const ids = new Set<string>();
  return value.map((field) => {
    if (
      !field ||
      typeof field.id !== 'string' ||
      !/^[\w-]{1,128}$/.test(field.id) ||
      ['__proto__', 'constructor', 'prototype'].includes(field.id) ||
      ids.has(field.id) ||
      typeof field.name !== 'string' ||
      !field.name.trim() ||
      field.name.length > 200 ||
      typeof field.description !== 'string' ||
      field.description.length > 2000 ||
      !['text', 'number', 'date', 'boolean'].includes(field.kind)
    )
      throw new MapError('invalid_type_definition', 400);
    ids.add(field.id);
    return {
      id: field.id,
      name: field.name.trim(),
      description: field.description,
      kind: field.kind,
    };
  });
}
