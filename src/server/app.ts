import { createHash } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { buildIdentity } from '../shared/build-identity.js';
import { normalizeHouseholdName } from '../shared/household-name.js';
import { AdministrationError } from './administration.js';
import { administrationRoutes } from './administration-routes.js';
import { assistantRoutes } from './assistant-routes.js';
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import { contentOwnerRoutes } from './content-owner-routes.js';
import { costRoutes } from './cost-routes.js';
import { installationCosts } from './costs.js';
import { householdErasureRoutes } from './household-erasure-routes.js';
import { householdExportRoutes } from './household-export-routes.js';
import { householdImportRoutes } from './household-import-routes.js';
import { createHousehold, householdAccess, isFirstAdmin, isInitialized } from './households.js';
import type { LiveSidebandFactory, LiveUsage } from './live-provider.js';
import { createLoginMethods } from './login-methods.js';
import { MapError } from './map.js';
import { mapRoutes } from './map-routes.js';
import { profileImageRoutes } from './profile-image-routes.js';
import { imageUploadLimit } from './profile-images.js';
import { textAssistantRoutes } from './text-assistant.js';
import type { LocalDispatch } from './text-assistant-mcp.js';
import type { TextModelUsage } from './text-assistant-model.js';
import { voiceAssistantRoutes } from './voice-assistant.js';

export function createApp({
  config,
  database,
  auth,
  identity = buildIdentity,
  modelFetch,
  modelUsage,
  liveFetch,
  liveSideband,
  liveUsage,
  assistantDispatch,
}: {
  config: Config;
  database: Database.Database;
  auth: Auth;
  identity?: typeof buildIdentity;
  modelFetch?: typeof fetch;
  modelUsage?: TextModelUsage;
  liveFetch?: typeof fetch;
  liveSideband?: LiveSidebandFactory;
  liveUsage?: LiveUsage;
  assistantDispatch?: (request: Request, dispatch: LocalDispatch) => Response | Promise<Response>;
}) {
  const app = new Hono();
  const costs = installationCosts(database);
  const linking = createLoginMethods(database, auth, config.origin);
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
      referrerPolicy: 'no-referrer',
    }),
  );
  app.use('/api/*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    if (
      identity.commit !== 'development' &&
      !['GET', 'HEAD', 'OPTIONS'].includes(context.req.method) &&
      !context.req.path.startsWith('/api/auth/') &&
      context.req.header('X-Skyttel-Build') !== `${identity.commit}:${identity.version}`
    )
      return context.json({ error: 'client_outdated' }, 409);
    await next();
  });
  app.use('/api/*', (context, next) =>
    context.req.method === 'POST' && /^\/api\/households\/[^/]+\/imports$/.test(context.req.path)
      ? next()
      : bodyLimit({
          maxSize:
            context.req.method === 'POST' &&
            /^\/api\/households\/[^/]+\/profile-images\/[^/]+$/.test(context.req.path)
              ? imageUploadLimit
              : 16_384,
          onError: (failed) => failed.json({ error: 'invalid_request' }, 413),
        })(context, next),
  );
  app.onError((error, context) => {
    if (error instanceof AdministrationError || error instanceof MapError)
      return context.json({ error: error.code }, error.status);
    console.error(JSON.stringify({ event: 'request_failed' }));
    return context.json({ error: 'internal_error' }, 500);
  });
  function databaseReadiness() {
    const migrations = database
      .prepare('SELECT version, checksum FROM schema_migration ORDER BY version')
      .all() as { version: number; checksum: string }[];
    if (!migrations.length) throw new Error('database_not_ready');
    return {
      status: 'ready',
      schemaVersion: migrations.at(-1)?.version,
      schemaChecksum: createHash('sha256').update(JSON.stringify(migrations)).digest('hex'),
    };
  }
  app.get('/healthz', (context) => {
    context.header('Cache-Control', 'no-store');
    try {
      databaseReadiness();
      return context.json({ status: 'ok' });
    } catch {
      return context.json({ status: 'unavailable' }, 503);
    }
  });
  app.get('/api/version', (context) =>
    context.json({ ...identity, database: databaseReadiness() }),
  );
  const authRoutes = new Set([
    '/api/auth/sign-in/social',
    '/api/auth/callback/google',
    '/api/auth/callback/microsoft',
    '/api/auth/sign-out',
    '/api/auth/get-session',
    '/api/auth/.well-known/oauth-authorization-server',
    '/api/auth/jwks',
    '/api/auth/oauth2/authorize',
    '/api/auth/oauth2/register',
    '/api/auth/oauth2/token',
    '/api/auth/oauth2/revoke',
  ]);
  app.on(['GET', 'POST'], '/api/auth/*', async (context) => {
    if (!authRoutes.has(context.req.path)) return context.json({ error: 'not_found' }, 404);
    if (context.req.path === '/api/auth/oauth2/authorize') {
      const url = new URL(context.req.url);
      url.searchParams.set('prompt', 'consent');
      return auth.handler(new Request(url, context.req.raw));
    }
    return context.req.path.startsWith('/api/auth/callback/')
      ? linking.handleCallback(context.req.raw)
      : auth.handler(context.req.raw);
  });

  app.get('/api/bootstrap', async (context) => {
    const providers = ['google', 'microsoft'] as const;
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ status: 'anonymous', providers, operator: false });
    const user = { id: session.user.id, name: session.user.name };
    const operator = isFirstAdmin(database, user.id, config);
    const household = householdAccess(database, user.id);
    if (household) return context.json({ status: 'ready', providers, user, household, operator });
    if (!isInitialized(database) && isFirstAdmin(database, user.id, config)) {
      return context.json({ status: 'setup', providers, user, operator });
    }
    return context.json({ status: 'forbidden', providers, user, operator });
  });

  app.post('/api/households', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    if (context.req.header('Origin') !== config.origin)
      return context.json({ error: 'forbidden' }, 403);
    if (
      context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
      'application/json'
    ) {
      return context.json({ error: 'invalid_request' }, 400);
    }
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ error: 'invalid_request' }, 400);
    }
    if (!body || typeof body !== 'object' || !('name' in body)) {
      return context.json({ error: 'invalid_request' }, 400);
    }
    const name = normalizeHouseholdName(body.name);
    if (name === null) {
      return context.json({ error: 'invalid_request' }, 400);
    }
    const result = createHousehold(database, config, session.user.id, name);
    if ('error' in result) {
      return context.json({ error: result.error }, result.error === 'forbidden' ? 403 : 409);
    }
    return context.json(result, 201);
  });

  app.get('/api/households/:id', async (context) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    const household = householdAccess(database, session.user.id, context.req.param('id'));
    if (!household) return context.json({ error: 'forbidden' }, 403);
    return context.json({ household });
  });
  app.route('/api', administrationRoutes(database, auth, config.origin));
  app.route('/api', costRoutes(database, auth, config, costs));
  app.route('/api', contentOwnerRoutes(database, auth, config.origin));
  app.route('/api', householdExportRoutes(database, auth, config.origin));
  app.route('/api', householdErasureRoutes(database, auth, config.origin));
  app.route('/api', householdImportRoutes(database, auth, config.origin));
  app.route('/api', linking.routes);
  app.route('/api', mapRoutes(database, auth, config.origin));
  app.route('/api', profileImageRoutes(database, auth, config.origin));
  app.route('/', assistantRoutes(database, auth, config.origin));
  let stopVoice: ((sessionId: string) => void) | undefined;
  const textAssistant = textAssistantRoutes({
    database,
    auth,
    config,
    dispatch: (request) =>
      assistantDispatch
        ? assistantDispatch(request, (next) => app.fetch(next))
        : app.fetch(request),
    modelFetch,
    modelUsage: (attempt) => {
      costs.model(attempt);
      modelUsage?.(attempt);
    },
    onStop: (sessionId) => stopVoice?.(sessionId),
  });
  app.route('/api', textAssistant.routes);
  const voiceAssistant = voiceAssistantRoutes({
    config,
    dispatch: (request) => app.fetch(request),
    liveFetch,
    liveSideband,
    liveUsage,
    recordUsage: costs.live,
    interrupt: textAssistant.interrupt,
  });
  stopVoice = voiceAssistant.stopSession;
  app.route('/api', voiceAssistant.routes);
  app.all('/api/*', (context) => context.json({ error: 'not_found' }, 404));
  app.use('/assets/*', serveStatic({ root: './dist/client' }));
  app.get(
    '*',
    async (context, next) => {
      context.header('Cache-Control', 'no-store');
      await next();
    },
    serveStatic({ path: './dist/client/index.html' }),
  );
  return Object.assign(app, {
    close: async () => {
      await voiceAssistant.close();
      await textAssistant.close();
    },
  });
}
