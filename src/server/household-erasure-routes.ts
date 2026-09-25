import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import { AdministrationError } from './administration.js';
import type { Auth } from './auth.js';
import { assertContentAvailable } from './content-maintenance.js';
import { erasureContent, readErasureSelection, reviewErasure } from './erasure-content.js';
import {
  erasureStatus,
  executeErasure,
  latestErasure,
  resumeErasure,
} from './household-erasure.js';
import { householdAccess } from './households.js';

export function householdErasureRoutes(database: Database.Database, auth: Auth, origin: string) {
  const routes = new Hono<{ Variables: { actorId: string } }>();
  routes.use('/households/:id/erasure*', async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new AdministrationError('unauthenticated', 401);
    context.set('actorId', session.user.id);
    if (
      householdAccess(database, session.user.id, context.req.param('id') as string)?.role !==
      'administrator'
    )
      throw new AdministrationError('forbidden', 403);
    if (context.req.method === 'POST' && context.req.header('Origin') !== origin)
      throw new AdministrationError('forbidden', 403);
    if (
      context.req.method === 'POST' &&
      context.req.header('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !==
        'application/json'
    )
      throw new AdministrationError('invalid_request', 400);
    await next();
  });
  routes.get('/households/:id/erasure', (context) => {
    const latest = latestErasure(database, context.req.param('id'));
    const status = latest ? erasureStatus(latest) : null;
    if (status?.phase === 'prepared' || status?.phase === 'cleanup')
      return context.json({
        objects: [],
        relationships: [],
        objectTypes: [],
        relationshipTypes: [],
        status,
      });
    assertContentAvailable(database, context.req.param('id'));
    const content = erasureContent(database, context.req.param('id'), context.get('actorId'));
    return context.json({
      status,
      objects: [...content.allObjects.values()]
        .filter(({ id }) => content.visible.object.has(id))
        .map(({ id, name }) => ({ id, name })),
      relationships: [...content.allEdges.values()]
        .filter(({ id }) => content.visible.relationship.has(id))
        .map(({ id }) => ({ id, name: id })),
      objectTypes: [...content.allTypes.values()]
        .filter(({ id }) => content.visible.objectType.has(id))
        .map(({ id, name }) => ({ id, name })),
      relationshipTypes: [...content.allEdgeTypes.values()]
        .filter(({ id }) => content.visible.relationshipType.has(id))
        .map(({ id, name }) => ({ id, name })),
    });
  });
  routes.post('/households/:id/erasure/review', async (context) => {
    assertContentAvailable(database, context.req.param('id'));
    const body = await context.req.json().catch(() => null);
    const selection = readErasureSelection(body?.selection);
    return context.json(
      database.transaction(() =>
        reviewErasure(database, context.req.param('id'), context.get('actorId'), selection),
      )(),
    );
  });
  routes.post('/households/:id/erasure/execute', async (context) => {
    const body = await context.req.json().catch(() => null);
    const selection = readErasureSelection(body?.selection);
    if (
      body?.confirmation !== 'RADERA PERMANENT' ||
      typeof body?.operationId !== 'string' ||
      !/^[\w-]{1,128}$/.test(body.operationId) ||
      typeof body?.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(body.token)
    )
      throw new AdministrationError('invalid_request', 400);
    const status = await executeErasure(database, context.req.param('id'), context.get('actorId'), {
      operationId: body.operationId,
      token: body.token,
      selection,
    });
    return context.json(
      { status },
      status.phase === 'completed' || status.phase === 'failed' ? 200 : 202,
    );
  });
  routes.post('/households/:id/erasure/resume', async (context) => {
    const body = await context.req.json().catch(() => null);
    if (typeof body?.operationId !== 'string' || !/^[\w-]{1,128}$/.test(body.operationId))
      throw new AdministrationError('invalid_request', 400);
    const status = await resumeErasure(
      database,
      context.req.param('id'),
      context.get('actorId'),
      body.operationId,
    );
    return context.json(
      { status },
      status.phase === 'completed' || status.phase === 'failed' ? 200 : 202,
    );
  });
  return routes;
}
