import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

/** Run against the disposable authenticated production installation. */
export async function checkContainerErasure({
  command,
  request,
  waitUntilReady,
  container,
  image,
  volume,
  containers,
  fixture,
  origin,
  imageId,
  saveRequest,
}) {
  const path = `/api/households/${fixture.householdId}`;
  const headers = { cookie: fixture.cookie, origin, 'content-type': 'application/json' };
  const call = (suffix, body) =>
    request(container, `${path}${suffix}`, {
      headers,
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const read = async () => {
    const response = await call('/map');
    assert.equal(response.status, 200);
    return JSON.parse(response.body);
  };
  let state = await read();
  assert.equal(
    (
      await call('/map/draft', {
        id: 'erasure-independent',
        version: state.draft.version,
        contentVersion: state.contentVersion,
        baseRevision: null,
        value: {
          typeId: state.types[0].id,
          name: 'Independent content',
          description: 'Retained after erasure',
        },
      })
    ).status,
    200,
  );
  state = await read();
  assert.equal(
    (
      await call('/map/save', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        operationId: 'container-independent-save',
      })
    ).status,
    200,
  );
  const oldExport = await call('/exports', {});
  assert.equal(oldExport.status, 201);
  const selection = [{ kind: 'object', id: 'synthetic-person' }];
  const reviewResponse = await call('/erasure/review', { selection });
  assert.equal(reviewResponse.status, 200);
  const review = JSON.parse(reviewResponse.body);
  assert.equal(review.images, 1);
  const reader = `${container}-reader`;
  containers.add(reader);
  await command([
    'run',
    '--detach',
    '--name',
    reader,
    '--entrypoint',
    'node',
    '--mount',
    `type=volume,src=${volume},dst=/data`,
    image,
    '--input-type=module',
    '-e',
    `import Database from 'better-sqlite3';
     const db = new Database('/data/skyttel.sqlite', { readonly: true });
     db.exec('BEGIN');
     if (!db.prepare("SELECT 1 FROM map_object WHERE id = 'synthetic-person'").get()) process.exit(1);
     console.log('reader_ready');
     process.on('SIGTERM', () => { db.exec('ROLLBACK'); db.close(); process.exit(0); });
     setInterval(() => {}, 1000);`,
  ]);
  const deadline = Date.now() + 30_000;
  while (!(await command(['logs', reader])).includes('reader_ready')) {
    assert.ok(Date.now() < deadline, 'The separate SQLite reader must become ready');
    await delay(100);
  }
  const input = {
    selection,
    token: review.token,
    operationId: 'container-erasure',
    confirmation: 'RADERA PERMANENT',
  };
  const pending = await call('/erasure/execute', input);
  assert.equal(pending.status, 202);
  assert.equal(JSON.parse(pending.body).status.phase, 'cleanup');
  assert.equal((await call('/map')).status, 409);
  await command(['restart', container]);
  await waitUntilReady(container);
  const status = await call('/erasure');
  assert.equal(status.status, 200);
  assert.equal(JSON.parse(status.body).status.phase, 'cleanup');
  assert.equal((await call('/map')).status, 409);
  assert.equal((await call('/exports', {})).status, 409);
  await command(['stop', '--time', '2', reader]);
  const resumed = await call('/erasure/resume', { operationId: input.operationId });
  assert.equal(resumed.status, 200);
  assert.equal(JSON.parse(resumed.body).status.phase, 'completed');
  state = await read();
  assert.deepEqual(
    state.objects.map(({ id }) => id),
    ['erasure-independent'],
  );
  assert.equal(state.objects[0].description, 'Retained after erasure');
  assert.equal((await call(`/profile-images/${imageId}`)).status, 404);
  assert.equal((await call(`/exports/${JSON.parse(oldExport.body).id}`)).status, 404);
  assert.equal(
    (await call('/map/save', { ...saveRequest, contentVersion: review.contentVersion })).status,
    409,
  );
  assert.doesNotMatch((await call('/map/history')).body, /Synthetic person|Lo Exempel/u);
  await command([
    'exec',
    container,
    'node',
    '--input-type=module',
    '-e',
    `import assert from 'node:assert/strict';
     import { existsSync, readFileSync, readdirSync } from 'node:fs';
     import Database from 'better-sqlite3';
     const path = '/data/skyttel.sqlite';
     const db = new Database(path);
     assert.deepEqual(db.pragma('wal_checkpoint(TRUNCATE)'), [{ busy: 0, log: 0, checkpointed: 0 }]);
     assert.equal(db.pragma('freelist_count', { simple: true }), 0);
     assert.equal(db.pragma('quick_check', { simple: true }), 'ok');
     for (const suffix of ['', '-wal', '-journal']) if (existsSync(path + suffix))
       assert.equal(readFileSync(path + suffix).includes(Buffer.from('Synthetic person')), false);
     assert.deepEqual(readdirSync('/data/.skyttel-exports'), []);
     db.close();`,
  ]);
  await command(['restart', container]);
  await waitUntilReady(container);
  assert.equal(JSON.parse((await call('/erasure')).body).status.phase, 'completed');
  assert.deepEqual(
    (await read()).objects.map(({ id }) => id),
    ['erasure-independent'],
  );
  console.log(
    'PASS: pending erasure survives container restart, resumes physical cleanup, rejects stale recovery, and preserves unrelated content',
  );
}
