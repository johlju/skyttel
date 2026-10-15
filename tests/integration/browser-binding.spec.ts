import { expect, test } from '@playwright/test';
import { signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

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
