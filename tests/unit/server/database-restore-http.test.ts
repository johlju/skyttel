import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>> | undefined;
let browser: APIRequestContext | undefined;
afterEach(async () => {
  await browser?.dispose();
  await installation?.close();
});

test('a confirmed restore never initializes malformed or ambiguous binding cookies', async () => {
  installation = await createInstallation();
  const backup = join(installation.directory, 'empty-before-restore.sqlite');
  await installation.saveDatabase(backup);
  await installation.restoreDatabase(backup, {
    generation: '22222222-2222-4222-8222-222222222222',
    restore: {
      fromGeneration: '11111111-1111-4111-8111-111111111111',
      confirmedAt: Date.now(),
      erasureReviewed: true,
    },
  });
  for (const cookie of [
    'skyttel_binding=invalid',
    'skyttel_binding=invalid; skyttel_binding=another',
  ]) {
    for (const action of ['candidate', 'reset-check']) {
      const response = await fetch(`${installation.origin}/api/browser-binding/${action}`, {
        method: 'POST',
        headers: { origin: installation.origin, 'content-type': 'application/json', cookie },
        body: '{}',
      });
      expect(response.status).toBe(409);
    }
  }
});

test('an explicitly cleared real pre-fence SQLite copy rolls forward without restoring old login authority', async () => {
  const migrations = mkdtempSync(join(tmpdir(), 'skyttel-pre-fence-'));
  try {
    for (const name of readdirSync('migrations').filter(
      (name) => name.endsWith('.sql') && name < '032',
    ))
      copyFileSync(join('migrations', name), join(migrations, name));
    installation = await createInstallation(undefined, { migrationsDirectory: migrations });
    browser = await request.newContext();
    const { origin } = installation;
    await signIn(browser, origin);
    await createHousehold(browser, origin, 'Bevarat äldre hushåll');
    const before = await (await browser.get(`${origin}/api/bootstrap`)).json();
    const start = await browser.post(`${origin}/api/auth/sign-in/social`, {
      headers: { origin },
      data: { provider: 'google', callbackURL: '/' },
    });
    const lateCallback = (await start.json()).url;
    const backup = join(installation.directory, 'pre-fence.sqlite');
    await installation.saveDatabase(backup);
    for (const name of readdirSync('migrations').filter((name) => name.endsWith('.sql')))
      copyFileSync(join('migrations', name), join(migrations, name));
    await installation.restoreDatabase(backup, {
      generation: '22222222-2222-4222-8222-222222222222',
      restore: { fromGeneration: 'legacy', confirmedAt: Date.now(), erasureReviewed: true },
    });
    for (const restart of [false, true]) {
      if (restart) await installation.restart();
      expect(await (await browser.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
        restored: true,
      });
      expect((await browser.get(lateCallback, { maxRedirects: 0 })).headers().location).toContain(
        'error=',
      );
    }
    expect(
      (
        await browser.post(`${origin}/api/browser-binding/reset-check`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    await browser.clearCookies({ name: 'skyttel_binding' });
    await signIn(browser, origin);
    expect(await (await browser.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'ready',
      user: before.user,
      household: before.household,
    });
    expect(
      await (
        await browser.get(`${origin}/api/browser-binding/preference`, { headers: { origin } })
      ).json(),
    ).toMatchObject({ remembered: false });
    expect(
      (
        await browser.get(
          `${origin}/api/browser-binding/results/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?generation=legacy`,
          { headers: { origin } },
        )
      ).status(),
    ).toBe(404);
  } finally {
    rmSync(migrations, { recursive: true, force: true });
  }
});

test('a real older SQLite restore rejects every old browser and assistant authority before fresh sign-in', async () => {
  installation = await createInstallation();
  browser = await request.newContext();
  const { origin } = installation;
  await signIn(browser, origin);
  const { household } = await (await createHousehold(browser, origin)).json();
  const before = await (await browser.get(`${origin}/api/bootstrap`)).json();
  const mapPath = `${origin}/api/households/${household.id}/map`;
  const map = await (await browser.get(mapPath)).json();
  expect(
    (
      await browser.post(`${mapPath}/draft`, {
        headers: { origin },
        data: {
          version: map.draft.version,
          id: 'restore-private-draft',
          baseRevision: null,
          value: {
            typeId: map.types[0].id,
            name: 'Bevarat utkast',

            properties: [
              { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Påhittad uppgift' },
            ],
          },
        },
      })
    ).status(),
  ).toBe(200);

  const pendingCode = await beginAssistant(browser, origin);
  const acceptedCode = await pendingCode.consent(household.id);
  const unusedCallback = (await acceptedCode.json()).url;
  const connected = await beginAssistant(browser, origin);
  const accepted = await connected.consent(household.id);
  const tokens = await (await connected.exchange((await accepted.json()).url)).json();
  expect(tokens.access_token.split('.')).toHaveLength(3);
  expect((await callAssistant(origin, tokens.access_token, 'read_map')).status).toBe(200);
  const oldKeys = await (await fetch(`${origin}/api/auth/jwks`)).json();
  expect(oldKeys.keys.length).toBeGreaterThan(0);
  const login = await browser.post(`${origin}/api/auth/sign-in/social`, {
    headers: { origin },
    data: { provider: 'google', callbackURL: '/' },
  });
  const lateCallback = (await login.json()).url;
  const oldCookies = (await browser.storageState()).cookies;
  const backup = join(installation.directory, 'older.sqlite');
  await installation.saveDatabase(backup);
  // Changes after the original copy cannot manufacture a new deadline for it.
  await browser.post(`${origin}/api/auth/sign-out`, { headers: { origin }, data: {} });
  const fence = {
    generation: '22222222-2222-4222-8222-222222222222',
    restore: {
      fromGeneration: '11111111-1111-4111-8111-111111111111',
      confirmedAt: Date.now(),
      erasureReviewed: true as const,
    },
  };
  await installation.restoreDatabase(backup, fence);
  const oldBrowser = await request.newContext({
    storageState: { cookies: oldCookies, origins: [] },
  });
  try {
    for (const repeat of [false, true]) {
      if (repeat) await installation.restart();
      expect(await (await oldBrowser.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
      expect((await oldBrowser.get(mapPath)).status()).toBe(401);
      expect((await callAssistant(origin, tokens.access_token, 'read_map')).status).toBe(401);
      expect((await pendingCode.exchange(unusedCallback)).ok).toBe(false);
      expect(
        (
          await fetch(`${origin}/api/auth/oauth2/token`, {
            method: 'POST',
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              client_id: connected.clientId,
              refresh_token: tokens.refresh_token,
              resource: `${origin}/mcp`,
            }),
          })
        ).ok,
      ).toBe(false);
      expect(
        (await oldBrowser.get(lateCallback, { maxRedirects: 0 })).headers().location,
      ).toContain('error=');
    }
    // The rejected unknown binding does not silently recover. This HTTP-only
    // actor explicitly clears its observed old binding before choosing a new
    // provider action; the browser case exercises the confirmed Web Lock flow.
    expect(
      (
        await browser.post(`${origin}/api/browser-binding/reset-check`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    await browser.clearCookies({ name: 'skyttel_binding' });
    await signIn(browser, origin);
    expect(await (await browser.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'ready',
      user: before.user,
      household: before.household,
    });
    expect(
      await (
        await browser.get(`${origin}/api/browser-binding/preference`, { headers: { origin } })
      ).json(),
    ).toMatchObject({ remembered: false });
    expect(JSON.stringify(await (await browser.get(mapPath)).json())).toContain('Bevarat utkast');
    // A newly valid session or another browser's recorded binding is never
    // eligible for this local reset, including after a confirmed restore.
    expect(
      (
        await browser.post(`${origin}/api/browser-binding/reset-check`, {
          headers: { origin },
          data: {},
        })
      ).status(),
    ).toBe(409);
    const freshCookies = (await browser.storageState()).cookies;
    const bindingOnly = await request.newContext({
      storageState: {
        cookies: freshCookies.filter((cookie) => cookie.name === 'skyttel_binding'),
        origins: [],
      },
    });
    try {
      expect(
        (
          await bindingOnly.post(`${origin}/api/browser-binding/reset-check`, {
            headers: { origin },
            data: {},
          })
        ).status(),
      ).toBe(409);
      expect((await (await browser.get(`${origin}/api/bootstrap`)).json()).status).toBe('ready');
    } finally {
      await bindingOnly.dispose();
    }
    // Recopying the original file under the fixed independent declaration
    // invalidates old authority again without deriving time from this restart.
    await installation.restoreDatabase(backup, fence);
    expect((await oldBrowser.get(mapPath)).status()).toBe(401);
    expect((await callAssistant(origin, tokens.access_token, 'read_map')).status).toBe(401);
  } finally {
    await oldBrowser.dispose();
  }
});
