import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ConversationSettings } from '../../../src/client/ConversationSettings.js';
import { useConversation } from '../../../src/client/use-conversation.js';
import { useConversationPreferences } from '../../../src/client/use-conversation-preferences.js';

const path = '/api/households/linden/map';
const checkbox = () =>
  screen.getByRole('checkbox', { name: 'Visa utkastet när ett samtal börjar' });
const status = () => within(screen.getByRole('region', { name: 'Utkastet' })).getByRole('status');
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Page() {
  const personal = useConversationPreferences(path);
  const conversation = useConversation({
    householdId: 'linden',
    onMapChange: () => undefined,
    onStarted: () => undefined,
    onAccessLost: () => undefined,
    onSelectItem: async () => false,
  });
  return (
    <ConversationSettings conversation={conversation} householdName="Linden" personal={personal} />
  );
}
function provider(read: () => Promise<Response>, write: (init: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/conversation-preferences'))
      return init?.method === 'POST' ? write(init) : read();
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    return Response.json({ available: false });
  });
}

test('the unavailable conversation still permits a personal choice, which is optimistic and confirms its save', async () => {
  let release!: (response: Response) => void;
  const writes: unknown[] = [];
  provider(
    async () => Response.json({ showDraftOnStart: false }),
    async (init) => {
      writes.push(JSON.parse(String(init.body)));
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  );
  render(<Page />);
  await waitFor(() => expect(checkbox().hasAttribute('disabled')).toBe(false));
  await userEvent.click(checkbox());
  expect((checkbox() as HTMLInputElement).checked).toBe(true);
  expect(checkbox().getAttribute('aria-disabled')).toBe('true');
  release(Response.json({ showDraftOnStart: true }));
  await waitFor(() => expect(status().textContent).toBe('Valet är sparat'));
  expect(writes).toEqual([{ showDraftOnStart: true }]);
  expect(checkbox()).toBe(document.activeElement);
});

test('a failed save restores the persisted choice and lets the focused checkbox retry', async () => {
  let failures = 1;
  provider(
    async () => Response.json({ showDraftOnStart: true }),
    async () => {
      if (failures--) throw Error('offline');
      return Response.json({ showDraftOnStart: false });
    },
  );
  render(<Page />);
  await waitFor(() => expect(checkbox().hasAttribute('disabled')).toBe(false));
  await userEvent.click(checkbox());
  await waitFor(() => expect(status().textContent).toBe('Valet kunde inte sparas. Försök igen.'));
  expect((checkbox() as HTMLInputElement).checked).toBe(true);
  expect(checkbox()).toBe(document.activeElement);
  await userEvent.click(checkbox());
  await waitFor(() => expect(status().textContent).toBe('Valet är sparat'));
  expect((checkbox() as HTMLInputElement).checked).toBe(false);
});

test('a failed initial read does not invent a saved choice or enable changes', async () => {
  provider(
    async () => {
      throw Error('offline');
    },
    async () => Response.json({ showDraftOnStart: false }),
  );
  render(<Page />);
  await waitFor(() =>
    expect(status().textContent).toBe('Valet kunde inte läsas in. Ladda om sidan och försök igen.'),
  );
  expect(checkbox().hasAttribute('disabled')).toBe(true);
});
