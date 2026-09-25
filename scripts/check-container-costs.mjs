import assert from 'node:assert/strict';

// Exercise production routing, SQLite and access without dispatching any
// provider requests. Controlled provider measurements run in browser tests.
export async function checkContainerCosts({
  command,
  request,
  waitUntilReady,
  name,
  fixture,
  origin,
}) {
  const month = new Date().toISOString().slice(0, 7);
  const path = '/api/operator/costs';
  const headers = { cookie: fixture.cookie, origin, 'content-type': 'application/json' };
  async function call(suffix, body, expected = 200, extraHeaders = {}) {
    const response = await request(name, `${path}${suffix}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, expected, `${suffix}: ${response.body}`);
    assert.doesNotMatch(
      response.body,
      /synthetic-openai-container-key|access_token|Bearer |client_secret/u,
    );
    return JSON.parse(response.body);
  }
  await call(`?month=${month}`, undefined, 401, { cookie: '' });
  await call('?month=invalid', undefined, 400);
  const before = await call(`?month=${month}`);
  assert.deepEqual(before.render, { estimatedUsd: 7.25, estimatedSek: 72.5 });
  assert.equal(before.live.attempts, 0);
  assert.equal(before.terra.attempts, 0);
  assert.equal(before.coverageIncomplete, true);
  assert.equal(before.total.incomplete, true);
  const { updatedAt: _updatedAt, ...assumptions } = before.assumptions;
  const change = { month, ...assumptions, sekPerUsd: 11 };
  await call('/assumptions', change, 403, { origin: 'https://unrelated.example' });
  await call('/assumptions', { ...change, sekPerUsd: -1 }, 400);
  const revised = await call('/assumptions', change);
  assert.equal(revised.assumptions.sekPerUsd, 11);
  assert.equal(revised.assumptions.version, before.assumptions.version + 1);
  assert.equal(revised.render.estimatedSek, 79.75);
  await call('/assumptions', change, 409);
  await command(['restart', name]);
  await waitUntilReady(name);
  const restored = await call(`?month=${month}`);
  for (const key of [
    'assumptions',
    'assumptionHistory',
    'render',
    'live',
    'terra',
    'total',
    'coverageStartedAt',
  ])
    assert.deepEqual(restored[key], revised[key]);
  console.log(
    'PASS: production cost access, monthly assumptions, unknown coverage and SQLite restart persistence; no model calls',
  );
}
