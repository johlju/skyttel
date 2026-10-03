import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import type { SaveReceipt } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import type { VoiceAssistantView } from '../../../src/shared/voice-assistant.js';
import { StandaloneVoice } from '../../support/voice-harness.js';
import { voiceMedia } from '../../support/voice-media.js';

const initial: TextAssistantView = {
  id: 'reply-session',
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
const button = () => screen.getByRole('button', { name: 'Prata med Skyttel' });
const box = () => screen.queryByRole('group', { name: 'Röstruta' });
function Voice() {
  const [assistant, onAssistant] = useState(initial);
  return (
    <StandaloneVoice
      householdId="linden"
      assistant={assistant}
      onAssistant={onAssistant}
      onAccessLost={() => {}}
    />
  );
}
async function arrange() {
  const media = voiceMedia();
  vi.useFakeTimers();
  const server: { assistant: TextAssistantView; response?: VoiceAssistantView['response'] } = {
    assistant: initial,
  };
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json({
      assistant: server.assistant,
      voice: {
        id: 'reply-voice',
        phase: url.endsWith('/stop') ? 'closed' : 'listening',
        seconds: null,
        usageFinal: false,
        response: server.response,
      },
      sdp: 'synthetic-answer',
    }),
  );
  render(<Voice />);
  await act(async () => {
    fireEvent.click(button());
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(media.peers[0].channel.readyState).toBe('open');
  await act(async () =>
    media.peers[0].channel.emit({ type: 'session.started', session: { id: 'reply-provider' } }),
  );
  return {
    media,
    server,
    async tick(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    },
  };
}
afterEach(async () => {
  await act(async () => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

const receipt = (operationId: string): SaveReceipt => ({
  operationId,
  householdId: 'linden',
  userId: 'alex',
  draftVersion: 1,
  contentVersion: 1,
  savedAt: '2026-10-03T10:00:00Z',
  changes: [],
});

test('an explicit necessary question waits only after its matching voice audio is heard and drains', async () => {
  const { media, server, tick } = await arrange();
  server.assistant = { ...initial, revision: 1, questionPending: true, taskId: 'question-task' };
  server.response = {
    id: 'question-reply',
    revision: 1,
    text: 'Vilken cykel menar du?',
    questionPending: true,
  };
  await tick(500);
  expect(box()?.textContent).toBe('Lyssnar');
  await act(async () =>
    media.peers[0].channel.emit({
      type: 'session.output_transcript.delta',
      delta: 'Vilken cykel menar du?',
      start_ms: 0,
      end_ms: 100,
    }),
  );
  await tick(100);
  expect(box()?.textContent).toBe('Lyssnar');
  media.signals.set(media.peers[0].remote, 40);
  await tick(100);
  expect(box()?.textContent).toContain('Skyttel talar');
  media.signals.set(media.peers[0].remote, 0);
  await tick(100);
  expect(box()?.textContent).toBe('Väntar på ditt svar');
  fireEvent.click(button());
  expect(box()?.textContent).toBe('Väntar på ditt svar');
  expect(box()?.querySelector('.voice-wave')?.getAttribute('data-form')).toBe('dimmed');
  server.assistant = { ...server.assistant, revision: 2, questionPending: false };
  await tick(500);
  expect(box()).toBeNull();
});

test('verified saved feedback lasts four seconds after its spoken acknowledgement drains, and repeated polls never extend it', async () => {
  const { media, server, tick } = await arrange();
  server.assistant = {
    ...initial,
    revision: 1,
    receipt: receipt('saved-once'),
    taskId: 'save-task',
  };
  server.response = {
    id: 'saved-reply',
    revision: 1,
    text: 'Sparat.',
    questionPending: false,
    receiptOperationId: 'saved-once',
  };
  await tick(500);
  await act(async () =>
    media.peers[0].channel.emit({
      type: 'session.output_transcript.delta',
      delta: 'Sparat.',
      start_ms: 0,
      end_ms: 100,
    }),
  );
  expect(box()?.textContent).toBe('Lyssnar');
  media.signals.set(media.peers[0].remote, 40);
  await tick(100);
  expect(box()?.textContent).toContain('Skyttel talar');
  media.signals.set(media.peers[0].remote, 0);
  await tick(100);
  expect(box()?.textContent).toBe('Sparat');
  await tick(3900);
  expect(box()?.textContent).toBe('Sparat');
  await tick(100);
  expect(box()?.textContent).toBe('Lyssnar');
  await tick(1000);
  expect(box()?.textContent).toBe('Lyssnar');
});

test.each([true, false])(
  'interrupting output acknowledges only its own verified receipt (matching=%s), never a different save',
  async (matching) => {
    const { media, server, tick } = await arrange();
    server.assistant = {
      ...initial,
      revision: 1,
      receipt: receipt(matching ? 'original-save' : 'different-save'),
      taskId: 'checked-save',
    };
    server.response = {
      id: 'original-output',
      revision: 1,
      text: 'Sparat.',
      questionPending: false,
      receiptOperationId: 'original-save',
    };
    await tick(500);
    media.signals.set(media.peers[0].remote, 40);
    await tick(100);
    await act(async () =>
      media.peers[0].channel.emit({
        type: 'session.output_transcript.delta',
        delta: 'Sparat.',
        start_ms: 0,
        end_ms: 100,
      }),
    );
    expect(box()?.textContent).toContain('Skyttel talar');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(media.peers[0].remote.stopped).toBe(true);
    expect(media.peers).toHaveLength(2);
    await act(async () =>
      media.peers[1].channel.emit({ type: 'session.started', session: { id: 'fresh-provider' } }),
    );
    expect(box()?.textContent).toBe(matching ? 'Sparat' : 'Lyssnar');
    expect(media.microphone.stopped).toBe(false);
    expect(media.getUserMedia).toHaveBeenCalledOnce();
    await tick(4000);
    expect(box()?.textContent).toBe('Lyssnar');
  },
);

test('audio from the preceding typed task cannot acknowledge a newly delivered save until its own words are heard', async () => {
  const { media, server, tick } = await arrange();
  server.assistant = { ...initial, revision: 1, taskId: 'preceding-task' };
  await tick(500);
  await act(async () =>
    media.peers[0].channel.emit({
      type: 'session.output_transcript.delta',
      delta: 'Sparat.',
      start_ms: 0,
      end_ms: 100,
    }),
  );
  server.assistant = { ...initial, revision: 2, taskId: 'new-task', receipt: receipt('new-save') };
  server.response = {
    id: 'new-output',
    revision: 2,
    text: 'Sparat.',
    questionPending: false,
    receiptOperationId: 'new-save',
  };
  await tick(500);
  media.signals.set(media.peers[0].remote, 40);
  await tick(100);
  media.signals.set(media.peers[0].remote, 0);
  await tick(100);
  expect(box()?.textContent).toBe('Lyssnar');
  await act(async () =>
    media.peers[0].channel.emit({
      type: 'session.output_transcript.delta',
      delta: 'Sparat.',
      start_ms: 100,
      end_ms: 200,
    }),
  );
  media.signals.set(media.peers[0].remote, 40);
  await tick(100);
  media.signals.set(media.peers[0].remote, 0);
  await tick(100);
  expect(box()?.textContent).toBe('Sparat');
});
