import sharp from 'sharp';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { conflictBasis } from '../../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
const post = (route: string, body: unknown, actor = client) => actor.json(`${path}/${route}`, body);
async function definition(
  kind: 'object-type' | 'relationship-type',
  id: string,
  value: unknown,
  actor = client,
) {
  const state = await read(actor);
  const before = (kind === 'object-type' ? state.types : state.relationshipTypes).find(
    (type) => type.id === id,
  );
  return post(
    kind,
    {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id,
      baseRevision: before?.revision ?? null,
      value,
    },
    actor,
  );
}
async function save(operationId: string, actor = client): Promise<SaveReceipt> {
  const state = await read(actor);
  const response = await post(
    'save',
    { version: state.draft.version, contentVersion: state.contentVersion, operationId },
    actor,
  );
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result.receipt;
}
async function object(
  id: string,
  typeId: string,
  value: Record<string, unknown> | null = {},
  actor = client,
) {
  const state = await read(actor);
  const before = state.objects.find((item) => item.id === id);
  const response = await post(
    'draft',
    {
      version: state.draft.version,
      id,
      baseRevision: before?.revision ?? null,
      value: value === null ? null : { name: id, typeId, ...before, ...value },
    },
    actor,
  );
  expect(response.status, await response.text()).toBe(200);
}
async function relationship(
  id: string,
  typeId: string,
  value: Record<string, unknown> | null = {},
  actor = client,
) {
  const state = await read(actor);
  const before = state.relationships.find((item) => item.id === id);
  const response = await post(
    'relationship',
    {
      version: state.draft.version,
      id,
      baseRevision: before?.revision ?? null,
      value:
        value === null
          ? null
          : {
              sourceId: 'source',
              targetId: 'target',
              typeId,

              ...before,
              ...value,
            },
    },
    actor,
  );
  expect(response.status, await response.text()).toBe(200);
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
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
});
afterEach(() => fixture.close());

type DefinitionKind = 'object' | 'relationship';
async function removalScenario(kind: DefinitionKind) {
  const initial = await read();
  const objectType = initial.types[0];
  const edgeType = initial.relationshipTypes[0];
  if (kind === 'relationship') {
    await object('source', objectType.id);
    await object('target', objectType.id);
    await save('endpoints');
  }
  return {
    use: (actor = client, ended = false) =>
      kind === 'relationship'
        ? relationship('private-edge', edgeType.id, ended ? { lifecycle: 'ended' } : {}, actor)
        : object(
            'private-object',
            objectType.id,
            {
              name: 'Secret draft name',
              ...(ended ? { lifecycle: 'ended' } : {}),
            },
            actor,
          ),
    remove: (actor = client) =>
      definition(
        kind === 'relationship' ? 'relationship-type' : 'object-type',
        kind === 'relationship' ? edgeType.id : objectType.id,
        null,
        actor,
      ),
    error: 'definition_in_use',
    objectType,
    edgeType,
  };
}

test('unused prefilled definitions are removed only by whole save and remain readable', async () => {
  const initial = await read();
  const objectType = initial.types[0];
  const edgeType = initial.relationshipTypes[0];
  expect((await definition('object-type', objectType.id, null)).status).toBe(200);
  expect((await definition('relationship-type', edgeType.id, null)).status).toBe(200);
  const proposed = await read();
  expect(proposed.types).toEqual(initial.types);
  expect(proposed.relationshipTypes).toEqual(initial.relationshipTypes);
  expect(proposed.draft.objectTypes).toEqual([
    { id: objectType.id, before: objectType, after: null },
  ]);
  const receipt = await save('remove-catalog');
  expect((await read()).types).not.toContainEqual(objectType);
  expect((await read()).relationshipTypes).not.toContainEqual(edgeType);
  expect((await (await client.request(`${path}/history`)).json()).history[0]).toEqual(receipt);
});

test('object type deletion stages and saves objects and incident relationships together', async () => {
  const initial = await read();
  await object('source', initial.types[0].id, { lifecycle: 'ended' });
  await object('target', initial.types[1].id);
  await relationship('connection', initial.relationshipTypes[0].id);
  await save('setup-cascade');
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  const staged = await read();
  expect(staged.objects).toHaveLength(2);
  expect(staged.draft.changes).toEqual([expect.objectContaining({ id: 'source', after: null })]);
  expect(staged.draft.relationships).toEqual([
    expect.objectContaining({ id: 'connection', after: null }),
  ]);
  const receipt = await save('save-cascade');
  expect(receipt.changes).toHaveLength(1);
  expect(receipt.relationships).toHaveLength(1);
  expect((await read()).objects.map(({ id }) => id)).toEqual(['target']);
  expect((await read()).relationships).toEqual([]);
  expect((await (await client.request(`${path}/history`)).json()).history[0]).toEqual(receipt);
});

test('type cascades retain only endpoint names and preserve existing relationship name snapshots', async () => {
  const initial = await read();
  await object('source', initial.types[0].id, { name: 'Source name' });
  await object('target', initial.types[1].id, { name: 'Target name' });
  await object('unrelated', initial.types[1].id, { name: 'Unrelated name' });
  await relationship('saved-edge', initial.relationshipTypes[0].id);
  await relationship('edited-edge', initial.relationshipTypes[1].id);
  await save('name-snapshots');
  await relationship('edited-edge', initial.relationshipTypes[1].id, { lifecycle: 'ended' });
  const names = (await read()).draft.relationships?.find(
    ({ id }) => id === 'edited-edge',
  )?.objectNames;
  expect(names).toEqual({ source: 'Source name', target: 'Target name' });
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  const removals = (await read()).draft.relationships;
  expect(removals?.find(({ id }) => id === 'saved-edge')?.objectNames).toEqual({
    source: 'Source name',
    target: 'Target name',
  });
  expect(removals?.find(({ id }) => id === 'edited-edge')?.objectNames).toEqual(names);
});

test('canceling overlapping type cascades restores suppressed work and keeps independent removals', async () => {
  const state = await read();
  const type = state.types[0],
    edgeType = state.relationshipTypes[0];
  await object('source', type.id);
  await object('target', state.types[1].id);
  await object('independent', type.id);
  await object('retagged', type.id);
  await relationship('connection', edgeType.id);
  await save('baseline');
  await object('source', type.id, {
    name: 'Unfinished edit',
    properties: [{ id: 'note', label: 'Note', value: 'Keep this', kind: 'text' }],
  });
  await object('new', type.id, { name: 'Unfinished addition' });
  await object('retagged', type.id, { typeId: state.types[1].id });
  await object('independent', type.id, null);
  await relationship('connection', edgeType.id, {
    properties: [{ id: 'edge-note', label: 'Note', value: 'Private edge', kind: 'text' }],
  });
  await relationship('fresh-edge', edgeType.id, { sourceId: 'target', targetId: 'source' });
  const unfinished = (await read()).draft;
  expect((await definition('object-type', type.id, null)).status).toBe(200);
  expect((await definition('relationship-type', edgeType.id, null)).status).toBe(200);
  expect(
    (
      await post('discard-change', {
        version: (await read()).draft.version,
        kind: 'objectType',
        id: type.id,
      })
    ).status,
  ).toBe(200);
  const partial = (await read()).draft;
  expect(partial.changes).toHaveLength(unfinished.changes.length);
  expect(partial.changes).toEqual(expect.arrayContaining(unfinished.changes));
  expect(partial.relationships).toHaveLength(2);
  expect(partial.relationships?.every((change) => change.after === null)).toBe(true);
  expect(
    (
      await post('discard-change', {
        version: partial.version,
        kind: 'relationshipType',
        id: edgeType.id,
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.relationships).toEqual(unfinished.relationships);
});

test('canceling relationship type removal retains a later independent endpoint removal', async () => {
  const initial = await read();
  await object('source', initial.types[0].id);
  await object('target', initial.types[1].id);
  await relationship('connection', initial.relationshipTypes[0].id);
  await save('reverse-overlap-baseline');
  await relationship('fresh', initial.relationshipTypes[0].id, {
    sourceId: 'target',
    targetId: 'source',
  });
  expect(
    (await definition('relationship-type', initial.relationshipTypes[0].id, null)).status,
  ).toBe(200);
  await object('source', initial.types[0].id, null);
  expect(
    (
      await post('discard-change', {
        version: (await read()).draft.version,
        kind: 'relationshipType',
        id: initial.relationshipTypes[0].id,
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.relationships?.every((change) => change.after === null)).toBe(true);
  expect((await read()).draft.relationships).toHaveLength(2);
  await save('independent-endpoint-removal');
  expect((await read()).relationships).toEqual([]);
});

test.each(['objectType', 'relationshipType'] as const)(
  'canceling an unrelated %s removal preserves a relationship corrected after endpoint removal',
  async (kind) => {
    const initial = await read();
    await object('source', initial.types[0].id);
    await object('target', initial.types[1].id);
    await object('unrelated', initial.types[2].id);
    await relationship('connection', initial.relationshipTypes[0].id);
    await relationship('unrelated-edge', initial.relationshipTypes[1].id, {
      sourceId: 'unrelated',
    });
    await save('correction-baseline');
    await object('source', initial.types[0].id, null);
    await relationship('connection', initial.relationshipTypes[0].id, {
      sourceId: 'target',
      properties: [{ id: 'note', label: 'Note', kind: 'text', value: 'Keep correction' }],
    });
    const corrected = (await read()).draft;
    expect(corrected.relationships?.find(({ id }) => id === 'connection')?.after).toMatchObject({
      sourceId: 'target',
      targetId: 'target',
    });
    const typeId = kind === 'objectType' ? initial.types[2].id : initial.relationshipTypes[1].id;
    expect(
      (await definition(kind === 'objectType' ? 'object-type' : 'relationship-type', typeId, null))
        .status,
    ).toBe(200);
    expect(
      (await post('discard-change', { version: (await read()).draft.version, kind, id: typeId }))
        .status,
    ).toBe(200);
    const canceled = (await read()).draft;
    expect(canceled.relationships).toEqual(corrected.relationships);
    expect(canceled.changes).toEqual(corrected.changes);
    await save('corrected-endpoint');
    expect((await read()).relationships.find(({ id }) => id === 'connection')).toMatchObject({
      sourceId: 'target',
      targetId: 'target',
      properties: [{ id: 'note', label: 'Note', kind: 'text', value: 'Keep correction' }],
    });
  },
);

test('unrelated type deletion does not disable ordinary correction after endpoint removal', async () => {
  const initial = await read();
  await object('source', initial.types[0].id);
  await object('target', initial.types[1].id);
  await relationship('connection', initial.relationshipTypes[0].id);
  await save('ordinary-removal-baseline');
  const other = await member();
  await relationship('connection', initial.relationshipTypes[0].id, {}, other);
  await object('source', initial.types[0].id, null);
  expect((await definition('object-type', initial.types[2].id, null)).status).toBe(200);
  await save('ordinary-and-unrelated-removal');
  expect(
    (
      await post(
        'relationship',
        {
          version: (await read(other)).draft.version,
          id: 'connection',
          baseRevision: 1,
          value: {
            typeId: initial.relationshipTypes[0].id,
            sourceId: 'target',
            targetId: 'target',
          },
        },
        other,
      )
    ).status,
  ).toBe(200);
  await save('ordinary-endpoint-correction', other);
  expect((await read()).relationships).toMatchObject([
    { id: 'connection', sourceId: 'target', targetId: 'target' },
  ]);
});

test('explicitly reviewing a changed incident relationship keeps type-cascade recovery restrictions', async () => {
  const initial = await read();
  await object('source', initial.types[0].id);
  await object('target', initial.types[1].id);
  await relationship('connection', initial.relationshipTypes[0].id);
  await save('review-baseline');
  const other = await member();
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  await relationship('connection', initial.relationshipTypes[0].id, { lifecycle: 'ended' }, other);
  await save('changed-incident-edge', other);
  await relationship('connection', initial.relationshipTypes[0].id, { lifecycle: 'active' }, other);
  const state = await read();
  const conflict = draftConflicts(state).find((item) => item.kind === 'relationship');
  if (!conflict) throw new Error('Expected changed incident relationship');
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict,
        basis: conflictBasis(state, conflict),
        command: 'removal-choices',
        removalChoices: { relationship: 'proposed' },
      })
    ).status,
  ).toBe(200);
  await save('reviewed-incident-removal');
  expect(
    (
      await post(
        'relationship',
        {
          version: (await read(other)).draft.version,
          id: 'connection',
          baseRevision: 2,
          value: {
            typeId: initial.relationshipTypes[0].id,
            sourceId: 'target',
            targetId: 'target',
          },
        },
        other,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await post(
        'save',
        { version: (await read(other)).draft.version, operationId: 'no-cascade-restoration' },
        other,
      )
    ).status,
  ).toBe(409);
});

test('export and import retain cancelable type cascades including unsaved objects', async () => {
  const initial = await read();
  await object('source', initial.types[0].id);
  await object('target', initial.types[1].id);
  await relationship('saved-edge', initial.relationshipTypes[0].id);
  await save('archive-baseline');
  await object('source', initial.types[0].id, { name: 'Edited source' });
  await object('new', initial.types[0].id, { name: 'Retained new object' });
  await relationship('new-edge', initial.relationshipTypes[0].id, { sourceId: 'new' });
  const original = (await read()).draft;
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  const householdPath = path.replace('/map', '');
  const ready = await (await client.json(`${householdPath}/exports`, {})).json();
  const bytes = await (await client.request(`${householdPath}/exports/${ready.id}`)).arrayBuffer();
  const uploaded = await client.request(`${householdPath}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': String(initial.contentVersion),
    },
    body: bytes,
  });
  expect(uploaded.status, await uploaded.clone().text()).toBe(201);
  const upload = await uploaded.json();
  expect(
    (
      await client.json(`${householdPath}/imports/${upload.id}/confirm`, {
        contentVersion: initial.contentVersion,
        confirmed: true,
      })
    ).status,
  ).toBe(200);
  const state = await read();
  expect(
    (
      await post('discard-change', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        kind: 'objectType',
        id: initial.types[0].id,
      })
    ).status,
  ).toBe(200);
  const restored = (await read()).draft;
  expect(restored.changes).toEqual(expect.arrayContaining(original.changes));
  expect(restored.relationships).toEqual(original.relationships);
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  const receipt = await save('archived-type-cascade');
  expect(receipt.relationships).toMatchObject([
    { id: 'saved-edge', after: null, typeCascade: true },
  ]);
  const completed = await (await client.json(`${householdPath}/exports`, {})).json();
  const completedBytes = await (
    await client.request(`${householdPath}/exports/${completed.id}`)
  ).arrayBuffer();
  const completedUpload = await client.request(`${householdPath}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': String(state.contentVersion),
    },
    body: completedBytes,
  });
  expect(completedUpload.status, await completedUpload.clone().text()).toBe(201);
  expect(
    (
      await client.json(`${householdPath}/imports/${(await completedUpload.json()).id}/confirm`, {
        contentVersion: state.contentVersion,
        confirmed: true,
      })
    ).status,
  ).toBe(200);
  expect((await (await client.request(`${path}/history`)).json()).history[0]).toEqual(receipt);
});

test('a suppressed object keeps its private image available until cancellation or accepted deletion', async () => {
  const state = await read();
  await object('pictured', state.types[0].id);
  await save('image-baseline');
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#447799' } })
    .png()
    .toBuffer();
  const householdPath = path.replace('/map', '');
  const uploaded = await client.request(`${householdPath}/profile-images/pictured`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'image/png',
      'x-skyttel-draft-version': String((await read()).draft.version),
      'x-skyttel-content-version': String(state.contentVersion),
      'x-skyttel-object-revision': '1',
    },
    body: new Uint8Array(png).buffer,
  });
  expect(uploaded.status).toBe(200);
  const original = (await read()).draft.changes[0];
  const imagePath = `${householdPath}/profile-images/${original.after?.profileImageId}`;
  expect((await definition('object-type', state.types[0].id, null)).status).toBe(200);
  expect((await client.request(imagePath)).status).toBe(200);
  expect(
    (
      await post('discard-change', {
        version: (await read()).draft.version,
        kind: 'objectType',
        id: state.types[0].id,
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.changes).toEqual([original]);
  expect((await client.request(imagePath)).status).toBe(200);
  expect((await definition('object-type', state.types[0].id, null)).status).toBe(200);
  await save('accept-image-suppression');
  expect((await client.request(imagePath)).status).toBe(404);
});

test.each(['object', 'relationship'] as const)(
  '%s content and definition edits remain separate conflicts after deletion',
  async (kind) => {
    const scenario = await removalScenario(kind);
    const other = await member();
    await scenario.use(other);
    const route = kind === 'object' ? 'object-type' : 'relationship-type';
    const type = kind === 'object' ? scenario.objectType : scenario.edgeType;
    const value = {
      name: 'Private meaning',
      description: 'Private explanation',
    };
    expect((await definition(route, type.id, value, other)).status).toBe(200);
    const pending = (await read(other)).draft;
    expect((await scenario.remove()).status).toBe(200);
    await save('combined-conflict');
    expect((await read(other)).draft).toEqual(pending);
    expect(
      (await post('save', { version: pending.version, operationId: 'invalid-combined' }, other))
        .status,
    ).toBe(409);
    expect((await definition(route, 'new-meaning', value, other)).status).toBe(200);
    if (kind === 'object')
      await object(
        'private-object',
        'new-meaning',
        { ...pending.changes[0].after, typeId: 'new-meaning' },
        other,
      );
    else
      await relationship(
        'private-edge',
        'new-meaning',
        { ...pending.relationships?.[0].after, typeId: 'new-meaning' },
        other,
      );
    expect(
      (
        await post(
          'save',
          { version: (await read(other)).draft.version, operationId: 'still-invalid-type-edit' },
          other,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await post(
          'discard-change',
          {
            version: (await read(other)).draft.version,
            kind: kind === 'object' ? 'objectType' : 'relationshipType',
            id: type.id,
          },
          other,
        )
      ).status,
    ).toBe(200);
    await save('ordinary-recovery', other);
  },
);

test('new incident relationships and changed objects cannot be silently included in a type cascade', async () => {
  const initial = await read();
  await object('source', initial.types[0].id);
  await object('target', initial.types[1].id);
  await save('baseline-race');
  const other = await member();
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  await relationship('new-connection', initial.relationshipTypes[0].id, {}, other);
  await object('source', initial.types[0].id, { name: 'Concurrent name' }, other);
  await save('concurrent-change', other);
  const before = await read();
  expect(
    (await post('save', { version: before.draft.version, operationId: 'unreviewed-cascade' }))
      .status,
  ).toBe(409);
  expect((await read()).objects).toEqual(before.objects);
  expect((await read()).relationships).toEqual(before.relationships);
  expect((await read()).draft).toEqual(before.draft);
  expect(draftConflicts(before)).toContainEqual(
    expect.objectContaining({
      id: 'source',
      connections: [expect.objectContaining({ id: 'new-connection' })],
    }),
  );
  expect(
    (
      await post('discard-change', {
        version: before.draft.version,
        kind: 'objectType',
        id: initial.types[0].id,
      })
    ).status,
  ).toBe(200);
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  await save('new-reviewed-cascade');
  expect((await read()).objects.map(({ id }) => id)).toEqual(['target']);
});

test('renewing the same type-removal review includes new connections to its staged objects', async () => {
  const initial = await read();
  await object('source', initial.types[0].id);
  await object('target', initial.types[1].id);
  await save('renewal-baseline');
  const other = await member();
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  await relationship('new-connection', initial.relationshipTypes[0].id, {}, other);
  await save('new-incident-connection', other);
  const before = await read();
  expect(
    (await post('save', { version: before.draft.version, operationId: 'before-renewal' })).status,
  ).toBe(409);
  expect((await read()).draft).toEqual(before.draft);
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  expect((await read()).draft.relationships).toEqual([
    expect.objectContaining({ id: 'new-connection', after: null, removedWithObjects: ['source'] }),
  ]);
  await save('renewed-cascade');
  expect((await read()).relationships).toEqual([]);
  expect((await read()).objects.map(({ id }) => id)).toEqual(['target']);
});

test('ordinary edits cannot resurrect cascade-deleted content even after creating new types', async () => {
  const initial = await read();
  await object('source', initial.types[0].id);
  await object('target', initial.types[1].id);
  await relationship('connection', initial.relationshipTypes[0].id);
  await save('saved-content');
  const other = await member();
  await object('source', initial.types[0].id, { name: 'Retained edit' }, other);
  await relationship(
    'connection',
    initial.relationshipTypes[0].id,
    { properties: [{ id: 'note', label: 'Note', kind: 'text', value: 'Retained' }] },
    other,
  );
  const pending = (await read(other)).draft;
  expect((await definition('object-type', initial.types[0].id, null)).status).toBe(200);
  await save('cascade-first');
  expect((await read(other)).draft).toEqual(pending);
  expect(
    (
      await definition(
        'object-type',
        'replacement',
        { name: initial.types[0].name, description: '' },
        other,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await post(
        'draft',
        {
          version: (await read(other)).draft.version,
          id: 'source',
          baseRevision: 1,
          value: { ...pending.changes[0].after, typeId: 'replacement' },
        },
        other,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await post(
        'relationship',
        {
          version: (await read(other)).draft.version,
          id: 'connection',
          baseRevision: 1,
          value: { ...pending.relationships![0].after, sourceId: 'target' },
        },
        other,
      )
    ).status,
  ).toBe(200);
  const corrected = await read(other);
  expect(draftConflicts(corrected)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'object', id: 'source', current: null }),
      expect.objectContaining({ kind: 'relationship', id: 'connection', current: null }),
    ]),
  );
  expect(
    (
      await post(
        'save',
        { version: corrected.draft.version, operationId: 'no-resurrection' },
        other,
      )
    ).status,
  ).toBe(409);
  expect((await read(other)).draft).toEqual(corrected.draft);
  expect((await read()).types.some(({ id }) => id === 'replacement')).toBe(false);
});

test('removed individual properties remain readable in history after a later type explanation edit', async () => {
  const type = (await read()).types[0];
  expect((await definition('object-type', type.id, { ...type })).status).toBe(200);
  await save('field');
  await object('historical', type.id, {
    properties: [{ id: 'serial', label: 'serial', kind: 'text', value: 'SYNTH-1' }],
  });
  await save('value');
  await object('historical', type.id, null);
  await save('object-removal');
  expect((await definition('object-type', type.id, { ...type, name: 'Bevarad typ' })).status).toBe(
    200,
  );
  await save('field-removal');
  expect((await read()).types.find((item) => item.id === type.id)).toMatchObject({
    name: 'Bevarad typ',
  });
  expect(
    (await (await client.request(`${path}/history`)).json()).history.find(
      (entry: SaveReceipt) => entry.operationId === 'value',
    ).changes[0],
  ).toMatchObject({
    after: { properties: [{ id: 'serial', label: 'serial', kind: 'text', value: 'SYNTH-1' }] },
    type: {},
  });
});

test.each(['object', 'relationship'] as const)(
  '%s deletion leaves other private use untouched and blocks its stale save atomically',
  async (kind) => {
    const scenario = await removalScenario(kind);
    const other = await member();
    fixture.database.prepare("UPDATE membership SET role = 'member'").run();
    await scenario.use(other, true);
    await object('independent', (await read()).types[1].id, {}, other);
    const retained = (await read(other)).draft;
    expect((await scenario.remove()).status).toBe(200);
    await save('remove-with-private-use');
    const state = await read(other);
    expect(state.draft).toEqual(retained);
    expect(draftConflicts(state)).toContainEqual(expect.objectContaining({ kind, type: null }));
    const failed = await post(
      'save',
      { version: retained.version, operationId: 'stale-private-use' },
      other,
    );
    expect(failed.status).toBe(409);
    expect((await read(other)).draft).toEqual(retained);
    expect((await read()).objects.some(({ id }) => id === 'independent')).toBe(false);
    const newId = 'fresh-type';
    const value = {
      name: 'New meaning',
      description: '',
    };
    expect(
      (
        await definition(
          kind === 'object' ? 'object-type' : 'relationship-type',
          newId,
          value,
          other,
        )
      ).status,
    ).toBe(200);
    if (kind === 'relationship')
      await relationship(
        'private-edge',
        newId,
        { ...retained.relationships![0].after, typeId: newId },
        other,
      );
    if (kind === 'object')
      await object(
        'private-object',
        newId,
        { ...retained.changes.find(({ id }) => id === 'private-object')!.after, typeId: newId },
        other,
      );
    await save('corrected-private-use', other);
  },
);

test.each(['object', 'relationship'] as const)(
  '%s removal rechecks newly saved use and requires explicit renewed review',
  async (kind) => {
    const scenario = await removalScenario(kind);
    const other = await member();
    expect((await scenario.remove()).status).toBe(200);
    await scenario.use(other);
    await save('concurrent-use', other);
    const before = await read();
    const failure = await post('save', {
      version: before.draft.version,
      operationId: 'saved-use-race',
    });
    expect(await failure.json()).toEqual({ error: scenario.error });
    expect((await read()).objects).toEqual(before.objects);
    expect((await read()).draft).toEqual(before.draft);
    expect((await scenario.remove()).status).toBe(200);
    await save('reviewed-new-use');
    expect((await read()).relationships).toEqual([]);
    expect((await read()).objects).toHaveLength(kind === 'object' ? 0 : 2);
  },
);

test.each(['object-type', 'relationship-type'] as const)(
  '%s removal checks the current version and a stale removal can only be saved after explicit resolution',
  async (kind) => {
    const initial = await read();
    const type = (kind === 'object-type' ? initial.types : initial.relationshipTypes)[0];
    const other = await member();
    expect((await definition(kind, type.id, null)).status).toBe(200);
    const value =
      kind === 'object-type'
        ? { ...type, name: 'Senare namn' }
        : {
            name: 'Senare namn',
            description: type.description,
          };
    expect((await definition(kind, type.id, value, other)).status).toBe(200);
    await save('concurrent-definition', other);
    const before = await read();
    expect(
      await (
        await post('save', { version: before.draft.version, operationId: 'stale-removal' })
      ).json(),
    ).toEqual({ error: 'type_conflict' });
    expect((await read()).draft).toEqual(before.draft);
    expect(draftConflicts(before)).toEqual([
      expect.objectContaining({
        kind: kind === 'object-type' ? 'objectType' : 'relationshipType',
        id: type.id,
      }),
    ]);
    expect(
      (
        await post('resolve', {
          version: before.draft.version,
          conflict: draftConflicts(before)[0],
          choice: 'proposed',
        })
      ).status,
    ).toBe(200);
    await save('reviewed-removal');
    const final = await read();
    expect(
      (kind === 'object-type' ? final.types : final.relationshipTypes).some(
        (item) => item.id === type.id,
      ),
    ).toBe(false);
  },
);

test.each(['object-type', 'relationship-type'] as const)(
  '%s removal cancels an unused new definition without creating a tombstone or deleting other work',
  async (kind) => {
    const value = { name: 'Egen typ', description: '' };
    expect((await definition(kind, 'new-type', value)).status).toBe(200);
    await object('independent', (await read()).types[0].id);
    expect((await definition(kind, 'new-type', null)).status).toBe(200);
    const receipt = await save('only-independent');
    expect(receipt.objectTypes).toBeUndefined();
    expect(receipt.relationshipTypes).toBeUndefined();
    expect(receipt.changes).toHaveLength(1);
    expect((await definition(kind, 'new-type', value)).status).toBe(200);
    await save('later-creation');
    const state = await read();
    expect(
      (kind === 'object-type' ? state.types : state.relationshipTypes).some(
        (type) => type.id === 'new-type',
      ),
    ).toBe(true);
    expect((await definition(kind, 'unknown-type', null)).status).toBe(409);
  },
);

test.each(['object-type', 'relationship-type'] as const)(
  '%s creation cancellation preserves its unsaved dependents',
  async (kind) => {
    const initial = await read();
    const value = {
      name: 'Unfinished type',
      description: '',
    };
    expect((await definition(kind, 'new-type', value)).status).toBe(200);
    if (kind === 'object-type') await object('new-content', 'new-type');
    else {
      await object('source', initial.types[0].id);
      await object('target', initial.types[0].id);
      await relationship('new-content', 'new-type');
    }
    const before = await read();
    const canceled = await definition(kind, 'new-type', null);
    expect(canceled.status).toBe(409);
    expect(await canceled.json()).toEqual({ error: 'definition_creation_in_use' });
    expect(await read()).toEqual(before);
    await save('save-new-type-and-content');
    expect((await definition(kind, 'new-type', null)).status).toBe(200);
    await save('delete-saved-type-and-content');
  },
);

test.each(['object-type', 'relationship-type'] as const)(
  "another member's pending %s edit is preserved as a conflict after deletion",
  async (kind) => {
    const defined = {
      name: 'Egen typ',
      description: '',
    };
    expect((await definition(kind, 'shared-type', defined)).status).toBe(200);
    await save('define-type');
    const actor = await member();
    fixture.database.prepare("UPDATE membership SET role = 'member'").run();
    expect(
      (await definition(kind, 'shared-type', { ...defined, name: 'Nytt namn' }, actor)).status,
    ).toBe(200);
    const before = (await read(actor)).draft;
    const removal = await definition(kind, 'shared-type', null);
    expect(removal.status).toBe(200);
    await save('delete-edited-type');
    expect((await read(actor)).draft).toEqual(before);
    expect(draftConflicts(await read(actor))).toContainEqual(
      expect.objectContaining({ id: 'shared-type', current: null }),
    );
    expect(
      (await post('save', { version: before.version, operationId: 'stale-definition' }, actor))
        .status,
    ).toBe(409);
    expect((await read(actor)).draft).toEqual(before);
  },
);

test('definition removals require current household membership and denied requests preserve all drafts', async () => {
  const initial = await read();
  const type = initial.types[0];
  const fieldType = initial.types[1];
  const edgeType = initial.relationshipTypes[0];
  expect(
    (
      await definition('object-type', fieldType.id, {
        ...fieldType,
      })
    ).status,
  ).toBe(200);
  await save('field');
  const actor = await member();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  await object('owner-private', initial.types[2].id);
  await object('member-private', initial.types[2].id, {}, actor);
  const ownerBefore = await read();
  const memberBefore = await read(actor);
  const historyBefore = await (await client.request(`${path}/history`)).json();
  fixture.setSubject('other-household-member');
  const outsider = fixture.client();
  await outsider.signIn();
  const { user: otherUser } = await (await outsider.request('/api/bootstrap')).json();
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('other-household', 'Annat hushåll', '2026-01-01');
  fixture.database
    .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
    .run('other-household', otherUser.id, 'member');
  const otherPath = '/api/households/other-household/map';
  const otherBefore = await (await outsider.request(otherPath)).json();
  const cases = [
    { route: 'object-type', id: type.id, baseRevision: type.revision, value: null },
    { route: 'relationship-type', id: edgeType.id, baseRevision: edgeType.revision, value: null },
    {
      route: 'object-type',
      id: fieldType.id,
      baseRevision: fieldType.revision + 1,
      value: { ...fieldType },
    },
  ];
  const anonymous = fixture.client();
  for (const { route, ...body } of cases) {
    expect(
      (await post(route, { version: memberBefore.draft.version, ...body }, anonymous)).status,
    ).toBe(401);
    expect(
      (await post(route, { version: memberBefore.draft.version, ...body }, outsider)).status,
    ).toBe(403);
  }
  expect(
    (await client.json(`${path.replace('/map', '')}/members/${user.id}/revoke`, {})).status,
  ).toBe(200);
  for (const { route, ...body } of cases)
    expect(
      (await post(route, { version: memberBefore.draft.version, ...body }, actor)).status,
    ).toBe(403);
  expect(await read()).toEqual(ownerBefore);
  expect(await (await client.request(`${path}/history`)).json()).toEqual(historyBefore);
  expect(await (await outsider.request(otherPath)).json()).toEqual(otherBefore);
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  expect((await actor.json('/api/invitations/accept', { code })).status).toBe(200);
  expect(await read(actor)).toEqual(memberBefore);
  for (const { route, ...body } of cases)
    expect(
      (await post(route, { version: (await read(actor)).draft.version, ...body }, actor)).status,
    ).toBe(200);
  expect(await read()).toEqual(ownerBefore);
});

test.each(['object', 'relationship'] as const)(
  '%s removal that commits first rejects later use from an older catalog',
  async (kind) => {
    const scenario = await removalScenario(kind);
    const other = await member();
    const old = await read(other);
    expect((await scenario.remove()).status).toBe(200);
    await save('remove-first');
    const before = await read(other);
    const value =
      kind === 'relationship'
        ? {
            typeId: scenario.edgeType.id,
            sourceId: 'source',
            targetId: 'target',
          }
        : {
            typeId: scenario.objectType.id,
            name: 'Senare användning',
          };
    const failure = await post(
      kind === 'relationship' ? 'relationship' : 'draft',
      {
        version: old.draft.version,
        id: 'late-use',
        baseRevision: null,
        value,
      },
      other,
    );
    expect(failure.status).toBe(400);
    expect(await failure.json()).toEqual({
      error: 'invalid_type',
    });
    expect(await read(other)).toEqual(before);
  },
);
