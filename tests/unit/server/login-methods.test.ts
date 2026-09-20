import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
beforeEach(async () => {
  fixture = await applicationFixture();
});
afterEach(() => {
  vi.restoreAllMocks();
  fixture.close();
});

async function begin(
  client: ReturnType<typeof fixture.client>,
  step = 'prove',
  provider = 'google',
) {
  const response = await client.json(`/api/login-methods/${step}`, { provider });
  expect(response.status).toBe(200);
  return (await response.json()).url as string;
}

test.each(['google', 'microsoft'])(
  'linking from %s preserves the user through either login',
  async (provider) => {
    const client = fixture.client();
    await client.signIn(provider);
    const before = await (await client.request('/api/bootstrap')).json();
    expect(await (await client.request('/api/login-methods')).json()).toEqual({
      providers: [provider],
      stage: null,
    });
    await client.request(await begin(client, 'prove', provider));
    const target = provider === 'google' ? 'microsoft' : 'google';
    fixture.setSubject('other-provider-subject');
    await client.request(await begin(client, 'add', target));
    expect(await (await client.request('/api/login-methods')).json()).toEqual({
      providers: ['google', 'microsoft'],
      stage: 'complete',
    });
    await client.json('/api/auth/sign-out', {});
    await client.signIn(target);
    expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
  },
);

test('public linking endpoints reject unauthenticated, cross-origin and malformed requests', async () => {
  const client = fixture.client();
  expect((await client.request('/api/login-methods')).status).toBe(401);
  expect((await client.json('/api/login-methods/prove', { provider: 'google' })).status).toBe(401);
  await client.signIn();
  expect(
    (await client.request('/api/login-methods/prove', { method: 'POST', body: '{}' })).status,
  ).toBe(403);
  for (const body of [null, {}, { provider: 'unknown' }])
    expect((await client.json('/api/login-methods/prove', body)).status).toBe(400);
  expect((await client.json('/api/login-methods/unknown', { provider: 'google' })).status).toBe(
    400,
  );
  expect((await client.json('/api/login-methods/prove', { provider: 'microsoft' })).status).toBe(
    409,
  );
  expect((await client.json('/api/login-methods/add', { provider: 'microsoft' })).status).toBe(409);
  await client.request(await begin(client));
  expect((await client.json('/api/login-methods/add', { provider: 'google' })).status).toBe(409);
});

test('expired existing proof cannot authorize linking', async () => {
  const client = fixture.client();
  await client.signIn();
  await client.request(await begin(client));
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000);
  expect((await client.json('/api/login-methods/add', { provider: 'microsoft' })).status).toBe(409);
  expect(await (await client.request('/api/login-methods')).json()).toEqual({
    providers: ['google'],
    stage: null,
  });
});

test('expired, cancelled and replayed callbacks cannot attach a new provider', async () => {
  const client = fixture.client();
  await client.signIn();
  const expired = await begin(client);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000);
  expect((await client.request(expired)).headers.get('location')).toContain('failed=1');
  clock.mockRestore();
  const proof = await begin(client);
  await client.request(proof);
  await client.request(proof);
  expect((await (await client.request('/api/login-methods')).json()).stage).toBe('verified');
  const add = await begin(client, 'add', 'microsoft');
  await client.json('/api/login-methods/cancel', {});
  fixture.setSubject('new-identity');
  await client.request(add);
  expect(await (await client.request('/api/login-methods')).json()).toEqual({
    providers: ['google'],
    stage: null,
  });
});

test.each(['wrong identity', 'provider failure', 'invalid profile'])(
  'proof failure retains the original session: %s',
  async (failure) => {
    const client = fixture.client();
    await client.signIn();
    const before = await (await client.request('/api/bootstrap')).json();
    const proof = await begin(client);
    if (failure === 'provider failure') fixture.failProvider();
    else fixture.setSubject(failure === 'invalid profile' ? null : 'wrong-identity');
    await client.request(proof);
    expect(await (await client.request('/api/bootstrap')).json()).toEqual(before);
    expect(await (await client.request('/api/login-methods')).json()).toEqual({
      providers: ['google'],
      stage: 'failed',
    });
  },
);

test('a second session cannot complete the first session verification', async () => {
  const client = fixture.client();
  const other = fixture.client();
  await client.signIn();
  const proof = await begin(client);
  await other.signIn();
  expect((await other.request(proof)).headers.get('location')).toContain('failed=1');
  expect((await (await client.request('/api/login-methods')).json()).stage).toBe('prove');
});

test('cancellation reports completion when a verified callback is already committing', async () => {
  const client = fixture.client();
  await client.signIn();
  await client.request(await begin(client));
  const url = await begin(client, 'add', 'microsoft');
  fixture.setSubject('new-microsoft');
  const provider = fixture.pauseProvider();
  const callback = client.request(url);
  await provider.reached;
  const cancel = client.json('/api/login-methods/cancel', {});
  await new Promise<void>((resolve) => setImmediate(resolve));
  provider.resume();
  await callback;
  expect(await (await cancel).json()).toEqual({ status: 'complete' });
  expect(await (await client.request('/api/login-methods')).json()).toEqual({
    providers: ['google', 'microsoft'],
    stage: 'complete',
  });
});
