import { expect, test } from 'vitest';
import { verticalCurveTints } from '../../../src/client/zero-reference-depth.js';

test.each([
  { crossing: 'before the turn', planeReciprocalDepth: 0.09375, phase: 7.5 },
  { crossing: 'at the turn', planeReciprocalDepth: 0.125, phase: 10 },
  { crossing: 'after the turn', planeReciprocalDepth: 0.15625, phase: 12.5 },
])(
  'keeps the dash phase when foreground exclusion starts $crossing',
  ({ planeReciprocalDepth, phase }) => {
    const [tint] = verticalCurveTints(
      [
        {
          name: 'height',
          color: '#fff',
          polygon: [
            { x: -20, y: -20, z: planeReciprocalDepth },
            { x: 20, y: -20, z: planeReciprocalDepth },
            { x: 20, y: 20, z: planeReciprocalDepth },
            { x: -20, y: 20, z: planeReciprocalDepth },
          ],
        },
      ],
      { x: 0, y: 0, depth: 16 },
      { x: 0, y: 0, depth: 16 / 3 },
      20,
    );
    // The curve travels ten units to its turn and ten back. The three plane
    // crossings occur at parameter values one-quarter, one-half and three-quarters.
    // On the return, the phase advances to 12.5 rather than reversing to 7.5.
    expect(tint.mask.foreground[0].dashOffset).toBeCloseTo(phase, 3);
  },
);
