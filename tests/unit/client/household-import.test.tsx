import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdImport } from '../../../src/client/HouseholdImport.js';

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
    if (url === `${path}/imports`) return Response.json(ready, { status: 201 });
    return handle(url, init);
  });
}
beforeEach(() => sessionStorage.clear());
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
  vi.stubGlobal('fetch', async (url: string) =>
    url.endsWith('/map')
      ? Response.json({ contentVersion: 3 })
      : Response.json({ error }, { status: 400 }),
  );
  render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.upload(fileInput(), uploaded());
  await userEvent.click(prepareButton());
  expect((await screen.findByRole('alert')).textContent).toContain('Filen kan inte importeras');
  expect(fileInput().disabled).toBe(false);
  expect(screen.queryByRole('group')).toBeNull();
  expect(sessionStorage.getItem(storageKey)).toBeNull();
});

test.each([401, 403])('denied preparation with %s refreshes current access', async (status) => {
  const lost = vi.fn();
  vi.stubGlobal('fetch', async () => Response.json({ error: 'forbidden' }, { status }));
  render(<HouseholdImport householdId="linden" onAccessLost={lost} />);
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
    if (!available) throw new TypeError('Offline');
    if (url.endsWith('/map')) return Response.json({ contentVersion: 3 });
    signal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')));
    });
  });
  const view = render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
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
  (value) => {
    sessionStorage.setItem(storageKey, value);
    render(<HouseholdImport householdId="linden" onAccessLost={vi.fn()} />);
    expect(fileInput().disabled).toBe(false);
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
