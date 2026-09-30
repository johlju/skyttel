import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
  const state = await read();
  await client.json(`${path}/draft`, {
    id: 'person',
    version: 0,
    baseRevision: null,
    value: { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Befintlig text' },
  });
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
  const tools = within(await screen.findByRole('navigation', { name: 'Kartans verktyg' }));
  await userEvent.click(tools.getByLabelText('Lista', { selector: 'button' }));
  const list = within(await screen.findByRole('region', { name: 'Lista och utkast' }));
  await userEvent.click(
    await list.findByLabelText('Uppgifter för Lo Exempel', { selector: 'button' }),
  );
  const panel = within(await screen.findByRole('region', { name: 'Lo Exempel' }));
  await userEvent.click(panel.getByRole('button', { name: 'Redigera valt objekt' }));
  return within(panel.getByRole('group', { name: 'Objektets detaljer' }));
}
test('Swedish and canonical searches stage an icon into the same object proposal and preserve unsent text', async () => {
  const details = await open();
  const picker = within(details.getByRole('region', { name: 'Ikon' }));
  const search = picker.getByRole('searchbox', { name: 'Sök ikon' });
  await userEvent.type(search, 'cykel');
  await userEvent.click(picker.getByRole('button', { name: 'Välj Cykel' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  expect((await read()).draft.changes[0].after).toMatchObject({
    iconId: 'bike',
    description: 'Befintlig text',
  });
  await userEvent.type(details.getByLabelText('Beskrivning', { exact: true }), ' och nytt');
  expect((search as HTMLInputElement).disabled).toBe(true);
  await userEvent.click(picker.getByRole('button', { name: 'Lägg uppgifterna i utkastet först' }));
  await waitFor(() => expect(document.activeElement).toBe(search));
  await userEvent.clear(search);
  await userEvent.type(search, 'telescope');
  await userEvent.click(picker.getByRole('button', { name: 'Välj telescope' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  expect((await read()).draft.changes[0].after).toMatchObject({
    iconId: 'telescope',
    description: 'Befintlig text och nytt',
  });
  await userEvent.clear(search);
  await userEvent.type(search, 'xyz-no-icon');
  expect(picker.getByText(/Inga ikoner matchar/)).toBeTruthy();
  await userEvent.click(picker.getByRole('button', { name: 'Typens standardikon' }));
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  expect((await read()).draft.changes[0].after).not.toHaveProperty('iconId');
});

test('a delayed text proposal for the picker does not replace a newer search focus', async () => {
  const details = await open();
  const picker = within(details.getByRole('region', { name: 'Ikon' }));
  await userEvent.type(details.getByLabelText('Beskrivning'), ' och senare text');
  let reached = () => {};
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const response = await client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    });
    if (url.endsWith('/draft')) {
      reached();
      await held;
    }
    return response;
  });
  await userEvent.click(picker.getByRole('button', { name: 'Lägg uppgifterna i utkastet först' }));
  await ready;
  const search = screen.getByLabelText('Sök objekt');
  await userEvent.type(search, 'Lo');
  release();
  await screen.findByText('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  await waitFor(() =>
    expect(picker.queryByRole('button', { name: 'Lägg uppgifterna i utkastet först' })).toBeNull(),
  );
  expect(document.activeElement).toBe(search);
  expect((await read()).draft.changes[0].after?.description).toBe('Befintlig text och senare text');
});

test.each([403, 503])(
  'icon proposal failure %s preserves the earlier draft and reports the access or uncertain result',
  async (status) => {
    const details = await open();
    const picker = within(details.getByRole('region', { name: 'Ikon' }));
    await userEvent.type(picker.getByRole('searchbox'), 'bike');
    const before = await read();
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
      url.endsWith('/draft')
        ? Response.json({ error: status === 403 ? 'forbidden' : 'synthetic_failure' }, { status })
        : client.request(url, {
            ...init,
            headers: { ...init?.headers, origin: fixture.config.origin },
          }),
    );
    await userEvent.click(picker.getByRole('button', { name: 'Välj Cykel' }));
    await screen.findByRole('alert');
    expect(await read()).toEqual(before);
    if (status === 403) expect(screen.queryByRole('region', { name: 'Ikon' })).toBeNull();
    else expect((picker.getByRole('searchbox') as HTMLInputElement).disabled).toBe(true);
  },
);

test('a new object must contain valid details before its icon controls can create a proposal', async () => {
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Nytt objekt' }));
  const panel = within(screen.getByRole('region', { name: 'Nytt objekt' }));
  const stage = panel.getByRole('button', { name: 'Lägg uppgifterna i utkastet först' });
  await userEvent.click(stage);
  expect((await read()).draft.changes).toHaveLength(1);
  expect((panel.getByRole('searchbox') as HTMLInputElement).disabled).toBe(true);
  await userEvent.type(panel.getByLabelText('Objektets namn'), 'Ny sak');
  await userEvent.click(stage);
  await waitFor(() =>
    expect((panel.getByRole('searchbox') as HTMLInputElement).disabled).toBe(false),
  );
  expect((await read()).draft.changes).toHaveLength(2);
});
