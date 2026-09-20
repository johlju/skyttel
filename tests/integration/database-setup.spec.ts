import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, request, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHousehold, signIn } from '../support/client.js';
import { alex, createInstallation, robin } from '../support/installation.js';

async function setupDatabase(
  installation: Awaited<ReturnType<typeof createInstallation>>,
  firstAdmin = { provider: 'google', subject: alex.subject },
  overrides: NodeJS.ProcessEnv = {},
) {
  const environmentFile = join(installation.directory, '.env');
  await writeFile(
    environmentFile,
    Object.entries({
      SKYTTEL_ORIGIN: installation.origin,
      SKYTTEL_DATABASE_PATH: join(installation.directory, 'skyttel.db'),
      SKYTTEL_FIRST_ADMIN_PROVIDER: firstAdmin.provider,
      SKYTTEL_FIRST_ADMIN_SUBJECT: firstAdmin.subject,
      BETTER_AUTH_SECRET: 'synthetic-test-secret-with-at-least-32-characters',
      GOOGLE_CLIENT_ID: 'fake-google',
      GOOGLE_CLIENT_SECRET: 'fake-secret',
      MICROSOFT_CLIENT_ID: 'fake-microsoft',
      MICROSOFT_CLIENT_SECRET: 'fake-secret',
    })
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  const child = spawn('npm', ['run', 'db:setup'], {
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      SKYTTEL_DEV_ENV_FILE: environmentFile,
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  const [code] = await once(child, 'close');
  return { code, output };
}

for (const provider of ['google', 'microsoft'] as const) {
  test(`database setup gives only the configured ${provider} administrator a ready TestHousehold`, async ({
    request,
  }) => {
    const firstAdmin = { provider, subject: alex.subject };
    const installation = await createInstallation(firstAdmin);
    try {
      const setup = await setupDatabase(installation, firstAdmin);
      expect(setup.code, setup.output).toBe(0);
      expect(
        await (await request.get(`${installation.origin}/api/bootstrap`)).json(),
      ).toMatchObject({
        status: 'anonymous',
      });
      await signIn(request, installation.origin, provider === 'google' ? 'microsoft' : 'google');
      expect(
        await (await request.get(`${installation.origin}/api/bootstrap`)).json(),
      ).toMatchObject({
        status: 'forbidden',
      });
      await signIn(request, installation.origin, provider);
      const { status, household } = await (
        await request.get(`${installation.origin}/api/bootstrap`)
      ).json();
      expect(status).toBe('ready');
      expect(household).toMatchObject({ name: 'TestHousehold', role: 'administrator' });
      const map = await (
        await request.get(`${installation.origin}/api/households/${household.id}/map`)
      ).json();
      expect(map.objects).toEqual([expect.objectContaining({ name: 'Lo Exempel' })]);
      expect(map.draft.changes).toEqual([
        expect.objectContaining({
          before: expect.objectContaining({ name: 'Lo Exempel' }),
          after: expect.objectContaining({ name: 'Lo Lind' }),
        }),
      ]);
      expect(
        (
          await request.get(`${installation.origin}/api/households/${household.id}/administration`)
        ).status(),
      ).toBe(200);
      await installation.restart();
      expect(
        await (await request.get(`${installation.origin}/api/bootstrap`)).json(),
      ).toMatchObject({
        status: 'ready',
        household,
      });
    } finally {
      await installation.close();
    }
  });
}

test('repeated setup clears households, members, invitations, sessions and future fixture tables', async () => {
  const installation = await createInstallation();
  const administrator = await request.newContext();
  const recipient = await request.newContext();
  const { origin } = installation;
  const headers = { origin };
  try {
    await signIn(administrator, origin);
    const { household } = await (await createHousehold(administrator, origin)).json();
    installation.setIdentity(robin);
    await signIn(recipient, origin, 'microsoft');
    const { user } = await (await recipient.get(`${origin}/api/bootstrap`)).json();
    const invitation = await administrator.post(
      `${origin}/api/households/${household.id}/invitations`,
      {
        headers,
        data: { userId: user.id },
      },
    );
    expect(invitation.status()).toBe(201);
    const { code } = await invitation.json();
    expect(
      (
        await recipient.post(`${origin}/api/invitations/accept`, { headers, data: { code } })
      ).status(),
    ).toBe(200);

    const database = new Database(join(installation.directory, 'skyttel.db'));
    try {
      database.exec(`CREATE TABLE demo_extension (
        householdId TEXT NOT NULL REFERENCES household(id) ON DELETE RESTRICT
      )`);
      database.prepare('INSERT INTO demo_extension VALUES (?)').run(household.id);
    } finally {
      database.close();
    }

    for (let run = 0; run < 2; run += 1) {
      const setup = await setupDatabase(installation);
      expect(setup.code, setup.output).toBe(0);
      for (const client of [administrator, recipient]) {
        expect(await (await client.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
          status: 'anonymous',
        });
      }
      installation.setIdentity(alex);
      await signIn(administrator, origin);
      const state = await (await administrator.get(`${origin}/api/bootstrap`)).json();
      expect(state).toMatchObject({
        status: 'ready',
        household: { name: 'TestHousehold', role: 'administrator' },
      });
      expect((await administrator.get(`${origin}/api/households/${household.id}`)).status()).toBe(
        403,
      );
      const administration = await (
        await administrator.get(`${origin}/api/households/${state.household.id}/administration`)
      ).json();
      expect(administration.members).toEqual([
        expect.objectContaining({ userId: state.user.id, role: 'administrator' }),
      ]);
      expect(administration.invitations).toEqual([]);
      installation.setIdentity(robin);
      await signIn(recipient, origin, 'microsoft');
      expect(await (await recipient.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
        status: 'forbidden',
      });
      expect(
        (
          await recipient.post(`${origin}/api/invitations/accept`, { headers, data: { code } })
        ).status(),
      ).toBe(409);
    }
  } finally {
    await Promise.all([administrator.dispose(), recipient.dispose()]);
    await installation.close();
  }
});

test('setup rejects unsafe or incomplete configuration before touching existing data', async ({
  request,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(request, installation.origin);
    const { household } = await (await createHousehold(request, installation.origin)).json();
    const cases: [NodeJS.ProcessEnv, string][] = [
      [{ NODE_ENV: 'production' }, 'cannot run with NODE_ENV=production'],
      [{ SKYTTEL_FIRST_ADMIN_SUBJECT: '' }, 'SKYTTEL_FIRST_ADMIN_SUBJECT'],
      [
        { SKYTTEL_FIRST_ADMIN_SUBJECT: 'synthetic-first-administrator' },
        'SKYTTEL_FIRST_ADMIN_SUBJECT',
      ],
      [
        { SKYTTEL_DEV_ENV_FILE: join(installation.directory, 'missing.env') },
        'configuration could not be loaded',
      ],
    ];
    for (const [overrides, diagnostic] of cases) {
      const setup = await setupDatabase(installation, undefined, overrides);
      expect(setup.code, setup.output).toBe(1);
      expect(setup.output).toContain(diagnostic);
      expect(
        await (await request.get(`${installation.origin}/api/bootstrap`)).json(),
      ).toMatchObject({
        status: 'ready',
        household,
      });
    }
  } finally {
    await installation.close();
  }
});

test('a failed seed rolls back the reset and keeps existing sessions usable', async ({
  request,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(request, installation.origin);
    const { household } = await (await createHousehold(request, installation.origin)).json();
    const database = new Database(join(installation.directory, 'skyttel.db'));
    try {
      database.exec(`CREATE TRIGGER reject_demo_fixture BEFORE INSERT ON user BEGIN
        SELECT RAISE(ABORT, 'synthetic-private-seed-error');
      END`);
    } finally {
      database.close();
    }
    const setup = await setupDatabase(installation);
    expect(setup.code, setup.output).toBe(1);
    expect(setup.output).toContain('Database setup failed');
    expect(setup.output).not.toContain('synthetic-private-seed-error');
    expect(await (await request.get(`${installation.origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'ready',
      household,
    });
    expect(
      (
        await request.get(`${installation.origin}/api/households/${household.id}/administration`)
      ).status(),
    ).toBe(200);
  } finally {
    await installation.close();
  }
});
