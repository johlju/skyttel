import { afterEach, beforeEach, expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
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
async function resolveObject(id: string, choice: 'saved' | 'proposed') {
  const state = await read();
  const conflict = draftConflicts(state).find((item) => item.kind === 'object' && item.id === id);
  expect(conflict).toBeDefined();
  return client.json(`${path}/resolve`, { version: state.draft.version, conflict, choice });
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

test('resolving a relationship date proposal preserves an independently saved ended status', async () => {
  await object('a');
  await object('b');
  await edge();
  expect((await save()).status).toBe(200);
  const actor = await member();
  expect(
    (await edge('edge', { endDate: { knowledge: 'known', value: '2031-04-12' } })).status,
  ).toBe(200);
  expect((await edge('edge', { lifecycle: 'ended' }, actor)).status).toBe(200);
  expect((await save(actor)).status).toBe(200);
  expect((await save()).status).toBe(409);
  const state = await read();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: state.draft.version,
        conflict: { kind: 'relationship', id: 'edge', current: state.relationships[0] },
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  expect((await read()).relationships[0]).not.toHaveProperty('endDate');
  expect((await save()).status).toBe(200);
  expect((await read()).relationships[0]).toMatchObject({
    lifecycle: 'ended',
    endDate: { knowledge: 'known', value: '2031-04-12' },
  });
});

test.each<{
  name: string;
  initial: Partial<RelationshipValue>;
  proposed: Partial<RelationshipValue>;
  saved: Partial<RelationshipValue>;
  expected: Partial<RelationshipValue>;
}>([
  {
    name: 'a status proposal preserves an independently saved date and certainty',
    initial: { endDate: { knowledge: 'known', value: '2031-04-12' } },
    proposed: { lifecycle: 'ended', endDate: { knowledge: 'known', value: '2031-04-12' } },
    saved: { endDate: { knowledge: 'uncertain', value: '2031-05-15' } },
    expected: { lifecycle: 'ended', endDate: { knowledge: 'uncertain', value: '2031-05-15' } },
  },
  {
    name: 'removing a status preserves an independently saved unknown date',
    initial: { lifecycle: 'ended' },
    proposed: {},
    saved: { lifecycle: 'ended', endDate: { knowledge: 'unknown' } },
    expected: { endDate: { knowledge: 'unknown' } },
  },
  {
    name: 'a date choice keeps proposed certainty and value together when both writers change it',
    initial: { endDate: { knowledge: 'known', value: '2031-04-12' } },
    proposed: { endDate: { knowledge: 'uncertain', value: '2031-04-12' } },
    saved: { lifecycle: 'active', endDate: { knowledge: 'known', value: '2031-05-15' } },
    expected: { lifecycle: 'active', endDate: { knowledge: 'uncertain', value: '2031-04-12' } },
  },
  {
    name: 'removing a date preserves an independently saved status',
    initial: { endDate: { knowledge: 'known', value: '2031-04-12' } },
    proposed: {},
    saved: { lifecycle: 'ended', endDate: { knowledge: 'known', value: '2031-04-12' } },
    expected: { lifecycle: 'ended' },
  },
  {
    name: 'a status overlap keeps the chosen proposal and independent saved date',
    initial: { lifecycle: 'ended' },
    proposed: { lifecycle: 'active' },
    saved: { endDate: { knowledge: 'none' } },
    expected: { lifecycle: 'active', endDate: { knowledge: 'none' } },
  },
  {
    name: 'a certainty choice retains its target when the other writer removes that target',
    initial: {},
    proposed: { knowledge: 'uncertain' },
    saved: { targetId: null, knowledge: 'none', lifecycle: 'ended' },
    expected: { targetId: 'b', knowledge: 'uncertain', lifecycle: 'ended' },
  },
  {
    name: 'an explicitly absent target stays absent when the other writer changes certainty',
    initial: {},
    proposed: { targetId: null, knowledge: 'none' },
    saved: { knowledge: 'uncertain', lifecycle: 'ended' },
    expected: { targetId: null, knowledge: 'none', lifecycle: 'ended' },
  },
])('relationship resolution: $name', async ({ initial, proposed, saved, expected }) => {
  await object('a');
  await object('b');
  await edge('edge', initial);
  expect((await save()).status).toBe(200);
  const original = (await read()).relationships[0];
  const actor = await member();
  expect((await edge('edge', proposed)).status).toBe(200);
  expect((await edge('edge', saved, actor)).status).toBe(200);
  expect((await save(actor)).status).toBe(200);
  expect((await save()).status).toBe(409);
  const state = await read();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: state.draft.version,
        conflict: { kind: 'relationship', id: 'edge', current: state.relationships[0] },
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  expect((await save()).status).toBe(200);
  expect((await read()).relationships[0]).toEqual({
    id: 'edge',
    householdId: original.householdId,
    typeId: original.typeId,
    sourceId: 'a',
    targetId: 'b',
    knowledge: 'known',
    revision: 3,
    ...expected,
  });
});

test('a status proposal preserves saved relationship meaning after an old endpoint is removed', async () => {
  await object('a');
  await object('b');
  await edge();
  expect((await save()).status).toBe(200);
  const actor = await member();
  expect((await edge('edge', { lifecycle: 'ended' })).status).toBe(200);
  const type = (await read()).relationshipTypes[1];
  expect(
    (
      await edge(
        'edge',
        { typeId: type.id, sourceId: 'b', targetId: null, knowledge: 'unknown' },
        actor,
      )
    ).status,
  ).toBe(200);
  expect((await object('a', null, actor)).status).toBe(200);
  expect((await save(actor)).status).toBe(200);
  const state = await read();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: state.draft.version,
        conflict: { kind: 'relationship', id: 'edge', current: state.relationships[0], type },
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  const response = await save();
  expect(response.status).toBe(200);
  const { receipt } = await response.json();
  expect(receipt.relationships[0]).toMatchObject({
    after: {
      typeId: type.id,
      sourceId: 'b',
      targetId: null,
      knowledge: 'unknown',
      lifecycle: 'ended',
    },
    type,
  });
  expect((await read()).relationships).toEqual([receipt.relationships[0].after]);
});

test('choosing a certainty correction keeps the original relationship assertion and saved status', async () => {
  await object('a');
  await object('b');
  await object('c');
  await edge();
  expect((await save()).status).toBe(200);
  const original = (await read()).relationships[0];
  const actor = await member();
  expect((await edge('edge', { knowledge: 'uncertain' })).status).toBe(200);
  const type = (await read()).relationshipTypes[1];
  expect(
    (await edge('edge', { typeId: type.id, sourceId: 'c', lifecycle: 'ended' }, actor)).status,
  ).toBe(200);
  expect((await save(actor)).status).toBe(200);
  const state = await read();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: state.draft.version,
        conflict: { kind: 'relationship', id: 'edge', current: state.relationships[0] },
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  expect((await save()).status).toBe(200);
  expect((await read()).relationships[0]).toMatchObject({
    typeId: original.typeId,
    sourceId: 'a',
    targetId: 'b',
    knowledge: 'uncertain',
    lifecycle: 'ended',
  });
});

test.each(['object', 'relationship'] as const)(
  'resolving %s deletion after a type change records the current historical definition',
  async (kind) => {
    await object('a');
    await object('b');
    await edge();
    expect((await save()).status).toBe(200);
    const actor = await member();
    const state = await read();
    const type = (kind === 'object' ? state.types : state.relationshipTypes)[1];
    if (kind === 'object') {
      expect((await object('a', null)).status).toBe(200);
      expect((await object('a', { typeId: type.id }, actor)).status).toBe(200);
    } else {
      expect((await edge('edge', null)).status).toBe(200);
      expect((await edge('edge', { typeId: type.id }, actor)).status).toBe(200);
    }
    expect((await save(actor)).status).toBe(200);
    const changed = await read();
    expect(
      (
        await client.json(`${path}/resolve`, {
          version: changed.draft.version,
          conflict: draftConflicts(changed).find(
            (item) => item.kind === kind && item.id === (kind === 'object' ? 'a' : 'edge'),
          ),
          choice: 'proposed',
        })
      ).status,
    ).toBe(200);
    const response = await save();
    expect(response.status).toBe(200);
    const { receipt } = await response.json();
    const change = (kind === 'object' ? receipt.changes : receipt.relationships)[0];
    expect(change).toMatchObject({ before: { typeId: type.id }, after: null, type });
    const { history } = await (await client.request(`${path}/history`)).json();
    expect(history.at(-1)).toEqual(receipt);
  },
);

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

test('deleting an endpoint after a private type change retains the saved relationship definition', async () => {
  await object('a');
  await object('b');
  await edge();
  expect((await save()).status).toBe(200);
  const initial = await read();
  const savedType = initial.relationshipTypes[0];
  const proposedType = initial.relationshipTypes[1];
  expect((await edge('edge', { typeId: proposedType.id })).status).toBe(200);
  expect((await object('a', null)).status).toBe(200);
  const state = await read();
  expect(draftConflicts(state)).toEqual([]);
  expect(state.draft.relationships).toMatchObject([
    { id: 'edge', before: { typeId: savedType.id }, after: null, type: savedType },
  ]);
  expect(state.objects).toEqual(initial.objects);
  expect(state.relationships).toEqual(initial.relationships);
  const response = await save();
  expect(response.status).toBe(200);
  const { receipt } = await response.json();
  expect(receipt.relationships).toMatchObject([
    { id: 'edge', before: { typeId: savedType.id }, after: null, type: savedType },
  ]);
  const saved = await read();
  expect(saved.objects.map((item) => item.id)).toEqual(['b']);
  expect(saved.relationships).toEqual([]);
  expect(saved.relationshipTypes).toEqual(initial.relationshipTypes);
  const { history } = await (await client.request(`${path}/history`)).json();
  expect(history.at(-1)).toEqual(receipt);
});

test.each(['before', 'after'] as const)(
  'editing the retained definition %s an endpoint deletion saves labels with the deletion atomically',
  async (timing) => {
    await object('a');
    await object('b');
    await edge();
    expect((await save()).status).toBe(200);
    const initial = await read();
    const savedType = initial.relationshipTypes[0];
    const definition = {
      name: 'Användning',
      description: 'Användning i hushållet',
      forwardLabel: 'använder',
      reverseLabel: 'används av',
    };
    const define = async () =>
      client.json(`${path}/relationship-type`, {
        version: (await read()).draft.version,
        id: savedType.id,
        baseRevision: savedType.revision,
        value: definition,
      });
    expect((await edge('edge', { typeId: initial.relationshipTypes[1].id })).status).toBe(200);
    if (timing === 'before') expect((await define()).status).toBe(200);
    expect((await object('a', null)).status).toBe(200);
    if (timing === 'after') expect((await define()).status).toBe(200);
    const proposed = await read();
    expect(draftConflicts(proposed)).toEqual([]);
    const expectedType = { ...savedType, ...definition, revision: 2 };
    expect(proposed.draft.relationships?.[0].type).toEqual(expectedType);
    const response = await save();
    expect(response.status).toBe(200);
    const { receipt } = await response.json();
    expect(receipt.relationshipTypes).toEqual([
      { id: savedType.id, before: savedType, after: expectedType },
    ]);
    expect(receipt.relationships).toMatchObject([
      { id: 'edge', before: { typeId: savedType.id }, after: null, type: expectedType },
    ]);
    expect((await read()).relationshipTypes.find((item) => item.id === savedType.id)).toEqual(
      expectedType,
    );
    const { history } = await (await client.request(`${path}/history`)).json();
    expect(history.at(-1)).toEqual(receipt);
  },
);

test('cascade deletion preserves the reviewed definition revision when the relationship type is unchanged', async () => {
  await object('a');
  await object('b');
  await edge();
  expect((await save()).status).toBe(200);
  const actor = await member();
  expect((await edge('edge', { lifecycle: 'ended' })).status).toBe(200);
  const initial = await read();
  const savedType = initial.relationshipTypes[0];
  expect(
    (
      await actor.json(`${path}/relationship-type`, {
        version: (await read(actor)).draft.version,
        id: savedType.id,
        baseRevision: savedType.revision,
        value: {
          name: 'Ändrad betydelse',
          description: '',
          forwardLabel: 'kopplar till',
          reverseLabel: 'kopplas från',
        },
      })
    ).status,
  ).toBe(200);
  expect((await save(actor)).status).toBe(200);
  expect((await object('a', null)).status).toBe(200);
  const proposed = await read();
  expect(proposed.draft.relationships?.[0].type).toEqual(savedType);
  expect(draftConflicts(proposed)).toMatchObject([
    { kind: 'relationship', id: 'edge', type: { id: savedType.id, revision: 2 } },
  ]);
  expect((await save()).status).toBe(409);
  const rejected = await read();
  expect(rejected.objects).toEqual(initial.objects);
  expect(rejected.relationships).toEqual(initial.relationships);
  expect(rejected.draft).toEqual(proposed.draft);
});

test.each(['before', 'after'] as const)(
  'keeping a saved object preserves relationship deletions proposed independently %s object removal',
  async (timing) => {
    await object('a');
    await object('b');
    await object('c');
    await edge();
    await edge('independent', { sourceId: 'b', targetId: 'a' });
    await edge('unrelated', { sourceId: 'b', targetId: 'c' });
    expect((await save()).status).toBe(200);

    if (timing === 'before') expect((await edge('independent', null)).status).toBe(200);
    expect((await object('a', null)).status).toBe(200);
    if (timing === 'after') expect((await edge('independent', null)).status).toBe(200);
    expect(
      (await edge('unrelated', { sourceId: 'b', targetId: 'c', knowledge: 'uncertain' })).status,
    ).toBe(200);
    expect((await object('c', { name: 'Mitt förslag' })).status).toBe(200);

    const actor = await member();
    await object('a', { name: 'Sparat namn' }, actor);
    expect((await save(actor)).status).toBe(200);
    expect((await resolveObject('a', 'saved')).status).toBe(200);
    const state = await read();
    expect(state.draft.changes).toMatchObject([{ id: 'c', after: { name: 'Mitt förslag' } }]);
    expect(state.draft.relationships).toHaveLength(2);
    expect(state.draft.relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'independent', after: null }),
        expect.objectContaining({
          id: 'unrelated',
          after: expect.objectContaining({ knowledge: 'uncertain' }),
        }),
      ]),
    );
    expect((await save()).status).toBe(200);
    const saved = await read();
    expect(saved.objects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'a', name: 'Sparat namn' }),
        expect.objectContaining({ id: 'c', name: 'Mitt förslag' }),
      ]),
    );
    expect(saved.relationships.map((value) => value.id)).toEqual(['edge', 'unrelated']);
    expect(saved.relationships.find((value) => value.id === 'unrelated')?.knowledge).toBe(
      'uncertain',
    );
  },
);

test.each([
  ['a', 'b'],
  ['b', 'a'],
])(
  'withdrawing %s then %s removes a shared relationship deletion only after both withdrawals',
  async (first, second) => {
    await object('a');
    await object('b');
    await edge();
    expect((await save()).status).toBe(200);
    await object('a', null);
    await object('b', null);
    await object('c');

    const actor = await member();
    await object('a', { name: 'Sparat A' }, actor);
    await object('b', { name: 'Sparat B' }, actor);
    expect((await save(actor)).status).toBe(200);
    expect((await resolveObject(first, 'saved')).status).toBe(200);
    const remaining = await read();
    expect(remaining.draft.relationships).toMatchObject([{ id: 'edge', after: null }]);
    expect(remaining.draft.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: second, after: null })]),
    );

    expect((await resolveObject(second, 'saved')).status).toBe(200);
    expect((await read()).draft.relationships ?? []).toEqual([]);
    expect((await save()).status).toBe(200);
    const saved = await read();
    expect(saved.objects).toHaveLength(3);
    expect(saved.relationships).toMatchObject([{ id: 'edge', sourceId: 'a', targetId: 'b' }]);
  },
);

test('replacing an object deletion with an edit removes generated relationship deletions and preserves independent ones', async () => {
  await object('a');
  await object('b');
  await edge();
  await edge('independent', { sourceId: 'b', targetId: 'a' });
  expect((await save()).status).toBe(200);
  await edge('independent', null);
  await object('a', null);
  expect((await object('a', { name: 'Behåll mig' })).status).toBe(200);
  expect((await read()).draft.relationships).toMatchObject([{ id: 'independent', after: null }]);
  expect((await save()).status).toBe(200);
  const saved = await read();
  expect(saved.objects.find((value) => value.id === 'a')?.name).toBe('Behåll mig');
  expect(saved.relationships).toMatchObject([{ id: 'edge', sourceId: 'a', targetId: 'b' }]);
});

test('keeping a saved object removes relationship deletions generated by earlier conflict resolution', async () => {
  await object('a');
  await object('b');
  await edge();
  expect((await save()).status).toBe(200);
  await object('a', null);
  await object('c');

  const actor = await member();
  const state = await read(actor);
  await edge('new-edge', { typeId: state.relationshipTypes[1].id }, actor);
  expect((await save(actor)).status).toBe(200);
  expect((await resolveObject('a', 'proposed')).status).toBe(200);
  expect((await read()).draft.relationships).toHaveLength(2);

  await object('a', { name: 'Sparat namn' }, actor);
  expect((await save(actor)).status).toBe(200);
  expect((await resolveObject('a', 'saved')).status).toBe(200);
  expect((await read()).draft.relationships ?? []).toEqual([]);
  expect((await save()).status).toBe(200);
  const saved = await read();
  expect(saved.objects).toHaveLength(3);
  expect(saved.relationships.map((value) => value.id)).toEqual(['edge', 'new-edge']);
});

test('a relationship deletion added during conflict resolution remains required by the other removed endpoint', async () => {
  await object('a');
  await object('b');
  expect((await save()).status).toBe(200);
  await object('a', null);
  await object('b', null);

  const actor = await member();
  await edge('new-edge', {}, actor);
  expect((await save(actor)).status).toBe(200);
  expect((await resolveObject('a', 'proposed')).status).toBe(200);
  expect((await read()).draft.relationships).toMatchObject([{ id: 'new-edge', after: null }]);

  await object('a', { name: 'Sparat namn' }, actor);
  expect((await save(actor)).status).toBe(200);
  expect((await resolveObject('a', 'saved')).status).toBe(200);
  expect((await read()).draft.relationships).toMatchObject([{ id: 'new-edge', after: null }]);
  expect((await save()).status).toBe(200);
  const saved = await read();
  expect(saved.objects).toMatchObject([{ id: 'a', name: 'Sparat namn' }]);
  expect(saved.relationships).toEqual([]);
});

test('rebasing a generated relationship deletion stops attributing it to an endpoint that moved away', async () => {
  await object('a');
  await object('b');
  await object('c');
  await edge();
  expect((await save()).status).toBe(200);
  await object('a', null);
  await object('b', null);

  const actor = await member();
  expect((await edge('edge', { targetId: 'c' }, actor)).status).toBe(200);
  expect((await save(actor)).status).toBe(200);
  const state = await read();
  const conflict = draftConflicts(state).find(
    (item) => item.kind === 'relationship' && item.id === 'edge',
  );
  expect(conflict).toBeDefined();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: state.draft.version,
        conflict,
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.relationships).toMatchObject([
    { id: 'edge', before: { sourceId: 'a', targetId: 'c' }, after: null },
  ]);

  await object('a', { name: 'Sparat namn' }, actor);
  expect((await save(actor)).status).toBe(200);
  expect((await resolveObject('a', 'saved')).status).toBe(200);
  expect((await read()).draft.relationships ?? []).toEqual([]);
  expect((await save()).status).toBe(200);
  const saved = await read();
  expect(saved.objects.map((value) => value.id).sort()).toEqual(['a', 'c']);
  expect(saved.relationships).toMatchObject([{ id: 'edge', sourceId: 'a', targetId: 'c' }]);
});

test('a draft endpoint move retains its generated deletion until the object removal that triggered it is withdrawn', async () => {
  await object('a');
  await object('b');
  await object('c');
  await edge();
  expect((await save()).status).toBe(200);
  expect((await edge('edge', { targetId: 'c' })).status).toBe(200);
  expect((await object('c', null)).status).toBe(200);
  fixture.database
    .prepare('UPDATE relationship_type SET revision = revision + 1 WHERE id = ?')
    .run((await read()).relationships[0].typeId);
  const state = await read();
  const conflict = draftConflicts(state).find(
    (item) => item.kind === 'relationship' && item.id === 'edge',
  );
  expect(conflict).toBeDefined();
  expect(
    (
      await client.json(`${path}/resolve`, {
        version: state.draft.version,
        conflict,
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  expect((await object('b', { name: 'Annat förslag' })).status).toBe(200);
  expect((await read()).draft.relationships).toMatchObject([
    { id: 'edge', before: { sourceId: 'a', targetId: 'b' }, after: null },
  ]);

  expect((await object('c', { name: 'Behåll mig' })).status).toBe(200);
  expect((await read()).draft.relationships ?? []).toEqual([]);
  expect((await save()).status).toBe(200);
  const saved = await read();
  expect(saved.objects).toHaveLength(3);
  expect(saved.objects.find((value) => value.id === 'b')?.name).toBe('Annat förslag');
  expect(saved.objects.find((value) => value.id === 'c')?.name).toBe('Behåll mig');
  expect(saved.relationships).toMatchObject([{ id: 'edge', sourceId: 'a', targetId: 'b' }]);
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
  const body = { version: (await read()).draft.version, operationId: 'retry-family' };
  expect((await client.json(`${path}/save`, body)).status).toBe(500);
  expect((await read()).relationships).toEqual([]);
  expect((await read()).objects).toEqual([]);
  expect((await read()).draft.relationships).toHaveLength(1);
  fixture.database.exec('DROP TRIGGER fail_family_receipt');
  expect((await client.json(`${path}/save`, body)).status).toBe(200);
  expect((await read()).relationships).toHaveLength(1);
});

test('foreign household objects and types cannot be linked, and revoked members cannot submit relationships', async () => {
  const actor = await member();
  await object('a');
  await object('b');
  await save();
  fixture.database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
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
