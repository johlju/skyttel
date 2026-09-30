import { expect, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openProfile, signIn } from '../support/client.js';
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

test('ACCESS-09: both proven providers return to the same user and household', async ({
  request,
}) => {
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

test('ACCESS-09: the interface verifies the result and lists both login methods', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openProfile(page);
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

test('ACCESS-10: cancelling a verified link requires fresh proof and preserves household access', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    const before = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    await page.goto(`${installation.origin}/login-methods`);
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toBeVisible();
    const cancellation = page.waitForResponse(
      (response) =>
        response.url() === `${installation.origin}/api/login-methods/cancel` &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Avbryt länkning' }).click();
    const cancelled = await cancellation;
    expect(cancelled.status()).toBe(200);
    expect(await cancelled.json()).toEqual({ status: 'cancelled' });
    await expect(page.getByRole('status')).toHaveText(
      'Länkningen är avbruten. Dina tidigare inloggningar och din tillgång finns kvar. Verifiera på nytt när du vill koppla ett inloggningssätt.',
    );
    await expect(page.getByRole('button', { name: 'Verifiera Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Avbryt länkning' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Google – kopplat', { exact: true })).toBeVisible();
    await expect(page.getByText('Microsoft – kopplat', { exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'Till startsidan' }).click();
    await expect(
      page.getByRole('heading', { name: before.household.name, exact: true }),
    ).toBeVisible();
    expect(await (await page.request.get(`${installation.origin}/api/bootstrap`)).json()).toEqual(
      before,
    );
    await openProfile(page);
    await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('ACCESS-11: the wrong existing identity leaves linking retryable without changing access', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    const before = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    await page.goto(`${installation.origin}/login-methods`);
    installation.setIdentity({ ...alex, subject: 'wrong-google' });
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('alert')).toContainText('Länkningen kunde inte slutföras');
    await expect(page.getByRole('button', { name: 'Verifiera Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toHaveCount(0);
    expect(await (await page.request.get(`${installation.origin}/api/bootstrap`)).json()).toEqual(
      before,
    );

    installation.setIdentity(alex);
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('link', { name: 'Till startsidan' }).click();
    await expect(
      page.getByRole('heading', { name: before.household.name, exact: true }),
    ).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('ACCESS-19: expired linking explains fresh proof and preserves identity and private work', async ({
  page,
}) => {
  const installation = await createInstallation();
  const originalNow = Date.now;
  const { origin } = installation;
  try {
    await signIn(page.request, origin);
    const { household } = await (await createHousehold(page.request, origin)).json();
    const before = await (await page.request.get(`${origin}/api/bootstrap`)).json();
    const mapPath = `${origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(mapPath)).json();
    const initial = await read();
    expect(
      (
        await page.request.post(`${mapPath}/draft`, {
          headers: { origin },
          data: {
            version: initial.draft.version,
            id: 'expiry-private',
            baseRevision: null,
            value: {
              typeId: initial.types.find((type) => type.name === 'Fordon')?.id,
              name: 'Cykeln',
              description: 'Privat förslag före utgången verifiering',
            },
          },
        })
      ).status(),
    ).toBe(200);
    const privateMap = await read();
    await page.goto(`${origin}/login-methods`);
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toBeVisible();
    expect(await (await page.request.get(`${origin}/api/login-methods`)).json()).toEqual({
      providers: ['google'],
      stage: 'verified',
    });

    // The real server shares this worker. Keep time progressing; browser time and
    // Playwright's monotonic deadlines are unchanged. Restore before fresh proof.
    Date.now = () => originalNow() + 11 * 60_000;
    const expired = await page.request.post(`${origin}/api/login-methods/add`, {
      headers: { origin },
      data: { provider: 'microsoft' },
    });
    expect(expired.status()).toBe(409);
    expect(await expired.json()).toEqual({ error: 'verification_required' });
    const reloaded = page.waitForResponse(
      (response) =>
        response.url() === `${origin}/api/login-methods` && response.request().method() === 'GET',
    );
    await page.reload();
    const current = await reloaded;
    expect(current.status()).toBe(200);
    expect((await current.json()).providers).toEqual(['google']);
    await expect(page.getByRole('status')).toHaveText(
      'Verifieringen har gått ut. Dina tidigare inloggningar och din tillgång finns kvar. Verifiera på nytt när du vill koppla ett inloggningssätt.',
    );
    await expect(page.getByRole('button', { name: 'Verifiera Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toHaveCount(0);
    await expect(page.getByText('Google – kopplat', { exact: true })).toBeVisible();
    await expect(page.getByText('Microsoft – kopplat', { exact: true })).toHaveCount(0);
    expect(await (await page.request.get(`${origin}/api/bootstrap`)).json()).toEqual(before);
    expect(await read()).toEqual(privateMap);

    Date.now = originalNow;
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    expect(await (await page.request.get(`${origin}/api/login-methods`)).json()).toEqual({
      providers: ['google'],
      stage: 'verified',
    });
    await page.getByRole('link', { name: 'Till startsidan' }).click();
    await expect(page.getByRole('heading', { name: household.name, exact: true })).toBeVisible();
    expect(await (await page.request.get(`${origin}/api/bootstrap`)).json()).toEqual(before);
    expect(await read()).toEqual(privateMap);
  } finally {
    Date.now = originalNow;
    await installation.close();
  }
});

test('ACCESS-20: an expired link on an open page explains fresh proof after the real rejection', async ({
  page,
}) => {
  const installation = await createInstallation();
  const originalNow = Date.now;
  const { origin } = installation;
  try {
    await signIn(page.request, origin);
    const { household } = await (await createHousehold(page.request, origin)).json();
    const before = await (await page.request.get(`${origin}/api/bootstrap`)).json();
    const mapPath = `${origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(mapPath)).json();
    const initial = await read();
    expect(
      (
        await page.request.post(`${mapPath}/draft`, {
          headers: { origin },
          data: {
            version: initial.draft.version,
            id: 'open-expiry-private',
            baseRevision: null,
            value: {
              typeId: initial.types.find((type) => type.name === 'Fordon')?.id,
              name: 'Bilen',
              description: 'Privat förslag medan verifieringen går ut',
            },
          },
        })
      ).status(),
    ).toBe(200);
    const privateMap = await read();
    await page.goto(`${origin}/login-methods`);
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toBeEnabled();
    expect(await (await page.request.get(`${origin}/api/login-methods`)).json()).toEqual({
      providers: ['google'],
      stage: 'verified',
    });

    // Advance only the real server worker clock while this verified page stays open.
    // Restore before fresh proof and in finally; browser time/deadlines stay unchanged.
    Date.now = () => originalNow() + 11 * 60_000;
    const addition = page.waitForResponse(
      (response) =>
        response.url() === `${origin}/api/login-methods/add` &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Koppla Microsoft' }).click();
    const rejected = await addition;
    expect(rejected.status()).toBe(409);
    expect(await rejected.json()).toEqual({ error: 'verification_required' });
    await expect(page.getByRole('status')).toHaveText(
      'Verifieringen har gått ut. Dina tidigare inloggningar och din tillgång finns kvar. Verifiera på nytt när du vill koppla ett inloggningssätt.',
    );
    await expect(page.getByRole('button', { name: 'Verifiera Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page).toHaveURL(`${origin}/login-methods`);
    expect(await (await page.request.get(`${origin}/api/login-methods`)).json()).toEqual({
      providers: ['google'],
      stage: 'expired',
    });
    expect(await (await page.request.get(`${origin}/api/bootstrap`)).json()).toEqual(before);
    expect(await read()).toEqual(privateMap);

    Date.now = originalNow;
    await page.getByRole('button', { name: 'Verifiera Google' }).click();
    await expect(page.getByRole('button', { name: 'Koppla Microsoft' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(await (await page.request.get(`${origin}/api/login-methods`)).json()).toEqual({
      providers: ['google'],
      stage: 'verified',
    });
    await page.getByRole('link', { name: 'Till startsidan' }).click();
    await expect(page.getByRole('heading', { name: household.name, exact: true })).toBeVisible();
    expect(await (await page.request.get(`${origin}/api/bootstrap`)).json()).toEqual(before);
    expect(await read()).toEqual(privateMap);
  } finally {
    Date.now = originalNow;
    await installation.close();
  }
});
