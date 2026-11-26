import { act, cleanup, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { ConversationList } from '../../../src/client/ConversationList.js';
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

const retained = [
  {
    id: 'earlier',
    title: 'Ett tidigare privat ärende',
    expiresAt: 2_000_000_000_000,
    paused: true,
    modelChoice: { model: 'gpt-6.2-sol', effort: 'high' },
  },
];
const earlier = {
  ...commandConversation,
  id: 'earlier',
  paused: true,
  conversation: [
    { role: 'assistant' as const, text: 'Det valda tidigare samtalet.' },
    { role: 'assistant' as const, text: 'Ett fel som visas i notisen.', notice: true },
  ],
};

test('opening a listed conversation preserves unsent text and list order', async () => {
  const waiting = deferredResponse();
  let reads = 0;
  const { result, commands } = await conversationCommands((path) => {
    if (path.endsWith('/retained')) {
      reads++;
      return waiting.promise;
    }
    if (path.endsWith('/earlier/open')) return Response.json(earlier);
  });
  let reading!: Promise<void>;
  act(() => {
    reading = requiredCommand(result.current.listRetained)();
  });
  expect(reads).toBe(1);
  await act(async () => {
    waiting.resolve(Response.json({ conversations: retained }));
    await reading;
  });
  expect(result.current.retainedConversations).toEqual(retained);
  act(() => result.current.setText('Jag har inte skickat detta.'));
  let opened!: boolean;
  await act(async () => {
    opened = await requiredCommand(result.current.openRetained)('earlier');
  });
  expect(result.current.text).toBe('Jag har inte skickat detta.');
  expect(opened).toBe(true);
  expect(commands.map((entry) => entry.path.split('/').at(-1))).toEqual(['pause']);
  expect(result.current.session?.id).toBe('earlier');
  expect(result.current.session?.paused).toBe(true);
  expect(result.current.transcript.map((row) => row.text)).toEqual([
    'Det valda tidigare samtalet.',
  ]);
  expect(result.current.retainedConversations).toEqual(retained);
});

test('a rejected retained-list read can be explicitly retried without erasing the current conversation', async () => {
  let failed = true;
  const { result } = await conversationCommands((path) => {
    if (path.endsWith('/retained'))
      return failed
        ? Response.json({ error: 'request_failed' }, { status: 503 })
        : Response.json({ conversations: retained });
  });
  await act(async () => requiredCommand(result.current.listRetained)());
  expect(result.current.listError).toContain('Samtalslistan');
  expect(result.current.pending).toBe(false);
  expect(result.current.retainedConversations).toBeUndefined();
  expect(result.current.session?.id).toBe('original');
  failed = false;
  await act(async () => requiredCommand(result.current.listRetained)());
  expect(result.current.retainedConversations).toEqual(retained);
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Tidigare privat samtal.']);
});

test('a retained-list response from a departed household cannot expose its private titles', async () => {
  const waiting = deferredResponse();
  const { result, rerender } = await conversationCommands((path) =>
    path.endsWith('/retained') ? waiting.promise : undefined,
  );
  let reading!: Promise<void>;
  act(() => {
    reading = requiredCommand(result.current.listRetained)();
  });
  rerender({ householdId: 'other-household' });
  await act(async () => {
    waiting.resolve(Response.json({ conversations: retained }));
    await reading;
  });
  expect(result.current.retainedConversations).toBeUndefined();
});

test.each([403, 404])(
  'opening a retained conversation rejected with %s preserves the current view only when access remains',
  async (status) => {
    const { result, onAccessLost } = await conversationCommands((path) =>
      path.endsWith('/earlier/open')
        ? Response.json({ error: 'not_found' }, { status })
        : undefined,
    );
    let opened!: boolean;
    await act(async () => {
      opened = await requiredCommand(result.current.openRetained)('earlier');
    });
    expect(opened).toBe(false);
    if (status === 403) {
      expect(result.current.session).toBeNull();
      expect(result.current.transcript).toEqual([]);
    } else {
      expect(result.current.session?.id).toBe('original');
    }
    expect(result.current.pending).toBe(false);
    expect(onAccessLost).toHaveBeenCalledTimes(status === 403 ? 1 : 0);
  },
);

test('a delayed retained opening cannot insert the previous household transcript into a replacement', async () => {
  const waiting = deferredResponse();
  const { result, rerender } = await conversationCommands((path) =>
    path.endsWith('/earlier/open') ? waiting.promise : undefined,
  );
  let opening!: Promise<boolean>;
  act(() => {
    opening = requiredCommand(result.current.openRetained)('earlier');
  });
  await act(async () => {
    await Promise.resolve();
  });
  rerender({ householdId: 'other-household' });
  await act(async () => {
    waiting.resolve(Response.json(earlier));
    expect(await opening).toBe(false);
  });
  expect(result.current.session).toBeNull();
  expect(result.current.transcript).toEqual([]);
});

test('resuming a paused conversation waits for explicit consent and resumes only after approval', async () => {
  const { result, commands } = await conversationCommands(
    (path) =>
      path.endsWith('/resume')
        ? Response.json({
            ...commandConversation,
            paused: false,
            revision: 4,
            modelReply: undefined,
          })
        : undefined,
    { ...commandConversation, paused: true },
    false,
  );
  await act(async () => requiredCommand(result.current.resumeConversation)());
  expect(result.current.consent.asking).toBe('text');
  expect(commands).toEqual([]);
  await act(async () => result.current.approve(false));
  expect(result.current.session?.paused).toBe(false);
  expect(commands).toEqual([
    {
      path: '/api/households/linden/text-assistant/original/resume',
      body: { consent: { textVersion: 5 } },
    },
  ]);
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Tidigare privat samtal.']);
});

test('a server rejection of stale consent asks again while retaining the paused conversation', async () => {
  const { result } = await conversationCommands(
    (path) =>
      path.endsWith('/resume')
        ? Response.json({ error: 'conversation_consent_required' }, { status: 403 })
        : undefined,
    { ...commandConversation, paused: true },
  );
  await act(async () => requiredCommand(result.current.resumeConversation)());
  expect(result.current.session?.paused).toBe(true);
  expect(result.current.consent.asking).toBe('text');
  expect(result.current.consent.valid).toBe(false);
  expect(result.current.pending).toBe(false);
});

test('a paused resume ignores repeat presses and a late result after household departure', async () => {
  const waiting = deferredResponse();
  const { result, commands, rerender } = await conversationCommands(
    (path) => (path.endsWith('/resume') ? waiting.promise : undefined),
    { ...commandConversation, paused: true },
  );
  let resuming!: Promise<void>;
  act(() => {
    resuming = requiredCommand(result.current.resumeConversation)();
  });
  await act(async () => requiredCommand(result.current.resumeConversation)());
  expect(commands).toHaveLength(1);
  rerender({ householdId: 'other-household' });
  await act(async () => {
    waiting.resolve(Response.json({ ...commandConversation, paused: false }));
    await resuming;
  });
  expect(result.current.session).toBeNull();
  expect(result.current.pending).toBe(false);
});

test('review regression: a typed new conversation leaves a passive selection untouched', async () => {
  const passive = { ...commandConversation, requiresActivation: true, paused: true };
  const { result, commands } = await conversationCommands(
    (path, body) =>
      body && path.endsWith('/text-assistant')
        ? Response.json({ ...commandConversation, id: 'fresh' })
        : undefined,
    passive,
  );
  act(() => result.current.setText('Nytt samtal'));
  await act(async () => result.current.send());
  expect(commands.map(({ path }) => path)).toEqual(['/api/households/linden/text-assistant']);
  expect(result.current.session?.id).toBe('fresh');
  expect(result.current.text).toBe('');
});

test('review regression: list polling serializes slow and failed reads until unmount', async () => {
  const { result } = await conversationCommands(() => undefined);
  let rejectFirst!: (error: Error) => void;
  let finishSecond!: () => void;
  const read = vi
    .fn<() => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecond = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  vi.useFakeTimers();
  try {
    const list = render(
      <StrictMode>
        <ConversationList
          id="conversations"
          conversation={{ ...result.current, listRetained: read }}
          onSelected={() => {}}
        />
      </StrictMode>,
    );
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(read).toHaveBeenCalledTimes(1);
    rejectFirst(new Error('offline'));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(read).toHaveBeenCalledTimes(2);
    finishSecond();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(read).toHaveBeenCalledTimes(3);
    list.unmount();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(read).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

test.each([true, false])(
  'an older list read cannot replace a newer list or its error, older read succeeds: %s',
  async (succeeds) => {
    const older = deferredResponse();
    let first = true;
    const { result } = await conversationCommands((path) => {
      if (!path.endsWith('/retained')) return;
      if (first) {
        first = false;
        return older.promise;
      }
      return Response.json({ conversations: retained });
    });
    let pending!: Promise<void>;
    act(() => {
      pending = requiredCommand(result.current.listRetained)();
    });
    await act(async () => requiredCommand(result.current.listRetained)());
    await act(async () => {
      older.resolve(
        succeeds ? Response.json({ conversations: [] }) : new Response(null, { status: 503 }),
      );
      await pending;
    });
    expect(result.current.retainedConversations).toEqual(retained);
    expect(result.current.listError).toBe('');
  },
);

test('an expired selection removes only its own row and preserves the visible conversation', async () => {
  const { result } = await conversationCommands((path) => {
    if (path.endsWith('/retained'))
      return Response.json({ conversations: [...retained, { ...retained[0], id: 'other' }] });
    if (path.endsWith('/earlier/open')) return new Response(null, { status: 404 });
  });
  await act(async () => requiredCommand(result.current.listRetained)());
  await act(async () => {
    expect(await requiredCommand(result.current.openRetained)('earlier')).toBe(false);
  });
  expect(result.current.retainedConversations?.map((row) => row.id)).toEqual(['other']);
  expect(result.current.session?.id).toBe('original');
});

test('deleting the selected conversation preserves unsent text and ignores a stale list response', async () => {
  const stale = deferredResponse();
  const rows = [...retained, { ...retained[0], id: 'original' }];
  let reads = 0;
  const { result } = await conversationCommands((path) => {
    if (path.endsWith('/retained'))
      return reads++ === 0 ? Response.json({ conversations: rows }) : stale.promise;
    if (path.endsWith('/retained/original/delete')) return Response.json({ deleted: true });
  });
  await act(async () => requiredCommand(result.current.listRetained)());
  act(() => result.current.setText('Min oskickade text'));
  let reading!: Promise<void>;
  act(() => {
    reading = requiredCommand(result.current.listRetained)();
  });
  await act(async () => {
    expect(await requiredCommand(result.current.deleteRetained)('original')).toBeUndefined();
    stale.resolve(Response.json({ conversations: rows }));
    await reading;
  });
  expect(result.current.session).toBeNull();
  expect(result.current.transcript).toEqual([]);
  expect(result.current.retainedConversations).toEqual(retained);
  expect(result.current.text).toBe('Min oskickade text');
});

test.each(['busy', 'paused', 'ready'] as const)(
  'a typed message in a passive conversation respects the %s activation outcome',
  async (outcome) => {
    const passive = { ...commandConversation, requiresActivation: true };
    const { result, commands } = await conversationCommands((path, body) => {
      if (body?.activate) {
        if (outcome === 'busy')
          return Response.json({ error: 'assistant_conversation_busy' }, { status: 409 });
        return Response.json({ ...commandConversation, paused: outcome === 'paused' });
      }
      if (path.endsWith('/messages')) return Response.json(commandConversation);
    }, passive);
    act(() => result.current.setText('Var finns cykeln?'));
    await act(async () => result.current.send());
    expect(commands[0].body).toEqual({ activate: true });
    const sent = commands.filter((entry) => entry.path.endsWith('/messages'));
    if (outcome === 'ready')
      expect(sent.map((entry) => entry.body.text)).toEqual(['Var finns cykeln?']);
    else {
      expect(sent).toEqual([]);
      expect(result.current.text).toBe('Var finns cykeln?');
      if (outcome === 'busy') expect(result.current.error).toContain('annan enhet');
    }
  },
);

test.each(['same', 'changed'] as const)(
  'resuming interrupted work rechecks the %s request after activation',
  async (identity) => {
    const passive = {
      ...commandConversation,
      requiresActivation: true,
      interruptedRequestId: 'interrupted',
    };
    const { result, commands } = await conversationCommands((path, body) => {
      if (body?.activate)
        return Response.json({
          ...commandConversation,
          interruptedRequestId: identity === 'same' ? 'interrupted' : 'replacement',
        });
      if (path.endsWith('/resume')) return Response.json(commandConversation);
    }, passive);
    await act(async () => requiredCommand(result.current.resumeConversation)('unrelated'));
    expect(commands).toEqual([]);
    await act(async () => requiredCommand(result.current.resumeConversation)('interrupted'));
    expect(commands.map((entry) => entry.body)).toEqual(
      identity === 'same'
        ? [{ activate: true }, { requestId: 'interrupted' }]
        : [{ activate: true }],
    );
    expect(result.current.session?.interruptedRequestId).toBe(
      identity === 'same' ? undefined : 'replacement',
    );
  },
);

test.each(['retry', 'abandon'] as const)(
  'the selected %s action is sent once for the activated failed request',
  async (action) => {
    const workFailure = {
      requestId: 'failed',
      request: 'Hitta cykeln.',
      code: 'assistant_model_temporary',
      message: 'Försök igen.',
    };
    const { result, commands } = await conversationCommands(
      (_, body) => {
        if (body?.activate) return Response.json({ ...commandConversation, workFailure });
        if (body?.requestId === 'failed') return Response.json(commandConversation);
      },
      { ...commandConversation, requiresActivation: true, workFailure },
    );
    await act(async () =>
      requiredCommand(action === 'retry' ? result.current.retryWork : result.current.abandonWork)(),
    );
    expect(commands.map((entry) => entry.path.split('/').at(-1))).toEqual([
      'open',
      `${action}-work`,
    ]);
    expect(commands[1].body.requestId).toBe('failed');
    expect(result.current.session?.workFailure).toBeUndefined();
  },
);

test.each([true, false])(
  'a reset approved for a visit preserves text edited during creation: %s',
  async (edit) => {
    const waiting = deferredResponse();
    const { result, commands } = await conversationCommands(
      (path, body) => (path.endsWith('/text-assistant') && body ? waiting.promise : undefined),
      { ...commandConversation, requiresActivation: true },
      false,
    );
    act(() => result.current.setText('Nytt samtal'));
    await act(async () => result.current.send());
    expect(result.current.consent.asking).toBe('text');
    expect(commands).toEqual([]);
    let approval!: Promise<void>;
    act(() => {
      approval = result.current.approve(false);
    });
    if (edit) act(() => result.current.setText('En ny fråga.'));
    await act(async () => {
      waiting.resolve(Response.json({ ...commandConversation, id: 'new-id' }));
      await approval;
    });
    expect(commands.map((entry) => entry.body)).toEqual([{ consent: { textVersion: 5 } }]);
    expect(result.current.session?.id).toBe('new-id');
    expect(result.current.text).toBe(edit ? 'En ny fråga.' : '');
  },
);

test('a second household cannot receive a transcript after the first conversation was paused for switching', async () => {
  const paused = deferredResponse();
  const { result, rerender, commands } = await conversationCommands((path) => {
    if (path.endsWith('/earlier/open')) return Response.json(earlier);
    if (path.endsWith('/original/pause')) return paused.promise;
  });
  let opening!: Promise<boolean>;
  await act(async () => {
    opening = requiredCommand(result.current.openRetained)('earlier');
  });
  expect(commands.at(-1)?.path).toContain('/original/pause');
  rerender({ householdId: 'different' });
  await act(async () => {
    paused.resolve(Response.json(commandConversation));
    expect(await opening).toBe(false);
  });
  expect(result.current.session).toBeNull();
  expect(result.current.transcript).toEqual([]);
});

test('reopening speech joins related continuations across notices and preserves separate turns and the interrupted request id', async () => {
  const { result } = await conversationCommands(() => undefined, {
    ...commandConversation,
    interruptedRequestId: 'correction',
    conversation: [
      { role: 'user', text: 'Var ', partial: true, utteranceStart: true },
      { role: 'assistant', text: 'Jag ', partial: true, utteranceStart: true },
      { role: 'assistant', text: 'Dold notis', notice: true },
      {
        role: 'user',
        text: 'är cykeln?',
        partial: true,
        utteranceStart: false,
        requestId: 'correction',
      },
      { role: 'assistant', text: 'letar.', partial: true, utteranceStart: false },
      { role: 'user', text: 'En annan ', partial: true },
      { role: 'user', text: 'fråga.', partial: true },
      { role: 'user', text: 'Skriven fråga.', requestId: 'typed' },
    ],
  });
  expect(result.current.transcript.map(({ role, text }) => ({ role, text }))).toEqual([
    { role: 'user', text: 'Var är cykeln?' },
    { role: 'assistant', text: 'Jag letar.' },
    { role: 'user', text: 'En annan fråga.' },
    { role: 'user', text: 'Skriven fråga.' },
  ]);
  expect(result.current.transcript[0].id).toBe(result.current.session?.interruptedRequestId);
  expect(result.current.transcript[3].id).toBe('typed');
});

test.each([true, false])(
  'paused speech gets one continuation target even when its stored transcript row exists: %s',
  async (stored) => {
    const text = 'Leta efter cykeln.';
    const { result } = await conversationCommands(() => undefined, {
      ...commandConversation,
      paused: true,
      interruptedRequestId: 'stopped',
      interruptedSpeech: text,
      conversation: stored
        ? [{ role: 'user', text }]
        : [{ role: 'assistant', text: 'Jag lyssnar.' }],
      queuedRequests: [
        { id: 'spoken', text, source: 'voice' },
        { id: 'written', text: 'Kontrollera garaget.', source: 'text' },
      ],
    });
    expect(
      result.current.transcript.filter((row) => row.text === text).map((row) => row.id),
    ).toEqual(['stopped']);
    expect(result.current.transcript.at(-1)).toMatchObject({
      id: 'written',
      text: 'Kontrollera garaget.',
    });
  },
);
