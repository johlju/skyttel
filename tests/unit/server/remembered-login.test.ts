import { afterEach, expect, test } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
afterEach(() => fixture?.close());

test.each(['session policy', 'binding'] as const)(
  'explicit login checks the associated session policy when only the %s deadline has elapsed',
  async (expired) => {
    let time = Date.now();
    fixture = await applicationFixture({ now: () => time });
    const client = fixture.client();
    await client.signIn();
    const start = await client.json('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: '/',
      rememberMe: true,
      informationVersion: 1,
    });
    const completed = await client.request((await start.json()).url);
    await client.activateRemembered();
    const proof = new URL(
      completed.headers.get('location') ?? '',
      fixture.config.origin,
    ).searchParams.get('loginConfirmation');
    const confirmation = await client.request(`/api/browser-binding/confirmation?proof=${proof}`, {
      headers: { origin: fixture.config.origin },
    });
    const { sessionId } = await confirmation.json();
    const binding = await (await client.json('/api/browser-binding/candidate', {})).json();
    // Arrange mismatched durable deadlines through the installation boundary.
    // A cookie alone is safe to retire only after its actual session expires.
    fixture.database
      .prepare(
        expired === 'session policy'
          ? 'UPDATE session SET absoluteExpiresAt = ? WHERE id = ?'
          : 'UPDATE browser_binding SET expiresAt = ? WHERE sessionId = ?',
      )
      .run(time + 60_000, sessionId);
    const initialize = () =>
      fixture.app.request(`${fixture.config.origin}/api/browser-binding/candidate`, {
        method: 'POST',
        headers: {
          origin: fixture.config.origin,
          cookie: `${binding.cookieName}=${binding.candidate}`,
        },
      });
    time += 59_999;
    expect((await initialize()).status).toBe(409);
    time += 1;
    const initialized = await initialize();
    expect(initialized.status).toBe(expired === 'session policy' ? 200 : 409);
    if (expired === 'session policy') {
      expect((await initialized.json()).candidate).not.toBe(binding.candidate);
      expect(await (await client.request('/api/auth/get-session')).json()).toBeNull();
    } else {
      // Restoring only the binding deadline proves the live session survived
      // the unauthenticated initialization attempt.
      fixture.database
        .prepare('UPDATE browser_binding SET expiresAt = ? WHERE sessionId = ?')
        .run(time + 60_000, sessionId);
      expect(await (await client.request('/api/auth/get-session')).json()).toMatchObject({
        session: { id: sessionId },
      });
    }
  },
);

// Corrupt persisted records at the installation boundary. HTTP callers cannot
// create these incompatible server records through the normalized login API.
// Observe only confirmation, ordinary application access and outgoing cookies.
test.each([
  ['structure version', 'choiceSchemaVersion', 999],
  ['information version', 'informationVersion', 999],
  ['changed purpose', 'choicePurpose', 'another-purpose'],
  ['missing decision', 'decidedAt', null],
  ['negative decision', 'decidedAt', -1],
  ['future decision', 'decidedAt', 'future'],
  ['missing absolute bound', 'absoluteExpiresAt', null],
  ['overlong absolute bound', 'absoluteExpiresAt', 'overlong'],
  ['missing active choice', 'rememberMe', null],
] as const)(
  'incompatible persisted %s cannot continue remembered login past the ordinary boundary',
  async (_name, field, value) => {
    let time = Date.now();
    fixture = await applicationFixture({ now: () => time });
    const client = fixture.client();
    await client.signIn();
    const start = await client.json('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: '/',
      rememberMe: true,
      informationVersion: 1,
    });
    const callback = await client.request((await start.json()).url);
    const activation = await client.activateRemembered();
    const proof = new URL(
      callback.headers.get('location') ?? '',
      fixture.config.origin,
    ).searchParams.get('loginConfirmation');
    const confirmation = () =>
      client.request(`/api/browser-binding/confirmation?proof=${proof}`, {
        headers: { origin: fixture.config.origin },
      });
    const confirmed = await (await confirmation()).json();
    expect(confirmed).toMatchObject({ remembered: true, expiresAt: time + 604_800_000 });
    expect(
      activation.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith('better-auth.session_token=')),
    ).toContain(`Expires=${new Date(time + 604_800_000).toUTCString()}`);
    // Simulate incompatible/corrupted durable state before a later release reads
    // it. The session ID is obtained from the authenticated public confirmation.
    fixture.database
      .prepare(`UPDATE session SET ${field} = ? WHERE id = ?`)
      .run(
        value === 'future' ? time + 1 : value === 'overlong' ? time + 604_800_001 : value,
        confirmed.sessionId,
      );
    const ordinary = await confirmation();
    expect(await ordinary.json()).toMatchObject({
      remembered: false,
      expiresAt: time + 28_800_000,
    });
    expect(ordinary.headers.getSetCookie()).toEqual([]);
    const beforeEnd = time + 28_799_999;
    while (time + 29 * 60_000 < beforeEnd) {
      time += 29 * 60_000;
      expect(
        (await client.json('/api/browser-binding/activity', { kind: 'navigate' })).status,
      ).toBe(200);
    }
    time = beforeEnd;
    expect((await confirmation()).status).toBe(200);
    time += 1;
    expect((await confirmation()).status).toBe(401);
    expect(await (await client.request('/api/auth/get-session')).json()).toBeNull();
    expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
      status: 'anonymous',
    });
  },
);
