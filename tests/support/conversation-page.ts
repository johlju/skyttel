import { expect, type Locator, type Page } from '@playwright/test';
import type { SaveReceipt } from '../../src/shared/map.js';
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
    startText: () => viewStart(page),
    started: () =>
      expect(page.getByRole('region', { name: 'Arbetsyta', exact: true })).toHaveAttribute(
        'data-session-active',
        'true',
      ),
    tool: (name) => utilityButton(page, name),
    expanded: async (control) => (await control.getAttribute('aria-expanded')) === 'true',
    tick: (control) => control.check(),
    press: (control) => control.click(),
  });
const viewStart = (page: Page) =>
  page
    .getByRole('region', { name: 'Skriv till Skyttel', exact: true })
    .getByRole('button', { name: 'Nytt samtal', exact: true });

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

export async function selectConversation(page: Page, title: string | RegExp) {
  const view = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
  if (!(await view.isVisible())) await openConversationText(page);
  const toggle = view.getByRole('button', { name: 'Samtal', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const row = view
    .getByRole('region', { name: 'Samtal', exact: true })
    .getByRole('button', { name: title, exact: true });
  await expect(row).toBeEnabled();
  await row.focus();
  await row.press('Enter');
}

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

/** Read actual completed household saves without starting a conversation. */
export async function openSavedHistory(page: Page) {
  await (await utilityButton(page, 'Rapporter')).click();
  const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
  await expect(history).toBeVisible();
  await expect(history).not.toContainText('Hämtar historik…');
  return history;
}

/** Read the visible actor, time and identity of an original committed save. */
export async function readCommittedHistoryCard(history: Locator, receipt: SaveReceipt) {
  if (!receipt.actorName) throw new Error('The original receipt must identify its actor');
  const card = history.locator(
    `article[data-save="${receipt.operationId}"][data-saved-by="${receipt.userId}"]`,
  );
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { level: 3 })).toContainText(receipt.actorName);
  await expect(card.locator('time')).toBeVisible();
  await expect(card.locator('time')).toHaveAttribute('datetime', receipt.savedAt);
  await expect(card.locator('time')).not.toHaveText('');
  const identity = card.getByText('Identifiera sparandet och användaren', { exact: true });
  if ((await identity.locator('..').getAttribute('open')) === null) await identity.click();
  await expect(card.getByText(`Sparande: ${receipt.operationId}`, { exact: true })).toBeVisible();
  await expect(
    card.getByText(`Skyttel-användare: ${receipt.userId}.`, { exact: true }),
  ).toBeVisible();
  await expect(card.getByText(`Tidpunkt: ${receipt.savedAt}`, { exact: true })).toBeVisible();
  return card;
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
export const voiceAnnouncement = (page: Page) =>
  page.locator('.voice-announcement:not(.voice-context-announcement)');

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
