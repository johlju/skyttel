import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('YTA-05: save results remain readable beside tablet work', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 768, height: 1024 });
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Lista', exact: true })
      .click();
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Familjens gemensamma cykel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    const status = page
      .getByRole('status')
      .filter({ hasText: 'Sparat: Familjens gemensamma cykel' });
    await expect(status).toBeVisible();
    const size = await status.boundingBox();
    expect(size?.width).toBeGreaterThan(200);
    expect(size?.height).toBeLessThan(160);
    await page.getByRole('button', { name: 'Stäng status', exact: true }).click();
    await expect(status).toHaveCount(0);
    await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Välj objekt: Familjens gemensamma cykel', exact: true }),
    ).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('YTA-01: map tools open real household work and preserve it when closed', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    await expect(tools).toBeVisible();
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
    await expect(page.getByText('Din karta börjar här', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).not.toBeVisible();
    await tools.getByRole('button', { name: 'Visa verktygens namn' }).click();
    await expect(tools.getByText('Lista', { exact: true })).toBeVisible();
    await tools.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Cykeln');
    await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
    await expect(tools.getByRole('button', { name: 'Lista', exact: true })).toBeFocused();
    await tools.getByRole('button', { name: 'Lista', exact: true }).click();
    await expect(page.getByLabel('Objektets namn')).toHaveValue('Cykeln');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Sparat: Cykeln' })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Välj objekt: Cykeln', exact: true }),
    ).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('YTA-03: narrow screens keep tools, help and text work reachable without graphics', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 568 });
      await page.goto(installation.origin);
      const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
      await page.getByRole('link', { name: 'Hoppa till innehållet', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('link', { name: 'Till verktygen', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      const skip = page.getByRole('button', { name: 'Till lista och formulär', exact: true });
      await expect(skip).toBeFocused();
      expect(
        await skip.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2),
          );
        }),
      ).toBe(true);
      await page.getByRole('button', { name: 'Stäng vägledningen', exact: true }).click();
      await expect(page.getByRole('complementary', { name: 'Kom igång med kartan' })).toHaveCount(
        0,
      );
      await tools.getByRole('button', { name: 'Visa verktygens namn' }).click();
      await tools.getByRole('button', { name: 'Information och hjälp', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Information och hjälp' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        tools.getByRole('button', { name: 'Information och hjälp', exact: true }),
      ).toBeFocused();
      await tools.getByRole('button', { name: 'Lista', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn').fill('Min cykel');
      await expect(
        page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }),
      ).toBeEnabled();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
      await expect(tools.getByRole('button', { name: 'Lista', exact: true })).toBeFocused();
      for (const entry of ['Sök i kartan', 'Utkast och historik']) {
        await tools.getByRole('button', { name: 'Visa verktygens namn' }).click();
        await tools.getByRole('button', { name: entry, exact: true }).click();
        await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
        await expect(tools.getByRole('button', { name: 'Lista', exact: true })).toBeFocused();
      }
      await page.getByRole('button', { name: 'Öppna Lista', exact: true }).click();
      await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
      await expect(tools.getByRole('button', { name: 'Lista', exact: true })).toBeFocused();
      await tools.getByRole('button', { name: 'Samtal och text', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Talsamtal', exact: true })).toBeVisible();
    }
  } finally {
    await installation.close();
  }
});

test('YTA-04: loading and a failed map read offer a working next action', async ({ page }) => {
  const installation = await createInstallation();
  let release = () => {};
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/map?*', async (route) => {
      await held;
      await route.abort();
    });
    await page.goto(installation.origin);
    await expect(page.getByText('Hushållets karta hämtas…')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Kartans verktyg', exact: true }),
    ).toBeVisible();
    release();
    await expect(page.getByRole('alert')).toContainText('kunde inte');
    await page.unroute('**/map?*');
    await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await expect(page.getByText('Din karta börjar här', { exact: true })).toBeVisible();
  } finally {
    release();
    await installation.close();
  }
});

test('YTA-02: theme choice returns focus and System follows the device', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(installation.origin);
    const workspace = page.getByRole('region', { name: 'Hushållskarta', exact: true });
    const themeButton = page.getByRole('button', { name: /^Tema:/ });
    await themeButton.click();
    await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await themeButton.click();
    await page.getByRole('radio', { name: 'Ljust', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await expect(workspace).toHaveAttribute('data-theme', 'light');
    await themeButton.click();
    await page.getByRole('radio', { name: 'System', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(workspace).toHaveAttribute('data-theme', 'light');
    await themeButton.click();
    await page.keyboard.press('Escape');
    await expect(themeButton).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Tema', exact: true })).toHaveCount(0);
  } finally {
    await installation.close();
  }
});
