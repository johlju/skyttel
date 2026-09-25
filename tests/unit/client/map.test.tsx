import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BuildNotice } from '../../../src/client/build-guard.js';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState, ObjectValue, RelationshipValue } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

// These full form workflows use the real HTTP app and SQLite; coverage on
// shared CI runners can take longer than the five-second unit-test default.
vi.setConfig({ testTimeout: 15_000 });

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let failRead = false;
let loseResponse = '';
let deny = false;
let preventSave = false;
let wrongReceipt: Record<string, unknown> | null = null;
let beforeOperationsRead: (() => Promise<void>) | null = null;
let runningIdentity: { commit: string; version: string };
const dialogMethods = ['showModal', 'close'] as const;
const originalDialogMethods = dialogMethods.map((name) =>
  Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name),
);
beforeEach(async () => {
  // jsdom omits native dialog methods. Real modal behavior is covered by browser tests.
  for (const name of dialogMethods)
    Object.defineProperty(HTMLDialogElement.prototype, name, {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.open = name === 'showModal';
      },
    });
  runningIdentity = { commit: 'development', version: 'development' };
  fixture = await applicationFixture({ identity: runningIdentity });
  client = fixture.client();
  await client.signIn();
  householdId = (await (await client.json('/api/households', { name: 'Linden' })).json()).household
    .id;
  path = `/api/households/${householdId}/map`;
  failRead = false;
  loseResponse = '';
  deny = false;
  preventSave = false;
  wrongReceipt = null;
  beforeOperationsRead = null;
  // Connect the rendered browser UI to the real HTTP app and SQLite. Only
  // the external identity provider is substituted by applicationFixture.
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (deny) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (failRead && init?.method === 'GET') throw new Error('Synthetic disconnection');
    if (preventSave && url.endsWith('/save')) throw new Error('Synthetic unsent save');
    if (beforeOperationsRead && init?.method === 'GET' && url.endsWith('/operations')) {
      const callback = beforeOperationsRead;
      beforeOperationsRead = null;
      await callback();
    }
    const response = await client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    });
    if (loseResponse && url.endsWith(loseResponse)) throw new Error('Synthetic lost response');
    if (wrongReceipt && url.endsWith('/save') && response.ok) {
      const result = await response.json();
      return Response.json({ receipt: { ...result.receipt, ...wrongReceipt } });
    }
    return response;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  dialogMethods.forEach((name, index) => {
    const original = originalDialogMethods[index];
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
  fixture.close();
});

async function open() {
  render(<HouseholdMap householdId={householdId} />);
  await screen.findByRole('button', { name: 'Nytt objekt' });
}
async function add(name = 'Lo Exempel') {
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  await userEvent.type(screen.getByLabelText('Objektets namn'), name);
  await userEvent.type(screen.getByLabelText('Beskrivning'), 'En påhittad person');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
}
async function save() {
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Sparat:'));
}

test('changing type shows displaced values and requires handling them without copying matching field IDs', async () => {
  for (const [version, id, name, kind] of [
    [0, 'cycle', 'Cykel', 'text'],
    [1, 'vehicle', 'Fordon', 'number'],
  ] as const) {
    expect(
      (
        await client.json(`${path}/object-type`, {
          version,
          id,
          baseRevision: null,
          value: {
            name,
            description: '',
            fields: [
              { id: 'serial', name: 'Nummer', description: '', kind },
              { id: 'insured', name: 'Försäkrad', description: '', kind: 'boolean' },
            ],
          },
        })
      ).status,
    ).toBe(200);
  }
  await client.json(`${path}/draft`, {
    version: 2,
    id: 'bike',
    baseRevision: null,
    value: {
      typeId: 'cycle',
      name: 'Alex blå cykel',
      description: '',
      customValues: { serial: 'SYNTH-42', insured: false },
    },
  });
  await client.json(`${path}/save`, { version: 3, operationId: 'setup' });
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Alex blå cykel' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.selectOptions(screen.getByLabelText('Objekttyp'), 'vehicle');
  expect((screen.getByLabelText('Nummer') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Försäkrad') as HTMLSelectElement).value).toBe('');
  const previous = screen.getByRole('region', { name: 'Tidigare fältvärden' });
  expect(previous.textContent).toContain('Cykel');
  expect(previous.textContent).toContain('Nummer: SYNTH-42');
  expect(previous.textContent).toContain('Försäkrad: Nej');
  expect(
    (screen.getByRole('button', { name: 'Lägg i mitt utkast' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await userEvent.type(screen.getByLabelText('Nummer'), '42');
  await userEvent.click(screen.getByLabelText('Jag har hanterat tidigare fältvärden för typbytet'));
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  const review = screen.getByRole('region', { name: 'Hela mitt utkast' });
  expect(review.textContent).toContain('Nummer: SYNTH-42');
  expect(review.textContent).toContain('Nummer: 42');
  expect(review.textContent).toContain('Försäkrad: Obesvarat');
  await save();
  const state: MapState = await (await client.request(path)).json();
  expect(state.objects[0]).toMatchObject({
    id: 'bike',
    typeId: 'vehicle',
    customValues: { serial: 42 },
  });
  expect(state.objects[0].customValues).not.toHaveProperty('insured');
});

test('relationship type forms review both labels and show one edge from either object', async () => {
  const initial = await (await client.request(path)).json();
  for (const [version, id, name] of [
    [0, 'bike', 'Cykeln'],
    [1, 'garage', 'Garaget'],
  ] as const) {
    await client.json(`${path}/draft`, {
      version,
      id,
      baseRevision: null,
      value: { typeId: initial.types[0].id, name, description: '' },
    });
  }
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Ny sambandstyp' }));
  await userEvent.type(screen.getByLabelText('Sambandstypens namn'), 'Förvaring');
  await userEvent.type(screen.getByLabelText('Sambandstypens beskrivning'), 'Hushållets platser');
  await userEvent.type(screen.getByLabelText('Benämning från startobjektet'), 'förvaras i');
  await userEvent.type(screen.getByLabelText('Benämning från målobjektet'), 'innehåller');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samband' }));
  await userEvent.selectOptions(screen.getByLabelText('Från objekt'), 'bike');
  await userEvent.selectOptions(screen.getByLabelText('Till objekt'), 'garage');
  await userEvent.selectOptions(
    screen.getByLabelText('Sambandstyp'),
    screen.getByRole('option', { name: 'Förvaring' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
      'Cykeln → förvaras i → Garaget',
    ),
  );
  await save();
  expect(screen.getByRole('status').textContent).toContain('Förvaring (sambandstyp)');
  await userEvent.click(screen.getByRole('button', { name: 'Garaget' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.click(
    within(screen.getByRole('region', { name: 'Samband för Garaget' })).getByRole('button', {
      name: 'Garaget → innehåller → Cykeln',
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt samband' }));
  expect((screen.getByLabelText('Från objekt') as HTMLSelectElement).value).toBe('bike');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng sambandet utan att skicka' }));
  await userEvent.click(screen.getByText('Sambandstyper och riktning'));
  await userEvent.click(screen.getByRole('button', { name: 'Ändra sambandstyp: Förvaring' }));
  await userEvent.clear(screen.getByLabelText('Sambandstypens namn'));
  await userEvent.type(screen.getByLabelText('Sambandstypens namn'), 'Plats');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
      'Ändrad sambandstyp: Plats',
    ),
  );
  await save();
  await userEvent.click(screen.getByRole('button', { name: 'Ändra sambandstyp: Plats' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Stäng sambandstypen utan att skicka' }),
  );
  const saved = await (await client.request(path)).json();
  expect(saved.relationships).toHaveLength(1);
  expect(saved.relationships[0]).toMatchObject({
    sourceId: 'bike',
    targetId: 'garage',
    revision: 1,
  });
});

test('relationship type conflict review offers merged independent corrections and the current definition', async () => {
  const definition = {
    name: 'Förvaring',
    description: 'Förvaringsplats',
    forwardLabel: 'förvaras i',
    reverseLabel: 'innehåller',
  };
  await client.json(`${path}/relationship-type`, {
    version: 0,
    id: 'storage',
    baseRevision: null,
    value: definition,
  });
  await client.json(`${path}/save`, { version: 1, operationId: 'initial' });
  fixture.setSubject('member');
  const other = fixture.client();
  await other.signIn();
  const { user } = await (await other.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`/api/households/${householdId}/invitations`, { userId: user.id })
  ).json();
  await other.json('/api/invitations/accept', { code });
  await client.json(`${path}/relationship-type`, {
    version: 2,
    id: 'storage',
    baseRevision: 1,
    value: { ...definition, name: 'Plats' },
  });
  await other.json(`${path}/relationship-type`, {
    version: 0,
    id: 'storage',
    baseRevision: 1,
    value: { ...definition, description: 'Ny förklaring', reverseLabel: 'rymmer' },
  });
  await other.json(`${path}/save`, { version: 1, operationId: 'other' });
  await open();
  const review = screen.getByRole('region', { name: 'Hela mitt utkast' });
  expect(review.textContent).toContain('Mitt förslag med oberoende rättelser bevarade');
  await userEvent.click(screen.getByRole('button', { name: 'Behåll min sambandstyp' }));
  await waitFor(() => expect(review.textContent).not.toContain('Konflikt: sparad sambandstyp'));
  expect(review.textContent).toContain('Ny förklaring');
  await save();
  await client.json(`${path}/relationship-type`, {
    version: 5,
    id: 'storage',
    baseRevision: 3,
    value: { ...definition, name: 'Mitt förslag' },
  });
  await other.json(`${path}/relationship-type`, {
    version: 2,
    id: 'storage',
    baseRevision: 3,
    value: { ...definition, name: 'Annans rättelse' },
  });
  await other.json(`${path}/save`, { version: 3, operationId: 'other-again' });
  cleanup();
  await open();
  await screen.findByRole('button', { name: 'Använd sparad sambandstyp' });
  await userEvent.click(screen.getByRole('button', { name: 'Använd sparad sambandstyp' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
      'Inga förslag i utkastet',
    ),
  );
  expect(
    (await (await client.request(path)).json()).relationshipTypes.find(
      (type: { id: string }) => type.id === 'storage',
    ).name,
  ).toBe('Annans rättelse');
});

test('an update rejects an open form, preserves unsent text and explains how to recover', async () => {
  await open();
  render(<BuildNotice />);
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Osänt efter uppdatering');
  runningIdentity.commit = 'f'.repeat(40);
  runningIdentity.version = '0.1.0-preview.3';
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await screen.findByRole('button', { name: 'Ladda om Skyttel' });
  expect((screen.getByLabelText('Objektets namn') as HTMLInputElement).value).toBe(
    'Osänt efter uppdatering',
  );
  expect(screen.getByText(/Kopiera osänd text innan/)).toBeDefined();
  const map = await (await client.request(path)).json();
  expect(map.draft.changes).toEqual([]);
  expect(screen.queryByText(/Förslaget finns i ditt privata utkast/)).toBeNull();
});

test('review, search, correction, discard and deletion use the real persistent map', async () => {
  await open();
  await add();
  await userEvent.click(screen.getByRole('button', { name: 'Lo Exempel' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.clear(screen.getByLabelText('Objektets namn'));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Lo Lind');
  expect(
    (screen.getByRole('button', { name: 'Spara hela utkastet' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  await save();
  await userEvent.type(screen.getByLabelText('Sök objekt'), 'No match');
  expect(within(screen.getByRole('list', { name: 'Objekt' })).queryByRole('button')).toBeNull();
  await userEvent.clear(screen.getByLabelText('Sök objekt'));
  await userEvent.click(screen.getByRole('button', { name: 'Lo Lind' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.clear(screen.getByLabelText('Objektets namn'));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Lo Berg');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  const review = screen.getByRole('region', { name: 'Hela mitt utkast' });
  await waitFor(() => {
    expect(review.textContent).toContain('Lo Lind');
    expect(review.textContent).toContain('Lo Berg');
  });
  await userEvent.click(screen.getByRole('button', { name: 'Kasta hela utkastet' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Utkastet är kastat'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Lo Lind' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.click(
    within(screen.getByRole('group', { name: 'Objektets detaljer' })).getByRole('button', {
      name: 'Ta bort',
    }),
  );
  await waitFor(() => expect(review.textContent).toContain('Borttagning'));
  await save();
  expect(within(screen.getByRole('list', { name: 'Objekt' })).queryByRole('button')).toBeNull();
});

test('lost responses remain uncertain and the same receipt can be recovered', async () => {
  failRead = true;
  render(<HouseholdMap householdId={householdId} />);
  expect((await screen.findByRole('alert')).textContent).toContain('kunde inte hämtas');
  failRead = false;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await screen.findByRole('button', { name: 'Nytt objekt' });
  await add();
  loseResponse = '/save';
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  loseResponse = '';
  await userEvent.click(screen.getByRole('button', { name: 'Hämta samma kvitto igen' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Sparat: Lo Exempel'),
  );
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toHaveLength(1);
});

test('a reopened client finds a completed save without retaining the original attempt', async () => {
  await open();
  await add();
  loseResponse = '/save';
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  cleanup();
  loseResponse = '';
  await open();
  const operations = await screen.findByRole('region', { name: 'Mina sparförsök' });
  await waitFor(() => expect(operations.textContent).toContain('Genomfört'));
  expect(operations.textContent).toContain('Lo Exempel');
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Inga förslag',
  );
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toHaveLength(1);
});

test('recovery reads the consumed draft after another client completes the discovered operation', async () => {
  await open();
  await add();
  cleanup();
  const attempt = { operationId: 'concurrent-recovery', version: 1, contentVersion: 1 };
  await client.json(`${path}/operations`, attempt);
  beforeOperationsRead = async () => {
    expect((await client.json(`${path}/save`, attempt)).status).toBe(200);
  };
  await open();
  expect(screen.getByRole('region', { name: 'Mina sparförsök' }).textContent).toContain(
    'Genomfört',
  );
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Inga förslag',
  );
  expect(
    (screen.getByRole('button', { name: 'Spara hela utkastet' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

test('refreshing an unknown save keeps the draft locked until the registered attempt is retried', async () => {
  await open();
  await add();
  preventSave = true;
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('väntande'));
  for (const name of ['Nytt objekt', 'Kasta hela utkastet', 'Spara hela utkastet'])
    expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Lo Exempel',
  );
  preventSave = false;
  await userEvent.click(screen.getByRole('button', { name: 'Återförsök sparandet' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Sparat: Lo Exempel'),
  );
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toHaveLength(1);
});

test.each([
  { operationId: 'another-operation' },
  { draftVersion: 99 },
  { householdId: 'another-household' },
  { userId: 'another-user' },
  { contentVersion: 99 },
])('a receipt with mismatched identity %j cannot confirm the current save', async (identity) => {
  await open();
  await add();
  wrongReceipt = identity;
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  expect(screen.getByRole('status').textContent).not.toContain('Sparat:');
  expect((screen.getByRole('button', { name: 'Nytt objekt' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  wrongReceipt = null;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Sparat: Lo Exempel'),
  );
  expect((await (await client.request(`${path}/history`)).json()).history).toHaveLength(1);
});

test('a stale draft is blocked until refreshed, and a lost proposal is recovered without replacing form text', async () => {
  await open();
  await add();
  await client.json(`${path}/discard`, { version: 1 });
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Inget sparades');
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Robin Exempel');
  loseResponse = '/draft';
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Ändringen kunde inte bekräftas',
  );
  loseResponse = '';
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('äldre utkast'));
  expect(
    (screen.getByRole('button', { name: 'Lägg i mitt utkast' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByLabelText('Objektets namn') as HTMLInputElement).value).toBe('Robin Exempel');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng utan att skicka texten' }));
  expect(screen.queryByLabelText('Objektets namn')).toBeNull();
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Robin Exempel',
  );
});

test('revoked access removes map contents on a refused operation', async () => {
  await open();
  await add();
  deny = true;
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('inte längre tillgång');
  expect(screen.queryByRole('list', { name: 'Objekt' })).toBeNull();
});

test('a confirmed receipt remains successful when refreshing the map fails', async () => {
  await open();
  await add();
  failRead = true;
  await userEvent.click(screen.getByRole('button', { name: 'Spara hela utkastet' }));
  expect((await screen.findByRole('alert')).textContent).toContain('sparade enligt kvittot');
  expect(screen.getByRole('status').textContent).toContain('Sparat: Lo Exempel');
  expect(screen.queryByRole('button', { name: 'Hämta samma kvitto igen' })).toBeNull();
  failRead = false;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Inga förslag',
  );
});

test('relationship forms distinguish equal names, preserve meanings, correct and remove links', async () => {
  await open();
  await add('Lo');
  await add('Lo');
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samband' }));
  const source = screen.getByLabelText('Från objekt') as HTMLSelectElement;
  const choices = [...source.options].filter((option) => option.value);
  expect(choices).toHaveLength(2);
  expect(choices[0].text).not.toBe(choices[1].text);
  expect(choices[0].text).toContain('En påhittad person');
  await userEvent.selectOptions(source, choices[0].value);
  const type = screen.getByLabelText('Sambandstyp') as HTMLSelectElement;
  await userEvent.selectOptions(type, type.options[1].value);
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'unresolved');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  await screen.findByRole('button', { name: /^Lo → .* → Obesvarad identitetsfråga/ });
  expect(
    (screen.getByRole('button', { name: 'Spara hela utkastet' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await userEvent.click(
    screen.getByRole('button', { name: /^Lo → .* → Obesvarad identitetsfråga/ }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt samband' }));
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'uncertain');
  await userEvent.selectOptions(screen.getByLabelText('Till objekt'), choices[1].value);
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  await screen.findByRole('button', { name: /^Lo → .* → Lo \(Osäkert uppgivet\)/ });
  await save();
  for (const [knowledge, label] of [
    ['unknown', 'Okänt'],
    ['none', 'Uttryckligen inget'],
  ]) {
    await userEvent.click(
      within(screen.getByRole('list', { name: 'Samband' })).getByRole('button', {
        name: /^(?!Redigera).*→/,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Redigera valt samband' }));
    await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), knowledge);
    await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
    await screen.findByRole('button', { name: new RegExp(`^Lo → .* → ${label}`) });
    await save();
  }
  await userEvent.click(
    within(screen.getByRole('list', { name: 'Samband' })).getByRole('button', {
      name: /^(?!Redigera).*→/,
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt samband' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ta bort sambandet' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
      'Borttagning av samband',
    ),
  );
  await save();
  expect(within(screen.getByRole('list', { name: 'Samband' })).queryByRole('button')).toBeNull();
});

test('a duplicate displays its existing relationship and stale relationship text cannot overwrite a draft', async () => {
  await open();
  await add('Alex');
  await add('Kim');
  async function proposeLink() {
    await userEvent.click(screen.getByRole('button', { name: 'Nytt samband' }));
    for (const label of ['Från objekt', 'Sambandstyp', 'Till objekt']) {
      const select = screen.getByLabelText(label) as HTMLSelectElement;
      await userEvent.selectOptions(select, select.options[label === 'Till objekt' ? 2 : 1].value);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
    await waitFor(() => expect(screen.queryByLabelText('Från objekt')).toBeNull());
  }
  await proposeLink();
  await proposeLink();
  expect(screen.getByRole('status').textContent).toContain('Sambandet finns redan');
  await userEvent.click(
    within(screen.getByRole('list', { name: 'Samband' })).getByRole('button', {
      name: /^(?!Redigera).*→/,
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt samband' }));
  const state = await (await client.request(path)).json();
  await client.json(`${path}/draft`, {
    version: state.draft.version,
    id: 'concurrent',
    baseRevision: null,
    value: { typeId: state.types[0].id, name: 'Robin', description: '' },
  });
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'unknown');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Inget sparades'));
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('äldre utkast'));
  expect(
    (screen.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }) as HTMLButtonElement)
      .disabled ||
      (screen.getByLabelText('Från objekt').closest('fieldset') as HTMLFieldSetElement).disabled,
  ).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Stäng sambandet utan att skicka' }));
  await userEvent.click(
    within(screen.getByRole('list', { name: 'Samband' })).getByRole('button', {
      name: /^(?!Redigera).*→/,
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt samband' }));
  expect((screen.getByLabelText('Uppgiftens säkerhet') as HTMLSelectElement).value).toBe('known');
});

test('object identity can be explicitly unspecified and later identified', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Betalkonto');
  await userEvent.selectOptions(screen.getByLabelText('Objektets identitet'), 'unresolved');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await screen.findByRole('button', { name: 'Betalkonto' });
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Obesvarad identitetsfråga',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Betalkonto' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.selectOptions(screen.getByLabelText('Objektets identitet'), 'unspecified');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.queryByLabelText('Objektets identitet')).toBeNull());
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Ospecificerat objekt',
  );
  await save();
  await userEvent.click(screen.getByRole('button', { name: 'Betalkonto' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  expect((screen.getByLabelText('Objektets identitet') as HTMLSelectElement).value).toBe(
    'unspecified',
  );
  await userEvent.selectOptions(screen.getByLabelText('Objektets identitet'), 'identified');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.queryByLabelText('Objektets identitet')).toBeNull());
  await save();
});

async function concurrentEditors() {
  fixture.setSubject('robin-concurrent');
  const other = fixture.client();
  await other.signIn();
  const { user } = await (await other.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`/api/households/${householdId}/invitations`, { userId: user.id })
  ).json();
  await other.json('/api/invitations/accept', { code });
  const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
  async function propose(
    actor: typeof client,
    kind: 'draft' | 'relationship',
    id: string,
    value: ObjectValue | RelationshipValue | null,
  ) {
    const state = await read(actor);
    const pending = (kind === 'draft' ? state.draft.changes : state.draft.relationships)?.find(
      (item) => item.id === id,
    );
    const saved = (kind === 'draft' ? state.objects : state.relationships).find(
      (item) => item.id === id,
    );
    expect(
      (
        await actor.json(`${path}/${kind}`, {
          version: state.draft.version,
          id,
          baseRevision: pending ? (pending.before?.revision ?? null) : (saved?.revision ?? null),
          value,
        })
      ).status,
    ).toBe(200);
  }
  async function commit(actor = client) {
    expect(
      (
        await actor.json(`${path}/save`, {
          version: (await read(actor)).draft.version,
          operationId: crypto.randomUUID(),
        })
      ).status,
    ).toBe(200);
  }
  const state = await read();
  for (const [id, name] of [
    ['lo', 'Lo'],
    ['kim', 'Kim'],
  ])
    await propose(client, 'draft', id, { typeId: state.types[0].id, name, description: '' });
  await commit();
  return { other, read, propose, commit, state };
}

test('conflict choices retain independent object fields and cannot reuse stale approval', async () => {
  const { other, read, propose, commit, state } = await concurrentEditors();
  const value = { typeId: state.types[0].id, name: 'Lo Lind', description: '' };
  await propose(client, 'draft', 'lo', value);
  await propose(other, 'draft', 'lo', {
    ...value,
    name: 'Lo Berg',
    description: 'Spelar piano',
    identity: 'unspecified',
  });
  await commit(other);
  const oldVersion = (await read()).draft.version;
  await open();
  const review = screen.getByRole('region', { name: 'Hela mitt utkast' });
  expect(review.textContent).toContain('Lo Berg');
  await userEvent.click(screen.getByRole('button', { name: 'Behåll mitt förslag' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Granska hela utkastet'),
  );
  expect((await read()).draft.changes[0].after).toMatchObject({
    name: 'Lo Lind',
    description: 'Spelar piano',
    identity: 'unspecified',
  });
  expect(
    (await client.json(`${path}/save`, { version: oldVersion, operationId: 'stale' })).status,
  ).toBe(409);
  expect(
    (await client.json(`${path}/resolve`, { version: oldVersion, choice: 'saved', conflict: {} }))
      .status,
  ).toBe(409);
  const version = (await read()).draft.version;
  expect((await client.json(`${path}/resolve`, { version, choice: 'invalid' })).status).toBe(400);
  expect(
    (await client.json(`${path}/resolve`, { version, choice: 'saved', conflict: {} })).status,
  ).toBe(409);
  await save();
  expect((await read(other)).objects.find((object) => object.id === 'lo')?.description).toBe(
    'Spelar piano',
  );
});

test.each(['changed', 'duplicate', 'endpoint', 'deletion'] as const)(
  'relationship conflict recovery: %s',
  async (scenario) => {
    const { other, read, propose, commit, state } = await concurrentEditors();
    const value: RelationshipValue = {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'kim',
      knowledge: 'known',
    };
    if (scenario === 'changed') {
      await propose(client, 'relationship', 'link', value);
      await commit();
      await propose(client, 'relationship', 'link', { ...value, knowledge: 'uncertain' });
      await propose(other, 'relationship', 'link', {
        ...value,
        targetId: null,
        knowledge: 'unknown',
      });
    } else if (scenario === 'duplicate') {
      await propose(client, 'relationship', 'mine', value);
      await propose(other, 'relationship', 'link', value);
    } else if (scenario === 'endpoint') {
      await propose(client, 'relationship', 'mine', value);
      await propose(other, 'draft', 'kim', null);
    } else {
      await propose(client, 'draft', 'lo', null);
      await propose(other, 'relationship', 'link', value);
    }
    await commit(other);
    await open();
    const review = screen.getByRole('region', { name: 'Hela mitt utkast' });
    expect(review.textContent).toContain('Konflikt');
    const keep = scenario === 'changed' || scenario === 'deletion';
    await userEvent.click(
      screen.getByRole('button', { name: keep ? 'Behåll mitt förslag' : 'Använd sparat värde' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Granska hela utkastet'),
    );
    if (keep) {
      await save();
      expect((await read()).relationships).toHaveLength(scenario === 'changed' ? 1 : 0);
    } else {
      expect((await read()).draft.relationships ?? []).toEqual([]);
    }
  },
);

test('accepting a saved object removes only that proposal after another user deletes it', async () => {
  const { other, read, propose, commit, state } = await concurrentEditors();
  await propose(client, 'draft', 'lo', {
    typeId: state.types[0].id,
    name: 'Lo Lind',
    description: '',
  });
  await propose(other, 'draft', 'lo', null);
  await commit(other);
  const current = await read();
  const conflict = { kind: 'object', id: 'lo', current: null };
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: current.draft.version,
        conflict,
        choice: 'proposed',
      })
    ).status,
  ).toBe(409);
  await open();
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'borttaget',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Använd sparat värde' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Granska hela utkastet'),
  );
  expect((await read()).draft.changes).toEqual([]);
});

test.each(['lo', 'new'])(
  'changed type definitions must be reviewed before keeping proposal %s',
  async (id) => {
    const { read, propose, state } = await concurrentEditors();
    await propose(client, 'draft', id, {
      typeId: state.types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    // Catalog editing is not exposed yet; arrange its concurrent revision in SQLite.
    fixture.database
      .prepare('UPDATE object_type SET description = ?, revision = revision + 1 WHERE id = ?')
      .run('Ny typbeskrivning', state.types[0].id);
    await open();
    expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
      'Ny typbeskrivning',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Behåll mitt förslag' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Granska hela utkastet'),
    );
    await save();
    expect((await read()).objects.find((object) => object.id === id)?.name).toBe('Lo Lind');
  },
);

test('custom type forms use four optional field kinds and keep errors editable without saving', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Ny objekttyp' }));
  await userEvent.type(screen.getByLabelText('Typens namn'), 'Solcellsanläggning');
  await userEvent.type(screen.getByLabelText('Typens beskrivning'), 'Elproduktion');
  for (const [name, kind] of [
    ['Leverantör', 'text'],
    ['Effekt', 'number'],
    ['Datum', 'date'],
    ['Batteri', 'boolean'],
  ]) {
    await userEvent.click(screen.getByRole('button', { name: 'Lägg till fält' }));
    const field = within(
      screen.getAllByRole('group', { name: /^Eget fält/ }).at(-1) as HTMLElement,
    );
    await userEvent.type(field.getByLabelText('Fältets namn'), name);
    await userEvent.type(field.getByLabelText('Fältets beskrivning'), `Uppgift om ${name}`);
    await userEvent.selectOptions(field.getByLabelText('Värdeslag'), kind);
  }
  await userEvent.click(screen.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  await userEvent.type(screen.getByLabelText('Objektets namn'), 'Paneler');
  const type = (await (await client.request(path)).json()).draft.objectTypes[0].after;
  await userEvent.selectOptions(screen.getByLabelText('Objekttyp'), type.id);
  await userEvent.type(screen.getByLabelText('Leverantör'), 'Exempelsol');
  await userEvent.type(screen.getByLabelText('Effekt'), '12.5');
  await userEvent.type(screen.getByLabelText('Datum'), '2026-09-01');
  await userEvent.selectOptions(screen.getByLabelText('Batteri'), 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Batteri: Nej',
  );
  await save();
  await userEvent.click(screen.getByRole('button', { name: 'Paneler' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.clear(screen.getByLabelText('Leverantör'));
  await userEvent.clear(screen.getByLabelText('Effekt'));
  await userEvent.selectOptions(screen.getByLabelText('Batteri'), 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Leverantör: Obesvarat',
  );
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Batteri: Ja',
  );
  await save();
  await userEvent.click(screen.getByRole('button', { name: 'Paneler' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.selectOptions(screen.getByLabelText('Batteri'), '');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  await save();
  await userEvent.click(screen.getByText('Objekttyper och egna fält', { exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Ändra typ: Solcellsanläggning' }));
  await userEvent.selectOptions(screen.getAllByLabelText('Värdeslag')[2], 'number');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await screen.findByText(/Fältets värdeslag används redan/);
  expect(
    (screen.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  await userEvent.selectOptions(screen.getAllByLabelText('Värdeslag')[2], 'date');
  await userEvent.clear(screen.getByLabelText('Typens namn'));
  await userEvent.type(screen.getByLabelText('Typens namn'), 'Solkraft');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  await userEvent.click(screen.getByRole('button', { name: 'Ändra typ: Solkraft' }));
  await userEvent.click(
    screen.getByRole('button', { name: 'Stäng typformuläret utan att skicka' }),
  );
  await save();
});

test('a conflicting type offers both current choices and never grants an implicit save', async () => {
  const state = (await (await client.request(path)).json()) as MapState;
  const type = state.types[0];
  await client.json(`${path}/object-type`, {
    version: 0,
    id: type.id,
    baseRevision: 1,
    value: { name: 'Mitt namn', description: '', fields: [] },
  });
  fixture.setSubject('other-types');
  const other = fixture.client();
  await other.signIn();
  const { user } = await (await other.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`/api/households/${householdId}/invitations`, { userId: user.id })
  ).json();
  await other.json('/api/invitations/accept', { code });
  await other.json(`${path}/object-type`, {
    version: 0,
    id: type.id,
    baseRevision: 1,
    value: { name: 'Annans namn', description: 'Rättad definition', fields: [] },
  });
  await other.json(`${path}/save`, { version: 1, operationId: 'other-type' });
  await open();
  await screen.findByText('Konflikt: sparad typdefinition');
  await userEvent.click(screen.getByRole('button', { name: 'Behåll min typdefinition' }));
  await waitFor(() => expect(screen.queryByText('Konflikt: sparad typdefinition')).toBeNull());
  expect(
    (await (await client.request(path)).json()).types.find(
      (item: { id: string }) => item.id === type.id,
    ).name,
  ).toBe('Annans namn');
  await save();
  await userEvent.click(screen.getByText('Objekttyper och egna fält', { exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Ändra typ: Mitt namn' }));
  await userEvent.type(screen.getByLabelText('Typens namn'), ' igen');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('privata utkast'));
  await other.json(`${path}/object-type`, {
    version: 2,
    id: type.id,
    baseRevision: 3,
    value: { name: 'Gemensamt namn', description: '', fields: [] },
  });
  await other.json(`${path}/save`, { version: 3, operationId: 'other-again' });
  cleanup();
  await open();
  await screen.findByText('Konflikt: sparad typdefinition');
  await userEvent.click(screen.getByRole('button', { name: 'Använd sparad typdefinition' }));
  await waitFor(() => expect(screen.queryByText('Konflikt: sparad typdefinition')).toBeNull());
  expect(screen.getByRole('region', { name: 'Hela mitt utkast' }).textContent).toContain(
    'Inga förslag',
  );
});

test('view changes retain unsent object text and filters can clear without changing household content', async () => {
  await open();
  await add('Lo Rymdprov');
  await add('Kim Rymdprov');
  await save();
  const original = await (await client.request(path)).json();
  await userEvent.click(screen.getByRole('button', { name: 'Lo Rymdprov' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  await userEvent.clear(screen.getByLabelText('Beskrivning'));
  await userEvent.type(screen.getByLabelText('Beskrivning'), 'Oskickad vytext');
  await userEvent.click(screen.getByRole('button', { name: 'Samlad vy' }));
  await userEvent.click(screen.getByRole('button', { name: 'Öppna rymdkartan' }));
  await userEvent.click(screen.getByRole('button', { name: 'Visa detaljer och utkast' }));
  expect((screen.getByLabelText('Beskrivning') as HTMLTextAreaElement).value).toBe(
    'Oskickad vytext',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Till kartan' }));
  await userEvent.click(screen.getByRole('button', { name: 'Lista och detaljer' }));
  await userEvent.click(screen.getByRole('button', { name: 'Stäng utan att skicka texten' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera Lo Rymdprov' }));
  await userEvent.click(screen.getByRole('button', { name: 'Visa objektets kopplingar' }));
  expect(screen.getByText('Fokus: Lo Rymdprov')).toBeTruthy();
  expect(
    within(screen.getByRole('list', { name: 'Objekt' })).queryByText('Kim Rymdprov'),
  ).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Visa hela rymden' }));
  await userEvent.type(screen.getByLabelText('Sök objekt'), 'Lo');
  await userEvent.selectOptions(
    screen.getByLabelText('Filtrera objekttyp'),
    original.types.find((type: { name: string }) => type.name === 'Abonnemang').id,
  );
  expect(within(screen.getByRole('list', { name: 'Objekt' })).queryByRole('listitem')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Visa hela rymden' }));
  await userEvent.keyboard('{Escape}');
  expect(
    within(screen.getByRole('list', { name: 'Objekt' })).getAllByRole('listitem'),
  ).toHaveLength(2);
  expect((await (await client.request(path)).json()).objects).toEqual(original.objects);
});
