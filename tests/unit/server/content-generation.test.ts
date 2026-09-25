import { afterEach, expect, test } from 'vitest';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
afterEach(() => fixture?.close());

test('a new content generation rejects every old mutation while retaining history for fresh-context undo', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  const path = `/api/households/${household.id}/map`;
  const initial = await (await client.request(path)).json();
  const proposal = {
    version: 0,
    contentVersion: 1,
    id: 'retained',
    baseRevision: null,
    value: { typeId: initial.types[0].id, name: 'Cykel', description: '' },
  };
  expect((await client.json(`${path}/draft`, proposal)).status).toBe(200);
  const { receipt } = await (
    await client.json(`${path}/save`, {
      version: 1,
      contentVersion: 1,
      operationId: 'old-save',
    })
  ).json();
  fixture.database
    .prepare('UPDATE household SET contentVersion = 2 WHERE id = ?')
    .run(household.id);
  const current = await (await client.request(path)).json();
  expect(current.draft.version).toBe(2);
  for (const [route, body] of [
    ['draft', { ...proposal, version: 2 }],
    ['merge', { version: 2 }],
    ['object-type', { version: 2 }],
    ['relationship', { version: 2 }],
    ['relationship-type', { version: 2 }],
    ['resolve', { version: 2 }],
    ['undo', { version: 2, userId: receipt.userId, operationId: receipt.operationId }],
    ['discard-change', { version: 2, kind: 'object', id: 'retained' }],
    ['discard', { version: 2 }],
    ['save', { version: 2, operationId: 'old-save' }],
    ['operations', { version: 2, operationId: 'new-id' }],
    ['view/position', { id: 'retained', version: 0, position: { x: 1, y: 2, z: 3 } }],
    ['view/settings', { version: 0, settings: defaultViewSettings }],
  ] as const) {
    const response = await client.json(`${path}/${route}`, { ...body, contentVersion: 1 });
    expect(await response.json(), route).toEqual({ error: 'content_conflict' });
  }
  expect(await (await client.request(`${path}/history`)).json()).toEqual({ history: [receipt] });
  expect(
    (
      await client.json(`${path}/operations`, {
        version: 2,
        contentVersion: 2,
        operationId: 'old-save',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await client.json(`${path}/undo`, {
        version: 2,
        contentVersion: 2,
        userId: receipt.userId,
        operationId: receipt.operationId,
      })
    ).status,
  ).toBe(200);
});

test('a durable prepared maintenance gate blocks household reads, images, writes and exports without changing access', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  const { user } = await (await client.request('/api/bootstrap')).json();
  fixture.database
    .prepare(`INSERT INTO content_maintenance
    (id, householdId, actorId, kind, phase, contentVersion, requestHash, payload, createdAt, updatedAt)
    VALUES ('interrupted-import', ?, ?, 'import', 'prepared', 1, 'synthetic-digest', '{}', '2026-09-24', '2026-09-24')`)
    .run(household.id, user.id);
  for (const suffix of [
    '/map',
    '/map/view',
    '/map/history',
    '/map/operations',
    '/profile-images/missing',
  ]) {
    const response = await client.request(`/api/households/${household.id}${suffix}`);
    expect(response.status, suffix).toBe(409);
    expect(await response.json()).toEqual({ error: 'content_maintenance' });
  }
  for (const suffix of ['/map/discard', '/exports']) {
    const response = await client.json(`/api/households/${household.id}${suffix}`, { version: 0 });
    expect(await response.json()).toEqual({ error: 'content_maintenance' });
  }
  expect((await (await client.request('/api/bootstrap')).json()).household).toEqual(household);
  expect((await fixture.client().request(`/api/households/${household.id}/map`)).status).toBe(401);
});
