import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Administration, HouseholdInvitation } from '../../../src/shared/administration.js';
import { applicationFixture } from './fixture.js';

type Fixture = Awaited<ReturnType<typeof applicationFixture>>;
type Client = ReturnType<Fixture['client']>;

let fixture: Fixture;
let administrator: Client;
let administratorId: string;
let householdId: string;

beforeEach(async () => {
  fixture = await applicationFixture();
  administrator = fixture.client();
  await administrator.signIn();
  const state = await (await administrator.request('/api/bootstrap')).json();
  administratorId = state.user.id;
  const created = await administrator.json('/api/households', { name: 'Hushållet Linden' });
  householdId = (await created.json()).household.id;
});

afterEach(() => {
  vi.useRealTimers();
  fixture.close();
});

async function identity(subject: string) {
  fixture.setSubject(subject);
  const client = fixture.client();
  await client.signIn();
  const state = await (await client.request('/api/bootstrap')).json();
  return { client, userId: state.user.id as string };
}

async function invite(userId: string, client = administrator, targetHousehold = householdId) {
  const response = await client.json(`/api/households/${targetHousehold}/invitations`, { userId });
  expect(response.status).toBe(201);
  return (await response.json()) as { invitation: HouseholdInvitation; code: string };
}

async function administration(client = administrator, targetHousehold = householdId) {
  const response = await client.request(`/api/households/${targetHousehold}/administration`);
  expect(response.status).toBe(200);
  return (await response.json()) as Administration;
}

describe('household administration through public HTTP requests', () => {
  test('all mutations reject anonymous, cross-origin, and malformed requests', async () => {
    const anonymous = fixture.client();
    const paths = [
      `/api/households/${householdId}/invitations`,
      `/api/households/${householdId}/invitations/missing/revoke`,
      `/api/households/${householdId}/members/${administratorId}/role`,
      `/api/households/${householdId}/members/${administratorId}/revoke`,
      '/api/invitations/accept',
    ];
    expect((await anonymous.request(`/api/households/${householdId}/administration`)).status).toBe(
      401,
    );
    const invalidRequests: { headers: Record<string, string>; body: string; status: number }[] = [
      { headers: { 'content-type': 'application/json' }, body: '{}', status: 403 },
      {
        headers: { origin: 'https://other.example.test', 'content-type': 'application/json' },
        body: '{}',
        status: 403,
      },
      { headers: { origin: fixture.config.origin }, body: '{}', status: 400 },
      {
        headers: { origin: fixture.config.origin, 'content-type': 'text/plain' },
        body: '{}',
        status: 400,
      },
      ...['invalid JSON', 'null', '[]', '42'].map((body) => ({
        headers: { origin: fixture.config.origin, 'content-type': 'application/json' },
        body,
        status: 400,
      })),
    ];
    for (const path of paths) {
      const denied = await anonymous.json(path, {});
      expect(denied.status, path).toBe(401);
      expect(await denied.json()).toEqual({ error: 'unauthenticated' });
      for (const { headers, body, status } of invalidRequests) {
        const response = await administrator.request(path, { method: 'POST', headers, body });
        expect(response.status, `${path}: ${body}`).toBe(status);
        expect(await response.json()).toEqual({
          error: status === 403 ? 'forbidden' : 'invalid_request',
        });
      }
    }
    expect(await administration()).toEqual({
      members: [{ userId: administratorId, name: 'Alex Exempel', role: 'administrator' }],
      invitations: [],
    });
  });

  test('invalid targets, roles, and codes leave membership unchanged', async () => {
    const invitationsPath = `/api/households/${householdId}/invitations`;
    for (const userId of [undefined, 42, '', 'x'.repeat(129)]) {
      const response = await administrator.json(invitationsPath, { userId });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_request' });
    }
    const unknownUser = await administrator.json(invitationsPath, { userId: 'missing-user' });
    expect(unknownUser.status).toBe(404);
    expect(await unknownUser.json()).toEqual({ error: 'user_not_found' });
    const existingMember = await administrator.json(invitationsPath, { userId: administratorId });
    expect(existingMember.status).toBe(409);
    expect(await existingMember.json()).toEqual({ error: 'already_member' });
    for (const role of [undefined, null, 'owner', 42]) {
      const response = await administrator.json(
        `/api/households/${householdId}/members/${administratorId}/role`,
        { role },
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'invalid_request' });
    }
    for (const code of [undefined, 42, '', 'short', ' '.repeat(43), 'x'.repeat(43)]) {
      const response = await administrator.json('/api/invitations/accept', { code });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'invitation_unavailable' });
    }
    for (const action of ['role', 'revoke']) {
      const response = await administrator.json(
        `/api/households/${householdId}/members/missing-user/${action}`,
        { role: 'member' },
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'member_not_found' });
    }
    const missingInvitation = await administrator.json(`${invitationsPath}/missing/revoke`, {});
    expect(missingInvitation.status).toBe(404);
    expect(await missingInvitation.json()).toEqual({ error: 'invitation_not_found' });
    expect((await administration()).members).toEqual([
      { userId: administratorId, name: 'Alex Exempel', role: 'administrator' },
    ]);
  });

  test('an invitation names one authenticated identity and lists no reusable secret', async () => {
    const recipient = await identity('invited-subject');
    const namesake = await identity('same-name-and-email');
    expect(recipient.userId).not.toBe(namesake.userId);
    const { invitation, code } = await invite(recipient.userId);
    expect(invitation).toMatchObject({
      userId: recipient.userId,
      name: 'Alex Exempel',
      status: 'pending',
    });
    expect(Date.parse(invitation.expiresAt) - Date.parse(invitation.createdAt)).toBe(604_800_000);
    const wrongIdentity = await namesake.client.json('/api/invitations/accept', { code });
    expect(wrongIdentity.status).toBe(409);
    expect(await wrongIdentity.json()).toEqual({ error: 'invitation_unavailable' });
    const listing = await administrator.request(`/api/households/${householdId}/administration`);
    expect(listing.headers.get('cache-control')).toBe('no-store');
    const body = await listing.text();
    expect(body).not.toContain(code);
    expect(body).not.toContain('codeHash');
    expect(JSON.parse(body).invitations).toEqual([invitation]);
    const accepted = await recipient.client.json('/api/invitations/accept', { code });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({
      household: { id: householdId, name: 'Hushållet Linden', role: 'member' },
    });
  });

  test('replacement, revocation, and acceptance each make the previous code unavailable', async () => {
    const recipient = await identity('invited-subject');
    const first = await invite(recipient.userId);
    const replacement = await invite(recipient.userId);
    expect(replacement.code).not.toBe(first.code);
    expect(
      (await recipient.client.json('/api/invitations/accept', { code: first.code })).status,
    ).toBe(409);
    const revokePath = `/api/households/${householdId}/invitations/${replacement.invitation.id}/revoke`;
    expect((await administrator.json(revokePath, {})).status).toBe(200);
    expect((await administrator.json(revokePath, {})).status).toBe(200);
    expect(
      (await recipient.client.json('/api/invitations/accept', { code: replacement.code })).status,
    ).toBe(409);
    expect((await administration()).invitations).toEqual(
      expect.arrayContaining([
        { ...first.invitation, status: 'revoked' },
        { ...replacement.invitation, status: 'revoked' },
      ]),
    );
    const fresh = await invite(recipient.userId);
    expect(
      (await recipient.client.json('/api/invitations/accept', { code: fresh.code })).status,
    ).toBe(200);
    expect(
      (await recipient.client.json('/api/invitations/accept', { code: fresh.code })).status,
    ).toBe(409);
    const acceptedRevocation = await administrator.json(
      `/api/households/${householdId}/invitations/${fresh.invitation.id}/revoke`,
      {},
    );
    expect(acceptedRevocation.status).toBe(409);
    expect(await acceptedRevocation.json()).toEqual({ error: 'invitation_unavailable' });
    expect((await administration()).invitations).toContainEqual({
      ...fresh.invitation,
      status: 'accepted',
    });
  });

  test('an invitation expires at its deadline and can be replaced with a working code', async () => {
    const recipient = await identity('invited-subject');
    const created = await invite(recipient.userId);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    // Arrange the clock boundary without waiting seven days or expiring authentication.
    fixture.database
      .prepare('UPDATE invitation SET expiresAt = ? WHERE id = ?')
      .run(expiresAt, created.invitation.id);
    expect((await administration()).invitations[0].status).toBe('pending');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(expiresAt));
    expect((await administration()).invitations[0]).toMatchObject({
      id: created.invitation.id,
      expiresAt,
      status: 'expired',
    });
    const expired = await recipient.client.json('/api/invitations/accept', { code: created.code });
    expect(expired.status).toBe(409);
    expect(await expired.json()).toEqual({ error: 'invitation_unavailable' });
    const fresh = await invite(recipient.userId);
    expect(
      (await recipient.client.json('/api/invitations/accept', { code: fresh.code })).status,
    ).toBe(200);
  });

  test('only current administrators manage access and the household keeps one administrator', async () => {
    const member = await identity('invited-subject');
    const invitation = await invite(member.userId);
    await member.client.json('/api/invitations/accept', { code: invitation.code });
    const selfPath = `/api/households/${householdId}/members/${administratorId}`;
    for (const action of ['role', 'revoke']) {
      const response = await administrator.json(`${selfPath}/${action}`, { role: 'member' });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: 'last_administrator' });
    }
    expect((await administrator.json(`${selfPath}/role`, { role: 'administrator' })).status).toBe(
      200,
    );
    const memberPath = `/api/households/${householdId}/members/${member.userId}`;
    for (const [path, body] of [
      [`/api/households/${householdId}/invitations`, { userId: administratorId }],
      [`/api/households/${householdId}/invitations/${invitation.invitation.id}/revoke`, {}],
      [`${selfPath}/role`, { role: 'member' }],
      [`${selfPath}/revoke`, {}],
    ] as const) {
      const response = await member.client.json(path, body);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
    expect(
      (await member.client.request(`/api/households/${householdId}/administration`)).status,
    ).toBe(403);
    expect((await administrator.json(`${memberPath}/role`, { role: 'administrator' })).status).toBe(
      200,
    );
    expect((await administrator.json(`${selfPath}/role`, { role: 'member' })).status).toBe(200);
    expect(
      (await administrator.request(`/api/households/${householdId}/administration`)).status,
    ).toBe(403);
    expect((await administrator.json(`${memberPath}/revoke`, {})).status).toBe(403);
    expect((await member.client.json(`${selfPath}/revoke`, {})).status).toBe(200);
    expect((await administrator.request(`/api/households/${householdId}`)).status).toBe(403);
    expect((await administration(member.client)).members).toEqual([
      { userId: member.userId, name: 'Alex Exempel', role: 'administrator' },
    ]);
  });

  test('administration and target identifiers stay within their household', async () => {
    const otherAdministrator = await identity('other-household-administrator');
    const recipient = await identity('other-household-recipient');
    const otherHousehold = 'another-household';
    // This installation creates one household publicly; arrange an independent household.
    fixture.database
      .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
      .run(otherHousehold, 'Hushållet Eken', new Date().toISOString());
    fixture.database
      .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
      .run(otherHousehold, otherAdministrator.userId, 'administrator');
    const invitation = await invite(recipient.userId, otherAdministrator.client, otherHousehold);
    const otherMemberPath = `/api/households/${householdId}/members/${otherAdministrator.userId}`;
    for (const action of ['role', 'revoke']) {
      const response = await administrator.json(`${otherMemberPath}/${action}`, { role: 'member' });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'member_not_found' });
    }
    const wrongHousehold = await administrator.json(
      `/api/households/${householdId}/invitations/${invitation.invitation.id}/revoke`,
      {},
    );
    expect(wrongHousehold.status).toBe(404);
    expect(await wrongHousehold.json()).toEqual({ error: 'invitation_not_found' });
    const hidden = await administrator.request(`/api/households/${otherHousehold}/administration`);
    expect(hidden.status).toBe(403);
    expect(await hidden.json()).toEqual({ error: 'forbidden' });
    for (const [path, body] of [
      [`/api/households/${otherHousehold}/invitations`, { userId: recipient.userId }],
      [`/api/households/${otherHousehold}/invitations/${invitation.invitation.id}/revoke`, {}],
      [
        `/api/households/${otherHousehold}/members/${otherAdministrator.userId}/role`,
        { role: 'member' },
      ],
      [`/api/households/${otherHousehold}/members/${otherAdministrator.userId}/revoke`, {}],
    ] as const) {
      const response = await administrator.json(path, body);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
    expect((await administration(otherAdministrator.client, otherHousehold)).invitations).toEqual([
      invitation.invitation,
    ]);
  });
});
