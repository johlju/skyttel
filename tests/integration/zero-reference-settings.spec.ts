import type { Page } from '@playwright/test';
import { createHousehold, openMap, openSettings, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function settings(page: Page) {
  await openSettings(page);
  await page
    .locator('.settings-cards')
    .getByRole('link', { name: /^Rymdkartan/ })
    .click();
  await expect(page.getByRole('group', { name: 'Nollreferens', exact: true })).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.locator('.map-settings').getByRole('status')).toHaveText(
    'Din personliga vy är sparad.',
  );
}
async function map(page: Page) {
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
  await openMap(page);
}

test('NOLLREFERENS-01: all retained choices work without a decorative background and stay synchronized through Navigation and resets', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await settings(page);
    const variant = page.getByRole('combobox', { name: 'Variant', exact: true });
    const weight = page.getByRole('combobox', { name: 'Synlighet', exact: true });
    const always = page.getByRole('checkbox', { name: 'Alltid synlig', exact: true });
    const keepSize = page.getByRole('checkbox', { name: 'Behåll storlek vid zoom', exact: true });
    await expect(variant).toHaveValue('circle');
    await expect(weight).toHaveValue('subtle');
    await expect(always).not.toBeChecked();
    await expect(keepSize).not.toBeChecked();
    await expect(keepSize).toHaveAccessibleDescription(
      'Nollreferensen behåller ungefär samma storlek på skärmen när du zoomar. Objektens positioner ändras inte.',
    );
    await page.getByRole('checkbox', { name: 'Visa bakgrund', exact: true }).uncheck();
    await saved(page);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await keepSize.focus();
      await page.keyboard.press('Space');
      await saved(page);
      await expect(keepSize).toBeChecked();
      await expect(keepSize).toBeFocused();
      await page.keyboard.press('Space');
      await saved(page);
      await expect(keepSize).not.toBeChecked();
      for (const shape of ['square', 'oval', 'circle', 'lines']) {
        await variant.selectOption(shape);
        await expect(variant).not.toHaveAttribute('aria-disabled', 'true');
        for (const strength of ['subtle', 'original', 'prominent']) {
          await weight.focus();
          await weight.selectOption(strength);
          await expect(weight).not.toHaveAttribute('aria-disabled', 'true');
          await expect(variant).toHaveValue(shape);
          await expect(weight).toHaveValue(strength);
          await expect(weight).toBeFocused();
        }
      }
    }
    await keepSize.check();
    await saved(page);
    await always.check();
    await saved(page);
    await map(page);
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    const toggle = page.getByRole('checkbox', { name: 'Nollreferens', exact: true });
    await expect(toggle).toBeChecked();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
    await expect(toggle).toBeChecked();
    await page.getByRole('button', { name: 'Visa mininavigering', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.navigation-zero-reference')).toHaveText('Nollreferens');
    await expect(toggle).toBeVisible();
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeFocused();
    await page.getByRole('button', { name: 'Visa normal navigering', exact: true }).click();
    await expect(toggle).not.toBeChecked();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await settings(page);
    await expect(always).not.toBeChecked();
    await expect(keepSize).toBeChecked();
    await expect(variant).toHaveValue('lines');
    await expect(weight).toHaveValue('prominent');
    await page.getByRole('checkbox', { name: 'Visa bakgrund', exact: true }).check();
    await saved(page);
    const zoomStrength = page.getByRole('slider', { name: 'Zoomstyrka', exact: true });
    await zoomStrength.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Tab');
    await saved(page);
    await expect(keepSize).toBeChecked();
    await page.getByRole('button', { name: 'Återställ rörelse', exact: true }).click();
    await expect(variant).toHaveValue('lines');
    await expect(weight).toHaveValue('prominent');
    await expect(always).not.toBeChecked();
    await expect(keepSize).toBeChecked();
  } finally {
    await installation.close();
  }
});

test('NOLLREFERENS-02: saved reference choices survive reopening, restart and another device while users and households stay separate', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const second = await createPreparedContext(browser);
  const member = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (
      await createHousehold(page.request, installation.origin, 'Linden')
    ).json();
    const { user: owner } = await (
      await page.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const anotherId = 'reference-other-household';
    installation.seedMembership(owner.id, anotherId, 'Eken', 'administrator');
    const ownUrl = `${installation.origin}/households/${household.id}`;
    await page.goto(ownUrl);
    await settings(page);
    await page.getByRole('combobox', { name: 'Variant', exact: true }).selectOption('oval');
    await saved(page);
    await page.getByRole('combobox', { name: 'Synlighet', exact: true }).selectOption('original');
    await saved(page);
    await page.getByRole('checkbox', { name: 'Alltid synlig', exact: true }).check();
    await saved(page);
    await page.getByRole('checkbox', { name: 'Behåll storlek vid zoom', exact: true }).check();
    await saved(page);
    await map(page);
    await settings(page);
    const assertOwn = async (target: Page) => {
      await expect(target.getByRole('combobox', { name: 'Variant', exact: true })).toHaveValue(
        'oval',
      );
      await expect(target.getByRole('combobox', { name: 'Synlighet', exact: true })).toHaveValue(
        'original',
      );
      await expect(
        target.getByRole('checkbox', { name: 'Alltid synlig', exact: true }),
      ).toBeChecked();
      await expect(
        target.getByRole('checkbox', { name: 'Behåll storlek vid zoom', exact: true }),
      ).toBeChecked();
    };
    await assertOwn(page);
    await installation.restart();
    await page.reload();
    await assertOwn(page);
    await signIn(second.request, installation.origin);
    const other = await second.newPage();
    await other.goto(ownUrl);
    await settings(other);
    await assertOwn(other);

    installation.setIdentity(robin);
    await signIn(member.request, installation.origin, 'microsoft');
    const { user } = await (
      await member.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const invitation = await (
      await page.request.post(`${installation.origin}/api/households/${household.id}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await member.request.post(`${installation.origin}/api/invitations/accept`, {
          headers: { origin: installation.origin },
          data: { code: invitation.code },
        })
      ).ok(),
    ).toBe(true);
    const memberPage = await member.newPage();
    await memberPage.goto(ownUrl);
    await settings(memberPage);
    await expect(memberPage.getByRole('combobox', { name: 'Variant', exact: true })).toHaveValue(
      'circle',
    );
    await expect(memberPage.getByRole('combobox', { name: 'Synlighet', exact: true })).toHaveValue(
      'subtle',
    );
    await expect(
      memberPage.getByRole('checkbox', { name: 'Alltid synlig', exact: true }),
    ).not.toBeChecked();
    await expect(
      memberPage.getByRole('checkbox', { name: 'Behåll storlek vid zoom', exact: true }),
    ).not.toBeChecked();
    await memberPage.getByRole('combobox', { name: 'Variant', exact: true }).selectOption('square');
    await saved(memberPage);
    await page.reload();
    await assertOwn(page);

    await page.goto(`${installation.origin}/households/${anotherId}`);
    await settings(page);
    await expect(page.getByRole('combobox', { name: 'Variant', exact: true })).toHaveValue(
      'circle',
    );
    await expect(page.getByRole('combobox', { name: 'Synlighet', exact: true })).toHaveValue(
      'subtle',
    );
    await expect(
      page.getByRole('checkbox', { name: 'Alltid synlig', exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Behåll storlek vid zoom', exact: true }),
    ).not.toBeChecked();
    await page.goto(ownUrl);
    await settings(page);
    await assertOwn(page);
  } finally {
    await second.close();
    await member.close();
    await installation.close();
  }
});
