import { type Locator, page } from 'vitest/browser';
import { consentBoxName, conversationSteps } from './conversation.js';

// The conversation steps for Vitest browser mode.
const consentBox = () => page.getByRole('dialog', { name: consentBoxName, exact: true });

export const { startConversationWithText, openConversationText } = conversationSteps<Locator>({
  checkbox: (name) => consentBox().getByRole('checkbox', { name, exact: true }),
  button: (name) => consentBox().getByRole('button', { name, exact: true }),
  tool: (name) =>
    page.getByRole('navigation', { name: 'Kartans verktyg' }).getByRole('button', {
      name,
      exact: true,
    }),
  tick: (control) => control.click(),
  press: (control) => control.click(),
});
