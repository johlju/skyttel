import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import { SpatialMap } from '../../src/client/SpatialMap.js';
import '../../src/client/styles.css';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings, type PersonalView } from '../../src/shared/personal-view.js';

const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [
    { id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' },
    { id: 'own', householdId: 'home', revision: 1, name: 'Musiksak', description: '' },
  ],
  relationshipTypes: [
    {
      id: 'uses',
      householdId: 'home',
      revision: 1,
      name: 'Använder',
      description: '',
      forwardLabel: 'använder',
      reverseLabel: 'används av',
    },
  ],
  objects: [
    {
      id: 'lo',
      typeId: 'person',
      householdId: 'home',
      revision: 1,
      name: 'Lo Exempel',
      description: '',
    },
    {
      id: 'music',
      typeId: 'own',
      householdId: 'home',
      revision: 1,
      name: 'Musikspelaren',
      description: '',
    },
    {
      id: 'kim',
      typeId: 'person',
      householdId: 'home',
      revision: 1,
      name: 'Kim Exempel',
      description: '',
    },
  ],
  relationships: [
    {
      id: 'edge',
      householdId: 'home',
      revision: 1,
      typeId: 'uses',
      sourceId: 'lo',
      targetId: 'music',
      knowledge: 'known',
    },
    {
      id: 'unknown',
      householdId: 'home',
      revision: 1,
      typeId: 'uses',
      sourceId: 'kim',
      targetId: null,
      knowledge: 'unknown',
    },
  ],
  draft: { version: 0, changes: [] },
};

state.draft.changes = state.objects.map((object, index) => ({
  id: object.id,
  before: index === 1 ? null : object,
  after: index === 2 ? null : object,
  type: state.types[object.typeId === 'person' ? 0 : 1],
}));
state.draft.relationships = state.relationships.map((edge, index) => ({
  id: edge.id,
  before: edge,
  after: index ? null : edge,
  type: state.relationshipTypes[0],
  objectNames: {},
}));

function MapView({
  mapState = state,
  relationships = mapState.relationships,
  active = true,
  revealRequest,
}: {
  mapState?: MapState;
  relationships?: MapState['relationships'];
  active?: boolean;
  revealRequest?: { id: string; objectIds: string[]; relationshipId?: string };
} = {}) {
  const [view, setView] = useState<PersonalView>({
    contentVersion: 1,
    positions: [],
    settings: { ...defaultViewSettings, version: 0 },
  });
  const [selection, setSelection] = useState<{
    kind: 'object' | 'relationship';
    id: string;
    previous?: boolean;
  } | null>(null);
  const [objects, setObjects] = useState(
    new Map(mapState.objects.map((object) => [object.id, object])),
  );
  const [message, setMessage] = useState('Ingen vald');
  return (
    <>
      <p role="status">{message}</p>
      <pre data-placement>{JSON.stringify(view.positions)}</pre>
      <SpatialMap
        personal={{
          view,
          pending: false,
          message: '',
          refresh: async () => {},
          move: async (id, position) =>
            setView((previous) => ({
              ...previous,
              contentVersion: 1,
              positions: [
                ...previous.positions.filter((item) => item.id !== id),
                { ...position, id, version: 1 },
              ],
            })),
          configure: async (settings) =>
            setView((previous) => ({ ...previous, settings: { ...settings, version: 1 } })),
        }}
        active={active}
        revealRequest={revealRequest}
        state={mapState}
        objects={objects}
        relationships={new Map(relationships.map((edge) => [edge.id, edge]))}
        selection={selection}
        disabled={false}
        onSelect={(object) => {
          setSelection({ kind: 'object', id: object.id });
          setMessage(object.name);
        }}
        onSelectRelationship={(edge, previous) => {
          setSelection({ kind: 'relationship', id: edge.id, previous });
          setMessage(previous ? `Tidigare: ${edge.sourceId}` : `Samband: ${edge.knowledge}`);
        }}
        onFocus={(id) => {
          setSelection({ kind: 'object', id });
          setMessage(`Kopplingar för ${id}`);
        }}
        onClear={() => {
          setSelection(null);
          setMessage('Hela rymden');
        }}
        onReset={() => {
          setSelection(null);
          setMessage('Översikt återställd');
        }}
        onRemove={(object) => {
          setObjects((previous) => {
            const next = new Map(previous);
            next.delete(object.id);
            return next;
          });
          setMessage('Borttagning föreslagen');
        }}
      />
    </>
  );
}

test('the approved spatial presentation uses compact pictogram nodes, separate names and contextual relationship labels', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  const button = lo.element();
  const bounds = button.getBoundingClientRect();
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.width).toBeLessThanOrEqual(48);
  expect(bounds.height).toBe(bounds.width);
  expect(button.querySelector('svg path, svg circle')).not.toBeNull();
  const name = page.getByText('Lo Exempel', { exact: true }).element();
  expect(button.contains(name)).toBe(false);
  const nameBounds = name.getBoundingClientRect();
  expect(
    nameBounds.top >= bounds.bottom ||
      nameBounds.bottom <= bounds.top ||
      nameBounds.left >= bounds.right ||
      nameBounds.right <= bounds.left,
  ).toBe(true);
  expect(document.querySelectorAll('.spatial-edge')).toHaveLength(0);
  const hit = document.querySelector('.connection-hit');
  expect(hit).not.toBeNull();
  expect(Number.parseFloat(getComputedStyle(hit as Element).strokeWidth)).toBeGreaterThanOrEqual(
    18,
  );
  await lo.click();
  await expect
    .element(
      page.getByRole('button', {
        name: 'Välj samband: Lo Exempel → använder → Musikspelaren',
        exact: true,
      }),
    )
    .toBeVisible();
  await page.getByRole('checkbox', { name: 'Alla etiketter', exact: true }).click();
  await expect.poll(() => document.querySelectorAll('.spatial-edge').length).toBe(2);
});

test('an explicit reveal opens an inactive scene and brings requested objects into its viewport', async () => {
  const view = render(<MapView active={false} />);
  view.rerender(<MapView revealRequest={{ id: 'show-music', objectIds: ['music'] }} />);
  const surface = document.querySelector('.spatial-surface') as HTMLElement;
  await expect.poll(() => surface.dataset.revealRequest).toBe('show-music');
  const music = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
  const inside = () => {
    const a = surface.getBoundingClientRect();
    const b = music.element().getBoundingClientRect();
    return b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
  };
  await expect.poll(inside).toBe(true);
  await page.getByText('Navigera rymden', { exact: true }).click();
  for (let index = 0; index < 10; index++)
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
  expect(inside()).toBe(false);
  view.rerender(<MapView revealRequest={{ id: 'show-music-again', objectIds: ['music'] }} />);
  await expect.poll(() => surface.dataset.revealRequest).toBe('show-music-again');
  await expect.poll(inside).toBe(true);
  expect(document.querySelector('[data-placement]')?.textContent).toBe('[]');
});

test('changing a relationship retains its prior route while the current route remains selectable', async () => {
  const before = state.relationships[0];
  const after = { ...before, sourceId: 'kim' };
  render(
    <MapView
      mapState={{
        ...state,
        relationships: [before],
        draft: {
          version: 1,
          changes: [],
          relationships: [
            { id: before.id, before, after, type: state.relationshipTypes[0], objectNames: {} },
          ],
        },
      }}
      relationships={[after]}
    />,
  );
  await page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }).click();
  const previous = document.querySelector('[data-previous-relationship="edge"]');
  expect(previous).not.toBeNull();
  expect(previous?.textContent).toContain('Lo Exempel → använder → Musikspelaren');
  expect(previous?.getAttribute('d')).toContain('Q');
  expect(getComputedStyle(previous as Element).strokeDasharray).not.toBe('none');
  await page.getByLabelText('Alla etiketter', { exact: true }).click();
  const priorLabel = page.getByRole('button', {
    name: 'Välj tidigare samband: Lo Exempel → använder → Musikspelaren',
    exact: true,
  });
  await expect.element(priorLabel).toHaveTextContent('× → använder');
  await priorLabel.click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Tidigare: lo');
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Kim Exempel → använder → Musikspelaren',
      exact: true,
    })
    .click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Samband: known');
});

test('personal placement buttons move the selected object in three dimensions without editing household facts', async () => {
  render(<MapView />);
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await userEvent.keyboard('{Shift>}');
  await expect.element(page.getByText('Startläge', { exact: true })).toBeVisible();
  await userEvent.keyboard('{/Shift}');
  await expect.element(page.getByText('Startläge', { exact: true })).not.toBeInTheDocument();
  await page.getByText('Ordna min vy', { exact: true }).click();
  await page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }).click();
  await expect.element(page.getByLabelText('Visa höjdhjälp', { exact: true })).toBeChecked();
  await expect.element(page.getByText('↑ 1 steg högre än start', { exact: true })).toBeVisible();
  await page.getByLabelText('Visa höjdhjälp', { exact: true }).click();
  await page.getByLabelText('Visa höjdhjälp', { exact: true }).click();
  await expect.element(page.getByText('↑ 1 steg högre än start', { exact: true })).toBeVisible();
  const first = JSON.parse(document.querySelector('[data-placement]')?.textContent ?? '[]');
  expect(first).toHaveLength(1);
  await page.getByRole('button', { name: 'Flytta nedåt i rummet', exact: true }).click();
  const second = JSON.parse(document.querySelector('[data-placement]')?.textContent ?? '[]');
  expect(second[0].y).toBeCloseTo(first[0].y - 1);
  expect(second[0].x).toBe(first[0].x);
  expect(second[0].z).toBe(first[0].z);
});

test('native touch height gestures retain either release order and wait for all fingers before another move', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  const session = cdp();
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const location = () => {
    const rect = lo.element().getBoundingClientRect();
    const offset = window.frameElement?.getBoundingClientRect();
    return {
      x: rect.x + rect.width / 2 + (offset?.x ?? 0),
      y: rect.y + rect.height / 2 + (offset?.y ?? 0),
    };
  };
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    points: { id: number; x: number; y: number }[],
  ) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const positions = () =>
    JSON.parse(document.querySelector('[data-placement]')?.textContent ?? '[]');
  let start = location();
  await send('touchStart', [{ id: 1, ...start }]);
  await send('touchMove', [{ id: 1, x: start.x + 30, y: start.y + 20 }]);
  await send('touchEnd', []);
  await expect.poll(() => positions().length).toBe(1);
  const before = positions()[0];
  start = location();
  const second = { id: 2, x: start.x + 100, y: start.y };
  await send('touchStart', [{ id: 1, ...start }]);
  await send('touchStart', [{ id: 1, ...start }, second]);
  await send('touchMove', [{ id: 1, x: start.x, y: start.y - 35 }, second]);
  await expect.element(page.getByText('Höjdflyttning · personlig vy')).toBeVisible();
  await expect.element(page.getByText('Hjälpplan', { exact: true })).toBeVisible();
  await expect.element(page.getByText(/^↑ .* steg högre än start$/, { exact: true })).toBeVisible();
  await send('touchEnd', [second]);
  await send('touchEnd', []);
  await expect.poll(() => positions()[0].y).toBeGreaterThan(before.y);
  expect(positions()[0].x).toBe(before.x);
  expect(positions()[0].z).toBe(before.z);
  for (const released of [1, 2]) {
    start = location();
    const driver = { id: 1, ...start };
    const anchor = { id: 2, x: start.x + 100, y: start.y };
    const extra = { id: 3, x: start.x + 130, y: start.y };
    const beforeHeight = positions()[0];
    await send('touchStart', [driver]);
    await send('touchStart', [driver, anchor]);
    await send('touchStart', [driver, anchor, extra]);
    const raised = { ...driver, y: start.y - 30 };
    await send('touchMove', [raised, anchor, extra]);
    await send('touchEnd', [released === 1 ? raised : anchor]);
    await expect.poll(() => positions()[0].y).toBeGreaterThan(beforeHeight.y);
    expect(positions()[0].x).toBe(beforeHeight.x);
    expect(positions()[0].z).toBe(beforeHeight.z);
    const completed = positions();
    const remaining = released === 1 ? anchor : raised;
    const bounds = lo.element().getBoundingClientRect();
    await send('touchMove', [{ ...remaining, x: remaining.x + 40 }, extra]);
    expect(positions()).toEqual(completed);
    expect(lo.element().getBoundingClientRect().x).toBeCloseTo(bounds.x);
    expect(lo.element().getBoundingClientRect().y).toBeCloseTo(bounds.y);
    await send('touchEnd', []);
  }
  const saved = positions();
  start = location();
  await send('touchStart', [{ id: 1, ...start }]);
  await send('touchMove', [{ id: 1, x: start.x + 30, y: start.y }]);
  await send('touchCancel', []);
  expect(positions()).toEqual(saved);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
});

test('a moving height anchor restores the object and hands the stable pair to pan and pinch', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  const music = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
  await expect.element(lo).toBeVisible();
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  const initial = lo.element().getBoundingClientRect();
  const musicInitial = music.element().getBoundingClientRect();
  const offset = window.frameElement?.getBoundingClientRect();
  const driver = {
    id: 1,
    x: initial.x + initial.width / 2 + (offset?.x ?? 0),
    y: initial.y + initial.height / 2 + (offset?.y ?? 0),
  };
  const anchor = { id: 2, x: driver.x + 100, y: driver.y };
  const session = cdp();
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: { id: number; x: number; y: number }[],
  ) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [driver]);
  await touch('touchMove', [{ ...driver, x: driver.x + 20 }]);
  driver.x += 20;
  await touch('touchStart', [driver, anchor]);
  driver.y -= 25;
  await touch('touchMove', [driver, anchor]);
  anchor.y += 30;
  await touch('touchMove', [driver, anchor]);
  await expect.poll(() => lo.element().getBoundingClientRect().x).toBeCloseTo(initial.x, 1);
  await expect.poll(() => lo.element().getBoundingClientRect().y).toBeCloseTo(initial.y, 1);
  expect(music.element().getBoundingClientRect().x).toBeCloseTo(musicInitial.x, 1);
  driver.x += 30;
  anchor.x += 30;
  await touch('touchMove', [driver, anchor]);
  await expect
    .poll(() => music.element().getBoundingClientRect().x)
    .not.toBeCloseTo(musicInitial.x, 1);
  const distance = () =>
    Math.hypot(
      lo.element().getBoundingClientRect().x - music.element().getBoundingClientRect().x,
      lo.element().getBoundingClientRect().y - music.element().getBoundingClientRect().y,
    );
  const beforePinch = distance();
  driver.x -= 30;
  anchor.x += 30;
  await touch('touchMove', [driver, anchor]);
  await expect.poll(distance).toBeGreaterThan(beforePinch);
  await touch('touchEnd', [anchor]);
  const stopped = lo.element().getBoundingClientRect();
  await touch('touchMove', [{ ...driver, y: driver.y + 30 }]);
  expect(lo.element().getBoundingClientRect().y).toBeCloseTo(stopped.y);
  await touch('touchEnd', []);
  expect(document.querySelector('[data-placement]')?.textContent).toBe('[]');
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
});

test('personal display controls retain corner choices, independent pan inversions and all movement alternatives', async () => {
  render(<MapView />);
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await page.getByText('Ordna min vy', { exact: true }).click();
  await page.getByLabelText('Visa axlar hela tiden', { exact: true }).click();
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await page.getByLabelText('Axelvisarens hörn', { exact: true }).selectOptions(corner);
    await expect
      .element(page.getByRole('img', { name: 'Rummets axlar: sidled X, höjd Y, djup Z' }))
      .toHaveClass(new RegExp(corner));
  }
  for (const label of [
    'Vänd panorering i sidled',
    'Vänd panorering i höjdled',
    'Visa stjärnhimmel',
  ]) {
    await page.getByLabelText(label, { exact: true }).click();
    await expect.element(page.getByLabelText(label, { exact: true })).toBeChecked();
  }
  for (const label of ['vänster', 'höger', 'uppåt', 'nedåt', 'inåt', 'utåt'])
    await page.getByRole('button', { name: `Flytta ${label} i rummet`, exact: true }).click();
  await page.getByText('Navigera rymden', { exact: true }).click();
  for (const label of ['Panorera vänster', 'Panorera höger', 'Panorera uppåt', 'Panorera nedåt'])
    await page.getByRole('button', { name: label, exact: true }).click();
});

test('wheel pan follows both system axes over canvas, icons and labels; Ctrl alone zooms', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  const position = () => {
    const bounds = lo.element().getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  };
  const music = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
  const separation = () => {
    const a = position();
    const b = music.element().getBoundingClientRect();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  for (const target of [
    canvas,
    lo.element(),
    page.getByText('Lo Exempel', { exact: true }).element(),
  ]) {
    const before = position();
    const distance = separation();
    const wheel = new WheelEvent('wheel', { deltaY: 20, bubbles: true, cancelable: true });
    target.dispatchEvent(wheel);
    await expect.poll(() => position().y).toBeCloseTo(before.y - 20, 0);
    expect(position().x).toBeCloseTo(before.x, 0);
    expect(separation()).toBeCloseTo(distance, 0);
    expect(wheel.defaultPrevented).toBe(true);
  }
  const before = position();
  canvas.dispatchEvent(
    new WheelEvent('wheel', { deltaX: 2, deltaY: 1, deltaMode: 1, bubbles: true }),
  );
  await expect.poll(() => position().x).toBeCloseTo(before.x - 32, 0);
  expect(position().y).toBeCloseTo(before.y - 16, 0);
  const pageScroll = position();
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 0.01, deltaMode: 2, bubbles: true }));
  await expect.poll(() => position().y).toBeCloseTo(pageScroll.y - canvas.clientHeight * 0.01, 0);
  await page.getByText('Ordna min vy', { exact: true }).click();
  await page.getByLabelText('Vänd panorering i höjdled', { exact: true }).click();
  const inverted = position();
  lo.element().dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: 20, bubbles: true }));
  await expect.poll(() => position().y).toBeCloseTo(inverted.y + 20, 0);
  expect(position().x).toBeCloseTo(inverted.x - 10, 0);
  await page.getByLabelText('Vänd panorering i sidled', { exact: true }).click();
  const bothInverted = position();
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: 20, bubbles: true }));
  await expect.poll(() => position().x).toBeCloseTo(bothInverted.x + 10, 0);
  expect(position().y).toBeCloseTo(bothInverted.y + 20, 0);
  const distance = separation();
  const pinch = new WheelEvent('wheel', {
    deltaY: -30,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  lo.element().dispatchEvent(pinch);
  await expect.poll(separation).toBeGreaterThan(distance);
  expect(pinch.defaultPrevented).toBe(true);
  expect(document.querySelector('[data-placement]')?.textContent).toBe('[]');
});

test('native empty-space mouse, wheel and touch navigation changes the camera without moving objects', async () => {
  render(<MapView />);
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }))
    .toBeVisible();
  const session = cdp();
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('Visible map required');
  const rect = canvas.getBoundingClientRect();
  const offset = window.frameElement?.getBoundingClientRect();
  const start = { x: rect.x + 15 + (offset?.x ?? 0), y: rect.y + 15 + (offset?.y ?? 0) };
  const line = () => document.querySelector('line[data-object-id="lo"]')?.getAttribute('x1');
  const before = line();
  for (const [button, buttons, modifiers] of [
    ['left', 1, 0],
    ['right', 2, 0],
    ['left', 1, 8],
  ] as const) {
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...start,
      button,
      buttons,
      modifiers,
      clickCount: 1,
    });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: start.x + 30,
      y: start.y + 15,
      button,
      buttons,
      modifiers,
    });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: start.x + 30,
      y: start.y + 15,
      button,
      buttons: 0,
      modifiers,
      clickCount: 1,
    });
  }
  expect(line()).not.toBe(before);
  for (const [deltaX, deltaY, modifiers] of [
    [0, 20, 0],
    [10, 20, 0],
    [0, 15, 8],
    [0, -20, 2],
  ]) {
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      ...start,
      deltaX,
      deltaY,
      modifiers,
    });
  }
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    touchPoints: { id: number; x: number; y: number }[],
  ) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [{ id: 1, ...start }]);
  await touch('touchMove', [{ id: 1, x: start.x + 20, y: start.y + 10 }]);
  await touch('touchStart', [
    { id: 1, x: start.x + 20, y: start.y + 10 },
    { id: 2, x: start.x + 110, y: start.y + 10 },
  ]);
  await touch('touchMove', [
    { id: 1, x: start.x + 30, y: start.y + 20 },
    { id: 2, x: start.x + 145, y: start.y + 20 },
  ]);
  await touch('touchStart', [
    { id: 1, x: start.x + 30, y: start.y + 20 },
    { id: 2, x: start.x + 145, y: start.y + 20 },
    { id: 3, x: start.x + 170, y: start.y + 20 },
  ]);
  await touch('touchMove', [
    { id: 1, x: start.x + 35, y: start.y + 20 },
    { id: 2, x: start.x + 145, y: start.y + 20 },
    { id: 3, x: start.x + 170, y: start.y + 20 },
  ]);
  await touch('touchCancel', []);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  expect(document.querySelector('[data-placement]')?.textContent).toBe('[]');
  window.dispatchEvent(new Event('blur'));
});

test('painted stars respond to rotation and zoom while panning and object movement leave the distant sky fixed', async () => {
  render(<MapView relationships={[]} />);
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await page.getByText('Ordna min vy', { exact: true }).click();
  await page.getByLabelText('Visa stjärnhimmel', { exact: true }).click();
  await page.getByText('Navigera rymden', { exact: true }).click();
  const starPixels = async () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Visible map required');
    const screenshot = await page.screenshot({ element: canvas, base64: true });
    const picture = new Image();
    picture.src = `data:image/png;base64,${screenshot.base64}`;
    await picture.decode();
    const sample = document.createElement('canvas');
    sample.width = picture.width;
    sample.height = picture.height;
    const context = sample.getContext('2d');
    if (!context) throw new Error('Pixel sampling unavailable');
    context.drawImage(picture, 0, 0);
    const { data } = context.getImageData(0, 0, sample.width, sample.height);
    const bounds = canvas.getBoundingClientRect();
    const overlays = [
      ...document.querySelectorAll('.spatial-labels > *, .spatial-node, .spatial-axis'),
    ].map((element) => element.getBoundingClientRect());
    const visible = (pixel: number) => {
      const x = bounds.x + (pixel % sample.width);
      const y = bounds.y + Math.floor(pixel / sample.width);
      return !overlays.some(
        (overlay) =>
          x >= overlay.left - 6 &&
          x <= overlay.right + 6 &&
          y >= overlay.top - 6 &&
          y <= overlay.bottom + 6,
      );
    };
    const pixels = new Set<number>();
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 2] > 55 && data[index + 2] > data[index] * 1.04 && visible(index / 4))
        pixels.add(index / 4);
    }
    return { pixels, visible };
  };
  const common = (
    a: Awaited<ReturnType<typeof starPixels>>,
    b: Awaited<ReturnType<typeof starPixels>>,
  ) => {
    const visible = [...a.pixels].filter(b.visible);
    return visible.filter((pixel) => b.pixels.has(pixel)).length / visible.length;
  };
  const original = await starPixels();
  expect(original.pixels.size).toBeGreaterThan(15);
  await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
  const panned = await starPixels();
  expect(common(original, panned)).toBeGreaterThan(0.85);
  await page.getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }).click();
  await page.getByLabelText('Visa höjdhjälp', { exact: true }).click();
  expect(common(panned, await starPixels())).toBeGreaterThan(0.85);
  await page.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
  const rotated = await starPixels();
  expect(common(panned, rotated)).toBeLessThan(0.3);
  await page.getByRole('button', { name: 'Zooma in', exact: true }).click();
  expect(common(rotated, await starPixels())).toBeLessThan(0.3);
});

afterEach(cleanup);

test('graphics navigation and label modes expose selectable objects and directed facts', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  await lo.click({ modifiers: ['Control'] });
  await expect.element(page.getByRole('status')).toHaveTextContent('Kopplingar för lo');
  await lo.click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Lo Exempel');
  await page.getByText('Navigera rymden', { exact: true }).click();
  for (const name of [
    'Panorera höger',
    'Panorera vänster',
    'Panorera uppåt',
    'Panorera nedåt',
    'Rotera vänster',
    'Rotera höger',
    'Luta uppåt',
    'Luta nedåt',
    'Zooma in',
    'Zooma ut',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect.element(lo).toBeInTheDocument();
  }
  await page.getByLabelText('Alla etiketter', { exact: true }).click();
  await expect
    .element(page.getByText('Närmare utsnitt. Panorera för att se fler etiketter.'))
    .toBeVisible();
  await page.getByLabelText('Alla etiketter', { exact: true }).click();
  await page.getByRole('button', { name: 'Återställ vy' }).click();
  await lo.click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Lo Exempel → använder → Musikspelaren',
      exact: true,
    })
    .click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Samband: known');
  await page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }).click();
  await page
    .getByRole('button', { name: 'Välj samband: Kim Exempel → använder → Okänt', exact: true })
    .click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Samband: unknown');
  await page
    .getByRole('img', { name: 'Rymdens bakgrund. Välj innehåll med etiketterna eller listan.' })
    .click({ position: { x: 5, y: 5 } });
  await expect.element(page.getByRole('status')).toHaveTextContent('Hela rymden');
});

test('dense labels remain readable and explicit all-label mode retains access to every label', async () => {
  const objects = Array.from({ length: 100 }, (_, index) => ({
    ...state.objects[0],
    id: `dense-${index}`,
    name: `Tätt objekt ${index}`,
  }));
  render(
    <SpatialMap
      state={{ ...state, objects, relationships: [], draft: { version: 0, changes: [] } }}
      active
      objects={new Map(objects.map((object) => [object.id, object]))}
      relationships={new Map()}
      selection={{ kind: 'object', id: 'dense-99' }}
      disabled={false}
      onSelect={() => {}}
      onSelectRelationship={() => {}}
      onFocus={() => {}}
      onClear={() => {}}
      onReset={() => {}}
      onRemove={() => {}}
    />,
  );
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Tätt objekt 99', exact: true }))
    .toBeVisible();
  await expect.element(page.getByText('Tätt objekt 99', { exact: true })).toBeVisible();
  await expect
    .poll(() => {
      const boxes = [...document.querySelectorAll('.spatial-name')].map((label) =>
        label.getBoundingClientRect(),
      );
      return (
        boxes.length > 0 &&
        boxes.length < 100 &&
        boxes.every((a, index) =>
          boxes
            .slice(index + 1)
            .every(
              (b) =>
                a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
            ),
        )
      );
    })
    .toBe(true);
  await page.getByLabelText('Alla etiketter', { exact: true }).click();
  await expect.poll(() => document.querySelectorAll('.spatial-name').length).toBe(100);
});

test('all labels only opens a closer view when needed and retains an already close camera', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  const location = () => (lo.element() as HTMLElement).style.cssText;
  const toggle = page.getByLabelText('Alla etiketter', { exact: true });
  await toggle.click();
  const working = location();
  await toggle.click();
  expect(location()).toBe(working);
  await toggle.click();
  expect(location()).toBe(working);
  await toggle.click();
  await page.getByText('Navigera rymden', { exact: true }).click();
  await page.getByRole('button', { name: 'Zooma in', exact: true }).click();
  const close = location();
  await toggle.click();
  expect(location()).toBe(close);
});

test('direction rendering retains selectable self references and explicitly absent targets', async ({
  onTestFinished,
}) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  onTestFinished(() => page.viewport(viewport.width, viewport.height));
  await page.viewport(1280, 1000);
  render(
    <MapView
      relationships={[
        { ...state.relationships[0], id: 'self', targetId: 'lo' },
        { ...state.relationships[1], id: 'none', knowledge: 'none' },
      ]}
    />,
  );
  // Overview labels may be culled when font metrics or the viewport leave no room.
  await page.getByLabelText('Alla etiketter', { exact: true }).click();
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Lo Exempel → använder → Lo Exempel',
      exact: true,
    })
    .click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Samband: known');
  await page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Kim Exempel → använder → Uttryckligen inget',
      exact: true,
    })
    .click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Samband: none');
});

test('context menu edits, focuses, cancels and removes only the chosen object', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await lo.click({ button: 'right', modifiers: ['Control'] });
  await expect.element(page.getByRole('status')).toHaveTextContent('Kopplingar för lo');
  expect(document.querySelector('dialog')?.open).toBe(false);
  await lo.click({ button: 'right' });
  await page.getByRole('button', { name: 'Redigera objekt', exact: true }).click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Lo Exempel');
  await lo.click({ button: 'right' });
  await page.getByRole('button', { name: 'Visa kopplingar', exact: true }).click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Kopplingar för lo');
  await lo.click({ button: 'right' });
  await userEvent.keyboard('{Escape}');
  await expect.element(lo).toHaveFocus();
  await lo.click({ button: 'right' });
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect.element(lo).toHaveFocus();
  await lo.click({ button: 'right' });
  await expect
    .element(page.getByRole('button', { name: 'Ta bort objekt', exact: true }))
    .toHaveAccessibleDescription(
      /Objektet och dess 1 samband läggs som borttagningar i ditt utkast/,
    );
  await page.getByRole('button', { name: 'Ta bort objekt', exact: true }).click();
  await expect.element(lo).not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }))
    .toBeVisible();
});

test('a real WebGL context can recover without replacing selected household content', async () => {
  render(<MapView />);
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  const extension = document
    .querySelector('canvas')
    ?.getContext('webgl2')
    ?.getExtension('WEBGL_lose_context');
  expect(extension).toBeTruthy();
  extension?.loseContext();
  await expect
    .element(page.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.'))
    .toBeVisible();
  extension?.restoreContext();
  await expect
    .element(page.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.'))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('long press does not activate a menu action on release and movement cancels a pending menu', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  const element = lo.element();
  fireEvent.pointerDown(element, {
    pointerType: 'touch',
    isPrimary: true,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.pointerMove(element, { pointerType: 'touch', clientX: 50, clientY: 20 });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await expect
    .element(page.getByRole('button', { name: 'Redigera objekt', exact: true }))
    .not.toBeInTheDocument();
  fireEvent.pointerDown(element, {
    pointerType: 'touch',
    isPrimary: true,
    clientX: 20,
    clientY: 20,
  });
  await expect
    .element(page.getByRole('button', { name: 'Redigera objekt', exact: true }))
    .toBeVisible();
  fireEvent.pointerUp(element, { pointerType: 'touch' });
  fireEvent.click(page.getByRole('button', { name: 'Redigera objekt', exact: true }).element());
  await expect
    .element(page.getByRole('button', { name: 'Redigera objekt', exact: true }))
    .toBeVisible();
  await expect.element(page.getByRole('status')).toHaveTextContent('Ingen vald');
  await page.getByRole('button', { name: 'Redigera objekt', exact: true }).click();
  await expect.element(page.getByRole('status')).toHaveTextContent('Lo Exempel');
});

test('reduced motion overrides a saved star choice and follows system changes', async () => {
  const session = cdp();
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  render(<MapView relationships={[]} />);
  const stars = page.getByLabelText('Visa stjärnhimmel', { exact: true });
  await stars.click();
  await expect.element(stars).toBeChecked();
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await expect.element(stars).not.toBeChecked();
  await expect.element(stars).toBeDisabled();
  const screenshot = await page.screenshot({
    element: document.querySelector('canvas') as HTMLCanvasElement,
    base64: true,
  });
  const picture = new Image();
  picture.src = `data:image/png;base64,${screenshot.base64}`;
  await picture.decode();
  const sample = document.createElement('canvas');
  sample.width = picture.width;
  sample.height = picture.height;
  const context = sample.getContext('2d');
  if (!context) throw new Error('Pixel sampling unavailable');
  context.drawImage(picture, 0, 0);
  // Empty corners use the flat green sky, not the dark blue star sky.
  expect([...context.getImageData(30, 30, 1, 1).data]).toEqual([19, 46, 37, 255]);
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await expect.element(stars).toBeEnabled();
  await expect.element(stars).toBeChecked();
});
