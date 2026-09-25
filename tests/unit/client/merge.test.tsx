import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState, ObjectValue, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;

const read = async (): Promise<MapState> => (await client.request(path)).json();
const post = (route: string, body: unknown) => client.json(`${path}/${route}`, body);
async function object(id: string, value: Partial<ObjectValue> | null) {
  const state = await read();
  const before = state.objects.find((item) => item.id === id);
  expect(
    (
      await post('draft', {
        version: state.draft.version,
        id,
        baseRevision: before?.revision ?? null,
        value:
          value === null
            ? null
            : { typeId: state.types[0].id, name: id, description: '', ...before, ...value },
      })
    ).status,
  ).toBe(200);
}
async function save(operationId: string): Promise<SaveReceipt> {
  const response = await post('save', { version: (await read()).draft.version, operationId });
  expect(response.status).toBe(200);
  return (await response.json()).receipt;
}
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  householdId = (await (await client.json('/api/households', { name: 'Linden' })).json()).household
    .id;
  path = `/api/households/${householdId}/map`;

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    return client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fixture.close();
});

test('merge choices remain private, missing identity blocks save, and correction preserves other proposals', async () => {
  await object('a', { name: 'Lo', description: 'Första' });
  await object('b', { name: 'Lo', description: 'Andra' });
  await save('initial');
  await object('independent', { name: 'Robin' });
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Slå samman objekt' }));
  await userEvent.selectOptions(screen.getByLabelText('Objekt som behåller sin identitet'), 'a');
  await userEvent.selectOptions(screen.getByLabelText('Objekt som tas in i det första'), 'b');
  await userEvent.selectOptions(screen.getByLabelText('Välj Beskrivning'), 'absorbed');
  await userEvent.click(
    screen.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }),
  );
  await screen.findByText('Identiteten är inte bekräftad. Hela sparandet är blockerat.');
  expect(screen.getByRole('button', { name: 'Spara hela utkastet' }).hasAttribute('disabled')).toBe(
    true,
  );
  expect((await read()).objects).toHaveLength(2);
  await userEvent.click(
    screen.getByRole('button', { name: 'Kasta sammanslagningen för att rätta' }),
  );
  await waitFor(async () => expect((await read()).draft.changes).toHaveLength(1));
  expect((await read()).draft.changes.map((change) => change.id)).toEqual(['independent']);
});

test('type-specific custom fields and uncertain financial facts are visible and explicitly chosen before a merge', async () => {
  for (const [id, name, kind] of [
    ['plant', 'Växt', 'number'],
    ['vehicle', 'Fordon', 'boolean'],
  ]) {
    const response = await post('object-type', {
      version: (await read()).draft.version,
      id,
      baseRevision: null,
      value: {
        name,
        description: '',
        fields: [{ id: 'serial', name: 'Nummer', description: '', kind }],
      },
    });
    expect(response.status).toBe(200);
  }
  await object('a', {
    typeId: 'plant',
    name: 'Första',
    identity: 'unspecified',
    lifecycle: 'ended',
    customValues: { serial: 42 },
    financialFacts: {
      debt: { knowledge: 'uncertain', value: '100', reportedOn: '2026-01-01' },
      currency: { knowledge: 'unknown' },
    },
  });
  await object('b', {
    typeId: 'vehicle',
    name: 'Andra',
    description: 'Beskrivning',
    customValues: { serial: false },
    financialFacts: { debt: { knowledge: 'none' }, currency: { knowledge: 'known', value: 'SEK' } },
  });
  await save('initial');
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Slå samman objekt' }));
  await userEvent.selectOptions(screen.getByLabelText('Objekt som behåller sin identitet'), 'a');
  await userEvent.selectOptions(screen.getByLabelText('Objekt som tas in i det första'), 'b');
  await screen.findByText('Ospecificerat objekt');
  expect(
    screen.getByText(/Senast uppgiven skuld: Första: Osäkert uppgivet · 100 · 2026-01-01/),
  ).toBeTruthy();
  await userEvent.selectOptions(screen.getByLabelText('Välj Objekttyp'), 'absorbed');
  await userEvent.selectOptions(screen.getByLabelText('Välj Namn'), 'absorbed');
  await userEvent.selectOptions(screen.getByLabelText('Välj Beskrivning'), 'absorbed');
  await userEvent.selectOptions(screen.getByLabelText('Välj Status'), 'survivor');
  await userEvent.selectOptions(screen.getByLabelText('Välj Identitetsstatus'), 'absorbed');
  await userEvent.selectOptions(screen.getByLabelText('Välj Senast uppgiven skuld'), 'survivor');
  await userEvent.selectOptions(screen.getByLabelText('Välj Valuta'), 'absorbed');
  await userEvent.selectOptions(screen.getByLabelText('Välj Växt: Nummer'), 'survivor');
  await userEvent.selectOptions(screen.getByLabelText('Välj Fordon: Nummer'), 'absorbed');
  await screen.findByText(/Välj egna fält från den valda objekttypen/);
  expect(
    screen
      .getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' })
      .hasAttribute('disabled'),
  ).toBe(true);
  await userEvent.selectOptions(screen.getByLabelText('Välj Växt: Nummer'), 'omit');
  await userEvent.click(screen.getByLabelText('Jag bekräftar att objekten är samma företeelse'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' }),
  );
  await screen.findByText('Samma företeelse är uttryckligen bekräftad.');
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  await waitFor(async () => expect((await read()).objects).toHaveLength(1));
  expect((await read()).objects[0]).toMatchObject({
    id: 'a',
    typeId: 'vehicle',
    name: 'Andra',
    customValues: { serial: false },
    lifecycle: 'ended',
    financialFacts: { debt: { knowledge: 'uncertain', value: '100', reportedOn: '2026-01-01' } },
  });
});
