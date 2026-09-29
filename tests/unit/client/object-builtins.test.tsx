import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
const read = async (): Promise<MapState> => (await client.request(path)).json();
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  householdId = (await (await client.json('/api/households', { name: 'Linden' })).json()).household
    .id;
  path = `/api/households/${householdId}/map`;
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
    client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fixture.close();
});

test('canonical properties can be added, ordered, hidden and shown in a private type definition', async () => {
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lista' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Ny objekttyp' }));
  await userEvent.type(screen.getByLabelText('Typens namn'), 'Husavtal');
  await userEvent.selectOptions(
    screen.getByLabelText('Lägg till gemensam egenskap'),
    'description',
  );
  await userEvent.selectOptions(screen.getByLabelText('Lägg till gemensam egenskap'), 'debt');
  const debt = within(
    screen.getByRole('group', { name: 'Gemensam egenskap: Senast uppgiven skuld' }),
  );
  expect(debt.queryByLabelText('Värdeslag')).toBeNull();
  await userEvent.clear(debt.getByLabelText('Fältets namn'));
  await userEvent.type(debt.getByLabelText('Fältets namn'), 'Återstående skuld');
  await userEvent.click(
    screen.getByRole('button', { name: 'Flytta fältet Återstående skuld upp' }),
  );
  expect(document.activeElement).toBe(debt.getByLabelText('Fältets namn'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Dölj Återstående skuld, behåll värden' }),
  );
  expect(document.activeElement).toBe(debt.getByLabelText('Visa i avsnitt'));
  await userEvent.selectOptions(debt.getByLabelText('Visa i avsnitt'), 'custom-fields');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  const state = await read();
  expect(state.types.some((type) => type.name === 'Husavtal')).toBe(false);
  expect(state.draft.objectTypes?.[0].after).toMatchObject({
    builtins: [
      { key: 'description', name: 'Beskrivning', sectionId: 'custom-fields' },
      { key: 'debt', name: 'Återstående skuld', sectionId: 'custom-fields' },
    ],
    propertyOrder: ['builtin:debt', 'builtin:description'],
  });
});

test('section editors keep complete financial facts and shared description through a type change', async () => {
  const definition = {
    name: 'Låneuppgifter',
    description: '',
    sections: [{ id: 'facts', name: 'Avtalets uppgifter' }],
    fields: [
      { id: 'note', name: 'Egen anteckning', description: '', kind: 'text', sectionId: 'facts' },
    ],
    builtins: [
      { key: 'debt', name: 'Återstående skuld', sectionId: 'facts' },
      { key: 'description', name: 'Avtalets text', sectionId: 'facts' },
      { key: 'price', name: 'Pris', sectionId: '' },
    ],
    propertyOrder: ['builtin:debt', 'field:note', 'builtin:description', 'builtin:price'],
  };
  expect(
    (
      await client.json(`${path}/object-type`, {
        version: 0,
        id: 'loan',
        baseRevision: null,
        value: definition,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await client.json(`${path}/object-type`, {
        version: 1,
        id: 'other',
        baseRevision: null,
        value: {
          name: 'Annan typ',
          description: '',
          fields: [],
          sections: [],
          builtins: [],
          propertyOrder: [],
        },
      })
    ).status,
  ).toBe(200);
  const financialFacts = {
    debt: { knowledge: 'uncertain', value: '12 300', reportedOn: '2026-09-01' },
    price: { knowledge: 'unknown' },
    currency: { knowledge: 'none' },
    startDate: { knowledge: 'known', value: '2026-08-01' },
    usedCredit: { knowledge: 'none', reportedOn: '2026-09-02' },
  };
  expect(
    (
      await client.json(`${path}/draft`, {
        version: 2,
        id: 'contract',
        baseRevision: null,
        value: {
          name: 'Mitt lån',
          typeId: 'loan',
          description: 'Gemensam avtalstext',
          financialFacts,
          customValues: { note: 'Tidigare värde' },
        },
      })
    ).status,
  ).toBe(200);
  expect((await client.json(`${path}/save`, { version: 3, operationId: 'original' })).status).toBe(
    200,
  );
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lista' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mitt lån' }));
  const details = within(screen.getByRole('region', { name: 'Mitt lån' }));
  expect(
    details.getByText(
      'Återstående skuld: 12 300 (Osäkert uppgivet) — datum för uppgiften: 2026-09-01',
    ),
  ).toBeTruthy();
  expect(
    within(details.getByRole('region', { name: 'Uppgifter utanför typens avsnitt' })).getByText(
      'Pris: Okänt',
    ),
  ).toBeTruthy();
  await userEvent.click(details.getByRole('button', { name: 'Redigera valt objekt' }));
  const editor = within(screen.getByRole('group', { name: 'Objektets detaljer' }));
  const section = within(editor.getByRole('group', { name: 'Avtalets uppgifter' }));
  expect(
    (section.getByLabelText('Återstående skuld: uppgiftens säkerhet') as HTMLSelectElement).value,
  ).toBe('uncertain');
  expect(
    (section.getByLabelText('Återstående skuld: datum för uppgiften') as HTMLInputElement).value,
  ).toBe('2026-09-01');
  await userEvent.clear(section.getByLabelText('Återstående skuld', { exact: true }));
  await userEvent.type(section.getByLabelText('Återstående skuld', { exact: true }), '12 000');
  await userEvent.selectOptions(editor.getByLabelText('Objekttyp', { exact: true }), 'other');
  expect((editor.getByLabelText('Beskrivning', { exact: true }) as HTMLTextAreaElement).value).toBe(
    'Gemensam avtalstext',
  );
  expect(
    (editor.getByRole('button', { name: 'Lägg i mitt utkast' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await userEvent.click(editor.getByLabelText('Jag har hanterat tidigare fältvärden för typbytet'));
  await userEvent.click(editor.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  const state = await read();
  expect(state.objects[0].financialFacts).toEqual(financialFacts);
  expect(state.draft.changes[0].after).toMatchObject({
    typeId: 'other',
    description: 'Gemensam avtalstext',
    financialFacts: { ...financialFacts, debt: { ...financialFacts.debt, value: '12 000' } },
  });
  expect(state.draft.changes[0].after?.customValues).toBeUndefined();
  const review = within(await screen.findByRole('region', { name: 'Hela mitt utkast' }));
  expect(
    review.getByText(
      'Senast uppgiven skuld: 12 000 (Osäkert uppgivet) — datum för uppgiften: 2026-09-01',
    ),
  ).toBeTruthy();
});

test('legacy custom placement remains visible once while canonical presentation and hidden review coexist', async () => {
  expect(
    (
      await client.json(`${path}/object-type`, {
        version: 0,
        id: 'legacy',
        baseRevision: null,
        value: {
          name: 'Äldre avtal',
          description: '',
          builtins: [],
          fields: [
            { id: 'visible', name: 'Tidigare fält', description: '', kind: 'number' },
            { id: 'hidden', name: 'Dolt fält', description: '', kind: 'boolean', sectionId: '' },
          ],
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await client.json(`${path}/draft`, {
        version: 1,
        id: 'legacy-object',
        baseRevision: null,
        value: {
          typeId: 'legacy',
          name: 'Äldre uppgifter',
          description: 'Gemensam text',
          customValues: { visible: 0, hidden: false },
          financialFacts: { debt: { knowledge: 'unknown', reportedOn: '2026-09-01' } },
        },
      })
    ).status,
  ).toBe(200);
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lista' }));
  const review = within(await screen.findByRole('region', { name: 'Hela mitt utkast' }));
  expect(review.getAllByText('Tidigare fält: 0')).toHaveLength(1);
  expect(
    within(review.getByRole('region', { name: 'Egna fält' })).getByText('Tidigare fält: 0'),
  ).toBeTruthy();
  const hidden = within(review.getByRole('region', { name: 'Dolda fält – bevarade värden' }));
  expect(hidden.queryByText('Tidigare fält: 0')).toBeNull();
  expect(hidden.getByText('Dolt fält: Nej')).toBeTruthy();
  expect(
    review.getByText('Senast uppgiven skuld: Okänt — datum för uppgiften: 2026-09-01'),
  ).toBeTruthy();
  await userEvent.click(review.getByRole('button', { name: 'Spara hela utkastet' }));
  await screen.findByText(/^Sparat:/);
  expect((await read()).types.find(({ id }) => id === 'legacy')).not.toHaveProperty('sections');
  await userEvent.click(screen.getByRole('button', { name: 'Visa historik' }));
  const history = within(await screen.findByRole('region', { name: 'Ändringshistorik' }));
  await history.findByText('Tidigare fält: 0');
  expect(history.getAllByText('Tidigare fält: 0')).toHaveLength(1);
  expect(history.getByText('Dolt fält: Nej')).toBeTruthy();
});

test('explicit custom-only order controls object editing and review without inventing built-in metadata', async () => {
  expect(
    (
      await client.json(`${path}/object-type`, {
        version: 0,
        id: 'ordered',
        baseRevision: null,
        value: {
          name: 'Sorterat avtal',
          description: '',
          fields: [
            { id: 'first', name: 'Första fältet', description: '', kind: 'number' },
            { id: 'second', name: 'Andra fältet', description: '', kind: 'text' },
          ],
          propertyOrder: ['field:second', 'field:first'],
        },
      })
    ).status,
  ).toBe(200);
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lista' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Nytt objekt' }));
  const form = within(screen.getByRole('group', { name: 'Objektets detaljer' }));
  await userEvent.selectOptions(form.getByLabelText('Objekttyp', { exact: true }), 'ordered');
  await userEvent.type(form.getByLabelText('Objektets namn'), 'Sorterade uppgifter');
  const fields = form.getByRole('group', { name: 'Egna fält' });
  expect([...fields.querySelectorAll('label')].map((label) => label.textContent)).toEqual([
    'Andra fältet',
    'Första fältet',
  ]);
  await userEvent.type(form.getByLabelText('Andra fältet', { exact: true }), 'Två');
  await userEvent.type(form.getByLabelText('Första fältet', { exact: true }), '0');
  await userEvent.type(form.getByLabelText('Beskrivning', { exact: true }), 'Gemensam text');
  await userEvent.click(form.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  const review = within(await screen.findByRole('region', { name: 'Hela mitt utkast' }));
  expect(
    [...review.getByRole('region', { name: 'Egna fält' }).querySelectorAll('p')].map(
      (element) => element.textContent,
    ),
  ).toEqual(['Andra fältet: Två', 'Första fältet: 0']);
  expect(review.getByText('Beskrivning: Gemensam text')).toBeTruthy();
  await userEvent.click(review.getByRole('button', { name: 'Spara hela utkastet' }));
  await screen.findByText(/^Sparat:/);
  const state = await read();
  expect(state.types.find(({ id }) => id === 'ordered')).not.toHaveProperty('builtins');
  expect(state.types.find(({ id }) => id === 'ordered')?.propertyOrder).toEqual([
    'field:second',
    'field:first',
  ]);
  expect(state.objects[0]).toMatchObject({
    description: 'Gemensam text',
    customValues: { first: 0, second: 'Två' },
  });
});
