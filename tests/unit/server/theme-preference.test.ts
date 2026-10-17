import { afterEach, beforeEach, expect, test } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
beforeEach(async () => {
  fixture = await applicationFixture();
});
afterEach(() => {
  fixture.close();
});

test('account theme HTTP interface protects each authenticated owner without household membership', async () => {
  const path = '/api/theme-preference';
  const alex = fixture.client();
  expect((await alex.request(path)).status).toBe(401);
  expect((await alex.json(path, { mode: 'dark' })).status).toBe(401);
  await alex.signIn();
  const initial = await alex.request(path);
  expect(initial.headers.get('cache-control')).toBe('no-store');
  const owner = await initial.json();
  expect(owner.mode).toBe('system');
  expect(await (await alex.json(path, { mode: 'dark' })).json()).toEqual({
    userId: owner.userId,
    mode: 'dark',
  });
  for (const body of [{ mode: 'invalid' }, { mode: 'light', userId: 'other' }, null]) {
    expect((await alex.json(path, body)).status).toBe(400);
  }
  expect(
    (
      await alex.request(path, {
        method: 'POST',
        headers: { origin: fixture.config.origin },
        body: '{',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await alex.request(path, {
        method: 'POST',
        headers: { origin: 'https://example.test' },
        body: JSON.stringify({ mode: 'light' }),
      })
    ).status,
  ).toBe(403);
  fixture.setSubject('other-user');
  const other = fixture.client();
  await other.signIn('microsoft');
  expect(await (await other.request(`${path}?userId=${owner.userId}`)).json()).toMatchObject({
    mode: 'system',
  });
  expect((await other.json(path, { userId: owner.userId, mode: 'light' })).status).toBe(400);
  await other.json(path, { mode: 'light' });
  expect(await (await alex.request(path)).json()).toEqual({ userId: owner.userId, mode: 'dark' });
  expect(await (await other.request(path)).json()).toMatchObject({ mode: 'light' });
});
