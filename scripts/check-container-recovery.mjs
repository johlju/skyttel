import assert from 'node:assert/strict';
import sharp from 'sharp';

/** Restore private content, change its owner, then continue after restart. */
export async function checkContainerRecovery({
  command,
  request,
  waitUntilReady,
  name,
  fixture,
  origin,
}) {
  const path = `/api/households/${fixture.householdId}`;
  const headers = { cookie: fixture.cookie, origin, 'content-type': 'application/json' };
  const call = (suffix, body) =>
    request(name, `${path}${suffix}`, {
      headers,
      method: body === undefined ? 'GET' : 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const read = async () => {
    const response = await call('/map');
    assert.equal(response.status, 200);
    return JSON.parse(response.body);
  };
  const actor = JSON.parse((await request(name, '/api/bootstrap', { headers })).body).user.id;
  let state = await read();
  const object = state.objects[0];
  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#cc7733' } })
    .png()
    .toBuffer();
  const imageResponse = await request(name, `${path}/profile-images/${object.id}`, {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'image/png',
      'x-skyttel-content-version': String(state.contentVersion),
      'x-skyttel-draft-version': String(state.draft.version),
      'x-skyttel-object-revision': String(object.revision),
    },
    bodyBase64: png.toString('base64'),
  });
  assert.equal(imageResponse.status, 200);
  state = await read();
  const initialView = JSON.parse((await call('/map/view')).body);
  assert.equal(
    (
      await call('/map/view/position', {
        id: object.id,
        version: initialView.positions.find((item) => item.id === object.id)?.version ?? 0,
        position: { x: 31, y: -7, z: 12 },
        contentVersion: state.contentVersion,
      })
    ).status,
    200,
  );
  const { version: settingsVersion, ...settings } = initialView.settings;
  assert.equal(
    (
      await call('/map/view/settings', {
        version: settingsVersion,
        settings: { ...settings, stars: true, axisCorner: 'top-left', invertY: true },
        contentVersion: state.contentVersion,
      })
    ).status,
    200,
  );
  const privateView = JSON.parse((await call('/map/view')).body);
  const assertView = async () => {
    const view = JSON.parse((await call('/map/view')).body);
    assert.deepEqual(view.positions, privateView.positions);
    assert.deepEqual(view.settings, privateView.settings);
  };
  const privateState = state;
  const identityId = state.userId;
  const imageId = state.draft.changes.find((change) => change.id === object.id).after
    .profileImageId;
  const image = await request(name, `${path}/profile-images/${imageId}`, { headers, binary: true });
  assert.equal(image.status, 200);
  const history = JSON.parse((await call('/map/history')).body).history;
  const prepared = await call('/exports', {});
  assert.equal(prepared.status, 201);
  const archive = await request(name, `${path}/exports/${JSON.parse(prepared.body).id}`, {
    headers,
    binary: true,
  });
  assert.equal(archive.status, 200);
  assert.equal(
    (
      await call('/map/discard', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
      })
    ).status,
    200,
  );
  const uploaded = await request(name, `${path}/imports`, {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/zip',
      'x-skyttel-content-version': String(state.contentVersion),
    },
    bodyBase64: archive.body,
  });
  assert.equal(uploaded.status, 201, uploaded.body);
  const confirmed = await call(`/imports/${JSON.parse(uploaded.body).id}/confirm`, {
    confirmed: true,
    contentVersion: state.contentVersion,
  });
  assert.equal(JSON.parse(confirmed.body).status, 'completed');
  state = await read();
  assert.deepEqual(state.draft, privateState.draft);
  await assertView();
  assert.deepEqual(JSON.parse((await call('/map/history')).body).history, history);
  assert.equal(
    (
      await call('/content-owners/assign', {
        identityId,
        userId: null,
        contentVersion: state.contentVersion,
        confirmed: true,
      })
    ).status,
    200,
  );
  state = await read();
  assert.notEqual(state.userId, identityId);
  assert.deepEqual(state.draft.changes, []);
  const detachedView = JSON.parse((await call('/map/view')).body);
  assert.deepEqual(detachedView.positions, []);
  assert.equal(detachedView.settings.stars, false);
  assert.equal((await request(name, `${path}/profile-images/${imageId}`, { headers })).status, 404);
  await command(['restart', name]);
  await waitUntilReady(name);
  assert.equal(
    (
      await call('/content-owners/assign', {
        identityId,
        userId: actor,
        contentVersion: state.contentVersion,
        confirmed: true,
      })
    ).status,
    200,
  );
  await command(['restart', name]);
  await waitUntilReady(name);
  state = await read();
  assert.equal(state.userId, identityId);
  assert.deepEqual(state.draft, privateState.draft);
  await assertView();
  assert.equal(
    (await request(name, `${path}/profile-images/${imageId}`, { headers, binary: true })).body,
    image.body,
  );
  const old = history[0];
  assert.equal(
    (
      await call('/map/save', {
        version: old.draftVersion,
        contentVersion: state.contentVersion,
        operationId: old.operationId,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call('/map/save', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        operationId: 'container-recovered-image',
      })
    ).status,
    200,
  );
  await command(['restart', name]);
  await waitUntilReady(name);
  await assertView();
  assert.equal(
    (await read()).objects.find((item) => item.id === object.id).profileImageId,
    imageId,
  );
  assert.equal(
    (await request(name, `${path}/profile-images/${imageId}`, { headers, binary: true })).body,
    image.body,
  );
  console.log(
    'PASS: full archive restores private encoded image and personal view, explicit ownership survives restart, and fresh saving rejects retired operations',
  );
}
