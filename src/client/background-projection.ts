import type { Matrix3, Vector3 } from 'three';

/** The shared background camera's orientation, translation and perspective. */
export type BackgroundProjection = {
  rotation: Matrix3;
  offset: Vector3;
  aspect: number;
  tangent: number;
};
