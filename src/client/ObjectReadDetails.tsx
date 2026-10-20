import type { ObjectType, ObjectValue } from '../shared/map.js';
import { objectIconLabel } from '../shared/object-icons.js';
import { propertyValueText } from '../shared/properties.js';
import type { HouseholdTableRow } from './HouseholdTable.js';
import { ProfileImage } from './ProfileImage.js';
import { lifecycleText } from './read-field-values.js';
import { SavedPropertyOrder } from './SavedPropertyOrder.js';

export function objectPropertyValues(value: ObjectValue, type?: ObjectType) {
  const fields = new Map<string, { label: string; value: string }>();
  fields.set('name', { label: 'Namn', value: value.name });
  fields.set('type', { label: 'Typ', value: type?.name ?? 'Borttagen typ' });
  fields.set('lifecycle', {
    label: 'Status',
    value: lifecycleText(value.lifecycle),
  });
  fields.set('icon', {
    label: 'Ikon',
    value: value.iconId ? objectIconLabel(value.iconId, type?.name) : 'Typens ikon',
  });
  fields.set('profileImage', {
    label: 'Profilbild',
    value: value.profileImageId ? 'Profilbild finns' : 'Ej uppgivet',
  });
  fields.set('identity', {
    label: 'Identitet',
    value:
      value.identity === 'unspecified'
        ? 'Ospecificerat objekt'
        : value.identity === 'unresolved'
          ? 'Identiteten behöver redas ut'
          : 'Identifierat objekt',
  });
  for (const property of value.properties ?? [])
    fields.set(`property:${property.id}`, {
      label: property.label,
      value: propertyValueText(property),
    });
  return fields;
}

export function ObjectReadDetails({
  row,
  full = false,
  showHeading = true,
  status,
}: {
  row: HouseholdTableRow;
  full?: boolean;
  showHeading?: boolean;
  status?: string;
}) {
  const proposed = objectPropertyValues(row.object, row.type);
  const saved = row.before
    ? objectPropertyValues(row.before, row.beforeType)
    : new Map<string, { label: string; value: string }>();
  const keys = [...new Set([...proposed.keys(), ...saved.keys()])];
  return (
    <div className="household-table-details">
      {showHeading && <h3>{row.object.name} · alla uppgifter</h3>}
      {status && <p className="map-selection-summary">Objektstatus: {status}</p>}
      <dl>
        {keys
          .filter(
            (key) =>
              full ||
              !(key === 'name' || key === 'type') ||
              (proposed.get(key)?.value !== saved.get(key)?.value && row.proposal === 'Ändrat'),
          )
          .map((key) => {
            const after = proposed.get(key);
            const before = saved.get(key);
            const changed =
              row.proposal === 'Ändrat' &&
              (after?.value !== before?.value ||
                after?.label !== before?.label ||
                (key === 'profileImage' &&
                  row.object.profileImageId !== row.before?.profileImageId));
            return (
              <div key={key}>
                <dt>{after?.label ?? before?.label}</dt>
                <dd>
                  {changed && (
                    <div className="household-table-before">
                      Sparat{before && before.label !== after?.label ? ` (${before.label})` : ''}:{' '}
                      {before?.value ?? 'Ej uppgivet'}
                      {key === 'profileImage' && row.before?.profileImageId && (
                        <ProfileImage
                          householdId={row.object.householdId}
                          value={row.before}
                          typeName={row.beforeType?.name}
                        />
                      )}
                    </div>
                  )}
                  {(changed || row.proposal === 'Nytt') && (
                    <span className="household-table-proposed">◇ Ditt förslag: </span>
                  )}
                  {after?.value ?? 'Ej uppgivet'}
                  {key === 'profileImage' && row.object.profileImageId && (
                    <ProfileImage
                      householdId={row.object.householdId}
                      value={row.object}
                      typeName={row.type?.name}
                    />
                  )}
                </dd>
              </div>
            );
          })}
      </dl>
      <SavedPropertyOrder before={row.before?.properties} after={row.object.properties} />
    </div>
  );
}
