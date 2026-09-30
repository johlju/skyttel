import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import { applicationFixture } from '../server/fixture.js';

const user = { id: 'alex', name: 'Alex Exempel' };
type Reply = { data?: unknown; status?: number; response?: Promise<Response> };
function mount(replies: Reply[], path = '/login-methods', status = 'forbidden') {
  const fetch = vi.fn(async (path: string) => {
    if (path === '/api/bootstrap')
      return Response.json({ status, providers: ['google', 'microsoft'], user });
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected request: ${path}`);
    return reply.response ?? Response.json(reply.data ?? {}, { status: reply.status ?? 200 });
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return fetch;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('loads login methods and retries after an unavailable server', async () => {
  let finish: (response: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  mount([{ response }, { data: { providers: ['microsoft'], stage: null } }]);
  expect(screen.getByRole('status').textContent).toContain('Öppnar');
  await act(async () => finish(Response.json({}, { status: 503 })));
  await userEvent.click(await screen.findByRole('button', { name: 'Försök igen' }));
  expect(await screen.findByText('Microsoft – kopplat')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Verifiera Microsoft' })).toBeDefined();
});

test('starts proof and gives a retry path when the request fails', async () => {
  const fetch = mount(
    [{ data: { providers: ['google'], stage: null } }, { status: 503 }],
    '/login-methods',
    'setup',
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Verifiera Google' }));
  expect(await screen.findByRole('alert')).toBeDefined();
  expect(fetch).toHaveBeenCalledWith(
    '/api/login-methods/prove',
    expect.objectContaining({ body: JSON.stringify({ provider: 'google' }) }),
  );
});

test.each([{}, { url: 'javascript:alert(1)' }, { url: 'invalid url' }])(
  'rejects invalid provider redirects: %j',
  async (data) => {
    mount([{ data: { providers: ['google'], stage: 'verified' } }, { data }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Koppla Microsoft' }));
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Koppla Microsoft' })).toHaveProperty(
      'disabled',
      false,
    );
  },
);

test('shows pending verification and navigates to the provider', async () => {
  let finish: (response: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  mount([{ data: { providers: ['microsoft'], stage: 'verified' } }, { response }]);
  await userEvent.click(await screen.findByRole('button', { name: 'Koppla Google' }));
  expect(screen.getByRole('status').textContent).toContain('Kontrollerar');
  expect(screen.getByRole('button', { name: 'Koppla Google' })).toHaveProperty('disabled', true);
  await act(async () => finish(Response.json({ url: 'https://provider.example/authorize' })));
  expect(assign).toHaveBeenCalledWith('https://provider.example/authorize');
});

test('cancels an interrupted linking flow and reloads its verified state', async () => {
  mount(
    [
      { data: { providers: ['google'], stage: 'failed' } },
      { data: { status: 'cancelled' } },
      { data: { providers: ['google'], stage: null } },
    ],
    '/login-methods?failed=1',
  );
  expect(await screen.findByRole('alert')).toBeDefined();
  await userEvent.click(screen.getByRole('button', { name: 'Avbryt länkning' }));
  expect(await screen.findByRole('button', { name: 'Verifiera Google' })).toBeDefined();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('confirms successful linking only with a server result and both connected providers', async () => {
  mount([{ data: { providers: ['google', 'microsoft'], stage: 'complete' } }]);
  expect(await screen.findByText('Google – kopplat')).toBeDefined();
  expect(screen.getByText('Microsoft – kopplat')).toBeDefined();
  expect(screen.getByRole('status').textContent).toContain('Länkningen är verifierad');
  expect(screen.queryByRole('button', { name: /Koppla|Verifiera/ })).toBeNull();
});

test('a forged success query never confirms a link', async () => {
  mount([{ data: { providers: ['google'], stage: null } }], '/login-methods?success=1');
  await screen.findByText('Google – kopplat');
  expect(screen.queryByRole('status')).toBeNull();
});

test('a real callback completing before cancellation reports the verified link and preserves private work', async () => {
  const fixture = await applicationFixture();
  const client = fixture.client();
  let resumeProvider = () => {};
  let callback: Promise<Response> | undefined;
  try {
    await client.signIn();
    const created = await client.json('/api/households', { name: 'Linden' });
    expect(created.status).toBe(201);
    const { household } = await created.json();
    const path = `/api/households/${household.id}/map`;
    const initial = await (await client.request(path)).json();
    expect(
      (
        await client.json(`${path}/draft`, {
          id: 'retained-private',
          version: initial.draft.version,
          baseRevision: null,
          value: {
            typeId: initial.types[0].id,
            name: 'Bevarat privat arbete',
            description: 'Min privata beskrivning',
          },
        })
      ).status,
    ).toBe(200);
    const before = await (await client.request(path)).json();
    const identity = await (await client.request('/api/bootstrap')).json();
    const proof = await client.json('/api/login-methods/prove', { provider: 'google' });
    expect(proof.status).toBe(200);
    await client.request((await proof.json()).url);
    expect(await (await client.request('/api/login-methods')).json()).toEqual({
      providers: ['google'],
      stage: 'verified',
    });
    const addition = await client.json('/api/login-methods/add', { provider: 'microsoft' });
    expect(addition.status).toBe(200);
    fixture.setSubject('new-microsoft');
    const provider = fixture.pauseProvider();
    resumeProvider = provider.resume;
    callback = client.request((await addition.json()).url);
    await provider.reached;
    let cancelStarted = () => {};
    const cancelling = new Promise<void>((resolve) => {
      cancelStarted = resolve;
    });
    const receipts: { status: number; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('origin', fixture.config.origin);
      if (url === '/api/login-methods/cancel') cancelStarted();
      const response = await client.request(url, { ...init, headers });
      if (url === '/api/login-methods/cancel')
        receipts.push({ status: response.status, body: await response.clone().json() });
      return response;
    });
    render(
      <MemoryRouter initialEntries={['/login-methods']}>
        <App />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Avbryt länkning' }));
    await cancelling;
    expect(screen.queryByText(/^Länkningen är avbruten\./)).toBeNull();
    resumeProvider();
    await callback;
    expect(
      await screen.findByText(
        'Länkningen är verifierad. Båda inloggningssätten når samma Skyttel-användare.',
      ),
    ).toBeDefined();
    expect(receipts).toEqual([{ status: 200, body: { status: 'complete' } }]);
    expect(screen.getByText('Google – kopplat')).toBeDefined();
    expect(screen.getByText('Microsoft – kopplat')).toBeDefined();
    expect(screen.queryByText(/^Länkningen är avbruten\./)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Avbryt länkning' })).toBeNull();
    expect(await (await client.request('/api/bootstrap')).json()).toEqual(identity);
    expect(await (await client.request(path)).json()).toEqual(before);
  } finally {
    resumeProvider();
    await callback;
    cleanup();
    fixture.close();
  }
});

test.each(['absent', 'complete'] as const)(
  'elapsed linking time preserves the real %s state without an expiry claim',
  async (state) => {
    const fixture = await applicationFixture();
    const client = fixture.client();
    const originalNow = Date.now;
    const clock = vi.spyOn(Date, 'now');
    try {
      await client.signIn();
      expect((await client.json('/api/households', { name: 'Linden' })).status).toBe(201);
      const identity = await (await client.request('/api/bootstrap')).json();
      if (state === 'complete') {
        const proof = await client.json('/api/login-methods/prove', { provider: 'google' });
        expect(proof.status).toBe(200);
        await client.request((await proof.json()).url);
        const addition = await client.json('/api/login-methods/add', { provider: 'microsoft' });
        expect(addition.status).toBe(200);
        fixture.setSubject('completed-microsoft');
        await client.request((await addition.json()).url);
      }
      clock.mockImplementation(() => originalNow() + 11 * 60_000);
      expect(await (await client.request('/api/login-methods')).json()).toEqual(
        state === 'complete'
          ? { providers: ['google', 'microsoft'], stage: 'complete' }
          : { providers: ['google'], stage: null },
      );
      vi.stubGlobal('fetch', (url: string, init?: RequestInit) =>
        client.request(url, {
          ...init,
          headers: { ...init?.headers, origin: fixture.config.origin },
        }),
      );
      render(
        <MemoryRouter initialEntries={['/login-methods']}>
          <App />
        </MemoryRouter>,
      );
      await screen.findByText('Google – kopplat');
      expect(screen.queryByText(/^Verifieringen har gått ut\./)).toBeNull();
      if (state === 'complete') {
        expect(screen.getByRole('status').textContent).toBe(
          'Länkningen är verifierad. Båda inloggningssätten når samma Skyttel-användare.',
        );
        expect(screen.getByText('Microsoft – kopplat')).toBeDefined();
        expect(screen.queryByRole('button', { name: /Koppla|Verifiera/ })).toBeNull();
      } else {
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('button', { name: 'Verifiera Google' })).toBeDefined();
        expect(screen.queryByText('Microsoft – kopplat')).toBeNull();
      }
      expect(await (await client.request('/api/bootstrap')).json()).toEqual(identity);
    } finally {
      clock.mockRestore();
      cleanup();
      fixture.close();
    }
  },
);

test('a real cancellation before a stale add click refreshes absent state without claiming expiry', async () => {
  const fixture = await applicationFixture();
  const client = fixture.client();
  try {
    await client.signIn();
    const created = await client.json('/api/households', { name: 'Linden' });
    expect(created.status).toBe(201);
    const { household } = await created.json();
    const path = `/api/households/${household.id}/map`;
    const initial = await (await client.request(path)).json();
    expect(
      (
        await client.json(`${path}/draft`, {
          id: 'cancelled-private',
          version: initial.draft.version,
          baseRevision: null,
          value: {
            typeId: initial.types[0].id,
            name: 'Bevarat efter avbruten verifiering',
            description: 'Privat förslag utan ny koppling',
          },
        })
      ).status,
    ).toBe(200);
    const before = await (await client.request(path)).json();
    const identity = await (await client.request('/api/bootstrap')).json();
    const proof = await client.json('/api/login-methods/prove', { provider: 'google' });
    expect(proof.status).toBe(200);
    await client.request((await proof.json()).url);
    const mutations: string[] = [];
    const replies: { status: number; body: unknown }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set('origin', fixture.config.origin);
      if (init?.method === 'POST') mutations.push(url);
      const response = await client.request(url, { ...init, headers });
      if (url === '/api/login-methods/add')
        replies.push({ status: response.status, body: await response.clone().json() });
      return response;
    });
    render(
      <MemoryRouter initialEntries={['/login-methods']}>
        <App />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Koppla Microsoft' });
    const cancelled = await client.json('/api/login-methods/cancel', {});
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ status: 'cancelled' });
    await userEvent.click(screen.getByRole('button', { name: 'Koppla Microsoft' }));
    await screen.findByRole('button', { name: 'Verifiera Google' });
    expect(replies).toEqual([{ status: 409, body: { error: 'verification_required' } }]);
    expect(screen.getByRole('alert').textContent).toContain('Länkningen kunde inte slutföras');
    expect(screen.queryByText(/^Verifieringen har gått ut\./)).toBeNull();
    expect(screen.queryByText(/^Länkningen är avbruten\./)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Koppla Microsoft' })).toBeNull();
    expect(await (await client.request('/api/login-methods')).json()).toEqual({
      providers: ['google'],
      stage: null,
    });
    expect(mutations).toEqual(['/api/login-methods/add']);
    expect(await (await client.request('/api/bootstrap')).json()).toEqual(identity);
    expect(await (await client.request(path)).json()).toEqual(before);
  } finally {
    cleanup();
    fixture.close();
  }
});

test('failed fresh proof still shows its error when the earlier verification has expired', async () => {
  mount([{ data: { providers: ['google'], stage: 'expired' } }, { status: 503 }]);
  await userEvent.click(await screen.findByRole('button', { name: 'Verifiera Google' }));
  expect(await screen.findByRole('alert')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Verifiera Google' })).toHaveProperty(
    'disabled',
    false,
  );
  expect(screen.getByRole('status').textContent).toContain('Verifieringen har gått ut');
});
