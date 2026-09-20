import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';

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
