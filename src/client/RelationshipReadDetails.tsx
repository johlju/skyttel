import type { MapObject, RelationshipType, RelationshipValue } from '../shared/map.js';
import { propertyValueText } from '../shared/properties.js';
import { lifecycleText } from './read-field-values.js';
import { SavedPropertyOrder } from './SavedPropertyOrder.js';

export function relationshipPropertyValues(
  value: RelationshipValue,
  type: RelationshipType | undefined,
  objects: Map<string, MapObject>,
  objectNames?: Record<string, string>,
) {
  const fields = new Map<string, { label: string; value: string }>([
    ['type', { label: 'Typ', value: type?.name ?? 'Borttagen typ' }],
    [
      'source',
      {
        label: 'Från objekt',
        value:
          objects.get(value.sourceId)?.name ??
          objectNames?.[value.sourceId] ??
          'Objektet finns inte längre',
      },
    ],
    ['direction', { label: 'Riktning', value: type?.forwardLabel ?? type?.name ?? 'Ej uppgivet' }],
    ['reverse', { label: 'Omvänd riktning', value: type?.reverseLabel || 'Ej uppgivet' }],
    [
      'target',
      {
        label: 'Till objekt',
        value:
          objects.get(value.targetId)?.name ??
          objectNames?.[value.targetId] ??
          'Objektet finns inte längre',
      },
    ],
    [
      'lifecycle',
      {
        label: 'Status',
        value: lifecycleText(value.lifecycle),
      },
    ],
  ]);
  for (const property of value.properties ?? [])
    fields.set(`property:${property.id}`, {
      label: property.label,
      value: propertyValueText(property),
    });
  return fields;
}

export function RelationshipReadDetails({
  value,
  type,
  before,
  beforeType,
  objects,
}: {
  value: RelationshipValue;
  type?: RelationshipType;
  before?: RelationshipValue | null;
  beforeType?: RelationshipType;
  objects: Map<string, MapObject>;
}) {
  const after = relationshipPropertyValues(value, type, objects);
  const saved = before
    ? relationshipPropertyValues(before, beforeType ?? type, objects)
    : new Map();
  return (
    <>
      <dl className="household-read-properties">
        {[...new Set([...after.keys(), ...saved.keys()])].map((key) => {
          const current = after.get(key);
          const previous = saved.get(key);
          const changed = Boolean(
            before && (current?.value !== previous?.value || current?.label !== previous?.label),
          );
          return (
            <div key={key}>
              <dt>{current?.label ?? previous?.label}</dt>
              <dd>
                {changed && (
                  <div className="household-table-before">
                    Sparat: {previous && previous.label !== current?.label && `${previous.label}: `}
                    {previous?.value ?? 'Ej uppgivet'}
                  </div>
                )}
                {changed && <span className="household-table-proposed">◇ Ditt förslag: </span>}
                {current?.value ?? 'Ej uppgivet'}
              </dd>
            </div>
          );
        })}
      </dl>
      <SavedPropertyOrder before={before?.properties} after={value.properties} />
    </>
  );
}
