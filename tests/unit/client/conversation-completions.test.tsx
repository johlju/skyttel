import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { startConversationWithText } from '../../support/conversation-dom.js';
import { StandaloneConversation } from '../../support/conversation-harness.js';

const path = '/api/households/linden/text-assistant';
const initial: TextAssistantView = {
  id: 'conversation',
  revision: 0,
  phase: 'ready',
  operations: [],
  review: {
    version: 1,
    contentVersion: 1,
    changes: [
      {
        id: 'kept',
        type: { id: 'person', householdId: 'linden', revision: 1, name: 'Person', description: '' },
        before: null,
        after: { typeId: 'person', name: 'Lo Exempel', description: '' },
      },
    ],
    readyToSave: true,
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
  },
};
const field = () =>
  screen.getByRole('textbox', { name: 'Meddelande till Skyttel' }) as HTMLTextAreaElement;
const rows = () =>
  within(screen.getByRole('log', { name: 'Samtalstext' }))
    .getAllByRole('listitem')
    .map((row) => row.textContent);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function arrange(
  respond: (url: string, body: Record<string, unknown>) => Promise<Response> | Response,
) {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return respond(url, JSON.parse(String(init.body)));
    if (url === path) return Response.json({ available: true });
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    return Response.json(initial);
  });
  render(
    <StandaloneConversation
      householdId="linden"
      onMapChange={() => {}}
      onAccessLost={() => {}}
      onSelectItem={async () => false}
    />,
  );
  await startConversationWithText();
  await screen.findByRole('textbox', { name: 'Meddelande till Skyttel' });
}
async function send(text: string) {
  fireEvent.change(field(), { target: { value: text } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Skicka' })));
}

test('completed FIFO replies keep their separate checked outcomes while another typed task works, without duplicate rows', async () => {
  let current = initial;
  let sent = 0;
  const receipt = {
    operationId: 'receipt-1',
    householdId: 'linden',
    userId: 'alex',
    draftVersion: 1,
    contentVersion: 1,
    savedAt: '2026-10-03T10:00:00Z',
    changes: [],
  };
  await arrange((url) => {
    if (url.endsWith('/messages')) {
      sent++;
      current = {
        ...initial,
        revision: sent > 1 ? 4 : 1,
        phase: 'working',
        review: sent > 1 ? { ...initial.review, version: 3 } : initial.review,
        queuedMessages: sent > 1 ? 1 : 0,
        ...(sent > 1
          ? {
              completedReplies: [
                {
                  id: 'first',
                  revision: 1,
                  source: 'text' as const,
                  text: 'Första svaret.',
                  voiced: false,
                },
                {
                  id: 'checked',
                  revision: 2,
                  source: 'text' as const,
                  text: '',
                  receipt,
                  voiced: false,
                },
                {
                  id: 'result',
                  revision: 3,
                  source: 'voice' as const,
                  text: 'Talat svar.',
                  reply: 'Utkastet är uppdaterat.',
                  result: { kind: 'draft' as const, message: 'Utkastet är uppdaterat.' },
                },
              ],
            }
          : {}),
      };
    }
    return Response.json(current);
  });
  await send('Första uppdraget.');
  await send('Nästa uppdrag.');
  expect(rows()).toEqual([
    'Du: Första uppdraget.',
    'Du: Nästa uppdrag.',
    'Skyttel: Första svaret.',
    'Skyttel: Sparat.',
    'Skyttel: Talat svar.',
    'Skyttel: Utkastet är uppdaterat.',
    'Skyttel arbetar… 1 meddelande väntar. Tryck på Escape för att avbryta.',
  ]);
  await send('Ett tredje uppdrag.');
  expect(rows().filter((row) => row === 'Skyttel: Sparat.')).toHaveLength(1);
  expect(rows().filter((row) => row === 'Skyttel: Första svaret.')).toHaveLength(1);
  await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Visa utkastet/ })));
  expect(screen.getByRole('table', { name: 'Osparade ändringar' }).textContent).toContain(
    'Lo Exempel',
  );
});

test.each([
  { text: 'Nytt samtal.', discard: false, reply: 'Nytt samtal. Utkastet ligger kvar.' },
  {
    text: 'Nytt samtal och kasta utkastet!',
    discard: true,
    reply: 'Nytt samtal. Utkastet är kastat.',
  },
])(
  'typed "$text" uses the existing reset flow and clears only the specified draft and conversation',
  async ({ text, discard, reply }) => {
    let current = initial;
    const commands: { url: string; body: unknown }[] = [];
    await arrange((url, body) => {
      commands.push({ url, body });
      if (url.endsWith('/messages'))
        current = { ...initial, revision: 1, modelReply: 'Tidigare svar.' };
      if (url.endsWith('/new'))
        current = {
          ...initial,
          revision: 2,
          contextRevision: 1,
          reply,
          review: discard ? { ...initial.review, version: 2, changes: [] } : initial.review,
        };
      return Response.json(current);
    });
    await send('Berätta om utkastet.');
    expect(rows()).toContain('Skyttel: Tidigare svar.');
    await send(text);
    expect(rows()).toEqual([`Skyttel: ${reply}`]);
    expect(field().value).toBe('');
    expect(
      commands.filter((request) => request.url.endsWith('/new')).map((request) => request.body),
    ).toEqual([{ discard }]);
    expect(commands.filter((request) => request.url.endsWith('/messages'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Visa utkastet/ }));
    const draft = screen.getByRole('region', { name: 'Utkastet' });
    expect(draft.textContent).toContain(discard ? 'Utkastet är tomt.' : 'Lo Exempel');
  },
);
