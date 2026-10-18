import { z } from 'zod';
import { defaultViewSettings } from '../shared/personal-view.js';

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
  })
  .strict();

/** Older archives retain their saved preference, independent of browser media. */
export const legacyViewSettingsSchema = z
  .object({
    ...presentation,
    stars: z.boolean(),
  })
  .strict()
  .transform(({ stars, ...settings }) => ({
    ...defaultViewSettings,
    ...settings,
    background: stars,
    darkBackground: stars ? ('mist' as const) : ('atmosphere' as const),
  }));
