import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let member: ReturnType<typeof fixture.client>;
let path: string;
const definition = {
  name: 'Förvaring',
  description: 'Förvaringsplats',
  forwardLabel: 'förvaras i',
  reverseLabel: 'innehåller',
};
const read = async (actor = client): Promise<MapState> => (await actor.request(path)).json();
const post = (route: string, body: unknown, actor = client) => actor.json(`${path}/${route}`, body);
const define = async (
  value: unknown = definition,
  baseRevision: number | null = null,
  actor = client,
  id = 'storage',
) =>
  post(
    'relationship-type',
    { version: (await read(actor)).draft.version, id, baseRevision, value },
    actor,
  );
const save = async (operationId: string, actor = client) =>
  post('save', { version: (await read(actor)).draft.version, operationId }, actor);
const edge = async (baseRevision: number | null = null, actor = client, extra = {}) =>
  post(
    'relationship',
    {
      version: (await read(actor)).draft.version,
      id: 'edge',
      baseRevision,
      value: { typeId: 'storage', sourceId: 'bike', targetId: 'garage', knowledge: 'known' },
      ...extra,
    },
    actor,
  );

beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  member = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
  fixture.setSubject('member');
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  const { code } = await (
    await client.json(`/api/households/${household.id}/invitations`, { userId: user.id })
  ).json();
  await member.json('/api/invitations/accept', { code });
  for (const id of ['bike', 'garage']) {
    const state = await read();
    await post('draft', {
      id,
      version: state.draft.version,
      baseRevision: null,
      value: { typeId: state.types[0].id, name: id, description: '' },
    });
  }
  await save('objects');
});
afterEach(() => fixture.close());

test('type and label validation keeps the private draft unchanged and forbids fields', async () => {
  const unchanged = await read();
  for (const value of [
    'not a definition',
    [],
    {},
    { ...definition, fields: [] },
    ...['name', 'forwardLabel', 'reverseLabel'].flatMap((key) =>
      [null, ' ', 'x'.repeat(201)].map((invalid) => ({ ...definition, [key]: invalid })),
    ),
    { ...definition, description: null },
    { ...definition, description: 'x'.repeat(2001) },
  ]) {
    const response = await define(value);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_relationship_type' });
  }
  for (const id of [null, 'bad id'])
    expect(
      (
        await post('relationship-type', {
          version: unchanged.draft.version,
          id,
          baseRevision: null,
          value: definition,
        })
      ).status,
    ).toBe(400);
  expect(await read()).toEqual(unchanged);
  expect((await define()).status).toBe(200);
  expect((await define(definition, 99)).status).toBe(409);
  expect((await edge(null, client, { typeRevision: 99 })).status).toBe(409);
  expect((await edge(null, client, { typeRevision: 1 })).status).toBe(200);
  expect((await define({ ...definition, reverseLabel: 'rymmer' })).status).toBe(200);
  expect((await read()).draft.relationships?.[0].type.reverseLabel).toBe('rymmer');
  expect((await read(member)).relationshipTypes.some((type) => type.id === 'storage')).toBe(false);
  expect((await edge(null, member)).status).toBe(400);
  expect((await save('initial')).status).toBe(200);
  const state = await read(member);
  expect(state.relationships).toHaveLength(1);
  expect(state.relationshipTypes.find((type) => type.id === 'storage')).toMatchObject({
    ...definition,
    reverseLabel: 'rymmer',
  });
});

test('explicit type conflict choices preserve independent labels and refresh dependent relationship snapshots', async () => {
  await define();
  await edge();
  await save('initial');
  await define({ ...definition, name: 'Min förvaring' }, 1);
  await edge(1);
  await define({ ...definition, description: 'Ny förklaring', reverseLabel: 'rymmer' }, 1, member);
  await save('member-definition', member);
  const unchanged = await read();
  expect((await save('stale')).status).toBe(409);
  expect(await read()).toEqual(unchanged);
  const current = unchanged.relationshipTypes.find((type) => type.id === 'storage');
  const conflict = { kind: 'relationshipType', id: 'storage', current };
  expect(
    (await post('resolve', { version: unchanged.draft.version, conflict, choice: 'proposed' }))
      .status,
  ).toBe(200);
  expect((await read()).draft.relationshipTypes?.[0].after).toMatchObject({
    name: 'Min förvaring',
    description: 'Ny förklaring',
    reverseLabel: 'rymmer',
    revision: 3,
  });
  expect((await save('resolved')).status).toBe(200);
  await define({ ...definition, name: 'Mitt nästa namn' }, 3);
  await edge(2);
  await define({ ...definition, name: 'Medlemmens namn' }, 3, member);
  await save('member-next', member);
  const latest = await read();
  expect(
    (await post('resolve', { version: latest.draft.version, conflict, choice: 'saved' })).status,
  ).toBe(409);
  expect(
    (
      await post('resolve', {
        version: latest.draft.version,
        conflict: {
          ...conflict,
          current: latest.relationshipTypes.find((type) => type.id === 'storage'),
        },
        choice: 'saved',
      })
    ).status,
  ).toBe(200);
  expect((await read()).draft.relationshipTypes).toBeUndefined();
  expect((await read()).draft.relationships?.[0].type).toMatchObject({
    name: 'Medlemmens namn',
    revision: 4,
  });
  expect((await save('use-current')).status).toBe(200);
  const { history } = await (await client.request(`${path}/history`)).json();
  expect(history[3].relationshipTypes[0].before).toMatchObject({
    description: 'Ny förklaring',
    reverseLabel: 'rymmer',
    revision: 2,
  });
  expect(history[3].relationships[0].type).toMatchObject({
    name: 'Min förvaring',
    description: 'Ny förklaring',
    reverseLabel: 'rymmer',
    revision: 3,
  });
});

test('type writes roll back with duplicate edges and changed definitions require current approval', async () => {
  await define();
  await save('initial');
  await define({ ...definition, name: 'Privat namn' }, 1);
  await edge();
  await edge(null, member, { id: 'theirs' });
  await save('member-edge', member);
  const unchanged = await read();
  const failed = await save('duplicate');
  expect(failed.status).toBe(409);
  expect(await failed.json()).toEqual({ error: 'duplicate_relationship' });
  expect(await read()).toEqual(unchanged);
  await post('discard', { version: unchanged.draft.version });
  const type = (await read()).relationshipTypes.find((item) => item.id === 'storage');
  await edge(null, client, {
    id: 'reversed',
    value: { typeId: 'storage', sourceId: 'garage', targetId: 'bike', knowledge: 'known' },
  });
  await define({ ...definition, name: 'Aktuell betydelse' }, 1, member);
  await save('member-type', member);
  expect((await save('outdated-type')).status).toBe(409);
  const state = await read();
  const currentType = state.relationshipTypes.find((item) => item.id === 'storage');
  expect(currentType?.revision).not.toBe(type?.revision);
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        conflict: { kind: 'relationship', id: 'reversed', current: null, type: currentType },
        choice: 'proposed',
      })
    ).status,
  ).toBe(200);
  expect((await save('current-approved')).status).toBe(200);
  expect((await read()).relationships).toHaveLength(2);
});
