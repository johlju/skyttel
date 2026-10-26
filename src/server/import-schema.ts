import { z } from 'zod';
import type { DraftChange } from '../shared/map.js';
import { isObjectIconId } from '../shared/object-icons.js';
import { defaultViewSettings } from '../shared/personal-view.js';
import { propertiesSchema } from '../shared/properties.js';
import { viewSettingsSchema } from './view-settings-schema.js';

const id = z.string().regex(/^[\w-]{1,128}$/);
const text = z.string().max(10000);
const name = z
  .string()
  .min(1)
  .max(200)
  .refine((value) => Boolean(value.trim()));
const description = z.string().max(2000);
const natural = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const positive = natural.min(1);
const scope = { householdId: id };
const definitionShape = { id, ...scope, revision: positive, name, description };
const objectType = z.object(definitionShape).strict();
const relationshipType = z
  .object({
    ...definitionShape,
    forwardLabel: text.optional(),
    reverseLabel: text.optional(),
  })
  .strict();
const iconId = z.string().refine(isObjectIconId);
const lifecycle = z.enum(['active', 'ended']);
const objectValue = z
  .object({
    properties: propertiesSchema.optional(),
    typeId: id,
    name,
    identity: z.enum(['unspecified', 'unresolved']).optional(),
    lifecycle: lifecycle.optional(),
    profileImageId: id.optional(),
    iconId: iconId.optional(),
  })
  .strict();
const object = objectValue.extend({ id, ...scope, revision: positive });
const relationshipValue = z
  .object({
    properties: propertiesSchema.optional(),
    typeId: id,
    sourceId: id,
    targetId: id,
    lifecycle: lifecycle.optional(),
  })
  .strict();
const relationship = relationshipValue.extend({ id, ...scope, revision: positive });
const objectTypeChange = z
  .object({ id, before: objectType.nullable(), after: objectType.nullable() })
  .strict();
const relationshipTypeChange = z
  .object({ id, before: relationshipType.nullable(), after: relationshipType.nullable() })
  .strict();
const draftObjectTypeChange = objectTypeChange.extend({
  restoration: z.object({ contentVersion: positive, definition: objectType }).strict().optional(),
});
const draftRelationshipTypeChange = relationshipTypeChange.extend({
  restoration: z
    .object({ contentVersion: positive, definition: relationshipType })
    .strict()
    .optional(),
});
const relationshipChangeShape = {
  id,
  before: relationship.nullable(),
  after: z.union([relationshipValue, relationship]).nullable(),
  type: relationshipType,
  beforeType: relationshipType.optional(),
  objectNames: z.record(id, text).optional(),
};
const draftRelationship = z
  .object({
    ...relationshipChangeShape,
    proposedAt: z.iso.datetime().optional(),
    endpointRecovery: z.object({ removedRevision: positive }).strict().optional(),
    removedWithObjects: z.array(id).optional(),
    suppressed: z
      .object({
        ...relationshipChangeShape,
        proposedAt: z.iso.datetime().optional(),
        endpointRecovery: z.object({ removedRevision: positive }).strict().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const savedRelationship = z
  .object({
    ...relationshipChangeShape,
    after: relationship.nullable(),
    beforeType: relationshipType.optional(),
  })
  .strict();
const mergeShape = {
  survivorId: id,
  absorbedId: id,
  identityConfirmed: z.boolean(),
  objects: z.array(object),
  types: z.array(objectType),
  relationships: z.array(relationship),
  relationshipTypes: z.array(relationshipType),
  objectNames: z.record(id, text),
  imageCopy: z
    .object({ sourceObjectId: id, sourceImageId: id, copiedImageId: id })
    .strict()
    .optional(),
};
const draftChange: z.ZodType<DraftChange> = z
  .object({
    id,
    before: object.nullable(),
    after: z.union([objectValue, object]).nullable(),
    type: objectType,
    beforeType: objectType.optional(),
    proposedAt: z.iso.datetime().optional(),
    stagingId: z.uuid().optional(),
  })
  .strict();
const receipt = z
  .object({
    operationId: id,
    ...scope,
    userId: id,
    draftVersion: natural,
    contentVersion: positive,
    savedAt: text,
    actorName: text.optional(),
    changes: z.array(
      z
        .object({
          before: object.nullable(),
          after: object.nullable(),
          type: objectType,
          beforeType: objectType.optional(),
          merge: z.object(mergeShape).strict().optional(),
        })
        .strict(),
    ),
    relationships: z.array(savedRelationship).optional(),
    objectTypes: z.array(objectTypeChange).optional(),
    relationshipTypes: z.array(relationshipTypeChange).optional(),
  })
  .strict();
// Supported schema37 archives have no zero-reference fields. Defaults apply
// only at this archive boundary; ordinary settings requests remain strict.
const viewSettings = viewSettingsSchema.extend({
  zeroReferenceVariant: viewSettingsSchema.shape.zeroReferenceVariant.default(
    defaultViewSettings.zeroReferenceVariant,
  ),
  zeroReferenceWeight: viewSettingsSchema.shape.zeroReferenceWeight.default(
    defaultViewSettings.zeroReferenceWeight,
  ),
  zeroReferenceAlwaysVisible: viewSettingsSchema.shape.zeroReferenceAlwaysVisible.default(
    defaultViewSettings.zeroReferenceAlwaysVisible,
  ),
  zeroReferenceOnMovement: viewSettingsSchema.shape.zeroReferenceOnMovement.default(
    defaultViewSettings.zeroReferenceOnMovement,
  ),
  zeroReferenceTint: viewSettingsSchema.shape.zeroReferenceTint.default(
    defaultViewSettings.zeroReferenceTint,
  ),
  zeroReferenceKeepSize: viewSettingsSchema.shape.zeroReferenceKeepSize.default(
    defaultViewSettings.zeroReferenceKeepSize,
  ),
});

export const importContentSchema = z
  .object({
    household: z.object({ id, name: text, createdAt: text, contentVersion: positive }).strict(),
    identities: z.array(z.object({ id, name: text }).strict()),
    objectTypes: z.array(z.object(definitionShape).strict()),
    relationshipTypes: z.array(z.object(definitionShape).strict()),
    relationshipTypeLabels: z.array(
      z.object({ typeId: id, forwardLabel: text, reverseLabel: text }).strict(),
    ),
    removedTypes: z.array(
      z.object({ kind: z.enum(['objectType', 'relationshipType']), typeId: id }).strict(),
    ),
    objects: z.array(
      z
        .object({
          id,
          ...scope,
          revision: positive,
          name,
          typeId: id,
          deleted: z.union([z.literal(0), z.literal(1)]),
          identity: z.enum(['unspecified', 'unresolved']).nullable(),
          properties: propertiesSchema.nullable().optional(),
          lifecycle: lifecycle.nullable(),
          profileImageId: id.nullable(),
          iconId: iconId.nullable().optional(),
        })
        .strict(),
    ),
    relationships: z.array(
      z
        .object({
          properties: propertiesSchema.nullable().optional(),
          id,
          ...scope,
          typeId: id,
          revision: positive,
          sourceId: id,
          targetId: id,
          deleted: z.union([z.literal(0), z.literal(1)]),
          lifecycle: lifecycle.nullable(),
        })
        .strict(),
    ),
    drafts: z.array(
      z
        .object({
          ...scope,
          userId: id,
          version: natural,
          changes: z.array(draftChange),
          relationships: z.array(draftRelationship),
          objectTypes: z.array(draftObjectTypeChange),
          relationshipTypes: z.array(draftRelationshipTypeChange),
        })
        .strict(),
    ),
    saves: z.array(
      z.object({ operationId: id, ...scope, userId: id, draftVersion: natural, receipt }).strict(),
    ),
    history: z.array(
      z
        .object({
          id: positive,
          ...scope,
          userId: id,
          operationId: id,
          savedAt: text,
          changes: receipt.shape.changes,
        })
        .strict(),
    ),
    operations: z.array(
      z
        .object({
          operationId: id,
          ...scope,
          userId: id,
          draftVersion: natural,
          contentVersion: positive,
          createdAt: text,
          status: z.enum(['pending', 'succeeded', 'rejected']),
          draftHash: text.nullable(),
          error: text.nullable(),
          errorStatus: z.number().int().nullable(),
        })
        .strict(),
    ),
    positions: z.array(
      z
        .object({
          ...scope,
          userId: id,
          objectId: id,
          version: positive,
          x: z.number().min(-10000).max(10000),
          y: z.number().min(-10000).max(10000),
          z: z.number().min(-10000).max(10000),
        })
        .strict(),
    ),
    viewSettings: z.array(
      z
        .object({
          ...scope,
          userId: id,
          version: natural,
          settings: viewSettings,
          backgroundVersion: z.literal(1).default(1),
        })
        .strict(),
    ),
    images: z.array(
      z
        .object({
          id,
          ...scope,
          objectId: id,
          createdBy: id,
          width: z.number().int().min(1).max(300),
          height: z.number().int().min(1).max(300),
          offset: natural,
          length: positive.max(262144),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
  })
  .strict();
export type ImportContent = z.infer<typeof importContentSchema>;
export const importManifestSchema = z
  .object({
    format: z.literal('skyttel-household'),
    version: z.literal(2),
    createdAt: text,
    householdId: id,
    schemaVersion: z.union([z.literal(37), z.literal(38)]),
    parts: z
      .array(
        z
          .object({
            path: z.enum(['content.json', 'images.bin']),
            bytes: natural,
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .length(2),
  })
  .strict();
