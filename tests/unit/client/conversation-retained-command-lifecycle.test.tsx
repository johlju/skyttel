import { act, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
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
    modelChoice: { model: 'gpt-6.1-sol', effort: 'high' },
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

test('the retained list prevents concurrent opening and rejects unsent text before any switch', async () => {
  const waiting = deferredResponse();
  let reads = 0;
  const { result, commands } = await conversationCommands((path) => {
    if (path.endsWith('/retained')) {
      reads++;
      return waiting.promise;
    }
    if (path.endsWith('/open')) return Response.json(earlier);
  });
  let reading!: Promise<void>;
  act(() => {
    reading = requiredCommand(result.current.listRetained)();
  });
  await act(async () => requiredCommand(result.current.listRetained)());
  expect(await requiredCommand(result.current.openRetained)('earlier')).toBe(false);
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
  expect(opened).toBe(false);
  expect(result.current.error).toContain('Skicka eller töm meddelandefältet');
  expect(result.current.text).toBe('Jag har inte skickat detta.');
  expect(commands).toEqual([]);
  act(() => result.current.setText(''));
  await act(async () => {
    opened = await requiredCommand(result.current.openRetained)('earlier');
  });
  expect(opened).toBe(true);
  expect(commands.map((entry) => entry.path.split('/').at(-1))).toEqual(['pause', 'open']);
  expect(result.current.session?.id).toBe('earlier');
  expect(result.current.session?.paused).toBe(true);
  expect(result.current.transcript.map((row) => row.text)).toEqual([
    'Det valda tidigare samtalet.',
  ]);
  expect(result.current.retainedConversations).toBeUndefined();
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
  expect(result.current.unknown).toBe(true);
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
  'opening a retained conversation rejected with %s removes inaccessible private text',
  async (status) => {
    const { result, onAccessLost } = await conversationCommands((path) =>
      path.endsWith('/open') ? Response.json({ error: 'not_found' }, { status }) : undefined,
    );
    let opened!: boolean;
    await act(async () => {
      opened = await requiredCommand(result.current.openRetained)('earlier');
    });
    expect(opened).toBe(false);
    expect(result.current.session).toBeNull();
    expect(result.current.transcript).toEqual([]);
    expect(result.current.pending).toBe(false);
    expect(onAccessLost).toHaveBeenCalledTimes(status === 403 ? 1 : 0);
  },
);

test('a delayed retained opening cannot insert the previous household transcript into a replacement', async () => {
  const waiting = deferredResponse();
  const { result, rerender } = await conversationCommands((path) =>
    path.endsWith('/open') ? waiting.promise : undefined,
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
  expect(result.current.session?.id).toBe('original');
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Tidigare privat samtal.']);
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
      body: { consent: { textVersion: 4 } },
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
  expect(result.current.session?.paused).toBe(true);
  expect(result.current.pending).toBe(false);
});
