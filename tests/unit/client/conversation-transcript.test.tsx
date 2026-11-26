import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import {
  ConversationTranscript,
  type TranscriptRow,
} from '../../../src/client/ConversationTranscript.js';
import type { ConversationWorkStep } from '../../../src/shared/text-assistant.js';

afterEach(cleanup);

test('work descriptions and actual MCP steps are visible without becoming conversation replies', () => {
  const rows: TranscriptRow[] = [
    { id: 'speech', role: 'user', text: 'Läs kartan.', speechEventIds: ['speech-fragment'] },
    { id: 'queued', role: 'user', text: 'En till fråga.' },
  ];
  const storedRows = [
    {
      role: 'user' as const,
      text: 'Läs kartan.',
      speechEventId: 'speech-fragment',
      requestId: 'one',
    },
  ];
  const step: ConversationWorkStep = {
    id: 'read',
    requestId: 'one',
    kind: 'mcp',
    text: 'Läser kartan',
    count: 1,
  };
  const log = () => [...view.getByRole('log').children].map((row) => row.textContent);
  const announcement = () =>
    view.container.querySelector('.conversation-work-announcement')?.textContent;
  const view = render(<ConversationTranscript rows={rows} working />);
  view.rerender(
    <ConversationTranscript rows={rows} storedRows={storedRows} working workSteps={[step]} />,
  );
  expect(log()).toEqual([
    'Du: Läs kartan.',
    'MCP: Läser kartan',
    'Du: En till fråga.',
    'Skyttel arbetar…',
  ]);
  expect(announcement()).toBe('MCP: Läser kartan.');
  view.rerender(
    <ConversationTranscript
      rows={rows}
      storedRows={storedRows}
      working={false}
      interruptedRequestId="speech"
      workSteps={[{ ...step, count: 2 }]}
    />,
  );
  expect(log()).toEqual([
    'Du: Läs kartan.',
    'MCP: Läser kartan (2)',
    'Arbetet avbröts. Fortsätt arbetet',
    'Du: En till fråga.',
  ]);
  expect(announcement()).toBe('MCP: Läser kartan (2).');
});

test('only new unvoiced assistant rows are polite announcements, without history replay', () => {
  let rows: TranscriptRow[] = [{ id: 'old', role: 'assistant', text: 'Tidigare svar.' }];
  const view = render(<ConversationTranscript rows={rows} working={false} />);
  const announcement = () => view.container.querySelector('.conversation-announcement');
  expect(announcement()?.textContent).toBe('');
  expect(view.getByRole('log').getAttribute('aria-live')).toBe('off');
  rows = [...rows, { id: 'user', role: 'user', text: 'Min egen text.' }];
  view.rerender(<ConversationTranscript rows={rows} working={false} />);
  expect(announcement()?.textContent).toBe('');
  rows = [...rows, { id: 'spoken', role: 'assistant', text: 'Talat svar.', voiced: true }];
  view.rerender(<ConversationTranscript rows={rows} working={false} />);
  expect(announcement()?.textContent).toBe('');
  rows = [...rows, { id: 'typed', role: 'assistant', text: 'Textsvaret.' }];
  view.rerender(<ConversationTranscript rows={rows} working={false} />);
  expect(announcement()?.textContent).toBe('Skyttel: Textsvaret.');
  const spoken = view.getByText('Talat svar.').closest('li');
  expect(spoken?.textContent).toBe('Skyttel: Talat svar.');
  view.rerender(<ConversationTranscript rows={rows} working={false} announce={false} />);
  rows = [...rows, { id: 'hidden', role: 'assistant', text: 'Svar medan vyn är stängd.' }];
  view.rerender(<ConversationTranscript rows={rows} working={false} announce={false} />);
  view.rerender(<ConversationTranscript rows={rows} working={false} />);
  expect(announcement()?.textContent).toBe('');
  expect(view.getByRole('log').textContent).toContain('Svar medan vyn är stängd.');
});

test('working is announced once only when the voice box does not already announce it', () => {
  const rows: TranscriptRow[] = [];
  const view = render(<ConversationTranscript rows={rows} working={false} />);
  view.rerender(<ConversationTranscript rows={rows} working={true} announceWorking={false} />);
  expect(view.container.querySelector('.conversation-announcement')?.textContent).toBe('');
  view.rerender(<ConversationTranscript rows={rows} working={false} />);
  view.rerender(<ConversationTranscript rows={rows} working={true} />);
  expect(view.container.querySelector('.conversation-announcement')?.textContent).toBe(
    'Skyttel arbetar',
  );
});

test('typed text waits for its voice handoff choice rather than announcing during a microphone race', () => {
  const view = render(<ConversationTranscript rows={[]} working={false} />);
  const pending: TranscriptRow = {
    id: 'pending',
    role: 'assistant',
    text: 'Ett svar.',
    voicePending: true,
  };
  view.rerender(<ConversationTranscript rows={[pending]} working={false} />);
  expect(view.container.querySelector('.conversation-announcement')?.textContent).toBe('');
  view.rerender(
    <ConversationTranscript
      rows={[{ ...pending, voicePending: false, voiced: true }]}
      working={false}
    />,
  );
  expect(view.container.querySelector('.conversation-announcement')?.textContent).toBe('');
  view.rerender(
    <ConversationTranscript
      rows={[
        { ...pending, voicePending: false, voiced: true },
        { id: 'off', role: 'assistant', text: 'Svaret blev text.', voicePending: true },
      ]}
      working={false}
    />,
  );
  expect(view.container.querySelector('.conversation-announcement')?.textContent).toBe('');
  view.rerender(
    <ConversationTranscript
      rows={[
        { ...pending, voicePending: false, voiced: true },
        {
          id: 'off',
          role: 'assistant',
          text: 'Svaret blev text.',
          voicePending: false,
          voiced: false,
        },
      ]}
      working={false}
    />,
  );
  expect(view.container.querySelector('.conversation-announcement')?.textContent).toBe(
    'Skyttel: Svaret blev text.',
  );
});
