import { randomUUID } from 'node:crypto';
import { type Property, propertiesSchema } from '../shared/properties.js';
import { MapError } from './map-error.js';

// Bound transport resources without imposing a property-count limit.
export const propertyWriteLimit = 2_000_000;

/** Omission preserves previous work; an explicit array is a complete ordered replacement. */
export function readProperties(input: unknown, previous?: Property[]): Property[] | undefined {
  if (input === undefined) return previous;
  if (!Array.isArray(input)) throw new MapError('invalid_properties', 400);
  const result = propertiesSchema.safeParse(
    input.map((property) =>
      property && typeof property === 'object' && !Array.isArray(property)
        ? { ...property, id: property.id === undefined ? randomUUID() : property.id }
        : property,
    ),
  );
  if (!result.success) throw new MapError('invalid_properties', 400);
  return result.data;
}
