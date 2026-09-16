import { test, expect } from '@playwright/test';
import { createInstallation } from '../support/installation.js';

test('a new installation offers login and protects direct household requests', async ({ page, request }) => {
  const installation = await createInstallation();
  try {
    await page.goto(installation.origin);
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fortsätt med Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fortsätt med Microsoft' })).toBeVisible();
    const response = await request.get(`${installation.origin}/api/households/other-household`);
    expect(response.status()).toBe(401);
  } finally {
    await installation.close();
  }
});

test('the configured administrator creates a private household and returns after restart', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
    await page.getByLabel('Hushållets namn').fill('  Hushållet Linden  ');
    await page.getByRole('button', { name: 'Skapa hushåll', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Hushållet Linden', exact: true })).toBeVisible();
    const address = page.url();
    await installation.restart();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Hushållet Linden', exact: true })).toBeVisible();
    expect(page.url()).toBe(address);
    await page.getByRole('button', { name: 'Logga ut' }).click();
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    await expect(page.getByRole('heading', { name: 'Hushållet Linden', exact: true })).toBeVisible();
    expect(page.url()).toBe(address);
  } finally {
    await installation.close();
  }
});
