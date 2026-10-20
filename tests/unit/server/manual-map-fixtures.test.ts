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
