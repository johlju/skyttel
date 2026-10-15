import { expect, test } from '@playwright/test';
import { createHousehold, openProfile, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

for (const [width, caseId] of [
  [1280, 'KAK-01'],
  [390, 'KAK-02'],
  [320, 'KAK-03'],
] as const) {
  test(`${caseId}: public storage information and direct return at ${width}px do not record a choice`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    const writes: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith(installation.origin) && request.method() !== 'GET')
        writes.push(request.url());
    });
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(installation.origin);
      const notice = page.getByRole('region', { name: 'Om kakor och lagring' });
      await expect(notice).toBeVisible();
      await expect(page.getByRole('button', { name: 'Fortsätt med Google' })).toBeVisible();
      await notice.getByRole('button', { name: 'Stäng informationen' }).click();
      await expect(notice).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Fortsätt med Google' })).toBeFocused();
      await page.getByRole('link', { name: 'Kakor och lagring', exact: true }).click();
      await expect(page).toHaveURL(`${installation.origin}/cookies`);
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kakor och lagring' }),
      ).toBeFocused();
      await page.getByText('Visa nödvändig lagring', { exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'better-auth.session_token', exact: true }),
      ).toBeVisible();
      const serverStorage = page.getByRole('region', { name: 'Uppgifter på Skyttels server' });
      await serverStorage.getByText('Visa serverns lagringsposter', { exact: true }).click();
      await expect(
        serverStorage.getByRole('heading', { name: 'session', exact: true }),
      ).toBeVisible();
      await expect(
        serverStorage.getByRole('heading', { name: 'installation_authority', exact: true }),
      ).toBeVisible();
      await expect(serverStorage).toContainText('24 timmar från ändringen');
      await expect(serverStorage).toContainText('högst fem sekunder');
      await expect(serverStorage).toContainText('läst, hört eller förstått');
      await expect(serverStorage).toContainText(
        'Automatisk gallring startar vid serverstart och varje minut',
      );
      await expect(serverStorage).toContainText(
        'högst sju dygn från återkallelse eller utloggning',
      );
      await expect(serverStorage).toContainText(
        'Beslutade frister är inte verifierade driftfakta.',
      );
      const licensePath = await page
        .getByRole('link', { name: 'Licens för formulärets förebild (MIT)' })
        .getAttribute('href');
      expect(licensePath).toMatch(/^\/assets\//);
      const license = await page.request.get(`${installation.origin}${licensePath}`);
      expect(license.status()).toBe(200);
      expect(await license.text()).toContain('Copyright (c) 2025 Viscalyx');
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      expect(await page.context().cookies()).toEqual([]);
      expect(
        await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
      ).toEqual({ local: {}, session: {} });
      expect(writes).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await page
          .locator('.settings-screen')
          .evaluate((screen) => screen.scrollWidth <= screen.clientWidth),
      ).toBe(true);
      await page.reload();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kakor och lagring' }),
      ).toBeFocused();
      await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeFocused();
      await expect(notice).toBeVisible();
      expect(writes).toEqual([]);
    } finally {
      await installation.close();
    }
  });
}

test('KAK-08: a profile without household access can read storage information and return safely', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await page.goto(`${installation.origin}/profile`);
    await expect(page.getByRole('heading', { name: 'Din profil', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Kakor och lagring', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kakor och lagring' })).toBeFocused();
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Skapa ditt hushåll' })).toBeFocused();
    await createHousehold(page.request, installation.origin);
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    installation.revokeMembership(user.id);
    await page.goto(installation.origin);
    await expect(
      page.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeFocused();
    await page.getByRole('link', { name: 'Din profil', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Din profil', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Kakor och lagring', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kakor och lagring' })).toBeFocused();
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
    ).toBeFocused();
    expect(
      await (await page.request.get(`${installation.origin}/api/bootstrap`)).json(),
    ).toMatchObject({ status: 'forbidden' });
  } finally {
    await installation.close();
  }
});

test('KAK-09: a member can open storage information through the profile', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 390, height: 900 });
    installation.setIdentity(robin);
    await signIn(page.request, installation.origin, 'microsoft');
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    installation.seedMembership(user.id, 'storage-member', 'Provhushållet');
    await page.goto(installation.origin);
    const workControl = page.getByRole('button', { name: 'Prata med Skyttel', exact: true });
    await workControl.focus();
    await openProfile(page);
    const profile = page.getByRole('region', { name: 'Din profil', exact: true });
    await expect(profile).toContainText('Medlem');
    await profile.getByRole('link', { name: 'Kakor och lagring', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kakor och lagring' })).toBeFocused();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(workControl).toBeFocused();
    expect(
      await (await page.request.get(`${installation.origin}/api/bootstrap`)).json(),
    ).toMatchObject({ status: 'ready', household: { role: 'member' } });
  } finally {
    await installation.close();
  }
});

for (const [width, caseId] of [
  [1280, 'KAK-04'],
  [390, 'KAK-05'],
  [320, 'KAK-06'],
] as const) {
  test(`${caseId}: the profile opens storage information and returns to the map at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      await createHousehold(page.request, installation.origin);
      await page.goto(installation.origin);
      const workControl = page.getByRole('button', { name: 'Prata med Skyttel', exact: true });
      await workControl.focus();
      await openProfile(page);
      await page
        .getByRole('region', { name: 'Din profil', exact: true })
        .getByRole('link', { name: 'Kakor och lagring' })
        .click();
      await expect(
        page.getByRole('heading', { level: 1, name: 'Kakor och lagring' }),
      ).toBeFocused();
      await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).not.toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect(page).toHaveURL(/\/households\/[^/]+$/);
      await expect(workControl).toBeFocused();
    } finally {
      await installation.close();
    }
  });
}
