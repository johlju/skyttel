export interface ConversationPreferences {
  showDraftOnStart: boolean;
  textWidth: number;
  draftWidth: number;
}

export const defaultConversationPreferences: ConversationPreferences = {
  showDraftOnStart: false,
  textWidth: 400,
  draftWidth: 340,
};

/** Screen limits affect presentation only; never save a clamp during a resize. */
export function conversationWidths(
  preferences: Pick<ConversationPreferences, 'textWidth' | 'draftWidth'>,
  screenWidth: number,
  draftOpen: boolean,
) {
  const available = Math.max(560, screenWidth - 100);
  const textWidth = Math.min(preferences.textWidth, available - (draftOpen ? 260 : 0));
  const draftWidth = Math.min(preferences.draftWidth, available - textWidth);
  return { textWidth, draftWidth: draftOpen ? draftWidth : preferences.draftWidth, available };
}
