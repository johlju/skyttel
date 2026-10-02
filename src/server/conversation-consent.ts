import type Database from 'better-sqlite3';
import {
  conversationConsentTextVersion,
  type SavedConversationConsent,
} from '../shared/conversation-consent.js';

export type ConversationConsents = ReturnType<typeof conversationConsents>;

/**
 * The conversation consents of the installation, for the consent text version
 * that the running release has. A consent is valid when the user has saved it
 * for that version or approves that version for the ongoing visit.
 */
export function conversationConsents(
  database: Database.Database,
  textVersion = conversationConsentTextVersion,
) {
  /** Whether a consent, saved or stated in a request, approves the current consent text. */
  function approvesCurrentText(consent: unknown) {
    return (
      typeof consent === 'object' &&
      consent !== null &&
      'textVersion' in consent &&
      consent.textVersion === textVersion
    );
  }
  function saved(userId: string, householdId: string) {
    return (
      (database
        .prepare(
          'SELECT textVersion, savedAt FROM conversation_consent WHERE householdId = ? AND userId = ?',
        )
        .get(householdId, userId) as SavedConversationConsent | undefined) ?? null
    );
  }
  return {
    approvesCurrentText,
    saved,
    /** Saves the user's consent to the current consent text for the household. */
    save(userId: string, householdId: string) {
      // The consent follows the membership. A membership that ended while the
      // request was read leaves nothing to save.
      database
        .prepare(`INSERT INTO conversation_consent (householdId, userId, textVersion, savedAt)
          SELECT householdId, userId, ?, ? FROM membership WHERE householdId = ? AND userId = ?
          ON CONFLICT(householdId, userId)
          DO UPDATE SET textVersion = excluded.textVersion, savedAt = excluded.savedAt`)
        .run(textVersion, new Date().toISOString(), householdId, userId);
      return saved(userId, householdId);
    },
    /** Removes the user's saved consent for the household, whatever text version it approves. */
    revoke(userId: string, householdId: string) {
      database
        .prepare('DELETE FROM conversation_consent WHERE householdId = ? AND userId = ?')
        .run(householdId, userId);
    },
    /** `visitConsent` is what a request states that the user approves for the ongoing visit. */
    valid(userId: string, householdId: string, visitConsent: unknown) {
      return approvesCurrentText(visitConsent) || approvesCurrentText(saved(userId, householdId));
    },
  };
}
