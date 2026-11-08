import { act, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import {
  commandConversation,
  conversationCommands,
  deferredResponse,
  requiredCommand,
} from '../../support/conversation-hook.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const failed: TextAssistantView = {
  ...commandConversation,
  phase: 'error',
  workFailure: {
    requestId: 'original-task',
    request: 'Lägg till Mira.',
    code: 'assistant_unavailable',
    message: 'Arbetet avbröts. Utkastet finns kvar.',
  },
};

test.each(['retry', 'abandon'] as const)(
  'an explicit %s identifies only the failed request and preserves unsent text',
  async (action) => {
    const { result, commands } = await conversationCommands(
      (path) =>
        path.endsWith(`/${action}-work`)
          ? Response.json({
              ...failed,
              revision: 4,
              workFailure: undefined,
              phase: action === 'retry' ? 'working' : 'ready',
            })
          : undefined,
      failed,
    );
    act(() => result.current.setText('Ett separat oskickat ärende.'));
    await act(async () => {
      if (action === 'retry') await requiredCommand(result.current.retryWork)();
      else await requiredCommand(result.current.abandonWork)();
    });
    expect(commands).toEqual([
      {
        path: `/api/households/linden/text-assistant/original/${action}-work`,
        body: { revision: 3, requestId: 'original-task', deliveryAudio: false },
      },
    ]);
    expect(result.current.session?.workFailure).toBeUndefined();
    expect(result.current.text).toBe('Ett separat oskickat ärende.');
    expect(result.current.pending).toBe(false);
  },
);

test.each(['no failed work', 'paused'] as const)(
  'retry and abandonment leave %s untouched',
  async (situation) => {
    const view = situation === 'paused' ? { ...failed, paused: true } : commandConversation;
    const { result, commands } = await conversationCommands(() => undefined, view);
    await act(async () => {
      await requiredCommand(result.current.retryWork)();
      await requiredCommand(result.current.abandonWork)();
    });
    expect(commands).toEqual([]);
    expect(result.current.session).toEqual(view);
  },
);

test('retry refuses to start when authenticated result delivery cannot connect', async () => {
  const delivery = { connect: vi.fn(async () => undefined), received: vi.fn() };
  const { result, commands } = await conversationCommands(() => undefined, failed, true, delivery);
  delivery.connect.mockClear();
  await act(async () => requiredCommand(result.current.retryWork)());
  expect(delivery.connect).toHaveBeenCalledExactlyOnceWith(
    '/api/households/linden/text-assistant/original',
  );
  expect(commands).toEqual([]);
  expect(result.current.error).toContain('anslut');
  expect(result.current.session?.workFailure).toEqual(failed.workFailure);
  expect(result.current.pending).toBe(false);
  await act(async () => requiredCommand(result.current.abandonWork)());
  expect(delivery.connect).toHaveBeenCalledOnce();
  expect(commands.map((entry) => entry.path.split('/').at(-1))).toEqual(['abandon-work']);
});

test('retry acknowledges only the admitted task delivery and prevents repeat commands while awaiting the server', async () => {
  const waiting = deferredResponse();
  const accepted = {
    taskId: 'original-task',
    deadline: 2_000_000_000_000,
    state: 'waiting' as const,
  };
  const connection = { id: 'delivery-connection', observeAccepted: vi.fn() };
  const delivery = { connect: vi.fn(async () => connection), received: vi.fn() };
  const { result, commands } = await conversationCommands(
    (path) => (path.endsWith('/retry-work') ? waiting.promise : undefined),
    failed,
    true,
    delivery,
  );
  let retrying!: Promise<void>;
  act(() => {
    retrying = requiredCommand(result.current.retryWork)();
  });
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await requiredCommand(result.current.retryWork)();
    await requiredCommand(result.current.abandonWork)();
  });
  expect(commands).toHaveLength(1);
  expect(commands[0].body).toMatchObject({
    requestId: 'original-task',
    deliveryConnectionId: connection.id,
  });
  expect(connection.observeAccepted).not.toHaveBeenCalled();
  await act(async () => {
    waiting.resolve(
      Response.json({
        ...failed,
        phase: 'working',
        tasks: [
          {
            id: 'original-task',
            receivedAt: 1_000_000_000_000,
            deadline: 2_000_000_000_000,
            status: 'working',
            delivery: accepted,
          },
        ],
      }),
    );
    await retrying;
  });
  expect(connection.observeAccepted).toHaveBeenCalledExactlyOnceWith(accepted);
  expect(result.current.working).toBe(true);
  expect(result.current.pending).toBe(false);
});

test.each(['retry', 'abandon'] as const)(
  'a failed %s retains failed work and private text for an explicit next action',
  async (action) => {
    const { result } = await conversationCommands(
      (path) =>
        path.endsWith(`/${action}-work`)
          ? Response.json({ error: 'request_failed' }, { status: 503 })
          : undefined,
      failed,
    );
    await act(async () => {
      if (action === 'retry') await requiredCommand(result.current.retryWork)();
      else await requiredCommand(result.current.abandonWork)();
    });
    expect(result.current.session?.workFailure).toEqual(failed.workFailure);
    expect(result.current.transcript.map((row) => row.text)).toEqual(['Tidigare privat samtal.']);
    expect(result.current.unknown).toBe(true);
    expect(result.current.pending).toBe(false);
  },
);

test('a late delivery connection cannot submit failed work after leaving the household', async () => {
  const connected = { id: 'late-valid-delivery', observeAccepted: vi.fn() };
  let release!: (value: typeof connected) => void;
  const connection = new Promise<typeof connected>((resolve) => {
    release = resolve;
  });
  const delivery = { connect: vi.fn(() => connection), received: vi.fn() };
  const { result, rerender, commands } = await conversationCommands(
    () => undefined,
    failed,
    true,
    delivery,
  );
  let retrying!: Promise<void>;
  act(() => {
    retrying = requiredCommand(result.current.retryWork)();
  });
  rerender({ householdId: 'other-household' });
  await act(async () => {
    release(connected);
    await retrying;
  });
  expect(commands.filter((entry) => entry.path.endsWith('/retry-work'))).toEqual([]);
  expect(result.current.session?.workFailure).toEqual(failed.workFailure);
});

test.each(['retry', 'abandon'] as const)(
  'a late %s response cannot restore old failed work after leaving the household',
  async (action) => {
    const waiting = deferredResponse();
    const { result, rerender } = await conversationCommands(
      (path) => (path.endsWith(`/${action}-work`) ? waiting.promise : undefined),
      failed,
    );
    let resolving!: Promise<void>;
    act(() => {
      resolving =
        action === 'retry'
          ? requiredCommand(result.current.retryWork)()
          : requiredCommand(result.current.abandonWork)();
    });
    await act(async () => {
      await Promise.resolve();
    });
    rerender({ householdId: 'other-household' });
    await act(async () => {
      waiting.resolve(Response.json({ ...failed, phase: 'ready', workFailure: undefined }));
      await resolving;
    });
    expect(result.current.session?.workFailure).toEqual(failed.workFailure);
  },
);
