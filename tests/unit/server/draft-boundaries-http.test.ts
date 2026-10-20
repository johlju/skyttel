import { unzipSync } from 'fflate';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { conflictBasis, conflictProperties } from '../../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let owner: ReturnType<typeof fixture.client>;
let member: ReturnType<typeof fixture.client>;
let path: string;
type Kind = 'object' | 'relationship' | 'objectType' | 'relationshipType';
const read = async (actor = owner): Promise<MapState> => (await actor.request(path)).json();
const post = (route: string, body: unknown, actor = owner) => actor.json(`${path}/${route}`, body);
const history = async () => (await owner.request(`${path}/history`)).json();
async function checked(response: Response, status = 200) {
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(status);
  return result;
}
async function propose(
  kind: Kind,
  id: string,
  value: Record<string, unknown> | null,
  actor = owner,
) {
  const state = await read(actor);
  const collections = {
    object: state.objects,
    relationship: state.relationships,
    objectType: state.types,
    relationshipType: state.relationshipTypes,
  };
  const drafts = {
    object: state.draft.changes,
    relationship: state.draft.relationships,
    objectType: state.draft.objectTypes,
    relationshipType: state.draft.relationshipTypes,
  };
  const before = collections[kind].find((item) => item.id === id);
  const existing = drafts[kind]?.find((item) => item.id === id);
  const data: Record<string, unknown> | null =
    value === null ? null : { ...before, ...existing?.after, ...value };
  if (kind === 'relationshipType' && data) {
    data.forwardLabel ??= data.name ?? 'binder';
    data.reverseLabel ??= data.name ?? 'hör till';
    for (const key of ['id', 'householdId', 'revision']) delete data[key];
  }
  return post(
    {
      object: 'draft',
      relationship: 'relationship',
      objectType: 'object-type',
      relationshipType: 'relationship-type',
    }[kind],
    {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id,
      baseRevision: existing ? (existing.before?.revision ?? null) : (before?.revision ?? null),
      value: data,
    },
    actor,
  );
}
async function save(operationId: string, actor = owner) {
  const state = await read(actor);
  return checked(
    await post(
      'save',
      { operationId, version: state.draft.version, contentVersion: state.contentVersion },
      actor,
    ),
  );
}
async function independent(actor = owner) {
  await checked(
    await propose(
      'object',
      'independent',
      {
        typeId: (await read(actor)).types[0].id,
        name: 'Oberoende förslag',

        properties: [{ id: 'description', label: 'Beskrivning', kind: 'text', value: 'Bevaras' }],
      },
      actor,
    ),
  );
}
beforeEach(async () => {
  fixture = await applicationFixture();
  owner = fixture.client();
  await owner.signIn();
  const { household } = await checked(await owner.json('/api/households', { name: 'Linden' }), 201);
  path = `/api/households/${household.id}/map`;
  fixture.setSubject('conflict-member');
  member = fixture.client();
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await checked(
    await owner.json(`${path.replace('/map', '')}/invitations`, { userId: user.id }),
    201,
  );
  await checked(await member.json('/api/invitations/accept', { code }));
  const initial = await read();
  for (const id of ['source', 'target', 'other'])
    await checked(
      await propose('object', id, {
        typeId: initial.types[0].id,
        name: id,

        properties: [
          { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Grundvärde' },
        ],
      }),
    );
  await checked(
    await propose('relationship', 'edge', {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'source',
      targetId: 'target',
    }),
  );
  await save('initial');
});
afterEach(() => fixture.close());

test.each(['object', 'relationship', 'objectType', 'relationshipType'] as const)(
  '%s property choices reject malformed, incomplete, stale and unauthorized combinations before an explicit saved-side discard',
  async (kind) => {
    const initial = await read();
    const id =
      kind === 'object'
        ? 'source'
        : kind === 'relationship'
          ? 'edge'
          : kind === 'objectType'
            ? initial.types[1].id
            : initial.relationshipTypes[1].id;
    const update = (privateSide: boolean) =>
      kind === 'object'
        ? {
            name: privateSide ? 'Mitt namn' : 'Gemensamt namn',
            properties: [
              {
                id: 'description',
                label: 'Beskrivning',
                kind: 'text',
                value: privateSide ? 'Min text' : 'Gemensam text',
              },
            ],
          }
        : kind === 'relationship'
          ? {
              lifecycle: privateSide ? 'active' : 'ended',
            }
          : {
              name: privateSide ? 'Min definition' : 'Gemensam definition',
              description: privateSide ? 'Min text' : 'Gemensam text',
              ...(kind === 'objectType' ? {} : {}),
            };
    await checked(await propose(kind, id, update(true)));
    await independent();
    await checked(await propose(kind, id, update(false), member));
    await save('concurrent', member);
    const before = await read();
    const memberBefore = await read(member);
    const historyBefore = await history();
    const conflict = draftConflicts(before).find((item) => item.kind === kind && item.id === id);
    if (!conflict) throw new Error('Expected concurrent property conflict');
    const fields = conflictProperties(before, conflict);
    const choices = Object.fromEntries(fields.map((field) => [field.key, 'saved']));
    const body = {
      version: before.draft.version,
      contentVersion: before.contentVersion,
      conflict,
      basis: conflictBasis(before, conflict),
      choices,
    };
    for (const [changes, error] of [
      [{ choices: null }, 'invalid_request'],
      [{ choices: [] }, 'invalid_request'],
      [{ choices: { ...choices, invented: 'saved' } }, 'invalid_request'],
      [{ choices: { ...choices, [fields[0].key]: 'invented' } }, 'invalid_request'],
      [{ choices: {} }, 'resolution_choices_required'],
      [{ basis: {} }, 'resolution_conflict'],
      [{ conflict: { ...conflict, id: 'missing' } }, 'resolution_conflict'],
    ] as const) {
      expect(await (await post('resolve', { ...body, ...changes })).json()).toEqual({ error });
      expect(await read()).toEqual(before);
      expect(await read(member)).toEqual(memberBefore);
      expect(await history()).toEqual(historyBefore);
    }
    await checked(await post('resolve', body));
    const after = await read();
    expect(draftConflicts(after)).toEqual([]);
    expect(after.draft.changes).toEqual(
      before.draft.changes.filter((change) => kind !== 'object' || change.id !== id),
    );
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(after.types).toEqual(before.types);
    expect(after.relationshipTypes).toEqual(before.relationshipTypes);
    expect(await read(member)).toEqual(memberBefore);
    expect(await history()).toEqual(historyBefore);
    const receipt = (await save('only-independent')).receipt;
    expect(receipt.changes).toMatchObject([{ after: { id: 'independent' } }]);
    expect(receipt.relationships ?? []).toEqual([]);
    expect(receipt.objectTypes ?? []).toEqual([]);
    expect(receipt.relationshipTypes ?? []).toEqual([]);
  },
);

test.each(['object', 'relationship'] as const)(
  '%s explicit removal choices preserve other proposals and act on the latest saved record only',
  async (kind) => {
    const id = kind === 'object' ? 'source' : 'edge';
    await checked(await propose(kind, id, null));
    await independent();
    await checked(
      await propose(
        kind,
        id,
        kind === 'object'
          ? {
              properties: [
                {
                  id: 'description',
                  label: 'Beskrivning',
                  kind: 'text',
                  value: 'Senare beskrivning',
                },
              ],
            }
          : {},
        member,
      ),
    );
    await save('newer-record', member);
    const before = await read();
    const historyBefore = await history();
    const conflict = draftConflicts(before).find((item) => item.kind === kind && item.id === id);
    if (!conflict) throw new Error('Expected own removal conflict');
    const body = {
      version: before.draft.version,
      contentVersion: before.contentVersion,
      conflict,
      basis: conflictBasis(before, conflict),
      command: 'removal-choices',
    };
    for (const [removalChoices, error] of [
      [null, 'invalid_request'],
      [[], 'invalid_request'],
      [{}, 'invalid_resolution'],
      [{ [kind]: 'invented' }, 'invalid_resolution'],
    ] as const) {
      expect(await (await post('resolve', { ...body, removalChoices })).json()).toEqual({ error });
      expect(await read()).toEqual(before);
      expect(await history()).toEqual(historyBefore);
    }
    expect(await (await post('resolve', { ...body, command: 'discard-proposal' })).json()).toEqual({
      error: 'invalid_resolution',
    });
    await checked(await post('resolve', { ...body, removalChoices: { [kind]: 'proposed' } }));
    const after = await read();
    expect(after.draft.changes.find((change) => change.id === 'independent')).toEqual(
      before.draft.changes.find((change) => change.id === 'independent'),
    );
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(await history()).toEqual(historyBefore);
    await save('explicit-removal');
    expect((await read()).relationships).toEqual([]);
    expect((await read()).objects.some((object) => object.id === 'source')).toBe(
      kind === 'relationship',
    );
  },
);

test('an additional saved connection requires every removal choice and an invalid mixture preserves both private and shared work', async () => {
  await checked(await propose('object', 'source', null));
  await independent();
  const state = await read(member);
  await checked(
    await propose(
      'relationship',
      'new-edge',
      {
        typeId: state.relationshipTypes[1].id,
        sourceId: 'source',
        targetId: 'other',
      },
      member,
    ),
  );
  await save('new-connection', member);
  const before = await read();
  const conflict = draftConflicts(before).find(
    (item) => item.kind === 'object' && item.id === 'source',
  );
  if (!conflict) throw new Error('Expected additional connection');
  expect(conflict.connections?.map((edge) => edge.id)).toEqual(['new-edge']);
  const body = {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    conflict,
    basis: conflictBasis(before, conflict),
    command: 'removal-choices',
  };
  expect(
    await (
      await post('resolve', {
        ...body,
        removalChoices: { object: 'proposed', 'relationship:new-edge': 'saved' },
      })
    ).json(),
  ).toEqual({ error: 'invalid_resolution' });
  expect(await read()).toEqual(before);
  await checked(
    await post('resolve', {
      ...body,
      removalChoices: { object: 'saved', 'relationship:new-edge': 'proposed' },
    }),
  );
  const after = await read();
  expect(after.draft.changes.map((change) => change.id)).toEqual(['independent']);
  expect(after.draft.relationships?.map((change) => change.id)).toEqual(['new-edge']);
  await save('keep-object-remove-new-edge');
  const final = await read();
  expect(final.objects.map((object) => object.id)).toEqual([
    'independent',
    'other',
    'source',
    'target',
  ]);
  expect(final.relationships.map((edge) => edge.id)).toEqual(['edge']);
});

test.each(['objectType', 'relationshipType'] as const)(
  '%s discard review retains dependent proposals as explicit type conflicts, and confirmation checks the whole plan',
  async (kind) => {
    const state = await read();
    await checked(
      await propose(kind, 'private-type', {
        name: 'Egen typ',
        description: '',

        ...(kind === 'relationshipType'
          ? { forwardLabel: 'binder', reverseLabel: 'hör till' }
          : {}),
      }),
    );
    await checked(
      await propose(
        kind === 'objectType' ? 'object' : 'relationship',
        'dependent',
        kind === 'objectType'
          ? { typeId: 'private-type', name: 'Beroende förslag' }
          : {
              typeId: 'private-type',
              sourceId: 'source',
              targetId: 'target',
            },
      ),
    );
    await independent();
    const before = await read();
    const historyBefore = await history();
    const body = {
      version: before.draft.version,
      contentVersion: state.contentVersion,
      kind,
      id: 'private-type',
    };
    const { plan } = await checked(await post('discard-review', body));
    expect(plan).toEqual({
      removed: [`${kind === 'objectType' ? 'Objekttyp' : 'Sambandstyp'}-private-type`],
      affected: [
        {
          key: `${kind === 'objectType' ? 'object' : 'relationship'}-dependent`,
          reason: kind === 'objectType' ? 'Objekttypen saknas.' : 'Sambandstypen saknas.',
        },
      ],
    });
    expect(await read()).toEqual(before);
    expect(
      await (
        await post('discard-review', {
          ...body,
          confirmation: { removed: plan.removed, affected: [] },
        })
      ).json(),
    ).toEqual({ error: 'draft_conflict' });
    expect(await read()).toEqual(before);
    await checked(await post('discard-review', { ...body, confirmation: plan }));
    const after = await read();
    expect(draftConflicts(after)).toMatchObject([
      { kind: kind === 'objectType' ? 'object' : 'relationship', id: 'dependent', type: null },
    ]);
    expect(after.draft.changes.find((change) => change.id === 'independent')).toEqual(
      before.draft.changes.find((change) => change.id === 'independent'),
    );
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(await history()).toEqual(historyBefore);
  },
);

test('discard validation rejects nonexistent references and malformed kinds while cancellation and a stale plan keep the complete draft', async () => {
  await independent();
  const before = await read();
  const body = { version: before.draft.version, contentVersion: before.contentVersion };
  for (const [reference, error] of [
    [{ kind: 'object', id: 12 }, 'invalid_request'],
    [{ kind: 'invented', id: 'independent' }, 'invalid_request'],
    [{ kind: 'object', id: 'missing' }, 'draft_conflict'],
  ] as const) {
    expect(await (await post('discard-change', { ...body, ...reference })).json()).toEqual({
      error,
    });
    expect(await read()).toEqual(before);
  }
  const { plan } = await checked(await post('discard-review', { ...body, kind: 'all' }));
  expect(plan).toEqual({ removed: ['object-independent'], affected: [] });
  expect(await read()).toEqual(before);
  await checked(
    await propose('object', 'later', {
      typeId: before.types[0].id,
      name: 'Senare arbete',
    }),
  );
  const current = await read();
  expect(
    await (
      await post('discard-review', {
        version: current.draft.version,
        kind: 'all',
        confirmation: plan,
      })
    ).json(),
  ).toEqual({ error: 'draft_conflict' });
  expect(await read()).toEqual(current);
  const fresh = await checked(
    await post('discard-review', { version: current.draft.version, kind: 'all' }),
  );
  await checked(
    await post('discard-review', {
      version: current.draft.version,
      kind: 'all',
      confirmation: fresh.plan,
    }),
  );
  expect((await read()).draft.changes).toEqual([]);
  expect((await read()).objects).toEqual(before.objects);
});

test.each([
  ['objectType', false],
  ['objectType', true],
  ['relationshipType', false],
  ['relationshipType', true],
] as const)(
  'permanent %s erasure retains individual property corrections while replacing removed type references: %s',
  async (kind, independentChange) => {
    for (const id of ['former-type', 'current-type']) {
      await checked(
        await propose(kind, id, {
          name: id === 'former-type' ? 'Tidigare typ' : 'Nuvarande typ',
          description: '',
          ...(kind === 'relationshipType'
            ? { forwardLabel: 'binder', reverseLabel: 'hör till' }
            : {}),
        }),
      );
    }
    await save('define-erasure-types');
    const valueKind = kind === 'objectType' ? 'object' : 'relationship';
    const id = kind === 'objectType' ? 'source' : 'edge';
    await checked(
      await propose(valueKind, id, {
        typeId: 'former-type',

        properties: [{ id: 'serial', label: 'serial', kind: 'text', value: 'ERASE-OLD-VALUE' }],
      }),
    );
    await save('historical-value');
    await checked(
      await propose(valueKind, id, {
        ...(independentChange
          ? kind === 'objectType'
            ? { name: 'Mitt oberoende namn' }
            : { lifecycle: 'ended' }
          : {}),
        properties: [{ id: 'serial', label: 'serial', kind: 'text', value: 'ERASE-PRIVATE-VALUE' }],
      }),
    );
    await independent();
    await checked(await propose(valueKind, id, { typeId: 'current-type' }, member));
    await save('newer-current-meaning', member);
    const before = await read();
    const memberBefore = await read(member);
    const selection = [{ kind, id: 'former-type' }];
    const householdPath = path.replace('/map', '');
    const review = await checked(
      await owner.json(`${householdPath}/erasure/review`, { selection }),
    );
    expect(review.objects).toEqual([]);
    expect(review.relationships).toEqual([]);
    expect(review.privateChanges).toBe(1);
    expect(await read()).toEqual(before);
    expect(await read(member)).toEqual(memberBefore);
    const erased = await checked(
      await owner.json(`${householdPath}/erasure/execute`, {
        selection,
        token: review.token,
        operationId: 'erase-former-meaning',
        confirmation: 'RADERA PERMANENT',
      }),
    );
    expect(erased).toMatchObject({
      status: { phase: 'completed', operationId: 'erase-former-meaning' },
    });
    const after = await read();
    expect(after.contentVersion).toBe(before.contentVersion + 1);
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(after.draft.changes.find((change) => change.id === 'independent')).toEqual(
      before.draft.changes.find((change) => change.id === 'independent'),
    );
    const change = (kind === 'objectType' ? after.draft.changes : after.draft.relationships)?.find(
      (change) => change.id === id,
    );
    expect(change).toMatchObject({
      before: { typeId: 'current-type' },
      after: {
        typeId: 'current-type',
        properties: [{ id: 'serial', label: 'serial', kind: 'text', value: 'ERASE-PRIVATE-VALUE' }],
      },
      type: { id: 'current-type' },
    });
    if (independentChange)
      expect(change?.after).toMatchObject(
        kind === 'objectType' ? { name: 'Mitt oberoende namn' } : { lifecycle: 'ended' },
      );
    expect((await read(member)).draft).toEqual(memberBefore.draft);
    const exported = await checked(await owner.json(`${householdPath}/exports`, {}), 201);
    const archive = await owner.request(`${householdPath}/exports/${exported.id}`);
    expect(archive.status).toBe(200);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const exportedContent = Buffer.from(files['content.json']).toString();
    expect(exportedContent).not.toContain('former-type');
    expect(exportedContent).toContain('ERASE-OLD-VALUE');
    expect(exportedContent).toContain('ERASE-PRIVATE-VALUE');
    // Read the household history through its normal route as well: erased
    // type definitions and field values cannot remain in readable receipts.
    const retainedHistory = await history();
    expect(JSON.stringify(retainedHistory)).not.toContain('former-type');
    expect(JSON.stringify(retainedHistory)).not.toContain('ERASE-OLD-VALUE');
  },
);
