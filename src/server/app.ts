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
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import { createHousehold, householdAccess, isFirstAdmin, isInitialized } from './households.js';
import { createLoginMethods } from './login-methods.js';
import { MapError } from './map.js';
import { mapRoutes } from './map-routes.js';

export function createApp({
  config,
  database,
  auth,
  identity = buildIdentity,
}: {
  config: Config;
  database: Database.Database;
  auth: Auth;
  identity?: typeof buildIdentity;
}) {
  const app = new Hono();
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
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 16_384,
      onError: (context) => context.json({ error: 'invalid_request' }, 413),
    }),
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
  ]);
  app.on(['GET', 'POST'], '/api/auth/*', async (context) => {
    if (!authRoutes.has(context.req.path)) return context.json({ error: 'not_found' }, 404);
    return context.req.path.startsWith('/api/auth/callback/')
      ? linking.handleCallback(context.req.raw)
      : auth.handler(context.req.raw);
  });

  app.get('/api/bootstrap', async (context) => {
    const providers = ['google', 'microsoft'] as const;
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ status: 'anonymous', providers });
    const user = { id: session.user.id, name: session.user.name };
    const household = householdAccess(database, user.id);
    if (household) return context.json({ status: 'ready', providers, user, household });
    if (!isInitialized(database) && isFirstAdmin(database, user.id, config)) {
      return context.json({ status: 'setup', providers, user });
    }
    return context.json({ status: 'forbidden', providers, user });
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
  app.route('/api', linking.routes);
  app.route('/api', mapRoutes(database, auth, config.origin));
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
  return app;
}
