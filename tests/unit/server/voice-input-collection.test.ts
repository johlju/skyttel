import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import type { LiveSideband } from '../../../src/server/live-provider.js';
import { voiceWork } from '../../../src/server/voice-work.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

afterEach(() => {
  vi.useRealTimers();
});

function arrange() {
  vi.useFakeTimers();
  const initial: TextAssistantView = {
    id: 'collect-voice',
    revision: 0,
    phase: 'ready',
    operations: [],
    review: {
      version: 1,
      contentVersion: 1,
      changes: [],
      readyToSave: true,
      conflicts: [],
      unresolvedIdentities: [],
      pendingOperations: [],
    },
  };
  const channel = Object.assign(new EventEmitter(), { send: vi.fn() });
  const request = vi.fn(async (action?: string, _body?: unknown) =>
    action === 'messages' ? { ...initial, revision: 1, modelReply: 'Hela svaret.' } : initial,
  );
  const response = vi.fn();
  const delivered = vi.fn();
  const work = voiceWork({
    channel: channel as unknown as LiveSideband,
    initial,
    request,
    response,
    delivered,
    update: vi.fn(),
    interrupt: vi.fn(),
    failed: vi.fn(),
  });
  const fragment = (id: string, delta: string, start: number, end: number) =>
    channel.emit('session.input_transcript.delta', {
      event_id: id,
      delta,
      start_ms: start,
      end_ms: end,
    });
  const delegate = (id = 'task', offset = 9400) =>
    channel.emit('session.delegation.created', {
      offset_ms: offset,
      delegation: { id, target: 'client' },
    });
  const messages = () => request.mock.calls.filter(([action]) => action === 'messages');
  return { work, fragment, delegate, messages, response, channel, initial, delivered };
}

test.each(['timeout', 'error'] as const)(
  'typed reply survives thinking %s and unblocks only its context handoff',
  {
    tags: ['technical'],
  },
  (failure) => {
    const { work, channel, initial, delivered } = arrange();
    const reply = { id: 'typed', text: 'Hela textsvaret.', source: 'text' as const, revision: 1 };
    const view = { ...initial, revision: 1, completedReplies: [reply] };
    work.answer(view);
    expect(delivered).not.toHaveBeenCalled();
    expect(work.readyForSummary()).toBe(false);
    const parts = channel.send.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === 'session.thinking.append');
    work.activity(true);
    if (failure === 'timeout') vi.advanceTimersByTime(10_000);
    else channel.emit('error', { error: { client_event_id: parts[0].event_id } });
    expect(delivered).toHaveBeenCalledExactlyOnceWith({ id: reply.id, voiced: false });
    expect(view.completedReplies).toEqual([reply]);
    // A failed transport wait cannot bypass active microphone/input safeguards.
    expect(work.readyForSummary()).toBe(false);
    work.activity(false);
    expect(work.readyForSummary()).toBe(true);
    for (const part of parts)
      channel.emit('session.thinking.appended', { client_event_id: part.event_id });
    work.answer(view);
    expect(delivered).toHaveBeenCalledTimes(1);
    expect(
      channel.send.mock.calls.every(([event]) => event.type === 'session.thinking.append'),
    ).toBe(true);
    work.retire();
  },
);

test('a typed reply becomes voiced only after acknowledgement and preceding speech finish', {
  tags: ['technical'],
}, () => {
  const { work, channel, initial, delivered } = arrange();
  work.speaker(true);
  work.answer({
    ...initial,
    revision: 1,
    completedReplies: [{ id: 'typed', text: 'Svar.', source: 'text', revision: 1 }],
  });
  for (const [event] of [...channel.send.mock.calls])
    if (event.type === 'session.thinking.append')
      channel.emit('session.thinking.appended', { client_event_id: event.event_id });
  expect(delivered).not.toHaveBeenCalled();
  expect(work.readyForSummary()).toBe(false);
  work.speaker(false);
  expect(channel.send.mock.lastCall?.[0].type).toBe('session.instructions.append');
  expect(delivered).toHaveBeenCalledExactlyOnceWith({ id: 'typed', voiced: true });
  expect(work.readyForSummary()).toBe(true);
  work.retire();
});

test('a delegation inside a word waits for the late suffix and delivers the complete answer', {
  tags: ['technical'],
}, async () => {
  const { work, fragment, delegate, messages, response, channel } = arrange();
  work.activity(true);
  fragment('prefix', 'Betala med hushållsk', 9400, 9600);
  delegate();
  await vi.advanceTimersByTimeAsync(323);
  expect(messages()).toEqual([]);
  fragment('suffix', 'ortet.', 9600, 9800);
  await vi.advanceTimersByTimeAsync(2500);
  expect(messages()).toEqual([]);
  expect(work.readyForSummary()).toBe(false);
  work.rendered({ revision: 0, draftVersion: 2, contentVersion: 1 });
  work.activity(false);
  await vi.advanceTimersByTimeAsync(1999);
  expect(messages()).toEqual([]);
  await vi.advanceTimersByTimeAsync(101);
  expect(messages()).toHaveLength(1);
  expect(messages()[0][1]).toMatchObject({
    text: 'Betala med hushållskortet.',
    revision: 0,
    draftVersion: 1,
    contentVersion: 1,
  });
  expect(response).toHaveBeenCalledOnce();
  expect(response.mock.calls[0][0].text).toBe('Utkast: 0 osparade förslag.\nHela svaret.');
  expect(work.readyForSummary()).toBe(false);
  const parts = channel.send.mock.calls
    .map(([event]) => event)
    .filter((event) => event.type === 'session.thinking.append');
  expect(parts.length).toBeGreaterThan(0);
  for (const part of parts)
    channel.emit('session.thinking.appended', { client_event_id: part.event_id });
  expect(work.readyForSummary()).toBe(true);
});

test('continued speech and repeated delegations form one complete task without reusing its approval', {
  tags: ['technical'],
}, async () => {
  const { fragment, delegate, messages, response } = arrange();
  fragment('first', 'Spara', 0, 200);
  delegate('first', 200);
  await vi.advanceTimersByTimeAsync(1500);
  fragment('correction', ' inte. Läs bara utkastet.', 200, 1200);
  delegate('second', 1200);
  delegate('second', 1200);
  await vi.advanceTimersByTimeAsync(1999);
  expect(messages()).toEqual([]);
  await vi.advanceTimersByTimeAsync(101);
  expect(messages()).toHaveLength(1);
  expect(messages()[0][1]).toMatchObject({ text: 'Spara inte. Läs bara utkastet.' });
  expect(response).toHaveBeenCalledOnce();
  delegate('empty', 1200);
  await vi.advanceTimersByTimeAsync(2100);
  expect(messages()).toHaveLength(1);
});

test('an empty delegation consumes whitespace without creating work or blocking a summary', {
  tags: ['technical'],
}, async () => {
  const { work, fragment, delegate, messages } = arrange();
  fragment('empty', ' ', 0, 100);
  delegate('empty', 100);
  await vi.advanceTimersByTimeAsync(2100);
  expect(messages()).toEqual([]);
  expect(work.readyForSummary()).toBe(true);
});

test.each(['stop', 'retire'] as const)(
  '%s while collecting speech prevents any backend task or late answer',
  { tags: ['technical'] },
  async (action) => {
    const { work, fragment, delegate, messages, response } = arrange();
    fragment('first', 'Spara', 0, 200);
    delegate('first', 200);
    await vi.advanceTimersByTimeAsync(323);
    await work[action]();
    fragment('late', ' allt.', 200, 400);
    await vi.advanceTimersByTimeAsync(2500);
    expect(messages()).toEqual([]);
    expect(response).not.toHaveBeenCalled();
    expect(work.readyForSummary()).toBe(true);
  },
);
