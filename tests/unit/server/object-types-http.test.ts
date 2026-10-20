import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let other: APIRequestContext;
let path: string;
const read = async (actor = client): Promise<MapState> => (await actor.get(path)).json();
const post = (route: string, data: unknown, actor = client) =>
  actor.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
const definition = { name: 'Solcellsanläggning', description: 'Elproduktion' };
const define = async (
  value: unknown = definition,
  baseRevision: number | null = null,
  actor = client,
) =>
  post(
    'object-type',
    { version: (await read(actor)).draft.version, id: 'solar', baseRevision, value },
    actor,
  );
const propose = async (
  properties: unknown = [],
  actor = client,
  revision: number | null = null,
  extra = {},
) =>
  post(
    'draft',
    {
      version: (await read(actor)).draft.version,
      id: 'panels',
      baseRevision: revision,
      value: { typeId: 'solar', name: 'Paneler', properties },
      ...extra,
    },
    actor,
  );
const save = async (operationId: string, actor = client) =>
  post('save', { version: (await read(actor)).draft.version, operationId }, actor);

beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  other = await request.newContext();
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  path = `${installation.origin}/api/households/${household.id}/map`;
  installation.setIdentity(robin);
  await signIn(other, installation.origin);
  const { user } = await (await other.get(`${installation.origin}/api/bootstrap`)).json();
  const { code } = await (
    await client.post(`${path.replace('/map', '')}/invitations`, {
      headers: { origin: installation.origin },
      data: { userId: user.id },
    })
  ).json();
  await other.post(`${installation.origin}/api/invitations/accept`, {
    headers: { origin: installation.origin },
    data: { code },
  });
});
afterEach(async () => {
  await client.dispose();
  await other.dispose();
  await installation.close();
});

test('type definitions reject obsolete field layouts and invalid meaning without changing the draft', async () => {
  const before = await read();
  for (const value of [
    'bad',
    [],
    { ...definition, name: ' ' },
    { ...definition, description: null },
    { ...definition, name: 'x'.repeat(201) },
    { ...definition, description: 'x'.repeat(2001) },
    { ...definition, fields: [] },
    { ...definition, sections: [] },
    { ...definition, builtins: [] },
    { ...definition, propertyOrder: [] },
  ]) {
    expect((await define(value)).status()).toBe(400);
    expect(await read()).toEqual(before);
  }
  expect((await define()).status()).toBe(200);
  expect(
    (
      await propose([
        { id: 'zero', label: 'Pris', kind: 'number', value: 0 },
        { id: 'no', label: 'Pris', kind: 'boolean', value: false },
      ])
    ).status(),
  ).toBe(200);
  expect((await save('definition-and-object')).status()).toBe(200);
  expect((await read()).objects[0].properties).toEqual([
    { id: 'zero', label: 'Pris', kind: 'number', value: 0 },
    { id: 'no', label: 'Pris', kind: 'boolean', value: false },
  ]);
});

test('definition conflict choices preserve atomic history and dependent object snapshots', async () => {
  await define();
  await propose([{ id: 'answer', label: 'Batteri', kind: 'boolean', value: false }]);
  await save('initial');
  await define({ ...definition, name: 'Eget namn' }, 1);
  await propose([{ id: 'answer', label: 'Batteri', kind: 'boolean', value: true }], client, 1);
  await define({ ...definition, name: 'Annans namn' }, 1, other);
  await save('other-definition', other);
  expect((await save('stale')).status()).toBe(409);
  const state = await read();
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'saved',
        conflict: {
          kind: 'objectType',
          id: 'solar',
          current: state.types.find(({ id }) => id === 'solar'),
        },
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.changes[0].type.name).toBe('Annans namn');
  expect((await save('chosen')).status()).toBe(200);
  expect((await read()).objects[0].properties).toEqual([
    { id: 'answer', label: 'Batteri', kind: 'boolean', value: true },
  ]);
  const { history } = await (await client.get(`${path}/history`)).json();
  expect(history[0].changes[0].type.name).toBe('Annans namn');
});

test('choosing a type proposal preserves an independent saved explanation', async () => {
  await define();
  await save('initial');
  await define({ ...definition, name: 'Solkraft' }, 1);
  await propose([{ id: 'note', label: 'Anteckning', kind: 'text', value: 'På taket' }]);
  await define({ ...definition, description: 'Gemensam rättelse' }, 1, other);
  await save('other', other);
  const state = await read();
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: {
          kind: 'objectType',
          id: 'solar',
          current: state.types.find(({ id }) => id === 'solar'),
        },
      })
    ).status(),
  ).toBe(200);
  expect((await save('resolved')).status()).toBe(200);
  expect((await read()).types.find(({ id }) => id === 'solar')).toMatchObject({
    name: 'Solkraft',
    description: 'Gemensam rättelse',
  });
  expect((await read()).objects[0].properties).toEqual([
    { id: 'note', label: 'Anteckning', kind: 'text', value: 'På taket' },
  ]);
});

test('definition writes roll back when a later object conflict rejects the same whole save', async () => {
  const property = (value: string) => [{ id: 'note', label: 'Anteckning', kind: 'text', value }];
  await define();
  await propose(property('Först'));
  await save('initial');
  await define({ ...definition, name: 'Föreslaget namn' }, 1);
  await propose(property('Mitt'), client, 1);
  await propose(property('Sparat av annan'), other, 1);
  await save('other', other);
  const before = await read();
  expect((await save('rollback')).status()).toBe(409);
  expect(await read()).toEqual(before);
  expect((await read()).types.find(({ id }) => id === 'solar')?.name).toBe('Solcellsanläggning');
  expect((await (await client.get(`${path}/history`)).json()).history).toHaveLength(2);
});
