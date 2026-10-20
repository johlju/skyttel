import { afterEach, beforeEach, expect, test } from 'vitest';
import { draftConflicts } from '../../../src/shared/draft-conflicts.js';
import type { MapState, ObjectValue, SaveReceipt } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
const post = (route: string, body: unknown, actor = client) => actor.json(`${path}/${route}`, body);
async function object(update: Partial<ObjectValue>, actor = client, id = 'bike') {
  const state = await read(actor);
  const before = state.objects.find((item) => item.id === id);
  return post(
    'draft',
    {
      version: state.draft.version,
      id,
      baseRevision: before?.revision ?? null,
      value: { typeId: 'cycle', name: 'Alex blå cykel', ...before, ...update },
    },
    actor,
  );
}
async function save(operationId: string, actor = client): Promise<SaveReceipt> {
  const response = await post(
    'save',
    { version: (await read(actor)).draft.version, operationId },
    actor,
  );
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body.receipt;
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
  return { actor, userId: user.id };
}
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
  for (const [id, name] of [
    ['cycle', 'Cykel'],
    ['vehicle', 'Fordon'],
  ]) {
    expect(
      (
        await post('object-type', {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: {
            name,
            description: '',
          },
        })
      ).status,
    ).toBe(200);
  }
  expect(
    (
      await object({
        properties: [
          { id: 'number', label: 'number', kind: 'number', value: 5 },
          { id: 'insured', label: 'insured', kind: 'boolean', value: false },
          { id: 'memo', label: 'Beskrivning', kind: 'text', value: 'Behåll oberoende av typ' },
          { id: 'empty', label: 'Tom uppgift' },
        ],
      })
    ).status,
  ).toBe(200);
  expect((await object({ name: 'Garaget' }, client, 'garage')).status).toBe(200);
  const state = await read();
  expect(
    (
      await post('relationship', {
        version: state.draft.version,
        id: 'parking',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes[0].id,
          sourceId: 'bike',
          targetId: 'garage',
        },
      })
    ).status,
  ).toBe(200);
  await save('setup');
});
afterEach(() => fixture.close());

test('a type change preserves stable property IDs and independent saved name and value edits', async () => {
  const { actor } = await member();
  const original = await read();
  const properties = original.objects.find(({ id }) => id === 'bike')?.properties;
  await object({ typeId: 'vehicle' });
  await object(
    {
      name: 'Rättat namn',
      properties: properties?.map((p) =>
        p.id === 'number' && p.kind === 'number' ? { ...p, value: 7 } : p,
      ),
    },
    actor,
  );
  await save('other', actor);
  const state = await read();
  expect((await post('save', { version: state.draft.version, operationId: 'stale' })).status).toBe(
    409,
  );
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: draftConflicts(state)[0],
      })
    ).status,
  ).toBe(200);
  const resolved = (await read()).draft.changes[0].after;
  expect(resolved).toMatchObject({
    name: 'Rättat namn',
    typeId: 'vehicle',
    properties: properties?.map((p) =>
      p.id === 'number' && p.kind === 'number' ? { ...p, value: 7 } : p,
    ),
  });
  await save('chosen');
  expect((await read()).relationships).toEqual(original.relationships);
  expect((await read()).objects.find(({ id }) => id === 'bike')?.properties).toEqual(
    resolved?.properties,
  );
});
test('type-change history retains original and selected definition meanings through catalog renames', async () => {
  await object({ typeId: 'vehicle' });
  const { actor } = await member();
  const source = (await read(actor)).types.find(({ id }) => id === 'cycle');
  expect(
    (
      await post(
        'object-type',
        {
          version: 0,
          id: 'cycle',
          baseRevision: source?.revision,
          value: { name: 'Ny benämning', description: 'Ny förklaring' },
        },
        actor,
      )
    ).status,
  ).toBe(200);
  await save('rename', actor);
  expect((await read()).draft.changes[0].beforeType?.name).toBe('Cykel');
  await save('type-change');
  const { history } = await (await client.request(`${path}/history`)).json();
  expect(history[0].changes[0].beforeType.name).toBe('Ny benämning');
  expect(history[0].changes[0].type.name).toBe('Fordon');
});
test('invalid properties and stale object, definition and draft versions preserve the entire draft', async () => {
  await object({ name: 'Oberoende förslag' }, client, 'garage');
  const before = await read();
  const value = { ...before.objects.find(({ id }) => id === 'bike'), typeId: 'vehicle' };
  expect(
    (
      await object({
        ...value,
        properties: [{ id: 'bad', label: 'Datum', kind: 'date', value: '2026-02-30' }],
      })
    ).status,
  ).toBe(400);
  for (const stale of [{ baseRevision: 0 }, { typeRevision: 0 }, { version: 0 }]) {
    expect(
      (
        await post('draft', {
          version: before.draft.version,
          id: 'bike',
          baseRevision: 1,
          typeRevision: 1,
          value,
          ...stale,
        })
      ).status,
    ).toBe(409);
    expect(await read()).toEqual(before);
  }
  expect((await object({ typeId: 'vehicle' })).status).toBe(200);
  const { actor } = await member();
  await post(
    'object-type',
    {
      version: 0,
      id: 'vehicle',
      baseRevision: 1,
      value: { name: 'Fordon', description: 'Ny förklaring' },
    },
    actor,
  );
  await save('changed-type', actor);
  const current = await read();
  expect(
    (await post('save', { version: current.draft.version, operationId: 'stale-definition' }))
      .status,
  ).toBe(409);
  expect(await read()).toEqual(current);
});
test('type proposals and conflict choices reject anonymous, foreign and revoked members', async () => {
  await object({ typeId: 'vehicle' });
  await save('change-type');
  const { actor, userId } = await member();
  await object({ typeId: 'cycle' }, actor);
  await object({ name: 'Nytt namn' });
  await save('name');
  const state = await read(actor);
  const conflict = draftConflicts(state)[0];
  const mutations = [
    [
      'draft',
      {
        version: state.draft.version,
        id: 'bike',
        baseRevision: 2,
        value: { typeId: 'cycle', name: 'Otillåtet' },
      },
    ],
    ['resolve', { version: state.draft.version, conflict, choice: 'proposed' }],
  ] as const;
  const anonymous = fixture.client();
  fixture.setSubject('outsider');
  const outsider = fixture.client();
  await outsider.signIn();
  await client.json(`${path.replace('/map', '')}/members/${userId}/revoke`, {});
  const before = await read();
  for (const [denied, status] of [
    [anonymous, 401],
    [outsider, 403],
    [actor, 403],
  ] as const)
    for (const [route, body] of mutations)
      expect((await post(route, body, denied)).status).toBe(status);
  expect(await read()).toEqual(before);
});
