// Project finite reference patches, then clip their tint to
// content behind them. Reciprocal camera depth is affine in screen coordinates.
import { type PerspectiveCamera, Vector3 } from 'three';
import {
  type ZeroReferenceChoices,
  type zeroReference,
  zeroReferenceExtent,
  zeroReferencePlanes,
} from './zero-reference.js';

type Vertex = { x: number; y: number; z: number };
export type DepthPatch = { name: string; color: string; polygon: Vertex[] };
export type DepthBounds = { x: number; y: number; width: number; height: number };

function clip(polygon: Vertex[], distance: (point: Vertex) => number) {
  if (!polygon.length) return [];
  const result: Vertex[] = [];
  let previous = polygon[polygon.length - 1];
  let before = distance(previous);
  for (const point of polygon) {
    const after = distance(point);
    if (before >= 0 !== after >= 0) {
      const t = before / (before - after);
      result.push({
        x: previous.x + t * (point.x - previous.x),
        y: previous.y + t * (point.y - previous.y),
        z: previous.z + t * (point.z - previous.z),
      });
    }
    if (after >= 0) result.push(point);
    previous = point;
    before = after;
  }
  return result;
}

export function projectDepthPatches(
  planes: ReturnType<typeof zeroReference>,
  value: Pick<ZeroReferenceChoices, 'zeroReferenceVariant'>,
  theme: 'light' | 'dark',
  camera: PerspectiveCamera,
  width: number,
  height: number,
): DepthPatch[] {
  if (value.zeroReferenceVariant === 'lines') return [];
  const radius = zeroReferenceExtent;
  const minor = value.zeroReferenceVariant === 'oval' ? radius * 0.7 : radius;
  const outline =
    value.zeroReferenceVariant === 'square'
      ? [
          [-radius, -minor],
          [radius, -minor],
          [radius, minor],
          [-radius, minor],
        ]
      : Array.from({ length: 128 }, (_, i) => {
          const angle = (i * Math.PI * 2) / 128;
          return [Math.cos(angle) * radius, Math.sin(angle) * minor];
        });
  planes.group.updateMatrixWorld(true);
  return zeroReferencePlanes.map((plane, index) => {
    let polygon: Vertex[] = outline.map(([x, y]) => {
      const p = new Vector3(x, y, 0)
        .applyMatrix4(planes.group.children[index].matrixWorld)
        .applyMatrix4(camera.matrixWorldInverse);
      return { x: p.x, y: p.y, z: p.z };
    });
    // Clip before perspective division, including patches that cross the camera.
    polygon = clip(polygon, (p) => -p.z - camera.near);
    polygon = clip(polygon, (p) => camera.far + p.z);
    polygon = polygon.map((p) => {
      const projected = new Vector3(p.x, p.y, p.z).applyMatrix4(camera.projectionMatrix);
      return {
        x: ((projected.x + 1) * width) / 2,
        y: ((1 - projected.y) * height) / 2,
        z: -1 / p.z,
      };
    });
    polygon = clip(polygon, (p) => p.x);
    polygon = clip(polygon, (p) => width - p.x);
    polygon = clip(polygon, (p) => p.y);
    polygon = clip(polygon, (p) => height - p.y);
    return { name: plane.name, color: plane[theme], polygon };
  });
}

export function depthTintRegions(
  patches: DepthPatch[],
  bounds: DepthBounds,
  reciprocalDepth: (point: { x: number; y: number }) => number,
) {
  return patches.flatMap((patch) => {
    let polygon = clip(patch.polygon, (p) => p.z - reciprocalDepth(p) - 1e-7);
    polygon = clip(polygon, (p) => p.x - bounds.x);
    polygon = clip(polygon, (p) => bounds.x + bounds.width - p.x);
    polygon = clip(polygon, (p) => p.y - bounds.y);
    polygon = clip(polygon, (p) => bounds.y + bounds.height - p.y);
    if (polygon.length < 3) return [];
    return [
      {
        name: patch.name,
        color: patch.color,
        path: `${polygon.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')} Z`,
      },
    ];
  });
}

/** Mask the complete original stroke, retaining its dash origin. A returning
 * foreground branch then excludes only its visible dashes, not the gaps through
 * which a farther branch can still be seen. */
export function verticalCurveTints(
  patches: DepthPatch[],
  start: { x: number; y: number; depth: number },
  tip: { x: number; y: number; depth: number },
  bend: number,
) {
  const dy = tip.y - start.y;
  const y = (t: number) => start.y + (dy + 2 * bend) * t - 2 * bend * t * t;
  const turning = (dy + 2 * bend) / (4 * bend);
  function heightRange(from: number, to: number) {
    const heights = [y(from), y(to)];
    if (turning > from && turning < to) heights.push(y(turning));
    return { minimum: Math.min(...heights), maximum: Math.max(...heights) };
  }
  function lengthBefore(t: number) {
    // X is constant, so arc length is exactly total Y variation, including
    // both sides of a turn. Continue the original stroke's dash phase.
    return turning > 0 && turning < t
      ? Math.abs(y(turning) - start.y) + Math.abs(y(t) - y(turning))
      : Math.abs(y(t) - start.y);
  }
  return patches.flatMap((patch) => {
    const origin = patch.polygon[0];
    let determinant = 0;
    let slopeY = 0;
    let intercept = 0;
    for (let i = 1; i < patch.polygon.length - 1; i++) {
      const b = patch.polygon[i];
      const c = patch.polygon[i + 1];
      const area = (b.x - origin.x) * (c.y - origin.y) - (c.x - origin.x) * (b.y - origin.y);
      if (Math.abs(area) <= Math.abs(determinant)) continue;
      determinant = area;
      const slopeX =
        ((b.z - origin.z) * (c.y - origin.y) - (c.z - origin.z) * (b.y - origin.y)) / area;
      slopeY = ((b.x - origin.x) * (c.z - origin.z) - (c.x - origin.x) * (b.z - origin.z)) / area;
      intercept = origin.z + slopeX * (start.x - origin.x) - slopeY * origin.y;
    }
    if (Math.abs(determinant) < 1e-12) return [];
    // Plane reciprocal depth is affine in the screen. On the quadratic curve,
    // its difference from the connection's reciprocal depth is quadratic in t.
    const a = -2 * bend * slopeY;
    const b = (dy + 2 * bend) * slopeY - (1 / tip.depth - 1 / start.depth);
    const c = intercept + start.y * slopeY - 1 / start.depth - 1e-7;
    const roots: number[] = [];
    if (Math.abs(a) < 1e-12) {
      if (Math.abs(b) >= 1e-12) roots.push(-c / b);
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        roots.push((-b - root) / (2 * a), (-b + root) / (2 * a));
      }
    }
    const stops = [0, ...roots.filter((t) => t > 0 && t < 1), 1].sort((a, b) => a - b);
    const behind: ReturnType<typeof heightRange>[] = [];
    const foreground: (ReturnType<typeof heightRange> & {
      geometry: string;
      dashOffset: number;
    })[] = [];
    for (let index = 1; index < stops.length; index++) {
      const from = stops[index - 1];
      const to = stops[index];
      if (to <= from) continue;
      const middle = (from + to) / 2;
      const range = heightRange(from, to);
      if (a * middle * middle + b * middle + c > 0) behind.push(range);
      else {
        const control = y(from) + ((to - from) / 2) * (dy + 2 * bend - 4 * bend * from);
        foreground.push({
          ...range,
          geometry: `M ${start.x} ${y(from)} Q ${start.x} ${control} ${start.x} ${y(to)}`,
          dashOffset: lengthBefore(from),
        });
      }
    }
    if (!behind.length) return [];
    return [
      {
        name: patch.name,
        color: patch.color,
        path: `${patch.polygon.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} Z`,
        mask: { behind, foreground },
      },
    ];
  });
}
