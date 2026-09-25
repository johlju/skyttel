import { afterEach, beforeEach, expect, test } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let owner: ReturnType<typeof fixture.client>;
let member: ReturnType<typeof fixture.client>;
let path: string;
let memberId: string;
beforeEach(async () => {
  fixture = await applicationFixture();
  owner = fixture.client();
  await owner.signIn();
  const { household } = await (await owner.json('/api/households', { name: 'Linden' })).json();
  path = `/api/households/${household.id}`;
  fixture.setSubject('robin');
  member = fixture.client();
  await member.signIn();
  memberId = (await (await member.request('/api/bootstrap')).json()).user.id;
  const { code } = await (await owner.json(`${path}/invitations`, { userId: memberId })).json();
  await member.json('/api/invitations/accept', { code });
});
afterEach(() => fixture.close());

test('explicit reassignment preserves displaced private work and rejects old colliding drafts and attempts', async () => {
  const initial = await (await owner.request(`${path}/map`)).json();
  for (const [actor, id] of [
    [owner, 'original-private'],
    [member, 'new-private'],
  ] as const) {
    expect(
      (
        await actor.json(`${path}/map/draft`, {
          version: 0,
          contentVersion: 1,
          id,
          baseRevision: null,
          value: { name: id, description: '', typeId: initial.types[0].id },
        })
      ).status,
    ).toBe(200);
  }
  const original = await (await owner.request(`${path}/map`)).json();
  const displaced = await (await member.request(`${path}/map`)).json();
  expect(original.draft.version).toBe(displaced.draft.version);
  const oldAttempt = { version: 1, contentVersion: 1, operationId: 'pending-before-assignment' };
  expect((await member.json(`${path}/map/operations`, oldAttempt)).status).toBe(200);
  const reviewed = await owner.request(`${path}/content-owners`);
  expect(reviewed.status).toBe(200);
  expect(await reviewed.json()).toMatchObject({ contentVersion: 1, pendingOperations: 1 });
  const body = {
    contentVersion: 1,
    identityId: original.userId,
    userId: memberId,
    confirmed: true,
  };
  const assigned = await owner.json(`${path}/content-owners/assign`, body);
  expect(assigned.status, await assigned.clone().text()).toBe(200);
  expect(await assigned.json()).toMatchObject({ contentVersion: 2 });
  const current = await (await member.request(`${path}/map`)).json();
  expect(current.userId).toBe(original.userId);
  expect(current.draft).toEqual(original.draft);
  expect((await member.json(`${path}/map/discard`, { version: 1, contentVersion: 1 })).status).toBe(
    409,
  );
  expect((await member.json(`${path}/map/save`, oldAttempt)).status).toBe(409);
  expect((await member.json(`${path}/map/save`, { ...oldAttempt, contentVersion: 2 })).status).toBe(
    409,
  );
  expect(await (await member.request(`${path}/map`)).json()).toEqual(current);
  const listing = await (await owner.request(`${path}/content-owners`)).json();
  expect(listing.identities).toContainEqual(
    expect.objectContaining({ id: displaced.userId, userId: null, draftChanges: 1 }),
  );
  expect(
    (
      await owner.json(`${path}/content-owners/assign`, {
        ...body,
        contentVersion: 2,
        identityId: displaced.userId,
      })
    ).status,
  ).toBe(200);
  expect((await (await member.request(`${path}/map`)).json()).draft).toEqual(displaced.draft);
  expect(
    (
      await member.json(`${path}/map/save`, {
        version: 1,
        contentVersion: 3,
        operationId: 'fresh-after-assignment',
      })
    ).status,
  ).toBe(200);
});

test('assignment is administrator-only, scoped to current members and explicit current content', async () => {
  const state = await (await owner.request(`${path}/map`)).json();
  const body = { identityId: state.userId, userId: memberId, contentVersion: 1, confirmed: true };
  for (const [actor, status] of [
    [fixture.client(), 401],
    [member, 403],
  ] as const) {
    expect((await actor.request(`${path}/content-owners`)).status).toBe(status);
    expect((await actor.json(`${path}/content-owners/assign`, body)).status).toBe(status);
  }
  expect((await owner.json('/api/households/wrong/content-owners/assign', body)).status).toBe(403);
  expect((await owner.request('/api/households/wrong/content-owners')).status).toBe(403);
  for (const bad of [
    null,
    [],
    {},
    { ...body, confirmed: false },
    { ...body, extra: true },
    { ...body, contentVersion: 0 },
    { ...body, userId: 5 },
  ])
    expect((await owner.json(`${path}/content-owners/assign`, bad)).status).toBe(400);
  expect(
    (await owner.json(`${path}/content-owners/assign`, { ...body, identityId: 'missing' })).status,
  ).toBe(404);
  expect(
    (await owner.json(`${path}/content-owners/assign`, { ...body, userId: 'missing' })).status,
  ).toBe(409);
  expect(
    (await owner.json(`${path}/content-owners/assign`, { ...body, contentVersion: 2 })).status,
  ).toBe(409);
  expect(
    (
      await owner.request(`${path}/content-owners/assign`, {
        method: 'POST',
        headers: { origin: 'https://wrong.test', 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await owner.request(`${path}/content-owners/assign`, {
        method: 'POST',
        headers: { origin: fixture.config.origin, 'content-type': 'text/plain' },
        body: '{}',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await owner.request(`${path}/content-owners/assign`, {
        method: 'POST',
        headers: { origin: fixture.config.origin, 'content-type': 'application/json' },
        body: '{',
      })
    ).status,
  ).toBe(400);
  expect((await owner.json(`${path}/members/${memberId}/revoke`, {})).status).toBe(200);
  expect((await member.json(`${path}/content-owners/assign`, body)).status).toBe(403);
  expect((await member.request(`${path}/content-owners`)).status).toBe(403);
  expect((await owner.json(`${path}/content-owners/assign`, body)).status).toBe(409);
  expect(await (await owner.request(`${path}/map`)).json()).toEqual(state);
});

test('personal positions and settings retain separate owners and reject old equal-version edits after assignment', async () => {
  const state = await (await owner.request(`${path}/map`)).json();
  await owner.json(`${path}/map/draft`, {
    version: 0,
    id: 'lamp',
    baseRevision: null,
    value: { name: 'Lampa', description: '', typeId: state.types[0].id },
  });
  await owner.json(`${path}/map/save`, { version: 1, operationId: 'shared-lamp' });
  for (const [actor, x, invertX] of [
    [owner, 12, true],
    [member, 35, false],
  ] as const) {
    const view = await (await actor.request(`${path}/map/view`)).json();
    const { version: _version, ...settings } = view.settings;
    expect(
      (
        await actor.json(`${path}/map/view/position`, {
          id: 'lamp',
          version: 0,
          contentVersion: 1,
          position: { x, y: 0, z: 0 },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await actor.json(`${path}/map/view/settings`, {
          version: 0,
          contentVersion: 1,
          settings: { ...settings, invertX },
        })
      ).status,
    ).toBe(200);
  }
  const original = await (await owner.request(`${path}/map/view`)).json();
  const displaced = await (await member.request(`${path}/map/view`)).json();
  const memberOwnerId = (await (await member.request(`${path}/map`)).json()).userId;
  const body = { identityId: state.userId, userId: memberId, contentVersion: 1, confirmed: true };
  expect((await owner.json(`${path}/content-owners/assign`, body)).status).toBe(200);
  expect(await (await member.request(`${path}/map/view`)).json()).toEqual({
    ...original,
    contentVersion: 2,
  });
  expect(
    (
      await member.json(`${path}/map/view/position`, {
        id: 'lamp',
        version: 1,
        contentVersion: 1,
        position: { x: 99, y: 0, z: 0 },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await member.json(`${path}/map/view/settings`, {
        version: 1,
        contentVersion: 1,
        settings: { ...displaced.settings, version: undefined },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await owner.json(`${path}/content-owners/assign`, {
        ...body,
        identityId: memberOwnerId,
        contentVersion: 2,
      })
    ).status,
  ).toBe(200);
  expect(await (await member.request(`${path}/map/view`)).json()).toEqual({
    ...displaced,
    contentVersion: 3,
  });
});

test('a binding write failure rolls back displaced ownership and pending operation evidence atomically', async () => {
  const state = await (await owner.request(`${path}/map`)).json();
  const pending = { version: 0, contentVersion: 1, operationId: 'pending-through-fault' };
  expect((await member.json(`${path}/map/operations`, pending)).status).toBe(200);
  const before = await (await owner.request(`${path}/content-owners`)).json();
  fixture.database.exec(
    "CREATE TRIGGER synthetic_binding_fault BEFORE UPDATE OF userId ON content_identity WHEN NEW.userId IS NOT NULL BEGIN SELECT RAISE(ABORT,'synthetic owner write failure'); END;",
  );
  expect(
    (
      await owner.json(`${path}/content-owners/assign`, {
        identityId: state.userId,
        userId: memberId,
        contentVersion: 1,
        confirmed: true,
      })
    ).status,
  ).toBe(500);
  expect(await (await owner.request(`${path}/content-owners`)).json()).toEqual(before);
  expect(
    (await (await member.request(`${path}/map/operations/${pending.operationId}`)).json()).operation
      .status,
  ).toBe('pending');
  expect((await (await owner.request(`${path}/map`)).json()).userId).toBe(state.userId);
});

test('detaching and explicitly restoring a private owner never changes membership or immutable authorship', async () => {
  const state = await (await owner.request(`${path}/map`)).json();
  const ownerUserId = (await (await owner.request('/api/bootstrap')).json()).user.id;
  const body = {
    identityId: state.userId,
    userId: ownerUserId,
    contentVersion: 1,
    confirmed: true,
  };
  expect(
    (await (await owner.json(`${path}/content-owners/assign`, body)).json()).contentVersion,
  ).toBe(1);
  const access = await (await owner.request(`${path}/administration`)).json();
  const unbound = await owner.json(`${path}/content-owners/assign`, { ...body, userId: null });
  expect((await unbound.json()).contentVersion).toBe(2);
  expect(await (await owner.request(`${path}/administration`)).json()).toEqual(access);
  expect((await (await owner.request(`${path}/map`)).json()).userId).not.toBe(state.userId);
  expect(
    (await owner.json(`${path}/content-owners/assign`, { ...body, contentVersion: 2 })).status,
  ).toBe(200);
  expect((await (await owner.request(`${path}/map`)).json()).userId).toBe(state.userId);
});
