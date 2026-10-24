import { type APIRequestContext, request } from '@playwright/test';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { WebGLRenderer } from 'three';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { createHousehold, signIn } from '../../support/client.js';
import { prepareHouseholdReading } from '../../support/household-reading.js';
import { createInstallation } from '../../support/installation.js';
import {
  editTableObjectForm,
  openDraftReview,
  openObjectRelationships,
  renderHouseholdWork,
  saveHouseholdDraft,
} from '../../support/native-household-unit.js';
import { prepareObjectSearch } from '../../support/object-search.js';
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
  await client.dispose();
  await installation.close();
});

async function tableSearchFixture() {
  const fixture = await prepareObjectSearch(client, installation.origin);
  const householdId = fixture.path.split('/households/')[1].split('/')[0];
  renderHouseholdWork(householdId);
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  await userEvent.click(tools.getByRole('button', { name: 'Tabell' }));
  const table = within(await screen.findByRole('region', { name: 'Hushållets tabell' }));
  await table.findByRole('button', { name: 'A 2' });
  return { ...fixture, tools, table };
}

async function filterDialog(table: ReturnType<typeof within>) {
  await userEvent.click(table.getByRole('button', { name: /^Filter/ }));
  return within(await screen.findByRole('dialog', { name: 'Tabellens filter' }));
}

test('table and map searches normalize Swedish own fields independently and never search unrelated relationships', async () => {
  const fixture = await tableSearchFixture();
  const before = await fixture.read();
  const query = fixture.table.getByLabelText('Sök objekt i tabellen');
  await userEvent.type(query, 'O\u0308VRIGT E\u0301LAN ÄPPLE');
  expect(fixture.table.getByRole('button', { name: 'Övrigt Élan' })).toBeTruthy();
  expect(fixture.table.queryByRole('button', { name: 'A 2' })).toBeNull();
  await userEvent.clear(query);
  await userEvent.type(query, 'hemlig anteckning');
  expect(fixture.table.getByText('Träff i Anteckning')).toBeTruthy();
  await userEvent.click(fixture.tools.getByRole('button', { name: 'Karta' }));
  await userEvent.click(screen.getByRole('searchbox', { name: 'Sök objekt i kartan' }));
  const map = within(await screen.findByRole('region', { name: 'Kartans sökning och filter' }));
  const mapQuery = map.getByLabelText('Sök objekt i kartan');
  expect((mapQuery as HTMLInputElement).value).toBe('');
  await userEvent.type(mapQuery, 'endast i sambandet');
  expect(map.queryByRole('heading', { name: 'Inga objekt matchar' })).toBeNull();
  await userEvent.click(map.getByRole('button', { name: 'Rensa sökning' }));
  await userEvent.type(mapQuery, 'hemlig');
  expect(map.queryByRole('list', { name: 'Matchande detaljfält' })).toBeNull();
  await userEvent.keyboard('{Escape}');
  expect((mapQuery as HTMLInputElement).value).toBe('hemlig');
  await userEvent.click(fixture.tools.getByRole('button', { name: 'Tabell' }));
  expect((query as HTMLInputElement).value).toBe('hemlig anteckning');
  expect(await fixture.read()).toEqual(before);
}, 30_000);

test('table filters compose actual type, selected, ended, removed and proposal states while clear preserves filters', async () => {
  const fixture = await tableSearchFixture();
  const before = await fixture.read();
  await userEvent.click(fixture.table.getByRole('button', { name: 'A 2' }));
  const query = fixture.table.getByLabelText('Sök objekt i tabellen');
  await userEvent.type(query, '100 000');
  expect(fixture.table.getByRole('button', { name: 'A 2' })).toBeTruthy();
  expect(fixture.table.getByText('Träff i Beviljat kreditutrymme')).toBeTruthy();
  const filters = await filterDialog(fixture.table);
  await userEvent.click(filters.getByLabelText('Typ 2'));
  await userEvent.click(filters.getByLabelText('Bara markerade (1)'));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  await userEvent.click(fixture.table.getByRole('button', { name: 'Rensa sökning' }));
  expect(fixture.table.getByRole('button', { name: 'A 2' })).toBeTruthy();
  expect(fixture.table.queryByRole('button', { name: 'A 10' })).toBeNull();
  const next = await filterDialog(fixture.table);
  expect((next.getByLabelText('Typ 2') as HTMLInputElement).checked).toBe(true);
  expect((next.getByLabelText('Bara markerade (1)') as HTMLInputElement).checked).toBe(true);
  await userEvent.click(next.getByLabelText('Bara markerade (1)'));
  await userEvent.click(next.getByLabelText('Ta med upphörda'));
  await userEvent.click(next.getByLabelText('Ta med borttagna'));
  await userEvent.click(next.getByLabelText('Föreslagen borttagning'));
  await userEvent.click(next.getByRole('button', { name: 'Stäng filter' }));
  expect(fixture.table.getByRole('button', { name: 'Tas bort prov' })).toBeTruthy();
  expect(fixture.table.queryByRole('button', { name: 'A 2' })).toBeNull();
  const proposals = await filterDialog(fixture.table);
  await userEvent.click(proposals.getByLabelText('Föreslagen borttagning'));
  await userEvent.click(proposals.getByLabelText('Typ 2'));
  await userEvent.click(proposals.getByRole('button', { name: 'Stäng filter' }));
  await userEvent.type(query, 'Borttaget prov');
  await userEvent.click(fixture.table.getByRole('button', { name: 'Borttaget prov' }));
  expect(
    fixture.table.getByText('Borttaget', {
      selector: '.household-table tr[data-selected] td span',
    }),
  ).toBeTruthy();
  expect(fixture.table.queryByRole('button', { name: 'Redigera Borttaget prov' })).toBeNull();
  expect(fixture.table.queryByRole('button', { name: 'Visa Borttaget prov i kartan' })).toBeNull();
  expect(await fixture.read()).toEqual(before);
}, 30_000);

test('sorting and pagination preserve numeric Swedish order and resetting a no-match query returns the complete current table', async () => {
  const fixture = await tableSearchFixture();
  const before = await fixture.read();
  const pages = within(fixture.table.getByRole('navigation', { name: 'Tabellsidor' }));
  expect(pages.getByRole('status').textContent).toContain('Sida 1 av 2');
  await userEvent.click(pages.getByRole('button', { name: 'Nästa' }));
  expect(pages.getByRole('status').textContent).toContain('Sida 2 av 2');
  expect(fixture.table.getByRole('button', { name: 'Övrigt Élan' })).toBeTruthy();
  await userEvent.click(pages.getByRole('button', { name: 'Föregående' }));
  const rows = fixture.table.getAllByRole('row').filter((row) => row.hasAttribute('data-selected'));
  expect(
    rows.slice(0, 2).map((row) => within(row).getByRole('button', { name: /^A / }).textContent),
  ).toEqual(['▸A 2', '▸A 10']);
  await userEvent.click(fixture.table.getByRole('button', { name: 'Namn' }));
  expect(
    fixture.table.getAllByRole('row').find((row) => row.hasAttribute('data-selected'))?.textContent,
  ).toContain('Övrigt Élan');
  await userEvent.click(fixture.table.getByRole('button', { name: 'Typ' }));
  await userEvent.click(fixture.table.getByRole('button', { name: 'Typ' }));
  await userEvent.type(fixture.table.getByLabelText('Sök objekt i tabellen'), 'hittas aldrig');
  expect(fixture.table.queryAllByRole('rowheader')).toHaveLength(0);
  const filters = await filterDialog(fixture.table);
  await userEvent.click(filters.getByRole('button', { name: 'Återställ sökning och filter' }));
  await userEvent.click(filters.getByRole('button', { name: 'Stäng filter' }));
  expect(pages.getByRole('status').textContent).toContain('Sida 1 av 2');
  expect(await fixture.read()).toEqual(before);
}, 30_000);

async function readingFixture() {
  const fixture = await prepareHouseholdReading(client, installation.origin, false);
  const householdId = fixture.path.split('/households/')[1].split('/')[0];
  // biome-ignore lint/complexity/useArrowFunction: The renderer mock must support new.
  vi.mocked(WebGLRenderer).mockImplementationOnce(function () {
    throw new Error('Synthetic WebGL unavailable');
  });
  renderHouseholdWork(householdId);
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  await screen.findByText('Rymdkartan kan inte visas. Använd Tabell för att fortsätta.');
  await userEvent.click(tools.getByRole('button', { name: 'Tabell' }));
  const table = within(await screen.findByRole('region', { name: 'Hushållets tabell' }));
  await table.findByRole('button', { name: 'Alex' });
  return { ...fixture, householdId, tools, table };
}

test.each([
  [
    'assistant_session_expired',
    'Samtalet är inte längre tillgängligt. Inget sparades av detta försök. Ladda om sidan, granska utkastet och försök spara igen.',
  ],
  [
    'assistant_busy',
    'Skyttel arbetar fortfarande i samtalet. Inget sparades av detta försök. Vänta tills arbetet är klart eller avbryt det, granska utkastet och försök spara igen.',
  ],
])('manual save explains %s without presenting a map conflict', async (code, expected) => {
  const fixture = await prepareHouseholdReading(client, installation.origin, false);
  const before = await fixture.read();
  const transport = authenticatedHttpFetch(client, installation.origin);
  vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (String(input).endsWith('/map/operations') && init?.method === 'POST')
      return new Response(JSON.stringify({ error: code }), { status: 409 });
    return transport(input, init);
  });
  renderHouseholdWork(fixture.path.split('/households/')[1].split('/')[0]);
  const draft = await openDraftReview();
  await userEvent.click(draft.getByRole('button', { name: 'Spara hela utkastet' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Spara utkastet' }));
  expect(await dialog.findByText(expected)).toBeTruthy();
  expect(await fixture.read()).toEqual(before);
});

test('textual object removal works without graphics and stages every incident saved or proposed relationship without changing shared facts', async () => {
  const fixture = await readingFixture();
  const before = await fixture.read();
  const history = await (await client.get(`${fixture.path}/history`)).json();
  const removal = fixture.table.getByRole('button', { name: 'Ta bort Cykel' });
  expect(
    (
      fixture.table.getByRole('button', {
        name: 'Visa samband för Cykel i kartan',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    document.getElementById(removal.getAttribute('aria-describedby') ?? '')?.textContent,
  ).toContain('Objektet och dess 4 samband');
  expect(await fixture.read()).toEqual(before);
  await userEvent.click(removal);
  await waitFor(async () =>
    expect((await fixture.read()).draft.changes.find(({ id }) => id === 'bike')?.after).toBeNull(),
  );
  const after = await fixture.read();
  expect(after.objects).toEqual(before.objects);
  expect(after.relationships).toEqual(before.relationships);
  expect(after.draft.relationships?.map(({ id, after }) => [id, after]).sort()).toEqual([
    ['alex-bike', null],
    ['bike-garage', null],
    ['bike-none', null],
    ['bike-unknown', null],
  ]);
  expect(await (await client.get(`${fixture.path}/history`)).json()).toEqual(history);
  expect((removal as HTMLButtonElement).disabled).toBe(true);
  const draft = await openDraftReview();
  expect(draft.getByRole('button', { name: 'Visa förslaget: Cykel' })).toBeTruthy();
  await saveHouseholdDraft();
  expect((await fixture.read()).objects.some(({ id }) => id === 'bike')).toBe(false);
  expect((await fixture.read()).relationships).toEqual([]);
}, 30_000);

test('textual actions edit the same native object form and a dirty form blocks abandoning work until an explicit discard', async () => {
  const fixture = await readingFixture();
  const before = await fixture.read();
  await editTableObjectForm('Alex');
  const form = within(await screen.findByRole('dialog', { name: 'Redigera Alex' }));
  await userEvent.type(form.getByLabelText('Namn'), ' förslag');
  await userEvent.click(form.getByRole('button', { name: 'Avbryt' }));
  const loss = within(await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' }));
  await userEvent.click(loss.getByRole('button', { name: 'Fortsätt redigera' }));
  expect((form.getByLabelText('Namn') as HTMLInputElement).value).toBe('Alex förslag');
  expect(await fixture.read()).toEqual(before);
  await userEvent.click(form.getByRole('button', { name: 'Avbryt' }));
  const confirmedLoss = within(
    await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' }),
  );
  await userEvent.click(
    confirmedLoss.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(await fixture.read()).toEqual(before);
}, 30_000);

for (const delivered of [false, true]) {
  test(`native object staging checks a lost ${delivered ? 'committed' : 'undelivered'} reply before allowing transition or retry`, async () => {
    const fixture = await readingFixture();
    const before = await fixture.read();
    const form = await editTableObjectForm('Alex');
    await userEvent.type(form.getByLabelText('Namn'), ' Lind');
    const actualFetch = authenticatedHttpFetch(client, installation.origin);
    let lost = true;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/object-form') && lost) {
        lost = false;
        if (delivered) await actualFetch(input, init);
        throw new TypeError('Controlled lost object staging reply');
      }
      return actualFetch(input, init);
    });
    await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och öppna samband' }));
    await waitFor(() => expect(form.getByRole('alert').textContent).toContain('Det är oklart'));
    expect(
      (form.getByRole('button', { name: 'Lägg i utkastet och stäng' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await userEvent.click(
      form.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
    );
    if (!delivered) {
      await waitFor(() =>
        expect(
          (form.getByRole('button', { name: 'Lägg i utkastet och stäng' }) as HTMLButtonElement)
            .disabled,
        ).toBe(false),
      );
      expect(await fixture.read()).toEqual(before);
      expect((form.getByLabelText('Namn') as HTMLInputElement).value).toBe('Alex Lind');
      await userEvent.click(
        form.getByRole('button', { name: 'Lägg i utkastet och öppna samband' }),
      );
    }
    await screen.findByRole('dialog', { name: 'Samband för Alex Lind' });
    const after = await fixture.read();
    expect(after.draft.version).toBe(before.draft.version + 1);
    expect(after.draft.changes.find(({ id }) => id === 'alex')?.after?.name).toBe('Alex Lind');
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
  }, 30_000);
}

async function emptyHousehold() {
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.get(path)).json();
  const post = async (route: string, body: object) => {
    const before = await read();
    const response = await client.post(`${path}/${route}`, {
      headers: { origin: installation.origin },
      data: { version: before.draft.version, contentVersion: before.contentVersion, ...body },
    });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  return { householdId: household.id as string, path, read, post };
}

async function typeSettings() {
  const settings = within(await screen.findByRole('region', { name: 'Typer' }));
  await settings.findByRole('button', { name: 'Ny objekttyp' });
  const summary = settings.getByText('Objekttyper');
  if (!summary.closest('details')?.open) await userEvent.click(summary);
  return settings;
}

test('type explanation edits and unused type removal stay private until explicitly saved', async () => {
  const fixture = await emptyHousehold();
  await fixture.post('object-type', {
    id: 'configured',
    baseRevision: null,
    value: {
      name: 'Provfält',
      description: '',
    },
  });
  await fixture.post('save', { operationId: 'configured-type' });
  const before = await fixture.read();
  renderHouseholdWork(fixture.householdId);
  const settings = await typeSettings();
  await userEvent.click(settings.getByRole('button', { name: 'Ändra typ: Provfält' }));
  const form = within(settings.getByRole('group', { name: 'Objekttypens definition' }));
  await userEvent.type(
    form.getByLabelText('Typens beskrivning'),
    'En uppgift med gemensam betydelse',
  );
  await userEvent.click(form.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }));
  await waitFor(() =>
    expect(settings.queryByRole('group', { name: 'Objekttypens definition' })).toBeNull(),
  );
  const after = await fixture.read();
  expect(after.types).toEqual(before.types);
  const proposal = after.draft.objectTypes?.find(({ id }) => id === 'configured');
  expect(proposal?.after).toMatchObject({
    name: 'Provfält',
    description: 'En uppgift med gemensam betydelse',
  });
  await userEvent.click(settings.getByRole('button', { name: 'Ändra typ: Provfält' }));
  await userEvent.click(settings.getByRole('button', { name: 'Ta bort objekttypen' }));
  await waitFor(async () =>
    expect(
      (await fixture.read()).draft.objectTypes?.find(({ id }) => id === 'configured')?.after,
    ).toBeNull(),
  );
  expect((await fixture.read()).types).toEqual(before.types);
}, 30_000);

test('a used type rejects definition removal without losing the type form or private properties', async () => {
  const fixture = await readingFixture();
  const before = await fixture.read();
  const settings = await typeSettings();
  await userEvent.click(settings.getByRole('button', { name: 'Ändra typ: Läsobjekt' }));
  const form = within(settings.getByRole('group', { name: 'Objekttypens definition' }));
  await userEvent.type(form.getByLabelText('Typens namn'), ' med oskickad text');
  await userEvent.click(form.getByRole('button', { name: 'Ta bort objekttypen' }));
  await screen.findByText(/Typen används fortfarande i kartan eller privata utkast/);
  expect(await fixture.read()).toEqual(before);
  expect(form.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' })).toBeTruthy();
}, 30_000);
for (const outcome of ['absent', 'committed', 'duplicate', 'changed-duplicate'] as const) {
  test(`a lost relationship reply checks the authoritative ${outcome} result while preserving unrelated private work`, async () => {
    const fixture = await readingFixture();
    const before = await fixture.read();
    const dialog = await openObjectRelationships('Alex');
    await userEvent.click(dialog.getByRole('button', { name: 'Nytt samband' }));
    const form = within(dialog.getByRole('region', { name: 'Nytt samband' }));
    await userEvent.selectOptions(form.getByLabelText('Sambandstyp'), 'uses');
    await userEvent.selectOptions(
      form.getByLabelText('Till objekt'),
      outcome.includes('duplicate') ? 'bike' : 'garage',
    );
    const actual = authenticatedHttpFetch(client, installation.origin);
    let dropped = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!dropped && String(input).endsWith('/relationship-form') && init?.method === 'POST') {
        dropped = true;
        if (outcome !== 'absent') await actual(input, init);
        throw new TypeError('Synthetic delivery loss at the real HTTP boundary');
      }
      return actual(input, init);
    });
    await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet' }));
    await form.findByText(/Det är oklart om ändringen lades i utkastet/);
    expect(form.getByRole('button', { name: 'Lägg i utkastet' }).matches(':disabled')).toBe(true);
    expect(form.getByRole('button', { name: 'Avbryt redigeringen' }).matches(':disabled')).toBe(
      true,
    );
    if (outcome === 'changed-duplicate') {
      const existing = before.relationships.find((edge) => edge.id === 'alex-bike');
      if (!existing) throw new Error('Missing saved duplicate');
      await fixture.post('relationship', {
        id: existing.id,
        baseRevision: existing.revision,
        value: { ...existing, targetId: 'garage' },
      });
    }
    await userEvent.click(
      form.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
    );
    if (outcome === 'absent') {
      await form.findByText(/Kontrollen visar att ändringen inte lades i utkastet/);
      expect(await fixture.read()).toEqual(before);
      expect((form.getByLabelText('Till objekt') as HTMLSelectElement).value).toBe('garage');
      await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet' }));
      await waitFor(() =>
        expect(dialog.queryByRole('region', { name: 'Nytt samband' })).toBeNull(),
      );
    } else if (outcome === 'committed') {
      await waitFor(() =>
        expect(dialog.queryByRole('region', { name: 'Nytt samband' })).toBeNull(),
      );
    } else if (outcome === 'duplicate') {
      await form.findByText('Sambandet finns redan');
      expect(await fixture.read()).toEqual(before);
      await userEvent.click(form.getByRole('button', { name: 'Redigera befintligt samband' }));
      const loss = within(await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' }));
      await userEvent.click(loss.getByRole('button', { name: 'Fortsätt redigera' }));
      expect((form.getByLabelText('Till objekt') as HTMLSelectElement).value).toBe('bike');
      expect(await fixture.read()).toEqual(before);
    } else {
      await form.findByText(/Försöket hittade ett befintligt samband, men det har ändrats/);
      expect(form.queryByRole('button', { name: 'Redigera befintligt samband' })).toBeNull();
      expect((form.getByLabelText('Till objekt') as HTMLSelectElement).value).toBe('bike');
      const current = await fixture.read();
      expect(
        current.draft.relationships?.find((edge) => edge.id === 'alex-bike')?.after?.targetId,
      ).toBe('garage');
    }
    const current = await fixture.read();
    expect(current.objects).toEqual(before.objects);
    expect(current.relationships).toEqual(before.relationships);
    expect(current.draft.changes).toEqual(before.draft.changes);
    expect(current.draft.relationships?.find((edge) => edge.id === 'bike-garage')).toEqual(
      before.draft.relationships?.find((edge) => edge.id === 'bike-garage'),
    );
    if (outcome === 'committed' || outcome === 'absent') {
      expect(current.draft.version).toBe(before.draft.version + 1);
      expect(
        current.draft.relationships?.filter(
          (edge) => edge.after?.sourceId === 'alex' && edge.after.targetId === 'garage',
        ),
      ).toHaveLength(1);
    }
  }, 30_000);
}
for (const committed of [false, true]) {
  test(`checking an ${committed ? 'earlier committed' : 'absent'} existing relationship attempt never overwrites a newer same-owner edit`, async () => {
    const fixture = await readingFixture();
    const before = await fixture.read();
    const edge = before.relationships.find((value) => value.id === 'alex-bike');
    if (!edge) throw new Error('Missing existing relationship');
    const dialog = await openObjectRelationships('Alex');
    await userEvent.click(
      within(relationshipRow(dialog, 'Alex → använder → Cykel')).getByRole('button', {
        name: 'Redigera samband',
      }),
    );
    const form = within(dialog.getByRole('region', { name: 'Redigera samband' }));
    const certainty = await propertyInput(form, 'Uppgiftens säkerhet');
    await userEvent.clear(certainty);
    await userEvent.type(certainty, 'Osäkert uppgivet');
    const actual = authenticatedHttpFetch(client, installation.origin);
    let dropped = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!dropped && String(input).endsWith('/relationship-form') && init?.method === 'POST') {
        dropped = true;
        if (committed) await actual(input, init);
        throw new TypeError('Synthetic lost delivery');
      }
      return actual(input, init);
    });
    await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet' }));
    await form.findByText(/Det är oklart om ändringen lades i utkastet/);
    await fixture.post('relationship', {
      id: edge.id,
      baseRevision: edge.revision,
      value: {
        ...edge,
        properties: [
          {
            id: 'later',
            label: 'Senare uppgift',
            kind: 'text',
            value: 'Senare oberoende rättelse',
          },
        ],
      },
    });
    const later = await fixture.read();
    await userEvent.click(
      form.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
    );
    await form.findByText(
      committed
        ? /Ändringen lades i utkastet, men det aktuella underlaget har ändrats/
        : /Kontrollen saknar en bevarad bekräftelse och utkastet har ändrats/,
    );
    expect(certainty).toHaveProperty('value', 'Osäkert uppgivet');
    expect(await fixture.read()).toEqual(later);
    if (!committed) {
      expect(form.getByRole('button', { name: 'Lägg i utkastet' }).matches(':disabled')).toBe(true);
      expect(form.getByRole('button', { name: 'Föreslå borttagning' }).matches(':disabled')).toBe(
        true,
      );
    }
    await userEvent.click(form.getByRole('button', { name: 'Avbryt redigeringen' }));
    const loss = within(await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' }));
    await userEvent.click(loss.getByRole('button', { name: 'Fortsätt redigera' }));
    expect(certainty).toHaveProperty('value', 'Osäkert uppgivet');
    await userEvent.click(form.getByRole('button', { name: 'Avbryt redigeringen' }));
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' })).getByRole(
        'button',
        { name: 'Kasta ändringarna och fortsätt' },
      ),
    );
    await waitFor(() =>
      expect(dialog.queryByRole('region', { name: 'Redigera samband' })).toBeNull(),
    );
    expect(await fixture.read()).toEqual(later);
    expect(later.objects).toEqual(before.objects);
    expect(later.relationships).toEqual(before.relationships);
    expect(later.draft.changes).toEqual(before.draft.changes);
  }, 30_000);
}

for (const kind of ['object', 'relationship'] as const) {
  test(`signing out in another client prevents a pending ${kind} form from staging private content`, async () => {
    const fixture = await readingFixture();
    const before = await fixture.read();
    const form =
      kind === 'object' ? await editTableObjectForm('Alex') : await openObjectRelationships('Alex');
    if (kind === 'object') {
      await userEvent.clear(form.getByLabelText('Namn'));
      await userEvent.type(form.getByLabelText('Namn'), 'Osänd uppgift');
    } else {
      await userEvent.click(form.getByRole('button', { name: 'Nytt samband' }));
      await userEvent.selectOptions(form.getByLabelText('Sambandstyp'), 'uses');
      await userEvent.selectOptions(form.getByLabelText('Till objekt'), 'garage');
    }
    const session = (await (await client.get(`${installation.origin}/api/bootstrap`)).json()).user;
    expect(session).toBeTruthy();
    const logout = await client.post(`${installation.origin}/api/auth/sign-out`, {
      headers: { origin: installation.origin },
      data: {},
    });
    expect(logout.status()).toBe(200);
    await userEvent.click(
      form.getByRole('button', {
        name: kind === 'object' ? 'Lägg i utkastet och stäng' : 'Lägg i utkastet',
      }),
    );
    await screen.findByText(
      'Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.',
    );
    expect(screen.queryByRole('region', { name: 'Hushållets tabell' })).toBeNull();
    expect(
      screen.queryByRole('dialog', {
        name: kind === 'object' ? 'Redigera Alex' : 'Samband för Alex',
      }),
    ).toBeNull();
    expect((await client.get(fixture.path)).status()).toBe(401);
    await signIn(client, installation.origin);
    expect(await fixture.read()).toEqual(before);
  }, 30_000);
}

function relationshipRow(dialog: ReturnType<typeof within>, name: string | RegExp) {
  const row = dialog.getByRole('heading', { name }).closest('li');
  if (!row) throw new Error('The public relationship reader must provide its row');
  return row;
}
test('a relationship form preserves properties across type changes, validates endpoints and stages the reversed complete relationship privately', async () => {
  const fixture = await readingFixture();
  const before = await fixture.read();
  const dialog = await openObjectRelationships('Cykel');
  await userEvent.click(
    within(relationshipRow(dialog, /Cykel → förvaras i → Garage/)).getByRole('button', {
      name: 'Redigera samband',
    }),
  );
  const form = within(dialog.getByRole('region', { name: 'Redigera samband' }));
  await userEvent.selectOptions(form.getByLabelText('Sambandstyp'), 'uses');
  await userEvent.click(form.getByRole('button', { name: 'Byt riktning' }));
  expect((form.getByLabelText('Från objekt') as HTMLSelectElement).value).toBe('garage');
  expect((form.getByLabelText('Till objekt') as HTMLSelectElement).value).toBe('bike');
  await userEvent.selectOptions(form.getByLabelText('Till objekt'), '');
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet' }));
  const errors = form.getByRole('alert');
  expect(errors.textContent).toContain('Till objekt');
  expect(await fixture.read()).toEqual(before);
  await userEvent.selectOptions(form.getByLabelText('Till objekt'), 'alex');
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet' }));
  await waitFor(() =>
    expect(dialog.queryByRole('region', { name: 'Redigera samband' })).toBeNull(),
  );
  const current = await fixture.read();
  expect(current.objects).toEqual(before.objects);
  expect(current.relationships).toEqual(before.relationships);
  expect(current.draft.changes).toEqual(before.draft.changes);
  expect(
    current.draft.relationships?.find((value) => value.id === 'bike-garage')?.after,
  ).toMatchObject({
    sourceId: 'garage',
    targetId: 'alex',
    typeId: 'uses',

    lifecycle: 'ended',
  });
  expect(
    current.draft.relationships?.find((value) => value.id === 'bike-garage')?.after?.properties,
  ).toEqual(
    before.draft.relationships?.find((value) => value.id === 'bike-garage')?.after?.properties,
  );
}, 30_000);

for (const kind of ['object', 'relationship'] as const) {
  test(`a stale ${kind} type form is rejected atomically, retains its text and requires current-basis review`, async () => {
    const fixture = await readingFixture();
    const original = await fixture.read();
    const definition =
      kind === 'object'
        ? original.types.find((type) => type.id === 'read-type')
        : original.relationshipTypes.find((type) => type.id === 'uses');
    if (!definition) throw new Error('Missing real current type definition');
    await fixture.post(kind === 'object' ? 'object-type' : 'relationship-type', {
      id: definition.id,
      baseRevision: definition.revision,
      value:
        kind === 'object'
          ? { ...definition, name: 'Provets typdefinition' }
          : {
              name: 'Provets typdefinition',
              description: definition.description,
              forwardLabel: 'forwardLabel' in definition ? definition.forwardLabel : '',
              reverseLabel: 'reverseLabel' in definition ? definition.reverseLabel : '',
            },
    });
    cleanup();
    renderHouseholdWork(fixture.path.split('/households/')[1].split('/')[0]);
    const settings = await typeSettings();
    if (kind === 'relationship')
      await userEvent.click(settings.getByText('Sambandstyper och riktning'));
    await userEvent.click(
      settings.getByRole('button', {
        name:
          kind === 'object'
            ? 'Ändra typ: Provets typdefinition'
            : 'Ändra sambandstyp: Provets typdefinition',
      }),
    );
    const form = within(
      settings.getByRole('group', {
        name: kind === 'object' ? 'Objekttypens definition' : 'Sambandstypens definition',
      }),
    );
    const name = form.getByLabelText(kind === 'object' ? 'Typens namn' : 'Sambandstypens namn');
    await userEvent.clear(name);
    await userEvent.type(name, 'Osänd typbenämning');
    const before = await fixture.read();
    const alex = before.objects.find((value) => value.id === 'alex');
    if (!alex) throw new Error('Missing saved object');
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
            value: 'En senare oberoende uppgift',
          },
        ],
      },
    });
    const later = await fixture.read();
    await userEvent.click(
      form.getByRole('button', {
        name:
          kind === 'object'
            ? 'Lägg typförslaget i mitt utkast'
            : 'Lägg sambandstypen i mitt utkast',
      }),
    );
    await screen.findByText(/Avvisat: Förslaget eller kartan har ändrats/);
    expect((name as HTMLInputElement).value).toBe('Osänd typbenämning');
    expect(await fixture.read()).toEqual(later);
    await userEvent.click(screen.getByRole('button', { name: 'Hämta aktuellt underlag' }));
    await form.findByText(/Formuläret bygger på ett äldre utkast/);
    expect(
      form
        .getByRole('button', {
          name:
            kind === 'object'
              ? 'Lägg typförslaget i mitt utkast'
              : 'Lägg sambandstypen i mitt utkast',
        })
        .matches(':disabled'),
    ).toBe(true);
    expect((name as HTMLInputElement).value).toBe('Osänd typbenämning');
    expect(await fixture.read()).toEqual(later);
  }, 30_000);
}

test('search retains free property values across an object type change', async () => {
  const fixture = await readingFixture();
  const before = await fixture.read();
  const replacement = before.types.find((type) => type.id !== 'read-type');
  if (!replacement) throw new Error('Missing ordinary alternative object type');
  const form = await editTableObjectForm('Cykel');
  await userEvent.selectOptions(form.getByLabelText('Objekttyp'), replacement.id);
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Redigera Cykel' })).toBeNull());
  const current = await fixture.read();
  expect(current.objects).toEqual(before.objects);
  const proposal = current.draft.changes.find((value) => value.id === 'bike');
  expect(proposal?.after?.typeId).toBe(replacement.id);
  expect(proposal?.after?.properties).toEqual(
    before.draft.changes.find((value) => value.id === 'bike')?.after?.properties,
  );
  expect(proposal?.after?.properties).toContainEqual(
    expect.objectContaining({ value: 'Ramens märkning är ett påhittat exempel' }),
  );
  const table = within(screen.getByRole('region', { name: 'Hushållets tabell' }));
  const query = table.getByLabelText('Sök objekt i tabellen');
  await userEvent.type(query, 'ramens märkning');
  expect(table.getByRole('button', { name: 'Cykel' })).toBeTruthy();
  expect(table.getByText('Träff i Dold egen uppgift')).toBeTruthy();
  await userEvent.clear(query);
  await userEvent.type(query, 'Läsobjekt');
  expect(table.getByRole('button', { name: 'Cykel' })).toBeTruthy();
  expect(await fixture.read()).toEqual(current);
}, 30_000);

test('a type-only draft keeps proposal filters active until confirmed discard resets only proposal filters', async () => {
  const fixture = await emptyHousehold();
  await fixture.post('object-type', {
    id: 'only-type',
    baseRevision: null,
    value: { name: 'Tillfällig provtyp', description: '' },
  });
  const before = await fixture.read();
  renderHouseholdWork(fixture.householdId);
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  await waitFor(() =>
    expect(tools.getByRole('button', { name: 'Nytt objekt' }).matches(':disabled')).toBe(false),
  );
  await userEvent.click(tools.getByRole('button', { name: 'Karta' }));
  await userEvent.click(screen.getByRole('searchbox', { name: 'Sök objekt i kartan' }));
  let map = within(await screen.findByRole('region', { name: 'Kartans sökning och filter' }));
  await userEvent.type(map.getByLabelText('Sök objekt i kartan'), 'behåll sökningen');
  await userEvent.click(map.getByRole('button', { name: /^Filter/ }));
  await userEvent.click(map.getByLabelText('Tillfällig provtyp'));
  await userEvent.click(map.getByLabelText('Bara markerade (0)'));
  await userEvent.click(map.getByLabelText('Ta med upphörda'));
  await userEvent.click(map.getByLabelText('Nytt'));
  expect((map.getByLabelText('Nytt') as HTMLInputElement).checked).toBe(true);
  expect(map.queryByText('Utkastfiltret är återställt eftersom ditt utkast är tomt.')).toBeNull();
  await userEvent.click(map.getByLabelText('Sök objekt i kartan'));
  await userEvent.keyboard('{Escape}');
  expect((map.getByLabelText('Sök objekt i kartan') as HTMLInputElement).value).toBe(
    'behåll sökningen',
  );
  expect(map.getByRole('button', { name: 'Filter · aktiva' })).toBeTruthy();
  expect(await fixture.read()).toEqual(before);
  const draft = await openDraftReview();
  await userEvent.click(draft.getByRole('button', { name: 'Kasta hela utkastet' }));
  let discard = within(await screen.findByRole('dialog', { name: 'Ta bort hela utkastet?' }));
  await userEvent.click(discard.getByRole('button', { name: 'Avbryt' }));
  expect(await fixture.read()).toEqual(before);
  await userEvent.click(draft.getByRole('button', { name: 'Kasta hela utkastet' }));
  discard = within(await screen.findByRole('dialog', { name: 'Ta bort hela utkastet?' }));
  await userEvent.click(discard.getByRole('button', { name: 'Ta bort hela utkastet' }));
  await draft.findByText('Utkastet är tomt.');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng textvyn' }));
  expect(
    await screen.findByText('Utkastfiltret är återställt eftersom ditt utkast är tomt.'),
  ).toBeTruthy();
  await userEvent.click(tools.getByRole('button', { name: 'Karta' }));
  await userEvent.click(screen.getByRole('searchbox', { name: 'Sök objekt i kartan' }));
  map = within(await screen.findByRole('region', { name: 'Kartans sökning och filter' }));
  expect((map.getByLabelText('Sök objekt i kartan') as HTMLInputElement).value).toBe(
    'behåll sökningen',
  );
  await userEvent.click(map.getByRole('button', { name: /^Filter/ }));
  expect((map.getByLabelText('Bara markerade (0)') as HTMLInputElement).checked).toBe(true);
  expect((map.getByLabelText('Ta med upphörda') as HTMLInputElement).checked).toBe(true);
  expect(map.queryByLabelText('Nytt')).toBeNull();
  const current = await fixture.read();
  expect(current.objects).toEqual(before.objects);
  expect(current.relationships).toEqual(before.relationships);
  expect(current.draft.changes).toEqual([]);
  expect(current.draft.objectTypes ?? []).toEqual([]);
}, 30_000);
