import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { specifiedConsentText } from '../../support/conversation.js';
import {
  chooseConversationVoice,
  findConsentBox,
  getConsentBoxControls,
  giveConversationConsent,
  openConversationText,
  queryConsentBox,
} from '../../support/conversation-dom.js';
import { StandaloneConversation } from '../../support/conversation-harness.js';

const path = '/api/households/linden/text-assistant';
const consentPath = '/api/households/linden/conversation-consent';
const session: TextAssistantView = {
  id: 'session',
  revision: 0,
  phase: 'ready',
  operations: [],
  review: {
    version: 0,
    contentVersion: 1,
    changes: [],
    readyToSave: false,
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Answers as the server does and records what the client sends. */
function show({ failedSaves = 0 } = {}) {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST')
      return Response.json(
        url === path ? { available: true } : url === consentPath ? { saved: null } : session,
      );
    posts.push({ url, body: JSON.parse(String(init.body)) });
    if (url === consentPath)
      return failedSaves-- > 0
        ? Response.json({ error: 'internal_error' }, { status: 500 })
        : Response.json({ saved: { textVersion: 1, savedAt: '2026-10-01T08:00:00.000Z' } });
    return Response.json(session);
  });
  render(
    <StandaloneConversation
      householdId="linden"
      onMapChange={vi.fn()}
      onAccessLost={vi.fn()}
      onSelectItem={async () => false}
    />,
  );
  return posts;
}
const messageField = () => screen.queryByLabelText('Meddelande till textassistenten');

test('the consent box states the consent text word for word and offers to remember, approve or cancel', async () => {
  const posts = show();
  await chooseConversationVoice();
  const box = await findConsentBox();
  expect(box.tagName).toBe('DIALOG');
  expect((box as HTMLDialogElement).open).toBe(true);
  const heading = within(box).getByRole('heading', { level: 2, name: 'Samtal med Skyttel' });
  expect(document.activeElement).toBe(heading);

  const text = document.getElementById(box.getAttribute('aria-describedby') ?? '');
  expect([...(text?.children ?? [])].map((paragraph) => paragraph.tagName)).toEqual([
    'P',
    'P',
    'P',
  ]);
  expect([...(text?.children ?? [])].map((paragraph) => paragraph.textContent)).toEqual(
    specifiedConsentText,
  );

  const { remember, approve, decline } = getConsentBoxControls();
  expect(remember.checked).toBe(false);
  expect(
    document.getElementById(remember.getAttribute('aria-describedby') ?? '')?.textContent,
  ).toBe('Du kan återkalla det i Inställningar.');
  expect(within(box).queryByRole('link')).toBeNull();
  expect(box.textContent).not.toContain('Information och hjälp');
  expect(within(box).getAllByRole('button')).toEqual([approve, decline]);
  expect(within(box).getAllByRole('checkbox')).toEqual([remember]);
  expect(posts).toEqual([]);
});

test('Avbryt and Escape start nothing and leave the focus on the chosen button', async () => {
  const posts = show();
  await chooseConversationVoice();
  await findConsentBox();
  await userEvent.click(getConsentBoxControls().decline);
  expect(queryConsentBox()).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Prata med Skyttel' }));

  await openConversationText();
  // The browser reports Escape in a modal dialog as a cancel event.
  fireEvent(await findConsentBox(), new Event('cancel', { cancelable: true }));
  expect(queryConsentBox()).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Samtal och text' }));
  expect(messageField()).toBeNull();
  expect(posts).toEqual([]);

  // The box is asked for again, with the choice to remember unmarked as at first.
  await openConversationText();
  await findConsentBox();
  await userEvent.click(getConsentBoxControls().remember);
  await userEvent.click(getConsentBoxControls().decline);
  await openConversationText();
  await findConsentBox();
  expect(getConsentBoxControls().remember.checked).toBe(false);
});

test.each([
  ['Prata med Skyttel', chooseConversationVoice, true],
  ['Samtal och text', openConversationText, false],
] as const)(
  'Godkänn och starta after %s starts the conversation that button stands for',
  async (_button, choose, withVoice) => {
    const posts = show();
    await choose();
    await giveConversationConsent();
    await waitFor(() => expect(messageField()).not.toBeNull());
    expect(queryConsentBox()).toBeNull();
    // Approved for the visit: nothing is saved, and the start states the consent.
    expect(posts).toEqual([{ url: path, body: { consent: { textVersion: 1 } } }]);
    // jsdom has no microphone, so a start with voice says that the voice is not supported.
    if (withVoice) expect((await screen.findByRole('alert')).textContent).toContain('röst');
    else expect(screen.queryByRole('alert')).toBeNull();
  },
);

test('a remembered consent is saved before the start, and a save that fails is told in the box', async () => {
  const posts = show({ failedSaves: 1 });
  await openConversationText();
  await giveConversationConsent({ remember: true });
  const box = await findConsentBox();
  expect((await within(box).findByRole('alert')).textContent).toBe(
    'Medgivandet kunde inte sparas. Försök igen.',
  );
  expect(getConsentBoxControls().remember.checked).toBe(true);
  expect(messageField()).toBeNull();
  expect(posts).toEqual([{ url: consentPath, body: { textVersion: 1 } }]);

  await userEvent.click(getConsentBoxControls().approve);
  await waitFor(() => expect(messageField()).not.toBeNull());
  expect(queryConsentBox()).toBeNull();
  expect(posts).toEqual([
    { url: consentPath, body: { textVersion: 1 } },
    { url: consentPath, body: { textVersion: 1 } },
    { url: path, body: {} },
  ]);
});

test('a consent that is being saved can be neither approved again nor cancelled', async () => {
  let answer: ((response: Response) => void) | undefined;
  show();
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
    url === consentPath && init?.method === 'POST'
      ? new Promise<Response>((resolve) => {
          answer = resolve;
        })
      : respond(url, init),
  );
  await openConversationText();
  await giveConversationConsent({ remember: true });
  await waitFor(() => expect(getConsentBoxControls().approve.disabled).toBe(true));
  expect(getConsentBoxControls().decline.disabled).toBe(true);
  // Escape does not withdraw a consent that is already on its way to the server.
  fireEvent(await findConsentBox(), new Event('cancel', { cancelable: true }));
  expect(queryConsentBox()).not.toBeNull();
  answer?.(Response.json({ saved: { textVersion: 1, savedAt: '2026-10-01T08:00:00.000Z' } }));
  await waitFor(() => expect(messageField()).not.toBeNull());
});
