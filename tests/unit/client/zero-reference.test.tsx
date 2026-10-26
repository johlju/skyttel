import { type Object3D, Scene, WebGLRenderer } from 'three';
import { expect, test, vi } from 'vitest';
import { spatialScene } from '../../../src/client/spatial-scene.js';
import { zeroReference } from '../../../src/client/zero-reference.js';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';

test('reference sizing starts fixed on activation and follows subsequent zoom distance', () => {
  const reference = zeroReference(defaultViewSettings, 'dark');
  try {
    reference.updateSize(false, 30);
    expect(reference.group.scale.x).toBe(1);
    reference.updateSize(true, 60);
    expect(reference.group.scale.x).toBe(1);
    reference.updateSize(true, 120);
    expect(reference.group.scale.x).toBe(2);
    reference.updateSize(true, 30);
    expect(reference.group.scale.x).toBe(0.5);
  } finally {
    reference.dispose();
  }
});

test('changing reference choices preserves the current visit sizing baseline', () => {
  const reference = zeroReference(defaultViewSettings, 'dark');
  try {
    reference.updateSize(true, 30);
    reference.updateSize(true, 60);
    for (const zeroReferenceVariant of ['square', 'oval', 'circle', 'lines'] as const)
      for (const zeroReferenceWeight of ['subtle', 'original', 'prominent'] as const) {
        reference.configure({ zeroReferenceVariant, zeroReferenceWeight }, 'light');
        reference.updateSize(true, 60);
        expect(reference.group.scale.x).toBe(2);
        expect(reference.group.scale.y).toBe(2);
        expect(reference.group.scale.z).toBe(2);
      }
    reference.updateSize(true, 90);
    expect(reference.group.scale.x).toBe(3);
  } finally {
    reference.dispose();
  }
});

test('unchanged zoom distance preserves sizing and disabling restores the fixed extents', () => {
  const reference = zeroReference(defaultViewSettings, 'dark');
  try {
    reference.updateSize(true, 40);
    reference.updateSize(true, 100);
    expect(reference.group.scale.x).toBe(2.5);
    expect(reference.updateSize(true, 100)).toBe(false);
    expect(reference.group.scale.x).toBe(2.5);
    reference.updateSize(false, 100);
    expect(reference.group.scale.x).toBe(1);
    reference.updateSize(false, 200);
    expect(reference.group.scale.x).toBe(1);
    reference.updateSize(true, 200);
    expect(reference.group.scale.x).toBe(1);
    reference.updateSize(true, 100);
    expect(reference.group.scale.x).toBe(0.5);
  } finally {
    reference.dispose();
  }
});

test('retained and new visits begin at approved extents rather than carrying an earlier scale', () => {
  const first = zeroReference(defaultViewSettings, 'dark');
  first.updateSize(true, 30);
  first.updateSize(true, 120);
  expect(first.group.scale.x).toBe(4);
  first.updateSize(false, 120);
  first.updateSize(true, 120);
  expect(first.group.scale.x).toBe(1);
  first.dispose();
  const reopened = zeroReference(defaultViewSettings, 'dark');
  try {
    reopened.updateSize(true, 120);
    expect(reopened.group.scale.x).toBe(1);
    reopened.updateSize(true, 60);
    expect(reopened.group.scale.x).toBe(0.5);
  } finally {
    reopened.dispose();
  }
});

function openSizedScene() {
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
  const choices = { ...defaultViewSettings, zeroReferenceAlwaysVisible: true };
  scene.configure(choices);
  // The existing jsdom boundary substitutes only WebGL. Observe the actual
  // reference root submitted to that boundary, keeping camera math real.
  const renderer = vi.mocked(WebGLRenderer).mock.results.at(-1)?.value as WebGLRenderer;
  const reference = vi
    .mocked(renderer.render)
    .mock.calls.find(
      ([submitted]) => submitted instanceof Scene && submitted.background === null,
    )?.[0].children[0] as Object3D;
  return { scene, choices, scale: () => reference.scale.x };
}

test('actual camera zoom preserves sizing through pan and rotation and starts fixed on activation and reopening', () => {
  const { scene, choices, scale } = openSizedScene();
  try {
    scene.navigate('out');
    expect(scale()).toBe(1);
    scene.configure({ ...choices, zeroReferenceKeepSize: true });
    expect(scale()).toBe(1);
    scene.navigate('out');
    const enlarged = scale();
    expect(enlarged).toBeGreaterThan(1);
    for (const command of ['left', 'right', 'up', 'down', 'rotate-left', 'tilt-up']) {
      scene.navigate(command);
      expect(scale()).toBeCloseTo(enlarged, 12);
    }
    scene.navigate('in');
    expect(scale()).toBeCloseTo(1, 12);
    scene.navigate('in');
    expect(scale()).toBeLessThan(1);
    scene.configure(choices);
    expect(scale()).toBe(1);
    scene.navigate('out');
    expect(scale()).toBe(1);
    scene.configure({ ...choices, zeroReferenceKeepSize: true });
    expect(scale()).toBe(1);
    scene.navigate('out');
    expect(scale()).toBeGreaterThan(1);
    scene.startReferenceVisit();
    expect(scale()).toBe(1);
    scene.navigate('in');
    expect(scale()).toBeLessThan(1);
  } finally {
    scene.dispose();
  }
});

test('actual focus and camera reset resize the reference while personal placement and map growth do not', () => {
  const { scene, choices, scale } = openSizedScene();
  try {
    scene.configure({ ...choices, zeroReferenceKeepSize: true });
    expect(scale()).toBe(1);
    expect(scene.focus(['home'], { left: 0, right: 960, top: 0, bottom: 600 })).toBe(true);
    expect(scale()).toBeLessThan(1);
    scene.reset();
    expect(scale()).toBeCloseTo(1, 12);
    scene.navigate('out');
    expect(scale()).toBeGreaterThan(1);
    scene.reset();
    expect(scale()).toBeCloseTo(1, 12);
    scene.place('far', { x: 200, y: 0, z: 0 });
    expect(scale()).toBeCloseTo(1, 12);
    scene.update(
      ['home', 'far', 'new'],
      [
        { id: 'home', x: 0, y: 0, z: 0, version: 1 },
        { id: 'far', x: 200, y: 0, z: 0, version: 2 },
      ],
    );
    expect(scale()).toBeCloseTo(1, 12);
    scene.reset();
    expect(scale()).toBeGreaterThan(1);
  } finally {
    scene.dispose();
  }
});
