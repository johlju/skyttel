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
// conversation starts with voice or with text.
export const conversationTools = { voice: 'Prata med Skyttel', text: 'Samtal och text' } as const;

export const consentBoxName = 'Samtal med Skyttel';

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
    // valid. Otherwise they start the conversation or show the one that is going on.
    openConversationText: () => choose('text'),
    chooseConversationVoice: () => choose('voice'),
  };
}
