import { createHash, randomBytes } from 'node:crypto';
import { type APIRequestContext, expect } from '@playwright/test';

// Register and exchange over real public HTTP without a browser cookie.
export async function beginAssistant(
  browser: APIRequestContext,
  origin: string,
  scope = 'skyttel:read offline_access',
) {
  const registration = await fetch(`${origin}/api/auth/oauth2/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      application_type: 'native',
      client_name: 'Påhittad textassistent',
      redirect_uris: ['http://127.0.0.1:7777/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope,
    }),
  });
  expect(registration.status, await registration.clone().text()).toBe(201);
  const { client_id } = await registration.json();
  const verifier = randomBytes(32).toString('base64url');
  const query = new URLSearchParams({
    client_id,
    response_type: 'code',
    redirect_uri: 'http://127.0.0.1:7777/callback',
    scope,
    resource: `${origin}/mcp`,
    state: 'fictional-state',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  const authorizeUrl = `${origin}/api/auth/oauth2/authorize?${query}`;
  const response = await browser.get(authorizeUrl, { maxRedirects: 0 });
  expect(response.status(), await response.text()).toBe(302);
  const consentUrl = new URL(response.headers().location, origin);
  return {
    authorizeUrl,
    consentUrl,
    clientId: client_id as string,
    async consent(householdId: string, extra: Record<string, unknown> = {}) {
      return browser.post(`${origin}/api/assistants/consent`, {
        headers: { origin },
        data: {
          accept: true,
          externalAi: true,
          ...(scope.split(' ').includes('skyttel:write') ? { mapWork: true } : {}),
          householdId,
          oauth_query: consentUrl.search.slice(1),
          ...extra,
        },
      });
    },
    async exchange(callback: string, codeVerifier = verifier) {
      return fetch(`${origin}/api/auth/oauth2/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id,
          code: new URL(callback).searchParams.get('code') ?? '',
          code_verifier: codeVerifier,
          redirect_uri: 'http://127.0.0.1:7777/callback',
          resource: `${origin}/mcp`,
        }),
      });
    },
  };
}

export function callAssistant(origin: string, token: string, name: string, args = {}) {
  return fetch(`${origin}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      connection: 'close',
      'Content-Type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
}
