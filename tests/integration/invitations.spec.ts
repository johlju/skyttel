import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, request, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { createHousehold, signIn } from '../support/client.js';
import { alex, createInstallation, robin } from '../support/installation.js';

test('upgrading an existing household preserves its membership and enables invitations', async () => {
  const migrationsDirectory = await mkdtemp(join(tmpdir(), 'skyttel-upgrade-'));
  await copyFile('migrations/001_initial.sql', join(migrationsDirectory, '001_initial.sql'));
  const options = { migrationsDirectory, legacyAuthCallbacks: true };
  const installation = await createInstallation(undefined, options);
  const administrator = await request.newContext();
  const recipient = await request.newContext();
  const { origin } = installation;
  const headers = { origin };
  try {
    await signIn(administrator, origin);
    const { user: originalUser } = await (
      await administrator.get(`${origin}/api/bootstrap`)
    ).json();
    // Arrange the old installation's data without running current household
    // creation code against a schema that predates object types.
    installation.seedMembership(
      originalUser.id,
      'legacy-household',
      'Hushållet Linden',
      'administrator',
    );
    const legacy = new Database(join(installation.directory, 'skyttel.db'));
    try {
      legacy.prepare('INSERT INTO installation VALUES (1, ?)').run('legacy-household');
    } finally {
      legacy.close();
    }
    const { household } = await (
      await administrator.get(`${origin}/api/households/legacy-household`)
    ).json();
    await Promise.all(
      (await readdir('migrations'))
        .filter((name) => name.endsWith('.sql') && name > '001_initial.sql')
        .map((name) => copyFile(join('migrations', name), join(migrationsDirectory, name))),
    );
    options.legacyAuthCallbacks = false;
    await installation.restart();
    expect(
      await (
        await administrator.get(`${origin}/api/households/${household.id}`, { maxRetries: 1 })
      ).json(),
    ).toEqual({ household });
    const map = await (
      await administrator.get(`${origin}/api/households/${household.id}/map`)
    ).json();
    expect(map.types.map((type: { name: string }) => type.name).sort()).toEqual(
      [
        'Person',
        'Tjänst',
        'Tjänstekonto',
        'Abonnemang',
        'E-postadress',
        'Bankkonto',
        'Kort',
        'Företag',
        'Förening',
        'Bostad',
        'Garage',
        'Fordon',
        'Avtal',
        'Hyresavtal',
        'Låneavtal',
        'Kreditavtal',
        'Avbetalningsavtal',
        'Försäkringsavtal',
      ].sort(),
    );
    expect(map.relationshipTypes.map((type: { name: string }) => type.name).sort()).toEqual(
      [
        'Tillhör tjänsten',
        'Gäller tjänstekontot',
        'Erbjuder',
        'Inloggningsadress',
        'Kontaktadress',
        'Använder',
        'Står på avtalet',
        'Äger',
        'Betalar',
        'Betalas med',
        'Kontokoppling',
        'Kortfakturan betalas från',
        'Används av',
        'Gäller',
        'Finansierar',
        'Försäkrar',
        'Hyresvärd',
        'Långivare',
      ].sort(),
    );
    expect(map.relationships).toEqual([]);
    expect(map.objects).toEqual([]);
    expect(map.draft).toEqual({ version: 0, changes: [] });
    installation.setIdentity(robin);
    await signIn(recipient, origin, 'microsoft');
    const { user } = await (await recipient.get(`${origin}/api/bootstrap`)).json();
    const invitation = await administrator.post(
      `${origin}/api/households/${household.id}/invitations`,
      { headers, data: { userId: user.id } },
    );
    expect(invitation.status()).toBe(201);
    const { code } = await invitation.json();
    const accepted = await recipient.post(`${origin}/api/invitations/accept`, {
      headers,
      data: { code },
    });
    expect(await accepted.json()).toEqual({ household: { ...household, role: 'member' } });
    const proof = await recipient.post(`${origin}/api/login-methods/prove`, {
      headers,
      data: { provider: 'microsoft' },
    });
    expect(proof.status()).toBe(200);
    await recipient.get((await proof.json()).url);
    expect(await (await recipient.get(`${origin}/api/login-methods`)).json()).toEqual({
      providers: ['microsoft'],
      stage: 'verified',
    });
  } finally {
    await Promise.all([administrator.dispose(), recipient.dispose()]);
    await installation.close();
    await rm(migrationsDirectory, { recursive: true, force: true });
  }
});

test('an invitation admits only its authenticated recipient and remains consumed after restart', async () => {
  const installation = await createInstallation();
  const administrator = await request.newContext();
  const recipient = await request.newContext();
  const impostor = await request.newContext();
  const { origin } = installation;
  const headers = { origin };
  try {
    await signIn(administrator, origin);
    const { household } = await (await createHousehold(administrator, origin)).json();
    installation.setIdentity(robin);
    await signIn(recipient, origin, 'microsoft');
    const { user } = await (await recipient.get(`${origin}/api/bootstrap`)).json();
    const invited = await administrator.post(
      `${origin}/api/households/${household.id}/invitations`,
      {
        headers,
        data: { userId: user.id },
      },
    );
    expect(invited.status()).toBe(201);
    const { invitation, code } = await invited.json();
    expect(invitation).toMatchObject({ userId: user.id, name: robin.name, status: 'pending' });
    installation.setIdentity({
      ...alex,
      subject: 'another-robin',
      name: robin.name,
      email: robin.email,
    });
    await signIn(impostor, origin);
    expect(
      (
        await impostor.post(`${origin}/api/invitations/accept`, { headers, data: { code } })
      ).status(),
    ).toBe(409);
    expect((await recipient.get(`${origin}/api/households/${household.id}`)).status()).toBe(403);
    const accepted = await recipient.post(`${origin}/api/invitations/accept`, {
      headers,
      data: { code },
    });
    expect(accepted.status()).toBe(200);
    expect(await accepted.json()).toEqual({ household: { ...household, role: 'member' } });
    await installation.restart();
    expect(await (await recipient.get(`${origin}/api/households/${household.id}`)).json()).toEqual({
      household: { ...household, role: 'member' },
    });
    const listing = await administrator.get(
      `${origin}/api/households/${household.id}/administration`,
    );
    expect(listing.headers()['cache-control']).toBe('no-store');
    const state = await listing.json();
    expect(state.members).toContainEqual({ userId: user.id, name: robin.name, role: 'member' });
    expect(state.invitations).toContainEqual({ ...invitation, status: 'accepted' });
    expect(JSON.stringify(state)).not.toContain(code);
    expect(
      (
        await recipient.post(`${origin}/api/invitations/accept`, { headers, data: { code } })
      ).status(),
    ).toBe(409);
  } finally {
    await Promise.all([administrator.dispose(), recipient.dispose(), impostor.dispose()]);
    await installation.close();
  }
});

test('administrators cannot cross household boundaries and members can accept access to another household', async () => {
  const installation = await createInstallation();
  const first = await request.newContext();
  const second = await request.newContext();
  const recipient = await request.newContext();
  const anonymous = await request.newContext();
  const { origin } = installation;
  const headers = { origin };
  try {
    await signIn(first, origin);
    const { household } = await (await createHousehold(first, origin)).json();
    const { user: firstUser } = await (await first.get(`${origin}/api/bootstrap`)).json();
    installation.setIdentity(robin);
    await signIn(second, origin, 'microsoft');
    const { user: secondUser } = await (await second.get(`${origin}/api/bootstrap`)).json();
    installation.seedMembership(
      secondUser.id,
      'another-household',
      'Hushållet Eken',
      'administrator',
    );
    installation.setIdentity({
      subject: 'sam-google',
      name: 'Sam Exempel',
      email: 'sam@example.test',
    });
    await signIn(recipient, origin);
    const { user } = await (await recipient.get(`${origin}/api/bootstrap`)).json();
    const firstBase = `${origin}/api/households/${household.id}`;
    const secondBase = `${origin}/api/households/another-household`;
    const { invitation, code } = await (
      await second.post(`${secondBase}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    for (const client of [first, anonymous]) {
      const status = client === anonymous ? 401 : 403;
      expect((await client.get(`${secondBase}/administration`)).status()).toBe(status);
      for (const [path, data] of [
        ['/invitations', { userId: firstUser.id }],
        [`/invitations/${invitation.id}/revoke`, {}],
        [`/members/${secondUser.id}/role`, { role: 'member' }],
        [`/members/${secondUser.id}/revoke`, {}],
      ] as const) {
        const denied = await client.post(`${secondBase}${path}`, { headers, data });
        expect(denied.status()).toBe(status);
        expect(await denied.text()).not.toContain('Eken');
      }
    }
    // Owning A must not allow acting on IDs from B through A's endpoints.
    expect(
      (
        await first.post(`${firstBase}/invitations/${invitation.id}/revoke`, { headers, data: {} })
      ).status(),
    ).toBe(404);
    expect(
      (
        await first.post(`${firstBase}/members/${secondUser.id}/role`, {
          headers,
          data: { role: 'member' },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await first.post(`${firstBase}/members/${secondUser.id}/revoke`, { headers, data: {} })
      ).status(),
    ).toBe(404);
    const ownInvitation = await (
      await first.post(`${firstBase}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    expect(
      (
        await recipient.post(`${origin}/api/invitations/accept`, {
          headers,
          data: { code: ownInvitation.code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await recipient.post(`${origin}/api/invitations/accept`, { headers, data: { code } })
      ).status(),
    ).toBe(200);
    expect((await recipient.get(firstBase)).status()).toBe(200);
    expect((await recipient.get(secondBase)).status()).toBe(200);
    // Revocation in one household cannot remove membership in another.
    expect(
      (
        await second.post(`${secondBase}/members/${user.id}/revoke`, { headers, data: {} })
      ).status(),
    ).toBe(200);
    expect((await recipient.get(secondBase)).status()).toBe(403);
    expect((await recipient.get(firstBase)).status()).toBe(200);
  } finally {
    await Promise.all([
      first.dispose(),
      second.dispose(),
      recipient.dispose(),
      anonymous.dispose(),
    ]);
    await installation.close();
  }
});

test('invitation replacement, cancellation, and membership revocation invalidate old codes', async () => {
  const installation = await createInstallation();
  const administrator = await request.newContext();
  const recipient = await request.newContext();
  const { origin } = installation;
  const headers = { origin };
  try {
    await signIn(administrator, origin);
    const { household } = await (await createHousehold(administrator, origin)).json();
    const base = `${origin}/api/households/${household.id}`;
    installation.setIdentity(robin);
    await signIn(recipient, origin, 'microsoft');
    const { user } = await (await recipient.get(`${origin}/api/bootstrap`)).json();
    const invite = async () =>
      (
        await administrator.post(`${base}/invitations`, { headers, data: { userId: user.id } })
      ).json();
    const accept = (code: string) =>
      recipient.post(`${origin}/api/invitations/accept`, { headers, data: { code } });
    const old = await invite();
    const current = await invite();
    expect((await accept(old.code)).status()).toBe(409);
    expect(
      (
        await administrator.post(`${base}/invitations/${current.invitation.id}/revoke`, {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect((await accept(current.code)).status()).toBe(409);
    const fresh = await invite();
    const accepted = await Promise.all([accept(fresh.code), accept(fresh.code)]);
    expect(accepted.map((result) => result.status()).sort()).toEqual([200, 409]);
    expect(
      (
        await administrator.post(`${base}/members/${user.id}/revoke`, { headers, data: {} })
      ).status(),
    ).toBe(200);
    for (const { code } of [old, current, fresh]) expect((await accept(code)).status()).toBe(409);
    expect((await recipient.get(base)).status()).toBe(403);
    const renewed = await invite();
    expect((await accept(renewed.code)).status()).toBe(200);
    expect((await recipient.get(base)).status()).toBe(200);
  } finally {
    await Promise.all([administrator.dispose(), recipient.dispose()]);
    await installation.close();
  }
});

test('concurrent role changes cannot remove the last administrator', async () => {
  const installation = await createInstallation();
  const first = await request.newContext();
  const second = await request.newContext();
  const { origin } = installation;
  const headers = { origin };
  try {
    await signIn(first, origin);
    const { household } = await (await createHousehold(first, origin)).json();
    const { user: firstUser } = await (await first.get(`${origin}/api/bootstrap`)).json();
    const base = `${origin}/api/households/${household.id}`;
    installation.setIdentity(robin);
    await signIn(second, origin, 'microsoft');
    const { user: secondUser } = await (await second.get(`${origin}/api/bootstrap`)).json();
    const { code } = await (
      await first.post(`${base}/invitations`, { headers, data: { userId: secondUser.id } })
    ).json();
    await second.post(`${origin}/api/invitations/accept`, { headers, data: { code } });
    await first.post(`${base}/members/${secondUser.id}/role`, {
      headers,
      data: { role: 'administrator' },
    });
    const changes = await Promise.all([
      first.post(`${base}/members/${firstUser.id}/role`, { headers, data: { role: 'member' } }),
      second.post(`${base}/members/${secondUser.id}/revoke`, { headers, data: {} }),
    ]);
    expect(changes.map((result) => result.status()).sort()).toEqual([200, 409]);
    const remaining = changes[0].status() === 409 ? first : second;
    const state = await (await remaining.get(`${base}/administration`)).json();
    expect(
      state.members.filter((member: { role: string }) => member.role === 'administrator'),
    ).toHaveLength(1);
  } finally {
    await Promise.all([first.dispose(), second.dispose()]);
    await installation.close();
  }
});

test('members cannot administer access, two administrators can share it, and revocation defeats old sessions', async () => {
  const installation = await createInstallation();
  const administrator = await request.newContext();
  const recipient = await request.newContext();
  const { origin } = installation;
  const headers = { origin };
  try {
    await signIn(administrator, origin);
    const { household, user: owner } = await (async () => {
      await createHousehold(administrator, origin);
      return (await administrator.get(`${origin}/api/bootstrap`)).json();
    })();
    const base = `${origin}/api/households/${household.id}`;
    installation.setIdentity(robin);
    await signIn(recipient, origin, 'microsoft');
    const { user } = await (await recipient.get(`${origin}/api/bootstrap`)).json();
    const { code, invitation } = await (
      await administrator.post(`${base}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    expect(
      (
        await recipient.post(`${origin}/api/invitations/accept`, { headers, data: { code } })
      ).status(),
    ).toBe(200);
    expect((await recipient.get(`${base}/administration`)).status()).toBe(403);
    for (const [path, data] of [
      ['/invitations', { userId: owner.id }],
      [`/invitations/${invitation.id}/revoke`, {}],
      [`/members/${user.id}/role`, { role: 'administrator' }],
      [`/members/${owner.id}/revoke`, {}],
    ] as const) {
      expect((await recipient.post(`${base}${path}`, { headers, data })).status()).toBe(403);
    }
    expect(
      (
        await administrator.post(`${base}/members/${user.id}/role`, {
          headers,
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(200);
    const shared = await (await recipient.get(`${base}/administration`)).json();
    expect(
      shared.members.filter((member: { role: string }) => member.role === 'administrator'),
    ).toHaveLength(2);
    expect(
      (
        await recipient.post(`${base}/members/${owner.id}/role`, {
          headers,
          data: { role: 'member' },
        })
      ).status(),
    ).toBe(200);
    expect((await administrator.get(`${base}/administration`)).status()).toBe(403);
    // A stale session keeps ordinary membership, but loses administrative rights immediately.
    expect(
      (
        await administrator.post(`${base}/members/${owner.id}/role`, {
          headers,
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(403);
    expect((await administrator.get(base)).status()).toBe(200);
    expect(
      (await recipient.post(`${base}/members/${owner.id}/revoke`, { headers, data: {} })).status(),
    ).toBe(200);
    expect((await administrator.get(base)).status()).toBe(403);
    expect(await (await administrator.get(`${origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'forbidden',
    });
    for (const [path, data] of [
      [`/members/${user.id}/role`, { role: 'member' }],
      [`/members/${user.id}/revoke`, {}],
    ] as const) {
      const denied = await recipient.post(`${base}${path}`, { headers, data });
      expect(denied.status()).toBe(409);
      expect(await denied.json()).toEqual({ error: 'last_administrator' });
    }
    await installation.restart();
    expect((await administrator.get(base)).status()).toBe(403);
    expect((await recipient.get(base)).status()).toBe(200);
  } finally {
    await Promise.all([administrator.dispose(), recipient.dispose()]);
    await installation.close();
  }
});
