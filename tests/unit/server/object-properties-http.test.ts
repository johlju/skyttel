import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import type { Property } from '../../../src/shared/properties.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let path: string;
const read = async (): Promise<MapState> => (await client.get(path)).json();
const post = (route: string, data: unknown) =>
  client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  path = `${installation.origin}/api/households/${household.id}/map`;
});
afterEach(async () => {
  await client.dispose();
  await installation.close();
});

test('ordered independent properties survive draft, atomic receipt and SQLite restart without label side effects', async () => {
  const state = await read();
  const properties: Property[] = [
    { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Objektets egen text' },
    { id: 'zero', label: 'Pris', kind: 'number', value: 0 },
    { id: 'no', label: 'Pris', kind: 'boolean', value: false },
    { id: 'ended', label: 'Slutdatum', kind: 'date', value: '2000-01-01' },
    { id: 'empty', label: 'Ofyllt', kind: 'number' },
    { id: 'untyped', label: 'Ofyllt' },
    { id: 'blank', label: 'Tom text', kind: 'text', value: '' },
    ...Array.from(
      { length: 105 },
      (_, index): Property => ({
        id: `extra-${index}`,
        label: 'Samma',
        kind: 'text',
        value: String(index).repeat(200),
      }),
    ),
  ];
  const value = { typeId: state.types[0].id, name: 'Cykeln', properties };
  expect(
    (await post('draft', { version: 0, id: 'bike', baseRevision: null, value })).status(),
  ).toBe(200);
  expect((await read()).objects).toEqual([]);
  expect((await read()).draft.changes[0].after?.properties).toEqual(properties);
  const response = await post('save', { version: 1, operationId: 'initial-properties' });
  expect(response.status(), await response.text()).toBe(200);
  const receipt: SaveReceipt = (await response.json()).receipt;
  expect(receipt.changes[0].after?.properties).toEqual(properties);
  client = await restartWithSession(client, () => installation.restart());
  const saved = (await read()).objects[0];
  expect(saved.properties).toEqual(properties);
  expect(saved.lifecycle).toBeUndefined();
  const changed = [...properties.slice(0, -2), { id: 'extra-104', label: 'Samma', kind: 'text' }];
  expect(
    (
      await post('draft', {
        version: 2,
        id: 'bike',
        baseRevision: saved.revision,
        value: { ...value, typeId: state.types[1].id, properties: changed },
      })
    ).status(),
  ).toBe(200);
  expect((await read()).objects[0]).toEqual(saved);
  expect((await read()).draft.changes[0].after?.properties).toEqual(changed);
  expect((await post('save', { version: 3, operationId: 'edited-properties' })).status()).toBe(200);
  client = await restartWithSession(client, () => installation.restart());
  expect((await read()).objects[0]).toMatchObject({
    id: 'bike',
    typeId: state.types[1].id,
    properties: changed,
  });
  const history = await (await client.get(`${path}/history`)).json();
  expect(history.history[0].changes[0].before.properties).toEqual(properties);
  expect(history.history[0].changes[0].after.properties).toEqual(changed);
});

test('invalid property edits leave all draft work intact and omitted properties retain their identities', async () => {
  const state = await read();
  const value = {
    typeId: state.types[0].id,
    name: 'Anteckningar',

    properties: [{ label: 'Antal', kind: 'number', value: 0 }, { label: 'Antal' }],
  };
  expect(
    (await post('draft', { version: 0, id: 'notes', baseRevision: null, value })).status(),
  ).toBe(200);
  const draft = (await read()).draft;
  const properties = draft.changes[0].after?.properties;
  expect(properties).toHaveLength(2);
  expect(properties?.[0].id).not.toBe(properties?.[1].id);
  for (const invalid of [
    null,
    [{ id: properties?.[0].id, label: 'Antal', kind: 'number', value: 'fel' }],
    [{ id: 'x', label: 'Datum', kind: 'date', value: '2026-02-30' }],
    [{ id: 'x', label: 'Inget slag', value: 0 }],
    [{ id: 'x', label: 'Fel slag', kind: 'currency', value: 'SEK' }],
    [
      { id: 'x', label: 'A' },
      { id: 'x', label: 'B' },
    ],
    [{ id: 'x', label: '  ' }],
  ]) {
    const response = await post('draft', {
      version: draft.version,
      id: 'notes',
      baseRevision: null,
      value: { ...value, properties: invalid },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_properties' });
    expect((await read()).draft).toEqual(draft);
  }
  expect(
    (
      await post('draft', {
        version: draft.version,
        id: 'notes',
        baseRevision: null,
        value: { typeId: state.types[1].id, name: 'Rättat namn' },
      })
    ).status(),
  ).toBe(200);
  expect((await read()).draft.changes[0].after?.properties).toEqual(properties);
});
