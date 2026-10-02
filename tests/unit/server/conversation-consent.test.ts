import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';
import { textModel } from '../../support/text-model.js';

type Installation = Awaited<ReturnType<typeof createInstallation>>;

let app: Installation | undefined;
const clients: APIRequestContext[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
  await app?.close();
  app = undefined;
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
