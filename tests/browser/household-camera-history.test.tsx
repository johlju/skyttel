import { act, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { cdp, type Locator, page } from 'vitest/browser';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings, type PersonalView } from '../../src/shared/personal-view.js';
import { restoreDesktopPointer } from '../support/browser-touch.js';
import { ctrlWheel, openHouseholdCamera } from '../support/household-camera-browser.js';

function cameraWork() {
  const person = {
    id: 'person',
    householdId: 'home',
    revision: 1,
    name: 'Person',
    description: '',
  };
  const relationshipType = { ...person, id: 'knows', name: 'Känner' };
  const objects = [
    ['lo', 'Lo Exempel'],
    ['kim', 'Kim Exempel'],
    ['alex', 'Alex Exempel'],
    ['far', 'Långt borta'],
  ].map(([id, name]) => ({
    id,
    name,
    householdId: 'home',
    revision: 1,
    typeId: person.id,
  }));
  const relationships = [
    ['lo-kim', 'lo', 'kim'],
    ['kim-far', 'kim', 'far'],
  ].map(([id, sourceId, targetId]) => ({
    id,
    sourceId,
    targetId,
    householdId: 'home',
    revision: 1,
    typeId: relationshipType.id,
  }));
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [person],
    relationshipTypes: [relationshipType],
    objects,
    relationships,
    draft: {
      version: 6,
      changes: objects.map((object) => ({
        id: object.id,
        before: object,
        after: {
          ...object,
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text',
              value: 'Privat kameraförslag',
            },
          ],
        },
        type: person,
      })),
      relationships: relationships.map((relationship) => ({
        id: relationship.id,
        before: relationship,
        after: {
          ...relationship,
          properties: [
            { id: 'uncertainty', label: 'Osäkert uppgivet', kind: 'boolean', value: true },
          ],
        },
        type: relationshipType,
      })),
    },
  };
  const view: PersonalView = {
    contentVersion: state.contentVersion,
    settings: { ...defaultViewSettings, version: 0 },
    positions: [
      { id: 'lo', x: 8, y: 4, z: 10, version: 1 },
      { id: 'kim', x: -4, y: -6, z: 3, version: 1 },
      { id: 'alex', x: 3, y: 9, z: -8, version: 1 },
      { id: 'far', x: -60, y: 20, z: -40, version: 1 },
    ],
  };
  // Match the meaningful saved and private work in the retained HTTP fixture.
  expect(state.objects).toHaveLength(4);
  expect(state.relationships).toHaveLength(2);
  expect(state.draft.changes).toHaveLength(4);
  expect(state.draft.relationships).toHaveLength(2);
  for (const change of state.draft.changes)
    expect(change.after?.properties).toContainEqual({
      id: 'description',
      label: 'Beskrivning',
      kind: 'text',
      value: 'Privat kameraförslag',
    });
  for (const change of state.draft.relationships ?? [])
    expect(change.after?.properties).toContainEqual({
      id: 'uncertainty',
      label: 'Osäkert uppgivet',
      kind: 'boolean',
      value: true,
    });
  return { state, view };
}

function projection(map: Locator) {
  return [...map.element().querySelectorAll<HTMLElement>('.spatial-node')]
    .map((element) => ({
      id: element.dataset.objectId,
      x: parseFloat(element.style.left),
      y: parseFloat(element.style.top),
    }))
    .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''));
}

async function expectProjection(map: Locator, expected: ReturnType<typeof projection>) {
  await expect
    .poll(() => {
      const actual = projection(map);
      if (
        actual.length !== expected.length ||
        actual.some((point, index) => point.id !== expected[index].id)
      )
        return Infinity;
      return Math.max(
        ...actual.map((point, index) =>
          Math.hypot(point.x - expected[index].x, point.y - expected[index].y),
        ),
      );
    })
    .toBeLessThan(1e-6);
}

function emptyPoint(map: Locator) {
  const canvas = map.element().querySelector('canvas');
  if (!canvas) throw new Error('The real map canvas is required.');
  const box = canvas.getBoundingClientRect();
  for (let y = box.top + 180; y < box.bottom - 180; y += 30)
    for (let x = box.left + 40; x < box.right - 90; x += 30)
      if (
        [0, 2, 50, 80].every((delta) => document.elementFromPoint(x + delta, y + delta) === canvas)
      ) {
        // CDP uses the top-level page coordinates; projection uses frame-local coordinates.
        const frame = window.frameElement?.getBoundingClientRect();
        return { x: x + (frame?.x ?? 0), y: y + (frame?.y ?? 0) };
      }
  throw new Error('An unobstructed native canvas target is required.');
}

async function enter() {
  const session = cdp();
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    text: '\r',
    unmodifiedText: '\r',
    windowsVirtualKeyCode: 13,
  });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Enter',
    code: 'Enter',
    windowsVirtualKeyCode: 13,
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('KAMERA-08: previous view walks each camera change back to the initial view and reset clears history', async () => {
  const { state, view } = cameraWork();
  const content = structuredClone(state);
  const originalView = structuredClone(view);
  const { requests } = await openHouseholdCamera(state, 1440, 1000, view);
  const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
  await page
    .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
    .click({ trial: true });
  const previous = page.getByRole('button', { name: 'Föregående vy', exact: true });
  const reset = page.getByRole('button', { name: 'Återställ vy', exact: true });
  await expect.element(previous).toBeDisabled();
  await expect.element(reset).toBeDisabled();
  const initial = projection(map);
  expect(initial.map(({ id }) => id)).toEqual(['alex', 'far', 'kim', 'lo']);
  const search = page.getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true });
  await search.fill('Lo');
  await expect.element(previous).toBeDisabled();
  await expect.element(reset).not.toBeDisabled();
  await reset.click();
  await expect.element(search).toHaveValue('');
  await expectProjection(map, initial);
  await expect.element(previous).toBeDisabled();
  await expect.element(reset).toBeDisabled();
  const states = [initial];
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  for (const name of ['Rotera vänster', 'Panorera uppåt', 'Zooma in']) {
    await page.getByRole('button', { name, exact: true }).click();
    const current = projection(map);
    expect(current).not.toEqual(states.at(-1));
    states.push(current);
    await expect.element(previous).not.toBeDisabled();
    await expect.element(reset).not.toBeDisabled();
  }
  states.pop();
  for (const prior of states.reverse()) {
    previous.element().focus();
    await enter();
    await expectProjection(map, prior);
    await expect.element(previous).toHaveFocus();
  }
  await expect.element(previous).toBeDisabled();
  await expect.element(reset).toBeDisabled();
  await enter();
  await expectProjection(map, initial);
  await page.getByRole('button', { name: 'Zooma ut', exact: true }).click();
  await reset.click();
  await expectProjection(map, initial);
  await expect.element(previous).toBeDisabled();
  await expect.element(reset).toBeDisabled();
  await page.getByRole('button', { name: 'Panorera vänster', exact: true }).click();
  await previous.click();
  await expectProjection(map, initial);
  await expect.element(previous).toBeDisabled();
  expect(view.positions).toEqual(originalView.positions);
  expect(view).toEqual(originalView);
  expect(state).toEqual(content);
  expect(requests.every(({ method }) => method === 'GET')).toBe(true);
});

test('KAMERA-09: mouse drags, wheel bursts and touch pinch create complete previous views', async ({
  onTestFinished,
}) => {
  const session = cdp();
  onTestFinished(async () => {
    await restoreDesktopPointer(session);
  });
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const { state, view } = cameraWork();
  const content = structuredClone(state);
  const originalView = structuredClone(view);
  const { requests } = await openHouseholdCamera(state, 1440, 1000, view);
  const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
  await page
    .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
    .click({ trial: true });
  const previous = page.getByRole('button', { name: 'Föregående vy', exact: true });
  const initial = projection(map);
  expect(initial.map(({ id }) => id)).toEqual(['alex', 'far', 'kim', 'lo']);
  const browserScale = window.top?.visualViewport?.scale;
  expect(browserScale).toBe(1);
  const drag = async (button: 'left' | 'right') => {
    const point = emptyPoint(map);
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...point,
      button,
      buttons: button === 'left' ? 1 : 2,
      clickCount: 1,
    });
    for (let step = 1; step <= 6; step++)
      await session.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: point.x + (60 * step) / 6,
        y: point.y + (40 * step) / 6,
        button,
        buttons: button === 'left' ? 1 : 2,
      });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x + 60,
      y: point.y + 40,
      button,
      buttons: 0,
      clickCount: 1,
    });
  };
  await act(() => drag('left'));
  await expect.poll(() => projection(map)).not.toEqual(initial);
  const rotated = projection(map);
  await act(() => drag('right'));
  await expect.poll(() => projection(map)).not.toEqual(rotated);
  const panned = projection(map);
  const point = emptyPoint(map);
  // Keep the intended burst inside one gesture despite slow native input delivery.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await ctrlWheel(session, point, 3, 5);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
  } finally {
    vi.useRealTimers();
  }
  await expect.poll(() => projection(map)).not.toEqual(panned);
  await previous.click();
  await expectProjection(map, panned);
  await previous.click();
  await expectProjection(map, rotated);
  await previous.click();
  await expectProjection(map, initial);
  await expect.element(previous).toBeDisabled();
  const touch = emptyPoint(map);
  const pair = [
    { id: 1, ...touch },
    { id: 2, x: touch.x + 80, y: touch.y },
  ];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pair });
  for (const offset of [10, 20, 40])
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [pair[0], { ...pair[1], x: pair[1].x + offset, y: pair[1].y + offset / 2 }],
    });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => projection(map)).not.toEqual(initial);
  await previous.click();
  await expectProjection(map, initial);
  await expect.element(previous).toBeDisabled();
  expect(window.top?.visualViewport?.scale).toBe(browserScale);
  expect(window.visualViewport?.scale).toBe(1);
  expect(view).toEqual(originalView);
  expect(state).toEqual(content);
  expect(requests.every(({ method }) => method === 'GET')).toBe(true);
});
