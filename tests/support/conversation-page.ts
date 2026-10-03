import { expect, type Locator, type Page } from '@playwright/test';
import { utilityButton } from './client.js';
import {
  consentBoxControls,
  consentBoxName,
  conversationSteps,
  conversationTools,
  voiceBoxName,
} from './conversation.js';

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
    expanded: async (control) => (await control.getAttribute('aria-expanded')) === 'true',
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
export const closeConversationText = (page: Page) => steps(page).closeConversationText();
export const chooseConversationText = (page: Page) => steps(page).chooseConversationText();
export const chooseConversationVoice = (page: Page) => steps(page).chooseConversationVoice();

/** Opens the current whole draft beside the conversation text. */
export async function openConversationDraft(page: Page) {
  await openConversationText(page);
  const view = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
  const show = view.getByRole('button', { name: /^Visa utkastet/ });
  if (await show.isVisible()) await show.click();
  const draft = view.getByRole('region', { name: 'Utkastet', exact: true });
  await expect(draft).toBeVisible();
  return draft;
}

/** Receipts belong to the existing draft and history work panel. */
export async function openConversationReceipts(page: Page) {
  const receipts = page.getByRole('region', { name: 'Mina sparförsök', exact: true });
  if (!(await receipts.isVisible()))
    await (await utilityButton(page, 'Utkast och historik')).click();
  const summary = receipts.getByText('Tidigare sparförsök', { exact: true });
  if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
  await expect(receipts).toBeVisible();
  return receipts;
}

/** The voice box, which follows the voice wherever the map's tools are shown. */
export const voiceBox = (page: Page) =>
  page.getByRole('group', { name: voiceBoxName, exact: true });
/** The toolbar's microphone. It is pressed while the microphone is on. */
export const microphoneButton = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Kartans verktyg' })
    .getByRole('button', { name: conversationTools.voice, exact: true });
/** What a screen reader is told about the voice. */
export const voiceAnnouncement = (page: Page) => page.locator('.voice-announcement');

/** Turns the microphone on in a conversation with a valid consent, until Skyttel listens. */
export async function turnMicrophoneOn(page: Page) {
  await chooseConversationVoice(page);
  await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(voiceBox(page)).toBeVisible();
}
/** Turns capture off while retaining the connection for Skyttel’s delayed answer. */
export async function turnMicrophoneOff(page: Page) {
  await chooseConversationVoice(page);
  await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(microphoneButton(page)).toBeEnabled();
}
