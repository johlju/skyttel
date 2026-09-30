import { expect, test } from '@playwright/test';
import { activatePanel, createHousehold, signIn } from '../support/client.js';
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
    await activatePanel(page, 'Nytt objekt');
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
      await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
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
      await tools.getByRole('button', { name: 'Information och hjälp', exact: true }).click();
      await tools.getByRole('button', { name: 'Dölj verktygens namn', exact: true }).click();
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('button', { name: 'Stäng verktyget', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(
        tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }),
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
    const checkSkipLinks = async () => {
      await page.getByRole('link', { name: 'Hoppa till innehållet', exact: true }).focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      for (const [role, name] of [
        ['link', 'Hoppa till innehållet'],
        ['link', 'Till verktygen'],
        ['button', 'Till lista och formulär'],
        ['button', 'Till samtal och text'],
      ] as const) {
        const control = page.getByRole(role, { name, exact: true });
        await expect(control).toBeFocused();
        const appearance = await control.evaluate((element) => {
          const style = getComputedStyle(element);
          const luminance = (color: string) => {
            if (!/^rgb\(\d+, \d+, \d+\)$/.test(color))
              throw new Error(`Expected an opaque RGB skip-link color, received ${color}`);
            const channels = (color.match(/\d+/g) ?? [])
              .slice(0, 3)
              .map(Number)
              .map((value) => {
                const unit = value / 255;
                return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
              });
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
          };
          const foreground = luminance(style.color);
          const background = luminance(style.backgroundColor);
          const rect = element.getBoundingClientRect();
          return {
            contrast:
              (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
            outline: style.outlineStyle,
            focusVisible: element.matches(':focus-visible'),
            unobscured: element.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
            ),
          };
        });
        expect(appearance.contrast, name).toBeGreaterThanOrEqual(4.5);
        expect(appearance.focusVisible, name).toBe(true);
        expect(appearance.outline, name).not.toBe('none');
        expect(appearance.unobscured, name).toBe(true);
        await page.keyboard.press('Tab');
      }
    };
    await themeButton.click();
    await page.getByRole('radio', { name: 'Mörkt', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await checkSkipLinks();
    await page.reload();
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await themeButton.click();
    await page.getByRole('radio', { name: 'Ljust', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await expect(workspace).toHaveAttribute('data-theme', 'light');
    await checkSkipLinks();
    await themeButton.click();
    await page.getByRole('radio', { name: 'System', exact: true }).click();
    await expect(themeButton).toBeFocused();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(workspace).toHaveAttribute('data-theme', 'dark');
    await checkSkipLinks();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(workspace).toHaveAttribute('data-theme', 'light');
    await checkSkipLinks();
    await themeButton.click();
    await page.keyboard.press('Escape');
    await expect(themeButton).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Tema', exact: true })).toHaveCount(0);
  } finally {
    await installation.close();
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`YTA-06: empty mobile maps keep focused display choices readable and operable in ${theme}`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.emulateMedia({ colorScheme: theme });
      await signIn(page.request, installation.origin);
      await createHousehold(page.request, installation.origin);
      await page.setViewportSize({ width: 320, height: 900 });
      await page.goto(installation.origin);
      for (const guidance of [true, false]) {
        if (!guidance)
          await page.getByRole('button', { name: 'Stäng vägledningen', exact: true }).click();
        for (const height of [900, 568, 451]) {
          await page.setViewportSize({ width: 320, height });
          const reset = page.getByRole('button', { name: 'Återställ vy', exact: true });
          const labels = page.getByRole('checkbox', { name: 'Alla etiketter', exact: true });
          const heightHelp = page.getByRole('checkbox', { name: 'Visa höjdhjälp', exact: true });
          for (const target of [reset, labels, heightHelp]) {
            if (target === reset) await reset.focus();
            else await page.keyboard.press('Tab');
            await expect(target).toBeFocused();
            const visible = await target.evaluate((element) => {
              const box = element.getBoundingClientRect();
              const label = element.closest('label') ?? element;
              const bounds = label.getBoundingClientRect();
              return {
                centerHit: element.contains(
                  document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
                ),
                labelHit: label.contains(
                  document.elementFromPoint(bounds.right - 2, bounds.y + bounds.height / 2),
                ),
                within:
                  bounds.left >= 0 &&
                  bounds.right <= innerWidth &&
                  bounds.top >= 0 &&
                  bounds.bottom <= innerHeight,
              };
            });
            expect(visible).toEqual({ centerHit: true, labelHit: true, within: true });
          }
          await page.keyboard.press('Space');
          await expect(heightHelp).toBeChecked();
          await page.keyboard.press('Space');
          await expect(heightHelp).not.toBeChecked();
          const action = page.getByRole('button', {
            name: guidance ? 'Öppna listan' : 'Öppna Lista',
            exact: true,
          });
          await action.focus();
          await expect(action).toBeFocused();
          expect(
            await action.evaluate((element) => {
              const box = element.getBoundingClientRect();
              return (
                box.top >= 0 &&
                box.bottom <= innerHeight &&
                element.contains(
                  document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
                )
              );
            }),
          ).toBe(true);
        }
      }
      await page.getByRole('button', { name: 'Öppna Lista', exact: true }).click();
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn').fill('Cykeln');
      await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
      await expect(page.getByText('Din karta börjar här', { exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('checkbox', { name: 'Visa höjdhjälp', exact: true }),
      ).not.toBeChecked();
    } finally {
      await installation.close();
    }
  });
}
