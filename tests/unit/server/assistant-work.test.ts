import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
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
    data,
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

test('explicit write consent permits proposals while an earlier read grant stays read-only', async () => {
  const readToken = await connect(false);
  const state = await (await browser.get(path)).json();
  const value = { typeId: state.types[0].id, name: 'Lo Exempel', description: '' };
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
          description,
          financialFacts: { price: { knowledge: 'known', value: amount } },
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
        value: { typeId: edgeType.id, sourceId, targetId, knowledge: 'known' },
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
        description: changed.description,
        financialFacts: { price: { knowledge: 'known', value: '189' } },
      },
    })
  ).value;
  expect(review.changes[0].before.financialFacts.price.value).toBe('149');
  expect(review.changes[0].after.financialFacts.price.value).toBe('189');
  expect(
    review.current.objects.find((object: { id: string }) => object.id === 'changed'),
  ).toMatchObject({
    description: 'Berörd sparad anteckning',
    financialFacts: changed.financialFacts,
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
        knowledge: 'uncertain',
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
    value: { typeId: person.id, name: 'Lo', description: 'Tidigare förslag från formuläret' },
  });
  let review = (await tool(token, 'read_my_draft')).value;
  expect(review.changes[0].after.name).toBe('Lo');
  const value = {
    typeId: subscription.id,
    name: 'Familjemusik',
    description: '',
    financialFacts: {
      price: { knowledge: 'known', value: '149' },
      currency: { knowledge: 'known', value: 'SEK' },
      paymentInterval: { knowledge: 'known', value: 'månad' },
    },
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
      value: { typeId: pays.id, sourceId: 'lo', targetId: 'subscription', knowledge: 'known' },
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
        financialFacts: { ...value.financialFacts, price: { knowledge: 'known', value: '189' } },
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
    saved.value.receipt.changes.find(
      (change: { after: { id: string } }) => change.after.id === 'subscription',
    ).after.financialFacts.price.value,
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
  expect((await (await browser.get(`${path}/history`)).json()).history).toEqual([
    saved.value.receipt,
  ]);
});

test('unresolved identity blocks all saving, explicit unspecified identity can resolve it and discards return the remaining whole draft', async () => {
  const token = await connect();
  const catalog = (await tool(token, 'read_type_catalog')).value;
  const type = catalog.types.find((type: { name: string }) => type.name === 'Bankkonto');
  const value = { typeId: type.id, name: 'Betalkonto', description: '', identity: 'unresolved' };
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
      value: { typeId: type.id, name: 'Hushållskonto', description: '' },
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
    description: '',
    financialFacts: { price: { knowledge: 'known', value: '149' } },
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
      value: { ...value, financialFacts: { price: { knowledge: 'known', value: '79' } } },
    })
  ).value;
  review = (
    await tool(token, 'propose_object', {
      version: review.version,
      contentVersion: review.contentVersion,
      id: 'other',
      baseRevision: null,
      value: { typeId: type.id, name: 'Oberoende avtal', description: '' },
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
            value: { ...value, financialFacts: { price: { knowledge: 'known', value: '199' } } },
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
    expect(review.current.objects[0].financialFacts.price.value).toBe('199');
    expect(review.changes).toHaveLength(2);
    state = await (await browser.get(path)).json();
    expect(state.objects.map((object: { id: string }) => object.id)).toEqual(['music']);
    review = (
      await tool(token, 'resolve_conflict', {
        version: review.version,
        contentVersion: review.contentVersion,
        choice: 'saved',
        conflict: review.conflicts[0],
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
  const value = { typeId: state.types[0].id, name: 'Lo', description: '' };
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
      value: { typeId: state.types[0].id, name: 'Lo', description: '' },
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
  const value = { typeId: state.types[0].id, name: 'Lo', description: '' };
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
    const value = { typeId: state.types[0].id, name: 'Historiskt återupptaget', description: '' };
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

test('current household definitions and independent custom fields work without a fixed type catalog', async () => {
  await post('object-type', {
    version: 0,
    id: 'local-type',
    baseRevision: null,
    value: {
      name: 'Solcellsanläggning',
      description: 'Hushållets egen typ',
      fields: [
        { id: 'inspected', name: 'Besiktigad', description: '', kind: 'boolean' },
        { id: 'power', name: 'Effekt', description: '', kind: 'number' },
      ],
    },
  });
  const token = await connect();
  const catalog = (await tool(token, 'read_type_catalog')).value;
  const type = catalog.types.find((type: { id: string }) => type.id === 'local-type');
  expect(type.fields[0].kind).toBe('boolean');
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
        description: '',
        customValues: { inspected: false, power: 8 },
      },
    })
  ).value;
  expect(review.objectTypes).toHaveLength(1);
  expect(review.changes[0].after.customValues).toEqual({ inspected: false, power: 8 });
  const saved = await tool(token, 'save_draft', {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: 'custom-fields',
  });
  expect(saved.value.receipt.changes[0].after.customValues).toEqual({ inspected: false, power: 8 });
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
      description: '',
      customValues: { power: 8 },
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
        description: '',
        customValues: { power: 8 },
      },
    })
  ).value;
  expect(review.changes[0].after.customValues).toEqual({ power: 8 });
  expect(review.current.objects[0].customValues.inspected).toBe(false);
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
        value: { typeId, name, description: '' },
      })
    ).value;
  }
  const edge = { typeId: edgeType.id, sourceId: 'lo', targetId: null, knowledge: 'unresolved' };
  review = (
    await tool(token, 'propose_relationship', {
      version: review.version,
      contentVersion: 1,
      id: 'uses',
      baseRevision: null,
      value: edge,
    })
  ).value;
  expect(review.unresolvedIdentities).toEqual([{ kind: 'relationship', id: 'uses' }]);
  for (const knowledge of ['unknown', 'none', 'uncertain']) {
    review = (
      await tool(token, 'propose_relationship', {
        version: review.version,
        contentVersion: 1,
        id: 'uses',
        baseRevision: null,
        value: { ...edge, knowledge, targetId: knowledge === 'uncertain' ? 'service' : null },
      })
    ).value;
    expect(review.relationships[0].after.knowledge).toBe(knowledge);
    expect(review.readyToSave).toBe(true);
  }
  const duplicate = await tool(token, 'propose_relationship', {
    version: review.version,
    contentVersion: 1,
    id: 'duplicate',
    baseRevision: null,
    value: { ...edge, knowledge: 'uncertain', targetId: 'service' },
  });
  expect(duplicate.value.existingId).toBe('uses');
  expect(duplicate.value.version).toBe(review.version);
  expect(duplicate.value.relationships).toHaveLength(1);
  const invalid = await tool(token, 'propose_relationship', {
    version: review.version,
    contentVersion: 1,
    id: 'uses',
    baseRevision: null,
    value: { ...edge, knowledge: 'known' },
  });
  expect(invalid.value.error).toBe('invalid_request');
  const saved = await tool(token, 'save_draft', {
    version: review.version,
    contentVersion: 1,
    operationId: 'relationship-save',
  });
  expect(saved.value.receipt.relationships[0].after.knowledge).toBe('uncertain');
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
      value: { typeId: state.types[0].id, name: 'Alex privata förslag', description: '' },
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
      value: { typeId: state.types[0].id, name: 'Robins privata förslag', description: '' },
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
