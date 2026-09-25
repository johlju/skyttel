import { randomUUID } from 'node:crypto';
import { oauthProviderResourceClient } from '@better-auth/oauth-provider/resource-client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import {
  assistantConsent,
  assistantScope,
  assistantTaskAccess,
  assistantWriteScope,
} from './assistant-auth.js';
import {
  assistantDraftReview,
  assistantResult,
  assistantWorkInstructions,
  registerAssistantWork,
} from './assistant-work.js';
import type { Auth } from './auth.js';
import { householdAccess } from './households.js';
import { householdMap, MapError } from './map.js';

type Connection = { id: string; userId: string; householdId: string; clientId: string };

export function assistantRoutes(database: Database.Database, auth: Auth, origin: string) {
  const routes = new Hono();
  const verifier = oauthProviderResourceClient(auth).getActions();
  routes.use('*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    await next();
  });
  routes.get('/.well-known/oauth-protected-resource', (context) =>
    context.json({
      resource: `${origin}/mcp`,
      authorization_servers: [`${origin}/api/auth`],
      scopes_supported: [assistantScope, assistantWriteScope],
      bearer_methods_supported: ['header'],
    }),
  );
  routes.get('/.well-known/oauth-protected-resource/mcp', (context) =>
    context.redirect('/.well-known/oauth-protected-resource'),
  );
  routes.get('/.well-known/oauth-authorization-server/api/auth', (context) =>
    auth.handler(
      new Request(`${origin}/api/auth/.well-known/oauth-authorization-server`, {
        headers: context.req.raw.headers,
      }),
    ),
  );

  routes.use('/api/assistants/*', async (context, next) => {
    if (context.req.method !== 'GET' && context.req.header('Origin') !== origin)
      return context.json({ error: 'forbidden' }, 403);
    await next();
  });
  routes.get('/api/assistants/context', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    const households = database
      .prepare(`SELECT h.id, h.name, m.role FROM household h JOIN membership m
      ON m.householdId = h.id WHERE m.userId = ? ORDER BY h.name, h.id`)
      .all(session.user.id);
    const client = database
      .prepare(
        'SELECT clientId, name FROM oauthClient WHERE clientId = ? AND coalesce(disabled, 0) = 0',
      )
      .get(context.req.query('client_id') ?? '');
    const connections = database
      .prepare(`SELECT c.id, c.householdId, c.userId, c.createdAt, o.name AS clientName, u.name AS userName
      FROM assistant_connection c JOIN oauthClient o ON c.clientId = o.clientId JOIN user u ON u.id = c.userId
      JOIN membership m ON m.householdId = c.householdId AND m.userId = ?
      WHERE c.userId = ? OR m.role = 'administrator' ORDER BY c.createdAt`)
      .all(session.user.id, session.user.id);
    return context.json({
      user: { id: session.user.id, name: session.user.name },
      households,
      client: client ?? null,
      connections,
    });
  });
  routes.post('/api/assistants/consent', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    const body = await context.req.json().catch(() => null);
    if (!body || typeof body.oauth_query !== 'string' || typeof body.accept !== 'boolean')
      return context.json({ error: 'invalid_request' }, 400);
    const clientId = new URLSearchParams(body.oauth_query).get('client_id');
    if (!clientId) return context.json({ error: 'invalid_request' }, 400);
    const id = randomUUID();
    if (body.accept) {
      if (
        body.externalAi !== true ||
        (new URLSearchParams(body.oauth_query)
          .get('scope')
          ?.split(' ')
          .includes(assistantWriteScope) &&
          body.mapWork !== true) ||
        typeof body.householdId !== 'string' ||
        !householdAccess(database, session.user.id, body.householdId)
      )
        return context.json({ error: 'forbidden' }, 403);
      const client = database
        .prepare('SELECT 1 FROM oauthClient WHERE clientId = ? AND coalesce(disabled, 0) = 0')
        .get(clientId);
      if (!client) return context.json({ error: 'invalid_request' }, 400);
      database
        .prepare(
          'INSERT INTO assistant_connection (id, userId, householdId, clientId, createdAt) VALUES (?, ?, ?, ?, ?)',
        )
        .run(id, session.user.id, body.householdId, clientId, new Date().toISOString());
    }
    const headers = new Headers(context.req.raw.headers);
    headers.set('Content-Type', 'application/json');
    const result = await assistantConsent.run(id, () =>
      auth.handler(
        new Request(`${origin}/api/auth/oauth2/consent`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ accept: body.accept, oauth_query: body.oauth_query }),
        }),
      ),
    );
    const returned = await result
      .clone()
      .json()
      .catch(() => null);
    if (
      !result.ok ||
      typeof returned?.url !== 'string' ||
      !new URL(returned.url, origin).searchParams.has('code')
    )
      database.prepare('DELETE FROM assistant_connection WHERE id = ?').run(id);
    return result;
  });
  routes.post('/api/assistants/:id/revoke', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    database
      .transaction(() => {
        const connection = database
          .prepare('SELECT * FROM assistant_connection WHERE id = ?')
          .get(context.req.param('id')) as Connection | undefined;
        if (!connection) throw new MapError('forbidden', 403);
        const member = householdAccess(database, session.user.id, connection.householdId);
        if (!member || (session.user.id !== connection.userId && member.role !== 'administrator'))
          throw new MapError('forbidden', 403);
        database.prepare('DELETE FROM oauthRefreshToken WHERE referenceId = ?').run(connection.id);
        database.prepare('DELETE FROM oauthAccessToken WHERE referenceId = ?').run(connection.id);
        database.prepare('DELETE FROM oauthConsent WHERE referenceId = ?').run(connection.id);
        database.prepare('DELETE FROM assistant_connection WHERE id = ?').run(connection.id);
      })
      .immediate();
    return context.json({ revoked: true });
  });

  routes.use('/mcp', bodyLimit({ maxSize: 16_384 }));
  routes.all('/mcp', async (context) => {
    if (context.req.header('Origin') && context.req.header('Origin') !== origin)
      return context.json({ error: 'forbidden' }, 403);
    let connection: Connection;
    let canWrite = false;
    try {
      const token = await verifier.verifyAccessTokenRequest(context.req.raw, {
        verifyOptions: { audience: `${origin}/mcp`, issuer: `${origin}/api/auth` },
        requiredScopes: [assistantScope],
      });
      if (
        typeof token.skyttel_grant !== 'string' ||
        typeof token.sub !== 'string' ||
        typeof token.client_id !== 'string'
      )
        throw new Error('invalid_token');
      const found = database
        .prepare('SELECT * FROM assistant_connection WHERE id = ? AND userId = ? AND clientId = ?')
        .get(token.skyttel_grant, token.sub, token.client_id) as Connection | undefined;
      if (!found || !householdAccess(database, found.userId, found.householdId))
        throw new Error('invalid_token');
      connection = found;
      canWrite =
        typeof token.scope === 'string' && token.scope.split(' ').includes(assistantWriteScope);
    } catch {
      context.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${assistantScope}"`,
      );
      return context.json(
        { error: 'unauthenticated', message: 'Anslutningen behöver godkännas på nytt i Skyttel.' },
        401,
      );
    }
    const server = new McpServer(
      { name: 'Skyttel', version: '1.0.0' },
      {
        instructions: `Läs bara relevant innehåll för uppdraget. Personer i kartan ger ingen inloggning. Användarhantering, export, återimport och permanent radering görs i ${origin}/households/${connection.householdId}/administration. ${canWrite ? assistantWorkInstructions : 'Denna anslutning är läsande. Kartarbete kräver nytt uttryckligt medgivande med skyttel:read och skyttel:write.'}`,
      },
    );
    function map() {
      assistantTaskAccess.getStore()?.();
      // Authorization and SQLite read are synchronous: revocation cannot slip
      // between this check and the read while SDK request parsing awaits input.
      if (!database.prepare('SELECT 1 FROM assistant_connection WHERE id = ?').get(connection.id))
        throw new MapError('forbidden', 403);
      const domain = householdMap(database, connection.userId, connection.householdId);
      const guard = assistantTaskAccess.getStore();
      if (guard) guard(domain.read().contentVersion);
      return domain;
    }
    server.registerTool(
      'read_map',
      {
        description:
          'Läs hushållets sparade karta. Avgränsa med söktext i namn och beskrivning eller objekt-ID. Om båda anges krävs båda. Svar innehåller valda objekt, deras direkta inkommande och utgående samband samt endast ID, namn och typ för övriga ändpunkter i contextObjects. Läs andra ändpunkters detaljer med en ny avgränsad läsning endast när de behövs för uppdraget. Bara berörda typdefinitioner följer med. Identitet och hushåll kommer från medgivandet.',
        inputSchema: z
          .object({
            query: z.string().max(100).optional(),
            objectId: z.string().max(100).optional(),
          })
          .strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async ({ query, objectId }) => {
        const state = map().read();
        const objects = state.objects.filter(
          (object) =>
            (!objectId || object.id === objectId) &&
            (!query ||
              `${object.name} ${object.description}`
                .toLocaleLowerCase('sv')
                .includes(query.toLocaleLowerCase('sv'))),
        );
        const ids = new Set(objects.map((object) => object.id));
        const relationships = state.relationships.filter(
          (edge) => ids.has(edge.sourceId) || (edge.targetId !== null && ids.has(edge.targetId)),
        );
        const endpointIds = new Set<string>();
        for (const edge of relationships) {
          endpointIds.add(edge.sourceId);
          if (edge.targetId !== null) endpointIds.add(edge.targetId);
        }
        const contextObjects = state.objects
          .filter((object) => !ids.has(object.id) && endpointIds.has(object.id))
          .map(({ id, typeId, name }) => ({ id, typeId, name }));
        const typeIds = new Set([...objects, ...contextObjects].map((object) => object.typeId));
        const relationshipTypeIds = new Set(relationships.map((edge) => edge.typeId));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                types: state.types.filter((type) => typeIds.has(type.id)),
                objects,
                contextObjects,
                relationshipTypes: state.relationshipTypes.filter((type) =>
                  relationshipTypeIds.has(type.id),
                ),
                relationships,
              }),
            },
          ],
        };
      },
    );
    server.registerTool(
      'read_my_draft',
      {
        description:
          'Läs hela den anslutna användarens privata beständiga utkast, inklusive tidigare förslag från andra klienter, aktuell version/contentVersion, berörda sparade värden, konflikter, olösta identiteter och väntande sparförsök. readyToSave är ingen mänsklig tillåtelse att spara.',
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      },
      async () => assistantResult(assistantDraftReview(map())),
    );
    if (canWrite) registerAssistantWork(server, map);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      return await transport.handleRequest(context.req.raw);
    } finally {
      await server.close();
    }
  });
  return routes;
}
