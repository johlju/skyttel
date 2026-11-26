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
    <>
      <StandaloneVoice
        householdId="linden"
        assistant={assistant}
        onAssistant={onAssistant}
        onAccessLost={() => {}}
      />
      <output aria-label="Levererade svar">{JSON.stringify(assistant)}</output>
    </>
  );
}
async function arrange(playout?: Parameters<typeof voiceMedia>[0]) {
  const media = voiceMedia(playout);
  vi.useFakeTimers();
  const server: {
    assistant: TextAssistantView;
    response?: VoiceAssistantView['response'];
    replyDelivery?: VoiceAssistantView['replyDelivery'];
  } = {
    assistant: initial,
  };
  const playedResponses: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/poll') && typeof init?.body === 'string') {
      const { playedResponseId } = JSON.parse(init.body);
      if (playedResponseId) playedResponses.push(playedResponseId);
    }
    return url === `/api/households/linden/text-assistant/${initial.id}`
      ? Response.json(server.assistant)
      : Response.json({
          assistant: server.assistant,
          voice: {
            id: 'reply-voice',
            phase: url.endsWith('/stop') ? 'closed' : 'listening',
            seconds: null,
            usageFinal: false,
            response: server.response,
            replyDelivery: server.replyDelivery,
          },
          sdp: 'synthetic-answer',
        });
  });
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
    playedResponses,
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

const answer = 'Den blå cykeln står i garaget intill den gamla kajaken.';
test.each([
  {
    name: 'a paraphrased answer with speaker audio',
    spoken: 'Den blå cykeln finns i garaget, bredvid den gamla kajaken.',
    audible: true,
    warned: false,
    acknowledged: true,
  },
  {
    name: 'only a neutral spoken acknowledgement',
    spoken: 'Ja, jag letar.',
    audible: true,
    warned: true,
    acknowledged: false,
  },
  {
    name: 'only the beginning of the requested answer',
    spoken: 'Den blå cykeln står i garaget.',
    audible: true,
    warned: true,
    acknowledged: false,
  },
  {
    name: 'the full transcript with no speaker audio',
    spoken: answer,
    audible: false,
    warned: true,
    acknowledged: false,
  },
])('playback evidence distinguishes $name', async ({ spoken, audible, warned, acknowledged }) => {
  const { media, server, tick, playedResponses } = await arrange();
  server.assistant = { ...initial, revision: 1, taskId: 'read-task', modelReply: answer };
  server.response = {
    id: 'read-reply',
    revision: 1,
    text: answer,
    questionPending: false,
    conversationalText: answer,
  };
  await tick(500);
  if (audible) {
    media.signals.set(media.peers[0].remote, 40);
    await tick(100);
    expect(box()?.textContent).toContain('Skyttel talar');
  }
  await act(async () =>
    media.peers[0].channel.emit({
      type: 'session.output_transcript.delta',
      delta: spoken,
      start_ms: 500,
      end_ms: 3100,
    }),
  );
  await tick(2700);
  expect(playedResponses).toEqual([]);
  media.signals.set(media.peers[0].remote, 0);
  await tick(600);
  expect(new Set(playedResponses)).toEqual(new Set(acknowledged ? ['read-reply'] : []));
  await tick(16_000);
  expect(screen.queryAllByText(/Uppläsningen kunde inte bekräftas/).length > 0).toBe(warned);
  expect(button().getAttribute('aria-pressed')).toBe('true');
});

test('an unconfirmed reply is shown with a notice after fifteen idle seconds while the voice remains connected', {
  tags: ['technical'],
}, async () => {
  const { media, server, tick } = await arrange();
  server.assistant = {
    ...initial,
    revision: 1,
    modelReply: 'Vilken cykel menar du?',
    questionPending: true,
  };
  server.response = {
    id: 'unconfirmed',
    revision: 1,
    text: 'Vilken cykel menar du?',
    questionPending: true,
  };
  await tick(500);
  await tick(14_000);
  expect(
    screen.queryByText('Uppläsningen kunde inte bekräftas. Du kan läsa svaret i textvyn.'),
  ).toBeNull();
  await tick(1500);
  expect(
    screen.getAllByText('Uppläsningen kunde inte bekräftas. Du kan läsa svaret i textvyn.').length,
  ).toBeGreaterThan(0);
  expect(screen.getByLabelText('Levererade svar').textContent).toContain('Vilken cykel menar du?');
  expect(button().getAttribute('aria-pressed')).toBe('true');
  await act(async () =>
    media.peers[0].channel.emit({
      type: 'session.output_transcript.delta',
      delta: server.response?.text,
      start_ms: 0,
      end_ms: 100,
    }),
  );
  media.signals.set(media.peers[0].remote, 40);
  await tick(100);
  media.signals.set(media.peers[0].remote, 0);
  await tick(100);
  expect(box()?.textContent).toBe('Väntar på ditt svar');
  expect(box()?.textContent).not.toContain('Uppläsningen kunde inte bekräftas.');
});

test.each(['short audio', 'repeated media interval'])(
  'a question stays unconfirmed with %s',
  async (delivery) => {
    const { media, server, tick, playedResponses } = await arrange();
    const text = 'Vilken cykel menar du?';
    server.assistant = { ...initial, revision: 1, modelReply: text, questionPending: true };
    server.response = { id: 'prefix', revision: 1, text, questionPending: true };
    await tick(500);
    media.signals.set(media.peers[0].remote, 40);
    await tick(100);
    const emit = async (delta: string, end: number) =>
      act(async () =>
        media.peers[0].channel.emit({
          type: 'session.output_transcript.delta',
          delta,
          start_ms: 600,
          end_ms: end,
        }),
      );
    if (delivery === 'short audio') {
      await emit(text, 2600);
    } else {
      await emit('Vilken ', 700);
      await tick(200);
      await emit('cykel ', 700);
      await emit('menar du?', 700);
    }
    await tick(200);
    media.signals.set(media.peers[0].remote, 0);
    await tick(16_000);
    expect(playedResponses).toEqual([]);
    expect(box()?.textContent).not.toContain('Väntar på ditt svar');
    expect(screen.getByLabelText('Levererade svar').textContent).toContain(text);
    expect(screen.queryAllByText(/Uppläsningen kunde inte bekräftas/).length).toBeGreaterThan(0);
  },
);

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
  const { media, server, tick, playedResponses } = await arrange();
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
  expect(playedResponses).toEqual([]);
  media.signals.set(media.peers[0].remote, 0);
  await tick(100);
  expect(box()?.textContent).toBe('Sparat');
  await tick(3900);
  expect(box()?.textContent).toBe('Sparat');
  expect(new Set(playedResponses)).toEqual(new Set(['saved-reply']));
  await tick(100);
  expect(box()?.textContent).toBe('Lyssnar');
  await tick(1000);
  expect(box()?.textContent).toBe('Lyssnar');
});

test.each([true, false])(
  'interrupting output acknowledges only its own verified receipt (matching=%s), never a different save',
  async (matching) => {
    const { media, server, tick, playedResponses } = await arrange();
    const [peer] = media.peers;
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
    media.signals.set(peer.remote, 40);
    await tick(100);
    await act(async () =>
      peer.channel.emit({
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
    expect(media.peers).toHaveLength(1);
    expect(peer.connectionState).toBe('connected');
    expect(peer.channel.readyState).toBe('open');
    expect(peer.remote.stopped).toBe(false);
    expect(box()?.textContent).toBe(matching ? 'Sparat' : 'Lyssnar');
    expect(media.microphone.stopped).toBe(false);
    expect(media.microphone.enabled).toBe(true);
    expect(media.getUserMedia).toHaveBeenCalledOnce();
    await tick(4000);
    expect(box()?.textContent).toBe('Lyssnar');
    expect(playedResponses).toEqual([]);
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

test('voice handoffs assign only matching FIFO replies their spoken disposition and preserve other undelivered transcript rows', async () => {
  const { server, tick } = await arrange();
  server.assistant = {
    ...initial,
    revision: 1,
    completedReplies: [
      { id: 'spoken', revision: 1, source: 'text', text: 'Svaret som rösten levererar.' },
      { id: 'text-only', revision: 2, source: 'text', text: 'Svaret som endast visas i text.' },
      { id: 'waiting', revision: 3, source: 'text', text: 'Ännu inte levererat.' },
    ],
  };
  server.replyDelivery = [
    { id: 'spoken', voiced: true },
    { id: 'text-only', voiced: false },
  ];
  await tick(500);
  const shown: TextAssistantView = JSON.parse(
    screen.getByLabelText('Levererade svar').textContent ?? '{}',
  );
  expect(shown.completedReplies).toEqual([
    {
      id: 'spoken',
      revision: 1,
      source: 'text',
      text: 'Svaret som rösten levererar.',
      voiced: true,
    },
    {
      id: 'text-only',
      revision: 2,
      source: 'text',
      text: 'Svaret som endast visas i text.',
      voiced: false,
    },
    { id: 'waiting', revision: 3, source: 'text', text: 'Ännu inte levererat.' },
  ]);
});

test.each(['other-session', 'old-turn', 'old-draft', 'old-content'] as const)(
  'a delayed %s voice status cannot overwrite the newer authoritative conversation shown by text',
  async (kind) => {
    const { server, tick } = await arrange();
    const latest: TextAssistantView = {
      ...initial,
      revision: 2,
      review: { ...initial.review, version: 2, contentVersion: 2 },
      modelReply: 'Det aktuella svaret.',
    };
    server.assistant = latest;
    await tick(500);
    const stale: TextAssistantView = {
      ...latest,
      modelReply: 'Ett gammalt privat svar.',
      ...(kind === 'other-session'
        ? { id: 'old-session' }
        : kind === 'old-turn'
          ? { revision: 1 }
          : {
              review: {
                ...latest.review,
                ...(kind === 'old-draft' ? { version: 1 } : { contentVersion: 1 }),
              },
            }),
    };
    server.assistant = stale;
    await tick(500);
    expect(JSON.parse(screen.getByLabelText('Levererade svar').textContent ?? '{}')).toEqual(
      latest,
    );
  },
);

test.each([
  'rendered',
  'rendered tail',
  'uneven',
  'missing',
  'concealed',
  'muted',
  'suspended',
  'missing ending',
] as const)(
  'Playback credits a quiet interval only when receiver media advances (%s)',
  async (delivery) => {
    const position = { jitterBufferEmittedCount: 0, concealedSamples: 0 };
    const { media, server, tick, playedResponses } = await arrange(() => position);
    server.assistant = { ...initial, revision: 1, modelReply: answer };
    server.response = { id: 'paused-reply', revision: 1, text: answer, questionPending: false };
    await tick(500);
    await act(async () =>
      media.peers[0].channel.emit({
        type: 'session.output_transcript.delta',
        delta: answer,
        start_ms: 0,
        end_ms: 500,
      }),
    );
    const remote = media.peers[0].remote;
    const finalLevel = delivery === 'rendered tail' || delivery === 'missing ending' ? 0 : 40;
    for (const [index, level] of [40, 0, 0, 0, finalLevel].entries()) {
      media.signals.set(remote, level);
      media.context.state = !level && delivery === 'suspended' ? 'suspended' : 'running';
      remote.muted = !level && delivery === 'muted';
      if (level || (delivery !== 'missing' && !(index === 4 && delivery === 'missing ending')))
        position.jitterBufferEmittedCount +=
          delivery === 'uneven' ? [4800, 3840, 5760, 3840, 5760][index] : 4800;
      if (!level && delivery === 'concealed') position.concealedSamples += 4800;
      await tick(100);
    }
    media.signals.set(remote, 0);
    await tick(1500);
    expect(new Set(playedResponses)).toEqual(
      new Set(['rendered', 'rendered tail', 'uneven'].includes(delivery) ? ['paused-reply'] : []),
    );
  },
);

test.each([
  { prefixMs: 50, laterMs: 50, acknowledged: true },
  { prefixMs: 50, laterMs: 0, acknowledged: false },
  { prefixMs: 150, laterMs: 100, acknowledged: true },
  { prefixMs: 150, laterMs: 75, acknowledged: false },
])(
  'a pending playback report credits the $prefixMs ms prefix and $laterMs ms of later audio once',
  async ({ prefixMs, laterMs, acknowledged }) => {
    let samples = 0;
    let hold = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { media, server, tick, playedResponses } = await arrange(async () => {
      const position = { jitterBufferEmittedCount: samples, concealedSamples: 0 };
      if (hold) await held;
      return position;
    });
    const text = 'Vilken cykel menar du?';
    server.assistant = { ...initial, revision: 1, modelReply: text, questionPending: true };
    server.response = { id: 'delayed-question', revision: 1, text, questionPending: true };
    const emit = (delta: string, start: number, end: number) =>
      act(async () =>
        media.peers[0].channel.emit({
          type: 'session.output_transcript.delta',
          delta,
          start_ms: start,
          end_ms: end,
        }),
      );
    await tick(500);
    await emit('Vilken cykel ', 0, prefixMs);
    media.signals.set(media.peers[0].remote, 40);
    samples = 4800;
    hold = true;
    await tick(125);
    await emit('menar du?', prefixMs, prefixMs + 50);
    hold = false;
    await act(async () => release());
    samples += laterMs * 48;
    await tick(75);
    media.signals.set(media.peers[0].remote, 0);
    await tick(1000);
    expect(new Set(playedResponses)).toEqual(new Set(acknowledged ? ['delayed-question'] : []));
  },
);
