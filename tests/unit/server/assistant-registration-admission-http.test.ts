import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { Agent, fetch as addressFetch } from 'undici';
import { afterEach, expect, test } from 'vitest';
import { callAssistant } from '../../support/assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
const sources = new Map<number, Agent>();
const metadata = {
  application_type: 'native',
  client_name: 'Synthetic assistant',
  redirect_uris: ['http://127.0.0.1:7777/callback'],
  token_endpoint_auth_method: 'none',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'skyttel:read offline_access',
};
afterEach(async () => {
  await Promise.all([...sources.values()].map((source) => source.close()));
  sources.clear();
  await browser?.dispose();
  await app?.close();
});

async function installation(now: () => number) {
  app = await createInstallation(undefined, { now });
  browser = await request.newContext();
}

function register(address: number, body: Record<string, unknown> = {}) {
  let source = sources.get(address);
  if (!source) {
    source = new Agent({ connect: { localAddress: `127.0.0.${address}` } });
    sources.set(address, source);
  }
  return addressFetch(`${app.origin}/api/auth/oauth2/register`, {
    dispatcher: source,
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      connection: 'close',
    },
    body: JSON.stringify({ ...metadata, ...body }),
  });
}

test('registration shares a rolling rate across source addresses and preserves retry time across restart', async () => {
  let time = Date.now();
  await installation(() => time);
  for (let index = 1; index <= 30; index++) expect((await register(index)).status).toBe(201);
  const rejected = await register(31);
  expect(rejected.status).toBe(429);
  expect(rejected.headers.get('retry-after')).toBe('60');
  expect(rejected.headers.get('cache-control')).toBe('no-store');
  expect(await rejected.json()).toMatchObject({ error: 'temporarily_unavailable' });

  time += 59_001;
  await app.restart();
  const waiting = await register(32);
  expect(waiting.status).toBe(429);
  expect(waiting.headers.get('retry-after')).toBe('1');
  time += 999;
  expect((await register(33)).status).toBe(201);
});

async function connect(clientId: string, householdId: string) {
  const verifier = 'synthetic-proof-key-for-registration-admission';
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: 'http://127.0.0.1:7777/callback',
    scope: 'skyttel:read offline_access',
    resource: `${app.origin}/mcp`,
    state: 'synthetic-state',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  const authorized = await browser.get(`${app.origin}/api/auth/oauth2/authorize?${query}`, {
    maxRedirects: 0,
  });
  expect(authorized.status()).toBe(302);
  const consent = await browser.post(`${app.origin}/api/assistants/consent`, {
    headers: { origin: app.origin },
    data: {
      accept: true,
      externalAi: true,
      householdId,
      oauth_query: new URL(authorized.headers().location, app.origin).search.slice(1),
    },
  });
  expect(consent.status()).toBe(200);
  return token({
    grant_type: 'authorization_code',
    client_id: clientId,
    code: new URL((await consent.json()).url).searchParams.get('code') ?? '',
    code_verifier: verifier,
    redirect_uri: 'http://127.0.0.1:7777/callback',
    resource: `${app.origin}/mcp`,
  });
}

async function token(body: Record<string, string>) {
  const response = await fetch(`${app.origin}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: { connection: 'close' },
    body: new URLSearchParams(body),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json();
}

function seedUnconnected(count: number, time: number) {
  const database = new Database(join(app.directory, 'skyttel.db'));
  try {
    database.transaction(() => {
      const insert =
        database.prepare(`INSERT INTO oauthClient (id, clientId, createdAt, redirectUris)
        VALUES (?, ?, ?, '[]')`);
      for (let index = 0; index < count; index++)
        insert.run(`pending-${index}`, `pending-${index}`, time);
    })();
  } finally {
    database.close();
  }
}

test('concurrent registrations respect the unconnected cap while existing clients can consent, read and refresh', async () => {
  let time = Date.now();
  await installation(() => time);
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const connected = (await (await register(1)).json()) as { client_id: string };
  const tokens = await connect(connected.client_id, household.id);
  const pending = (await (await register(2)).json()) as { client_id: string };
  seedUnconnected(998, time);
  // Dispatch together at the HTTP application boundary so provider awaits
  // interleave, independently of how the OS schedules separate sockets.
  const responses = await Promise.all(
    Array.from({ length: 10 }, () =>
      app.fetch(
        new Request(`${app.origin}/api/auth/oauth2/register`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(metadata),
        }),
      ),
    ),
  );
  expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
  expect(responses.filter((response) => response.status === 429)).toHaveLength(9);
  expect(responses.find((response) => response.status === 429)?.headers.get('retry-after')).toBe(
    '60',
  );
  expect((await callAssistant(app.origin, tokens.access_token, 'read_map')).status).toBe(200);
  const refreshed = await token({
    grant_type: 'refresh_token',
    client_id: connected.client_id,
    refresh_token: tokens.refresh_token,
  });
  expect((await callAssistant(app.origin, refreshed.access_token, 'read_map')).status).toBe(200);

  const pendingTokens = await connect(pending.client_id, household.id);
  expect((await callAssistant(app.origin, pendingTokens.access_token, 'read_map')).status).toBe(
    200,
  );
  expect((await register(20)).status).toBe(201);
  await app.restart();
  expect((await register(21)).status).toBe(429);

  time += 86_400_000;
  await app.restart();
  await expect.poll(async () => (await register(22)).status).toBe(201);
});

test('invalid metadata releases capacity and signing in does not bypass the client cap', async () => {
  const time = Date.now();
  await installation(() => time);
  await signIn(browser, app.origin);
  seedUnconnected(999, time);
  expect((await register(1, { redirect_uris: ['invalid'] })).status).toBe(400);
  expect((await register(2)).status).toBe(201);
  const signedIn = await browser.post(`${app.origin}/api/auth/oauth2/register`, {
    headers: { origin: app.origin },
    data: metadata,
  });
  expect(signedIn.status()).toBe(429);
  expect(signedIn.headers()['retry-after']).toBe('60');
});
