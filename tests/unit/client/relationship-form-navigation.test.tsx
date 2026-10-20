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
    id: 'alex',
    baseRevision: null,
    value: { name: 'Alex', typeId: initial.types[0].id },
  });
  let signOuts = 0;
  let loseResponse = false;
  let submissions = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/sign-out') signOuts++;
    const response = await client.request(url, {
      ...init,
      headers: { ...init?.headers, origin: fixture.config.origin },
    });
    if (url.endsWith('/relationship-form')) {
      submissions++;
      if (loseResponse) throw new Error('Synthetic lost relationship response');
    }
    return response;
  });
  const router = createMemoryRouter([{ path: '*', element: <App /> }], {
    initialEntries: [`/households/${household.id}`],
  });
  render(<RouterProvider router={router} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Tabell' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Samband för Alex' }));
  const form = within(screen.getByRole('dialog', { name: 'Samband för Alex' }));
  await userEvent.click(form.getByRole('button', { name: 'Nytt samband' }));
  await userEvent.selectOptions(
    form.getByLabelText('Sambandstyp', { exact: true }),
    initial.relationshipTypes[0].id,
  );
  await userEvent.selectOptions(form.getByLabelText('Till objekt', { exact: true }), 'alex');
  return {
    client,
    router,
    household,
    read,
    form,
    signOuts: () => signOuts,
    loseResponse: () => {
      loseResponse = true;
    },
    submissions: () => submissions,
  };
}

test.each(['settings', 'household'])(
  'relationship router %s departure confirms only unsent loss and removes its beforeunload guard',
  async (destination) => {
    const home = await open();
    const before = await home.read();
    let next = `/households/${home.household.id}/settings`;
    if (destination === 'household') {
      // Provision a second member-owned household as in the object navigation
      // fixture; the public installer deliberately creates only one household.
      const { user } = await (await home.client.request('/api/bootstrap')).json();
      fixture.database
        .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
        .run('second-home', 'Lönnen', new Date().toISOString());
      fixture.database
        .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
        .run('second-home', user.id, 'member');
      next = '/households/second-home';
    }
    const leavingDocument = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leavingDocument);
    expect(leavingDocument.defaultPrevented).toBe(true);
    await act(async () => {
      void home.router.navigate(next);
    });
    const loss = await screen.findByRole('dialog', { name: 'Lämna ändrade uppgifter?' });
    expect(within(loss).getByRole('button', { name: 'Fortsätt redigera' })).toBe(
      document.activeElement,
    );
    fireEvent(loss, new Event('cancel', { cancelable: true }));
    expect(home.router.state.location.pathname).toBe(`/households/${home.household.id}`);
    expect(home.form.getByLabelText('Till objekt', { exact: true })).toHaveProperty(
      'value',
      'alex',
    );
    await act(async () => {
      void home.router.navigate(next);
    });
    await userEvent.click(screen.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }));
    await waitFor(() => expect(home.router.state.location.pathname).toBe(next));
    expect((await home.read()).draft).toEqual(before.draft);
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  },
);

test('Reports suspends the relationship modal and retains its exact uncertain attempt until returning and checking', async () => {
  const home = await open();
  home.loseResponse();
  await userEvent.click(home.form.getByRole('button', { name: 'Lägg i utkastet' }));
  await home.form.findByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' });
  // Chromium makes the background inert; this DOM boundary covers the actual
  // retained-surface callback. Physical keyboard/modal access is covered separately.
  fireEvent.click(screen.getByRole('button', { name: 'Visa verktygens namn' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rapporter' }));
  await screen.findByRole('region', { name: 'Rapporter' });
  expect(screen.queryByRole('dialog', { name: 'Samband för Alex' })).toBeNull();
  expect(screen.queryByRole('dialog', { name: 'Lämna ändrade uppgifter?' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Tillbaka till arbetet' }));
  await screen.findByRole('dialog', { name: 'Samband för Alex' });
  expect(home.form.getByLabelText('Till objekt', { exact: true })).toHaveProperty('value', 'alex');
  await userEvent.click(
    home.form.getByRole('button', { name: 'Kontrollera om ändringen lades i utkastet' }),
  );
  await home.form.findByText('Sambandet lades i ditt utkast. Du kan hantera nästa samband.');
  expect(home.submissions()).toBe(1);
  expect((await home.read()).draft.relationships).toHaveLength(1);
});

test('relationship logout waits for confirmed loss and keeps earlier complete proposals', async () => {
  const home = await open();
  const before = await home.read();
  fireEvent.click(screen.getByRole('button', { name: 'Visa verktygens namn' }));
  fireEvent.click(screen.getByRole('button', { name: 'Din profil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Logga ut' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Fortsätt redigera' }));
  expect(home.signOuts()).toBe(0);
  expect(home.form.getByLabelText('Till objekt', { exact: true })).toHaveProperty('value', 'alex');
  fireEvent.click(screen.getByRole('button', { name: 'Din profil' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Logga ut' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Kasta ändringarna och fortsätt' }),
  );
  await waitFor(() => expect(home.signOuts()).toBe(1));
  await home.client.signIn();
  expect((await home.read()).draft).toEqual(before.draft);
});
