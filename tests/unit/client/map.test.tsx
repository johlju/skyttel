import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BuildNotice } from '../../../src/client/build-guard.js';
import { FormLeaveProvider } from '../../../src/client/FormLeave.js';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState, ObjectValue, RelationshipValue } from '../../../src/shared/map.js';
import { seedLargeMap } from '../../support/large-map.js';
import {
  editTableObjectForm,
  openDraftReview,
  openNewObjectForm,
  openObjectRelationships,
  readDraftProposal,
  renderHouseholdWork,
  saveHouseholdDraft,
} from '../../support/native-household-unit.js';
import { applicationFixture } from '../server/fixture.js';

// These full form workflows use the real HTTP app and SQLite; coverage on
// slow shared CI runners can take about twice as long as on fast ones.
vi.setConfig({ testTimeout: 30_000 });

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let failRead = false;
let failMapRead = false;
let loseResponse = '';
let deny = false;
let preventSave = false;
let wrongReceipt: Record<string, unknown> | null = null;
let beforeOperationsRead: (() => Promise<void>) | null = null;
let beforeHistoryRead: (() => Promise<void>) | null = null;
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
  failMapRead = false;
  loseResponse = '';
  deny = false;
  preventSave = false;
  wrongReceipt = null;
  beforeOperationsRead = null;
  beforeHistoryRead = null;
  // Connect the rendered browser UI to the real HTTP app and SQLite. Only
  // the external identity provider is substituted by applicationFixture.
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (deny) return Response.json({ error: 'forbidden' }, { status: 403 });
    if (failRead && init?.method === 'GET') throw new Error('Synthetic disconnection');
    if (failMapRead && init?.method === 'GET' && (url === path || url.startsWith(`${path}?`)))
      throw new Error('Synthetic map refresh failure');
    if (preventSave && url.endsWith('/save')) throw new Error('Synthetic unsent save');
    if (beforeOperationsRead && init?.method === 'GET' && url.endsWith('/operations')) {
      const callback = beforeOperationsRead;
      beforeOperationsRead = null;
      await callback();
    }
    if (beforeHistoryRead && init?.method === 'GET' && url.startsWith(`${path}/history?`)) {
      const callback = beforeHistoryRead;
      beforeHistoryRead = null;
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
  localStorage.removeItem('skyttel-theme');
  vi.unstubAllGlobals();
  dialogMethods.forEach((name, index) => {
    const original = originalDialogMethods[index];
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
  fixture.close();
});

async function open() {
  const view = renderHouseholdWork(householdId);
  await screen.findByRole('navigation', { name: 'Kartans verktyg' });
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Nytt objekt' }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  return view;
}
async function add(name = 'Lo Exempel', description = 'En påhittad person') {
  const form = await openNewObjectForm();
  await userEvent.type(form.getByLabelText('Namn'), name);
  await userEvent.type(form.getByLabelText('Beskrivning'), description);
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nytt objekt' })).toBeNull());
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'ditt utkast',
    ),
  );
}
async function stageRelationship() {
  const dialog = within(screen.getByRole('dialog', { name: /^Samband för / }));
  await userEvent.click(dialog.getByRole('button', { name: 'Lägg i utkastet' }));
  await dialog.findByText('Sambandet lades i ditt utkast. Du kan hantera nästa samband.');
  await userEvent.click(dialog.getByRole('button', { name: 'Stäng samband' }));
}
async function save() {
  await saveHouseholdDraft();
}

async function beginSave() {
  const draft = await openDraftReview();
  await userEvent.click(draft.getByRole('button', { name: 'Spara hela utkastet' }));
}
async function closeSaveDialog() {
  const modal = within(screen.getByRole('dialog', { name: 'Spara utkastet' }));
  await userEvent.click(modal.getByRole('button', { name: 'Stäng dialogen' }));
}
async function openSavedHistory() {
  const tools = within(screen.getByRole('navigation', { name: 'Kartans verktyg' }));
  await userEvent.click(tools.getByRole('button', { name: 'Rapporter' }));
  return within(await screen.findByRole('region', { name: 'Ändringshistorik' }));
}

async function openTypeEditor(name: string, deadline: number) {
  // A durable receipt can precede the refreshed map and its type controls.
  await waitFor(
    () =>
      expect(
        (screen.getByRole('button', { name: 'Nytt objekt' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    { timeout: Math.max(1, Math.floor(deadline - performance.now())) },
  );
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(button);
}
async function newRelationship(name: string) {
  const dialog = await openObjectRelationships(name);
  await userEvent.click(dialog.getByRole('button', { name: 'Nytt samband' }));
  return dialog;
}
async function editRelationship(name: string) {
  const dialog = await openObjectRelationships(name);
  await userEvent.click(dialog.getByRole('button', { name: 'Redigera samband' }));
  return dialog;
}
async function closeProposal() {
  await userEvent.click(screen.getByRole('button', { name: 'Stäng dialogen' }));
}

async function openConflict() {
  await userEvent.click(
    screen.getByRole('button', { name: /[0-9]+ konflikt(?:er)? i ditt utkast/ }),
  );
  const dialog = within(screen.getByRole('dialog', { name: 'Granska konflikter' }));
  await waitFor(() =>
    expect(
      (dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  return dialog;
}
async function resolveProperties(values: [string, string, string][]) {
  const dialog = await openConflict();
  for (const [label, side, value] of values)
    await userEvent.click(
      dialog.getByRole('button', { name: `${label}: ${side} – ${value}`.trim() }),
    );
  const confirm = dialog.getByRole('button', {
    name: 'Lägg valen i utkastet',
  }) as HTMLButtonElement;
  expect(confirm.disabled, confirm.closest('dialog')?.textContent ?? '').toBe(false);
  await userEvent.click(confirm);
  await waitFor(() =>
    expect(dialog.getByRole('status').textContent).toMatch(
      /Valen finns i ditt utkast|Förslaget har tagits bort ur ditt utkast/,
    ),
  );
  await userEvent.click(dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }));
}

test('table browsing combines type identities, description search and the shared selected object without changing household data', async () => {
  const { user } = await (await client.request('/api/bootstrap')).json();
  seedLargeMap(fixture.database, user.id, householdId);
  const initial = await (await client.request(path)).json();
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  await userEvent.click(table.getByRole('button', { name: 'Filter' }));
  const filters = within(screen.getByRole('dialog', { name: 'Tabellens filter' }));
  await userEvent.click(filters.getByLabelText('Ta med upphörda'));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  const search = table.getByLabelText('Sök objekt i tabellen');
  await userEvent.type(search, 'sammanhang 0.');
  expect(table.getAllByRole('rowheader')).toHaveLength(50);
  await userEvent.click(table.getByRole('button', { name: 'Provobjekt 000' }));
  await userEvent.click(table.getByRole('button', { name: 'Provobjekt 001' }));
  expect(table.getAllByText('✓ Markerad')).toHaveLength(1);
  await userEvent.click(table.getByRole('button', { name: /^Filter/ }));
  await userEvent.click(filters.getByLabelText('Person'));
  await userEvent.click(filters.getByLabelText('Tjänst'));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  expect(table.getAllByRole('rowheader')).toHaveLength(20);
  await userEvent.click(table.getByRole('button', { name: /^Filter/ }));
  await userEvent.click(filters.getByLabelText(/^Bara markerade/));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  expect(table.getAllByRole('rowheader')).toHaveLength(1);
  await userEvent.click(table.getByRole('button', { name: 'Typ' }));
  expect(table.getAllByRole('rowheader')).toHaveLength(1);
  await userEvent.click(table.getByRole('button', { name: /^Filter/ }));
  await userEvent.click(filters.getByRole('button', { name: 'Återställ sökning och filter' }));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  // Reset also restores the default exclusion of ended objects.
  expect(table.getAllByRole('rowheader')).toHaveLength(50);
  expect(await (await client.request(path)).json()).toEqual(initial);
});

test('object pages retain sorting and the selected row through ordinary map and table transitions', async () => {
  const { user } = await (await client.request('/api/bootstrap')).json();
  seedLargeMap(fixture.database, user.id, householdId);
  await open();
  const tools = within(screen.getByRole('navigation', { name: 'Kartans verktyg' }));
  await userEvent.click(tools.getByRole('button', { name: 'Tabell' }));
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  await userEvent.click(table.getByRole('button', { name: 'Filter' }));
  const filters = within(screen.getByRole('dialog', { name: 'Tabellens filter' }));
  await userEvent.click(filters.getByLabelText('Ta med upphörda'));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  const pages = within(table.getByRole('navigation', { name: 'Tabellsidor' }));
  await userEvent.click(pages.getByRole('button', { name: 'Nästa' }));
  expect(pages.getByText('Sida 2 av 10 · 50 objekt per sida')).toBeTruthy();
  await userEvent.click(table.getByRole('button', { name: 'Provobjekt 050' }));
  await userEvent.click(table.getByRole('button', { name: 'Typ' }));
  for (let index = 0; index < 5; index++)
    await userEvent.click(pages.getByRole('button', { name: 'Nästa' }));
  expect(pages.getByText('Sida 7 av 10 · 50 objekt per sida')).toBeTruthy();
  await userEvent.click(tools.getByRole('button', { name: 'Karta' }));
  await userEvent.click(tools.getByRole('button', { name: 'Tabell' }));
  expect(pages.getByText('Sida 7 av 10 · 50 objekt per sida')).toBeTruthy();
  expect(table.getByRole('columnheader', { name: 'Typ' }).getAttribute('aria-sort')).toBe(
    'ascending',
  );
  await userEvent.click(table.getByRole('button', { name: 'Namn' }));
  expect(pages.getByText('Sida 7 av 10 · 50 objekt per sida')).toBeTruthy();
  await userEvent.type(table.getByLabelText('Sök objekt i tabellen'), 'Provobjekt 050');
  expect(pages.getByText('Sida 1 av 1 · 50 objekt per sida')).toBeTruthy();
  expect(table.getByText('✓ Markerad')).toBeTruthy();
});

test('current status distinguishes a previous verified receipt from newly staged private proposals', async () => {
  await open();
  await add('Lo Exempel');
  await save();
  await add('Blå cykeln');
  const status = screen.getByRole('region', { name: 'Kartans status' });
  expect(status.textContent).not.toContain('förslag · privat utkast');
  expect(status.textContent).not.toContain('Tidigare sparande');
  expect(
    (await openDraftReview()).getByRole('button', { name: 'Visa förslaget: Blå cykeln' }),
  ).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Teckenförklaring i kartan' })).toBeTruthy();
  const state: MapState = await (await client.request(path)).json();
  expect(state.objects.map((object) => object.name)).toEqual(['Lo Exempel']);
  expect(state.draft.changes.map((change) => change.after?.name)).toEqual(['Blå cykeln']);
});

test('discarding an unsent form preserves staged proposals and new forms start empty', async () => {
  await open();
  await add('Cykeln');
  const staged = (await (await client.request(path)).json()).draft;
  await openNewObjectForm();
  const form = within(screen.getByRole('dialog', { name: 'Nytt objekt' }));
  await userEvent.type(form.getByLabelText('Namn'), 'Bilen');
  await userEvent.type(form.getByLabelText('Beskrivning'), 'Oskickat om Bilen');
  await userEvent.click(form.getByRole('button', { name: 'Stäng objektdialogen' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fortsätt redigera' }));
  expect((form.getByLabelText('Beskrivning') as HTMLTextAreaElement).value).toBe(
    'Oskickat om Bilen',
  );
  await userEvent.click(form.getByRole('button', { name: 'Stäng objektdialogen' }));
  await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  expect((await (await client.request(path)).json()).draft).toEqual(staged);
  expect(screen.queryByRole('button', { name: /^Fortsätt:/ })).toBeNull();
  await openNewObjectForm();
  expect((screen.getByLabelText('Namn') as HTMLInputElement).value).toBe('');
});

test('workspace theme restores focus after choice or Escape and permits leaving by Tab or pointer', async () => {
  await open();
  const button = () => screen.getByRole('button', { name: /^Tema:/ });
  const popup = () => screen.queryByRole('dialog', { name: 'Tema' });
  await userEvent.click(button());
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'System' }));
  await userEvent.keyboard('{Escape}');
  expect(popup()).toBeNull();
  expect(document.activeElement).toBe(button());
  await userEvent.click(button());
  await userEvent.click(screen.getByRole('radio', { name: 'System' }));
  expect(popup()).toBeNull();
  expect(document.activeElement).toBe(button());
  await userEvent.click(button());
  await userEvent.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Visa verktygens namn' }));
  expect(popup()).toBeNull();
  await userEvent.click(button());
  await userEvent.click(screen.getByRole('region', { name: 'Hushållskarta' }));
  expect(popup()).toBeNull();
});

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
  await editTableObjectForm('Alex blå cykel');
  await userEvent.selectOptions(screen.getByLabelText('Objekttyp'), 'vehicle');
  const confirmation = screen.getByRole('dialog', { name: 'Ta bort tidigare egna fält?' });
  expect(confirmation.textContent).toContain('Nummer: SYNTH-42');
  expect(confirmation.textContent).toContain('Försäkrad: Nej');
  await userEvent.click(
    within(confirmation).getByRole('button', { name: 'Ta bort fältvärdena och byt typ' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Egna fält' }));
  expect((screen.getByLabelText('Nummer') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Försäkrad') as HTMLSelectElement).value).toBe('');
  await userEvent.type(screen.getByLabelText('Nummer'), '42');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'utkast',
    ),
  );
  const review = await readDraftProposal('Alex blå cykel');
  expect(review.getByText('SYNTH-42')).toBeTruthy();
  expect(review.getByText('42')).toBeTruthy();
  expect(review.getByText('Nej')).toBeTruthy();
  const proposed = review.getByRole('heading', { name: 'Föreslagna värden' }).parentElement;
  if (!proposed) throw new Error('Missing proposed property section');
  const insurance = within(proposed).getByText('Försäkrad').closest('div');
  expect(insurance?.textContent).toContain('Ej uppgivet');
  await userEvent.click(review.getByRole('button', { name: 'Stäng dialogen' }));
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
  const deadline = performance.now() + 30_000;
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
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'utkast',
    ),
  );
  await newRelationship('Cykeln');
  await userEvent.selectOptions(screen.getByLabelText('Från objekt'), 'bike');
  await userEvent.selectOptions(screen.getByLabelText('Till objekt'), 'garage');
  await userEvent.selectOptions(
    screen.getByLabelText('Sambandstyp'),
    screen.getByRole('option', { name: 'Förvaring' }),
  );
  await stageRelationship();
  const proposal = await readDraftProposal('Cykeln → förvaras i → Garaget');
  expect(proposal.getByText('Förvaring', { exact: true })).toBeTruthy();
  await closeProposal();
  await save();
  expect(
    (await (await client.request(path)).json()).relationshipTypes.some(
      (type: { name: string }) => type.name === 'Förvaring',
    ),
  ).toBe(true);
  const reverse = await openObjectRelationships('Garaget');
  expect(reverse.getByText('Garaget → innehåller → Cykeln', { exact: true })).toBeTruthy();
  await userEvent.click(reverse.getByRole('button', { name: 'Redigera samband' }));
  expect((screen.getByLabelText('Från objekt') as HTMLSelectElement).value).toBe('bike');
  await userEvent.click(reverse.getByRole('button', { name: 'Stäng samband' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Ändra sambandstyp: Förvaring' }),
  );
  await userEvent.clear(screen.getByLabelText('Sambandstypens namn'));
  await userEvent.type(screen.getByLabelText('Sambandstypens namn'), 'Plats');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Ändra sambandstyp: Plats' })).toBeTruthy(),
  );
  let release!: () => void;
  const reading = new Promise<void>((resolve) => {
    release = resolve;
  });
  let refreshHeld = false;
  beforeOperationsRead = async () => {
    refreshHeld = true;
    await reading;
  };
  try {
    await save();
    expect(refreshHeld).toBe(true);
    const committed: MapState = await (await client.request(path)).json();
    expect(committed.relationshipTypes.some((type) => type.name === 'Plats')).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Nytt objekt' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Ändra sambandstyp: Plats' })).toBeNull();
    release();
    await openTypeEditor('Ändra sambandstyp: Plats', deadline);
    expect((screen.getByLabelText('Sambandstypens namn') as HTMLInputElement).value).toBe('Plats');
    expect((screen.getByLabelText('Benämning från startobjektet') as HTMLInputElement).value).toBe(
      'förvaras i',
    );
    expect((screen.getByLabelText('Benämning från målobjektet') as HTMLInputElement).value).toBe(
      'innehåller',
    );
  } finally {
    release();
  }
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
  await resolveProperties([
    ['Namn', 'Ditt förslag', 'Plats'],
    ['Beskrivning', 'Sparat i kartan nu', 'Ny förklaring'],
    ['Omvänd benämning', 'Sparat i kartan nu', 'rymmer'],
  ]);
  const proposal = await readDraftProposal('Plats');
  expect(
    within(
      proposal.getByRole('heading', { name: 'Föreslagna värden' }).parentElement as HTMLElement,
    ).getByText('Ny förklaring', { exact: true }),
  ).toBeTruthy();
  await closeProposal();
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
  await resolveProperties([['Namn', 'Sparat i kartan nu', 'Annans rättelse']]);
  expect((await openDraftReview()).getByText('Utkastet är tomt.', { exact: true })).toBeTruthy();
  expect(
    (await (await client.request(path)).json()).relationshipTypes.find(
      (type: { id: string }) => type.id === 'storage',
    ).name,
  ).toBe('Annans rättelse');
});

test('an update rejects an open form, preserves unsent text and explains how to recover', async () => {
  await open();
  render(<BuildNotice />);
  await openNewObjectForm();
  await userEvent.type(screen.getByLabelText('Namn'), 'Osänt efter uppdatering');
  runningIdentity.commit = 'f'.repeat(40);
  runningIdentity.version = '0.1.0-preview.3';
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await screen.findByRole('button', { name: 'Ladda om Skyttel' });
  expect((screen.getByLabelText('Namn') as HTMLInputElement).value).toBe('Osänt efter uppdatering');
  expect(screen.getByText(/Kopiera osänd text innan/)).toBeDefined();
  const map = await (await client.request(path)).json();
  expect(map.draft.changes).toEqual([]);
  expect(screen.queryByText(/Förslaget finns i ditt privata utkast/)).toBeNull();
});

test('review, search, correction, discard and deletion use the real persistent map', async () => {
  await open();
  await add();
  await editTableObjectForm('Lo Exempel');
  await userEvent.clear(screen.getByLabelText('Namn'));
  await userEvent.type(screen.getByLabelText('Namn'), 'Lo Lind');
  expect((await (await client.request(path)).json()).objects).toEqual([]);
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByLabelText('Namn')).toBeNull());
  await save();
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  const search = table.getByLabelText('Sök objekt i tabellen');
  await userEvent.type(search, 'No match');
  expect(table.queryByRole('button', { name: 'Redigera Lo Lind' })).toBeNull();
  await userEvent.clear(search);
  await editTableObjectForm('Lo Lind');
  await userEvent.clear(screen.getByLabelText('Namn'));
  await userEvent.type(screen.getByLabelText('Namn'), 'Lo Berg');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByLabelText('Namn')).toBeNull());
  const proposal = await readDraftProposal('Lo Berg');
  expect(proposal.getByText('Lo Lind', { exact: true })).toBeTruthy();
  expect(
    within(
      proposal.getByRole('heading', { name: 'Föreslagna värden' }).parentElement as HTMLElement,
    ).getByText('Lo Berg', { exact: true }),
  ).toBeTruthy();
  await closeProposal();
  const draft = await openDraftReview();
  await userEvent.click(draft.getByRole('button', { name: 'Kasta hela utkastet' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Ta bort hela utkastet' }));
  await waitFor(() => expect(draft.getByText('Utkastet är tomt.', { exact: true })).toBeTruthy());
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  await userEvent.click(table.getByRole('button', { name: 'Lo Lind' }));
  await userEvent.click(table.getByRole('button', { name: 'Ta bort Lo Lind' }));
  await waitFor(async () =>
    expect((await (await client.request(path)).json()).draft.changes[0].after).toBeNull(),
  );
  await save();
  expect((await (await client.request(path)).json()).objects).toEqual([]);
});

test('lost responses remain uncertain and the same receipt can be recovered', async () => {
  failRead = true;
  renderHouseholdWork(householdId);
  expect((await screen.findByRole('alert')).textContent).toContain('kunde inte hämtas');
  failRead = false;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await add();
  loseResponse = '/save';
  await beginSave();
  const modal = within(await screen.findByRole('dialog', { name: 'Spara utkastet' }));
  await waitFor(() =>
    expect(modal.getByRole('status').textContent).toContain('Sparandet kunde inte bekräftas.'),
  );
  const attempted = (await (await client.request(`${path}/operations`)).json()).operations;
  expect(attempted).toHaveLength(1);
  loseResponse = '';
  await userEvent.click(modal.getByRole('button', { name: 'Kontrollera sparandet igen' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Spara utkastet' })).toBeNull());
  expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toBe(
    'Utkastet är sparat',
  );
  const history = (await (await client.request(`${path}/history`)).json()).history;
  expect(history).toHaveLength(1);
  expect(history[0].operationId).toBe(attempted[0].operationId);
  expect((await (await client.request(`${path}/operations`)).json()).operations).toEqual(attempted);
});

test('a reopened client finds a completed save without retaining the original attempt', async () => {
  await open();
  await add();
  loseResponse = '/save';
  await beginSave();
  const modal = within(await screen.findByRole('dialog', { name: 'Spara utkastet' }));
  await waitFor(() =>
    expect(modal.getByRole('status').textContent).toContain('Sparandet kunde inte bekräftas.'),
  );
  const attempted = (await (await client.request(`${path}/operations`)).json()).operations;
  cleanup();
  loseResponse = '';
  await open();
  const history = await openSavedHistory();
  await history.findByText('Lo Exempel');
  expect(history.getAllByRole('article')).toHaveLength(1);
  expect((await (await client.request(`${path}/history`)).json()).history).toEqual([
    attempted[0].receipt,
  ]);
  const draft = await openDraftReview();
  expect(draft.getByText('Utkastet är tomt.')).toBeTruthy();
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
  const history = await openSavedHistory();
  await history.findByText('Lo Exempel');
  expect(history.getAllByRole('article')).toHaveLength(1);
  const draft = await openDraftReview();
  expect(draft.getByText('Utkastet är tomt.')).toBeTruthy();
  expect(draft.getByRole('button', { name: 'Spara hela utkastet' })).toHaveProperty(
    'disabled',
    true,
  );
  const operations = (await (await client.request(`${path}/operations`)).json()).operations;
  expect(operations).toHaveLength(1);
  expect(operations[0]).toMatchObject({ operationId: attempt.operationId, status: 'succeeded' });
  expect((await (await client.request(path)).json()).draft.changes).toEqual([]);
});

test('refreshing an unknown save keeps the draft locked until the registered attempt is retried', async () => {
  await open();
  await add();
  preventSave = true;
  await beginSave();
  const modal = within(screen.getByRole('dialog', { name: 'Spara utkastet' }));
  await waitFor(() =>
    expect(modal.getByRole('status').textContent).toContain('Sparandet kunde inte bekräftas'),
  );
  await closeSaveDialog();
  await userEvent.click(screen.getByRole('button', { name: 'Karta' }));
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('väntande'));
  expect((screen.getByRole('button', { name: 'Nytt objekt' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  const draft = await openDraftReview();
  for (const name of ['Kasta hela utkastet', 'Spara hela utkastet'])
    expect((draft.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
  expect(draft.getByRole('button', { name: 'Visa förslaget: Lo Exempel' })).toBeTruthy();
  const pending = await (await client.request(`${path}/operations`)).json();
  expect(pending.operations).toHaveLength(1);
  preventSave = false;
  await userEvent.click(screen.getByRole('button', { name: 'Visa sparandet' }));
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera sparandet igen' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Spara utkastet' })).toBeNull());
  expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toBe(
    'Utkastet är sparat',
  );
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toHaveLength(1);
  expect(history.history[0].operationId).toBe(pending.operations[0].operationId);
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
  await beginSave();
  const modal = within(screen.getByRole('dialog', { name: 'Spara utkastet' }));
  await waitFor(() =>
    expect(modal.getByRole('status').textContent).toContain('Sparandet kunde inte bekräftas'),
  );
  expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toBe('');
  await closeSaveDialog();
  await userEvent.click(screen.getByRole('button', { name: 'Karta' }));
  expect(screen.getByRole('region', { name: 'Kartans status' }).textContent).toContain(
    'Sparutfall okänt',
  );
  expect(screen.getByRole('region', { name: 'Teckenförklaring i kartan' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Nytt objekt' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  wrongReceipt = null;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toBe(
      'Utkastet är sparat',
    ),
  );
  expect((await (await client.request(`${path}/history`)).json()).history).toHaveLength(1);
});

test('a stale draft is blocked until refreshed, and a lost proposal is recovered without replacing form text', async () => {
  await open();
  await add();
  await client.json(`${path}/discard`, { version: 1 });
  let finishOperationsRead!: () => void;
  const operationsRead = new Promise<void>((resolve) => {
    finishOperationsRead = resolve;
  });
  beforeOperationsRead = () => operationsRead;
  await beginSave();
  const modal = within(screen.getByRole('dialog', { name: 'Spara utkastet' }));
  await waitFor(() => expect(modal.getByRole('status').textContent).toContain('Inget sparades'));
  await closeSaveDialog();
  await userEvent.click(screen.getByRole('button', { name: 'Karta' }));
  const refresh = screen.getByRole('button', { name: 'Hämta aktuellt underlag' });
  expect((refresh as HTMLButtonElement).disabled).toBe(true);
  finishOperationsRead();
  await waitFor(() => expect((refresh as HTMLButtonElement).disabled).toBe(false));
  await userEvent.click(refresh);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  await openNewObjectForm();
  await userEvent.type(screen.getByLabelText('Namn'), 'Robin Exempel');
  loseResponse = '/object-form';
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Det är oklart om ändringen lades i utkastet',
  );
  expect((screen.getByLabelText('Namn') as HTMLInputElement).value).toBe('Robin Exempel');
  expect(
    (screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  loseResponse = '';
  await userEvent.click(
    screen.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await waitFor(() => expect(screen.queryByLabelText('Namn')).toBeNull());
  expect(
    (await openDraftReview()).getByRole('button', { name: 'Visa förslaget: Robin Exempel' }),
  ).toBeTruthy();
  const recovered: MapState = await (await client.request(path)).json();
  expect(recovered.draft.changes).toHaveLength(1);
  expect(recovered.objects).toEqual([]);
});

test('revoked access removes map contents on a refused operation', async () => {
  await open();
  await add();
  deny = true;
  await beginSave();
  expect((await screen.findByRole('alert')).textContent).toContain('inte längre tillgång');
  expect(screen.queryByRole('region', { name: 'Hushållets tabell' })).toBeNull();
});

test('refresh recovery confirms an unknown save before a failed map read and retains its receipt', async () => {
  await open();
  await add();
  loseResponse = '/save';
  await beginSave();
  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: 'Spara utkastet' }).textContent).toContain(
      'Sparandet kunde inte bekräftas',
    ),
  );
  await closeSaveDialog();
  await userEvent.click(screen.getByRole('button', { name: 'Karta' }));
  const status = screen.getByRole('region', { name: 'Kartans status' });
  expect(status.textContent).toContain('Sparutfall okänt');
  loseResponse = '';
  failMapRead = true;
  await userEvent.click(within(status).getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toContain(
      'Utkastet är sparat',
    ),
  );
  await waitFor(() =>
    expect(within(status).getByRole('alert').textContent).toContain('sparade enligt kvittot'),
  );
  expect(status.textContent).not.toContain('Sparutfall okänt');
  expect(within(status).queryByRole('button', { name: 'Hämta samma kvitto igen' })).toBeNull();
  failMapRead = false;
  await userEvent.click(within(status).getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(within(status).queryByRole('alert')).toBeNull());
  let releaseHistory!: () => void;
  const historyResponse = new Promise<void>((resolve) => {
    releaseHistory = resolve;
  });
  let historyRequested!: () => void;
  const historyRequest = new Promise<void>((resolve) => {
    historyRequested = resolve;
  });
  beforeHistoryRead = () => {
    historyRequested();
    return historyResponse;
  };
  const history = await openSavedHistory();
  try {
    await historyRequest;
    expect(history.getByText('Hämtar historik…')).toBeTruthy();
    expect(history.queryAllByRole('article')).toHaveLength(0);
  } finally {
    releaseHistory();
  }
  await waitFor(() => {
    expect(history.queryByText('Hämtar historik…')).toBeNull();
    expect(history.getAllByRole('article')).toHaveLength(1);
  });
  const operations = await (await client.request(`${path}/operations`)).json();
  expect(operations.operations).toHaveLength(1);
  expect(operations.operations[0].status).toBe('succeeded');
  expect(history.getByRole('article').getAttribute('data-save')).toBe(
    operations.operations[0].operationId,
  );
});

test('Settings retains same-operation recovery and persistent refresh errors for a map save', async () => {
  const view = await open();
  await add();
  loseResponse = '/save';
  await beginSave();
  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: 'Spara utkastet' }).textContent).toContain(
      'Sparandet kunde inte bekräftas',
    ),
  );
  await closeSaveDialog();
  view.rerender(
    <FormLeaveProvider>
      <HouseholdMap householdId={householdId} active={false} />
    </FormLeaveProvider>,
  );
  const feedback = screen.getByRole('region', { name: 'Utkastets återkoppling' });
  expect(feedback.textContent).toContain('Sparutfall okänt');
  loseResponse = '';
  failMapRead = true;
  await userEvent.click(within(feedback).getByRole('button', { name: 'Hämta samma kvitto igen' }));
  await waitFor(() => expect(feedback.textContent).toContain('Sparat · kvitto bekräftat'));
  await waitFor(() =>
    expect(within(feedback).getByRole('alert').textContent).toContain('sparade enligt kvittot'),
  );
  expect(feedback.textContent).not.toContain('Sparutfall okänt');
  failMapRead = false;
  await userEvent.click(within(feedback).getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(within(feedback).queryByRole('alert')).toBeNull());
  expect(feedback.textContent).toContain('Inga osparade förslag');
});

test('a confirmed receipt remains successful when refreshing the map fails', async () => {
  await open();
  await add();
  failRead = true;
  await beginSave();
  expect((await screen.findByRole('alert')).textContent).toContain('sparade enligt kvittot');
  expect((await (await client.request(`${path}/operations`)).json()).operations[0].status).toBe(
    'succeeded',
  );
  expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toContain(
    'Utkastet är sparat',
  );
  expect(screen.getByRole('region', { name: 'Kartans status' }).textContent).not.toContain(
    'Sparutfall okänt',
  );
  expect(screen.queryByRole('button', { name: 'Hämta samma kvitto igen' })).toBeNull();
  failRead = false;
  await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect((await openDraftReview()).getByText('Utkastet är tomt.', { exact: true })).toBeTruthy();
});

test('relationship forms distinguish equal names, preserve meanings, correct and remove links', async () => {
  await open();
  await add('Lo');
  await add('Lo', 'En annan påhittad person');
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  await userEvent.click(table.getAllByRole('button', { name: 'Samband för Lo' })[0]);
  await userEvent.click(screen.getByRole('button', { name: 'Nytt samband' }));
  const source = screen.getByLabelText('Från objekt') as HTMLSelectElement;
  const choices = [...source.options].filter((option) => option.value);
  expect(choices).toHaveLength(2);
  expect(choices[0].text).not.toBe(choices[1].text);
  expect(choices[0].text).toContain('påhittad person');
  const targetId = choices.find((choice) => choice.value !== source.value)?.value;
  if (!targetId) throw new Error('Missing independent equal-name target');
  const type = screen.getByLabelText('Sambandstyp') as HTMLSelectElement;
  await userEvent.selectOptions(type, type.options[1].value);
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'unresolved');
  await stageRelationship();
  const draft = await openDraftReview();
  expect(
    (draft.getByRole('button', { name: 'Spara hela utkastet' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  let releaseMapRefresh: (() => void) | undefined;
  async function editCurrent() {
    await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
    const currentTable = within(await screen.findByRole('region', { name: 'Hushållets tabell' }));
    const buttons = currentTable.findAllByRole('button', { name: 'Samband för Lo' });
    releaseMapRefresh?.();
    await userEvent.click((await buttons)[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Redigera samband' }));
  }
  await editCurrent();
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'uncertain');
  await userEvent.selectOptions(screen.getByLabelText('Till objekt'), targetId);
  await stageRelationship();
  // The receipt confirms a durable save before the follow-up map response.
  // Withhold that real HTTP response until the next edit waits for its rows.
  const immediateFetch = globalThis.fetch;
  const mapRefresh = new Promise<void>((resolve) => {
    releaseMapRefresh = resolve;
  });
  let confirmMapRequested: () => void;
  const mapRequested = new Promise<void>((resolve) => {
    confirmMapRequested = resolve;
  });
  let holdRefresh = true;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const response = await immediateFetch(url, init);
    if (holdRefresh && url === path && init?.method === 'GET') {
      holdRefresh = false;
      confirmMapRequested();
      await mapRefresh;
    }
    return response;
  });
  await save();
  await mapRequested;
  const saved = await (await client.request(path)).json();
  expect(saved.objects).toHaveLength(2);
  expect(saved.relationships[0]).toMatchObject({ knowledge: 'uncertain', targetId });
  expect(table.queryAllByRole('button', { name: 'Samband för Lo', hidden: true })).toHaveLength(0);
  for (const knowledge of ['unknown', 'none']) {
    await editCurrent();
    await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), knowledge);
    await stageRelationship();
    const staged = await (await client.request(path)).json();
    expect(staged.draft.relationships[0].after).toMatchObject({ knowledge, targetId: null });
    await save();
  }
  await editCurrent();
  await userEvent.click(screen.getByRole('button', { name: 'Föreslå borttagning' }));
  await screen.findByText('Föreslagen borttagning lades i ditt utkast.');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng samband' }));
  const staged = await (await client.request(path)).json();
  expect(staged.draft.relationships[0]).toMatchObject({
    before: expect.objectContaining({ knowledge: 'none' }),
    after: null,
  });
  await save();
  expect((await (await client.request(path)).json()).relationships).toEqual([]);
});

test('a duplicate displays its existing relationship and stale relationship text cannot overwrite a draft', async () => {
  const view = await open();
  await add('Alex');
  await add('Kim');
  async function fillLink() {
    await newRelationship('Alex');
    const dialog = within(screen.getByRole('dialog', { name: /^Samband för / }));
    for (const label of ['Från objekt', 'Sambandstyp', 'Till objekt']) {
      const select = dialog.getByLabelText(label) as HTMLSelectElement;
      await userEvent.selectOptions(select, select.options[label === 'Till objekt' ? 2 : 1].value);
    }
    return dialog;
  }
  await fillLink();
  await stageRelationship();
  const before = await (await client.request(path)).json();
  const duplicate = await fillLink();
  await userEvent.click(duplicate.getByRole('button', { name: 'Lägg i utkastet' }));
  await duplicate.findByText('Sambandet finns redan');
  expect((await (await client.request(path)).json()).draft).toEqual(before.draft);
  await userEvent.click(duplicate.getByRole('button', { name: 'Redigera befintligt samband' }));
  await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  const state = await (await client.request(path)).json();
  expect(
    (
      await client.json(`${path}/draft`, {
        version: state.draft.version,
        id: 'concurrent',
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Robin', description: '' },
      })
    ).status,
  ).toBe(200);
  const latest = await (await client.request(path)).json();
  await userEvent.selectOptions(screen.getByLabelText('Uppgiftens säkerhet'), 'unknown');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet' }));
  await screen.findByText('Ändringen kunde inte bekräftas. Dina uppgifter finns kvar.');
  expect(screen.getByLabelText('Uppgiftens säkerhet')).toHaveProperty('value', 'unknown');
  expect((await (await client.request(path)).json()).draft).toEqual(latest.draft);
  await userEvent.click(screen.getByRole('button', { name: 'Stäng samband' }));
  await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  view.unmount();
  await open();
  await editRelationship('Alex');
  expect(screen.getByLabelText('Uppgiftens säkerhet')).toHaveProperty('value', 'known');
  expect((await (await client.request(path)).json()).draft).toEqual(latest.draft);
});

test('object identity can be explicitly unspecified and later identified', async () => {
  await open();
  const form = await openNewObjectForm();
  await userEvent.type(form.getByLabelText('Namn'), 'Betalkonto');
  await userEvent.selectOptions(form.getByLabelText('Identitet'), 'unresolved');
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nytt objekt' })).toBeNull());
  const unresolvedReview = await readDraftProposal('Betalkonto');
  expect(unresolvedReview.getByText('Identiteten behöver redas ut')).toBeTruthy();
  await userEvent.click(unresolvedReview.getByRole('button', { name: 'Stäng dialogen' }));
  expect(
    (await openDraftReview()).getByRole('button', { name: 'Spara hela utkastet' }),
  ).toHaveProperty('disabled', true);
  const edit = await editTableObjectForm('Betalkonto');
  await userEvent.selectOptions(edit.getByLabelText('Identitet'), 'unspecified');
  await userEvent.click(edit.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Redigera Betalkonto' })).toBeNull(),
  );
  const specifiedReview = await readDraftProposal('Betalkonto');
  expect(specifiedReview.getByText('Ospecificerat objekt')).toBeTruthy();
  await userEvent.click(specifiedReview.getByRole('button', { name: 'Stäng dialogen' }));
  await save();
  const saved: MapState = await (await client.request(path)).json();
  expect(saved.objects).toHaveLength(1);
  expect(saved.objects[0].identity).toBe('unspecified');
  const identify = await editTableObjectForm('Betalkonto');
  expect(identify.getByLabelText('Identitet')).toHaveProperty('value', 'unspecified');
  await userEvent.selectOptions(identify.getByLabelText('Identitet'), 'identified');
  await userEvent.click(identify.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Redigera Betalkonto' })).toBeNull(),
  );
  await save();
  const identified: MapState = await (await client.request(path)).json();
  expect(identified.objects).toHaveLength(1);
  expect(identified.objects[0].id).toBe(saved.objects[0].id);
  expect(identified.objects[0].identity ?? 'identified').toBe('identified');
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
  await resolveProperties([
    ['Namn', 'Ditt förslag', 'Lo Lind'],
    ['Beskrivning', 'Sparat i kartan nu', 'Spelar piano'],
    ['Identifiering', 'Sparat i kartan nu', 'Ospecificerat objekt'],
  ]);
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
    expect(screen.getByRole('button', { name: '1 konflikt i ditt utkast' })).toBeTruthy();
    if (scenario === 'changed') {
      await resolveProperties([
        ['Till objekt', 'Ditt förslag', 'Kim'],
        ['Vad är känt?', 'Ditt förslag', 'Osäkert uppgivet'],
      ]);
      await save();
      expect((await read()).relationships).toHaveLength(1);
    } else {
      const before = await read();
      const dialog = await openConflict();
      if (scenario === 'deletion') {
        expect(
          dialog.getByText(
            'Du föreslår borttagning. Ytterligare ett sparat samband berör nu objektet.',
          ),
        ).toBeTruthy();
        expect(
          (dialog.getByRole('button', { name: 'Lägg valen i utkastet' }) as HTMLButtonElement)
            .disabled,
        ).toBe(true);
      } else {
        expect(
          dialog.getByText(
            scenario === 'duplicate'
              ? 'Sambandet finns redan. Ta bort det föreslagna sambandet ur ditt utkast.'
              : 'Sambandet kan inte läggas till eftersom ett objekt som det pekar på saknas.',
          ),
        ).toBeTruthy();
        expect(dialog.queryByRole('button', { name: 'Lägg valen i utkastet' })).toBeNull();
      }
      await userEvent.click(dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }));
      expect((await read()).draft).toEqual(before.draft);
      const reopened = await openConflict();
      if (scenario === 'deletion') {
        await userEvent.click(
          within(reopened.getByRole('region', { name: 'Sparat i kartan nu' })).getByRole('button', {
            name: /^Objekt:/,
          }),
        );
        await userEvent.click(
          within(reopened.getByRole('region', { name: 'Ditt förslag' })).getByRole('button', {
            name: /^Samband:/,
          }),
        );
        await userEvent.click(reopened.getByRole('button', { name: 'Lägg valen i utkastet' }));
      } else
        await userEvent.click(
          reopened.getByRole('button', { name: 'Ta bort sambandet ur ditt utkast' }),
        );
      await waitFor(() =>
        expect(reopened.getByRole('status').textContent).toMatch(
          /Valen finns i ditt utkast|Förslaget har tagits bort ur ditt utkast/,
        ),
      );
      const after = await read();
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      if (scenario === 'deletion') {
        expect(after.draft.changes).toEqual([]);
        expect(after.draft.relationships).toEqual([
          expect.objectContaining({ id: 'link', before: before.relationships[0], after: null }),
        ]);
      } else expect(after.draft.relationships ?? []).toEqual([]);
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
  const dialog = await openConflict();
  expect(
    dialog.getByText('Objektet är borttaget. Ditt ändringsförslag kan inte återställa det.'),
  ).toBeTruthy();
  await userEvent.click(dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }));
  expect((await read()).draft).toEqual(current.draft);
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: current.draft.version,
        conflict,
        choice: 'saved',
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.changes).toEqual([]);
});

test.each(['lo', 'new'])(
  'changed type definitions must be reviewed before keeping proposal %s',
  async (id) => {
    const { other, read, propose, commit, state } = await concurrentEditors();
    await propose(client, 'draft', id, {
      typeId: state.types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    const current = await read(other);
    const type = current.types.find((type) => type.id === state.types[0].id);
    if (!type) throw new Error('Missing current type');
    expect(
      (
        await other.json(`${path}/object-type`, {
          version: current.draft.version,
          contentVersion: current.contentVersion,
          id: type.id,
          baseRevision: type.revision,
          value: { ...type, description: 'Ny typbeskrivning', fields: type.fields ?? [] },
        })
      ).status,
    ).toBe(200);
    await commit(other);
    await open();
    const before = await read();
    const dialog = await openConflict();
    if (id === 'new') {
      expect(
        dialog.getByText(
          'Objektet har ännu inte sparats i kartan. Typdefinitionen har ändrats medan du arbetade med förslaget.',
        ),
      ).toBeTruthy();
      await userEvent.click(dialog.getByRole('button', { name: 'Stäng konfliktfönstret' }));
      expect((await read()).draft).toEqual(before.draft);
    } else {
      await userEvent.click(dialog.getByRole('button', { name: 'Namn: Ditt förslag – Lo Lind' }));
      await userEvent.click(dialog.getByRole('button', { name: 'Lägg valen i utkastet' }));
      await waitFor(() => expect(dialog.getByRole('status').textContent).toContain('Valen finns'));
      await userEvent.click(dialog.getByRole('button', { name: 'Stäng konfliktdialogen' }));
      await save();
      expect((await read()).objects.find((object) => object.id === id)?.name).toBe('Lo Lind');
    }
  },
);

test('custom type forms use four optional field kinds and keep errors editable without saving', async () => {
  const deadline = performance.now() + 30_000;
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
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'utkast',
    ),
  );
  await openNewObjectForm();
  await userEvent.type(screen.getByLabelText('Namn'), 'Paneler');
  const type = (await (await client.request(path)).json()).draft.objectTypes[0].after;
  await userEvent.selectOptions(screen.getByLabelText('Objekttyp'), type.id);
  await userEvent.click(screen.getByRole('button', { name: 'Egna fält' }));
  await userEvent.type(screen.getByLabelText('Leverantör'), 'Exempelsol');
  await userEvent.type(screen.getByLabelText('Effekt'), '12.5');
  await userEvent.type(screen.getByLabelText('Datum'), '2026-09-01');
  await userEvent.selectOptions(screen.getByLabelText('Batteri'), 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'utkast',
    ),
  );
  let proposal = await readDraftProposal('Paneler');
  expect(proposal.getByText('Nej', { exact: true })).toBeTruthy();
  await closeProposal();
  await save();
  await editTableObjectForm('Paneler');
  await userEvent.click(screen.getByRole('button', { name: 'Egna fält' }));
  await userEvent.clear(screen.getByLabelText('Leverantör'));
  await userEvent.clear(screen.getByLabelText('Effekt'));
  await userEvent.selectOptions(screen.getByLabelText('Batteri'), 'true');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'utkast',
    ),
  );
  proposal = await readDraftProposal('Paneler');
  const after = within(
    proposal.getByRole('heading', { name: 'Föreslagna värden' }).parentElement as HTMLElement,
  );
  expect(
    within(after.getByText('Leverantör', { exact: true }).closest('div') as HTMLElement).getByText(
      'Ej uppgivet',
    ),
  ).toBeTruthy();
  expect(after.getByText('Ja', { exact: true })).toBeTruthy();
  await closeProposal();
  await save();
  await editTableObjectForm('Paneler');
  await userEvent.click(screen.getByRole('button', { name: 'Egna fält' }));
  await userEvent.selectOptions(screen.getByLabelText('Batteri'), '');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'utkast',
    ),
  );
  await save();
  await openTypeEditor('Ändra typ: Solcellsanläggning', deadline);
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
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'utkast',
    ),
  );
  await openTypeEditor('Ändra typ: Solkraft', deadline);
  await userEvent.click(
    screen.getByRole('button', { name: 'Stäng typformuläret utan att skicka' }),
  );
  await save();
});

test('a conflicting type offers both current choices and never grants an implicit save', async () => {
  const deadline = performance.now() + 30_000;
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
  await resolveProperties([
    ['Namn', 'Ditt förslag', 'Mitt namn'],
    ['Beskrivning', 'Sparat i kartan nu', 'Rättad definition'],
  ]);
  expect(
    (await (await client.request(path)).json()).types.find(
      (item: { id: string }) => item.id === type.id,
    ).name,
  ).toBe('Annans namn');
  await save();
  await openTypeEditor('Ändra typ: Mitt namn', deadline);
  await userEvent.type(screen.getByLabelText('Typens namn'), ' igen');
  await userEvent.click(screen.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await waitFor(() =>
    expect(screen.getByRole('status', { name: 'Hushållsarbetets status' }).textContent).toContain(
      'utkast',
    ),
  );
  await other.json(`${path}/object-type`, {
    version: 2,
    id: type.id,
    baseRevision: 3,
    value: { name: 'Gemensamt namn', description: '', fields: [] },
  });
  await other.json(`${path}/save`, { version: 3, operationId: 'other-again' });
  cleanup();
  await open();
  await resolveProperties([
    ['Namn', 'Sparat i kartan nu', 'Gemensamt namn'],
    ['Beskrivning', 'Sparat i kartan nu', ''],
    ['Avsnitt', 'Sparat i kartan nu', 'Ej uppgivet'],
  ]);
  expect((await openDraftReview()).getByText('Utkastet är tomt.', { exact: true })).toBeTruthy();
  const current = (await (await client.request(path)).json()) as MapState;
  const basis = current.types.find((item) => item.id === type.id);
  if (!basis) throw new Error('The shared object type is missing from the fixture');
  await client.json(`${path}/object-type`, {
    version: current.draft.version,
    id: type.id,
    baseRevision: basis.revision,
    value: {
      name: 'Eget namn med nya avsnitt',
      description: '',
      fields: [],
      sections: [{ id: 'notes', name: 'Anteckningar' }],
      builtins: [{ key: 'description', name: 'Beskrivning', sectionId: 'notes' }],
      propertyOrder: ['builtin:description'],
    },
  });
  const theirs = (await (await other.request(path)).json()) as MapState;
  await other.json(`${path}/object-type`, {
    version: theirs.draft.version,
    id: type.id,
    baseRevision: basis.revision,
    value: { name: 'Senare gemensamt namn', description: '', fields: [] },
  });
  await other.json(`${path}/save`, {
    version: theirs.draft.version + 1,
    operationId: 'exact-presentation',
  });
  cleanup();
  await open();
  await resolveProperties([
    ['Namn', 'Ditt förslag', 'Eget namn med nya avsnitt'],
    ['Avsnitt', 'Sparat i kartan nu', 'Ej uppgivet'],
    ['Övriga uppgifter', 'Sparat i kartan nu', 'Ej uppgivet'],
    ['Uppgifternas ordning', 'Sparat i kartan nu', 'Ej uppgivet'],
  ]);
  const combined = ((await (await client.request(path)).json()) as MapState).draft.objectTypes?.[0]
    .after;
  expect(combined?.name).toBe('Eget namn med nya avsnitt');
  expect(combined).not.toHaveProperty('sections');
  expect(combined).not.toHaveProperty('builtins');
  expect(combined).not.toHaveProperty('propertyOrder');
});

test('abandoning an object form confirms text loss and filters clear without changing household content', async () => {
  await open();
  await add('Lo Rymdprov');
  await add('Kim Rymdprov');
  await save();
  const original = await (await client.request(path)).json();
  await editTableObjectForm('Lo Rymdprov');
  await userEvent.clear(screen.getByLabelText('Beskrivning'));
  await userEvent.type(screen.getByLabelText('Beskrivning'), 'Oskickad vytext');
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fortsätt redigera' }));
  expect((screen.getByLabelText('Beskrivning') as HTMLTextAreaElement).value).toBe(
    'Oskickad vytext',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  expect(screen.queryByLabelText('Beskrivning')).toBeNull();
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  const search = table.getByLabelText('Sök objekt i tabellen');
  await userEvent.type(search, 'Lo');
  await userEvent.click(table.getByRole('button', { name: /^Filter/ }));
  const filters = within(screen.getByRole('dialog', { name: 'Tabellens filter' }));
  await userEvent.click(filters.getByLabelText('Abonnemang'));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  expect(table.queryAllByRole('rowheader')).toHaveLength(0);
  await userEvent.click(table.getByRole('button', { name: /^Filter/ }));
  await userEvent.click(filters.getByRole('button', { name: 'Återställ sökning och filter' }));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  expect(table.getAllByRole('rowheader')).toHaveLength(2);
  expect(search).toHaveProperty('value', '');
  expect(await (await client.request(path)).json()).toEqual(original);
});

test('text-only table selection and confirmed form loss preserve household data without map graphics', async () => {
  await open();
  await add('Lo Urval');
  await add('Kim Urval');
  await save();
  const original = await (await client.request(path)).json();
  await userEvent.click(screen.getByRole('button', { name: 'Tabell' }));
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  await userEvent.click(table.getByRole('button', { name: 'Lo Urval' }));
  await userEvent.click(table.getByRole('button', { name: 'Kim Urval' }));
  expect(table.getAllByText('✓ Markerad')).toHaveLength(1);
  await editTableObjectForm('Lo Urval');
  const form = within(screen.getByRole('dialog', { name: 'Redigera Lo Urval' }));
  await userEvent.clear(form.getByLabelText('Beskrivning'));
  await userEvent.type(form.getByLabelText('Beskrivning'), 'Behåll utan kartgrafik');
  await userEvent.click(form.getByRole('button', { name: 'Stäng objektdialogen' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fortsätt redigera' }));
  expect(form.getByLabelText('Beskrivning')).toHaveProperty('value', 'Behåll utan kartgrafik');
  await userEvent.click(form.getByRole('button', { name: 'Stäng objektdialogen' }));
  await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
  const lo = table.getByRole('button', { name: 'Lo Urval' });
  if (lo.getAttribute('aria-expanded') !== 'true') await userEvent.click(lo);
  expect(table.getAllByText('✓ Markerad')).toHaveLength(1);
  expect(table.getByRole('button', { name: 'Ta bort Lo Urval' })).toBeTruthy();
  expect(await (await client.request(path)).json()).toEqual(original);
});

test('relationship lifecycle corrections preserve uncertain dates through private review and explicit saves', async () => {
  const user = userEvent.setup();
  const read = async (): Promise<MapState> => (await client.request(path)).json();
  const initial = await read();
  for (const [id, name, type] of [
    ['person', 'Lo Exempel', 'Person'],
    ['subscription', 'Familjemusik', 'Abonnemang'],
  ]) {
    expect(
      (
        await client.json(`${path}/draft`, {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: {
            typeId: initial.types.find((item) => item.name === type)?.id,
            name,
            description: '',
          },
        })
      ).status,
    ).toBe(200);
  }
  expect(
    (
      await client.json(`${path}/relationship`, {
        version: (await read()).draft.version,
        id: 'incoming',
        baseRevision: null,
        value: {
          sourceId: 'person',
          targetId: 'subscription',
          typeId: initial.relationshipTypes.find((item) => item.name === 'Använder')?.id,
          knowledge: 'known',
          lifecycle: 'ended',
          endDate: { knowledge: 'known', value: '2000-01-01' },
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await client.json(`${path}/save`, {
        version: (await read()).draft.version,
        operationId: 'initial-lifecycle',
      })
    ).status,
  ).toBe(200);
  const saved = await read();
  await open();
  const details = await openObjectRelationships('Lo Exempel');
  expect(details.getByText('Manuellt upphört', { exact: true })).toBeTruthy();
  expect(details.getByText('2000-01-01', { exact: true })).toBeTruthy();
  expect(details.getByText('Upphört', { exact: true })).toBeTruthy();
  await user.click(details.getByRole('button', { name: 'Redigera samband' }));
  let editor = within(screen.getByRole('dialog', { name: /^Samband för / }));
  await user.selectOptions(editor.getByLabelText('Sambandets status'), 'active');
  await user.selectOptions(
    editor.getByLabelText('Sambandets slutdatum: uppgiftens säkerhet'),
    'uncertain',
  );
  expect(
    (editor.getByLabelText('Sambandets slutdatum', { exact: true }) as HTMLInputElement).value,
  ).toBe('2000-01-01');
  await stageRelationship();
  const review = await readDraftProposal('Lo Exempel → Använder → Familjemusik');
  expect(review.getByText('Gäller fortfarande', { exact: true })).toBeTruthy();
  expect(review.getByText('Manuellt upphört', { exact: true })).toBeTruthy();
  expect(review.getByText('2000-01-01', { exact: true })).toBeTruthy();
  expect(review.getByText('2000-01-01 (Osäkert uppgivet)', { exact: true })).toBeTruthy();
  await closeProposal();
  const staged = await read();
  expect(staged.objects).toEqual(saved.objects);
  expect(staged.relationships).toEqual(saved.relationships);
  expect(staged.draft.relationships).toHaveLength(1);
  expect(staged.draft.relationships?.[0]).toMatchObject({
    id: 'incoming',
    before: saved.relationships[0],
    after: {
      sourceId: 'person',
      targetId: 'subscription',
      lifecycle: 'active',
      endDate: { knowledge: 'uncertain', value: '2000-01-01' },
    },
  });
  await save();
  const active = await read();
  expect(active.objects).toEqual(saved.objects);
  expect(active.relationships).toHaveLength(1);
  expect(active.relationships[0]).toMatchObject({
    id: 'incoming',
    sourceId: 'person',
    targetId: 'subscription',
    lifecycle: 'active',
    endDate: { knowledge: 'uncertain', value: '2000-01-01' },
  });
  expect(active.draft.relationships ?? []).toEqual([]);
  expect(active.draft.changes).toEqual([]);
  const history = await (await client.request(`${path}/history`)).json();
  expect(history.history).toHaveLength(2);
  expect(history.history[1].operationId).toBe('initial-lifecycle');
  expect(history.history[0].relationships).toEqual([
    expect.objectContaining({
      id: 'incoming',
      before: saved.relationships[0],
      after: active.relationships[0],
    }),
  ]);
  const currentDetails = await openObjectRelationships('Lo Exempel');
  expect(currentDetails.getByText('Gäller fortfarande', { exact: true })).toBeTruthy();
  expect(currentDetails.queryByText('Upphört', { exact: true })).toBeNull();
  await user.click(currentDetails.getByRole('button', { name: 'Redigera samband' }));
  editor = within(screen.getByRole('dialog', { name: /^Samband för / }));
  await user.selectOptions(editor.getByLabelText('Sambandets status'), '');
  expect(
    (editor.getByLabelText('Sambandets slutdatum', { exact: true }) as HTMLInputElement).value,
  ).toBe('2000-01-01');
  expect(
    (editor.getByLabelText('Sambandets slutdatum: uppgiftens säkerhet') as HTMLSelectElement).value,
  ).toBe('uncertain');
  await stageRelationship();
  const followingReview = await readDraftProposal('Lo Exempel → Använder → Familjemusik');
  expect(followingReview.getByText('Följ slutdatum', { exact: true })).toBeTruthy();
  await closeProposal();
  const following = await read();
  expect(following.relationships).toEqual(active.relationships);
  expect(following.draft.relationships?.[0].before).toEqual(active.relationships[0]);
  expect(following.draft.relationships?.[0].after).not.toHaveProperty('lifecycle');
  expect(following.draft.relationships?.[0].after?.endDate).toEqual({
    knowledge: 'uncertain',
    value: '2000-01-01',
  });
  await save();
  const final = await read();
  expect(final.objects).toEqual(saved.objects);
  expect(final.relationships).toHaveLength(1);
  expect(final.relationships[0]).toMatchObject({
    id: 'incoming',
    sourceId: 'person',
    targetId: 'subscription',
    endDate: { knowledge: 'uncertain', value: '2000-01-01' },
  });
  expect(final.relationships[0]).not.toHaveProperty('lifecycle');
  expect(final.draft.relationships ?? []).toEqual([]);
  expect(final.draft.changes).toEqual([]);
  const finalDetails = await openObjectRelationships('Lo Exempel');
  expect(finalDetails.getByText('Följ slutdatum', { exact: true })).toBeTruthy();
  expect(finalDetails.getByText('2000-01-01 (Osäkert uppgivet)', { exact: true })).toBeTruthy();
  expect(finalDetails.queryByText('Upphört', { exact: true })).toBeNull();
});
