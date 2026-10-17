import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, test, vi } from 'vitest';
import { App } from '../../../src/client/App.js';
import { VoiceSessionContext } from '../../../src/client/voice-session-context.js';
import { voiceSessionExpiredMessage } from '../../../src/shared/voice-assistant.js';

let expireVoice = () => {};
vi.mock('../../../src/client/HouseholdMap.js', () => ({
  HouseholdMap() {
    const context = useContext(VoiceSessionContext);
    expireVoice = () => context?.expired();
    return <p>Röstanslutningen är öppen.</p>;
  },
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('voice expiry waits for the current server cause and announces the whole instruction notice once', async () => {
  let ended = false;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const household = { id: 'linden', name: 'Linden', role: 'administrator' };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path === '/api/bootstrap') {
      if (ended) {
        await held;
        return Response.json({
          status: 'anonymous',
          providers: ['google'],
          operator: false,
          sessionStatus: {
            state: 'expired',
            reason: 'inactivity',
            serverTime: 2_800_000,
            sessionId: 'session-1',
            bindingId: 'binding-1',
            bindingRevision: 1,
          },
        });
      }
      return Response.json({
        status: 'ready',
        providers: ['google'],
        operator: true,
        user: { id: 'alex', name: 'Alex' },
        loginId: 'session-1',
        household,
      });
    }
    if (path === '/api/browser-binding/status')
      return Response.json({
        state: 'active',
        serverTime: 1_000_000,
        expiresAt: 2_800_000,
        reason: 'inactivity',
        sessionId: 'session-1',
        bindingId: 'binding-1',
        bindingRevision: 1,
      });
    if (path === '/api/households/linden') return Response.json({ household });
    return Response.json({ theme: 'system', contentVersion: 1 });
  });
  render(
    <MemoryRouter initialEntries={['/households/linden']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByText('Röstanslutningen är öppen.');
  const element = document.querySelector('.session-expiry-announcement');
  const announcements: string[] = [];
  const observer = new MutationObserver(() => {
    if (element?.textContent) announcements.push(element.textContent);
  });
  if (element) observer.observe(element, { childList: true, characterData: true, subtree: true });
  try {
    ended = true;
    await act(async () => expireVoice());
    expect(element?.textContent).toBe('');
    await act(async () => release());
    await screen.findByRole('heading', { name: 'Välkommen till Skyttel' });
    const message = voiceSessionExpiredMessage.replace(
      'Din inloggning har gått ut. Logga in igen.',
      'Du har varit inaktiv i 30 minuter. Logga in igen.',
    );
    await waitFor(() => expect(element?.textContent).toBe(message));
    expect(announcements).toEqual([message]);
  } finally {
    observer.disconnect();
    release();
  }
});
