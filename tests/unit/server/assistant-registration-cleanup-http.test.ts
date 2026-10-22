import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, expect, test, vi } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let database: Database.Database;
afterEach(async () => {
  vi.useRealTimers();
  if (database?.open) database.close();
  await browser?.dispose();
  await app?.close();
});

test.each(['milliseconds', 'ISO'] as const)(
  'unconnected registrations expire after 24 hours across restart with %s dates',
  async (format) => {
    let time = Date.now();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    app = await createInstallation(undefined, { now: () => time });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    database = new Database(join(app.directory, 'skyttel.db'));
    const old = await beginAssistant(browser, app.origin);
    const recent = await beginAssistant(browser, app.origin);
    const stored = (clientId: string) =>
      database.prepare('SELECT clientId FROM oauthClient WHERE clientId = ?').get(clientId);
    const stamp = (value: number) => (format === 'ISO' ? new Date(value).toISOString() : value);
    const age = database.prepare('UPDATE oauthClient SET createdAt = ? WHERE clientId = ?');
    age.run(stamp(time - 86_400_000), old.clientId);
    age.run(stamp(time - 86_399_999), recent.clientId);
    expect(stored(old.clientId)).toBeDefined();
    expect(stored(recent.clientId)).toBeDefined();

    await app.restart();
    await expect.poll(() => stored(old.clientId)).toBeUndefined();
    expect(stored(recent.clientId)).toBeDefined();
    const context = async (clientId: string) =>
      (
        await (
          await browser.get(`${app.origin}/api/assistants/context?client_id=${clientId}`)
        ).json()
      ).client;
    expect(await context(old.clientId)).toBeNull();
    expect(await context(recent.clientId)).toMatchObject({ clientId: recent.clientId });

    time += 1;
    await vi.advanceTimersByTimeAsync(60_000);
    await expect.poll(() => stored(recent.clientId)).toBeUndefined();
    expect(await context(recent.clientId)).toBeNull();
    expect(database.prepare('SELECT * FROM oauthClientResource').all()).toEqual([]);
  },
);

test('cleanup preserves connected clients, the built-in assistant and a new consent in progress', async () => {
  const time = Date.now();
  const model = textModel(() => [modelMessage('Jag kan fortfarande hjälpa dig.')]);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  app = await createInstallation(undefined, { now: () => time, modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  database = new Database(join(app.directory, 'skyttel.db'));
  const connected = await beginAssistant(browser, app.origin);
  const accepted = await connected.consent(household.id);
  expect(accepted.status()).toBe(200);
  const tokens = await connected.exchange((await accepted.json()).url);
  expect(tokens.status).toBe(200);
  const { access_token } = await tokens.json();

  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const started = await browser.post(path, {
    headers: { origin: app.origin },
    data: approvedForVisit,
  });
  expect(started.status()).toBe(201);
  const conversation = await started.json();
  const abandoned = await beginAssistant(browser, app.origin);
  // Old registrations remain protected by their connections, including the
  // built-in assistant's private connection. Client names grant no exemption.
  database.prepare('UPDATE oauthClient SET createdAt = ?').run(time - 86_400_000);
  database
    .prepare('UPDATE oauthClient SET name = ? WHERE clientId = ?')
    .run('Samtal med Skyttel', abandoned.clientId);
  const pending = await beginAssistant(browser, app.origin);

  await vi.advanceTimersByTimeAsync(60_000);
  await expect
    .poll(() =>
      database.prepare('SELECT 1 FROM oauthClient WHERE clientId = ?').get(abandoned.clientId),
    )
    .toBeUndefined();
  expect((await callAssistant(app.origin, access_token, 'read_map')).status).toBe(200);
  expect(database.prepare('SELECT count(*) AS count FROM assistant_connection').get()).toEqual({
    count: 2,
  });
  const consent = await pending.consent(household.id);
  expect(consent.status()).toBe(200);
  const exchanged = await pending.exchange((await consent.json()).url);
  expect(exchanged.status).toBe(200);
  expect(
    (await callAssistant(app.origin, (await exchanged.json()).access_token, 'read_map')).status,
  ).toBe(200);
  expect(
    (
      await browser.post(`${path}/${conversation.id}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId: 'after-cleanup',
          revision: 0,
          draftVersion: 0,
          contentVersion: 1,
          text: 'Kan du hjälpa mig?',
        },
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(async () => (await browser.get(`${path}/${conversation.id}`)).text())
    .toContain('Jag kan fortfarande hjälpa dig.');
});

test('background cleanup drains more than one batch of abandoned registrations without traffic', async () => {
  const time = Date.now();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  app = await createInstallation(undefined, { now: () => time });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const recent = await beginAssistant(browser, app.origin);
  database = new Database(join(app.directory, 'skyttel.db'));
  database.transaction(() => {
    const insert = database.prepare(`INSERT INTO oauthClient (id, clientId, createdAt, redirectUris)
      VALUES (?, ?, ?, ?)`);
    for (let index = 0; index < 205; index++)
      insert.run(`abandoned-${index}`, `abandoned-${index}`, time - 86_400_000, '[]');
  })();
  const registrations = () => database.prepare('SELECT clientId FROM oauthClient').all();
  expect(registrations()).toHaveLength(206);
  await vi.advanceTimersByTimeAsync(60_000);
  await expect.poll(registrations).toEqual([{ clientId: recent.clientId }]);
  expect((await browser.get(`${app.origin}/healthz`)).status()).toBe(200);
});
