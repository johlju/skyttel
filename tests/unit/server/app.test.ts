import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
beforeEach(async () => {
  fixture = await applicationFixture();
});
afterEach(() => {
  fixture.close();
  vi.restoreAllMocks();
});

describe('public application HTTP interface', () => {
  test('rejects outdated or absent browser identity before changing household content', async () => {
    fixture.close();
    const identity = { commit: 'a'.repeat(40), version: '0.1.0-preview.2+2' };
    fixture = await applicationFixture({ identity });
    const client = fixture.client();
    await client.signIn();
    const version = await client.request('/api/version');
    expect(version.headers.get('cache-control')).toBe('no-store');
    expect(await version.json()).toMatchObject({ ...identity, database: { status: 'ready' } });
    for (const header of [undefined, `${'b'.repeat(40)}:0.1.0-preview.1+1`]) {
      const response = await client.request('/api/households', {
        method: 'POST',
        body: JSON.stringify({ name: 'Linden' }),
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
          ...(header ? { 'X-Skyttel-Build': header } : {}),
        },
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'client_outdated' });
      expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
        status: 'setup',
      });
    }
    expect(
      (
        await client.request('/api/households', {
          method: 'POST',
          body: JSON.stringify({ name: 'Linden' }),
          headers: {
            origin: 'http://localhost:3000',
            'content-type': 'application/json',
            'X-Skyttel-Build': `${identity.commit}:${identity.version}`,
          },
        })
      ).status,
    ).toBe(201);
  });

  test('offers setup to the configured administrator after provider authentication', async () => {
    const client = fixture.client();
    expect((await client.signIn()).status).toBe(302);
    const response = await client.request('/api/bootstrap');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'setup',
      user: { name: 'Alex Exempel' },
    });
  });

  test('provides readiness and security headers while keeping anonymous household access closed', async () => {
    const client = fixture.client();
    const health = await client.request('/healthz');
    expect(await health.json()).toEqual({ status: 'ok' });
    const bootstrap = await client.request('/api/bootstrap');
    expect(await bootstrap.json()).toEqual({
      status: 'anonymous',
      providers: ['google', 'microsoft'],
    });
    expect(bootstrap.headers.get('cache-control')).toBe('no-store');
    expect(bootstrap.headers.get('referrer-policy')).toBe('no-referrer');
    expect(bootstrap.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect((await client.request('/api/households/missing')).status).toBe(401);
    expect((await client.json('/api/households', { name: 'Linden' })).status).toBe(401);
  });

  test('creates a household once and makes it available through both read interfaces', async () => {
    const client = fixture.client();
    await client.signIn();
    const created = await client.json('/api/households', { name: '  Linden  ' });
    expect(created.status).toBe(201);
    const { household } = (await created.json()) as {
      household: { id: string; name: string; role: string };
    };
    expect(household).toMatchObject({ name: 'Linden', role: 'administrator' });
    expect(await (await client.request(`/api/households/${household.id}`)).json()).toEqual({
      household,
    });
    expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
      status: 'ready',
      household,
    });
    expect((await client.json('/api/households', { name: 'Another household' })).status).toBe(409);
    expect((await client.request('/api/households/missing')).status).toBe(403);
  });

  test.each(['google', 'microsoft'])(
    'does not grant setup to an unconfigured %s identity',
    async (provider) => {
      fixture.setSubject('other-subject');
      const client = fixture.client();
      await client.signIn(provider);
      expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
        status: 'forbidden',
      });
      expect((await client.json('/api/households', { name: 'Linden' })).status).toBe(403);
    },
  );

  test.each<{ headers: Record<string, string>; body: string; status: number }>([
    {
      headers: { origin: 'https://other.example.test', 'content-type': 'application/json' },
      body: '{"name":"Linden"}',
      status: 403,
    },
    { headers: { origin: 'http://localhost:3000' }, body: '{"name":"Linden"}', status: 400 },
    {
      headers: { origin: 'http://localhost:3000', 'content-type': 'text/plain' },
      body: '{"name":"Linden"}',
      status: 400,
    },
    ...['invalid JSON', 'null', '[]', '{}', '{"name":42}', '{"name":" "}'].map((body) => ({
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      body,
      status: 400,
    })),
  ])(
    'rejects a malformed or untrusted creation request: $body',
    async ({ headers, body, status }) => {
      const client = fixture.client();
      await client.signIn();
      expect(
        (await client.request('/api/households', { method: 'POST', headers, body })).status,
      ).toBe(status);
      expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
        status: 'setup',
      });
    },
  );

  test('rejects an oversized body before processing the request', async () => {
    const client = fixture.client();
    expect((await client.json('/api/households', { name: 'x'.repeat(20_000) })).status).toBe(413);
  });

  test('keeps unexposed authentication and unknown API routes unavailable', async () => {
    const client = fixture.client();
    for (const path of ['/api/auth/sign-up/email', '/api/auth/sign-in/email', '/api/unknown']) {
      const response = await client.json(path, {});
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'not_found' });
    }
  });

  test('sign-out invalidates the authenticated session', async () => {
    const client = fixture.client();
    await client.signIn();
    expect(await (await client.request('/api/auth/get-session')).json()).toMatchObject({
      user: { name: 'Alex Exempel' },
    });
    expect((await client.json('/api/auth/sign-out', {})).status).toBe(200);
    expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
      status: 'anonymous',
    });
  });

  test.each(['', '  ', null, 42])(
    'rejects invalid provider identity %j without creating a session',
    async (subject) => {
      fixture.setSubject(subject);
      const client = fixture.client();
      await client.signIn();
      expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
        status: 'anonymous',
      });
    },
  );

  test('provider failure leaves the client anonymous', async () => {
    fixture.failProvider();
    const client = fixture.client();
    await client.signIn();
    expect(await (await client.request('/api/bootstrap')).json()).toMatchObject({
      status: 'anonymous',
    });
  });

  test('unexpected storage failures return a generic response without leaking details', async () => {
    const client = fixture.client();
    await client.signIn();
    fixture.database.close();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await client.request('/api/bootstrap');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal_error' });
    expect(log.mock.calls.flat().join('\n')).not.toContain(fixture.config.databasePath);
  });
});
