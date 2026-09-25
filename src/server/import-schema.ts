import { z } from 'zod';
import type { DraftChange, ObjectMerge } from '../shared/map.js';

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
const field = z
  .object({
    id: id.refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value)),
    name,
    description,
    kind: z.enum(['text', 'number', 'date', 'boolean']),
  })
  .strict();
const objectType = z
  .object({ ...definitionShape, fields: z.array(field).max(100).optional() })
  .strict();
const relationshipType = z
  .object({ ...definitionShape, forwardLabel: text.optional(), reverseLabel: text.optional() })
  .strict();
const fact = z.discriminatedUnion('knowledge', [
  z
    .object({ knowledge: z.enum(['known', 'uncertain']), value: text, reportedOn: text.optional() })
    .strict(),
  z.object({ knowledge: z.enum(['none', 'unknown']), reportedOn: text.optional() }).strict(),
]);
const lifecycle = z.enum(['active', 'ended']);
const values = z.record(id, z.union([text, z.number(), z.boolean()]));
const financialFacts = z.record(id, fact);
const objectValue = z
  .object({
    typeId: id,
    name,
    description,
    identity: z.enum(['unspecified', 'unresolved']).optional(),
    financialFacts: financialFacts.optional(),
    customValues: values.optional(),
    lifecycle: lifecycle.optional(),
    profileImageId: id.optional(),
  })
  .strict();
const object = objectValue.extend({ id, ...scope, revision: positive });
const relationshipValue = z
  .object({
    typeId: id,
    sourceId: id,
    targetId: id.nullable(),
    knowledge: z.enum(['known', 'unknown', 'none', 'uncertain', 'unresolved']),
    lifecycle: lifecycle.optional(),
    endDate: fact.optional(),
  })
  .strict();
const relationship = relationshipValue.extend({ id, ...scope, revision: positive });
const undo = {
  restoreRevision: natural.optional(),
  undo: z.literal(true).optional(),
  undoFields: z.array(text).optional(),
};
const objectTypeChange = z
  .object({ id, before: objectType.nullable(), after: objectType.nullable(), ...undo })
  .strict();
const relationshipTypeChange = z
  .object({ id, before: relationshipType.nullable(), after: relationshipType.nullable(), ...undo })
  .strict();
const relationshipChangeShape = {
  id,
  before: relationship.nullable(),
  after: z.union([relationshipValue, relationship]).nullable(),
  type: relationshipType,
  objectNames: z.record(id, text).optional(),
};
const draftRelationship = z
  .object({ ...relationshipChangeShape, ...undo, removedWithObjects: z.array(id).optional() })
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
const merge: z.ZodType<ObjectMerge> = z.lazy(() =>
  z
    .object({
      ...mergeShape,
      previousChanges: z.array(draftChange),
      previousRelationships: z.array(draftRelationship),
    })
    .strict(),
);
const draftChange: z.ZodType<DraftChange> = z.lazy(() =>
  z
    .object({
      id,
      before: object.nullable(),
      after: z.union([objectValue, object]).nullable(),
      type: objectType,
      beforeType: objectType.optional(),
      ...undo,
      merge: merge.optional(),
    })
    .strict(),
);
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
const viewSettings = z
  .object({
    invertX: z.boolean(),
    invertY: z.boolean(),
    axisCorner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
    axisPinned: z.boolean(),
    stars: z.boolean(),
    allLabels: z.boolean(),
  })
  .strict();

export const importContentSchema = z
  .object({
    household: z.object({ id, name: text, createdAt: text, contentVersion: positive }).strict(),
    identities: z.array(z.object({ id, name: text }).strict()),
    objectTypes: z.array(z.object(definitionShape).strict()),
    objectTypeFields: z.array(z.object({ typeId: id, fields: z.array(field).max(100) }).strict()),
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
          ...definitionShape,
          typeId: id,
          deleted: z.union([z.literal(0), z.literal(1)]),
          identity: z.enum(['unspecified', 'unresolved']).nullable(),
          financialFacts: financialFacts.nullable(),
          customValues: values.nullable(),
          lifecycle: lifecycle.nullable(),
          profileImageId: id.nullable(),
        })
        .strict(),
    ),
    relationships: z.array(
      z
        .object({
          id,
          ...scope,
          typeId: id,
          revision: positive,
          sourceId: id,
          targetId: id.nullable(),
          knowledge: z.enum(['known', 'unknown', 'none', 'uncertain', 'unresolved']),
          deleted: z.union([z.literal(0), z.literal(1)]),
          lifecycle: lifecycle.nullable(),
          endDate: fact.nullable(),
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
          objectTypes: z.array(objectTypeChange),
          relationshipTypes: z.array(relationshipTypeChange),
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
      z.object({ ...scope, userId: id, version: positive, settings: viewSettings }).strict(),
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
    version: z.literal(1),
    createdAt: text,
    householdId: id,
    schemaVersion: z.union([z.literal(14), z.literal(15), z.literal(16)]),
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
