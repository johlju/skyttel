import { type Object3D, Scene, WebGLRenderer } from 'three';
import { expect, test, vi } from 'vitest';
import { spatialScene } from '../../../src/client/spatial-scene.js';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';

function openReferenceScene() {
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, {
    clientWidth: { value: 960 },
    clientHeight: { value: 600 },
  });
  const scene = spatialScene(canvas, () => {});
  scene.update(
    ['home', 'far'],
    [
      { id: 'home', x: 0, y: 0, z: 0, version: 1 },
      { id: 'far', x: 100, y: 0, z: 0, version: 1 },
    ],
  );
  // A saved schema38 preference must no longer opt into camera compensation.
  const choices = {
    ...defaultViewSettings,
    zeroReferenceAlwaysVisible: true,
    zeroReferenceKeepSize: true,
  };
  scene.configure(choices);
  // The existing jsdom boundary substitutes only WebGL. Observe the scalar
  // transform submitted by the real scene without asserting rendered graphics.
  const renderer = vi.mocked(WebGLRenderer).mock.results.at(-1)?.value as WebGLRenderer;
  const reference = vi
    .mocked(renderer.render)
    .mock.calls.find(
      ([submitted]) => submitted instanceof Scene && submitted.background === null,
    )?.[0].children[0] as Object3D;
  return { scene, choices, scale: () => reference.scale.toArray() };
}

test('reference extents stay fixed through camera zoom, pan and rotation for every retained choice', () => {
  const { scene, choices, scale } = openReferenceScene();
  try {
    for (const zeroReferenceVariant of ['square', 'oval', 'circle', 'lines'] as const)
      for (const zeroReferenceWeight of ['subtle', 'original', 'prominent'] as const) {
        scene.configure({ ...choices, zeroReferenceVariant, zeroReferenceWeight });
        for (const command of [
          'out',
          'in',
          'in',
          'left',
          'right',
          'up',
          'down',
          'rotate-left',
          'tilt-up',
        ]) {
          scene.navigate(command);
          expect(scale()).toEqual([1, 1, 1]);
        }
      }
  } finally {
    scene.dispose();
  }
});

test('focus, camera reset, personal placement and map growth preserve fixed reference extents', () => {
  const { scene, scale } = openReferenceScene();
  try {
    expect(scene.focus(['home'], { left: 0, right: 960, top: 0, bottom: 600 })).toBe(true);
    expect(scale()).toEqual([1, 1, 1]);
    scene.reset();
    expect(scale()).toEqual([1, 1, 1]);
    scene.navigate('out');
    expect(scale()).toEqual([1, 1, 1]);
    scene.place('far', { x: 200, y: 0, z: 0 });
    scene.update(
      ['home', 'far', 'new'],
      [
        { id: 'home', x: 0, y: 0, z: 0, version: 1 },
        { id: 'far', x: 200, y: 0, z: 0, version: 2 },
      ],
    );
    scene.reset();
    expect(scale()).toEqual([1, 1, 1]);
  } finally {
    scene.dispose();
  }
});
