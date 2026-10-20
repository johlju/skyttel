import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { SaveReceipt } from '../../../src/shared/map.js';
import type { Property } from '../../../src/shared/properties.js';
import { restartWithSession } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';
import { createRelationshipFixture } from '../../support/relationship-fixture.js';

let installation: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let fixture: Awaited<ReturnType<typeof createRelationshipFixture>>;
beforeEach(async () => {
  installation = await createInstallation();
  client = await request.newContext();
  fixture = await createRelationshipFixture(client, installation.origin);
});
afterEach(async () => {
  await client.dispose();
  await installation.close();
});

test('relationship properties preserve ordered identities, empty values and type independence through atomic save, history and restart', async () => {
  const { post, read } = fixture;
  const initial = await read();
  const properties: Property[] = [
    { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Cykeln lånas på helger' },
    { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
    { id: 'no', label: 'Samma', kind: 'boolean', value: false },
    { id: 'date', label: 'Slutdatum', kind: 'date', value: '2000-01-01' },
    { id: 'empty', label: 'Tomt', kind: 'number' },
    { id: 'untyped', label: 'Tomt' },
    { id: 'blank', label: 'Okänt', kind: 'text', value: '' },
    ...Array.from(
      { length: 105 },
      (_, index): Property => ({
        id: `extra-${index}`,
        label: 'Extra',
        kind: 'text',
        value: String(index).repeat(200),
      }),
    ),
  ];
  const value = {
    typeId: initial.relationshipTypes[0].id,
    sourceId: 'alex',
    targetId: 'bicycle',

    properties,
  };
  await post('relationship', { id: 'edge', baseRevision: null, value });
  expect((await read()).draft.relationships?.[0].after?.properties).toEqual(properties);
  expect((await read()).relationships).toEqual([]);
  const saved = await post('save', { operationId: 'relationship-properties' });
  expect((saved.receipt as SaveReceipt).relationships?.[0].after?.properties).toEqual(properties);
  client = await restartWithSession(client, () => installation.restart());
  const state = await (await client.get(fixture.path)).json();
  expect(state.relationships[0]).toMatchObject({ id: 'edge', properties });
  expect(state.relationships[0].lifecycle).toBeUndefined();
  expect(state.relationships[0].endDate).toBeUndefined();
  const changed = [properties[2], { ...properties[1], value: undefined }, ...properties.slice(3)];
  const response = await client.post(`${fixture.path}/relationship`, {
    headers: { origin: installation.origin },
    data: {
      version: state.draft.version,
      id: 'edge',
      baseRevision: 1,
      value: { ...value, typeId: initial.relationshipTypes[1].id, properties: changed },
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  const draft = await (await client.get(fixture.path)).json();
  expect(draft.relationships[0].properties).toEqual(properties);
  expect(draft.draft.relationships[0].after.properties).toEqual(
    JSON.parse(JSON.stringify(changed)),
  );
  expect(
    (
      await client.post(`${fixture.path}/save`, {
        headers: { origin: installation.origin },
        data: { version: draft.draft.version, operationId: 'changed-properties' },
      })
    ).status(),
  ).toBe(200);
  client = await restartWithSession(client, () => installation.restart());
  const history = await (await client.get(`${fixture.path}/history`)).json();
  expect(history.history[0].relationships[0].before.properties).toEqual(properties);
  expect(history.history[0].relationships[0].after.properties).toEqual(
    JSON.parse(JSON.stringify(changed)),
  );
});

test('invalid relationship property edits preserve other draft work and omitted properties preserve generated identities', async () => {
  const initial = await fixture.read();
  const value = {
    typeId: initial.relationshipTypes[0].id,
    sourceId: 'alex',
    targetId: 'bicycle',

    properties: [{ label: 'Antal', kind: 'number', value: 0 }, { label: 'Antal' }],
  };
  await fixture.post('relationship', { id: 'edge', baseRevision: null, value });
  const draft = (await fixture.read()).draft;
  const properties = draft.relationships?.[0].after?.properties;
  expect(properties).toHaveLength(2);
  expect(properties?.[0].id).not.toBe(properties?.[1].id);
  for (const invalid of [
    null,
    [{ id: 'x', label: 'A', kind: 'number', value: 'fel' }],
    [{ id: 'x', label: 'A', kind: 'date', value: '2026-02-30' }],
    [{ id: 'x', label: 'A', kind: 'currency' }],
    [{ id: 'x', label: 'A', value: false }],
    [
      { id: 'x', label: 'A' },
      { id: 'x', label: 'B' },
    ],
  ]) {
    const response = await client.post(`${fixture.path}/relationship`, {
      headers: { origin: installation.origin },
      data: {
        version: draft.version,
        id: 'edge',
        baseRevision: null,
        value: { ...value, properties: invalid },
      },
    });
    expect(response.status()).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_properties' });
    expect((await fixture.read()).draft).toEqual(draft);
  }
  await fixture.post('relationship', {
    id: 'edge',
    baseRevision: null,
    value: {
      typeId: initial.relationshipTypes[1].id,
      sourceId: 'alex',
      targetId: 'bicycle',
    },
  });
  expect((await fixture.read()).draft.relationships?.[0].after?.properties).toEqual(properties);
});
