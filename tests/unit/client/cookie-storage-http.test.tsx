import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CookieStorage } from '../../../src/client/CookieStorage.js';
import { StorageConsentProvider } from '../../../src/client/StorageConsent.js';
import { readStorageConsent, writeStorageConsent } from '../../../src/client/storage-consent.js';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { activateRememberedLogin, signIn } from '../../support/client.js';
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
  await activateRememberedLogin(client, installation.origin);
  ownerId = (await (await client.get(`${installation.origin}/api/bootstrap`)).json()).user.id;
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: installation.origin });
  localStorage.setItem(
    'skyttel-storage-consent',
    JSON.stringify({
      schemaVersion: 1,
      informationVersion: 1,
      preferences: true,
      decidedAt: Date.now(),
    }),
  );
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
  const choice = await rememberedChoice();
  await userEvent.click(choice);
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
  await userEvent.click(await rememberedChoice());
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
  await waitFor(() =>
    expect(
      (screen.getByRole('switch', { name: 'Ihågkommen inloggning' }) as HTMLInputElement).checked,
    ).toBe(false),
  );
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
    await userEvent.click(await rememberedChoice());
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
    expect(screen.queryByRole('switch', { name: 'Ihågkommen inloggning' })).toBeNull();
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
test('necessary-only consent saves immediately and disables remembered login without a separate save or consent success notice', async () => {
  render(page());
  await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
  await userEvent.click(screen.getByRole('button', { name: 'Endast nödvändiga' }));
  await waitFor(() => expect(readStorageConsent()?.preferences).toBe(false));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Ihågkommen inloggning är avstängd.'),
  );
  expect(screen.queryByText('Dina lagringspreferenser är sparade.')).toBeNull();
  expect(
    await (
      await client.get(`${installation.origin}/api/browser-binding/preference`, {
        headers: { origin: installation.origin },
      })
    ).json(),
  ).toMatchObject({ remembered: false });
});
async function rememberedChoice() {
  const choice = await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
  await waitFor(() => expect((choice as HTMLInputElement).checked).toBe(true));
  return choice;
}

test('a successful consent choice does not inherit a rejected remembered-login result', async () => {
  const transport = authenticatedHttpFetch(client, installation.origin);
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    String(input) === '/api/browser-binding/revoke'
      ? Promise.resolve(Response.json({ error: 'revocation_rejected' }, { status: 409 }))
      : transport(input, init),
  );
  render(page());
  await userEvent.click(await rememberedChoice());
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Ändringen kunde inte sparas.'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Acceptera Alla' }));
  expect(readStorageConsent()?.preferences).toBe(true);
  expect(
    within(screen.getByRole('region', { name: 'Snabbåtgärder' })).getByRole('alert').textContent,
  ).toBe('');
  expect(screen.queryByText('Ändringen kunde inte sparas. Försök igen.')).toBeNull();
});

test('automatic demotion after another tab withdraws consent exposes a lost result after a consent-only action', async () => {
  const transport = authenticatedHttpFetch(client, installation.origin);
  let mutations = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/browser-binding/revoke') {
      mutations++;
      throw new TypeError('Lost automatic demotion reply after commit');
    }
    return response;
  });
  render(page());
  await rememberedChoice();
  await userEvent.click(screen.getByRole('button', { name: 'Acceptera Alla' }));
  await act(async () => {
    localStorage.removeItem('skyttel-storage-consent');
    window.dispatchEvent(new StorageEvent('storage', { key: 'skyttel-storage-consent' }));
  });
  const remembered = within(screen.getByRole('region', { name: 'Ihågkommen inloggning' }));
  await waitFor(() =>
    expect(remembered.getByRole('alert').textContent).toContain('Sparstatus okänd'),
  );
  expect(remembered.getByRole('button', { name: 'Kontrollera igen' })).toBeTruthy();
  expect(sessionStorage.getItem(`skyttel-storage-operation:${ownerId}`)).toBeTruthy();
  expect(mutations).toBe(1);
});

test('a successful remembered-login change does not inherit an earlier consent write error', async () => {
  render(page());
  const choice = await rememberedChoice();
  const write = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === 'skyttel-storage-consent') throw new DOMException('Denied', 'SecurityError');
    write.call(this, key, value);
  });
  await userEvent.click(screen.getByRole('button', { name: 'Acceptera Alla' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Kakvalet kunde inte sparas'),
  );
  await userEvent.click(choice);
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Ihågkommen inloggning är avstängd.'),
  );
  expect(
    within(screen.getByRole('region', { name: 'Ihågkommen inloggning' })).getByRole('alert')
      .textContent,
  ).toBe('');
});

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
    const choice = await rememberedChoice();
    await userEvent.click(choice);
    if (outcome === 'continued' || outcome === 'confirmation lost') {
      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toBe(
          `Ihågkommen inloggning är avstängd. ${outcome === 'continued' ? 'Du är fortfarande inloggad.' : 'Logga in igen för att fortsätta.'}`,
        ),
      );
      expect(confirmation).toBe(true);
      expect(screen.getByRole('switch', { name: 'Ihågkommen inloggning' })).toBeTruthy();
    } else {
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toBe(
          outcome === 'rejected'
            ? 'Ändringen kunde inte sparas. Försök igen.'
            : 'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes. Åtgärdens referens bevaras. Att lämna vyn skickar inget nytt sparande.',
        ),
      );
      if (outcome !== 'rejected') await userEvent.click(choice);
      expect(saves).toBe(1);
      expect(
        (screen.getByRole('switch', { name: 'Ihågkommen inloggning' }) as HTMLInputElement).checked,
      ).toBe(outcome === 'rejected');
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
  await userEvent.click(await rememberedChoice());
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
    await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
    await act(async () => {
      release();
      await held;
    });
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(''));
    expect(
      (screen.getByRole('switch', { name: 'Ihågkommen inloggning' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      screen.queryByText('Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.'),
    ).toBeNull();
  } finally {
    release();
    await other.dispose();
  }
}, 20_000);

test('a change from an older session cannot rotate a newer login for the same user', async () => {
  render(page());
  const choice = await rememberedChoice();
  await signIn(client, installation.origin);
  const current = await (await client.get(`${installation.origin}/api/auth/get-session`)).json();
  await userEvent.click(choice);
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toBe('Ändringen kunde inte sparas. Försök igen.'),
  );
  expect(await (await client.get(`${installation.origin}/api/auth/get-session`)).json()).toEqual(
    current,
  );
  expect(
    (screen.getByRole('switch', { name: 'Ihågkommen inloggning' }) as HTMLInputElement).checked,
  ).toBe(false);
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
    await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
    await act(async () => {
      release();
      await held;
    });
    expect(
      (screen.getByRole('switch', { name: 'Ihågkommen inloggning' }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      screen.getByRole('switch', { name: 'Ihågkommen inloggning' }).hasAttribute('disabled'),
    ).toBe(false);
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
    await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
    await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
    expect(screen.getByRole('alert').textContent).toContain(
      'Åtgärdens referens saknas eller är skadad. Utfallet är fortfarande okänt.',
    );
    expect(
      screen.getByRole('switch', { name: 'Ihågkommen inloggning' }).getAttribute('aria-disabled'),
    ).toBe('true');
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
      expect(screen.queryByRole('switch', { name: 'Ihågkommen inloggning' })).toBeNull();
    } else {
      const choice = await rememberedChoice();
      const write = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
        this: Storage,
        key,
        value,
      ) {
        if (key.startsWith('skyttel-storage-operation:')) {
          if (failure === 'write')
            throw new DOMException('Browser storage denied', 'SecurityError');
          return;
        }
        write.call(this, key, value);
      });
      await userEvent.click(choice);
      await waitFor(() =>
        expect(screen.getByRole('alert').textContent).toContain(
          'Flikens återhämtningsuppgifter kunde inte sparas. Ingen ändring har skickats.',
        ),
      );
      expect(
        (screen.getByRole('switch', { name: 'Ihågkommen inloggning' }) as HTMLInputElement).checked,
      ).toBe(true);
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
  await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
  await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Det kan saknas eller ha passerat kontrollfönstret på 24 timmar. Utfallet är fortfarande okänt.',
    ),
  );
  expect(results).toEqual([`/api/browser-binding/results/${id}`]);
  expect(writes).toEqual([]);
  expect(
    screen.getByRole('switch', { name: 'Ihågkommen inloggning' }).getAttribute('aria-disabled'),
  ).toBe('true');
});

test('failed deletion of the local reference cannot undo a confirmed server change', async () => {
  render(page());
  const choice = await rememberedChoice();
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new DOMException('Browser storage denied', 'SecurityError');
  });
  await userEvent.click(choice);
  await waitFor(() =>
    expect(
      within(screen.getByRole('region', { name: 'Ihågkommen inloggning' })).getByRole('alert')
        .textContent,
    ).toContain('Resultatet är bekräftat men flikens referens kunde inte tas bort.'),
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

test('failed consent cleanup keeps confirmed OFF separate from an incomplete browser reset', async () => {
  render(page());
  await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
  await userEvent.click(screen.getByRole('button', { name: 'Återställ samtycke' }));
  const remove = Storage.prototype.removeItem;
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
    if (key === 'skyttel-storage-consent')
      throw new DOMException('Synthetic denied cleanup', 'SecurityError');
    remove.call(this, key);
  });
  const dialog = screen.getByRole('dialog', { name: 'Återställ samtycke?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Återställ' }));
  await waitFor(() =>
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Avstängningen är bekräftad men lagringssamtycket kunde inte återställas.',
    ),
  );
  expect(dialog.textContent).not.toContain('Sparstatus okänd');
  expect(
    await (
      await client.get(`${installation.origin}/api/browser-binding/preference`, {
        headers: { origin: installation.origin },
      })
    ).json(),
  ).toMatchObject({ remembered: false });
});

test('a delayed reset preserves a newer browser consent choice', async () => {
  const transport = authenticatedHttpFetch(client, installation.origin);
  let release = () => {};
  let reached = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const committed = new Promise<void>((resolve) => {
    reached = resolve;
  });
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/browser-binding/revoke') {
      reached();
      await held;
    }
    return response;
  });
  render(page());
  await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
  await userEvent.click(screen.getByRole('button', { name: 'Återställ samtycke' }));
  const dialog = screen.getByRole('dialog', { name: 'Återställ samtycke?' });
  try {
    await userEvent.click(within(dialog).getByRole('button', { name: 'Återställ' }));
    await committed;
    let newer: ReturnType<typeof writeStorageConsent> | undefined;
    await act(async () => {
      newer = writeStorageConsent(true);
      release();
      await held;
    });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'Avstängningen är bekräftad. Ett nyare lagringsval bevaras.',
      ),
    );
    expect(readStorageConsent()).toEqual(newer);
    expect(
      (screen.getByRole('switch', { name: 'Ihågkommen inloggning' }) as HTMLInputElement).checked,
    ).toBe(false);
  } finally {
    release();
  }
});

test('failed browser withdrawal still disables the remembered session on the server', async () => {
  render(page());
  await screen.findByRole('switch', { name: 'Ihågkommen inloggning' });
  const set = Storage.prototype.setItem;
  const remove = Storage.prototype.removeItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === 'skyttel-storage-consent')
      throw new DOMException('Synthetic denied consent write', 'QuotaExceededError');
    set.call(this, key, value);
  });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
    if (key === 'skyttel-storage-consent')
      throw new DOMException('Synthetic denied consent cleanup', 'SecurityError');
    remove.call(this, key);
  });
  await userEvent.click(screen.getByRole('button', { name: 'Endast nödvändiga' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Ihågkommen inloggning är avstängd.'),
  );
  expect(screen.getByRole('alert').textContent).toContain(
    'Kakvalet kunde inte sparas och bekräftas.',
  );
  expect(JSON.parse(localStorage.getItem('skyttel-storage-consent') ?? 'null').preferences).toBe(
    true,
  );
  expect(readStorageConsent()).toBeNull();
  const get = Storage.prototype.getItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
    throw new DOMException('Synthetic temporary read failure', 'SecurityError');
  });
  expect(readStorageConsent()).toBeNull();
  expect(readStorageConsent()).toBeNull();
  expect(get.call(localStorage, 'skyttel-storage-consent')).toBeTruthy();
  expect(
    (screen.getByRole('switch', { name: 'Ihågkommen inloggning' }) as HTMLInputElement).disabled,
  ).toBe(true);
  expect(
    await (
      await client.get(`${installation.origin}/api/browser-binding/preference`, {
        headers: { origin: installation.origin },
      })
    ).json(),
  ).toMatchObject({ remembered: false });
});

test('the banner announces an unavailable preference and offers a fresh login', async () => {
  localStorage.removeItem('skyttel-storage-consent');
  const transport = authenticatedHttpFetch(client, installation.origin);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/browser-binding/preference')
      throw new TypeError('Synthetic preference reply unavailable');
    return transport(input, init);
  });
  render(
    <BrowserRouter>
      <StorageConsentProvider userId={ownerId}>
        <main>
          <h1>Skyttel</h1>
          <button type="button">Fortsätt med Google</button>
        </main>
      </StorageConsentProvider>
    </BrowserRouter>,
  );
  const dialog = screen.getByRole('dialog', { name: 'Vi använder kakor' });
  await waitFor(() =>
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Aktuellt val kunde inte hämtas.',
    ),
  );
  expect(within(dialog).getByRole('link', { name: 'Logga in igen' }).getAttribute('href')).toBe(
    '/login',
  );
  await userEvent.click(within(dialog).getByRole('link', { name: 'Logga in igen' }));
  expect(screen.queryByRole('dialog', { name: 'Vi använder kakor' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Fortsätt med Google' }).hasAttribute('disabled')).toBe(
    false,
  );
});
