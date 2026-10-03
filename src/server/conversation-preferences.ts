import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  type ConversationPreferences,
  defaultConversationPreferences,
} from '../shared/conversation-preferences.js';
import { MapError } from './map-error.js';

const choice = z.object({ showDraftOnStart: z.boolean() }).strict();

/** Personal choices are independent of household content and conversation consent. */
export function conversationPreferences(database: Database.Database, userId: string) {
  return {
    read(): ConversationPreferences {
      const row = database
        .prepare('SELECT showDraftOnStart FROM conversation_preferences WHERE userId = ?')
        .get(userId) as { showDraftOnStart: number } | undefined;
      return row
        ? { showDraftOnStart: Boolean(row.showDraftOnStart) }
        : { ...defaultConversationPreferences };
    },
    configure(body: Record<string, unknown>): ConversationPreferences {
      const parsed = choice.safeParse(body);
      if (!parsed.success) throw new MapError('invalid_request', 400);
      database
        .prepare(
          'INSERT INTO conversation_preferences (userId, showDraftOnStart) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET showDraftOnStart = excluded.showDraftOnStart',
        )
        .run(userId, Number(parsed.data.showDraftOnStart));
      return parsed.data;
    },
  };
}
