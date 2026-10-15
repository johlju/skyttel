import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { openDatabase } from '../../../src/server/database.js';
import { adoptLegacyInstallationAuthority } from '../../../src/server/legacy-login-upgrade.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

const generation = '22222222-2222-4222-8222-222222222222';
let directory: string;
let old: Awaited<ReturnType<typeof createInstallation>> | undefined;
let current: Awaited<ReturnType<typeof createInstallation>> | undefined;
const clients: APIRequestContext[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.dispose();
  await old?.close();
  await current?.close();
  old = undefined;
  current = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
});

test.each([false, true])(
  'controlled upgrade ends both legacy devices and a pending callback while retaining identity, draft and save receipt across restart (obsolete binding: %s)',
  async (obsoleteBinding) => {
    directory = await mkdtemp(join(tmpdir(), 'skyttel-login-upgrade-'));
    const migrationsDirectory = join(directory, 'old-migrations');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(migrationsDirectory);
    for (const file of (await readdir('migrations')).filter(
      (name) => name <= '026_theme_preferences.sql',
    ))
      await copyFile(join('migrations', file), join(migrationsDirectory, file));
    const databasePath = join(directory, 'skyttel.db');
    old = await createInstallation(undefined, {
      databasePath,
      migrationsDirectory,
      legacyAuthCallbacks: true,
    });
    const first = await request.newContext();
    const second = await request.newContext();
    clients.push(first, second);
    await signIn(first, old.origin);
    await signIn(second, old.origin);
    const { user } = await (await first.get(`${old.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(first, old.origin)).json();
    const path = `/api/households/${household.id}/map`;
    const map = await (await first.get(`${old.origin}${path}`)).json();
    const headers = { origin: old.origin };
    const value = { typeId: map.types[0].id, name: 'Bevarat', description: '' };
    expect(
      (
        await first.post(`${old.origin}${path}/draft`, {
          headers,
          data: { version: 0, id: 'saved', baseRevision: null, value },
        })
      ).status(),
    ).toBe(200);
    const saved = await first.post(`${old.origin}${path}/save`, {
      headers,
      data: { version: 1, operationId: 'before-upgrade' },
    });
    expect(saved.status()).toBe(200);
    const receipt = await saved.json();
    expect(
      (
        await first.post(`${old.origin}${path}/draft`, {
          headers,
          data: {
            version: 2,
            id: 'draft',
            baseRevision: null,
            value: { ...value, name: 'Utkast' },
          },
        })
      ).status(),
    ).toBe(200);
    const before = await (await first.get(`${old.origin}${path}`)).json();
    const pending = await second.post(`${old.origin}/api/auth/sign-in/social`, {
      headers,
      data: { provider: 'microsoft', callbackURL: '/' },
    });
    const callback = new URL((await pending.json()).url);
    const originalOrigin = old.origin;
    await old.close();
    old = undefined;

    const legacy = openDatabase(databasePath, { migrationsDirectory });
    try {
      // Existing, previously linked identities are durable fixture content;
      // their provider credentials must not become a reason to delete links.
      legacy
        .prepare(`INSERT INTO account (id,accountId,providerId,userId,
        accessToken,refreshToken,createdAt,updatedAt)
        SELECT 'linked-microsoft',accountId,'microsoft',userId,
        'old-provider-access','old-provider-refresh',createdAt,updatedAt
        FROM account WHERE providerId = 'google'`)
        .run();
    } finally {
      legacy.close();
    }
    if (obsoleteBinding) {
      // Persist the intermediate pre-choice schema too: existing devices can
      // already have a binding cookie while their session lacks choice metadata.
      await copyFile(
        'migrations/027_browser_binding.sql',
        join(migrationsDirectory, '027_browser_binding.sql'),
      );
      const intermediate = openDatabase(databasePath, { migrationsDirectory });
      const candidate = 'a'.repeat(64);
      try {
        const session = intermediate
          .prepare('SELECT id FROM session ORDER BY id LIMIT 1')
          .get() as { id: string };
        intermediate
          .prepare(`INSERT INTO browser_binding (id,confirmed,revision,sessionId,expiresAt)
        VALUES (?,1,0,?,?)`)
          .run(
            createHash('sha256').update(candidate).digest('hex'),
            session.id,
            Date.now() + 600_000,
          );
      } finally {
        intermediate.close();
      }
      await first.addCookies([{ name: 'skyttel_binding', value: candidate, url: originalOrigin }]);
    }
    const database = openDatabase(databasePath);
    try {
      adoptLegacyInstallationAuthority(database, generation);
    } finally {
      database.close();
    }
    current = await createInstallation(undefined, {
      databasePath,
      authorityFence: { generation },
    });
    for (const client of [first, second]) {
      expect((await client.get(`${current.origin}${path}`)).status()).toBe(401);
      expect(await (await client.get(`${current.origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'anonymous',
      });
    }
    // A callback keeps the original state and cookie. Only its origin changes
    // because this disposable installation receives a new listening port.
    const late = callback.href.replace(originalOrigin, current.origin);
    expect((await second.get(late, { maxRedirects: 0 })).status()).toBe(302);
    expect((await second.get(`${current.origin}${path}`)).status()).toBe(401);
    // Keep the actual old jar. The generic HTTP fixture signIn helper clears
    // cookies when its port changes, which would hide this upgrade boundary.
    const candidatePath = `${current.origin}/api/browser-binding/candidate`;
    const currentHeaders = { origin: current.origin };
    if (obsoleteBinding) {
      const rejected = await first.post(candidatePath, { headers: currentHeaders, data: {} });
      expect(rejected.status()).toBe(409);
      expect(await rejected.json()).toMatchObject({ error: 'binding_invalid', canReset: true });
      expect((await first.get(`${current.origin}${path}`)).status()).toBe(401);
      // Simulate the separately tested, explicit reset action. No provider
      // request is retried automatically and no authentication cookie changes.
      const permitted = await first.post(`${current.origin}/api/browser-binding/reset-check`, {
        headers: currentHeaders,
        data: {},
      });
      expect(permitted.status()).toBe(200);
      expect(await permitted.json()).toEqual({ status: 'reset_allowed' });
      await first.clearCookies({ name: 'skyttel_binding' });
    }
    const candidate = await first.post(candidatePath, { headers: currentHeaders, data: {} });
    expect(candidate.status()).toBe(200);
    const binding = await candidate.json();
    await first.addCookies([
      { name: binding.cookieName, value: binding.candidate, url: current.origin },
    ]);
    expect(
      (
        await first.post(`${current.origin}/api/browser-binding/register`, {
          headers: currentHeaders,
          data: {},
        })
      ).status(),
    ).toBe(200);
    const started = await first.post(`${current.origin}/api/auth/sign-in/social`, {
      headers: currentHeaders,
      data: { provider: 'google', callbackURL: '/', rememberMe: false, informationVersion: 1 },
    });
    expect(started.status()).toBe(200);
    await first.get((await started.json()).url);
    expect(await (await first.get(`${current.origin}/api/bootstrap`)).json()).toMatchObject({
      user,
    });
    expect(await (await first.get(`${current.origin}${path}`)).json()).toEqual(before);
    expect(
      await (
        await first.post(`${current.origin}${path}/save`, {
          headers: { origin: current.origin },
          data: { version: 1, operationId: 'before-upgrade' },
        })
      ).json(),
    ).toEqual(receipt);
    await current.restart();
    expect((await second.get(`${current.origin}${path}`)).status()).toBe(401);
    expect(await (await first.get(`${current.origin}${path}`)).json()).toEqual(before);
    const cookies = (await first.storageState()).cookies;
    expect(cookies.find((cookie) => cookie.name.endsWith('session_token'))?.expires).toBe(-1);
    expect(await (await first.get(`${current.origin}/api/login-methods`)).json()).toEqual({
      providers: ['google', 'microsoft'],
      stage: null,
    });
    await signIn(second, current.origin, 'microsoft');
    expect(await (await second.get(`${current.origin}/api/bootstrap`)).json()).toMatchObject({
      user,
    });
    expect(await (await second.get(`${current.origin}${path}`)).json()).toEqual(before);
  },
);
