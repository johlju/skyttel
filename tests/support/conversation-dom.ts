import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { vi } from 'vitest';
import { conversationStartControls, conversationStartSteps } from './conversation.js';

// The conversation steps for Testing Library in jsdom.

interface Start {
  consents: HTMLInputElement[];
  withText: HTMLButtonElement;
  withVoice: HTMLButtonElement;
}

// Fake timers stall userEvent and waitFor, so a test that uses them acts on the
// controls directly, once the start is already shown.
const click = (control: HTMLElement) =>
  vi.isFakeTimers()
    ? act(async () => {
        fireEvent.click(control);
      })
    : userEvent.click(control);

const shown = {
  labelled: (label: RegExp) => screen.getByLabelText(label),
  button: (name: string) => screen.getByRole('button', { name }),
};
const steps = conversationStartSteps<HTMLElement>({ ...shown, tick: click, press: click });

// The start's controls, named as Testing Library names its queries: get throws
// when the start is not shown, query gives null for each missing control, and
// find waits for the start.
export const getConversationStart = () => conversationStartControls(shown) as Start;

export const queryConversationStart = () =>
  conversationStartControls({
    labelled: (label) => screen.queryByLabelText(label),
    button: (name) => screen.queryByRole('button', { name }),
  });

export const findConversationStart = () =>
  vi.isFakeTimers() ? Promise.resolve(getConversationStart()) : waitFor(getConversationStart);

export async function startConversationWithText() {
  await findConversationStart();
  await steps.startConversationWithText();
}

export async function startConversationWithVoice() {
  await findConversationStart();
  await steps.startConversationWithVoice();
}
