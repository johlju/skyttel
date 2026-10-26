import { z } from 'zod';

const presentation = {
  invertX: z.boolean(),
  invertY: z.boolean(),
  axisCorner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
  axisPinned: z.boolean(),
  allLabels: z.boolean(),
};
const strength = z.number().min(0).max(1).multipleOf(0.05);
export const viewSettingsSchema = z
  .object({
    ...presentation,
    background: z.boolean(),
    lightBackground: z.enum(['pearl', 'dawn', 'ocean']),
    darkBackground: z.enum(['atmosphere', 'mist', 'universe', 'ocean']),
    panStrength: strength,
    zoomStrength: strength,
    layerDistance: z.number().min(0.5).max(2).multipleOf(0.1),
    zeroReferenceVariant: z.enum(['square', 'oval', 'circle', 'lines']),
    zeroReferenceWeight: z.enum(['subtle', 'original', 'prominent']),
    zeroReferenceAlwaysVisible: z.boolean(),
    zeroReferenceOnMovement: z.boolean(),
    zeroReferenceTint: z.number().int().min(0).max(85),
    // Keep the inert serialized field compatible with existing schema38 clients and archives.
    zeroReferenceKeepSize: z.boolean(),
  })
  .strict();
