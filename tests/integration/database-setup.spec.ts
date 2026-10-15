import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, request, test } from '@playwright/test';
import Database from 'better-sqlite3';
import {
  createHousehold,
  openDraftReview,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
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
      SKYTTEL_AUTHORITY_GENERATION: '11111111-1111-4111-8111-111111111111',
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
  const caseId = provider === 'google' ? 'DEMO-01' : 'DEMO-02';
  test(`${caseId}: database setup gives only the configured ${provider} administrator a ready TestHousehold`, async ({
    page,
  }) => {
    const request = page.request;
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
      const otherLabel = provider === 'google' ? 'Microsoft' : 'Google';
      const adminLabel = provider === 'google' ? 'Google' : 'Microsoft';
      await page.goto(installation.origin);
      await page.getByRole('button', { name: `Fortsätt med ${otherLabel}` }).click();
      const otherSignIn = page.waitForResponse(
        (response) =>
          response.url() === `${installation.origin}/api/auth/sign-in/social` &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: `Fortsätt till ${otherLabel}` }).click();
      expect((await otherSignIn).status()).toBe(200);
      await expect(
        page.getByRole('heading', { name: 'Du har inte tillgång till hushållet' }),
      ).toBeVisible();
      expect(
        await (await request.get(`${installation.origin}/api/bootstrap`)).json(),
      ).toMatchObject({
        status: 'forbidden',
      });
      await page.getByRole('button', { name: 'Logga ut' }).click();
      await page.getByRole('button', { name: `Fortsätt med ${adminLabel}` }).click();
      const adminSignIn = page.waitForResponse(
        (response) =>
          response.url() === `${installation.origin}/api/auth/sign-in/social` &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: `Fortsätt till ${adminLabel}` }).click();
      expect((await adminSignIn).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'TestHousehold', exact: true })).toBeVisible();
      const { status, household } = await (
        await request.get(`${installation.origin}/api/bootstrap`)
      ).json();
      expect(status).toBe('ready');
      expect(household).toMatchObject({ name: 'TestHousehold', role: 'administrator' });
      const map = await (
        await request.get(`${installation.origin}/api/households/${household.id}/map`)
      ).json();
      expect(map.objects.map((object: { name: string }) => object.name).sort()).toEqual(
        [
          'Alex Exempel',
          'Alex blå cykel',
          'Familjens Molnmusik',
          'Familjens musikkonto',
          'Familjens musikkort',
          'Familjens garage',
          'Föreningens musikkonto',
          'Hushållets betalkonto',
          'Kim Exempel',
          'Kortets kontokoppling',
          'Lindens musikförening',
          'Lo Berg',
          'Molnmusik',
          'Molnmusik AB',
          'familjen@example.test',
          'musik@example.test',
        ].sort(),
      );
      expect(map.relationships).toHaveLength(23);
      const bicycle = map.objects.find(
        (object: { name: string }) => object.name === 'Alex blå cykel',
      );
      expect(bicycle).toMatchObject({
        iconId: 'bike',
        lifecycle: 'active',
        customValues: {
          'demo-frame': 'Blå',
          'demo-wheels': 0,
          'demo-check': '2026-04-03',
          'demo-electric': false,
          'demo-label': 'Syntetisk ram: DEMO-CYKEL',
        },
        financialFacts: { price: { knowledge: 'known', value: '4995' } },
      });
      expect(map.draft.relationships).toHaveLength(1);
      expect(map.draft.relationships[0].before.id).toBe(map.draft.relationships[0].id);
      expect(map.draft.relationships[0].after.sourceId).toBe(
        map.draft.relationships[0].before.sourceId,
      );
      expect(map.draft.relationships[0].after.targetId).not.toBe(
        map.draft.relationships[0].before.targetId,
      );
      expect(map.draft.changes).toEqual([
        expect.objectContaining({
          before: expect.objectContaining({ name: 'Lo Exempel' }),
          after: expect.objectContaining({ name: 'Lo Lind' }),
        }),
      ]);
      const savedLo = map.objects.find((object: { name: string }) => object.name === 'Lo Berg');
      expect(savedLo.revision).toBeGreaterThan(map.draft.changes[0].before.revision);
      expect(savedLo.description).toBe('Spelar piano i musikföreningen.');
      expect(map.draft.relationships[0].objectNames).toEqual(
        expect.objectContaining({
          [map.draft.relationships[0].before.targetId]: 'familjen@example.test',
          [map.draft.relationships[0].after.targetId]: 'musik@example.test',
        }),
      );
      const { history } = await (
        await request.get(`${installation.origin}/api/households/${household.id}/map/history`)
      ).json();
      expect(history).toHaveLength(2);
      expect(history[1].userId).not.toBe(history[0].userId);
      expect(history[1].userId).toBe(map.userId);
      expect(history[0].userId).not.toBe(map.userId);
      expect(history[0].changes[0]).toMatchObject({
        before: { name: 'Lo Exempel' },
        after: { name: 'Lo Berg' },
      });
      await page.goto(installation.origin);
      await openTable(page);
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      await table.getByRole('button', { name: 'Alex blå cykel', exact: true }).click();
      const details = table.getByRole('row').filter({ hasText: 'Dold rammärkning' });
      await expect(details).toContainText('En påhittad cykel som förvaras i garaget.');
      await expect(details.getByText('Ikon', { exact: true }).locator('..')).toContainText('Cykel');
      await expect(details.getByText('Status', { exact: true }).locator('..')).toContainText(
        'Gäller fortfarande',
      );
      await expect(details).toContainText('Ramfärg');
      await expect(details).toContainText('Blå');
      await expect(details).toContainText('Kontrolldatum');
      await expect(details).toContainText('2026-04-03');
      await expect(details).toContainText('Syntetisk ram: DEMO-CYKEL');
      await expect(details).toContainText('Extrahjul');
      await expect(details).toContainText('0');
      await expect(details).toContainText('Elcykel');
      await expect(details).toContainText('Nej');
      await expect(details).toContainText('4995');
      await table.getByRole('button', { name: 'Samband för Alex Exempel', exact: true }).click();
      let dialog = page.getByRole('dialog', { name: 'Samband för Alex Exempel', exact: true });
      await dialog.getByRole('button', { name: 'Alex blå cykel', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Uppgifter för Alex blå cykel', exact: true });
      await expect(dialog).toContainText('Syntetisk ram: DEMO-CYKEL');
      await dialog.getByRole('button', { name: 'Samband för Alex blå cykel', exact: true }).click();
      dialog = page.getByRole('dialog', { name: 'Samband för Alex blå cykel', exact: true });
      await dialog.getByRole('button', { name: 'Familjens garage', exact: true }).click();
      await expect(
        page.getByRole('dialog', { name: 'Uppgifter för Familjens garage', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      await expect(
        conflict.getByRole('region', { name: 'Sparat i kartan nu', exact: true }),
      ).toContainText('Lo Berg');
      await expect(
        conflict.getByRole('region', { name: 'Ditt förslag', exact: true }),
      ).toContainText('Lo Lind');
      await page.keyboard.press('Escape');
      const draft = await openDraftReview(page);
      await expect(draft).toContainText('Lo Lind');
      await expect(draft).toContainText('musik@example.test');
      await (await utilityButton(page, 'Rapporter')).click();
      const report = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
      await expect(report).toContainText('Robin Demo');
      await expect(report).toContainText('Development administrator');
      const preserved = await (
        await request.get(`${installation.origin}/api/households/${household.id}/map`)
      ).json();
      expect(preserved).toEqual(map);
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
      expect(
        await (
          await request.get(`${installation.origin}/api/households/${household.id}/map`)
        ).json(),
      ).toEqual(map);
      await page.reload();
      await openTable(page);
      await expect(page.getByRole('button', { name: 'Alex blå cykel', exact: true })).toBeVisible();
      const restoredDraft = await openDraftReview(page);
      await expect(restoredDraft).toContainText('Lo Lind');
      await expect(restoredDraft).toContainText('musik@example.test');
    } finally {
      await installation.close();
    }
  });
}

test('repeated setup clears households, members, invitations, sessions and future fixture tables', {
  tag: '@technical',
}, async () => {
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
        // The reset removes each server binding. Each actor explicitly confirms
        // its own local reset before a new provider action; no silent retry.
        expect(
          (
            await client.post(`${origin}/api/browser-binding/candidate`, {
              headers,
              data: {},
            })
          ).status(),
        ).toBe(409);
        expect(
          (
            await client.post(`${origin}/api/browser-binding/reset-check`, {
              headers,
              data: {},
            })
          ).status(),
        ).toBe(200);
        await client.clearCookies({ name: 'skyttel_binding' });
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

test('setup rejects unsafe or incomplete configuration before touching existing data', {
  tag: '@technical',
}, async ({ request }) => {
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

test('a failed seed rolls back the reset and keeps existing sessions usable', {
  tag: '@technical',
}, async ({ request }) => {
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
