import { act, render } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { type cdp, page } from 'vitest/browser';
import { FormLeaveProvider } from '../../src/client/FormLeave.js';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import { defaultConversationPreferences } from '../../src/shared/conversation-preferences.js';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings, type PersonalView } from '../../src/shared/personal-view.js';

/** Native Chromium Ctrl + wheel input at caller-owned top-level coordinates. */
export async function ctrlWheel(
  session: ReturnType<typeof cdp>,
  target: { x: number; y: number },
  deltaY: number,
  events: number,
) {
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...target });
  await session.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Control',
    code: 'ControlLeft',
    modifiers: 2,
    windowsVirtualKeyCode: 17,
  });
  let deliveredDelta = 0;
  const observeWheel = (event: WheelEvent) => {
    if (event.ctrlKey) deliveredDelta += event.deltaY;
  };
  document.addEventListener('wheel', observeWheel);
  try {
    await act(async () => {
      // Queue one burst without inserting runner round trips between wheel events.
      await Promise.all(
        Array.from({ length: events }, () =>
          session.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            ...target,
            deltaX: 0,
            deltaY,
            modifiers: 2,
          }),
        ),
      );
      // CDP acknowledgements alone do not prove delivery and React completion.
      await expect.poll(() => deliveredDelta).toBe(deltaY * events);
    });
  } finally {
    document.removeEventListener('wheel', observeWheel);
    await session.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Control',
      code: 'ControlLeft',
      windowsVirtualKeyCode: 17,
    });
  }
}

/** Public map composition with controlled reads. Camera navigation must not write
 * household content or personal positions. This fixture proves no server persistence. */
export async function openHouseholdCamera(
  state: MapState,
  width = 1440,
  height = 1000,
  view: PersonalView = {
    contentVersion: state.contentVersion,
    positions: [],
    settings: { ...defaultViewSettings, version: 0 },
  },
) {
  await page.viewport(width, height);
  await expect.poll(() => window.innerWidth).toBe(width);
  const requests: { url: string; method: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    requests.push({ url, method });
    if (method !== 'GET') throw new Error(`Camera navigation must not write: ${method} ${url}`);
    if (url.endsWith('/view')) return Response.json(view);
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/conversation-preferences'))
      return Response.json(defaultConversationPreferences);
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.endsWith('/text-assistant')) return Response.json({ available: false });
    if (url.includes('/map?') || url.endsWith('/map')) return Response.json(state);
    throw new Error(`Unexpected request: ${url}`);
  });
  render(
    <FormLeaveProvider>
      <main>
        <section className="panel household-panel">
          <HouseholdMap householdId="home" />
        </section>
      </main>
    </FormLeaveProvider>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  return { requests };
}
