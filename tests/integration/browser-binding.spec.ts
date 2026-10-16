import { expect, test } from '@playwright/test';
import { signIn } from '../support/client.js';
import { alex, createInstallation, robin } from '../support/installation.js';
import { advanceActiveLogin } from '../support/session-time.js';

test('explicit login replaces a known expired binding without reviving its old access', {
  tag: '@technical',
}, async ({ playwright }) => {
  let time = Date.now();
  const installation = await createInstallation(undefined, { now: () => time });
  const { origin } = installation;
  const client = await playwright.request.newContext();
  const bindingOnly = await playwright.request.newContext();
  const unknown = await playwright.request.newContext();
  const independent = await playwright.request.newContext();
  let stale: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined;
  const candidate = (request: typeof client) =>
    request.post(`${origin}/api/browser-binding/candidate`, { headers: { origin }, data: {} });
  try {
    await signIn(client, origin);
    const saved = await client.storageState();
    const oldBinding = saved.cookies.find((item) => item.name === 'skyttel_binding');
    if (!oldBinding) throw new Error('Missing binding');
    expect(oldBinding.expires).toBe(-1);
    stale = await playwright.request.newContext({ storageState: saved });
    await bindingOnly.addCookies([oldBinding]);
    expect((await candidate(bindingOnly)).status()).toBe(409);
    expect(await (await client.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
    await unknown.addCookies([{ ...oldBinding, value: 'f'.repeat(64) }]);
    expect((await candidate(unknown)).status()).toBe(409);

    await advanceActiveLogin(client, origin, 28_799_999, (elapsed) => {
      time += elapsed;
    });
    expect(await (await client.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
    expect((await candidate(bindingOnly)).status()).toBe(409);
    const pending = await client.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'google', callbackURL: '/' },
    });
    expect(pending.status()).toBe(200);
    const oldCallback = (await pending.json()).url;
    await signIn(independent, origin);

    time += 1;
    expect(await (await client.get(`${origin}/api/auth/get-session`)).json()).toBeNull();
    expect(await (await client.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    expect(
      (
        await client.post(`${origin}/api/browser-binding/register`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(409);
    const replacement = await candidate(client);
    expect(replacement.status()).toBe(200);
    expect(replacement.headers()['set-cookie']).toBeUndefined();
    const binding = await replacement.json();
    expect(binding.candidate).not.toBe(oldBinding.value);
    await client.addCookies([
      { name: binding.cookieName, value: binding.candidate, url: origin, sameSite: 'Lax' },
    ]);
    expect(
      (
        await client.post(`${origin}/api/browser-binding/register`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect(await (await client.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    const started = await client.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'google', callbackURL: '/' },
    });
    expect(started.status()).toBe(200);
    const completed = await client.get((await started.json()).url, { maxRedirects: 0 });
    expect(completed.status()).toBe(302);
    const proof = new URL(completed.headers().location, origin).searchParams.get(
      'loginConfirmation',
    );
    expect(proof).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await (
        await client.get(`${origin}/api/browser-binding/confirmation?proof=${proof}`, {
          headers: { origin },
        })
      ).json(),
    ).toMatchObject({ remembered: false, expiresAt: time + 28_800_000 });
    expect(await (await client.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
    expect(await (await stale.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    expect((await stale.get(oldCallback, { maxRedirects: 0 })).headers().location).toBe(
      `${origin}/?error=binding_invalid`,
    );
    expect(await (await independent.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
    expect((await candidate(unknown)).status()).toBe(409);
  } finally {
    await client.dispose();
    await bindingOnly.dispose();
    await unknown.dispose();
    await independent.dispose();
    await stale?.dispose();
    await installation.close();
  }
});

for (const sameUser of [true, false]) {
  test(`first successful callback cancels an already verifying ${sameUser ? 'same' : 'different'} user`, {
    tag: '@technical',
  }, async ({ playwright }) => {
    const installation = await createInstallation();
    const { origin } = installation;
    const first = await playwright.request.newContext();
    let second: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined;
    let original: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined;
    let independent: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined;
    let resume = () => {};
    try {
      await signIn(first, origin);
      const saved = await first.storageState();
      second = await playwright.request.newContext({ storageState: saved });
      original = await playwright.request.newContext({ storageState: saved });
      independent = await playwright.request.newContext();
      await signIn(independent, origin);
      const independentBefore = await (await independent.get(`${origin}/api/bootstrap`)).json();
      async function start(client: typeof first) {
        const response = await client.post(`${origin}/api/auth/sign-in/social`, {
          headers: { origin },
          data: { provider: 'google', callbackURL: '/' },
        });
        expect(response.status()).toBe(200);
        return (await response.json()).url as string;
      }
      const slowUrl = await start(first);
      const fastUrl = await start(second);
      const paused = installation.pauseNextProvider();
      resume = paused.resume;
      const slow = first.get(slowUrl, { maxRedirects: 0 });
      await paused.reached;
      installation.setIdentity(sameUser ? alex : robin);
      expect((await second.get(fastUrl, { maxRedirects: 0 })).status()).toBe(302);
      const winner = await (await second.get(`${origin}/api/bootstrap`)).json();
      expect(winner.user.name).toBe(sameUser ? alex.name : robin.name);
      paused.resume();
      expect((await slow).headers().location).toBe(`${origin}/?error=binding_invalid`);
      expect(await (await first.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
      expect(await (await original.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
      expect(await (await independent.get(`${origin}/api/bootstrap`)).json()).toEqual(
        independentBefore,
      );
      await installation.restart();
      expect(await (await original.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
      expect(await (await second.get(`${origin}/api/bootstrap`)).json()).toEqual(winner);
      expect((await first.get(slowUrl, { maxRedirects: 0 })).headers().location).toBe(
        `${origin}/?error=binding_invalid`,
      );
    } finally {
      resume();
      await first.dispose();
      await second?.dispose();
      await original?.dispose();
      await independent?.dispose();
      await installation.close();
    }
  });
}

test('a genuinely delayed callback header overwrites the browser cookie without reviving its old session', {
  tag: '@technical',
}, async ({ browser, playwright }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let capture: (cookies: string[]) => void = () => {};
  const captured = new Promise<string[]>((resolve) => {
    capture = resolve;
  });
  let delay = false;
  const installation = await createInstallation(undefined, {
    https: true,
    async deliverResponse(request, response) {
      if (delay && new URL(request.url).pathname.startsWith('/api/auth/callback/')) {
        delay = false;
        capture(response.headers.getSetCookie());
        await held;
      }
      return response;
    },
  });
  const { origin } = installation;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  let current: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined;
  try {
    await signIn(context.request, origin);
    const start = await context.request.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'google', callbackURL: '/' },
    });
    expect(start.status()).toBe(200);
    delay = true;
    const oldResponse = context.request.get((await start.json()).url, { maxRedirects: 0 });
    const issued = await captured;
    // The installation's response-delivery seam exposes the issued key only
    // to the fixture. A second client arranges a later authorized replacement
    // while the original real HTTP response is still held outside the server.
    current = await playwright.request.newContext({
      ignoreHTTPSErrors: true,
      storageState: await context.request.storageState(),
    });
    const oldAuth = issued.find((item) => item.startsWith('__Secure-better-auth.session_token='));
    if (!oldAuth) throw new Error('Missing issued auth cookie');
    const [name, ...parts] = oldAuth.split(';', 1)[0].split('=');
    await current.addCookies([
      { name, value: parts.join('='), url: origin, secure: true, httpOnly: true, sameSite: 'Lax' },
    ]);
    installation.setIdentity(robin);
    await signIn(current, origin);
    const winner = await current.storageState();
    await context.addCookies(winner.cookies);
    const winningKey = (await context.cookies()).find((cookie) => cookie.name === name)?.value;
    expect(await (await context.request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      user: { name: robin.name },
    });
    release();
    expect((await oldResponse).status()).toBe(302);
    const lateKey = (await context.cookies()).find((cookie) => cookie.name === name)?.value;
    expect(lateKey).toBe(parts.join('='));
    expect(lateKey).not.toBe(winningKey);
    expect(await (await context.request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    expect(await (await current.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      user: { name: robin.name },
    });
    await installation.restart();
    expect(await (await context.request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
  } finally {
    release();
    await current?.dispose();
    await context.close();
    await installation.close();
  }
});

test('logout cancels a provider callback and its account linking effects without touching another binding', {
  tag: '@technical',
}, async ({ playwright }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  const client = await playwright.request.newContext();
  const other = await playwright.request.newContext();
  let resume = () => {};
  try {
    await signIn(client, origin);
    await signIn(other, origin);
    async function link(step: string, provider: string) {
      const response = await client.post(`${origin}/api/login-methods/${step}`, {
        headers: { origin },
        data: { provider },
      });
      expect(response.status()).toBe(200);
      return (await response.json()).url as string;
    }
    await client.get(await link('prove', 'google'));
    const pending = await link('add', 'microsoft');
    installation.setIdentity({ ...alex, subject: 'uncommitted-microsoft' });
    const paused = installation.pauseNextProvider();
    resume = paused.resume;
    const callback = client.get(pending, { maxRedirects: 0 });
    await paused.reached;
    expect(
      (
        await client.post(`${origin}/api/auth/sign-out`, { headers: { origin }, data: {} })
      ).status(),
    ).toBe(200);
    paused.resume();
    expect((await callback).headers().location).toBe(`${origin}/?error=binding_invalid`);
    expect(await (await client.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    expect(await (await other.get(`${origin}/api/login-methods`)).json()).toMatchObject({
      providers: ['google'],
    });
    installation.setIdentity(alex);
    await signIn(client, origin);
    expect(await (await client.get(`${origin}/api/login-methods`)).json()).toMatchObject({
      providers: ['google'],
    });
  } finally {
    resume();
    await client.dispose();
    await other.dispose();
    await installation.close();
  }
});

test('successful account proof keeps a separately registered login attempt valid', {
  tag: '@technical',
}, async ({ playwright }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  const login = await playwright.request.newContext();
  let linking: Awaited<ReturnType<typeof playwright.request.newContext>> | undefined;
  let resume = () => {};
  try {
    await signIn(login, origin);
    linking = await playwright.request.newContext({ storageState: await login.storageState() });
    const started = await login.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'microsoft', callbackURL: '/' },
    });
    const proof = await linking.post(`${origin}/api/login-methods/prove`, {
      headers: { origin },
      data: { provider: 'google' },
    });
    expect(started.status()).toBe(200);
    expect(proof.status()).toBe(200);
    installation.setIdentity(robin);
    const pause = installation.pauseNextProvider();
    resume = pause.resume;
    const pending = login.get((await started.json()).url, { maxRedirects: 0 });
    await pause.reached;
    installation.setIdentity(alex);
    expect(
      (await linking.get((await proof.json()).url, { maxRedirects: 0 })).headers().location,
    ).toBe('/login-methods');
    expect(await (await linking.get(`${origin}/api/login-methods`)).json()).toMatchObject({
      stage: 'verified',
    });
    resume();
    const returned = new URL((await pending).headers().location, origin);
    expect(returned.origin).toBe(origin);
    expect(returned.pathname).toBe('/');
    expect(returned.searchParams.get('loginConfirmation')).toMatch(/^[a-f0-9]{64}$/);
    expect(await (await login.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      user: { name: robin.name },
    });
    expect(await (await linking.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
  } finally {
    resume();
    await login.dispose();
    await linking?.dispose();
    await installation.close();
  }
});

for (const sharedIdentity of [false, true]) {
  test(`concurrent ${sharedIdentity ? 'identical' : 'unrelated'} provider identities in independent bindings preserve committed accounts`, {
    tag: '@technical',
  }, async ({ playwright }) => {
    const installation = await createInstallation();
    const { origin } = installation;
    const slowClient = await playwright.request.newContext();
    const fastClient = await playwright.request.newContext();
    let resume = () => {};
    try {
      await signIn(slowClient, origin);
      await signIn(fastClient, origin);
      const original = await (await slowClient.get(`${origin}/api/bootstrap`)).json();
      async function start(client: typeof slowClient) {
        const response = await client.post(`${origin}/api/auth/sign-in/social`, {
          headers: { origin },
          data: { provider: 'microsoft', callbackURL: '/' },
        });
        expect(response.status()).toBe(200);
        return (await response.json()).url as string;
      }
      const slowUrl = await start(slowClient);
      const fastUrl = await start(fastClient);
      installation.setIdentity(robin);
      const pause = installation.pauseNextProvider();
      resume = pause.resume;
      const slowResponse = slowClient.get(slowUrl, { maxRedirects: 0 });
      await pause.reached;
      const fastIdentity = sharedIdentity
        ? robin
        : { ...robin, subject: 'separate-microsoft', name: 'Kim Exempel' };
      installation.setIdentity(fastIdentity);
      const fastRedirect = new URL(
        (await fastClient.get(fastUrl, { maxRedirects: 0 })).headers().location,
        origin,
      );
      expect(fastRedirect.origin).toBe(origin);
      expect(fastRedirect.pathname).toBe('/');
      expect(fastRedirect.searchParams.get('loginConfirmation')).toMatch(/^[a-f0-9]{64}$/);
      const fast = await (await fastClient.get(`${origin}/api/bootstrap`)).json();
      resume();
      const slow = await slowResponse;
      if (sharedIdentity) expect(slow.headers().location).toBe(`${origin}/?error=binding_invalid`);
      else {
        const slowRedirect = new URL(slow.headers().location, origin);
        expect(slowRedirect.origin).toBe(origin);
        expect(slowRedirect.pathname).toBe('/');
        expect(slowRedirect.searchParams.get('loginConfirmation')).toMatch(/^[a-f0-9]{64}$/);
      }
      const after = await (await slowClient.get(`${origin}/api/bootstrap`)).json();
      expect(after.user.id === original.user.id).toBe(sharedIdentity);
      expect(await (await fastClient.get(`${origin}/api/bootstrap`)).json()).toEqual(fast);
      expect(await (await slowClient.get(`${origin}/api/login-methods`)).json()).toMatchObject({
        providers: [sharedIdentity ? 'google' : 'microsoft'],
      });
      if (sharedIdentity) {
        installation.setIdentity(robin);
        await signIn(slowClient, origin, 'microsoft');
        const replacement = await (await slowClient.get(`${origin}/api/bootstrap`)).json();
        expect(replacement).toEqual({ ...fast, loginId: replacement.loginId });
        expect(replacement.loginId).not.toBe(fast.loginId);
        expect(replacement.loginId).not.toBe(original.loginId);
      } else expect(after.user.id).not.toBe(fast.user.id);
    } finally {
      resume();
      await slowClient.dispose();
      await fastClient.dispose();
      await installation.close();
    }
  });
}

test('binding registration is required before provider start and never writes a binding header', {
  tag: '@technical',
}, async ({ request }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    const start = () =>
      request.post(`${origin}/api/auth/sign-in/social`, {
        headers: { origin },
        data: { provider: 'google', callbackURL: '/' },
      });
    expect((await start()).status()).toBe(409);
    const candidate = await request.post(`${origin}/api/browser-binding/candidate`, {
      headers: { origin },
      data: {},
    });
    expect(candidate.status()).toBe(200);
    expect(candidate.headers()['set-cookie']).toBeUndefined();
    const body = await candidate.json();
    expect(body).toMatchObject({ cookieName: 'skyttel_binding', origin });
    expect(body.candidate).toMatch(/^[a-f0-9]{64}$/);
    const register = await request.post(`${origin}/api/browser-binding/register`, {
      headers: { origin },
      data: {},
    });
    expect(register.status()).toBe(409);
    await request.addCookies([
      { name: body.cookieName, value: body.candidate, url: origin, sameSite: 'Lax' },
    ]);
    expect(
      (
        await request.post(`${origin}/api/browser-binding/register`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    const response = await start();
    expect(response.status()).toBe(200);
    const { url } = await response.json();
    await request.get(url);
    expect(await (await request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
  } finally {
    await installation.close();
  }
});

test('binding loss, occupied bindings and canonical origin checks fail closed', {
  tag: '@technical',
}, async ({ playwright }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  const client = await playwright.request.newContext();
  const other = await playwright.request.newContext();
  try {
    await signIn(client, origin);
    const saved = await client.storageState();
    const binding = saved.cookies.find((item) => item.name === 'skyttel_binding');
    if (!binding) throw new Error('Missing binding');
    await other.addCookies([binding]);
    expect(
      (
        await other.post(`${origin}/api/browser-binding/register`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await other.post(`${origin}/api/auth/sign-in/social`, {
          headers: { origin },
          data: { provider: 'google' },
        })
      ).status(),
    ).toBe(409);
    expect(await (await other.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    for (const headers of [{ origin: 'https://foreign.invalid' }, {}] as Record<string, string>[])
      expect(
        (
          await other.post(`${origin}/api/browser-binding/candidate`, { headers, data: {} })
        ).status(),
      ).toBe(403);
    const alias = await installation.fetch(
      new Request('http://localhost/api/browser-binding/candidate', {
        method: 'POST',
        headers: { origin },
        body: '{}',
      }),
    );
    expect(alias.status).toBe(403);
    // A real auth cookie without the binding cannot read protected content.
    const lost = await playwright.request.newContext({
      storageState: {
        cookies: saved.cookies.filter((item) => item.name !== binding.name),
        origins: [],
      },
    });
    try {
      expect(await (await lost.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
      // Explicit initialization terminates the identifiable older session.
      await signIn(lost, origin);
      expect(await (await client.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
      expect(await (await lost.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'setup',
      });
    } finally {
      await lost.dispose();
    }
    // A completely new context can initialize without identifying old sessions.
    const clean = await playwright.request.newContext();
    try {
      await signIn(clean, origin);
    } finally {
      await clean.dispose();
    }
  } finally {
    await client.dispose();
    await other.dispose();
    await installation.close();
  }
});

test('partial cookie restoration revokes the identifiable older binding before reinitializing', {
  tag: '@technical',
}, async ({ playwright }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  const old = await playwright.request.newContext();
  const recovered = await playwright.request.newContext();
  const vacant = await playwright.request.newContext();
  try {
    await signIn(old, origin);
    const start = await old.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'google', callbackURL: '/' },
    });
    expect(start.status()).toBe(200);
    const pending = (await start.json()).url;
    const saved = await old.storageState();
    const oldBinding = saved.cookies.find((item) => item.name === 'skyttel_binding');
    if (!oldBinding) throw new Error('Missing binding');
    const response = await vacant.post(`${origin}/api/browser-binding/candidate`, {
      headers: { origin },
      data: {},
    });
    expect(response.status()).toBe(200);
    const replacement = await response.json();
    await recovered.addCookies(saved.cookies);
    await recovered.addCookies([
      { name: replacement.cookieName, value: replacement.candidate, url: origin, sameSite: 'Lax' },
    ]);
    expect(await (await recovered.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });

    // The valid auth cookie still identifies the older occupied binding,
    // even when a different, valid vacant binding cookie is restored with it.
    const candidate = await recovered.post(`${origin}/api/browser-binding/candidate`, {
      headers: { origin },
      data: {},
    });
    expect(candidate.status()).toBe(200);
    const binding = await candidate.json();
    await recovered.addCookies([
      { name: binding.cookieName, value: binding.candidate, url: origin, sameSite: 'Lax' },
    ]);
    expect(
      (
        await recovered.post(`${origin}/api/browser-binding/register`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect(await (await old.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    expect(
      (
        await old.post(`${origin}/api/auth/sign-in/social`, {
          headers: { origin },
          data: { provider: 'google' },
        })
      ).status(),
    ).toBe(409);
    expect((await old.get(pending, { maxRedirects: 0 })).headers().location).toBe(
      `${origin}/?error=binding_invalid`,
    );
    // Replaying the original full cookie pair cannot restore the revoked access.
    await recovered.addCookies([oldBinding]);
    expect(await (await recovered.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    await recovered.addCookies([
      { name: binding.cookieName, value: binding.candidate, url: origin, sameSite: 'Lax' },
    ]);
    await signIn(recovered, origin);
    expect(await (await recovered.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
    expect(await (await old.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
  } finally {
    await old.dispose();
    await recovered.dispose();
    await vacant.dispose();
    await installation.close();
  }
});

test('ACCESS-24: simultaneous first HTTPS tabs confirm one browser binding before provider start', async ({
  browser,
}) => {
  const installation = await createInstallation(undefined, { https: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const first = await context.newPage();
    const second = await context.newPage();
    const observed: string[] = [];
    await context.route('**/api/auth/sign-in/social', async (route) => {
      const cookie = (await route.request().allHeaders()).cookie ?? '';
      observed.push(
        cookie
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('__Host-skyttel_binding=')) ?? '',
      );
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      // Keep the test at provider start while preserving the actual app's state.
      await route.fulfill({ status: 503, json: { error: 'synthetic_provider_hold' } });
    });
    await Promise.all([first.goto(installation.origin), second.goto(installation.origin)]);
    expect((await context.cookies()).filter((item) => item.name.includes('binding'))).toEqual([]);
    for (const page of [first, second])
      await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await Promise.all(
      [first, second].map((page) =>
        page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click(),
      ),
    );
    await expect.poll(() => observed.length).toBe(2);
    for (const page of [first, second]) {
      await expect(page.getByRole('alert')).toContainText('Inloggningen kunde inte slutföras');
      await expect(
        page.getByRole('button', { name: 'Fortsätt med Google', exact: true }),
      ).toBeVisible();
    }
    expect(observed[0]).toBe(observed[1]);
    expect(observed[0]).toMatch(/^__Host-skyttel_binding=[a-f0-9]{64}$/);
    const cookies = await context.cookies();
    expect(cookies.filter((item) => item.name.includes('binding'))).toEqual([
      expect.objectContaining({
        name: '__Host-skyttel_binding',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax',
        path: '/',
        expires: -1,
      }),
    ]);
    const independent = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await independent.newPage();
      await page.goto(installation.origin);
      await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
      await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
      expect(
        (await independent.cookies()).find((item) => item.name.includes('binding'))?.value,
      ).not.toBe(cookies[0].value);
    } finally {
      await independent.close();
    }
  } finally {
    await context.close();
    await installation.close();
  }
});

test('callbacks without their positively registered binding cannot authenticate', {
  tag: '@technical',
}, async ({ request }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    const candidate = await request.post(`${origin}/api/browser-binding/candidate`, {
      headers: { origin },
      data: {},
    });
    const binding = await candidate.json();
    await request.addCookies([
      { name: binding.cookieName, value: binding.candidate, url: origin, sameSite: 'Lax' },
    ]);
    await request.post(`${origin}/api/browser-binding/register`, { headers: { origin }, data: {} });
    const start = await request.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'google', callbackURL: '/' },
    });
    const { url } = await start.json();
    for (const value of ['', 'f'.repeat(64)]) {
      await request.addCookies([{ name: binding.cookieName, value, url: origin, sameSite: 'Lax' }]);
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.headers().location).toBe(`${origin}/?error=binding_invalid`);
      expect(await (await request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
    }
    await request.addCookies([
      { name: binding.cookieName, value: binding.candidate, url: origin, sameSite: 'Lax' },
    ]);
    await request.get(url);
    expect(await (await request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
    await installation.restart();
    expect(await (await request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
  } finally {
    await installation.close();
  }
});

test('ACCESS-26: cancelling delayed initialization cannot replace another tabs confirmed binding', async ({
  browser,
}) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let candidateReceived = false;
  let delivered = false;
  const installation = await createInstallation(undefined, {
    https: true,
    async deliverResponse(request, response) {
      if (
        !candidateReceived &&
        new URL(request.url).pathname === '/api/browser-binding/candidate'
      ) {
        expect(response.headers.get('set-cookie')).toBeNull();
        candidateReceived = true;
        await held;
        delivered = true;
      }
      return response;
    },
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const first = await context.newPage();
    const second = await context.newPage();
    await Promise.all([first.goto(installation.origin), second.goto(installation.origin)]);
    await first.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await first.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await expect.poll(() => candidateReceived).toBe(true);
    await first.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(first.getByRole('status')).toContainText('Inloggningen avbröts');
    await second.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await second.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await expect(second.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
    const before = (await context.cookies()).find((item) => item.name === '__Host-skyttel_binding');
    release();
    await expect.poll(() => delivered).toBe(true);
    expect(
      (await context.cookies()).find((item) => item.name === '__Host-skyttel_binding'),
    ).toEqual(before);
    await second.reload();
    await expect(second.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
    await expect(
      first.getByRole('button', { name: 'Fortsätt med Google', exact: true }),
    ).toBeVisible();
  } finally {
    release();
    await context.close();
    await installation.close();
  }
});

test('ACCESS-25: unavailable browser locks and blocked cookies stop login accessibly without retry', async ({
  browser,
}) => {
  const installation = await createInstallation(undefined, { https: true });
  try {
    for (const failure of ['locks', 'cookies', 'registration'] as const) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true });
      try {
        const page = await context.newPage();
        if (failure === 'locks')
          await page.addInitScript(() =>
            Object.defineProperty(navigator, 'locks', { value: undefined }),
          );
        else if (failure === 'cookies') {
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setDocumentCookieDisabled', { disabled: true });
        } else
          await page.route('**/api/browser-binding/register', async (route) => {
            expect((await route.fetch()).status()).toBe(200);
            await route.abort('failed');
          });
        let starts = 0;
        page.on('request', (request) => {
          if (request.url().endsWith('/api/auth/sign-in/social')) starts += 1;
        });
        await page.goto(installation.origin);
        await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
        await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('Säker inloggning kan inte bekräftas');
        await expect(
          page.getByRole('button', { name: 'Fortsätt med Google', exact: true }),
        ).toBeFocused();
        expect(starts).toBe(0);
        const bindings = (await context.cookies()).filter((item) => item.name.includes('binding'));
        expect(bindings).toHaveLength(failure === 'registration' ? 1 : 0);
        expect(
          await (await context.request.get(`${installation.origin}/api/bootstrap`)).json(),
        ).toMatchObject({ status: 'anonymous' });
      } finally {
        await context.close();
      }
    }
  } finally {
    await installation.close();
  }
});
