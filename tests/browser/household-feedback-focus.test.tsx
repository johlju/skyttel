import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import { defaultConversationPreferences } from '../../src/shared/conversation-preferences.js';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The browser renders the real map and panels against the public HTTP boundary.
 * Persistence and authorization of these same forms have real-SQLite unit cases. */
async function open() {
  await page.viewport(1440, 900);
  const lo = {
    id: 'lo',
    householdId: 'home',
    revision: 1,
    typeId: 'person',
    name: 'Lo Exempel',
    description: 'Sparad beskrivning',
  };
  const person = {
    id: 'person',
    householdId: 'home',
    revision: 1,
    name: 'Person',
    description: '',
  };
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [person],
    relationshipTypes: [],
    relationships: [],
    objects: [lo],
    draft: {
      version: 1,
      changes: [
        {
          id: 'lo',
          before: lo,
          after: { ...lo, description: 'Privat förslag' },
          type: person,
          beforeType: person,
        },
      ],
    },
  };
  const writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversation-preferences'))
      return Response.json(defaultConversationPreferences);
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.endsWith('/text-assistant')) return Response.json({ available: false });
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: 1,
        positions: [],
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.includes('/map?')) return Response.json(state);
    if (url.endsWith('/draft') && init?.method === 'POST') {
      writes.push({ path: url, body: JSON.parse(String(init.body)) });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  render(
    <main>
      <HouseholdMap householdId="home" />
    </main>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stäng vägledningen', exact: true }).click();
  return { writes };
}

const feedback = () => page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });

test('closed draft feedback opens its review and resumes the retained object field without changing saved or private data', async () => {
  const home = await open();
  await feedback().getByRole('button', { name: 'Visa hela utkastet', exact: true }).click();
  await expect
    .element(page.getByRole('region', { name: 'Hela mitt utkast', exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole('heading', { name: 'Hela mitt utkast', exact: true }))
    .toHaveFocus();
  await page.getByRole('button', { name: 'Uppgifter för Lo Exempel', exact: true }).click();
  const object = page.getByRole('region', { name: 'Lo Exempel', exact: true });
  await object.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
  const field = object.getByLabelText('Beskrivning', { exact: true });
  await field.fill('Fortfarande oskickat');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await expect.element(object).not.toBeInTheDocument();
  await feedback().getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
  await expect.element(object).toBeVisible();
  await expect.element(field).toHaveValue('Fortfarande oskickat');
  await expect.element(field).toHaveFocus();
  expect(home.writes).toEqual([]);
  const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
  await expect
    .element(review.getByText('Beskrivning: Privat förslag', { exact: true }))
    .toBeVisible();
  await expect
    .element(review.getByText('Beskrivning: Sparad beskrivning', { exact: true }))
    .toBeVisible();
});
