import { activateRememberedLogin, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

for (const [caseId, outcome] of [
  ['ACCESS-29', 'confirmed'],
  ['ACCESS-30', 'rejected'],
  ['ACCESS-31', 'unknown'],
] as const) {
  test(`${caseId}: explicit remembered-login OFF distinguishes ${outcome} saving`, async ({
    browser,
  }) => {
    const installation = await createInstallation(undefined, { https: true });
    const { origin } = installation;
    const context = await createPreparedContext(browser, { ignoreHTTPSErrors: true }, true);
    try {
      await signIn(context.request, origin);
      const started = await context.request.post(`${origin}/api/auth/sign-in/social`, {
        headers: { origin },
        data: { provider: 'google', callbackURL: '/', rememberMe: true, informationVersion: 1 },
      });
      await context.request.get((await started.json()).url, { maxRedirects: 0 });
      await activateRememberedLogin(context.request, origin);
      const page = await context.newPage();
      await page.goto(origin);
      await expect(
        page.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
      ).toBeVisible();
      expect(
        (await context.cookies())
          .filter(
            (cookie) => cookie.name.includes('binding') || cookie.name.endsWith('session_token'),
          )
          .every((cookie) => cookie.expires > 0),
      ).toBe(true);
      if (outcome === 'rejected')
        await page.route('**/api/browser-binding/revoke', (route) =>
          route.fulfill({ status: 409, json: { error: 'revocation_rejected' } }),
        );
      if (outcome === 'unknown')
        await page.route('**/api/browser-binding/revoke', async (route) => {
          await route.fetch();
          await route.abort('failed');
        });
      await page.goto(`${origin}/cookies`);
      const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
      const field = page.getByRole('region', { name: 'Ihågkommen inloggning', exact: true });
      await expect(choice).toBeChecked();
      await choice.uncheck();
      if (outcome === 'confirmed') {
        const toast = field.locator('.cookie-storage-toast');
        await expect(toast).toBeVisible();
        await expect(toast.getByRole('status')).toHaveText(
          'Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.',
        );
        await expect(choice).toBeEnabled();
        expect(
          (await context.cookies())
            .filter(
              (cookie) => cookie.name.includes('binding') || cookie.name.endsWith('session_token'),
            )
            .every((cookie) => cookie.expires === -1),
        ).toBe(true);
      } else if (outcome === 'rejected') {
        await expect(field.getByRole('alert')).toHaveText(
          'Ändringen kunde inte sparas. Försök igen.',
        );
        await expect(choice).toBeEnabled();
      } else {
        await expect(field.getByRole('alert')).toHaveText(
          'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes. Åtgärdens referens bevaras. Att lämna vyn skickar inget nytt sparande.',
        );
        await expect(choice).toHaveAttribute('aria-disabled', 'true');
      }
      if (outcome === 'rejected') await expect(choice).toBeChecked();
      else await expect(choice).not.toBeChecked();
      await expect(choice).toBeFocused();
      if (outcome === 'confirmed') {
        await field.getByRole('button', { name: 'Stäng meddelandet', exact: true }).click();
        await expect(field.getByRole('status')).toBeEmpty();
      }
    } finally {
      await context.close();
      await installation.close();
    }
  });
}
