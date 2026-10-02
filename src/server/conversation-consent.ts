import type Database from 'better-sqlite3';
import { Hono } from 'hono';
import {
  type ConversationConsentView,
  conversationConsentTextVersion,
  type SavedConversationConsent,
} from '../shared/conversation-consent.js';
import type { Auth } from './auth.js';
import { householdAccess } from './households.js';
import { MapError } from './map-error.js';

function savedConsent(database: Database.Database, userId: string, householdId: string) {
  return (
    (database
      .prepare(
        'SELECT textVersion, savedAt FROM conversation_consent WHERE householdId = ? AND userId = ?',
      )
      .get(householdId, userId) as SavedConversationConsent | undefined) ?? null
  );
}

/** Whether a consent, saved or stated in a request, approves the current consent text. */
function approvesCurrentText(consent: unknown) {
  return (
    typeof consent === 'object' &&
    consent !== null &&
    'textVersion' in consent &&
    consent.textVersion === conversationConsentTextVersion
  );
}

/**
 * A consent is valid when the user has saved it for the current consent text
 * or approves that text for the ongoing visit.
 */
export function conversationConsentValid(
  database: Database.Database,
  userId: string,
  householdId: string,
  visitConsent: unknown,
) {
  return (
    approvesCurrentText(visitConsent) ||
    approvesCurrentText(savedConsent(database, userId, householdId))
  );
}

export function conversationConsentRoutes(database: Database.Database, auth: Auth, origin: string) {
  const routes = new Hono<{ Variables: { userId: string } }>();
  const path = '/households/:id/conversation-consent';
  routes.use(path, async (context, next) => {
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
      saved: savedConsent(database, context.get('userId'), context.req.param('id')),
    }),
  );
  routes.post(path, async (context) => {
    if (!approvesCurrentText(await context.req.json().catch(() => null)))
      throw new MapError('invalid_request', 400);
    const userId = context.get('userId');
    const householdId = context.req.param('id');
    // The consent follows the membership. A membership that ended while the
    // request was read leaves nothing to save.
    database
      .prepare(`INSERT INTO conversation_consent (householdId, userId, textVersion, savedAt)
        SELECT householdId, userId, ?, ? FROM membership WHERE householdId = ? AND userId = ?
        ON CONFLICT(householdId, userId)
        DO UPDATE SET textVersion = excluded.textVersion, savedAt = excluded.savedAt`)
      .run(conversationConsentTextVersion, new Date().toISOString(), householdId, userId);
    return context.json<ConversationConsentView>({
      saved: savedConsent(database, userId, householdId),
    });
  });
  return routes;
}
