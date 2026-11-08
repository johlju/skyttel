import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

test.each([
  'invalid JSON',
  'different conversation',
  'different actor',
  'different household',
  'invalid accepted requests',
  'missing pending parts',
  'invalid applied parts',
  'invalid part list',
  'invalid conversation text',
  'invalid unfinished requests',
  'invalid queue',
])(
  'restoration retires an invalid retained snapshot without exposing or executing it: %s',
  {
    tags: ['technical'],
  },
  async (damage) => {
    const model = textModel(() => [modelMessage('Det tidigare privata svaret.')]);
    app = await createInstallation(undefined, { modelFetch: model.provider });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const root = `${app.origin}/api/households/${household.id}`;
    const path = `${root}/text-assistant`;
    const post = (url: string, data: object = {}) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    const started = await post(path, approvedForVisit);
    expect(started.status(), await started.text()).toBe(201);
    let state: TextAssistantView = await started.json();
    const sent = await post(`${path}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text: 'Läs den privata frågan utan att ändra kartan.',
    });
    expect(sent.status(), await sent.text()).toBe(202);
    await expect
      .poll(async () => {
        state = await (await browser.get(`${path}/${state.id}`)).json();
        return state.phase;
      })
      .toBe('ready');
    const authorizations = model.authorizationRequests.length;
    const before = await (await browser.get(`${root}/map`)).json();
    const paused = await post(`${path}/${state.id}/pause`);
    expect(paused.status(), await paused.text()).toBe(200);

    // Arrange damaged persisted input only in this installation's temporary
    // database. Recovery outcomes are observed through the public HTTP API.
    const fixture = new Database(join(app.directory, 'skyttel.db'));
    try {
      const row = fixture.prepare('SELECT state FROM conversation WHERE id = ?').get(state.id) as {
        state: string;
      };
      const stored = JSON.parse(row.state);
      switch (damage) {
        case 'different conversation':
          stored.id = 'another-conversation';
          break;
        case 'different actor':
          stored.actorId = 'another-person';
          break;
        case 'different household':
          stored.householdId = 'another-household';
          break;
        case 'invalid accepted requests':
          stored.accepted = {};
          break;
        case 'missing pending parts':
          delete stored.pendingPartsLedger;
          break;
        case 'invalid applied parts':
          stored.pendingPartsLedger.applied = {};
          break;
        case 'invalid part list':
          stored.pendingPartsLedger.parts = {};
          break;
        case 'invalid conversation text':
          stored.conversation = {};
          break;
        case 'invalid unfinished requests':
          stored.unfinishedRequests = {};
          break;
        case 'invalid queue':
          stored.queue = {};
          break;
      }
      fixture
        .prepare('UPDATE conversation SET state = ? WHERE id = ?')
        .run(damage === 'invalid JSON' ? '{damaged' : JSON.stringify(stored), state.id);
    } finally {
      fixture.close();
    }

    browser = await restartWithSession(browser, () => app.restart());
    const restored = await browser.get(`${path}/restore`);
    expect(restored.status(), await restored.text()).toBe(200);
    expect(await restored.json()).toEqual({ available: true });
    const retired = await browser.get(`${path}/${state.id}`);
    expect(retired.status(), await retired.text()).toBe(404);
    expect(await retired.json()).toEqual({ error: 'assistant_session_expired' });
    expect((await (await browser.get(`${path}/restore`)).json()).conversation).toBeUndefined();
    expect(await (await browser.get(`${root}/map`)).json()).toEqual(before);
    expect(model.requests).toHaveLength(1);
    expect(model.authorizationRequests).toHaveLength(authorizations);

    const fresh = await post(path, approvedForVisit);
    expect(fresh.status(), await fresh.text()).toBe(201);
    const next = await fresh.json();
    expect(next.id).not.toBe(state.id);
    expect(next).toMatchObject({ conversation: [], pendingParts: [], queuedMessages: 0 });
    expect(model.requests).toHaveLength(1);
    expect(model.authorizationRequests).toHaveLength(authorizations);
  },
);

test('whole-draft discard retires a damaged unloaded conversation without blocking the draft change', {
  tags: ['technical'],
}, async () => {
  const model = textModel(() => [modelMessage('Ingen modell ska behövas för att kasta utkastet.')]);
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const root = `${app.origin}/api/households/${household.id}`;
  const path = `${root}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  const initial = await (await browser.get(`${root}/map`)).json();
  const proposed = await post(`${root}/map/draft`, {
    version: initial.draft.version,
    contentVersion: initial.contentVersion,
    id: 'private-bike',
    baseRevision: null,
    value: { typeId: initial.types[0].id, name: 'Privata cykeln' },
  });
  expect(proposed.status(), await proposed.text()).toBe(200);
  const started = await post(path, approvedForVisit);
  expect(started.status(), await started.text()).toBe(201);
  const state: TextAssistantView = await started.json();
  const paused = await post(`${path}/${state.id}/pause`);
  expect(paused.status(), await paused.text()).toBe(200);
  const fixture = new Database(join(app.directory, 'skyttel.db'));
  try {
    fixture
      .prepare(
        "UPDATE conversation SET state = json_remove(state, '$.pendingPartsLedger') WHERE id = ?",
      )
      .run(state.id);
  } finally {
    fixture.close();
  }

  const discarded = await post(`${root}/map/discard`, {
    version: state.review.version,
    contentVersion: state.review.contentVersion,
  });
  expect(discarded.status(), await discarded.text()).toBe(200);
  const current = await (await browser.get(`${root}/map`)).json();
  expect(current.draft.changes).toEqual([]);
  expect(current.objects).toEqual([]);
  expect((await (await browser.get(`${root}/map/history`)).json()).history).toEqual([]);
  expect((await (await browser.get(`${path}/restore`)).json()).conversation).toBeUndefined();
  browser = await restartWithSession(browser, () => app.restart());
  expect((await browser.get(`${path}/${state.id}`)).status()).toBe(404);
  const fresh = await post(path, approvedForVisit);
  expect(fresh.status(), await fresh.text()).toBe(201);
  expect(await fresh.json()).toMatchObject({ conversation: [], pendingParts: [] });
  expect(model.requests).toHaveLength(0);
  expect(model.authorizationRequests).toHaveLength(0);
});
