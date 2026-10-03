import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi } from 'vitest';
import {
  consentBoxControls,
  consentBoxName,
  conversationSteps,
  textViewButtonAccessibleName,
} from './conversation.js';

// The conversation steps for Testing Library in jsdom.

interface ConsentBox {
  remember: HTMLInputElement;
  approve: HTMLButtonElement;
  decline: HTMLButtonElement;
}

// Fake timers stall userEvent and waitFor, so a test that uses them acts on the
// controls directly, once they are already shown.
const click = (control: HTMLElement) =>
  vi.isFakeTimers()
    ? act(async () => {
        fireEvent.click(control);
      })
    : userEvent.click(control);
const shown = <Control>(get: () => Control) =>
  vi.isFakeTimers() ? Promise.resolve(get()) : waitFor(get);

// The consent box, named as Testing Library names its queries: get throws when
// the box is not shown, query gives null, and find waits for the box.
export const getConsentBox = () => screen.getByRole('dialog', { name: consentBoxName });
export const queryConsentBox = () => screen.queryByRole('dialog', { name: consentBoxName });
export const findConsentBox = () => shown(getConsentBox);

const lookup = {
  checkbox: (name: string) => within(getConsentBox()).getByRole('checkbox', { name }),
  button: (name: string) => within(getConsentBox()).getByRole('button', { name }),
};
export const getConsentBoxControls = () => consentBoxControls(lookup) as ConsentBox;

export const {
  giveConversationConsent,
  startConversationWithText,
  startConversationWithVoice,
  openConversationText,
  closeConversationText,
  chooseConversationText,
  chooseConversationVoice,
} = conversationSteps<HTMLElement>({
  ...lookup,
  tool: (name) =>
    shown(() =>
      screen.getByRole('button', {
        name: name === 'Skriv till Skyttel' ? textViewButtonAccessibleName : name,
      }),
    ),
  asked: findConsentBox,
  expanded: (control) => control.getAttribute('aria-expanded') === 'true',
  tick: click,
  press: click,
});
