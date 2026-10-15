import { type APIRequestContext, request } from '@playwright/test';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CookieStorage } from '../../../src/client/CookieStorage.js';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
beforeEach(async () => {
  sessionStorage.clear();
  installation = await createInstallation();
  client = await request.newContext();
  await signIn(client, installation.origin);
  const start = await client.post(`${installation.origin}/api/auth/sign-in/social`, {
    headers: { origin: installation.origin },
    data: { provider: 'google', callbackURL: '/', rememberMe: true, informationVersion: 1 },
  });
  await client.get((await start.json()).url, { maxRedirects: 0 });
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: installation.origin });
  vi.stubGlobal('fetch', authenticatedHttpFetch(client, installation.origin));
});

test('checking a lost committed OFF result reads that operation without saving again', async () => {
  const transport = authenticatedHttpFetch(client, installation.origin);
  let writes = 0;
  let id = '';
  const reads: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path.includes('/api/browser-binding/results/')) {
      expect(init?.method).toBe('GET');
      reads.push(path);
    }
    const response = await transport(input, init);
    if (path === '/api/browser-binding/revoke') {
      writes++;
      id = JSON.parse(String(init?.body)).id;
      throw new TypeError('Reply lost after the real server commit');
    }
    return response;
  });
  render(page());
  const save = await turnOff();
  await userEvent.click(save);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sparstatus okänd'));
  // The old binding cannot read results. A new authenticated login is required.
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
  await screen.findByRole('link', { name: 'Logga in igen' });
  await signIn(client, installation.origin);
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Ihågkommen inloggning är avstängd.'),
  );
  expect(reads).toEqual([
    `/api/browser-binding/results/${id}`,
    `/api/browser-binding/results/${id}`,
  ]);
  expect(writes).toBe(1);
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await client.dispose();
  await installation.close();
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: 'http://localhost:3000' });
});
const page = (userId = 'current-owner') => (
  <BrowserRouter>
    <CookieStorage userId={userId} />
  </BrowserRouter>
);
async function turnOff() {
  const choice = await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
  await waitFor(() => expect((choice as HTMLInputElement).checked).toBe(true));
  await userEvent.click(choice);
  return screen.getByRole('button', { name: 'Spara inställningar' });
}

test.each([
  'continued',
  'confirmation lost',
  'rejected',
  'transport lost',
  'server error',
] as const)(
  'the real storage form preserves the meaning of %s without automatically repeating saving',
  async (outcome) => {
    const transport = authenticatedHttpFetch(client, installation.origin);
    let saves = 0;
    let confirmation = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/browser-binding/revoke') {
        saves += 1;
        if (outcome === 'rejected')
          return Response.json({ error: 'revocation_rejected' }, { status: 409 });
        if (outcome === 'server error')
          return Response.json({ error: 'server_error' }, { status: 500 });
      }
      if (String(input) === '/api/browser-binding/register' && outcome === 'confirmation lost')
        throw new TypeError('Confirmation reply lost');
      const response = await transport(input, init);
      if (String(input) === '/api/browser-binding/revoke') {
        confirmation = true;
        if (outcome === 'transport lost') throw new TypeError('Save reply lost after commit');
      }
      return response;
    });
    render(page());
    const save = await turnOff();
    await userEvent.click(save);
    if (outcome === 'continued' || outcome === 'confirmation lost') {
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe(
          `Ihågkommen inloggning är avstängd. ${outcome === 'continued' ? 'Du är fortfarande inloggad.' : 'Logga in igen för att fortsätta.'}`,
        ),
      );
      expect(confirmation).toBe(true);
      expect(
        screen.getByRole('link', { name: 'Logga in på nytt och välj Kom ihåg mig.' }),
      ).toBeTruthy();
    } else {
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(
          outcome === 'rejected'
            ? 'Ändringen kunde inte sparas. Försök igen.'
            : 'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes.',
        ),
      );
      if (outcome !== 'rejected') await userEvent.click(save);
      expect(saves).toBe(1);
      expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
    }
  },
  20_000,
);

test('a late saved OFF reply from the previous user cannot replace the new user choice', async () => {
  const transport = authenticatedHttpFetch(client, installation.origin);
  let release = () => {};
  let reached = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    reached = resolve;
  });
  let delay = true;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (delay && String(input) === '/api/browser-binding/revoke') {
      delay = false;
      reached();
      await held;
    }
    return response;
  });
  const view = render(page('alex'));
  await userEvent.click(await turnOff());
  await captured;
  // The response is already committed and held outside the application.
  // Another real browser binding has its own new user and ordinary choice.
  const other = await request.newContext();
  try {
    installation.setIdentity(robin);
    await signIn(other, installation.origin, 'microsoft');
    vi.stubGlobal('fetch', authenticatedHttpFetch(other, installation.origin));
    view.rerender(page('robin'));
    await screen.findByRole('link', { name: 'Logga in på nytt och välj Kom ihåg mig.' });
    await act(async () => {
      release();
      await held;
    });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(''));
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
    expect(
      screen.queryByText('Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.'),
    ).toBeNull();
  } finally {
    release();
    await other.dispose();
  }
}, 20_000);

test('an unsaved choice from an older session cannot rotate a newer login for the same user', async () => {
  render(page());
  const save = await turnOff();
  await signIn(client, installation.origin);
  const current = await (await client.get(`${installation.origin}/api/auth/get-session`)).json();
  await userEvent.click(save);
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe('Ändringen kunde inte sparas. Försök igen.'),
  );
  expect(await (await client.get(`${installation.origin}/api/auth/get-session`)).json()).toEqual(
    current,
  );
  expect(screen.getByText('Osparad ändring.')).toBeTruthy();
});

test('a previous user preference reply cannot replace the newer user server choice', async () => {
  const transport = authenticatedHttpFetch(client, installation.origin);
  let release = () => {};
  let reached = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    reached = resolve;
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/browser-binding/preference') {
      reached();
      await held;
    }
    return response;
  });
  const view = render(page('alex'));
  await captured;
  const other = await request.newContext();
  try {
    installation.setIdentity(robin);
    await signIn(other, installation.origin, 'microsoft');
    vi.stubGlobal('fetch', authenticatedHttpFetch(other, installation.origin));
    view.rerender(page('robin'));
    await screen.findByRole('link', { name: 'Logga in på nytt och välj Kom ihåg mig.' });
    await act(async () => {
      release();
      await held;
    });
    expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('switch').hasAttribute('disabled')).toBe(true);
  } finally {
    release();
    await other.dispose();
  }
});
