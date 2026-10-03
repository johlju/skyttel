import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { TranscriptRow } from '../../../src/client/ConversationTranscript.js';
import { useTextButtonStatus } from '../../../src/client/use-text-button-status.js';
import { useVoice } from '../../../src/client/use-voice.js';
import { WorkspaceTools } from '../../../src/client/WorkspaceTools.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

const initial: TextAssistantView = {
  id: 'conversation',
  revision: 0,
  phase: 'ready',
  operations: [],
  review: {
    version: 0,
    contentVersion: 1,
    changes: [],
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
    readyToSave: false,
  },
};
function Page({
  transcript,
  session = initial,
  visible = true,
}: {
  transcript: TranscriptRow[];
  session?: TextAssistantView | null;
  visible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const voice = useVoice({
    householdId: 'linden',
    assistant: session,
    onAssistant: () => {},
    onAccessLost: () => {},
  });
  const indicator = useTextButtonStatus(
    { transcript, session, voice, working: session?.phase === 'working' },
    open,
    visible,
  );
  return (
    <>
      <WorkspaceTools
        expanded={false}
        onExpandedChange={() => {}}
        textViewOpen={open}
        textButton={indicator}
        onOpen={() => setOpen((value) => !value)}
      />
      <output aria-label="Nytt textsvar" data-occurrence={indicator.announcement.count}>
        {indicator.announcement.text}
      </output>
    </>
  );
}
const button = () => screen.getByRole('button', { name: /^Skriv till Skyttel/ });
const announcement = () => screen.getByRole('status', { name: 'Nytt textsvar' });
const answer: TranscriptRow = {
  id: 'answer',
  role: 'assistant',
  text: 'Svaret finns i samtalstexten.',
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('only new complete assistant rows mark unread text, opening marks them read and closing never announces them again', async () => {
  const page = render(
    <Page
      transcript={[
        { id: 'user', role: 'user', text: 'Min fråga.' },
        { ...answer, partial: true },
      ]}
    />,
  );
  expect(button().textContent).toBe('Skriv till Skyttel');
  expect(announcement().textContent).toBe('');
  page.rerender(<Page transcript={[answer]} />);
  expect(button().getAttribute('aria-label')).toContain('Skyttel har svarat');
  expect(announcement().textContent).toBe('Skyttel har svarat');
  expect(announcement().getAttribute('data-occurrence')).toBe('1');
  page.rerender(<Page transcript={[answer, { id: 'user-later', role: 'user', text: 'Tack.' }]} />);
  expect(announcement().getAttribute('data-occurrence')).toBe('1');
  fireEvent.click(button());
  expect(announcement().textContent).toBe('');
  fireEvent.click(button());
  expect(button().textContent).toBe('Skriv till Skyttel');
  expect(announcement().textContent).toBe('');
  page.rerender(<Page transcript={[answer, { ...answer, id: 'next', text: 'Ett nytt svar.' }]} />);
  expect(announcement().textContent).toBe('Skyttel har svarat');
  expect(announcement().getAttribute('data-occurrence')).toBe('2');
  await act(async () => {});
});

test('a necessary question changes the unread status once; hidden toolbar, working task and open text suppress announcements', () => {
  const page = render(<Page transcript={[answer]} visible={false} />);
  expect(announcement().textContent).toBe('');
  page.rerender(
    <Page transcript={[answer]} session={{ ...initial, phase: 'working', taskSource: 'text' }} />,
  );
  expect(button().getAttribute('aria-label')).toContain('Skyttel arbetar');
  expect(announcement().textContent).toBe('');
  page.rerender(<Page transcript={[answer]} session={{ ...initial, questionPending: true }} />);
  expect(button().getAttribute('aria-label')).toContain('Skyttel väntar på ditt svar');
  expect(announcement().textContent).toBe('Skyttel väntar på ditt svar');
  expect(announcement().getAttribute('data-occurrence')).toBe('1');
  page.rerender(
    <Page transcript={[answer]} session={{ ...initial, questionPending: true, revision: 1 }} />,
  );
  expect(announcement().getAttribute('data-occurrence')).toBe('1');
  page.rerender(<Page transcript={[answer]} session={{ ...initial, questionPending: false }} />);
  expect(announcement().textContent).toBe('Skyttel har svarat');
  expect(announcement().getAttribute('data-occurrence')).toBe('2');
  fireEvent.click(button());
  page.rerender(<Page transcript={[answer, { ...answer, id: 'seen-while-open' }]} />);
  fireEvent.click(button());
  expect(button().textContent).toBe('Skriv till Skyttel');
  expect(announcement().textContent).toBe('');
});

test('new conversation context permits new unread occurrences even when a retained row identifier was read before', () => {
  const page = render(<Page transcript={[answer]} />);
  fireEvent.click(button());
  fireEvent.click(button());
  expect(announcement().textContent).toBe('');
  page.rerender(<Page transcript={[]} session={{ ...initial, contextRevision: 1 }} />);
  page.rerender(<Page transcript={[answer]} session={{ ...initial, contextRevision: 1 }} />);
  expect(announcement().textContent).toBe('Skyttel har svarat');
  expect(announcement().getAttribute('data-occurrence')).toBe('2');
  page.rerender(<Page transcript={[]} session={null} />);
  expect(announcement().textContent).toBe('');
});
