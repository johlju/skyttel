import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import { isFirstAdmin } from './households.js';
import type { TraceSending } from './trace-sending.js';

export function traceSendingRoutes(
  database: Database.Database,
  auth: Auth,
  config: Config,
  sending: TraceSending,
) {
  const routes = new Hono();
  routes.use('/operator/tracing', async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    if (
      !isFirstAdmin(database, session.user.id, config) ||
      (context.req.method !== 'GET' && context.req.header('Origin') !== config.origin)
    )
      return context.json({ error: 'forbidden' }, 403);
    await next();
  });
  routes.get('/operator/tracing', (context) => context.json(sending.read()));
  routes.post('/operator/tracing', async (context) => {
    if (
      context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
      'application/json'
    )
      return context.json({ error: 'invalid_request' }, 400);
    const parsed = z
      .object({ action: z.enum(['enable', 'disable', 'restart']) })
      .strict()
      .safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json({ error: 'invalid_request' }, 400);
    const result = sending.update(parsed.data.action);
    return result ? context.json(result) : context.json({ error: 'not_connected' }, 409);
  });
  return routes;
}
