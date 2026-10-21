import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { assistantReadCache } from '../../../src/server/assistant-read-cache.js';
import { contentOwner } from '../../../src/server/content-identities.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let cache: ReturnType<typeof assistantReadCache>;
let householdId: string;

beforeEach(async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const { user } = await (await client.request('/api/bootstrap')).json();
  const { household } = await (await client.json('/api/households', { name: 'Prov' })).json();
  householdId = household.id;
  cache = assistantReadCache(
    fixture.database,
    householdId,
    contentOwner(fixture.database, householdId, user.id),
  );
});
afterEach(() => fixture.close());

test('read reuse keys include the tool and normalized arguments and return isolated values', async () => {
  const load = vi.fn(async () => ({ objects: [{ name: 'Lina' }] }));
  const first = await cache.read('read_map', { query: 'Lina', objectId: 'lina' }, load);
  first.objects[0].name = 'Changed locally';
  expect(await cache.read('read_map', { objectId: 'lina', query: 'Lina' }, load)).toEqual({
    objects: [{ name: 'Lina' }],
  });
  expect(load).toHaveBeenCalledTimes(1);
  await cache.read('read_map', { query: 'Kajsa' }, load);
  await cache.read('read_type_catalog', {}, load);
  expect(load).toHaveBeenCalledTimes(3);
});

test('failed reads and writes are retried while successful reads are reused', async () => {
  const load = vi.fn(async () => ({ ok: true }));
  await expect(
    cache.read('read_map', {}, async () => {
      throw new Error('failed');
    }),
  ).rejects.toThrow('failed');
  await cache.read('read_map', {}, load);
  await cache.read('read_map', {}, load);
  await cache.read('propose_object', {}, load);
  await cache.read('propose_object', {}, load);
  expect(load).toHaveBeenCalledTimes(3);
});

test('changed saved revisions invalidate previous reads without fetching content through SQLite', async () => {
  const load = vi.fn(async () => ({ types: [] }));
  await cache.read('read_map', { query: 'Lina' }, load);
  fixture.database
    .prepare('UPDATE object_type SET revision = revision + 1 WHERE householdId = ?')
    .run(householdId);
  expect(cache.outdated()).toEqual([{ name: 'read_map' }]);
  await cache.read('read_map', { query: 'Lina' }, load);
  expect(load).toHaveBeenCalledTimes(2);
});

test('a read crossing a content change or a new conversation is never installed for later reuse', async () => {
  for (const change of [
    () =>
      fixture.database
        .prepare('UPDATE household SET contentVersion = contentVersion + 1 WHERE id = ?')
        .run(householdId),
    () => cache.clear(),
  ]) {
    const load = vi.fn(async () => ({ objects: [] }));
    await cache.read('read_map', {}, async () => {
      change();
      return load();
    });
    await cache.read('read_map', {}, load);
    expect(load).toHaveBeenCalledTimes(2);
    cache.clear();
  }
});

test('content maintenance blocks an otherwise reusable read', async () => {
  const load = vi.fn(async () => ({ objects: [] }));
  await cache.read('read_map', {}, load);
  fixture.database
    .prepare(`INSERT INTO content_maintenance
    (id, householdId, actorId, kind, phase, contentVersion, requestHash, createdAt, updatedAt)
    VALUES ('job', ?, (SELECT id FROM user LIMIT 1), 'import', 'prepared', 1, 'hash', 'now', 'now')`)
    .run(householdId);
  await expect(cache.read('read_map', {}, load)).rejects.toThrow();
  expect(load).toHaveBeenCalledTimes(1);
});

test('facts still in model context are invalidated even after their cached result is evicted', async () => {
  await cache.read('read_map', {}, async () => ({ objects: [] }));
  for (let index = 0; index < 128; index++)
    await cache.read('search_object_icons', { query: String(index) }, async () => ({ icons: [] }));
  fixture.database
    .prepare('UPDATE object_type SET revision = revision + 1 WHERE householdId = ?')
    .run(householdId);
  expect(cache.outdated()).toEqual([{ name: 'read_map' }]);
});
