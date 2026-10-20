import { cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { cdp, type Locator, page } from 'vitest/browser';
import type { MapState } from '../../src/shared/map.js';
import { ctrlWheel, openHouseholdCamera } from '../support/household-camera-browser.js';

const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [{ id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' }],
  relationshipTypes: [],
  relationships: [],
  objects: [
    {
      id: 'lo',
      householdId: 'home',
      typeId: 'person',
      revision: 1,
      name: 'Lo Exempel',
    },
    {
      id: 'kim',
      householdId: 'home',
      typeId: 'person',
      revision: 1,
      name: 'Kim Exempel',
    },
  ],
  draft: { version: 0, changes: [] },
};

function center(node: Locator) {
  const box = node.element().getBoundingClientRect();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('NAVIGATION-05: trackpad pinch zoom follows pinch speed while a Ctrl mouse-wheel notch stays limited', async () => {
  const shared = structuredClone(state);
  const { requests } = await openHouseholdCamera(state);
  const browserScale = window.top?.visualViewport?.scale;
  expect(browserScale).toBe(1);
  expect(window.visualViewport?.scale).toBe(1);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  const kim = page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  await expect.element(kim).toBeVisible();
  const separation = () => {
    const [a, b] = [center(lo), center(kim)];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const canvas = page
    .getByRole('region', { name: 'Rymdkarta', exact: true })
    .element()
    .querySelector('canvas');
  if (!canvas) throw new Error('Canvas must be visible');
  const box = canvas.getBoundingClientRect();
  // Stay above the floating map controls and on empty space.
  const empty = { x: box.x + box.width / 2 - 75, y: box.y + box.height / 4 };
  expect(document.elementFromPoint(empty.x, empty.y)).toBe(canvas);
  const baseline = separation();
  expect(baseline).toBeGreaterThan(20);
  const reset = async () => {
    const button = page.getByRole('button', { name: 'Återställ vy', exact: true });
    if (button.element().getAttribute('aria-disabled') !== 'true') await button.click();
    await expect.poll(separation).toBeCloseTo(baseline, 0);
  };
  const session = cdp();
  const offset = window.frameElement?.getBoundingClientRect();
  const nativeTarget = { x: empty.x + (offset?.x ?? 0), y: empty.y + (offset?.y ?? 0) };
  const ratioAfter = async (deltaY: number, events: number, expected: number) => {
    await reset();
    await ctrlWheel(session, nativeTarget, deltaY, events);
    await expect.poll(() => separation() / baseline).toBeCloseTo(expected, 1);
    return separation() / baseline;
  };
  const slow = await ratioAfter(-2, 5, Math.exp(0.1));
  // Reverse each manual pinch immediately, preserving the documented sequence.
  const reversePinch = async (deltaY: number, expected: number) => {
    const before = separation();
    await ctrlWheel(session, nativeTarget, deltaY, 5);
    await expect.poll(() => separation() / before).toBeCloseTo(expected, 1);
    await expect.poll(separation).toBeCloseTo(baseline, 0);
    return separation() / before;
  };
  const slowOut = await reversePinch(2, Math.exp(-0.1));
  const fast = await ratioAfter(-10, 5, Math.exp(0.5));
  const fastOut = await reversePinch(10, Math.exp(-0.5));
  expect(fast).toBeGreaterThan(slow * 1.3);
  expect(fastOut).toBeLessThan(slowOut / 1.3);
  // One mouse notch is far larger than a pinch event and stops at the limit.
  await ratioAfter(200, 1, Math.exp(-0.5));
  expect(window.top?.visualViewport?.scale).toBe(browserScale);
  expect(window.visualViewport?.scale).toBe(1);
  expect(state).toEqual(shared);
  expect(requests.every(({ method }) => method === 'GET')).toBe(true);
});
