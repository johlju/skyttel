import { afterEach, beforeEach, expect, test } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;

beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
});
afterEach(() => fixture.close());

async function read(actor = client) {
  return (await actor.request(path)).json();
}

async function propose() {
  const state = await read();
  return client.json(`${path}/draft`, {
    version: state.draft.version,
    id: 'synthetic-person',
    baseRevision: null,
    value: {
      typeId: state.types[0].id,
      name: 'Lo Exempel',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Påhittad person' },
      ],
    },
  });
}

test('a registered save is discoverable by the same user on another client before applying it', async () => {
  await propose();
  const body = { operationId: 'registered-save', version: 1, contentVersion: 1 };
  const response = await client.json(`${path}/operations`, body);
  expect(response.status).toBe(200);
  const { operation } = await response.json();
  expect(operation).toMatchObject({
    operationId: body.operationId,
    draftVersion: 1,
    contentVersion: 1,
    status: 'pending',
  });
  const second = fixture.client();
  await second.signIn();
  expect(await (await second.request(`${path}/operations`)).json()).toEqual({
    operations: [operation],
  });
  expect(await (await second.request(`${path}/operations/${body.operationId}`)).json()).toEqual({
    operation,
  });
  expect(await (await second.request(`${path}/operations/missing`)).json()).toEqual({
    operation: null,
  });
  expect((await read()).objects).toEqual([]);
  expect((await read()).draft.version).toBe(1);
});

test('pending saves protect their draft until the durable receipt resolves them exactly once', async () => {
  await propose();
  const body = { operationId: 'retry-save', version: 1, contentVersion: 1 };
  await client.json(`${path}/operations`, body);
  const blocked = await client.json(`${path}/discard`, { version: 1 });
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toEqual({ error: 'operation_pending' });
  expect(await (await propose()).json()).toEqual({ error: 'operation_pending' });
  const saved = await client.json(`${path}/save`, body);
  expect(saved.status).toBe(200);
  const { receipt } = await saved.json();
  const state = await read();
  expect(receipt).toMatchObject({
    operationId: 'retry-save',
    userId: state.userId,
    contentVersion: state.contentVersion,
    draftVersion: 1,
  });
  expect(state.objects).toEqual([receipt.changes[0].after]);
  expect(state.draft).toEqual({ version: 2, changes: [] });
  expect(await (await client.request(`${path}/history`)).json()).toEqual({ history: [receipt] });
  expect(await (await client.json(`${path}/save`, body)).json()).toEqual({ receipt });
  expect(
    (await (await client.request(`${path}/operations/retry-save`)).json()).operation,
  ).toMatchObject({
    status: 'succeeded',
    receipt,
  });
  expect((await client.json(`${path}/save`, { ...body, version: 2 })).status).toBe(409);
  expect((await read()).draft.version).toBe(2);
  expect((await (await client.request(`${path}/history`)).json()).history).toHaveLength(1);
});

test('a stale registration is a durable rejection and does not lock the current draft', async () => {
  await propose();
  const body = { operationId: 'stale-save', version: 0, contentVersion: 1 };
  const response = await client.json(`${path}/operations`, body);
  expect(response.status).toBe(200);
  const { operation } = await response.json();
  expect(operation).toMatchObject({ status: 'rejected', error: 'draft_conflict' });
  expect((await client.json(`${path}/discard`, { version: 1 })).status).toBe(200);
  expect(await (await client.request(`${path}/operations/stale-save`)).json()).toEqual({
    operation,
  });
  const retried = await client.json(`${path}/save`, body);
  expect(retried.status).toBe(409);
  expect(await retried.json()).toEqual({ error: 'draft_conflict' });
  expect((await read()).draft.version).toBe(2);
  expect((await read()).objects).toEqual([]);
});

test('a content generation retires attempts without deleting historical receipts', async () => {
  await propose();
  const savedBody = { operationId: 'old-save', version: 1, contentVersion: 1 };
  const { receipt } = await (await client.json(`${path}/save`, savedBody)).json();
  await client.json(`${path}/operations`, {
    operationId: 'pending-old-generation',
    version: 2,
    contentVersion: 1,
  });
  expect(() =>
    fixture.database.transaction(() => {
      fixture.database
        .prepare('UPDATE household SET contentVersion = contentVersion + 1 WHERE id = ?')
        .run(receipt.householdId);
      throw new Error('Synthetic replacement failure');
    })(),
  ).toThrow('Synthetic replacement failure');
  expect((await read()).contentVersion).toBe(1);
  expect(await (await client.request(`${path}/history`)).json()).toEqual({ history: [receipt] });
  expect(
    (await (await client.request(`${path}/operations/pending-old-generation`)).json()).operation,
  ).toMatchObject({ status: 'pending' });
  // Future import/purge owns this transaction; exercise its generation boundary.
  fixture.database
    .transaction(() => {
      fixture.database
        .prepare('DELETE FROM map_object WHERE householdId = ?')
        .run(receipt.householdId);
      fixture.database
        .prepare('UPDATE household SET contentVersion = contentVersion + 1 WHERE id = ?')
        .run(receipt.householdId);
    })
    .immediate();
  expect(await read()).toMatchObject({
    contentVersion: 2,
    objects: [],
    draft: { version: 2, changes: [] },
  });
  expect(await (await client.request(`${path}/operations`)).json()).toEqual({ operations: [] });
  expect(await (await client.request(`${path}/operations/old-save`)).json()).toEqual({
    operation: null,
  });
  expect(await (await client.request(`${path}/history`)).json()).toEqual({ history: [receipt] });
  for (const body of [savedBody, { operationId: 'old-save', version: 1 }]) {
    const retry = await client.json(`${path}/save`, body);
    expect(retry.status).toBe(409);
    expect(await retry.json()).toEqual({ error: 'content_conflict' });
  }
  const reused = await client.json(`${path}/save`, { ...savedBody, contentVersion: 2 });
  expect(reused.status).toBe(409);
  expect(await reused.json()).toEqual({ error: 'content_conflict' });
  expect(() =>
    fixture.database
      .prepare('UPDATE household SET contentVersion = 1 WHERE id = ?')
      .run(receipt.householdId),
  ).toThrow('content_version_must_increase');
});

test('operation registration rejects malformed identity and additional request content', async () => {
  await propose();
  const body = { operationId: 'exact-request', version: 1, contentVersion: 1 };
  for (const invalid of [
    { ...body, contentVersion: null },
    { ...body, contentVersion: '1' },
    { ...body, contentVersion: 0 },
    { ...body, version: null },
    { ...body, version: -1 },
    { ...body, operationId: '' },
    { ...body, changes: [] },
  ]) {
    expect((await client.json(`${path}/operations`, invalid)).status).toBe(400);
    expect((await client.json(`${path}/save`, invalid)).status).toBe(400);
  }
  expect(await (await client.request(`${path}/operations`)).json()).toEqual({ operations: [] });
});

test('a failed durable write leaves a discoverable pending operation and an intact draft', async () => {
  await propose();
  const initial = await read();
  const properties = [
    { id: 'empty', label: 'Samma' },
    { id: 'typed', label: 'Samma', kind: 'date' },
    { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
    { id: 'false', label: 'Samma', kind: 'boolean', value: false },
  ];
  expect(
    (
      await client.json(`${path}/draft`, {
        version: initial.draft.version,
        id: 'synthetic-person',
        baseRevision: null,
        value: { ...initial.draft.changes[0].after, properties },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await client.json(`${path}/relationship`, {
        version: (await read()).draft.version,
        id: 'self',
        baseRevision: null,
        value: {
          typeId: initial.relationshipTypes[0].id,
          sourceId: 'synthetic-person',
          targetId: 'synthetic-person',

          properties,
        },
      })
    ).status,
  ).toBe(200);
  const before = await read();
  const body = {
    operationId: 'write-interrupted',
    version: before.draft.version,
    contentVersion: 1,
  };
  fixture.database.exec(
    "CREATE TRIGGER interrupt_receipt BEFORE INSERT ON map_save BEGIN SELECT RAISE(ABORT, 'synthetic interruption'); END",
  );
  expect((await client.json(`${path}/save`, body)).status).toBe(500);
  const second = fixture.client();
  await second.signIn();
  expect((await (await second.request(`${path}/operations`)).json()).operations).toMatchObject([
    { operationId: body.operationId, status: 'pending' },
  ]);
  expect(await read(second)).toEqual(before);
  expect(before.objects).toEqual([]);
  expect(before.relationships).toEqual([]);
  expect(await (await second.request(`${path}/history`)).json()).toEqual({ history: [] });
  fixture.database.exec('DROP TRIGGER interrupt_receipt');
  await fixture.restart();
  const saved = await second.json(`${path}/save`, body);
  expect(saved.status).toBe(200);
  const { receipt } = await saved.json();
  const after = await read(second);
  expect(after.objects).toEqual([receipt.changes[0].after]);
  expect(after.objects[0].properties).toEqual(properties);
  expect(after.relationships).toEqual([receipt.relationships[0].after]);
  expect(after.relationships[0].properties).toEqual(properties);
  expect(after.draft).toEqual({ version: before.draft.version + 1, changes: [] });
  expect(await (await second.request(`${path}/history`)).json()).toEqual({ history: [receipt] });
  expect(await (await second.json(`${path}/save`, body)).json()).toEqual({ receipt });
  expect(await read(second)).toEqual(after);
});

test('a changed draft snapshot under the same version is rejected durably without consuming it', async () => {
  await propose();
  const state = await read();
  const body = { operationId: 'bound-content', version: 1, contentVersion: 1 };
  await client.json(`${path}/operations`, body);
  // Simulate invalid same-version replacement by a future importer or another writer.
  fixture.database
    .prepare(
      "UPDATE map_draft SET changes = json_set(changes, '$[0].after.name', 'Changed content') WHERE userId = ?",
    )
    .run(state.userId);
  const rejected = await client.json(`${path}/save`, body);
  expect(rejected.status).toBe(409);
  expect(await rejected.json()).toEqual({ error: 'operation_conflict' });
  const operation = (await (await client.request(`${path}/operations/bound-content`)).json())
    .operation;
  expect(operation).toMatchObject({ status: 'rejected', error: 'operation_conflict' });
  expect(await read()).toMatchObject({ objects: [], draft: { version: 1 } });
  expect((await client.json(`${path}/discard`, { version: 1 })).status).toBe(200);
  expect(await (await client.json(`${path}/save`, body)).json()).toEqual({
    error: 'operation_conflict',
  });
  expect((await read()).draft.version).toBe(2);
});

test('operation status is private to its actor and current membership applies to reads and retries', async () => {
  await propose();
  const body = { operationId: 'private-attempt', version: 1, contentVersion: 1 };
  await client.json(`${path}/save`, body);
  fixture.setSubject('second-person');
  const second = fixture.client();
  await second.signIn();
  const { user } = await (await second.request('/api/bootstrap')).json();
  const base = path.replace('/map', '');
  const { code } = await (await client.json(`${base}/invitations`, { userId: user.id })).json();
  await second.json('/api/invitations/accept', { code });
  expect(await (await second.request(`${path}/operations`)).json()).toEqual({ operations: [] });
  expect(await (await second.request(`${path}/operations/private-attempt`)).json()).toEqual({
    operation: null,
  });
  const own = { operationId: 'private-attempt', version: 0, contentVersion: 1 };
  expect((await second.json(`${path}/save`, own)).status).toBe(409);
  expect(
    (await (await second.request(`${path}/operations/private-attempt`)).json()).operation,
  ).toMatchObject({ status: 'rejected', error: 'empty_draft', userId: user.id });
  await client.json(`${base}/members/${user.id}/revoke`, {});
  const anonymous = fixture.client();
  for (const target of [
    `${path}/operations`,
    `${path}/operations/private-attempt`,
    `${path}/operations/missing`,
  ]) {
    expect((await second.request(target)).status).toBe(403);
    expect((await anonymous.request(target)).status).toBe(401);
  }
  for (const action of ['operations', 'save'])
    expect((await second.json(`${path}/${action}`, own)).status).toBe(403);
});

test('recent discovery includes all pending attempts and twenty terminal results while older IDs remain readable', async () => {
  await propose();
  for (let index = 0; index < 23; index++)
    await client.json(`${path}/operations`, { operationId: `stale-${index}`, version: 0 });
  await client.json(`${path}/operations`, { operationId: 'pending-now', version: 1 });
  const { operations } = await (await client.request(`${path}/operations`)).json();
  expect(operations).toHaveLength(21);
  expect(
    operations.filter((operation: { status: string }) => operation.status === 'pending'),
  ).toMatchObject([{ operationId: 'pending-now' }]);
  expect(
    (await (await client.request(`${path}/operations/stale-0`)).json()).operation,
  ).toMatchObject({ status: 'rejected', error: 'draft_conflict' });
});
