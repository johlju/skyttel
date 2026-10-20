import { type APIRequestContext, request } from '@playwright/test';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { prepareHouseholdReading } from '../../support/household-reading.js';
import { createInstallation } from '../../support/installation.js';
import {
  editTableObjectForm,
  openNewObjectForm,
  openObjectRelationships,
  readTableObject,
  renderHouseholdWork,
} from '../../support/native-household-unit.js';
import { propertyInput } from './property-controls.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  vi.stubGlobal('fetch', authenticatedHttpFetch(client, installation.origin));
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await client?.dispose();
  await installation?.close();
});

async function prepare() {
  const fixture = await prepareHouseholdReading(client, installation.origin, false);
  const state = await fixture.read();
  const householdId = state.objects[0].householdId;
  renderHouseholdWork(householdId);
  return { ...fixture, householdId };
}

async function editStorage() {
  const dialog = await openObjectRelationships('Cykel');
  const link = dialog.getByRole('button', { name: 'Garage' }).closest('li');
  if (!link) throw new Error('Missing public storage relationship');
  await userEvent.click(within(link).getByRole('button', { name: 'Redigera samband' }));
  return dialog;
}

function loseNextFormReply(route: string, delivered = true) {
  const actual = authenticatedHttpFetch(client, installation.origin);
  let attempts = 0;
  let checksFail = false;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith(route) && init?.method === 'POST') {
      attempts++;
      if (attempts === 1) {
        if (delivered) await actual(input, init);
        throw new TypeError('Controlled interruption of the application transport');
      }
    }
    if (checksFail && init?.method !== 'POST' && String(input).includes('/map'))
      throw new TypeError('Controlled unavailable application transport');
    return actual(input, init);
  });
  return {
    attempts: () => attempts,
    failChecks: (value: boolean) => {
      checksFail = value;
    },
  };
}

test('relationship type changes preserve property values and stage the whole replacement', async () => {
  const fixture = await prepare();
  const before = await fixture.read();
  const dialog = await editStorage();
  await userEvent.selectOptions(dialog.getByLabelText('Sambandstyp'), 'uses');
  await userEvent.selectOptions(dialog.getByLabelText('Sambandets status'), 'active');
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  await dialog.findByText('Sambandet lades i ditt utkast. Du kan hantera nästa samband.');
  const after = await fixture.read();
  expect(after.relationships).toEqual(before.relationships);
  expect(after.draft.relationships?.find((change) => change.id === 'bike-garage')?.after).toEqual({
    typeId: 'uses',
    sourceId: 'bike',
    targetId: 'garage',

    lifecycle: 'active',
    properties: before.draft.relationships?.find((change) => change.id === 'bike-garage')?.after
      ?.properties,
  });
  expect(after.draft.changes).toEqual(before.draft.changes);
}, 30_000);

test('new relationship validates all missing endpoints and keeps direction, free properties and lifecycle values', async () => {
  const fixture = await prepare();
  const before = await fixture.read();
  const dialog = await openObjectRelationships('Garage');
  await userEvent.click(dialog.getByRole('button', { name: 'Nytt samband' }));
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  const summary = await dialog.findByRole('alert', { name: 'Formuläret innehåller fel' });
  expect(document.activeElement).toBe(summary);
  await userEvent.click(within(summary).getByRole('link', { name: /^Sambandstyp:/ }));
  expect(document.activeElement).toBe(dialog.getByLabelText('Sambandstyp'));
  await userEvent.selectOptions(dialog.getByLabelText('Sambandstyp'), 'uses');
  await userEvent.selectOptions(dialog.getByLabelText('Till objekt'), 'alex');
  await userEvent.click(dialog.getByRole('button', { name: 'Byt riktning' }));
  await userEvent.selectOptions(await propertyInput(dialog, 'Osäkert uppgivet', 'boolean'), 'true');
  await userEvent.selectOptions(dialog.getByLabelText('Sambandets status'), 'ended');
  await userEvent.type(await propertyInput(dialog, 'Slutdatum', 'date'), '2026-10-01');
  expect(dialog.getByRole('region', { name: 'Sambandet före inskickning' }).textContent).toBe(
    'Alex använder Garage',
  );
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  await dialog.findByText('Sambandet lades i ditt utkast. Du kan hantera nästa samband.');
  const after = await fixture.read();
  const added = after.draft.relationships?.find((change) => change.before === null);
  expect(added?.after).toMatchObject({
    typeId: 'uses',
    sourceId: 'alex',
    targetId: 'garage',
    lifecycle: 'ended',
  });
  expect(added?.after?.properties).toEqual([
    expect.objectContaining({ label: 'Osäkert uppgivet', kind: 'boolean', value: true }),
    expect.objectContaining({ label: 'Slutdatum', kind: 'date', value: '2026-10-01' }),
  ]);
  expect(after.relationships).toEqual(before.relationships);
  expect(after.draft.changes).toEqual(before.draft.changes);
}, 30_000);

test('a lost duplicate reply checks current data and never edits a relationship removed since that reply', async () => {
  const fixture = await prepare();
  const dialog = await openObjectRelationships('Alex');
  await userEvent.click(dialog.getByRole('button', { name: 'Nytt samband' }));
  await userEvent.selectOptions(dialog.getByLabelText('Sambandstyp'), 'uses');
  await userEvent.selectOptions(dialog.getByLabelText('Till objekt'), 'bike');
  const transport = loseNextFormReply('/relationship-form');
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  await dialog.findByText(/Det är oklart om ändringen lades i utkastet/);
  const original = (await fixture.read()).relationships.find((edge) => edge.id === 'alex-bike');
  if (!original) throw new Error('Missing saved duplicate');
  await fixture.post('relationship', {
    id: original.id,
    baseRevision: original.revision,
    value: null,
  });
  const latest = await fixture.read();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await dialog.findByText(
    /Försöket hittade ett befintligt samband, men det har ändrats eller tagits bort/,
  );
  expect(dialog.queryByRole('button', { name: 'Redigera befintligt samband' })).toBeNull();
  expect((dialog.getByLabelText('Till objekt') as HTMLSelectElement).value).toBe('bike');
  expect(await fixture.read()).toEqual(latest);
  expect(transport.attempts()).toBe(1);
}, 30_000);

test('a lost successful relationship reply preserves a newer proposal instead of confirming its older values', async () => {
  const fixture = await prepare();
  const dialog = await editStorage();
  await userEvent.selectOptions(dialog.getByLabelText('Sambandets status'), 'active');
  const transport = loseNextFormReply('/relationship-form');
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  await dialog.findByText(/Det är oklart om ändringen lades i utkastet/);
  const staged = (await fixture.read()).draft.relationships?.find(
    (edge) => edge.id === 'bike-garage',
  );
  if (!staged?.after) throw new Error('Missing actual staged relationship');
  await fixture.post('relationship', {
    id: staged.id,
    baseRevision: staged.before?.revision,
    value: {
      ...staged.after,
      properties: [{ id: 'note', label: 'note', kind: 'text', value: 'Senare oberoende rättelse' }],
    },
  });
  const latest = await fixture.read();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await dialog.findByText(
    /Ändringen lades i utkastet, men det aktuella underlaget har ändrats sedan dess/,
  );
  expect((dialog.getByLabelText('Sambandets status') as HTMLSelectElement).value).toBe('active');
  expect(
    dialog.queryByText('Sambandet lades i ditt utkast. Du kan hantera nästa samband.'),
  ).toBeNull();
  expect(await fixture.read()).toEqual(latest);
  expect(transport.attempts()).toBe(1);
}, 30_000);

test('an undelivered relationship becomes stale after another private edit and keeps its unsent values', async () => {
  const fixture = await prepare();
  const dialog = await editStorage();
  await userEvent.selectOptions(dialog.getByLabelText('Sambandets status'), 'active');
  const transport = loseNextFormReply('/relationship-form', false);
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  await dialog.findByText(/Det är oklart om ändringen lades i utkastet/);
  dialog.getByRole('heading', { name: 'Samband för Cykel' }).focus();
  await userEvent.keyboard('{Escape}');
  await dialog.findByText(
    'Kontrollera om ändringen lades i utkastet innan du lämnar formuläret. Alla uppgifter finns kvar.',
  );
  transport.failChecks(true);
  await userEvent.click(
    dialog.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await dialog.findByText(/Utkastet kunde inte kontrolleras/);
  transport.failChecks(false);
  await fixture.post('draft', {
    id: 'later',
    baseRevision: null,
    value: { name: 'Senare oberoende förslag', typeId: 'read-type' },
  });
  const latest = await fixture.read();
  await userEvent.click(
    dialog.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await dialog.findByText(/Kontrollen saknar en bevarad bekräftelse och utkastet har ändrats/);
  expect(
    (dialog.getByRole('button', { name: 'Lägg i utkastet' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((dialog.getByLabelText('Sambandets status') as HTMLSelectElement).value).toBe('active');
  expect(await fixture.read()).toEqual(latest);
  expect(transport.attempts()).toBe(1);
}, 30_000);

test('an undelivered relationship permits a single retry only after checking the unchanged draft', async () => {
  const fixture = await prepare();
  const original = await fixture.read();
  const dialog = await editStorage();
  await userEvent.selectOptions(dialog.getByLabelText('Sambandets status'), 'active');
  const transport = loseNextFormReply('/relationship-form', false);
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  await dialog.findByText(/Det är oklart om ändringen lades i utkastet/);
  expect(await fixture.read()).toEqual(original);
  await userEvent.click(
    dialog.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await dialog.findByText(/Kontrollen visar att ändringen inte lades i utkastet/);
  expect(await fixture.read()).toEqual(original);
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  await dialog.findByText('Sambandet lades i ditt utkast. Du kan hantera nästa samband.');
  const staged = await fixture.read();
  expect(staged.draft.version).toBe(original.draft.version + 1);
  expect(staged.relationships).toEqual(original.relationships);
  expect(staged.draft.relationships?.filter((change) => change.id === 'bike-garage')).toHaveLength(
    1,
  );
  expect(
    staged.draft.relationships?.find((change) => change.id === 'bike-garage')?.after?.lifecycle,
  ).toBe('active');
  expect(transport.attempts()).toBe(2);
}, 30_000);

for (const changed of [false, true]) {
  test(`an undelivered object checks real data after transport recovery with another private edit ${changed}`, async () => {
    const fixture = await prepare();
    const form = await openNewObjectForm();
    await userEvent.type(form.getByLabelText('Namn'), 'Mitt oskickade objekt');
    await userEvent.type(await propertyInput(form, 'Beskrivning'), 'Hela formuläret finns kvar.');
    const transport = loseNextFormReply('/object-form', false);
    await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
    await form.findByText(/Det är oklart om ändringen lades i utkastet/);
    transport.failChecks(true);
    await userEvent.click(
      form.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
    );
    await form.findByText(/Utkastet kunde inte kontrolleras/);
    transport.failChecks(false);
    if (changed)
      await fixture.post('draft', {
        id: 'later',
        baseRevision: null,
        value: { name: 'Senare oberoende förslag', typeId: 'read-type' },
      });
    const latest = await fixture.read();
    await userEvent.click(
      form.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
    );
    await form.findByText(
      changed
        ? /Utkastet har ändrats och utfallet kan inte bekräftas/
        : /Kontrollen visar att ändringen inte lades i utkastet/,
    );
    expect(((await propertyInput(form, 'Beskrivning')) as HTMLTextAreaElement).value).toBe(
      'Hela formuläret finns kvar.',
    );
    expect(await fixture.read()).toEqual(latest);
    if (!changed) {
      await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nytt objekt' })).toBeNull());
      expect(
        (await fixture.read()).draft.changes.filter(
          (change) => change.after?.name === 'Mitt oskickade objekt',
        ),
      ).toHaveLength(1);
    } else
      expect(
        (form.getByRole('button', { name: 'Lägg i utkastet och stäng' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
  }, 30_000);
}

test('an unchanged saved object opens its relationships without creating a proposal and an unsent relationship can be discarded', async () => {
  const fixture = await prepare();
  const before = await fixture.read();
  const form = await editTableObjectForm('Alex');
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och öppna samband' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Samband för Alex' }));
  expect(await fixture.read()).toEqual(before);
  await userEvent.click(dialog.getByRole('button', { name: 'Nytt samband' }));
  await userEvent.type(dialog.getByLabelText('Sök det andra objektet'), 'Garage');
  await userEvent.click(dialog.getByRole('button', { name: 'Avbryt redigeringen' }));
  const loss = within(await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' }));
  await userEvent.click(loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  expect(dialog.queryByLabelText('Sök det andra objektet')).toBeNull();
  expect(await fixture.read()).toEqual(before);
}, 30_000);

test('a staged profile image transport error shows its usable icon fallback and preserves the object', async () => {
  const fixture = await prepareHouseholdReading(client, installation.origin, false);
  const state = await fixture.read();
  const bike = state.objects.find((object) => object.id === 'bike');
  if (!bike) throw new Error('Missing saved bicycle');
  const response = await client.post(`${fixture.path.replace('/map', '')}/profile-images/bike`, {
    headers: {
      origin: installation.origin,
      'Content-Type': 'image/png',
      'X-Skyttel-Draft-Version': String(state.draft.version),
      'X-Skyttel-Content-Version': String(state.contentVersion),
      'X-Skyttel-Object-Revision': String(bike.revision),
    },
    data: await sharp({ create: { width: 2, height: 2, channels: 3, background: '#779933' } })
      .png()
      .toBuffer(),
  });
  expect(response.status()).toBe(200);
  const before = await fixture.read();
  renderHouseholdWork(bike.householdId);
  const dialog = await readTableObject('Cykel');
  const image = dialog.getByRole('img', { name: 'Profilbild för Cykel' });
  // The DOM error is the browser's external image transport event; application
  // responses and the persisted image still come from the actual HTTP server.
  fireEvent.error(image);
  expect(dialog.getByText('Profilbilden kunde inte hämtas. Hämta aktuellt underlag.')).toBeTruthy();
  expect(dialog.getByText('Ikon: Cykel')).toBeTruthy();
  expect(dialog.queryByRole('img', { name: 'Profilbild för Cykel' })).toBeNull();
  expect(await fixture.read()).toEqual(before);
}, 30_000);

test('ordinary properties can be emptied or removed without discarding other saved values', async () => {
  const fixture = await prepareHouseholdReading(client, installation.origin, false);
  const before = await fixture.read();
  const bike = before.objects.find((object) => object.id === 'bike');
  if (!bike) throw new Error('Missing saved bicycle');
  renderHouseholdWork(bike.householdId);
  const form = await editTableObjectForm('Cykel');
  const input = await propertyInput(form, 'Dold egen uppgift');
  const row = input.closest('fieldset');
  if (!row) throw new Error('Missing property row');
  await userEvent.click(within(row).getByRole('button', { name: 'Töm värdet' }));
  await userEvent.click(form.getByRole('button', { name: 'Fria egenskaper' }));
  expect(form.getByRole('button', { name: 'Fria egenskaper' }).getAttribute('aria-expanded')).toBe(
    'false',
  );
  await userEvent.selectOptions(form.getByLabelText('Identitet'), 'unresolved');
  await userEvent.selectOptions(form.getByLabelText('Identitet'), 'identified');
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Redigera Cykel' })).toBeNull());
  const after = await fixture.read();
  expect(after.objects).toEqual(before.objects);
  expect(after.draft.changes.find((change) => change.id === bike.id)?.after?.properties).toEqual(
    before.draft.changes
      .find((change) => change.id === bike.id)
      ?.after?.properties?.map((property) =>
        property.label === 'Dold egen uppgift'
          ? { id: property.id, label: property.label, kind: property.kind }
          : property,
      ),
  );
}, 30_000);

test('relationship removal with a lost reply checks the same attempt after the removal is already saved', async () => {
  const fixture = await prepare();
  const original = await fixture.read();
  const dialog = await editStorage();
  const transport = loseNextFormReply('/relationship-form');
  await userEvent.click(dialog.getByRole('button', { name: 'Föreslå borttagning' }));
  await dialog.findByText(/Det är oklart om ändringen lades i utkastet/);
  await fixture.post('save', { operationId: 'completed-removal-save' });
  const saved = await fixture.read();
  expect(saved.relationships.map((edge) => edge.id).sort()).toEqual([
    'alex-bike',
    'bike-none',
    'bike-unknown',
  ]);
  expect(saved.draft.relationships ?? []).toEqual([]);
  await userEvent.click(
    dialog.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await dialog.findByText('Föreslagen borttagning lades i ditt utkast.');
  expect(transport.attempts()).toBe(1);
  expect(await fixture.read()).toEqual(saved);
  const history = await (await client.get(`${fixture.path}/history`)).json();
  expect(history.history).toHaveLength(2);
  expect(history.history[0].relationships).toHaveLength(1);
  expect(history.history[0].relationships[0].before).toEqual(
    original.relationships.find((edge) => edge.id === 'bike-garage'),
  );
  expect(history.history[0].relationships[0].after).toBeNull();
}, 30_000);

test('indistinguishable object names in a relationship selector include identity and retain the selected target while searching', async () => {
  const fixture = await prepareHouseholdReading(client, installation.origin, false);
  for (const id of ['same-one', 'same-two'])
    await fixture.post('draft', {
      id,
      baseRevision: null,
      value: { name: 'Samma namn', typeId: 'read-type' },
    });
  const before = await fixture.read();
  renderHouseholdWork(before.objects[0].householdId);
  const dialog = await openObjectRelationships('Alex');
  await userEvent.click(dialog.getByRole('button', { name: 'Nytt samband' }));
  const target = dialog.getByLabelText('Till objekt') as HTMLSelectElement;
  expect(
    [...target.options]
      .filter((option) => option.text.startsWith('Samma namn'))
      .map((option) => option.text),
  ).toEqual(['Samma namn · Läsobjekt [same-one]', 'Samma namn · Läsobjekt [same-two]']);
  await userEvent.selectOptions(target, 'same-one');
  await userEvent.type(dialog.getByLabelText('Sök det andra objektet'), 'Garage');
  expect([...target.options].map((option) => option.value).sort()).toEqual([
    '',
    'garage',
    'same-one',
  ]);
  expect(target.value).toBe('same-one');
  expect(await fixture.read()).toEqual(before);
}, 30_000);
