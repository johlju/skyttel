import type { Locator, Page } from '@playwright/test';
import { utilityButton } from './client.js';
import { consentBoxControls, consentBoxName, conversationSteps } from './conversation.js';

// The conversation steps for Playwright.

/** The consent box, a dialog over the household's map. */
export const consentBox = (page: Page) =>
  page.getByRole('dialog', { name: consentBoxName, exact: true });

const lookup = (page: Page) => ({
  checkbox: (name: string) => consentBox(page).getByRole('checkbox', { name, exact: true }),
  button: (name: string) => consentBox(page).getByRole('button', { name, exact: true }),
});
const steps = (page: Page) =>
  conversationSteps<Locator>({
    ...lookup(page),
    tool: (name) => utilityButton(page, name),
    tick: (control) => control.check(),
    press: (control) => control.click(),
  });

export const consentBoxFor = (page: Page) => consentBoxControls(lookup(page));
export const giveConversationConsent = (page: Page, consent?: { remember?: boolean }) =>
  steps(page).giveConversationConsent(consent);
export const startConversationWithText = (page: Page, consent?: { remember?: boolean }) =>
  steps(page).startConversationWithText(consent);
export const startConversationWithVoice = (page: Page, consent?: { remember?: boolean }) =>
  steps(page).startConversationWithVoice(consent);
export const openConversationText = (page: Page) => steps(page).openConversationText();
export const chooseConversationVoice = (page: Page) => steps(page).chooseConversationVoice();
