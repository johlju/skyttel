// The steps that start and open a conversation with Skyttel. This is the only
// place that knows which controls the product offers for them. Each test
// environment binds the steps to its own way of finding and using controls:
// conversation-page.ts (Playwright), conversation-browser.ts (Vitest browser
// mode) and conversation-dom.ts (Testing Library).

import { conversationConsentTextVersion } from '../../src/shared/conversation-consent.js';

// What a client sends to start a conversation that its user has approved for
// the visit, for tests that start one without the visible interface.
export const approvedForVisit = { consent: { textVersion: conversationConsentTextVersion } };

// The toolbar's two conversation buttons. The chosen one decides whether the
// conversation starts with voice or with text. The text button then opens and
// closes the text view.
export const conversationTools = {
  voice: 'Prata med Skyttel',
  text: 'Skriv till Skyttel',
} as const;

export const textViewButtonAccessibleName =
  /^Skriv till Skyttel(?:\. Skyttel (?:arbetar|har svarat|väntar på ditt svar)\.)?$/;

export const consentBoxName = 'Samtal med Skyttel';

// The voice box, which shows what the voice does while no panel is open.
export const voiceBoxName = 'Röstruta';

// The consent text, version 2, including the clarified held-speech rule: three
// paragraphs. Tests compare what the product shows with this copy.
export const specifiedConsentText = [
  'Med ditt medgivande behandlar OpenAI ljud som spelas in medan din mikrofon är på, det du skriver, hela ditt utkast och de uppgifter i hushållets karta som behövs. Vid långt tryck kan tal från starten vänta i webbläsaren och skickas efter att du släppt knappen. Släpp stänger av ny inspelning direkt. Skyttel föreslår ändringar i ditt utkast och sparar dem först när du ber om det. Skyttel sparar inte samtalet.',
  'Skyttel kan höra och förstå fel. Kartan visar vad som har ändrats och sparats.',
  'Säg eller skriv inga lösenord, koder eller fullständiga konto- och kortnummer.',
];

export interface ConsentBoxLookup<Control> {
  /** A checkbox in the consent box. */
  checkbox(name: string): Control;
  /** A button in the consent box. */
  button(name: string): Control;
}

export interface ConversationControls<Control> extends ConsentBoxLookup<Control> {
  /** A button in the toolbar. */
  tool(name: string): Control | Promise<Control>;
  /** Waits for the consent box, where a lookup does not wait by itself. */
  asked?(): Promise<unknown>;
  /** Whether a toolbar button says that what it opens is open. */
  expanded(control: Control): boolean | Promise<boolean>;
  tick(control: Control): Promise<unknown>;
  press(control: Control): Promise<unknown>;
}

// For tests about the consent box itself, such as what it offers and where focus goes.
export function consentBoxControls<Control>(ui: ConsentBoxLookup<Control>) {
  return {
    remember: ui.checkbox('Fråga inte igen för det här hushållet'),
    approve: ui.button('Godkänn och starta'),
    decline: ui.button('Avbryt'),
  };
}

export function conversationSteps<Control>(ui: ConversationControls<Control>) {
  const choose = async (mode: keyof typeof conversationTools) =>
    ui.press(await ui.tool(conversationTools[mode]));
  // Approves in the consent box. A remembered consent is saved for the household.
  async function giveConversationConsent({ remember = false } = {}) {
    await ui.asked?.();
    const box = consentBoxControls(ui);
    if (remember) await ui.tick(box.remember);
    await ui.press(box.approve);
  }
  return {
    giveConversationConsent,
    // The first start of a visit without a saved consent: the chosen button,
    // then the consent box.
    async startConversationWithText(consent?: { remember?: boolean }) {
      await choose('text');
      await giveConversationConsent(consent);
    },
    async startConversationWithVoice(consent?: { remember?: boolean }) {
      await choose('voice');
      await giveConversationConsent(consent);
    },
    // The toolbar's buttons alone. They show the consent box when no consent is
    // valid. Otherwise the text button starts the conversation or shows the one
    // that is going on, and the voice button starts the voice, cancels its start
    // or turns the microphone on or off.
    chooseConversationText: () => choose('text'),
    chooseConversationVoice: () => choose('voice'),
    // The text view, open or closed whatever it was before.
    async openConversationText() {
      const tool = await ui.tool(conversationTools.text);
      if (!(await ui.expanded(tool))) await ui.press(tool);
    },
    async closeConversationText() {
      const tool = await ui.tool(conversationTools.text);
      if (await ui.expanded(tool)) await ui.press(tool);
    },
  };
}
