import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  type ConversationPreferences,
  defaultConversationPreferences,
} from '../shared/conversation-preferences.js';
import { MapError } from './map-error.js';

const choice = z
  .object({
    showDraftOnStart: z.boolean().optional(),
    textWidth: z.number().int().min(300).optional(),
    draftWidth: z.number().int().min(260).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);

/** Personal choices are independent of household content and conversation consent. */
export function conversationPreferences(database: Database.Database, userId: string) {
  return {
    read(): ConversationPreferences {
      const row = database
        .prepare(
          'SELECT showDraftOnStart, textWidth, draftWidth FROM conversation_preferences WHERE userId = ?',
        )
        .get(userId) as
        | { showDraftOnStart: number; textWidth: number; draftWidth: number }
        | undefined;
      return row
        ? {
            showDraftOnStart: Boolean(row.showDraftOnStart),
            textWidth: row.textWidth,
            draftWidth: row.draftWidth,
          }
        : { ...defaultConversationPreferences };
    },
    configure(body: Record<string, unknown>): ConversationPreferences {
      const parsed = choice.safeParse(body);
      if (!parsed.success) throw new MapError('invalid_request', 400);
      return database
        .transaction(() => {
          const previous = this.read();
          const next = { ...previous, ...parsed.data };
          database
            .prepare(
              'INSERT INTO conversation_preferences (userId, showDraftOnStart, textWidth, draftWidth) VALUES (?, ?, ?, ?) ON CONFLICT(userId) DO UPDATE SET showDraftOnStart = excluded.showDraftOnStart, textWidth = excluded.textWidth, draftWidth = excluded.draftWidth',
            )
            .run(userId, Number(next.showDraftOnStart), next.textWidth, next.draftWidth);
          return next;
        })
        .immediate();
    },
  };
}
