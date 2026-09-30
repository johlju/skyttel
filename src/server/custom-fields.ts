import type { CustomField, CustomValues, ObjectType, TypeSection } from '../shared/map.js';
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
      Object.keys(field).some(
        (key) => !['id', 'name', 'description', 'kind', 'sectionId'].includes(key),
      ) ||
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

/** Share section validation and old-client omission semantics between both type kinds. */
export function readFieldPresentation(
  type: Pick<ObjectType, 'fields' | 'sections'>,
  previous?: Pick<ObjectType, 'fields' | 'sections'> | null,
) {
  const safeId = (id: unknown): id is string =>
    typeof id === 'string' &&
    /^[\w-]{1,128}$/.test(id) &&
    !['__proto__', 'constructor', 'prototype'].includes(id);
  const sectionIds = new Set<string>();
  let sections: TypeSection[] | undefined;
  if (type.sections !== undefined) {
    if (!Array.isArray(type.sections) || type.sections.length > 100)
      throw new MapError('invalid_type_definition', 400);
    sections = type.sections.map((section) => {
      if (
        !section ||
        !safeId(section.id) ||
        sectionIds.has(section.id) ||
        typeof section.name !== 'string' ||
        !section.name.trim() ||
        section.name.length > 200
      )
        throw new MapError('invalid_type_definition', 400);
      sectionIds.add(section.id);
      return { id: section.id, name: section.name.trim() };
    });
  } else if (previous?.sections !== undefined) {
    sections = previous.sections;
    for (const section of sections) sectionIds.add(section.id);
  }
  const preservePresentation =
    type.sections === undefined &&
    (previous?.sections !== undefined ||
      previous?.fields?.some((field) => field.sectionId !== undefined));
  let fields: CustomField[] = readCustomFields(type.fields).map((base, index) => {
    const field = type.fields?.[index] as CustomField;
    const sectionId = preservePresentation
      ? (previous?.fields?.find((item) => item.id === field.id)?.sectionId ??
        (sections === undefined ? undefined : (sections[0]?.id ?? '')))
      : field.sectionId;
    if (
      (sections !== undefined && typeof sectionId !== 'string') ||
      (sectionId !== undefined &&
        (typeof sectionId !== 'string' || (sectionId !== '' && !sectionIds.has(sectionId))))
    )
      throw new MapError('invalid_type_definition', 400);
    return {
      ...base,
      ...(sectionId !== undefined ? { sectionId } : {}),
    };
  });
  // An older client cannot erase section placement or ordering it never read.
  if (preservePresentation) {
    const order = previous?.fields?.map((field) => field.id) ?? [];
    fields = [
      ...order.flatMap((id) => fields.filter((field) => field.id === id)),
      ...fields.filter((field) => !order.includes(field.id)),
    ];
  }
  return { fields, sections };
}
