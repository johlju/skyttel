import { File as ServerFile } from 'node:buffer';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import type { MapState } from '../../../src/shared/map.js';
import {
  editTableObjectForm,
  openDraftReview,
  renderHouseholdWork,
} from '../../support/native-household-unit.js';
import { applicationFixture } from '../server/fixture.js';
import { propertyInput } from './property-controls.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let failure: number;
let objectFormRequests: Promise<Response>[];
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

      iconId: 'bike',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Befintlig text' },
      ],
    },
  });
  failure = 0;
  objectFormRequests = [];
  const forward = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/object-form') && failure) {
      if (failure === 503) throw new Error('Synthetic network interruption');
      return Response.json(
        { error: failure === 409 ? 'client_outdated' : 'forbidden' },
        { status: failure },
      );
    }
    const headers = new Headers(init?.headers);
    headers.set('origin', fixture.config.origin);
    let body = init?.body;
    const multipart = body instanceof FormData;
    if (body instanceof FormData) {
      // Serialize jsdom files at the browser HTTP boundary, preserving the real
      // multipart parser, authentication, image encoder and SQLite transaction.
      const boundary = 'synthetic-object-form-boundary';
      const parts: Buffer[] = [];
      for (const [key, value] of body) {
        const disposition = `--${boundary}\r\nContent-Disposition: form-data; name="${key}"`;
        if (typeof value === 'string')
          parts.push(Buffer.from(`${disposition}\r\n\r\n${value}\r\n`));
        else {
          const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as ArrayBuffer);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(value);
          });
          parts.push(
            Buffer.from(
              `${disposition}; filename="${value.name}"\r\nContent-Type: ${value.type}\r\n\r\n`,
            ),
            Buffer.from(new Uint8Array(bytes)),
            Buffer.from('\r\n'),
          );
        }
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      body = Buffer.concat(parts);
      headers.set('content-type', `multipart/form-data; boundary=${boundary}`);
    }
    // Undici's multipart parser requires the server File constructor; jsdom
    // supplies the browser File for UI selection. Restore it before React resumes.
    if (!multipart) return client.request(url, { ...init, body, headers });
    const browserFile = globalThis.File;
    vi.stubGlobal('File', ServerFile);
    try {
      return await client.request(url, { ...init, body, headers });
    } finally {
      vi.stubGlobal('File', browserFile);
    }
  };
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const response = forward(url, init);
    if (url.endsWith('/object-form')) objectFormRequests.push(response);
    return response;
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fixture.close();
});
async function open() {
  renderHouseholdWork(householdId);
  return reopen();
}
async function reopen() {
  const form = await editTableObjectForm('Lo Exempel');
  await userEvent.click(form.getByRole('button', { name: 'Livscykel och utseende' }));
  return form;
}
const stage = async (form: ReturnType<typeof within>) => {
  await userEvent.click(form.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
};

test('an image stays local until the whole proposal is staged and removal preserves text and icon', async () => {
  let form = await open();
  const before = await read();
  await userEvent.upload(form.getByLabelText('Profilbild', { exact: true }), await file());
  expect(await read()).toEqual(before);
  expect(form.getByRole('img').getAttribute('src')).toContain('data:image/png');
  await stage(form);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const image = (await read()).draft.changes[0].after?.profileImageId;
  expect(image).toEqual(expect.any(String));
  expect(
    (await client.request(`/api/households/${householdId}/profile-images/${image}`)).status,
  ).toBe(200);
  form = await reopen();
  expect(form.getByRole('img').getAttribute('src')).toContain(`/profile-images/${image}`);
  await userEvent.click(form.getByRole('button', { name: 'Ta bort profilbilden ur formuläret' }));
  expect((await read()).draft.changes[0].after?.profileImageId).toBe(image);
  await stage(form);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect((await read()).draft.changes[0].after).toMatchObject({
    properties: expect.arrayContaining([
      expect.objectContaining({ label: 'Beskrivning', value: 'Befintlig text' }),
    ]),
    iconId: 'bike',
  });
  expect((await read()).draft.changes[0].after?.profileImageId).toBeUndefined();
}, 15_000);

test('invalid and oversized image staging retains every form value and earlier proposals', async () => {
  const form = await open();
  const before = await read();
  for (const [index, invalid] of [
    new File(['invalid'], 'bad.png', { type: 'image/png' }),
    new File([new Uint8Array(10_000_001)], 'large.png', { type: 'image/png' }),
  ].entries()) {
    await userEvent.upload(form.getByLabelText('Profilbild', { exact: true }), invalid);
    await stage(form);
    // Await real multipart validation before starting the DOM assertion's timer.
    expect(objectFormRequests).toHaveLength(index + 1);
    await act(async () => {
      expect((await objectFormRequests[index]).status).toBe(400);
    });
    await screen.findByText(/Profilbilden kunde inte läggas i utkastet/);
    expect(form.getByRole('button', { name: 'Lägg i utkastet och stäng' })).toHaveProperty(
      'disabled',
      false,
    );
    expect(await read()).toEqual(before);
    await userEvent.click(form.getByRole('button', { name: 'Grunduppgifter' }));
    expect(await propertyInput(form, 'Beskrivning')).toHaveProperty('value', 'Befintlig text');
    await userEvent.click(form.getByRole('button', { name: 'Livscykel och utseende' }));
  }
}, 15_000);

test.each([401, 403, 409, 503])(
  'complete image proposal response %s preserves the prior draft',
  async (status) => {
    const form = await open();
    const before = await read();
    await userEvent.upload(form.getByLabelText('Profilbild', { exact: true }), await file());
    failure = status;
    await stage(form);
    await screen.findByText(
      status === 401 || status === 403
        ? /Du har inte längre tillgång/
        : status === 503
          ? /Det är oklart/
          : /Dina uppgifter finns kvar/,
    );
    expect(await read()).toEqual(before);
    if (status === 401 || status === 403) expect(screen.queryByRole('dialog')).toBeNull();
    else {
      expect(form.getByRole('img').getAttribute('src')).toContain('data:image/png');
      if (status === 503)
        expect(form.getByRole('button', { name: 'Lägg i utkastet och stäng' })).toHaveProperty(
          'disabled',
          true,
        );
    }
  },
);

test('a stale complete image proposal keeps text and local image without overwriting an independent proposal', async () => {
  const form = await open();
  await userEvent.upload(form.getByLabelText('Profilbild', { exact: true }), await file());
  await userEvent.click(form.getByRole('button', { name: 'Grunduppgifter' }));
  await userEvent.type(await propertyInput(form, 'Beskrivning'), ' och oskickat');
  const before = await read();
  expect(
    (
      await client.json(`${path}/draft`, {
        id: 'independent',
        version: before.draft.version,
        contentVersion: before.contentVersion,
        baseRevision: null,
        value: { typeId: before.types[0].id, name: 'Annat förslag' },
      })
    ).status,
  ).toBe(200);
  await stage(form);
  await screen.findByText(/Dina uppgifter finns kvar/);
  expect(await propertyInput(form, 'Beskrivning')).toHaveProperty(
    'value',
    'Befintlig text och oskickat',
  );
  await userEvent.click(form.getByRole('button', { name: 'Livscykel och utseende' }));
  expect(form.getByRole('img').getAttribute('src')).toContain('data:image/png');
  const after = await read();
  expect(after.objects).toEqual([]);
  expect(after.draft.changes.find((change) => change.id === 'person')).toEqual(
    before.draft.changes[0],
  );
  expect(after.draft.changes.find((change) => change.id === 'independent')?.after?.name).toBe(
    'Annat förslag',
  );
});

async function openInApp() {
  render(
    <MemoryRouter initialEntries={[`/households/${householdId}`]}>
      <App />
    </MemoryRouter>,
  );
  return editTableObjectForm('Lo Exempel');
}

// The real image upload and held save round trip share the loaded coverage run.
test('the whole image and description proposal saves once with an exact expanded receipt', async () => {
  const user = userEvent.setup();
  const details = await openInApp();
  await user.click(details.getByRole('button', { name: 'Livscykel och utseende' }));
  await user.upload(details.getByLabelText('Profilbild', { exact: true }), await file());
  await user.click(details.getByRole('button', { name: 'Grunduppgifter' }));
  await user.clear(await propertyInput(details, 'Beskrivning'));
  await user.paste('Text och bild i samma förslag');
  await user.click(details.getByRole('button', { name: 'Lägg i utkastet och stäng' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const proposed = await read();
  const image = proposed.draft.changes[0].after?.profileImageId;
  expect(image).toEqual(expect.any(String));
  expect(image).not.toBe('');
  expect(proposed.objects).toEqual([]);
  expect(proposed.draft.changes).toHaveLength(1);
  expect(proposed.draft.changes[0].after).toMatchObject({
    name: 'Lo Exempel',
    properties: expect.arrayContaining([
      expect.objectContaining({ label: 'Beskrivning', value: 'Text och bild i samma förslag' }),
    ]),
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
    const review = await openDraftReview();
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
    expect(receipt.changes[0]).not.toHaveProperty('stagingId');
    expect(receipt.changes[0]).not.toHaveProperty('proposedAt');
    const progress = within(screen.getByRole('dialog', { name: 'Spara utkastet' }));
    expect(await progress.findByText('Sparar utkastet…')).toBeTruthy();
    expect(screen.queryByText(`Sparat: Lo Exempel. Kvitto: ${receipt.operationId}.`)).toBeNull();
    expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toBe('');
    expect(progress.queryByText('Sparat · kvitto bekräftat')).toBeNull();
    release();
    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Sparbekräftelse' }).textContent).toBe(
        'Utkastet är sparat',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Stäng textvyn' }));
    await user.click(screen.getByRole('button', { name: 'Rapporter' }));
    const history = within(await screen.findByRole('region', { name: 'Ändringshistorik' }));
    const article = (await history.findByText(`Sparande: ${receipt.operationId}`)).closest(
      'article',
    );
    if (!article) throw new Error('Missing exact receipt entry');
    const savedEntry = within(article);
    await user.click(savedEntry.getByText('Visa ändringarna', { selector: 'summary' }));
    expect(article.textContent).toContain('Lo Exempel');
    expect(article.textContent).toContain('Text och bild i samma förslag');
    expect(savedEntry.getByRole('img').getAttribute('src')).toContain(image);
    const shared = await read();
    expect(shared.objects).toHaveLength(1);
    expect(shared.objects[0]).toMatchObject(proposed.draft.changes[0].after ?? {});
    expect(shared.draft.changes).toEqual([]);
    expect(saveRequests).toBe(1);
  } finally {
    release();
  }
}, 15_000);
