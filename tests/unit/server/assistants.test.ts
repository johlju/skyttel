import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { beginAssistant, callAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let householdId: string;
let userId: string;
beforeEach(async () => {
  app = await createInstallation();
  browser = await request.newContext();
  await signIn(browser, app.origin);
  ({
    user: { id: userId },
  } = await (await browser.get(`${app.origin}/api/bootstrap`)).json());
  ({
    household: { id: householdId },
  } = await (await createHousehold(browser, app.origin)).json());
});
afterEach(async () => {
  await browser.dispose();
  await app.close();
});

async function connect(actor = browser, household = householdId) {
  const flow = await beginAssistant(actor, app.origin);
  const accepted = await flow.consent(household);
  expect(accepted.status(), await accepted.text()).toBe(200);
  const tokens = await flow.exchange((await accepted.json()).url);
  expect(tokens.status, await tokens.clone().text()).toBe(200);
  return { ...flow, ...(await tokens.json()) } as typeof flow & {
    access_token: string;
    refresh_token: string;
  };
}

async function member() {
  app.setIdentity(robin);
  const actor = await request.newContext();
  await signIn(actor, app.origin, 'microsoft');
  const { user } = await (await actor.get(`${app.origin}/api/bootstrap`)).json();
  const { code } = await (
    await browser.post(`${app.origin}/api/households/${householdId}/invitations`, {
      headers: { origin: app.origin },
      data: { userId: user.id },
    })
  ).json();
  expect(
    (
      await actor.post(`${app.origin}/api/invitations/accept`, {
        headers: { origin: app.origin },
        data: { code },
      })
    ).status(),
  ).toBe(200);
  return { actor, userId: user.id as string };
}

async function proposal(actor: APIRequestContext, name: string, id: string) {
  const path = `${app.origin}/api/households/${householdId}/map`;
  const state = await (await actor.get(path)).json();
  expect(
    (
      await actor.post(`${path}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: state.draft.version,
          id,
          baseRevision: null,
          value: { typeId: state.types[0].id, name, description: 'Påhittad uppgift' },
        },
      })
    ).status(),
  ).toBe(200);
  return path;
}

test('read tools isolate own draft and household, filter relevant objects, and reject identity overrides', async () => {
  const path = await proposal(browser, 'Gemensamma Lo', 'saved-person');
  await browser.post(`${path}/save`, {
    headers: { origin: app.origin },
    data: { version: 1, operationId: 'save-map' },
  });
  await proposal(browser, 'Alex privata förslag', 'alex-draft');
  const other = await member();
  try {
    await proposal(other.actor, 'Robins privata förslag', 'robin-draft');
    app.seedMembership(other.userId, 'other-household', 'Hemlig karta');
    const connection = await connect();
    for (const args of [{}, { query: 'gemensamma' }, { objectId: 'saved-person' }]) {
      const result = await (
        await callAssistant(app.origin, connection.access_token, 'read_map', args)
      ).json();
      const map = JSON.parse(result.result.content[0].text);
      expect(map.objects.map((object: { name: string }) => object.name)).toEqual(['Gemensamma Lo']);
      expect(JSON.stringify(map)).not.toContain('privata förslag');
      expect(JSON.stringify(map)).not.toContain('Hemlig');
    }
    const empty = await (
      await callAssistant(app.origin, connection.access_token, 'read_map', {
        objectId: 'other-household',
      })
    ).json();
    expect(JSON.parse(empty.result.content[0].text).objects).toEqual([]);
    const draft = await (
      await callAssistant(app.origin, connection.access_token, 'read_my_draft')
    ).json();
    expect(draft.result.content[0].text).toContain('Alex privata förslag');
    expect(draft.result.content[0].text).not.toContain('Robins privata');
    for (const [name, args] of [
      ['read_map', { householdId: 'other-household' }],
      ['read_my_draft', { userId: other.userId }],
      ['export_household', {}],
    ] as const) {
      const denied = await (
        await callAssistant(app.origin, connection.access_token, name, args)
      ).json();
      expect(denied.result?.isError || denied.error).toBeTruthy();
      expect(JSON.stringify(denied)).not.toContain('Robins privata');
    }
    await app.restart();
    const restored = await (
      await callAssistant(app.origin, connection.access_token, 'read_my_draft')
    ).json();
    expect(restored.result.content[0].text).toContain('Alex privata förslag');
  } finally {
    await other.actor.dispose();
  }
});

test('a scoped read with no matches returns no authored type metadata', async () => {
  const path = `${app.origin}/api/households/${householdId}/map`;
  const headers = { origin: app.origin };
  expect(
    (
      await browser.post(`${path}/object-type`, {
        headers,
        data: {
          version: 0,
          id: 'unrelated-type',
          baseRevision: null,
          value: {
            name: 'Privat samling',
            description: 'Hushållets orelaterade typbeskrivning',
            fields: [
              { id: 'note', name: 'Anteckning', description: 'Fältets beskrivning', kind: 'text' },
            ],
          },
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await browser.post(`${path}/save`, {
        headers,
        data: { version: 1, operationId: 'save-unrelated-type' },
      })
    ).status(),
  ).toBe(200);
  const connection = await connect();
  for (const args of [{ query: 'ingen träff' }, { objectId: 'missing' }]) {
    const result = await (
      await callAssistant(app.origin, connection.access_token, 'read_map', args)
    ).json();
    expect(JSON.parse(result.result.content[0].text)).toEqual({
      objects: [],
      contextObjects: [],
      types: [],
      relationshipTypes: [],
      relationships: [],
    });
  }
});

test('only own user or household administrator can revoke and old tokens remain denied after reconnect', async () => {
  const other = await member();
  try {
    const own = await connect();
    const theirs = await connect(other.actor);
    const context = await (
      await browser.get(`${app.origin}/api/assistants/context?client_id=${own.clientId}`)
    ).json();
    expect(context.client.name).toBe('Påhittad textassistent');
    expect(context.connections).toHaveLength(2);
    const ownId = context.connections.find((item: { userId: string }) => item.userId === userId).id;
    const otherId = context.connections.find(
      (item: { userId: string }) => item.userId === other.userId,
    ).id;
    expect(
      (await (await other.actor.get(`${app.origin}/api/assistants/context`)).json()).connections,
    ).toHaveLength(1);
    expect(
      (
        await other.actor.post(`${app.origin}/api/assistants/${ownId}/revoke`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await browser.post(`${app.origin}/api/assistants/${otherId}/revoke`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    expect((await callAssistant(app.origin, theirs.access_token, 'read_map')).status).toBe(401);
    await connect(other.actor);
    expect((await callAssistant(app.origin, theirs.access_token, 'read_map')).status).toBe(401);
    expect((await callAssistant(app.origin, own.access_token, 'read_map')).status).toBe(200);
    expect(
      (
        await browser.post(`${app.origin}/api/assistants/missing/revoke`, {
          headers: { origin: app.origin },
          data: {},
        })
      ).status(),
    ).toBe(403);
  } finally {
    await other.actor.dispose();
  }
});

test('membership revocation stops an initialized MCP client and its refresh token', async () => {
  const other = await member();
  try {
    const connection = await connect(other.actor);
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StreamableHTTPClientTransport } = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp.js'
    );
    const client = new Client({ name: 'Synthetic connected client', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(`${app.origin}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${connection.access_token}` } },
    });
    await client.connect(transport);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      'read_map',
      'read_my_draft',
    ]);
    await browser.post(
      `${app.origin}/api/households/${householdId}/members/${other.userId}/revoke`,
      { headers: { origin: app.origin }, data: {} },
    );
    await expect(client.callTool({ name: 'read_map', arguments: {} })).rejects.toThrow();
    const refresh = await fetch(`${app.origin}/api/auth/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: connection.clientId,
        refresh_token: connection.refresh_token,
        resource: `${app.origin}/mcp`,
      }),
    });
    expect(refresh.ok).toBe(false);
    await client.close();
  } finally {
    await other.actor.dispose();
  }
});

test('refresh preserves the consented household when the same browser authorizes a second household', async () => {
  const first = await connect();
  app.seedMembership(userId, 'second-household', 'Hushållet Eken');
  await connect(browser, 'second-household');
  const path = await proposal(browser, 'Lindens egna utkast', 'linden-private');
  expect((await browser.get(path)).ok()).toBe(true);
  const refreshed = await fetch(`${app.origin}/api/auth/oauth2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: first.clientId,
      refresh_token: first.refresh_token,
      resource: `${app.origin}/mcp`,
    }),
  });
  expect(refreshed.status, await refreshed.clone().text()).toBe(200);
  const { access_token } = await refreshed.json();
  const draft = await (await callAssistant(app.origin, access_token, 'read_my_draft')).json();
  expect(draft.result.content[0].text).toContain('Lindens egna utkast');
});

test('consent requires explicit AI choice, membership, signed parameters and unchanged PKCE binding', async () => {
  const flow = await beginAssistant(browser, app.origin);
  for (const extra of [
    { externalAi: false },
    { householdId: 'other-household' },
    { householdId: 42 },
  ])
    expect((await flow.consent(householdId, extra)).status()).toBe(403);
  const tampered = new URLSearchParams(flow.consentUrl.search);
  tampered.set('redirect_uri', 'https://attacker.example.test/callback');
  expect((await flow.consent(householdId, { oauth_query: tampered.toString() })).ok()).toBe(false);
  expect(
    (await (await browser.get(`${app.origin}/api/assistants/context`)).json()).connections,
  ).toEqual([]);
  const denied = await flow.consent(householdId, { accept: false });
  expect(new URL((await denied.json()).url).searchParams.get('error')).toBe('access_denied');
  const consent = await flow.consent(householdId);
  expect(
    (
      await flow.exchange(
        (
          await consent.json()
        ).url,
        'incorrect-verifier-with-enough-characters-for-a-challenge',
      )
    ).ok,
  ).toBe(false);
  expect(
    (
      await browser.post(`${app.origin}/api/auth/oauth2/consent`, {
        headers: { origin: app.origin },
        data: { accept: true, oauth_query: flow.consentUrl.search.slice(1) },
      })
    ).status(),
  ).toBe(404);
});

test('public discovery and failures expose no secrets and cookie login alone grants no MCP access', async () => {
  const resource = await fetch(`${app.origin}/.well-known/oauth-protected-resource/mcp`);
  expect(await resource.json()).toMatchObject({
    resource: `${app.origin}/mcp`,
    scopes_supported: ['skyttel:read', 'skyttel:write'],
  });
  const metadata = await fetch(`${app.origin}/.well-known/oauth-authorization-server/api/auth`);
  expect(await metadata.json()).toMatchObject({
    issuer: `${app.origin}/api/auth`,
    authorization_endpoint: `${app.origin}/api/auth/oauth2/authorize`,
  });
  for (const authorization of [undefined, 'Bearer invalid', 'Basic invalid']) {
    const response = await browser.post(`${app.origin}/mcp`, {
      headers: authorization ? { authorization } : {},
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(await response.text()).not.toContain('invalid');
  }
  expect(
    (
      await browser.post(`${app.origin}/mcp`, {
        headers: { origin: 'https://untrusted.example.test' },
        data: {},
      })
    ).status(),
  ).toBe(403);
  for (const path of [
    '/api/assistants/context',
    '/api/assistants/consent',
    '/api/assistants/missing/revoke',
  ]) {
    const response = await fetch(
      `${app.origin}${path}`,
      path.endsWith('context')
        ? {}
        : {
            method: 'POST',
            headers: { origin: app.origin, 'Content-Type': 'application/json' },
            body: '{}',
          },
    );
    expect(response.status).toBe(401);
  }
  for (const body of [
    'null',
    'invalid-json',
    '{}',
    '{"accept":true,"oauth_query":""}',
    '{"accept":true,"oauth_query":"client_id=missing","externalAi":true,"householdId":"' +
      householdId +
      '"}',
  ]) {
    expect(
      (
        await browser.post(`${app.origin}/api/assistants/consent`, {
          headers: { origin: app.origin, 'Content-Type': 'application/json' },
          data: body,
        })
      ).status(),
    ).toBe(400);
  }
  expect(
    (
      await browser.post(`${app.origin}/api/assistants/consent`, {
        headers: { origin: 'https://untrusted.example.test' },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
