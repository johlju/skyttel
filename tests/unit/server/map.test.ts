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
  expect((await propose()).status).toBe(200);
  expect((await client.json(`${path}/save`, { version: 1, operationId: 'initial' })).status).toBe(
    200,
  );
  expect((await propose('Privat rättelse')).status).toBe(200);
  expect((await propose('Robin Exempel', 'member-person', actor)).status).toBe(200);
  const initial = await read();
  const memberInitial = await read(actor);
  const history = await (await client.request(`${path}/history`)).json();
  const actions = [
    {
      action: 'draft',
      body: {
        version: 1,
        id: 'another-person',
        baseRevision: null,
        value: { typeId: initial.types[0].id, name: 'Kim Exempel', description: '' },
      },
    },
    { action: 'discard', body: { version: 1 } },
    { action: 'save', body: { version: 1, operationId: 'denied-save' } },
    {
      action: 'object-type',
      body: {
        version: 1,
        id: 'solar',
        baseRevision: null,
        value: { name: 'Solcellsanläggning', description: 'Elproduktion', fields: [] },
      },
    },
    {
      action: 'relationship-type',
      body: {
        version: 1,
        id: 'storage',
        baseRevision: null,
        value: {
          name: 'Förvaring',
          description: 'Förvaringsplats',
          forwardLabel: 'förvaras i',
          reverseLabel: 'innehåller',
        },
      },
    },
  ];
  // Arrange another household; the current member has access only to Linden.
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('other', 'Annat hushåll', '2026-01-01');
  fixture.database
    .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
    .run('other', initial.userId, 'administrator');
  const otherPath = '/api/households/other/map';
  const otherInitial = await (await client.request(otherPath)).json();
  const otherHistory = await (await client.request(`${otherPath}/history`)).json();
  for (const target of [otherPath, `${otherPath}/history`]) {
    expect((await actor.request(target)).status).toBe(403);
  }
  for (const { action, body } of actions) {
    expect((await actor.json(`${otherPath}/${action}`, { ...body, version: 0 })).status).toBe(403);
  }
  expect(
    (await client.json(`${path.replace('/map', '')}/members/${userId}/revoke`, {})).status,
  ).toBe(200);
  const anonymous = fixture.client();
  for (const target of [path, `${path}/history`]) {
    expect((await actor.request(target)).status).toBe(403);
    expect((await anonymous.request(target)).status).toBe(401);
  }
  for (const { action, body: payload } of actions) {
    const target = `${path}/${action}`;
    expect((await actor.json(target, payload)).status).toBe(403);
    expect((await anonymous.json(target, payload)).status).toBe(401);
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
  expect(await read()).toEqual(initial);
  expect(await (await client.request(`${path}/history`)).json()).toEqual(history);
  expect(await (await client.request(otherPath)).json()).toEqual(otherInitial);
  expect(await (await client.request(`${otherPath}/history`)).json()).toEqual(otherHistory);
  // Restore access through the API to inspect both private drafts without bypassing privacy.
  for (const target of [path, otherPath]) {
    const invitation = await client.json(`${target.replace('/map', '')}/invitations`, {
      userId,
    });
    expect(invitation.status).toBe(201);
    const { code } = await invitation.json();
    expect((await actor.json('/api/invitations/accept', { code })).status).toBe(200);
  }
  expect(await read(actor)).toEqual(memberInitial);
  expect((await (await actor.request(otherPath)).json()).draft).toEqual(otherInitial.draft);
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
    { ...body.value, lifecycle: 'deleted' },
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

test('manual lifecycle corrections retain their prior values in shared history', async () => {
  const { types } = await read();
  for (const lifecycle of ['ended', 'active']) {
    const state = await read();
    const value = {
      typeId: types[0].id,
      name: 'Lo Exempel',
      description: '',
      lifecycle,
      financialFacts: { endDate: { knowledge: 'known', value: '2020-01-01' } },
    };
    const proposed = await client.json(`${path}/draft`, {
      version: state.draft.version,
      id: 'lo',
      baseRevision: state.objects[0]?.revision ?? null,
      value,
    });
    expect(proposed.status).toBe(200);
    expect((await read()).objects).toEqual(state.objects);
    const draft = await proposed.json();
    const saved = await client.json(`${path}/save`, {
      version: draft.version,
      operationId: lifecycle,
    });
    expect(saved.status).toBe(200);
    expect((await read()).objects[0]).toMatchObject(value);
  }
  const { history } = await (await client.request(`${path}/history`)).json();
  expect(history.at(-1).changes[0]).toMatchObject({
    before: { lifecycle: 'ended' },
    after: {
      lifecycle: 'active',
      financialFacts: { endDate: { knowledge: 'known', value: '2020-01-01' } },
    },
  });
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
  expect(JSON.parse(history).history.at(-1).relationships[0].objectNames).toEqual({
    lo: 'Lo',
    kim: 'Kim',
  });
});
