import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('TEMA-01: account theme survives another device and restart without browser copies', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  try {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => {
      localStorage.setItem('skyttel-theme', 'dark');
      sessionStorage.setItem('skyttel-theme', 'dark');
    });
    await page.goto(installation.origin);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() =>
        page.evaluate(() => [
          localStorage.getItem('skyttel-theme'),
          sessionStorage.getItem('skyttel-theme'),
        ]),
      )
      .toEqual([null, null]);
    await signIn(page.request, installation.origin);
    await page.goto(`${installation.origin}/profile`);
    await page.getByRole('button', { name: /^Tema:/ }).click();
    await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Temavalet har sparats på ditt konto.');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await signIn(other.request, installation.origin);
    const device = await other.newPage();
    await device.emulateMedia({ colorScheme: 'light' });
    await device.goto(`${installation.origin}/profile`);
    await expect(device.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await installation.restart();
    await page.reload();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
    await signIn(page.request, installation.origin);
    await page.goto(`${installation.origin}/profile`);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain('skyttel-theme');
    expect(await page.evaluate(() => Object.keys(sessionStorage))).not.toContain('skyttel-theme');
  } finally {
    await other.close();
    await installation.close();
  }
});

test('TEMA-02: open tabs refresh account choices on focus and System follows each device', async ({
  page,
  context,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`${installation.origin}/profile`);
    const tab = await context.newPage();
    await tab.emulateMedia({ colorScheme: 'dark' });
    await tab.goto(`${installation.origin}/profile`);
    await expect(tab.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await tab.getByRole('button', { name: /^Tema:/ }).click();
    await tab.getByRole('radio', { name: 'Ljust', exact: true }).click();
    await expect(tab.getByRole('status')).toContainText('Temavalet har sparats');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: /^Tema: Ljust/ })).toBeVisible();
    await page.getByRole('button', { name: /^Tema:/ }).click();
    await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await tab.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(tab.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: /^Tema:/ }).click();
    await page.getByRole('radio', { name: 'System', exact: true }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
    await tab.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(tab.getByRole('button', { name: /^Tema: System/ })).toBeVisible();
    await expect(tab.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  } finally {
    await installation.close();
  }
});

test('TEMA-03: rejected and lost theme replies show an error without a false account confirmation', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(`${installation.origin}/profile`);
    for (const failure of ['rejected', 'lost']) {
      await page.route('**/api/theme-preference', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        if (failure === 'lost') {
          await route.fetch();
          await route.abort();
        } else {
          await route.fulfill({ status: 403, json: { error: 'forbidden' } });
        }
      });
      await page.getByRole('button', { name: /^Tema:/ }).click();
      await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Temavalet kunde inte bekräftas');
      await expect(page.getByRole('status')).toHaveCount(0);
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
      await expect(page.getByRole('button', { name: /^Tema:/ })).toBeFocused();
      expect(
        await (await page.request.get(`${installation.origin}/api/theme-preference`)).json(),
      ).toMatchObject({
        mode: failure === 'lost' ? 'dark' : 'system',
      });
      await page.unroute('**/api/theme-preference');
    }
    await page.reload();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  } finally {
    await installation.close();
  }
});

for (const operation of ['GET', 'POST']) {
  const caseId = operation === 'GET' ? 'TEMA-04' : 'TEMA-05';
  test(`${caseId}: delayed ${operation} replies cannot restore a signed-out or previous account theme`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    let release = () => {};
    let delivered = () => {};
    const delivery = new Promise<void>((resolve) => {
      delivered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received = () => {};
    const waiting = new Promise<void>((resolve) => {
      received = resolve;
    });
    try {
      await signIn(page.request, installation.origin);
      const alex = await (
        await page.request.get(`${installation.origin}/api/theme-preference`)
      ).json();
      await page.request.post(`${installation.origin}/api/theme-preference`, {
        headers: { origin: installation.origin },
        data: { mode: 'dark' },
      });
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(`${installation.origin}/profile`);
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
      await page.route('**/api/theme-preference', async (route) => {
        if (route.request().method() !== operation) return route.continue();
        const response = await route.fetch();
        // Hold only Alex's response; the next account still uses the real server.
        if ((await response.json()).userId === alex.userId) {
          received();
          await held;
        }
        await route.fulfill({ response });
        delivered();
      });
      if (operation === 'GET') {
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      } else {
        await page.getByRole('button', { name: /^Tema:/ }).click();
        await page.getByRole('radio', { name: 'Ljust', exact: true }).click();
      }
      await waiting;
      await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
      installation.setIdentity(robin);
      await signIn(page.request, installation.origin, 'microsoft');
      // Keep the document alive across the identity change, as another tab does.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByText('Robin Exempel', { exact: true }).first()).toBeVisible();
      const lateResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/theme-preference') &&
          response.request().method() === operation,
      );
      release();
      await lateResponse;
      await delivery;
      await page.evaluate(() => new Promise(requestAnimationFrame));
      await page.unroute('**/api/theme-preference');
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
      await page.goto(`${installation.origin}/profile`);
      await expect(page.getByRole('button', { name: /^Tema: System/ })).toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(0);
    } finally {
      release();
      await installation.close();
    }
  });
}

test('theme API authenticates the owner independently of household access and rejects forged writes', {
  tag: '@technical',
}, async ({ request }) => {
  const installation = await createInstallation();
  try {
    const url = `${installation.origin}/api/theme-preference`;
    expect((await request.get(url)).status()).toBe(401);
    expect(
      (
        await request.post(url, {
          headers: { origin: installation.origin },
          data: { mode: 'dark' },
        })
      ).status(),
    ).toBe(401);
    await signIn(request, installation.origin);
    const alex = await (await request.get(url)).json();
    expect(alex.mode).toBe('system');
    expect(
      (
        await request.post(url, {
          headers: { origin: 'https://example.test' },
          data: { mode: 'dark' },
        })
      ).status(),
    ).toBe(403);
    for (const data of [{ mode: 'invalid' }, { mode: 'dark', userId: 'someone-else' }, null]) {
      expect(
        (await request.post(url, { headers: { origin: installation.origin }, data })).status(),
      ).toBe(400);
    }
    expect(
      (
        await request.post(url, {
          headers: { origin: installation.origin },
          data: { mode: 'dark' },
        })
      ).status(),
    ).toBe(200);
    await request.post(`${installation.origin}/api/auth/sign-out`, {
      headers: { origin: installation.origin },
      data: {},
    });
    installation.setIdentity(robin);
    await signIn(request, installation.origin, 'microsoft');
    expect(await (await request.get(`${url}?userId=${alex.userId}`)).json()).toMatchObject({
      mode: 'system',
    });
    expect(
      (
        await request.post(url, {
          headers: { origin: installation.origin },
          data: { mode: 'light', userId: alex.userId },
        })
      ).status(),
    ).toBe(400);
    await request.post(url, { headers: { origin: installation.origin }, data: { mode: 'light' } });
    await request.post(`${installation.origin}/api/auth/sign-out`, {
      headers: { origin: installation.origin },
      data: {},
    });
    installation.setIdentity({
      subject: 'alex-google',
      name: 'Alex Exempel',
      email: 'alex@example.test',
    });
    await signIn(request, installation.origin);
    expect(await (await request.get(url)).json()).toMatchObject({
      userId: alex.userId,
      mode: 'dark',
    });
  } finally {
    await installation.close();
  }
});

for (const [width, caseId] of [
  [1280, 'TEMA-07'],
  [390, 'TEMA-08'],
  [320, 'TEMA-09'],
] as const) {
  test(`${caseId}: keyboard theme choices and persistent feedback fit at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 720 });
      await page.emulateMedia({ colorScheme: 'light' });
      await signIn(page.request, installation.origin);
      await page.goto(`${installation.origin}/profile`);
      const button = page.getByRole('button', { name: /^Tema:/ });
      await button.focus();
      for (const theme of ['dark', 'light', 'light']) {
        await page.keyboard.press('Enter');
        await expect(page.getByRole('radio', { checked: true })).toBeFocused();
        await page.keyboard.press('ArrowUp');
        await expect(button).toBeFocused();
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme);
        const feedback = page.getByRole('status');
        await expect(feedback).toContainText('Temavalet har sparats på ditt konto.');
        expect(
          await feedback.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return (
              rect.left >= 0 &&
              rect.right <= innerWidth &&
              rect.top >= 0 &&
              rect.bottom <= innerHeight
            );
          }),
        ).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        const close = feedback.getByRole('button', { name: 'Stäng temabeskedet' });
        const target = await close.boundingBox();
        expect(target?.width).toBeGreaterThanOrEqual(44);
        expect(target?.height).toBeGreaterThanOrEqual(44);
        await close.click();
        await expect(button).toBeFocused();
        await expect(feedback).toHaveCount(0);
      }
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await expect(button).toBeFocused();
    } finally {
      await installation.close();
    }
  });
}
