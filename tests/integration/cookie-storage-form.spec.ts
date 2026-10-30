import type { Page } from '@playwright/test';
import { activateRememberedLogin, createHousehold, signIn } from '../support/client.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test.use({ storagePreferences: true });

import { createInstallation } from '../support/installation.js';

async function rememberedHousehold(page: Page, origin: string) {
  await signIn(page.request, origin);
  const started = await page.request.post(`${origin}/api/auth/sign-in/social`, {
    headers: { origin },
    data: { provider: 'google', callbackURL: '/', rememberMe: true, informationVersion: 1 },
  });
  await page.request.get((await started.json()).url, { maxRedirects: 0 });
  await activateRememberedLogin(page.request, origin);
  return (await (await createHousehold(page.request, origin)).json()).household;
}

for (const [caseId, outcome] of [
  ['KAK-14', 'rejected'],
  ['KAK-15', 'unknown'],
  ['KAK-16', 'confirmation lost'],
] as const) {
  test(`${caseId}: reset distinguishes ${outcome} while preserving recovery references and focus`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    const { origin } = installation;
    try {
      await page.setViewportSize({ width: 320, height: 900 });
      const household = await rememberedHousehold(page, origin);
      await page.goto(`${origin}/cookies`);
      await page.evaluate((id) => {
        sessionStorage.setItem(
          `skyttel-import:${id}`,
          '{"id":"uncertain-import","contentVersion":1}',
        );
        sessionStorage.setItem(`skyttel-erasure:${id}`, 'uncertain-erasure');
      }, household.id);
      const recovery = () =>
        page.evaluate(
          (id) => [
            sessionStorage.getItem(`skyttel-import:${id}`),
            sessionStorage.getItem(`skyttel-erasure:${id}`),
          ],
          household.id,
        );
      const before = await recovery();
      let saves = 0;
      await page.route('**/api/browser-binding/revoke', async (route) => {
        saves++;
        if (outcome === 'rejected') {
          await route.fulfill({ status: 409, json: { error: 'revocation_rejected' } });
        } else if (outcome === 'unknown') {
          await route.fetch();
          await route.abort();
        } else await route.continue();
      });
      if (outcome === 'confirmation lost')
        await page.route('**/api/browser-binding/register', (route) => route.abort());
      const reset = page.getByRole('button', { name: 'Återställ samtycke', exact: true });
      await expect(reset).toHaveAttribute('aria-disabled', 'false');
      await reset.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Återställ samtycke?', exact: true });
      await dialog.getByRole('button', { name: 'Återställ', exact: true }).focus();
      await page.keyboard.press('Enter');
      if (outcome !== 'confirmation lost')
        await dialog
          .getByRole('button', {
            name: outcome === 'unknown' ? 'Lämna med okänt utfall' : 'Avbryt',
            exact: true,
          })
          .click();
      await expect(dialog).toHaveCount(0);
      const feedback = page.locator('.cookie-storage-quick');
      if (outcome === 'confirmation lost') {
        await expect(feedback.getByRole('status')).toHaveText(
          'Ihågkommen inloggning är avstängd. Logga in igen för att fortsätta. Lagringssamtycket är återställt.',
        );
        await expect(feedback.getByRole('alert')).toBeEmpty();
        await expect(
          feedback.getByRole('link', { name: 'Logga in igen', exact: true }),
        ).toBeVisible();
      } else {
        await expect(feedback.getByRole('alert')).toHaveText(
          outcome === 'rejected'
            ? 'Ändringen kunde inte sparas. Försök igen.'
            : 'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes. Åtgärdens referens bevaras. Att lämna vyn skickar inget nytt sparande.',
        );
        await expect(feedback.getByRole('status')).toBeEmpty();
      }
      await expect(reset).toBeFocused();
      expect(saves).toBe(1);
      expect(await recovery()).toEqual(before);
      if (outcome === 'unknown') {
        for (const name of ['Acceptera Alla', 'Endast nödvändiga', 'Återställ samtycke']) {
          const button = page.getByRole('button', { name, exact: true });
          await expect(button).toHaveAttribute('aria-disabled', 'true');
          await button.focus();
          await page.keyboard.press('Enter');
        }
        await expect(dialog).toHaveCount(0);
        await expect(
          feedback.getByRole('button', { name: 'Kontrollera igen', exact: true }),
        ).toBeVisible();
        expect(saves).toBe(1);
      } else if (outcome === 'rejected') {
        expect(
          await (
            await page.request.get(`${origin}/api/browser-binding/preference`, {
              headers: { origin },
            })
          ).json(),
        ).toMatchObject({ remembered: true });
        const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
        await expect(choice).toBeChecked();
        expect(saves).toBe(1);
      }
    } finally {
      await installation.close();
    }
  });
}

test('KAK-10: the remembered-login switch saves immediately and preserves focus at 1280px', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await rememberedHousehold(page, installation.origin);
    await page.goto(`${installation.origin}/cookies`);
    const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
    await expect(choice).toBeChecked();
    await choice.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('status')).toHaveText(
      'Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.',
    );
    await expect(choice).not.toBeChecked();
    await expect(choice).toBeFocused();
    expect(
      await (
        await page.request.get(`${installation.origin}/api/browser-binding/preference`, {
          headers: { origin: installation.origin },
        })
      ).json(),
    ).toMatchObject({ remembered: false });
    await expect(choice).toBeEnabled();
  } finally {
    await installation.close();
  }
});

for (const [width, caseId] of [
  [1280, 'KAK-11'],
  [390, 'KAK-12'],
  [320, 'KAK-13'],
] as const) {
  test(`${caseId}: navigation and confirmed reset preserve other work at ${width}px`, async ({
    page,
    browser,
  }) => {
    const installation = await createInstallation();
    const other = await createPreparedContext(browser);
    const { origin } = installation;
    const headers = { origin };
    let release = () => {};
    try {
      await page.setViewportSize({ width, height: 900 });
      const household = await rememberedHousehold(page, origin);
      await signIn(other.request, origin);
      const read = async (path: string) =>
        (await page.request.get(`${origin}${path}`, { headers })).json();
      const preference = '/api/browser-binding/preference';
      const map = `/api/households/${household.id}/map`;
      const consent = `/api/households/${household.id}/conversation-consent`;
      await page.request.post(`${origin}/api/theme-preference`, {
        headers,
        data: { mode: 'dark' },
      });
      const view = await read(`${map}/view`);
      await page.request.post(`${origin}${map}/view/settings`, {
        headers,
        data: {
          version: view.settings.version,
          settings: { ...view.settings, background: true, version: undefined },
        },
      });
      await page.request.post(`${origin}${consent}`, { headers, data: { textVersion: 3 } });
      const before = await Promise.all([
        read('/api/theme-preference'),
        read(`${map}/view`),
        read(map),
        read(consent),
      ]);
      const otherBefore = await (
        await other.request.get(`${origin}${preference}`, { headers })
      ).json();
      await page.goto(`${origin}/cookies`);
      await page.evaluate((id) => {
        sessionStorage.setItem(
          `skyttel-import:${id}`,
          JSON.stringify({ id: 'uncertain-import', contentVersion: 1 }),
        );
        sessionStorage.setItem(`skyttel-erasure:${id}`, 'uncertain-erasure');
      }, household.id);
      const recoveryBefore = await page.evaluate(() => ({ ...sessionStorage }));
      const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
      await expect(choice).toBeChecked();
      const details = page.getByText('Visa nödvändig lagring', { exact: true });
      await details.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { name: 'better-auth.session_token', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Enter');
      let captured = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const committed = new Promise<void>((resolve) => {
        captured = resolve;
      });
      await page.route('**/api/browser-binding/revoke', async (route) => {
        const response = await route.fetch();
        captured();
        await held;
        await route.fulfill({ response });
      });
      await choice.focus();
      await page.keyboard.press('Space');
      await committed;
      await expect(page.getByRole('status')).toHaveText('Sparar…');
      const navigation = page.getByRole('navigation', { name: 'Dina kontosidor', exact: true });
      if (!(await navigation.getByRole('link', { name: 'Din profil', exact: true }).isVisible())) {
        await navigation.getByText('Välj inställning', { exact: true }).focus();
        await page.keyboard.press('Enter');
      }
      for (const name of ['Din profil', 'Inloggningssätt', 'Tillbaka till kartan']) {
        const destination = page.getByRole('link', { name, exact: true });
        await destination.focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(`${origin}/cookies`);
        await expect(page.getByRole('status')).toHaveText('Sparar…');
      }
      release();
      await expect(page.getByRole('status')).toHaveText(
        'Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.',
      );
      await page.unroute('**/api/browser-binding/revoke');
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect(page).toHaveURL(`${origin}/households/${household.id}`);
      expect(await read(preference)).toMatchObject({ remembered: false });
      await page.goto(`${origin}/cookies`);
      await choice.check();
      await expect(page.getByRole('status')).toContainText('Ihågkommen inloggning är aktiverad.');
      const reset = page.getByRole('button', { name: 'Återställ samtycke', exact: true });
      await expect(reset).toBeVisible();
      await reset.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Återställ samtycke?', exact: true });
      await expect(dialog).toContainText('personliga vyer');
      await expect(dialog).toContainText('återhämtningsuppgifter');
      await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('button', { name: 'Återställ', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(reset).toBeFocused();
      expect(await read(preference)).toMatchObject({ remembered: true });
      await page.keyboard.press('Enter');
      await dialog.getByRole('button', { name: 'Återställ', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(reset).toBeFocused();
      await expect(page.getByRole('status')).toHaveText(
        'Ihågkommen inloggning är avstängd. Du är fortfarande inloggad. Lagringssamtycket är återställt.',
      );
      await expect(page.locator('.cookie-storage-quick').getByRole('status')).toContainText(
        'Ihågkommen inloggning är avstängd.',
      );
      expect(await read(preference)).toMatchObject({ remembered: false });
      expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual(recoveryBefore);
      expect(
        await Promise.all([
          read('/api/theme-preference'),
          read(`${map}/view`),
          read(map),
          read(consent),
        ]),
      ).toEqual(before);
      expect(await (await other.request.get(`${origin}${preference}`, { headers })).json()).toEqual(
        otherBefore,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      release();
      await other.close();
      await installation.close();
    }
  });
}
