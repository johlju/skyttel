import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
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
    value: {
      typeId: state.types[0].id,
      name: 'Lo Exempel',
      description: 'Befintlig text',
      iconId: 'bike',
    },
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
  const tools = within(await screen.findByLabelText('Kartans verktyg', { selector: 'nav' }));
  await userEvent.click(tools.getByLabelText('Lista', { selector: 'button' }));
  const list = within(
    await screen.findByLabelText('Lista och utkast', { selector: 'section:not([hidden])' }),
  );
  await userEvent.click(
    await list.findByLabelText('Uppgifter för Lo Exempel', { selector: 'button' }),
  );
  const panel = within(
    await screen.findByLabelText('Lo Exempel', { selector: 'section:not([hidden])' }),
  );
  await userEvent.click(panel.getByRole('button', { name: 'Redigera valt objekt' }));
  return within(panel.getByRole('group', { name: 'Objektets detaljer' }));
}

// Two real image uploads and a removal need more than the default budget under a loaded coverage run.
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
  expect(details.getByText('Ikon: Cykel')).toBeTruthy();
  await userEvent.upload(details.getByLabelText('Välj profilbild'), await file());
  await details.findByRole('img');
  await userEvent.click(details.getByRole('button', { name: 'Ta bort profilbild' }));
  await details.findByText('Ingen profilbild');
  expect((await read()).draft.changes[0].after).toMatchObject({
    description: 'Befintlig text',
    iconId: 'bike',
  });
  expect((await read()).draft.changes[0].after?.profileImageId).toBeUndefined();
}, 15_000);

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

// Allow the complete real-image, repeated-return and draft-rejection workflow to run under coverage.
test('an image error returns to the retained object and expires before an unrelated draft rejection', async () => {
  const user = userEvent.setup();
  let details = await open();
  await userEvent.upload(details.getByLabelText('Välj profilbild'), await file());
  await screen.findByText('Bildförslaget finns i ditt privata utkast. Kartan är inte ändrad.', {
    selector: '[role="status"]',
  });
  const before = await read();
  await userEvent.upload(
    details.getByLabelText('Välj profilbild'),
    new File(['invalid'], 'bad.png', { type: 'image/png' }),
  );
  await screen.findByText(/Bilden kunde inte behandlas/, { selector: '[role="alert"]' });
  const panel = within(screen.getByLabelText('Lo Exempel', { selector: 'section:not([hidden])' }));
  const status = within(
    screen.getByLabelText('Utkastets återkoppling', { selector: 'section:not([hidden])' }),
  );
  await userEvent.click(panel.getByLabelText('Stäng Lo Exempel', { selector: 'button' }));
  expect(screen.queryByRole('group', { name: 'Objektets detaljer' })).toBeNull();
  const returnName = 'Återgå till bilden för Lo Exempel';
  await userEvent.click(status.getByRole('button', { name: returnName }));
  expect(panel.getByRole('heading', { name: 'Lo Exempel' })).toBe(document.activeElement);
  expect(details.getByDisplayValue('Befintlig text')).toBeTruthy();
  expect(await read()).toEqual(before);
  await user.clear(details.getByLabelText('Beskrivning', { exact: true }));
  await user.paste('Kasta denna text');
  await userEvent.click(panel.getByRole('button', { name: 'Stäng utan att skicka texten' }));
  expect(screen.queryByRole('group', { name: 'Objektets detaljer' })).toBeNull();
  expect(await read()).toEqual(before);
  await userEvent.click(status.getByRole('button', { name: returnName }));
  const reopened = within(
    screen.getByLabelText('Lo Exempel', { selector: 'section:not([hidden])' }),
  );
  expect(reopened.getByRole('heading', { name: 'Lo Exempel' })).toBe(document.activeElement);
  details = within(reopened.getByRole('group', { name: 'Objektets detaljer' }));
  expect(details.getByDisplayValue('Befintlig text')).toBeTruthy();
  expect(details.getByRole('img').getAttribute('src')).toContain(
    `/profile-images/${before.draft.changes[0].after?.profileImageId}`,
  );
  expect(await read()).toEqual(before);
  await userEvent.click(status.getByRole('button', { name: 'Hämta aktuellt underlag' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.queryByText(returnName, { selector: 'button' })).toBeNull();
  const description = details.getByLabelText('Beskrivning', { exact: true });
  await user.clear(description);
  await user.paste('Ny oskickad text');
  const current = await read();
  expect(
    (
      await client.json(`${path}/draft`, {
        id: 'independent',
        version: current.draft.version,
        contentVersion: current.contentVersion,
        baseRevision: null,
        value: { typeId: current.types[0].id, name: 'Annat förslag', description: '' },
      })
    ).status,
  ).toBe(200);
  await userEvent.click(details.getByText('Lägg i mitt utkast', { selector: 'button' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Avvisat:');
  expect(screen.queryByText(returnName, { selector: 'button' })).toBeNull();
  expect(details.getByDisplayValue('Ny oskickad text')).toBeTruthy();
  const after = await read();
  expect(after.objects).toEqual([]);
  expect(after.draft.changes.find((change) => change.id === 'person')).toEqual(
    before.draft.changes[0],
  );
  expect(after.draft.changes.find((change) => change.id === 'independent')?.after?.name).toBe(
    'Annat förslag',
  );
}, 15_000);

async function openInApp(name = 'Lo Exempel') {
  render(
    <MemoryRouter initialEntries={[`/households/${householdId}`]}>
      <App />
    </MemoryRouter>,
  );
  const tools = within(await screen.findByLabelText('Kartans verktyg', { selector: 'nav' }));
  await userEvent.click(tools.getByLabelText('Lista', { selector: 'button' }));
  const list = within(
    await screen.findByLabelText('Lista och utkast', { selector: 'section:not([hidden])' }),
  );
  await userEvent.click(list.getByLabelText(`Uppgifter för ${name}`, { selector: 'button' }));
  const panel = within(await screen.findByLabelText(name, { selector: 'section:not([hidden])' }));
  await userEvent.click(panel.getByRole('button', { name: 'Redigera valt objekt' }));
  return within(panel.getByRole('group', { name: 'Objektets detaljer' }));
}

// This budget includes real image processing, the held response and the complete Settings round trip.
test('a real image rejection preserves Settings focus until explicit return to the same image work', async () => {
  const user = userEvent.setup();
  const initial = await read();
  expect(
    (
      await client.json(`${path}/draft`, {
        id: 'garage',
        version: initial.draft.version,
        contentVersion: initial.contentVersion,
        baseRevision: null,
        value: { typeId: initial.types[0].id, name: 'Garaget', description: '' },
      })
    ).status,
  ).toBe(200);
  const independent = await openInApp('Garaget');
  await user.click(independent.getByLabelText('Beskrivning', { exact: true }));
  await user.paste('Oskickat under bildförsöket');
  await user.click(
    within(screen.getByLabelText('Garaget', { selector: 'section:not([hidden])' })).getByLabelText(
      'Stäng Garaget',
      {
        selector: 'button',
      },
    ),
  );
  await user.click(
    within(
      screen.getByLabelText('Lista och utkast', { selector: 'section:not([hidden])' }),
    ).getByLabelText('Uppgifter för Lo Exempel', { selector: 'button' }),
  );
  const target = within(screen.getByLabelText('Lo Exempel', { selector: 'section:not([hidden])' }));
  await user.click(target.getByRole('button', { name: 'Redigera valt objekt' }));
  const details = within(target.getByRole('group', { name: 'Objektets detaljer' }));
  await user.upload(details.getByLabelText('Välj profilbild'), await file());
  await screen.findByText('Bildförslaget finns i ditt privata utkast. Kartan är inte ändrad.', {
    selector: '[role="status"]',
  });
  const before = await read();
  const request = globalThis.fetch;
  let received: (response: Response) => void = () => {};
  const ready = new Promise<Response>((resolve) => {
    received = resolve;
  });
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const response = await request(url, init);
    if (url.includes('/profile-images/') && init?.method === 'POST') {
      received(response.clone());
      await held;
    }
    return response;
  });
  try {
    expect(details.getByLabelText('Välj profilbild')).toHaveProperty('disabled', false);
    await user.upload(
      details.getByLabelText('Välj profilbild'),
      new File(['invalid'], 'bad.png', { type: 'image/png' }),
    );
    expect((await ready).status).toBe(400);
    await user.click(target.getByLabelText('Stäng Lo Exempel', { selector: 'button' }));
    await user.click(
      within(screen.getByLabelText('Kartans verktyg', { selector: 'nav' })).getByLabelText(
        'Inställningar',
        { selector: 'button' },
      ),
    );
    const settings = await screen.findByRole('heading', { name: 'Inställningar', level: 1 });
    expect(settings).toBe(document.activeElement);
    const settingsReturn = screen.getByText('Tillbaka till kartan', { selector: 'a' });
    settingsReturn.focus();
    release();
    expect((await screen.findByRole('alert')).textContent).toContain('Bilden kunde inte behandlas');
    expect(settingsReturn).toBe(document.activeElement);
    expect(screen.getByRole('heading', { name: 'Inställningar', level: 1 })).toBe(settings);
    expect(screen.queryByRole('group', { name: 'Objektets detaljer' })).toBeNull();
    expect(await read()).toEqual(before);
    await user.click(
      within(
        screen.getByLabelText('Utkastets återkoppling', { selector: 'section:not([hidden])' }),
      ).getByRole('button', {
        name: 'Återgå till bilden för Lo Exempel',
      }),
    );
    expect(screen.queryByRole('heading', { name: 'Inställningar', level: 1 })).toBeNull();
    expect(target.getByRole('heading', { name: 'Lo Exempel' })).toBe(document.activeElement);
    expect(details.getByDisplayValue('Befintlig text')).toBeTruthy();
    expect(
      within(details.getByRole('region', { name: 'Ikon' })).getByText('Cykel', {
        selector: 'strong',
      }),
    ).toBeTruthy();
    expect(details.getByRole('img').getAttribute('src')).toContain(
      `/profile-images/${before.draft.changes.find((change) => change.id === 'person')?.after?.profileImageId}`,
    );
    expect(await read()).toEqual(before);
    const panels = screen.getByLabelText(/^Öppna paneler/, { selector: 'select' });
    await user.selectOptions(
      panels,
      within(panels).getByRole('option', { name: 'Lista och utkast' }),
    );
    await user.click(
      within(
        screen.getByLabelText('Lista och utkast', { selector: 'section:not([hidden])' }),
      ).getByLabelText('Uppgifter för Garaget', { selector: 'button' }),
    );
    expect(
      within(
        screen.getByLabelText('Garaget', { selector: 'section:not([hidden])' }),
      ).getByDisplayValue('Oskickat under bildförsöket'),
    ).toBeTruthy();
    expect(await read()).toEqual(before);
  } finally {
    release();
  }
}, 15_000);

// The real image upload and held save round trip share the loaded coverage run.
test('the whole image and description proposal saves once with an exact expanded receipt', async () => {
  const user = userEvent.setup();
  const details = await openInApp();
  await user.upload(details.getByLabelText('Välj profilbild'), await file());
  await screen.findByText('Bildförslaget finns i ditt privata utkast. Kartan är inte ändrad.');
  const image = (await read()).draft.changes[0].after?.profileImageId;
  expect(image).toEqual(expect.any(String));
  expect(image).not.toBe('');
  await user.clear(details.getByLabelText('Beskrivning', { exact: true }));
  await user.paste('Text och bild i samma förslag');
  await user.click(details.getByRole('button', { name: 'Lägg i mitt utkast' }));
  await waitFor(() =>
    expect(screen.queryByRole('group', { name: 'Objektets detaljer' })).toBeNull(),
  );
  const proposed = await read();
  expect(proposed.objects).toEqual([]);
  expect(proposed.draft.changes).toHaveLength(1);
  expect(proposed.draft.changes[0].after).toMatchObject({
    name: 'Lo Exempel',
    description: 'Text och bild i samma förslag',
    iconId: 'bike',
    profileImageId: image,
  });
  const request = globalThis.fetch;
  let received: (response: Response) => void = () => {};
  const saved = new Promise<Response>((resolve) => {
    received = resolve;
  });
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saveRequests = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === `${path}/save` && init?.method === 'POST') saveRequests += 1;
    const response = await request(url, init);
    if (url === `${path}/save` && init?.method === 'POST') {
      received(response.clone());
      await held;
    }
    return response;
  });
  try {
    const review = within(screen.getByRole('region', { name: 'Hela mitt utkast' }));
    await user.click(review.getByRole('button', { name: 'Spara hela utkastet' }));
    const response = await saved;
    expect(response.status).toBe(200);
    const { receipt } = await response.json();
    expect(receipt).toMatchObject({
      householdId,
      draftVersion: proposed.draft.version,
      changes: [{ before: null, after: proposed.draft.changes[0].after }],
    });
    expect(receipt.changes).toHaveLength(1);
    const status = within(screen.getByRole('region', { name: 'Utkastets återkoppling' }));
    expect(await status.findByText('Väntar på sparkvitto')).toBeTruthy();
    expect(screen.queryByText(`Sparat: Lo Exempel. Kvitto: ${receipt.operationId}.`)).toBeNull();
    expect(status.queryByText(/^Sparat:/)).toBeNull();
    expect(status.queryByText('Sparat · kvitto bekräftat')).toBeNull();
    release();
    await screen.findByText('Sparat · kvitto bekräftat');
    await user.click(screen.getByText('Tidigare sparförsök', { selector: 'summary' }));
    await user.click(screen.getByText('Visa kvittot', { selector: 'summary' }));
    expect(
      within(screen.getByRole('region', { name: 'Mina sparförsök' })).getByText(
        `Sparat: Lo Exempel. Kvitto: ${receipt.operationId}.`,
      ),
    ).toBeTruthy();
    const shared = await read();
    expect(shared.objects).toHaveLength(1);
    expect(shared.objects[0]).toMatchObject(proposed.draft.changes[0].after ?? {});
    expect(shared.draft.changes).toEqual([]);
    expect(saveRequests).toBe(1);
  } finally {
    release();
  }
}, 15_000);
