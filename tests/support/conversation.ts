// The steps that start and open a conversation with Skyttel. This is the only
// place that knows which controls the product offers for them. Each test
// environment binds the steps to its own way of finding and using controls:
// conversation-page.ts (Playwright), conversation-browser.ts (Vitest browser
// mode) and conversation-dom.ts (Testing Library).

export interface StartLookup<Control> {
  labelled(label: RegExp): Control;
  button(name: string): Control;
}

export interface StartControls<Control> extends StartLookup<Control> {
  tick(control: Control): Promise<unknown>;
  press(control: Control): Promise<unknown>;
}

export interface ToolbarControls<Control> {
  tool(name: string): Control | Promise<Control>;
  press(control: Control): Promise<unknown>;
}

// For tests about the start itself, such as what it requires before consent.
export function conversationStartControls<Control>(ui: StartLookup<Control>) {
  return {
    consents: [
      ui.labelled(/Jag tillåter att OpenAI/),
      ui.labelled(/Jag tillåter förslag och sparande/),
    ],
    withText: ui.button('Starta textassistenten'),
    withVoice: ui.button('Starta talsamtal'),
  };
}

export function conversationStartSteps<Control>(ui: StartControls<Control>) {
  async function giveConversationConsent() {
    for (const consent of conversationStartControls(ui).consents) await ui.tick(consent);
  }
  return {
    giveConversationConsent,
    async startConversationWithText() {
      await giveConversationConsent();
      await ui.press(conversationStartControls(ui).withText);
    },
    async startConversationWithVoice() {
      await giveConversationConsent();
      await ui.press(conversationStartControls(ui).withVoice);
    },
  };
}

export function conversationTextSteps<Control>(ui: ToolbarControls<Control>) {
  return {
    async openConversationText() {
      await ui.press(await ui.tool('Samtal och text'));
    },
  };
}
