import { expect, test } from '@playwright/test';
import { createInstallation } from '../support/installation.js';

test('KAK-33: permission allows a separate post-login offer and declining future offers survives another login', async ({
  page,
}) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    await page.goto(origin);
    await page.getByRole('button', { name: 'Acceptera Alla', exact: true }).click();
    const login = async () => {
      await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
      await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    };
    await login();
    const offer = page.getByRole('dialog', { name: 'Kom ihåg mig i Skyttel', exact: true });
    await expect(offer).toBeVisible();
    await offer.getByRole('button', { name: 'Inte nu', exact: true }).click();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
    ).toBeVisible();
    await expect(offer).not.toBeVisible();
    await page.goto(`${origin}/login`);
    await login();
    await offer.getByRole('button', { name: 'Fråga inte igen', exact: true }).click();
    await page.goto(`${origin}/login`);
    await login();
    await expect(
      page.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
    ).toBeVisible();
    await expect(offer).not.toBeVisible();
    await page.goto(`${origin}/cookies`);
    await page.getByRole('button', { name: 'Kom ihåg mig i Skyttel', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Ihågkommen inloggning är aktiverad.');
    expect(
      await (
        await page.request.get(`${origin}/api/browser-binding/preference`, { headers: { origin } })
      ).json(),
    ).toMatchObject({ remembered: true });
  } finally {
    await installation.close();
  }
});

test('KAK-42: pending activation cannot close and a lost activation reply is checked once after a fresh ordinary login', async ({
  page,
}) => {
  const installation = await createInstallation();
  const { origin } = installation;
  let release = () => {};
  let entered = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const captured = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let writes = 0;
  try {
    await page.goto(origin);
    await page.getByRole('button', { name: 'Acceptera Alla', exact: true }).click();
    const login = async () => {
      await page.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
      await page.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
    };
    await login();
    await page.route('**/api/browser-binding/activate', async (route) => {
      writes++;
      expect((await route.fetch()).status()).toBe(200);
      entered();
      await held;
      await route.abort('failed');
    });
    const offer = page.getByRole('dialog', { name: 'Kom ihåg mig i Skyttel', exact: true });
    await offer.getByRole('button', { name: 'Kom ihåg mig i Skyttel', exact: true }).click();
    await captured;
    await page.keyboard.press('Escape');
    await expect(offer).toBeVisible();
    await expect(offer.getByRole('button', { name: 'Inte nu', exact: true })).toBeDisabled();
    release();
    await expect(offer.getByRole('alert')).toContainText('Sparstatus okänd');
    await offer.getByRole('button', { name: 'Lämna med okänt utfall', exact: true }).click();
    await page.goto(`${origin}/login`);
    await login();
    await expect(
      page.getByRole('heading', { name: 'Skapa ditt hushåll', exact: true }),
    ).toBeVisible();
    await page.goto(`${origin}/cookies`);
    await page.getByRole('button', { name: 'Kontrollera igen', exact: true }).click();
    await expect(page.getByRole('status')).toContainText(
      'Ihågkommen inloggning är aktiverad. Resultatet gäller din tidigare begäran. Du har loggat in på nytt.',
    );
    await expect(
      page.getByRole('switch', { name: 'Ihågkommen inloggning', exact: true }),
    ).not.toBeChecked();
    expect(writes).toBe(1);
  } finally {
    release();
    await installation.close();
  }
});
