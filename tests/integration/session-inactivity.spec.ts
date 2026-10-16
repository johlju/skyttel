import type { Page } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

async function foreground(page: Page) {
  const response = page.waitForResponse((item) =>
    item.url().endsWith('/api/browser-binding/status'),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await response;
}

for (const scenario of [
  { id: 'INAK-01', width: 1280 },
  { id: 'INAK-02', width: 390 },
  { id: 'INAK-03', width: 320 },
]) {
  test(`${scenario.id}: förvarning behåller fokus och verklig aktivitet delas mellan flikar vid ${scenario.width}px`, async ({
    page,
  }) => {
    let clock = Date.now();
    const started = clock;
    const app = await createInstallation(undefined, { now: () => clock });
    const other = await page.context().newPage();
    try {
      await page.setViewportSize({ width: scenario.width, height: 800 });
      await other.setViewportSize({ width: scenario.width, height: 800 });
      await signIn(page.request, app.origin);
      await page.goto(app.origin);
      await other.goto(app.origin);
      const field = page.getByLabel('Hushållets namn');
      await expect(field).toBeVisible();
      await expect(other.getByLabel('Hushållets namn')).toBeVisible();
      await field.focus();
      clock += 25 * 60_000;
      await foreground(page);
      await foreground(other);
      const warning = page.locator('.session-warning');
      await expect(warning).toHaveText(
        'Din inloggning går ut om högst fem minuter. Du behöver sedan logga in igen.',
      );
      await expect(warning).toHaveAttribute('role', 'status');
      await expect(warning).toHaveAttribute('aria-live', 'polite');
      await expect(field).toBeFocused();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      const activity = other.waitForResponse(
        (item) => item.url().endsWith('/api/browser-binding/activity') && item.status() === 200,
      );
      await other.getByLabel('Hushållets namn').fill('Hushållet Eken');
      await activity;
      await expect(warning).toHaveText('');
      await expect(other.locator('.session-warning')).toHaveText('');
      clock = started + 30 * 60_000;
      await foreground(page);
      expect((await (await page.request.get(`${app.origin}/api/bootstrap`)).json()).status).toBe(
        'setup',
      );
      await expect(field).toBeVisible();
      await page.locator('.session-expiry-announcement').evaluate((element) => {
        const records: string[] = [];
        new MutationObserver(() => {
          if (element.textContent) records.push(element.textContent);
        }).observe(element, { childList: true, characterData: true, subtree: true });
        Object.assign(window, { inactivityAnnouncements: records });
      });
      clock = started + 55 * 60_000;
      await foreground(page);
      await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
      await expect(page.locator('.session-expiry-announcement')).toHaveText(
        'Du har varit inaktiv i 30 minuter. Logga in igen.',
      );
      expect(
        await page.evaluate(
          () => (window as Window & { inactivityAnnouncements?: string[] }).inactivityAnnouncements,
        ),
      ).toEqual(['Du har varit inaktiv i 30 minuter. Logga in igen.']);
      expect((await (await page.request.get(`${app.origin}/api/bootstrap`)).json()).status).toBe(
        'anonymous',
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
    } finally {
      await other.close();
      await app.close();
    }
  });
}

test('INAK-06: sent kontrollsvar ger rätt inaktivitetsbesked en gång när bootstrap redan visar utgång', async ({
  page,
}) => {
  for (const width of [1280, 390, 320]) await expiredStatusRace(page, width);
});

async function expiredStatusRace(page: Page, width: number) {
  await page.context().clearCookies();
  let clock = Date.now();
  let hold = false;
  let release = () => {};
  let entered = () => {};
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const app = await createInstallation(undefined, {
    now: () => clock,
    async deliverResponse(request, response) {
      if (
        hold &&
        new URL(request.url).pathname === '/api/browser-binding/status' &&
        (await response.clone().json()).state === 'expired'
      ) {
        hold = false;
        entered();
        await held;
      }
      return response;
    },
  });
  try {
    await page.setViewportSize({ width, height: 800 });
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.goto(app.origin);
    const focused = page.getByRole('button', { name: 'Karta', exact: true });
    await expect(focused).toBeVisible();
    await focused.focus();
    clock += 25 * 60_000;
    await foreground(page);
    await expect(page.locator('.session-warning')).not.toHaveText('');
    await expect(focused).toBeFocused();
    const warningBounds = await page.locator('.session-warning').boundingBox();
    const focusBounds = await focused.boundingBox();
    expect(focusBounds?.y).toBeGreaterThanOrEqual(
      (warningBounds?.y ?? 0) + (warningBounds?.height ?? 0),
    );
    await page.locator('.session-expiry-announcement').evaluate((element) => {
      const values: string[] = [];
      new MutationObserver(() => {
        if (element.textContent) values.push(element.textContent);
      }).observe(element, { childList: true, characterData: true, subtree: true });
      Object.assign(window, { inactivityAnnouncements: values });
    });
    clock += 5 * 60_000;
    hold = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await waiting;
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
    await expect(page.locator('.session-expiry-announcement')).toHaveText(
      'Du har varit inaktiv i 30 minuter. Logga in igen.',
    );
    await expect(page.locator('.session-warning')).toHaveText('');
    await expect(page.locator('.session-warning')).not.toHaveAttribute('role', 'status');
    await expect
      .poll(() =>
        page
          .locator('.app-shell')
          .evaluate((element) =>
            getComputedStyle(element).getPropertyValue('--session-warning-height'),
          ),
      )
      .toBe('');
    release();
    expect(
      await page.evaluate(
        () => (window as Window & { inactivityAnnouncements?: string[] }).inactivityAnnouncements,
      ),
    ).toEqual(['Du har varit inaktiv i 30 minuter. Logga in igen.']);
  } finally {
    release();
    await app.close();
  }
}
