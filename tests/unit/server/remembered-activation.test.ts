import { randomUUID } from 'node:crypto';
import { afterEach, expect, test } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
afterEach(() => fixture?.close());

test('OAuth choice fields cannot activate remembered login before the separate post-login choice', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const start = await client.json('/api/auth/sign-in/social', {
    provider: 'google',
    callbackURL: '/',
    rememberMe: true,
    informationVersion: 1,
  });
  await client.request((await start.json()).url);
  expect(await (await client.json('/api/browser-binding/preference', {})).json()).toMatchObject({
    remembered: false,
  });
});

test('explicit activation after login preserves the original authentication deadline and has an owner-readable result', async () => {
  let time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const read = () => client.json('/api/browser-binding/preference', {});
  const ordinary = await (await read()).json();
  const originalEnd = time + 604_800_000;
  time += 60_000;
  const id = randomUUID();
  const response = await client.json('/api/browser-binding/activate', {
    id,
    sessionId: ordinary.sessionId,
    bindingId: ordinary.bindingId,
    informationVersion: 1,
    consentInformationVersion: 1,
    preferences: true,
    rememberMe: true,
  });
  expect(response.status).toBe(200);
  const activated = await response.json();
  expect(activated).toMatchObject({
    id,
    remembered: true,
    status: 'completed',
    expiresAt: originalEnd,
  });
  expect(response.headers.getSetCookie().join('')).toContain(
    `Expires=${new Date(originalEnd).toUTCString()}`,
  );
  await client.registerBinding(activated);
  expect(await (await read()).json()).toMatchObject({
    remembered: true,
    sessionId: ordinary.sessionId,
    expiresAt: originalEnd,
  });
  expect(await (await client.json(`/api/browser-binding/results/${id}`, {})).json()).toMatchObject({
    id,
    remembered: true,
    expiresAt: originalEnd,
  });
});

test('activation refuses stale bindings, replay and expired ordinary authority, and safe OFF allows a fresh explicit choice', async () => {
  let time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const initial = await (await client.json('/api/browser-binding/preference', {})).json();
  const body = {
    id: randomUUID(),
    sessionId: initial.sessionId,
    bindingId: initial.bindingId,
    informationVersion: 1,
    consentInformationVersion: 1,
    preferences: true,
    rememberMe: true,
  };
  const activated = await client.json('/api/browser-binding/activate', body);
  expect(activated.status).toBe(200);
  await client.registerBinding(await activated.json());
  expect((await client.json('/api/browser-binding/activate', body)).status).toBe(409);
  const off = await client.json('/api/browser-binding/revoke', { id: randomUUID() });
  await client.registerBinding(await off.json());
  expect(
    (await client.json('/api/browser-binding/activate', { ...body, id: randomUUID() })).status,
  ).toBe(409);
  time += 60_000;
  const reactivated = await client.activateRemembered();
  expect(await reactivated.json()).toMatchObject({
    remembered: true,
    expiresAt: initial.expiresAt + 576_000_000,
  });
  const again = await client.json('/api/browser-binding/revoke', { id: randomUUID() });
  await client.registerBinding(await again.json());
  const ordinary = await (await client.json('/api/browser-binding/preference', {})).json();
  time += 1_800_000;
  expect(
    (
      await client.json('/api/browser-binding/activate', {
        ...body,
        id: randomUUID(),
        bindingId: ordinary.bindingId,
      })
    ).status,
  ).toBe(401);
});
