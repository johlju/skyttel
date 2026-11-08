import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { legacyDatabaseSnapshot } from '../../support/legacy-database-snapshot.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let migrationDirectory: string | undefined;
afterEach(() => {
  fixture?.close();
  if (migrationDirectory) rmSync(migrationDirectory, { recursive: true, force: true });
  migrationDirectory = undefined;
});

async function setup() {
  fixture = await applicationFixture();
  let owner = fixture.client();
  await owner.signIn();
  const { household } = await (await owner.json('/api/households', { name: 'Linden' })).json();
  const path = `/api/households/${household.id}`;
  fixture.setSubject('reader');
  let reader = fixture.client();
  await reader.signIn();
  const { user } = await (await reader.request('/api/bootstrap')).json();
  const { code } = await (await owner.json(`${path}/invitations`, { userId: user.id })).json();
  expect((await reader.json('/api/invitations/accept', { code })).status).toBe(200);
  async function read(actor = owner): Promise<MapState> {
    const response = await actor.request(`${path}/map`);
    expect(response.status).toBe(200);
    return response.json();
  }
  async function post(route: string, body: Record<string, unknown>, actor = owner) {
    const state = await read(actor);
    const response = await actor.json(`${path}/map/${route}`, {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      ...body,
    });
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json();
  }
  const type = (await read()).types[0];
  for (const id of ['removed', 'kept'])
    await post('draft', { id, baseRevision: null, value: { typeId: type.id, name: id } });
  await post('save', { operationId: 'initial' });
  await post(
    'draft',
    {
      id: 'kept',
      baseRevision: 1,
      value: { typeId: type.id, name: 'Private proposal' },
    },
    reader,
  );
  await post('draft', { id: 'removed', baseRevision: 1, value: null });
  await post('draft', {
    id: 'kept',
    baseRevision: 1,
    value: { typeId: type.id, name: 'Committed name' },
  });
  // This final save creates both metadata needs. Older storage can seed it
  // without asking the new reader to use an index that does not yet exist.
  const finalVersion = (await read()).draft.version;
  return {
    get owner() {
      return owner;
    },
    get reader() {
      return reader;
    },
    path,
    read,
    post,
    type,
    finalVersion,
    async reopen(snapshot: string) {
      fixture.close();
      fixture = await applicationFixture({ databaseSnapshot: snapshot });
      owner = fixture.client();
      await owner.signIn();
      fixture.setSubject('reader');
      reader = fixture.client();
      await reader.signIn();
    },
  };
}

test('upgrading retained receipts restores deletion meanings and conflict attribution without changing history', async () => {
  migrationDirectory = mkdtempSync(join(tmpdir(), 'skyttel-history-migrations-'));
  cpSync(resolve('migrations'), migrationDirectory, { recursive: true });
  for (const name of readdirSync(migrationDirectory))
    if (name.endsWith('.sql') && Number(name.split('_')[0]) > 40)
      rmSync(join(migrationDirectory, name));
  const app = await setup();
  await app.post('save', { operationId: 'combined' });
  const history = await (await app.owner.request(`${app.path}/map/history`)).json();
  await fixture.app.close();
  const snapshot = join(migrationDirectory, 'legacy.sqlite');
  await legacyDatabaseSnapshot(fixture.database, snapshot, migrationDirectory);
  await app.reopen(snapshot);
  const state = await app.read(app.reader);
  expect(state.removedObjects?.[0].type).toEqual(app.type);
  expect(state.conflictActors?.['object:kept']?.name).toBe('Alex');
  expect(state.conflictPropertyActors?.['object:kept']?.name?.name).toBe('Alex');
  expect(await (await app.owner.request(`${app.path}/map/history`)).json()).toEqual(history);
  await app.post('object-type', {
    id: app.type.id,
    baseRevision: app.type.revision,
    value: { ...app.type, name: 'Changed meaning', description: 'Later description' },
  });
  await app.post('save', { operationId: 'later-type' });
  expect((await app.read()).removedObjects?.[0].type).toEqual(app.type);
  await app.post('discard', {}, app.reader);
  await app.post('draft', { id: 'kept', baseRevision: 2, value: null });
  await app.post('object-type', { id: app.type.id, baseRevision: 2, value: null });
  await app.post('save', { operationId: 'remove-type' });
  const removedType = await app.read();
  expect(removedType.types.some((type) => type.id === app.type.id)).toBe(false);
  expect(removedType.removedObjects?.find(({ object }) => object.id === 'removed')?.type).toEqual(
    app.type,
  );
  // Missing historical evidence retains the existing current-type fallback.
  fixture.database.prepare('DELETE FROM map_save WHERE operationId = ?').run('combined');
  expect(
    (await app.read()).removedObjects?.find(({ object }) => object.id === 'removed')?.type?.name,
  ).toBe('Changed meaning');
});

test('failure after receipt indexing rolls back metadata and retry creates one durable outcome', async () => {
  const app = await setup();
  fixture.database.exec(`CREATE TRIGGER fail_after_receipt BEFORE UPDATE ON map_draft
    BEGIN SELECT RAISE(ABORT, 'synthetic failure after receipt'); END`);
  const body = { version: app.finalVersion, operationId: 'retry' };
  expect((await app.owner.json(`${app.path}/map/save`, body)).status).toBe(500);
  const failed = await app.read(app.reader);
  expect(failed.removedObjects).toBeUndefined();
  expect(failed.conflictActors).toBeUndefined();
  expect((await app.read()).draft.version).toBe(app.finalVersion);
  fixture.database.exec('DROP TRIGGER fail_after_receipt');
  const response = await app.owner.json(`${app.path}/map/save`, body);
  expect(response.status).toBe(200);
  const saved = await response.json();
  expect(await (await app.owner.json(`${app.path}/map/save`, body)).json()).toEqual(saved);
  const state = await app.read(app.reader);
  expect(state.removedObjects?.[0].type).toEqual(app.type);
  expect(state.conflictActors?.['object:kept']?.name).toBe('Alex');
  expect((await (await app.owner.request(`${app.path}/map/history`)).json()).history).toHaveLength(
    2,
  );
});

test('archive replacement rebuilds metadata and erasure removes derived historical values', async () => {
  const app = await setup();
  await app.post('save', { operationId: 'combined' });
  const original = await app.read(app.reader);
  const prepared = await (await app.owner.json(`${app.path}/exports`, {})).json();
  const bytes = await (await app.owner.request(`${app.path}/exports/${prepared.id}`)).arrayBuffer();
  const uploaded = await app.owner.request(`${app.path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: bytes,
  });
  expect(uploaded.status).toBe(201);
  const ready = await uploaded.json();
  const confirmed = await app.owner.json(`${app.path}/imports/${ready.id}/confirm`, {
    contentVersion: ready.contentVersion,
    confirmed: true,
  });
  expect(confirmed.status, await confirmed.clone().text()).toBe(200);
  await fixture.restart();
  const restored = await app.read(app.reader);
  expect(restored.removedObjects).toEqual(original.removedObjects);
  expect(restored.conflictActors).toEqual(original.conflictActors);
  expect(restored.conflictPropertyActors).toEqual(original.conflictPropertyActors);
  const selection = [{ kind: 'object', id: 'removed' }];
  const review = await (await app.owner.json(`${app.path}/erasure/review`, { selection })).json();
  const erased = await app.owner.json(`${app.path}/erasure/execute`, {
    ...review,
    selection,
    operationId: 'erase-removed',
    confirmation: 'RADERA PERMANENT',
  });
  expect(erased.status, await erased.clone().text()).toBe(200);
  const after = await app.read(app.reader);
  expect(after.removedObjects).toBeUndefined();
  expect(after.conflictActors).toEqual(original.conflictActors);
  // Physical erasure includes derived storage, not only the API projection.
  const indexed = fixture.database.prepare('SELECT change FROM map_history_change').all();
  expect(JSON.stringify(indexed)).not.toContain('removed');
  expect(JSON.stringify(indexed)).toContain('Committed name');
  // Onboarding creates only one household; arrange the second isolation scope.
  const { user: ownerUser } = await (await app.owner.request('/api/bootstrap')).json();
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('other', 'Other', '2026-01-01');
  fixture.database
    .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
    .run('other', ownerUser.id, 'administrator');
  const otherPath = '/api/households/other/map';
  const otherState = await (await app.owner.request(otherPath)).json();
  expect((await app.reader.request(otherPath)).status).toBe(403);
  expect(
    (
      await app.owner.json(`${otherPath}/draft`, {
        version: 0,
        id: 'other-object',
        baseRevision: null,
        value: { typeId: otherState.types[0].id, name: 'Other household' },
      })
    ).status,
  ).toBe(200);
  expect(
    (await app.owner.json(`${otherPath}/save`, { version: 1, operationId: 'other-save' })).status,
  ).toBe(200);
  const lastSelection = [{ kind: 'object', id: 'kept' }];
  const lastReview = await (
    await app.owner.json(`${app.path}/erasure/review`, { selection: lastSelection })
  ).json();
  expect(
    (
      await app.owner.json(`${app.path}/erasure/execute`, {
        ...lastReview,
        selection: lastSelection,
        operationId: 'erase-kept',
        confirmation: 'RADERA PERMANENT',
      })
    ).status,
  ).toBe(200);
  expect((await app.read(app.reader)).draft.changes).toEqual([]);
  expect(fixture.database.prepare('SELECT entityId FROM map_history_change').all()).toEqual([
    { entityId: 'other-object' },
  ]);
  expect((await (await app.owner.request(otherPath)).json()).objects[0].name).toBe(
    'Other household',
  );
  expect(fixture.database.pragma('foreign_key_check')).toEqual([]);
});

test.each(['object', 'relationship', 'objectType', 'relationshipType'] as const)(
  '%s conflict attribution stops at the latest actual property write even without an author',
  async (kind) => {
    const app = await setup();
    await app.post('save', { operationId: 'combined' });
    const state = await app.read();
    const route = {
      object: 'draft',
      relationship: 'relationship',
      objectType: 'object-type',
      relationshipType: 'relationship-type',
    }[kind];
    if (kind === 'relationship') {
      await app.post('draft', {
        id: 'endpoint',
        baseRevision: null,
        value: { typeId: app.type.id, name: 'Endpoint' },
      });
      await app.post('relationship', {
        id: 'edge',
        baseRevision: null,
        value: { typeId: state.relationshipTypes[0].id, sourceId: 'kept', targetId: 'endpoint' },
      });
      await app.post('save', { operationId: 'edge-initial' });
    }
    const current = await app.read();
    const entity =
      kind === 'object'
        ? current.objects.find((value) => value.id === 'kept')
        : kind === 'relationship'
          ? current.relationships[0]
          : kind === 'objectType'
            ? current.types[0]
            : current.relationshipTypes[0];
    if (!entity) throw new Error('Missing test entity');
    const valueBase = entity;
    const property =
      kind === 'relationship' ? 'lifecycle' : kind === 'object' ? 'name' : 'description';
    if (kind !== 'object')
      await app.post(
        route,
        {
          id: entity.id,
          baseRevision: entity.revision,
          value: {
            ...valueBase,
            [property]: kind === 'relationship' ? 'active' : 'Private meaning',
          },
        },
        app.reader,
      );
    for (const [index, value] of (kind === 'relationship'
      ? ['ended', 'active', 'ended']
      : ['Final meaning', 'Other meaning', 'Final meaning']
    ).entries()) {
      await app.post(route, {
        id: entity.id,
        baseRevision: entity.revision + index,
        value: { ...valueBase, [property]: value },
      });
      await app.post('save', { operationId: `write-${index}` });
    }
    const key = `${kind}:${entity.id}`;
    expect((await app.read(app.reader)).conflictPropertyActors?.[key]?.[property]?.name).toBe(
      'Alex',
    );
    // Imported/legacy receipts can have no actor name. Updating the source must
    // also replace its indexed attribution without falling back to older names.
    fixture.database
      .prepare(`UPDATE map_save SET receipt = json_remove(receipt, '$.actorName')
      WHERE operationId = 'write-2'`)
      .run();
    const unknown = await app.read(app.reader);
    expect(unknown.conflictActors?.[key]).toBeUndefined();
    expect(unknown.conflictPropertyActors?.[key]?.[property]).toBeUndefined();
  },
);
