import { type Property, propertyValueText } from '../shared/properties.js';

/** Preserve the saved reading order when the proposed order differs. */
export function SavedPropertyOrder({
  before,
  after = [],
}: {
  before?: Property[];
  after?: Property[];
}) {
  if (
    !before?.length ||
    (before.length === after.length && before.every(({ id }, index) => id === after[index].id))
  )
    return null;
  return (
    <details className="saved-property-order">
      <summary>Sparade egenskaper i sin ordning</summary>
      <ol>
        {before.map((property) => (
          <li key={property.id}>
            {property.label}: {propertyValueText(property)}
          </li>
        ))}
      </ol>
    </details>
  );
}
