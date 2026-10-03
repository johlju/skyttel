import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { type Locator, page, userEvent } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import { consentBoxName } from '../support/conversation.js';

const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [{ id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' }],
  relationshipTypes: [],
  relationships: [],
  objects: [
    {
      id: 'alex',
      householdId: 'home',
      typeId: 'person',
      revision: 1,
      name: 'Alex',
      description: '',
    },
  ],
  draft: { version: 0, changes: [] },
};
const session: TextAssistantView = {
  id: 'session',
  revision: 0,
  phase: 'ready',
  operations: [],
  review: {
    version: 0,
    contentVersion: 1,
    changes: [],
    readyToSave: false,
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
  },
};

/** The household's map, with a conversation that is offered and no saved consent. */
async function open(width: number, height: number) {
  await page.viewport(width, height);
  await expect.poll(() => window.innerWidth).toBe(width);
  const starts: unknown[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: 1,
        positions: [],
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.includes('/map?')) return Response.json(state);
    if (!url.endsWith('/text-assistant')) return Response.json(session);
    if (init?.method !== 'POST') return Response.json({ available: true });
    starts.push(JSON.parse(String(init.body)));
    return Response.json(session);
  });
  render(
    <main>
      <section className="panel household-panel">
        <HouseholdMap householdId="home" />
      </section>
    </main>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  return starts;
}
const box = () => page.getByRole('dialog', { name: consentBoxName, exact: true });
const rect = (control: Locator) => control.element().getBoundingClientRect();
const tools = () => page.getByRole('navigation', { name: 'Kartans verktyg' });
const tool = (name: string) => tools().getByRole('button', { name, exact: true });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('the consent box opens next to the chosen button, on the side that has room', async () => {
  const starts = await open(1280, 800);
  for (const name of ['Prata med Skyttel', 'Skriv till Skyttel']) {
    await tool(name).click();
    await expect.element(box()).toBeVisible();
    const chosen = rect(tool(name));
    expect(rect(box()).left, name).toBeGreaterThanOrEqual(rect(tools()).right);
    expect(rect(box()).left - chosen.right, name).toBeLessThanOrEqual(32);
    expect(Math.abs(rect(box()).top - chosen.top), name).toBeLessThanOrEqual(1);
    await userEvent.keyboard('{Escape}');
    await expect.element(box()).not.toBeInTheDocument();
    await expect.element(tool(name)).toHaveFocus();
  }

  // The welcome guide stands at the right edge: its buttons get the box on their left side.
  const guide = page
    .getByRole('complementary', { name: 'Kom igång med kartan' })
    .getByRole('button', { name: 'Skriv' });
  await guide.click();
  await expect.element(box()).toBeVisible();
  expect(rect(box()).right).toBeLessThanOrEqual(rect(guide).left);
  expect(rect(guide).left - rect(box()).right).toBeLessThanOrEqual(32);
  expect(rect(box()).bottom).toBeLessThanOrEqual(800);
  expect(rect(box()).top).toBeGreaterThanOrEqual(0);
  await box().getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect.element(guide).toHaveFocus();

  expect(starts).toEqual([]);

  // The voice button from the map starts the conversation with the voice. No panel opens.
  await tool('Prata med Skyttel').click();
  await box().getByRole('button', { name: 'Godkänn och starta', exact: true }).click();
  await expect
    .element(page.getByRole('complementary', { name: 'Kom igång med kartan' }))
    .not.toBeInTheDocument();
  expect(starts).toEqual([{ consent: { textVersion: 2 } }]);
  await expect
    .element(page.getByRole('region', { name: 'Samtal och text', exact: true }))
    .not.toBeInTheDocument();
});

test.each([390, 320])(
  'the consent box opens under the toolbar at the top of a %i px screen',
  async (width) => {
    await open(width, 844);
    await tool('Skriv till Skyttel').click();
    await expect.element(box()).toBeVisible();
    expect(rect(box()).top).toBeGreaterThanOrEqual(rect(tools()).bottom);
    expect(rect(box()).top - rect(tools()).bottom).toBeLessThanOrEqual(32);
    expect(rect(box()).left).toBeGreaterThanOrEqual(0);
    expect(rect(box()).right).toBeLessThanOrEqual(width);
    expect(rect(box()).bottom).toBeLessThanOrEqual(844);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
  },
);

test('the consent box follows the toolbar when the window becomes narrow', async () => {
  await open(1280, 800);
  await tool('Skriv till Skyttel').click();
  await expect.element(box()).toBeVisible();
  expect(rect(box()).left).toBeGreaterThanOrEqual(rect(tools()).right);
  // A narrower window with the toolbar still to the left keeps the box on the screen.
  await box().getByRole('button', { name: 'Avbryt', exact: true }).click();
  const guide = page
    .getByRole('complementary', { name: 'Kom igång med kartan' })
    .getByRole('button', { name: 'Skriv' });
  await guide.click();
  await expect.element(box()).toBeVisible();
  await page.viewport(800, 600);
  await expect.poll(() => rect(box()).right).toBeLessThanOrEqual(800);
  expect(rect(box()).left).toBeGreaterThanOrEqual(0);
  expect(rect(box()).bottom).toBeLessThanOrEqual(600);
  await page.viewport(390, 844);
  await expect.poll(() => rect(box()).right).toBeLessThanOrEqual(390);
  expect(rect(box()).top).toBeGreaterThanOrEqual(rect(tools()).bottom);
  expect(rect(box()).top - rect(tools()).bottom).toBeLessThanOrEqual(32);
});
