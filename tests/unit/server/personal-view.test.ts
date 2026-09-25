import { afterEach, beforeEach, expect, test } from 'vitest';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let path: string;
beforeEach(async () => {
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}/map`;
  const state = await (await client.request(path)).json();
  for (const [version, id] of ['lamp', 'bike'].entries()) {
    expect(
      (
        await client.json(`${path}/draft`, {
          version,
          id,
          baseRevision: null,
          value: { name: id, description: '', typeId: state.types[0].id },
        })
      ).status,
    ).toBe(200);
  }
});
afterEach(() => fixture.close());

test('personal object placements survive rereading without changing shared content or the private proposal', async () => {
  const before = await (await client.request(path)).json();
  const moved = await client.json(`${path}/view/position`, {
    id: 'lamp',
    version: 0,
    position: { x: 3, y: -2, z: 7 },
  });
  expect(moved.status).toBe(200);
  const view = await (await client.request(`${path}/view`)).json();
  expect(view.positions).toEqual([{ id: 'lamp', version: 1, x: 3, y: -2, z: 7 }]);
  expect(await (await client.request(path)).json()).toEqual(before);
});

test('independent moves merge while stale overlapping moves and settings are rejected', async () => {
  const move = (id: string, version: number, x: number) =>
    client.json(`${path}/view/position`, { id, version, position: { x, y: 0, z: 1 } });
  expect((await move('lamp', 0, 2)).status).toBe(200);
  expect((await move('bike', 0, 4)).status).toBe(200);
  expect((await move('lamp', 0, 9)).status).toBe(409);
  expect((await move('lamp', 1, 3)).status).toBe(200);
  const settings = { ...defaultViewSettings, stars: true, invertY: true };
  expect((await client.json(`${path}/view/settings`, { version: 0, settings })).status).toBe(200);
  expect(
    (await client.json(`${path}/view/settings`, { version: 0, settings: defaultViewSettings }))
      .status,
  ).toBe(409);
  expect(await (await client.request(`${path}/view`)).json()).toEqual({
    contentVersion: 1,
    positions: [
      { id: 'bike', version: 1, x: 4, y: 0, z: 1 },
      { id: 'lamp', version: 2, x: 3, y: 0, z: 1 },
    ],
    settings: { ...settings, version: 1 },
  });
});

test('positions and settings require current membership and never expose another member’s private view', async () => {
  // Save the objects so the invited user can arrange the same shared content.
  expect((await client.json(`${path}/save`, { version: 2, operationId: 'shared' })).status).toBe(
    200,
  );
  const ownerMove = { id: 'lamp', version: 0, position: { x: 1, y: 2, z: 3 } };
  const ownerSettings = { version: 0, settings: { ...defaultViewSettings, stars: true } };
  expect((await client.json(`${path}/view/position`, ownerMove)).status).toBe(200);
  expect((await client.json(`${path}/view/settings`, ownerSettings)).status).toBe(200);
  const ownerBefore = await (await client.request(`${path}/view`)).json();
  fixture.setSubject('member');
  const member = fixture.client();
  await member.signIn();
  const { user } = await (await member.request('/api/bootstrap')).json();
  for (const actor of [fixture.client(), member]) {
    const status = actor === member ? 403 : 401;
    expect((await actor.request(`${path}/view`)).status).toBe(status);
    expect((await actor.json(`${path}/view/position`, ownerMove)).status).toBe(status);
    expect((await actor.json(`${path}/view/settings`, ownerSettings)).status).toBe(status);
  }
  const invite = async () => {
    const { code } = await (
      await client.json(`${path.replace('/map', '')}/invitations`, { userId: user.id })
    ).json();
    expect((await member.json('/api/invitations/accept', { code })).status).toBe(200);
  };
  await invite();
  expect(await (await member.request(`${path}/view`)).json()).toEqual({
    contentVersion: 1,
    positions: [],
    settings: { ...defaultViewSettings, version: 0 },
  });
  expect(
    (await member.json(`${path}/view/position`, { ...ownerMove, position: { x: -9, y: 0, z: 5 } }))
      .status,
  ).toBe(200);
  expect(
    (
      await member.json(`${path}/view/settings`, {
        version: 0,
        settings: { ...defaultViewSettings, axisPinned: true },
      })
    ).status,
  ).toBe(200);
  expect(await (await client.request(`${path}/view`)).json()).toEqual(ownerBefore);
  const memberBefore = await (await member.request(`${path}/view`)).json();
  expect(
    (await client.json(`${path.replace('/map', '')}/members/${user.id}/revoke`, {})).status,
  ).toBe(200);
  expect((await member.request(`${path}/view`)).status).toBe(403);
  expect((await member.json(`${path}/view/position`, { ...ownerMove, version: 1 })).status).toBe(
    403,
  );
  expect(
    (await member.json(`${path}/view/settings`, { ...ownerSettings, version: 1 })).status,
  ).toBe(403);
  expect(await (await client.request(`${path}/view`)).json()).toEqual(ownerBefore);
  await invite();
  expect(await (await member.request(`${path}/view`)).json()).toEqual(memberBefore);
});

test('invalid coordinates, unknown objects, forged owners and malformed settings leave the view unchanged', async () => {
  const valid = { id: 'lamp', version: 0, position: { x: 0, y: 0, z: 0 } };
  for (const body of [
    { ...valid, version: -1 },
    { ...valid, id: '' },
    { ...valid, userId: 'other' },
    { ...valid, position: { x: 10001, y: 0, z: 0 } },
    { ...valid, position: { x: null, y: 0, z: 0 } },
    { ...valid, id: 'unknown' },
  ])
    expect((await client.json(`${path}/view/position`, body)).status).toBe(400);
  for (const settings of [
    { ...defaultViewSettings, stars: 'yes' },
    { ...defaultViewSettings, axisCorner: 'outside' },
    {},
  ]) {
    expect((await client.json(`${path}/view/settings`, { version: 0, settings })).status).toBe(400);
  }
  expect(await (await client.request(`${path}/view`)).json()).toEqual({
    contentVersion: 1,
    positions: [],
    settings: { ...defaultViewSettings, version: 0 },
  });
  const attack = await client.request(`${path}/view/position`, {
    method: 'POST',
    headers: { origin: 'https://other.invalid', 'content-type': 'application/json' },
    body: JSON.stringify(valid),
  });
  expect(attack.status).toBe(403);
});
