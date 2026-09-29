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
async function open() {
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lista' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Ny objekttyp' }));
  await userEvent.type(screen.getByLabelText('Typens namn'), 'Solkraft');
}

test('section and field controls retain focus, descriptions and placement through the actual map draft', async () => {
  await open();
  const editor = within(screen.getByRole('group', { name: 'Objekttypens definition' }));
  const first = editor.getByLabelText('Avsnitt 1');
  await userEvent.clear(first);
  await userEvent.type(first, 'Uppgifter');
  await userEvent.click(editor.getByRole('button', { name: 'Lägg till avsnitt' }));
  expect(document.activeElement).toBe(editor.getByLabelText('Avsnitt 2'));
  await userEvent.type(editor.getByLabelText('Avsnitt 2'), 'Service');
  await userEvent.click(editor.getByRole('button', { name: 'Flytta avsnittet Service upp' }));
  expect((document.activeElement as HTMLInputElement).value).toBe('Service');
  await userEvent.click(editor.getByRole('button', { name: 'Flytta avsnittet Service ned' }));
  for (const name of ['Effekt', 'Anteckning']) {
    await userEvent.click(editor.getByRole('button', { name: 'Lägg till fält' }));
    const groups = editor.getAllByRole('group', { name: /^Eget fält/ });
    const field = within(groups[groups.length - 1]);
    expect(document.activeElement).toBe(field.getByLabelText('Fältets namn'));
    await userEvent.type(field.getByLabelText('Fältets namn'), name);
    await userEvent.type(field.getByLabelText('Fältets beskrivning'), 'kW');
  }
  await userEvent.selectOptions(
    within(editor.getByRole('group', { name: 'Eget fält 1' })).getByLabelText('Värdeslag'),
    'number',
  );
  await userEvent.click(editor.getByRole('button', { name: 'Flytta fältet Anteckning upp' }));
  expect((document.activeElement as HTMLInputElement).value).toBe('Anteckning');
  await userEvent.click(editor.getByRole('button', { name: 'Flytta fältet Anteckning ned' }));
  await userEvent.click(editor.getByRole('button', { name: 'Dölj Effekt, behåll värden' }));
  const power = within(editor.getByRole('group', { name: 'Eget fält 1' }));
  expect(document.activeElement).toBe(power.getByLabelText('Visa i avsnitt'));
  expect((power.getByLabelText('Visa i avsnitt') as HTMLSelectElement).value).toBe('');
  await userEvent.selectOptions(
    power.getByLabelText('Visa i avsnitt'),
    power.getByRole('option', { name: 'Service' }),
  );
  await userEvent.click(editor.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  const state = await read();
  const type = state.draft.objectTypes?.[0].after;
  expect(type?.sections?.map(({ name }) => name)).toEqual(['Uppgifter', 'Service']);
  expect(type?.fields?.map(({ name, description }) => [name, description])).toEqual([
    ['Effekt', 'kW'],
    ['Anteckning', 'kW'],
  ]);
});

test('empty sections and unused fields can be removed while hidden definitions remain reviewable', async () => {
  await open();
  await userEvent.click(
    screen.getByRole('button', { name: 'Ta bort det tomma avsnittet Egna fält' }),
  );
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lägg till avsnitt' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lägg till fält' }));
  await userEvent.type(screen.getByLabelText('Fältets namn'), 'Dolt fält');
  expect((screen.getByLabelText('Visa i avsnitt') as HTMLSelectElement).value).toBe('');
  await userEvent.click(screen.getByRole('button', { name: 'Ta bort fält: Dolt fält' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Lägg till fält' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lägg till fält' }));
  await userEvent.type(screen.getByLabelText('Fältets namn'), 'Bevarat dolt');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  const review = within(screen.getByRole('region', { name: 'Hela mitt utkast' }));
  expect(review.getByText('Avsnitt: Inga')).toBeTruthy();
  expect(review.getByText(/Bevarat dolt: Text.*Dold, behåll värden/)).toBeTruthy();
  expect((await read()).draft.objectTypes?.[0].after).toMatchObject({
    sections: [],
    fields: [{ name: 'Bevarat dolt', sectionId: '' }],
  });
});

test('editing visible values preserves hidden zero and no answers in the same object', async () => {
  await client.json(`${path}/object-type`, {
    version: 0,
    id: 'solar',
    baseRevision: null,
    value: {
      name: 'Solkraft',
      description: '',
      sections: [{ id: 'facts', name: 'Uppgifter' }],
      fields: [
        { id: 'note', name: 'Anteckning', description: '', kind: 'text', sectionId: 'facts' },
        { id: 'power', name: 'Effekt', description: '', kind: 'number', sectionId: '' },
        { id: 'battery', name: 'Batteri', description: '', kind: 'boolean', sectionId: '' },
      ],
    },
  });
  await client.json(`${path}/draft`, {
    version: 1,
    id: 'panels',
    baseRevision: null,
    value: {
      typeId: 'solar',
      name: 'Paneler',
      description: '',
      customValues: { power: 0, battery: false },
    },
  });
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lista' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Paneler' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  expect(screen.queryByLabelText('Effekt', { exact: true })).toBeNull();
  expect(screen.queryByLabelText('Batteri', { exact: true })).toBeNull();
  await userEvent.type(screen.getByLabelText('Anteckning', { exact: true }), 'Ny');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  expect((await read()).draft.changes[0].after?.customValues).toEqual({
    power: 0,
    battery: false,
    note: 'Ny',
  });
  const review = within(screen.getByRole('region', { name: 'Hela mitt utkast' }));
  expect(review.getByText('Dolda fält – bevarade värden')).toBeTruthy();
  expect(review.getByText('Effekt: 0')).toBeTruthy();
  expect(review.getByText('Batteri: Nej')).toBeTruthy();
});
