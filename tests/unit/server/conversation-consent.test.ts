import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { unzipSync } from 'fflate';
import { afterEach, expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';
import { textModel } from '../../support/text-model.js';
import { applicationFixture } from './fixture.js';

type Installation = Awaited<ReturnType<typeof createInstallation>>;

let app: Installation | undefined;
let fixture: Awaited<ReturnType<typeof applicationFixture>> | undefined;
const clients: APIRequestContext[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
  await app?.close();
  app = undefined;
  fixture?.close();
  fixture = undefined;
});

const model = () => textModel(() => []).provider;

/** A signed-in device of the installation's current identity. */
async function device(installation: Installation, provider = 'google') {
  const client = await request.newContext();
  clients.push(client);
  await signIn(client, installation.origin, provider);
  return client;
}
async function setup() {
  const installation = await createInstallation(undefined, { modelFetch: model() });
  app = installation;
  const browser = await device(installation);
  const { household } = await (await createHousehold(browser, installation.origin)).json();
  const householdPath = `${installation.origin}/api/households/${household.id}`;
  return {
    installation,
    browser,
    householdPath,
    consentPath: `${householdPath}/conversation-consent`,
    startPath: `${householdPath}/text-assistant`,
  };
}
const send = (client: APIRequestContext, origin: string, url: string, data: unknown = {}) =>
  client.post(url, { headers: { origin }, data });

test('a conversation starts only with a consent for the current consent text, and the refusal says why', async () => {
  const { installation, browser, consentPath, startPath } = await setup();
  const { origin } = installation;
  for (const data of [
    {},
    { consent: null },
    { consent: {} },
    { consent: { textVersion: 0 } },
    { consent: { textVersion: 2 } },
    { consent: { textVersion: '1' } },
    { externalAi: true, mapWork: true },
  ]) {
    const refused = await send(browser, origin, startPath, data);
    expect(refused.status(), JSON.stringify(data)).toBe(403);
    expect(await refused.json()).toEqual({ error: 'conversation_consent_required' });
  }
  // Spoken and written work both need a started conversation, so nothing is left to refuse.
  for (const work of ['messages', 'voice'])
    expect((await send(browser, origin, `${startPath}/missing/${work}`)).status()).toBe(404);

  const started = await send(browser, origin, startPath, { consent: { textVersion: 1 } });
  expect(started.status(), await started.text()).toBe(201);
  // A consent for the visit is not saved: the next visit is asked again.
  expect(await (await browser.get(consentPath)).json()).toEqual({ saved: null });
  await send(browser, origin, `${startPath}/${(await started.json()).id}/stop`);
  expect((await send(browser, origin, startPath)).status()).toBe(403);
});

test('a saved consent has its date and text version, follows the user between devices and stays with one user and one household', async () => {
  const { installation, browser, householdPath, consentPath, startPath } = await setup();
  const { origin } = installation;
  const before = Date.now();
  const saved = await send(browser, origin, consentPath, { textVersion: 1 });
  expect(saved.status(), await saved.text()).toBe(200);
  const consent = (await saved.json()).saved;
  expect(consent).toEqual({ textVersion: 1, savedAt: expect.any(String) });
  expect(new Date(consent.savedAt).toISOString()).toBe(consent.savedAt);
  expect(Date.parse(consent.savedAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(consent.savedAt)).toBeLessThanOrEqual(Date.now());

  const otherDevice = await device(installation);
  expect(await (await otherDevice.get(consentPath)).json()).toEqual({ saved: consent });
  const started = await send(otherDevice, origin, startPath);
  expect(started.status(), await started.text()).toBe(201);

  const { user } = await (await browser.get(`${origin}/api/bootstrap`)).json();
  installation.seedMembership(user.id, 'other-household', 'Hushållet Eken');
  const otherHousehold = `${origin}/api/households/other-household`;
  expect(await (await browser.get(`${otherHousehold}/conversation-consent`)).json()).toEqual({
    saved: null,
  });
  expect((await send(browser, origin, `${otherHousehold}/text-assistant`)).status()).toBe(403);

  installation.setIdentity(robin);
  const member = await device(installation, 'microsoft');
  const { user: invitedUser } = await (await member.get(`${origin}/api/bootstrap`)).json();
  expect((await member.get(consentPath)).status()).toBe(403);
  const invitation = await send(browser, origin, `${householdPath}/invitations`, {
    userId: invitedUser.id,
  });
  const { code } = await invitation.json();
  expect((await send(member, origin, `${origin}/api/invitations/accept`, { code })).status()).toBe(
    200,
  );
  expect(await (await member.get(consentPath)).json()).toEqual({ saved: null });
  const refused = await send(member, origin, startPath);
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toEqual({ error: 'conversation_consent_required' });
  // The first user's consent is untouched by the other member and by saving again.
  expect(await (await browser.get(consentPath)).json()).toEqual({ saved: consent });
  const again = await send(browser, origin, consentPath, { textVersion: 1 });
  expect((await again.json()).saved.textVersion).toBe(1);
});

test('a saved consent follows the membership: a member who is invited again is asked again', async () => {
  const { installation, browser, householdPath, consentPath, startPath } = await setup();
  const { origin } = installation;
  installation.setIdentity(robin);
  const member = await device(installation, 'microsoft');
  const { user } = await (await member.get(`${origin}/api/bootstrap`)).json();
  async function join() {
    const invitation = await send(browser, origin, `${householdPath}/invitations`, {
      userId: user.id,
    });
    const { code } = await invitation.json();
    const accepted = await send(member, origin, `${origin}/api/invitations/accept`, { code });
    expect(accepted.status()).toBe(200);
  }
  await join();
  expect((await send(member, origin, consentPath, { textVersion: 1 })).status()).toBe(200);
  expect((await send(member, origin, startPath)).status()).toBe(201);

  const revoked = await send(browser, origin, `${householdPath}/members/${user.id}/revoke`);
  expect(revoked.status(), await revoked.text()).toBe(200);
  expect((await member.get(consentPath)).status()).toBe(403);
  await join();
  expect(await (await member.get(consentPath)).json()).toEqual({ saved: null });
  expect((await send(member, origin, startPath)).status()).toBe(403);
});

test('an administrator who leaves the household and is invited again is asked again', async () => {
  const { installation, browser, householdPath, consentPath, startPath } = await setup();
  const { origin } = installation;
  const { user } = await (await browser.get(`${origin}/api/bootstrap`)).json();
  installation.setIdentity(robin);
  const other = await device(installation, 'microsoft');
  const { user: otherUser } = await (await other.get(`${origin}/api/bootstrap`)).json();
  const invitation = await send(browser, origin, `${householdPath}/invitations`, {
    userId: otherUser.id,
  });
  await send(other, origin, `${origin}/api/invitations/accept`, {
    code: (await invitation.json()).code,
  });
  const promoted = await send(browser, origin, `${householdPath}/members/${otherUser.id}/role`, {
    role: 'administrator',
  });
  expect(promoted.status(), await promoted.text()).toBe(200);
  expect((await send(browser, origin, consentPath, { textVersion: 1 })).status()).toBe(200);

  const left = await send(browser, origin, `${householdPath}/members/${user.id}/revoke`);
  expect(left.status(), await left.text()).toBe(200);
  expect((await browser.get(consentPath)).status()).toBe(403);
  const again = await send(other, origin, `${householdPath}/invitations`, { userId: user.id });
  const accepted = await send(browser, origin, `${origin}/api/invitations/accept`, {
    code: (await again.json()).code,
  });
  expect(accepted.status(), await accepted.text()).toBe(200);
  expect(await (await browser.get(consentPath)).json()).toEqual({ saved: null });
  expect((await send(browser, origin, startPath)).status()).toBe(403);
});

test('the consent is not household content: a full export leaves it out, and a re-import leaves it as it was', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  const path = `/api/households/${household.id}`;
  const { saved } = await (
    await client.json(`${path}/conversation-consent`, { textVersion: 1 })
  ).json();
  expect(saved).toEqual({ textVersion: 1, savedAt: expect.any(String) });

  const prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status, await prepared.clone().text()).toBe(201);
  const archive = new Uint8Array(
    await (await client.request(`${path}/exports/${(await prepared.json()).id}`)).arrayBuffer(),
  );
  const parts = unzipSync(archive);
  const content = JSON.parse(Buffer.from(parts['content.json']).toString());
  // The archive has the household and its members' private work, and nothing about consents.
  expect(content.household.id).toBe(household.id);
  expect(Object.keys(content).filter((name) => /consent/i.test(name))).toEqual([]);
  for (const [name, bytes] of Object.entries(parts))
    expect(Buffer.from(bytes).includes(saved.savedAt), name).toBe(false);

  const uploaded = await client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: archive as BodyInit,
  });
  expect(uploaded.status, await uploaded.clone().text()).toBe(201);
  const confirmed = await client.json(`${path}/imports/${(await uploaded.json()).id}/confirm`, {
    contentVersion: 1,
    confirmed: true,
  });
  expect(await confirmed.json()).toMatchObject({ status: 'completed', contentVersion: 2 });
  expect(await (await client.request(`${path}/conversation-consent`)).json()).toEqual({ saved });
});

test('a consent does not outlive its household: a household that is erased leaves no consent behind', async () => {
  fixture = await applicationFixture();
  const { database } = fixture;
  const client = fixture.client();
  await client.signIn();
  await client.json('/api/households', { name: 'Linden' });
  const { user } = await (await client.request('/api/bootstrap')).json();
  // The product erases no whole household. The test does in the database what
  // such an erasure would: the household's content first, then the household.
  const addHousehold = () => {
    database
      .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
      .run('erased', 'Hushållet Eken', '2026-01-01T00:00:00Z');
    database
      .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
      .run('erased', user.id, 'member');
  };
  addHousehold();
  const consentPath = '/api/households/erased/conversation-consent';
  expect((await client.json(consentPath, { textVersion: 1 })).status).toBe(200);
  expect((await (await client.request(consentPath)).json()).saved).not.toBeNull();

  const tables = database
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'
        AND name NOT IN ('membership', 'conversation_consent')
        AND EXISTS (SELECT 1 FROM pragma_table_info(sqlite_master.name) WHERE name = 'householdId')`,
    )
    .all() as { name: string }[];
  database.transaction(() => {
    // The content's own references are checked when everything is erased.
    database.pragma('defer_foreign_keys = ON');
    for (const { name } of tables)
      database.prepare(`DELETE FROM ${name} WHERE householdId = ?`).run('erased');
    database.prepare('DELETE FROM household WHERE id = ?').run('erased');
  })();
  expect((await client.request(consentPath)).status).toBe(403);
  // A household with the same identity starts without a consent.
  addHousehold();
  expect(await (await client.request(consentPath)).json()).toEqual({ saved: null });
});

test('saving a consent needs a signed-in member, the own origin and the current consent text', async () => {
  const { installation, browser, consentPath } = await setup();
  const { origin } = installation;
  const anonymous = await request.newContext();
  clients.push(anonymous);
  expect((await anonymous.get(consentPath)).status()).toBe(401);
  expect((await send(anonymous, origin, consentPath, { textVersion: 1 })).status()).toBe(401);
  expect(
    (
      await browser.post(consentPath, {
        headers: { origin: 'https://unrelated.example' },
        data: { textVersion: 1 },
      })
    ).status(),
  ).toBe(403);
  const unknownHousehold = `${origin}/api/households/missing/conversation-consent`;
  expect((await browser.get(unknownHousehold)).status()).toBe(403);
  expect((await send(browser, origin, unknownHousehold, { textVersion: 1 })).status()).toBe(403);
  for (const data of [{}, { textVersion: 0 }, { textVersion: 2 }, { textVersion: '1' }, null]) {
    const invalid = await send(browser, origin, consentPath, data);
    expect(invalid.status(), JSON.stringify(data)).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'invalid_request' });
  }
  expect(await (await browser.get(consentPath)).json()).toEqual({ saved: null });
});

test('a saved consent for an older consent text no longer applies when the text has a new version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-consent-'));
  const databasePath = join(directory, 'skyttel.db');
  try {
    const release = await createInstallation(undefined, { modelFetch: model(), databasePath });
    app = release;
    const browser = await device(release);
    const { household } = await (await createHousehold(browser, release.origin)).json();
    const paths = (origin: string) => ({
      consentPath: `${origin}/api/households/${household.id}/conversation-consent`,
      startPath: `${origin}/api/households/${household.id}/text-assistant`,
    });
    const before = paths(release.origin);
    await send(browser, release.origin, before.consentPath, { textVersion: 1 });
    expect((await send(browser, release.origin, before.startPath)).status()).toBe(201);
    await release.close();

    // A later release changes the text in substance and raises its version.
    const laterRelease = await createInstallation(undefined, {
      modelFetch: model(),
      databasePath,
      consentTextVersion: 2,
    });
    app = laterRelease;
    const { origin } = laterRelease;
    const returning = await device(laterRelease);
    const { consentPath, startPath } = paths(origin);
    // The older consent is still on record, so that the user can be told that the text has changed.
    expect((await (await returning.get(consentPath)).json()).saved.textVersion).toBe(1);
    for (const data of [{}, { consent: { textVersion: 1 } }]) {
      const refused = await send(returning, origin, startPath, data);
      expect(refused.status(), JSON.stringify(data)).toBe(403);
      expect(await refused.json()).toEqual({ error: 'conversation_consent_required' });
    }
    expect((await send(returning, origin, consentPath, { textVersion: 1 })).status()).toBe(400);
    expect(
      (await send(returning, origin, startPath, { consent: { textVersion: 2 } })).status(),
    ).toBe(201);
    const saved = await send(returning, origin, consentPath, { textVersion: 2 });
    expect((await saved.json()).saved.textVersion).toBe(2);
    expect((await send(returning, origin, startPath)).status()).toBe(201);
  } finally {
    await app?.close();
    app = undefined;
    await rm(directory, { recursive: true, force: true });
  }
});

test('revoking removes the saved consent and ends the user’s conversations in the household on every device, and the refusals say why', async () => {
  const { installation, browser, consentPath, startPath } = await setup();
  const { origin } = installation;
  const revokePath = `${consentPath}/revoke`;
  const refusal = { error: 'conversation_consent_required' };
  await send(browser, origin, consentPath, { textVersion: 1 });
  const otherDevice = await device(installation);
  const conversations = await Promise.all(
    [browser, otherDevice].map(async (client) => {
      const started = await send(client, origin, startPath);
      expect(started.status(), await started.text()).toBe(201);
      return { client, path: `${startPath}/${(await started.json()).id}` };
    }),
  );

  const revoked = await send(browser, origin, revokePath);
  expect(revoked.status(), await revoked.text()).toBe(200);
  expect(await revoked.json()).toEqual({ saved: null });
  expect(await (await otherDevice.get(consentPath)).json()).toEqual({ saved: null });

  for (const { client, path } of conversations) {
    // Written work, spoken work and reading the conversation are all refused.
    for (const work of ['messages', 'voice']) {
      const refused = await send(client, origin, `${path}/${work}`);
      expect(refused.status(), work).toBe(403);
      expect(await refused.json(), work).toEqual(refusal);
    }
    const read = await client.get(path);
    expect(read.status()).toBe(403);
    expect(await read.json()).toEqual(refusal);
    const restarted = await send(client, origin, startPath);
    expect(restarted.status()).toBe(403);
    expect(await restarted.json()).toEqual(refusal);
  }
  // A conversation that never existed is still only missing.
  expect((await send(browser, origin, `${startPath}/missing/messages`)).status()).toBe(404);
  // Revoking again changes nothing, and a new consent applies as the first one did.
  expect(await (await send(browser, origin, revokePath)).json()).toEqual({ saved: null });
  expect((await send(browser, origin, consentPath, { textVersion: 1 })).status()).toBe(200);
  expect((await send(browser, origin, startPath)).status()).toBe(201);
  // The conversations that the revoked consent started stay ended.
  expect((await conversations[0].client.get(conversations[0].path)).status()).toBe(403);
});

test('revoking ends a conversation that was approved for the visit only', async () => {
  const { installation, browser, consentPath, startPath } = await setup();
  const { origin } = installation;
  const started = await send(browser, origin, startPath, { consent: { textVersion: 1 } });
  expect(started.status(), await started.text()).toBe(201);
  const conversation = `${startPath}/${(await started.json()).id}`;
  expect((await browser.get(conversation)).status()).toBe(200);

  expect((await send(browser, origin, `${consentPath}/revoke`)).status()).toBe(200);
  const refused = await send(browser, origin, `${conversation}/messages`);
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toEqual({ error: 'conversation_consent_required' });
});

test('a consent that is revoked while a conversation is being started starts none', async () => {
  let whileStarting: (() => Promise<unknown>) | undefined;
  const installation = await createInstallation(undefined, {
    modelFetch: model(),
    // The conversation connects to the map through requests of its own.
    assistantDispatch: async (request, dispatch) => {
      const interruption = whileStarting;
      whileStarting = undefined;
      await interruption?.();
      return dispatch(request);
    },
  });
  app = installation;
  const { origin } = installation;
  const browser = await device(installation);
  const otherDevice = await device(installation);
  const { household } = await (await createHousehold(browser, origin)).json();
  const consentPath = `${origin}/api/households/${household.id}/conversation-consent`;
  const startPath = `${origin}/api/households/${household.id}/text-assistant`;

  whileStarting = () => send(otherDevice, origin, `${consentPath}/revoke`);
  const refused = await send(browser, origin, startPath, { consent: { textVersion: 1 } });
  expect(whileStarting).toBeUndefined();
  expect(refused.status(), await refused.text()).toBe(403);
  expect(await refused.json()).toEqual({ error: 'conversation_consent_required' });
  // A consent that the user gives after the revocation starts a conversation as usual.
  const started = await send(browser, origin, startPath, { consent: { textVersion: 1 } });
  expect(started.status(), await started.text()).toBe(201);
});

test('revoking applies to one user in one household, and needs a signed-in member and the own origin', async () => {
  const { installation, browser, householdPath, consentPath, startPath } = await setup();
  const { origin } = installation;
  const revokePath = `${consentPath}/revoke`;
  const { user } = await (await browser.get(`${origin}/api/bootstrap`)).json();
  installation.seedMembership(user.id, 'other-household', 'Hushållet Eken');
  const otherConsentPath = `${origin}/api/households/other-household/conversation-consent`;
  await send(browser, origin, consentPath, { textVersion: 1 });
  await send(browser, origin, otherConsentPath, { textVersion: 1 });

  installation.setIdentity(robin);
  const member = await device(installation, 'microsoft');
  const { user: invitedUser } = await (await member.get(`${origin}/api/bootstrap`)).json();
  // Someone outside the household can revoke nothing in it.
  expect((await send(member, origin, revokePath)).status()).toBe(403);
  const invitation = await send(browser, origin, `${householdPath}/invitations`, {
    userId: invitedUser.id,
  });
  await send(member, origin, `${origin}/api/invitations/accept`, {
    code: (await invitation.json()).code,
  });
  await send(member, origin, consentPath, { textVersion: 1 });
  const memberStarted = await send(member, origin, startPath);
  expect(memberStarted.status(), await memberStarted.text()).toBe(201);
  const memberConversation = `${startPath}/${(await memberStarted.json()).id}`;

  const anonymous = await request.newContext();
  clients.push(anonymous);
  expect((await send(anonymous, origin, revokePath)).status()).toBe(401);
  expect(
    (
      await browser.post(revokePath, { headers: { origin: 'https://unrelated.example' }, data: {} })
    ).status(),
  ).toBe(403);
  expect((await (await browser.get(consentPath)).json()).saved).not.toBeNull();

  expect((await send(browser, origin, revokePath)).status()).toBe(200);
  expect(await (await browser.get(consentPath)).json()).toEqual({ saved: null });
  // The other member's consent and conversation, and the user's consent in another household, remain.
  expect((await (await member.get(consentPath)).json()).saved).not.toBeNull();
  expect((await member.get(memberConversation)).status()).toBe(200);
  expect((await (await browser.get(otherConsentPath)).json()).saved).not.toBeNull();
});
