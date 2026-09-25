import { createHash, randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type Database from 'better-sqlite3';
import {
  type AssistantTaskGuard,
  assistantTaskAccess,
  revokeAssistantConnection,
} from './assistant-auth.js';
import { MapError } from './map.js';

export type LocalDispatch = (request: Request) => Response | Promise<Response>;

// A normal OAuth client using the actual HTTP/MCP entrance. SQLite is used only
// for authentication and content-generation guards, never to read map content.
export async function connectTextAssistant({
  database,
  origin,
  headers,
  householdId,
  dispatch,
  authorize,
}: {
  database: Database.Database;
  origin: string;
  headers: Headers;
  householdId: string;
  dispatch: LocalDispatch;
  authorize: AssistantTaskGuard;
}) {
  let clientId: string | undefined;
  let client: Client | undefined;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    if (clientId && database.open) {
      const connections = database
        .prepare('SELECT id FROM assistant_connection WHERE clientId = ?')
        .all(clientId) as { id: string }[];
      for (const connection of connections) revokeAssistantConnection(database, connection.id);
      database.prepare('DELETE FROM oauthClient WHERE clientId = ?').run(clientId);
    }
    await client?.close().catch(() => undefined);
  }
  // Incoming fetch metadata controls Better Auth's redirect representation;
  // transport headers and body lengths do not belong to these new requests.
  const browserHeaders = new Headers();
  for (const key of ['Cookie', 'X-Skyttel-Build']) {
    const value = headers.get(key);
    if (value) browserHeaders.set(key, value);
  }
  browserHeaders.set('Origin', origin);
  async function json(path: string, body: unknown) {
    authorize();
    const requestHeaders = new Headers(browserHeaders);
    requestHeaders.set('Content-Type', 'application/json');
    const response = await dispatch(
      new Request(`${origin}${path}`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) throw new Error('assistant_connection_failed');
    return response.json();
  }
  try {
    const redirectUri = `${origin}/assistant-callback`;
    const scope = 'skyttel:read skyttel:write';
    const registration = await json('/api/auth/oauth2/register', {
      application_type: origin.startsWith('http:') ? 'native' : 'web',
      client_name: 'Skyttels textassistent',
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
      scope,
    });
    clientId = registration.client_id;
    if (typeof clientId !== 'string') throw new Error('invalid_registration');
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope,
      resource: `${origin}/mcp`,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    authorize();
    const response = await dispatch(
      new Request(`${origin}/api/auth/oauth2/authorize?${query}`, { headers: browserHeaders }),
    );
    const consentUrl = new URL(response.headers.get('Location') ?? '', origin);
    if (
      response.status !== 302 ||
      consentUrl.origin !== origin ||
      consentUrl.pathname !== '/assistant-consent'
    )
      throw new Error('invalid_consent_redirect');
    const consent = await json('/api/assistants/consent', {
      accept: true,
      externalAi: true,
      mapWork: true,
      householdId,
      oauth_query: consentUrl.search.slice(1),
    });
    const callback = new URL(consent.url);
    if (
      `${callback.origin}${callback.pathname}` !== redirectUri ||
      callback.searchParams.get('state') !== state ||
      !callback.searchParams.get('code')
    )
      throw new Error('invalid_callback');
    authorize();
    const tokenResponse = await dispatch(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code: callback.searchParams.get('code') ?? '',
          code_verifier: verifier,
          redirect_uri: redirectUri,
          resource: `${origin}/mcp`,
        }),
      }),
    );
    if (!tokenResponse.ok) throw new Error('token_exchange_failed');
    const tokens = await tokenResponse.json();
    if (typeof tokens.access_token !== 'string' || !Number.isFinite(tokens.expires_in))
      throw new Error('invalid_token_response');
    client = new Client({ name: 'Skyttels textassistent', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } },
      fetch: async (input, init) => dispatch(new Request(input, init)),
    });
    await client.connect(transport);
    const catalog = await client.listTools();
    const activeClient = client;
    return {
      tools: catalog.tools,
      instructions: client.getInstructions() ?? '',
      expiresAt: Date.now() + Math.min(tokens.expires_in, 1800) * 1000,
      checkAccess() {
        authorize();
        const grant = database
          .prepare(
            'SELECT household.contentVersion FROM assistant_connection JOIN household ON household.id = assistant_connection.householdId WHERE clientId = ?',
          )
          .get(clientId) as { contentVersion: number } | undefined;
        if (closed || !grant) throw new MapError('forbidden', 403);
        authorize(grant.contentVersion);
      },
      async call(name: string, args: Record<string, unknown>, guard?: AssistantTaskGuard) {
        if (closed) throw new MapError('assistant_session_expired', 409);
        return assistantTaskAccess.run(
          (contentVersion) => {
            authorize(contentVersion);
            guard?.(contentVersion);
          },
          () => activeClient.callTool({ name, arguments: args }),
        );
      },
      close,
    };
  } catch {
    await close();
    throw new Error('assistant_connection_failed');
  }
}
