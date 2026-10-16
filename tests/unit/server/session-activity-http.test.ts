import { afterEach, expect, test, vi } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
afterEach(() => {
  vi.restoreAllMocks();
  fixture?.close();
});

test('background reads do not extend ordinary login beyond exactly thirty idle minutes', async () => {
  let time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  time += 29 * 60_000 + 59_999;
  expect((await (await client.request('/api/bootstrap')).json()).status).toBe('setup');
  time += 1;
  expect((await (await client.request('/api/bootstrap')).json()).status).toBe('anonymous');
  expect(await (await client.request('/api/auth/get-session')).json()).toBeNull();
});

test('status revalidates binding and policy after an awaited library read crosses OFF', async () => {
  let time = Date.now();
  const start = time;
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  let entered = () => {};
  let release = () => {};
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = fixture.auth.api.getSession.bind(fixture.auth.api);
  // Delay the external authentication library response, while delegating its
  // actual authentication and all application/SQLite checks unchanged.
  vi.spyOn(fixture.auth.api, 'getSession').mockImplementationOnce(async (options) => {
    const result = await read(options);
    entered();
    await held;
    return result;
  });
  const oldRead = client.json('/api/browser-binding/status', {});
  await reached;
  time += 25 * 60_000;
  expect((await client.json('/api/browser-binding/activity', { kind: 'write' })).status).toBe(200);
  const off = await client.json('/api/browser-binding/revoke', {
    id: 'ea76fe6f-2f42-4e3a-b845-055be597bdeb',
  });
  expect(off.status).toBe(200);
  const replacement = await off.json();
  const token = off.headers
    .getSetCookie()
    .find((value) => value.split(';', 1)[0].split('=')[0].endsWith('better-auth.session_token'))
    ?.split(';', 1)[0];
  const headers = {
    origin: fixture.config.origin,
    cookie: `${token}; ${replacement.cookieName}=${replacement.candidate}`,
    'content-type': 'application/json',
  };
  const post = (path: string) =>
    fixture.app.request(`${fixture.config.origin}/api/browser-binding/${path}`, {
      method: 'POST',
      headers,
      body: '{}',
    });
  expect((await post('register')).status).toBe(200);
  time = start + 30 * 60_000;
  release();
  expect(await (await oldRead).json()).toMatchObject({ state: 'anonymous' });
  expect(await (await post('status')).json()).toMatchObject({
    state: 'active',
    expiresAt: start + 55 * 60_000,
  });
});

test('explicit writing shares one inactivity deadline while reads and invalid activity cannot renew it', async () => {
  let time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const startedAt = time;
  time += 25 * 60_000;
  const changed = await client.json('/api/browser-binding/activity', { kind: 'write' });
  expect(changed.status).toBe(200);
  expect(await changed.json()).toMatchObject({
    state: 'active',
    serverTime: time,
    expiresAt: startedAt + 55 * 60_000,
    reason: 'inactivity',
  });
  time += 25 * 60_000;
  expect((await client.json('/api/browser-binding/activity', { kind: 'heartbeat' })).status).toBe(
    400,
  );
  expect(
    (
      await client.json(
        '/api/browser-binding/activity',
        { kind: 'write' },
        { origin: 'https://other.test' },
      )
    ).status,
  ).toBe(403);
  expect((await client.json('/api/browser-binding/status', {})).status).toBe(200);
  time += 5 * 60_000;
  expect(await (await client.json('/api/browser-binding/status', {})).json()).toMatchObject({
    state: 'expired',
    reason: 'inactivity',
  });
  expect((await client.json('/api/browser-binding/activity', { kind: 'write' })).status).toBe(401);
});

test('OFF starts ordinary inactivity once while repeated OFF and reads preserve its deadline', async () => {
  let time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const started = await client.json('/api/auth/sign-in/social', {
    provider: 'google',
    callbackURL: '/',
    rememberMe: true,
    informationVersion: 1,
  });
  await client.request((await started.json()).url);
  time += 86_400_000;
  expect((await client.json('/api/browser-binding/status', {})).status).toBe(200);
  const offAt = time;
  async function off() {
    const response = await client.json('/api/browser-binding/revoke', { id: crypto.randomUUID() });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect((await client.registerBinding(result)).status).toBe(200);
    return result;
  }
  expect((await off()).expiresAt).toBe(offAt + 8 * 60 * 60_000);
  time += 10 * 60_000;
  expect((await off()).expiresAt).toBe(offAt + 8 * 60 * 60_000);
  expect(await (await client.json('/api/browser-binding/status', {})).json()).toMatchObject({
    state: 'active',
    expiresAt: offAt + 30 * 60_000,
    reason: 'inactivity',
  });
  time = offAt + 30 * 60_000 - 1;
  expect((await (await client.request('/api/bootstrap')).json()).status).toBe('setup');
  time += 1;
  expect(await (await client.json('/api/browser-binding/status', {})).json()).toMatchObject({
    state: 'expired',
    reason: 'inactivity',
  });
});
