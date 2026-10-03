import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useConversation } from '../../../src/client/use-conversation.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

const path = '/api/households/linden/text-assistant';
const initial: TextAssistantView = {
  id: 'session',
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
const callbacks = {
  householdId: 'linden',
  onStarted: () => {},
  onMapChange: () => {},
  onAccessLost: () => {},
  onSelectItem: async () => false,
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup(
  post: (url: string, body: Record<string, unknown>) => Response | Promise<Response>,
  props: Parameters<typeof useConversation>[0] = callbacks,
) {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return post(url, JSON.parse(String(init.body)));
    if (url === path) return Response.json({ available: true });
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.endsWith('/map/operations')) return Response.json({ operations: [] });
    return Response.json(initial);
  });
  const hook = renderHook(() => useConversation(props));
  await tick(0);
  act(() => hook.result.current.begin('text'));
  await act(async () => hook.result.current.approve(false));
  await tick(0);
  expect(hook.result.current.session?.id).toBe('session');
  return hook;
}

test('an accepted slow message preserves newer unsent text while its answer is appended once', async () => {
  const held = deferred<Response>();
  const { result } = await setup((url) =>
    url.endsWith('/messages') ? held.promise : Response.json(initial),
  );
  act(() => result.current.setText('Det skickade uppdraget.'));
  let request!: Promise<void>;
  act(() => {
    request = result.current.send();
  });
  act(() => result.current.setText('Nästa oskickade uppdrag.'));
  await act(async () => {
    held.resolve(
      Response.json({ ...initial, revision: 1, modelReply: 'Svaret på det första uppdraget.' }),
    );
    await request;
  });
  expect(result.current.text).toBe('Nästa oskickade uppdrag.');
  expect(result.current.transcript.map((row) => row.text)).toEqual([
    'Det skickade uppdraget.',
    'Svaret på det första uppdraget.',
  ]);
  expect(result.current.pending).toBe(false);
});

test.each([false, true])(
  'a new conversation retires a late message response (failure=%s) and keeps newly edited unsent text',
  async (failure) => {
    const held = deferred<Response>();
    const reset = deferred<Response>();
    const posts: string[] = [];
    const { result } = await setup((url) => {
      posts.push(url);
      if (url.endsWith('/messages')) return held.promise;
      if (url.endsWith('/new')) return reset.promise;
      return Response.json(initial);
    });
    act(() => result.current.setText('Gammalt uppdrag.'));
    let message!: Promise<void>;
    act(() => {
      message = result.current.send();
    });
    let newConversation!: Promise<void>;
    act(() => {
      newConversation = result.current.newConversation();
    });
    await act(async () => result.current.newConversation());
    expect(posts.filter((url) => url.endsWith('/new'))).toHaveLength(1);
    act(() => result.current.setText('Oskickat i det nya samtalet.'));
    await act(async () => {
      reset.resolve(
        Response.json({
          ...initial,
          revision: 2,
          contextRevision: 1,
          reply: 'Nytt samtal. Utkastet ligger kvar.',
          replyVoiced: false,
        }),
      );
      await newConversation;
    });
    await act(async () => {
      held.resolve(
        failure
          ? Response.json({ error: 'old_error' }, { status: 503 })
          : Response.json({ ...initial, revision: 1, modelReply: 'Gammalt privat svar.' }),
      );
      await message;
    });
    expect(result.current.transcript.map((row) => row.text)).toEqual([
      'Nytt samtal. Utkastet ligger kvar.',
    ]);
    expect(result.current.transcript[0]).toMatchObject({ voiced: false, voicePending: false });
    expect(result.current.text).toBe('Oskickat i det nya samtalet.');
    expect(result.current.unknown).toBe(false);
    expect(result.current.pending).toBe(false);
  },
);

test('a canceled task clears its queue but retains unsent text and earlier assistant replies', async () => {
  const posts: { url: string; body: unknown }[] = [];
  let latest: TextAssistantView = initial;
  const { result } = await setup((url, body) => {
    posts.push({ url, body });
    if (url.endsWith('/messages'))
      latest = {
        ...initial,
        revision: 1,
        phase: 'working',
        queuedMessages: 2,
        completedReplies: [
          {
            id: 'earlier',
            revision: 1,
            text: 'Tidigare kontrollerat svar.',
            source: 'text',
            voiced: false,
          },
        ],
      };
    if (url.endsWith('/cancel'))
      latest = { ...latest, revision: 2, phase: 'ready', queuedMessages: 0, canceled: true };
    return Response.json(latest);
  });
  act(() => result.current.setText('Ett uppdrag.'));
  await act(async () => result.current.send());
  act(() => result.current.setText('Oskickat efter stopp.'));
  await act(async () => result.current.cancel());
  expect(result.current.working).toBe(false);
  expect(result.current.session?.queuedMessages).toBe(0);
  expect(result.current.text).toBe('Oskickat efter stopp.');
  expect(
    result.current.transcript.filter((row) => row.role === 'assistant').map((row) => row.text),
  ).toEqual(['Tidigare kontrollerat svar.']);
  expect(posts.find((request) => request.url.endsWith('/cancel'))?.body).toEqual({
    revision: 1,
    all: true,
  });
});

test.each(['object', 'relationship', 'failed', 'throw'] as const)(
  'a server-requested map selection is acknowledged only after its public display callback (%s)',
  async (mode) => {
    const selected = deferred<boolean>();
    const display = vi.fn(async () => {
      if (mode === 'throw') throw Error('cannot show');
      return selected.promise;
    });
    const acks: Record<string, unknown>[] = [];
    const selection =
      mode === 'relationship'
        ? { kind: 'relationship' as const, id: 'owns', revision: 1 }
        : { objectId: 'alex', revision: 1 };
    const working: TextAssistantView = { ...initial, revision: 1, phase: 'working', selection };
    const { result } = await setup(
      (url, body) => {
        if (url.endsWith('/messages')) return Response.json(working);
        if (url.endsWith('/selection')) {
          acks.push(body);
          return Response.json({ ...working, phase: 'ready' });
        }
        return Response.json(initial);
      },
      { ...callbacks, onSelectItem: display },
    );
    act(() => result.current.setText('Visa det jag menar.'));
    await act(async () => result.current.send());
    expect(display).toHaveBeenCalledWith(
      mode === 'relationship'
        ? { kind: 'relationship', id: 'owns' }
        : { kind: 'object', id: 'alex' },
      expect.any(AbortSignal),
    );
    if (mode !== 'throw') {
      expect(acks).toEqual([]);
      await act(async () => selected.resolve(mode !== 'failed'));
    }
    await tick(0);
    expect(acks).toEqual([
      expect.objectContaining({
        revision: 1,
        kind: mode === 'relationship' ? 'relationship' : 'object',
        id: mode === 'relationship' ? 'owns' : 'alex',
        displayed: mode !== 'failed' && mode !== 'throw',
      }),
    ]);
    expect(result.current.working).toBe(false);
  },
);

test('a selection which finishes after an explicit reset cannot acknowledge an item in the new conversation', async () => {
  const selected = deferred<boolean>();
  const acks: unknown[] = [];
  let signal: AbortSignal | undefined;
  const display = async (_target: unknown, abort: AbortSignal) => {
    signal = abort;
    return selected.promise;
  };
  const { result } = await setup(
    (url, body) => {
      if (url.endsWith('/messages'))
        return Response.json({
          ...initial,
          revision: 1,
          phase: 'working',
          selection: { kind: 'object', id: 'alex', revision: 1 },
        });
      if (url.endsWith('/selection')) acks.push(body);
      if (url.endsWith('/new'))
        return Response.json({ ...initial, revision: 2, contextRevision: 1 });
      return Response.json(initial);
    },
    { ...callbacks, onSelectItem: display },
  );
  act(() => result.current.setText('Visa Alex.'));
  await act(async () => result.current.send());
  await act(async () => result.current.newConversation());
  expect(signal?.aborted).toBe(true);
  await act(async () => selected.resolve(true));
  expect(acks).toEqual([]);
  expect(result.current.transcript).toEqual([]);
});

test('whole-draft discard and automatic summary arrive as retained conversation rows, and a later task failure clears on an explicit retry', async () => {
  let turn = 0;
  const { result } = await setup((url) => {
    if (!url.endsWith('/messages')) return Response.json(initial);
    turn++;
    if (turn === 1)
      return Response.json({
        ...initial,
        revision: 1,
        discarded: true,
        reply: 'Utkastet är kastat.',
        contextSummaries: [{ id: 'summary', text: 'Det tidigare samtalet i korthet.' }],
      });
    if (turn === 2)
      return Response.json({
        ...initial,
        revision: 2,
        phase: 'error',
        error: 'assistant_unavailable',
      });
    return Response.json({ ...initial, revision: 3, modelReply: 'Det nya uppdraget gick bra.' });
  });
  act(() => result.current.setText('Kasta utkastet.'));
  await act(async () => result.current.send());
  expect(result.current.transcript.map((row) => row.text)).toEqual([
    'Kasta utkastet.',
    'Utkastet är kastat.',
    'Det tidigare samtalet i korthet.',
  ]);
  expect(result.current.transcript.at(-1)?.voiced).toBe(false);
  act(() => result.current.setText('Kontrollera kartan.'));
  await act(async () => result.current.send());
  expect(result.current.taskFailed).toBe(true);
  act(() => result.current.setText('Försök igen.'));
  await act(async () => result.current.send());
  expect(result.current.taskFailed).toBe(false);
  expect(result.current.transcript.at(-1)?.text).toBe('Det nya uppdraget gick bra.');
  expect(
    result.current.transcript.filter((row) => row.text === 'Det tidigare samtalet i korthet.'),
  ).toHaveLength(1);
});

test('checked replies preserve their own recovery and result provenance even when their current view also contains a receipt', async () => {
  const receipt = {
    operationId: 'original',
    householdId: 'linden',
    userId: 'alex',
    draftVersion: 0,
    contentVersion: 1,
    savedAt: '2026-10-03T10:00:00Z',
    changes: [],
  };
  const check = {
    id: 'check',
    reply: 'Det tidigare sparförsöket är bekräftat.',
    receipt,
    operations: [],
  };
  const checked: TextAssistantView = {
    ...initial,
    revision: 3,
    saveCheck: check,
    receipt,
    completedReplies: [
      { id: 'legacy-text', source: 'text', text: 'Ett tidigare textsvar.' },
      { id: 'recover', source: 'text', revision: 2, text: '', saveCheck: check, receipt },
      {
        id: 'result',
        source: 'text',
        revision: 3,
        text: '',
        reply: 'Kontrollerade ändringar finns i utkastet.',
        result: { kind: 'draft', message: 'Kontrollerade ändringar finns i utkastet.' },
      },
    ],
  };
  const { result } = await setup((url) =>
    Response.json(url.endsWith('/messages') ? checked : initial),
  );
  act(() => result.current.setText('Kontrollera resultatet.'));
  await act(async () => result.current.send());
  expect(result.current.transcript.map((row) => row.text)).toEqual([
    'Kontrollera resultatet.',
    'Ett tidigare textsvar.',
    check.reply,
    'Kontrollerade ändringar finns i utkastet.',
  ]);
  expect(result.current.transcript.find((row) => row.text === 'Ett tidigare textsvar.')?.id).toBe(
    'queued-session-legacy-text',
  );
  expect(result.current.transcript.filter((row) => row.text === 'Sparat.')).toEqual([]);
  act(() => result.current.setText('Visa samma kontrollerade resultat.'));
  await act(async () => result.current.send());
  expect(result.current.transcript.filter((row) => row.text === check.reply)).toHaveLength(1);
  expect(
    result.current.transcript.filter(
      (row) => row.text === 'Kontrollerade ändringar finns i utkastet.',
    ),
  ).toHaveLength(1);
});

test.each(['receipt', 'result'] as const)(
  'a checked current %s remains visible before FIFO delivery metadata is available and repeated views never duplicate it',
  async (kind) => {
    const receipt = {
      operationId: 'current',
      householdId: 'linden',
      userId: 'alex',
      draftVersion: 0,
      contentVersion: 1,
      savedAt: '2026-10-03T10:00:00Z',
      changes: [],
    };
    const current: TextAssistantView = {
      ...initial,
      revision: 1,
      ...(kind === 'receipt'
        ? { receipt }
        : {
            reply: 'Resultatet är kontrollerat.',
            result: { kind: 'draft' as const, message: 'Resultatet är kontrollerat.' },
          }),
    };
    const { result } = await setup((url) =>
      Response.json(url.endsWith('/messages') ? current : initial),
    );
    for (const text of ['Vad blev resultatet?', 'Visa resultatet igen.']) {
      act(() => result.current.setText(text));
      await act(async () => result.current.send());
    }
    expect(
      result.current.transcript.filter((row) => row.role === 'assistant').map((row) => row.text),
    ).toEqual([kind === 'receipt' ? 'Sparat.' : 'Resultatet är kontrollerat.']);
  },
);

test('a server refusal for cross-tab consent revocation clears context, keeps unsent text and asks for new consent on the next interaction', async () => {
  let revoked = false;
  const { result } = await setup((url) => {
    if (url.endsWith('/messages'))
      return revoked
        ? Response.json({ error: 'conversation_consent_revoked' }, { status: 403 })
        : Response.json({
            ...initial,
            revision: 1,
            modelReply: 'Privat samtalstext före återkallandet.',
          });
    return Response.json(initial);
  });
  act(() => result.current.setText('Ett tidigare uppdrag.'));
  await act(async () => result.current.send());
  expect(result.current.transcript).toHaveLength(2);
  revoked = true;
  act(() => result.current.setText('Oskickat när medgivandet återkallas.'));
  await act(async () => result.current.send());
  expect(result.current.session).toBeNull();
  expect(result.current.transcript).toEqual([]);
  expect(result.current.text).toBe('Oskickat när medgivandet återkallas.');
  expect(result.current.consentRevoked).toBe(true);
  expect(result.current.revokedHere).toBe(false);
  expect(result.current.consent.valid).toBe(false);
  act(() => result.current.begin('text'));
  expect(result.current.consentRevoked).toBe(false);
  expect(result.current.consent.asking).toBe('text');
  expect(result.current.text).toBe('Oskickat när medgivandet återkallas.');
});
