import { expect, request, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import { alex, createInstallation, robin } from '../support/installation.js';

test('two installations honor different administrators and deny another identity the bootstrap', async () => {
  const first = await createInstallation();
  const second = await createInstallation({ provider: 'microsoft', subject: robin.subject });
  const client = await request.newContext();
  try {
    await signIn(client, first.origin);
    const firstCreate = await createHousehold(client, first.origin);
    expect(firstCreate.status()).toBe(201);
    const { household: firstHousehold } = await firstCreate.json();
    await signIn(client, second.origin);
    expect((await createHousehold(client, second.origin, 'Intrång')).status()).toBe(403);
    expect(await (await client.get(`${second.origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'forbidden',
    });
    second.setIdentity(robin);
    await signIn(client, second.origin, 'microsoft');
    const secondCreate = await createHousehold(client, second.origin, 'Hushållet Eken');
    expect(secondCreate.status()).toBe(201);
    const { household: secondHousehold } = await secondCreate.json();
    expect(secondHousehold.id).not.toBe(firstHousehold.id);
    expect(
      (await client.get(`${second.origin}/api/households/${firstHousehold.id}`)).status(),
    ).toBe(403);
    expect((await client.get(`${first.origin}/api/households/${firstHousehold.id}`)).status()).toBe(
      401,
    );
  } finally {
    await client.dispose();
    await first.close();
    await second.close();
  }
});

test('a second identity with the same email cannot acquire the first identity or its membership', async () => {
  const installation = await createInstallation();
  const administrator = await request.newContext();
  const outsider = await request.newContext();
  try {
    await signIn(administrator, installation.origin);
    const { household } = await (await createHousehold(administrator, installation.origin)).json();
    const before = await (await administrator.get(`${installation.origin}/api/bootstrap`)).json();
    expect(before.user.id).not.toBe(alex.subject);
    installation.setIdentity({ ...robin, email: alex.email });
    await signIn(outsider, installation.origin, 'microsoft');
    const outsiderState = await (await outsider.get(`${installation.origin}/api/bootstrap`)).json();
    expect(outsiderState.status).toBe('forbidden');
    expect(outsiderState.user.id).not.toBe(before.user.id);
    expect(
      (await outsider.get(`${installation.origin}/api/households/${household.id}`)).status(),
    ).toBe(403);
    const after = await (await administrator.get(`${installation.origin}/api/bootstrap`)).json();
    expect(after.user.id).toBe(before.user.id);
    expect(after.household.id).toBe(household.id);
  } finally {
    await administrator.dispose();
    await outsider.dispose();
    await installation.close();
  }
});

test('an earlier same-email identity cannot block the configured first administrator', async () => {
  const installation = await createInstallation();
  const administrator = await request.newContext();
  const outsider = await request.newContext();
  try {
    installation.setIdentity({ ...robin, email: alex.email });
    await signIn(outsider, installation.origin, 'microsoft');
    expect((await createHousehold(outsider, installation.origin)).status()).toBe(403);
    installation.setIdentity(alex);
    await signIn(administrator, installation.origin);
    const created = await createHousehold(administrator, installation.origin);
    expect(created.status()).toBe(201);
    const { household } = await created.json();
    expect(
      (await outsider.get(`${installation.origin}/api/households/${household.id}`)).status(),
    ).toBe(403);
  } finally {
    await administrator.dispose();
    await outsider.dispose();
    await installation.close();
  }
});

test('bootstrap is atomic and rejects cross-origin and malformed submissions', async () => {
  const installation = await createInstallation();
  const client = await request.newContext();
  try {
    await signIn(client, installation.origin);
    expect(
      (
        await client.post(`${installation.origin}/api/households`, {
          headers: { origin: 'https://attacker.example' },
          data: { name: 'Intrång' },
        })
      ).status(),
    ).toBe(403);
    expect((await createHousehold(client, installation.origin, '   ')).status()).toBe(400);
    const results = await Promise.all([
      createHousehold(client, installation.origin, 'Hushållet Linden'),
      createHousehold(client, installation.origin, 'Hushållet Eken'),
    ]);
    expect(results.map((result) => result.status()).sort()).toEqual([201, 409]);
    const created = results.find((result) => result.status() === 201);
    if (!created) throw new Error('Expected one household creation to succeed.');
    const winner = await created.json();
    await installation.restart();
    expect(await (await client.get(`${installation.origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'ready',
      household: winner.household,
    });
    expect((await createHousehold(client, installation.origin)).status()).toBe(409);
  } finally {
    await client.dispose();
    await installation.close();
  }
});

test('current membership isolates households and revocation defeats an existing session', async () => {
  const installation = await createInstallation();
  const administrator = await request.newContext();
  const otherMember = await request.newContext();
  try {
    await signIn(administrator, installation.origin);
    const { household } = await (await createHousehold(administrator, installation.origin)).json();
    const adminState = await (
      await administrator.get(`${installation.origin}/api/bootstrap`)
    ).json();
    installation.setIdentity({ ...robin, name: alex.name });
    await signIn(otherMember, installation.origin, 'microsoft');
    const outsiderState = await (
      await otherMember.get(`${installation.origin}/api/bootstrap`)
    ).json();
    expect(outsiderState.status).toBe('forbidden');
    installation.seedMembership(outsiderState.user.id, 'another-household', 'Hushållet Eken');
    expect(
      await (
        await otherMember.get(`${installation.origin}/api/households/another-household`)
      ).json(),
    ).toMatchObject({ household: { name: 'Hushållet Eken', role: 'member' } });
    const forbidden = await otherMember.get(
      `${installation.origin}/api/households/${household.id}`,
    );
    expect(forbidden.status()).toBe(403);
    expect(await forbidden.text()).not.toContain(household.name);
    expect(
      (await administrator.get(`${installation.origin}/api/households/another-household`)).status(),
    ).toBe(403);
    installation.revokeMembership(adminState.user.id);
    expect(
      (await administrator.get(`${installation.origin}/api/households/${household.id}`)).status(),
    ).toBe(403);
    expect(
      await (await administrator.get(`${installation.origin}/api/bootstrap`)).json(),
    ).toMatchObject({ status: 'forbidden' });
    expect((await createHousehold(administrator, installation.origin)).status()).toBe(409);
  } finally {
    await administrator.dispose();
    await otherMember.dispose();
    await installation.close();
  }
});

test('forged OAuth callbacks and unavailable authentication routes do not grant access', async () => {
  const installation = await createInstallation();
  const client = await request.newContext();
  try {
    await client.get(`${installation.origin}/api/auth/callback/google?state=forged&code=forged`);
    expect(await (await client.get(`${installation.origin}/api/bootstrap`)).json()).toMatchObject({
      status: 'anonymous',
    });
    for (const path of [
      'link-social',
      'unlink-account',
      'get-access-token',
      'sign-up/email',
      'test-login',
    ]) {
      const result = await client.post(`${installation.origin}/api/auth/${path}`, {
        headers: { origin: installation.origin },
        data: { provider: 'google' },
      });
      expect(result.status()).toBe(404);
    }
  } finally {
    await client.dispose();
    await installation.close();
  }
});
