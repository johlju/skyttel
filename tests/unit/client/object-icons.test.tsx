import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import {
  editTableObjectForm,
  openNewObjectForm,
  renderHouseholdWork,
} from '../../support/native-household-unit.js';
import { applicationFixture } from '../server/fixture.js';
import { propertyInput } from './property-controls.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let failure = 0;
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
    value: {
      typeId: state.types[0].id,
      name: 'Lo Exempel',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Befintlig text' },
      ],
    },
  });
  failure = 0;
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url.endsWith('/object-form') && failure)
      return Response.json(
        { error: failure === 409 ? 'draft_conflict' : 'forbidden' },
        { status: failure },
      );
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
async function open() {
  renderHouseholdWork(householdId);
  const form = await editTableObjectForm('Lo Exempel');
  await userEvent.click(form.getByRole('button', { name: 'Livscykel och utseende' }));
  return form;
}

test('Swedish and canonical icon searches change only the form until the whole proposal is staged', async () => {
  const form = await open();
  const before = await read();
  const picker = within(form.getByRole('region', { name: 'Ikon' }));
  const search = picker.getByRole('searchbox', { name: 'Sök ikon' });
  await userEvent.type(search, 'cykel');
  await userEvent.click(picker.getByRole('button', { name: 'Välj Cykel' }));
  expect(await read()).toEqual(before);
  await userEvent.clear(search);
  await userEvent.type(search, 'telescope');
  await userEvent.click(picker.getByRole('button', { name: 'Välj telescope' }));
  await userEvent.click(form.getByRole('button', { name: 'Grunduppgifter' }));
  await userEvent.type(await propertyInput(form, 'Beskrivning'), ' och nytt');
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((await read()).draft.changes[0].after).toMatchObject({
    iconId: 'telescope',
    properties: expect.arrayContaining([
      expect.objectContaining({ label: 'Beskrivning', value: 'Befintlig text och nytt' }),
    ]),
  });
  expect((await read()).objects).toEqual([]);
});

test.each([401, 403, 409, 503])(
  'complete icon proposal rejection %s preserves the existing draft',
  async (status) => {
    const form = await open();
    const before = await read();
    await userEvent.type(form.getByRole('searchbox', { name: 'Sök ikon' }), 'bike');
    await userEvent.click(form.getByRole('button', { name: 'Välj Cykel' }));
    failure = status;
    await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        status === 401 || status === 403
          ? 'inte längre tillgång'
          : status === 503
            ? 'oklart'
            : 'uppgifter finns kvar',
      ),
    );
    expect(await read()).toEqual(before);
    if (status === 401 || status === 403) expect(screen.queryByRole('dialog')).toBeNull();
    else {
      expect(form.getByRole('button', { name: 'Välj Cykel' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
      if (status === 503)
        expect(
          (form.getByRole('button', { name: 'Lägg i utkastet och stäng' }) as HTMLButtonElement)
            .disabled,
        ).toBe(true);
    }
  },
);

test('an icon cannot create a partial proposal when the complete new object lacks a name', async () => {
  renderHouseholdWork(householdId);
  const form = await openNewObjectForm();
  const before = await read();
  await userEvent.click(form.getByRole('button', { name: 'Livscykel och utseende' }));
  await userEvent.type(form.getByRole('searchbox', { name: 'Sök ikon' }), 'bike');
  await userEvent.click(form.getByRole('button', { name: 'Välj Cykel' }));
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  expect(form.getByRole('alert').textContent).toContain('Namn');
  expect(await read()).toEqual(before);
});
