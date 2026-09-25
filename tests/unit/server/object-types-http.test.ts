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
const fields = [
  { id: 'text', name: 'Anteckning', description: '', kind: 'text' },
  { id: 'number', name: 'Effekt', description: '', kind: 'number' },
  { id: 'date', name: 'Datum', description: '', kind: 'date' },
  { id: 'boolean', name: 'Batteri', description: '', kind: 'boolean' },
];
const definition = { name: 'Solcellsanläggning', description: 'Elproduktion', fields };
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
  customValues: unknown = undefined,
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
      value: { typeId: 'solar', name: 'Paneler', description: '', customValues },
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

test('invalid type definitions and malformed values do not change the private draft', async () => {
  const unchanged = await read();
  for (const value of [
    'not a definition',
    [],
    { ...definition, name: null },
    { ...definition, name: ' ' },
    { ...definition, name: 'x'.repeat(201) },
    { ...definition, description: null },
    { ...definition, description: 'x'.repeat(2001) },
    { ...definition, fields: null },
    {
      ...definition,
      fields: Array.from({ length: 101 }, (_, i) => ({ ...fields[0], id: String(i) })),
    },
    ...[
      null,
      {},
      { ...fields[0], id: '' },
      { ...fields[0], id: 'a'.repeat(129) },
      { ...fields[0], name: null },
      { ...fields[0], name: ' ' },
      { ...fields[0], name: 'x'.repeat(201) },
      { ...fields[0], description: null },
      { ...fields[0], description: 'x'.repeat(2001) },
      { ...fields[0], kind: 'money' },
      { ...fields[0], id: '__proto__' },
      { ...fields[0], id: 'constructor' },
    ].map((field) => ({ ...definition, fields: [field] })),
    { ...definition, fields: [fields[0], fields[0]] },
  ]) {
    const response = await define(value);
    expect(response.status(), JSON.stringify(value)).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_type_definition' });
    expect(await read()).toEqual(unchanged);
  }
  for (const id of [null, 'bad id'])
    expect(
      (
        await post('object-type', { version: 0, id, baseRevision: null, value: definition })
      ).status(),
    ).toBe(400);
  expect((await define()).status()).toBe(200);
  expect((await propose({})).status()).toBe(200);
  const draft = await read();
  for (const values of [
    null,
    [],
    'bad',
    { missing: 1 },
    { text: true },
    { text: 'x'.repeat(2001) },
    { number: '1' },
    { boolean: 0 },
    { date: true },
    { date: '2026-02-30' },
    { date: '2026-99-01' },
    { date: '2026-1-1' },
  ]) {
    const response = await propose(values);
    expect(response.status(), JSON.stringify(values)).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_custom_value' });
    expect(await read()).toEqual(draft);
  }
  expect(
    (
      await propose({ text: '', number: -1.25, date: '2024-02-29', boolean: false }, client, null, {
        typeRevision: 99,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await propose({ text: '', number: -1.25, date: '2024-02-29', boolean: false }, client, null, {
        typeRevision: 1,
      })
    ).status(),
  ).toBe(200);
  expect((await save('all-values')).status()).toBe(200);
  expect((await read()).objects[0].customValues).toEqual({
    text: '',
    number: -1.25,
    date: '2024-02-29',
    boolean: false,
  });
});

test('used kinds stay fixed across saved and private values and are rechecked at save', async () => {
  expect((await define()).status()).toBe(200);
  expect((await save('define')).status()).toBe(200);
  const changeKind = {
    ...definition,
    fields: fields.map((field) => (field.id === 'number' ? { ...field, kind: 'text' } : field)),
  };
  expect((await define(changeKind, 1)).status()).toBe(200);
  expect((await propose({ number: 'Tolv' })).status()).toBe(200);
  expect((await propose({ number: 12 }, other)).status()).toBe(200);
  const rejected = await save('late-use');
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toEqual({ error: 'field_kind_in_use' });
  expect((await read()).types.find((type) => type.id === 'solar')?.revision).toBe(1);
  expect((await read()).objects).toEqual([]);
  expect((await define(changeKind, 1)).status()).toBe(409);
  expect((await save('other-object', other)).status()).toBe(200);
  expect((await define(changeKind, 1)).status()).toBe(409);
  const removal = await define({ ...definition, fields: [] }, 1);
  expect(removal.status()).toBe(409);
  expect(await removal.json()).toEqual({ error: 'field_in_use' });
  expect((await post('discard', { version: (await read()).draft.version })).status()).toBe(200);
  const corrected = {
    ...definition,
    name: 'Solkraft',
    fields: fields.map((field) => ({
      ...field,
      name: `${field.name} rättad`,
      description: 'Förklaring',
    })),
  };
  expect((await define(corrected, 1)).status()).toBe(200);
  expect((await save('rename')).status()).toBe(200);
  expect((await read()).objects[0].customValues).toEqual({ number: 12 });
  const unusedKind = {
    ...corrected,
    fields: corrected.fields.map((field) =>
      field.id === 'text' ? { ...field, kind: 'boolean' } : field,
    ),
  };
  expect((await define(unusedKind, 2)).status()).toBe(200);
  expect((await save('unused-kind')).status()).toBe(200);
  expect((await read()).types.find((type) => type.id === 'solar')?.fields?.[0].kind).toBe(
    'boolean',
  );
});

test.each(['create', 'update'])(
  'an unused field kind and dependent object %s save in one atomic change group',
  async (action) => {
    expect((await define()).status()).toBe(200);
    if (action === 'update') expect((await propose()).status()).toBe(200);
    expect((await save('initial')).status()).toBe(200);
    const changed = {
      ...definition,
      fields: fields.map((field) => (field.id === 'text' ? { ...field, kind: 'number' } : field)),
    };
    expect((await define(changed, 1)).status()).toBe(200);
    expect((await propose({ text: 12 }, client, action === 'update' ? 1 : null)).status()).toBe(
      200,
    );
    const response = await save('definition-and-object');
    expect(response.status()).toBe(200);
    const { receipt } = await response.json();
    expect(receipt.objectTypes[0]).toMatchObject({
      before: { revision: 1 },
      after: { revision: 2 },
    });
    expect(receipt.objectTypes[0].before.fields[0]).toMatchObject({ id: 'text', kind: 'text' });
    expect(receipt.objectTypes[0].after.fields[0]).toMatchObject({ id: 'text', kind: 'number' });
    expect(receipt.changes[0].after.customValues).toEqual({ text: 12 });
    const state = await read();
    expect(state.objects[0].customValues).toEqual({ text: 12 });
    expect(state.types.find((type) => type.id === 'solar')?.fields?.[0].kind).toBe('number');
    expect(state.draft.changes).toEqual([]);
    expect(state.draft.objectTypes).toBeUndefined();
    const { history } = await (await client.get(`${path}/history`)).json();
    expect(history).toHaveLength(2);
    expect(history[1]).toEqual(receipt);
  },
);

test.each(['saved', 'proposed'])(
  'values using a %s field kind cannot be reinterpreted in the same private draft',
  async (definitionState) => {
    expect((await define()).status()).toBe(200);
    if (definitionState === 'saved') expect((await save('initial')).status()).toBe(200);
    expect((await propose({ text: '2026-09-24' })).status()).toBe(200);
    const before = await read();
    const changed = {
      ...definition,
      fields: fields.map((field) => (field.id === 'text' ? { ...field, kind: 'date' } : field)),
    };
    const response = await define(changed, definitionState === 'saved' ? 1 : null);
    expect(response.status()).toBe(409);
    expect(await response.json()).toEqual({ error: 'field_kind_in_use' });
    expect(await read()).toEqual(before);
  },
);

test('definition conflict choices preserve atomic history and update dependent object snapshots', async () => {
  expect((await define()).status()).toBe(200);
  expect((await propose({ boolean: false })).status()).toBe(200);
  expect(
    (await define({ ...definition, description: 'Rättad före första sparandet' })).status(),
  ).toBe(200);
  expect((await save('initial')).status()).toBe(200);
  expect((await define({ ...definition, name: 'Eget namn' }, 1)).status()).toBe(200);
  expect((await propose({ boolean: true }, client, 1)).status()).toBe(200);
  expect((await define({ ...definition, name: 'Annans namn' }, 1, other)).status()).toBe(200);
  expect((await save('other-definition', other)).status()).toBe(200);
  expect((await save('stale')).status()).toBe(409);
  const state = await read();
  const current = state.types.find((type) => type.id === 'solar');
  const conflict = { kind: 'objectType', id: 'solar', current };
  expect(
    (await post('resolve', { version: state.draft.version, choice: 'saved', conflict })).status(),
  ).toBe(200);
  expect((await read()).draft.objectTypes).toBeUndefined();
  expect((await read()).draft.changes[0].type.name).toBe('Annans namn');
  expect((await save('chosen')).status()).toBe(200);
  expect((await read()).objects[0].customValues).toEqual({ boolean: true });
  expect((await define({ ...definition, name: 'Mitt namn igen' }, 2)).status()).toBe(200);
  expect((await define({ ...definition, name: 'Annans andra namn' }, 2, other)).status()).toBe(200);
  expect((await save('other-again', other)).status()).toBe(200);
  const latest = await read();
  expect(
    (
      await post('resolve', {
        version: latest.draft.version,
        choice: 'proposed',
        conflict: { ...conflict, current: latest.types.find((type) => type.id === 'solar') },
      })
    ).status(),
  ).toBe(200);
  expect((await save('rebased')).status()).toBe(200);
  expect((await read()).types.find((type) => type.id === 'solar')?.revision).toBe(4);
  const { history } = await (await client.get(`${path}/history`)).json();
  expect(history.at(-1).objectTypes[0].before.name).toBe('Annans andra namn');
  expect(history.at(-1).objectTypes[0].after.name).toBe('Mitt namn igen');
});

test.each([false, true])(
  'choosing a type proposal preserves independent definition corrections (new field: %s)',
  async (addField) => {
    expect((await define()).status()).toBe(200);
    expect((await save('initial')).status()).toBe(200);
    const mine = {
      ...definition,
      name: 'Solkraft',
      fields: fields.map((field) =>
        field.id === 'text' ? { ...field, name: 'Egen anteckning' } : field,
      ),
    };
    expect((await define(mine, 1)).status()).toBe(200);
    expect((await propose({ text: 'På taket' })).status()).toBe(200);
    const theirs = {
      ...definition,
      description: 'Gemensam rättelse',
      fields: [
        ...fields.map((field) =>
          field.id === 'text' ? { ...field, description: 'Fältets förklaring' } : field,
        ),
        ...(addField ? [{ id: 'size', name: 'Storlek', description: '', kind: 'number' }] : []),
      ],
    };
    expect((await define(theirs, 1, other)).status()).toBe(200);
    expect((await save('other-definition', other)).status()).toBe(200);
    const state = await read();
    expect(
      (
        await post('resolve', {
          version: state.draft.version,
          choice: 'proposed',
          conflict: {
            kind: 'objectType',
            id: 'solar',
            current: state.types.find((type) => type.id === 'solar'),
          },
        })
      ).status(),
    ).toBe(200);
    expect((await save('resolved')).status()).toBe(200);
    const resolved = await read();
    expect(resolved.types.find((type) => type.id === 'solar')).toMatchObject({
      name: 'Solkraft',
      description: 'Gemensam rättelse',
      fields: [
        { ...fields[0], name: 'Egen anteckning', description: 'Fältets förklaring' },
        ...theirs.fields.slice(1),
      ],
    });
    expect(resolved.objects[0].customValues).toEqual({ text: 'På taket' });
    const { history } = await (await client.get(`${path}/history`)).json();
    expect(history.at(-1).objectTypes[0].before).toMatchObject(theirs);
    expect(history.at(-1).objectTypes[0].after).toEqual(
      resolved.types.find((type) => type.id === 'solar'),
    );
    expect(history.at(-1).changes[0].type).toEqual(history.at(-1).objectTypes[0].after);
  },
);

test('resolving independent added fields still enforces the definition size limit', async () => {
  const full = {
    ...definition,
    fields: Array.from({ length: 99 }, (_, index) => ({ ...fields[0], id: `field-${index}` })),
  };
  expect((await define(full)).status()).toBe(200);
  expect((await save('initial')).status()).toBe(200);
  expect(
    (await define({ ...full, fields: [...full.fields, { ...fields[0], id: 'mine' }] }, 1)).status(),
  ).toBe(200);
  expect(
    (
      await define({ ...full, fields: [...full.fields, { ...fields[0], id: 'theirs' }] }, 1, other)
    ).status(),
  ).toBe(200);
  expect((await save('other-definition', other)).status()).toBe(200);
  const before = await read();
  const response = await post('resolve', {
    version: before.draft.version,
    choice: 'proposed',
    conflict: {
      kind: 'objectType',
      id: 'solar',
      current: before.types.find((type) => type.id === 'solar'),
    },
  });
  expect(response.status()).toBe(400);
  expect(await response.json()).toEqual({ error: 'invalid_type_definition' });
  expect(await read()).toEqual(before);
});

test('overlapping object corrections retain independently changed custom values', async () => {
  await define();
  await propose({ text: 'Först', number: 12, boolean: false });
  await save('initial');
  await propose({ text: 'Mitt', number: 12 }, client, 1);
  await propose({ text: 'Först', number: 14, date: '2026-09-01', boolean: false }, other, 1);
  await save('other', other);
  const state = await read();
  expect(
    (
      await post('resolve', {
        version: state.draft.version,
        choice: 'proposed',
        conflict: { kind: 'object', id: 'panels', current: state.objects[0] },
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.changes[0].after?.customValues).toEqual({
    text: 'Mitt',
    number: 14,
    date: '2026-09-01',
  });
  expect((await save('resolved')).status()).toBe(200);
});

test('definition writes roll back when a later object conflict rejects the same whole save', async () => {
  await define();
  await propose({ text: 'Först' });
  await save('initial');
  await define({ ...definition, name: 'Föreslaget namn' }, 1);
  await propose({ text: 'Mitt värde' }, client, 1);
  await propose({ text: 'Sparat av annan' }, other, 1);
  await save('other', other);
  const before = await read();
  const response = await save('rollback');
  expect(response.status()).toBe(409);
  expect(await response.json()).toEqual({ error: 'object_conflict' });
  expect(await read()).toEqual(before);
  expect((await read()).types.find((type) => type.id === 'solar')?.name).toBe('Solcellsanläggning');
  expect((await (await client.get(`${path}/history`)).json()).history).toHaveLength(2);
});
