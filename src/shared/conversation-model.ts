export const conversationModels = [
  { id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra' },
  { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol' },
] as const;
export const reasoningEfforts = ['low', 'medium', 'high'] as const;
export const reasoningLabels = { low: 'Låg', medium: 'Medium', high: 'Hög' } as const;
export type ConversationModelChoice = {
  model: (typeof conversationModels)[number]['id'];
  effort: (typeof reasoningEfforts)[number];
};
export const defaultConversationModelChoice: ConversationModelChoice = {
  model: 'gpt-6.1-terra',
  effort: 'high',
};
export const supportedConversationChoices: ConversationModelChoice[] = conversationModels.flatMap(
  ({ id: model }) => reasoningEfforts.map((effort) => ({ model, effort })),
);
export function sameModelChoice(a: ConversationModelChoice, b: ConversationModelChoice) {
  return a.model === b.model && a.effort === b.effort;
}
