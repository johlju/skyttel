import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let path: string;
let householdId: string;
beforeEach(async () => {
  app = await createInstallation();
  browser = await request.newContext();
  await signIn(browser, app.origin);
  ({
    household: { id: householdId },
  } = await (await createHousehold(browser, app.origin)).json());
  path = `${app.origin}/api/households/${householdId}/map`;
});
afterEach(async () => {
  await browser.dispose();
  await app.close();
});

async function connect(write = true) {
  const flow = await beginAssistant(
    browser,
    app.origin,
    write ? 'skyttel:read skyttel:write offline_access' : 'skyttel:read offline_access',
  );
  const accepted = await flow.consent(householdId);
  expect(accepted.status(), await accepted.text()).toBe(200);
  const exchanged = await flow.exchange((await accepted.json()).url);
  expect(exchanged.status, await exchanged.clone().text()).toBe(200);
  return (await exchanged.json()).access_token as string;
}
async function tool(token: string, name: string, args = {}) {
  const response = await callAssistant(app.origin, token, name, args);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  return { error: body.result.isError === true, value: JSON.parse(body.result.content[0].text) };
}
async function post(route: string, data: unknown) {
  const response = await browser.post(`${path}/${route}`, {
    headers: { origin: app.origin },
    data:
      route === 'draft' && (data as { value?: unknown }).value
        ? { ...(data as object), value: { ...(data as { value: object }).value } }
        : data,
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test('retired historical mutations are absent from HTTP and MCP while ordinary saving and history remain available', async () => {
  const token = await connect();
  const sdk = new Client({ name: 'Historikläsare', version: '1' });
  try {
    await sdk.connect(
      new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const names = (await sdk.listTools()).tools.map(({ name }) => name);
    expect(names).toContain('read_history');
    expect(names).toContain('save_draft');
    for (const name of ['propose_undo', 'read_merge_review', 'propose_merge']) {
      expect(names).not.toContain(name);
      const missing = await sdk.callTool({ name, arguments: {} });
      expect(missing.isError).toBe(true);
      expect(missing.content).toEqual([
        { type: 'text', text: `MCP error -32602: Tool ${name} not found` },
      ]);
    }
    const initial = await (await browser.get(path)).json();
    for (const route of ['undo', 'merge']) {
      const response = await browser.post(`${path}/${route}`, {
        headers: { origin: app.origin },
        data: { version: initial.draft.version, contentVersion: initial.contentVersion },
      });
      expect(response.status()).toBe(404);
      expect(await (await browser.get(path)).json()).toEqual(initial);
    }
    await post('draft', {
      version: initial.draft.version,
      contentVersion: initial.contentVersion,
      id: 'cycle',
      baseRevision: null,
      value: { typeId: initial.types[0].id, name: 'Blå cykel' },
    });
    const draft = await tool(token, 'read_my_draft');
    const saved = await tool(token, 'save_draft', {
      version: draft.value.version,
      contentVersion: draft.value.contentVersion,
      operationId: 'ordinary-save',
    });
    expect(saved.error).toBe(false);
    const history = await tool(token, 'read_history');
    expect(
      history.value.history.map((receipt: { operationId: string }) => receipt.operationId),
    ).toEqual(['ordinary-save']);
    const selected = await tool(token, 'read_history', {
      operationId: 'ordinary-save',
      userId: saved.value.receipt.userId,
    });
    expect(selected.value.receipt.changes[0].after.name).toBe('Blå cykel');
    expect((await (await browser.get(path)).json()).draft.changes).toEqual([]);
  } finally {
    await sdk.close();
  }
});

test('assistant icon search and set/reset proposals share the private object and reject unknown IDs', async () => {
  const token = await connect();
  const found = await tool(token, 'search_object_icons', { query: 'cykel' });
  expect(found.value.icons).toContainEqual({ id: 'bike', label: 'Cykel' });
  const scientific = await tool(token, 'search_object_icons', { query: 'vetenskap telescope' });
  expect(scientific.value.icons).toContainEqual({ id: 'telescope', label: 'telescope' });
  const state = await (await browser.get(path)).json();
  const value = { typeId: state.types[0].id, name: 'Cykel', iconId: 'bike' };
  const proposal = {
    version: 0,
    contentVersion: state.contentVersion,
    id: 'cycle',
    baseRevision: null,
    value,
  };
  const proposed = await tool(token, 'propose_object', proposal);
  expect(proposed.error).toBe(false);
  expect(proposed.value.changes[0].after.iconId).toBe('bike');
  const invalid = await callAssistant(app.origin, token, 'propose_object', {
    ...proposal,
    version: 1,
    value: { ...value, iconId: 'invalid-icon' },
  });
  const invalidBody = await invalid.json();
  expect(invalidBody.result?.isError || invalidBody.error).toBeTruthy();
  const reset = await tool(token, 'propose_object', {
    ...proposal,
    version: 1,
    value: { ...value, iconId: null },
  });
  expect(reset.error).toBe(false);
  expect(reset.value.changes[0].after).not.toHaveProperty('iconId');
  expect((await (await browser.get(path)).json()).objects).toEqual([]);
});

test('MCP allocates property identities and edits, clears, removes and orders the returned identities', async () => {
  const token = await connect();
  const state = await (await browser.get(path)).json();
  const value = {
    typeId: state.types[0].id,
    name: 'MCP-egenskaper',
    properties: [
      { label: 'Samma', kind: 'text', value: 'Första' },
      { label: 'Samma', kind: 'number', value: 0 },
      { label: 'Nej', kind: 'boolean', value: false },
      { label: 'Datum', kind: 'date', value: '2026-01-01' },
      { label: 'Tomt' },
      ...Array.from({ length: 101 }, (_, index) => ({
        label: 'Extra',
        kind: 'text',
        value: String(index).repeat(200),
      })),
    ],
  };
  const proposed = await tool(token, 'propose_object', {
    version: 0,
    contentVersion: 1,
    id: 'properties',
    baseRevision: null,
    value,
  });
  expect(proposed.error).toBe(false);
  const properties = proposed.value.changes[0].after.properties;
  expect(properties).toHaveLength(106);
  expect(new Set(properties.map((property: { id: string }) => property.id)).size).toBe(106);
  expect(properties[1]).toMatchObject({ label: 'Samma', kind: 'number', value: 0 });
  const changed = [
    properties[2],
    { ...properties[1], value: undefined },
    { ...properties[0], label: 'Rättad', value: 'Bevarad identitet' },
    ...properties.slice(4),
  ];
  const corrected = await tool(token, 'propose_object', {
    version: 1,
    contentVersion: 1,
    id: 'properties',
    baseRevision: null,
    value: { ...value, properties: changed },
  });
  expect(corrected.error).toBe(false);
  expect(corrected.value.changes[0].after.properties).toEqual(JSON.parse(JSON.stringify(changed)));
  const before = await (await browser.get(path)).json();
  const rejected = await callAssistant(app.origin, token, 'propose_object', {
    version: 2,
    contentVersion: 1,
    id: 'properties',
    baseRevision: null,
    value: { ...value, properties: [{ ...properties[0], kind: 'date', value: 'invalid' }] },
  });
  const rejectedBody = await rejected.json();
  expect(rejectedBody.result?.isError || rejectedBody.error).toBeTruthy();
  expect(await (await browser.get(path)).json()).toEqual(before);
  const saved = await tool(token, 'save_draft', {
    version: 2,
    contentVersion: 1,
    operationId: 'save-properties',
  });
  expect(saved.error).toBe(false);
  browser = await restartWithSession(browser, () => app.restart());
  expect((await (await browser.get(path)).json()).objects[0].properties).toEqual(
    JSON.parse(JSON.stringify(changed)),
  );
});

test('MCP allocates relationship property identities and preserves precise edits, empty values and ordering', async () => {
  const token = await connect();
  const state = await (await browser.get(path)).json();
  for (const [version, id] of ['source', 'target'].entries())
    await post('draft', {
      version,
      id,
      baseRevision: null,
      value: { typeId: state.types[0].id, name: id },
    });
  const value = {
    typeId: state.relationshipTypes[0].id,
    sourceId: 'source',
    targetId: 'target',
    properties: [
      { label: 'Samma', kind: 'text', value: 'Första' },
      { label: 'Samma', kind: 'number', value: 0 },
      { label: 'Nej', kind: 'boolean', value: false },
      { label: 'Datum', kind: 'date', value: '2026-01-01' },
      { label: 'Tomt' },
      ...Array.from({ length: 101 }, (_, index) => ({
        label: 'Extra',
        kind: 'text',
        value: String(index).repeat(200),
      })),
    ],
  };
  const proposed = await tool(token, 'propose_relationship', {
    version: 2,
    contentVersion: 1,
    id: 'properties',
    baseRevision: null,
    value,
  });
  expect(proposed.error).toBe(false);
  const properties = proposed.value.relationships[0].after.properties;
  expect(properties).toHaveLength(106);
  expect(new Set(properties.map((property: { id: string }) => property.id)).size).toBe(106);
  expect(properties[1]).toMatchObject({ label: 'Samma', kind: 'number', value: 0 });
  const changed = [
    properties[2],
    { ...properties[1], value: undefined },
    { ...properties[0], label: 'Rättad', value: 'Bevarad identitet' },
    ...properties.slice(4),
  ];
  const corrected = await tool(token, 'propose_relationship', {
    version: 3,
    contentVersion: 1,
    id: 'properties',
    baseRevision: null,
    value: { ...value, properties: changed },
  });
  expect(corrected.error).toBe(false);
  expect(corrected.value.relationships[0].after.properties).toEqual(
    JSON.parse(JSON.stringify(changed)),
  );
  const before = await (await browser.get(path)).json();
  const rejected = await callAssistant(app.origin, token, 'propose_relationship', {
    version: 4,
    contentVersion: 1,
    id: 'properties',
    baseRevision: null,
    value: { ...value, properties: [{ ...properties[0], kind: 'date', value: 'invalid' }] },
  });
  const rejectedBody = await rejected.json();
  expect(rejectedBody.result?.isError || rejectedBody.error).toBeTruthy();
  expect(await (await browser.get(path)).json()).toEqual(before);
  const saved = await tool(token, 'save_draft', {
    version: 4,
    contentVersion: 1,
    operationId: 'save-properties',
  });
  expect(saved.error).toBe(false);
  browser = await restartWithSession(browser, () => app.restart());
  expect((await (await browser.get(path)).json()).relationships[0].properties).toEqual(
    JSON.parse(JSON.stringify(changed)),
  );
});

test('explicit write consent permits proposals while an earlier read grant stays read-only', async () => {
  const readToken = await connect(false);
  const state = await (await browser.get(path)).json();
  const value = { typeId: state.types[0].id, name: 'Lo Exempel' };
  const proposal = {
    version: 0,
    contentVersion: state.contentVersion,
    id: 'lo',
    baseRevision: null,
    value,
  };
  const blocked = await callAssistant(app.origin, readToken, 'propose_object', proposal);
  const denied = await blocked.json();
  expect(denied.result?.isError || denied.error).toBeTruthy();
  expect((await (await browser.get(path)).json()).draft.changes).toEqual([]);

  const writeToken = await connect();
  const proposed = await tool(writeToken, 'propose_object', proposal);
  expect(proposed.error).toBe(false);
  expect(proposed.value).toMatchObject({
    version: 1,
    contentVersion: state.contentVersion,
    changes: [{ id: 'lo', before: null, after: value }],
    readyToSave: true,
  });
  const current = await (await browser.get(path)).json();
  expect(current.objects).toEqual([]);
  expect(current.draft.changes).toHaveLength(1);
  const resumed = await tool(writeToken, 'read_my_draft');
  expect(resumed.value).toEqual(proposed.value);
});

test('write authorization requires separate map consent and signed requested scopes', async () => {
  const flow = await beginAssistant(browser, app.origin, 'skyttel:read skyttel:write');
  expect((await flow.consent(householdId, { mapWork: false })).status()).toBe(403);
  const reduced = new URLSearchParams(flow.consentUrl.search);
  reduced.set('scope', 'skyttel:read');
  expect(
    (await flow.consent(householdId, { mapWork: false, oauth_query: reduced.toString() })).ok(),
  ).toBe(false);
  expect(
    (await (await browser.get(`${app.origin}/api/assistants/context`)).json()).connections,
  ).toEqual([]);
});

test('whole-draft reviews keep changed saved facts but project untouched endpoints without expanding their graph', async () => {
  const token = await connect();
  const catalog = (await tool(token, 'read_type_catalog')).value;
  const type = catalog.types.find((entry: { name: string }) => entry.name === 'Bankkonto');
  const edgeType = catalog.relationshipTypes.find(
    (entry: { name: string }) => entry.name === 'Använder',
  );
  let review = (await tool(token, 'read_my_draft')).value;
  for (const [id, name, description, amount] of [
    ['changed', 'Ändrat konto', 'Berörd sparad anteckning', '149'],
    ['neighbor', 'Grannkonto', 'Orelaterad privat anteckning', '998877'],
    ['distant', 'Avlägset konto', 'Avlägsen privat anteckning', '112233'],
  ]) {
    review = (
      await tool(token, 'propose_object', {
        version: review.version,
        contentVersion: review.contentVersion,
        id,
        baseRevision: null,
        value: {
          typeId: type.id,
          name,
          properties: [
            { id: 'description', label: 'Beskrivning', kind: 'text', value: description },
            { id: 'price', label: 'Pris', kind: 'text', value: amount },
          ],
        },
      })
    ).value;
  }
  for (const [id, sourceId, targetId] of [
    ['direct', 'changed', 'neighbor'],
    ['distant-edge', 'neighbor', 'distant'],
  ]) {
    review = (
      await tool(token, 'propose_relationship', {
        version: review.version,
        contentVersion: review.contentVersion,
        id,
        baseRevision: null,
        value: { typeId: edgeType.id, sourceId, targetId },
      })
    ).value;
  }
  await tool(token, 'save_draft', {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'privacy-fixture',
  });
  review = (await tool(token, 'read_my_draft')).value;
  const changed = (await tool(token, 'read_map', { objectId: 'changed' })).value.objects[0];
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: changed.id,
      baseRevision: changed.revision,
      value: {
        typeId: type.id,
        name: 'Rättat konto',
        properties: changed.properties.map((property: { id: string }) =>
          property.id === 'price' ? { ...property, value: '189' } : property,
        ),
      },
    })
  ).value;
  expect(
    review.changes[0].before.properties.find((property: { id: string }) => property.id === 'price')
      .value,
  ).toBe('149');
  expect(
    review.changes[0].after.properties.find((property: { id: string }) => property.id === 'price')
      .value,
  ).toBe('189');
  expect(
    review.current.objects.find((object: { id: string }) => object.id === 'changed'),
  ).toMatchObject({
    properties: changed.properties,
  });
  expect(review.current.objects.find((object: { id: string }) => object.id === 'neighbor')).toEqual(
    { id: 'neighbor', name: 'Grannkonto', typeId: type.id },
  );
  expect(review.current.relationships.map((edge: { id: string }) => edge.id)).toEqual(['direct']);
  expect(JSON.stringify(review)).not.toMatch(
    /Orelaterad privat|998877|Avlägsen privat|112233|distant/,
  );
  expect((await tool(token, 'read_my_draft')).value).toEqual(review);

  review = (
    await tool(token, 'discard_draft', {
      version: review.version,
      contentVersion: review.contentVersion,
    })
  ).value;
  review = (
    await tool(token, 'propose_relationship', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'direct',
      baseRevision: 1,
      value: {
        typeId: edgeType.id,
        sourceId: 'changed',
        targetId: 'neighbor',
      },
    })
  ).value;
  expect(review.current.objects).toEqual([
    { id: 'neighbor', name: 'Grannkonto', typeId: type.id },
    { id: 'changed', name: 'Ändrat konto', typeId: type.id },
  ]);
  expect(review.current.relationships.map((edge: { id: string }) => edge.id)).toEqual(['direct']);
  expect(JSON.stringify(review)).not.toMatch(/998877|112233|distant|Berörd sparad/);
});

test('a family case resumes browser proposals, discovers current types, corrects and saves the whole draft with one receipt', async () => {
  const token = await connect();
  const catalog = (await tool(token, 'read_type_catalog')).value;
  const person = catalog.types.find((type: { name: string }) => type.name === 'Person');
  const subscription = catalog.types.find((type: { name: string }) => type.name === 'Abonnemang');
  const pays = catalog.relationshipTypes.find((type: { name: string }) => type.name === 'Betalar');
  expect(person.id).toBeTruthy();
  await post('draft', {
    version: 0,
    contentVersion: catalog.contentVersion,
    id: 'lo',
    baseRevision: null,
    value: {
      typeId: person.id,
      name: 'Lo',
      properties: [
        {
          id: 'note',
          label: 'Beskrivning',
          kind: 'text',
          value: 'Tidigare förslag från formuläret',
        },
      ],
    },
  });
  let review = (await tool(token, 'read_my_draft')).value;
  expect(review.changes[0].after.name).toBe('Lo');
  const value = {
    typeId: subscription.id,
    name: 'Familjemusik',
    properties: [
      { id: 'price', label: 'Pris', kind: 'text', value: '149' },
      { id: 'currency', label: 'Valuta', kind: 'text', value: 'SEK' },
      { id: 'interval', label: 'Intervall', kind: 'text', value: 'månad' },
    ],
  };
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'subscription',
      baseRevision: null,
      typeRevision: subscription.revision,
      value,
    })
  ).value;
  expect(review.changes).toHaveLength(2);
  review = (
    await tool(token, 'propose_relationship', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'lo-pays',
      baseRevision: null,
      typeRevision: pays.revision,
      value: { typeId: pays.id, sourceId: 'lo', targetId: 'subscription' },
    })
  ).value;
  expect(review.relationships[0].type.name).toBe('Betalar');
  expect((await (await browser.get(path)).json()).objects).toEqual([]);
  // An explicit correction plus save uses the returned corrected version, without another gate.
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'subscription',
      baseRevision: null,
      typeRevision: subscription.revision,
      value: {
        ...value,
        properties: value.properties.map((property) =>
          property.id === 'price' ? { ...property, value: '189' } : property,
        ),
      },
    })
  ).value;
  const attempt = {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'family-mcp-save',
  };
  const saved = await tool(token, 'save_draft', attempt);
  expect(saved.error).toBe(false);
  expect(saved.value.receipt.changes).toHaveLength(2);
  expect(saved.value.receipt.relationships).toHaveLength(1);
  expect(
    saved.value.receipt.changes
      .find((change: { after: { id: string } }) => change.after.id === 'subscription')
      .after.properties.find((property: { id: string }) => property.id === 'price').value,
  ).toBe('189');
  await app.restart();
  expect((await tool(token, 'save_draft', attempt)).value).toEqual(saved.value);
  const recovered = await tool(token, 'read_save_operation', { operationId: attempt.operationId });
  expect(recovered.value.operation).toMatchObject({
    status: 'succeeded',
    receipt: saved.value.receipt,
  });
  const state = await (await browser.get(path)).json();
  expect(state.draft.changes).toEqual([]);
  expect(state.objects).toHaveLength(2);
  expect((await (await browser.get(`${path}/history`)).json()).history).toMatchObject([
    saved.value.receipt,
  ]);
});

test('unresolved identity blocks all saving, explicit unspecified identity can resolve it and discards return the remaining whole draft', async () => {
  const token = await connect();
  const catalog = (await tool(token, 'read_type_catalog')).value;
  const type = catalog.types.find((type: { name: string }) => type.name === 'Bankkonto');
  const value = { typeId: type.id, name: 'Betalkonto', identity: 'unresolved' };
  let review = (
    await tool(token, 'propose_object', {
      version: 0,
      contentVersion: catalog.contentVersion,
      id: 'bank',
      baseRevision: null,
      value,
    })
  ).value;
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'independent',
      baseRevision: null,
      value: { typeId: type.id, name: 'Hushållskonto' },
    })
  ).value;
  expect(review.readyToSave).toBe(false);
  expect(review.unresolvedIdentities).toEqual([{ kind: 'object', id: 'bank' }]);
  const blocked = await tool(token, 'save_draft', {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'blocked-identity',
  });
  expect(blocked).toMatchObject({ error: true, value: { error: 'unresolved_identity' } });
  expect(blocked.value.review.changes).toHaveLength(2);
  expect((await (await browser.get(path)).json()).objects).toEqual([]);
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'bank',
      baseRevision: null,
      value: { ...value, identity: 'unspecified' },
    })
  ).value;
  expect(review.readyToSave).toBe(true);
  review = (
    await tool(token, 'discard_proposal', {
      version: review.version,
      contentVersion: review.contentVersion,
      kind: 'object',
      id: 'independent',
    })
  ).value;
  expect(review.changes.map((change: { id: string }) => change.id)).toEqual(['bank']);
  expect(review.changes[0].after.identity).toBe('unspecified');
  review = (
    await tool(token, 'discard_draft', {
      version: review.version,
      contentVersion: review.contentVersion,
    })
  ).value;
  expect(review.changes).toEqual([]);
  expect(review.readyToSave).toBe(false);
});

test('a conflicting saved price blocks independent proposals and resolving to the saved value returns the whole remaining draft', async () => {
  const token = await connect();
  const catalog = (await tool(token, 'read_type_catalog')).value;
  const type = catalog.types.find((type: { name: string }) => type.name === 'Abonnemang');
  const value = {
    typeId: type.id,
    name: 'Familjemusik',
    properties: [{ id: 'price', label: 'Pris', kind: 'text', value: '149' }],
  };
  await post('draft', { version: 0, id: 'music', baseRevision: null, value });
  await post('save', { version: 1, operationId: 'original' });
  let state = await (await browser.get(path)).json();
  let review = (
    await tool(token, 'propose_object', {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: 'music',
      baseRevision: 1,
      value: { ...value, properties: [{ id: 'price', label: 'Pris', kind: 'text', value: '79' }] },
    })
  ).value;
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'other',
      baseRevision: null,
      value: { typeId: type.id, name: 'Oberoende avtal' },
    })
  ).value;
  const other = await request.newContext();
  try {
    app.setIdentity(robin);
    await signIn(other, app.origin, 'microsoft');
    const { user } = await (await other.get(`${app.origin}/api/bootstrap`)).json();
    const { code } = await (
      await browser.post(`${app.origin}/api/households/${householdId}/invitations`, {
        headers: { origin: app.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await other.post(`${path}/draft`, {
          headers: { origin: app.origin },
          data: {
            version: 0,
            id: 'music',
            baseRevision: 1,
            value: {
              ...value,

              properties: [{ id: 'price', label: 'Pris', kind: 'text', value: '199' }],
            },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await other.post(`${path}/save`, {
          headers: { origin: app.origin },
          data: { version: 1, operationId: 'other-price' },
        })
      ).status(),
    ).toBe(200);
    const blocked = await tool(token, 'save_draft', {
      version: review.version,
      contentVersion: review.contentVersion,
      operationId: 'old-price',
    });
    expect(blocked).toMatchObject({ error: true, value: { error: 'object_conflict' } });
    expect(blocked.value.message).toContain('nytt sparbesked');
    review = blocked.value.review;
    expect(review.readyToSave).toBe(false);
    expect(
      review.current.objects[0].properties.find(
        (property: { id: string }) => property.id === 'price',
      ).value,
    ).toBe('199');
    expect(review.changes).toHaveLength(2);
    state = await (await browser.get(path)).json();
    expect(state.objects.map((object: { id: string }) => object.id)).toEqual(['music']);
    const staleResolution = review.resolutions[0];
    expect(staleResolution.properties).toContainEqual(
      expect.objectContaining({
        key: 'properties.price',
        before: expect.objectContaining({ value: '149' }),
        saved: expect.objectContaining({ value: '199' }),
        proposed: expect.objectContaining({ value: '79' }),
      }),
    );
    const otherState = await (await other.get(path)).json();
    const updated = await other.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: otherState.draft.version,
        contentVersion: otherState.contentVersion,
        id: 'music',
        baseRevision: 2,
        value: {
          ...value,

          properties: [{ id: 'price', label: 'Pris', kind: 'text', value: '201' }],
        },
      },
    });
    expect(updated.status()).toBe(200);
    const otherDraft = await updated.json();
    expect(
      (
        await other.post(`${path}/save`, {
          headers: { origin: app.origin },
          data: {
            version: otherDraft.version,
            contentVersion: otherState.contentVersion,
            operationId: 'new-price',
          },
        })
      ).status(),
    ).toBe(200);
    const beforeStale = await (await browser.get(path)).json();
    const stale = await tool(token, 'resolve_conflict', {
      version: review.version,
      contentVersion: review.contentVersion,
      conflict: staleResolution.conflict,
      basis: staleResolution.basis,
      choices: { 'properties.price': 'saved' },
    });
    expect(stale.value.error).toBe('resolution_conflict');
    expect(await (await browser.get(path)).json()).toEqual(beforeStale);
    review = stale.value.review;
    review = (
      await tool(token, 'resolve_conflict', {
        version: review.version,
        contentVersion: review.contentVersion,
        choices: { 'properties.price': 'saved' },
        conflict: review.resolutions[0].conflict,
        basis: review.resolutions[0].basis,
      })
    ).value;
    expect(review.changes.map((change: { id: string }) => change.id)).toEqual(['other']);
    const saved = await tool(token, 'save_draft', {
      version: review.version,
      contentVersion: review.contentVersion,
      operationId: 'resolved-whole-draft',
    });
    expect(
      saved.value.receipt.changes.map((change: { after: { id: string } }) => change.after.id),
    ).toEqual(['other']);
  } finally {
    await other.dispose();
  }
});

test('registered save recovery protects a waiting whole draft and rejects changed requests under the same ID', async () => {
  const token = await connect();
  const state = await (await browser.get(path)).json();
  const value = { typeId: state.types[0].id, name: 'Lo' };
  const review = (
    await tool(token, 'propose_object', {
      version: 0,
      contentVersion: state.contentVersion,
      id: 'lo',
      baseRevision: null,
      value,
    })
  ).value;
  const attempt = {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'waiting-save',
  };
  const prepared = await tool(token, 'prepare_save', attempt);
  expect(prepared.value.operation.status).toBe('pending');
  await app.restart();
  const waiting = (await tool(token, 'read_my_save_operations')).value.operations;
  expect(waiting).toEqual([prepared.value.operation]);
  expect((await tool(token, 'read_my_draft')).value.pendingOperations).toEqual(waiting);
  const blocked = await tool(token, 'propose_object', {
    version: review.version,
    contentVersion: review.contentVersion,
    id: 'lo',
    baseRevision: null,
    value: { ...value, name: 'Fel rättelse' },
  });
  expect(blocked.value.error).toBe('operation_pending');
  expect(
    (await tool(token, 'save_draft', { ...attempt, version: review.version + 1 })).value.error,
  ).toBe('operation_conflict');
  expect(
    (await tool(token, 'read_save_operation', { operationId: attempt.operationId })).value.operation
      .status,
  ).toBe('pending');
  const saved = (await tool(token, 'save_draft', attempt)).value;
  expect(saved.receipt.changes[0].after.name).toBe('Lo');
  expect((await tool(token, 'read_my_save_operations')).value.operations[0]).toMatchObject({
    status: 'succeeded',
    receipt: saved.receipt,
  });
  expect(
    (await tool(token, 'read_save_operation', { operationId: 'never-registered' })).value,
  ).toEqual({ operation: null });
});

test('the actual MCP initialization teaches whole-draft intent and recovery without claiming proof of human consent', async () => {
  const token = await connect();
  const client = new Client({ name: 'Påhittad textklient', version: '1' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    const instructions = client.getInstructions() ?? '';
    for (const required of [
      'hela utkastet',
      'hypotetiska',
      'Spara inte',
      'samma meddelande',
      'nytt sparbesked',
      'okänt',
      'kvittot',
      'bevis',
      'Kontrollera hela utkastet internt',
      'Ge detaljer först när användaren frågar',
      'Fråga inte om lov att göra ett förslag som redan är beställt',
      'fråga endast om den faktiskt oklara delen',
    ])
      expect(instructions).toContain(required);
    expect(instructions).not.toContain('Återge hela utkastet begripligt');
    const tools = (await client.listTools()).tools.map(({ name }) => name);
    expect(tools).toContain('save_draft');
    expect(tools.join(' ')).not.toMatch(/export|import|erase|member|admin/);
    const context = await (await browser.get(`${app.origin}/api/assistants/context`)).json();
    expect(
      (
        await browser.post(`${app.origin}/api/assistants/${context.connections[0].id}/revoke`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    await expect(client.callTool({ name: 'read_my_draft', arguments: {} })).rejects.toThrow();
    await expect(
      client.callTool({
        name: 'save_draft',
        arguments: { version: 0, contentVersion: 1, operationId: 'revoked' },
      }),
    ).rejects.toThrow();
  } finally {
    await client.close();
  }
});

test('a database interruption returns unknown outcome without leaking diagnostics and recovery retries only the durable operation', async () => {
  const token = await connect();
  const state = await (await browser.get(path)).json();
  const review = (
    await tool(token, 'propose_object', {
      version: 0,
      contentVersion: state.contentVersion,
      id: 'lo',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Lo' },
    })
  ).value;
  const attempt = {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'interrupted',
  };
  const disk = new Database(join(app.directory, 'skyttel.db'));
  try {
    disk.exec(
      "CREATE TRIGGER interrupt_receipt BEFORE INSERT ON map_save BEGIN SELECT RAISE(ABORT, 'PRIVATE SYNTHETIC CONTENT'); END",
    );
    const unknown = await tool(token, 'save_draft', attempt);
    expect(unknown).toMatchObject({ error: true, value: { error: 'result_unknown' } });
    expect(JSON.stringify(unknown)).not.toContain('PRIVATE SYNTHETIC CONTENT');
    expect(
      (await tool(token, 'read_save_operation', { operationId: attempt.operationId })).value
        .operation.status,
    ).toBe('pending');
    const untouched = await (await browser.get(path)).json();
    expect(untouched.objects).toEqual([]);
    expect(untouched.draft.changes).toHaveLength(1);
    disk.exec('DROP TRIGGER interrupt_receipt');
    await app.restart();
    const saved = await tool(token, 'save_draft', attempt);
    expect(saved.value.receipt.changes[0].after.name).toBe('Lo');
    expect((await (await browser.get(`${path}/history`)).json()).history).toHaveLength(1);
  } finally {
    disk.close();
  }
});

test('a newer browser proposal rejects stale approval and returns both proposals without a partial save', async () => {
  const token = await connect();
  const state = await (await browser.get(path)).json();
  const value = { typeId: state.types[0].id, name: 'Lo' };
  const review = (
    await tool(token, 'propose_object', {
      version: 0,
      contentVersion: state.contentVersion,
      id: 'lo',
      baseRevision: null,
      value,
    })
  ).value;
  await post('draft', {
    version: review.version,
    id: 'kim',
    baseRevision: null,
    value: { ...value, name: 'Kim' },
  });
  const oldAttempt = {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'stale-approval',
  };
  const stale = await tool(token, 'save_draft', oldAttempt);
  expect(stale.value.error).toBe('draft_conflict');
  expect(stale.value.review.version).toBe(review.version + 1);
  expect(stale.value.review.changes).toHaveLength(2);
  expect((await (await browser.get(path)).json()).objects).toEqual([]);
  expect(
    (await tool(token, 'save_draft', { ...oldAttempt, version: stale.value.review.version })).value
      .error,
  ).toBe('operation_conflict');
  expect(
    (await tool(token, 'read_save_operation', { operationId: oldAttempt.operationId })).value
      .operation,
  ).toMatchObject({ status: 'rejected', error: 'draft_conflict' });
});

test('read grants cannot gain mutation tools through new clients, crafted calls or refresh scope expansion', async () => {
  const flow = await beginAssistant(browser, app.origin);
  const accepted = await flow.consent(householdId);
  const tokens = await (await flow.exchange((await accepted.json()).url)).json();
  await connect();
  for (const name of [
    'propose_object',
    'propose_relationship',
    'save_draft',
    'prepare_save',
    'discard_draft',
    'discard_proposal',
    'resolve_conflict',
  ]) {
    const denied = await (await callAssistant(app.origin, tokens.access_token, name)).json();
    expect(denied.result?.isError || denied.error).toBeTruthy();
  }
  const expanded = await fetch(`${app.origin}/api/auth/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: flow.clientId,
      refresh_token: tokens.refresh_token,
      resource: `${app.origin}/mcp`,
      scope: 'skyttel:read skyttel:write',
    }),
  });
  expect(expanded.ok).toBe(false);
  const refreshed = await fetch(`${app.origin}/api/auth/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: flow.clientId,
      refresh_token: tokens.refresh_token,
      resource: `${app.origin}/mcp`,
    }),
  });
  expect(refreshed.status).toBe(200);
  const denied = await (
    await callAssistant(app.origin, (await refreshed.json()).access_token, 'save_draft', {
      version: 0,
      contentVersion: 1,
      operationId: 'no-write',
    })
  ).json();
  expect(denied.result?.isError || denied.error).toBeTruthy();
  expect((await (await browser.get(path)).json()).draft.changes).toEqual([]);
});

test('MCP uses verified historical ownership and rejects old generations and retired save IDs', async () => {
  const { user } = await (await browser.get(`${app.origin}/api/bootstrap`)).json();
  const disk = new Database(join(app.directory, 'skyttel.db'));
  try {
    // Arrange the verified binding created by an import; the login actor stays unchanged.
    disk
      .prepare('UPDATE content_identity SET userId = NULL WHERE householdId = ? AND userId = ?')
      .run(householdId, user.id);
    disk
      .prepare('INSERT INTO content_identity (householdId, id, name, userId) VALUES (?, ?, ?, ?)')
      .run(householdId, 'historical-owner', 'Historiska Alex', user.id);
    const token = await connect();
    const state = await (await browser.get(path)).json();
    expect(state.userId).toBe('historical-owner');
    const value = { typeId: state.types[0].id, name: 'Historiskt återupptaget' };
    let review = (
      await tool(token, 'propose_object', {
        version: 0,
        contentVersion: 1,
        id: 'restored-owner-object',
        baseRevision: null,
        value,
      })
    ).value;
    const attempt = {
      version: review.version,
      contentVersion: 1,
      operationId: 'previous-generation',
    };
    const saved = await tool(token, 'save_draft', attempt);
    expect(saved.value.receipt.userId).toBe('historical-owner');
    disk.prepare('UPDATE household SET contentVersion = 2 WHERE id = ?').run(householdId);
    review = (await tool(token, 'read_my_draft')).value;
    expect(review.contentVersion).toBe(2);
    for (const [name, args] of [
      ['propose_object', { id: 'new-object', baseRevision: null, value }],
      ['propose_relationship', { id: 'new-edge', baseRevision: null, value: null }],
      ['discard_proposal', { id: 'restored-owner-object', kind: 'object' }],
      ['discard_draft', {}],
      ['resolve_conflict', { choice: 'saved', conflict: {} }],
      ['prepare_save', { operationId: 'new-attempt' }],
      ['save_draft', { operationId: 'new-save' }],
    ] as const) {
      expect(
        (await tool(token, name, { ...args, version: review.version, contentVersion: 1 })).value
          .error,
      ).toBe('content_conflict');
    }
    expect(
      (await tool(token, 'read_save_operation', { operationId: attempt.operationId })).value
        .operation,
    ).toBeNull();
    expect(
      (await tool(token, 'save_draft', { ...attempt, contentVersion: 2, version: review.version }))
        .value.error,
    ).toBe('content_conflict');
    const valid = await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: 2,
      id: 'new-object',
      baseRevision: null,
      value: { ...value, name: 'Ny version' },
    });
    expect(valid.error).toBe(false);
    disk
      .prepare(`INSERT INTO content_maintenance
      (id, householdId, actorId, kind, phase, contentVersion, requestHash, createdAt, updatedAt)
      VALUES ('paused-import', ?, ?, 'import', 'prepared', 2, 'synthetic', '2026-09-24', '2026-09-24')`)
      .run(householdId, user.id);
    const denied = await tool(token, 'read_type_catalog');
    expect(denied.value.error).toBe('content_maintenance');
    expect(denied.value.review).toBeUndefined();
    expect(JSON.stringify(denied)).not.toContain('Historiskt återupptaget');
  } finally {
    disk.close();
  }
});

test('current household definitions and independent properties work without a fixed type catalog', async () => {
  await post('object-type', {
    version: 0,
    id: 'local-type',
    baseRevision: null,
    value: {
      name: 'Solcellsanläggning',
      description: 'Hushållets egen typ',
    },
  });
  const token = await connect();
  const catalog = (await tool(token, 'read_type_catalog')).value;
  const type = catalog.types.find((type: { id: string }) => type.id === 'local-type');
  expect(type.description).toBe('Hushållets egen typ');
  let review = (await tool(token, 'read_my_draft')).value;
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'roof',
      baseRevision: null,
      typeRevision: type.revision,
      value: {
        typeId: type.id,
        name: 'Takets solceller',
        properties: [
          { id: 'inspected', label: 'Besiktigad', kind: 'boolean', value: false },
          { id: 'power', label: 'Effekt', kind: 'number', value: 8 },
        ],
      },
    })
  ).value;
  expect(review.objectTypes).toHaveLength(1);
  expect(review.changes[0].after.properties).toEqual([
    { id: 'inspected', label: 'Besiktigad', kind: 'boolean', value: false },
    { id: 'power', label: 'Effekt', kind: 'number', value: 8 },
  ]);
  const saved = await tool(token, 'save_draft', {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'custom-fields',
  });
  expect(saved.value.receipt.changes[0].after.properties).toEqual([
    { id: 'inspected', label: 'Besiktigad', kind: 'boolean', value: false },
    { id: 'power', label: 'Effekt', kind: 'number', value: 8 },
  ]);
  expect(saved.value.receipt.objectTypes[0].after.id).toBe('local-type');
  const state = await (await browser.get(path)).json();
  const staleType = await tool(token, 'propose_object', {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    id: 'roof',
    baseRevision: 1,
    typeRevision: type.revision + 99,
    value: {
      typeId: type.id,
      name: 'Takets solceller',
      properties: [{ id: 'power', label: 'Effekt', kind: 'number', value: 8 }],
    },
  });
  expect(staleType.value.error).toBe('type_conflict');
  review = (
    await tool(token, 'propose_object', {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: 'roof',
      baseRevision: 1,
      typeRevision: type.revision,
      value: {
        typeId: type.id,
        name: 'Takets solceller',
        properties: [{ id: 'power', label: 'Effekt', kind: 'number', value: 8 }],
      },
    })
  ).value;
  expect(review.changes[0].after.properties).toEqual([
    { id: 'power', label: 'Effekt', kind: 'number', value: 8 },
  ]);
  expect(
    review.current.objects[0].properties.find(
      (property: { id: string }) => property.id === 'inspected',
    ).value,
  ).toBe(false);
});

test('real HTTP and MCP reject invalid endpoint requests atomically and serialize duplicate edits', async () => {
  const token = await connect();
  let state = await (await browser.get(path)).json();
  for (const id of ['source', 'target', 'standalone']) {
    await post('draft', {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id,
      baseRevision: null,
      value: { typeId: state.types[0].id, name: id },
    });
    state = await (await browser.get(path)).json();
  }
  const value = {
    typeId: state.relationshipTypes[0].id,
    sourceId: 'source',
    targetId: 'target',
  };
  await tool(token, 'propose_relationship', {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    id: 'edge',
    baseRevision: null,
    value,
  });
  state = await (await browser.get(path)).json();
  for (const id of ['invalid', 'edge']) {
    for (const endpoint of ['sourceId', 'targetId']) {
      for (const invalid of [null, '', 'invented', undefined]) {
        const body = {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id,
          baseRevision: null,
          value: { ...value, [endpoint]: invalid },
        };
        const response = await browser.post(`${path}/relationship`, {
          headers: { origin: app.origin },
          data: body,
        });
        expect(response.status()).toBe(400);
        const mcp = await callAssistant(app.origin, token, 'propose_relationship', body);
        expect((await mcp.json()).result.isError).toBe(true);
        expect(await (await browser.get(path)).json()).toEqual(state);
      }
    }
  }
  expect(
    (
      await tool(token, 'save_draft', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        operationId: 'valid-endpoints',
      })
    ).error,
  ).toBe(false);
  state = await (await browser.get(path)).json();
  expect(state.objects).toHaveLength(3);
  expect(state.relationships).toMatchObject([{ sourceId: 'source', targetId: 'target' }]);
  const duplicate = await tool(token, 'propose_relationship', {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    id: 'duplicate',
    baseRevision: null,
    value: { ...value },
  });
  expect(duplicate.value.existingId).toBe('edge');
  expect(await (await browser.get(path)).json()).toEqual(state);
  // Two requests at the same draft version cannot create two identities.
  const responses = await Promise.all(
    ['self-one', 'self-two'].map((id) =>
      browser.post(`${path}/relationship`, {
        headers: { origin: app.origin },
        data: {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id,
          baseRevision: null,
          value: { ...value, targetId: 'source' },
        },
      }),
    ),
  );
  expect(responses.map((response) => response.status()).sort()).toEqual([200, 409]);
  state = await (await browser.get(path)).json();
  const selfId = state.draft.relationships[0].id;
  expect(
    (
      await tool(token, 'propose_relationship', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        id: 'edge',
        baseRevision: 1,
        value: { ...value, targetId: 'source' },
      })
    ).value.error,
  ).toBe('duplicate_relationship');
  expect(await (await browser.get(path)).json()).toEqual(state);
  expect(
    (
      await tool(token, 'save_draft', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        operationId: 'self-endpoint',
      })
    ).error,
  ).toBe(false);
  expect((await (await browser.get(path)).json()).relationships).toMatchObject([
    { id: 'edge', targetId: 'target' },
    { id: selfId, targetId: 'source' },
  ]);
});

test('relationship meanings, duplicate selection and ordinary removal preserve the full review and saved data until approval', async () => {
  const token = await connect();
  const catalog = (await tool(token, 'read_type_catalog')).value;
  const typeId = catalog.types[0].id;
  const edgeType = catalog.relationshipTypes.find(
    (type: { name: string }) => type.name === 'Använder',
  );
  let review = await (await browser.get(path)).json();
  for (const [id, name] of [
    ['lo', 'Lo Exempel'],
    ['service', 'Molnmusik'],
  ]) {
    const version = review.version ?? review.draft.version;
    review = (
      await tool(token, 'propose_object', {
        version,
        contentVersion: catalog.contentVersion,
        id,
        baseRevision: null,
        value: { typeId, name },
      })
    ).value;
  }
  const edge = {
    typeId: edgeType.id,
    sourceId: 'lo',
    targetId: 'service',
    properties: [{ id: 'certainty', label: 'Säkerhet', kind: 'text', value: 'Osäkert uppgivet' }],
  };
  review = (
    await tool(token, 'propose_relationship', {
      version: review.version,
      contentVersion: 1,
      id: 'uses',
      baseRevision: null,
      value: edge,
    })
  ).value;
  expect(review.unresolvedIdentities).toEqual([]);
  expect(review.readyToSave).toBe(true);
  const duplicate = await tool(token, 'propose_relationship', {
    version: review.version,
    contentVersion: 1,
    id: 'duplicate',
    baseRevision: null,
    value: { ...edge, targetId: 'service' },
  });
  expect(duplicate.value.existingId).toBe('uses');
  expect(duplicate.value.version).toBe(review.version);
  expect(duplicate.value.relationships).toHaveLength(1);
  const invalid = await tool(token, 'propose_relationship', {
    version: review.version,
    contentVersion: 1,
    id: 'uses',
    baseRevision: null,
    value: { ...edge, targetId: 'missing' },
  });
  expect(invalid.value.error).toBe('invalid_endpoint');
  const saved = await tool(token, 'save_draft', {
    version: review.version,
    contentVersion: 1,
    operationId: 'relationship-save',
  });
  expect(saved.value.receipt.relationships[0].after.properties).toEqual(edge.properties);
  review = (await tool(token, 'read_my_draft')).value;
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: 1,
      id: 'service',
      baseRevision: 1,
      value: null,
    })
  ).value;
  expect(review.relationships).toMatchObject([{ id: 'uses', after: null }]);
  expect(review.current.relationships).toHaveLength(1);
  expect(review.current.relationshipTypes[0].name).toBe('Använder');
  expect(review.current.objects.map((object: { name: string }) => object.name)).toEqual([
    'Lo Exempel',
    'Molnmusik',
  ]);
  expect((await tool(token, 'read_map')).value.objects).toHaveLength(2);
  review = (
    await tool(token, 'discard_proposal', {
      version: review.version,
      contentVersion: 1,
      kind: 'object',
      id: 'service',
    })
  ).value;
  expect(review.changes).toEqual([]);
  expect(review.relationships ?? []).toEqual([]);
  review = (
    await tool(token, 'propose_relationship', {
      version: review.version,
      contentVersion: 1,
      id: 'uses',
      baseRevision: 1,
      value: null,
    })
  ).value;
  expect(review.relationships[0].after).toBeNull();
});

test('write clients keep drafts and operations private and membership removal stops further mutation', async () => {
  const token = await connect();
  const state = await (await browser.get(path)).json();
  const own = (
    await tool(token, 'propose_object', {
      version: 0,
      contentVersion: state.contentVersion,
      id: 'alex-private',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Alex privata förslag' },
    })
  ).value;
  await tool(token, 'prepare_save', {
    version: own.version,
    contentVersion: own.contentVersion,
    operationId: 'alex-private-operation',
  });
  const other = await request.newContext();
  try {
    app.setIdentity(robin);
    await signIn(other, app.origin, 'microsoft');
    const { user } = await (await other.get(`${app.origin}/api/bootstrap`)).json();
    const { code } = await (
      await browser.post(`${app.origin}/api/households/${householdId}/invitations`, {
        headers: { origin: app.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code },
        })
      ).status(),
    ).toBe(200);
    const flow = await beginAssistant(other, app.origin, 'skyttel:read skyttel:write');
    const accepted = await flow.consent(householdId);
    const otherToken = (await (await flow.exchange((await accepted.json()).url)).json())
      .access_token;
    const theirs = await tool(otherToken, 'read_my_draft');
    expect(theirs.value.changes).toEqual([]);
    expect(JSON.stringify(theirs)).not.toContain('Alex privata');
    expect(
      (await tool(otherToken, 'read_save_operation', { operationId: 'alex-private-operation' }))
        .value.operation,
    ).toBeNull();
    expect((await tool(otherToken, 'read_my_save_operations')).value.operations).toEqual([]);
    const proposal = {
      version: 0,
      contentVersion: state.contentVersion,
      id: 'robin-private',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Robins privata förslag' },
    };
    const spoof = await (
      await callAssistant(app.origin, otherToken, 'propose_object', {
        ...proposal,
        userId: state.userId,
        householdId,
      })
    ).json();
    expect(spoof.result.isError).toBe(true);
    expect((await tool(otherToken, 'propose_object', proposal)).error).toBe(false);
    const privateState = await tool(otherToken, 'read_my_draft');
    const rejectedEndpoint = await tool(otherToken, 'propose_relationship', {
      version: privateState.value.version,
      contentVersion: state.contentVersion,
      id: 'private-endpoint',
      baseRevision: null,
      value: {
        typeId: state.relationshipTypes[0].id,
        sourceId: 'robin-private',
        targetId: 'alex-private',
      },
    });
    expect(rejectedEndpoint.value.error).toBe('invalid_endpoint');
    expect((await tool(otherToken, 'read_my_draft')).value).toEqual(privateState.value);
    expect(JSON.stringify((await tool(token, 'read_my_draft')).value)).not.toContain(
      'Robins privata',
    );
    expect(
      (
        await browser.post(
          `${app.origin}/api/households/${householdId}/members/${user.id}/revoke`,
          { headers: { origin: app.origin }, data: {} },
        )
      ).status(),
    ).toBe(200);
    for (const name of ['read_my_draft', 'propose_object', 'prepare_save', 'save_draft'])
      expect((await callAssistant(app.origin, otherToken, name, proposal)).status).toBe(401);
  } finally {
    await other.dispose();
  }
});
