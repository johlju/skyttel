import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Auth } from './auth.js';
import {
  confirmHouseholdImport,
  householdImportStatus,
  initializeHouseholdImports,
  prepareHouseholdImport,
} from './household-import.js';
import { MapError } from './map-error.js';

export function householdImportRoutes(database: Database.Database, auth: Auth, origin: string) {
  initializeHouseholdImports(database);
  const routes = new Hono<{ Variables: { userId: string } }>();
  routes.use('/households/:id/imports*', async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new MapError('unauthenticated', 401);
    context.set('userId', session.user.id);
    if (context.req.method === 'POST' && context.req.header('Origin') !== origin)
      throw new MapError('forbidden', 403);
    await next();
  });
  routes.post('/households/:id/imports', async (context) => {
    const generation = Number(context.req.header('X-Skyttel-Content-Version'));
    if (
      context.req.header('Content-Type') !== 'application/zip' ||
      !Number.isSafeInteger(generation) ||
      generation < 1
    )
      throw new MapError('invalid_request', 400);
    return context.json(
      await prepareHouseholdImport(
        database,
        context.get('userId'),
        context.req.param('id'),
        generation,
        context.req.raw,
      ),
      201,
    );
  });
  routes.post('/households/:id/imports/:importId/confirm', async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      throw new MapError('invalid_request', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new MapError('invalid_request', 400);
    return context.json(
      await confirmHouseholdImport(
        database,
        context.get('userId'),
        context.req.param('id'),
        context.req.param('importId'),
        body as Record<string, unknown>,
      ),
    );
  });
  routes.get('/households/:id/imports/:importId', (context) =>
    context.json(
      householdImportStatus(
        database,
        context.get('userId'),
        context.req.param('id'),
        context.req.param('importId'),
      ),
    ),
  );
  return routes;
}
