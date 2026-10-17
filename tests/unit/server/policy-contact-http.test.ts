import { afterEach, expect, test } from 'vitest';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
afterEach(() => fixture?.close());

test('the public policy exposes only the contact and only the installation operator can change it', async () => {
  fixture = await applicationFixture();
  const anonymous = fixture.client();
  expect(await (await anonymous.request('/api/policy-contact')).json()).toEqual({ email: null });
  expect(
    (await anonymous.json('/api/operator/policy-contact', { email: 'privacy@example.test' }))
      .status,
  ).toBe(401);
  const operator = fixture.client();
  await operator.signIn();
  expect(
    (await operator.json('/api/operator/policy-contact', { email: 'privacy@example.test' })).status,
  ).toBe(200);
  expect(
    (await operator.json('/api/operator/policy-contact', { email: 'broken address' })).status,
  ).toBe(400);
  expect(
    (
      await operator.json(
        '/api/operator/policy-contact',
        { email: 'other@example.test' },
        { origin: 'https://attacker.example' },
      )
    ).status,
  ).toBe(403);
  fixture.setSubject('another-household-administrator');
  const other = fixture.client();
  await other.signIn();
  expect(
    (await other.json('/api/operator/policy-contact', { email: 'other@example.test' })).status,
  ).toBe(403);
  await fixture.restart();
  expect(await (await anonymous.request('/api/policy-contact')).json()).toEqual({
    email: 'privacy@example.test',
  });
});
