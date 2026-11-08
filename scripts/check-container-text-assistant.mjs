import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { containerConversationConsent } from './container-conversation-consent.mjs';

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
    assert.equal(response.status, expected, `${suffix}: ${response.body}`);
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
  const consent = await containerConversationConsent(command, name);
  for (const body of [
    {},
    { consent: { textVersion: 0 } },
    { consent: { textVersion: consent.consent.textVersion - 1 } },
    { externalAi: true, mapWork: true },
  ]) {
    const refused = await call('/text-assistant', body, 403);
    assert.equal(refused.error, 'conversation_consent_required');
  }
  assert.deepEqual(await connections(), baselineConnections);
  assert.equal(
    (
      await request(name, `${path}/text-assistant`, {
        method: 'POST',
        headers: { ...headers, origin: 'https://unrelated.example' },
        body: JSON.stringify(consent),
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
      properties: [
        { id: 'description', label: 'Description', kind: 'text', value: 'Synthetic private work' },
      ],
    },
  });
  const draft = await call('/map');
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
  const canceled = await call(`/text-assistant/${session.id}/cancel`, { all: true });
  assert.equal(canceled.id, session.id);
  assert.equal(canceled.canceled, true);
  assert.equal(canceled.phase, 'ready');
  assert.equal(
    canceled.conversation.at(-1)?.text,
    'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.',
  );
  await call(`/text-assistant/${session.id}/pause`, {});
  assert.deepEqual(await connections(), baselineConnections);
  const { conversation: paused } = await call('/text-assistant/restore');
  assert.equal(paused.id, session.id);
  assert.equal(paused.paused, true);
  assert.deepEqual(paused.conversation, canceled.conversation);
  assert.deepEqual(paused.modelChoice, session.modelChoice);
  assert.deepEqual(paused.review, canceled.review);
  assert.equal((await connections()).length, baselineConnections.length + 1);
  assert.deepEqual(await call('/map'), draft);
  // This internal route is explicit End; user-facing Stop uses /cancel.
  await call(`/text-assistant/${session.id}/stop`, {});
  await call(`/text-assistant/${session.id}`, undefined, 404);
  assert.equal((await call('/text-assistant/restore')).conversation, undefined);
  assert.deepEqual(await connections(), baselineConnections);
  assert.deepEqual(await call('/map'), draft);

  let beforeRestart = await call('/text-assistant', consent, 201);
  beforeRestart = await call(`/text-assistant/${beforeRestart.id}/cancel`, { all: true });
  const saved = await call('/map/save', {
    version: draft.draft.version,
    contentVersion: draft.contentVersion,
    operationId: `container-text-save-${randomUUID()}`,
  });
  assert.ok(saved.receipt.changes.some((change) => change.after?.id === id));
  await command(['restart', name]);
  await waitUntilReady(name);
  assert.deepEqual(await connections(), baselineConnections);
  const { conversation: restored } = await call('/text-assistant/restore');
  assert.equal(restored.id, beforeRestart.id);
  assert.equal(restored.paused, true);
  assert.equal(restored.phase, 'ready');
  assert.deepEqual(restored.conversation, beforeRestart.conversation);
  assert.deepEqual(restored.modelChoice, beforeRestart.modelChoice);
  assert.deepEqual(restored.review.changes, []);
  const recoveredAfterRestart = restored.operations.find(
    (operation) => operation.operationId === saved.receipt.operationId,
  );
  assert.equal(recoveredAfterRestart?.status, 'succeeded');
  assert.deepEqual(recoveredAfterRestart.receipt, saved.receipt);
  const savedMap = await call('/map');
  await call(`/text-assistant/${restored.id}/stop`, {});
  await call(`/text-assistant/${restored.id}`, undefined, 404);
  assert.equal((await call('/text-assistant/restore')).conversation, undefined);
  assert.deepEqual(await connections(), baselineConnections);
  assert.deepEqual(await call('/map'), savedMap);
  assert.ok(
    (await call('/map/history')).history.some(
      (receipt) => receipt.operationId === saved.receipt.operationId,
    ),
  );
  const reconnected = await call('/text-assistant', consent, 201);
  assert.notEqual(reconnected.id, beforeRestart.id);
  assert.deepEqual(reconnected.review.changes, []);
  const recovered = reconnected.operations.find(
    (operation) => operation.operationId === saved.receipt.operationId,
  );
  assert.equal(recovered?.status, 'succeeded');
  assert.deepEqual(recovered.receipt, saved.receipt);
  await call(`/text-assistant/${reconnected.id}/stop`, {});
  await call(`/text-assistant/${reconnected.id}`, undefined, 404);
  assert.deepEqual(await connections(), baselineConnections);
  console.log(
    'PASS: production text-assistant consent, Stop retention, paused restore, explicit End, private MCP cleanup and restart receipt recovery without model calls',
  );
}
