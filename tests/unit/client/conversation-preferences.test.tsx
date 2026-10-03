import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { ConversationSettings } from '../../../src/client/ConversationSettings.js';
import { useConversation } from '../../../src/client/use-conversation.js';
import { useConversationPreferences } from '../../../src/client/use-conversation-preferences.js';
import { defaultConversationPreferences } from '../../../src/shared/conversation-preferences.js';

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
    async () => Response.json({ ...defaultConversationPreferences, showDraftOnStart: false }),
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
  release(Response.json({ ...defaultConversationPreferences, showDraftOnStart: true }));
  await waitFor(() => expect(status().textContent).toBe('Valet är sparat'));
  expect(writes).toEqual([{ showDraftOnStart: true }]);
  expect(checkbox()).toBe(document.activeElement);
});

test('a failed save restores the persisted choice and lets the focused checkbox retry', async () => {
  let failures = 1;
  provider(
    async () => Response.json({ ...defaultConversationPreferences, showDraftOnStart: true }),
    async () => {
      if (failures--) throw Error('offline');
      return Response.json({ ...defaultConversationPreferences, showDraftOnStart: false });
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
    async () => Response.json({ ...defaultConversationPreferences, showDraftOnStart: false }),
  );
  render(<Page />);
  await waitFor(() =>
    expect(status().textContent).toBe('Valet kunde inte läsas in. Ladda om sidan och försök igen.'),
  );
  expect(checkbox().hasAttribute('disabled')).toBe(true);
});

test('resetting personal widths sends one write, retains the busy control and restores focus to the heading after success', async () => {
  let release!: (response: Response) => void;
  const writes: unknown[] = [];
  provider(
    async () =>
      Response.json({ ...defaultConversationPreferences, textWidth: 460, draftWidth: 380 }),
    async (init) => {
      writes.push(JSON.parse(String(init.body)));
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  );
  render(<Page />);
  const reset = await screen.findByRole('button', { name: 'Återställ bredderna' });
  await userEvent.click(reset);
  expect(reset.getAttribute('aria-disabled')).toBe('true');
  await userEvent.click(reset);
  expect(writes).toEqual([{ textWidth: 400, draftWidth: 340 }]);
  expect(screen.getByRole('button', { name: 'Återställ bredderna' })).toBe(reset);
  await act(async () => release(Response.json(defaultConversationPreferences)));
  const region = screen.getByRole('region', { name: 'Textvyns bredd' });
  expect(within(region).getByRole('status').textContent).toBe('Bredderna är återställda');
  expect(screen.queryByRole('button', { name: 'Återställ bredderna' })).toBeNull();
  expect(within(region).getByText('Du har inte ändrat bredderna.')).toBeDefined();
  expect(document.activeElement).toBe(within(region).getByRole('heading'));
});

test('a rejected width reset retains the changed widths and focused retry control until a successful retry', async () => {
  let failures = 1;
  const writes: unknown[] = [];
  provider(
    async () => Response.json({ ...defaultConversationPreferences, draftWidth: 380 }),
    async (init) => {
      writes.push(JSON.parse(String(init.body)));
      return failures--
        ? Response.json({ error: 'unavailable' }, { status: 503 })
        : Response.json(defaultConversationPreferences);
    },
  );
  render(<Page />);
  const reset = await screen.findByRole('button', { name: 'Återställ bredderna' });
  await userEvent.click(reset);
  const region = screen.getByRole('region', { name: 'Textvyns bredd' });
  await waitFor(() =>
    expect(within(region).getByRole('status').textContent).toBe(
      'Bredderna kunde inte sparas. Försök igen.',
    ),
  );
  expect(screen.getByRole('button', { name: 'Återställ bredderna' })).toBe(reset);
  expect(document.activeElement).toBe(reset);
  expect(reset.getAttribute('aria-disabled')).toBe('false');
  await userEvent.click(reset);
  await waitFor(() =>
    expect(within(region).getByRole('status').textContent).toBe('Bredderna är återställda'),
  );
  expect(writes).toEqual([
    { textWidth: 400, draftWidth: 340 },
    { textWidth: 400, draftWidth: 340 },
  ]);
  expect(document.activeElement).toBe(within(region).getByRole('heading'));
});

test('a pending draft preference prevents a width reset from overtaking that write', async () => {
  let release!: (response: Response) => void;
  const writes: unknown[] = [];
  provider(
    async () => Response.json({ ...defaultConversationPreferences, textWidth: 460 }),
    async (init) => {
      writes.push(JSON.parse(String(init.body)));
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  );
  render(<Page />);
  const reset = await screen.findByRole('button', { name: 'Återställ bredderna' });
  await userEvent.click(checkbox());
  expect(reset.getAttribute('aria-disabled')).toBe('true');
  await userEvent.click(reset);
  expect(writes).toEqual([{ showDraftOnStart: true }]);
  await act(async () =>
    release(
      Response.json({ ...defaultConversationPreferences, showDraftOnStart: true, textWidth: 460 }),
    ),
  );
  expect(reset.getAttribute('aria-disabled')).toBe('false');
  expect((checkbox() as HTMLInputElement).checked).toBe(true);
  expect(writes).toHaveLength(1);
});
