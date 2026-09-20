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
  const response = await actor.request(path);
  expect(response.status).toBe(200);
  return response.json();
}

async function propose(name = 'Lo Exempel', id = 'synthetic-person', actor = client) {
  const state = await read(actor);
  const before = state.objects.find((object: { id: string }) => object.id === id);
  return actor.json(`${path}/draft`, {
    version: state.draft.version,
    id,
    baseRevision: before?.revision ?? null,
    value: { typeId: state.types[0].id, name, description: 'Påhittad person' },
  });
}

async function member() {
  fixture.setSubject('second-person');
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const invitation = await client.json(`${path.replace('/map', '')}/invitations`, {
    userId: user.id,
  });
  const { code } = await invitation.json();
  await actor.json('/api/invitations/accept', { code });
  return { actor, userId: user.id };
}

test('a proposal persists privately until the whole draft is saved with a receipt', async () => {
  const response = await client.request(path);
  expect(response.status).toBe(200);
  const initial = await response.json();
  expect(initial.objects).toEqual([]);
  expect(initial.draft).toEqual({ version: 0, changes: [] });
  const type = initial.types[0];
  expect(type.name).toBe('Person');
  const proposed = await client.json(`${path}/draft`, {
    version: 0,
    id: 'synthetic-person',
    baseRevision: null,
    value: { typeId: type.id, name: 'Lo Exempel', description: 'Påhittad person' },
  });
  expect(proposed.status).toBe(200);
  const draft = await proposed.json();
  expect(draft.version).toBe(1);
  expect((await (await client.request(path)).json()).draft).toEqual(draft);
  expect((await (await client.request(path)).json()).objects).toEqual([]);
  const saved = await client.json(`${path}/save`, { version: 1, operationId: 'save-person' });
  expect(saved.status).toBe(200);
  const { receipt } = await saved.json();
  expect(receipt).toMatchObject({ operationId: 'save-person', draftVersion: 1 });
  expect(receipt.changes[0]).toMatchObject({
    before: null,
    after: { name: 'Lo Exempel', revision: 1 },
  });
  const current = await (await client.request(path)).json();
  expect(current.objects).toEqual([receipt.changes[0].after]);
  expect(current.draft).toEqual({ version: 2, changes: [] });
});

test('drafts are private and survive a new login; stale edits and discards cannot overwrite them', async () => {
  const { actor } = await member();
  await propose();
  expect((await read(actor)).draft).toEqual({ version: 0, changes: [] });
  fixture.setSubject(fixture.config.firstAdmin.subject);
  const anotherClient = fixture.client();
  await anotherClient.signIn();
  expect((await read(anotherClient)).draft).toEqual((await read()).draft);
  expect((await client.json(`${path}/discard`, { version: 0 })).status).toBe(409);
  expect(
    (
      await client.json(`${path}/draft`, {
        version: 0,
        id: 'synthetic-person',
        baseRevision: null,
        value: null,
      })
    ).status,
  ).toBe(409);
  expect(
    (await client.json(`${path}/save`, { version: 0, operationId: 'old-version' })).status,
  ).toBe(409);
  expect((await read()).draft.version).toBe(1);
  expect((await client.json(`${path}/discard`, { version: 1 })).status).toBe(200);
  expect((await read()).objects).toEqual([]);
});

test('a receipt is durable and an operation ID cannot be reused for changed content', async () => {
  await propose();
  const body = { version: 1, operationId: 'same-operation' };
  const first = await (await client.json(`${path}/save`, body)).json();
  await propose('Lo Lind');
  expect(await (await client.json(`${path}/save`, body)).json()).toEqual(first);
  expect((await client.json(`${path}/save`, { ...body, version: 3 })).status).toBe(409);
  expect((await read()).objects[0].name).toBe('Lo Exempel');
  expect((await read()).draft.version).toBe(3);
  // Extra content must not be silently treated as the original request.
  expect((await client.json(`${path}/save`, { ...body, changes: [] })).status).toBe(400);
});

test('concurrent changes reject the entire save and preserve independent proposals', async () => {
  await propose();
  await client.json(`${path}/save`, { version: 1, operationId: 'initial' });
  const { actor } = await member();
  await propose('Lo Lind');
  await propose('Alex Exempel', 'other-person');
  await propose('Lo Berg', 'synthetic-person', actor);
  await actor.json(`${path}/save`, { version: 1, operationId: 'other-save' });
  const blocked = await client.json(`${path}/save`, { version: 4, operationId: 'blocked' });
  expect(blocked.status).toBe(409);
  expect(await blocked.json()).toEqual({ error: 'object_conflict' });
  const state = await read();
  expect(state.objects.map((object: { name: string }) => object.name)).toEqual(['Lo Berg']);
  expect(state.draft.changes).toHaveLength(2);
  expect(state.draft.version).toBe(4);
});

test('a failed receipt write rolls back objects, history and draft consumption', async () => {
  await propose();
  // Inject an actual SQLite write failure at the final transactional write.
  fixture.database.exec(
    "CREATE TRIGGER fail_receipt BEFORE INSERT ON map_save BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END",
  );
  expect((await client.json(`${path}/save`, { version: 1, operationId: 'retry' })).status).toBe(
    500,
  );
  expect((await read()).objects).toEqual([]);
  expect((await read()).draft.version).toBe(1);
  fixture.database.exec('DROP TRIGGER fail_receipt');
  expect((await client.json(`${path}/save`, { version: 1, operationId: 'retry' })).status).toBe(
    200,
  );
  const history = await client.request(`${path}/history`);
  expect(history.status).toBe(200);
  expect((await history.json()).history).toHaveLength(1);
});

test('deletion keeps prior values and actor in history, while discard leaves the map alone', async () => {
  await propose();
  await client.json(`${path}/save`, { version: 1, operationId: 'create' });
  const original = (await read()).objects[0];
  await client.json(`${path}/draft`, { version: 2, id: original.id, baseRevision: 1, value: null });
  await client.json(`${path}/discard`, { version: 3 });
  expect((await read()).objects).toEqual([original]);
  await client.json(`${path}/draft`, { version: 4, id: original.id, baseRevision: 1, value: null });
  const { receipt } = await (
    await client.json(`${path}/save`, { version: 5, operationId: 'delete' })
  ).json();
  expect(receipt.changes[0]).toMatchObject({ before: original, after: null });
  expect((await read()).objects).toEqual([]);
  const { history } = await (await client.request(`${path}/history`)).json();
  expect(history[1]).toEqual(receipt);
});

test('all map operations enforce current household membership and request boundaries', async () => {
  const { actor, userId } = await member();
  await propose('Robin Exempel', 'member-person', actor);
  await client.json(`${path.replace('/map', '')}/members/${userId}/revoke`, {});
  const anonymous = fixture.client();
  for (const target of [path, `${path}/history`]) {
    expect((await actor.request(target)).status).toBe(403);
    expect((await anonymous.request(target)).status).toBe(401);
    expect(
      (await client.request(target.replace(/households\/[^/]+/, 'households/other'))).status,
    ).toBe(403);
  }
  for (const action of ['draft', 'discard', 'save']) {
    const target = `${path}/${action}`;
    expect((await actor.json(target, { version: 1, operationId: 'revoked' })).status).toBe(403);
    expect((await anonymous.json(target, {})).status).toBe(401);
    expect(
      (
        await client.request(target, {
          method: 'POST',
          headers: { origin: 'https://elsewhere.test' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await client.request(target, {
          method: 'POST',
          headers: { origin: fixture.config.origin },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    for (const body of ['null', '[]', '{']) {
      expect(
        (
          await client.request(target, {
            method: 'POST',
            headers: { origin: fixture.config.origin, 'content-type': 'application/json' },
            body,
          })
        ).status,
      ).toBe(400);
    }
  }
});

test('invalid objects and changed type definitions cannot enter the shared map', async () => {
  const { types } = await read();
  const body = {
    version: 0,
    id: 'new-object',
    baseRevision: null,
    value: { typeId: types[0].id, name: 'Lo', description: '' },
  };
  for (const name of ['', ' ', 42, 'x'.repeat(201)]) {
    expect(
      (await client.json(`${path}/draft`, { ...body, value: { ...body.value, name } })).status,
    ).toBe(400);
  }
  for (const value of [
    undefined,
    {},
    { ...body.value, typeId: 'missing' },
    { ...body.value, description: 'x'.repeat(2001) },
  ]) {
    expect((await client.json(`${path}/draft`, { ...body, value })).status).toBe(400);
  }
  for (const version of [-1, 0.5, null, '0']) {
    expect((await client.json(`${path}/discard`, { version })).status).toBe(400);
  }
  expect((await client.json(`${path}/draft`, { ...body, id: '' })).status).toBe(400);
  expect((await client.json(`${path}/save`, { version: 0, operationId: '' })).status).toBe(400);
  expect((await client.json(`${path}/save`, { version: 0, operationId: 'empty' })).status).toBe(
    409,
  );
  await propose();
  fixture.database
    .prepare('UPDATE object_type SET revision = revision + 1 WHERE id = ?')
    .run(types[0].id);
  expect(
    (await client.json(`${path}/save`, { version: 1, operationId: 'changed-type' })).status,
  ).toBe(409);
  expect((await read()).objects).toEqual([]);
});

test('shared history does not expose abandoned private relationship endpoint names', async () => {
  await propose('Lo', 'lo');
  await propose('Kim', 'kim');
  await client.json(`${path}/save`, { version: 2, operationId: 'seed' });
  const { actor } = await member();
  await propose('Private abandoned name', 'private');
  let state = await read();
  const value = {
    typeId: state.relationshipTypes[0].id,
    sourceId: 'lo',
    targetId: 'private',
    knowledge: 'known',
  };
  expect(
    (
      await client.json(`${path}/relationship`, {
        version: state.draft.version,
        id: 'link',
        baseRevision: null,
        value,
      })
    ).status,
  ).toBe(200);
  state = await read();
  expect(
    (
      await client.json(`${path}/relationship`, {
        version: state.draft.version,
        id: 'link',
        baseRevision: null,
        value: { ...value, targetId: 'kim' },
      })
    ).status,
  ).toBe(200);
  state = await read();
  await client.json(`${path}/draft`, {
    version: state.draft.version,
    id: 'private',
    baseRevision: null,
    value: null,
  });
  state = await read();
  expect(
    (
      await client.json(`${path}/save`, {
        version: state.draft.version,
        operationId: 'public-link',
      })
    ).status,
  ).toBe(200);
  const history = await (await actor.request(`${path}/history`)).text();
  expect(history).not.toContain('Private abandoned name');
  expect(history).not.toContain('objectNames');
});
