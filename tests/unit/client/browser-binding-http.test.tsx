import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  BrowserBindingResetRequired,
  confirmBrowserLogin,
  resetBrowserBinding,
  withBrowserBinding,
} from '../../../src/client/browser-binding.js';
import { request as browserRequest } from '../../../src/client/map-request.js';
import { authenticatedHttpFetch } from '../../support/authenticated-http-fetch.js';
import { activateRememberedLogin } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
function writeCookie(value: string) {
  // biome-ignore lint/suspicious/noDocumentCookie: Exercise the browser cookie boundary, including concurrent writes.
  document.cookie = value;
}
beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: installation.origin });
  writeCookie('skyttel_binding=; Path=/; Max-Age=0');
  vi.stubGlobal('fetch', authenticatedHttpFetch(client, installation.origin));
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await client.dispose();
  await installation.close();
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: 'http://localhost:3000' });
});

async function login(rememberMe: boolean) {
  const start = await withBrowserBinding(() =>
    browserRequest<{ url: string }>('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: '/',
      rememberMe,
      informationVersion: 1,
    }),
  );
  const completed = await client.get(start.url, { maxRedirects: 0 });
  expect(completed.status()).toBe(302);
  if (rememberMe) await activateRememberedLogin(client, installation.origin);
  const proof = new URL(completed.headers().location, installation.origin).searchParams.get(
    'loginConfirmation',
  );
  expect(proof).toMatch(/^[a-f0-9]{64}$/);
  return proof as string;
}

test.each([false, true])(
  'login confirmation establishes the real server choice remembered=%s',
  async (remembered) => {
    const proof = await login(remembered);
    const before = await (await client.get(`${installation.origin}/api/bootstrap`)).json();
    await confirmBrowserLogin(proof, new AbortController().signal);
    expect(await browserRequest('/api/browser-binding/preference')).toMatchObject({ remembered });
    expect(await (await client.get(`${installation.origin}/api/bootstrap`)).json()).toEqual(before);
    // Confirmation neither creates a replacement login nor grants access to a
    // second browser that knows only the correlation proof.
    const other = await request.newContext();
    try {
      expect(
        (
          await other.get(
            `${installation.origin}/api/browser-binding/confirmation?proof=${proof}`,
            { headers: { origin: installation.origin } },
          )
        ).status(),
      ).toBe(401);
    } finally {
      await other.dispose();
    }
  },
);

test('a replacement login between confirmation reads cannot confirm the earlier remembered choice', async () => {
  const proof = await login(true);
  const transport = authenticatedHttpFetch(client, installation.origin);
  let reads = 0;
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input).startsWith('/api/browser-binding/confirmation') && ++reads === 1) {
      const start = await client.post(`${installation.origin}/api/auth/sign-in/social`, {
        headers: { origin: installation.origin },
        data: { provider: 'google', callbackURL: '/', rememberMe: false, informationVersion: 1 },
      });
      await client.get((await start.json()).url, { maxRedirects: 0 });
    }
    return response;
  });
  await expect(confirmBrowserLogin(proof, new AbortController().signal)).rejects.toThrow();
  expect(await browserRequest('/api/browser-binding/preference')).toMatchObject({
    remembered: false,
  });
  expect(await (await client.get(`${installation.origin}/api/bootstrap`)).json()).toMatchObject({
    status: 'setup',
  });
});

test('an unknown binding requires a separate explicit reset before a new login can start', async () => {
  const observed = `skyttel_binding=${'f'.repeat(64)}`;
  writeCookie(`${observed}; Path=/; SameSite=Lax`);
  await client.addCookies([
    { name: 'skyttel_binding', value: 'f'.repeat(64), url: installation.origin },
  ]);
  let started = false;
  await expect(
    withBrowserBinding(async () => {
      started = true;
    }),
  ).rejects.toBeInstanceOf(BrowserBindingResetRequired);
  expect(started).toBe(false);
  expect(document.cookie).toContain(observed);
  await resetBrowserBinding(observed, new AbortController().signal);
  expect(document.cookie).not.toContain('skyttel_binding=');
  expect(started).toBe(false);
  expect(await (await client.get(`${installation.origin}/api/bootstrap`)).json()).toMatchObject({
    status: 'anonymous',
  });
});

test('a delayed reset cannot remove a binding installed by a newer action', async () => {
  const observed = `skyttel_binding=${'f'.repeat(64)}`;
  const replacement = `skyttel_binding=${'a'.repeat(64)}`;
  writeCookie(`${observed}; Path=/`);
  await client.addCookies([
    { name: 'skyttel_binding', value: 'f'.repeat(64), url: installation.origin },
  ]);
  const transport = authenticatedHttpFetch(client, installation.origin);
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await transport(input, init);
    if (String(input) === '/api/browser-binding/reset-check') writeCookie(`${replacement}; Path=/`);
    return response;
  });
  await expect(resetBrowserBinding(observed, new AbortController().signal)).rejects.toThrow();
  expect(document.cookie).toContain(replacement);
});

test('a browser without the required origin lock cannot initiate login or alter its binding', async () => {
  const locks = Object.getOwnPropertyDescriptor(navigator, 'locks');
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  try {
    await expect(withBrowserBinding(async () => 'started')).rejects.toThrow('binding_unavailable');
    expect(fetch).not.toHaveBeenCalled();
    expect(document.cookie).not.toContain('skyttel_binding=');
  } finally {
    if (locks) Object.defineProperty(navigator, 'locks', locks);
    else Reflect.deleteProperty(navigator, 'locks');
  }
});
