import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readdirSync, readFileSync, statSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { unzipSync, zipSync } from 'fflate';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { ErasureSelection } from '../../../src/shared/household-erasure.js';
import {
  type MapState,
  type ObjectValue,
  proposedObjectTypes,
  proposedRelationshipTypes,
} from '../../../src/shared/map.js';
import { mergeConnections, mergeObjects } from '../../../src/shared/object-merge.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}`;
});
afterEach(() => fixture.close());

const readMap = async (actor = client): Promise<MapState> =>
  (await actor.request(`${path}/map`)).json();
async function object(id: string, value: Partial<ObjectValue> = {}, actor = client) {
  const state = await readMap(actor);
  const own = state.draft.changes.find((change) => change.id === id);
  const current = state.objects.find((item) => item.id === id);
  const response = await actor.json(`${path}/map/draft`, {
    id,
    version: state.draft.version,
    contentVersion: state.contentVersion,
    baseRevision: own ? (own.before?.revision ?? null) : (current?.revision ?? null),
    value: {
      typeId: state.types[0].id,
      name: id,
      description: '',
      ...current,
      ...own?.after,
      ...value,
    },
  });
  expect(response.status).toBe(200);
}
async function save(operationId: string, actor = client) {
  const state = await readMap(actor);
  const response = await actor.json(`${path}/map/save`, {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    operationId,
  });
  expect(response.status).toBe(200);
  return (await response.json()).receipt;
}
async function reviewed(selection: ErasureSelection, operationId = 'erase-operation') {
  const response = await client.json(`${path}/erasure/review`, { selection });
  expect(response.status).toBe(200);
  return {
    selection,
    token: (await response.json()).token,
    operationId,
    confirmation: 'RADERA PERMANENT',
  };
}
async function invite(subject = 'robin') {
  fixture.setSubject(subject);
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const { code } = await (await client.json(`${path}/invitations`, { userId: user.id })).json();
  await actor.json('/api/invitations/accept', { code });
  return { actor, userId: user.id };
}
async function upload(id: string, actor = client, noise = false) {
  const state = await readMap(actor);
  const current = state.objects.find((item) => item.id === id);
  const image = await (noise
    ? sharp(randomBytes(300 * 300 * 3), { raw: { width: 300, height: 300, channels: 3 } })
    : sharp({
        create: { width: 16, height: 16, channels: 3, background: '#123abc' },
      })
  )
    .png()
    .toBuffer();
  const response = await actor.request(`${path}/profile-images/${id}`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'image/png',
      'x-skyttel-content-version': String(state.contentVersion),
      'x-skyttel-draft-version': String(state.draft.version),
      'x-skyttel-object-revision': String(current?.revision ?? null),
    },
    body: new Uint8Array(image),
  });
  expect(response.status).toBe(200);
  return (await readMap(actor)).draft.changes.find((change) => change.id === id)?.after
    ?.profileImageId as string;
}
async function proposeMerge(choices: Record<string, string> = {}, actor = client) {
  const state = await readMap(actor);
  const objects = mergeObjects(state);
  const relationships = mergeConnections(state, ['a', 'b']);
  const response = await actor.json(`${path}/map/merge`, {
    version: state.draft.version,
    survivorId: 'a',
    absorbedId: 'b',
    identityConfirmed: true,
    reviewed: {
      objects: ['a', 'b'].map((id) => objects.get(id)),
      relationships,
      types: proposedObjectTypes(state.types, state.draft.objectTypes).filter((type) =>
        ['a', 'b'].some((id) => objects.get(id)?.typeId === type.id),
      ),
      relationshipTypes: proposedRelationshipTypes(
        state.relationshipTypes,
        state.draft.relationshipTypes,
      ).filter((type) => relationships.some((edge) => edge.typeId === type.id)),
    },
    choices,
    relationships: relationships.map((edge) => ({ id: edge.id, action: 'keep' })),
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

test('an administrator reviews exact erasure scope without changing shared or private content', async () => {
  const initial = await (await client.request(`${path}/map`)).json();
  for (const id of ['erase', 'keep']) {
    const state = await (await client.request(`${path}/map`)).json();
    expect(
      (
        await client.json(`${path}/map/draft`, {
          id,
          version: state.draft.version,
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: id, description: `Private ${id}` },
        })
      ).status,
    ).toBe(200);
  }
  const before = await (await client.request(`${path}/map`)).json();
  const response = await client.json(`${path}/erasure/review`, {
    selection: [{ kind: 'object', id: 'erase' }],
  });
  expect(response.status).toBe(200);
  const review = await response.json();
  expect(review.objects).toEqual([{ id: 'erase', name: 'erase' }]);
  expect(review.relationships).toEqual([]);
  expect(review.token).toMatch(/^[a-f0-9]{64}$/);
  expect(await (await client.request(`${path}/map`)).json()).toEqual(before);
});

test('the erasure catalog does not expose another owner’s private proposal or let a guessed identity preview it', async () => {
  fixture.setSubject('robin');
  const member = fixture.client();
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (await client.json(`${path}/invitations`, { userId: user.id })).json();
  await member.json('/api/invitations/accept', { code });
  const state = await (await member.request(`${path}/map`)).json();
  await member.json(`${path}/map/draft`, {
    id: 'private-secret',
    version: 0,
    baseRevision: null,
    value: {
      typeId: state.types[0].id,
      name: 'PRIVATE-PREVIEW-SENTINEL',
      description: 'Private text',
    },
  });
  const catalog = await client.request(`${path}/erasure`);
  expect(catalog.status).toBe(200);
  expect(await catalog.text()).not.toContain('private-secret');
  expect(
    (
      await client.json(`${path}/erasure/review`, {
        selection: [{ kind: 'object', id: 'private-secret' }],
      })
    ).status,
  ).toBe(404);
});

test('erasing an old endpoint preserves a relationship now connecting two unrelated objects', async () => {
  const read = async () => (await client.request(`${path}/map`)).json();
  for (const id of ['a', 'b', 'c']) {
    const state = await read();
    await client.json(`${path}/map/draft`, {
      id,
      version: state.draft.version,
      baseRevision: null,
      value: { typeId: state.types[0].id, name: id, description: '' },
    });
  }
  let state = await read();
  await client.json(`${path}/map/relationship`, {
    id: 'edge',
    version: state.draft.version,
    baseRevision: null,
    value: {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'a',
      targetId: 'c',
      knowledge: 'known',
    },
  });
  state = await read();
  await client.json(`${path}/map/save`, { version: state.draft.version, operationId: 'original' });
  state = await read();
  await client.json(`${path}/map/relationship`, {
    id: 'edge',
    version: state.draft.version,
    baseRevision: 1,
    value: { ...state.relationships[0], sourceId: 'b' },
  });
  state = await read();
  await client.json(`${path}/map/save`, {
    version: state.draft.version,
    operationId: 'redirected',
  });
  const review = await (
    await client.json(`${path}/erasure/review`, { selection: [{ kind: 'object', id: 'a' }] })
  ).json();
  expect(review.objects).toEqual([{ id: 'a', name: 'a' }]);
  expect(review.relationships).toEqual([]);
  expect(review.historyChanges).toBeGreaterThan(0);
  expect(
    (
      await client.json(`${path}/erasure/execute`, {
        selection: review.selection,
        token: review.token,
        operationId: 'erase-a',
        confirmation: 'RADERA PERMANENT',
      })
    ).status,
  ).toBe(200);
  state = await read();
  expect(state.relationships).toMatchObject([{ id: 'edge', sourceId: 'b', targetId: 'c' }]);
  expect(state.objects.map((item: { id: string }) => item.id)).toEqual(['b', 'c']);
  expect(await (await client.request(`${path}/map/history`)).text()).not.toContain(
    '"sourceId":"a"',
  );
});

test('permanent erasure removes one identity from mixed history and private drafts while preserving unrelated changes', async () => {
  const read = async () => (await client.request(`${path}/map`)).json();
  for (const id of ['erase', 'keep']) {
    const state = await read();
    await client.json(`${path}/map/draft`, {
      id,
      version: state.draft.version,
      baseRevision: null,
      value: { typeId: state.types[0].id, name: id, description: `${id}-saved` },
    });
  }
  let state = await read();
  const saved = await (
    await client.json(`${path}/map/save`, { version: state.draft.version, operationId: 'mixed' })
  ).json();
  for (const id of ['erase', 'keep']) {
    state = await read();
    const before = state.objects.find((item: { id: string }) => item.id === id);
    await client.json(`${path}/map/draft`, {
      id,
      version: state.draft.version,
      baseRevision: before.revision,
      value: { ...before, description: `${id}-private` },
    });
  }
  const selection = [{ kind: 'object', id: 'erase' }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  const response = await client.json(`${path}/erasure/execute`, {
    selection,
    token: review.token,
    operationId: 'erase-operation',
    confirmation: 'RADERA PERMANENT',
  });
  expect(response.status).toBe(200);
  expect((await response.json()).status.phase).toBe('completed');
  state = await read();
  expect(state.objects.map((item: { id: string }) => item.id)).toEqual(['keep']);
  expect(state.draft.changes).toHaveLength(1);
  expect(state.draft.changes[0].after.description).toBe('keep-private');
  const { history } = await (await client.request(`${path}/map/history`)).json();
  expect(history).toHaveLength(1);
  expect(history[0].changes.map((item: { after: { id: string } }) => item.after.id)).toEqual([
    'keep',
  ]);
  expect(history[0].operationId).toBe(saved.receipt.operationId);
  expect(
    (
      await client.json(`${path}/map/save`, {
        version: saved.receipt.draftVersion,
        operationId: 'mixed',
        contentVersion: review.contentVersion,
      })
    ).status,
  ).toBe(409);
  await client.json(`${path}/map/discard`, {
    version: state.draft.version,
    contentVersion: state.contentVersion,
  });
  state = await read();
  expect(
    (
      await client.json(`${path}/map/undo`, {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        operationId: history[0].operationId,
        userId: history[0].userId,
      })
    ).status,
  ).toBe(200);
  state = await read();
  expect(state.draft.changes.map((item: { id: string }) => item.id)).toEqual(['keep']);
  expect(state.draft.changes[0].after).toBeNull();
});

test('a pinned database reader keeps cleanup protected until resume verifies WAL and freed-page cleanup', async () => {
  const sentinel = 'ERASURE-OLD-PAGE-SENTINEL';
  await object('erase', { description: sentinel.repeat(50) });
  await object('keep', { description: 'Unrelated live information' });
  await save('mixed');
  const request = await reviewed([{ kind: 'object', id: 'erase' }]);
  const reader = new Database(fixture.config.databasePath);
  reader.exec('BEGIN');
  expect(reader.prepare("SELECT description FROM map_object WHERE id = 'erase'").get()).toEqual({
    description: sentinel.repeat(50),
  });
  try {
    const response = await client.json(`${path}/erasure/execute`, request);
    expect(response.status).toBe(202);
    expect((await response.json()).status.phase).toBe('cleanup');
    expect((await client.request(`${path}/map`)).status).toBe(409);
    expect((await client.json(`${path}/exports`, {})).status).toBe(409);
    const catalog = await (await client.request(`${path}/erasure`)).json();
    expect(catalog).toMatchObject({
      objects: [],
      status: { operationId: request.operationId, phase: 'cleanup' },
    });
    const pending = fixture.database
      .prepare('SELECT payload, counts FROM content_maintenance')
      .get() as { payload: string | null; counts: string };
    expect(pending.payload).toBeNull();
    expect(pending.counts).not.toContain('erase');
    expect(
      (await client.json(`${path}/erasure/resume`, { operationId: request.operationId })).status,
    ).toBe(202);
  } finally {
    reader.exec('ROLLBACK');
    reader.close();
  }
  const resumed = await client.json(`${path}/erasure/resume`, { operationId: request.operationId });
  expect(resumed.status).toBe(200);
  expect((await resumed.json()).status.phase).toBe('completed');
  expect((await readMap()).objects.map(({ id }) => id)).toEqual(['keep']);
  expect(fixture.database.pragma('freelist_count', { simple: true })).toBe(0);
  expect(fixture.database.pragma('wal_checkpoint(TRUNCATE)')).toEqual([
    { busy: 0, log: 0, checkpointed: 0 },
  ]);
  for (const suffix of ['', '-wal', '-journal'])
    if (existsSync(`${fixture.config.databasePath}${suffix}`))
      expect(
        readFileSync(`${fixture.config.databasePath}${suffix}`).includes(Buffer.from(sentinel)),
      ).toBe(false);
  const repeated = await client.json(`${path}/erasure/execute`, request);
  expect(repeated.status).toBe(200);
  expect((await readMap()).contentVersion).toBe(2);
  expect(
    (await client.json(`${path}/erasure/execute`, { ...request, token: '0'.repeat(64) })).status,
  ).toBe(409);
});

test('an interrupted replacement rolls back all content and resumes the same durable operation', async () => {
  await object('erase');
  await object('keep');
  await save('saved');
  const request = await reviewed([{ kind: 'object', id: 'erase' }]);
  fixture.database.exec(
    "CREATE TRIGGER erasure_fault BEFORE UPDATE OF phase ON content_maintenance WHEN NEW.phase = 'cleanup' BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END",
  );
  const failed = await client.json(`${path}/erasure/execute`, request);
  expect(failed.status).toBe(202);
  expect((await failed.json()).status.phase).toBe('prepared');
  expect(fixture.database.prepare('SELECT id FROM map_object ORDER BY id').all()).toEqual([
    { id: 'erase' },
    { id: 'keep' },
  ]);
  expect((await client.request(`${path}/map`)).status).toBe(409);
  fixture.database.exec('DROP TRIGGER erasure_fault');
  const resumed = await client.json(`${path}/erasure/execute`, request);
  expect(resumed.status).toBe(200);
  expect((await readMap()).objects.map(({ id }) => id)).toEqual(['keep']);
});

test('review changes require a new review and all administrator, origin and input boundaries deny execution', async () => {
  await object('erase');
  const request = await reviewed([{ kind: 'object', id: 'erase' }]);
  await object('keep');
  expect((await client.json(`${path}/erasure/execute`, request)).status).toBe(409);
  expect((await (await client.json(`${path}/erasure/execute`, request)).json()).error).toBe(
    'erasure_review_changed',
  );
  const { actor, userId } = await invite();
  for (const who of [fixture.client(), actor]) {
    const status = who === actor ? 403 : 401;
    expect((await who.request(`${path}/erasure`)).status).toBe(status);
    for (const endpoint of ['review', 'execute', 'resume'])
      expect((await who.json(`${path}/erasure/${endpoint}`, request)).status).toBe(status);
  }
  expect((await client.json('/api/households/another/erasure/execute', request)).status).toBe(403);
  expect(
    (
      await client.request(`${path}/erasure/execute`, {
        method: 'POST',
        headers: { origin: 'https://wrong.test', 'content-type': 'application/json' },
        body: JSON.stringify(request),
      })
    ).status,
  ).toBe(403);
  for (const selection of [
    [],
    null,
    [{ kind: 'other', id: 'erase' }],
    [{ kind: 'object', id: '../erase' }],
  ])
    expect((await client.json(`${path}/erasure/review`, { selection })).status).toBe(400);
  expect(
    (await client.json(`${path}/erasure/execute`, { ...request, confirmation: 'yes' })).status,
  ).toBe(400);
  expect((await client.json(`${path}/erasure/resume`, {})).status).toBe(400);
  expect((await client.json(`${path}/erasure/resume`, { operationId: 'missing' })).status).toBe(
    404,
  );
  await client.json(`${path}/members/${userId}/revoke`, {});
  expect((await actor.request(`${path}/erasure`)).status).toBe(403);
});

test('ready server exports are removed and fresh downloads contain only surviving mixed content', async () => {
  await object('erase', { description: 'ERASE-EXPORT-SENTINEL' });
  await object('keep', { description: 'Kept export text' });
  await save('saved');
  const old = await (await client.json(`${path}/exports`, {})).json();
  const request = await reviewed([{ kind: 'object', id: 'erase' }]);
  expect((await client.json(`${path}/erasure/execute`, request)).status).toBe(200);
  expect((await client.request(`${path}/exports/${old.id}`)).status).toBe(404);
  expect(readdirSync(join(dirname(fixture.config.databasePath), '.skyttel-exports'))).toEqual([]);
  const fresh = await (await client.json(`${path}/exports`, {})).json();
  const response = await client.request(`${path}/exports/${fresh.id}`);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const content = Buffer.from(archive['content.json']).toString();
  expect(content).not.toContain('ERASE-EXPORT-SENTINEL');
  expect(content).toContain('Kept export text');
});

test('erasing a former type keeps current values and rebases only erased private meaning', async () => {
  for (const id of ['former', 'current']) {
    const state = await readMap();
    expect(
      (
        await client.json(`${path}/map/object-type`, {
          id,
          version: state.draft.version,
          baseRevision: null,
          value: {
            name: id,
            description: '',
            fields: [
              { id: 'former', name: 'Arbitrary field', description: '', kind: 'text' },
              { id: 'enabled', name: 'Enabled', description: '', kind: 'boolean' },
            ],
          },
        })
      ).status,
    ).toBe(200);
  }
  await object('independent', { typeId: 'former', customValues: { former: 'ERASE-TYPE-VALUE' } });
  await save('former-save');
  const { actor } = await invite();
  await object('independent', { description: 'Private independent edit' }, actor);
  await object('independent', {
    typeId: 'current',
    customValues: { former: 'former', enabled: false },
    description: 'New shared description',
  });
  await save('change-type');
  const selection: ErasureSelection = [{ kind: 'objectType', id: 'former' }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  expect(review.objects).toEqual([]);
  expect(review.objectTypes).toEqual([{ id: 'former', name: 'former' }]);
  expect(
    (
      await client.json(`${path}/erasure/execute`, {
        selection,
        token: review.token,
        operationId: 'erase-type',
        confirmation: 'RADERA PERMANENT',
      })
    ).status,
  ).toBe(200);
  const current = await readMap();
  expect(current.objects).toMatchObject([
    {
      id: 'independent',
      typeId: 'current',
      description: 'New shared description',
      customValues: { former: 'former', enabled: false },
    },
  ]);
  expect(current.types.some(({ id }) => id === 'former')).toBe(false);
  const privateState = await readMap(actor);
  expect(privateState.draft.changes).toMatchObject([
    {
      id: 'independent',
      before: { typeId: 'current', description: '', revision: 1 },
      after: {
        typeId: 'current',
        description: 'Private independent edit',
        customValues: { former: 'former', enabled: false },
      },
    },
  ]);
  expect(JSON.stringify(privateState)).not.toContain('ERASE-TYPE-VALUE');
  expect(draftConflicts(privateState)).toHaveLength(1);
  expect(
    (
      await actor.json(`${path}/map/save`, {
        version: privateState.draft.version,
        contentVersion: privateState.contentVersion,
        operationId: 'preserved-conflict',
      })
    ).status,
  ).toBe(409);
  expect(await (await client.request(`${path}/map/history`)).text()).not.toContain(
    'ERASE-TYPE-VALUE',
  );
});

test('erasing a former type removes its last historical image reference and bytes but preserves the current image', async () => {
  for (const id of ['former-image-type', 'current-image-type']) {
    const state = await readMap();
    expect(
      (
        await client.json(`${path}/map/object-type`, {
          id,
          version: state.draft.version,
          contentVersion: state.contentVersion,
          baseRevision: null,
          value: { name: id, description: '', fields: [] },
        })
      ).status,
    ).toBe(200);
  }
  await object('retained-image-object', { typeId: 'former-image-type' });
  await save('image-object-created');
  const oldImage = await upload('retained-image-object', client, true);
  await save('former-image-saved');
  const oldBytes = Buffer.from(
    await (await client.request(`${path}/profile-images/${oldImage}`)).arrayBuffer(),
  );
  const sentinel = oldBytes.subarray(32, 64);
  expect(
    ['', '-wal'].some((suffix) =>
      existsSync(`${fixture.config.databasePath}${suffix}`)
        ? readFileSync(`${fixture.config.databasePath}${suffix}`).includes(sentinel)
        : false,
    ),
  ).toBe(true);
  await object('retained-image-object', { typeId: 'current-image-type', description: oldImage });
  const currentImage = await upload('retained-image-object', client, true);
  await save('new-type-and-image');
  const selection: ErasureSelection = [{ kind: 'objectType', id: 'former-image-type' }];
  const reviewResponse = await client.json(`${path}/erasure/review`, { selection });
  expect(reviewResponse.status).toBe(200);
  const review = await reviewResponse.json();
  expect(review.objects).toEqual([]);
  expect(review.imageVersions).toEqual([{ id: oldImage, objectId: 'retained-image-object' }]);
  expect(review.images).toBe(1);
  const result = await client.json(`${path}/erasure/execute`, {
    selection,
    token: review.token,
    operationId: 'erase-former-image-type',
    confirmation: 'RADERA PERMANENT',
  });
  expect(result.status).toBe(200);
  expect((await result.json()).status).toMatchObject({ phase: 'completed', counts: { images: 1 } });
  expect((await readMap()).objects).toEqual([
    expect.objectContaining({
      id: 'retained-image-object',
      typeId: 'current-image-type',
      profileImageId: currentImage,
      description: oldImage,
    }),
  ]);
  expect((await client.request(`${path}/profile-images/${oldImage}`)).status).toBe(404);
  expect((await client.request(`${path}/profile-images/${currentImage}`)).status).toBe(200);
  const prepared = await client.json(`${path}/exports`, {});
  expect(prepared.status).toBe(201);
  const archiveId = (await prepared.json()).id;
  const archive = unzipSync(
    new Uint8Array(await (await client.request(`${path}/exports/${archiveId}`)).arrayBuffer()),
  );
  const exported = JSON.parse(Buffer.from(archive['content.json']).toString());
  expect(exported.images.map((image: { id: string }) => image.id)).toEqual([currentImage]);
  expect(Buffer.from(archive['images.bin']).includes(sentinel)).toBe(false);
  expect(exported.objects[0].description).toBe(oldImage);
  for (const suffix of ['', '-wal', '-journal'])
    if (existsSync(`${fixture.config.databasePath}${suffix}`))
      expect(readFileSync(`${fixture.config.databasePath}${suffix}`).includes(sentinel)).toBe(
        false,
      );
  expect(fixture.database.pragma('freelist_count', { simple: true })).toBe(0);
});

test('erasing historical meaning preserves images still used by current objects, independent history and another owner’s draft', async () => {
  const initial = await readMap();
  const formerType = initial.types[0].id;
  const currentType = initial.types[1].id;
  for (const id of ['current-reference', 'history-reference', 'private-reference'])
    await object(id, { typeId: formerType });
  await save('three-original-objects');
  const currentImage = await upload('current-reference', client, true);
  const historicalImage = await upload('history-reference', client, true);
  const privateImage = await upload('private-reference', client, true);
  await save('three-original-images');
  const { actor } = await invite();
  await object('private-reference', { description: 'Independent private image reference' }, actor);
  for (const id of ['current-reference', 'history-reference', 'private-reference'])
    await object(id, { typeId: currentType });
  await save('new-meaning');
  await object('history-reference', { description: 'Independent history keeps its earlier image' });
  await save('independent-history');
  const latestHistoryImage = await upload('history-reference', client, true);
  const latestPrivateImage = await upload('private-reference', client, true);
  await save('replace-current-pictures');
  const selection: ErasureSelection = [{ kind: 'objectType', id: formerType }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  expect(review.objects).toEqual([]);
  expect(review.images).toBe(0);
  expect((await client.json(`${path}/erasure/execute`, await reviewed(selection))).status).toBe(
    200,
  );
  const state = await readMap(actor);
  expect(state.draft.changes).toMatchObject([
    {
      id: 'private-reference',
      before: { profileImageId: privateImage, typeId: currentType },
      after: {
        profileImageId: privateImage,
        typeId: currentType,
        description: 'Independent private image reference',
      },
    },
  ]);
  for (const image of [currentImage, historicalImage, latestHistoryImage, latestPrivateImage])
    expect((await client.request(`${path}/profile-images/${image}`)).status).toBe(200);
  expect((await actor.request(`${path}/profile-images/${privateImage}`)).status).toBe(200);
  const ready = await (await client.json(`${path}/exports`, {})).json();
  const archive = unzipSync(
    new Uint8Array(await (await client.request(`${path}/exports/${ready.id}`)).arrayBuffer()),
  );
  const exported = JSON.parse(Buffer.from(archive['content.json']).toString());
  expect(exported.images.map((image: { id: string }) => image.id).sort()).toEqual(
    [currentImage, historicalImage, privateImage, latestHistoryImage, latestPrivateImage].sort(),
  );
});

test('erasing a private merge’s type removes its orphaned private versions and copy without exposing them or erasing shared source images', async () => {
  const initial = await readMap();
  for (const id of ['a', 'b']) await object(id, { name: 'Lo', typeId: initial.types[0].id });
  const sharedImage = await upload('b', client, true);
  await save('shared-source-image');
  const { actor } = await invite();
  const privateImage = await upload('a', actor, true);
  await object('a', { typeId: initial.types[1].id }, actor);
  await proposeMerge({ typeId: 'survivor', profileImageId: 'absorbed' }, actor);
  const copiedImage = (await readMap(actor)).draft.changes.find((change) => change.id === 'a')
    ?.after?.profileImageId as string;
  expect(copiedImage).not.toBe(sharedImage);
  const selection: ErasureSelection = [{ kind: 'objectType', id: initial.types[1].id }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  expect(review.objects).toEqual([]);
  expect(review.images).toBe(2);
  expect(review.privateImages).toBe(2);
  expect(review.imageVersions).toEqual([]);
  expect(JSON.stringify(review)).not.toContain(privateImage);
  expect(JSON.stringify(review)).not.toContain(copiedImage);
  const erased = await client.json(`${path}/erasure/execute`, await reviewed(selection));
  expect(erased.status).toBe(200);
  expect((await erased.json()).status.counts.images).toBe(2);
  expect((await readMap()).objects.map(({ id }) => id)).toEqual(['a', 'b']);
  for (const id of [privateImage, copiedImage])
    expect((await actor.request(`${path}/profile-images/${id}`)).status).toBe(404);
  expect((await client.request(`${path}/profile-images/${sharedImage}`)).status).toBe(200);
  const ready = await (await client.json(`${path}/exports`, {})).json();
  const archive = unzipSync(
    new Uint8Array(await (await client.request(`${path}/exports/${ready.id}`)).arrayBuffer()),
  );
  const exported = JSON.parse(Buffer.from(archive['content.json']).toString());
  expect(exported.images.map((image: { id: string }) => image.id)).toEqual([sharedImage]);
  expect(JSON.stringify(exported)).not.toContain(privateImage);
  expect(JSON.stringify(exported)).not.toContain(copiedImage);
});

test('scoped erasure preserves an unrelated orphan image admitted by a complete archive import', async () => {
  await object('erased-object');
  await object('unrelated-owner');
  const existingImage = await upload('unrelated-owner', client, true);
  await save('archive-original');
  const readyExport = await (await client.json(`${path}/exports`, {})).json();
  const parts = unzipSync(
    new Uint8Array(await (await client.request(`${path}/exports/${readyExport.id}`)).arrayBuffer()),
  );
  const content = JSON.parse(Buffer.from(parts['content.json']).toString());
  const orphanBytes = await sharp({
    create: { width: 16, height: 16, channels: 3, background: '#eb7534' },
  })
    .webp()
    .toBuffer();
  content.images.push({
    ...content.images[0],
    id: 'unrelated-orphan-image',
    width: 16,
    height: 16,
    offset: parts['images.bin'].length,
    length: orphanBytes.length,
    sha256: createHash('sha256').update(orphanBytes).digest('hex'),
  });
  parts['images.bin'] = Buffer.concat([parts['images.bin'], orphanBytes]);
  parts['content.json'] = Buffer.from(JSON.stringify(content));
  const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
  for (const part of manifest.parts) {
    part.bytes = parts[part.path].length;
    part.sha256 = createHash('sha256').update(parts[part.path]).digest('hex');
  }
  parts['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  const uploadResponse = await client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'x-skyttel-content-version': '1',
    },
    body: new Uint8Array(zipSync(parts)),
  });
  expect(uploadResponse.status, await uploadResponse.clone().text()).toBe(201);
  const readyImport = await uploadResponse.json();
  const imported = await client.json(`${path}/imports/${readyImport.id}/confirm`, {
    contentVersion: 1,
    confirmed: true,
  });
  expect(imported.status).toBe(200);
  expect((await imported.json()).status).toBe('completed');
  const selection: ErasureSelection = [{ kind: 'object', id: 'erased-object' }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  expect(review.images).toBe(0);
  expect((await client.json(`${path}/erasure/execute`, await reviewed(selection))).status).toBe(
    200,
  );
  const exported = await (await client.json(`${path}/exports`, {})).json();
  const archive = unzipSync(
    new Uint8Array(await (await client.request(`${path}/exports/${exported.id}`)).arrayBuffer()),
  );
  const result = JSON.parse(Buffer.from(archive['content.json']).toString());
  expect(result.images.map((image: { id: string }) => image.id).sort()).toEqual(
    [existingImage, 'unrelated-orphan-image'].sort(),
  );
  const orphan = result.images.find(
    (image: { id: string }) => image.id === 'unrelated-orphan-image',
  );
  expect(
    Buffer.from(archive['images.bin'].subarray(orphan.offset, orphan.offset + orphan.length)),
  ).toEqual(orphanBytes);
  expect((await readMap()).objects.map(({ id }) => id)).toEqual(['unrelated-owner']);
});

test('an old endpoint is removed from another owner’s private proposal without losing its independent end-date conflict', async () => {
  for (const id of ['a', 'b', 'c']) await object(id);
  let state = await readMap();
  await client.json(`${path}/map/relationship`, {
    id: 'edge',
    version: state.draft.version,
    baseRevision: null,
    value: {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'a',
      targetId: 'c',
      knowledge: 'known',
    },
  });
  await save('original');
  const { actor } = await invite();
  state = await readMap(actor);
  expect(
    (
      await actor.json(`${path}/map/relationship`, {
        id: 'edge',
        version: state.draft.version,
        baseRevision: 1,
        value: { ...state.relationships[0], endDate: { knowledge: 'known', value: '2030-01-01' } },
      })
    ).status,
  ).toBe(200);
  state = await readMap();
  await client.json(`${path}/map/relationship`, {
    id: 'edge',
    version: state.draft.version,
    baseRevision: 1,
    value: {
      ...state.relationships[0],
      sourceId: 'b',
      endDate: { knowledge: 'known', value: '2031-01-01' },
    },
  });
  await save('redirect');
  expect(
    (await client.json(`${path}/erasure/execute`, await reviewed([{ kind: 'object', id: 'a' }])))
      .status,
  ).toBe(200);
  state = await readMap(actor);
  expect(state.relationships).toMatchObject([
    { id: 'edge', sourceId: 'b', endDate: { value: '2031-01-01' } },
  ]);
  expect(state.draft.relationships).toMatchObject([
    {
      id: 'edge',
      before: { sourceId: 'b', revision: 1 },
      after: { sourceId: 'b', endDate: { value: '2030-01-01' } },
    },
  ]);
  expect(JSON.stringify(state.draft)).not.toContain('"a"');
  expect(draftConflicts(state)).toHaveLength(1);
});

test('merged identities and image copies are explicitly reviewed and erased across all owners while neighbours survive', async () => {
  for (const id of ['a', 'b', 'neighbour']) await object(id, { name: 'Lo' });
  const original = await upload('b');
  await save('images');
  const { actor } = await invite();
  const hidden = await upload('b', actor);
  let state = await readMap();
  await client.json(`${path}/map/relationship`, {
    id: 'edge',
    version: state.draft.version,
    baseRevision: null,
    value: {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'b',
      targetId: 'neighbour',
      knowledge: 'known',
    },
  });
  await save('edge');
  await proposeMerge({ profileImageId: 'absorbed' });
  const copied = (await readMap()).draft.changes.find((change) => change.id === 'a')?.after
    ?.profileImageId;
  expect(copied).not.toBe(original);
  await save('merge');
  state = await readMap(actor);
  for (const id of ['b', 'neighbour'])
    expect(
      (
        await actor.json(`${path}/map/view/position`, {
          id,
          version: 0,
          contentVersion: state.contentVersion,
          position: { x: 4, y: 2, z: 1 },
        })
      ).status,
    ).toBe(200);
  const selection: ErasureSelection = [{ kind: 'object', id: 'b' }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  expect(review.objects.map((item: { id: string }) => item.id)).toEqual(['a', 'b']);
  expect(review.relationships.map((item: { id: string }) => item.id)).toEqual(['edge']);
  expect(review.images).toBe(3);
  expect(review.privateImages).toBe(1);
  expect(review.positions).toBe(1);
  expect(review.imageVersions.map((item: { id: string }) => item.id).sort()).toEqual(
    [original, copied].sort(),
  );
  expect(JSON.stringify(review)).not.toContain(hidden);
  expect(
    (
      await client.json(`${path}/erasure/execute`, {
        selection,
        token: review.token,
        operationId: 'erase-merge',
        confirmation: 'RADERA PERMANENT',
      })
    ).status,
  ).toBe(200);
  expect((await readMap()).objects.map(({ id }) => id)).toEqual(['neighbour']);
  expect((await readMap(actor)).draft.changes).toEqual([]);
  expect(
    (await (await actor.request(`${path}/map/view`)).json()).positions.map(
      (item: { id: string }) => item.id,
    ),
  ).toEqual(['neighbour']);
  for (const id of [original, copied, hidden])
    expect((await client.request(`${path}/profile-images/${id}`)).status).toBe(404);
  expect(await (await client.request(`${path}/map/history`)).text()).not.toContain('"merge"');
});

test('erasing a type removes private dependent identities without exposing their identifiers or pictures', async () => {
  const initial = await readMap();
  const typeId = initial.types[0].id;
  const { actor } = await invite();
  await object('hidden-object', { typeId, name: 'PRIVATE-TYPE-SENTINEL' }, actor);
  const image = await upload('hidden-object', actor);
  await object('public-object', { typeId });
  await save('public-save');
  const selection: ErasureSelection = [{ kind: 'objectType', id: typeId }];
  const review = await (await client.json(`${path}/erasure/review`, { selection })).json();
  expect(review.objects.map((item: { id: string }) => item.id)).toEqual(['public-object']);
  expect(review.privateObjects).toBe(1);
  expect(review.privateImages).toBe(1);
  expect(review.imageVersions).toEqual([]);
  expect(JSON.stringify(review)).not.toContain('hidden-object');
  expect(JSON.stringify(review)).not.toContain('PRIVATE-TYPE-SENTINEL');
  expect(
    (
      await client.json(`${path}/erasure/execute`, {
        selection,
        token: review.token,
        operationId: 'erase-private-scope',
        confirmation: 'RADERA PERMANENT',
      })
    ).status,
  ).toBe(200);
  expect((await readMap(actor)).draft.changes).toEqual([]);
  expect((await actor.request(`${path}/profile-images/${image}`)).status).toBe(404);
});

test('private-only definitions and their dependent proposals can be erased without affecting shared endpoints', async () => {
  await object('keep');
  await save('keep');
  let state = await readMap();
  expect(
    (
      await client.json(`${path}/map/object-type`, {
        id: 'private-type',
        version: state.draft.version,
        baseRevision: null,
        value: { name: 'Private type', description: '', fields: [] },
      })
    ).status,
  ).toBe(200);
  await object('private-object', { typeId: 'private-type' });
  state = await readMap();
  expect(
    (
      await client.json(`${path}/map/relationship-type`, {
        id: 'private-edge-type',
        version: state.draft.version,
        baseRevision: null,
        value: {
          name: 'Private relationship type',
          description: '',
          forwardLabel: 'Owns',
          reverseLabel: 'Owned by',
        },
      })
    ).status,
  ).toBe(200);
  state = await readMap();
  expect(
    (
      await client.json(`${path}/map/relationship`, {
        id: 'private-edge',
        version: state.draft.version,
        baseRevision: null,
        value: {
          typeId: 'private-edge-type',
          sourceId: 'private-object',
          targetId: 'keep',
          knowledge: 'known',
        },
      })
    ).status,
  ).toBe(200);
  const request = await reviewed([
    { kind: 'objectType', id: 'private-type' },
    { kind: 'relationshipType', id: 'private-edge-type' },
  ]);
  expect((await client.json(`${path}/erasure/execute`, request)).status).toBe(200);
  state = await readMap();
  expect(state.objects.map(({ id }) => id)).toEqual(['keep']);
  expect(state.draft.changes).toEqual([]);
  expect(state.draft.relationships ?? []).toEqual([]);
  expect(state.draft.objectTypes ?? []).toEqual([]);
  expect(state.draft.relationshipTypes ?? []).toEqual([]);
});

test('an erased former type cannot remain as a no-op private undo proposal', async () => {
  const initial = await readMap();
  await object('keep', { typeId: initial.types[0].id });
  await save('original');
  await object('keep', { typeId: initial.types[1].id });
  const receipt = await save('new-type');
  let state = await readMap();
  expect(
    (
      await client.json(`${path}/map/undo`, {
        version: state.draft.version,
        operationId: receipt.operationId,
        userId: receipt.userId,
      })
    ).status,
  ).toBe(200);
  const request = await reviewed([{ kind: 'objectType', id: initial.types[0].id }]);
  expect((await client.json(`${path}/erasure/execute`, request)).status).toBe(200);
  state = await readMap();
  expect(state.objects).toMatchObject([{ id: 'keep', typeId: initial.types[1].id }]);
  expect(state.draft.changes).toEqual([]);
});

test.each([false, true])(
  'erased relationships cannot return through a merge’s previous proposals or history (saved: %s)',
  async (saved) => {
    for (const id of ['a', 'b', 'neighbour']) await object(id, { name: 'Lo' });
    let state = await readMap();
    const typeId = state.relationshipTypes[0].id;
    await client.json(`${path}/map/relationship`, {
      id: 'edge',
      version: state.draft.version,
      baseRevision: null,
      value: { typeId, sourceId: 'b', targetId: 'neighbour', knowledge: 'known' },
    });
    await save('original');
    await object('a', { description: 'Independent prior proposal' });
    state = await readMap();
    await client.json(`${path}/map/relationship`, {
      id: 'edge',
      version: state.draft.version,
      baseRevision: 1,
      value: { ...state.relationships[0], endDate: { knowledge: 'known', value: '2030-01-01' } },
    });
    await proposeMerge({ description: 'survivor' });
    const merged = saved ? await save('merged') : null;
    const request = await reviewed([{ kind: 'relationshipType', id: typeId }]);
    expect((await client.json(`${path}/erasure/execute`, request)).status).toBe(200);
    state = await readMap();
    expect(state.relationships).toEqual([]);
    if (merged) {
      const response = await client.json(`${path}/map/undo`, {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        operationId: merged.operationId,
        userId: merged.userId,
      });
      expect(response.status).toBe(200);
      await save('fresh-undo');
      state = await readMap();
      expect(state.objects.map(({ id }) => id)).toEqual(['a', 'b', 'neighbour']);
      expect(state.relationships).toEqual([]);
    } else {
      const merge = state.draft.changes.find((change) => change.merge)?.merge;
      expect(merge).toMatchObject({
        relationships: [],
        relationshipTypes: [],
        previousRelationships: [],
      });
      expect(
        (
          await client.json(`${path}/map/discard-change`, {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            kind: 'object',
            id: 'a',
          })
        ).status,
      ).toBe(200);
      state = await readMap();
      expect(state.draft.relationships ?? []).toEqual([]);
      expect(state.draft.changes).toMatchObject([
        { id: 'a', after: { description: 'Independent prior proposal' } },
      ]);
      await save('prior-proposal');
      expect((await readMap()).relationships).toEqual([]);
    }
  },
);

test('erasure is household-scoped even while database-wide cleanup temporarily protects the other household', async () => {
  const { user } = await (await client.request('/api/bootstrap')).json();
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('other', 'Other household', new Date().toISOString());
  fixture.database
    .prepare(
      "INSERT INTO membership (householdId, userId, role) VALUES ('other', ?, 'administrator')",
    )
    .run(user.id);
  const first = path;
  path = '/api/households/other';
  await object('unrelated-household', { name: 'Other household content' });
  await save('other-save');
  const otherBefore = await readMap();
  const historyBefore = await (await client.request(`${path}/map/history`)).json();
  path = first;
  await object('erase');
  await save('first-save');
  const reader = new Database(fixture.config.databasePath);
  reader.exec('BEGIN');
  reader.prepare("SELECT * FROM map_object WHERE householdId = 'other'").all();
  const request = await reviewed([{ kind: 'object', id: 'erase' }]);
  try {
    expect((await client.json(`${path}/erasure/execute`, request)).status).toBe(202);
    expect((await client.request('/api/households/other/map')).status).toBe(409);
    expect((await client.json('/api/households/other/exports', {})).status).toBe(409);
  } finally {
    reader.exec('ROLLBACK');
    reader.close();
  }
  expect(
    (await client.json(`${path}/erasure/resume`, { operationId: request.operationId })).status,
  ).toBe(200);
  path = '/api/households/other';
  expect(await readMap()).toEqual(otherBefore);
  expect(await (await client.request(`${path}/map/history`)).json()).toEqual(historyBefore);
});

test('erasure aborts a preparing export before its selected snapshot can become downloadable', async () => {
  await object('erase', { description: 'ERASE-PREPARING-SENTINEL' });
  await save('original');
  const request = await reviewed([{ kind: 'object', id: 'erase' }]);
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-exports');
  let erasing: Promise<Response> | undefined;
  const observer = watch(directory, { recursive: true }, (_event, file) => {
    if (erasing || !file?.endsWith('content.json')) return;
    try {
      if (!statSync(join(directory, file)).size) return;
    } catch {
      return;
    }
    erasing = client.json(`${path}/erasure/execute`, request);
  });
  try {
    const exporting = await client.json(`${path}/exports`, {});
    expect(erasing).toBeDefined();
    expect(exporting.status).toBe(409);
    expect(await exporting.json()).toEqual({ error: 'export_cancelled' });
    expect((await erasing)?.status).toBe(200);
    expect(readdirSync(directory)).toEqual([]);
    expect((await readMap()).objects).toEqual([]);
  } finally {
    observer.close();
  }
});

test('erasure cancels an already started protected archive stream and removes its temporary file', async () => {
  for (const id of ['erase', 'keep', 'other']) {
    await object(id);
    await upload(id, client, true);
  }
  await save('images');
  const ready = await (await client.json(`${path}/exports`, {})).json();
  expect(ready.bytes).toBeGreaterThan(150_000);
  const response = await client.request(`${path}/exports/${ready.id}`);
  const reader = response.body?.getReader();
  expect(reader).toBeDefined();
  const first = await reader?.read();
  expect(first?.done).toBe(false);
  expect(
    (
      await client.json(
        `${path}/erasure/execute`,
        await reviewed([{ kind: 'object', id: 'erase' }]),
      )
    ).status,
  ).toBe(200);
  let received = first?.value?.byteLength ?? 0;
  try {
    for (;;) {
      const chunk = await reader?.read();
      if (!chunk || chunk.done) break;
      received += chunk.value.byteLength;
    }
  } catch {
    /* Cancellation fails the actual HTTP body. */
  }
  expect(received).toBeLessThan(ready.bytes);
  expect(readdirSync(join(dirname(fixture.config.databasePath), '.skyttel-exports'))).toEqual([]);
  expect((await readMap()).objects.map(({ id }) => id)).toEqual(['keep', 'other']);
});

test('another current administrator can resume a prepared operation after the initiator loses access', async () => {
  const { actor, userId } = await invite();
  expect(
    (await client.json(`${path}/members/${userId}/role`, { role: 'administrator' })).status,
  ).toBe(200);
  await object('erase');
  await save('original');
  const request = await reviewed([{ kind: 'object', id: 'erase' }]);
  fixture.database.exec(
    "CREATE TRIGGER erasure_fault BEFORE UPDATE OF phase ON content_maintenance WHEN NEW.phase = 'cleanup' BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END",
  );
  expect((await client.json(`${path}/erasure/execute`, request)).status).toBe(202);
  const { user } = await (await client.request('/api/bootstrap')).json();
  expect((await actor.json(`${path}/members/${user.id}/role`, { role: 'member' })).status).toBe(
    200,
  );
  fixture.database.exec('DROP TRIGGER erasure_fault');
  expect(
    (await client.json(`${path}/erasure/resume`, { operationId: request.operationId })).status,
  ).toBe(403);
  expect(
    (await actor.json(`${path}/erasure/resume`, { operationId: request.operationId })).status,
  ).toBe(200);
  expect((await readMap(actor)).objects).toEqual([]);
});

test('erasure invalidates ready imports while an explicit later upload of a downloaded archive can restore old content', async () => {
  await object('erase', { description: 'EXTERNAL-ARCHIVE-SENTINEL' });
  await save('original');
  const exported = await (await client.json(`${path}/exports`, {})).json();
  const archive = new Uint8Array(
    await (await client.request(`${path}/exports/${exported.id}`)).arrayBuffer(),
  );
  const uploadArchive = (contentVersion: number) =>
    client.request(`${path}/imports`, {
      method: 'POST',
      headers: {
        origin: fixture.config.origin,
        'content-type': 'application/zip',
        'x-skyttel-content-version': String(contentVersion),
      },
      body: archive,
    });
  const uploaded = await uploadArchive(1);
  expect(uploaded.status).toBe(201);
  const ready = await uploaded.json();
  expect(readdirSync(join(dirname(fixture.config.databasePath), '.skyttel-imports'))).toHaveLength(
    1,
  );
  expect(
    (
      await client.json(
        `${path}/erasure/execute`,
        await reviewed([{ kind: 'object', id: 'erase' }]),
      )
    ).status,
  ).toBe(200);
  expect((await client.request(`${path}/imports/${ready.id}`)).status).toBe(404);
  expect(
    (
      await client.json(`${path}/imports/${ready.id}/confirm`, {
        confirmed: true,
        contentVersion: 1,
      })
    ).status,
  ).toBe(404);
  expect(readdirSync(join(dirname(fixture.config.databasePath), '.skyttel-imports'))).toEqual([]);
  expect((await readMap()).objects).toEqual([]);
  const restoredUpload = await uploadArchive(2);
  expect(restoredUpload.status).toBe(201);
  const restored = await restoredUpload.json();
  expect(
    (
      await client.json(`${path}/imports/${restored.id}/confirm`, {
        confirmed: true,
        contentVersion: 2,
      })
    ).status,
  ).toBe(200);
  expect((await readMap()).objects).toMatchObject([
    { id: 'erase', description: 'EXTERNAL-ARCHIVE-SENTINEL' },
  ]);
});

test('erasure drains a paused archive upload and removes its partial protected bytes', async () => {
  await object('erase');
  await save('original');
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-imports');
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([80, 75, 3, 4]));
    },
    cancel() {
      cancelled = true;
    },
  });
  const uploading = client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'x-skyttel-content-version': '1',
    },
    body,
    duplex: 'half',
  } as RequestInit);
  await expect
    .poll(() =>
      readdirSync(directory).some(
        (name) =>
          existsSync(join(directory, name, 'archive.zip')) &&
          statSync(join(directory, name, 'archive.zip')).size > 0,
      ),
    )
    .toBe(true);
  const result = await client.json(
    `${path}/erasure/execute`,
    await reviewed([{ kind: 'object', id: 'erase' }]),
  );
  expect(result.status).toBe(200);
  expect(cancelled).toBe(true);
  expect((await uploading).status).toBe(400);
  expect(readdirSync(directory)).toEqual([]);
  expect((await readMap()).objects).toEqual([]);
});

test('failed deletion of a cancelled upload keeps erasure prepared until the protected bytes can be removed', async () => {
  await object('erase');
  await save('original');
  const directory = join(dirname(fixture.config.databasePath), '.skyttel-imports');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('SYNTHETIC-PARTIAL-IMPORT'));
    },
  });
  const uploading = client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'x-skyttel-content-version': '1',
    },
    body,
    duplex: 'half',
  } as RequestInit);
  await expect
    .poll(() =>
      readdirSync(directory).some(
        (name) =>
          existsSync(join(directory, name, 'archive.zip')) &&
          statSync(join(directory, name, 'archive.zip')).size > 0,
      ),
    )
    .toBe(true);
  const protectedDirectory = join(directory, readdirSync(directory)[0]);
  chmodSync(protectedDirectory, 0o500);
  const request = await reviewed([{ kind: 'object', id: 'erase' }]);
  try {
    const response = await client.json(`${path}/erasure/execute`, request);
    expect(response.status).toBe(202);
    expect((await response.json()).status.phase).toBe('prepared');
    expect((await uploading).status).toBe(500);
    expect(readFileSync(join(protectedDirectory, 'archive.zip'), 'utf8')).toBe(
      'SYNTHETIC-PARTIAL-IMPORT',
    );
    expect((await client.request(`${path}/map`)).status).toBe(409);
    expect(fixture.database.prepare("SELECT id FROM map_object WHERE id = 'erase'").get()).toEqual({
      id: 'erase',
    });
  } finally {
    chmodSync(protectedDirectory, 0o700);
  }
  expect(
    (await client.json(`${path}/erasure/resume`, { operationId: request.operationId })).status,
  ).toBe(200);
  expect(readdirSync(directory)).toEqual([]);
});
