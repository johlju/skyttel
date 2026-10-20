import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let householdId: string;
let token: string;
let path: string;
beforeEach(async () => {
  app = await createInstallation();
  browser = await request.newContext();
  await signIn(browser, app.origin);
  ({
    household: { id: householdId },
  } = await (await createHousehold(browser, app.origin)).json());
  path = `${app.origin}/api/households/${householdId}/map`;
  const flow = await beginAssistant(browser, app.origin, 'skyttel:read skyttel:write');
  const consent = await flow.consent(householdId);
  expect(consent.status()).toBe(200);
  const response = await flow.exchange((await consent.json()).url);
  expect(response.status).toBe(200);
  token = (await response.json()).access_token;
});
afterEach(async () => {
  await browser.dispose();
  await app.close();
});

async function tool(name: string, args = {}, expectedError?: string) {
  const response = await callAssistant(app.origin, token, name, args);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  const value = JSON.parse(body.result.content[0].text);
  if (expectedError) {
    expect(body.result.isError).toBe(true);
    expect(value.error).toBe(expectedError);
  } else expect(body.result.isError, JSON.stringify(body.result)).not.toBe(true);
  return value;
}
function version(review: { version: number; contentVersion: number }) {
  return { version: review.version, contentVersion: review.contentVersion };
}

async function object(id: string, updates: Record<string, unknown>) {
  const state = await (await browser.get(path)).json();
  const saved = state.objects.find((item: { id: string }) => item.id === id);
  const { id: _id, householdId: _household, revision: _revision, ...value } = saved ?? {};
  return tool('propose_object', {
    ...version({ ...state.draft, contentVersion: state.contentVersion }),
    id,
    baseRevision: saved?.revision ?? null,
    value: { typeId: state.types[0].id, name: id, ...value, ...updates },
  });
}

async function save(operationId: string) {
  const review = await tool('read_my_draft');
  return (await tool('save_draft', { ...version(review), operationId })).receipt;
}

async function definition(id: string, value: unknown, expectedError?: string) {
  const state = await (await browser.get(path)).json();
  return tool(
    'propose_object_type',
    {
      ...version({ ...state.draft, contentVersion: state.contentVersion }),
      id,
      baseRevision: state.types.find((type: { id: string }) => type.id === id)?.revision ?? null,
      value,
    },
    expectedError,
  );
}

async function member() {
  const other = await request.newContext();
  app.setIdentity(robin);
  await signIn(other, app.origin);
  const { user } = await (await other.get(`${app.origin}/api/bootstrap`)).json();
  const invitation = await browser.post(`${path.replace('/map', '')}/invitations`, {
    headers: { origin: app.origin },
    data: { userId: user.id },
  });
  const accepted = await other.post(`${app.origin}/api/invitations/accept`, {
    headers: { origin: app.origin },
    data: { code: (await invitation.json()).code },
  });
  expect(accepted.status()).toBe(200);
  return other;
}

test('map and draft reads expose property identities and search own labels, values and types', async () => {
  const properties = [
    { id: 'empty', label: 'Ramnummer' },
    { id: 'mark', label: 'Ramnummer', kind: 'text', value: 'Blå' },
    { id: 'false', label: 'Kontrollerad', kind: 'boolean', value: false },
  ];
  await object('one', { name: 'Cykel', properties });
  await object('two', {
    name: 'Cykel',
    properties: [{ id: 'red', label: 'Ramnummer', kind: 'text', value: 'Röd' }],
  });
  const proposed = await tool('read_my_draft');
  expect(
    proposed.changes.find((change: { id: string }) => change.id === 'one').after.properties,
  ).toEqual(properties);
  await save('searchable-properties');
  const found = await tool('read_map', { query: 'ramnummer blå' });
  expect(found.objects).toHaveLength(1);
  expect(found.objects[0]).toMatchObject({ id: 'one', properties });
  expect((await tool('read_map', { query: found.types[0].name })).objects).toHaveLength(2);
  await object('one', { properties: [...properties].reverse() });
  expect((await tool('read_my_draft')).changes[0].after.properties).toEqual(
    [...properties].reverse(),
  );
  expect((await tool('read_map', { objectId: 'one' })).objects[0].properties).toEqual(properties);
});

test('advanced tools use actual SDK contracts, preserve old read grants and current revocation', async () => {
  const client = new Client({ name: 'Avancerad provklient', version: '1' });
  const readClient = new Client({ name: 'Äldre läsande klient', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const catalog = (await client.listTools()).tools;
    const newMutations = ['propose_object_type', 'propose_relationship_type'];
    for (const name of newMutations) {
      const tool = catalog.find((item) => item.name === name);
      expect(tool?.annotations?.readOnlyHint).toBe(false);
      expect(tool?.inputSchema.required).toEqual(
        expect.arrayContaining(['version', 'contentVersion']),
      );
    }
    expect(catalog.map(({ name }) => name).join(' ')).not.toMatch(
      /export|import|erase|member|admin/,
    );
    const flow = await beginAssistant(browser, app.origin, 'skyttel:read');
    const accepted = await flow.consent(householdId);
    const readToken = (await (await flow.exchange((await accepted.json()).url)).json())
      .access_token;
    await readClient.connect(
      new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${readToken}` } },
      }),
    );
    expect((await readClient.listTools()).tools.map(({ name }) => name)).toEqual([
      'read_map',
      'read_my_draft',
    ]);
    expect(
      (
        await readClient.callTool({
          name: 'propose_object_type',
          arguments: {
            version: 0,
            contentVersion: 1,
            id: 'forbidden',
            baseRevision: null,
            value: { name: 'Ej tillåten', description: '' },
          },
        })
      ).isError,
    ).toBe(true);
    expect(
      (
        await client.callTool({
          name: 'propose_relationship_type',
          arguments: {
            version: 0,
            contentVersion: 1,
            id: 'fields',
            baseRevision: null,
            value: {
              name: 'Fel',
              description: '',
              forwardLabel: 'framåt',
              reverseLabel: 'bakåt',
              fields: [],
            },
          },
        })
      ).isError,
    ).toBe(true);
    await tool('read_history', { operationId: 'missing-owner' }, 'invalid_request');
    await tool('read_history', { userId: 'missing-operation' }, 'invalid_request');
    await tool(
      'read_history',
      { operationId: 'missing', userId: 'missing', objectId: 'extra' },
      'invalid_request',
    );
    await tool(
      'read_history',
      { operationId: 'missing', userId: 'missing' },
      'history_unavailable',
    );
    expect((await tool('read_history', { offset: 20 })).history).toEqual([]);
    const context = await (await browser.get(`${app.origin}/api/assistants/context`)).json();
    for (const connection of context.connections)
      expect(
        (
          await browser.post(`${app.origin}/api/assistants/${connection.id}/revoke`, {
            headers: { origin: app.origin },
            data: {},
          })
        ).status(),
      ).toBe(200);
    await expect(client.callTool({ name: 'read_history', arguments: {} })).rejects.toThrow();
  } finally {
    await client.close();
    await readClient.close();
  }
});

test('MCP uses fresh content versions to read imported historical authorship and rejects every old advanced mutation', async () => {
  await object('lamp', { name: 'Historisk lampa' });
  const original = await save('source-save');
  const householdPath = path.replace('/map', '');
  const prepared = await browser.post(`${householdPath}/exports`, {
    headers: { origin: app.origin },
    data: {},
  });
  expect(prepared.status()).toBe(201);
  const archive = await (
    await browser.get(`${householdPath}/exports/${(await prepared.json()).id}`)
  ).body();
  const source = { app, browser };
  app = await createInstallation();
  browser = await request.newContext();
  try {
    await signIn(browser, app.origin);
    const { household } = await (
      await createHousehold(browser, app.origin, 'Återställt hushåll')
    ).json();
    const targetPath = `${app.origin}/api/households/${household.id}`;
    const uploaded = await browser.post(`${targetPath}/imports`, {
      headers: {
        origin: app.origin,
        'content-type': 'application/zip',
        'x-skyttel-content-version': '1',
      },
      data: archive,
    });
    expect(uploaded.status(), await uploaded.text()).toBe(201);
    const ready = await uploaded.json();
    const confirmed = await browser.post(`${targetPath}/imports/${ready.id}/confirm`, {
      headers: { origin: app.origin },
      data: { contentVersion: 1, confirmed: true },
    });
    expect((await confirmed.json()).status).toBe('completed');
    const flow = await beginAssistant(browser, app.origin, 'skyttel:read skyttel:write');
    const consent = await flow.consent(household.id);
    token = (await (await flow.exchange((await consent.json()).url)).json()).access_token;
    path = `${targetPath}/map`;
    await app.restart();
    const review = await tool('read_my_draft');
    expect(review.contentVersion).toBe(2);
    const selected = await tool('read_history', {
      operationId: original.operationId,
      userId: original.userId,
    });
    expect(selected.receipt).toMatchObject({
      userId: original.userId,
      contentVersion: 1,
      actorName: 'Alex Exempel',
    });
    const currentOwner = (await (await browser.get(path)).json()).userId;
    expect(currentOwner).not.toBe(original.userId);
    for (const [name, args] of [
      [
        'propose_object_type',
        {
          id: 'stale-type',
          baseRevision: null,
          value: { name: 'Gammal typ', description: '' },
        },
      ],
      [
        'propose_relationship_type',
        {
          id: 'stale-edge-type',
          baseRevision: null,
          value: {
            name: 'Gammal typ',
            description: '',
            forwardLabel: 'framåt',
            reverseLabel: 'bakåt',
          },
        },
      ],
    ] as const) {
      await tool(name, { ...args, version: review.version, contentVersion: 1 }, 'content_conflict');
    }
    expect(await tool('read_my_draft')).toEqual(review);
  } finally {
    await browser.dispose();
    await app.close();
    app = source.app;
    browser = source.browser;
  }
});

test('MCP history discovery is bounded and scoped while a selected save exposes historical facts', async () => {
  await object('bike', {
    name: 'Alex blå cykel',
    properties: [{ id: 'frame', label: 'Ram', kind: 'text', value: 'Blå ram' }],
  });
  await save('initial-bike');
  await object('unrelated', {
    name: 'Orelaterat konto',
    properties: [
      { id: 'note', label: 'Anteckning', kind: 'text', value: 'Unik orelaterad anteckning' },
    ],
  });
  await save('unrelated-save');
  await object('bike', {
    properties: [{ id: 'frame', label: 'Ram', kind: 'text', value: 'Grön ram' }],
  });
  const corrected = await save('repaint');
  await object('bike', { name: 'Alex stadscykel' });
  await save('independent-name');
  const summaries = await tool('read_history', { objectId: 'bike', limit: 2 });
  expect(summaries.history.map((item: { operationId: string }) => item.operationId)).toEqual([
    'independent-name',
    'repaint',
  ]);
  expect(summaries.hasMore).toBe(true);
  expect(JSON.stringify(summaries)).not.toMatch(/Unik orelaterad|Blå ram|Grön ram|unrelated-save/);
  const selected = await tool('read_history', {
    operationId: corrected.operationId,
    userId: corrected.userId,
  });
  expect(selected.receipt).toMatchObject({
    actorName: 'Alex Exempel',
    savedAt: expect.stringMatching(/T/),
    changes: [
      {
        before: { properties: [{ id: 'frame', label: 'Ram', kind: 'text', value: 'Blå ram' }] },
        after: { properties: [{ id: 'frame', label: 'Ram', kind: 'text', value: 'Grön ram' }] },
      },
    ],
  });
});

test('MCP type changes preserve independent object and relationship properties and both directional labels', async () => {
  let review = await tool('read_my_draft');
  for (const id of ['cycle', 'vehicle']) {
    review = await tool('propose_object_type', {
      ...version(review),
      id,
      baseRevision: null,
      value: { name: id === 'cycle' ? 'Cykel' : 'Fordon', description: 'Gemensam typbetydelse' },
    });
  }
  review = await tool('propose_relationship_type', {
    ...version(review),
    id: 'parking',
    baseRevision: null,
    value: {
      name: 'Förvaras',
      description: 'Plats',
      forwardLabel: 'förvaras i',
      reverseLabel: 'förvarar',
    },
  });
  const properties = [
    { id: 'serial', label: 'Nummer', kind: 'text', value: 'SYNTH-42' },
    { id: 'checked', label: 'Kontrollerad', kind: 'boolean', value: false },
    { id: 'empty', label: 'Datum', kind: 'date' },
    { id: 'unknown', label: 'Datum' },
  ];
  await object('bike', { typeId: 'cycle', name: 'Blå cykel', properties });
  await object('garage', { name: 'Garaget' });
  review = await tool('read_my_draft');
  review = await tool('propose_relationship', {
    ...version(review),
    id: 'bike-place',
    baseRevision: null,
    value: { typeId: 'parking', sourceId: 'bike', targetId: 'garage', properties },
  });
  await save('first-place');
  const catalog = await tool('read_type_catalog');
  expect(
    catalog.relationshipTypes.find((type: { id: string }) => type.id === 'parking'),
  ).toMatchObject({
    description: 'Plats',
    forwardLabel: 'förvaras i',
    reverseLabel: 'förvarar',
  });
  review = await object('bike', { typeId: 'vehicle' });
  expect(review.changes[0]).toMatchObject({
    before: { typeId: 'cycle', properties },
    after: { typeId: 'vehicle', properties },
  });
  const saved = await save('change-meaning');
  expect(saved.changes[0].after.properties).toEqual(properties);
  const read = await tool('read_map', { objectId: 'bike' });
  expect(read.objects[0].properties).toEqual(properties);
  expect(read.relationships[0]).toMatchObject({ id: 'bike-place', properties });
  const duplicate = await tool('propose_relationship', {
    ...version(await tool('read_my_draft')),
    id: 'duplicate',
    baseRevision: null,
    value: { typeId: 'parking', sourceId: 'bike', targetId: 'garage', properties: [] },
  });
  expect(duplicate.existingId).toBe('bike-place');
  expect((await tool('read_map', { objectId: 'bike' })).relationships[0].properties).toEqual(
    properties,
  );
});

test('MCP protects ended definitions, explains private-use blocks without leaking content, and rechecks concurrent use at whole save', async () => {
  const type = { name: 'Cykel', description: '' };
  await definition('cycle', type);
  const properties = [{ id: 'serial', label: 'Nummer', kind: 'text', value: 'SYNTH-42' }];
  await object('bike', { typeId: 'cycle', name: 'Alex blå cykel', properties, lifecycle: 'ended' });
  await save('used-definition');
  const blockedType = await definition('cycle', null, 'definition_in_use');
  expect(blockedType.message).toContain('upphört');
  expect((await tool('read_map', { objectId: 'bike' })).objects[0].properties).toEqual(properties);
  await definition('cycle', { ...type, name: 'Trampcykel' });
  await save('renamed-type');
  expect((await tool('read_map', { objectId: 'bike' })).objects[0].properties).toEqual(properties);
  await definition('private-type', { name: 'Privat använd typ', description: '' });
  await definition('race-type', { name: 'Samtidig använd typ', description: '' });
  await save('available-types');
  const other = await member();
  try {
    const propose = async (id: string, typeId: string, name: string) => {
      const state = await (await other.get(path)).json();
      const response = await other.post(`${path}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id,
          baseRevision: null,
          value: {
            typeId,
            name,

            properties: [
              { id: 'note', label: 'Anteckning', kind: 'text', value: 'Privat hemlig anteckning' },
            ],
          },
        },
      });
      expect(response.status()).toBe(200);
    };
    await propose('secret', 'private-type', 'Andras privata namn');
    const denied = await definition('private-type', null, 'definition_in_use');
    expect(JSON.stringify(denied)).not.toMatch(
      /Andras privata namn|Privat hemlig anteckning|"secret"/,
    );
    const review = await definition('race-type', null);
    await propose('racer', 'race-type', 'Nytt privat bruk');
    await tool(
      'save_draft',
      { ...version(review), operationId: 'racing-removal' },
      'definition_in_use',
    );
    expect(
      (await tool('read_type_catalog')).types.some(
        (item: { id: string }) => item.id === 'private-type',
      ),
    ).toBe(true);
    const saved = await (await browser.get(path)).json();
    expect(saved.types.some((item: { id: string }) => item.id === 'race-type')).toBe(true);
    expect(saved.objects.some((item: { id: string }) => item.id === 'secret')).toBe(false);
    expect((await (await other.get(path)).json()).draft.changes).toHaveLength(2);
  } finally {
    await other.dispose();
  }
});

test('MCP contract facts retain chosen kinds, explicit uncertainty and dates as independent properties after restart and correction', async () => {
  const catalog = await tool('read_type_catalog');
  const typeId = catalog.types.find((type: { name: string }) => type.name === 'Kreditavtal').id;
  const properties = [
    { id: 'limit', label: 'Kreditutrymme', kind: 'number', value: 80000 },
    { id: 'used', label: 'Utnyttjad kredit', kind: 'number', value: 12500 },
    { id: 'reported', label: 'Datum för uppgiften', kind: 'date', value: '2026-09-02' },
    { id: 'certainty', label: 'Osäkert uppgivet', kind: 'boolean', value: true },
    { id: 'terms', label: 'Villkor', kind: 'text' },
    { id: 'other', label: 'Villkor' },
    { id: 'date-label', label: 'Slutdatum', kind: 'text', value: 'Ingen sluttid bestämd' },
  ];
  await object('credit', { typeId, name: 'Exempelkredit', properties, lifecycle: 'active' });
  await save('credit-facts');
  await app.restart();
  let read = (await tool('read_map', { objectId: 'credit' })).objects[0];
  expect(read.properties).toEqual(properties);
  expect(read.lifecycle).toBe('active');
  await object('credit', {
    properties: properties.map((property) =>
      property.id === 'used'
        ? { ...property, value: 0 }
        : property.id === 'reported'
          ? { ...property, value: '2026-09-20' }
          : property,
    ),
  });
  const receipt = await save('credit-correction');
  const history = await tool('read_history', {
    operationId: receipt.operationId,
    userId: receipt.userId,
  });
  expect(history.receipt.changes[0].before.properties[1]).toEqual({
    id: 'used',
    label: 'Utnyttjad kredit',
    kind: 'number',
    value: 12500,
  });
  expect(history.receipt.changes[0].after.properties[1]).toEqual({
    id: 'used',
    label: 'Utnyttjad kredit',
    kind: 'number',
    value: 0,
  });
  expect(history.receipt.changes[0].after.properties[2]).toEqual({
    id: 'reported',
    label: 'Datum för uppgiften',
    kind: 'date',
    value: '2026-09-20',
  });
  read = (await tool('read_map', { objectId: 'credit' })).objects[0];
  expect(read.properties.slice(3)).toEqual(properties.slice(3));
  expect(read.lifecycle).toBe('active');
});
