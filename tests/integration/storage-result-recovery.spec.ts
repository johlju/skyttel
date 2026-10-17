import type { Page } from '@playwright/test';
import {
  acceptRememberedOffer,
  restartWithSession,
  signIn,
  signInRemembered,
} from '../support/client.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test.use({ storagePreferences: true });

import { alex, createInstallation, robin } from '../support/installation.js';

async function rememberedLogin(page: Page, origin: string) {
  await signInRemembered(page, origin);
}

test('KAK-20: a lost committed OFF reply is checked after restart and a new remembered login without replay', async ({
  browser,
}) => {
  let committed = 0;
  const installation = await createInstallation(undefined, {
    https: true,
    deliverResponse(request, response) {
      if (
        new URL(request.url).pathname === '/api/browser-binding/revoke' &&
        response.status === 200
      )
        committed++;
      return response;
    },
  });
  const { origin } = installation;
  const context = await createPreparedContext(browser, { ignoreHTTPSErrors: true }, true);
  try {
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await page.goto(origin);
    await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    await acceptRememberedOffer(page);
    await expect(
      page.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
    ).toBeVisible();
    const initialStorage = await page.evaluate(() => ({ ...sessionStorage }));
    expect(initialStorage).toEqual({});
    let id = '';
    let writes = 0;
    const reads: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/browser-binding/results/'))
        reads.push(request.method());
    });
    await page.route('**/api/browser-binding/revoke', async (route) => {
      writes++;
      id = route.request().postDataJSON().id;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    await page.goto(`${origin}/cookies`);
    const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
    await expect(choice).toBeChecked();
    await choice.uncheck();
    await expect(page.getByRole('alert')).toContainText(
      'Sparstatus okänd. Vi kunde inte bekräfta om ändringen genomfördes.',
    );
    const check = page.getByRole('button', { name: 'Kontrollera igen', exact: true });
    await check.click();
    await expect(page.getByRole('alert')).toContainText(
      'Logga in igen för att kontrollera samma åtgärd.',
    );
    expect(committed).toBe(1);
    expect(writes).toBe(1);
    await installation.restart();
    await rememberedLogin(page, origin);
    const before = await (
      await context.request.get(`${origin}/api/browser-binding/preference`, { headers: { origin } })
    ).json();
    expect(before.remembered).toBe(true);
    await page.goto(`${origin}/cookies`);
    await expect(page.getByRole('alert')).toContainText('Sparstatus okänd');
    await expect(choice).not.toBeChecked();
    await check.click();
    await expect(page.getByRole('status')).toHaveText(
      'Ihågkommen inloggning är avstängd. Resultatet gäller din tidigare begäran. Du har loggat in på nytt.',
    );
    await expect(check).toBeFocused();
    await expect(choice).toBeChecked();
    expect(
      await (
        await context.request.get(`${origin}/api/browser-binding/preference`, {
          headers: { origin },
        })
      ).json(),
    ).toEqual(before);
    expect(reads).toEqual(['GET', 'GET']);
    expect(writes).toBe(1);
    expect(committed).toBe(1);
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) => key.startsWith('skyttel-storage-operation:')),
      ),
    ).toEqual([]);
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
  } finally {
    await context.close();
    await installation.close();
  }
});

test('result reads require the exact owner and retain their original 24-hour limit after restart', {
  tag: '@technical',
}, async ({ playwright }) => {
  let time = Date.now();
  const installation = await createInstallation(undefined, { now: () => time });
  const { origin } = installation;
  let owner = await playwright.request.newContext();
  const other = await playwright.request.newContext();
  const anonymous = await playwright.request.newContext();
  try {
    await signIn(owner, origin);
    const id = crypto.randomUUID();
    const response = await owner.post(`${origin}/api/browser-binding/revoke`, {
      headers: { origin },
      data: { id },
    });
    expect(response.status()).toBe(200);
    const result = await response.json();
    const path = `${origin}/api/browser-binding/results/${id}`;
    expect((await owner.get(path, { headers: { origin } })).status()).toBe(401);
    expect(
      (await anonymous.get(path, { headers: { 'sec-fetch-site': 'same-origin' } })).status(),
    ).toBe(401);
    owner = await restartWithSession(owner, () => installation.restart());
    await signIn(owner, origin);
    installation.setIdentity(robin);
    await signIn(other, origin, 'microsoft');
    expect((await other.get(path, { headers: { origin } })).status()).toBe(404);
    installation.setIdentity(alex);
    time = result.completedAt + 86_399_999;
    await signIn(owner, origin);
    const recovered = await owner.get(path, { headers: { origin } });
    expect(recovered.status()).toBe(200);
    expect(await recovered.json()).toMatchObject({
      id,
      status: 'completed',
      completedAt: result.completedAt,
      checkUntil: result.completedAt + 86_400_000,
    });
    time++;
    expect((await owner.get(path, { headers: { origin } })).status()).toBe(404);
    time++;
    expect((await owner.get(path, { headers: { origin } })).status()).toBe(404);
    const before = await (
      await owner.get(`${origin}/api/browser-binding/preference`, { headers: { origin } })
    ).json();
    expect(
      (
        await owner.post(`${origin}/api/browser-binding/revoke`, {
          headers: { origin },
          data: { id },
        })
      ).status(),
    ).toBe(409);
    expect(
      await (
        await owner.get(`${origin}/api/browser-binding/preference`, { headers: { origin } })
      ).json(),
    ).toEqual(before);
  } finally {
    await owner.dispose();
    await other.dispose();
    await anonymous.dispose();
    await installation.close();
  }
});

test('KAK-21: denied recovery storage stops the OFF request and preserves existing recovery references', async ({
  browser,
}) => {
  const installation = await createInstallation(undefined, { https: true });
  const { origin } = installation;
  const context = await createPreparedContext(browser, { ignoreHTTPSErrors: true }, true);
  try {
    const page = await context.newPage();
    await rememberedLogin(page, origin);
    await page.goto(`${origin}/cookies`);
    let writes = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/browser-binding/revoke') writes++;
    });
    await page.evaluate(() => {
      sessionStorage.setItem('skyttel-import:protected-household', 'protected-import');
      sessionStorage.setItem('skyttel-erasure:protected-household', 'protected-erasure');
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('skyttel-storage-operation:'))
          throw new DOMException('Synthetic storage denial', 'SecurityError');
        original.call(this, key, value);
      };
    });
    const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
    await expect(choice).toBeChecked();
    await choice.click();
    await expect(page.getByRole('alert')).toContainText(
      'Flikens återhämtningsuppgifter kunde inte sparas. Ingen ändring har skickats.',
    );
    await expect(choice).toBeFocused();
    await expect(choice).toBeChecked();
    expect(writes).toBe(0);
    expect(
      await (
        await context.request.get(`${origin}/api/browser-binding/preference`, {
          headers: { origin },
        })
      ).json(),
    ).toMatchObject({ remembered: true });
    expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual({
      'skyttel-import:protected-household': 'protected-import',
      'skyttel-erasure:protected-household': 'protected-erasure',
    });
  } finally {
    await context.close();
    await installation.close();
  }
});

for (const [caseId, lost] of [
  ['KAK-22', false],
  ['KAK-23', true],
] as const) {
  test(`${caseId}: ${lost ? 'lost' : 'corrupted'} operation reference never invents a result or repeats OFF after login`, async ({
    browser,
  }) => {
    const installation = await createInstallation(undefined, { https: true });
    const { origin } = installation;
    const context = await createPreparedContext(browser, { ignoreHTTPSErrors: true }, true);
    try {
      const page = await context.newPage();
      page.on('dialog', (dialog) => dialog.accept());
      await rememberedLogin(page, origin);
      let writes = 0;
      let reads = 0;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/browser-binding/results/')) reads++;
      });
      await page.route('**/api/browser-binding/revoke', async (route) => {
        writes++;
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      });
      await page.goto(`${origin}/cookies`);
      await page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true }).uncheck();
      await expect(page.getByRole('alert')).toContainText('Sparstatus okänd');
      await page.evaluate((remove) => {
        const key = Object.keys(sessionStorage).find((name) =>
          name.startsWith('skyttel-storage-operation:'),
        );
        if (!key) throw new Error('Expected operation recovery reference');
        if (remove) sessionStorage.removeItem(key);
        else sessionStorage.setItem(key, 'damaged reference');
      }, lost);
      await page.goto(`${origin}/login`);
      await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
      await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
      if (lost)
        await page
          .getByRole('dialog', { name: 'Kom ihåg mig i Skyttel', exact: true })
          .getByRole('button', { name: 'Inte nu', exact: true })
          .click();
      await expect(
        page.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
      ).toBeVisible();
      await page.goto(`${origin}/cookies`);
      if (lost) {
        await expect(
          page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true }),
        ).not.toBeChecked();
        await expect(page.getByRole('status')).toHaveText('');
      } else {
        await expect(page.getByRole('alert')).toContainText(
          'Åtgärdens referens saknas eller är skadad. Utfallet är fortfarande okänt.',
        );
        await page.getByRole('button', { name: 'Kontrollera igen', exact: true }).click();
        await expect(
          page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true }),
        ).toHaveAttribute('aria-disabled', 'true');
      }
      await expect(page.getByRole('status')).not.toContainText(
        'Ihågkommen inloggning är avstängd.',
      );
      expect(reads).toBe(0);
      expect(writes).toBe(1);
    } finally {
      await context.close();
      await installation.close();
    }
  });
}

test('KAK-24: an expired result remains unknown and checking never grants a new save', async ({
  browser,
}) => {
  let time = Date.now();
  const installation = await createInstallation(undefined, { https: true, now: () => time });
  const { origin } = installation;
  const context = await createPreparedContext(browser, { ignoreHTTPSErrors: true }, true);
  try {
    const page = await context.newPage();
    page.on('dialog', (dialog) => dialog.accept());
    await rememberedLogin(page, origin);
    let writes = 0;
    await page.route('**/api/browser-binding/revoke', async (route) => {
      writes++;
      expect((await route.fetch()).status()).toBe(200);
      await route.abort('failed');
    });
    await page.goto(`${origin}/cookies`);
    const choice = page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true });
    await choice.uncheck();
    await expect(page.getByRole('alert')).toContainText('Sparstatus okänd');
    await signIn(context.request, origin);
    time += 86_400_000;
    await signIn(context.request, origin);
    await page.goto(`${origin}/cookies`);
    const check = page.getByRole('button', { name: 'Kontrollera igen', exact: true });
    await check.click();
    await expect(page.getByRole('alert')).toContainText(
      'Resultatet kan inte hämtas. Det kan saknas eller ha passerat kontrollfönstret på 24 timmar. Utfallet är fortfarande okänt.',
    );
    await expect(check).toBeFocused();
    await expect(choice).toHaveAttribute('aria-disabled', 'true');
    await choice.focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('status')).not.toContainText('Ihågkommen inloggning är avstängd.');
    await expect(page.getByRole('alert')).not.toContainText('Skyttel har återställts');
    expect(writes).toBe(1);
  } finally {
    await context.close();
    await installation.close();
  }
});
