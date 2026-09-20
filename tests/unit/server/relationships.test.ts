import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState, ObjectValue, RelationshipValue } from '../../../src/shared/map.js';
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
async function read(actor = client): Promise<MapState> {
  return (await actor.request(path)).json();
}
async function object(id: string, value: Partial<ObjectValue> | null = {}, actor = client) {
  const state = await read(actor);
  return actor.json(`${path}/draft`, {
    version: state.draft.version,
    id,
    baseRevision: state.objects.find((item) => item.id === id)?.revision ?? null,
    value:
      value === null ? null : { typeId: state.types[0].id, name: id, description: '', ...value },
  });
}
async function edge(id = 'edge', value: Partial<RelationshipValue> | null = {}, actor = client) {
  const state = await read(actor);
  return actor.json(`${path}/relationship`, {
    version: state.draft.version,
    id,
    baseRevision: state.relationships.find((item) => item.id === id)?.revision ?? null,
    value:
      value === null
        ? null
        : {
            typeId: state.relationshipTypes[0].id,
            sourceId: 'a',
            targetId: 'b',
            knowledge: 'known',
            ...value,
          },
  });
}
async function save(actor = client) {
  return actor.json(`${path}/save`, {
    version: (await read(actor)).draft.version,
    operationId: crypto.randomUUID(),
  });
}
async function member() {
  fixture.setSubject('second-person');
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  await actor.json('/api/invitations/accept', { code });
  return actor;
}

test('object deletion previews all relationship removals and rejects newly attached edges', async () => {
  await object('a');
  await object('b');
  await edge();
  expect((await save()).status).toBe(200);
  await object('a', null);
  const draft = (await read()).draft;
  expect(draft.relationships).toMatchObject([
    { id: 'edge', before: { sourceId: 'a', targetId: 'b' }, after: null },
  ]);
  const actor = await member();
  const state = await read(actor);
  await edge('new-edge', { typeId: state.relationshipTypes[1].id }, actor);
  await save(actor);
  expect((await save()).status).toBe(409);
  expect((await read()).objects).toHaveLength(2);
  expect((await read()).relationships).toHaveLength(2);
});

test('independent roles and shared endpoints survive edits, deletion and receipt retries', async () => {
  await object('a', { name: 'Samma namn' });
  await object('b', { name: 'Samma namn' });
  const state = await read();
  expect((await edge()).status).toBe(200);
  const duplicate = await (await edge('duplicate')).json();
  expect(duplicate.existingId).toBe('edge');
  expect((await edge('other-role', { typeId: state.relationshipTypes[1].id })).status).toBe(200);
  expect((await edge('reverse', { sourceId: 'b', targetId: 'a' })).status).toBe(200);
  const body = { version: (await read()).draft.version, operationId: 'save-family' };
  const result = await (await client.json(`${path}/save`, body)).json();
  expect((await read()).relationships).toHaveLength(3);
  expect(await (await client.json(`${path}/save`, body)).json()).toEqual(result);
  expect((await edge('duplicate')).status).toBe(200);
  expect((await read()).draft.relationships).toBeUndefined();
  expect((await edge('other-role')).status).toBe(409);
  expect((await edge('edge', { knowledge: 'uncertain' })).status).toBe(200);
  const { receipt } = await (await save()).json();
  expect(receipt.relationships[0]).toMatchObject({
    before: { id: 'edge', knowledge: 'known' },
    after: { id: 'edge', knowledge: 'uncertain', revision: 2 },
  });
  await object('a', { name: 'Rättat namn', typeId: state.types[1].id });
  expect((await save()).status).toBe(200);
  expect((await read()).relationships).toHaveLength(3);
  await edge('reverse', null);
  expect((await save()).status).toBe(200);
  await object('a', null);
  expect((await read()).draft.relationships).toHaveLength(2);
  expect((await save()).status).toBe(200);
  expect((await read()).relationships).toEqual([]);
  expect((await read()).objects.map((value) => value.id)).toEqual(['b']);
});

test('unknown, none, uncertain and unspecified remain distinct, unresolved blocks the whole save', async () => {
  await object('a');
  await object('b', { identity: 'unresolved' });
  await edge();
  expect((await save()).status).toBe(409);
  expect((await read()).objects).toEqual([]);
  await object('b', { identity: 'unspecified' });
  expect((await save()).status).toBe(200);
  expect((await read()).objects.find((value) => value.id === 'b')?.identity).toBe('unspecified');
  for (const knowledge of ['unknown', 'none', 'unresolved'] as const) {
    expect((await edge('edge', { knowledge, targetId: null })).status).toBe(200);
    const saved = await save();
    expect(saved.status).toBe(knowledge === 'unresolved' ? 409 : 200);
    if (knowledge !== 'unresolved')
      expect((await read()).relationships[0]).toMatchObject({ knowledge, targetId: null });
  }
  await edge('edge', { knowledge: 'uncertain' });
  expect((await save()).status).toBe(200);
  expect((await read()).relationships[0]).toMatchObject({ knowledge: 'uncertain', targetId: 'b' });
  await object('b', { identity: undefined });
  expect((await save()).status).toBe(200);
  expect((await read()).objects.find((value) => value.id === 'b')).not.toHaveProperty('identity');
});

test('private concurrent additions cannot create duplicates or partly save unrelated objects', async () => {
  await object('a');
  await object('b');
  await save();
  const actor = await member();
  await edge();
  expect((await read(actor)).draft.relationships).toBeUndefined();
  await edge('other-id', {}, actor);
  await object('private-object', {}, actor);
  expect((await save()).status).toBe(200);
  expect((await save(actor)).status).toBe(409);
  expect((await read(actor)).objects).toHaveLength(2);
  expect((await read(actor)).draft.changes).toHaveLength(1);
  expect((await read()).relationships).toHaveLength(1);
  await client.json(`${path}/discard`, { version: (await read()).draft.version });
  await edge('edge', { knowledge: 'uncertain' });
  await actor.json(`${path}/discard`, { version: (await read(actor)).draft.version });
  await edge('edge', { knowledge: 'none', targetId: null }, actor);
  await save(actor);
  expect((await save()).status).toBe(409);
});

test('relationship writes validate endpoints, types, knowledge and request access', async () => {
  await object('a');
  await object('b');
  for (const value of [
    { sourceId: 'foreign' },
    { targetId: 'foreign' },
    { typeId: 'foreign' },
    { knowledge: 'none', targetId: 'b' },
    { knowledge: 'known', targetId: null },
    { knowledge: 'invented' },
  ]) {
    expect((await edge('edge', value as Partial<RelationshipValue>)).status).toBe(400);
  }
  const version = (await read()).draft.version;
  for (const body of [
    { id: '', value: null },
    { id: 'edge' },
    { id: 'edge', value: null },
    { id: 'edge', value: [] },
  ]) {
    expect(
      (await client.json(`${path}/relationship`, { version, baseRevision: null, ...body })).status,
    ).toBe(400);
  }
  expect(
    (
      await client.json(`${path}/relationship`, {
        version: 0,
        id: 'edge',
        baseRevision: null,
        value: null,
      })
    ).status,
  ).toBe(409);
  expect((await fixture.client().json(`${path}/relationship`, {})).status).toBe(401);
  expect((await client.json('/api/households/foreign/map/relationship', {})).status).toBe(403);
  expect(
    (
      await client.request(`${path}/relationship`, {
        method: 'POST',
        headers: { origin: 'https://foreign.test' },
        body: '{}',
      })
    ).status,
  ).toBe(403);
  expect((await object('invalid', { identity: 'other' } as unknown as ObjectValue)).status).toBe(
    400,
  );
  await edge();
  await edge('edge', null);
  expect((await read()).draft.relationships).toBeUndefined();
  await edge();
  // Change a household definition as a concurrent catalog edit; assert only through HTTP.
  fixture.database
    .prepare('UPDATE relationship_type SET revision = revision + 1 WHERE id = ?')
    .run((await read()).relationshipTypes[0].id);
  expect((await save()).status).toBe(409);
  expect((await read()).objects).toEqual([]);
});

test('a failed receipt rolls back relationships with objects and preserves the complete private draft', async () => {
  await object('a');
  await object('b');
  await edge();
  fixture.database.exec(
    "CREATE TRIGGER fail_family_receipt BEFORE INSERT ON map_save BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
  );
  expect((await save()).status).toBe(500);
  expect((await read()).relationships).toEqual([]);
  expect((await read()).objects).toEqual([]);
  expect((await read()).draft.relationships).toHaveLength(1);
  fixture.database.exec('DROP TRIGGER fail_family_receipt');
  expect((await save()).status).toBe(200);
  expect((await read()).relationships).toHaveLength(1);
});

test('foreign household objects and types cannot be linked, and revoked members cannot submit relationships', async () => {
  const actor = await member();
  await object('a');
  await object('b');
  await save();
  fixture.database
    .prepare('INSERT INTO household VALUES (?, ?, ?)')
    .run('foreign-household', 'Annat hushåll', '2026-01-01');
  fixture.database
    .prepare('INSERT INTO object_type VALUES (?, ?, ?, ?, ?)')
    .run('foreign-type', 'foreign-household', 1, 'Person', '');
  fixture.database
    .prepare(
      'INSERT INTO map_object (id, householdId, typeId, revision, name, description) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('foreign-person', 'foreign-household', 'foreign-type', 1, 'Alex', '');
  fixture.database
    .prepare('INSERT INTO relationship_type VALUES (?, ?, ?, ?, ?)')
    .run('foreign-relationship-type', 'foreign-household', 1, 'Använder', '');
  for (const value of [
    { sourceId: 'foreign-person' },
    { targetId: 'foreign-person' },
    { typeId: 'foreign-relationship-type' },
  ]) {
    expect((await edge('edge', value)).status).toBe(400);
  }
  const { user } = await (await actor.request('/api/bootstrap')).json();
  await client.json(`${path.replace('/map', '')}/members/${user.id}/revoke`, {});
  expect(
    (
      await actor.json(`${path}/relationship`, {
        version: 0,
        id: 'revoked',
        baseRevision: null,
        value: null,
      })
    ).status,
  ).toBe(403);
  expect((await read()).relationships).toEqual([]);
});
