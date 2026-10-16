import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { activateRememberedLogin, signIn } from '../support/client.js';
import { alex, createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function revoke(client: APIRequestContext, origin: string) {
  const response = await client.post(`${origin}/api/browser-binding/revoke`, {
    headers: { origin },
    data: { id: randomUUID() },
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  await client.addCookies([
    {
      name: result.cookieName,
      value: result.candidate,
      url: origin,
      secure: origin.startsWith('https:'),
      sameSite: 'Lax',
    },
  ]);
  expect(
    (
      await client.post(`${origin}/api/browser-binding/register`, { headers: { origin }, data: {} })
    ).status(),
  ).toBe(200);
  return result;
}

test('only the authenticated owner can read the committed result until its exact original 24-hour boundary', {
  tag: '@technical',
}, async ({ playwright }) => {
  let time = Date.now();
  const installation = await createInstallation(undefined, { now: () => time });
  const { origin } = installation;
  const owner = await playwright.request.newContext();
  const wrongOwner = await playwright.request.newContext();
  const anonymous = await playwright.request.newContext();
  try {
    await signIn(owner, origin);
    const result = await revoke(owner, origin);
    const path = `${origin}/api/browser-binding/results/${result.id}`;
    expect((await anonymous.get(path, { headers: { origin } })).status()).toBe(401);
    installation.setIdentity(robin);
    await signIn(wrongOwner, origin, 'microsoft');
    expect((await wrongOwner.get(path, { headers: { origin } })).status()).toBe(404);
    expect(
      (await owner.get(path, { headers: { origin: 'https://attacker.example' } })).status(),
    ).toBe(403);
    installation.setIdentity(alex);
    time += 86_399_999;
    await signIn(owner, origin);
    expect(await (await owner.get(path, { headers: { origin } })).json()).toMatchObject({
      id: result.id,
      completedAt: result.completedAt,
      checkUntil: result.completedAt + 86_400_000,
    });
    time += 1;
    expect((await owner.get(path, { headers: { origin } })).status()).toBe(404);
    expect(
      (
        await owner.post(`${origin}/api/browser-binding/revoke`, {
          headers: { origin },
          data: { id: result.id },
        })
      ).status(),
    ).toBe(409);
    expect(await (await owner.get(`${origin}/api/auth/get-session`)).json()).not.toBeNull();
  } finally {
    await owner.dispose();
    await wrongOwner.dispose();
    await anonymous.dispose();
    await installation.close();
  }
});

for (const stage of ['verified proof', 'verifying add', 'linked accounts'] as const) {
  test(`revocation ${stage === 'linked accounts' ? 'preserves' : 'clears'} ${stage} without granting late account-linking effects`, {
    tag: '@technical',
  }, async ({ playwright }) => {
    const installation = await createInstallation();
    const { origin } = installation;
    const client = await playwright.request.newContext();
    const independent = await playwright.request.newContext();
    let resume = () => {};
    try {
      await signIn(client, origin);
      await signIn(independent, origin);
      const link = async (step: string, provider: string) => {
        const response = await client.post(`${origin}/api/login-methods/${step}`, {
          headers: { origin },
          data: { provider },
        });
        expect(response.status()).toBe(200);
        return (await response.json()).url as string;
      };
      await client.get(await link('prove', 'google'), { maxRedirects: 0 });
      if (stage === 'linked accounts') {
        installation.setIdentity({ ...alex, subject: 'linked-microsoft' });
        await client.get(await link('add', 'microsoft'), { maxRedirects: 0 });
        installation.setIdentity(alex);
      }
      let pending: Promise<import('@playwright/test').APIResponse> | undefined;
      if (stage === 'verifying add') {
        const callback = await link('add', 'microsoft');
        const paused = installation.pauseNextProvider();
        resume = paused.resume;
        installation.setIdentity({ ...alex, subject: 'uncommitted-microsoft' });
        pending = client.get(callback, { maxRedirects: 0 });
        await paused.reached;
      }
      await revoke(client, origin);
      if (pending) {
        resume();
        expect((await pending).headers().location).toBe(`${origin}/?error=binding_invalid`);
      }
      const providers = stage === 'linked accounts' ? ['google', 'microsoft'] : ['google'];
      expect(await (await client.get(`${origin}/api/login-methods`)).json()).toMatchObject({
        providers,
        stage: null,
      });
      expect(await (await independent.get(`${origin}/api/login-methods`)).json()).toMatchObject({
        providers,
      });
      expect(
        (
          await client.post(`${origin}/api/login-methods/add`, {
            headers: { origin },
            data: { provider: 'microsoft' },
          })
        ).status(),
      ).toBe(409);
    } finally {
      resume();
      await client.dispose();
      await independent.dispose();
      await installation.close();
    }
  });
}

for (const [caseId, outcome] of [
  ['ACCESS-29', 'confirmed'],
  ['ACCESS-30', 'rejected'],
  ['ACCESS-31', 'unknown'],
] as const) {
  test(`${caseId}: explicit remembered-login OFF distinguishes ${outcome} saving`, async ({
    browser,
  }) => {
    const installation = await createInstallation(undefined, { https: true });
    const { origin } = installation;
    const context = await createPreparedContext(browser, { ignoreHTTPSErrors: true }, true);
    try {
      await signIn(context.request, origin);
      const started = await context.request.post(`${origin}/api/auth/sign-in/social`, {
        headers: { origin },
        data: { provider: 'google', callbackURL: '/', rememberMe: true, informationVersion: 1 },
      });
      await context.request.get((await started.json()).url, { maxRedirects: 0 });
      await activateRememberedLogin(context.request, origin);
      const page = await context.newPage();
      await page.goto(origin);
      await expect(
        page.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
      ).toBeVisible();
      expect(
        (await context.cookies())
          .filter(
            (cookie) => cookie.name.includes('binding') || cookie.name.endsWith('session_token'),
          )
          .every((cookie) => cookie.expires > 0),
      ).toBe(true);
      if (outcome === 'rejected')
        await page.route('**/api/browser-binding/revoke', (route) =>
          route.fulfill({ status: 409, json: { error: 'revocation_rejected' } }),
        );
      if (outcome === 'unknown')
        await page.route('**/api/browser-binding/revoke', async (route) => {
          await route.fetch();
          await route.abort('failed');
        });
      await page.goto(`${origin}/cookies`);
      const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
      const field = page.getByRole('region', { name: 'Ihågkommen inloggning', exact: true });
      await expect(choice).toBeChecked();
      await choice.uncheck();
      if (outcome === 'confirmed') {
        await expect(field.getByRole('status')).toHaveText(
          'Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.',
        );
        const box = await field.getByRole('status').boundingBox();
        expect(box?.width).toBeLessThanOrEqual(1);
        expect(box?.height).toBeLessThanOrEqual(1);
        await expect(choice).toBeEnabled();
        expect(
          (await context.cookies())
            .filter(
              (cookie) => cookie.name.includes('binding') || cookie.name.endsWith('session_token'),
            )
            .every((cookie) => cookie.expires === -1),
        ).toBe(true);
      } else if (outcome === 'rejected') {
        await expect(field.getByRole('alert')).toHaveText(
          'Ändringen kunde inte sparas. Försök igen.',
        );
        await expect(choice).toBeEnabled();
      } else {
        await expect(field.getByRole('alert')).toHaveText(
          'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes. Åtgärdens referens bevaras. Att lämna vyn skickar inget nytt sparande.',
        );
        await expect(choice).toHaveAttribute('aria-disabled', 'true');
      }
      if (outcome === 'rejected') await expect(choice).toBeChecked();
      else await expect(choice).not.toBeChecked();
      await expect(choice).toBeFocused();
    } finally {
      await context.close();
      await installation.close();
    }
  });
}

test('revocation rotates the current key and binding while preserving the session and durable owner result', {
  tag: '@technical',
}, async ({ playwright }) => {
  let time = Date.now();
  const installation = await createInstallation(undefined, { now: () => time });
  const { origin } = installation;
  let client = await playwright.request.newContext();
  let old: typeof client | undefined;
  const independent = await playwright.request.newContext();
  try {
    await signIn(client, origin);
    const start = await client.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'google', callbackURL: '/', rememberMe: true, informationVersion: 1 },
    });
    const completed = await client.get((await start.json()).url, { maxRedirects: 0 });
    await activateRememberedLogin(client, origin);
    const proof = new URL(completed.headers().location).searchParams.get('loginConfirmation');
    const before = await (await client.get(`${origin}/api/auth/get-session`)).json();
    const saved = await client.storageState();
    old = await playwright.request.newContext({ storageState: saved });
    time += 86_400_000;
    await signIn(independent, origin);
    const id = randomUUID();
    const response = await client.post(`${origin}/api/browser-binding/revoke`, {
      headers: { origin },
      data: { id },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({
      id,
      status: 'completed',
      remembered: false,
      expiresAt: time + 28_800_000,
      inactiveAfterMs: 1_800_000,
    });
    expect(
      response
        .headersArray()
        .filter((item) => item.name.toLowerCase() === 'set-cookie')
        .every((item) => !/expires=|max-age=/i.test(item.value)),
    ).toBe(true);
    expect(await (await old.get(`${origin}/api/auth/get-session`)).json()).toBeNull();
    // Auth without the positively registered replacement binding grants no access.
    expect(await (await client.get(`${origin}/api/auth/get-session`)).json()).toBeNull();
    await client.addCookies([
      { name: result.cookieName, value: result.candidate, url: origin, sameSite: 'Lax' },
    ]);
    expect(
      (
        await client.post(`${origin}/api/browser-binding/register`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect(await (await client.get(`${origin}/api/auth/get-session`)).json()).toMatchObject({
      session: { id: before.session.id },
    });
    expect(
      (
        await client.get(`${origin}/api/browser-binding/confirmation?proof=${proof}`, {
          headers: { origin },
        })
      ).status(),
    ).toBe(401);
    expect(
      await (
        await client.get(`${origin}/api/browser-binding/preference`, { headers: { origin } })
      ).json(),
    ).toMatchObject({ remembered: false, expiresAt: time + 28_800_000 });
    const resultPath = `${origin}/api/browser-binding/results/${id}`;
    expect(await (await independent.get(resultPath, { headers: { origin } })).json()).toMatchObject(
      { id, status: 'completed' },
    );
    const state = await client.storageState();
    await client.dispose();
    await installation.restart();
    client = await playwright.request.newContext({ storageState: state });
    expect(await (await client.get(resultPath, { headers: { origin } })).json()).toMatchObject({
      id,
      status: 'completed',
    });
    time += 60_000;
    expect(
      (
        await client.post(`${origin}/api/browser-binding/revoke`, {
          headers: { origin },
          data: { id: randomUUID() },
        })
      ).status(),
    ).toBe(200);
    expect(await (await independent.get(resultPath, { headers: { origin } })).json()).toMatchObject(
      { expiresAt: time - 60_000 + 28_800_000 },
    );
  } finally {
    await client.dispose();
    await old?.dispose();
    await independent.dispose();
    await installation.close();
  }
});

for (const phase of ['early', 'late', 'repeated'] as const) {
  test(`a real delayed persistent cookie cannot revive ${phase} revocation or its pending callback`, {
    tag: '@technical',
  }, async ({ browser, playwright }) => {
    let time = Date.now();
    let hold = false;
    let release = () => {};
    let capture: (value: {
      cookies: string[];
      binding: { cookieName: string; candidate: string };
    }) => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const captured = new Promise<{
      cookies: string[];
      binding: { cookieName: string; candidate: string };
    }>((resolve) => {
      capture = resolve;
    });
    const installation = await createInstallation(undefined, {
      https: true,
      now: () => time,
      async deliverResponse(request, response) {
        if (hold && new URL(request.url).pathname === '/api/browser-binding/activate') {
          hold = false;
          capture({
            cookies: response.headers.getSetCookie(),
            binding: await response.clone().json(),
          });
          await held;
        }
        return response;
      },
    });
    const { origin } = installation;
    const context = await createPreparedContext(browser, { ignoreHTTPSErrors: true }, true);
    const independent = await playwright.request.newContext({ ignoreHTTPSErrors: true });
    let current: typeof independent | undefined;
    let continued: typeof independent | undefined;
    let resume = () => {};
    try {
      await signIn(context.request, origin);
      const preference = await (
        await context.request.get(`${origin}/api/browser-binding/preference`, {
          headers: { origin },
        })
      ).json();
      hold = true;
      const delayed = context.request.post(`${origin}/api/browser-binding/activate`, {
        headers: { origin },
        data: {
          id: randomUUID(),
          sessionId: preference.sessionId,
          bindingId: preference.bindingId,
          preferences: true,
          rememberMe: true,
          informationVersion: 1,
          consentInformationVersion: 1,
        },
      });
      const { cookies: issued, binding: activatedBinding } = await captured;
      const oldAuth = issued.find((item) => item.startsWith('__Secure-better-auth.session_token='));
      if (!oldAuth) throw new Error('Missing persistent auth cookie');
      const [name, ...parts] = oldAuth.split(';', 1)[0].split('=');
      current = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
        storageState: await context.storageState(),
      });
      await current.addCookies([
        {
          name,
          value: parts.join('='),
          url: origin,
          secure: true,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      await current.addCookies([
        {
          name: activatedBinding.cookieName,
          value: activatedBinding.candidate,
          url: origin,
          secure: true,
          sameSite: 'Lax',
        },
      ]);
      expect(
        (
          await current.post(`${origin}/api/browser-binding/register`, {
            headers: { origin },
            data: {},
          })
        ).status(),
      ).toBe(200);
      const oldState = await current.storageState();
      const before = await (await current.get(`${origin}/api/auth/get-session`)).json();
      const originalDeadline = time + 604_800_000;
      time += phase === 'late' ? 601_200_000 : phase === 'repeated' ? 86_400_000 : 1_000;
      const expectedDeadline = phase === 'late' ? originalDeadline : time + 28_800_000;
      await signIn(independent, origin);
      const pending = await current.post(`${origin}/api/auth/sign-in/social`, {
        headers: { origin },
        data: { provider: 'google', callbackURL: '/' },
      });
      const paused = installation.pauseNextProvider();
      resume = paused.resume;
      const slow = current.get((await pending.json()).url, { maxRedirects: 0 });
      await paused.reached;
      installation.setIdentity(robin);
      const actor = current;
      const revoke = async () => {
        const response = await actor.post(`${origin}/api/browser-binding/revoke`, {
          headers: { origin },
          data: { id: randomUUID() },
        });
        expect(response.status()).toBe(200);
        const result = await response.json();
        expect(result.expiresAt).toBe(expectedDeadline);
        expect(
          response
            .headersArray()
            .filter((header) => header.name.toLowerCase() === 'set-cookie')
            .every((header) => !header.value.includes('binding')),
        ).toBe(true);
        await actor.addCookies([
          {
            name: result.cookieName,
            value: result.candidate,
            url: origin,
            secure: true,
            sameSite: 'Lax',
          },
        ]);
        expect(
          (
            await actor.post(`${origin}/api/browser-binding/register`, {
              headers: { origin },
              data: {},
            })
          ).status(),
        ).toBe(200);
        return result;
      };
      let result = await revoke();
      if (phase === 'repeated') {
        time += 60_000;
        result = await revoke();
      }
      const state = await current.storageState();
      continued = await playwright.request.newContext({
        ignoreHTTPSErrors: true,
        storageState: state,
      });
      await context.addCookies(state.cookies);
      const newKey = (await context.cookies()).find((cookie) => cookie.name === name)?.value;
      release();
      expect((await delayed).status()).toBe(200);
      const actualCookie = (await context.cookies()).find((cookie) => cookie.name === name);
      expect(actualCookie?.value).toBe(parts.join('='));
      expect(actualCookie?.value).not.toBe(newKey);
      expect(actualCookie?.expires).toBe(Math.floor(originalDeadline / 1000));
      expect(
        (await context.cookies()).find((cookie) => cookie.name.includes('binding'))?.expires,
      ).toBe(-1);
      expect(await (await context.request.get(`${origin}/api/auth/get-session`)).json()).toBeNull();
      expect(await (await context.request.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
      expect(
        (
          await context.request.post(`${origin}/api/browser-binding/revoke`, {
            headers: { origin },
            data: { id: randomUUID() },
          })
        ).status(),
      ).toBe(401);
      expect(await (await continued.get(`${origin}/api/auth/get-session`)).json()).toMatchObject({
        session: { id: before.session.id },
      });
      paused.resume();
      expect((await slow).headers().location).toBe(`${origin}/?error=binding_invalid`);
      expect(await (await independent.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        user: { name: 'Alex Exempel' },
      });
      await context.addCookies(oldState.cookies);
      expect(await (await context.request.get(`${origin}/api/auth/get-session`)).json()).toBeNull();
      expect(
        (
          await continued.get(`${origin}/api/browser-binding/results/${result.id}`, {
            headers: { origin },
          })
        ).status(),
      ).toBe(200);
      const methods = await continued.get(`${origin}/api/login-methods`);
      expect(await methods.json()).toMatchObject({
        providers: ['google'],
      });
    } finally {
      release();
      resume();
      await context.close();
      await current?.dispose();
      await continued?.dispose();
      await independent.dispose();
      await installation.close();
    }
  });
}
