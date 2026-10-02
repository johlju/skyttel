import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import type { ConversationConsentView } from '../shared/conversation-consent.js';
import type { Auth } from './auth.js';
import type { ConversationConsents } from './conversation-consent.js';
import { householdAccess } from './households.js';
import { MapError } from './map-error.js';

export function conversationConsentRoutes(
  database: Database.Database,
  auth: Auth,
  origin: string,
  consents: ConversationConsents,
  /** Ends the user's conversations in the household, on all devices, when the consent is revoked. */
  endConversations: (userId: string, householdId: string) => Promise<void>,
) {
  const routes = new Hono<{ Variables: { userId: string } }>();
  const path = '/households/:id/conversation-consent';
  routes.use(`${path}/*`, async (context, next) => {
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) throw new MapError('unauthenticated', 401);
    if (context.req.method === 'POST' && context.req.header('Origin') !== origin)
      throw new MapError('forbidden', 403);
    if (!householdAccess(database, session.user.id, context.req.param('id')))
      throw new MapError('forbidden', 403);
    context.set('userId', session.user.id);
    await next();
  });
  routes.get(path, (context) =>
    context.json<ConversationConsentView>({
      saved: consents.saved(context.get('userId'), context.req.param('id')),
    }),
  );
  routes.post(path, async (context) => {
    if (!consents.approvesCurrentText(await context.req.json().catch(() => null)))
      throw new MapError('invalid_request', 400);
    return context.json<ConversationConsentView>({
      saved: consents.save(context.get('userId'), context.req.param('id')),
    });
  });
  // A revocation covers a saved consent and one that only applies to a visit,
  // so it is carried out whether or not a consent is saved.
  routes.post(`${path}/revoke`, async (context) => {
    const userId = context.get('userId');
    const householdId = context.req.param('id');
    consents.revoke(userId, householdId);
    await endConversations(userId, householdId);
    return context.json<ConversationConsentView>({ saved: consents.saved(userId, householdId) });
  });
  return routes;
}
