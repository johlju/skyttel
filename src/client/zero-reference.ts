import {
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
  Vector3,
} from 'three';
import type { ViewSettings } from '../shared/personal-view.js';

export type ZeroReferenceChoices = Pick<
  ViewSettings,
  'zeroReferenceVariant' | 'zeroReferenceWeight'
>;
export const zeroReferenceExtent = 27;
export const zeroReferencePlanes = [
  { name: 'XZ · y = 0', dark: '#79d9e8', light: '#176374', pattern: 'heldragen' },
  { name: 'YZ · x = 0', dark: '#ddaff8', light: '#743f91', pattern: 'streckad' },
  { name: 'XY · z = 0', dark: '#f4d18d', light: '#835b19', pattern: 'prickad' },
] as const;

export function zeroReferencePoint(plane: number, u: number, v: number) {
  return plane === 0
    ? { x: u, y: 0, z: v }
    : plane === 1
      ? { x: 0, y: u, z: v }
      : { x: u, y: v, z: 0 };
}

export function zeroReference(value: ZeroReferenceChoices, theme: 'light' | 'dark') {
  const group = new Group();
  const disposables: { dispose(): void }[] = [];
  function configure(value: ZeroReferenceChoices, theme: 'light' | 'dark') {
    for (const item of disposables) item.dispose();
    disposables.length = 0;
    group.clear();
    const r = zeroReferenceExtent;
    const minor = value.zeroReferenceVariant === 'oval' ? r * 0.7 : r;
    const weight = {
      subtle: { fill: 0.035, edge: 0.52, grid: 0.09, divisions: 2 },
      original: { fill: 0.085, edge: 0.75, grid: 0.19, divisions: 4 },
      prominent: { fill: 0.16, edge: 1, grid: 0.33, divisions: 6 },
    }[value.zeroReferenceWeight];

    zeroReferencePlanes.forEach((plane, index) => {
      if (value.zeroReferenceVariant === 'lines') return;
      const patch = new Group();
      // Geometry starts in XY; rotate it into XZ, YZ or leave it in XY.
      if (index === 0) patch.rotation.x = Math.PI / 2;
      if (index === 1) {
        patch.rotation.x = Math.PI / 2;
        patch.rotation.y = Math.PI / 2;
      }
      const shape = new Shape();
      if (value.zeroReferenceVariant !== 'square')
        shape.absellipse(0, 0, r, minor, 0, Math.PI * 2, false, 0);
      else {
        shape.moveTo(-r, -r);
        shape.lineTo(r, -r);
        shape.lineTo(r, r);
        shape.lineTo(-r, r);
        shape.closePath();
      }
      const color = plane[theme];
      const geometry = new ShapeGeometry(shape, 64);
      const material = new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: weight.fill,
        side: DoubleSide,
        depthWrite: false,
      });
      disposables.push(geometry, material);
      patch.add(new Mesh(geometry, material));
      function line(points: Vector3[], opacity: number, pattern = 0) {
        const geometry = new BufferGeometry().setFromPoints(points);
        const material = pattern
          ? new LineDashedMaterial({
              color,
              transparent: true,
              opacity,
              depthWrite: false,
              dashSize: pattern === 1 ? 0.65 : 0.12,
              gapSize: 0.35,
            })
          : new LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
        const stroke = new Line(geometry, material);
        stroke.computeLineDistances();
        disposables.push(geometry, material);
        patch.add(stroke);
      }
      const border = shape.getPoints(96).map((point) => new Vector3(point.x, point.y, 0));
      line([...border, border[0].clone()], weight.edge, index);
      for (let step = -weight.divisions + 1; step < weight.divisions; step++) {
        // Shared intersection axes are drawn once below.
        if (step === 0) continue;
        const fraction = step / weight.divisions;
        const clip = value.zeroReferenceVariant === 'square' ? 1 : Math.sqrt(1 - fraction ** 2);
        line(
          [new Vector3(r * fraction, -minor * clip, 0), new Vector3(r * fraction, minor * clip, 0)],
          weight.grid,
        );
        line(
          [new Vector3(-r * clip, minor * fraction, 0), new Vector3(r * clip, minor * fraction, 0)],
          weight.grid,
        );
      }
      group.add(patch);
    });

    // Common axes, or the entire reference in the user-requested lines variant.
    for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]) {
      const geometry = new BufferGeometry().setFromPoints([
        axis.clone().multiplyScalar(-minor),
        axis.clone().multiplyScalar(minor),
      ]);
      const material = new LineBasicMaterial({
        color: theme === 'dark' ? '#c3d4df' : '#405664',
        transparent: true,
        opacity: weight.edge,
        depthWrite: false,
      });
      disposables.push(geometry, material);
      group.add(new Line(geometry, material));
    }
  }
  configure(value, theme);
  return {
    group,
    configure,
    dispose: () => {
      for (const item of disposables) item.dispose();
    },
  };
}
