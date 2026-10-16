import { type APIRequestContext, request } from '@playwright/test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { BrowserRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import { PolicyContact } from '../../../src/client/PolicyContact.js';
import { StorageConsentProvider } from '../../../src/client/StorageConsent.js';
import { readStorageConsent, writeStorageConsent } from '../../../src/client/storage-consent.js';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  installation = await createInstallation();
  client = await request.newContext();
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: installation.origin });
  vi.stubGlobal('fetch', authenticatedHttpFetch(client, installation.origin));
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

function banner() {
  return render(
    <BrowserRouter>
      <StorageConsentProvider>
        <main>
          <h1 tabIndex={-1}>Skyttel</h1>
        </main>
      </StorageConsentProvider>
    </BrowserRouter>,
  );
}

test.each(['necessary', 'all', 'custom'] as const)(
  'the %s banner action saves only permission and returns focus to the page',
  async (choice) => {
    banner();
    if (choice === 'custom') {
      await userEvent.click(screen.getByRole('button', { name: 'Anpassa Inställningar' }));
      await userEvent.click(screen.getByRole('switch', { name: 'Preferenskakor' }));
      await userEvent.click(screen.getByRole('button', { name: 'Spara Preferenser' }));
    } else {
      await userEvent.click(
        screen.getByRole('button', {
          name: choice === 'all' ? 'Acceptera Alla' : 'Endast nödvändiga',
        }),
      );
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('status')).toBeNull();
    expect(readStorageConsent()?.preferences).toBe(choice !== 'necessary');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Skyttel' }));
    expect((await client.get(`${installation.origin}/api/auth/get-session`)).status()).toBe(200);
    expect(
      await (await client.get(`${installation.origin}/api/auth/get-session`)).json(),
    ).toBeNull();
  },
);

test('banner keyboard dismissal returns from details and never silently chooses permission', async () => {
  banner();
  const dialog = screen.getByRole('dialog');
  await userEvent.click(screen.getByRole('button', { name: 'Läs mer' }));
  await userEvent.click(screen.getByText('Visa nödvändiga lagringsuppgifter (8)'));
  expect(
    within(
      screen.getByText('Visa nödvändiga lagringsuppgifter (8)').parentElement as HTMLElement,
    ).getAllByRole('listitem'),
  ).toHaveLength(8);
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(screen.getByRole('heading', { name: 'Vi använder kakor' })).toBeTruthy();
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Anpassa Inställningar' }),
  );
  await userEvent.keyboard('{Escape}');
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Endast nödvändiga' }));
  await userEvent.click(screen.getByRole('button', { name: 'Anpassa Inställningar' }));
  await userEvent.keyboard('{Escape}');
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(readStorageConsent()).toBeNull();
  expect(dialog.hasAttribute('open')).toBe(true);
});

test.each(['write rejected', 'write discarded', 'withdrawal and deletion rejected'] as const)(
  'a browser %s leaves an explicit failure and permits necessary-only continuation',
  async (failure) => {
    banner();
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'skyttel-storage-consent') {
        if (failure !== 'write discarded') throw new DOMException('Synthetic denied write');
        return;
      }
      set.call(this, key, value);
    });
    if (failure === 'withdrawal and deletion rejected')
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('Synthetic denied deletion');
      });
    await userEvent.click(
      screen.getByRole('button', {
        name:
          failure === 'withdrawal and deletion rejected' ? 'Endast nödvändiga' : 'Acceptera Alla',
      }),
    );
    await screen.findByText(/Kakvalet kunde inte sparas och bekräftas/);
    expect(readStorageConsent()).toBeNull();
    await userEvent.click(
      screen.getByRole('button', { name: 'Fortsätt med endast nödvändig lagring' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain(
      'Ett tidigare sparat val kan finnas kvar',
    );
  },
);

async function confirmedLogin() {
  await signIn(client, installation.origin);
  const start = await client.post(`${installation.origin}/api/auth/sign-in/social`, {
    headers: { origin: installation.origin },
    data: { provider: 'google', callbackURL: '/' },
  });
  const callback = await client.get((await start.json()).url, { maxRedirects: 0 });
  const location = callback.headers().location;
  expect(location).toContain('loginConfirmation=');
  const binding = (await client.storageState()).cookies.find(
    (cookie) => cookie.name === 'skyttel_binding',
  );
  expect(binding).toBeTruthy();
  // biome-ignore lint/suspicious/noDocumentCookie: Mirror the actual HTTP cookie into jsdom's missing shared browser jar.
  document.cookie = `skyttel_binding=${binding?.value}; Path=/; SameSite=Lax`;
  window.history.replaceState(null, '', location);
  return location;
}

function application() {
  return render(
    <BrowserRouter>
      <App />
    </BrowserRouter>,
  );
}
const offer = () => screen.findByRole('dialog', { name: 'Kom ihåg mig i Skyttel' });
async function preference() {
  return (
    await client.get(`${installation.origin}/api/browser-binding/preference`, {
      headers: { origin: installation.origin },
    })
  ).json();
}

test.each(['accept', 'later', 'never', 'cancel'] as const)(
  'the confirmed post-login offer handles %s without repeating a callback offer',
  async (choice) => {
    writeStorageConsent(true);
    const callback = await confirmedLogin();
    const view = application();
    const dialog = await offer();
    expect(await preference()).toMatchObject({ remembered: false });
    if (choice === 'cancel') fireEvent(dialog, new Event('cancel', { cancelable: true }));
    else
      await userEvent.click(
        within(dialog).getByRole('button', {
          name:
            choice === 'accept'
              ? 'Kom ihåg mig i Skyttel'
              : choice === 'never'
                ? 'Fråga inte igen'
                : 'Inte nu',
        }),
      );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Kom ihåg mig i Skyttel' })).toBeNull(),
    );
    expect(await preference()).toMatchObject({ remembered: choice === 'accept' });
    view.unmount();
    window.history.replaceState(null, '', callback);
    application();
    await screen.findByRole('heading', { name: 'Skapa ditt hushåll' });
    expect(screen.queryByRole('dialog', { name: 'Kom ihåg mig i Skyttel' })).toBeNull();
    if (choice === 'never') {
      cleanup();
      await confirmedLogin();
      application();
      await screen.findByRole('heading', { name: 'Skapa ditt hushåll' });
      expect(screen.queryByRole('dialog', { name: 'Kom ihåg mig i Skyttel' })).toBeNull();
    }
  },
  20_000,
);

test('a denied future-offer write keeps the current offer open with an announced failure', async () => {
  writeStorageConsent(true);
  await confirmedLogin();
  application();
  const dialog = await offer();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Synthetic storage denied');
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Fråga inte igen' }));
  expect(within(dialog).getByRole('alert').textContent).toBe(
    'Förslagsvalet kunde inte sparas. Försök igen.',
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Inte nu' }));
  expect(screen.queryByRole('dialog', { name: 'Kom ihåg mig i Skyttel' })).toBeNull();
});

test.each(['absent', 'damaged', 'old version', 'invalid preference', 'invalid time'] as const)(
  '%s consent cannot produce a post-login offer or be repaired by replaying the callback',
  async (choice) => {
    if (choice !== 'absent')
      localStorage.setItem(
        'skyttel-storage-consent',
        choice === 'damaged'
          ? '{broken'
          : JSON.stringify({
              schemaVersion: choice === 'old version' ? 0 : 1,
              informationVersion: 1,
              preferences: choice === 'invalid preference' ? 'yes' : true,
              decidedAt: choice === 'invalid time' ? -1 : Date.now(),
            }),
      );
    const callback = await confirmedLogin();
    const view = application();
    await screen.findByRole('heading', { name: 'Skapa ditt hushåll' });
    expect(screen.queryByRole('dialog', { name: 'Kom ihåg mig i Skyttel' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Acceptera Alla' }));
    view.unmount();
    window.history.replaceState(null, '', callback);
    application();
    await screen.findByRole('heading', { name: 'Skapa ditt hushåll' });
    expect(screen.queryByRole('dialog', { name: 'Kom ihåg mig i Skyttel' })).toBeNull();
    expect(await preference()).toMatchObject({ remembered: false });
  },
);

test('an unreadable offer record permits ordinary login while a failed claim never shows a repeatable offer', async () => {
  writeStorageConsent(true);
  await confirmedLogin();
  const get = Storage.prototype.getItem;
  const set = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
    if (key.startsWith('skyttel-login-offer:')) return '{damaged';
    return get.call(this, key);
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.startsWith('skyttel-login-offer:')) return;
    set.call(this, key, value);
  });
  application();
  await screen.findByRole('heading', { name: 'Skapa ditt hushåll' });
  expect(screen.queryByRole('dialog', { name: 'Kom ihåg mig i Skyttel' })).toBeNull();
  expect(await preference()).toMatchObject({ remembered: false });
});

test.each(['completed', 'lost'] as const)(
  'an activation with a %s reply blocks dismissal until the outcome is known',
  async (outcome) => {
    writeStorageConsent(true);
    await confirmedLogin();
    const transport = authenticatedHttpFetch(client, installation.origin);
    let release = () => {};
    let captured = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const committed = new Promise<void>((resolve) => {
      captured = resolve;
    });
    let writes = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await transport(input, init);
      if (String(input) === '/api/browser-binding/activate') {
        writes++;
        captured();
        await held;
        if (outcome === 'lost') throw new TypeError('Synthetic committed reply lost');
      }
      return response;
    });
    application();
    const dialog = await offer();
    try {
      await userEvent.click(within(dialog).getByRole('button', { name: 'Kom ihåg mig i Skyttel' }));
      await committed;
      fireEvent(dialog, new Event('cancel', { cancelable: true }));
      expect(dialog.hasAttribute('open')).toBe(true);
      expect(
        (within(dialog).getByRole('button', { name: 'Inte nu' }) as HTMLButtonElement).disabled,
      ).toBe(true);
      await act(async () => {
        release();
        await held;
      });
      if (outcome === 'lost') {
        await waitFor(() =>
          expect(within(dialog).getByRole('alert').textContent).toContain('Sparstatus okänd'),
        );
        fireEvent(dialog, new Event('cancel', { cancelable: true }));
        expect(dialog.hasAttribute('open')).toBe(true);
        await userEvent.click(
          within(dialog).getByRole('button', { name: 'Lämna med okänt utfall' }),
        );
        expect(sessionStorage.length).toBe(1);
      }
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Kom ihåg mig i Skyttel' })).toBeNull(),
      );
      expect(writes).toBe(1);
      if (outcome === 'lost') {
        cleanup();
        await signIn(client, installation.origin);
        window.history.replaceState(null, '', '/cookies');
        application();
        await screen.findByRole('button', { name: 'Kontrollera igen' });
        await userEvent.click(screen.getByRole('button', { name: 'Kontrollera igen' }));
        await waitFor(() =>
          expect(screen.getByRole('status').textContent).toContain(
            'Ihågkommen inloggning är aktiverad. Resultatet gäller din tidigare begäran. Du har loggat in på nytt.',
          ),
        );
        expect(await preference()).toMatchObject({ remembered: false });
        expect(sessionStorage.length).toBe(0);
        expect(writes).toBe(1);
      }
    } finally {
      release();
    }
  },
);

test.each(['reply', 'failure'] as const)(
  'leaving policy contact before its read %s arrives retires that response',
  async (outcome) => {
    const transport = authenticatedHttpFetch(client, installation.origin);
    let release = () => {};
    let captured = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const received = new Promise<void>((resolve) => {
      captured = resolve;
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await transport(input, init);
      captured();
      await held;
      if (outcome === 'failure') throw new TypeError('Synthetic late read failure');
      return response;
    });
    const view = render(
      <BrowserRouter>
        <PolicyContact />
      </BrowserRouter>,
    );
    await received;
    view.unmount();
    await act(async () => {
      release();
      await held;
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  },
);

test('policy contact prevents a second submission while its committed reply is pending', async () => {
  await signIn(client, installation.origin);
  const transport = authenticatedHttpFetch(client, installation.origin);
  let release = () => {};
  let captured = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const committed = new Promise<void>((resolve) => {
    captured = resolve;
  });
  let writes = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/operator/policy-contact') {
      writes++;
      captured();
      await held;
    }
    return response;
  });
  render(
    <BrowserRouter>
      <PolicyContact />
    </BrowserRouter>,
  );
  const input = screen.getByRole('textbox') as HTMLInputElement;
  await waitFor(() => expect(input.disabled).toBe(false));
  await userEvent.type(input, 'privacy@example.test');
  try {
    await userEvent.click(screen.getByRole('button', { name: 'Spara policykontakt' }));
    await committed;
    expect(screen.getByRole('status').textContent).toBe('Sparar…');
    expect(input.disabled).toBe(true);
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(writes).toBe(1);
    await act(async () => {
      release();
      await held;
    });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Policykontakten är sparad.'),
    );
    expect(input.disabled).toBe(false);
  } finally {
    release();
  }
});

test.each(['missing', 'existing', 'read failure', 'save failure'] as const)(
  'policy contact displays and preserves the real %s server state',
  async (state) => {
    await signIn(client, installation.origin);
    if (state === 'existing') {
      expect(
        (
          await client.post(`${installation.origin}/api/operator/policy-contact`, {
            headers: { origin: installation.origin },
            data: { email: 'old@example.test' },
          })
        ).status(),
      ).toBe(200);
    }
    const transport = authenticatedHttpFetch(client, installation.origin);
    let allowSave = state !== 'save failure';
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (state === 'read failure' && String(input) === '/api/policy-contact')
        return Promise.reject(new TypeError('Synthetic read failure'));
      if (!allowSave && String(input) === '/api/operator/policy-contact')
        return Promise.reject(new TypeError('Synthetic save failure'));
      return transport(input, init);
    });
    render(
      <BrowserRouter>
        <PolicyContact />
      </BrowserRouter>,
    );
    const input = screen.getByRole('textbox', {
      name: 'Kontaktadress för kakpolicyn',
    }) as HTMLInputElement;
    if (state === 'read failure') {
      await screen.findByText(/Policykontakten kunde inte sparas eller läsas/);
      expect(input.disabled).toBe(true);
      return;
    }
    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.value).toBe(state === 'existing' ? 'old@example.test' : '');
    await userEvent.clear(input);
    await userEvent.type(input, 'new@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Spara policykontakt' }));
    if (state === 'save failure') {
      await screen.findByText(/Policykontakten kunde inte sparas eller läsas/);
      expect(input.value).toBe('new@example.test');
      allowSave = true;
      await userEvent.click(screen.getByRole('button', { name: 'Spara policykontakt' }));
    }
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Policykontakten är sparad.'),
    );
    expect(await (await client.get(`${installation.origin}/api/policy-contact`)).json()).toEqual({
      email: 'new@example.test',
    });
  },
);
