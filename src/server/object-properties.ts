import type { ObjectType } from '../shared/map.js';
import {
  builtinProperties,
  objectProperties,
  orderedReferences,
} from '../shared/object-properties.js';
import { MapError } from './map-error.js';

/** Presentation references never define custom answers or alter canonical fact kinds. */
export function readObjectProperties(
  type: Pick<ObjectType, 'fields' | 'sections' | 'builtins' | 'propertyOrder'>,
  previous?: ObjectType | null,
) {
  const invalid = () => {
    throw new MapError('invalid_type_definition', 400);
  };
  const source = type.builtins === undefined ? previous?.builtins : type.builtins;
  let builtins: ObjectType['builtins'];
  if (source !== undefined) {
    if (!Array.isArray(source) || source.length > builtinProperties.length) invalid();
    const keys = new Set<string>();
    builtins = source.map((field) => {
      if (
        !field ||
        Object.keys(field).some((key) => !['key', 'name', 'sectionId'].includes(key)) ||
        !builtinProperties.some(({ key }) => key === field.key) ||
        keys.has(field.key) ||
        typeof field.name !== 'string' ||
        !field.name.trim() ||
        field.name.length > 200 ||
        typeof field.sectionId !== 'string' ||
        (field.sectionId !== '' && !type.sections?.some(({ id }) => id === field.sectionId))
      )
        invalid();
      keys.add(field.key);
      return { key: field.key, name: field.name.trim(), sectionId: field.sectionId };
    });
  }
  const references = objectProperties({ ...type, builtins, propertyOrder: undefined }).map(
    ({ ref }) => ref,
  );
  let propertyOrder = type.propertyOrder;
  if (propertyOrder !== undefined) {
    if (
      !Array.isArray(propertyOrder) ||
      propertyOrder.length !== references.length ||
      new Set(propertyOrder).size !== propertyOrder.length ||
      propertyOrder.some((ref) => !references.includes(ref))
    )
      invalid();
  } else if (previous?.propertyOrder !== undefined || builtins !== undefined) {
    const fields = (type.fields ?? []).map(({ id }) => `field:${id}`);
    const previousFields = (previous?.fields ?? []).map(({ id }) => `field:${id}`);
    const unchangedFields =
      fields.length === previousFields.length &&
      fields.every((ref, index) => ref === previousFields[index]);
    propertyOrder = orderedReferences(
      unchangedFields ? (previous?.propertyOrder ?? fields) : fields,
      references,
      previous?.propertyOrder ?? [],
    );
  }
  return {
    ...(builtins !== undefined ? { builtins } : {}),
    ...(propertyOrder !== undefined ? { propertyOrder } : {}),
  };
}
