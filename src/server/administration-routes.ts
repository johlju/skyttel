import type Database from 'better-sqlite3';
import { Hono, type MiddlewareHandler } from 'hono';
import {
  AdministrationError,
  acceptInvitation,
  changeMembership,
  createInvitation,
  readAdministration,
  revokeInvitation,
} from './administration.js';
import type { Auth } from './auth.js';

export function administrationRoutes(database: Database.Database, auth: Auth, origin: string) {
  type Environment = { Variables: { userId: string; body: Record<string, unknown> } };
  const routes = new Hono<Environment>();
  const authenticate: MiddlewareHandler<Environment> = async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new AdministrationError('unauthenticated', 401);
    context.set('userId', session.user.id);
    if (context.req.method === 'POST') {
      if (context.req.header('Origin') !== origin) throw new AdministrationError('forbidden', 403);
      if (
        context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
        'application/json'
      ) {
        throw new AdministrationError('invalid_request', 400);
      }
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        throw new AdministrationError('invalid_request', 400);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new AdministrationError('invalid_request', 400);
      context.set('body', body as Record<string, unknown>);
    }
    await next();
  };
  for (const path of [
    '/households/:id/administration',
    '/households/:id/invitations',
    '/households/:id/invitations/:invitationId/revoke',
    '/households/:id/members/:userId/role',
    '/households/:id/members/:userId/revoke',
    '/invitations/accept',
  ])
    routes.use(path, authenticate);
  routes.get('/households/:id/administration', (context) =>
    context.json(readAdministration(database, context.get('userId'), context.req.param('id'))),
  );
  routes.post('/households/:id/invitations', (context) => {
    const userId = context.get('body').userId;
    if (typeof userId !== 'string' || userId.length === 0 || userId.length > 128)
      throw new AdministrationError('invalid_request', 400);
    return context.json(
      createInvitation(database, context.get('userId'), context.req.param('id'), userId),
      201,
    );
  });
  routes.post('/invitations/accept', (context) => {
    const code = context.get('body').code;
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code))
      throw new AdministrationError('invitation_unavailable', 409);
    return context.json(acceptInvitation(database, context.get('userId'), code));
  });
  routes.post('/households/:id/invitations/:invitationId/revoke', (context) =>
    context.json(
      revokeInvitation(
        database,
        context.get('userId'),
        context.req.param('id'),
        context.req.param('invitationId'),
      ),
    ),
  );
  routes.post('/households/:id/members/:userId/role', (context) => {
    const role = context.get('body').role;
    if (role !== 'administrator' && role !== 'member')
      throw new AdministrationError('invalid_request', 400);
    return context.json(
      changeMembership(
        database,
        context.get('userId'),
        context.req.param('id'),
        context.req.param('userId'),
        role,
      ),
    );
  });
  routes.post('/households/:id/members/:userId/revoke', (context) =>
    context.json(
      changeMembership(
        database,
        context.get('userId'),
        context.req.param('id'),
        context.req.param('userId'),
        null,
      ),
    ),
  );
  return routes;
}
