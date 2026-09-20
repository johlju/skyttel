import { expect, test } from '@playwright/test';
import { createInstallation } from '../support/installation.js';

test('a new installation offers login and protects direct household requests', async ({
  page,
  request,
}) => {
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

test('ACCESS-01: the configured administrator creates a private household and returns after restart', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeVisible();
    await page.getByLabel('Hushållets namn').fill('  Hushållet Linden  ');
    await page.getByRole('button', { name: 'Skapa hushåll', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeVisible();
    const address = page.url();
    await installation.restart();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeVisible();
    expect(page.url()).toBe(address);
    await page.getByRole('button', { name: 'Logga ut' }).click();
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    await expect(
      page.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeVisible();
    expect(page.url()).toBe(address);
  } finally {
    await installation.close();
  }
});

test('ACCESS-02: an invalid household name receives focus and can be corrected', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    const name = page.getByLabel('Hushållets namn');
    await name.fill('   ');
    await page.getByRole('button', { name: 'Skapa hushåll', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Ange ett namn med 1–100 tecken.');
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(
      await (await page.request.get(`${installation.origin}/api/bootstrap`)).json(),
    ).toMatchObject({ status: 'setup' });

    await name.fill('  Hushållet Linden  ');
    await page.getByRole('button', { name: 'Skapa hushåll', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  } finally {
    await installation.close();
  }
});

test('ACCESS-03: checking an uncertain creation recovers the committed household', async ({
  page,
}) => {
  const installation = await createInstallation();
  let submissions = 0;
  try {
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Fortsätt med Google' }).click();
    await page.route('**/api/households', async (route) => {
      submissions += 1;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('connectionreset');
    });
    await page.getByLabel('Hushållets namn').fill('Hushållet Linden');
    await page.getByRole('button', { name: 'Skapa hushåll', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Vi kunde inte bekräfta att hushållet skapades',
    );
    await expect(page.getByLabel('Hushållets namn')).toHaveValue('Hushållet Linden');
    const committed = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    expect(committed).toMatchObject({ status: 'ready', household: { name: 'Hushållet Linden' } });

    await page.getByRole('button', { name: 'Kontrollera status' }).click();
    await expect(
      page.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(`/households/${committed.household.id}`);
    expect(submissions).toBe(1);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skapa hushåll', exact: true })).toHaveCount(0);
  } finally {
    await installation.close();
  }
});
