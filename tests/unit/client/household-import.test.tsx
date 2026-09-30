import { chmodSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HouseholdImport } from '../../../src/client/HouseholdImport.js';
import { applicationFixture } from '../server/fixture.js';

const path = '/api/households/linden';
const storageKey = 'skyttel-import:linden';
const ready = { id: 'case-import', status: 'ready', contentVersion: 3, counts: { objects: 2 } };
const uploaded = () => new File(['synthetic archive'], 'hushall.zip', { type: 'application/zip' });
const fileInput = () => screen.getByLabelText('Skyttel-export (ZIP)') as HTMLInputElement;
const prepareButton = () =>
  screen.getByRole('button', { name: 'Kontrollera importfil' }) as HTMLButtonElement;
const confirmButton = () =>
  screen.getByRole('button', { name: 'Ersätt hushållets innehåll' }) as HTMLButtonElement;
async function prepare() {
  await waitFor(() => expect(fileInput().disabled).toBe(false));
  await userEvent.upload(fileInput(), uploaded());
  await userEvent.click(prepareButton());
  await screen.findByRole('group', { name: 'Granska ersättningen' });
}
async function confirm() {
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(confirmButton());
}
function network(handle: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === `${path}/map`) return Response.json({ contentVersion: 3 });
    if (url === `${path}/imports`)
      return init?.method === 'POST'
        ? Response.json(ready, { status: 201 })
        : Response.json({ attempt: null });
    return handle(url, init);
  });
}
beforeEach(() => {
  sessionStorage.clear();
  network(async () => {
    throw new Error('Unexpected import request');
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

test('reviews the complete replacement and requires explicit confirmation before changing content', async () => {
  const replacements: unknown[] = [];
  network(async (url, init) => {
    expect(url).toBe(`${path}/imports/${ready.id}/confirm`);
    replacements.push(JSON.parse(String(init?.body)));
    return Response.json({ ...ready, status: 'completed', contentVersion: 4 });
  });
  render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  expect(prepareButton().disabled).toBe(true);
  expect(screen.getByText(/alla privata utkast och personliga vyer/)).toBeDefined();
  await prepare();
  expect(screen.getByText(/2 objekt, 0 samband och 0 sparanden/)).toBeDefined();
  expect(confirmButton().disabled).toBe(true);
  await userEvent.click(confirmButton());
  expect(replacements).toEqual([]);
  await confirm();
  expect(await screen.findByText(/Hushållets innehåll är ersatt/)).toBeDefined();
  expect(replacements).toEqual([{ confirmed: true, contentVersion: 3 }]);
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Hämta importens status' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Läs in det återställda hushållet' })).toBeDefined();
});

test('choosing another file discards the earlier review and its confirmation', async () => {
  network(async () => {
    throw new Error('No replacement expected');
  });
  render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  await prepare();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.upload(fileInput(), new File(['another archive'], 'annan.zip'));
  expect(screen.queryByRole('group', { name: 'Granska ersättningen' })).toBeNull();
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  await userEvent.click(prepareButton());
  await screen.findByRole('group', { name: 'Granska ersättningen' });
  expect(confirmButton().disabled).toBe(true);
});

test('a lost confirmation prevents another import and resumes the same cleanup after remount', async () => {
  let first = true;
  const attempts: unknown[] = [];
  network(async (url, init) => {
    if (url.endsWith('/confirm')) {
      attempts.push(JSON.parse(String(init?.body)));
      if (first) {
        first = false;
        throw new TypeError('Connection lost after commit');
      }
      return Response.json({ ...ready, status: 'completed', contentVersion: 4 });
    }
    expect(url).toBe(`${path}/imports/${ready.id}`);
    return Response.json({ ...ready, status: 'cleanup', contentVersion: 4 });
  });
  const view = render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  await prepare();
  await confirm();
  expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
  expect(prepareButton().disabled).toBe(true);
  expect(fileInput().disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Ersätt hushållets innehåll' })).toBeNull();
  view.unmount();
  render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  expect(fileInput().disabled).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Hämta importens status' }));
  expect(await screen.findByText(/Tillfälliga filer behöver rensas/)).toBeDefined();
  expect(fileInput().disabled).toBe(true);
  await userEvent.click(screen.getByRole('button', { name: 'Slutför importens rensning' }));
  expect(await screen.findByText(/Hushållets innehåll är ersatt/)).toBeDefined();
  expect(attempts).toEqual([
    { confirmed: true, contentVersion: 3 },
    { confirmed: true, contentVersion: 3 },
  ]);
  expect(fileInput().disabled).toBe(false);
});

test.each(['prepared', 'failed'])(
  'a recovered %s outcome is shown without inventing a successful replacement',
  async (status) => {
    sessionStorage.setItem(storageKey, JSON.stringify({ id: ready.id, contentVersion: 3 }));
    network(async () => Response.json({ ...ready, status }));
    render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Hämta importens status' }));
    if (status === 'prepared') {
      expect(await screen.findByText(/Importen pågår/)).toBeDefined();
      expect(fileInput().disabled).toBe(true);
      expect(sessionStorage.getItem(storageKey)).not.toBeNull();
    } else {
      expect((await screen.findByRole('alert')).textContent).toContain('tidigare innehåll är kvar');
      expect(fileInput().disabled).toBe(false);
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    }
    expect(screen.queryByText(/Hushållets innehåll är ersatt/)).toBeNull();
  },
);

test('changed household content requires a fresh preparation and a new confirmation', async () => {
  network(async () => Response.json({ error: 'content_conflict' }, { status: 409 }));
  render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  await prepare();
  await confirm();
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Hushållets innehåll har ändrats',
  );
  expect(fileInput().disabled).toBe(false);
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  await userEvent.click(prepareButton());
  await screen.findByRole('group', { name: 'Granska ersättningen' });
  expect(confirmButton().disabled).toBe(true);
});

test.each([
  'invalid_archive',
  'unsupported_archive',
  'archive_too_large',
  'archive_identity_conflict',
])('a rejected %s file permits another selection without reporting replacement', async (error) => {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
    url === `${path}/imports` && init?.method === 'GET'
      ? Response.json({ attempt: null })
      : url.endsWith('/map')
        ? Response.json({ contentVersion: 3 })
        : Response.json({ error }, { status: 400 }),
  );
  render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  await waitFor(() => expect(fileInput().disabled).toBe(false));
  await userEvent.upload(fileInput(), uploaded());
  await userEvent.click(prepareButton());
  expect((await screen.findByRole('alert')).textContent).toContain('Filen kan inte importeras');
  expect(fileInput().disabled).toBe(false);
  expect(screen.queryByRole('group')).toBeNull();
  expect(sessionStorage.getItem(storageKey)).toBeNull();
});

test.each([401, 403])('denied preparation with %s refreshes current access', async (status) => {
  const lost = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
    url === `${path}/imports` && init?.method === 'GET'
      ? Response.json({ attempt: null })
      : Response.json({ error: 'forbidden' }, { status }),
  );
  render(<HouseholdImport householdId="linden" onAccessLost={lost} />);
  await waitFor(() => expect(fileInput().disabled).toBe(false));
  await userEvent.upload(fileInput(), uploaded());
  await userEvent.click(prepareButton());
  await screen.findByRole('alert');
  expect(lost).toHaveBeenCalledOnce();
  expect(screen.queryByRole('group')).toBeNull();
});

test('failed preparation can be retried and leaving the page cancels its upload', async () => {
  let available = false;
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === `${path}/imports` && init?.method === 'GET')
      return Response.json({ attempt: null });
    if (!available) throw new TypeError('Offline');
    if (url.endsWith('/map')) return Response.json({ contentVersion: 3 });
    signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')));
    });
  });
  const view = render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  await waitFor(() => expect(fileInput().disabled).toBe(false));
  await userEvent.upload(fileInput(), uploaded());
  await userEvent.click(prepareButton());
  expect((await screen.findByRole('alert')).textContent).toContain('Kontrollera anslutningen');
  expect(prepareButton().disabled).toBe(false);
  available = true;
  await userEvent.click(prepareButton());
  expect(await screen.findByText('Behandlar importen…')).toBeDefined();
  expect(fileInput().disabled).toBe(true);
  await act(async () => view.unmount());
  expect(signal?.aborted).toBe(true);
});

test.each(['not json', '{"id":7}', 'null'])(
  'invalid saved recovery data %s does not stop a fresh import',
  async (value) => {
    sessionStorage.setItem(storageKey, value);
    render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
    await waitFor(() => expect(fileInput().disabled).toBe(false));
    expect(screen.queryByRole('button', { name: 'Hämta importens status' })).toBeNull();
  },
);

test('an expired prepared import can be replaced with a newly reviewed file', async () => {
  sessionStorage.setItem(storageKey, JSON.stringify({ id: ready.id, contentVersion: 3 }));
  network(async () => Response.json({ error: 'import_unavailable' }, { status: 404 }));
  render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Hämta importens status' }));
  expect((await screen.findByRole('alert')).textContent).toContain('förbered');
  expect(fileInput().disabled).toBe(false);
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  expect(screen.queryByText(/Hushållets innehåll är ersatt/)).toBeNull();
});

describe('cancellation through the real HTTP application', () => {
  let fixture: Awaited<ReturnType<typeof applicationFixture>>;
  let client: ReturnType<typeof fixture.client>;
  let householdId: string;
  let householdPath: string;
  let archive: Uint8Array<ArrayBuffer>;
  let directory: string | undefined;
  let requests: string[];
  let receive: (url: string, response: Response) => Promise<Response>;

  beforeEach(async () => {
    fixture = await applicationFixture();
    client = fixture.client();
    await client.signIn();
    const response = await client.json('/api/households', { name: 'Linden' });
    expect(response.status).toBe(201);
    householdId = (await response.json()).household.id;
    householdPath = `/api/households/${householdId}`;
    const initial = await (await client.request(`${householdPath}/map`)).json();
    expect(
      (
        await client.json(`${householdPath}/map/draft`, {
          id: 'retained-private',
          version: 0,
          baseRevision: null,
          value: { name: 'Bevarat privat arbete', description: '', typeId: initial.types[0].id },
        })
      ).status,
    ).toBe(200);
    const exported = await client.json(`${householdPath}/exports`, {});
    expect(exported.status).toBe(201);
    const { id } = await exported.json();
    archive = new Uint8Array(
      await (await client.request(`${householdPath}/exports/${id}`)).arrayBuffer(),
    );
    directory = undefined;
    requests = [];
    receive = async (_url, response) => response;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? 'GET'} ${url}`);
      // Adapt jsdom's File bytes at the HTTP boundary, as the existing image fixture does.
      const body =
        init?.body instanceof File
          ? await new Promise<ArrayBuffer>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as ArrayBuffer);
              reader.onerror = () => reject(reader.error);
              reader.readAsArrayBuffer(init.body as File);
            })
          : init?.body;
      const headers = new Headers(init?.headers);
      headers.set('origin', fixture.config.origin);
      return receive(url, await client.request(url, { ...init, body, headers }));
    });
  });

  afterEach(() => {
    cleanup();
    if (directory && existsSync(directory)) chmodSync(directory, 0o700);
    fixture.close();
  });

  async function prepareArchive() {
    render(<HouseholdImport householdId={householdId} onAccessLost={vi.fn()} />);
    await waitFor(() => expect(fileInput().disabled).toBe(false));
    await userEvent.upload(fileInput(), new File([archive], 'hushall.zip'));
    await userEvent.click(prepareButton());
    await screen.findByRole('group', { name: 'Granska ersättningen' });
    const discovery = await (await client.request(`${householdPath}/imports`)).json();
    expect(discovery.ready.status).toBe('ready');
    directory = join(dirname(fixture.config.databasePath), '.skyttel-imports', discovery.ready.id);
    return `${householdPath}/imports/${discovery.ready.id}`;
  }

  test('explicit cancellation waits for its real receipt and preserves the complete private map', async () => {
    const before = await (await client.request(`${householdPath}/map`)).json();
    const attemptPath = await prepareArchive();
    let release = () => {};
    let reached = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cancelled = new Promise<void>((resolve) => {
      reached = resolve;
    });
    receive = async (url, response) => {
      if (url === `${attemptPath}/cancel`) {
        expect(response.status).toBe(200);
        expect(await response.clone().json()).toEqual({ cancelled: true });
        reached();
        await held;
      }
      return response;
    };
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Avbryt förberedelsen' }));
      await cancelled;
      expect(fileInput().disabled).toBe(true);
      expect(screen.queryByText(/Förberedelsen är avbruten/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Ersätt hushållets innehåll' })).toBeNull();
      await act(async () => release());
      await screen.findByText('Förberedelsen är avbruten och tillfälliga filer är borttagna.');
      expect(fileInput().disabled).toBe(false);
      expect(fileInput().files).toHaveLength(0);
      expect(fileInput()).toBe(document.activeElement);
      expect(prepareButton().disabled).toBe(true);
      expect(screen.queryByRole('group')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Hämta importens status' })).toBeNull();
      expect(existsSync(directory as string)).toBe(false);
      expect((await client.request(attemptPath)).status).toBe(404);
      expect(await (await client.request(`${householdPath}/map`)).json()).toEqual(before);
      expect(requests.filter((request) => request.endsWith('/cancel'))).toEqual([
        `POST ${attemptPath}/cancel`,
      ]);
      expect(requests.some((request) => request.endsWith('/confirm'))).toBe(false);
    } finally {
      release();
    }
  });

  test('real cleanup failure and a lost cleanup receipt require an exact read without claiming cancellation', async () => {
    const before = await (await client.request(`${householdPath}/map`)).json();
    const attemptPath = await prepareArchive();
    chmodSync(directory as string, 0o500);
    await userEvent.click(screen.getByRole('button', { name: 'Avbryt förberedelsen' }));
    await screen.findByText(/Förberedelsen kan inte längre användas/);
    expect(fileInput().disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Ersätt hushållets innehåll' })).toBeNull();
    expect(screen.getByText(/kartan kan användas/)).toBeDefined();
    expect(existsSync(directory as string)).toBe(true);
    expect(await (await client.request(`${householdPath}/map`)).json()).toEqual(before);
    chmodSync(directory as string, 0o700);
    receive = async (url, response) => {
      if (url === `${attemptPath}/cancel`) {
        expect(response.status).toBe(200);
        expect(await response.clone().json()).toEqual({ cancelled: true });
        throw new TypeError('Lost real cleanup reply');
      }
      return response;
    };
    await userEvent.click(screen.getByRole('button', { name: 'Slutför förberedelsens rensning' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Utfallet är okänt');
    expect(fileInput().disabled).toBe(true);
    expect(screen.queryByText(/Förberedelsen är avbruten/)).toBeNull();
    expect(existsSync(directory as string)).toBe(false);
    const afterLostReply = requests.length;
    await userEvent.click(screen.getByRole('button', { name: 'Hämta importens status' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('finns inte längre'),
    );
    expect(requests.slice(afterLostReply)).toEqual([`GET ${attemptPath}`]);
    expect(fileInput().disabled).toBe(false);
    expect(screen.queryByText(/Förberedelsen är avbruten/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hämta importens status' })).toBeNull();
    expect(await (await client.request(`${householdPath}/map`)).json()).toEqual(before);
    expect(requests.filter((request) => request.endsWith('/cancel'))).toEqual([
      `POST ${attemptPath}/cancel`,
      `POST ${attemptPath}/cancel`,
    ]);
    expect(requests.some((request) => request.endsWith('/confirm'))).toBe(false);
  });
});
