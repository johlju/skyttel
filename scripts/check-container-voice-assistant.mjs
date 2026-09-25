import assert from 'node:assert/strict';

// All offers are rejected before provider creation. The production image must
// load its real Live/sideband SDK while these checks make no paid model calls.
export async function checkContainerVoiceAssistant({
  command,
  request,
  waitUntilReady,
  name,
  fixture,
  origin,
}) {
  const path = `/api/households/${fixture.householdId}`;
  const headers = { cookie: fixture.cookie, origin, 'content-type': 'application/json' };
  async function call(suffix, body, expected = 200, extraHeaders = {}) {
    const response = await request(name, `${path}${suffix}`, {
      headers: { ...headers, ...extraHeaders },
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
  const map = await call('/map');
  assert.equal((await call('/text-assistant')).available, true);
  const consent = { externalAi: true, mapWork: true };
  const assistant = await call('/text-assistant', consent, 201);
  const receipt = assistant.operations.find((operation) => operation.status === 'succeeded');
  assert.ok(receipt, 'The preceding text-assistant check supplies a durable saved receipt');
  const voice = `/text-assistant/${assistant.id}/voice`;
  const anchor = {
    revision: assistant.revision,
    draftVersion: assistant.review.version,
    contentVersion: assistant.review.contentVersion,
  };
  await call(voice, { sdp: 'synthetic-invalid-offer', ...anchor }, 401, { cookie: '' });
  await call(voice, { sdp: 'synthetic-invalid-offer', ...anchor }, 403, {
    origin: 'https://unrelated.example',
  });
  await call('/text-assistant/no-consented-session/voice', { sdp: 'synthetic-invalid-offer' }, 404);
  for (const body of [{}, { ...anchor, sdp: '' }, { ...anchor, sdp: 1 }]) {
    await call(voice, body, 400);
  }
  await call(voice, { ...anchor, sdp: 'synthetic-invalid-offer', revision: -1 }, 409);
  await call(voice, { ...anchor, sdp: 'synthetic-invalid-offer', draftVersion: -1 }, 409);
  await call(voice, { ...anchor, sdp: 'synthetic-invalid-offer', contentVersion: -1 }, 409);
  await call(`${voice}/unknown-voice/poll`, anchor, 404);
  await call(`${voice}/unknown-voice/stop`, {}, 404);
  assert.deepEqual(await call('/map'), map);
  assert.equal((await call(`/text-assistant/${assistant.id}`)).phase, 'ready');

  await command(['restart', name]);
  await waitUntilReady(name);
  await call(voice, { sdp: 'synthetic-invalid-offer', ...anchor }, 404);
  const reconnected = await call('/text-assistant', consent, 201);
  assert.deepEqual(
    reconnected.operations.find((operation) => operation.operationId === receipt.operationId),
    receipt,
  );
  assert.deepEqual(await call('/map'), map);
  await call(`/text-assistant/${reconnected.id}/stop`, {});
  console.log(
    'PASS: production voice access, consent and stale-offer denial with shared receipt recovery; no Live or Terra calls',
  );
}
