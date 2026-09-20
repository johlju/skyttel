import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let path: string;
let contract: { typeId: string; name: string; description: string };
const read = async (): Promise<MapState> => (await client.get(path)).json();
const post = (route: string, data: unknown) =>
  client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
const propose = async (financialFacts: unknown) =>
  post('draft', {
    version: (await read()).draft.version,
    id: 'credit',
    baseRevision: null,
    value: { ...contract, financialFacts },
  });

beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  await signIn(client, installation.origin);
  const { household } = await (await createHousehold(client, installation.origin)).json();
  path = `${installation.origin}/api/households/${household.id}/map`;
  const type = (await read()).types.find((item) => item.name === 'Kreditavtal');
  expect(type).toBeDefined();
  contract = { typeId: type?.id ?? '', name: 'Exempelkredit', description: '' };
});
afterEach(async () => {
  await client.dispose();
  await installation.close();
});

test('financial requests accept descriptive values, valid leap days and explicit uncertainty', async () => {
  const financialFacts = {
    price: { knowledge: 'known', value: '1 250,50' },
    currency: { knowledge: 'known', value: 'SEK' },
    paymentInterval: { knowledge: 'known', value: 'Varje månad' },
    startDate: { knowledge: 'known', value: '2024-02-29' },
    endDate: { knowledge: 'known', value: '2028-02-29' },
    terms: { knowledge: 'known', value: 'Tre månaders uppsägningstid.' },
    debt: { knowledge: 'uncertain', value: '12 500', reportedOn: '2026-09-01' },
    creditLimit: { knowledge: 'unknown', reportedOn: '2026-09-02' },
    usedCredit: { knowledge: 'none', reportedOn: '2026-09-03' },
  };
  expect((await propose(financialFacts)).status()).toBe(200);
  const saved = await post('save', {
    version: (await read()).draft.version,
    operationId: 'initial',
  });
  expect(saved.status()).toBe(200);
  expect((await read()).objects[0].financialFacts).toEqual(financialFacts);
});

test('invalid financial requests preserve the complete draft and optional facts stay absent', async () => {
  expect((await propose({})).status()).toBe(200);
  const before = await read();
  for (const financialFacts of [
    null,
    [],
    'unknown',
    12,
    { interest: { knowledge: 'known', value: '3%' } },
    { debt: null },
    { debt: [] },
    { debt: 12 },
    { debt: { knowledge: 'guessed', value: '12' } },
    { debt: { knowledge: 'known', value: '' } },
    { debt: { knowledge: 'known', value: ' ' } },
    { debt: { knowledge: 'known', value: 12 } },
    { debt: { knowledge: 'known', value: '1'.repeat(201) } },
    { terms: { knowledge: 'known', value: 'x'.repeat(2001) } },
    { debt: { knowledge: 'unknown', value: '12' } },
    { debt: { knowledge: 'none', extra: 'unsupported' } },
    { price: { knowledge: 'known', value: '12', reportedOn: '2026-09-20' } },
    { debt: { knowledge: 'unknown', reportedOn: 2026 } },
    { debt: { knowledge: 'unknown', reportedOn: '2026-09-32' } },
    { startDate: { knowledge: 'known', value: '20/09/2026' } },
    { endDate: { knowledge: 'uncertain', value: '2026-02-29' } },
  ]) {
    const rejected = await propose(financialFacts);
    expect(rejected.status(), JSON.stringify(financialFacts)).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'invalid_request' });
    expect(await read()).toEqual(before);
  }
  expect(
    (await post('save', { version: before.draft.version, operationId: 'empty' })).status(),
  ).toBe(200);
  expect((await read()).objects[0]).not.toHaveProperty('financialFacts');
});
