import { afterEach, beforeEach, expect, test } from 'vitest';
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
    { version: state.draft.version, id, baseRevision: before?.revision ?? null, value },
    actor,
  );
}
async function save(operationId: string, actor = client): Promise<SaveReceipt> {
  const response = await post(
    'save',
    { version: (await read(actor)).draft.version, operationId },
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
      value: value === null ? null : { name: id, description: '', typeId, ...before, ...value },
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
              knowledge: 'known',
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

type DefinitionKind = 'object' | 'relationship' | 'field';
async function removalScenario(kind: DefinitionKind) {
  const initial = await read();
  const objectType = initial.types[0];
  const edgeType = initial.relationshipTypes[0];
  if (kind === 'field') {
    expect(
      (
        await definition('object-type', objectType.id, {
          ...objectType,
          fields: [{ id: 'serial', name: 'Serienummer', description: '', kind: 'text' }],
        })
      ).status,
    ).toBe(200);
    await save('define-field');
  }
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
              ...(kind === 'field' ? { customValues: { serial: 'SECRET-DRAFT-VALUE' } } : {}),
            },
            actor,
          ),
    remove: (actor = client) =>
      definition(
        kind === 'relationship' ? 'relationship-type' : 'object-type',
        kind === 'relationship' ? edgeType.id : objectType.id,
        kind === 'field' ? { ...objectType, fields: [] } : null,
        actor,
      ),
    error: kind === 'field' ? 'field_in_use' : 'definition_in_use',
    objectType,
    edgeType,
  };
}

test('unused prefilled definitions are removed only by whole save and remain readable and undoable', async () => {
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
  expect(
    (
      await (
        await post('undo', {
          version: (await read()).draft.version,
          userId: receipt.userId,
          operationId: receipt.operationId,
        })
      ).json()
    ).objectTypes[0].after,
  ).toMatchObject({ name: objectType.name });
  expect(draftConflicts(await read())).toEqual([]);
  await save('restore-catalog');
  expect((await read()).types).toContainEqual(
    expect.objectContaining({ id: objectType.id, name: objectType.name }),
  );
  expect((await (await client.request(`${path}/history`)).json()).history[0]).toEqual(receipt);
});

test('an unused field can be removed while other type facts and historical values survive', async () => {
  const type = (await read()).types[0];
  const serial = { id: 'serial', name: 'Serienummer', description: '', kind: 'text' };
  expect((await definition('object-type', type.id, { ...type, fields: [serial] })).status).toBe(
    200,
  );
  await save('field');
  await object('historical', type.id, { customValues: { serial: 'SYNTH-1' } });
  await save('value');
  await object('historical', type.id, null);
  const removal = await save('object-removal');
  expect(
    (await definition('object-type', type.id, { ...type, name: 'Bevarad typ', fields: [] })).status,
  ).toBe(200);
  await save('field-removal');
  expect((await read()).types.find((item) => item.id === type.id)).toMatchObject({
    name: 'Bevarad typ',
  });
  expect(
    (await (await client.request(`${path}/history`)).json()).history[1].changes[0],
  ).toMatchObject({
    after: { customValues: { serial: 'SYNTH-1' } },
    type: { fields: [serial] },
  });
  expect(
    (
      await post('undo', {
        version: (await read()).draft.version,
        userId: removal.userId,
        operationId: removal.operationId,
      })
    ).status,
  ).toBe(200);
  expect(draftConflicts(await read())).toEqual([
    expect.objectContaining({ kind: 'objectType', id: type.id }),
  ]);
});

test.each(['object', 'relationship', 'field'] as const)(
  '%s removal protects current, ended, own and other private use without exposing private facts',
  async (kind) => {
    const scenario = await removalScenario(kind);
    const other = await member();
    for (const actor of [client, other]) {
      await scenario.use(actor);
      const before = await read();
      const otherBefore = await read(other);
      const failure = await scenario.remove();
      expect(failure.status).toBe(409);
      expect(await failure.json()).toEqual({ error: scenario.error });
      expect(await read()).toEqual(before);
      expect(await read(other)).toEqual(otherBefore);
      expect(
        (await post('discard', { version: (await read(actor)).draft.version }, actor)).status,
      ).toBe(200);
    }
    await scenario.use();
    await save('current-use');
    expect(await (await scenario.remove()).json()).toEqual({ error: scenario.error });
    await scenario.use(client, true);
    await save('ended-use');
    const before = await read();
    expect(await (await scenario.remove()).json()).toEqual({ error: scenario.error });
    expect(await read()).toEqual(before);
    if (kind === 'relationship') await relationship('private-edge', scenario.edgeType.id, null);
    else await object('private-object', scenario.objectType.id, null);
    expect((await scenario.remove()).status).toBe(200);
    await save('remove-use-and-definition');
    const final = await read();
    if (kind === 'relationship') {
      expect(final.relationships).toEqual([]);
      expect(final.objects).toHaveLength(2);
    } else expect(final.objects).toEqual([]);
  },
);

test.each(['object', 'relationship', 'field'] as const)(
  '%s removal rechecks new persisted private and saved use and rolls back the whole group',
  async (kind) => {
    const scenario = await removalScenario(kind);
    const other = await member();
    expect((await scenario.remove()).status).toBe(200);
    await object('independent', (await read()).types[1].id);
    await scenario.use(other);
    const before = await read();
    expect(
      await (
        await post('save', { version: before.draft.version, operationId: 'private-use-race' })
      ).json(),
    ).toEqual({ error: scenario.error });
    expect((await read()).objects).toEqual(before.objects);
    expect((await read()).draft).toEqual(before.draft);
    await save('concurrent-use', other);
    const afterUse = await read();
    expect(
      await (
        await post('save', { version: afterUse.draft.version, operationId: 'saved-use-race' })
      ).json(),
    ).toEqual({ error: scenario.error });
    expect((await read()).objects).toEqual(afterUse.objects);
    expect((await read()).draft).toEqual(before.draft);
    expect((await (await client.request(`${path}/history`)).json()).history).not.toContainEqual(
      expect.objectContaining({ operationId: 'saved-use-race' }),
    );
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
        ? { ...type, fields: [], name: 'Senare namn' }
        : {
            name: 'Senare namn',
            description: type.description,
            forwardLabel: 'binder',
            reverseLabel: 'hör till',
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
    const value =
      kind === 'object-type'
        ? { name: 'Egen typ', description: '', fields: [] }
        : { name: 'Egen typ', description: '', forwardLabel: 'binder', reverseLabel: 'hör till' };
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

test('removed object and relationship definitions return only in an explicit reviewed restoration with independent proposals intact', async () => {
  const initial = await read();
  const type = initial.types[0];
  const edgeType = initial.relationshipTypes[0];
  await object('source', type.id, { name: 'Historiskt föremål' });
  await object('target', initial.types[1].id);
  await relationship('edge', edgeType.id);
  await save('content');
  await object('source', type.id, null);
  const deletion = await save('delete-content');
  expect((await definition('object-type', type.id, null)).status).toBe(200);
  expect((await definition('relationship-type', edgeType.id, null)).status).toBe(200);
  await save('delete-definitions');
  await object('independent', initial.types[1].id);
  const before = await read();
  const body = {
    version: before.draft.version,
    userId: deletion.userId,
    operationId: deletion.operationId,
  };
  expect((await post('undo', body)).status).toBe(200);
  const restored = await read();
  expect(restored.types).toEqual(before.types);
  expect(restored.relationshipTypes).toEqual(before.relationshipTypes);
  expect(restored.objects).toEqual(before.objects);
  expect(restored.draft.objectTypes?.[0]).toMatchObject({
    before: null,
    after: { id: type.id, name: type.name },
  });
  expect(restored.draft.relationshipTypes?.[0]).toMatchObject({
    before: null,
    after: { id: edgeType.id, name: edgeType.name },
  });
  expect(restored.draft.changes).toContainEqual(before.draft.changes[0]);
  expect((await post('undo', body)).status).toBe(409);
  expect((await read()).draft).toEqual(restored.draft);
  await save('restoration');
  const final = await read();
  expect(final.objects.map((item) => item.id).sort()).toEqual(['independent', 'source', 'target']);
  expect(final.objects.find((item) => item.id === 'target')).toEqual(before.objects[0]);
  expect(final.relationships).toContainEqual(
    expect.objectContaining({ id: 'edge', typeId: edgeType.id }),
  );
  expect((await (await client.request(`${path}/history`)).json()).history[1]).toEqual(deletion);
});

test('definition and field removals require current household membership and denied requests preserve all drafts', async () => {
  const initial = await read();
  const type = initial.types[0];
  const fieldType = initial.types[1];
  const edgeType = initial.relationshipTypes[0];
  expect(
    (
      await definition('object-type', fieldType.id, {
        ...fieldType,
        fields: [{ id: 'serial', name: 'Serienummer', kind: 'text', description: '' }],
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
      value: { ...fieldType, fields: [] },
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

test.each(['object', 'relationship', 'field'] as const)(
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
            knowledge: 'known',
          }
        : {
            typeId: scenario.objectType.id,
            name: 'Senare användning',
            description: '',
            ...(kind === 'field' ? { customValues: { serial: 'SYNTH-2' } } : {}),
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
      error: kind === 'field' ? 'invalid_custom_value' : 'invalid_type',
    });
    expect(await read(other)).toEqual(before);
  },
);
