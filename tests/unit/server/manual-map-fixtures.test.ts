import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

const execute = promisify(execFile);
test('the manual legacy fixture upgrades verified ownership, custom definitions and its private draft through the running app', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-manual-map-'));
  const source = await createInstallation();
  const browser = await request.newContext();
  let upgraded: Awaited<ReturnType<typeof createInstallation>> | undefined;
  try {
    await signIn(browser, source.origin);
    await createHousehold(browser, source.origin);
    const { user } = await (await browser.get(`${source.origin}/api/bootstrap`)).json();
    await source.saveDatabase(join(directory, 'verified.sqlite'));
    await execute(process.execPath, [
      '--import',
      'tsx',
      'scripts/prepare-manual-map.ts',
      'legacy-contracts',
      directory,
      user.id,
    ]);
    upgraded = await createInstallation(undefined, {
      databasePath: join(directory, 'legacy.sqlite'),
    });
    expect((await (await browser.get(`${upgraded.origin}/api/bootstrap`)).json()).status).toBe(
      'anonymous',
    );
    await signIn(browser, upgraded.origin);
    const bootstrap = await (await browser.get(`${upgraded.origin}/api/bootstrap`)).json();
    expect(bootstrap.user.id).toBe(user.id);
    const path = `${upgraded.origin}/api/households/manual-legacy-household/map`;
    const state = await (await browser.get(path)).json();
    expect(state.types.filter((item: { name: string }) => item.name === 'Bostad')).toMatchObject([
      {
        id: 'household-home-type',
        revision: 7,
        description: 'Hushållets egen beskrivning av bostad',
      },
    ]);
    expect(
      state.relationshipTypes.filter((item: { name: string }) => item.name === 'Hyresvärd'),
    ).toMatchObject([
      {
        id: 'household-landlord-role',
        revision: 4,
        description: 'Hushållets egen beskrivning av hyresvärd',
      },
    ]);
    expect(state.types.map((item: { name: string }) => item.name)).toContain('Hyresavtal');
    expect(state.objects).toMatchObject([{ id: 'home-before-upgrade', name: 'Björkbacken' }]);
    expect(state.draft.changes).toMatchObject([{ after: { name: 'Björkbacken hemma' } }]);
    expect(
      (
        await browser.post(`${path}/save`, {
          headers: { origin: upgraded.origin },
          data: {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            operationId: 'manual-upgrade',
          },
        })
      ).status(),
    ).toBe(200);
    await upgraded.restart();
    expect((await (await browser.get(path)).json()).objects[0].name).toBe('Björkbacken hemma');
    expect((await (await browser.get(`${path}/history`)).json()).history[0].userId).toBe(user.id);
    await expect(
      execute(process.execPath, [
        '--import',
        'tsx',
        'scripts/prepare-manual-map.ts',
        'legacy-contracts',
        directory,
        user.id,
      ]),
    ).rejects.toThrow();
  } finally {
    await browser.dispose();
    await upgraded?.close();
    await source.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('the second-household manual fixture uses an existing verified login without granting access to Linden', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-manual-map-'));
  const source = await createInstallation();
  const alex = await request.newContext();
  const member = await request.newContext();
  let prepared: Awaited<ReturnType<typeof createInstallation>> | undefined;
  try {
    await signIn(alex, source.origin);
    const { household } = await (await createHousehold(alex, source.origin)).json();
    source.setIdentity(robin);
    await signIn(member, source.origin, 'microsoft');
    const { user } = await (await member.get(`${source.origin}/api/bootstrap`)).json();
    await source.saveDatabase(join(directory, 'verified.sqlite'));
    await execute(process.execPath, [
      '--import',
      'tsx',
      'scripts/prepare-manual-map.ts',
      'second-household',
      directory,
      user.id,
    ]);
    prepared = await createInstallation(undefined, {
      databasePath: join(directory, 'verified.sqlite'),
    });
    prepared.setIdentity(robin);
    await signIn(member, prepared.origin, 'microsoft');
    const bootstrap = await (await member.get(`${prepared.origin}/api/bootstrap`)).json();
    expect(bootstrap.household).toMatchObject({ id: 'manual-other-household', name: 'Eken' });
    expect(
      (
        await member.get(`${prepared.origin}/api/households/manual-other-household/map/view`)
      ).status(),
    ).toBe(200);
    const path = `${prepared.origin}/api/households/${household.id}/map/view`;
    expect((await member.get(path)).status()).toBe(403);
    for (const suffix of ['position', 'settings'])
      expect(
        (
          await member.post(`${path}/${suffix}`, {
            headers: { origin: prepared.origin },
            data: {},
          })
        ).status(),
      ).toBe(403);
    await expect(
      execute(process.execPath, [
        '--import',
        'tsx',
        'scripts/prepare-manual-map.ts',
        'second-household',
        directory,
        'unverified',
      ]),
    ).rejects.toThrow();
  } finally {
    await alex.dispose();
    await member.dispose();
    await prepared?.close();
    await source.close();
    await rm(directory, { recursive: true, force: true });
  }
});
