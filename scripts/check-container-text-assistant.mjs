import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// No messages are submitted: the production SDK loads, but no model request
// leaves the container. Authentication and MCP use their normal public routes.
export async function checkContainerTextAssistant({
  command,
  request,
  waitUntilReady,
  name,
  fixture,
  origin,
}) {
  const path = `/api/households/${fixture.householdId}`;
  const headers = { cookie: fixture.cookie, origin, 'content-type': 'application/json' };
  async function call(suffix, body, expected = 200) {
    const response = await request(name, `${path}${suffix}`, {
      headers,
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, expected);
    assert.doesNotMatch(
      response.body,
      /synthetic-openai-container-key|access_token|refresh_token|Bearer |client_secret|code_verifier/u,
    );
    return JSON.parse(response.body);
  }
  async function connections() {
    const response = await request(name, '/api/assistants/context', { headers });
    assert.equal(response.status, 200);
    return JSON.parse(response.body)
      .connections.map((item) => item.id)
      .sort();
  }
  const baselineConnections = await connections();
  assert.equal((await request(name, `${path}/text-assistant`)).status, 401);
  assert.equal((await call('/text-assistant')).available, true);
  for (const body of [{}, { externalAi: true }, { mapWork: true }]) {
    await call('/text-assistant', body, 403);
  }
  assert.deepEqual(await connections(), baselineConnections);
  assert.equal(
    (
      await request(name, `${path}/text-assistant`, {
        method: 'POST',
        headers: { ...headers, origin: 'https://unrelated.example' },
        body: JSON.stringify({ externalAi: true, mapWork: true }),
      })
    ).status,
    403,
  );
  const initial = await call('/map');
  const id = `container-text-${randomUUID()}`;
  await call('/map/draft', {
    version: initial.draft.version,
    contentVersion: initial.contentVersion,
    id,
    baseRevision: null,
    value: {
      typeId: initial.types[0].id,
      name: 'Textprov i container',
      description: 'Synthetic private work',
    },
  });
  const draft = await call('/map');
  const consent = { externalAi: true, mapWork: true };
  const session = await call('/text-assistant', consent, 201);
  assert.equal(session.phase, 'ready');
  assert.equal(session.review.version, draft.draft.version);
  assert.equal(session.review.contentVersion, draft.contentVersion);
  assert.ok(
    session.review.changes.some(
      (change) => change.id === id && change.after.name === 'Textprov i container',
    ),
  );
  assert.ok(session.operations.some((operation) => operation.status === 'succeeded'));
  assert.equal((await connections()).length, baselineConnections.length + 1);
  await call(`/text-assistant/${session.id}/stop`, {});
  await call(`/text-assistant/${session.id}`, undefined, 404);
  assert.deepEqual(await connections(), baselineConnections);
  assert.deepEqual(await call('/map'), draft);

  const beforeRestart = await call('/text-assistant', consent, 201);
  const saved = await call('/map/save', {
    version: draft.draft.version,
    contentVersion: draft.contentVersion,
    operationId: `container-text-save-${randomUUID()}`,
  });
  assert.ok(saved.receipt.changes.some((change) => change.after?.id === id));
  await command(['restart', name]);
  await waitUntilReady(name);
  await call(`/text-assistant/${beforeRestart.id}`, undefined, 404);
  assert.deepEqual(await connections(), baselineConnections);
  const reconnected = await call('/text-assistant', consent, 201);
  assert.deepEqual(reconnected.review.changes, []);
  const recovered = reconnected.operations.find(
    (operation) => operation.operationId === saved.receipt.operationId,
  );
  assert.equal(recovered?.status, 'succeeded');
  assert.deepEqual(recovered.receipt, saved.receipt);
  await call(`/text-assistant/${reconnected.id}/stop`, {});
  assert.deepEqual(await connections(), baselineConnections);
  console.log(
    'PASS: production text-assistant consent, private MCP review, secret isolation, grant cleanup and restart receipt recovery without model calls',
  );
}
