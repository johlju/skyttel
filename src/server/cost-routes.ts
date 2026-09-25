import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import type { installationCosts } from './costs.js';
import { isFirstAdmin } from './households.js';

export function costRoutes(
  database: Database.Database,
  auth: Auth,
  config: Config,
  costs: ReturnType<typeof installationCosts>,
) {
  const routes = new Hono();
  routes.use('/operator/costs*', async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json({ error: 'unauthenticated' }, 401);
    if (!isFirstAdmin(database, session.user.id, config))
      return context.json({ error: 'forbidden' }, 403);
    if (context.req.method !== 'GET' && context.req.header('Origin') !== config.origin)
      return context.json({ error: 'forbidden' }, 403);
    await next();
  });
  routes.get('/operator/costs', (context) => context.json(costs.read(context.req.query('month'))));
  routes.post('/operator/costs/assumptions', async (context) => {
    if (
      context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
      'application/json'
    )
      return context.json({ error: 'invalid_request' }, 400);
    return context.json(costs.update(await context.req.json().catch(() => null)));
  });
  return routes;
}
