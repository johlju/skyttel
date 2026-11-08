import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { authorizeAssistant, callAssistant, callAssistantTool } from '../../support/assistant.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
const clients: APIRequestContext[] = [];
let householdId: string;
let token: string;
let initial: MapState;
const base = () => `${app.origin}/api/households/${householdId}`;
const read = async (): Promise<MapState> => (await browser.get(`${base()}/map`)).json();
const post = (path: string, data: unknown) =>
  browser.post(`${base()}/${path}`, { headers: { origin: app.origin }, data });
const batch = () => ({
  operationId: 'original-batch',
  version: 0,
  contentVersion: 1,
  operations: [
    {
      name: 'propose_object',
      arguments: {
        id: 'lo',
        baseRevision: null,
        value: { typeId: initial.types[0].id, name: 'Lo' },
      },
    },
  ],
});
const connect = (client = browser, household = householdId) =>
  authorizeAssistant(client, app.origin, household);
const tool = (name: string, args: Record<string, unknown>, grant = token) =>
  callAssistantTool(app.origin, grant, name, args);
beforeEach(async () => {
  app = await createInstallation();
  browser = await request.newContext();
  await signIn(browser, app.origin);
  ({
    household: { id: householdId },
  } = await (await createHousehold(browser, app.origin)).json());
  initial = await read();
  token = await connect();
  expect((await tool('apply_draft_batch', batch())).error).toBe(false);
});
afterEach(async () => {
  for (const client of clients.splice(0)) await client.dispose();
  await browser?.dispose();
  await app?.close();
});

test('an immutable batch identity rejects a different request without changing its earlier verified result', {
  tags: ['technical'],
}, async () => {
  const before = await read();
  const changed = batch();
  changed.operations[0].arguments.value.name = 'Ett annat uppdrag';
  expect(await tool('apply_draft_batch', changed)).toMatchObject({
    error: true,
    value: { error: 'operation_conflict' },
  });
  expect(await read()).toEqual(before);
  expect(
    (await tool('read_draft_batch', { operationId: batch().operationId, contentVersion: 1 })).value
      .batch,
  ).toMatchObject({
    operationId: batch().operationId,
    status: 'committed',
    fromVersion: 0,
    version: 1,
    currentDraft: true,
  });
});

test('a real evidence-insert failure rolls back the entire later batch and leaves prior committed work recoverable', {
  tags: ['technical'],
}, async () => {
  const before = await read();
  const next = {
    operationId: 'blocked-evidence',
    version: 1,
    contentVersion: 1,
    operations: [
      {
        name: 'propose_object',
        arguments: {
          id: 'kim',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Kim' },
        },
      },
    ],
  };
  const storage = new Database(join(app.directory, 'skyttel.db'));
  storage.exec(
    "CREATE TRIGGER evidence_unavailable BEFORE INSERT ON draft_batch_outcome WHEN NEW.operationId = 'blocked-evidence' BEGIN SELECT RAISE(ABORT, 'controlled evidence outage'); END",
  );
  storage.close();
  expect(await tool('apply_draft_batch', next)).toMatchObject({
    error: true,
    value: { error: 'result_unknown' },
  });
  expect(await read()).toEqual(before);
  browser = await restartWithSession(browser, () => app.restart());
  token = await connect();
  expect(
    await tool('read_draft_batch', { operationId: next.operationId, contentVersion: 1 }),
  ).toEqual({ error: false, value: { batch: null } });
  expect(
    (await tool('read_draft_batch', { operationId: batch().operationId, contentVersion: 1 })).value
      .batch,
  ).toMatchObject({ status: 'committed', version: 1, currentDraft: true });
  const repaired = new Database(join(app.directory, 'skyttel.db'));
  repaired.exec('DROP TRIGGER evidence_unavailable');
  repaired.close();
  expect((await tool('apply_draft_batch', next)).error).toBe(false);
  const current = await read();
  expect(current.draft).toMatchObject({ version: 2, changes: [{ id: 'lo' }, { id: 'kim' }] });
  expect((await tool('apply_draft_batch', next)).value).toMatchObject({
    operationId: next.operationId,
    status: 'committed',
    version: 2,
  });
  expect(await read()).toEqual(current);
  expect((await (await browser.get(`${base()}/map/history`)).json()).history).toEqual([]);
});

test('actor, household, current owner and access are checked before prior batch outcomes can be used', {
  tags: ['technical'],
}, async () => {
  const original = await read();
  const { user: actor } = await (await browser.get(`${app.origin}/api/bootstrap`)).json();
  app.seedMembership(actor.id, 'other-household', 'Annat hushåll', 'administrator');
  expect(
    (
      await tool(
        'read_draft_batch',
        { operationId: batch().operationId, contentVersion: 1 },
        await connect(browser, 'other-household'),
      )
    ).value,
  ).toEqual({ batch: null });
  app.setIdentity(robin);
  const member = await request.newContext();
  clients.push(member);
  await signIn(member, app.origin);
  const { user } = await (await member.get(`${app.origin}/api/bootstrap`)).json();
  const { code } = await (await post('invitations', { userId: user.id })).json();
  expect(
    (
      await member.post(`${app.origin}/api/invitations/accept`, {
        headers: { origin: app.origin },
        data: { code },
      })
    ).status(),
  ).toBe(200);
  const memberToken = await connect(member);
  expect(
    (
      await tool(
        'read_draft_batch',
        { operationId: batch().operationId, contentVersion: 1 },
        memberToken,
      )
    ).value,
  ).toEqual({ batch: null });
  expect(await read()).toEqual(original);
  const changed = await post('content-owners/assign', {
    contentVersion: 1,
    identityId: original.userId,
    userId: user.id,
    confirmed: true,
  });
  expect(changed.status(), await changed.text()).toBe(200);
  expect(
    (
      await tool(
        'read_draft_batch',
        { operationId: batch().operationId, contentVersion: 1 },
        memberToken,
      )
    ).value,
  ).toMatchObject({ error: 'content_conflict' });
  expect(
    (
      await tool(
        'read_draft_batch',
        { operationId: batch().operationId, contentVersion: 2 },
        memberToken,
      )
    ).value,
  ).toEqual({ batch: null });
  expect(
    await tool('apply_draft_batch', { ...batch(), contentVersion: 2, version: 1 }, memberToken),
  ).toMatchObject({ error: true, value: { error: 'content_conflict' } });
  app.revokeMembership(user.id);
  expect(
    (
      await callAssistant(app.origin, memberToken, 'read_draft_batch', {
        operationId: batch().operationId,
        contentVersion: 2,
      })
    ).status,
  ).toBe(401);
});

test.each(['import', 'permanent erasure'] as const)(
  'a real %s retires prior batch identities and cannot replay them against replacement content',
  {
    tags: ['technical'],
  },
  async (transition) => {
    if (transition === 'import') {
      const exported = await post('exports', {});
      expect(exported.status()).toBe(201);
      const prepared = await exported.json();
      const archive = await (await browser.get(`${base()}/exports/${prepared.id}`)).body();
      expect(Buffer.from(unzipSync(archive)['content.json']).toString()).not.toContain(
        batch().operationId,
      );
      const upload = await browser.post(`${base()}/imports`, {
        headers: {
          origin: app.origin,
          'content-type': 'application/zip',
          'X-Skyttel-Content-Version': '1',
        },
        data: archive,
      });
      expect(upload.status(), await upload.text()).toBe(201);
      const ready = await upload.json();
      expect(
        (
          await post(`imports/${ready.id}/confirm`, {
            confirmed: true,
            contentVersion: ready.contentVersion,
          })
        ).status(),
      ).toBe(200);
    } else {
      const selection = [{ kind: 'objectType', id: initial.types[0].id }];
      const review = await post('erasure/review', { selection });
      expect(review.status()).toBe(200);
      const { token: confirmation } = await review.json();
      const erased = await post('erasure/execute', {
        selection,
        token: confirmation,
        operationId: 'erase-batch-subject',
        confirmation: 'RADERA PERMANENT',
      });
      expect(erased.status(), await erased.text()).toBe(200);
    }
    browser = await restartWithSession(browser, () => app.restart());
    token = await connect();
    const current = await read();
    expect(current.contentVersion).toBe(2);
    expect(
      (await tool('read_draft_batch', { operationId: batch().operationId, contentVersion: 1 }))
        .value,
    ).toMatchObject({ error: 'content_conflict' });
    expect(
      (await tool('read_draft_batch', { operationId: batch().operationId, contentVersion: 2 }))
        .value,
    ).toEqual({ batch: null });
    expect(
      await tool('apply_draft_batch', {
        ...batch(),
        version: current.draft.version,
        contentVersion: 2,
      }),
    ).toMatchObject({ error: true, value: { error: 'content_conflict' } });
    expect(await read()).toEqual(current);
  },
);
