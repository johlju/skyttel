import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState, ObjectValue } from '../../../src/shared/map.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let path: string;
let contract: ObjectValue;
const read = async (context = client): Promise<MapState> => (await context.get(path)).json();
const post = (route: string, data: unknown, context = client) =>
  context.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
const propose = async (properties: unknown) =>
  post('draft', {
    version: (await read()).draft.version,
    id: 'credit',
    baseRevision: null,
    value: { ...contract, properties },
  });

beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  path = `${installation.origin}/api/households/${household.id}/map`;
  const type = (await read()).types.find((item) => item.name === 'Kreditavtal');
  expect(type).toBeDefined();
  contract = { typeId: type?.id ?? '', name: 'Exempelkredit' };
});
afterEach(async () => {
  await client.dispose();
  await installation.close();
});

test('contract facts are ordinary ordered properties and date labels never change status', async () => {
  const properties = [
    { id: 'debt', label: 'Skuld', kind: 'number', value: 12500 },
    { id: 'currency', label: 'Valuta', kind: 'text', value: 'SEK' },
    { id: 'date', label: 'Slutdatum', kind: 'date', value: '2000-01-01' },
    { id: 'certainty', label: 'Osäkert uppgivet', kind: 'boolean', value: true },
    { id: 'none', label: 'Kreditutrymme' },
  ];
  expect((await propose(properties)).status()).toBe(200);
  const response = await post('save', {
    version: (await read()).draft.version,
    operationId: 'initial',
  });
  expect(response.status()).toBe(200);
  const { receipt } = await response.json();
  client = await restartWithSession(client, () => installation.restart());
  expect((await read()).objects[0]).toMatchObject({ ...contract, properties });
  expect((await read()).objects[0].lifecycle).toBeUndefined();
  expect(receipt.changes[0].after.properties).toEqual(properties);
  expect((await (await client.get(`${path}/history`)).json()).history[0]).toEqual(receipt);
});
test('obsolete fixed facts and descriptions reject atomically while independent draft work remains', async () => {
  expect(
    (await propose([{ id: 'note', label: 'Anteckning', kind: 'text', value: 'Bevara' }])).status(),
  ).toBe(200);
  const before = await read();
  for (const legacy of [
    { description: 'Text' },
    { financialFacts: { debt: { knowledge: 'known', value: '12' } } },
    { customValues: { note: 'Text' } },
  ]) {
    expect(
      (
        await post('draft', {
          version: before.draft.version,
          id: 'credit',
          baseRevision: null,
          value: { ...contract, ...legacy },
        })
      ).status(),
    ).toBe(400);
    expect(await read()).toEqual(before);
  }
});
