import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from '../server/fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fixture?.close();
});
async function open() {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  const path = `/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.request(path)).json();
  const initial = await read();
  await client.json(`${path}/draft`, {
    version: 0,
    id: 'existing',
    baseRevision: null,
    value: { typeId: initial.types[0].id, name: 'Tidigare förslag' },
  });
  let signOuts = 0;
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    if (url === '/api/auth/sign-out') signOuts++;
    return client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    });
  });
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: [`/households/${household.id}`],
  });
  render(<RouterProvider router={router} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Tabell' }));
  await screen.findByRole('region', { name: 'Hushållets tabell' });
  return { client, router, household, path, read, signOuts: () => signOuts };
}
async function createUnsent() {
  await userEvent.click(
    within(screen.getByRole('region', { name: 'Hushållets tabell' })).getByRole('button', {
      name: /Nytt objekt/,
    }),
  );
  const form = screen.getByRole('dialog', { name: 'Nytt objekt' });
  await userEvent.type(within(form).getByLabelText('Namn', { exact: true }), 'Oskickad cykel');
  return form;
}

test.each(['settings', 'household'])(
  'actual router %s navigation protects unsent text and only discards it after confirmation',
  async (destination) => {
    const home = await open();
    const before = await home.read();
    let next = `/households/${home.household.id}/settings`;
    if (destination === 'household') {
      const { user } = await (await home.client.request('/api/bootstrap')).json();
      fixture.database
        .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
        .run('second-home', 'Lönnen', new Date().toISOString());
      fixture.database
        .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
        .run('second-home', user.id, 'member');
      next = '/households/second-home';
    }
    const form = await createUnsent();
    const leaveDocument = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaveDocument);
    expect(leaveDocument.defaultPrevented).toBe(true);
    await act(async () => {
      void home.router.navigate(next);
    });
    const loss = await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' });
    expect(within(loss).getByRole('button', { name: 'Fortsätt redigera' })).toBe(
      document.activeElement,
    );
    fireEvent(loss, new Event('cancel', { cancelable: true }));
    expect(home.router.state.location.pathname).toBe(`/households/${home.household.id}`);
    expect(within(form).getByLabelText('Namn', { exact: true })).toHaveProperty(
      'value',
      'Oskickad cykel',
    );
    expect(await home.read()).toEqual(before);
    await act(async () => {
      void home.router.navigate(next);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
    await waitFor(() => expect(home.router.state.location.pathname).toBe(next));
    expect(await home.read()).toEqual(before);
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  },
);

test('actual logout is deferred until unsent form loss is confirmed and keeps staged proposals', async () => {
  const home = await open();
  const form = await createUnsent();
  fireEvent.click(screen.getByRole('button', { name: 'Visa verktygens namn' }));
  fireEvent.click(screen.getByRole('button', { name: 'Din profil' }));
  const logout = await screen.findByRole('button', { name: 'Logga ut' });
  const before = await home.read();
  // The native modal makes this background inert in Chromium. The DOM harness
  // also exercises the actual logout callback against the registered form guard.
  fireEvent.click(logout);
  await userEvent.click(screen.getByRole('button', { name: 'Fortsätt redigera' }));
  expect(home.signOuts()).toBe(0);
  expect(within(form).getByLabelText('Namn', { exact: true })).toHaveProperty(
    'value',
    'Oskickad cykel',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Din profil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Logga ut' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Kasta ändringarna och fortsätt' }),
  );
  await waitFor(() => expect(home.signOuts()).toBe(1));
  await screen.findByRole('heading', { name: 'Välkommen till Skyttel' });
  await home.client.signIn();
  expect((await home.read()).draft).toEqual(before.draft);
});
