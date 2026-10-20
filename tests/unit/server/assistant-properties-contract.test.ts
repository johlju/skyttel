import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { beginAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let sdk: Client;
let path: string;
beforeEach(async () => {
  app = await createInstallation();
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  path = `${app.origin}/api/households/${household.id}/map`;
  const flow = await beginAssistant(browser, app.origin, 'skyttel:read skyttel:write');
  const accepted = await flow.consent(household.id);
  const exchanged = await flow.exchange((await accepted.json()).url);
  const { access_token: token } = await exchanged.json();
  sdk = new Client({ name: 'Egenskapsläsare', version: '1' });
  await sdk.connect(
    new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
});
afterEach(async () => {
  await sdk?.close();
  await browser?.dispose();
  await app?.close();
});

async function tool(name: string, args: Record<string, unknown> = {}) {
  const result = await sdk.callTool({ name, arguments: args });
  expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
  return JSON.parse((result.content as { text: string }[])[0].text);
}

test('MCP offers only free individual properties and type meaning without administrative archive tools', {
  tags: ['technical'],
}, async () => {
  const { tools } = await sdk.listTools();
  for (const requirement of [
    'Hitta inte på datatyp',
    'ett telefonnummer med inledande',
    'Samma etikett kan',
    'Skapa ingen ersättningsegenskap',
    'Lika objektnamn ger inget automatiskt identitetsval',
    'Röst och text',
  ])
    expect(sdk.getInstructions()).toContain(requirement);
  for (const name of ['propose_object', 'propose_relationship']) {
    const definition = tools.find((tool) => tool.name === name);
    expect(JSON.stringify(definition?.inputSchema)).toContain('properties');
    expect(JSON.stringify(definition)).not.toMatch(/financialFacts|customValues|knowledge|endDate/);
  }
  for (const name of ['propose_object_type', 'propose_relationship_type']) {
    const definition = tools.find((tool) => tool.name === name);
    expect(JSON.stringify(definition?.inputSchema)).not.toMatch(
      /"fields"|"sections"|builtins|propertyOrder/,
    );
    expect(JSON.stringify(definition?.inputSchema)).toContain('description');
  }
  expect(tools.map(({ name }) => name).join(' ')).not.toMatch(/archive|export|import/);
  const initial = await (await browser.get(path)).json();
  let draft = await tool('propose_object', {
    version: 0,
    contentVersion: initial.contentVersion,
    id: 'phone',
    baseRevision: null,
    value: {
      typeId: initial.types[0].id,
      name: 'Lo',
      properties: [
        { label: 'Telefon', kind: 'text', value: '0700123456' },
        { label: 'Samma', kind: 'number', value: 0 },
        { label: 'Samma', kind: 'boolean', value: false },
        { label: 'Tom', kind: 'date' },
        { label: 'Tom' },
      ],
    },
  });
  const properties = draft.changes[0].after.properties;
  expect(properties.map(({ id }: { id: string }) => id)).toHaveLength(5);
  expect(new Set(properties.map(({ id }: { id: string }) => id)).size).toBe(5);
  draft = await tool('propose_object', {
    version: draft.version,
    contentVersion: draft.contentVersion,
    id: 'phone',
    baseRevision: null,
    value: {
      typeId: initial.types[0].id,
      name: 'Lo',
      properties: [properties[0], { ...properties[1], value: undefined }, ...properties.slice(3)],
    },
  });
  expect(draft.changes[0].after.properties).toEqual([
    properties[0],
    { id: properties[1].id, label: 'Samma', kind: 'number' },
    ...properties.slice(3),
  ]);
  const saved = await tool('save_draft', {
    version: draft.version,
    contentVersion: draft.contentVersion,
    operationId: 'save-phone',
  });
  const read = await tool('read_map', { objectId: 'phone' });
  expect(read.objects[0].properties).toEqual(draft.changes[0].after.properties);
  expect(read.objects[0]).not.toHaveProperty('description');
  expect(JSON.stringify(read)).not.toMatch(/customValues|financialFacts|knowledge|"fields"/);
  const history = await tool('read_history', {
    operationId: 'save-phone',
    userId: saved.receipt.userId,
  });
  expect(history.receipt.changes[0].after.properties).toEqual(read.objects[0].properties);
});

test('MCP preserves endpoint names and property identities whose IDs match retired model keys', {
  tags: ['technical'],
}, async () => {
  const initial = await (await browser.get(path)).json();
  let review = await tool('read_my_draft');
  for (const [id, name] of [
    ['fields', 'Lo'],
    ['knowledge', 'Molnmusik'],
  ]) {
    review = await tool('propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id,
      baseRevision: null,
      value: { typeId: initial.types[0].id, name },
    });
  }
  const properties = [
    { id: 'fields', label: 'Anteckning', kind: 'text', value: 'Behåll' },
    { id: 'knowledge', label: 'Anteckning', kind: 'boolean', value: false },
  ];
  review = await tool('propose_relationship', {
    version: review.version,
    contentVersion: review.contentVersion,
    id: 'edge',
    baseRevision: null,
    value: {
      typeId: initial.relationshipTypes[0].id,
      sourceId: 'fields',
      targetId: 'knowledge',
      properties,
    },
  });
  expect(review.relationships[0].objectNames).toEqual({ fields: 'Lo', knowledge: 'Molnmusik' });
  const saved = await tool('save_draft', {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'named-endpoints',
  });
  const read = await tool('read_map', { objectId: 'fields' });
  expect(read.relationships[0].properties).toEqual(properties);
  expect(read.contextObjects).toMatchObject([{ id: 'knowledge', name: 'Molnmusik' }]);
  const history = await tool('read_history', {
    operationId: 'named-endpoints',
    userId: saved.receipt.userId,
  });
  expect(history.receipt.relationships[0].objectNames).toEqual({
    fields: 'Lo',
    knowledge: 'Molnmusik',
  });
  expect(history.receipt.relationships[0].after.properties).toEqual(properties);
});
