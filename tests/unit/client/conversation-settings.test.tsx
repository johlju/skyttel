import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { ConversationConsent } from '../../../src/client/ConversationConsent.js';
import { ConversationSettings } from '../../../src/client/ConversationSettings.js';
import { conversationOngoing, useConversation } from '../../../src/client/use-conversation.js';
import type { SavedConversationConsent } from '../../../src/shared/conversation-consent.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { specifiedConsentText } from '../../support/conversation.js';
import { giveConversationConsent, queryConsentBox } from '../../support/conversation-dom.js';

const path = '/api/households/linden/text-assistant';
const consentPath = '/api/households/linden/conversation-consent';
const revokePath = `${consentPath}/revoke`;
const savedConsent = { textVersion: 2, savedAt: '2026-10-01T08:00:00.000Z' };
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

/**
 * The page next to what the map offers for a conversation: a button that
 * starts one, the consent box, and whether a conversation goes on.
 */
function Page({ onAccessLost }: { onAccessLost: () => void }) {
  const chosen = useRef<HTMLElement | null>(null);
  const [textViewOpen, setTextViewOpen] = useState(false);
  const conversation = useConversation({
    householdId: 'linden',
    onStarted: () => setTextViewOpen(true),
    onEnded: () => setTextViewOpen(false),
    onMapChange: () => undefined,
    onAccessLost,
    onSelectItem: async () => false,
  });
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          chosen.current = event.currentTarget;
          conversation.begin('text');
        }}
      >
        Starta samtalet
      </button>
      <button type="button" onClick={() => setTextViewOpen(false)}>
        Stäng textvyn
      </button>
      <ConversationConsent conversation={conversation} chosen={chosen} />
      <p>{conversation.session && textViewOpen ? 'Samtalet pågår' : 'Inget samtal pågår'}</p>
      <label>
        Oskickad text
        <input
          value={conversation.text}
          onChange={(event) => conversation.setText(event.target.value)}
        />
      </label>
      <ConversationSettings
        conversation={conversation}
        householdName="Familjen Berg"
        ongoing={conversationOngoing(conversation, textViewOpen)}
      />
    </>
  );
}

/** Answers as the server does, keeps the saved consent, and records what the client sends. */
function show({
  saved = null as SavedConversationConsent | null,
  available = true,
  failures = [] as number[],
  saving = false,
} = {}) {
  const server = { saved, failures, sessionStatus: 200 };
  const posts: { url: string; body: unknown }[] = [];
  const accessLost = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') {
      if (url === path) return Response.json({ available });
      if (url === consentPath) return Response.json({ saved: server.saved });
      return server.sessionStatus === 200
        ? Response.json({ ...session, saving })
        : Response.json({ error: 'conversation_consent_revoked' }, { status: 403 });
    }
    posts.push({ url, body: JSON.parse(String(init.body)) });
    if (url === consentPath || url === revokePath) {
      const failure = server.failures.shift();
      if (failure) return Response.json({ error: 'request_failed' }, { status: failure });
      server.saved = url === consentPath ? savedConsent : null;
      return Response.json({ saved: server.saved });
    }
    return Response.json({ ...session, saving });
  });
  render(<Page onAccessLost={accessLost} />);
  return { posts, server, accessLost };
}
const part = () => screen.getByRole('region', { name: 'Medgivande' });
const button = (name: string) => within(part()).getByRole('button', { name });
const buttons = () =>
  within(part())
    .queryAllByRole('button')
    .map((control) => control.textContent);
const feedback = () => within(part()).getByRole('status').textContent;
const status = (text: string) => within(part()).findByText(text);
const texts = () =>
  within(part())
    .getAllByRole('paragraph')
    .map((paragraph) => paragraph.textContent);

test('Medgivande states the consent text from the source of the consent box, whom it applies to and that nothing is saved', async () => {
  const { posts } = show();
  await status('Inget medgivande är sparat.');
  expect(within(part()).getByRole('heading', { level: 2 }).textContent).toBe('Medgivande');
  expect(texts()).toEqual([
    'Gäller dig i hushållet Familjen Berg.',
    ...specifiedConsentText,
    'Ett sparat medgivande gäller alla dina samtal i hushållet Familjen Berg tills du återkallar det.',
    'Inget medgivande är sparat.',
  ]);
  expect(buttons()).toEqual(['Spara medgivandet']);
  // The page has no save button of its own, and nothing is said before the user acts.
  expect(screen.queryByRole('button', { name: 'Spara' })).toBeNull();
  expect(feedback()).toBe('');
  expect(posts).toEqual([]);
});

test('Spara medgivandet saves at once without starting a conversation, and the next start does not ask', async () => {
  const { posts } = show();
  await status('Inget medgivande är sparat.');
  const pressed = button('Spara medgivandet');
  await userEvent.click(pressed);

  await status('Sparat den 1 oktober 2026.');
  expect(feedback()).toBe('Medgivandet är sparat');
  // The focus stays on the pressed button, which has changed its name.
  expect(buttons()).toEqual(['Återkalla medgivandet']);
  expect(button('Återkalla medgivandet')).toBe(pressed);
  expect(document.activeElement).toBe(pressed);
  expect(posts).toEqual([{ url: consentPath, body: { textVersion: 2 } }]);
  expect(screen.getByText('Inget samtal pågår')).toBeDefined();

  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await screen.findByText('Samtalet pågår');
  expect(queryConsentBox()).toBeNull();
  expect(posts.at(-1)).toEqual({ url: path, body: {} });
});

test('Återkalla medgivandet revokes a saved consent at once, and the next start asks again', async () => {
  const { posts } = show({ saved: savedConsent });
  await status('Sparat den 1 oktober 2026.');
  expect(buttons()).toEqual(['Återkalla medgivandet']);
  const pressed = button('Återkalla medgivandet');
  await userEvent.click(pressed);

  await status('Inget medgivande är sparat.');
  expect(feedback()).toBe('Medgivandet är återkallat');
  expect(buttons()).toEqual(['Spara medgivandet']);
  expect(button('Spara medgivandet')).toBe(pressed);
  expect(document.activeElement).toBe(pressed);
  expect(posts).toEqual([{ url: revokePath, body: {} }]);

  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await waitFor(() => expect(queryConsentBox()).not.toBeNull());
  expect(posts).toEqual([{ url: revokePath, body: {} }]);
});

test('a consent for the visit is revoked at once without a conversation, and the next start asks again', async () => {
  const { posts } = show();
  await status('Inget medgivande är sparat.');
  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await giveConversationConsent();
  await screen.findByText('Samtalet pågår');
  await userEvent.click(screen.getByRole('button', { name: 'Stäng textvyn' }));
  await screen.findByText('Inget samtal pågår');
  await status('Du har godkänt för det här besöket. Inget medgivande är sparat.');
  expect(buttons()).toEqual(['Spara medgivandet', 'Återkalla medgivandet']);

  await userEvent.click(button('Återkalla medgivandet'));
  await status('Inget medgivande är sparat.');
  expect(feedback()).toBe('Medgivandet är återkallat');
  // The pressed button is no longer shown, so the focus goes to the one that is.
  expect(buttons()).toEqual(['Spara medgivandet']);
  expect(document.activeElement).toBe(button('Spara medgivandet'));
  expect(posts.at(-1)).toEqual({ url: revokePath, body: {} });

  const starts = posts.filter(({ url }) => url === path).length;
  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await waitFor(() => expect(queryConsentBox()).not.toBeNull());
  expect(posts.filter(({ url }) => url === path)).toHaveLength(starts);
});

test('saving a consent for the visit leaves the conversation that goes on as it is', async () => {
  const { posts } = show();
  await status('Inget medgivande är sparat.');
  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await giveConversationConsent();
  await screen.findByText('Samtalet pågår');
  await userEvent.type(screen.getByLabelText('Oskickad text'), 'Lägg till en cykel');
  const before = posts.length;

  const pressed = button('Spara medgivandet');
  await userEvent.click(pressed);
  await status('Sparat den 1 oktober 2026.');
  expect(feedback()).toBe('Medgivandet är sparat');
  expect(buttons()).toEqual(['Återkalla medgivandet']);
  expect(document.activeElement).toBe(pressed);
  expect(screen.getByText('Samtalet pågår')).toBeDefined();
  expect((screen.getByLabelText('Oskickad text') as HTMLInputElement).value).toBe(
    'Lägg till en cykel',
  );
  // The only request is the save: nothing is started, stopped or sent.
  expect(posts.slice(before)).toEqual([{ url: consentPath, body: { textVersion: 2 } }]);
});

test('revoking while a conversation goes on ends it and keeps the unsent text', async () => {
  const { posts } = show({ saved: savedConsent });
  await status('Sparat den 1 oktober 2026.');
  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await screen.findByText('Samtalet pågår');
  await userEvent.type(screen.getByLabelText('Oskickad text'), 'Lägg till en cykel');

  await userEvent.click(button('Återkalla medgivandet'));
  const confirmation = screen.getByRole('dialog', { name: 'Återkalla medgivandet' });
  expect(confirmation.textContent).toContain('Utkastet med 0 osparade ändringar ligger kvar.');
  await userEvent.click(
    within(confirmation).getByRole('button', { name: 'Återkalla och avsluta samtalet' }),
  );
  await status('Inget medgivande är sparat.');
  expect(screen.getByText('Inget samtal pågår')).toBeDefined();
  expect((screen.getByLabelText('Oskickad text') as HTMLInputElement).value).toBe(
    'Lägg till en cykel',
  );
  expect(posts.at(-1)).toEqual({ url: revokePath, body: {} });
  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await waitFor(() => expect(queryConsentBox()).not.toBeNull());
});

test('revocation confirmation contains keyboard focus and cancelling preserves the conversation and unsent text', async () => {
  const { posts } = show({ saved: savedConsent });
  await status('Sparat den 1 oktober 2026.');
  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await screen.findByText('Samtalet pågår');
  await userEvent.type(screen.getByLabelText('Oskickad text'), 'Behåll min fråga.');
  const revoke = button('Återkalla medgivandet');
  await userEvent.click(revoke);
  const dialog = screen.getByRole('dialog', { name: 'Återkalla medgivandet' });
  const confirm = within(dialog).getByRole('button', { name: 'Återkalla och avsluta samtalet' });
  const cancel = within(dialog).getByRole('button', { name: 'Avbryt' });
  expect(document.activeElement).toBe(within(dialog).getByRole('heading'));
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(cancel);
  await userEvent.tab();
  expect(document.activeElement).toBe(confirm);
  await userEvent.tab({ shift: true });
  expect(document.activeElement).toBe(cancel);
  await userEvent.click(cancel);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(revoke);
  expect(screen.getByText('Samtalet pågår')).toBeDefined();
  expect((screen.getByLabelText('Oskickad text') as HTMLInputElement).value).toBe(
    'Behåll min fråga.',
  );
  expect(posts).toEqual([{ url: path, body: {} }]);
});

test('native dialog cancellation does not revoke consent or stop a registered save', async () => {
  const { posts } = show({ saved: savedConsent, saving: true });
  await status('Sparat den 1 oktober 2026.');
  await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
  await screen.findByText('Samtalet pågår');
  const revoke = button('Återkalla medgivandet');
  await userEvent.click(revoke);
  const dialog = screen.getByRole('dialog', { name: 'Återkalla medgivandet' });
  expect(dialog.textContent).toContain('Skyttel sparar ditt utkast. Sparandet slutförs.');
  expect(dialog.textContent).not.toContain('osparade ändringar');
  await userEvent.keyboard('{Escape}');
  fireEvent(dialog, new Event('cancel', { bubbles: false, cancelable: true }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(revoke);
  expect(posts).toEqual([{ url: path, body: {} }]);
  expect(screen.getByText('Samtalet pågår')).toBeDefined();
  expect(feedback()).toBe('');
});

test('a consent that is saved for another version of the consent text is told as changed and can be saved anew', async () => {
  show({ saved: { textVersion: 1, savedAt: '2026-09-01T08:00:00.000Z' } });
  await status('Medgivandetexten har ändrats. Inget medgivande är sparat.');
  expect(buttons()).toEqual(['Spara medgivandet']);
  await userEvent.click(button('Spara medgivandet'));
  await status('Sparat den 1 oktober 2026.');
  expect(buttons()).toEqual(['Återkalla medgivandet']);
});

test('a save that fails is told, and the control is as it was', async () => {
  const { posts, accessLost } = show({ failures: [500, 500] });
  await status('Inget medgivande är sparat.');
  const save = button('Spara medgivandet');
  await userEvent.click(save);
  await waitFor(() => expect(feedback()).toBe('Medgivandet kunde inte sparas. Försök igen.'));
  expect(texts()).toContain('Inget medgivande är sparat.');
  expect(buttons()).toEqual(['Spara medgivandet']);
  expect(document.activeElement).toBe(save);

  // The second attempt fails too, and the same text is given anew.
  await userEvent.click(save);
  await waitFor(() => expect(posts).toHaveLength(2));
  await waitFor(() => expect(feedback()).toBe('Medgivandet kunde inte sparas. Försök igen.'));
  await userEvent.click(save);
  await status('Sparat den 1 oktober 2026.');
  expect(feedback()).toBe('Medgivandet är sparat');
  expect(accessLost).not.toHaveBeenCalled();
});

test('a revocation that fails is told, and the control is as it was', async () => {
  const { posts, accessLost } = show({ saved: savedConsent, failures: [503] });
  await status('Sparat den 1 oktober 2026.');
  await userEvent.click(button('Återkalla medgivandet'));
  await waitFor(() => expect(feedback()).toBe('Medgivandet kunde inte återkallas. Försök igen.'));
  expect(texts()).toContain('Sparat den 1 oktober 2026.');
  expect(buttons()).toEqual(['Återkalla medgivandet']);
  expect(document.activeElement).toBe(button('Återkalla medgivandet'));
  expect(posts).toEqual([{ url: revokePath, body: {} }]);
  expect(accessLost).not.toHaveBeenCalled();
});

test('when the conversation is not available the page says so and offers no saving', async () => {
  show({ available: false });
  await status('Inget medgivande är sparat.');
  expect(screen.getByText('Samtal med Skyttel är inte tillgängligt just nu.')).toBeDefined();
  expect(buttons()).toEqual([]);
});

test('when the conversation is not available a saved consent is still revoked, and the focus goes to the part', async () => {
  const { posts } = show({ available: false, saved: savedConsent });
  await status('Sparat den 1 oktober 2026.');
  expect(screen.getByText('Samtal med Skyttel är inte tillgängligt just nu.')).toBeDefined();
  expect(buttons()).toEqual(['Återkalla medgivandet']);
  await userEvent.click(button('Återkalla medgivandet'));
  await status('Inget medgivande är sparat.');
  expect(feedback()).toBe('Medgivandet är återkallat');
  expect(buttons()).toEqual([]);
  // No button is left, so the focus goes to the heading of the part.
  expect(document.activeElement).toBe(within(part()).getByRole('heading', { level: 2 }));
  expect(posts).toEqual([{ url: revokePath, body: {} }]);
});

test('an available conversation is not told as unavailable', async () => {
  show();
  await status('Inget medgivande är sparat.');
  expect(screen.queryByText('Samtal med Skyttel är inte tillgängligt just nu.')).toBeNull();
});

test('a conversation that the server has ended for a revoked consent ends here without loss of access, and the next start asks', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { server, accessLost } = show({ saved: savedConsent });
    await status('Sparat den 1 oktober 2026.');
    await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
    await screen.findByText('Samtalet pågår');

    // Another device revokes: the server refuses the next read of the conversation and says why.
    server.saved = null;
    server.sessionStatus = 403;
    await vi.advanceTimersByTimeAsync(5000);
    await screen.findByText('Inget samtal pågår');
    await status('Inget medgivande är sparat.');
    expect(accessLost).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Starta samtalet' }));
    await waitFor(() => expect(queryConsentBox()).not.toBeNull());
  } finally {
    vi.useRealTimers();
  }
});
