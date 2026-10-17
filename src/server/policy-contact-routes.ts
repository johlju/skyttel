import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Auth } from './auth.js';
import type { Config } from './config.js';
import { isFirstAdmin } from './households.js';

export function policyContactRoutes(database: Database.Database, auth: Auth, config: Config) {
  const routes = new Hono();
  function read() {
    const installed = database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'policy_contact'")
      .get();
    const value = installed
      ? (database.prepare('SELECT email FROM policy_contact WHERE id = 1').get() as
          | { email: string }
          | undefined)
      : undefined;
    return { email: value?.email || null };
  }
  routes.get('/policy-contact', (context) => context.json(read()));
  routes.post('/operator/policy-contact', async (context) => {
    const current = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!current) return context.json({ error: 'unauthenticated' }, 401);
    if (
      !isFirstAdmin(database, current.user.id, config) ||
      context.req.header('Origin') !== config.origin
    )
      return context.json({ error: 'forbidden' }, 403);
    if (
      context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
      'application/json'
    )
      return context.json({ error: 'invalid_request' }, 400);
    const value = z
      .object({ email: z.union([z.email().max(254), z.literal('')]) })
      .strict()
      .safeParse(await context.req.json().catch(() => null));
    if (!value.success) return context.json({ error: 'invalid_request' }, 400);
    database
      .prepare(
        'INSERT INTO policy_contact (id, email) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email',
      )
      .run(value.data.email);
    return context.json(read());
  });
  return routes;
}
