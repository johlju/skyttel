import { afterEach, expect, test } from 'vitest';
import { type ProjectedPoint, spatialScene } from '../../src/client/spatial-scene.js';
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
  const scene = spatialScene(canvas, (value) => {
    points = value;
  });
  cleanups.push(() => {
    scene.dispose();
    canvas.remove();
  });
  return { scene, canvas, points: () => points };
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

test('the varied universe sky rotates and zooms but stays fixed during pan and personal placement', () => {
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
  scene.configure({ ...defaultViewSettings, stars: true });
  const first = pixels();
  const colours = new Map<string, number>();
  for (let index = 0; index < first.length; index += 4) {
    const colour = [...first.slice(index, index + 3)].join(',');
    colours.set(colour, (colours.get(colour) ?? 0) + 1);
  }
  expect(colours.get('9,18,31')).toBeGreaterThan(canvas.width * canvas.height * 0.95);
  expect(colours.size).toBeGreaterThan(15);
  scene.navigate('left');
  expect(pixels()).toEqual(first);
  scene.place('home', { x: 8, y: 9, z: 10 });
  expect(pixels()).toEqual(first);
  scene.navigate('rotate-left');
  expect(pixels()).not.toEqual(first);
  scene.navigate('rotate-right');
  expect(pixels()).toEqual(first);
  scene.navigate('in');
  expect(pixels()).not.toEqual(first);
  scene.configure(defaultViewSettings);
  expect([...pixels().slice(0, 4)]).toEqual([19, 46, 37, 255]);
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
    { sourceId: 'alex', targetId: null },
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
