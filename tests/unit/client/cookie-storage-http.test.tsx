import { join } from 'node:path';
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
let ownerId: string;
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
  ownerId = (await (await client.get(`${installation.origin}/api/bootstrap`)).json()).user.id;
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
    `/api/browser-binding/results/${id}?generation=11111111-1111-4111-8111-111111111111`,
    `/api/browser-binding/results/${id}?generation=11111111-1111-4111-8111-111111111111`,
  ]);
  expect(writes).toBe(1);
});

test('a proven restore reads the fresh ordinary preference rather than a cached remembered login', async () => {
  const backup = join(installation.directory, 'before-uncertain-operation.sqlite');
  await installation.saveDatabase(backup);
  const transport = authenticatedHttpFetch(client, installation.origin);
  let writes = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/browser-binding/revoke') {
      writes++;
      throw new TypeError('Reply lost after the real commit');
    }
    return response;
  });
  render(page());
  await userEvent.click(await turnOff());
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sparstatus okänd'));
  await installation.restoreDatabase(backup, {
    generation: '22222222-2222-4222-8222-222222222222',
    restore: {
      fromGeneration: '11111111-1111-4111-8111-111111111111',
      confirmedAt: Date.now(),
      erasureReviewed: true,
    },
  });
  expect(
    (
      await client.post(`${installation.origin}/api/browser-binding/reset-check`, {
        headers: { origin: installation.origin },
        data: {},
      })
    ).status(),
  ).toBe(200);
  await client.clearCookies({ name: 'skyttel_binding' });
  await signIn(client, installation.origin);
  // The same mounted owner view still holds S1's remembered preference.
  // Only a fresh authenticated preference read establishes ordinary S2.
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Skyttel har återställts från en säkerhetskopia.',
    ),
  );
  await waitFor(() => expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false));
  expect(screen.getByRole('status').textContent).not.toContain('Ihågkommen inloggning är avstängd');
  expect(writes).toBe(1);
});

test('a forged Origin cannot use browser fetch metadata to read the storage preference', async () => {
  const response = await client.get(`${installation.origin}/api/browser-binding/preference`, {
    headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'same-origin' },
  });
  expect(response.status()).toBe(403);
});

test('a different owner in the separate authentication read cannot replace a confirmed earlier OFF result', async () => {
  const transport = authenticatedHttpFetch(client, installation.origin);
  const other = await request.newContext();
  try {
    installation.setIdentity(robin);
    await signIn(other, installation.origin, 'microsoft');
    const start = await other.post(`${installation.origin}/api/auth/sign-in/social`, {
      headers: { origin: installation.origin },
      data: { provider: 'microsoft', callbackURL: '/', rememberMe: true, informationVersion: 1 },
    });
    await other.get((await start.json()).url, { maxRedirects: 0 });
    const wrongOwnerTransport = authenticatedHttpFetch(other, installation.origin);
    let delivered = () => {};
    const currentRead = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    let resultRead = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (resultRead && path === '/api/browser-binding/preference') {
        const response = await wrongOwnerTransport(input, init);
        delivered();
        return response;
      }
      const response = await transport(input, init);
      if (path === '/api/browser-binding/revoke') throw new TypeError('Committed reply lost');
      if (path.startsWith('/api/browser-binding/results/')) resultRead = true;
      return response;
    });
    render(page());
    await userEvent.click(await turnOff());
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Sparstatus okänd'),
    );
    installation.setIdentity({
      subject: 'alex-google',
      name: 'Alex Exempel',
      email: 'alex@example.test',
    });
    await signIn(client, installation.origin);
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
      await currentRead;
    });
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Logga in igen för att fortsätta.');
    expect(screen.getByRole('status').textContent).not.toContain('Du har loggat in på nytt.');
  } finally {
    await other.dispose();
  }
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
const page = (userId = ownerId) => (
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
  const view = render(page());
  await userEvent.click(await turnOff());
  await captured;
  // The response is already committed and held outside the application.
  // Another real browser binding has its own new user and ordinary choice.
  const other = await request.newContext();
  try {
    installation.setIdentity(robin);
    await signIn(other, installation.origin, 'microsoft');
    const otherId = (await (await other.get(`${installation.origin}/api/bootstrap`)).json()).user
      .id;
    vi.stubGlobal('fetch', authenticatedHttpFetch(other, installation.origin));
    view.rerender(page(otherId));
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
  const view = render(page());
  await captured;
  const other = await request.newContext();
  try {
    installation.setIdentity(robin);
    await signIn(other, installation.origin, 'microsoft');
    const otherId = (await (await other.get(`${installation.origin}/api/bootstrap`)).json()).user
      .id;
    vi.stubGlobal('fetch', authenticatedHttpFetch(other, installation.origin));
    view.rerender(page(otherId));
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

test.each(['unreadable', 'missing session', 'invalid id'])(
  'a %s recovery reference preserves unknown status without guessing or repeating a write',
  async (reference) => {
    const value =
      reference === 'unreadable'
        ? '{damaged'
        : JSON.stringify({
            id: reference === 'invalid id' ? 'not-an-operation' : crypto.randomUUID(),
            ...(reference === 'missing session' ? {} : { sessionId: 'earlier-login' }),
          });
    sessionStorage.setItem(`skyttel-storage-operation:${ownerId}`, value);
    const transport = authenticatedHttpFetch(client, installation.origin);
    const mutations: string[] = [];
    const results: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') mutations.push(String(input));
      if (String(input).startsWith('/api/browser-binding/results/')) results.push(String(input));
      return transport(input, init);
    });
    render(page());
    await screen.findByRole('switch');
    await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
    expect(screen.getByRole('alert').textContent).toContain(
      'Åtgärdens referens saknas eller är skadad. Utfallet är fortfarande okänt.',
    );
    expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
    expect(mutations).toEqual([]);
    expect(results).toEqual([]);
    expect(sessionStorage.getItem(`skyttel-storage-operation:${ownerId}`)).toBe(value);
  },
);

test.each(['read', 'write', 'silently discarded'])(
  'denied tab recovery storage during %s prevents sending the storage change',
  async (failure) => {
    const transport = authenticatedHttpFetch(client, installation.origin);
    const writes: string[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') writes.push(String(input));
      return transport(input, init);
    });
    if (failure === 'read')
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('Browser storage denied', 'SecurityError');
      });
    render(page());
    if (failure === 'read') {
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain(
          'Flikens återhämtningsuppgifter kunde inte läsas. Ingen ny ändring skickas.',
        ),
      );
      expect(screen.queryByRole('switch')).toBeNull();
    } else {
      const save = await turnOff();
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        if (failure === 'write') throw new DOMException('Browser storage denied', 'SecurityError');
      });
      await userEvent.click(save);
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain(
          'Flikens återhämtningsuppgifter kunde inte sparas. Ingen ändring har skickats.',
        ),
      );
      expect((screen.getByRole('switch') as HTMLInputElement).checked).toBe(false);
      expect(screen.getByText('Osparad ändring.')).toBeTruthy();
    }
    expect(writes).toEqual([]);
    expect(
      await (
        await client.get(`${installation.origin}/api/browser-binding/preference`, {
          headers: { origin: installation.origin },
        })
      ).json(),
    ).toMatchObject({ remembered: true });
  },
);

test('an unavailable earlier result remains unknown after reload without resending the change', async () => {
  const id = crypto.randomUUID();
  sessionStorage.setItem(
    `skyttel-storage-operation:${ownerId}`,
    JSON.stringify({ id, sessionId: 'earlier-session' }),
  );
  const transport = authenticatedHttpFetch(client, installation.origin);
  const results: string[] = [];
  const writes: string[] = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith('/api/browser-binding/results/')) results.push(String(input));
    if (init?.method === 'POST') writes.push(String(input));
    return transport(input, init);
  });
  render(page());
  await screen.findByRole('switch');
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Det kan saknas eller ha passerat kontrollfönstret på 24 timmar. Utfallet är fortfarande okänt.',
    ),
  );
  expect(results).toEqual([`/api/browser-binding/results/${id}`]);
  expect(writes).toEqual([]);
  expect((screen.getByRole('switch') as HTMLInputElement).disabled).toBe(true);
});

test('failed deletion of the local reference cannot undo a confirmed server change', async () => {
  render(page());
  const save = await turnOff();
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new DOMException('Browser storage denied', 'SecurityError');
  });
  await userEvent.click(save);
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      'Resultatet är bekräftat men flikens referens kunde inte tas bort.',
    ),
  );
  expect(screen.getByRole('status').textContent).toContain('Ihågkommen inloggning är avstängd.');
  expect(
    await (
      await client.get(`${installation.origin}/api/browser-binding/preference`, {
        headers: { origin: installation.origin },
      })
    ).json(),
  ).toMatchObject({ remembered: false });
});
