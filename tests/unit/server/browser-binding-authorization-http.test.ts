import { randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
afterEach(() => {
  vi.restoreAllMocks();
  fixture?.close();
});

test('OFF rejects another login or binding without consuming the action reference or changing the current login', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const before = await (await client.request('/api/bootstrap')).json();
  const preference = await (await client.json('/api/browser-binding/preference', {})).json();
  const id = randomUUID();
  for (const ownership of [
    { sessionId: 'another-login', bindingId: preference.bindingId },
    { sessionId: preference.sessionId, bindingId: 'another-binding' },
  ]) {
    const rejected = await client.json('/api/browser-binding/revoke', { id, ...ownership });
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: 'revocation_rejected' });
    expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
    expect((await client.json(`/api/browser-binding/results/${id}`, {})).status).toBe(404);
  }
  const changed = await client.json('/api/browser-binding/revoke', {
    id,
    sessionId: preference.sessionId,
    bindingId: preference.bindingId,
  });
  expect(changed.status).toBe(200);
  const replacement = await changed.json();
  expect((await client.registerBinding(replacement)).status).toBe(200);
  expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
  const replay = await client.json('/api/browser-binding/revoke', {
    id,
    sessionId: preference.sessionId,
    bindingId: replacement.bindingId,
  });
  expect(replay.status).toBe(409);
  expect(await replay.json()).toEqual({ error: 'revocation_rejected' });
  expect(await (await client.json(`/api/browser-binding/results/${id}`, {})).json()).toMatchObject({
    id,
    status: 'completed',
    userId: before.user.id,
  });
});

test('confirmation requires the exact proof and the session and binding that completed login', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  const completed = await client.signIn();
  const proof = new URL(
    completed.headers.get('location') ?? '',
    fixture.config.origin,
  ).searchParams.get('loginConfirmation');
  const before = await (await client.request('/api/bootstrap')).json();
  for (const suffix of ['', '?proof=invalid', `?proof=${'a'.repeat(64)}`]) {
    const rejected = await client.json(`/api/browser-binding/confirmation${suffix}`, {});
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({ error: 'unconfirmed' });
  }
  const confirmed = await client.json(`/api/browser-binding/confirmation?proof=${proof}`, {});
  expect(confirmed.status).toBe(200);
  expect(await confirmed.json()).toMatchObject({ status: 'confirmed', remembered: false });
  const other = fixture.client();
  await other.signIn();
  expect((await other.json(`/api/browser-binding/confirmation?proof=${proof}`, {})).status).toBe(
    401,
  );
  expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
});

test('the browser must confirm a candidate before starting OAuth and malformed sign-ins preserve the confirmed binding', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  const binding = await (await client.json('/api/browser-binding/candidate', {})).json();
  const send = (body: string, method = 'POST') =>
    fixture.app.request(`${fixture.config.origin}/api/auth/sign-in/social`, {
      method,
      headers: {
        origin: fixture.config.origin,
        cookie: `${binding.cookieName}=${binding.candidate}`,
        'content-type': 'application/json',
      },
      ...(method === 'POST' ? { body } : {}),
    });
  expect((await send('{"provider":"google"}')).status).toBe(409);
  expect((await client.registerBinding(binding)).status).toBe(200);
  for (const body of [
    '{',
    'null',
    '{}',
    '{"provider":"another"}',
    '{"provider":"google","idToken":{"token":"injected"}}',
  ]) {
    const rejected = await send(body);
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'invalid_request' });
  }
  expect((await send('', 'GET')).status).toBe(400);
  expect((await send('{"provider":"google","callbackURL":"/"}')).status).toBe(200);
});

test('a login key missing its browser binding cannot read protected data and explicit initialization retires only that old login', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  const completed = await client.signIn();
  const other = fixture.client();
  await other.signIn();
  const otherBefore = await (await other.request('/api/bootstrap')).json();
  const loginCookie = completed.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('better-auth.session_token='))
    ?.split(';', 1)[0];
  expect(loginCookie).toBeTruthy();
  const request = (path: string) =>
    fixture.app.request(`${fixture.config.origin}${path}`, {
      method: 'POST',
      headers: { origin: fixture.config.origin, cookie: loginCookie ?? '' },
    });
  expect((await request('/api/browser-binding/preference')).status).toBe(401);
  const initialized = await request('/api/browser-binding/candidate');
  expect(initialized.status).toBe(200);
  expect(await initialized.json()).toMatchObject({ candidate: expect.any(String) });
  expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
    status: 'anonymous',
  });
  expect(await (await other.request('/api/bootstrap')).json()).toEqual(otherBefore);
});

test('binding administration rejects a busy transaction without ending a login or consuming a confirmed candidate', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  const binding = await (await client.json('/api/browser-binding/candidate', {})).json();
  fixture.database.exec('BEGIN IMMEDIATE');
  try {
    expect((await client.registerBinding(binding)).status).toBe(409);
  } finally {
    fixture.database.exec('ROLLBACK');
  }
  expect((await client.registerBinding(binding)).status).toBe(200);
  await client.signIn();
  const before = await (await client.request('/api/bootstrap')).json();
  fixture.database.exec('BEGIN IMMEDIATE');
  try {
    for (const path of ['/api/browser-binding/revoke', '/api/auth/sign-out']) {
      const rejected = await client.json(path, { id: randomUUID() });
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toEqual({ error: 'binding_busy' });
    }
  } finally {
    fixture.database.exec('ROLLBACK');
  }
  expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
});

test('same-origin read metadata allows preference and result reads but cannot authorize confirmation or a different public host', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const preference = await client.request('/api/browser-binding/preference', {
    headers: { 'sec-fetch-site': 'same-origin' },
  });
  expect(preference.status).toBe(200);
  expect(
    (
      await client.request(`/api/browser-binding/results/${randomUUID()}`, {
        headers: { 'sec-fetch-site': 'same-origin' },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await client.request('/api/browser-binding/confirmation', {
        headers: { 'sec-fetch-site': 'same-origin' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await client.request('http://another.example.test/api/browser-binding/candidate', {
        method: 'POST',
        headers: { origin: fixture.config.origin },
      })
    ).status,
  ).toBe(403);
});

test.each([false, true])(
  'HTTPS login and OFF issue only secure host-bound cookies (remembered: %s)',
  async (rememberMe) => {
    fixture = await applicationFixture({ origin: 'https://skyttel.example.test' });
    const client = fixture.client();
    const candidate = await (await client.json('/api/browser-binding/candidate', {})).json();
    expect(candidate.cookieName).toBe('__Host-skyttel_binding');
    expect((await client.registerBinding(candidate)).status).toBe(200);
    const started = await client.json('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: '/',
      rememberMe,
      informationVersion: 1,
    });
    expect(started.status).toBe(200);
    const completed = await client.request((await started.json()).url);
    const issued = completed.headers.getSetCookie();
    const session = issued.find((value) => value.startsWith('__Secure-better-auth.session_token='));
    expect(session).toContain('; Path=/; HttpOnly; SameSite=Lax; Secure');
    expect(session).not.toMatch(/Domain=|Max-Age=/i);
    expect(session?.includes('Expires=')).toBe(rememberMe);
    expect(issued.some((value) => value.startsWith('__Host-skyttel_binding='))).toBe(false);
    const preference = await (await client.json('/api/browser-binding/preference', {})).json();
    expect(preference.remembered).toBe(rememberMe);
    const changed = await client.json('/api/browser-binding/revoke', { id: randomUUID() });
    expect(changed.status).toBe(200);
    const replacement = await changed.json();
    expect(replacement.cookieName).toBe('__Host-skyttel_binding');
    const rotated = changed.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Secure-better-auth.session_token='));
    expect(rotated).toContain('; Path=/; HttpOnly; SameSite=Lax; Secure');
    expect(rotated).not.toMatch(/Domain=|Max-Age=|Expires=/i);
    expect((await client.registerBinding(replacement)).status).toBe(200);
    expect((await client.json('/api/browser-binding/preference', {})).status).toBe(200);
  },
);

test('anonymous or malformed OFF and cross-origin logout never create a result or replace an existing login', async () => {
  fixture = await applicationFixture();
  const anonymous = fixture.client();
  for (const body of [null, {}, { id: 'invalid' }]) {
    const rejected = await anonymous.json('/api/browser-binding/revoke', body);
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'invalid_request' });
  }
  expect((await anonymous.json('/api/browser-binding/revoke', { id: randomUUID() })).status).toBe(
    401,
  );
  const client = fixture.client();
  await client.signIn();
  const before = await (await client.request('/api/bootstrap')).json();
  const rejected = await client.json(
    '/api/auth/sign-out',
    {},
    { origin: 'https://other.example.test' },
  );
  expect(rejected.status).toBe(403);
  expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
});

test('a stale logout response cannot end a replacement login issued while the authentication library was awaiting', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const before = await (await client.request('/api/bootstrap')).json();
  let entered = () => {};
  let release = () => {};
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = fixture.auth.api.getSession.bind(fixture.auth.api);
  // Hold the external authentication library response, preserving its real
  // verification. The second public login completes against real SQLite.
  vi.spyOn(fixture.auth.api, 'getSession').mockImplementationOnce(async (options) => {
    const result = await read(options);
    entered();
    await held;
    return result;
  });
  const logout = client.json('/api/auth/sign-out', {});
  await reached;
  await client.signIn();
  const replacement = await (await client.request('/api/bootstrap')).json();
  expect(replacement.loginId).not.toBe(before.loginId);
  release();
  expect((await logout).status).toBe(401);
  expect(await (await client.request('/api/bootstrap')).json()).toEqual(replacement);
});

test.each(['logout', 'provider omitted state'] as const)(
  'an OAuth start cannot publish a usable attempt after %s during provider URL creation',
  async (ending) => {
    fixture = await applicationFixture();
    const client = fixture.client();
    await client.signIn();
    const before = await (await client.request('/api/bootstrap')).json();
    const provider = (await fixture.auth.$context).socialProviders.find(
      (item) => item.id === 'google',
    );
    expect(provider).toBeTruthy();
    if (!provider) throw new Error('Google provider missing');
    const create = provider.createAuthorizationURL;
    let entered = () => {};
    let release = () => {};
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    provider.createAuthorizationURL = async (options) => {
      const url = await create(options);
      if (ending === 'provider omitted state') url.searchParams.delete('state');
      entered();
      await held;
      return url;
    };
    const started = client.json('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: '/',
    });
    await reached;
    if (ending === 'logout') expect((await client.json('/api/auth/sign-out', {})).status).toBe(200);
    release();
    const rejected = await started;
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toEqual({ error: 'binding_invalid' });
    provider.createAuthorizationURL = create;
    if (ending === 'logout') {
      expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
        status: 'anonymous',
      });
    } else expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
    await client.signIn();
    expect((await client.json('/api/browser-binding/preference', {})).status).toBe(200);
  },
);

test('concurrent provider callbacks cannot overwrite another browser’s committed identity credentials or end either existing login', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const original = await (await client.request('/api/bootstrap')).json();
  const provider = (await fixture.auth.$context).socialProviders.find(
    (item) => item.id === 'google',
  );
  if (!provider) throw new Error('Google provider missing');
  const validate = provider.validateAuthorizationCode;
  let entered = () => {};
  let release = () => {};
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(provider, 'validateAuthorizationCode').mockImplementationOnce(async (options) => {
    const tokens = await validate(options);
    entered();
    await held;
    return tokens;
  });
  const start = await client.json('/api/auth/sign-in/social', {
    provider: 'google',
    callbackURL: '/',
  });
  const { url } = await start.json();
  const callback = client.request(url);
  await reached;
  const other = fixture.client();
  await other.signIn();
  const committed = await (await other.request('/api/bootstrap')).json();
  release();
  const rejected = await callback;
  expect(rejected.headers.get('location')).toContain('binding_invalid');
  expect(rejected.headers.getSetCookie().some((value) => value.includes('session_token='))).toBe(
    false,
  );
  expect(await (await client.request('/api/bootstrap')).json()).toEqual(original);
  expect(await (await other.request('/api/bootstrap')).json()).toEqual(committed);
  expect((await client.request(url)).headers.get('location')).toContain('binding_invalid');
  await client.signIn();
  expect((await client.json('/api/browser-binding/preference', {})).status).toBe(200);
});

test('an unavailable provider cannot start a new login or replace the current one', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const before = await (await client.request('/api/bootstrap')).json();
  const provider = (await fixture.auth.$context).socialProviders.find(
    (item) => item.id === 'google',
  );
  if (!provider) throw new Error('Google provider missing');
  const create = provider.createAuthorizationURL;
  provider.createAuthorizationURL = async () => {
    throw new Error('Synthetic provider outage');
  };
  const failed = await client.json('/api/auth/sign-in/social', {
    provider: 'google',
    callbackURL: '/',
  });
  expect(failed.ok).toBe(false);
  expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
  provider.createAuthorizationURL = create;
  await client.signIn();
  expect((await client.json('/api/browser-binding/preference', {})).status).toBe(200);
});

test.each(['inactivity', 'absolute'] as const)(
  'a binding left after %s session cleanup cannot invent logout authority without accepted private work',
  async (ending) => {
    let time = Date.now();
    fixture = await applicationFixture({ now: () => time });
    const client = fixture.client();
    await client.signIn();
    const other = fixture.client();
    await other.signIn();
    const preference = await (await client.json('/api/browser-binding/preference', {})).json();
    const another = await (await other.request('/api/bootstrap')).json();
    time += ending === 'inactivity' ? 30 * 60_000 : 8 * 60 * 60_000;
    // Model legitimate independent authentication cleanup after the known
    // policy boundary. The remaining cookie alone is never a private-task proof.
    fixture.database.prepare('DELETE FROM session WHERE id = ?').run(preference.sessionId);
    const rejected = await client.json('/api/auth/sign-out', {});
    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({ error: 'unauthenticated' });
    expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
      status: 'anonymous',
    });
    // A new explicit login is permitted, but the expired authority stays gone.
    await client.signIn();
    expect((await client.json('/api/browser-binding/preference', {})).status).toBe(200);
    expect((await (await client.request('/api/bootstrap')).json()).user.id).toBe(another.user.id);
  },
);

test('repeating logout with only its remaining binding is refused and does not create a new login', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  expect((await client.json('/api/auth/sign-out', {})).status).toBe(200);
  expect((await client.json('/api/auth/sign-out', {})).status).toBe(401);
  expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
    status: 'anonymous',
  });
});

test('logout retains its captured finite expiry proof when independent cleanup removes that session during its awaited authentication read', async () => {
  let time = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => time);
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const preference = await (await client.json('/api/browser-binding/preference', {})).json();
  let entered = () => {};
  let release = () => {};
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = fixture.auth.api.getSession.bind(fixture.auth.api);
  vi.spyOn(fixture.auth.api, 'getSession').mockImplementationOnce(async (options) => {
    entered();
    await held;
    return read(options);
  });
  const logout = client.json('/api/auth/sign-out', {});
  await reached;
  time = preference.expiresAt + 1;
  // Independent cleanup can remove an ended row while the library response
  // is pending. This is not revocation and must retain the captured proof.
  fixture.database.prepare('DELETE FROM session WHERE id = ?').run(preference.sessionId);
  release();
  expect((await logout).status).toBe(200);
  expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
    status: 'anonymous',
  });
  expect((await client.json('/api/auth/sign-out', {})).status).toBe(401);
  await client.signIn();
  expect((await client.json('/api/browser-binding/preference', {})).status).toBe(200);
});

test('a callback with the wrong method or public host cannot consume the valid login attempt', async () => {
  fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const before = await (await client.request('/api/bootstrap')).json();
  const started = await client.json('/api/auth/sign-in/social', {
    provider: 'google',
    callbackURL: '/',
  });
  const { url } = await started.json();
  expect((await client.request(url, { method: 'POST' })).headers.get('location')).toContain(
    'binding_invalid',
  );
  const foreign = new URL(url);
  foreign.host = 'other.example.test';
  expect((await client.request(foreign.href)).headers.get('location')).toContain('binding_invalid');
  expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
  const completed = await client.request(url);
  expect(completed.headers.get('location')).toContain('loginConfirmation=');
  expect((await client.json('/api/browser-binding/preference', {})).status).toBe(200);
});

test.each([
  ['before creation', -1, false],
  ['beyond absolute limit', 30_600_001, false],
  ['valid crash anchor with absent activity', 600_000, true],
] as const)(
  'a persisted work anchor %s cannot invent an unbounded idle extension on restart',
  async (_name, offset, valid) => {
    let time = Date.now();
    fixture = await applicationFixture({ now: () => time });
    const client = fixture.client();
    await client.signIn();
    const preference = await (await client.json('/api/browser-binding/preference', {})).json();
    const started = time;
    // Arrange a damaged/older installation specimen, then observe only public
    // policy and authentication after the actual app restart.
    fixture.database
      .prepare('UPDATE session SET idleWorkUntil = ?, lastActivityAt = NULL WHERE id = ?')
      .run(started + offset, preference.sessionId);
    time += 600_000;
    await fixture.restart();
    const status = await (await client.json('/api/browser-binding/status', {})).json();
    expect(status).toMatchObject({
      state: 'active',
      expiresAt: started + (valid ? 2_400_000 : 1_800_000),
    });
    time = status.expiresAt;
    expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
      status: 'anonymous',
    });
  },
);
