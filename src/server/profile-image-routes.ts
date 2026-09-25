import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { Auth } from './auth.js';
import { householdMap, MapError } from './map.js';
import { encodeProfileImage } from './profile-images.js';

export function profileImageRoutes(database: Database.Database, auth: Auth, origin: string) {
  const routes = new Hono<{ Variables: { userId: string } }>();
  routes.use('/households/:id/profile-images/:imageId', async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new MapError('unauthenticated', 401);
    if (context.req.method !== 'GET' && context.req.header('Origin') !== origin)
      throw new MapError('forbidden', 403);
    context.set('userId', session.user.id);
    await next();
  });
  routes.get('/households/:id/profile-images/:imageId', (context) => {
    const image = householdMap(database, context.get('userId'), context.req.param('id')).image(
      context.req.param('imageId'),
    );
    context.header('Content-Type', 'image/webp');
    return context.body(new Uint8Array(image.bytes));
  });
  routes.on(['POST', 'DELETE'], '/households/:id/profile-images/:imageId', async (context) => {
    const map = householdMap(database, context.get('userId'), context.req.param('id'));
    const integer = (name: string) => {
      const raw = context.req.header(name);
      if (!raw || !/^\d+$/.test(raw)) throw new MapError('invalid_request', 400);
      return Number(raw);
    };
    const body = {
      id: context.req.param('imageId'),
      version: integer('X-Skyttel-Draft-Version'),
      contentVersion: integer('X-Skyttel-Content-Version'),
      baseRevision:
        context.req.header('X-Skyttel-Object-Revision') === 'null'
          ? null
          : integer('X-Skyttel-Object-Revision'),
    };
    map.checkImageChange(body);
    const image =
      context.req.method === 'DELETE'
        ? null
        : await encodeProfileImage(await context.req.arrayBuffer());
    return context.json(map.proposeImage(body, image));
  });
  return routes;
}
