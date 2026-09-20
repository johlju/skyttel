import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { alex, createInstallation } from '../support/installation.js';

async function linkStep(
  client: import('@playwright/test').APIRequestContext,
  origin: string,
  step: string,
  provider: string,
) {
  const response = await client.post(`${origin}/api/login-methods/${step}`, {
    headers: { origin },
    data: { provider },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).url as string;
}

test('both proven providers return to the same user and household', async ({ request }) => {
  const installation = await createInstallation();
  const { origin } = installation;
  try {
    await signIn(request, origin);
    await createHousehold(request, origin);
    const before = await (await request.get(`${origin}/api/bootstrap`)).json();
    const prove = await request.post(`${origin}/api/login-methods/prove`, {
      headers: { origin },
      data: { provider: 'google' },
    });
    expect(prove.status()).toBe(200);
    await request.get((await prove.json()).url);
    installation.setIdentity({ ...alex, subject: 'alex-private-microsoft' });
    const add = await request.post(`${origin}/api/login-methods/add`, {
      headers: { origin },
      data: { provider: 'microsoft' },
    });
    expect(add.status()).toBe(200);
    await request.get((await add.json()).url);
    expect(await (await request.get(`${origin}/api/login-methods`)).json()).toEqual({
      providers: ['google', 'microsoft'],
      stage: 'complete',
    });
    await installation.restart();
    await request.post(`${origin}/api/auth/sign-out`, { headers: { origin }, data: {} });
    await signIn(request, origin, 'microsoft');
    expect(await (await request.get(`${origin}/api/bootstrap`)).json()).toEqual(before);
  } finally {
    await installation.close();
  }
});

for (const failure of [
  'wrong identity',
  'denied consent',
  'provider failure',
  'cancelled',
] as const) {
  test(`existing identity proof preserves access after ${failure}`, async ({ request }) => {
    const installation = await createInstallation();
    const { origin } = installation;
    try {
      await signIn(request, origin);
      await createHousehold(request, origin);
      const before = await (await request.get(`${origin}/api/bootstrap`)).json();
      if (failure === 'denied consent') installation.denyConsent(true);
      const url = await linkStep(request, origin, 'prove', 'google');
      if (failure === 'wrong identity') installation.setIdentity({ ...alex, subject: 'impostor' });
      if (failure === 'provider failure') installation.failProvider(true);
      if (failure === 'cancelled')
        await request.post(`${origin}/api/login-methods/cancel`, { headers: { origin }, data: {} });
      await request.get(url);
      expect(await (await request.get(`${origin}/api/bootstrap`)).json()).toEqual(before);
      expect((await (await request.get(`${origin}/api/login-methods`)).json()).providers).toEqual([
        'google',
      ]);
      expect(
        (
          await request.post(`${origin}/api/login-methods/add`, {
            headers: { origin },
            data: { provider: 'microsoft' },
          })
        ).status(),
      ).toBe(409);
    } finally {
      await installation.close();
    }
  });
}

for (const failure of [
  'occupied identity',
  'denied consent',
  'provider failure',
  'cancelled',
] as const) {
  test(`new identity proof preserves both users after ${failure}`, async ({
    request,
    playwright,
  }) => {
    const installation = await createInstallation();
    const { origin } = installation;
    const other = await playwright.request.newContext();
    try {
      installation.setIdentity({ ...alex, subject: 'other-microsoft' });
      await signIn(other, origin, 'microsoft');
      const otherBefore = await (await other.get(`${origin}/api/bootstrap`)).json();
      installation.setIdentity(alex);
      await signIn(request, origin);
      await createHousehold(request, origin);
      const before = await (await request.get(`${origin}/api/bootstrap`)).json();
      expect(otherBefore.user.id).not.toBe(before.user.id);
      await request.get(await linkStep(request, origin, 'prove', 'google'));
      installation.setIdentity({
        ...alex,
        subject: failure === 'occupied identity' ? 'other-microsoft' : 'new-microsoft',
      });
      if (failure === 'denied consent') installation.denyConsent(true);
      const url = await linkStep(request, origin, 'add', 'microsoft');
      if (failure === 'provider failure') installation.failProvider(true);
      if (failure === 'cancelled')
        await request.post(`${origin}/api/login-methods/cancel`, { headers: { origin }, data: {} });
      await request.get(url);
      expect(await (await request.get(`${origin}/api/bootstrap`)).json()).toEqual(before);
      expect(await (await other.get(`${origin}/api/bootstrap`)).json()).toEqual(otherBefore);
      expect((await (await request.get(`${origin}/api/login-methods`)).json()).providers).toEqual([
        'google',
      ]);
    } finally {
      await other.dispose();
      await installation.close();
    }
  });
}

test('linking requires the original session, explicit proof and same-origin requests', async ({
  request,
  playwright,
}) => {
  const installation = await createInstallation();
  const { origin } = installation;
  const other = await playwright.request.newContext();
  try {
    expect(
      (
        await request.post(`${origin}/api/login-methods/prove`, {
          headers: { origin },
          data: { provider: 'google' },
        })
      ).status(),
    ).toBe(401);
    await signIn(request, origin);
    expect(
      (
        await request.post(`${origin}/api/login-methods/prove`, {
          headers: { origin: 'https://elsewhere.example' },
          data: { provider: 'google' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post(`${origin}/api/login-methods/add`, {
          headers: { origin },
          data: { provider: 'microsoft' },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.post(`${origin}/api/auth/link-social`, {
          headers: { origin },
          data: { provider: 'microsoft' },
        })
      ).status(),
    ).toBe(404);
    const url = await linkStep(request, origin, 'prove', 'google');
    await signIn(other, origin);
    await other.get(url);
    expect((await (await request.get(`${origin}/api/login-methods`)).json()).stage).toBe('prove');
    const tampered = new URL(url);
    tampered.searchParams.set('state', 'invalid-state');
    await request.get(tampered.href);
    expect((await (await request.get(`${origin}/api/login-methods`)).json()).stage).toBe('prove');
  } finally {
    await other.dispose();
    await installation.close();
  }
});

test('the interface verifies the result and lists both login methods', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toBeVisible();
    installation.setIdentity({ ...alex, subject: 'alex-microsoft', email: 'other@example.test' });
    await page.getByRole('button', { name: 'Koppla Microsoft' }).click();
    await expect(page.getByRole('status')).toHaveText(
      'Länkningen är verifierad. Båda inloggningssätten når samma Skyttel-användare.',
    );
    await expect(page.getByText('Microsoft – kopplat', { exact: true })).toBeVisible();
    await expect(page.getByText('Google – kopplat', { exact: true })).toBeVisible();
  } finally {
    await installation.close();
  }
});
