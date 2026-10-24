import { File } from 'node:buffer';
import type Database from 'better-sqlite3';
import { Hono, type MiddlewareHandler } from 'hono';
import type { Auth } from './auth.js';
import { conversationPreferences } from './conversation-preferences.js';
import { householdAccess } from './households.js';
import { householdMap, MapError } from './map.js';
import { personalView } from './personal-view.js';
import { type EncodedImage, encodeProfileImage } from './profile-images.js';
import { propertyWriteLimit } from './properties.js';

export function mapRoutes(
  database: Database.Database,
  auth: Auth,
  origin: string,
  checkConversation?: (
    id: unknown,
    actorId: string,
    browserSessionId: string,
    householdId: string,
  ) => void,
) {
  type Environment = {
    Variables: { userId: string; browserSessionId: string; body: Record<string, unknown> };
  };
  const routes = new Hono<Environment>();
  const authenticate: MiddlewareHandler<Environment> = async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new MapError('unauthenticated', 401);
    context.set('userId', session.user.id);
    context.set('browserSessionId', session.session.id);
    if (context.req.method === 'POST') {
      if (context.req.header('Origin') !== origin) throw new MapError('forbidden', 403);
      if (
        context.req.path.endsWith('/map/object-form') &&
        context.req.header('Content-Type')?.startsWith('multipart/form-data;')
      ) {
        await next();
        return;
      }
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
      if (/\/map\/(?:operations|save)$/.test(context.req.path)) {
        const { conversationId, ...saveBody } = body as Record<string, unknown>;
        if (conversationId !== undefined) {
          if (!checkConversation) throw new MapError('invalid_request', 400);
          // Registered attempts are immutable and retain their recovery path.
          const operation =
            typeof saveBody.operationId === 'string'
              ? householdMap(database, session.user.id, context.req.param('id') ?? '').operation(
                  saveBody.operationId,
                ).operation
              : null;
          if (!operation)
            checkConversation(
              conversationId,
              session.user.id,
              session.session.id,
              context.req.param('id') ?? '',
            );
        }
        body = saveBody;
      }
      context.set('body', body as Record<string, unknown>);
    }
    await next();
  };
  routes.use('/households/:id/map/*', authenticate);
  routes.use('/households/:id/map', authenticate);
  routes.get('/households/:id/map/conversation-preferences', (context) => {
    if (!householdAccess(database, context.get('userId'), context.req.param('id')))
      throw new MapError('forbidden', 403);
    return context.json(conversationPreferences(database, context.get('userId')).read());
  });
  routes.post('/households/:id/map/conversation-preferences', (context) => {
    if (!householdAccess(database, context.get('userId'), context.req.param('id')))
      throw new MapError('forbidden', 403);
    return context.json(
      conversationPreferences(database, context.get('userId')).configure(context.get('body')),
    );
  });
  routes.get('/households/:id/map/view', (context) =>
    context.json(personalView(database, context.get('userId'), context.req.param('id')).read()),
  );
  routes.post('/households/:id/map/view/position', (context) =>
    context.json(
      personalView(database, context.get('userId'), context.req.param('id')).move(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/view/settings', (context) =>
    context.json(
      personalView(database, context.get('userId'), context.req.param('id')).configure(
        context.get('body'),
      ),
    ),
  );
  routes.get('/households/:id/map', (context) =>
    context.json(householdMap(database, context.get('userId'), context.req.param('id')).read()),
  );
  routes.get('/households/:id/map/history', (context) =>
    context.json(householdMap(database, context.get('userId'), context.req.param('id')).history()),
  );
  routes.get('/households/:id/map/operations', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).operations(),
    ),
  );
  routes.get('/households/:id/map/operations/:operationId', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).operation(
        context.req.param('operationId'),
      ),
    ),
  );
  routes.post('/households/:id/map/operations', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).registerOperation(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/draft', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).propose(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/object-type', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).proposeObjectType(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/object-form', async (context) => {
    const userId = context.get('userId');
    const householdId = context.req.param('id');
    if (!householdAccess(database, userId, householdId)) throw new MapError('forbidden', 403);
    let body = context.get('body');
    let image: EncodedImage | undefined;
    if (context.req.header('Content-Type')?.startsWith('multipart/form-data;')) {
      let values: FormData;
      try {
        values = await context.req.raw.formData();
      } catch {
        throw new MapError('invalid_request', 400);
      }
      const metadata = values.get('metadata');
      const file = values.get('image');
      if (
        typeof metadata !== 'string' ||
        Buffer.byteLength(metadata, 'utf8') > propertyWriteLimit ||
        !(file instanceof File) ||
        values.getAll('metadata').length !== 1 ||
        values.getAll('image').length !== 1 ||
        [...values.keys()].some((key) => !['metadata', 'image'].includes(key))
      )
        throw new MapError('invalid_request', 400);
      try {
        body = JSON.parse(metadata);
      } catch {
        throw new MapError('invalid_request', 400);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new MapError('invalid_request', 400);
      image = await encodeProfileImage(await file.arrayBuffer());
    }
    if (typeof body?.stagingId !== 'string') throw new MapError('invalid_request', 400);
    return context.json(householdMap(database, userId, householdId).propose(body, image));
  });
  routes.post('/households/:id/map/relationship', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).proposeRelationship(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/relationship-form', (context) =>
    context.json(
      householdMap(
        database,
        context.get('userId'),
        context.req.param('id'),
      ).proposeRelationshipForm(context.get('body')),
    ),
  );
  routes.get('/households/:id/map/relationship-form/:stagingId', (context) =>
    context.json(
      householdMap(
        database,
        context.get('userId'),
        context.req.param('id'),
      ).relationshipFormOutcome(
        context.req.param('stagingId'),
        Number(context.req.query('contentVersion')),
      ),
    ),
  );
  routes.post('/households/:id/map/relationship-type', (context) =>
    context.json(
      householdMap(
        database,
        context.get('userId'),
        context.req.param('id'),
      ).proposeRelationshipType(context.get('body')),
    ),
  );
  routes.post('/households/:id/map/resolve', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).resolve(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/discard-change', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).discardChange(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/discard-review', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).discardReview(
        context.get('body'),
      ),
    ),
  );
  routes.post('/households/:id/map/discard', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).discard(
        context.get('body').version,
        context.get('body').contentVersion,
      ),
    ),
  );
  routes.post('/households/:id/map/save', (context) =>
    context.json(
      householdMap(database, context.get('userId'), context.req.param('id')).save(
        context.get('body'),
      ),
    ),
  );
  return routes;
}
