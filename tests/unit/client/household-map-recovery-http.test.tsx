import { type APIRequestContext, request } from '@playwright/test';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { FormLeaveProvider } from '../../../src/client/FormLeave.js';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { createHousehold, signIn } from '../../support/client.js';
import { prepareRelationshipSpecialConflict } from '../../support/conflict-special.js';
import { createInstallation } from '../../support/installation.js';
import {
  openConflictReview,
  openDraftReview,
  openObjectRelationships,
  renderHouseholdWork,
  saveHouseholdDraft,
} from '../../support/native-household-unit.js';
import { propertyInput } from './property-controls.js';

let installation: Awaited<ReturnType<typeof createInstallation>> | undefined;
const clients: APIRequestContext[] = [];
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
  await installation?.close();
  installation = undefined;
});

async function client() {
  const value = await request.newContext();
  clients.push(value);
  return value;
}

for (const kind of ['missing-endpoint', 'edited-missing-endpoint'] as const) {
  test(`the workspace corrects a retained ${kind === 'missing-endpoint' ? 'new' : 'edited'} relationship without restoring its removed endpoint or saving unrelated work implicitly`, async () => {
    const first = await client();
    const second = await client();
    const app = await prepareRelationshipSpecialConflict(first, second, kind);
    installation = app.installation;
    const householdId = app.path.split('/households/')[1].split('/')[0];
    vi.stubGlobal('fetch', authenticatedHttpFetch(first, installation.origin));
    renderHouseholdWork(householdId);
    const before = await app.read();
    const history = await (await first.get(`${app.path}/history`)).json();
    let conflict = await openConflictReview();
    expect(conflict.getByRole('region', { name: 'Ditt förslag' }).textContent).toContain(
      'Osäkert uppgivet',
    );
    await userEvent.click(conflict.getByRole('button', { name: 'Rätta ändpunkter' }));
    let editor = within(await screen.findByRole('dialog', { name: 'Rätta blockerat samband' }));
    expect(editor.getByRole('heading', { name: 'Rätta blockerat samband' })).toBe(
      document.activeElement,
    );
    expect(await propertyInput(editor, 'Uppgiftens säkerhet')).toHaveProperty(
      'value',
      'Osäkert uppgivet',
    );
    expect(
      within(editor.getByLabelText('Till objekt')).queryByRole('option', { name: /Molnmusik/ }),
    ).toBeNull();
    await userEvent.click(editor.getByRole('button', { name: 'Stäng dialogen' }));
    conflict = within(await screen.findByRole('dialog', { name: 'Granska konflikter' }));
    expect(await app.read()).toEqual(before);
    await userEvent.click(conflict.getByRole('button', { name: 'Rätta ändpunkter' }));
    editor = within(await screen.findByRole('dialog', { name: 'Rätta blockerat samband' }));
    await userEvent.selectOptions(editor.getByLabelText('Till objekt'), 'lo');
    await userEvent.click(editor.getByRole('button', { name: 'Lägg i utkastet' }));
    await editor.findByText('Sambandet lades i ditt utkast. Du kan hantera nästa samband.');
    await userEvent.click(editor.getByRole('button', { name: 'Stäng dialogen' }));
    conflict = within(await screen.findByRole('dialog', { name: 'Granska konflikter' }));
    await userEvent.click(conflict.getByRole('button', { name: 'Stäng konfliktdialogen' }));
    const corrected = await app.read();
    expect(corrected.objects).toEqual(before.objects);
    expect(corrected.relationships).toEqual(before.relationships);
    expect(corrected.draft.changes).toEqual(before.draft.changes);
    expect(corrected.draft.relationships).toEqual([
      expect.objectContaining({
        id: 'mine',
        after: {
          typeId: before.relationshipTypes[0].id,
          sourceId: 'lo',
          targetId: 'lo',
          properties: [
            {
              id: 'certainty',
              label: 'Uppgiftens säkerhet',
              kind: 'text',
              value: 'Osäkert uppgivet',
            },
          ],
        },
      }),
    ]);
    expect(await (await first.get(`${app.path}/history`)).json()).toEqual(history);
    const draft = await openDraftReview();
    expect(draft.getByRole('button', { name: 'Visa förslaget: Oberoende förslag' })).toBeTruthy();
    expect(draft.queryByText('Blockerat samband: ett objekt saknas.')).toBeNull();
    await saveHouseholdDraft();
    const saved = await app.read();
    expect(saved.objects.map(({ name }) => name).sort()).toEqual([
      'Lo Exempel',
      'Oberoende förslag',
    ]);
    expect(saved.relationships).toEqual([
      expect.objectContaining({
        id: 'mine',
        sourceId: 'lo',
        targetId: 'lo',
        properties: corrected.draft.relationships?.[0].after?.properties,
      }),
    ]);
    expect(saved.draft.relationships ?? []).toEqual([]);
    expect(saved.draft.changes).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Stäng textvyn' }));
    const reader = await openObjectRelationships('Lo Exempel');
    expect(reader.getByText('Osäkert uppgivet (Text)', { exact: true })).toBeTruthy();
    expect(reader.queryByText('Molnmusik')).toBeNull();
  }, 30_000);
}

test('an inactive household workspace recovers an unavailable initial read without discarding private work', async () => {
  installation = await createInstallation();
  const first = await client();
  await signIn(first, installation.origin);
  const { household } = await (await createHousehold(first, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}/map`;
  const initial: MapState = await (await first.get(path)).json();
  expect(
    (
      await first.post(`${path}/draft`, {
        headers: { origin: installation.origin },
        data: {
          version: initial.draft.version,
          contentVersion: initial.contentVersion,
          id: 'retained',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Bevarad anteckning' },
        },
      })
    ).status(),
  ).toBe(200);
  const before = await (await first.get(path)).json();
  const actualFetch = authenticatedHttpFetch(first, installation.origin);
  let disconnected = true;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (
      disconnected &&
      new URL(String(input), installation?.origin).pathname === new URL(path).pathname
    )
      throw new TypeError('Controlled unavailable initial HTTP read');
    return actualFetch(input, init);
  });
  const view = render(
    <FormLeaveProvider>
      <HouseholdMap householdId={household.id} active={false} />
    </FormLeaveProvider>,
  );
  const refresh = await screen.findByRole('button', { name: 'Hämta aktuellt underlag' });
  expect(screen.getByRole('alert').textContent).toBe(
    'Kartan och sparförsöken kunde inte hämtas. Försök igen.',
  );
  expect(await (await first.get(path)).json()).toEqual(before);
  disconnected = false;
  await userEvent.click(refresh);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  view.rerender(
    <FormLeaveProvider>
      <HouseholdMap householdId={household.id} active />
    </FormLeaveProvider>,
  );
  const draft = await openDraftReview();
  expect(draft.getByRole('button', { name: 'Visa förslaget: Bevarad anteckning' })).toBeTruthy();
  expect(await (await first.get(path)).json()).toEqual(before);
}, 30_000);
