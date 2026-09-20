import type Database from 'better-sqlite3';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Auth } from './auth.js';
import { householdMap, MapError } from './map.js';

export function mapRoutes(database: Database.Database, auth: Auth, origin: string) {
  type Environment = { Variables: { userId: string; body: Record<string, unknown> } };
  const routes = new Hono<Environment>();
  const authenticate: MiddlewareHandler<Environment> = async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new MapError('unauthenticated', 401);
    context.set('userId', session.user.id);
    if (context.req.method === 'POST') {
      if (context.req.header('Origin') !== origin) throw new MapError('forbidden', 403);
      if (
        context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
        'application/json'
      )
        throw new MapError('invalid_request', 400);
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        throw new MapError('invalid_request', 400);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new MapError('invalid_request', 400);
      context.set('body', body as Record<string, unknown>);
    }
    await next();
  };
  routes.use('/households/:id/map/*', authenticate);
  routes.use('/households/:id/map', authenticate);
  routes.get('/households/:id/map', (context) =>
    context.json(householdMap(database, context.get('userId'), context.req.param('id')).read()),
  );
  routes.get('/households/:id/map/history', (context) =>
    context.json(householdMap(database, context.get('userId'), context.req.param('id')).history()),
  );
  routes.post('/households/:id/map/draft', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).propose(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/discard', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).discard(
        context.get('body').version,
      ),
    ),
  );
  routes.post('/households/:id/map/save', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).save(
        context.get('body'),
      ),
    ),
  );
  return routes;
}
