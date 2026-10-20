import { z } from 'zod';

const identity = {
  id: z.string().regex(/^[\w-]{1,128}$/),
  label: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => Boolean(value.trim())),
};

/** Absence of value means empty; zero, false and the empty string are values. */
export const propertySchema = z.discriminatedUnion('kind', [
  z.object({ ...identity, kind: z.undefined().optional() }).strict(),
  z
    .object({ ...identity, kind: z.literal('text'), value: z.string().max(10000).optional() })
    .strict(),
  z.object({ ...identity, kind: z.literal('number'), value: z.number().optional() }).strict(),
  z.object({ ...identity, kind: z.literal('date'), value: z.iso.date().optional() }).strict(),
  z.object({ ...identity, kind: z.literal('boolean'), value: z.boolean().optional() }).strict(),
]);

export type Property = z.infer<typeof propertySchema>;
export type PropertyKind = Exclude<Property['kind'], undefined>;

/** New entries may omit identity; writes return the assigned stable identity. */
export const propertyInputSchema = z.union([
  propertySchema.options[0].omit({ kind: true }).extend({ id: identity.id.optional() }),
  ...propertySchema.options.slice(1).map((option) => option.extend({ id: identity.id.optional() })),
]);

export const propertyKindLabels = { text: 'Text', number: 'Tal', date: 'Datum', boolean: 'Ja/nej' };
export function propertyValueText(property: Property) {
  if (!('value' in property) || property.value === undefined)
    return property.kind ? `Tomt (${propertyKindLabels[property.kind]})` : 'Tomt (ingen datatyp)';
  const value =
    property.value === ''
      ? 'Tom text'
      : property.value === true
        ? 'Ja'
        : property.value === false
          ? 'Nej'
          : String(property.value);
  return `${value} (${property.kind ? propertyKindLabels[property.kind] : 'ingen datatyp'})`;
}

export function propertyDifferences(before: Property[] = [], after: Property[] = []) {
  const describe = (property: Property | undefined) =>
    property ? `${property.label}: ${propertyValueText(property)}` : 'Saknas';
  const changes = [...new Set([...before, ...after].map(({ id }) => id))].flatMap((id) => {
    const previous = before.find((property) => property.id === id);
    const next = after.find((property) => property.id === id);
    return describe(previous) === describe(next)
      ? []
      : [`${describe(previous)} → ${describe(next)}`];
  });
  if (before.map(({ id }) => id).join(',') !== after.map(({ id }) => id).join(','))
    changes.push('Egenskapernas ordning ändras.');
  return changes;
}

/** Array position is the saved order. Labels may repeat; identities must not. */
export const propertiesSchema = z.array(propertySchema).superRefine((properties, context) => {
  const seen = new Set<string>();
  for (const [index, property] of properties.entries()) {
    if (seen.has(property.id))
      context.addIssue({ code: 'custom', message: 'duplicate_property_id', path: [index, 'id'] });
    seen.add(property.id);
  }
});
