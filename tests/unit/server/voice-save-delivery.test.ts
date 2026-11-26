import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import type { LiveSideband } from '../../../src/server/live-provider.js';
import { voiceWork } from '../../../src/server/voice-work.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test.each(['complete', 'stop'])(
  'a slow accepted voice task remains active until the model finishes or the user stops: %s',
  { tags: ['technical'] },
  async (action) => {
    vi.useFakeTimers();
    const initial: TextAssistantView = {
      id: 'slow-voice',
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
    const working: TextAssistantView = {
      ...initial,
      revision: 1,
      phase: 'working',
      taskStatus: 'working',
    };
    let completed = false;
    const channel = Object.assign(new EventEmitter(), { send: vi.fn() });
    const request = vi.fn(async (path?: string) => {
      if (path === 'cancel') return initial;
      if (path === 'messages' || path?.startsWith('messages/'))
        return completed
          ? {
              ...working,
              phase: 'ready' as const,
              taskStatus: 'completed' as const,
              modelReply: 'Klart.',
            }
          : working;
      return initial;
    });
    const failed = vi.fn();
    const response = vi.fn();
    const work = voiceWork({
      channel: channel as unknown as LiveSideband,
      initial,
      request,
      failed,
      response,
      update: vi.fn(),
      interrupt: vi.fn(),
    });
    channel.emit('session.input_transcript.delta', {
      event_id: 'slow-input',
      delta: 'Besvara frågan.',
      start_ms: 0,
      end_ms: 100,
    });
    channel.emit('session.delegation.created', {
      offset_ms: 100,
      delegation: { id: 'slow-task', target: 'client' },
    });
    await vi.advanceTimersByTimeAsync(2100);
    expect(channel.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session.instructions.append', delegation_id: 'slow-task' }),
    );
    channel.send.mockClear();
    vi.setSystemTime(Date.now() + 11 * 60_000);
    await vi.advanceTimersByTimeAsync(100);
    expect(work.readyForSummary()).toBe(false);
    expect(channel.send).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([path]) => path === 'cancel')).toBe(false);
    if (action === 'stop') await work.stop();
    completed = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(failed).not.toHaveBeenCalled();
    if (action === 'complete') {
      expect(work.readyForSummary()).toBe(false);
      for (const [event] of channel.send.mock.calls)
        if (event.type === 'session.thinking.append')
          channel.emit('session.thinking.appended', { client_event_id: event.event_id });
    }
    expect(work.readyForSummary()).toBe(true);
    if (action === 'complete') expect(response).toHaveBeenCalledOnce();
    else {
      expect(response).not.toHaveBeenCalled();
      expect(request.mock.calls.some(([path]) => path === 'cancel')).toBe(true);
    }
  },
);

test.each(['receipt', 'answer', 'stopped'])(
  'new speech during the delivery wait preserves only a current verified save: %s',
  { tags: ['technical'] },
  async (variant) => {
    vi.useFakeTimers();
    const initial: TextAssistantView = {
      id: 'save-delivery',
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
    const view: TextAssistantView = {
      ...initial,
      revision: 1,
      modelReply: 'Old answer',
      questionPending: true,
      saveCheck: { id: 'old-check', reply: 'Old save check', operations: [] },
      ...(variant === 'answer'
        ? {}
        : {
            receipt: {
              operationId: 'verified-operation',
              householdId: 'home',
              userId: 'alex',
              draftVersion: 1,
              contentVersion: 2,
              savedAt: '2026-10-11T10:00:00Z',
              changes: [],
            },
          }),
    };
    const send = vi.fn();
    const channel = Object.assign(new EventEmitter(), { send });
    const response = vi.fn();
    const update = vi.fn();
    let finish: (view: TextAssistantView) => void = () => {};
    const result = new Promise<TextAssistantView>((resolve) => {
      finish = resolve;
    });
    const request = vi.fn(async (action?: string) => (action === 'messages' ? result : initial));
    const work = voiceWork({
      channel: channel as unknown as LiveSideband,
      initial,
      response,
      update,
      failed: vi.fn(),
      interrupt: vi.fn(),
      request,
    });
    const speech = (id: string) =>
      channel.emit('session.input_transcript.delta', {
        event_id: id,
        delta: id === 'first' ? 'Spara.' : 'Nästa fråga.',
        start_ms: 0,
        end_ms: 100,
      });
    speech('first');
    channel.emit('session.delegation.created', {
      offset_ms: 100,
      delegation: { id: 'save-task', target: 'client' },
    });
    await vi.advanceTimersByTimeAsync(2100);
    expect(request.mock.calls.some(([action]) => action === 'messages')).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session.instructions.append', delegation_id: 'save-task' }),
    );
    send.mockClear();
    work.activity(true);
    finish(view);
    await vi.advanceTimersByTimeAsync(100);
    expect(send).not.toHaveBeenCalled();
    work.activity(false);
    speech('next');
    if (variant === 'stopped') await work.stop();
    await vi.advanceTimersByTimeAsync(50);
    if (variant === 'receipt') {
      expect(send).toHaveBeenCalledExactlyOnceWith({
        type: 'session.commentary.append',
        delegation_id: 'save-task',
        content: 'Sparat.',
      });
      expect(response).toHaveBeenCalledExactlyOnceWith({
        id: 'save-delivery:1',
        revision: 1,
        text: 'Sparat.',
        questionPending: false,
        receiptOperationId: 'verified-operation',
      });
    } else {
      expect(send).not.toHaveBeenCalled();
      expect(response).not.toHaveBeenCalled();
    }
    if (variant !== 'stopped') expect(update).toHaveBeenCalledExactlyOnceWith(view, false);
    expect(work.readyForSummary()).toBe(variant === 'stopped');
  },
);

test('a late verified receipt is spoken without replacing the newer response', {
  tags: ['technical'],
}, async () => {
  vi.useFakeTimers();
  const initial: TextAssistantView = {
    id: 'overlapping-voice',
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
  let finishSave: (view: TextAssistantView) => void = () => {};
  const save = new Promise<TextAssistantView>((resolve) => {
    finishSave = resolve;
  });
  const latest: TextAssistantView = {
    ...initial,
    revision: 2,
    taskStatus: 'completed',
    modelReply: 'Ett senare svar.',
  };
  const request = vi.fn(async (action?: string, body?: unknown) => {
    if (action !== 'messages') return initial;
    return (body as { text: string }).text === 'Spara utkastet.' ? save : latest;
  });
  const channel = Object.assign(new EventEmitter(), { send: vi.fn() });
  const response = vi.fn();
  const update = vi.fn();
  const work = voiceWork({
    channel: channel as unknown as LiveSideband,
    initial,
    request,
    response,
    update,
    failed: vi.fn(),
    interrupt: vi.fn(),
  });
  const speak = (id: string, text: string, start: number) => {
    channel.emit('session.input_transcript.delta', {
      event_id: id,
      delta: text,
      start_ms: start,
      end_ms: start + 100,
    });
    channel.emit('session.delegation.created', {
      offset_ms: start + 100,
      delegation: { id, target: 'client' },
    });
  };

  speak('save', 'Spara utkastet.', 0);
  await vi.advanceTimersByTimeAsync(2100);
  speak('read', 'Vad ändrades?', 3000);
  await vi.advanceTimersByTimeAsync(2100);
  for (const [event] of [...channel.send.mock.calls])
    if (event.type === 'session.thinking.append')
      channel.emit('session.thinking.appended', { client_event_id: event.event_id });
  expect(response).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      revision: 2,
      text: expect.stringContaining('Ett senare svar.'),
    }),
  );
  finishSave({
    ...initial,
    revision: 1,
    taskStatus: 'completed',
    receipt: {
      operationId: 'previous-save',
      householdId: 'home',
      userId: 'alex',
      draftVersion: 2,
      contentVersion: 1,
      savedAt: '2026-10-11T10:00:00Z',
      changes: [],
    },
  });
  await vi.advanceTimersByTimeAsync(50);
  expect(channel.send).toHaveBeenCalledWith({
    type: 'session.commentary.append',
    delegation_id: 'save',
    content: 'Sparat.',
  });
  expect(response).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledExactlyOnceWith(latest, false);
  work.retire();
});
