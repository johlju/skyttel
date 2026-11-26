import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { ConversationList } from '../../../src/client/ConversationList.js';
import { TextView } from '../../../src/client/TextView.js';
import type { Conversation } from '../../../src/client/use-conversation.js';
import type { RetainedConversation } from '../../../src/shared/text-assistant.js';
import { conversationCommands } from '../../support/conversation-hook.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const rows: RetainedConversation[] = [
  {
    id: 'original',
    title: 'Cykelns plats',
    createdAt: Date.UTC(2026, 9, 1),
    expiresAt: Date.UTC(2026, 11, 1),
    paused: false,
    modelChoice: { model: 'gpt-6.2-sol', effort: 'high' },
  },
  {
    id: 'previous',
    title: 'Tidigare samtal',
    expiresAt: Date.UTC(2026, 10, 1),
    paused: true,
    modelChoice: { model: 'gpt-6.2-sol', effort: 'high' },
  },
];

test('conversation information displays and copies only the selected row and offers manual copying on failure', async () => {
  const { result } = await conversationCommands(() => undefined);
  const user = userEvent.setup();
  const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  const conversation = {
    ...result.current,
    retainedConversations: rows,
    listRetained: vi.fn(async () => {}),
  };
  render(<ConversationList id="conversations" conversation={conversation} onSelected={vi.fn()} />);
  const info = screen.getAllByRole('button', { name: 'Samtalsinformation' });
  await user.click(info[0]);
  const dialog = within(screen.getByRole('dialog', { name: 'Samtalsinformation' }));
  expect(dialog.getByText(rows[0].title)).toBeDefined();
  expect(dialog.getByText('Datum saknas')).toBeDefined();
  expect(dialog.getAllByRole('time').map((time) => time.getAttribute('datetime'))).toEqual([
    '2026-10-01T00:00:00.000Z',
    '2026-12-01T00:00:00.000Z',
  ]);
  await user.click(dialog.getByRole('button', { name: 'Kopiera samtals-ID' }));
  expect(write).toHaveBeenLastCalledWith('original');
  expect(dialog.getByRole('status').textContent).toBe('Kopierat.');
  write.mockRejectedValueOnce(new Error('Clipboard unavailable'));
  await user.click(dialog.getByRole('button', { name: 'Kopiera LangSmith-filter' }));
  expect(write).toHaveBeenLastCalledWith(dialog.getByText(/and\(eq\(metadata_key/u).textContent);
  expect(dialog.getByRole('status').textContent).toContain('kopiera den manuellt');
  await user.click(dialog.getByRole('button', { name: 'Stäng' }));
  await user.click(info[1]);
  const previous = within(screen.getByRole('dialog'));
  expect(previous.getByText(rows[1].title)).toBeDefined();
  expect(previous.getByRole('time').getAttribute('datetime')).toBe('2026-11-01T00:00:00.000Z');
  fireEvent(screen.getByRole('dialog'), new Event('cancel'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('retained rows expose selection, blocked switching, read errors and unsuccessful openings', async () => {
  const { result } = await conversationCommands(() => undefined);
  const openRetained = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const onSelected = vi.fn();
  const base = { ...result.current, openRetained, listRetained: vi.fn(async () => {}) };
  const show = (changes: Partial<Conversation>) => (
    <ConversationList
      id="conversations"
      conversation={{ ...base, ...changes }}
      onSelected={onSelected}
    />
  );
  const list = render(show({}));
  expect(screen.getByText('Hämtar samtal…')).toBeDefined();
  list.rerender(show({ listError: 'Samtalslistan kunde inte hämtas.' }));
  expect(screen.getByRole('alert').textContent).toContain('kunde inte hämtas');
  expect(screen.queryByText('Hämtar samtal…')).toBeNull();
  list.rerender(show({ retainedConversations: rows, switchBlocked: true }));
  expect(screen.getByRole('button', { name: rows[0].title }).getAttribute('aria-current')).toBe(
    'true',
  );
  const other = screen.getByRole('button', { name: rows[1].title });
  expect(other.hasAttribute('aria-current')).toBe(false);
  await userEvent.click(other);
  expect(openRetained).not.toHaveBeenCalled();
  list.rerender(show({ retainedConversations: rows, switchBlocked: false }));
  await userEvent.click(other);
  expect(onSelected).not.toHaveBeenCalled();
  await userEvent.click(other);
  expect(openRetained.mock.calls).toEqual([['previous'], ['previous']]);
  expect(onSelected).toHaveBeenCalledOnce();
});

test('a failed deletion keeps the selected conversation ready for an explicit retry', async () => {
  const { result } = await conversationCommands(() => undefined);
  const user = userEvent.setup();
  let finishDeletion!: (error: string) => void;
  const deleteRetained = vi
    .fn<(id: string) => Promise<string | undefined>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDeletion = resolve;
        }),
    )
    .mockResolvedValueOnce(undefined);
  const view = (busy: boolean) => (
    <ConversationList
      id="conversations"
      conversation={{
        ...result.current,
        retainedConversations: [rows[0], { ...rows[1], busy }],
        listRetained: async () => {},
        deleteRetained,
      }}
      onSelected={vi.fn()}
    />
  );
  const list = render(view(true));
  await user.click(screen.getByRole('button', { name: `Ta bort samtalet: ${rows[1].title}` }));
  const dialog = screen.getByRole('dialog', { name: 'Ta bort samtal?' });
  const controls = within(dialog);
  const confirm = controls.getByRole<HTMLButtonElement>('button', { name: 'Ta bort' });
  const cancel = controls.getByRole<HTMLButtonElement>('button', { name: 'Avbryt' });
  expect(controls.getByRole('status').textContent).toContain('Vänta tills det är klart.');
  expect(confirm.disabled).toBe(true);

  list.rerender(view(false));
  await user.click(confirm);
  expect(controls.getByRole('status').textContent).toBe('Tar bort samtalet…');
  expect(confirm.disabled).toBe(true);
  expect(cancel.disabled).toBe(true);
  expect(fireEvent(dialog, new Event('cancel', { cancelable: true }))).toBe(false);
  expect(deleteRetained).toHaveBeenCalledExactlyOnceWith(rows[1].id);

  const error = 'Samtalet kunde inte tas bort. Försök igen.';
  finishDeletion(error);
  expect((await controls.findByRole('alert')).textContent).toBe(error);
  expect(controls.getByText(rows[1].title)).toBeDefined();
  expect(confirm.disabled).toBe(false);
  expect(cancel.disabled).toBe(false);
  await user.click(confirm);
  expect(deleteRetained.mock.calls).toEqual([[rows[1].id], [rows[1].id]]);
  expect(screen.queryByRole('dialog', { name: 'Ta bort samtal?' })).toBeNull();
});

test.each([390, 1600])(
  'switching panels and selecting a conversation at %i pixels preserves unsent text',
  async (width) => {
    vi.stubGlobal('innerWidth', width);
    const { result } = await conversationCommands(() => undefined);
    const openRetained = vi.fn(async () => true);
    const conversation = {
      ...result.current,
      retainedConversations: rows,
      openRetained,
      listRetained: vi.fn(async () => {}),
      text: 'Mitt osända meddelande',
    };
    function Panels() {
      const [draftOpen, setDraftOpen] = useState(true);
      return (
        <TextView
          conversation={conversation}
          onClose={vi.fn()}
          draftOpen={draftOpen}
          onToggleDraft={() => setDraftOpen(!draftOpen)}
          draftCount={1}
        />
      );
    }
    render(<Panels />);
    const toggle = screen.getByRole('button', { name: 'Samtal' });
    await userEvent.click(toggle);
    expect(screen.getByRole('region', { name: 'Samtal' })).toBeDefined();
    if (width === 390) {
      expect(screen.queryByRole('region', { name: 'Utkastet' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Visa utkastet (1)' }));
      expect(screen.queryByRole('region', { name: 'Samtal' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Text' }));
      expect(screen.queryByRole('region', { name: 'Utkastet' })).toBeNull();
      await userEvent.click(toggle);
    } else {
      expect(screen.getByRole('region', { name: 'Utkastet' })).toBeDefined();
      await userEvent.click(screen.getByRole('button', { name: 'Dölj utkastet (1)' }));
      expect(screen.getByRole('region', { name: 'Samtal' })).toBeDefined();
    }
    await userEvent.click(screen.getByRole('button', { name: rows[1].title }));
    expect(openRetained).toHaveBeenCalledWith(rows[1].id);
    expect(toggle.getAttribute('aria-expanded')).toBe(String(width === 1600));
    if (width === 390) expect(document.activeElement).toBe(toggle);
    expect((screen.getByLabelText('Meddelande till Skyttel') as HTMLTextAreaElement).value).toBe(
      'Mitt osända meddelande',
    );
  },
);

test.each(['approved', 'declined', 'edited', 'offline', 'failed'] as const)(
  'first message composed without a session respects the %s outcome',
  async (outcome) => {
    const { result } = await conversationCommands(() => undefined);
    const text = 'Skicka när samtalet är öppet.';
    const send = vi.fn(async () => {});
    const begin = vi.fn();
    const base = { ...result.current, session: null, text, send, begin };
    const view = (changes: Partial<Conversation>) => (
      <TextView conversation={{ ...base, ...changes }} onClose={vi.fn()} />
    );
    const panel = render(view({}));
    await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
    expect(begin).toHaveBeenCalledWith('text');
    expect(send).not.toHaveBeenCalled();
    panel.rerender(view({ consent: { ...base.consent, valid: false, asking: 'text' } }));
    if (outcome === 'declined')
      panel.rerender(view({ consent: { ...base.consent, valid: false, asking: null } }));
    if (outcome === 'offline') panel.rerender(view({ inputBlocked: true }));
    if (outcome === 'failed') panel.rerender(view({ error: 'Samtalet kunde inte öppnas.' }));
    panel.rerender(
      view({
        session: result.current.session,
        text: outcome === 'edited' ? 'En senare ändring.' : text,
      }),
    );
    expect(send).toHaveBeenCalledTimes(outcome === 'approved' ? 1 : 0);
  },
);

test('the stopped transcript request can be continued explicitly from its own row', async () => {
  const { result } = await conversationCommands(() => undefined);
  const resumeConversation = vi.fn(async () => {});
  const session = result.current.session;
  if (!session) throw new Error('Missing conversation');
  const conversation = {
    ...result.current,
    resumeConversation,
    session: { ...session, interruptedRequestId: 'interrupted', waitingForRetainedWork: true },
    transcript: [{ id: 'interrupted', role: 'user' as const, text: 'Hitta cykeln.' }],
  };
  const view = (pending: boolean) => (
    <TextView conversation={{ ...conversation, pending }} onClose={vi.fn()} />
  );
  const panel = render(view(true));
  expect(screen.getByText(/Välj det tidigare samtalet/)).toBeDefined();
  const resume = screen.getByRole('button', { name: 'Fortsätt arbetet' });
  await userEvent.click(resume);
  expect(resumeConversation).not.toHaveBeenCalled();
  panel.rerender(view(false));
  await userEvent.click(resume);
  expect(resumeConversation).toHaveBeenCalledWith('interrupted');
  expect(document.activeElement).toBe(screen.getByLabelText('Meddelande till Skyttel'));
});
