import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  type ConversationModelChoice,
  conversationModels,
  defaultConversationModelChoice,
  reasoningEfforts,
  sameModelChoice,
  solModelId,
  supportedConversationChoices,
} from '../shared/conversation-model.js';
import { MapError } from './map-error.js';
import type { TextModelProfile } from './text-assistant-model.js';

/** Installation settings and retained choices can contain either Sol version. */
function isSolModel(id: unknown) {
  return typeof id === 'string' && /^gpt-6\.[12]-sol$/.test(id);
}

export function currentModelChoice(choice: ConversationModelChoice): ConversationModelChoice {
  return isSolModel(choice.model) ? { ...choice, model: solModelId } : choice;
}

export const modelChoiceSchema = z
  .object({
    model: z.preprocess(
      (id) => (isSolModel(id) ? solModelId : id),
      z.enum(conversationModels.map(({ id }) => id)),
    ),
    effort: z.enum(reasoningEfforts),
  })
  .strict();

/** Profiles checked against the official model pages in November 2026. */
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
      const choice = database
        .prepare<[string], ConversationModelChoice>(
          'SELECT model, effort FROM conversation_model_preferences WHERE userId = ?',
        )
        .get(userId);
      return currentModelChoice(choice ?? defaultConversationModelChoice);
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
