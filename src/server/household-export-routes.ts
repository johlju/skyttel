import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { AdministrationError } from './administration.js';
import type { Auth } from './auth.js';
import {
  cancelHouseholdExport,
  downloadHouseholdExport,
  initializeHouseholdExports,
  prepareHouseholdExport,
} from './household-export.js';

export function householdExportRoutes(database: Database.Database, auth: Auth, origin: string) {
  initializeHouseholdExports(database);
  const routes = new Hono<{ Variables: { userId: string } }>();
  routes.use('/households/:id/exports*', async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new AdministrationError('unauthenticated', 401);
    context.set('userId', session.user.id);
    if (context.req.method === 'POST' && context.req.header('Origin') !== origin)
      throw new AdministrationError('forbidden', 403);
    await next();
  });
  routes.post('/households/:id/exports', async (context) =>
    context.json(
      await prepareHouseholdExport(
        database,
        context.get('userId'),
        context.req.param('id'),
        context.req.raw.signal,
      ),
      201,
    ),
  );
  routes.post('/households/:id/exports/:exportId/cancel', async (context) => {
    await cancelHouseholdExport(
      database,
      context.get('userId'),
      context.req.param('id'),
      context.req.param('exportId'),
    );
    return context.json({ ok: true });
  });
  routes.get('/households/:id/exports/:exportId', async (context) => {
    const result = await downloadHouseholdExport(
      database,
      context.get('userId'),
      context.req.param('id'),
      context.req.param('exportId'),
    );
    return new Response(result.body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(result.bytes),
        'Content-Disposition': 'attachment; filename="skyttel-export.zip"',
        'Cache-Control': 'no-store',
      },
    });
  });
  return routes;
}
