import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { HouseholdExport } from '../../../src/client/HouseholdExport.js';

const path = '/api/households/linden/exports';
const archive = new Uint8Array([80, 75, 3, 4, 0, 0, 0, 0]);
const prepared = () => ({
  id: 'export-1',
  bytes: archive.length,
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
});
const createObjectURL = vi.fn((_blob: Blob) => 'blob:household-export');
const revokeObjectURL = vi.fn();
const downloads: { href: string; filename: string }[] = [];

function zip() {
  return new Response(archive, {
    headers: { 'Content-Type': 'application/zip', 'Content-Length': String(archive.length) },
  });
}

beforeEach(() => {
  downloads.length = 0;
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push({ href: this.href, filename: this.download });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('explains private content before preparing and offers only the complete ZIP to the browser', async () => {
  const network = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === path && init?.method === 'POST') return Response.json(prepared(), { status: 201 });
    if (url === `${path}/export-1` && init?.method === 'GET') return zip();
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch', network);
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  expect(screen.getByText(/andra användares privata utkast och personliga vyer/)).toBeDefined();
  expect(screen.getByText(/sedan din senaste egna export/)).toBeDefined();
  expect(downloads).toEqual([]);
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  const download = await screen.findByRole('button', { name: 'Hämta ZIP-fil' });
  expect(downloads).toEqual([]);
  await userEvent.click(download);
  expect(await screen.findByText(/Webbläsarens nedladdning har startats/)).toBeDefined();
  expect(downloads).toEqual([{ href: 'blob:household-export', filename: 'skyttel-hushall.zip' }]);
  expect(createObjectURL.mock.calls[0]?.[0]).toMatchObject({ size: 8, type: 'application/zip' });
  expect(screen.queryByRole('button', { name: 'Hämta ZIP-fil' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Förbered fullständig export' })).toBeDefined();
});

test('cancels a prepared export and allows another preparation', async () => {
  let canceled = false;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path && init?.method === 'POST') return Response.json(prepared(), { status: 201 });
    if (url === `${path}/export-1/cancel` && init?.method === 'POST') {
      canceled = true;
      return Response.json({ ok: true });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  await screen.findByRole('button', { name: 'Hämta ZIP-fil' });
  await userEvent.click(screen.getByRole('button', { name: 'Avbryt export' }));
  expect(await screen.findByText('Exporten har avbrutits.')).toBeDefined();
  expect(canceled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Hämta ZIP-fil' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  expect(await screen.findByRole('button', { name: 'Hämta ZIP-fil' })).toBeDefined();
  expect(downloads).toEqual([]);
});

test.each(['preparing', 'ready', 'downloading'])(
  'leaving the page while %s aborts active work and cancels any prepared archive',
  async (stage) => {
    const canceled: string[] = [];
    let activeSignal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url === `${path}/export-1/cancel`) {
        canceled.push(url);
        return Response.json({ ok: true });
      }
      activeSignal = init?.signal;
      if (url === path && stage !== 'preparing') return Response.json(prepared(), { status: 201 });
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('Canceled', 'AbortError')),
        );
      });
    });
    const view = render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
    if (stage !== 'preparing') await screen.findByRole('button', { name: 'Hämta ZIP-fil' });
    if (stage === 'downloading')
      await userEvent.click(screen.getByRole('button', { name: 'Hämta ZIP-fil' }));
    await act(async () => view.unmount());
    if (stage !== 'ready') expect(activeSignal?.aborted).toBe(true);
    expect(canceled).toEqual(stage === 'preparing' ? [] : [`${path}/export-1/cancel`]);
    expect(downloads).toEqual([]);
  },
);

test('canceling during preparation keeps a late server reply from reopening the export', async () => {
  let finish: (response: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  let signal: AbortSignal | null | undefined;
  let canceled = false;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === `${path}/export-1/cancel`) {
      canceled = true;
      return Response.json({ ok: true });
    }
    signal = init?.signal;
    return response;
  });
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  expect(screen.getByRole('status').textContent).toBe('Förbereder exporten…');
  await userEvent.click(screen.getByRole('button', { name: 'Avbryt export' }));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(Response.json(prepared(), { status: 201 })));
  expect(canceled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Hämta ZIP-fil' })).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Exporten har avbrutits.');
  expect(downloads).toEqual([]);
});

test.each([401, 403])(
  'a download denied with %s clears export controls and refreshes access',
  async (status) => {
    const lostAccess = vi.fn();
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === path) return Response.json(prepared(), { status: 201 });
      return Response.json({ error: 'forbidden' }, { status });
    });
    render(<HouseholdExport householdId="linden" onAccessLost={lostAccess} />);
    await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Hämta ZIP-fil' }));
    expect(lostAccess).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button')).toBeNull();
    expect(downloads).toEqual([]);
  },
);

test('an expired download explains the expiry and requires a fresh preparation', async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === path) return Response.json(prepared(), { status: 201 });
    return Response.json({ error: 'export_not_found' }, { status: 404 });
  });
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Hämta ZIP-fil' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Exporten har gått ut');
  expect(screen.queryByRole('button', { name: 'Hämta ZIP-fil' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  expect(await screen.findByRole('button', { name: 'Hämta ZIP-fil' })).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(downloads).toEqual([]);
});

test('the ready control expires when its displayed download deadline passes', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json(url === path ? prepared() : { ok: true }),
  );
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' })),
  );
  expect(screen.getByRole('button', { name: 'Hämta ZIP-fil' })).toBeDefined();
  await act(async () => vi.advanceTimersByTimeAsync(600_000));
  expect(screen.queryByRole('button', { name: 'Hämta ZIP-fil' })).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('Exporten har gått ut');
  expect(screen.getByRole('button', { name: 'Förbered fullständig export' })).toBeDefined();
});

test.each([
  'network',
  'interrupted body',
  'wrong type',
  'wrong length',
  'short body',
  'server error',
])(
  'a %s never becomes a browser download and can be retried with a new export',
  async (failure) => {
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === path) return Response.json(prepared(), { status: 201 });
      if (url.endsWith('/cancel')) return Response.json({ ok: true });
      if (failure === 'network') throw new TypeError('Network disconnected');
      if (failure === 'server error') return Response.json({}, { status: 503 });
      const headers = {
        'Content-Type': failure === 'wrong type' ? 'text/html' : 'application/zip',
        'Content-Length': failure === 'wrong length' ? '100' : String(archive.length),
      };
      if (failure === 'interrupted body')
        return new Response(
          new ReadableStream({
            start: (controller) => controller.error(new Error('Connection lost')),
          }),
          { headers },
        );
      return new Response(failure === 'short body' ? archive.slice(0, 4) : archive, { headers });
    });
    render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Hämta ZIP-fil' }));
    expect((await screen.findByRole('alert')).textContent).toContain('förbered en ny export');
    expect(downloads).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByText(/Webbläsarens nedladdning har startats/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hämta ZIP-fil' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
    expect(await screen.findByRole('button', { name: 'Hämta ZIP-fil' })).toBeDefined();
  },
);

test('releases the browser archive URL after handing off the download', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', async (url: string) =>
    url === path ? Response.json(prepared(), { status: 201 }) : zip(),
  );
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' })),
  );
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Hämta ZIP-fil' })));
  expect(downloads).toHaveLength(1);
  expect(revokeObjectURL).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:household-export');
});

test('failed preparation gives a retry without suggesting a file was created', async () => {
  let unavailable = true;
  vi.stubGlobal('fetch', async (url: string) => {
    if (unavailable) throw new TypeError('Network unavailable');
    return Response.json(url === path ? prepared() : { ok: true });
  });
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Exporten kunde inte förberedas',
  );
  expect(screen.queryByRole('button', { name: 'Hämta ZIP-fil' })).toBeNull();
  unavailable = false;
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  expect(await screen.findByRole('button', { name: 'Hämta ZIP-fil' })).toBeDefined();
});

test('failed cancellation never claims that the temporary archive was removed', async () => {
  vi.stubGlobal('fetch', async (url: string) => {
    if (url === path) return Response.json(prepared(), { status: 201 });
    throw new TypeError('Network unavailable');
  });
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Avbryt export' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Avbrottet kunde inte bekräftas',
  );
  expect(screen.queryByText('Exporten har avbrutits.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Hämta ZIP-fil' })).toBeNull();
  expect(downloads).toEqual([]);
});

test('canceling an active transfer discards a late body without starting a browser download', async () => {
  let finish: (bytes: Uint8Array) => void = () => {};
  let signal: AbortSignal | null | undefined;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path) return Response.json(prepared(), { status: 201 });
    if (url.endsWith('/cancel')) return Response.json({ ok: true });
    signal = init?.signal;
    return new Response(
      new ReadableStream({
        start: (controller) => {
          finish = (bytes) => {
            controller.enqueue(bytes);
            controller.close();
          };
        },
      }),
      { headers: { 'Content-Type': 'application/zip', 'Content-Length': '8' } },
    );
  });
  render(<HouseholdExport householdId="linden" onAccessLost={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Förbered fullständig export' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Hämta ZIP-fil' }));
  expect(screen.getByRole('status').textContent).toBe('Hämtar och kontrollerar ZIP-filen…');
  await userEvent.click(screen.getByRole('button', { name: 'Avbryt export' }));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(archive));
  expect(screen.getByRole('status').textContent).toBe('Exporten har avbrutits.');
  expect(downloads).toEqual([]);
});
