import { type APIRequestContext, expect, type Page, request } from '@playwright/test';
import { textViewButtonAccessibleName } from './conversation.js';

const bindingOrigins = new WeakMap<APIRequestContext, string>();

/** Explicit post-login activation through the actual authenticated contract. */
export async function activateRememberedLogin(client: APIRequestContext, origin: string) {
  const preference = await (
    await client.get(`${origin}/api/browser-binding/preference`, { headers: { origin } })
  ).json();
  const response = await client.post(`${origin}/api/browser-binding/activate`, {
    headers: { origin },
    data: {
      id: crypto.randomUUID(),
      sessionId: preference.sessionId,
      bindingId: preference.bindingId,
      preferences: true,
      rememberMe: true,
      informationVersion: 1,
      consentInformationVersion: 1,
    },
  });
  expect(response.status()).toBe(200);
  const result = await response.json();
  await client.addCookies([
    {
      name: result.cookieName,
      value: result.candidate,
      url: origin,
      expires: result.expiresAt / 1000,
      secure: origin.startsWith('https:'),
      sameSite: 'Lax',
    },
  ]);
  expect(
    (
      await client.post(`${origin}/api/browser-binding/register`, { headers: { origin }, data: {} })
    ).status(),
  ).toBe(200);
  return response;
}

export async function acceptRememberedOffer(page: Page) {
  const offer = page.getByRole('dialog', { name: 'Kom ihåg mig i Skyttel', exact: true });
  await offer.getByRole('button', { name: 'Kom ihåg mig i Skyttel', exact: true }).click();
  await expect(offer).not.toBeVisible();
}

/** A new explicit login in another tab leaves the old tab's unresolved action
 * reference intact, so its result can be checked against the newer login. */
export async function signInRemembered(page: Page, origin: string) {
  if (!page.url().startsWith(origin)) await page.goto(`${origin}/login`);
  const unresolved = await page.evaluate(() =>
    Object.keys(sessionStorage).some((key) => key.startsWith('skyttel-storage-operation:')),
  );
  const target = unresolved ? await page.context().newPage() : page;
  await target.goto(`${origin}/login`);
  await target.getByRole('button', { name: 'Fortsätt med Google', exact: true }).click();
  await target.getByRole('button', { name: 'Fortsätt till Google', exact: true }).click();
  await acceptRememberedOffer(target);
  if (target !== page) {
    await target.close();
    await page.goto(`${origin}/cookies`);
  }
}

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

/** Enter the ordinary table without closing or discarding other work. */
export async function openTable(page: Page) {
  await (await utilityButton(page, 'Tabell')).click();
  await expect(page.getByRole('region', { name: 'Hushållets tabell', exact: true })).toBeVisible();
}

/** Enter the map through its actual toolbar control. */
export async function openMap(page: Page) {
  await (await utilityButton(page, 'Karta')).click();
  await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
}

/** Set the saved label mode through the map toolbar's toggle button. */
export async function setAllLabels(page: Page, enabled: boolean) {
  const button = page.getByRole('button', { name: 'Alla etiketter', exact: true });
  if ((await button.getAttribute('aria-pressed')) !== String(enabled)) await button.click();
  await expect(button).toHaveAttribute('aria-pressed', String(enabled));
}

export async function openNewObject(page: Page) {
  await (await utilityButton(page, 'Nytt objekt')).click();
  const dialog = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Read the ordinary draft summary without starting a conversation. */
export async function openDraftReview(page: Page) {
  const text = await utilityButton(page, 'Skriv till Skyttel');
  if ((await text.getAttribute('aria-expanded')) !== 'true') await text.click();
  const show = page.getByRole('button', { name: /^Visa utkastet \(\d+\)$/ });
  if (await show.isVisible()) await show.click();
  const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
  await expect(draft).toBeVisible();
  return draft;
}

/** Close only this named surface. A loss or outcome guard must remain observable. */
export async function closeSupportDialog(
  page: Page,
  dialogName: string,
  closeButtonName = 'Stäng dialogen',
) {
  const dialog = page.getByRole('dialog', { name: dialogName, exact: true });
  await dialog.getByRole('button', { name: closeButtonName, exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

/** Hide conversation text without ending its conversation or discarding its message. */
export async function closeTextView(page: Page) {
  const close = page.getByRole('button', { name: 'Stäng textvyn', exact: true });
  await close.click();
  await expect(close).not.toBeVisible();
}

export async function openProfile(page: Page) {
  const button = await utilityButton(page, 'Din profil');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

export async function openSettings(page: Page) {
  const button = await utilityButton(page, 'Inställningar');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
}

export async function utilityButton(page: Page, name: string) {
  const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
  await expect(tools).toBeVisible();
  const button = tools.getByRole('button', {
    name: name === 'Skriv till Skyttel' ? textViewButtonAccessibleName : name,
    exact: true,
  });
  if (!(await button.isVisible()))
    await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
  return button;
}

export async function signIn(client: APIRequestContext, origin: string, provider = 'google') {
  // Distinct HTTP test installations can share a host with different ports.
  // They are separate canonical sites, so explicitly reset the fixture jar
  // when changing installations instead of reusing the other site's cookies.
  const previousOrigin = bindingOrigins.get(client);
  if (previousOrigin && previousOrigin !== origin) await client.clearCookies();
  bindingOrigins.set(client, origin);
  // HTTP-only fixtures perform the same explicit candidate/write/register
  // protocol. Native Web Locks and synchronous document.cookie are exercised
  // separately by the browser-binding browser scenarios.
  const candidate = await client.post(`${origin}/api/browser-binding/candidate`, {
    headers: { origin },
    data: {},
  });
  if (candidate.status() !== 404) {
    expect(candidate.status()).toBe(200);
    const binding = await candidate.json();
    await client.addCookies([
      {
        name: binding.cookieName,
        value: binding.candidate,
        url: origin,
        secure: origin.startsWith('https:'),
        sameSite: 'Lax',
      },
    ]);
    expect(
      (
        await client.post(`${origin}/api/browser-binding/register`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
  }
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
