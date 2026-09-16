import { test, expect } from '@playwright/test';
import { alex, createInstallation, robin } from '../support/installation.js';

test('setup works by keyboard within a narrow phone viewport', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(installation.origin);
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Fortsätt med Google' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Hushållets namn')).toBeFocused();
    await page.keyboard.type('Hushallet Linden');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Skapa hushåll', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Hushallet Linden' })).toBeFocused();
    for (const height of [568, 320]) {
      await page.setViewportSize({ width: 320, height });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole('button', { name: 'Logga ut' })).toBeVisible();
    }
  } finally {
    await installation.close();
  }
});

test('failed startup read offers a working retry', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await page.route('**/api/bootstrap', (route) => route.abort());
    await page.goto(installation.origin);
    await expect(page.getByRole('heading', { name: 'Skyttel kunde inte öppnas' })).toBeVisible();
    await page.unroute('**/api/bootstrap');
    await page.getByRole('button', { name: 'Försök igen' }).click();
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('provider outage gives a readable error and allows another login attempt', async ({ page }) => {
  const installation = await createInstallation();
  try {
    installation.failProvider(true);
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    await expect(page.getByRole('alert')).toContainText('Inloggningen kunde inte slutföras');
    await expect(page.getByRole('button', { name: 'Fortsätt med Google' })).toBeEnabled();
    installation.failProvider(false);
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
  } finally {
    await installation.close();
  }
});

for (const { provider, label, identity } of [
  { provider: 'google', label: 'Google', identity: alex },
  { provider: 'microsoft', label: 'Microsoft', identity: robin },
] as const) {
  test(`denied ${label} consent leaves access closed and allows a successful retry`, async ({ page }) => {
    const installation = await createInstallation({ provider, subject: identity.subject });
    try {
      installation.setIdentity(identity);
      installation.denyConsent(true);
      await page.goto(installation.origin);
      await page.getByRole('button', { name: `Fortsätt med ${label}` }).click();
      await expect(page.getByRole('alert')).toContainText('Inloggningen kunde inte slutföras');
      expect(new URL(page.url()).searchParams.get('error')).toBe('access_denied');
      await expect(page.getByRole('button', { name: `Fortsätt med ${label}` })).toBeEnabled();
      await expect(page.getByLabel('Hushållets namn')).toHaveCount(0);
      const client = page.context().request;
      expect(await (await client.get(`${installation.origin}/api/bootstrap`)).json())
        .toMatchObject({ status: 'anonymous' });
      expect((await client.get(`${installation.origin}/api/households/denied-consent-household`)).status()).toBe(401);
      expect((await client.post(`${installation.origin}/api/households`, {
        headers: { origin: installation.origin }, data: { name: 'Hushållet Linden' },
      })).status()).toBe(401);

      installation.denyConsent(false);
      await page.getByRole('button', { name: `Fortsätt med ${label}` }).click();
      await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
      await page.getByLabel('Hushållets namn').fill('Hushållet Linden');
      await page.getByRole('button', { name: 'Skapa hushåll', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Hushållet Linden', exact: true })).toBeVisible();
    } finally {
      await installation.close();
    }
  });
}

test('a signed-in outsider sees an access explanation without setup controls', async ({ page }) => {
  const installation = await createInstallation();
  try {
    installation.setIdentity(robin);
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Fortsätt med Microsoft' }).click();
    await expect(page.getByRole('heading', { name: 'Du har inte tillgång till hushållet' })).toBeVisible();
    await expect(page.getByLabel('Hushållets namn')).toHaveCount(0);
    await page.getByRole('button', { name: 'Logga ut' }).click();
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
  } finally {
    await installation.close();
  }
});
