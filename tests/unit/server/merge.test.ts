import sharp from 'sharp';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { proposedObjectTypes, proposedRelationshipTypes } from '../../../src/shared/map.js';
import { mergeConnections, mergeObjects } from '../../../src/shared/object-merge.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
const post = (route: string, body: unknown, actor = client) => actor.json(`${path}/${route}`, body);
async function object(id: string, description = '') {
  const state = await read();
  const before = state.objects.find((item) => item.id === id);
  expect(
    (
      await post('draft', {
        version: state.draft.version,
        id,
        baseRevision: before?.revision ?? null,
        value: { typeId: state.types[0].id, name: 'Lo', description, ...before },
      })
    ).status,
  ).toBe(200);
}
async function save(operationId: string, actor = client): Promise<SaveReceipt> {
  const response = await post(
    'save',
    { version: (await read(actor)).draft.version, operationId },
    actor,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  return (await response.json()).receipt;
}
async function proposal(confirmed = true) {
  const state = await read();
  return {
    version: state.draft.version,
    survivorId: 'a',
    absorbedId: 'b',
    identityConfirmed: confirmed,
    reviewed: {
      objects: ['a', 'b'].map((id) => mergeObjects(state).get(id)),
      relationships: mergeConnections(state, ['a', 'b']),
      types: proposedObjectTypes(state.types, state.draft.objectTypes).filter((type) =>
        ['a', 'b'].some((id) => mergeObjects(state).get(id)?.typeId === type.id),
      ),
      relationshipTypes: proposedRelationshipTypes(
        state.relationshipTypes,
        state.draft.relationshipTypes,
      ).filter((type) =>
        mergeConnections(state, ['a', 'b']).some((edge) => edge.typeId === type.id),
      ),
    },
    choices: { description: 'absorbed' },
    relationships: mergeConnections(state, ['a', 'b']).map((edge) => ({
      id: edge.id,
      action: 'keep',
    })),
  };
}
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
});
afterEach(() => fixture.close());

async function edge(
  id: string,
  sourceId: string,
  targetId: string | null,
  actor = client,
  extra = {},
) {
  const state = await read(actor);
  const before = state.relationships.find((item) => item.id === id);
  const response = await post(
    'relationship',
    {
      version: state.draft.version,
      id,
      baseRevision: before?.revision ?? null,
      value: {
        typeId: state.relationshipTypes[0].id,
        sourceId,
        targetId,
        knowledge: targetId === null ? 'unknown' : 'known',
        ...extra,
      },
    },
    actor,
  );
  expect(response.status, await response.clone().text()).toBe(200);
}
async function member() {
  fixture.setSubject('other-member');
  const actor = fixture.client();
  await actor.signIn();
  const { user } = await (await actor.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
  ).json();
  await actor.json('/api/invitations/accept', { code });
  return { actor, userId: user.id };
}

test('explicit merge redirects edges atomically, records identities and restores them through undo', async () => {
  await object('a', 'Första uppgiften');
  await object('b', 'Andra uppgiften');
  await object('c');
  let state = await read();
  expect(
    (
      await post('relationship', {
        version: state.draft.version,
        id: 'edge',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes[0].id,
          sourceId: 'c',
          targetId: 'b',
          knowledge: 'known',
        },
      })
    ).status,
  ).toBe(200);
  await save('initial');
  await object('independent');
  const response = await post('merge', await proposal());
  expect(response.status, await response.clone().text()).toBe(200);
  expect((await read()).objects).toHaveLength(3);
  const merged = await save('merge');
  state = await read();
  expect(state.objects.map((o) => o.id)).toEqual(['a', 'c', 'independent']);
  expect(state.objects[0].description).toBe('Andra uppgiften');
  expect(state.relationships[0]).toMatchObject({ id: 'edge', sourceId: 'c', targetId: 'a' });
  expect(merged.changes.find((c) => c.after?.id === 'a')?.merge).toMatchObject({
    absorbedId: 'b',
    identityConfirmed: true,
  });
  expect(
    (
      await post('undo', {
        version: state.draft.version,
        userId: merged.userId,
        operationId: merged.operationId,
      })
    ).status,
  ).toBe(200);
  await save('undo');
  state = await read();
  expect(state.objects.find((o) => o.id === 'a')?.description).toBe('Första uppgiften');
  expect(state.objects.find((o) => o.id === 'b')?.description).toBe('Andra uppgiften');
  expect(state.relationships[0]).toMatchObject({ id: 'edge', targetId: 'b' });
});

test('equal names do not confirm identity and incomplete choices cannot drop different facts', async () => {
  await object('a', 'Första');
  await object('b', 'Andra');
  await save('initial');
  const incomplete = { ...(await proposal()), choices: {} };
  const before = await read();
  expect(await (await post('merge', incomplete)).json()).toEqual({
    error: 'merge_choices_required',
  });
  expect(await read()).toEqual(before);
  expect((await post('merge', await proposal(false))).status).toBe(200);
  const blocked = await post('save', {
    version: (await read()).draft.version,
    operationId: 'unconfirmed',
  });
  expect(await blocked.json()).toEqual({ error: 'unresolved_identity' });
  expect((await read()).objects).toEqual(before.objects);
  expect((await client.request(`${path}/history`)).status).toBe(200);
  expect((await (await client.request(`${path}/history`)).json()).history).toHaveLength(1);
  const draft = (await read()).draft;
  expect(
    (await post('discard-change', { version: draft.version, kind: 'object', id: 'b' })).status,
  ).toBe(200);
  expect((await read()).draft.changes).toEqual([]);
  expect((await post('merge', await proposal())).status).toBe(200);
  await save('confirmed');
});

test('colliding edges require explicit removal, while self edges, inbound edges and unknown endpoints retain their meaning', async () => {
  await object('a');
  await object('b');
  await object('c');
  await edge('first', 'a', 'c');
  await edge('second', 'b', 'c', client, { lifecycle: 'ended' });
  await edge('inbound', 'c', 'b');
  await edge('self', 'b', 'a');
  await edge('unknown', 'b', null);
  await save('initial');
  const before = await read();
  expect(await (await post('merge', await proposal())).json()).toEqual({
    error: 'duplicate_relationship',
  });
  expect(await read()).toEqual(before);
  const reviewed = await proposal();
  reviewed.relationships = reviewed.relationships.map((item) => ({
    ...item,
    action: item.id === 'first' ? 'remove' : 'keep',
  }));
  expect((await post('merge', reviewed)).status).toBe(200);
  const merged = await save('merge');
  expect((await read()).relationships).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'second', sourceId: 'a', targetId: 'c', lifecycle: 'ended' }),
      expect.objectContaining({ id: 'inbound', sourceId: 'c', targetId: 'a' }),
      expect.objectContaining({ id: 'self', sourceId: 'a', targetId: 'a' }),
      expect.objectContaining({
        id: 'unknown',
        sourceId: 'a',
        targetId: null,
        knowledge: 'unknown',
      }),
    ]),
  );
  await post('undo', {
    version: (await read()).draft.version,
    userId: merged.userId,
    operationId: merged.operationId,
  });
  await save('undo');
  expect((await read()).relationships).toHaveLength(5);
  expect((await read()).relationships.find((item) => item.id === 'second')?.sourceId).toBe('b');
});

test('new edges added to the absorbed identity block every part of a stale merge and can be reviewed after grouped discard', async () => {
  await object('a');
  await object('b');
  await object('c');
  await save('initial');
  const { actor } = await member();
  expect((await post('merge', await proposal())).status).toBe(200);
  await edge('new', 'c', 'b', actor);
  await save('new-edge', actor);
  const before = await read();
  expect((await post('save', { version: before.draft.version, operationId: 'stale' })).status).toBe(
    409,
  );
  expect(await read()).toEqual(before);
  expect(draftConflicts(before)).not.toEqual([]);
  await post('discard-change', { version: before.draft.version, kind: 'object', id: 'a' });
  expect((await post('merge', await proposal())).status).toBe(200);
  await save('reviewed');
  expect((await read()).relationships[0]).toMatchObject({ id: 'new', targetId: 'a' });
});

test('merge undo preserves later independent shared and private facts and requires fresh conflict approval for overlaps', async () => {
  await object('a', 'Första');
  await object('b', 'Andra');
  await object('c');
  await edge('edge', 'c', 'b');
  await save('initial');
  await post('merge', await proposal());
  const merged = await save('merge');
  const update = async (id: string, extra: object) => {
    const state = await read();
    const before = state.objects.find((item) => item.id === id);
    if (!before) throw new Error('Expected original object');
    expect(
      (
        await post('draft', {
          version: state.draft.version,
          id,
          baseRevision: before.revision,
          value: { ...before, ...extra },
        })
      ).status,
    ).toBe(200);
  };
  await update('a', { name: 'Senare namn', description: 'Senare beskrivning' });
  await edge('edge', 'c', 'a', client, { lifecycle: 'ended' });
  await save('later');
  await update('a', { financialFacts: { price: { knowledge: 'known', value: '42' } } });
  await object('independent');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        userId: merged.userId,
        operationId: merged.operationId,
      })
    ).status,
  ).toBe(200);
  const state = await read();
  expect(draftConflicts(state)).toHaveLength(1);
  expect(
    (await post('save', { version: state.draft.version, operationId: 'blocked' })).status,
  ).toBe(409);
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict: draftConflicts(state)[0],
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  await save('approved');
  expect((await read()).objects.find((item) => item.id === 'a')).toMatchObject({
    name: 'Senare namn',
    description: 'Första',
    financialFacts: { price: { knowledge: 'known', value: '42' } },
  });
  expect((await read()).objects.some((item) => item.id === 'independent')).toBe(true);
  expect((await read()).relationships[0]).toMatchObject({ targetId: 'b', lifecycle: 'ended' });
});

test.each([true, false])(
  'selecting the absorbed image makes a survivor-owned copy and preserves originals on undo (saved images: %s)',
  async (savedImages) => {
    await object('a');
    await object('b');
    await save('initial');
    const imagePath = `${path.replace('/map', '')}/profile-images`;
    const upload = async (id: string, color: string) => {
      const state = await read();
      const bytes = await sharp({
        create: { width: 10, height: 12, channels: 3, background: color },
      })
        .png()
        .toBuffer();
      const result = await client.request(`${imagePath}/${id}`, {
        method: 'POST',
        headers: {
          origin: fixture.config.origin,
          'content-type': 'image/png',
          'x-skyttel-draft-version': String(state.draft.version),
          'x-skyttel-content-version': String(state.contentVersion),
          'x-skyttel-object-revision': String(
            state.objects.find((item) => item.id === id)?.revision,
          ),
        },
        body: new Uint8Array(bytes),
      });
      expect(result.status, await result.clone().text()).toBe(200);
    };
    await upload('a', '#ff0000');
    await upload('b', '#00ff00');
    if (savedImages) await save('images');
    const initial = await read();
    const source = mergeObjects(initial).get('b')?.profileImageId;
    const illegal = await post('draft', {
      version: initial.draft.version,
      id: 'a',
      baseRevision: initial.objects.find((item) => item.id === 'a')?.revision,
      value: { ...initial.objects.find((item) => item.id === 'a'), profileImageId: source },
    });
    expect(illegal.status).toBe(404);
    const body = await proposal();
    expect(
      (await post('merge', { ...body, choices: { ...body.choices, profileImageId: 'absorbed' } }))
        .status,
    ).toBe(200);
    const merged = await save('merge-image');
    const copied = (await read()).objects[0].profileImageId;
    expect(copied).not.toBe(source);
    expect(await (await client.request(`${imagePath}/${copied}`)).arrayBuffer()).toEqual(
      await (await client.request(`${imagePath}/${source}`)).arrayBuffer(),
    );
    expect(merged.changes.find((item) => item.after?.id === 'a')?.merge?.imageCopy).toMatchObject({
      sourceObjectId: 'b',
      sourceImageId: source,
      copiedImageId: copied,
    });
    expect(
      (
        await post('undo', {
          version: (await read()).draft.version,
          userId: merged.userId,
          operationId: merged.operationId,
        })
      ).status,
    ).toBe(200);
    await save('undo-image');
    for (const original of initial.objects)
      expect((await read()).objects.find((item) => item.id === original.id)?.profileImageId).toBe(
        original.profileImageId,
      );
  },
);

test('compound mutations require current membership and origin and cannot include an object from another household', async () => {
  await object('a');
  await object('b');
  await save('initial');
  const body = await proposal();
  const { actor, userId } = await member();
  const memberBefore = await read(actor);
  const stranger = fixture.client();
  expect((await post('merge', body, stranger)).status).toBe(401);
  fixture.setSubject('outsider');
  await stranger.signIn();
  const { user } = await (await stranger.request('/api/bootstrap')).json();
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('other', 'Annat hushåll', '2026-01-01');
  fixture.database
    .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
    .run('other', user.id, 'member');
  const otherPath = '/api/households/other/map';
  const other = (await (await stranger.request(otherPath)).json()) as MapState;
  expect(
    (
      await stranger.json(`${otherPath}/draft`, {
        version: 0,
        id: 'foreign',
        baseRevision: null,
        value: { typeId: other.types[0].id, name: 'Hemligt objekt', description: '' },
      })
    ).status,
  ).toBe(200);
  expect(
    (await stranger.json(`${otherPath}/save`, { version: 1, operationId: 'foreign' })).status,
  ).toBe(200);
  const ownerBefore = await read();
  const outsiderBefore = await (await stranger.request(otherPath)).json();
  expect((await post('merge', body, stranger)).status).toBe(403);
  expect((await post('merge', { ...body, absorbedId: 'foreign' })).status).toBe(409);
  expect(
    (
      await client.request(`${path}/merge`, {
        method: 'POST',
        headers: { origin: 'https://elsewhere.example', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).status,
  ).toBe(403);
  await client.json(`${path.replace('/map', '')}/members/${userId}/revoke`, {});
  expect(
    (await post('merge', { ...body, version: memberBefore.draft.version }, actor)).status,
  ).toBe(403);
  expect(await read()).toEqual(ownerBefore);
  expect(await (await stranger.request(otherPath)).json()).toEqual(outsiderBefore);
  const { code } = await (
    await client.json(`${path.replace('/map', '')}/invitations`, { userId })
  ).json();
  await actor.json('/api/invitations/accept', { code });
  expect(await read(actor)).toEqual(memberBefore);
  expect(
    (await post('merge', { ...body, version: memberBefore.draft.version }, actor)).status,
  ).toBe(200);
});

test('failed writes roll back the compound save and retry returns the same durable receipt', async () => {
  await object('a');
  await object('b');
  await object('c');
  await edge('edge', 'b', 'c');
  await save('initial');
  await post('merge', await proposal());
  const before = await read();
  fixture.database.exec(
    "CREATE TRIGGER fail_merge_save BEFORE INSERT ON map_history BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
  );
  const attempt = { version: before.draft.version, operationId: 'merge' };
  expect((await post('save', attempt)).status).toBe(500);
  expect(await read()).toEqual(before);
  fixture.database.exec('DROP TRIGGER fail_merge_save');
  const result = await (await post('save', attempt)).json();
  expect(result.receipt.changes).toHaveLength(2);
  expect(await (await post('save', attempt)).json()).toEqual(result);
  expect((await (await client.request(`${path}/operations/merge`)).json()).operation).toMatchObject(
    { status: 'succeeded', receipt: result.receipt },
  );
  expect((await (await client.request(`${path}/history`)).json()).history).toHaveLength(2);
});

test('discard restores earlier private values and edges, stale requests and single edits cannot split the merge', async () => {
  await object('a');
  await object('b');
  await object('c');
  await edge('edge', 'b', 'c');
  await save('initial');
  let state = await read();
  await post('draft', {
    version: state.draft.version,
    id: 'b',
    baseRevision: 1,
    value: {
      ...state.objects.find((item) => item.id === 'b'),
      description: 'Tidigare eget förslag',
    },
  });
  await edge('edge', 'b', 'c', client, { lifecycle: 'ended' });
  state = await read();
  const body = await proposal();
  await post('merge', body);
  const mergedDraft = (await read()).draft;
  expect((await post('merge', body)).status).toBe(409);
  expect(
    await (
      await post('draft', { version: mergedDraft.version, id: 'a', baseRevision: 1, value: null })
    ).json(),
  ).toEqual({ error: 'merge_review_required' });
  expect(
    await (
      await post('relationship', {
        version: mergedDraft.version,
        id: 'edge',
        baseRevision: 1,
        value: null,
      })
    ).json(),
  ).toEqual({ error: 'merge_review_required' });
  expect(
    (
      await post('discard-change', {
        version: mergedDraft.version,
        kind: 'relationship',
        id: 'edge',
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft).toMatchObject({
    changes: state.draft.changes,
    relationships: state.draft.relationships,
  });
});

test('permanently missing original identities cannot be resurrected from retained merge snapshots', async () => {
  await object('a');
  await object('b');
  await save('initial');
  await post('merge', await proposal());
  const receipt = await save('merge');
  // Arrange future permanent erasure, which has no public endpoint yet.
  fixture.database.prepare('DELETE FROM map_object WHERE id = ?').run('b');
  const before = await read();
  expect(
    await (
      await post('undo', {
        version: before.draft.version,
        userId: receipt.userId,
        operationId: receipt.operationId,
      })
    ).json(),
  ).toEqual({ error: 'undo_unavailable' });
  expect(await read()).toEqual(before);
});

test('different type meanings require explicit field omissions while independent financial and lifecycle choices are retained', async () => {
  let state = await read();
  for (const [id, kind] of [
    ['plant', 'number'],
    ['vehicle', 'text'],
  ]) {
    expect(
      (
        await post('object-type', {
          version: state.draft.version,
          id,
          baseRevision: null,
          value: {
            name: id,
            description: '',
            fields: [{ id: 'serial', name: 'Nummer', description: '', kind }],
          },
        })
      ).status,
    ).toBe(200);
    state = await read();
  }
  expect(
    (
      await post('draft', {
        version: state.draft.version,
        id: 'a',
        baseRevision: null,
        value: {
          typeId: 'plant',
          name: 'Lo',
          description: '',
          customValues: { serial: 42 },
          lifecycle: 'ended',
          financialFacts: { price: { knowledge: 'known', value: '10' } },
        },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await post('draft', {
        version: (await read()).draft.version,
        id: 'b',
        baseRevision: null,
        value: {
          typeId: 'vehicle',
          name: 'Lo',
          description: '',
          customValues: { serial: 'annan betydelse' },
          financialFacts: {
            price: { knowledge: 'unknown' },
            currency: { knowledge: 'known', value: 'SEK' },
          },
        },
      })
    ).status,
  ).toBe(200);
  await save('initial');
  const body = await proposal();
  const choices = {
    typeId: 'absorbed',
    lifecycle: 'survivor',
    'financialFacts:price': 'survivor',
    'financialFacts:currency': 'absorbed',
    'customValues:plant:serial': 'survivor',
    'customValues:vehicle:serial': 'absorbed',
  };
  const before = await read();
  expect(await (await post('merge', { ...body, choices })).json()).toEqual({
    error: 'merge_choices_required',
  });
  expect(await read()).toEqual(before);
  expect(
    (await post('merge', { ...body, choices: { ...choices, 'customValues:plant:serial': 'omit' } }))
      .status,
  ).toBe(200);
  const receipt = await save('typed-merge');
  expect((await read()).objects[0]).toMatchObject({
    id: 'a',
    typeId: 'vehicle',
    customValues: { serial: 'annan betydelse' },
    lifecycle: 'ended',
    financialFacts: {
      price: { knowledge: 'known', value: '10' },
      currency: { knowledge: 'known', value: 'SEK' },
    },
  });
  await post('undo', {
    version: (await read()).draft.version,
    userId: receipt.userId,
    operationId: receipt.operationId,
  });
  await save('undo-types');
  expect((await read()).objects.find((item) => item.id === 'a')).toMatchObject({
    typeId: 'plant',
    customValues: { serial: 42 },
  });
});

test('reviewed type definitions and object snapshots must match current meanings before a merge can be proposed', async () => {
  await object('a');
  await object('b');
  await save('initial');
  const reviewed = await proposal();
  const { actor } = await member();
  const state = await read(actor);
  const type = state.types[0];
  await post(
    'object-type',
    {
      version: state.draft.version,
      id: type.id,
      baseRevision: type.revision,
      value: { ...type, name: 'Ny betydelse', fields: [] },
    },
    actor,
  );
  await save('type-change', actor);
  const before = await read();
  expect(await (await post('merge', reviewed)).json()).toEqual({ error: 'merge_conflict' });
  expect(await read()).toEqual(before);
});

test('new private identities and restored identities can enter the same compound proposal', async () => {
  await object('a');
  await object('b');
  expect((await post('merge', await proposal())).status).toBe(200);
  const created = await save('new-merge');
  expect(created.changes).toHaveLength(1);
  expect((await read()).objects.map((item) => item.id)).toEqual(['a']);
  await post('undo', {
    version: (await read()).draft.version,
    userId: created.userId,
    operationId: created.operationId,
  });
  const removed = await save('remove-created');
  await post('undo', {
    version: (await read()).draft.version,
    userId: removed.userId,
    operationId: removed.operationId,
  });
  await object('b');
  expect((await post('merge', await proposal())).status).toBe(200);
  await save('restore-merge');
  expect((await read()).objects[0]).toMatchObject({ id: 'a', revision: 3 });
});

test.each([
  { survivorId: 'a', absorbedId: 'a' },
  { identityConfirmed: 'yes' },
  { choices: null },
  { relationships: [null] },
])('invalid compound input rejects atomically: %j', async (invalid) => {
  await object('a');
  await object('b');
  await edge('edge', 'a', 'b');
  await save('initial');
  const before = await read();
  const response = await post('merge', { ...(await proposal()), ...invalid });
  expect([400, 409]).toContain(response.status);
  expect(await read()).toEqual(before);
});

test('the merge endpoint rejects an outdated browser before any content mutation', async () => {
  fixture.close();
  const identity = { commit: 'a'.repeat(40), version: '0.1.0-preview.2+2' };
  fixture = await applicationFixture({ identity });
  client = fixture.client();
  await client.signIn();
  const response = await client.request('/api/households', {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/json',
      'x-skyttel-build': `${identity.commit}:${identity.version}`,
    },
    body: JSON.stringify({ name: 'Linden' }),
  });
  expect(response.status).toBe(201);
  const { household } = await response.json();
  path = `/api/households/${household.id}/map`;
  const before = await read();
  for (const build of [undefined, 'older:0.1.0']) {
    const denied = await client.request(`${path}/merge`, {
      method: 'POST',
      headers: {
        origin: fixture.config.origin,
        'content-type': 'application/json',
        ...(build ? { 'x-skyttel-build': build } : {}),
      },
      body: JSON.stringify({
        version: before.draft.version,
        survivorId: 'a',
        absorbedId: 'b',
        identityConfirmed: true,
      }),
    });
    expect(denied.status).toBe(409);
    expect(await denied.json()).toEqual({ error: 'client_outdated' });
  }
  expect(await read()).toEqual(before);
});

test('a merge preserves restoration authority for relationships already restored in the private draft', async () => {
  await object('a');
  await object('b');
  await object('c');
  await edge('edge', 'a', 'c');
  await save('initial');
  await post('draft', {
    version: (await read()).draft.version,
    id: 'a',
    baseRevision: 1,
    value: null,
  });
  const deletion = await save('delete');
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        userId: deletion.userId,
        operationId: deletion.operationId,
      })
    ).status,
  ).toBe(200);
  expect((await post('merge', await proposal())).status).toBe(200);
  await save('restored-merge');
  expect((await read()).objects.find((item) => item.id === 'a')?.revision).toBe(3);
  expect((await read()).relationships[0]).toMatchObject({
    id: 'edge',
    sourceId: 'a',
    targetId: 'c',
    revision: 3,
  });
});

test('confirming a merge retains unspecified identity', async () => {
  for (const id of ['a', 'b']) {
    const state = await read();
    expect(
      (
        await post('draft', {
          version: state.draft.version,
          id,
          baseRevision: null,
          value: {
            typeId: state.types[0].id,
            name: 'Bankkontot',
            description: '',
            identity: 'unspecified',
          },
        })
      ).status,
    ).toBe(200);
  }
  await save('unspecified');
  expect((await post('merge', await proposal())).status).toBe(200);
  await save('same-unspecified');
  expect((await read()).objects[0].identity).toBe('unspecified');
});

test('confirmed same-phenomenon identity still requires explicitly resolving an unanswered identity fact', async () => {
  await object('a');
  await object('b');
  await save('initial');
  for (const id of ['a', 'b']) {
    const state = await read();
    const before = state.objects.find((item) => item.id === id);
    expect(
      (
        await post('draft', {
          version: state.draft.version,
          id,
          baseRevision: before?.revision,
          value: { ...before, identity: 'unresolved' },
        })
      ).status,
    ).toBe(200);
  }
  const body = await proposal();
  expect(await (await post('merge', body)).json()).toEqual({ error: 'merge_choices_required' });
  expect(
    (await post('merge', { ...body, choices: { ...body.choices, identity: 'survivor' } })).status,
  ).toBe(200);
  expect(
    await (
      await post('save', { version: (await read()).draft.version, operationId: 'unresolved-fact' })
    ).json(),
  ).toEqual({ error: 'unresolved_identity' });
  await post('discard-change', { version: (await read()).draft.version, kind: 'object', id: 'a' });
  const reviewed = await proposal();
  expect(
    (await post('merge', { ...reviewed, choices: { ...reviewed.choices, identity: 'omit' } }))
      .status,
  ).toBe(200);
  await save('identified');
  expect((await read()).objects[0].identity).toBeUndefined();
});
