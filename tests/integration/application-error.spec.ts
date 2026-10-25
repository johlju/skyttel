import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

test('ACCESS-34: an unexpected rendering error offers keyboard reload and recovery', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(installation.origin);
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();

    // Malformed startup data deliberately crashes rendering; this is a synthetic
    // fault, not a reproduction of the originally reported unknown defect.
    await page.route(
      '**/api/bootstrap',
      (route) => route.fulfill({ json: { status: 'anonymous', providers: null, operator: false } }),
      { times: 1 },
    );
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));

    const heading = page.getByRole('heading', { name: 'Något gick fel i Skyttel' });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(page.getByRole('main')).toContainText('Ladda om sidan för att försöka igen.');
    await expect(page.locator('body')).not.toContainText(
      /TypeError|Cannot read properties|ErrorBoundary|errorElement|Unexpected Application Error/,
    );
    await expect(page.locator('pre')).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Ladda om Skyttel' })).toBeFocused();
    await Promise.all([page.waitForEvent('domcontentloaded'), page.keyboard.press('Enter')]);
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fortsätt med Google' })).toBeVisible();
    await expect(heading).toHaveCount(0);
  } finally {
    await installation.close();
  }
});
