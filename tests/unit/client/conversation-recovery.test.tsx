import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useConversation } from '../../../src/client/use-conversation.js';
import type { SaveOperation, SaveReceipt } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

const path = '/api/households/linden/text-assistant';
const original: SaveOperation = {
  operationId: 'original-attempt',
  householdId: 'linden',
  userId: 'alex',
  draftVersion: 1,
  contentVersion: 1,
  createdAt: '2026-10-03T10:00:00Z',
  status: 'pending',
};
const receipt: SaveReceipt = {
  operationId: 'original-attempt',
  householdId: 'linden',
  userId: 'alex',
  draftVersion: 1,
  contentVersion: 1,
  savedAt: '2026-10-03T10:01:00Z',
  changes: [],
};
const initial: TextAssistantView = {
  id: 'session',
  revision: 0,
  phase: 'ready',
  review: {
    version: 2,
    contentVersion: 1,
    changes: [],
    readyToSave: false,
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
  },
  operations: [],
};
const options = {
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

test('startup checks a registered pending save without AI availability or consent, keeps one immutable attempt and stops after its checked outcome', async () => {
  vi.useFakeTimers();
  const checks: Record<string, unknown>[] = [];
  const posts: string[] = [];
  const changed = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') {
      if (url === path) return Response.json({ available: false });
      if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
      if (url.endsWith('/map/operations')) return Response.json({ operations: [original] });
      return Response.json(initial);
    }
    posts.push(url);
    checks.push(JSON.parse(String(init.body)));
    return checks.length === 1
      ? Response.json({ checking: true })
      : Response.json({
          id: 'checked-original',
          reply: 'Ditt tidigare sparförsök är bekräftat. Utkastet sparades.',
          receipt,
          operations: [{ ...original, status: 'succeeded', receipt }],
        });
  });
  const { result } = renderHook(() => useConversation({ ...options, onMapChange: changed }));
  await tick(0);
  expect(result.current.available).toBe(false);
  expect(result.current.session).toBeNull();
  expect(result.current.consent.valid).toBe(false);
  act(() => result.current.setText('Oskickat medan sparförsöket kontrolleras'));
  await tick(250);
  expect(result.current.saveChecking).toBe(true);
  await tick(250);
  expect(result.current.saveChecking).toBe(false);
  expect(result.current.transcript.map((row) => row.text)).toEqual([
    'Ditt tidigare sparförsök är bekräftat. Utkastet sparades.',
  ]);
  expect(result.current.text).toBe('Oskickat medan sparförsöket kontrolleras');
  expect(checks).toHaveLength(2);
  expect(checks[0]).toEqual({
    checkId: expect.stringMatching(/^[a-f0-9-]{36}$/),
    operationIds: ['original-attempt'],
  });
  expect(checks[1]).toEqual(checks[0]);
  expect(posts).toEqual([`${path}/recover`, `${path}/recover`]);
  expect(changed).toHaveBeenCalledOnce();
  await tick(1000);
  expect(checks).toHaveLength(2);
});

test.each([
  { code: 'assistant_session_expired', status: 404, consentRemains: true },
  { code: 'conversation_consent_required', status: 403, consentRemains: false },
  { code: 'conversation_consent_revoked', status: 403, consentRemains: false },
])(
  'recovery after $code falls back to household checking with the original operation ID and no new conversation',
  async ({ code, status, consentRemains }) => {
    vi.useFakeTimers();
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') {
        if (url === path) return Response.json({ available: true });
        if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
        if (url.endsWith('/map/operations')) return Response.json({ operations: [] });
        return Response.json(initial);
      }
      calls.push({ url, body: JSON.parse(String(init.body)) });
      if (url === path)
        return Response.json({ ...initial, phase: 'recovery', operations: [original] });
      if (url === `${path}/session/recover`) return Response.json({ error: code }, { status });
      return Response.json({
        id: 'checked-fallback',
        reply: 'Sparförsöket genomfördes inte. Utkastet ligger kvar.',
        operations: [{ ...original, status: 'rejected', error: 'draft_changed' }],
      });
    });
    const { result } = renderHook(() => useConversation(options));
    await tick(0);
    act(() => result.current.begin('text'));
    await act(async () => result.current.approve(false));
    await tick(0);
    expect(result.current.session?.phase).toBe('recovery');
    act(() => result.current.setText('Oskickat efter återkallandet'));
    await tick(250);
    expect(result.current.session).toBeNull();
    expect(result.current.consent.valid).toBe(consentRemains);
    await tick(250);
    expect(result.current.saveChecking).toBe(false);
    expect(result.current.saveCheckFailed).toBe(false);
    expect(result.current.text).toBe('Oskickat efter återkallandet');
    expect(result.current.transcript.map((row) => row.text)).toEqual([
      'Sparförsöket genomfördes inte. Utkastet ligger kvar.',
    ]);
    expect(calls.map((call) => call.url)).toEqual([
      path,
      `${path}/session/recover`,
      `${path}/recover`,
    ]);
    expect(calls[2].body).toEqual({
      checkId: calls[1].body.checkId,
      operationIds: ['original-attempt'],
    });
  },
);

test('a failed startup check keeps the original attempt and unsent text, and one explicit retry completes the same check occurrence', async () => {
  vi.useFakeTimers();
  const replies: Record<string, unknown>[] = [];
  let fail = true;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') {
      if (url === path) return Response.json({ available: false });
      if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
      return Response.json({ operations: [original] });
    }
    replies.push(JSON.parse(String(init.body)));
    if (fail) throw new TypeError('network failed');
    return Response.json({
      id: 'retried-check',
      reply: 'Sparförsöket genomfördes inte. Utkastet ligger kvar.',
      operations: [{ ...original, status: 'rejected', error: 'draft_changed' }],
    });
  });
  const { result } = renderHook(() => useConversation(options));
  await tick(0);
  act(() => result.current.setText('Oskickat behålls'));
  await tick(250);
  expect(result.current.inputBlocked).toBe(true);
  expect(result.current.saveCheckFailed).toBe(true);
  await tick(1000);
  expect(replies).toHaveLength(1);
  fail = false;
  await act(async () => result.current.recover());
  expect(result.current.saveCheckFailed).toBe(false);
  expect(result.current.saveChecking).toBe(false);
  expect(replies[1]).toEqual(replies[0]);
  expect(result.current.text).toBe('Oskickat behålls');
  expect(result.current.transcript.map((row) => row.text)).toEqual([
    'Sparförsöket genomfördes inte. Utkastet ligger kvar.',
  ]);
});

test('recovery waits for the original working task, ignores repeat presses and uses its canonical checked reply once ready', async () => {
  vi.useFakeTimers();
  let reads = 0;
  let resolve!: (value: Response) => void;
  const held = new Promise<Response>((done) => {
    resolve = done;
  });
  const check = {
    id: 'ready-check',
    reply: 'Ditt tidigare sparförsök är bekräftat. Utkastet sparades.',
    receipt,
    operations: [{ ...original, status: 'succeeded' as const, receipt }],
  };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') {
      if (url === path) return Response.json({ available: true });
      if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
      if (url.endsWith('/map/operations')) return Response.json({ operations: [] });
      return Response.json(initial);
    }
    if (url === path)
      return Response.json({ ...initial, phase: 'recovery', operations: [original] });
    return ++reads === 1
      ? held
      : Response.json({
          ...initial,
          revision: 2,
          receipt,
          saveCheck: check,
          operations: check.operations,
        });
  });
  const { result } = renderHook(() => useConversation(options));
  await tick(0);
  act(() => result.current.begin('text'));
  await act(async () => result.current.approve(false));
  await tick(0);
  await tick(250);
  expect(result.current.saveChecking).toBe(true);
  await act(async () => result.current.recover());
  expect(reads).toBe(1);
  await act(async () =>
    resolve(Response.json({ ...initial, phase: 'working', operations: [original] })),
  );
  expect(result.current.working).toBe(true);
  await tick(249);
  expect(reads).toBe(1);
  await tick(1);
  expect(reads).toBe(2);
  expect(result.current.working).toBe(false);
  expect(result.current.saveChecking).toBe(false);
  expect(result.current.transcript.map((row) => row.text)).toEqual([check.reply]);
  await act(async () => result.current.recover());
  expect(result.current.transcript.map((row) => row.text)).toEqual([check.reply]);
});

test.each([401, 403])(
  'household recovery refuses lost access (%s) without inventing a successful save or retrying',
  async (status) => {
    vi.useFakeTimers();
    const accessLost = vi.fn();
    let posts = 0;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts++;
        return Response.json({ error: 'access_lost' }, { status });
      }
      if (url === path) return Response.json({ available: false });
      if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
      return Response.json({ operations: [original] });
    });
    const { result } = renderHook(() => useConversation({ ...options, onAccessLost: accessLost }));
    await tick(0);
    await tick(250);
    expect(accessLost).toHaveBeenCalledOnce();
    expect(result.current.saveChecking).toBe(false);
    expect(result.current.transcript).toEqual([]);
    expect(result.current.error).toBe('Åtkomsten har upphört.');
    await tick(1000);
    expect(posts).toBe(1);
  },
);

test('a check which finishes after leaving the household cannot insert old private replies or report a map change', async () => {
  vi.useFakeTimers();
  let resolve!: (value: Response) => void;
  const changed = vi.fn();
  const held = new Promise<Response>((done) => {
    resolve = done;
  });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return held;
    if (url === path) return Response.json({ available: false });
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    return Response.json({ operations: [original] });
  });
  const { unmount } = renderHook(() => useConversation({ ...options, onMapChange: changed }));
  await tick(0);
  await tick(250);
  unmount();
  await act(async () =>
    resolve(
      Response.json({
        id: 'late',
        reply: 'Privat förklaring från det gamla hushållet.',
        receipt,
        operations: [{ ...original, status: 'succeeded', receipt }],
      }),
    ),
  );
  expect(changed).not.toHaveBeenCalled();
});
