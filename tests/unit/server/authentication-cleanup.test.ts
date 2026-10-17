import { afterEach, expect, test, vi } from 'vitest';
import { createApp } from '../../../src/server/app.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
const timerTypes = [
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
  'setImmediate',
  'clearImmediate',
] as const;
afterEach(async () => {
  await fixture?.app.close();
  fixture?.close();
  vi.useRealTimers();
});

test('expired sign-in attempts are physically removed without another browser request', async () => {
  let time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const started = await client.json('/api/auth/sign-in/social', {
    provider: 'google',
    callbackURL: '/',
  });
  const callback = (await started.json()).url;
  const stored = () =>
    fixture.database.prepare('SELECT count(*) AS count FROM browser_binding_attempt').get();
  expect(stored()).toEqual({ count: 1 });
  vi.useFakeTimers({ toFake: [...timerTypes] });
  // Restart the application's background lifecycle with its original database.
  await fixture.restart();
  time += 599_999;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(stored()).toEqual({ count: 1 });
  time += 1;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(stored()).toEqual({ count: 0 });
  const rejected = await client.request(callback);
  expect(rejected.headers.get('location')).toContain('binding_invalid');
});

test('session expiry and the action result window keep their original anchors across restart and repeated cleanup', async () => {
  let time = Date.now();
  const startedAt = time;
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const session = (await (await client.request('/api/auth/get-session')).json()).session;
  const id = 'f01ac83d-bd0d-4b20-a8c0-c28600c4c799';
  const revoked = await client.json('/api/browser-binding/revoke', {
    id,
    sessionId: session.id,
    rememberMe: false,
  });
  expect(revoked.status).toBe(200);
  expect((await client.registerBinding(await revoked.json())).status).toBe(200);
  const count = (table: string) =>
    (fixture.database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number })
      .count;
  vi.useFakeTimers({ toFake: [...timerTypes] });
  await fixture.restart();
  const beforeEnd = startedAt + 28_799_999;
  while (time + 29 * 60_000 < beforeEnd) {
    time += 29 * 60_000;
    expect((await client.json('/api/browser-binding/activity', { kind: 'navigate' })).status).toBe(
      200,
    );
  }
  time = beforeEnd;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(count('session')).toBe(1);
  time += 1;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(count('session')).toBe(0);
  expect(count('browser_binding')).toBe(0);
  expect(count('storage_action_result')).toBe(1);
  await fixture.restart();
  time = startedAt + 86_399_999;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(count('storage_action_result')).toBe(1);
  time += 1;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(count('storage_action_result')).toBe(0);
  expect(count('user')).toBe(1);
  expect(count('account')).toBe(1);
  await fixture.restart();
  time += 86_400_000;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(count('storage_action_result')).toBe(0);
  expect(await (await client.request('/api/auth/get-session')).json()).toBeNull();
});

test('cleanup removes obsolete OAuth records at their stored deadlines while preserving live external authority', async () => {
  let time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const { session, user } = await (await client.request('/api/auth/get-session')).json();
  const { household } = await (await client.json('/api/households', { name: 'Provet' })).json();
  const registration = await (
    await client.json('/api/auth/oauth2/register', {
      application_type: 'native',
      client_name: 'Extern provklient',
      redirect_uris: [`${fixture.config.origin}/assistant-callback`],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope: 'skyttel:read',
    })
  ).json();
  const end = time + 1_000;
  const iso = (value: number) => new Date(value).toISOString();
  const db = fixture.database;
  db.prepare(
    'INSERT INTO assistant_connection (id, userId, householdId, clientId, createdAt) VALUES (?, ?, ?, ?, ?)',
  ).run('external', user.id, household.id, registration.client_id, iso(time));
  for (const [id, expiry, revoked] of [
    ['expired', end, null],
    ['dependent', end, null],
    ['revoked', end + 60_000, time],
    ['rotated', end + 120_000, time],
  ] as const)
    db.prepare(
      'INSERT INTO oauthRefreshToken (id, token, clientId, userId, referenceId, expiresAt, createdAt, revoked, scopes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      `synthetic-refresh-${id}`,
      registration.client_id,
      user.id,
      'external',
      iso(expiry),
      iso(time),
      revoked,
      'skyttel:read',
    );
  for (const [id, expiry, revoked, refresh] of [
    ['expired', end, null, null],
    ['live', end + 60_000, null, 'dependent'],
    ['revoked', end + 60_000, time, null],
  ] as const)
    db.prepare(
      'INSERT INTO oauthAccessToken (id, token, clientId, userId, referenceId, refreshId, expiresAt, createdAt, revoked, scopes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id,
      `synthetic-access-${id}`,
      registration.client_id,
      user.id,
      'external',
      refresh,
      expiry,
      time,
      revoked,
      'skyttel:read',
    );
  db.prepare(
    'UPDATE oauthRefreshToken SET rotatedAt = ?, rotationReplayResponse = ?, rotationReplayExpiresAt = ? WHERE id = ?',
  ).run(time, 'synthetic-rotation-reply', end, 'rotated');
  db.prepare('INSERT INTO oauthClientAssertion (id, expiresAt) VALUES (?, ?)').run(
    'assertion',
    iso(end),
  );
  db.prepare(
    'INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('expired', 'synthetic-verification', 'synthetic-state', end, time, time);
  db.prepare(
    'INSERT INTO login_link (sessionId, userId, provider, stage, expiresAt) VALUES (?, ?, ?, ?, ?)',
  ).run(session.id, user.id, 'microsoft', 'complete', end);
  const ids = (table: string) => db.prepare(`SELECT id FROM ${table} ORDER BY id`).all();
  vi.useFakeTimers({ toFake: [...timerTypes] });
  await fixture.restart();
  time = end - 1;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(ids('oauthAccessToken')).toEqual([{ id: 'expired' }, { id: 'live' }]);
  expect(ids('oauthRefreshToken')).toEqual([
    { id: 'dependent' },
    { id: 'expired' },
    { id: 'rotated' },
  ]);
  expect(ids('oauthClientAssertion')).toEqual([{ id: 'assertion' }]);
  expect(ids('verification')).toEqual([{ id: 'expired' }]);
  expect(
    db.prepare('SELECT rotationReplayResponse FROM oauthRefreshToken WHERE id = ?').get('rotated'),
  ).toEqual({ rotationReplayResponse: 'synthetic-rotation-reply' });
  time += 1;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(ids('oauthAccessToken')).toEqual([{ id: 'live' }]);
  expect(ids('oauthRefreshToken')).toEqual([{ id: 'dependent' }, { id: 'rotated' }]);
  expect(
    db
      .prepare(
        'SELECT rotationReplayResponse, rotationReplayExpiresAt FROM oauthRefreshToken WHERE id = ?',
      )
      .get('rotated'),
  ).toEqual({ rotationReplayResponse: null, rotationReplayExpiresAt: null });
  expect(ids('oauthClientAssertion')).toEqual([]);
  expect(ids('verification')).toEqual([]);
  expect(db.prepare('SELECT sessionId FROM login_link').all()).toEqual([]);
  expect(ids('assistant_connection')).toEqual([{ id: 'external' }]);
  expect(ids('oauthClient')).toHaveLength(1);
  time = end + 60_000;
  await vi.advanceTimersByTimeAsync(60_100);
  expect(ids('oauthAccessToken')).toEqual([]);
  expect(ids('oauthRefreshToken')).toEqual([]);
  expect(ids('assistant_connection')).toEqual([{ id: 'external' }]);
  expect((await client.request(`/api/households/${household.id}/map`)).status).toBe(200);
});

test.each(['busy', 'write failure'] as const)(
  'startup refuses to serve private crash authority when cleanup has a %s',
  async (failure) => {
    const time = Date.now();
    fixture = await applicationFixture({ now: () => time });
    const client = fixture.client();
    await client.signIn();
    const { session, user } = await (await client.request('/api/auth/get-session')).json();
    const { household } = await (await client.json('/api/households', { name: 'Provet' })).json();
    const db = fixture.database;
    db.prepare('INSERT INTO oauthClient (id, clientId, redirectUris) VALUES (?, ?, ?)').run(
      'private-client',
      'private-client',
      '[]',
    );
    db.prepare(
      'INSERT INTO assistant_connection (id, userId, householdId, clientId, createdAt, browserSessionId, taskExpiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(
      'private',
      user.id,
      household.id,
      'private-client',
      new Date(time).toISOString(),
      session.id,
      time + 1_800_000,
    );
    if (failure === 'busy') db.exec('BEGIN');
    else
      db.exec(
        "CREATE TRIGGER refuse_private_cleanup BEFORE DELETE ON assistant_connection BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END",
      );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let unexpected: ReturnType<typeof createApp> | undefined;
    try {
      expect(() => {
        unexpected = createApp({
          config: fixture.config,
          database: db,
          auth: fixture.auth,
          now: () => time,
        });
      }).toThrow('authentication_cleanup_failed');
      expect(errors).toHaveBeenCalledWith(
        JSON.stringify({ event: 'authentication_cleanup_failed' }),
      );
      expect(db.prepare('SELECT count(*) AS count FROM assistant_connection').get()).toEqual({
        count: 1,
      });
    } finally {
      if (db.inTransaction) db.exec('ROLLBACK');
      await unexpected?.close();
      errors.mockRestore();
    }
  },
);

test('background cleanup waits for an unrelated SQLite transaction and resumes without browser traffic', async () => {
  let time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const attempt = await client.json('/api/auth/sign-in/social', {
    provider: 'google',
    callbackURL: '/',
  });
  const callback = (await attempt.json()).url;
  vi.useFakeTimers({ toFake: [...timerTypes] });
  await fixture.restart();
  const db = fixture.database;
  db.exec('BEGIN');
  try {
    time += 600_000;
    await vi.advanceTimersByTimeAsync(60_100);
    expect(db.inTransaction).toBe(true);
    expect(db.prepare('SELECT count(*) AS count FROM browser_binding_attempt').get()).toEqual({
      count: 1,
    });
  } finally {
    db.exec('COMMIT');
  }
  await vi.advanceTimersByTimeAsync(1_000);
  expect(db.prepare('SELECT count(*) AS count FROM browser_binding_attempt').get()).toEqual({
    count: 0,
  });
  expect((await client.request(callback)).headers.get('location')).toContain('binding_invalid');
});

test('bounded cleanup keeps committed progress after storage failure and retries without renewing expired records', async () => {
  const time = Date.now();
  fixture = await applicationFixture({ now: () => time });
  const client = fixture.client();
  await client.signIn();
  const { user } = await (await client.request('/api/auth/get-session')).json();
  const db = fixture.database;
  db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO storage_action_result (id, userId, kind, status, completedAt, checkUntil, sessionExpiresAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (let index = 0; index < 205; index++)
      insert.run(
        `synthetic-${index}`,
        user.id,
        'revoke',
        'completed',
        time - 86_400_000,
        time,
        time,
      );
    insert.run('blocked', user.id, 'revoke', 'completed', time - 86_400_000, time, time);
    db.exec(
      "CREATE TRIGGER refuse_one_result BEFORE DELETE ON storage_action_result WHEN OLD.id = 'blocked' BEGIN SELECT RAISE(ABORT, 'synthetic storage failure'); END",
    );
  }).immediate();
  const count = () =>
    (db.prepare('SELECT count(*) AS count FROM storage_action_result').get() as { count: number })
      .count;
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    vi.useFakeTimers({ toFake: [...timerTypes] });
    await fixture.restart();
    errors.mockClear();
    await vi.advanceTimersByTimeAsync(1_000);
    const remaining = count();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThan(206);
    expect(errors.mock.calls).toEqual([
      [JSON.stringify({ event: 'authentication_cleanup_failed' })],
    ]);
    await vi.advanceTimersByTimeAsync(60_100);
    expect(count()).toBe(remaining);
    db.exec('DROP TRIGGER refuse_one_result');
    await vi.advanceTimersByTimeAsync(60_100);
    expect(count()).toBe(0);
    expect(db.prepare('SELECT count(*) AS count FROM user').get()).toEqual({ count: 1 });
    expect((await client.request('/api/auth/get-session')).status).toBe(200);
  } finally {
    errors.mockRestore();
  }
});
