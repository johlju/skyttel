import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import type { LiveSideband } from '../../../src/server/live-provider.js';
import { voiceWork } from '../../../src/server/voice-work.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

afterEach(() => vi.useRealTimers());

function arrange(questionPending = true) {
  vi.useFakeTimers();
  let view: TextAssistantView = {
    id: 'follow-up',
    revision: 1,
    phase: 'ready',
    questionPending,
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
  const channel = Object.assign(new EventEmitter(), { send: vi.fn() });
  const request = vi.fn(async (action?: string, _body?: unknown) => {
    if (action === 'messages')
      view = { ...view, revision: view.revision + 1, questionPending: false, modelReply: 'Tack.' };
    return view;
  });
  const work = voiceWork({
    channel: channel as unknown as LiveSideband,
    initial: view,
    request,
    failed: vi.fn(),
    interrupt: vi.fn(),
    update: vi.fn(),
  });
  let sequence = 0;
  const speech = (delta: string, start = 0, end = 100) =>
    channel.emit('session.input_transcript.delta', {
      event_id: `input-${++sequence}`,
      delta,
      start_ms: start,
      end_ms: end,
    });
  const delegate = (offset = 100) =>
    channel.emit('session.delegation.created', {
      offset_ms: offset,
      delegation: { id: `task-${++sequence}`, target: 'client' },
    });
  return { channel, request, work, speech, delegate, view: () => view };
}

test.each(['none', 'before', 'after'])(
  'a reply reaches the waiting backend once with Live delegation %s collection',
  { tags: ['technical'] },
  async (delegation) => {
    const { channel, request, work, speech, delegate } = arrange();
    speech('Den gröna cykeln.');
    if (delegation === 'before') delegate();
    await vi.advanceTimersByTimeAsync(2100);
    if (delegation === 'after') {
      channel.send.mockClear();
      delegate(500);
      await vi.advanceTimersByTimeAsync(2100);
      expect(channel.send).not.toHaveBeenCalled();
    }
    const messages = request.mock.calls.filter(([action]) => action === 'messages');
    expect(messages).toHaveLength(1);
    expect(messages[0][1]).toMatchObject({ text: 'Den gröna cykeln.', revision: 1 });
    if (delegation === 'none')
      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'session.instructions.append', delegation_id: null }),
      );
    await work.stop();
  },
);

test('automatic replies wait for microphone inactivity and late corrections', {
  tags: ['technical'],
}, async () => {
  const { request, work, speech } = arrange();
  work.activity(true);
  speech('Den gröna');
  await vi.advanceTimersByTimeAsync(5000);
  expect(request).not.toHaveBeenCalled();
  work.activity(false);
  await vi.advanceTimersByTimeAsync(1500);
  speech(' cykeln, nej den blå.', 100, 600);
  await vi.advanceTimersByTimeAsync(1900);
  expect(request).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(200);
  expect(request.mock.calls.find(([action]) => action === 'messages')?.[1]).toMatchObject({
    text: 'Den gröna cykeln, nej den blå.',
  });
  await work.stop();
});

test.each(['stop', 'retire', 'resolved'])(
  'pending automatic replies are invalidated by %s',
  { tags: ['technical'] },
  async (action) => {
    const { request, work, speech, view } = arrange();
    speech('På fredag.');
    if (action === 'stop') await work.stop();
    else if (action === 'retire') work.retire();
    else work.answer({ ...view(), revision: 2, questionPending: false });
    await vi.advanceTimersByTimeAsync(2100);
    expect(request).not.toHaveBeenCalled();
    await work.stop();
  },
);

test('ordinary speech needs delegation; a typed backend question enables a new reply', {
  tags: ['technical'],
}, async () => {
  const { request, work, speech, view } = arrange(false);
  speech('God morgon.');
  await vi.advanceTimersByTimeAsync(2100);
  expect(request).not.toHaveBeenCalled();
  work.answer({ ...view(), revision: 2, questionPending: true, modelReply: 'Vilken färg?' });
  await vi.advanceTimersByTimeAsync(2100);
  expect(request).not.toHaveBeenCalled();
  speech(' Blå.', 200, 300);
  await vi.advanceTimersByTimeAsync(2100);
  expect(request.mock.calls.filter(([action]) => action === 'messages')).toHaveLength(1);
  expect(request.mock.calls.find(([action]) => action === 'messages')?.[1]).toMatchObject({
    text: ' Blå.',
  });
  await work.stop();
});

test('a late delegation cannot disturb the next answer to a continuing question', {
  tags: ['technical'],
}, async () => {
  const { channel, request, work, speech, delegate, view } = arrange();
  request.mockImplementation(async () => view());
  speech('Den gröna.', 0, 100);
  await vi.advanceTimersByTimeAsync(2100);
  work.answer({ ...view(), revision: 2, questionPending: true });
  speech('På fredag.', 1000, 1200);
  channel.send.mockClear();
  delegate(500);
  expect(channel.send).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2100);
  const messages = request.mock.calls.filter(([action]) => action === 'messages');
  expect(messages).toHaveLength(2);
  expect(messages.map(([, body]) => (body as { text: string }).text)).toEqual([
    'Den gröna.',
    'På fredag.',
  ]);
  await work.stop();
});
