import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { FormLeaveProvider } from '../../src/client/FormLeave.js';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import { openConversationText } from '../support/conversation-browser.js';
import { openNewObject, openTable } from '../support/workspace-browser.js';
import '../../src/client/styles.css';
import { defaultConversationPreferences } from '../../src/shared/conversation-preferences.js';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The browser renders the real map and native forms against the public HTTP boundary.
 * Persistence and authorization of these same forms have real-SQLite unit cases. */
async function open(withDraft = true) {
  await page.viewport(1440, 900);
  const lo: MapState['objects'][number] = {
    id: 'lo',
    householdId: 'home',
    revision: 1,
    typeId: 'person',
    name: 'Lo Exempel',

    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Sparad beskrivning' },
    ],
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
      version: withDraft ? 1 : 0,
      changes: withDraft
        ? [
            {
              id: 'lo',
              before: lo,
              after: {
                ...lo,
                properties: [
                  {
                    id: 'description',
                    label: 'Beskrivning',
                    kind: 'text',
                    value: 'Privat förslag',
                  },
                ],
              },
              type: person,
              beforeType: person,
            },
          ]
        : [],
    },
  };
  const writes: { path: string; body: unknown }[] = [];
  let failProposal = false;
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
    if (url.includes('/map?') || url.endsWith('/map')) return Response.json(state);
    if (url.endsWith('/object-form') && init?.method === 'POST') {
      writes.push({ path: url, body: JSON.parse(String(init.body)) });
      if (failProposal) throw new Error('Synthetic proposal transport failure');
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  render(
    <FormLeaveProvider>
      <main>
        <HouseholdMap householdId="home" />
      </main>
    </FormLeaveProvider>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  return {
    writes,
    failProposal: () => {
      failProposal = true;
    },
  };
}

test('leaving an edited object protects unsent text and discards only that text, keeping saved and draft values', async () => {
  const home = await open();
  await openTable();
  await page.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true });
  await form.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
  const field = form
    .getByRole('group', { name: 'Egenskap 1', exact: true })
    .getByLabelText('Värde', { exact: true });
  await field.fill('Fortfarande oskickat');
  await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
  await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
  await expect.element(field).toHaveValue('Fortfarande oskickat');
  await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
  await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
  await expect.element(form).not.toBeInTheDocument();
  expect(home.writes).toEqual([]);
  await page.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }).click();
  await form.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
  await expect
    .element(
      form
        .getByRole('group', { name: 'Egenskap 1', exact: true })
        .getByLabelText('Värde', { exact: true }),
    )
    .toHaveValue('Privat förslag');
  await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
  await openConversationText();
  const draftEntry = page.getByRole('button', { name: /^Visa utkastet \(\d+\)$/ });
  if (draftEntry.query()) await draftEntry.click();
  await page.getByRole('button', { name: 'Visa förslaget: Lo Exempel', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Lo Exempel', exact: true });
  await expect.element(review.getByText('Privat förslag (Text)', { exact: true })).toBeVisible();
  await expect
    .element(review.getByText('Sparad beskrivning (Text)', { exact: true }))
    .toBeVisible();
});

test('unknown complete object staging requires checking before retry and retains all form text without another send', async () => {
  const home = await open(false);
  await openNewObject();
  const name = page.getByLabelText('Namn', { exact: true });
  await name.fill('Privat oskickat objekt');
  home.failProposal();
  const submit = page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true });
  await submit.click();
  const check = page.getByRole('button', {
    name: 'Kontrollera om ändringen lades i utkastet',
    exact: true,
  });
  await expect.element(check).toBeVisible();
  await expect.element(submit).toBeDisabled();
  await check.click();
  await expect.element(check).not.toBeInTheDocument();
  await expect.element(submit).not.toBeDisabled();
  await expect.element(name).toHaveValue('Privat oskickat objekt');
  expect(home.writes).toHaveLength(1);
  expect(home.writes[0].body).toMatchObject({
    version: 0,
    contentVersion: 1,
    value: { name: 'Privat oskickat objekt' },
  });
  await page.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
  await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
  await expect.element(name).not.toBeInTheDocument();
  await openNewObject();
  await expect.element(name).toHaveValue('');
  expect(home.writes).toHaveLength(1);
});
