import { join } from 'node:path';
import { signInRemembered } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

const restoredMessage =
  'Skyttel har återställts från en säkerhetskopia. Gamla inloggningar kan inte längre användas. Logga in igen för att fortsätta.';

test('KAK-30: a proven older restore permits a fresh explicit choice without replaying the lost operation', async ({
  browser,
}) => {
  const installation = await createInstallation(undefined, { https: true });
  const context = await createPreparedContext(
    browser,
    {
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 844 },
    },
    true,
  );
  try {
    const { origin } = installation;
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    const login = async () => {
      await signInRemembered(page, origin);
    };
    await page.goto(origin);
    await login();
    const owner = (await (await context.request.get(`${origin}/api/bootstrap`)).json()).user.id;
    const backup = join(installation.directory, 'before-choice.sqlite');
    await installation.saveDatabase(backup);
    let writes = 0;
    let id = '';
    await page.route('**/api/browser-binding/revoke', async (route) => {
      writes++;
      id = route.request().postDataJSON().id;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await page.goto(`${origin}/cookies`);
    const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
    await choice.uncheck();
    await expect(page.getByRole('alert')).toContainText('Sparstatus okänd');
    await installation.restoreDatabase(backup, {
      generation: '22222222-2222-4222-8222-222222222222',
      restore: {
        fromGeneration: '11111111-1111-4111-8111-111111111111',
        confirmedAt: Date.now(),
        erasureReviewed: true,
      },
    });
    await page.goto(`${origin}/login`);
    await expect(page.getByRole('alert')).toContainText(restoredMessage);
    // The first old binding is rejected. Recovery is a separate confirmed
    // action; it does not retry OAuth or preserve the earlier remembered choice.
    await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Fortsätt till Google', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await page.getByRole('button', { name: 'Börja om i den här webbläsaren', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Fortsätt med Google', exact: true }),
    ).toBeFocused();
    await login();
    await page.goto(`${origin}/cookies`);
    await expect(page.getByRole('alert')).toContainText('Sparstatus okänd');
    const check = page.getByRole('button', { name: 'Kontrollera igen', exact: true });
    const read = page.waitForResponse(
      (response) => new URL(response.url()).pathname === `/api/browser-binding/results/${id}`,
    );
    await check.click();
    const checked = await read;
    expect(checked.status()).toBe(200);
    const proof = await checked.json();
    expect(proof).toEqual({ id, userId: owner, status: 'unavailable_after_restore' });
    await expect(page.getByRole('alert')).toHaveText(restoredMessage);
    await expect(check).toBeFocused();
    await expect(choice).toBeChecked();
    expect(writes).toBe(1);
    await expect(page.getByRole('article').getByRole('status')).not.toContainText(
      'Ihågkommen inloggning är avstängd',
    );
    await page.unroute('**/api/browser-binding/revoke');
    await choice.uncheck();
    await expect(page.getByRole('article').getByRole('status')).toContainText(
      'Ihågkommen inloggning är avstängd. Du är fortfarande inloggad.',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  } finally {
    await context.close();
    await installation.close();
  }
});

test('KAK-31: a trustworthy retained result survives restore and restart with its original control deadline', async ({
  browser,
}) => {
  const installation = await createInstallation(undefined, { https: true });
  const context = await createPreparedContext(browser, { ignoreHTTPSErrors: true }, true);
  try {
    const { origin } = installation;
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    const login = async () => {
      await signInRemembered(page, origin);
    };
    await page.goto(origin);
    await login();
    let writes = 0;
    let id = '';
    let original: { completedAt: number; checkUntil: number } | undefined;
    await page.route('**/api/browser-binding/revoke', async (route) => {
      writes++;
      id = route.request().postDataJSON().id;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      const result = await response.json();
      original = { completedAt: result.completedAt, checkUntil: result.checkUntil };
      await route.abort('failed');
    });
    await page.goto(`${origin}/cookies`);
    const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
    await choice.uncheck();
    await expect(page.getByRole('alert')).toContainText('Sparstatus okänd');
    const backup = join(installation.directory, 'retained-result.sqlite');
    await installation.saveDatabase(backup);
    await installation.restoreDatabase(backup, {
      generation: '22222222-2222-4222-8222-222222222222',
      restore: {
        fromGeneration: '11111111-1111-4111-8111-111111111111',
        confirmedAt: Date.now(),
        erasureReviewed: true,
      },
    });
    await page.goto(`${origin}/login`);
    await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await page.getByRole('button', { name: 'Börja om i den här webbläsaren', exact: true }).click();
    await login();
    await page.goto(`${origin}/cookies`);
    const check = page.getByRole('button', { name: 'Kontrollera igen', exact: true });
    await check.click();
    await expect(page.getByRole('article').getByRole('status')).toHaveText(
      'Ihågkommen inloggning är avstängd. Resultatet gäller din tidigare begäran. Du har loggat in på nytt.',
    );
    await expect(check).toBeFocused();
    await expect(choice).toBeChecked();
    await expect(page.getByRole('alert')).toBeEmpty();
    expect(original).toBeDefined();
    if (!original) throw new Error('Missing original committed result');
    expect(original.checkUntil - original.completedAt).toBe(86_400_000);
    for (const restart of [false, true]) {
      if (restart) await installation.restart();
      const result = await context.request.get(
        `${origin}/api/browser-binding/results/${id}?generation=11111111-1111-4111-8111-111111111111`,
        { headers: { origin } },
      );
      expect(result.status()).toBe(200);
      expect(await result.json()).toMatchObject({ status: 'completed', ...original });
    }
    expect(writes).toBe(1);
  } finally {
    await context.close();
    await installation.close();
  }
});
