import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, readdirSync, statSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  invalidateHouseholdExports,
  prepareHouseholdExport,
} from '../../../src/server/household-export.js';
import { exportLifetimeMs } from '../../../src/shared/household-export.js';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  householdId = household.id;
  path = `/api/households/${householdId}`;
});
afterEach(async () => {
  await invalidateHouseholdExports(fixture.database, householdId);
  fixture.close();
});

async function archive() {
  const prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status).toBe(201);
  const ready = await prepared.json();
  const response = await client.request(`${path}/exports/${ready.id}`);
  expect(response.status).toBe(200);
  const parts = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return { parts, content: JSON.parse(Buffer.from(parts['content.json']).toString()) };
}

test('retained definitions, generic merge history, revoked owners, all private drafts and encoded image versions remain complete', async () => {
  const { userId } = await invite();
  const state = await (await client.request(`${path}/map`)).json();
  const type = state.types[0];
  const source = {
    id: 'absorbed',
    householdId,
    typeId: type.id,
    revision: 1,
    name: 'Tidigare namn',
    description: '',
    profileImageId: 'original',
  };
  const survivor = { ...source, id: 'survivor', name: 'Nyare namn', profileImageId: 'copied' };
  const merge = {
    survivorId: 'survivor',
    absorbedId: 'absorbed',
    identityConfirmed: true,
    objects: [source, survivor],
    types: [type],
    relationships: [],
    relationshipTypes: [],
    objectNames: {},
    imageCopy: { sourceObjectId: 'absorbed', sourceImageId: 'original', copiedImageId: 'copied' },
  };
  const change = {
    id: 'survivor',
    before: source,
    after: survivor,
    type,
    beforeType: type,
    merge: {
      ...merge,
      previousChanges: [{ id: 'absorbed', before: source, after: null, type }],
      previousRelationships: [],
    },
    undoFields: ['objectMeaning'],
    extension: { futureMeaning: 'Behåll äldre underlag' },
  };
  const receipt = {
    operationId: 'historic-merge',
    userId,
    actorName: 'Robin Förr',
    savedAt: '2026-01-02T03:04:05Z',
    contentVersion: 1,
    changes: [{ ...change, merge }],
    relationships: [],
    objectTypes: [],
    relationshipTypes: [],
  };
  const pixels = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#778899' },
  })
    .webp()
    .toBuffer();
  fixture.database.transaction(() => {
    for (const [id, objectId] of [
      ['original', 'absorbed'],
      ['copied', 'survivor'],
    ])
      fixture.database
        .prepare(
          'INSERT INTO profile_image (id, householdId, objectId, createdBy, bytes, width, height) VALUES (?, ?, ?, ?, ?, 2, 2)',
        )
        .run(id, householdId, objectId, userId, pixels);
    for (const [id, image, deleted] of [
      ['absorbed', 'original', 1],
      ['survivor', 'copied', 0],
    ])
      fixture.database
        .prepare(
          'INSERT INTO map_object (id, householdId, typeId, revision, name, description, deleted, profileImageId, customValues) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          householdId,
          type.id,
          'Ett objekt',
          '',
          deleted,
          image,
          JSON.stringify({ profileImageId: 'ordinary custom text', enabled: false, count: 0 }),
        );
    fixture.database
      .prepare('INSERT INTO object_type_fields (typeId, fields) VALUES (?, ?)')
      .run(type.id, JSON.stringify([{ id: 'enabled', name: 'På', kind: 'boolean' }]));
    fixture.database
      .prepare('INSERT INTO removed_type VALUES (?, ?)')
      .run('objectType', state.types[1].id);
    fixture.database
      .prepare('INSERT INTO relationship_type_labels VALUES (?, ?, ?)')
      .run(state.relationshipTypes[0].id, 'använder', 'används av');
    for (const [index, knowledge] of ['unknown', 'none', 'uncertain'].entries())
      fixture.database
        .prepare(
          'INSERT INTO map_relationship (id, householdId, typeId, revision, sourceId, targetId, knowledge, deleted, lifecycle, endDate) VALUES (?, ?, ?, 1, ?, NULL, ?, 0, ?, ?)',
        )
        .run(
          `edge-${index}`,
          householdId,
          state.relationshipTypes[index].id,
          'survivor',
          knowledge,
          'ended',
          JSON.stringify({ value: '2026-03-01', approximate: true }),
        );
    fixture.database
      .prepare('INSERT INTO map_draft (householdId, userId, version, changes) VALUES (?, ?, 8, ?)')
      .run(householdId, userId, JSON.stringify([change]));
    fixture.database
      .prepare('INSERT INTO map_save VALUES (?, ?, ?, ?, ?)')
      .run('historic-merge', householdId, userId, 7, JSON.stringify(receipt));
    fixture.database
      .prepare(
        'INSERT INTO map_history (householdId, userId, operationId, savedAt, changes) VALUES (?, ?, ?, ?, ?)',
      )
      .run(householdId, userId, 'historic-merge', receipt.savedAt, JSON.stringify(receipt.changes));
    fixture.database
      .prepare('INSERT INTO personal_position VALUES (?, ?, ?, 3, 9, 8, 7)')
      .run(householdId, userId, 'absorbed');
    fixture.database
      .prepare('INSERT INTO personal_view_settings VALUES (?, ?, 4, ?)')
      .run(householdId, userId, JSON.stringify({ ...defaultViewSettings, stars: true }));
  })();
  expect((await client.json(`${path}/members/${userId}/revoke`, {})).status).toBe(200);
  const { content, parts } = await archive();
  expect(content.identities).toContainEqual({ id: userId, name: 'Alex Exempel' });
  expect(content.drafts).toContainEqual(
    expect.objectContaining({ userId, version: 8, changes: [change] }),
  );
  expect(content.saves).toContainEqual(expect.objectContaining({ userId, receipt }));
  expect(content.history[0].changes).toEqual(receipt.changes);
  expect(content.objectTypeFields).toContainEqual({
    typeId: type.id,
    fields: [{ id: 'enabled', name: 'På', kind: 'boolean' }],
  });
  expect(content.removedTypes).toContainEqual({ kind: 'objectType', typeId: state.types[1].id });
  expect(content.objects.find((row: { id: string }) => row.id === 'absorbed').deleted).toBe(1);
  expect(content.objects[0].customValues).toEqual({
    profileImageId: 'ordinary custom text',
    enabled: false,
    count: 0,
  });
  expect(content.relationships.map((row: { knowledge: string }) => row.knowledge)).toEqual([
    'unknown',
    'none',
    'uncertain',
  ]);
  expect(content.relationships[0]).toMatchObject({
    lifecycle: 'ended',
    targetId: null,
    endDate: { value: '2026-03-01', approximate: true },
  });
  expect(content.relationshipTypeLabels[0]).toMatchObject({
    forwardLabel: 'använder',
    reverseLabel: 'används av',
  });
  expect(content.positions).toContainEqual({
    householdId,
    userId,
    objectId: 'absorbed',
    version: 3,
    x: 9,
    y: 8,
    z: 7,
  });
  expect(content.viewSettings).toContainEqual({
    householdId,
    userId,
    version: 4,
    settings: { ...defaultViewSettings, stars: true },
  });
  expect(content.images.map((image: { id: string }) => image.id)).toEqual(['copied', 'original']);
  let offset = 0;
  for (const image of content.images) {
    expect(image).toMatchObject({
      createdBy: userId,
      householdId,
      offset,
      length: pixels.length,
      width: 2,
      height: 2,
    });
    const bytes = parts['images.bin'].slice(image.offset, image.offset + image.length);
    expect(Buffer.from(bytes)).toEqual(pixels);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256);
    offset += image.length;
  }
  expect(offset).toBe(parts['images.bin'].length);
});

test('one SQLite read snapshot preserves map, private draft, view and image bytes while a second connection commits', async () => {
  const state = await (await client.request(`${path}/map`)).json();
  const pixels = await sharp({
    create: { width: 1, height: 1, channels: 3, background: '#335577' },
  })
    .webp()
    .toBuffer();
  fixture.database.transaction(() => {
    fixture.database
      .prepare('INSERT INTO profile_image VALUES (?, ?, ?, ?, ?, 1, 1)')
      .run('image', householdId, 'lamp', state.userId, pixels);
    fixture.database
      .prepare(
        'INSERT INTO map_object (id, householdId, typeId, revision, name, description, profileImageId) VALUES (?, ?, ?, 1, ?, ?, ?)',
      )
      .run('lamp', householdId, state.types[0].id, 'Lampan', 'Före', 'image');
    fixture.database
      .prepare('INSERT INTO map_draft (householdId, userId, version, changes) VALUES (?, ?, 1, ?)')
      .run(
        householdId,
        state.userId,
        JSON.stringify([{ id: 'private', after: { description: 'Före' } }]),
      );
    fixture.database
      .prepare('INSERT INTO personal_position VALUES (?, ?, ?, 1, 1, 2, 3)')
      .run(householdId, state.userId, 'lamp');
  })();
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-exports');
  const writer = new Database(fixture.config.databasePath);
  let changed = false;
  // Observe the first real output write, then commit on an independent SQLite
  // connection while the exporter is still reading the other content groups.
  const observer = watch(directory, { recursive: true }, (_event, name) => {
    if (changed || !name?.endsWith('content.json')) return;
    try {
      if (!statSync(join(directory, name)).size) return;
    } catch {
      return;
    }
    changed = true;
    writer.transaction(() => {
      writer.prepare('UPDATE household SET name = ? WHERE id = ?').run('Efter', householdId);
      writer.prepare('UPDATE map_object SET description = ? WHERE id = ?').run('Efter', 'lamp');
      writer
        .prepare('UPDATE map_draft SET changes = ? WHERE householdId = ?')
        .run(JSON.stringify([{ id: 'private', after: { description: 'Efter' } }]), householdId);
      writer.prepare('UPDATE personal_position SET x = 99 WHERE householdId = ?').run(householdId);
      writer
        .prepare('UPDATE profile_image SET bytes = ? WHERE id = ?')
        .run(Buffer.from('after'), 'image');
    })();
  });
  try {
    const { content, parts } = await archive();
    expect(changed).toBe(true);
    expect(content.household.name).toBe('Linden');
    expect(content.objects[0].description).toBe('Före');
    expect(content.drafts[0].changes[0].after.description).toBe('Före');
    expect(content.positions[0].x).toBe(1);
    expect(Buffer.from(parts['images.bin'])).toEqual(pixels);
    expect((await (await client.request(`${path}/map`)).json()).objects[0].description).toBe(
      'Efter',
    );
  } finally {
    observer.close();
    writer.close();
  }
});

test('aborting preparation closes its snapshot and deletes partial output with an explicit cancellation result', async () => {
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-exports');
  const controller = new AbortController();
  const observer = watch(directory, { recursive: true }, (_event, name) => {
    if (name?.endsWith('content.json')) controller.abort();
  });
  try {
    const response = await client.request(`${path}/exports`, {
      method: 'POST',
      headers: { origin: fixture.config.origin, 'content-type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
    expect(controller.signal.aborted).toBe(true);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'export_cancelled' });
    expect(readdirSync(directory)).toEqual([]);
    expect(fixture.database.pragma('wal_checkpoint(TRUNCATE)')).toEqual([
      { busy: 0, log: 0, checkpointed: 0 },
    ]);
  } finally {
    observer.close();
  }
});

test('household invalidation closes active readers and removes prepared archives before storage cleanup', async () => {
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-exports');
  let invalidated: Promise<void> | undefined;
  const observer = watch(directory, { recursive: true }, (_event, name) => {
    if (!invalidated && name?.endsWith('content.json'))
      invalidated = invalidateHouseholdExports(fixture.database, householdId);
  });
  try {
    const response = await client.json(`${path}/exports`, {});
    expect(response.status).toBe(409);
    await invalidated;
    expect(readdirSync(directory)).toEqual([]);
    expect(fixture.database.pragma('wal_checkpoint(TRUNCATE)')).toEqual([
      { busy: 0, log: 0, checkpointed: 0 },
    ]);
  } finally {
    observer.close();
  }
  const ready = await (await client.json(`${path}/exports`, {})).json();
  await invalidateHouseholdExports(fixture.database, householdId);
  expect((await client.request(`${path}/exports/${ready.id}`)).status).toBe(404);
  expect(readdirSync(directory)).toEqual([]);
});

test('a full image history larger than 64 MiB streams completely and invalidation interrupts an active download', async () => {
  const state = await (await client.request(`${path}/map`)).json();
  const pixels = await sharp(randomBytes(256 * 256 * 3), {
    raw: { width: 256, height: 256, channels: 3 },
  })
    .webp({ lossless: true })
    .toBuffer();
  expect(pixels.length).toBeLessThanOrEqual(262144);
  fixture.database.transaction(() => {
    for (let index = 0; index < 400; index++) {
      const id = `image-${index}`;
      fixture.database
        .prepare('INSERT INTO profile_image VALUES (?, ?, ?, ?, ?, 256, 256)')
        .run(id, householdId, 'lamp', state.userId, pixels);
      const receipt = {
        operationId: id,
        userId: state.userId,
        savedAt: '2026-01-01T00:00:00Z',
        contentVersion: 1,
        changes: [{ id: 'lamp', after: { profileImageId: id } }],
      };
      fixture.database
        .prepare('INSERT INTO map_save VALUES (?, ?, ?, 1, ?)')
        .run(id, householdId, state.userId, JSON.stringify(receipt));
    }
  })();
  let prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status).toBe(201);
  let ready = await prepared.json();
  expect(ready.bytes).toBeGreaterThan(64 * 1024 * 1024);
  const complete = await client.request(`${path}/exports/${ready.id}`);
  expect(complete.headers.get('content-length')).toBe(String(ready.bytes));
  if (!complete.body) throw new Error('Complete archive stream required');
  const reader = complete.body.getReader();
  let received = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) break;
    received += result.value.length;
  }
  expect(received).toBe(ready.bytes);
  prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status).toBe(201);
  ready = await prepared.json();
  const partial = await client.request(`${path}/exports/${ready.id}`);
  if (!partial.body) throw new Error('Archive stream required');
  const active = partial.body.getReader();
  const initial = await active.read();
  if (!initial.value) throw new Error('First archive chunk required');
  received = initial.value.length;
  await invalidateHouseholdExports(fixture.database, householdId);
  let interrupted = false;
  try {
    for (;;) {
      const result = await active.read();
      if (result.done) break;
      received += result.value.length;
    }
  } catch {
    interrupted = true;
  }
  expect(interrupted || received < ready.bytes).toBe(true);
  expect((await client.request(`${path}/exports/${ready.id}`)).status).toBe(404);
  expect(readdirSync(join(dirname(fixture.config.databasePath), '.skyttel-exports'))).toEqual([]);
}, 15000);

async function invite(role = 'member') {
  fixture.setSubject('robin');
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const { code } = await (await client.json(`${path}/invitations`, { userId: user.id })).json();
  expect((await actor.json('/api/invitations/accept', { code })).status).toBe(200);
  if (role === 'administrator')
    expect((await client.json(`${path}/members/${user.id}/role`, { role })).status).toBe(200);
  return { actor, userId: user.id };
}

test('losing administrator access removes that owner’s ready and preparing exports while preserving another administrator’s copy', async () => {
  const { actor, userId } = await invite('administrator');
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-exports');
  const own = await (await client.json(`${path}/exports`, {})).json();
  const other = await (await actor.json(`${path}/exports`, {})).json();
  expect(readdirSync(directory).sort()).toEqual([own.id, other.id].sort());
  expect((await client.json(`${path}/members/${userId}/role`, { role: 'member' })).status).toBe(
    200,
  );
  expect(readdirSync(directory)).toEqual([own.id]);
  const unaffected = await client.request(`${path}/exports/${own.id}`);
  expect(unzipSync(new Uint8Array(await unaffected.arrayBuffer()))['manifest.json']).toBeDefined();
  expect(
    (await client.json(`${path}/members/${userId}/role`, { role: 'administrator' })).status,
  ).toBe(200);
  fixture.database.transaction(() => {
    for (let index = 0; index < 100; index++)
      fixture.database
        .prepare('INSERT INTO personal_position VALUES (?, ?, ?, 1, 0, 0, 0)')
        .run(householdId, userId, `retained-${index}`);
  })();
  let revocation: Promise<Response> | undefined;
  const observer = watch(directory, { recursive: true }, (_event, name) => {
    if (!revocation && name?.endsWith('content.json'))
      revocation = client.json(`${path}/members/${userId}/revoke`, {});
  });
  try {
    const preparing = await actor.json(`${path}/exports`, {});
    expect((await revocation)?.status).toBe(200);
    expect(preparing.status).toBe(409);
    expect(await preparing.json()).toEqual({ error: 'export_cancelled' });
    expect(readdirSync(directory)).toEqual([]);
    expect(fixture.database.pragma('wal_checkpoint(TRUNCATE)')).toEqual([
      { busy: 0, log: 0, checkpointed: 0 },
    ]);
  } finally {
    observer.close();
  }
});

test('start, retrieval and cancellation require a current administrator of the same household', async () => {
  const anonymous = fixture.client();
  const { actor, userId } = await invite();
  const { id } = await (await client.json(`${path}/exports`, {})).json();
  for (const [who, status] of [
    [anonymous, 401],
    [actor, 403],
  ] as const) {
    expect((await who.json(`${path}/exports`, {})).status).toBe(status);
    expect((await who.request(`${path}/exports/${id}`)).status).toBe(status);
    expect((await who.json(`${path}/exports/${id}/cancel`, {})).status).toBe(status);
  }
  expect((await client.json('/api/households/another/exports', {})).status).toBe(403);
  expect((await client.request(`/api/households/another/exports/${id}`)).status).toBe(403);
  expect(
    (
      await client.request(`${path}/exports`, {
        method: 'POST',
        headers: { origin: 'https://other.invalid' },
      })
    ).status,
  ).toBe(403);
  expect(
    (await client.json(`${path}/members/${userId}/role`, { role: 'administrator' })).status,
  ).toBe(200);
  // Even another current administrator cannot consume someone else's handle.
  expect((await actor.request(`${path}/exports/${id}`)).status).toBe(404);
  const other = await (await actor.json(`${path}/exports`, {})).json();
  expect((await client.json(`${path}/members/${userId}/revoke`, {})).status).toBe(200);
  expect((await actor.request(`${path}/exports/${other.id}`)).status).toBe(403);
  expect((await actor.json(`${path}/exports`, {})).status).toBe(403);
  expect((await client.request(`${path}/exports/${id}`)).status).toBe(200);
});

test('cancellation, expiry and whole-content replacement invalidate protected archive handles', async () => {
  const prepare = async () => (await client.json(`${path}/exports`, {})).json();
  let ready = await prepare();
  expect((await client.json(`${path}/exports/${ready.id}/cancel`, {})).status).toBe(200);
  expect((await client.request(`${path}/exports/${ready.id}`)).status).toBe(404);
  expect((await client.json(`${path}/exports/missing/cancel`, {})).status).toBe(200);
  ready = await prepare();
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(Date.now() + exportLifetimeMs + 1);
    expect((await client.request(`${path}/exports/${ready.id}`)).status).toBe(404);
  } finally {
    vi.useRealTimers();
  }
  ready = await prepare();
  fixture.database
    .prepare('UPDATE household SET contentVersion = contentVersion + 1 WHERE id = ?')
    .run(householdId);
  expect((await client.request(`${path}/exports/${ready.id}`)).status).toBe(404);
  expect(readdirSync(join(dirname(fixture.config.databasePath), '.skyttel-exports'))).toEqual([]);
});

test('only one preparation runs at a time and a new own export replaces the older download', async () => {
  const { user } = await (await client.request('/api/bootstrap')).json();
  const preparing = prepareHouseholdExport(fixture.database, user.id, householdId);
  await expect(
    prepareHouseholdExport(fixture.database, user.id, householdId),
  ).rejects.toMatchObject({ code: 'export_busy', status: 409 });
  const first = await preparing;
  const second = await (await client.json(`${path}/exports`, {})).json();
  expect((await client.request(`${path}/exports/${first.id}`)).status).toBe(404);
  const bytes = await client.request(`${path}/exports/${second.id}`);
  expect(bytes.status).toBe(200);
  await bytes.arrayBuffer();
});

test('unused complete copies expire and are removed without requiring another download request', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  try {
    expect((await client.json(`${path}/exports`, {})).status).toBe(201);
    await vi.advanceTimersByTimeAsync(exportLifetimeMs + 1);
  } finally {
    vi.useRealTimers();
  }
  await expect
    .poll(() => readdirSync(join(dirname(fixture.config.databasePath), '.skyttel-exports')))
    .toEqual([]);
});

test('normal saved edits leave a completed snapshot available at its original point in time', async () => {
  const ready = await (await client.json(`${path}/exports`, {})).json();
  const state = await (await client.request(`${path}/map`)).json();
  await client.json(`${path}/map/draft`, {
    id: 'later',
    version: 0,
    baseRevision: null,
    value: { typeId: state.types[0].id, name: 'Efter exporten', description: '' },
  });
  expect(
    (await client.json(`${path}/map/save`, { version: 1, operationId: 'after-snapshot' })).status,
  ).toBe(200);
  const result = await client.request(`${path}/exports/${ready.id}`);
  const parts = unzipSync(new Uint8Array(await result.arrayBuffer()));
  expect(JSON.parse(Buffer.from(parts['content.json']).toString()).objects).toEqual([]);
  expect((await (await client.request(`${path}/map`)).json()).objects[0].id).toBe('later');
});

test('unwritable temporary storage fails without exposing content or advertising a partial archive', async () => {
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-exports');
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  chmodSync(directory, 0o500);
  try {
    const response = await client.json(`${path}/exports`, {});
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal_error' });
    expect(readdirSync(directory)).toEqual([]);
    expect(diagnostic.mock.calls).toEqual([[JSON.stringify({ event: 'request_failed' })]]);
  } finally {
    chmodSync(directory, 0o700);
    diagnostic.mockRestore();
  }
  const prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status).toBe(201);
  const { id } = await prepared.json();
  await client.json(`${path}/exports/${id}/cancel`, {});
});

test('an unspecified object retains its identity meaning in the archive', async () => {
  const state = await (await client.request(`${path}/map`)).json();
  expect(
    (
      await client.json(`${path}/map/draft`, {
        id: 'unknown-bank',
        version: 0,
        baseRevision: null,
        value: {
          name: 'Okänt bankkonto',
          description: '',
          typeId: state.types[0].id,
          identity: 'unspecified',
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (await client.json(`${path}/map/save`, { version: 1, operationId: 'unspecified' })).status,
  ).toBe(200);
  const prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status).toBe(201);
  const { id } = await prepared.json();
  const response = await client.request(`${path}/exports/${id}`);
  const parts = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const content = JSON.parse(Buffer.from(parts['content.json']).toString());
  expect(content.objects[0].identity).toBe('unspecified');
});

test('an administrator downloads a versioned complete archive with private state, historical identities and checksums', async () => {
  const state = await (await client.request(`${path}/map`)).json();
  const value = { name: 'Lampan', description: 'Egen uppgift', typeId: state.types[0].id };
  expect(
    (
      await client.json(`${path}/map/draft`, {
        id: 'lamp',
        version: 0,
        baseRevision: null,
        value,
      })
    ).status,
  ).toBe(200);
  const saved = await (
    await client.json(`${path}/map/save`, { version: 1, operationId: 'first-save' })
  ).json();
  const current = await (await client.request(`${path}/map`)).json();
  const draft = await (
    await client.json(`${path}/map/draft`, {
      id: 'lamp',
      version: current.draft.version,
      baseRevision: 1,
      value: { ...value, description: 'Privat utkast' },
    })
  ).json();
  expect(
    (
      await client.json(`${path}/map/view/position`, {
        id: 'lamp',
        version: 0,
        position: { x: 3, y: -2, z: 7 },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await client.json(`${path}/map/view/settings`, {
        version: 0,
        settings: { ...defaultViewSettings, stars: true },
      })
    ).status,
  ).toBe(200);

  const prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status).toBe(201);
  const ready = await prepared.json();
  const response = await client.request(`${path}/exports/${ready.id}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/zip');
  expect(response.headers.get('cache-control')).toBe('no-store');
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(bytes.byteLength).toBe(ready.bytes);
  const parts = unzipSync(bytes);
  const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
  expect(manifest).toMatchObject({ format: 'skyttel-household', version: 1, householdId });
  expect(manifest.parts.map((part: { path: string }) => part.path)).toEqual([
    'content.json',
    'images.bin',
  ]);
  for (const part of manifest.parts) {
    expect(parts[part.path].byteLength).toBe(part.bytes);
    expect(createHash('sha256').update(parts[part.path]).digest('hex')).toBe(part.sha256);
  }
  const content = JSON.parse(Buffer.from(parts['content.json']).toString());
  expect(content.household).toMatchObject({ id: householdId, name: 'Linden', contentVersion: 1 });
  expect(content.objects).toEqual([expect.objectContaining({ id: 'lamp', ...value, deleted: 0 })]);
  expect(content.objectTypes).toEqual(
    expect.arrayContaining([expect.objectContaining(state.types[0])]),
  );
  expect(content.saves[0].receipt).toEqual(saved.receipt);
  expect(content.drafts[0].changes).toEqual(draft.changes);
  expect(content.positions[0]).toMatchObject({ objectId: 'lamp', x: 3, y: -2, z: 7 });
  expect(content.viewSettings[0].settings.stars).toBe(true);
  expect(content.identities).toEqual([{ id: state.userId, name: 'Alex Exempel' }]);
  const encoded = Buffer.from(parts['content.json']).toString();
  for (const excluded of [
    'synthetic-token',
    'alex@example.test',
    'emailVerified',
    'membership',
    'accessToken',
  ])
    expect(encoded).not.toContain(excluded);
  expect((await client.request(`${path}/exports/${ready.id}`)).status).toBe(404);
});
