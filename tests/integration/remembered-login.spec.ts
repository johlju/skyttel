import { type APIRequestContext, expect, test } from '@playwright/test';
import { acceptRememberedOffer, activateRememberedLogin, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';
import { advanceActiveLogin } from '../support/session-time.js';
import { prepareStorageChoice } from '../support/test.js';

test('ordinary login uses a session cookie and never emits a remembered-choice mirror', {
  tag: '@technical',
}, async ({ request }) => {
  const installation = await createInstallation();
  try {
    await signIn(request, installation.origin);
    const cookies = (await request.storageState()).cookies;
    expect(
      cookies.find((cookie) => cookie.name.endsWith('better-auth.session_token')),
    ).toMatchObject({
      expires: -1,
      httpOnly: true,
      sameSite: 'Lax',
    });
    expect(cookies.some((cookie) => cookie.name.includes('dont_remember'))).toBe(false);
  } finally {
    await installation.close();
  }
});

test('confirmation belongs to the exact current session and a proof alone grants no access', {
  tag: '@technical',
}, async ({ request, playwright }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  const other = await playwright.request.newContext();
  const anonymous = await playwright.request.newContext();
  try {
    await signIn(request, origin);
    const first = await login(request, origin, { rememberMe: true, informationVersion: 1 });
    expect((await anonymous.get(first, { headers: { origin } })).status()).toBe(401);
    installation.setIdentity(robin);
    await signIn(other, origin, 'microsoft');
    expect((await other.get(first, { headers: { origin } })).status()).toBe(401);
    const second = await login(request, origin, { rememberMe: false, informationVersion: 1 });
    expect((await request.get(first, { headers: { origin } })).status()).toBe(401);
    expect((await request.get(second, { headers: { origin } })).status()).toBe(200);
    const saved = await request.storageState();
    const withoutBinding = await playwright.request.newContext({
      storageState: {
        ...saved,
        cookies: saved.cookies.filter((cookie) => cookie.name !== 'skyttel_binding'),
      },
    });
    try {
      expect((await withoutBinding.get(second, { headers: { origin } })).status()).toBe(401);
    } finally {
      await withoutBinding.dispose();
    }
    expect(
      (await request.get(second, { headers: { origin: 'https://attacker.example' } })).status(),
    ).toBe(403);
  } finally {
    await anonymous.dispose();
    await other.dispose();
    await installation.close();
  }
});

test('a delayed remembered confirmation cannot leave persistent binding after a newer ordinary callback', {
  tag: '@technical',
}, async ({ browser }) => {
  let hold = false;
  let reached = () => {};
  let release = () => {};
  const captured = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const installation = await createInstallation(undefined, {
    https: true,
    async deliverResponse(request, response) {
      if (hold && new URL(request.url).pathname === '/api/browser-binding/confirmation') {
        hold = false;
        reached();
        await held;
      }
      return response;
    },
  });
  const { origin } = installation;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await signIn(context.request, origin);
    const confirmation = await login(context.request, origin, {
      rememberMe: true,
      informationVersion: 1,
    });
    // Arrange another already-started callback, so its publication can happen
    // while the real browser holds the confirmation lock across a JSON read.
    const started = await context.request.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'google', callbackURL: '/', rememberMe: false, informationVersion: 1 },
    });
    expect(started.status()).toBe(200);
    const pending = (await started.json()).url;
    hold = true;
    await prepareStorageChoice(context, true);
    const page = await context.newPage();
    await page.goto(
      `${origin}/?loginConfirmation=${new URL(confirmation).searchParams.get('proof')}`,
    );
    await captured;
    expect((await context.request.get(pending, { maxRedirects: 0 })).status()).toBe(302);
    release();
    await expect(page.getByRole('alert')).toHaveText(
      'Inloggningen kunde inte bekräftas. Försök logga in igen. Kontrollera att webbläsaren tillåter kakor för Skyttel om problemet kvarstår.',
    );
    expect(
      (await context.cookies())
        .filter((item) => item.name.includes('binding') || item.name.endsWith('session_token'))
        .every((item) => item.expires === -1),
    ).toBe(true);
    expect(await (await context.request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'setup',
    });
  } finally {
    release();
    await context.close();
    await installation.close();
  }
});

test('delayed remembered-cookie delivery and repeated reads retain the original absolute deadline', {
  tag: '@technical',
}, async ({ request }) => {
  let time = Date.now();
  let delayed = false;
  const installation = await createInstallation(undefined, {
    now: () => time,
    deliverResponse(request, response) {
      if (delayed && new URL(request.url).pathname.startsWith('/api/auth/callback/'))
        time += 300_000;
      return response;
    },
  });
  const { origin } = installation;
  try {
    await signIn(request, origin);
    const expiresAt = time + 604_800_000;
    delayed = true;
    const proof = await login(request, origin, { rememberMe: true, informationVersion: 1 });
    const cookie = (await request.storageState()).cookies.find((item) =>
      item.name.endsWith('session_token'),
    );
    expect(cookie?.expires).toBe(Math.floor(expiresAt / 1000));
    for (let repeat = 0; repeat < 3; repeat++) {
      const response = await request.get(proof, { headers: { origin } });
      expect(await response.json()).toMatchObject({ remembered: true, expiresAt });
      expect(response.headers()['set-cookie']).toBeUndefined();
      time += 60_000;
    }
  } finally {
    await installation.close();
  }
});

async function login(client: APIRequestContext, origin: string, choice: Record<string, unknown>) {
  const start = await client.post(`${origin}/api/auth/sign-in/social`, {
    headers: { origin },
    data: { provider: 'google', callbackURL: '/', ...choice },
  });
  expect(start.status()).toBe(200);
  const response = await client.get((await start.json()).url, { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  if (choice.rememberMe === true && choice.informationVersion === 1)
    await activateRememberedLogin(client, origin);
  const proof = new URL(response.headers().location, origin).searchParams.get('loginConfirmation');
  expect(proof).toMatch(/^[a-f0-9]{64}$/);
  return `${origin}/api/browser-binding/confirmation?proof=${proof}`;
}

test('ACCESS-28: a callback without an accepted auth cookie shows the precise unconfirmed-login message', async ({
  browser,
}) => {
  const installation = await createInstallation(undefined, {
    https: true,
    deliverResponse(request, response) {
      if (!new URL(request.url).pathname.startsWith('/api/auth/callback/')) return response;
      const headers = new Headers(response.headers);
      headers.delete('set-cookie');
      for (const cookie of response.headers.getSetCookie())
        if (!cookie.split(';', 1)[0].split('=')[0].endsWith('better-auth.session_token'))
          headers.append('set-cookie', cookie);
      return new Response(response.body, { status: response.status, headers });
    },
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Endast nödvändiga', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'Inloggningen kunde inte bekräftas. Försök logga in igen. Kontrollera att webbläsaren tillåter kakor för Skyttel om problemet kvarstår.',
    );
    await expect(
      page.getByRole('button', { name: 'Fortsätt med Google', exact: true }),
    ).toBeVisible();
    expect((await context.cookies()).filter((item) => item.name.includes('binding'))).toEqual([
      expect.objectContaining({ expires: -1 }),
    ]);
    expect(
      await (await context.request.get(`${installation.origin}/api/bootstrap`)).json(),
    ).toMatchObject({ status: 'anonymous' });
  } finally {
    await context.close();
    await installation.close();
  }
});

test('untrusted choice fields and direct authentication routes cannot create remembered access', {
  tag: '@technical',
}, async ({ request }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    await signIn(request, origin);
    for (const choice of [
      {},
      { rememberMe: 'true', informationVersion: 1 },
      { rememberMe: 1, informationVersion: 1 },
      { rememberMe: true },
      { rememberMe: true, informationVersion: 999 },
      { rememberMe: true, informationVersion: '1' },
      {
        additionalData: {
          rememberMe: true,
          informationVersion: 1,
          choiceSchemaVersion: 1,
          decidedAt: Date.now(),
          absoluteExpiresAt: Date.now() + 999_999_999,
        },
      },
    ]) {
      const proof = await login(request, origin, choice);
      expect(await (await request.get(proof, { headers: { origin } })).json()).toMatchObject({
        remembered: false,
      });
      expect(
        (await request.storageState()).cookies.find((item) => item.name.endsWith('session_token'))
          ?.expires,
      ).toBe(-1);
    }
    const before = await (await request.get(`${origin}/api/auth/get-session`)).json();
    expect(
      (await request.get(`${origin}/api/auth/sign-in/social`, { headers: { origin } })).status(),
    ).toBe(400);
    expect(
      (
        await request.post(`${origin}/api/auth/sign-in/social`, {
          headers: { origin },
          data: {
            provider: 'google',
            idToken: { token: 'forged' },
            rememberMe: true,
            informationVersion: 1,
          },
        })
      ).status(),
    ).toBe(400);
    for (const path of ['update-session', 'link-social', 'sign-in/email'])
      expect(
        (
          await request.post(`${origin}/api/auth/${path}`, {
            headers: { origin },
            data: { rememberMe: true },
          })
        ).status(),
      ).toBe(404);
    expect(
      (
        await request.post(`${origin}/api/auth/sign-in/social`, {
          headers: { origin: 'https://attacker.example' },
          data: { provider: 'google', rememberMe: true, informationVersion: 1 },
        })
      ).status(),
    ).toBe(403);
    expect(await (await request.get(`${origin}/api/auth/get-session`)).json()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('ACCESS-27: remembered login is selected separately after each successful login and a failed provider visit preserves the existing session', async ({
  browser,
}) => {
  const installation = await createInstallation(undefined, { https: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    const page = await context.newPage();
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Acceptera Alla', exact: true }).click();
    const chooseProvider = () =>
      page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    const continueLogin = () =>
      page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await chooseProvider();
    await continueLogin();
    await acceptRememberedOffer(page);
    await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
    const cookies = (await context.cookies()).filter(
      (item) => item.name.includes('binding') || item.name.endsWith('session_token'),
    );
    expect(cookies).toHaveLength(2);
    expect(cookies.every((item) => item.expires > Date.now() / 1000 && item.secure)).toBe(true);
    expect(cookies.find((item) => item.name.endsWith('session_token'))?.httpOnly).toBe(true);
    await page.goto(`${installation.origin}/login`);
    await chooseProvider();
    await page.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await chooseProvider();
    installation.failProvider(true);
    await continueLogin();
    await expect(page.getByRole('alert')).toContainText('Inloggningen kunde inte slutföras');
    expect(
      (await context.cookies()).filter(
        (item) => item.name.includes('binding') || item.name.endsWith('session_token'),
      ),
    ).toEqual(cookies);
    installation.failProvider(false);
    await chooseProvider();
    await continueLogin();
    const offer = page.getByRole('dialog', { name: 'Kom ihåg mig i Skyttel', exact: true });
    await offer.getByRole('button', { name: 'Inte nu', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
    expect(
      (await context.cookies())
        .filter((item) => item.name.includes('binding') || item.name.endsWith('session_token'))
        .every((item) => item.expires === -1),
    ).toBe(true);
    expect(
      await (
        await context.request.get(`${installation.origin}/api/browser-binding/preference`, {
          headers: { origin: installation.origin },
        })
      ).json(),
    ).toMatchObject({ remembered: false });
  } finally {
    await context.close();
    await installation.close();
  }
});

for (const remembered of [false, true]) {
  test(`${remembered ? 'remembered' : 'ordinary'} login ends exactly at its absolute deadline across reads and restart`, {
    tag: '@technical',
  }, async ({ request }) => {
    let time = Date.now();
    const installation = await createInstallation(undefined, { now: () => time });
    const { origin } = installation;
    try {
      await signIn(request, origin);
      const confirmation = await login(request, origin, {
        rememberMe: remembered,
        informationVersion: 1,
      });
      const expiresAt = time + (remembered ? 604_800_000 : 28_800_000);
      const read = () => request.get(confirmation, { headers: { origin } });
      expect(await (await read()).json()).toMatchObject({
        status: 'confirmed',
        remembered,
        informationVersion: 1,
        expiresAt,
        decidedAt: time,
      });
      const cookie = (await request.storageState()).cookies.find((item) =>
        item.name.endsWith('better-auth.session_token'),
      );
      expect(cookie?.expires).toBe(remembered ? Math.floor(expiresAt / 1000) : -1);
      if (remembered) time += 3_600_000;
      else
        await advanceActiveLogin(request, origin, 3_600_000, (elapsed) => {
          time += elapsed;
        });
      await installation.restart();
      expect(await (await read()).json()).toMatchObject({ expiresAt });
      if (remembered) time = expiresAt - 1;
      else
        await advanceActiveLogin(request, origin, expiresAt - 1 - time, (elapsed) => {
          time += elapsed;
        });
      expect((await read()).status()).toBe(200);
      expect(
        (await request.get(`${origin}/api/auth/get-session`)).headers()['set-cookie'],
      ).toBeUndefined();
      time = expiresAt;
      expect((await read()).status()).toBe(401);
      expect(await (await request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
      expect(
        (
          await request.post(`${origin}/api/households`, {
            headers: { origin },
            data: { name: 'Too late' },
          })
        ).status(),
      ).toBe(401);
      const registration = await request.post(`${origin}/api/auth/oauth2/register`, {
        headers: { origin },
        data: {
          application_type: 'native',
          client_name: 'Boundary check',
          redirect_uris: ['http://127.0.0.1:7777/callback'],
          token_endpoint_auth_method: 'none',
        },
      });
      expect(registration.status()).toBe(201);
      expect(await registration.json()).not.toHaveProperty('user_id');
      expect(registration.headers()['set-cookie']).toBeUndefined();
      time += 1;
      expect(await (await request.get(`${origin}/api/auth/get-session`)).json()).toBeNull();
    } finally {
      await installation.close();
    }
  });
}
