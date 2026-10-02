import type { Locator, Page } from '@playwright/test';
import { utilityButton } from './client.js';
import {
  conversationStartControls,
  conversationStartSteps,
  conversationTextSteps,
  type StartControls,
} from './conversation.js';

// The conversation steps for Playwright. A scope is the page, or the region a
// test expects the start to be offered in.
type Scope = Page | Locator;

const controls = (scope: Scope): StartControls<Locator> => ({
  labelled: (label) => scope.getByLabel(label),
  button: (name) => scope.getByRole('button', { name, exact: true }),
  tick: (control) => control.check(),
  press: (control) => control.click(),
});
const steps = (scope: Scope) => conversationStartSteps(controls(scope));

export const conversationStart = (scope: Scope) => conversationStartControls(controls(scope));
export const giveConversationConsent = (scope: Scope) => steps(scope).giveConversationConsent();
export const startConversationWithText = (scope: Scope) => steps(scope).startConversationWithText();
export const startConversationWithVoice = (scope: Scope) =>
  steps(scope).startConversationWithVoice();

export const openConversationText = (page: Page) =>
  conversationTextSteps<Locator>({
    tool: (name) => utilityButton(page, name),
    press: (control) => control.click(),
  }).openConversationText();
