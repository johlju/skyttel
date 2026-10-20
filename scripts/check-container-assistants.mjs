import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

// The synthetic browser session is seeded by the existing production fixture.
// Every assistant grant and map action goes through production HTTP and OAuth.
export async function checkContainerAssistants({
  command,
  request,
  waitUntilReady,
  name,
  fixture,
  origin,
}) {
  async function authorize(write) {
    const scope = write ? 'skyttel:read skyttel:write' : 'skyttel:read';
    const registered = await request(name, '/api/auth/oauth2/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        application_type: 'native',
        client_name: 'Synthetic container assistant',
        redirect_uris: ['http://127.0.0.1:7777/callback'],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        scope,
      }),
    });
    assert.equal(registered.status, 201);
    const { client_id: clientId } = JSON.parse(registered.body);
    const verifier = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: 'http://127.0.0.1:7777/callback',
      scope,
      resource: `${origin}/mcp`,
      state: 'synthetic-state',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const redirected = await request(name, `/api/auth/oauth2/authorize?${query}`, {
      headers: { cookie: fixture.cookie },
    });
    assert.equal(redirected.status, 302);
    const consentUrl = new URL(redirected.headers.location, origin);
    const consent = await request(name, '/api/assistants/consent', {
      method: 'POST',
      headers: { cookie: fixture.cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        accept: true,
        externalAi: true,
        mapWork: write,
        householdId: fixture.householdId,
        oauth_query: consentUrl.search.slice(1),
      }),
    });
    assert.equal(consent.status, 200);
    const callback = new URL(JSON.parse(consent.body).url);
    const exchange = await request(name, '/api/auth/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: callback.searchParams.get('code'),
        code_verifier: verifier,
        redirect_uri: 'http://127.0.0.1:7777/callback',
        resource: `${origin}/mcp`,
      }).toString(),
    });
    assert.equal(exchange.status, 200);
    return { token: JSON.parse(exchange.body).access_token, clientId };
  }
  async function rpc(token, method, params) {
    const response = await request(name, '/mcp', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        ...(params ? { params } : {}),
      }),
    });
    assert.equal(response.status, 200);
    return JSON.parse(response.body);
  }
  const tool = (token, toolName, args = {}) =>
    rpc(token, 'tools/call', { name: toolName, arguments: args });
  async function result(token, toolName, args) {
    const body = await tool(token, toolName, args);
    assert.equal(body.result.isError, undefined);
    return JSON.parse(body.result.content[0].text);
  }
  const readOnly = await authorize(false);
  const writable = await authorize(true);
  const catalog = await result(writable.token, 'read_type_catalog', {});
  const draft = await result(writable.token, 'read_my_draft', {});
  const tools = (await rpc(writable.token, 'tools/list')).result.tools;
  for (const toolName of ['read_history', 'save_draft', 'propose_object', 'propose_object_type'])
    assert.ok(tools.some(({ name }) => name === toolName));
  for (const toolName of ['propose_undo', 'read_merge_review', 'propose_merge']) {
    assert.ok(!tools.some(({ name }) => name === toolName));
    assert.equal((await tool(writable.token, toolName)).result.isError, true);
  }
  assert.deepEqual(await result(writable.token, 'read_my_draft', {}), draft);
  const proposal = {
    version: draft.version,
    contentVersion: draft.contentVersion,
    id: `container-mcp-${randomUUID()}`,
    baseRevision: null,
    typeRevision: catalog.types[0].revision,
    value: {
      typeId: catalog.types[0].id,
      name: 'MCP Lo Exempel',
      properties: [
        {
          id: 'description',
          label: 'Description',
          kind: 'text',
          value: 'Synthetic container map work',
        },
      ],
    },
  };
  const denied = await tool(readOnly.token, 'propose_object', proposal);
  assert.ok(denied.result?.isError || denied.error);
  const review = await result(writable.token, 'propose_object', proposal);
  assert.equal(review.changes.length, 1);
  const attempt = {
    version: review.version,
    contentVersion: review.contentVersion,
    operationId: `container-mcp-save-${randomUUID()}`,
  };
  const saved = await result(writable.token, 'save_draft', attempt);
  assert.equal(saved.receipt.changes[0].after.name, 'MCP Lo Exempel');
  await command(['restart', name]);
  await waitUntilReady(name);
  const recovered = await result(writable.token, 'read_save_operation', {
    operationId: attempt.operationId,
  });
  assert.equal(recovered.operation.status, 'succeeded');
  assert.deepEqual(recovered.operation.receipt, saved.receipt);
  assert.deepEqual(await result(writable.token, 'save_draft', attempt), saved);
  const map = await result(writable.token, 'read_map', { objectId: proposal.id });
  assert.equal(map.objects.length, 1);
  const history = await result(writable.token, 'read_history', { objectId: proposal.id });
  assert.equal(history.history[0].operationId, saved.receipt.operationId);
  assert.ok(!JSON.stringify(history).includes('Synthetic container map work'));
  const selected = await result(writable.token, 'read_history', {
    operationId: saved.receipt.operationId,
    userId: saved.receipt.userId,
  });
  assert.deepEqual(selected.receipt, saved.receipt);
  let advanced = await result(writable.token, 'read_my_draft', {});
  const advancedTypeId = `container-type-${randomUUID()}`;
  const definition = {
    version: advanced.version,
    contentVersion: advanced.contentVersion,
    id: advancedTypeId,
    baseRevision: null,
    value: {
      name: 'Synthetic device',
      description: '',
    },
  };
  assert.ok((await tool(readOnly.token, 'propose_object_type', definition)).result.isError);
  advanced = await result(writable.token, 'propose_object_type', definition);
  const deviceId = `container-device-${randomUUID()}`;
  advanced = await result(writable.token, 'propose_object', {
    version: advanced.version,
    contentVersion: advanced.contentVersion,
    id: deviceId,
    baseRevision: null,
    value: {
      typeId: advancedTypeId,
      name: 'Synthetic device',
      properties: [{ id: 'enabled', label: 'Enabled', kind: 'boolean', value: false }],
    },
  });
  const removal = {
    version: advanced.version,
    contentVersion: advanced.contentVersion,
    id: proposal.id,
    baseRevision: map.objects[0].revision,
    value: null,
  };
  assert.equal((await tool(readOnly.token, 'propose_object', removal)).result.isError, true);
  advanced = await result(writable.token, 'propose_object', removal);
  assert.equal(advanced.changes.length, 2);
  assert.equal(advanced.objectTypes.length, 1);
  assert.equal(advanced.changes.find(({ id }) => id === proposal.id).after, null);
  assert.deepEqual(advanced.changes.find(({ id }) => id === deviceId).after.properties, [
    { id: 'enabled', label: 'Enabled', kind: 'boolean', value: false },
  ]);
  assert.equal(
    (await result(writable.token, 'read_map', { objectId: proposal.id })).objects.length,
    1,
  );
  const advancedAttempt = {
    version: advanced.version,
    contentVersion: advanced.contentVersion,
    operationId: `container-advanced-save-${randomUUID()}`,
  };
  const advancedSaved = await result(writable.token, 'save_draft', advancedAttempt);
  assert.equal(advancedSaved.receipt.changes.length, 2);
  await command(['restart', name]);
  await waitUntilReady(name);
  assert.deepEqual(await result(writable.token, 'save_draft', advancedAttempt), advancedSaved);
  assert.deepEqual(
    (
      await result(writable.token, 'read_save_operation', {
        operationId: advancedAttempt.operationId,
      })
    ).operation.receipt,
    advancedSaved.receipt,
  );
  assert.equal(
    (await result(writable.token, 'read_map', { objectId: proposal.id })).objects.length,
    0,
  );
  assert.deepEqual(
    (await result(writable.token, 'read_map', { objectId: deviceId })).objects[0].properties,
    [{ id: 'enabled', label: 'Enabled', kind: 'boolean', value: false }],
  );
  assert.equal(
    (
      await result(writable.token, 'read_map', { objectId: 'erasure-independent' })
    ).objects[0].properties.find(({ id }) => id === 'description').value,
    'Retained after erasure',
  );
  const context = JSON.parse(
    (await request(name, '/api/assistants/context', { headers: { cookie: fixture.cookie } })).body,
  );
  const connection = context.connections.find(
    (connection) =>
      connection.clientName === 'Synthetic container assistant' && connection.id !== undefined,
  );
  // Revoke both fixture grants; each connection has its own durable identifier.
  assert.ok(connection);
  for (const connection of context.connections) {
    const response = await request(name, `/api/assistants/${connection.id}/revoke`, {
      method: 'POST',
      headers: { cookie: fixture.cookie, origin, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 200);
  }
  const revoked = await request(name, '/mcp', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${writable.token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  assert.equal(revoked.status, 401);
  console.log(
    'PASS: production OAuth map consent, read-only isolation, retired-tool rejection, types, scoped history, whole-draft creation and ordinary removal, restart receipt recovery, and revocation',
  );
}
