import { type APIRequestContext, expect, type Page, request } from '@playwright/test';

// These HTTP-only clients use default context options. Keep their authenticated
// session across a deliberate server restart, but retire the old socket pool.
export async function restartWithSession(
  client: APIRequestContext,
  restart: () => Promise<unknown>,
) {
  const storageState = await client.storageState();
  await client.dispose();
  await restart();
  return request.newContext({ storageState });
}

export async function openWorkspace(page: Page) {
  await page
    .getByRole('navigation', { name: 'Kartans verktyg' })
    .getByRole('button', { name: 'Lista', exact: true })
    .click();
}

export async function openConversation(page: Page) {
  await (await utilityButton(page, 'Samtal och text')).click();
}

export async function activatePanel(page: Page, title: string) {
  await page.getByLabel(/^Öppna paneler/).selectOption({ label: title });
  await expect(page.getByRole('region', { name: title, exact: true })).toBeVisible();
}

export async function openMap(page: Page) {
  const close = page.getByRole('button', { name: 'Stäng arbetsytan', exact: true });
  if (await close.isVisible()) await close.click();
  await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  const guidance = page.getByRole('button', { name: 'Stäng vägledningen', exact: true });
  if (await guidance.isVisible()) await guidance.click();
}

export async function openProfile(page: Page) {
  const button = await utilityButton(page, 'Din profil');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

export async function openSettings(page: Page) {
  const button = await utilityButton(page, 'Inställningar');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

async function utilityButton(page: Page, name: string) {
  const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
  await expect(tools).toBeVisible();
  const button = tools.getByRole('button', { name, exact: true });
  if (!(await button.isVisible()))
    await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
  return button;
}

export async function signIn(client: APIRequestContext, origin: string, provider = 'google') {
  const response = await client.post(`${origin}/api/auth/sign-in/social`, {
    headers: { origin },
    data: { provider, callbackURL: '/', errorCallbackURL: '/?authError=1' },
  });
  expect(response.status()).toBe(200);
  const { url } = await response.json();
  return client.get(url);
}

export async function createHousehold(
  client: APIRequestContext,
  origin: string,
  name = 'Hushållet Linden',
) {
  return client.post(`${origin}/api/households`, { headers: { origin }, data: { name } });
}
