import { isDeepStrictEqual } from 'node:util';
import type { CustomField, ObjectType, TypeSection } from '../shared/map.js';
import { MapError } from './map-error.js';

type Kind = 'object' | 'relationship' | 'objectType' | 'relationshipType';
type FactKind = Kind | 'typedObject';
type Facts = Map<string, unknown>;
type Change<T> = { before: T | null; after: T | null };
const scalarFields = {
  object: ['typeId', 'name', 'description', 'identity', 'lifecycle', 'profileImageId', 'iconId'],
  relationship: ['lifecycle', 'endDate'],
  objectType: ['name', 'description'],
  relationshipType: ['name', 'description', 'forwardLabel', 'reverseLabel'],
};
const meaningFields = ['typeId', 'sourceId', 'targetId', 'knowledge'];

function scalars(kind: FactKind) {
  return kind === 'typedObject'
    ? scalarFields.object.filter((key) => key !== 'typeId')
    : scalarFields[kind];
}
function groups(kind: FactKind) {
  return kind === 'object' ? ['financialFacts', 'customValues'] : ['financialFacts'];
}
function facts(kind: FactKind, value: object): Facts {
  const record = value as Record<string, unknown>;
  const result: Facts = new Map(scalars(kind).map((key) => [key, record[key]]));
  if (kind === 'typedObject')
    result.set('objectMeaning', [record.typeId, record.customValues ?? {}]);
  if (kind === 'relationship')
    result.set(
      'meaning',
      meaningFields.map((key) => record[key]),
    );
  if (kind === 'object' || kind === 'typedObject')
    for (const group of groups(kind))
      for (const [key, item] of Object.entries(record[group] ?? {}))
        result.set(`${group}:${key}`, item);
  if (kind === 'objectType') {
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
  }
  return result;
}

function apply<T extends object>(kind: FactKind, base: T, values: Facts): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of scalars(kind)) {
    if (values.get(key) === undefined) delete result[key];
    else result[key] = values.get(key);
  }
  if (kind === 'typedObject') {
    const [typeId, customValues] = values.get('objectMeaning') as [string, object];
    result.typeId = typeId;
    if (Object.keys(customValues).length) result.customValues = customValues;
    else delete result.customValues;
  }
  if (kind === 'relationship') {
    const meaning = values.get('meaning') as unknown[];
    meaningFields.forEach((key, index) => {
      result[key] = meaning[index];
    });
  }
  if (kind === 'object' || kind === 'typedObject')
    for (const group of groups(kind)) {
      const entries = [...values].filter(
        ([key, value]) => key.startsWith(`${group}:`) && value !== undefined,
      );
      if (entries.length)
        result[group] = Object.fromEntries(
          entries.map(([key, value]) => [key.slice(group.length + 1), value]),
        );
      else delete result[group];
    }
  if (kind === 'objectType') {
    function ordered<T extends { id: string }>(items: T[], key: string) {
      const order = (values.get(key) ?? []) as string[];
      const result = order.flatMap((id) => items.filter((item) => item.id === id));
      const original = (
        (base as ObjectType)[key === 'fieldOrder' ? 'fields' : 'sections'] ?? []
      ).map(({ id }) => id);
      for (const item of items.filter((item) => !order.includes(item.id))) {
        const previous = original
          .slice(0, original.indexOf(item.id))
          .reverse()
          .find((id) => result.some((entry) => entry.id === id));
        const index = previous
          ? result.findIndex(({ id }) => id === previous) + 1
          : original.includes(item.id)
            ? 0
            : result.length;
        result.splice(index, 0, item);
      }
      return result;
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
    const sections = [...values]
      .filter(
        ([key, value]) =>
          key.startsWith('section:') && key.split(':').length === 2 && value === true,
      )
      .map(([key]) => ({ id: key.slice(8), name: values.get(`${key}:name`) }));
    // Keep a section required by an independent field edit while reversing
    // another presentation fact. Hiding never removes the field or its value.
    for (const field of fields) {
      if (!field.sectionId || sections.some(({ id }) => id === field.sectionId)) continue;
      const section = ((base as ObjectType).sections ?? []).find(
        ({ id }) => id === field.sectionId,
      );
      if (section) sections.push(section);
    }
    if (values.get('sectionOrder') !== undefined || sections.length)
      result.sections = ordered(sections, 'sectionOrder');
    else delete result.sections;
  }
  return result as T;
}

/** Apply the proposed facts over the current definition, retaining independent facts. */
export function resolveObjectType(
  before: ObjectType | null,
  after: ObjectType,
  current: ObjectType,
) {
  if (!before) return { ...after, revision: current.revision + 1 };
  const result = patch(
    'objectType',
    current,
    facts('objectType', after),
    changed(facts('objectType', before), facts('objectType', after)),
  );
  for (const field of result.fields ?? []) {
    if (!field.sectionId || result.sections?.some(({ id }) => id === field.sectionId)) continue;
    const section = after.sections?.find(({ id }) => id === field.sectionId);
    if (section) result.sections = [...(result.sections ?? []), section];
  }
  return { ...result, revision: current.revision + 1 };
}

function changed(before: Facts, after: Facts) {
  return [...new Set([...before.keys(), ...after.keys()])].filter(
    (key) => !isDeepStrictEqual(before.get(key), after.get(key)),
  );
}
function sameFact(key: string, left: unknown, right: unknown) {
  if (
    (key === 'fieldOrder' || key === 'sectionOrder') &&
    Array.isArray(left) &&
    Array.isArray(right)
  ) {
    // Adding or removing an independent field/section does not change the
    // relative order of the facts being undone. Membership has separate keys.
    return isDeepStrictEqual(
      left.filter((id) => right.includes(id)),
      right.filter((id) => left.includes(id)),
    );
  }
  return isDeepStrictEqual(left, right);
}
function patch<T extends object>(kind: FactKind, base: T, source: Facts, keys: string[]) {
  const result = facts(kind, base);
  for (const key of keys) result.set(key, source.get(key));
  return apply(kind, base, result);
}
function revision(value: object) {
  return (value as { revision: number }).revision;
}

// Reverse only the facts changed by the selected save. Build a new base so
// subsequent conflict resolution can still preserve independent newer facts.
export function inverseChange<T extends object>(
  kind: FactKind,
  original: Change<T>,
  current: T | null,
  own?: Change<object>,
): (Change<T> & { undoFields?: string[] }) | null {
  const expected = original.after,
    desired = original.before;
  // A field ID has meaning only within its type. Reversing a type change
  // must not carry later target-type fields into the restored source type.
  if (
    kind === 'object' &&
    new Set(
      [expected, desired, current, own?.before, own?.after]
        .filter((value) => value != null)
        .map((value) => (value as { typeId: string }).typeId),
    ).size > 1
  )
    kind = 'typedObject';
  const keys = expected && desired ? changed(facts(kind, expected), facts(kind, desired)) : null;
  const ownKeys =
    own?.before && own.after ? changed(facts(kind, own.before), facts(kind, own.after)) : null;
  if (
    own &&
    (!keys ||
      !ownKeys ||
      keys.some(
        (key) =>
          ownKeys.includes(key) &&
          (!['fieldOrder', 'sectionOrder'].includes(key) ||
            (!sameFact(
              key,
              facts(kind, expected ?? {}).get(key),
              facts(kind, desired ?? {}).get(key),
            ) &&
              !sameFact(
                key,
                facts(kind, own.before ?? {}).get(key),
                facts(kind, own.after ?? {}).get(key),
              ))),
      ))
  )
    throw new MapError('undo_draft_overlap');
  if (!desired && !current && !own) return null;
  let before = expected;
  let after = desired;
  if (keys && expected && desired && current) {
    const overlaps = keys.some(
      (key) => !sameFact(key, facts(kind, current).get(key), facts(kind, expected).get(key)),
    );
    before = {
      ...patch(kind, current, facts(kind, expected), keys),
      revision: overlaps ? revision(expected) : revision(current),
    };
    after = patch(kind, current, facts(kind, desired), keys);
  } else if (current && expected && !changed(facts(kind, current), facts(kind, expected)).length)
    before = current;
  if (own?.before && own.after && ownKeys && before && after) {
    before = {
      ...patch(kind, before, facts(kind, own.before), ownKeys),
      revision:
        current && revision(own.before) === revision(current)
          ? revision(before)
          : revision(own.before),
    };
    after = patch(kind, after, facts(kind, own.after), ownKeys);
  }
  return { before, after, ...(keys ? { undoFields: keys } : {}) };
}

// Choosing the current value for an undo conflict does not discard facts
// contributed independently by the user's private draft.
export function keepIndependent<T extends object>(
  kind: FactKind,
  change: { before: T | null; after: object | null; undo?: true; undoFields?: string[] },
  current: T | null,
): Change<T> | null {
  if (!change.undo || !change.undoFields || !change.before || !change.after) return null;
  if (
    kind === 'object' &&
    (change.undoFields.includes('objectMeaning') ||
      new Set(
        [change.before, change.after, current]
          .filter((value) => value != null)
          .map((value) => (value as { typeId: string }).typeId),
      ).size > 1)
  )
    kind = 'typedObject';
  // Older drafts can describe undo with separate type/field keys. Apply
  // those keys to the same grouped meaning when their types now differ.
  const undoFields = change.undoFields.map((key) =>
    kind === 'typedObject' && (key === 'typeId' || key.startsWith('customValues:'))
      ? 'objectMeaning'
      : key,
  );
  const before = facts(kind, change.before),
    after = facts(kind, change.after);
  const keys = changed(before, after).filter((key) => !undoFields.includes(key));
  if (!keys.length) return null;
  if (!current) return { before: change.before, after: patch(kind, change.before, after, keys) };
  const overlaps = keys.some(
    (key) => !sameFact(key, before.get(key), facts(kind, current).get(key)),
  );
  return {
    before: {
      ...patch(kind, current, before, keys),
      revision: overlaps ? revision(change.before) : revision(current),
    },
    after: patch(kind, current, after, keys),
  };
}
