import { conflictRemovalProperties } from './conflict-removal.js';
import type { DraftConflict } from './draft-conflicts.js';
import type { MapState, ObjectType, ObjectValue, RelationshipValue } from './map.js';
import { proposedObjectTypes, proposedRelationships, proposedRelationshipTypes } from './map.js';
import { objectIconLabel } from './object-icons.js';
import { type Property, propertiesSchema, propertyValueText } from './properties.js';
import { mergedPropertyOrder, propertyMergeSide, propertyOrderSide } from './property-merge.js';
import { relationshipLabel } from './relationship-label.js';

export type ConflictSide = 'saved' | 'proposed';
export type ConflictChoices = Record<string, ConflictSide>;
export interface ConflictProperty {
  key: string;
  label: string;
  labels?: Record<ConflictSide, string>;
  saved: unknown;
  proposed: unknown;
  before: unknown;
  automatic?: ConflictSide;
  orderLabels?: Record<string, string>;
}
export function sameConflictValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const a = Object.entries(left);
  const b = Object.entries(right);
  return (
    a.length === b.length &&
    a.every(([key, value]) => sameConflictValue(value, (right as Record<string, unknown>)[key]))
  );
}
export function conflictChange(state: MapState, conflict: Pick<DraftConflict, 'kind' | 'id'>) {
  const changes =
    conflict.kind === 'object'
      ? state.draft.changes
      : conflict.kind === 'relationship'
        ? state.draft.relationships
        : conflict.kind === 'objectType'
          ? state.draft.objectTypes
          : state.draft.relationshipTypes;
  return changes?.find((change) => change.id === conflict.id);
}
export function conflictPropertyValue(value: unknown, key: ConflictProperty['key']): unknown {
  if (value && typeof value === 'object' && 'properties' in value) {
    const properties = (value as { properties?: Property[] }).properties ?? [];
    if (key === 'propertiesOrder') return properties.map(({ id }) => id);
    if (key.startsWith('properties.')) return properties.find(({ id }) => id === key.slice(11));
  }
  if (key === 'propertiesOrder') return [];
  if (key.startsWith('properties.')) return undefined;
  return key
    .split('.')
    .reduce<unknown>(
      (current, part) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[part]
          : undefined,
      value,
    );
}
export function conflictProperties(state: MapState, conflict: DraftConflict): ConflictProperty[] {
  const change = conflictChange(state, conflict);
  if (
    (conflict.kind === 'objectType' || conflict.kind === 'relationshipType') &&
    !conflict.current &&
    change?.after
  )
    return [
      {
        key: 'definition',
        label: 'Typdefinition',
        before: change.before,
        saved: null,
        proposed: change.after,
      },
    ];
  if (
    change &&
    !change.after &&
    (conflict.kind === 'object' || conflict.kind === 'relationship') &&
    conflict.current
  )
    return conflictRemovalProperties(state, conflict);
  if (!change?.after || !conflict.current) return [];
  const entries: [string, string][] =
    conflict.kind === 'object'
      ? [
          ['name', 'Namn'],
          ['typeId', 'Objekttyp'],
          ['identity', 'Identifiering'],
          ['lifecycle', 'Giltighet'],
          ['profileImageId', 'Profilbild'],
          ['iconId', 'Symbol'],
        ]
      : conflict.kind === 'relationship'
        ? [
            ['typeId', 'Sambandstyp'],
            ['sourceId', 'Från objekt'],
            ['targetId', 'Till objekt'],
            ['lifecycle', 'Giltighet'],
          ]
        : [
            ['name', 'Namn'],
            ['description', 'Beskrivning'],
            ['forwardLabel', 'Framåtriktad benämning'],
            ['reverseLabel', 'Omvänd benämning'],
          ];
  const labels = new Map<string, Record<ConflictSide, string>>();
  const propertyFields: ConflictProperty[] = [];
  if (conflict.kind === 'object' || conflict.kind === 'relationship') {
    const before =
      change.before && 'properties' in change.before ? (change.before.properties ?? []) : [];
    const saved = 'properties' in conflict.current ? (conflict.current.properties ?? []) : [];
    const proposed = 'properties' in change.after ? (change.after.properties ?? []) : [];
    const ids = [...new Set([...before, ...saved, ...proposed].map(({ id }) => id))];
    const [previousValues, savedValues, proposedValues] = [before, saved, proposed].map(
      (properties) => new Map(properties.map((property) => [property.id, property])),
    );
    for (const [index, id] of ids.entries()) {
      const previous = previousValues.get(id);
      const current = savedValues.get(id);
      const after = proposedValues.get(id);
      const label = (after ?? current ?? previous)?.label ?? id;
      const identify = (label: string) => `${label} · egenskap ${index + 1}`;
      propertyFields.push({
        key: `properties.${id}`,
        label: identify(label),
        labels: {
          saved: identify(current?.label ?? label),
          proposed: identify(after?.label ?? label),
        },
        before: previous,
        saved: current,
        proposed: after,
        automatic: propertyMergeSide(previous, current, after),
      });
    }
    if (ids.length) {
      const orders = [before, saved, proposed].map((properties) => properties.map(({ id }) => id));
      propertyFields.push({
        key: 'propertiesOrder',
        label: 'Egenskapernas ordning',
        before: orders[0],
        saved: orders[1],
        proposed: orders[2],
        orderLabels: Object.fromEntries(ids.map((id, index) => [id, `Egenskap ${index + 1}`])),
        automatic: propertyOrderSide(orders[0], orders[1], orders[2]),
      });
    }
  }
  return [
    ...propertyFields,
    ...entries
      .map(([key, label]) => ({
        key,
        label: labels.get(key)?.proposed ?? label,
        ...(labels.has(key) ? { labels: labels.get(key) } : {}),
        saved: conflictPropertyValue(conflict.current, key),
        proposed: conflictPropertyValue(change.after, key),
        before: conflictPropertyValue(change.before, key),
      }))
      .filter(
        (field) =>
          field.saved !== undefined || field.proposed !== undefined || field.before !== undefined,
      ),
  ];
}
/** Present each property under its actual side's definition without changing its identity. */
export function conflictPropertyLabel(field: ConflictProperty, side?: ConflictSide): string {
  const selected = side ?? field.automatic;
  return selected ? (field.labels?.[selected] ?? field.label) : field.label;
}
export function combineConflictProperties(fields: ConflictProperty[], choices: ConflictChoices) {
  const result: Record<string, unknown> = {};
  const propertyValues = new Map<string, Property>();
  for (const field of fields) {
    const same = sameConflictValue(field.saved, field.proposed);
    if (!same && !field.automatic && !choices[field.key]) return null;
    const side = field.automatic ?? choices[field.key];
    const value = same || side === 'saved' ? field.saved : field.proposed;
    if (field.key === 'propertiesOrder') continue;
    if (value === undefined) continue;
    if (field.key.startsWith('properties.')) {
      propertyValues.set(field.key.slice(11), value as Property);
      continue;
    }
    const [group, key] = field.key.split('.');
    if (key) {
      const nested = (result[group] ?? {}) as Record<string, unknown>;
      nested[key] = value;
      result[group] = nested;
    } else result[group] = value;
  }
  const order = fields.find((field) => field.key === 'propertiesOrder');
  if (order) {
    result.properties = mergedPropertyOrder(
      order.before as string[],
      order.saved as string[],
      order.proposed as string[],
      [...propertyValues.keys()],
      order.automatic ?? choices.propertiesOrder ?? 'saved',
    ).flatMap((id) => {
      const property = propertyValues.get(id);
      return property ? [property] : [];
    });
  }
  return result;
}
/** The type and reference meanings are part of the comparison, not just record revisions. */
export function conflictBasis(state: MapState, conflict: DraftConflict) {
  const fields = conflictProperties(state, conflict);
  const removedRelationship =
    conflict.kind === 'relationship' && !conflictChange(state, conflict)?.after
      ? conflict.current
      : null;
  const typeIds = fields
    .filter((field) => field.key === 'typeId')
    .flatMap((field) => [field.saved, field.proposed]);
  const endpointIds = fields
    .filter((field) => ['sourceId', 'targetId'].includes(field.key))
    .flatMap((field) => [field.saved, field.proposed]);
  if (removedRelationship) {
    typeIds.push(removedRelationship.typeId);
    endpointIds.push(removedRelationship.sourceId, removedRelationship.targetId);
  }
  const basis = {
    fields,
    ...((conflict.kind === 'objectType' || conflict.kind === 'relationshipType') &&
    !conflict.current
      ? {
          restoration: {
            contentVersion: state.contentVersion,
            definition: (conflict.kind === 'objectType'
              ? state.removedDefinitions?.objectTypes
              : state.removedDefinitions?.relationshipTypes
            )?.find((type) => type.id === conflict.id),
          },
        }
      : {}),
    // Fixed outcomes and removal choices still revalidate their full private proposal
    // and blockers before any explicit action.
    ...(!fields.length || !conflictChange(state, conflict)?.after
      ? { special: { conflict, change: conflictChange(state, conflict) } }
      : {}),
    types: (conflict.kind === 'relationship'
      ? removedRelationship
        ? state.relationshipTypes
        : proposedRelationshipTypes(state.relationshipTypes, state.draft.relationshipTypes)
      : proposedObjectTypes(state.types, state.draft.objectTypes)
    ).filter((type) => typeIds.includes(type.id)),
    endpoints: state.objects
      .filter((object) => endpointIds.includes(object.id))
      .map(({ id, revision, identity }) => ({ id, revision, identity })),
  };
  // The request crosses JSON; omitted optional values must compare identically on both sides.
  return JSON.parse(JSON.stringify(basis)) as typeof basis;
}
export function conflictCombinationError(
  state: MapState,
  conflict: DraftConflict,
  value: Record<string, unknown> | null,
): string {
  if (!value) return '';
  if ('definition' in value) return '';
  if (conflict.kind === 'object' || conflict.kind === 'relationship') {
    const types =
      conflict.kind === 'object'
        ? proposedObjectTypes(state.types, state.draft.objectTypes)
        : proposedRelationshipTypes(state.relationshipTypes, state.draft.relationshipTypes);
    const type = types.find((type) => type.id === value.typeId);
    if (!type) return 'Den valda typen finns inte. Välj en giltig kombination.';
  }
  if (conflict.kind === 'relationship') {
    const relationship = value as unknown as RelationshipValue;
    if (!relationship.sourceId || !relationship.targetId)
      return 'Välj både frånobjekt och tillobjekt för sambandet.';
    const objects = new Map(state.objects.map((object) => [object.id, object]));
    for (const change of state.draft.changes)
      if (change.after)
        objects.set(change.id, { ...change.after, id: change.id, householdId: '', revision: 0 });
      else objects.delete(change.id);
    if (!objects.has(relationship.sourceId) || !objects.has(relationship.targetId))
      return 'Ett valt objekt finns inte i kartan eller ditt utkast.';
    if (
      [...proposedRelationships(state.relationships, state.draft.relationships).values()].some(
        (edge) =>
          edge.id !== conflict.id &&
          edge.typeId === relationship.typeId &&
          edge.sourceId === relationship.sourceId &&
          edge.targetId === relationship.targetId,
      )
    )
      return 'Det valda sambandet finns redan i kartan.';
  }
  if (conflict.kind === 'object' && !(value as unknown as ObjectValue).name?.trim())
    return 'Objektet behöver ett namn.';
  return '';
}
export function conflictValueText(
  state: MapState,
  field: ConflictProperty,
  value: unknown,
): string {
  if (field.key.startsWith('properties.'))
    return value
      ? `${(value as Property).label}: ${propertyValueText(value as Property)}`
      : 'Borttaget';
  if (field.key === 'propertiesOrder' && Array.isArray(value)) {
    return (
      value.map((id, index) => `${index + 1}. ${field.orderLabels?.[id] ?? id}`).join(' → ') ||
      'Inga egenskaper'
    );
  }
  if (field.key === 'relationship' && value && typeof value === 'object')
    return relationshipLabel(
      value as RelationshipValue,
      state,
      new Map(state.objects.map((object) => [object.id, object])),
    );
  if (field.key === 'definition') {
    if (!value) return 'Borttaget';
    const type = value as ObjectType;
    return `${type.name}${type.description ? ` · ${type.description}` : ''}`;
  }
  if (field.key === 'identity')
    return value === undefined
      ? 'Identifierat objekt'
      : value === 'unspecified'
        ? 'Ospecificerat objekt'
        : 'Behöver redas ut';
  if (field.key === 'lifecycle')
    return value === undefined
      ? 'Gäller fortfarande'
      : value === 'ended'
        ? 'Manuellt upphört'
        : 'Gäller fortfarande';
  if (value === undefined || value === null) return 'Ej uppgivet';
  if (field.key === 'typeId')
    return (
      [
        ...state.types,
        ...state.relationshipTypes,
        ...state.draft.changes.map((change) => change.type),
      ].find((type) => type.id === value)?.name ?? String(value)
    );
  if (field.key === 'sourceId' || field.key === 'targetId')
    return (
      state.draft.changes.find((change) => change.id === value)?.after?.name ??
      state.objects.find((object) => object.id === value)?.name ??
      String(value)
    );
  if (field.key === 'iconId' && typeof value === 'string') return objectIconLabel(value);
  if (field.key === 'profileImageId')
    return state.objects.some((object) => object.profileImageId === value)
      ? 'Den sparade profilbilden'
      : 'Din föreslagna profilbild';
  if (Array.isArray(value)) {
    if (field.key === 'properties') {
      const properties = propertiesSchema.safeParse(value);
      return properties.success
        ? properties.data
            .map((property) => `${property.label}: ${propertyValueText(property)}`)
            .join('; ') || 'Inga egenskaper'
        : 'Ogiltiga egenskaper';
    }
  }
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  return String(value);
}
