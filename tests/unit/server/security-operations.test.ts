import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { invalidateHouseholdExports } from '../../../src/server/household-export.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let admin: ReturnType<typeof fixture.client>;
let householdId: string;
let actorId: string;
let lines: string[];
let sinkMode: 'ready' | 'blocked' | 'throw' = 'ready';
let sinkWrites = 0;
const events = () => lines.map((line) => JSON.parse(line));
beforeEach(async () => {
  lines = [];
  sinkMode = 'ready';
  sinkWrites = 0;
  fixture = await applicationFixture({
    securityEventSink: {
      available: () => sinkMode !== 'blocked',
      write: (line) => {
        sinkWrites++;
        if (sinkMode === 'throw') throw new Error('secret sink error');
        lines.push(line);
      },
    },
  });
  admin = fixture.client();
  await admin.signIn();
  actorId = (await (await admin.request('/api/bootstrap')).json()).user.id;
  householdId = (await (await admin.json('/api/households', { name: 'Secret household' })).json())
    .household.id;
});

test.each(['blocked', 'throw'] as const)(
  'a %s event sink preserves grants, authorization, mutations and export bytes',
  async (mode) => {
    sinkMode = mode;
    fixture.setSubject('recipient');
    const member = fixture.client();
    await member.signIn();
    const targetId = (await (await member.request('/api/bootstrap')).json()).user.id;
    const created = await admin.json(`/api/households/${householdId}/invitations`, {
      userId: targetId,
    });
    expect(created.status).toBe(201);
    const { code } = await created.json();
    expect((await member.json('/api/invitations/accept', { code })).status).toBe(200);
    expect(
      (
        await member.json(`/api/households/${householdId}/members/${targetId}/role`, {
          role: 'administrator',
        })
      ).status,
    ).toBe(403);
    const oauth_query = await consentQuery();
    expect(
      (
        await admin.json('/api/assistants/consent', {
          oauth_query,
          accept: true,
          externalAi: true,
          householdId,
        })
      ).status,
    ).toBe(200);
    expect(
      (await (await admin.request('/api/assistants/context')).json()).connections,
    ).toHaveLength(1);
    const path = `/api/households/${householdId}/exports`;
    expect((await member.json(path, {})).status).toBe(403);
    const ready = await (await admin.json(path, {})).json();
    const download = await admin.request(`${path}/${ready.id}`);
    expect(download.status).toBe(200);
    expect((await download.arrayBuffer()).byteLength).toBe(ready.bytes);
    if (mode === 'blocked') expect(sinkWrites).toBe(0);
    sinkMode = 'ready';
    await admin.json(`/api/households/${householdId}/members/${targetId}/role`, { role: 'member' });
    expect(events()[0]).toMatchObject({ code: 'delivery_loss', outcome: 'suppressed' });
    expect(events()[1]).toMatchObject({ operation: 'membership_role', outcome: 'unchanged' });
  },
);

test('malformed and oversized bodies and outdated clients generate bounded early diagnostics', async () => {
  const path = `/api/households/${householdId}/invitations`;
  for (const body of ['{', JSON.stringify({ userId: 'secret'.repeat(5000) })]) {
    const response = await admin.request(path, {
      method: 'POST',
      headers: { origin: fixture.config.origin, 'content-type': 'application/json' },
      body,
    });
    expect([400, 413]).toContain(response.status);
  }
  expect(events().map((event) => event.code)).toEqual(['invalid_request', 'invalid_request']);
  expect(lines.join('')).not.toContain('secret');
  const releaseLines: string[] = [];
  const release = await applicationFixture({
    identity: { version: '1.2.3', commit: 'a'.repeat(40) },
    securityEventSink: {
      available: () => true,
      write: (line) => {
        releaseLines.push(line);
      },
    },
  });
  try {
    const response = await release.client().json('/api/households/unknown/invitations', {});
    expect(response.status).toBe(409);
    expect(JSON.parse(releaseLines[0])).toMatchObject({
      code: 'client_outdated',
      stage: 'request',
      status: 409,
      version: '1.2.3',
      commit: 'a'.repeat(40),
    });
    expect(JSON.parse(releaseLines[0])).not.toHaveProperty('actorId');
  } finally {
    release.close();
  }
});
afterEach(async () => {
  await invalidateHouseholdExports(fixture.database, householdId);
  fixture.close();
  vi.restoreAllMocks();
});

async function consentQuery() {
  const registered = await admin.json('/api/auth/oauth2/register', {
    application_type: 'native',
    client_name: 'Secret client name',
    redirect_uris: ['http://127.0.0.1:7777/callback'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'skyttel:read offline_access',
  });
  expect(registered.status).toBe(201);
  const { client_id } = await registered.json();
  const query = new URLSearchParams({
    client_id,
    response_type: 'code',
    redirect_uri: 'http://127.0.0.1:7777/callback',
    scope: 'skyttel:read offline_access',
    resource: `${fixture.config.origin}/mcp`,
    state: 'secret-state',
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update('x'.repeat(43)).digest('base64url'),
  });
  const authorized = await admin.request(`/api/auth/oauth2/authorize?${query}`);
  expect(authorized.status).toBe(302);
  return new URL(authorized.headers.get('location') as string, fixture.config.origin).search.slice(
    1,
  );
}

test('external grants record only completed approval, user refusal and authorized revocation', async () => {
  const oauth_query = await consentQuery();
  const accepted = await admin.json('/api/assistants/consent', {
    oauth_query,
    accept: true,
    externalAi: true,
    householdId,
  });
  expect(accepted.status).toBe(200);
  expect(new URL((await accepted.json()).url).searchParams.has('code')).toBe(true);
  const connections = (await (await admin.request('/api/assistants/context')).json()).connections;
  expect(connections).toHaveLength(1);
  expect(events()).toEqual([
    expect.objectContaining({
      operation: 'grant_approve',
      outcome: 'succeeded',
      targetId: connections[0].id,
      actorId,
      householdId,
    }),
  ]);
  expect((await admin.json(`/api/assistants/${connections[0].id}/revoke`, {})).status).toBe(200);
  expect((await admin.json(`/api/assistants/${connections[0].id}/revoke`, {})).status).toBe(403);
  const refused = await admin.json('/api/assistants/consent', {
    oauth_query: await consentQuery(),
    accept: false,
  });
  expect(refused.status).toBe(200);
  expect(events().map(({ operation, outcome }) => [operation, outcome])).toEqual([
    ['grant_approve', 'succeeded'],
    ['grant_revoke', 'succeeded'],
    ['grant_revoke', 'rejected'],
    ['grant_approve', 'refused'],
  ]);
  expect(events()[2]).not.toHaveProperty('targetId');
  expect(lines.join('')).not.toContain('secret-state');
  expect(lines.join('')).not.toContain('Secret client name');
});

test.each(['rejected', 'throw', 'malformed-success', 'malformed-json'] as const)(
  'unsuccessful consent (%s) cleans the temporary connection and never reports approval',
  async (mode) => {
    const oauth_query = await consentQuery();
    const handler = fixture.auth.handler;
    fixture.auth.handler = async (request) => {
      if (!request.url.endsWith('/api/auth/oauth2/consent')) return handler(request);
      if (mode === 'throw')
        throw Object.assign(new Error('secret-provider-payload'), { code: 'secret-token' });
      if (mode === 'malformed-json') return new Response('secret-invalid-json');
      return Response.json(
        { error: 'secret-provider-payload' },
        { status: mode === 'rejected' ? 400 : 200 },
      );
    };
    await fixture.restart();
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await admin.json('/api/assistants/consent', {
      oauth_query,
      accept: true,
      externalAi: true,
      householdId,
    });
    expect(response.status).toBe(mode === 'throw' ? 500 : mode === 'rejected' ? 400 : 200);
    expect((await (await admin.request('/api/assistants/context')).json()).connections).toEqual([]);
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      operation: 'grant_approve',
      outcome: mode === 'rejected' ? 'rejected' : 'failed',
      stage: 'consent',
      code: mode === 'rejected' ? 'consent_rejected' : 'internal_failure',
    });
    expect(events()[0]).not.toHaveProperty('targetId');
    expect(lines.join('')).not.toContain('secret-');
    diagnostic.mockRestore();
  },
);

test('cancelled downloads never report completion and explicit cancellation is correlated', async () => {
  const path = `/api/households/${householdId}/exports`;
  const { id } = await (await admin.json(path, {})).json();
  const download = await admin.request(`${path}/${id}`);
  await download.body?.cancel();
  await vi.waitFor(() =>
    expect(events().filter((event) => event.outcome === 'cancelled')).toHaveLength(1),
  );
  expect(events().some((event) => event.outcome === 'completed')).toBe(false);
  const ready = await (await admin.json(path, {})).json();
  expect((await admin.json(`${path}/${ready.id}/cancel`, {})).status).toBe(200);
  expect(events().at(-1)).toMatchObject({
    operation: 'export_cancel',
    outcome: 'succeeded',
    targetId: ready.id,
  });
  const prepared = events().find(
    (event) => event.code === 'archive_ready' && event.targetId === ready.id,
  );
  expect(events().at(-1).operationReference).toBe(prepared.operationReference);
  expect((await admin.json(`${path}/${ready.id}/cancel`, {})).status).toBe(200);
  expect(events().at(-1)).toMatchObject({ operation: 'export_cancel', outcome: 'unchanged' });
});

test.each([
  ['invitation_create', 'POST', '/invitations', { userId: 'unknown-target' }, 403],
  ['invitation_revoke', 'POST', '/invitations/unknown-target/revoke', {}, 403],
  ['membership_role', 'POST', '/members/unknown-target/role', { role: 'administrator' }, 403],
  ['membership_remove', 'POST', '/members/unknown-target/revoke', {}, 403],
  ['export_prepare', 'POST', '/exports', {}, 403],
  ['export_download', 'GET', '/exports/unknown-target', {}, 403],
  ['export_cancel', 'POST', '/exports/unknown-target/cancel', {}, 403],
  ['invitation_accept', 'POST', '/api/invitations/accept', { code: 'x'.repeat(43) }, 409],
  [
    'grant_approve',
    'POST',
    '/api/assistants/consent',
    {
      accept: true,
      externalAi: true,
      householdId: 'unknown-household',
      oauth_query: 'client_id=unknown-target',
    },
    403,
  ],
  ['grant_revoke', 'POST', '/api/assistants/unknown-target/revoke', {}, 403],
] as const)(
  '%s logs early and authorized rejections without unverified identifiers',
  async (operation, method, suffix, body, deniedStatus) => {
    const path = suffix.startsWith('/api/') ? suffix : `/api/households/unknown-household${suffix}`;
    const send = (client: typeof admin, headers: Record<string, string> = {}) =>
      method === 'GET' ? client.request(path) : client.json(path, body, headers);
    expect((await send(fixture.client())).status).toBe(401);
    expect(events()[0]).toMatchObject({ operation, outcome: 'rejected', status: 401 });
    expect(events()[0]).not.toHaveProperty('actorId');
    expect((await send(admin)).status).toBe(deniedStatus);
    expect(events()[1]).toMatchObject({
      operation,
      outcome: 'rejected',
      status: deniedStatus,
      actorId,
    });
    if (method === 'POST') {
      expect((await send(admin, { origin: 'https://untrusted.example' })).status).toBe(403);
      expect(events()[2]).toMatchObject({ operation, outcome: 'rejected', status: 403 });
    }
    expect(lines.join('')).not.toContain('unknown-household');
    expect(lines.join('')).not.toContain('unknown-target');
    for (const event of events()) {
      expect(event).not.toHaveProperty('targetId');
      expect(event).not.toHaveProperty('householdId');
    }
  },
);

test('export preparation and stream lifecycle share a reference and completion means server completion', async () => {
  const path = `/api/households/${householdId}/exports`;
  const ready = await admin.json(path, {});
  expect(ready.status).toBe(201);
  const { id } = await ready.json();
  const download = await admin.request(`${path}/${id}`);
  expect(download.status).toBe(200);
  expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(0);
  expect(events().map(({ operation, outcome, code }) => [operation, outcome, code])).toEqual([
    ['export_prepare', 'succeeded', 'archive_ready'],
    ['export_download', 'started', 'download_started'],
    ['export_download', 'completed', 'download_completed'],
  ]);
  expect(new Set(events().map((event) => event.operationReference)).size).toBe(1);
  expect(new Set(events().map((event) => event.reference)).size).toBe(3);
  expect(events()[2]).toMatchObject({ actorId, householdId, targetId: id, stage: 'download' });
});

test('invitation replacement, acceptance and revocation record actual changes and membership events distinguish no-ops', async () => {
  fixture.setSubject('recipient');
  const recipient = fixture.client();
  await recipient.signIn();
  const targetId = (await (await recipient.request('/api/bootstrap')).json()).user.id;
  const path = `/api/households/${householdId}/invitations`;
  const first = await (await admin.json(path, { userId: targetId })).json();
  const second = await (await admin.json(path, { userId: targetId })).json();
  expect(events()[1]).toMatchObject({
    code: 'invitation_replaced',
    replacedCount: 1,
    targetId: second.invitation.id,
  });
  expect((await recipient.json('/api/invitations/accept', { code: first.code })).status).toBe(409);
  expect((await recipient.json('/api/invitations/accept', { code: second.code })).status).toBe(200);
  const rolePath = `/api/households/${householdId}/members/${targetId}/role`;
  expect((await recipient.json(rolePath, { role: 'administrator' })).status).toBe(403);
  expect((await admin.json(rolePath, { role: 'administrator' })).status).toBe(200);
  expect((await admin.json(rolePath, { role: 'administrator' })).status).toBe(200);
  expect(
    (await admin.json(`/api/households/${householdId}/members/${targetId}/revoke`, {})).status,
  ).toBe(200);
  const third = await (await admin.json(path, { userId: targetId })).json();
  const revoke = `${path}/${third.invitation.id}/revoke`;
  expect((await admin.json(revoke, {})).status).toBe(200);
  expect((await admin.json(revoke, {})).status).toBe(200);
  expect(events().map(({ operation, outcome }) => [operation, outcome])).toEqual([
    ['invitation_create', 'succeeded'],
    ['invitation_create', 'succeeded'],
    ['invitation_accept', 'rejected'],
    ['invitation_accept', 'succeeded'],
    ['membership_role', 'rejected'],
    ['membership_role', 'succeeded'],
    ['membership_role', 'unchanged'],
    ['membership_remove', 'succeeded'],
    ['invitation_create', 'succeeded'],
    ['invitation_revoke', 'succeeded'],
    ['invitation_revoke', 'unchanged'],
  ]);
  expect(events()[5]).toMatchObject({ previousRole: 'member', role: 'administrator', targetId });
  expect(events()[7]).toMatchObject({ previousRole: 'administrator', role: 'none', targetId });
  expect(events()[2]).not.toHaveProperty('householdId');
});

test('invitation creation records committed identity references and rejects anonymous requests without copying input', async () => {
  fixture.setSubject('recipient');
  const recipient = fixture.client();
  await recipient.signIn();
  const targetId = (await (await recipient.request('/api/bootstrap')).json()).user.id;
  const path = `/api/households/${householdId}/invitations`;
  const response = await admin.json(path, { userId: targetId });
  expect(response.status).toBe(201);
  const invitation = await response.json();
  expect(events()).toEqual([
    expect.objectContaining({
      operation: 'invitation_create',
      outcome: 'succeeded',
      code: 'committed',
      actorId,
      householdId,
      targetId: invitation.invitation.id,
    }),
  ]);
  expect(lines.join('')).not.toContain(invitation.code);
  const anonymous = await fixture
    .client()
    .json('/api/households/unverified/invitations', { userId: 'secret-target' });
  expect(anonymous.status).toBe(401);
  expect(events()[1]).toMatchObject({
    operation: 'invitation_create',
    outcome: 'rejected',
    status: 401,
  });
  expect(events()[1]).not.toHaveProperty('actorId');
  expect(events()[1]).not.toHaveProperty('householdId');
  expect(events()[1]).not.toHaveProperty('targetId');
});
