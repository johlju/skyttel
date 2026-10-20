import { afterEach, expect, test } from 'vitest';
import {
  type CameraHistoryState,
  type ProjectedPoint,
  spatialScene,
} from '../../src/client/spatial-scene.js';
import { defaultViewSettings, type Position } from '../../src/shared/personal-view.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function openScene() {
  const canvas = document.createElement('canvas');
  canvas.style.width = '960px';
  canvas.style.height = '600px';
  document.body.append(canvas);
  let points: ProjectedPoint[] = [];
  let axes: Position[] = [];
  let history: CameraHistoryState = { canGoBack: false, changed: false };
  const scene = spatialScene(
    canvas,
    (value) => {
      points = value;
    },
    (value) => {
      axes = value;
    },
    undefined,
    canvas,
    (value) => {
      history = value;
    },
  );
  cleanups.push(() => {
    scene.dispose();
    canvas.remove();
  });
  return { scene, canvas, points: () => points, axes: () => axes, history: () => history };
}

function distance(a: Position, b: Position) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

test('a new connected object starts near its saved neighbour while existing and filtered placements stay fixed', () => {
  const { scene } = openScene();
  const saved = [{ id: 'home', x: 80, y: 40, z: -20, version: 1 }];
  scene.update(['home', 'unrelated'], saved);
  const home = scene.position('home') as Position;
  const unrelated = scene.position('unrelated');
  scene.update(['home', 'unrelated', 'new'], saved, [{ sourceId: 'new', targetId: 'home' }]);
  const added = scene.position('new') as Position;
  expect(distance(added, home)).toBeGreaterThan(3);
  expect(distance(added, home)).toBeLessThan(12);
  expect(scene.position('home')).toEqual(home);
  expect(scene.position('unrelated')).toEqual(unrelated);
  scene.update(['home'], saved);
  scene.update(['new', 'unrelated', 'home'], saved, [{ sourceId: 'home', targetId: 'new' }]);
  expect(scene.position('new')).toEqual(added);
  expect(scene.position('unrelated')).toEqual(unrelated);
});

test('refreshing after an unsaved first move restores the stable default placement', () => {
  const { scene } = openScene();
  scene.update(['home']);
  const original = scene.position('home');
  scene.place('home', { x: 200, y: 100, z: -50 });
  scene.update(['home'], []);
  expect(scene.position('home')).toEqual(original);
});

test('connections to distant personal placements put the new object near an actual neighbour', () => {
  const { scene } = openScene();
  const saved = [
    { id: 'left', x: -1000, y: 0, z: 0, version: 1 },
    { id: 'right', x: 1000, y: 0, z: 0, version: 1 },
  ];
  scene.update(['left', 'right', 'new'], saved, [
    { sourceId: 'new', targetId: 'left' },
    { sourceId: 'new', targetId: 'right' },
  ]);
  const added = scene.position('new') as Position;
  expect(Math.min(...saved.map((position) => distance(position, added)))).toBeLessThan(12);
});

test('a dense connected neighbourhood finds additional space instead of stacking new defaults', () => {
  const { scene } = openScene();
  const ids = Array.from({ length: 100 }, (_, index) => `member-${index}`);
  scene.update(
    ['home', ...ids],
    [{ id: 'home', x: 0, y: 0, z: 0, version: 1 }],
    ids.map((sourceId) => ({ sourceId, targetId: 'home' })),
  );
  const positions = ['home', ...ids].map((id) => scene.position(id) as Position);
  for (const [index, position] of positions.entries())
    for (const other of positions.slice(index + 1))
      expect(Math.hypot(position.x - other.x, position.y - other.y)).toBeGreaterThanOrEqual(4);
});

test('projected symbols expose perspective size and depth while their canvas remains a plain background', () => {
  const { scene, canvas, points } = openScene();
  scene.update(
    ['near', 'far'],
    [
      { id: 'near', x: 0, y: 0, z: 6, version: 1 },
      { id: 'far', x: 0, y: 0, z: -6, version: 1 },
    ],
  );
  const near = points().find((point) => point.id === 'near') as ProjectedPoint;
  const far = points().find((point) => point.id === 'far') as ProjectedPoint;
  expect(near.scale).toBeGreaterThan(far.scale);
  expect(near.depth).toBeLessThan(far.depth);
  expect(near.visible && far.visible).toBe(true);
  scene.navigate('in');
  expect(points().find((point) => point.id === 'far')?.scale).toBeGreaterThan(far.scale);
  for (const point of points()) {
    expect(point.scale).toBeGreaterThanOrEqual(0.7);
    expect(point.scale).toBeLessThanOrEqual(1.3);
  }
  scene.reset();
  const context = canvas.getContext('webgl2') as WebGL2RenderingContext;
  const pixel = new Uint8Array(4);
  context.readPixels(
    Math.round((near.x * canvas.width) / canvas.clientWidth),
    Math.round(((canvas.clientHeight - near.y) * canvas.height) / canvas.clientHeight),
    1,
    1,
    context.RGBA,
    context.UNSIGNED_BYTE,
    pixel,
  );
  expect([...pixel]).toEqual([19, 46, 37, 255]);
});

test('the mist background follows pan, rotation and zoom but stays fixed during personal placement', () => {
  const { scene, canvas } = openScene();
  scene.update(['home']);
  const context = canvas.getContext('webgl2') as WebGL2RenderingContext;
  const pixels = () => {
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    context.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      context.RGBA,
      context.UNSIGNED_BYTE,
      data,
    );
    return data;
  };
  scene.configure({ ...defaultViewSettings, background: true, darkBackground: 'mist' });
  const first = pixels();
  const colours = new Map<string, number>();
  for (let index = 0; index < first.length; index += 4) {
    const colour = [...first.slice(index, index + 3)].join(',');
    colours.set(colour, (colours.get(colour) ?? 0) + 1);
  }
  expect(colours.size).toBeGreaterThan(15);
  scene.navigate('left');
  const panned = pixels();
  expect(panned).not.toEqual(first);
  scene.place('home', { x: 8, y: 9, z: 10 });
  expect(pixels()).toEqual(panned);
  scene.navigate('rotate-left');
  expect(pixels()).not.toEqual(first);
  scene.navigate('rotate-right');
  expect(pixels()).toEqual(panned);
  scene.navigate('in');
  expect(pixels()).not.toEqual(first);
  scene.configure({ ...defaultViewSettings, background: false });
  expect([...pixels().slice(0, 4)]).toEqual([16, 27, 41, 255]);
});

test('background camera round trips and zoom extremes restore identical pixels', {
  tags: ['technical'],
  timeout: 60_000,
}, async () => {
  const { scene, canvas } = openScene();
  await expect.poll(() => canvas.width).toBe(960);
  scene.update(['home']);
  scene.configure({ ...defaultViewSettings, background: true }, 'light');
  const context = canvas.getContext('webgl2') as WebGL2RenderingContext;
  const pixels = () => {
    const data = new Uint8Array(canvas.width * canvas.height * 4);
    context.readPixels(
      0,
      0,
      canvas.width,
      canvas.height,
      context.RGBA,
      context.UNSIGNED_BYTE,
      data,
    );
    return data;
  };
  const original = pixels();
  for (let index = 0; index < 42; index++) scene.navigate('rotate-left');
  for (let index = 0; index < 42; index++) scene.navigate('rotate-right');
  expect(pixels()).toEqual(original);
  for (let index = 0; index < 30; index++) scene.navigate('right');
  for (let index = 0; index < 30; index++) scene.navigate('in');
  const near = pixels();
  expect(near).not.toEqual(original);
  for (let index = 0; index < 60; index++) scene.navigate('out');
  expect(pixels()).not.toEqual(near);
  scene.reset();
  expect(pixels()).toEqual(original);
});

test('restarting with reordered household content retains spacious three-dimensional defaults', () => {
  const ids = ['alex', 'kim', 'lo', 'music', 'family', 'account', 'card', 'bank', 'email'];
  const relationships = [
    { sourceId: 'alex', targetId: 'family' },
    { sourceId: 'kim', targetId: 'music' },
    { sourceId: 'lo', targetId: 'music' },
    { sourceId: 'family', targetId: 'music' },
    { sourceId: 'account', targetId: 'music' },
    { sourceId: 'family', targetId: 'card' },
    { sourceId: 'card', targetId: 'bank' },
    { sourceId: 'account', targetId: 'email' },
    { sourceId: 'alex', targetId: 'alex' },
  ];
  const first = openScene();
  first.scene.update(ids, [], relationships);
  const initial = ids.map((id) => first.scene.position(id) as Position);
  const restarted = openScene();
  restarted.scene.update([...ids].reverse(), [], [...relationships].reverse());
  expect(ids.map((id) => restarted.scene.position(id))).toEqual(initial);
  for (const [index, position] of initial.entries())
    for (const other of initial.slice(index + 1))
      expect(distance(position, other)).toBeGreaterThanOrEqual(5);
  for (const axis of ['x', 'y', 'z'] as const)
    expect(
      Math.max(...initial.map((p) => p[axis])) - Math.min(...initial.map((p) => p[axis])),
    ).toBeGreaterThan(10);
  expect(first.points().every((point) => point.visible)).toBe(true);
});

test('selection rotation fixes the three-dimensional mean and follows current personal placements', async () => {
  const { scene, canvas, points } = openScene();
  await expect.poll(() => canvas.width).toBe(960);
  scene.update(
    ['a', 'b', 'neighbor'],
    [
      { id: 'a', x: 10, y: 8, z: 6, version: 1 },
      { id: 'b', x: -2, y: -4, z: -8, version: 1 },
      { id: 'neighbor', x: -40, y: 30, z: -50, version: 1 },
    ],
  );
  scene.navigate('right');
  const before = points();
  scene.select(['a', 'b']);
  expect(points()).toEqual(before);
  const mean = { x: 4, y: 2, z: -1 };
  const pivot = scene.project(mean);
  for (const command of ['rotate-left', 'tilt-up', 'rotate-right', 'tilt-down']) {
    scene.navigate(command);
    expect(scene.project(mean).x).toBeCloseTo(pivot.x, 9);
    expect(scene.project(mean).y).toBeCloseTo(pivot.y, 9);
  }
  scene.place('a', { x: 16, y: 14, z: 12 });
  const movedMean = { x: 7, y: 5, z: 2 };
  const movedPivot = scene.project(movedMean);
  scene.navigate('tilt-up');
  expect(scene.project(movedMean).x).toBeCloseTo(movedPivot.x, 9);
  expect(scene.project(movedMean).y).toBeCloseTo(movedPivot.y, 9);
  scene.select(['a']);
  const single = scene.project({ x: 16, y: 14, z: 12 });
  scene.navigate('rotate-left');
  expect(scene.project({ x: 16, y: 14, z: 12 }).x).toBeCloseTo(single.x, 9);
  expect(scene.project({ x: 16, y: 14, z: 12 }).y).toBeCloseTo(single.y, 9);
  scene.select([]);
  scene.navigate('rotate-left');
  expect(scene.project({ x: 16, y: 14, z: 12 }).x).not.toBeCloseTo(single.x, 3);
});

test('focus fits deep positions inside the free tool rectangle without turning the camera or changing the pivot', async () => {
  const { scene, canvas, axes, points } = openScene();
  await expect.poll(() => canvas.width).toBe(960);
  scene.update(
    ['a', 'b', 'far'],
    [
      { id: 'a', x: 10, y: 8, z: 25, version: 1 },
      { id: 'b', x: -2, y: -4, z: -18, version: 1 },
      { id: 'far', x: -1000, y: 300, z: 400, version: 1 },
    ],
  );
  scene.select(['a']);
  scene.navigate('rotate-left');
  scene.navigate('tilt-up');
  const direction = axes();
  expect(scene.focus(['a', 'b'], { left: 180, right: 800, top: 80, bottom: 400 })).toBe(true);
  for (const [index, axis] of axes().entries())
    for (const key of ['x', 'y', 'z'] as const)
      expect(axis[key]).toBeCloseTo(direction[index][key], 12);
  for (const point of points().filter((point) => point.id !== 'far')) {
    expect(point.x).toBeGreaterThanOrEqual(180 - 1e-9);
    expect(point.x).toBeLessThanOrEqual(800 + 1e-9);
    expect(point.y).toBeGreaterThanOrEqual(80 - 1e-9);
    expect(point.y).toBeLessThanOrEqual(400 + 1e-9);
    expect(point.visible).toBe(true);
  }
  const pivot = scene.project({ x: 10, y: 8, z: 25 });
  scene.navigate('rotate-left');
  expect(scene.project({ x: 10, y: 8, z: 25 }).x).toBeCloseTo(pivot.x, 9);
  expect(scene.project({ x: 10, y: 8, z: 25 }).y).toBeCloseTo(pivot.y, 9);
  expect(scene.focus(['missing'], { left: 0, right: 960, top: 0, bottom: 600 })).toBe(false);
  const fitted = points();
  for (const area of [
    { left: 10, right: 10, top: 0, bottom: 600 },
    { left: 0, right: 960, top: 60, bottom: 20 },
    { left: Number.NaN, right: 960, top: 0, bottom: 600 },
  ]) {
    expect(scene.focus(['a', 'b'], area)).toBe(false);
    expect(points()).toEqual(fitted);
  }
});

test('camera history restores rotation, pan, zoom and focus in reverse order and resets its baseline', async () => {
  const { scene, canvas, points, axes, history } = openScene();
  await expect.poll(() => canvas.width).toBe(960);
  scene.update(['a', 'b']);
  const snapshot = () => ({ points: points(), axes: axes() });
  const initial = snapshot();
  expect(history()).toEqual({ canGoBack: false, changed: false });
  expect(scene.previousView()).toBe(false);
  const states = [initial];
  for (const command of ['rotate-left', 'up', 'in']) {
    scene.navigate(command);
    states.push(snapshot());
  }
  scene.focus(['a'], { left: 80, right: 800, top: 60, bottom: 450 });
  expect(history()).toEqual({ canGoBack: true, changed: true });
  for (const expected of states.reverse()) {
    expect(scene.previousView()).toBe(true);
    for (const [index, point] of points().entries())
      for (const key of ['x', 'y', 'depth', 'scale'] as const)
        expect(point[key]).toBeCloseTo(expected.points[index][key], 9);
    for (const [index, axis] of axes().entries())
      for (const key of ['x', 'y', 'z'] as const)
        expect(axis[key]).toBeCloseTo(expected.axes[index][key], 12);
  }
  expect(history()).toEqual({ canGoBack: false, changed: false });
  expect(scene.previousView()).toBe(false);
  scene.navigate('left');
  scene.navigate('in');
  scene.previousView();
  scene.navigate('tilt-up');
  scene.previousView();
  scene.previousView();
  expect(history().canGoBack).toBe(false);
  scene.place('a', { x: 2, y: 4, z: 6 });
  expect(history().canGoBack).toBe(false);
  scene.navigate('out');
  scene.reset();
  expect(history()).toEqual({ canGoBack: false, changed: false });
  expect(scene.previousView()).toBe(false);
  expect(scene.position('a')).toEqual({ x: 2, y: 4, z: 6 });
});

test('continuous camera drags and wheel bursts each form one history step while clicks create none', async () => {
  const { scene, canvas, points, history } = openScene();
  await expect.poll(() => canvas.width).toBe(960);
  scene.update(['a', 'b']);
  const initial = points();
  const pointer = (type: string, x: number) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        clientX: x,
        clientY: 100,
        button: 0,
        bubbles: true,
      }),
    );
  // Dispatching synthetic pointers cannot acquire native capture.
  const capture = canvas.setPointerCapture;
  canvas.setPointerCapture = () => {};
  pointer('pointerdown', 100);
  pointer('pointermove', 102);
  pointer('pointerup', 102);
  expect(history().canGoBack).toBe(false);
  pointer('pointerdown', 100);
  for (const x of [115, 130, 150]) pointer('pointermove', x);
  pointer('pointerup', 150);
  canvas.setPointerCapture = capture;
  expect(history().canGoBack).toBe(true);
  const dragged = points();
  for (let index = 0; index < 5; index++)
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 3, ctrlKey: true, bubbles: true }));
  await expect.poll(() => points()).not.toEqual(dragged);
  expect(scene.previousView()).toBe(true);
  for (const [index, point] of points().entries())
    expect(point.depth).toBeCloseTo(dragged[index].depth, 9);
  expect(scene.previousView()).toBe(true);
  for (const [index, point] of points().entries()) {
    expect(point.x).toBeCloseTo(initial[index].x, 9);
    expect(point.y).toBeCloseTo(initial[index].y, 9);
  }
  expect(history()).toEqual({ canGoBack: false, changed: false });
});
