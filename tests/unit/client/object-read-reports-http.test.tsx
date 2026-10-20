import { type APIRequestContext, request } from '@playwright/test';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { SaveReceipt } from '../../../src/shared/map.js';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { prepareHouseholdReading } from '../../support/household-reading.js';
import { createInstallation } from '../../support/installation.js';
import {
  editTableObjectForm,
  openObjectRelationships,
  readTableObject,
  renderHouseholdWork,
  saveHouseholdDraft,
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

async function prepareFullReading(fillers = false) {
  const fixture = await prepareHouseholdReading(client, installation.origin, fillers);
  const state = await fixture.read();
  const type = state.types.find((value) => value.id === 'read-type');
  const bike = state.objects.find((value) => value.id === 'bike');
  if (!type || !bike) throw new Error('Missing actual reading fixture');
  await fixture.post('object-type', {
    id: type.id,
    baseRevision: type.revision,
    value: {
      ...type,
    },
  });
  const value = {
    ...bike,

    lifecycle: 'active' as const,

    properties: [
      {
        id: 'description',
        label: 'Beskrivning',
        kind: 'text',
        value: 'Hela cykelbeskrivningen med märkning, skick och förvaring. '.repeat(12),
      },
      { id: 'hidden', label: 'Dold egen uppgift', kind: 'text', value: 'Sparad dold märkning' },
      { id: 'zero', label: 'Dolt antal', kind: 'number', value: 0 },
      { id: 'false', label: 'Dolt svar', kind: 'boolean', value: false },
      { id: 'missing', label: 'Obesvarad uppgift', kind: 'text' },
      { id: 'date', label: 'Slutdatum', kind: 'date', value: '2024-12-31' },
    ],
  };
  await fixture.post('draft', { id: bike.id, baseRevision: bike.revision, value });
  const imageState = await fixture.read();
  const image = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#337799' } })
    .png()
    .toBuffer();
  const response = await client.post(
    `${fixture.path.replace('/map', '')}/profile-images/${bike.id}`,
    {
      headers: {
        origin: installation.origin,
        'Content-Type': 'image/png',
        'X-Skyttel-Draft-Version': String(imageState.draft.version),
        'X-Skyttel-Content-Version': String(imageState.contentVersion),
        'X-Skyttel-Object-Revision': String(bike.revision),
      },
      data: image,
    },
  );
  expect(response.status(), await response.text()).toBe(200);
  await fixture.post('save', { operationId: 'full-reading-save' });
  const saved = await fixture.read();
  const savedBike = saved.objects.find((object) => object.id === 'bike');
  if (!savedBike) throw new Error('Missing saved bicycle');
  return { ...fixture, bike: savedBike, householdId: savedBike.householdId };
}

function property(dialog: ReturnType<typeof within>, label: string) {
  const term = dialog.getByText(label, { selector: 'dt' });
  return term.parentElement?.querySelector('dd')?.textContent;
}

test('full object reading preserves zero, false, typed empty values, dates and images', async () => {
  const fixture = await prepareFullReading();
  await fixture.post('draft', {
    id: fixture.bike.id,
    baseRevision: fixture.bike.revision,
    value: {
      ...fixture.bike,

      profileImageId: null,
      iconId: 'car',
      identity: 'unspecified',
      lifecycle: 'ended',
      properties: [
        ...(fixture.bike.properties?.filter((property) =>
          ['missing', 'date'].includes(property.id),
        ) ?? []),
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text',
          value: 'Föreslagen fullständig beskrivning av cykeln.',
        },
        {
          id: 'hidden',
          label: 'Dold egen uppgift',
          kind: 'text',
          value: 'Föreslagen dold märkning',
        },
        { id: 'zero', label: 'Dolt antal', kind: 'number', value: 0 },
        { id: 'false', label: 'Dolt svar', kind: 'boolean', value: true },
      ],
    },
  });
  const before = await fixture.read();
  renderHouseholdWork(fixture.householdId);
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  const table = within(await screen.findByRole('region', { name: 'Hushållets tabell' }));
  await userEvent.click(table.getByRole('button', { name: 'Filter' }));
  await userEvent.click(
    within(screen.getByRole('dialog', { name: 'Tabellens filter' })).getByLabelText(
      'Ta med upphörda',
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Stäng filter' }));
  const dialog = await readTableObject('Cykel');
  expect(
    dialog.getByText(
      `Sparat: ${String(fixture.bike.properties?.filter((property) => property.kind === 'text').find((property) => property.id === 'description')?.value).trim()} (Text)`,
    ),
  ).toBeTruthy();
  expect(dialog.getByText('Föreslagen fullständig beskrivning av cykeln. (Text)')).toBeTruthy();
  for (const [label, expected] of [
    [
      'Dold egen uppgift',
      'Sparat: Sparad dold märkning (Text)◇ Ditt förslag: Föreslagen dold märkning (Text)',
    ],
    ['Dolt antal', '0 (Tal)'],
    ['Dolt svar', 'Sparat: Nej (Ja/nej)◇ Ditt förslag: Ja (Ja/nej)'],
    ['Obesvarad uppgift', 'Tomt (Text)'],
    ['Slutdatum', '2024-12-31 (Datum)'],
    ['Identitet', 'Sparat: Identifierat objekt◇ Ditt förslag: Ospecificerat objekt'],
    ['Status', 'Sparat: Gäller fortfarande◇ Ditt förslag: Manuellt upphört'],
  ])
    expect(property(dialog, label)).toBe(expected);
  expect(property(dialog, 'Profilbild')).toBe(
    'Sparat: Profilbild finns◇ Ditt förslag: Ej uppgivet',
  );
  expect(dialog.getByRole('img', { name: 'Profilbild för Cykel' }).getAttribute('src')).toBe(
    `/api/households/${fixture.householdId}/profile-images/${fixture.bike.profileImageId}`,
  );
  const image = await client.get(
    `${installation.origin}/api/households/${fixture.householdId}/profile-images/${fixture.bike.profileImageId}`,
  );
  expect(image.status()).toBe(200);
  expect(image.headers()['content-type']).toBe('image/webp');
  await userEvent.click(table.getByRole('button', { name: 'Cykel' }));
  expect(table.queryByRole('region', { name: 'Uppgifter för Cykel' })).toBeNull();
  expect(await fixture.read()).toEqual(before);
}, 30_000);

test('a complete property edit validates a closed section and stages image removal with the whole object', async () => {
  const fixture = await prepareFullReading();
  const before = await fixture.read();
  renderHouseholdWork(fixture.householdId);
  const form = await editTableObjectForm('Cykel');
  await userEvent.type(await propertyInput(form, 'Obesvarad uppgift'), 'Nu finns ett svar.');
  const date = await propertyInput(form, 'Slutdatum', 'date');
  await userEvent.clear(date);
  await userEvent.type(date, 'inte ett datum');
  await userEvent.click(form.getByRole('button', { name: 'Fria egenskaper' }));
  await userEvent.click(form.getByRole('button', { name: 'Livscykel och utseende' }));
  await userEvent.click(form.getByRole('button', { name: 'Ta bort profilbilden ur formuläret' }));
  await userEvent.selectOptions(form.getByLabelText('Objektets status'), 'ended');
  await userEvent.click(form.getByRole('button', { name: 'Typens standardikon' }));
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  const errors = await screen.findByRole('alert', { name: 'Formuläret innehåller fel' });
  expect(document.activeElement).toBe(errors);
  expect(await fixture.read()).toEqual(before);
  await userEvent.click(within(errors).getByRole('link', { name: /^Värde:/ }));
  expect(document.activeElement).toBe(date);
  await userEvent.clear(date);
  await userEvent.type(date, '2026-10-01');
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const proposed = await fixture.read();
  expect(proposed.objects).toEqual(before.objects);
  const change = proposed.draft.changes.find((item) => item.id === fixture.bike.id);
  if (!change?.after) throw new Error('Missing confirmed whole-object proposal');
  expect(change.after).toEqual({
    typeId: 'read-type',
    name: 'Cykel',
    lifecycle: 'ended',
    properties: fixture.bike.properties?.map((property) =>
      property.id === 'missing'
        ? { ...property, value: 'Nu finns ett svar.' }
        : property.id === 'date'
          ? { ...property, value: '2026-10-01' }
          : property,
    ),
  });
  await saveHouseholdDraft();
  const saved = await fixture.read();
  expect(saved.draft.changes).toEqual([]);
  expect(saved.objects.find((object) => object.id === fixture.bike.id)).toEqual({
    ...change.after,
    id: fixture.bike.id,
    householdId: fixture.householdId,
    revision: fixture.bike.revision + 1,
  });
  const history: { history: SaveReceipt[] } = await (
    await client.get(`${fixture.path}/history`)
  ).json();
  expect(history.history).toHaveLength(3);
  expect(history.history[0].changes[0].before).toEqual(fixture.bike);
  expect(history.history[0].changes[0].after?.profileImageId).toBeUndefined();
}, 30_000);

test('reading the real relationship chain and back retains the second page and open table rows', async () => {
  const fixture = await prepareFullReading(true);
  const before = await fixture.read();
  renderHouseholdWork(fixture.householdId);
  await openObjectRelationships('A 1');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng samband' }));
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  for (const name of ['A 1', 'A 2']) await userEvent.click(table.getByRole('button', { name }));
  await userEvent.click(table.getByRole('button', { name: 'Nästa' }));
  for (const name of ['Alex', 'Cykel']) await userEvent.click(table.getByRole('button', { name }));
  const opener = table.getByRole('button', { name: 'Samband för Alex' });
  await userEvent.click(opener);
  let dialog = within(await screen.findByRole('dialog', { name: 'Samband för Alex' }));
  await userEvent.click(dialog.getByRole('button', { name: 'Cykel' }));
  dialog = within(await screen.findByRole('dialog', { name: 'Uppgifter för Cykel' }));
  expect(property(dialog, 'Dolt antal')).toBe('0 (Tal)');
  expect(property(dialog, 'Dolt svar')).toBe('Nej (Ja/nej)');
  await userEvent.click(dialog.getByRole('button', { name: 'Samband för Cykel' }));
  dialog = within(await screen.findByRole('dialog', { name: 'Samband för Cykel' }));
  expect(dialog.getByText('Föreslagen dold sambandsuppgift (Text)')).toBeTruthy();
  expect(dialog.getAllByText('Osäkert uppgivet (Text)').length).toBeGreaterThan(0);
  expect(dialog.getByText('2024-12-31 (Datum)')).toBeTruthy();
  expect(dialog.getAllByText('Uttryckligen inget (Text)').length).toBeGreaterThan(0);
  expect(dialog.getAllByText('Okänt (Text)').length).toBeGreaterThan(0);
  await userEvent.click(dialog.getByRole('button', { name: 'Garage' }));
  dialog = within(await screen.findByRole('dialog', { name: 'Uppgifter för Garage' }));
  expect(property(dialog, 'Identitet')).toBe('Ospecificerat objekt');
  for (const name of ['Samband för Cykel', 'Uppgifter för Cykel', 'Samband för Alex']) {
    await userEvent.click(dialog.getByRole('button', { name: 'Tillbaka' }));
    dialog = within(await screen.findByRole('dialog', { name }));
    expect(document.activeElement).toBe(dialog.getByRole('heading', { name }));
  }
  await userEvent.click(dialog.getByRole('button', { name: 'Stäng samband' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(table.getByText('Sida 2 av 2 · 50 objekt per sida')).toBeTruthy();
  for (const name of ['Alex', 'Cykel'])
    expect(table.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('true');
  await userEvent.click(table.getByRole('button', { name: 'Föregående' }));
  for (const name of ['A 1', 'A 2'])
    expect(table.getByRole('button', { name }).getAttribute('aria-expanded')).toBe('true');
  expect(await fixture.read()).toEqual(before);
}, 30_000);

test('type changes and unsent form guards retain saved data and the already staged proposal', async () => {
  const fixture = await prepareFullReading();
  const alex = (await fixture.read()).objects.find((object) => object.id === 'alex');
  if (!alex) throw new Error('Missing saved Alex');
  await fixture.post('draft', {
    id: alex.id,
    baseRevision: alex.revision,
    value: {
      ...alex,
      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text',
          value: 'Redan lagt förslag om Alex.',
        },
      ],
    },
  });
  const before = await fixture.read();
  const alternative = before.types.find((type) => type.id !== 'read-type');
  if (!alternative) throw new Error('Missing household alternative type');
  renderHouseholdWork(fixture.householdId);
  const form = await editTableObjectForm('Cykel');
  await userEvent.selectOptions(form.getByLabelText('Objekttyp'), alternative.id);
  expect(await propertyInput(form, 'Dolt antal', 'number')).toHaveProperty('value', '0');
  expect(await propertyInput(form, 'Dolt svar', 'boolean')).toHaveProperty('value', 'false');
  await userEvent.clear(await propertyInput(form, 'Beskrivning'));
  await userEvent.type(await propertyInput(form, 'Beskrivning'), 'Oskickad ändring efter typbyte.');
  await userEvent.click(form.getByRole('button', { name: 'Stäng objektdialogen' }));
  let guard = within(await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' }));
  await userEvent.click(guard.getByRole('button', { name: 'Fortsätt redigera' }));
  expect(((await propertyInput(form, 'Beskrivning')) as HTMLTextAreaElement).value).toBe(
    'Oskickad ändring efter typbyte.',
  );
  expect(await fixture.read()).toEqual(before);
  await userEvent.click(form.getByRole('button', { name: 'Stäng objektdialogen' }));
  guard = within(await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' }));
  await userEvent.click(guard.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await fixture.read()).toEqual(before);
}, 30_000);

test('reports show historical types and full saved values then return to table and unsent text', async () => {
  const fixture = await prepareFullReading(true);
  const initial = await fixture.read();
  const type = initial.types.find((value) => value.id === 'read-type');
  if (!type) throw new Error('Missing saved read type');
  await fixture.post('object-type', {
    id: type.id,
    baseRevision: type.revision,
    value: {
      ...type,
      name: 'Ny lästyp',
    },
  });
  await fixture.post('draft', {
    id: 'bike',
    baseRevision: fixture.bike.revision,
    value: {
      ...fixture.bike,
      name: 'Cykel efter ändring',

      lifecycle: 'ended',
      properties: [
        { id: 'hidden', label: 'Dold egen uppgift', kind: 'text', value: 'Ny dold märkning' },
        { id: 'zero', label: 'Ny dolt antal', kind: 'number', value: 1 },
        { id: 'false', label: 'Ny dolt svar', kind: 'boolean', value: true },
      ],
    },
  });
  await fixture.post('save', { operationId: 'renamed-type-save' });
  await fixture.post('draft', {
    id: 'private',
    baseRevision: null,
    value: {
      name: 'Bara i mitt utkast',
      typeId: type.id,

      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text',
          value: 'Detta är ännu inte gemensamt.',
        },
      ],
    },
  });
  const before = await fixture.read();
  const receipts: { history: SaveReceipt[] } = await (
    await client.get(`${fixture.path}/history`)
  ).json();
  expect(receipts.history.map((receipt) => receipt.operationId)).toEqual([
    'renamed-type-save',
    'full-reading-save',
    'read-fixture-save',
  ]);
  renderHouseholdWork(fixture.householdId);
  await openObjectRelationships('A 1');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng samband' }));
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  await userEvent.type(table.getByLabelText('Sök objekt i tabellen'), 'Hela');
  await userEvent.click(table.getByRole('button', { name: 'Namn' }));
  await userEvent.click(table.getByRole('button', { name: 'Nästa' }));
  await userEvent.click(table.getByRole('button', { name: 'A 1' }));
  const focus = table.getByRole('button', { name: 'Samband för A 1' });
  focus.focus();
  const tools = within(screen.getByRole('navigation', { name: 'Kartans verktyg' }));
  await userEvent.click(tools.getByRole('button', { name: /^Skriv till Skyttel/ }));
  await userEvent.type(
    screen.getByLabelText('Meddelande till Skyttel'),
    'Oskickad fråga om cykeln',
  );
  await userEvent.click(tools.getByRole('button', { name: 'Rapporter' }));
  const reports = within(await screen.findByRole('region', { name: 'Rapporter' }));
  expect(reports.getByRole('tab', { name: 'Ändringshistorik' }).getAttribute('aria-selected')).toBe(
    'true',
  );
  await waitFor(() => expect(reports.getAllByRole('article')).toHaveLength(3));
  const articles = reports.getAllByRole('article').map((article) => within(article));
  for (const article of articles)
    await userEvent.click(article.getByText('Visa ändringarna', { selector: 'summary' }));
  expect(articles[0].getByText('Objekttyp: Läsobjekt.')).toBeTruthy();
  expect(articles[0].getByText('Objekttyp: Ny lästyp.')).toBeTruthy();
  expect(articles[0].getByText('Dolt antal: 0 (Tal)')).toBeTruthy();
  expect(articles[0].getByText('Ny dolt antal: 1 (Tal)')).toBeTruthy();
  expect(articles[0].getByText('Dolt svar: Nej (Ja/nej)')).toBeTruthy();
  expect(articles[0].getByText('Ny dolt svar: Ja (Ja/nej)')).toBeTruthy();
  expect(
    articles[1].getByText(
      `Beskrivning: ${String(fixture.bike.properties?.filter((property) => property.kind === 'text').find((property) => property.id === 'description')?.value).trim()} (Text)`,
    ),
  ).toBeTruthy();
  expect(articles[1].getAllByText('Slutdatum: 2024-12-31 (Datum)').length).toBeGreaterThan(0);
  expect(reports.queryByText('Bara i mitt utkast')).toBeNull();
  expect(reports.queryByRole('button', { name: /Ångra/ })).toBeNull();
  const link = articles[1].getByRole('link', { name: 'Länk till sparandet' });
  expect(link.getAttribute('href')).toBe(
    `/households/${fixture.householdId}?report=history&save=full-reading-save&savedBy=${receipts.history[1].userId}`,
  );
  await userEvent.click(link);
  await userEvent.click(reports.getByRole('button', { name: 'Tillbaka till arbetet' }));
  expect((table.getByLabelText('Sök objekt i tabellen') as HTMLInputElement).value).toBe('Hela');
  expect(table.getByRole('columnheader', { name: 'Namn' }).getAttribute('aria-sort')).toBe(
    'descending',
  );
  expect(table.getByText('Sida 2 av 2 · 50 objekt per sida')).toBeTruthy();
  expect(table.getByRole('button', { name: 'A 1' }).getAttribute('aria-expanded')).toBe('true');
  expect((screen.getByLabelText('Meddelande till Skyttel') as HTMLTextAreaElement).value).toBe(
    'Oskickad fråga om cykeln',
  );
  expect(await fixture.read()).toEqual(before);
}, 30_000);

test('reports retain full removed objects, relationships and removed historical type definitions', async () => {
  const fixture = await prepareFullReading();
  await fixture.post('object-type', {
    id: 'retired-object-type',
    baseRevision: null,
    value: {
      name: 'Historisk objekttyp',
      description: 'Typen används bara i detta syntetiska prov.',
    },
  });
  await fixture.post('relationship-type', {
    id: 'retired-relationship-type',
    baseRevision: null,
    value: {
      name: 'Historisk sambandstyp',
      description: 'Den historiska kopplingens definition.',
      forwardLabel: 'hör till',
      reverseLabel: 'har',
    },
  });
  await fixture.post('save', { operationId: 'historical-definitions-save' });
  const current = await fixture.read();
  for (const relationship of current.relationships)
    await fixture.post('relationship', {
      id: relationship.id,
      baseRevision: relationship.revision,
      value: null,
    });
  await fixture.post('draft', {
    id: fixture.bike.id,
    baseRevision: fixture.bike.revision,
    value: null,
  });
  for (const [route, definition] of [
    ['object-type', current.types.find((type) => type.id === 'retired-object-type')],
    [
      'relationship-type',
      current.relationshipTypes.find((type) => type.id === 'retired-relationship-type'),
    ],
  ] as const) {
    if (!definition) throw new Error('Missing saved historical definition');
    await fixture.post(route, {
      id: definition.id,
      baseRevision: definition.revision,
      value: null,
    });
  }
  await fixture.post('save', { operationId: 'historical-removal-save' });
  const before = await fixture.read();
  expect(before.objects.map((object) => object.name).sort()).toEqual(['Alex', 'Garage']);
  expect(before.relationships).toEqual([]);
  renderHouseholdWork(fixture.householdId);
  await userEvent.click(await screen.findByRole('button', { name: 'Rapporter' }));
  const reports = within(await screen.findByRole('region', { name: 'Rapporter' }));
  await waitFor(() => expect(reports.getAllByRole('article')).toHaveLength(4));
  const latest = within(reports.getAllByRole('article')[0]);
  expect(latest.getByText('Borttaget objekt')).toBeTruthy();
  expect(latest.getAllByText('Borttaget samband')).toHaveLength(4);
  expect(latest.getAllByText('Borttagen typdefinition')).toHaveLength(2);
  await userEvent.click(latest.getByText('Visa ändringarna', { selector: 'summary' }));
  expect(latest.getAllByText('Borttagen definition')).toHaveLength(2);
  expect(latest.getAllByText('Borttaget', { exact: true })).toHaveLength(5);
  expect(latest.getByText('Namn: Cykel.')).toBeTruthy();
  expect(latest.getByText('Objekttyp: Läsobjekt.')).toBeTruthy();
  expect(latest.getByText('Dolt antal: 0 (Tal)')).toBeTruthy();
  expect(latest.getByText('Dolt svar: Nej (Ja/nej)')).toBeTruthy();
  expect(latest.getByText('Dold egen uppgift: Sparad dold märkning (Text)')).toBeTruthy();
  expect(latest.getAllByText('Alex → använder → Cykel')).toHaveLength(2);
  expect(latest.getAllByText('Cykel → förvaras i → Garage')).toHaveLength(2);
  expect(
    latest.getByText('Dold sambandsuppgift: Föreslagen dold sambandsuppgift (Text)'),
  ).toBeTruthy();
  expect(latest.getByRole('img', { name: 'Profilbild för Cykel' })).toBeTruthy();
  expect(await fixture.read()).toEqual(before);
}, 30_000);
