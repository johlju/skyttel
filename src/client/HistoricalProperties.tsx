import { type Property, propertyValueText } from '../shared/properties.js';

export function HistoricalProperties({ properties = [] }: { properties?: Property[] }) {
  if (!properties.length) return <p>Inga egenskaper.</p>;
  return (
    <ol aria-label="Egenskaper i sparad ordning">
      {properties.map((property) => (
        <li key={property.id}>
          <p>
            {property.label}: {propertyValueText(property)}
          </p>
          <p>Identitet: {property.id}</p>
        </li>
      ))}
    </ol>
  );
}
