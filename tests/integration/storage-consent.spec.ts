import { expect, test } from '@playwright/test';
import { activateRememberedLogin, createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

for (const [caseId, width, theme] of [
  ['KAK-32', 1280, 'light'],
  ['KAK-36', 390, 'light'],
  ['KAK-37', 1280, 'dark'],
  ['KAK-38', 390, 'dark'],
] as const) {
  test(`${caseId}: an authenticated visitor chooses storage in the two banner modes without activating remembered login at ${width}px in ${theme} theme`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    const { origin } = installation;
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await signIn(page.request, origin);
      await createHousehold(page.request, origin);
      await page.goto(origin);
      const banner = page.getByRole('dialog', { name: 'Vi använder kakor', exact: true });
      await expect(banner).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(
        banner.getByRole('button', { name: 'Endast nödvändiga', exact: true }),
      ).toBeFocused();
      await banner.getByRole('button', { name: 'Läs mer', exact: true }).click();
      const settings = page.getByRole('dialog', { name: 'Kakinställningar', exact: true });
      await page.keyboard.press('Tab');
      await expect(settings.getByText(/^Visa nödvändiga lagringsuppgifter \(/)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(settings.getByRole('listitem')).toHaveCount(8);
      const consentEntry = settings
        .getByRole('listitem')
        .filter({ hasText: 'skyttel-storage-consent' });
      await expect(consentEntry).toContainText('Varaktighet:');
      await expect(consentEntry).toContainText('Leverantör: Skyttel');
      await page.keyboard.press('Tab');
      await expect(
        settings.getByRole('switch', { name: 'Preferenskakor', exact: true }),
      ).toBeFocused();
      await expect(
        settings.getByRole('switch', { name: 'Nödvändig lagring, alltid aktiv' }),
      ).toBeDisabled();
      if (width === 390) {
        await page.setViewportSize({ width: 320, height: 900 });
        expect(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await expect(
          settings.getByRole('button', { name: 'Spara Preferenser', exact: true }),
        ).toBeInViewport();
        await page.setViewportSize({ width, height: 900 });
      }
      expect(await settings.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await settings.getByRole('switch', { name: 'Preferenskakor', exact: true }).check();
      await page.keyboard.press('Escape');
      await expect(banner).toBeVisible();
      await banner.getByRole('button', { name: 'Anpassa Inställningar', exact: true }).click();
      await expect(
        settings.getByRole('switch', { name: 'Preferenskakor', exact: true }),
      ).toBeChecked();
      await settings.getByRole('button', { name: 'Spara Preferenser', exact: true }).click();
      await expect(settings).not.toBeVisible();
      await expect(page.locator('.storage-notice')).toHaveCount(0);
      await page.reload();
      await expect(banner).not.toBeVisible();
      await expect
        .poll(
          async () =>
            (
              await (
                await page.request.get(`${origin}/api/browser-binding/preference`, {
                  headers: { origin },
                })
              ).json()
            ).remembered,
        )
        .toBe(false);
      await expect(
        page.getByRole('dialog', { name: 'Kom ihåg mig i Skyttel', exact: true }),
      ).not.toBeVisible();
    } finally {
      await installation.close();
    }
  });
}

test('KAK-34: public policy quick choices need saving and reset preserves the user’s suppressed login offers', async ({
  page,
}) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    await signIn(page.request, origin);
    await page.goto(`${origin}/cookies`);
    await expect(page.getByRole('heading', { name: 'Kakpolicy', exact: true })).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Vi använder kakor', exact: true }),
    ).not.toBeVisible();
    await page.getByRole('button', { name: 'Acceptera Alla', exact: true }).click();
    await expect(page.getByRole('switch', { name: 'Preferenskakor', exact: true })).toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem('skyttel-storage-consent'))).toBeNull();
    await page.getByRole('button', { name: 'Spara Preferenser', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Dina lagringspreferenser är sparade.');
    await page
      .getByRole('checkbox', {
        name: 'Fråga om ihågkommen inloggning efter framtida inloggningar',
        exact: true,
      })
      .uncheck();
    await page.getByRole('button', { name: 'Återställ valfri lagring', exact: true }).click();
    const reset = page.getByRole('dialog', { name: 'Återställ valfri lagring?', exact: true });
    await reset.getByRole('button', { name: 'Återställ', exact: true }).click();
    await expect(reset).not.toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('skyttel-storage-consent'))).toBeNull();
    await expect(
      page.getByRole('checkbox', {
        name: 'Fråga om ihågkommen inloggning efter framtida inloggningar',
        exact: true,
      }),
    ).not.toBeChecked();
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Vi använder kakor', exact: true }),
    ).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('KAK-39: denied consent storage offers ordinary access and does not invent a saved choice', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.addInitScript(() => {
      const write = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'skyttel-storage-consent')
          throw new DOMException('Synthetic denied storage', 'SecurityError');
        write.call(this, key, value);
      };
    });
    await page.goto(installation.origin);
    const banner = page.getByRole('dialog', { name: 'Vi använder kakor', exact: true });
    await banner.getByRole('button', { name: 'Acceptera Alla', exact: true }).click();
    await expect(banner.getByRole('alert')).toContainText(
      'Kakvalet kunde inte sparas och bekräftas.',
    );
    await banner
      .getByRole('button', { name: 'Fortsätt med endast nödvändig lagring', exact: true })
      .click();
    await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await expect(banner).toBeVisible();
    expect(
      await (
        await page.request.get(`${installation.origin}/api/browser-binding/preference`, {
          headers: { origin: installation.origin },
        })
      ).json(),
    ).toMatchObject({ remembered: false });
    expect(await page.evaluate(() => localStorage.getItem('skyttel-storage-consent'))).toBeNull();
  } finally {
    await installation.close();
  }
});

test('KAK-40: missing or obsolete browser consent safely disables an existing remembered login without extending it', async ({
  page,
}) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    await signIn(page.request, origin);
    await activateRememberedLogin(page.request, origin);
    await page.goto(origin);
    const banner = page.getByRole('dialog', { name: 'Vi använder kakor', exact: true });
    await expect(banner).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`${origin}/api/browser-binding/preference`, {
                headers: { origin },
              })
            ).json()
          ).remembered,
      )
      .toBe(false);
    await banner.getByRole('button', { name: 'Acceptera Alla', exact: true }).click();
    await page.goto(`${origin}/cookies`);
    await page.getByRole('button', { name: 'Kom ihåg mig i Skyttel', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Ihågkommen inloggning är aktiverad.');
    await page.evaluate(() =>
      localStorage.setItem(
        'skyttel-storage-consent',
        JSON.stringify({
          schemaVersion: 1,
          informationVersion: 999,
          preferences: true,
          decidedAt: Date.now(),
        }),
      ),
    );
    await page.reload();
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`${origin}/api/browser-binding/preference`, {
                headers: { origin },
              })
            ).json()
          ).remembered,
      )
      .toBe(false);
    await expect(
      page.getByRole('switch', { name: 'Preferenskakor', exact: true }),
    ).not.toBeChecked();
    await page.getByRole('link', { name: 'Till startsidan', exact: true }).click();
    await expect(banner).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('KAK-41: browser tabs re-read shared consent and the confirmed server state after withdrawal', async ({
  page,
}) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    await signIn(page.request, origin);
    await page.goto(`${origin}/cookies`);
    await page.getByRole('button', { name: 'Acceptera Alla', exact: true }).click();
    await page.getByRole('button', { name: 'Spara Preferenser', exact: true }).click();
    await page.getByRole('button', { name: 'Kom ihåg mig i Skyttel', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Ihågkommen inloggning är aktiverad.');
    const other = await page.context().newPage();
    await other.goto(`${origin}/cookies`);
    await expect(
      other.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true }),
    ).toBeChecked();
    await page.getByRole('button', { name: 'Endast nödvändiga', exact: true }).click();
    await page.getByRole('button', { name: 'Spara Preferenser', exact: true }).click();
    await expect(
      other.getByRole('switch', { name: 'Preferenskakor', exact: true }),
    ).not.toBeChecked();
    await expect(
      other.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true }),
    ).not.toBeChecked();
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`${origin}/api/browser-binding/preference`, {
                headers: { origin },
              })
            ).json()
          ).remembered,
      )
      .toBe(false);
  } finally {
    await installation.close();
  }
});
