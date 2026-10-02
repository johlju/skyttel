import { type Locator, page } from 'vitest/browser';
import { conversationStartSteps, conversationTextSteps } from './conversation.js';

// The conversation steps for Vitest browser mode.
export const { startConversationWithText } = conversationStartSteps<Locator>({
  labelled: (label) => page.getByLabelText(label),
  button: (name) => page.getByRole('button', { name, exact: true }),
  tick: (control) => control.click(),
  press: (control) => control.click(),
});

export const { openConversationText } = conversationTextSteps<Locator>({
  tool: (name) =>
    page.getByRole('navigation', { name: 'Kartans verktyg' }).getByRole('button', {
      name,
      exact: true,
    }),
  press: (control) => control.click(),
});
