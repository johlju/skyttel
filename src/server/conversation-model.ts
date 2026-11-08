import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  type ConversationModelChoice,
  defaultConversationModelChoice,
  sameModelChoice,
  supportedConversationChoices,
} from '../shared/conversation-model.js';
import { MapError } from './map-error.js';
import type { TextModelProfile } from './text-assistant-model.js';

export const modelChoiceSchema = z
  .object({
    model: z.enum(['gpt-6.1-terra', 'gpt-6.1-sol']),
    effort: z.enum(['low', 'medium', 'high']),
  })
  .strict();

/** Profiles checked against the official model pages on 2026-11-03. */
export function conversationModelProfile(choice: ConversationModelChoice): TextModelProfile {
  return { provider: 'openai', ...choice, tokens: 1_050_000, maxOutputTokens: 128_000 };
}
export function enabledModelChoices(choices?: ConversationModelChoice[]) {
  return choices ?? supportedConversationChoices;
}
export function requireEnabledChoice(
  choice: ConversationModelChoice,
  enabled?: ConversationModelChoice[],
) {
  if (!enabledModelChoices(enabled).some((entry) => sameModelChoice(entry, choice)))
    throw new MapError('assistant_model_unsupported', 409);
}
/** Reading an old conversation never writes the user's latest explicit choice. */
export function personalModelChoice(database: Database.Database, userId: string) {
  return {
    read(): ConversationModelChoice {
      return (
        (database
          .prepare('SELECT model, effort FROM conversation_model_preferences WHERE userId = ?')
          .get(userId) as ConversationModelChoice | undefined) ?? {
          ...defaultConversationModelChoice,
        }
      );
    },
    write(choice: ConversationModelChoice) {
      database
        .prepare(
          'INSERT INTO conversation_model_preferences (userId, model, effort) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET model = excluded.model, effort = excluded.effort',
        )
        .run(userId, choice.model, choice.effort);
    },
  };
}
