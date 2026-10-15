import { expect, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function rememberedHousehold(page: Page, origin: string) {
  await signIn(page.request, origin);
  const started = await page.request.post(`${origin}/api/auth/sign-in/social`, {
    headers: { origin },
    data: { provider: 'google', callbackURL: '/', rememberMe: true, informationVersion: 1 },
  });
  await page.request.get((await started.json()).url, { maxRedirects: 0 });
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
      const reset = page.getByRole('button', { name: 'Återställ valfri lagring', exact: true });
      await expect(reset).toHaveAttribute('aria-disabled', 'false');
      await reset.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Återställ valfri lagring?', exact: true });
      await dialog.getByRole('button', { name: 'Återställ', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(dialog).toHaveCount(0);
      const feedback = page.locator('.cookie-storage-quick');
      if (outcome === 'confirmation lost') {
        await expect(feedback.getByRole('status')).toHaveText(
          'Ihågkommen inloggning är avstängd. Logga in igen för att fortsätta.',
        );
        await expect(feedback.getByRole('alert')).toBeEmpty();
        await expect(
          feedback.getByRole('link', { name: 'Logga in igen', exact: true }),
        ).toBeVisible();
      } else {
        await expect(feedback.getByRole('alert')).toHaveText(
          outcome === 'rejected'
            ? 'Ändringen kunde inte sparas. Försök igen.'
            : 'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes.',
        );
        await expect(feedback.getByRole('status')).toBeEmpty();
      }
      await expect(reset).toBeFocused();
      expect(saves).toBe(1);
      expect(await recovery()).toEqual(before);
      if (outcome === 'unknown') {
        await expect(page.getByText('Osparad ändring.', { exact: true })).toHaveCount(0);
        for (const name of ['Återställ valfri lagring', 'Ångra ändring', 'Spara inställningar']) {
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
        const undo = page.getByRole('button', { name: 'Ångra ändring', exact: true });
        await undo.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('switch')).toBeChecked();
        await expect(feedback.getByRole('alert')).toBeEmpty();
        await expect(undo).toBeFocused();
      }
    } finally {
      await installation.close();
    }
  });
}

test('KAK-10: quick actions and undo change only the form before explicit saving at 1280px', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await rememberedHousehold(page, installation.origin);
    await page.goto(`${installation.origin}/cookies`);
    const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
    await expect(choice).toBeChecked();
    const quick = page.getByRole('button', { name: 'Stäng av ihågkommen inloggning', exact: true });
    await quick.focus();
    await page.keyboard.press('Enter');
    await expect(quick).toBeFocused();
    await expect(choice).not.toBeChecked();
    await expect(page.getByText('Osparad ändring.', { exact: true })).toBeVisible();
    expect(
      await (
        await page.request.get(`${installation.origin}/api/browser-binding/preference`, {
          headers: { origin: installation.origin },
        })
      ).json(),
    ).toMatchObject({ remembered: true });
    const undo = page.getByRole('button', { name: 'Ångra ändring', exact: true });
    await undo.focus();
    await page.keyboard.press('Enter');
    await expect(undo).toBeFocused();
    await expect(choice).toBeChecked();
    await quick.click();
    const save = page.getByRole('button', { name: 'Spara inställningar', exact: true });
    await save.click();
    await expect(page.getByRole('status')).toHaveText(
      'Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.',
    );
    await expect(save).toBeFocused();
    expect(
      await (
        await page.request.get(`${installation.origin}/api/browser-binding/preference`, {
          headers: { origin: installation.origin },
        })
      ).json(),
    ).toMatchObject({ remembered: false });
    await expect(
      page.getByRole('link', { name: 'Logga in på nytt och välj Kom ihåg mig.' }),
    ).toBeVisible();
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
    const other = await browser.newContext();
    const { origin } = installation;
    const headers = { origin };
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
          settings: { ...view.settings, stars: true, version: undefined },
        },
      });
      await page.request.post(`${origin}${consent}`, { headers, data: { textVersion: 2 } });
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
      const quick = page.getByRole('button', {
        name: 'Stäng av ihågkommen inloggning',
        exact: true,
      });
      await quick.focus();
      await page.keyboard.press('Enter');
      await expect(quick).toBeFocused();
      const undo = page.getByRole('button', { name: 'Ångra ändring', exact: true });
      await undo.focus();
      await page.keyboard.press('Enter');
      await expect(undo).toBeFocused();
      await expect(choice).toBeChecked();
      await quick.focus();
      await page.keyboard.press('Enter');
      const navigation = page.getByRole('navigation', { name: 'Dina kontosidor', exact: true });
      if (!(await navigation.getByRole('link', { name: 'Din profil', exact: true }).isVisible())) {
        await navigation.getByText('Välj inställning', { exact: true }).focus();
        await page.keyboard.press('Enter');
      }
      const guard = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
      for (const name of ['Din profil', 'Inloggningssätt', 'Tillbaka till kartan']) {
        const destination = page.getByRole('link', { name, exact: true });
        await destination.focus();
        await page.keyboard.press('Enter');
        await expect(guard).toBeVisible();
        await expect(
          guard.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(guard).not.toBeVisible();
        await expect(destination).toBeFocused();
        await expect(page).toHaveURL(`${origin}/cookies`);
        await expect(choice).not.toBeChecked();
      }
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await guard
        .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
        .click();
      await expect(page).toHaveURL(`${origin}/households/${household.id}`);
      expect(await read(preference)).toMatchObject({ remembered: true });
      await page.goto(`${origin}/cookies`);
      const reset = page.getByRole('button', { name: 'Återställ valfri lagring', exact: true });
      await expect(reset).toBeVisible();
      await reset.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Återställ valfri lagring?', exact: true });
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
        'Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.',
      );
      await expect(page.locator('.cookie-storage-quick').getByRole('status')).toContainText(
        'Ihågkommen inloggning är avstängd.',
      );
      const save = page.getByRole('button', { name: 'Spara inställningar', exact: true });
      await expect(save).toHaveAttribute('aria-disabled', 'true');
      await save.focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.cookie-storage-quick').getByRole('status')).toContainText(
        'Ihågkommen inloggning är avstängd.',
      );
      await expect(save).toBeFocused();
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
      await other.close();
      await installation.close();
    }
  });
}
