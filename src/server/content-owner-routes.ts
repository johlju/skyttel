import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Auth } from './auth.js';
import { contentOwners } from './content-owners.js';
import { MapError } from './map-error.js';

export function contentOwnerRoutes(database: Database.Database, auth: Auth, origin: string) {
  const routes = new Hono<{ Variables: { userId: string } }>();
  routes.use('/households/:id/content-owners*', async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new MapError('unauthenticated', 401);
    context.set('userId', session.user.id);
    if (context.req.method === 'POST' && context.req.header('Origin') !== origin)
      throw new MapError('forbidden', 403);
    await next();
  });
  routes.get('/households/:id/content-owners', (context) =>
    context.json(contentOwners(database, context.req.param('id'), context.get('userId')).read()),
  );
  routes.post('/households/:id/content-owners/assign', async (context) => {
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
    return context.json(
      contentOwners(database, context.req.param('id'), context.get('userId')).assign(
        body as Record<string, unknown>,
      ),
    );
  });
  return routes;
}
