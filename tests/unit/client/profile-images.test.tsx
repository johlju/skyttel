import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdMap } from '../../../src/client/HouseholdMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let failure: number;
const read = async (): Promise<MapState> => (await client.request(path)).json();
const file = async () =>
  new File(
    [
      new Uint8Array(
        await sharp({
          create: {
            width: 400,
            height: 200,
            channels: 3,
            background: '#557799',
          },
        })
          .png()
          .toBuffer(),
      ),
    ],
    'synthetic.png',
    { type: 'image/png' },
  );

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
  failure = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.includes('/profile-images/') && failure) {
      if (failure === 503) throw new Error('Synthetic network interruption');
      return Response.json(
        { error: failure === 409 ? 'client_outdated' : 'forbidden' },
        { status: failure },
      );
    }
    // jsdom's browser File reaches the real HTTP application as bytes, as in a browser.
    const body =
      init?.body instanceof File
        ? await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(init.body as File);
          })
        : init?.body;
    return client.request(url, {
      ...init,
      body,
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
  render(<HouseholdMap householdId={householdId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lo Exempel' }));
  await userEvent.click(screen.getByRole('button', { name: 'Redigera valt objekt' }));
  return within(screen.getByRole('group', { name: 'Objektets detaljer' }));
}

test('an image uploads to the real private draft, renders its reference and can be removed', async () => {
  const details = await open();
  await userEvent.upload(details.getByLabelText('Välj profilbild'), await file());
  await screen.findByText('Bildförslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  expect((await read()).draft.changes[0].after?.profileImageId).toBeTypeOf('string');
  expect(details.getByRole('img').getAttribute('src')).toContain('/profile-images/');
  fireEvent.error(details.getByRole('img'));
  expect(
    details.getByText('Profilbilden kunde inte hämtas. Hämta aktuellt underlag.'),
  ).toBeTruthy();
  await userEvent.upload(details.getByLabelText('Välj profilbild'), await file());
  await details.findByRole('img');
  await userEvent.click(details.getByRole('button', { name: 'Ta bort profilbild' }));
  await details.findByText('Ingen profilbild');
  expect((await read()).draft.changes[0].after).toMatchObject({ description: 'Befintlig text' });
  expect((await read()).draft.changes[0].after?.profileImageId).toBeUndefined();
});

test('invalid and oversized files give recoverable messages with earlier proposals intact', async () => {
  const details = await open();
  const before = await read();
  await userEvent.upload(
    details.getByLabelText('Välj profilbild'),
    new File(['invalid'], 'bad.png', { type: 'image/png' }),
  );
  await screen.findByText(/Bilden kunde inte behandlas/);
  expect(await read()).toEqual(before);
  await userEvent.upload(
    details.getByLabelText('Välj profilbild'),
    new File([new Uint8Array(10_000_001)], 'large.png', { type: 'image/png' }),
  );
  await screen.findByText(/Bilden är för stor/);
  expect(await read()).toEqual(before);
});

test.each([401, 403, 409, 503])(
  'image response %s preserves the draft and explains access or unknown outcome',
  async (status) => {
    const details = await open();
    const before = await read();
    failure = status;
    await userEvent.upload(details.getByLabelText('Välj profilbild'), await file());
    await screen.findByText(
      status === 401 || status === 403
        ? /Du har inte längre tillgång/
        : /Bildändringen kunde inte bekräftas/,
    );
    expect(await read()).toEqual(before);
    if (status === 401 || status === 403)
      expect(screen.queryByRole('group', { name: 'Objektets detaljer' })).toBeNull();
    else expect(details.getByDisplayValue('Befintlig text')).toBeTruthy();
  },
);
