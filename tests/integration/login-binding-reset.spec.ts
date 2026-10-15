import { expect, type Page, test } from '@playwright/test';
import { createInstallation } from '../support/installation.js';

async function rejectedLogin(page: Page) {
  await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
  const remember = page.getByRole('checkbox', { name: 'Kom ihåg mig', exact: true });
  await expect(remember).not.toBeChecked();
  await remember.check();
  await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Ingen ny inloggning har bekräftats.');
}

test('ACCESS-32: an unknown binding needs a separate explicit reset and a fresh unchecked provider choice', async ({
  browser,
}) => {
  const installation = await createInstallation(undefined, { https: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await context.addCookies([
      {
        name: '__Host-skyttel_binding',
        value: 'f'.repeat(64),
        url: installation.origin,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
    const page = await context.newPage();
    let providerStarts = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/auth/sign-in/social') providerStarts++;
    });
    await page.goto(`${installation.origin}/login`);
    await rejectedLogin(page);
    expect(providerStarts).toBe(0);
    await expect(page.getByRole('alert')).not.toContainText('återställts från en säkerhetskopia');
    await page.getByRole('button', { name: 'Börja om i den här webbläsaren', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Fortsätt med Google', exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('status').filter({ hasText: 'Klart för en ny inloggning' }),
    ).toBeVisible();
    expect(providerStarts).toBe(0);
    await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await expect(
      page.getByRole('checkbox', { name: 'Kom ihåg mig', exact: true }),
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
    ).toBeVisible();
    expect(providerStarts).toBe(1);
    const preference = await context.request.get(
      `${installation.origin}/api/browser-binding/preference`,
      { headers: { origin: installation.origin } },
    );
    expect(await preference.json()).toMatchObject({ remembered: false });
  } finally {
    await context.close();
    await installation.close();
  }
});

test('ACCESS-33: a cancelled delayed binding reset cannot clear another tabs new login', async ({
  browser,
}) => {
  let release = () => {};
  let reached = () => {};
  let held = false;
  let delivered = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const received = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const installation = await createInstallation(undefined, {
    https: true,
    async deliverResponse(request, response) {
      if (!held && new URL(request.url).pathname === '/api/browser-binding/reset-check') {
        held = true;
        reached();
        await pending;
        delivered = true;
      }
      return response;
    },
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  try {
    await context.addCookies([
      {
        name: '__Host-skyttel_binding',
        value: 'f'.repeat(64),
        url: installation.origin,
        secure: true,
        sameSite: 'Lax',
      },
    ]);
    const first = await context.newPage();
    await first.goto(`${installation.origin}/login`);
    await rejectedLogin(first);
    await first
      .getByRole('button', { name: 'Börja om i den här webbläsaren', exact: true })
      .click();
    await received;
    // Navigation aborts the pending action and releases the origin's Web Lock.
    await first.goto(`${installation.origin}/cookies`);
    const second = await context.newPage();
    await second.goto(`${installation.origin}/login`);
    await rejectedLogin(second);
    await second
      .getByRole('button', { name: 'Börja om i den här webbläsaren', exact: true })
      .click();
    await second.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await expect(
      second.getByRole('checkbox', { name: 'Kom ihåg mig', exact: true }),
    ).not.toBeChecked();
    await second.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await expect(
      second.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
    ).toBeVisible();
    const fresh = await (await context.request.get(`${installation.origin}/api/bootstrap`)).json();
    const freshBinding = (await context.cookies()).find(
      (cookie) => cookie.name === '__Host-skyttel_binding',
    )?.value;
    expect(Boolean(freshBinding)).toBe(true);
    release();
    await expect.poll(() => delivered).toBe(true);
    expect(
      (await context.cookies()).find((cookie) => cookie.name === '__Host-skyttel_binding')
        ?.value === freshBinding,
    ).toBe(true);
    expect(
      await (await context.request.get(`${installation.origin}/api/bootstrap`)).json(),
    ).toMatchObject({ status: 'setup', loginId: fresh.loginId, user: fresh.user });
    await first.goto(installation.origin);
    await expect(
      first.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
    ).toBeVisible();
  } finally {
    release();
    await context.close();
    await installation.close();
  }
});
