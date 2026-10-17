import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { z } from 'zod';
import type { ThemeMode, ThemePreference } from '../shared/theme-preference.js';
import type { Auth } from './auth.js';
import { MapError } from './map-error.js';

const choice = z.object({ mode: z.enum(['light', 'dark', 'system']) }).strict();

export function themePreferenceRoutes(database: Database.Database, auth: Auth, origin: string) {
  const routes = new Hono<{ Variables: { userId: string } }>();
  const path = '/theme-preference';
  routes.use(path, async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new MapError('unauthenticated', 401);
    if (context.req.method === 'POST' && context.req.header('Origin') !== origin)
      throw new MapError('forbidden', 403);
    context.set('userId', session.user.id);
    await next();
  });
  routes.get(path, (context) => {
    const userId = context.get('userId');
    const saved = database
      .prepare('SELECT mode FROM theme_preferences WHERE userId = ?')
      .get(userId) as { mode: ThemeMode } | undefined;
    return context.json<ThemePreference>({ userId, mode: saved?.mode ?? 'system' });
  });
  routes.post(path, async (context) => {
    const parsed = choice.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) throw new MapError('invalid_request', 400);
    const userId = context.get('userId');
    database
      .prepare(
        'INSERT INTO theme_preferences (userId, mode) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET mode = excluded.mode',
      )
      .run(userId, parsed.data.mode);
    return context.json<ThemePreference>({ userId, mode: parsed.data.mode });
  });
  return routes;
}
