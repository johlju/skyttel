import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useConversation } from '../../../src/client/use-conversation.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

const path = '/api/households/linden/text-assistant';
const initial: TextAssistantView = {
  id: 'network',
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
async function start(result: { current: ReturnType<typeof useConversation> }) {
  act(() => result.current.begin('text'));
  await act(async () => result.current.approve(false));
  await tick(0);
  expect(result.current.session?.id).toBe('network');
}

test('failed availability and consent reads keep idle conversation unavailable until an explicit online recheck succeeds', async () => {
  vi.useFakeTimers();
  let connected = false;
  const unavailable = vi.fn();
  const posts: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(url);
      return Response.json(initial);
    }
    if (url === path) {
      if (!connected) throw Error('connection lost');
      return Response.json({ available: true });
    }
    if (url.endsWith('/conversation-consent')) throw Error('connection lost');
    return Response.json({ operations: [] });
  });
  const { result } = renderHook(() => useConversation({ ...options, onUnavailable: unavailable }));
  await tick(0);
  expect(result.current.disconnected).toBe(true);
  expect(result.current.consent.valid).toBe(false);
  act(() => result.current.setText('Oskickat utan kontakt'));
  act(() => result.current.begin('text'));
  await act(async () => result.current.send());
  expect(unavailable).toHaveBeenCalledOnce();
  expect(result.current.noticeRequested).toBe(1);
  expect(posts).toEqual([]);
  connected = true;
  act(() => window.dispatchEvent(new Event('online')));
  await tick(0);
  expect(result.current.available).toBe(true);
  expect(result.current.disconnected).toBe(false);
  act(() => result.current.begin('text'));
  expect(result.current.consent.asking).toBe('text');
  expect(result.current.text).toBe('Oskickat utan kontakt');
});

test('an online response arriving after a new offline event cannot unblock input; a later recheck permits the retained unsent message', async () => {
  vi.useFakeTimers();
  const online = vi.spyOn(navigator, 'onLine', 'get');
  let release!: (response: Response) => void;
  let availability = 0;
  const posts: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(url);
      return Response.json(initial);
    }
    if (url === path)
      return ++availability === 2
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Response.json({ available: true });
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    return Response.json({ operations: [] });
  });
  const { result } = renderHook(() => useConversation(options));
  await tick(0);
  await start(result);
  act(() => result.current.setText('Behåll texten tills kontakten är tillbaka.'));
  online.mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('offline')));
  expect(result.current.inputBlocked).toBe(true);
  await act(async () => result.current.send());
  await act(async () => result.current.recover());
  expect(posts).toEqual([path]);
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('online')));
  await tick(0);
  online.mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('offline')));
  await act(async () => release(Response.json({ available: true })));
  expect(result.current.disconnected).toBe(true);
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('online')));
  await tick(0);
  expect(result.current.inputBlocked).toBe(false);
  expect(result.current.text).toBe('Behåll texten tills kontakten är tillbaka.');
  await act(async () => result.current.send());
  expect(posts).toEqual([path, `${path}/network/messages`]);
  expect(result.current.text).toBe('');
});

test('contact loss during a working task triggers one authoritative check after reconnection and retains unsent text throughout', async () => {
  vi.useFakeTimers();
  const online = vi.spyOn(navigator, 'onLine', 'get');
  const posts: string[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') {
      if (url === path) return Response.json({ available: true });
      if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
      if (url.endsWith('/map/operations')) return Response.json({ operations: [] });
      return Response.json(initial);
    }
    posts.push(url);
    if (url.endsWith('/messages'))
      return Response.json({ ...initial, revision: 1, phase: 'working' });
    if (url.endsWith('/recover'))
      return Response.json({
        ...initial,
        revision: 2,
        saveCheck: {
          id: 'outcome',
          reply: 'Uppdraget sparade ingenting. Utkastet ligger kvar.',
          operations: [],
        },
      });
    return Response.json(initial);
  });
  const { result } = renderHook(() => useConversation(options));
  await tick(0);
  await start(result);
  act(() => result.current.setText('Kontrollera utkastet.'));
  await act(async () => result.current.send());
  act(() => result.current.setText('Nästa oskickade uppdrag.'));
  online.mockReturnValue(false);
  act(() => window.dispatchEvent(new Event('offline')));
  expect(result.current.unknown).toBe(true);
  await tick(1000);
  expect(posts).toHaveLength(2);
  online.mockReturnValue(true);
  act(() => window.dispatchEvent(new Event('online')));
  await tick(0);
  await tick(250);
  expect(posts).toEqual([path, `${path}/network/messages`, `${path}/network/recover`]);
  expect(result.current.unknown).toBe(false);
  expect(result.current.inputBlocked).toBe(false);
  expect(result.current.text).toBe('Nästa oskickade uppdrag.');
  expect(result.current.transcript.at(-1)?.text).toBe(
    'Uppdraget sparade ingenting. Utkastet ligger kvar.',
  );
});

test.each([false, true])(
  'browser offline status blocks an availability recheck even when its response is pending=%s',
  async (responsePending) => {
    vi.useFakeTimers();
    const online = vi.spyOn(navigator, 'onLine', 'get');
    let release!: (response: Response) => void;
    let hold = false;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json(initial);
      if (url === path)
        return hold
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : Response.json({ available: true });
      if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
      return Response.json({ operations: [] });
    });
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useConversation(options));
    await tick(0);
    await start(result);
    act(() => result.current.setText('Behåll min oskickade fråga.'));
    if (responsePending) {
      hold = true;
      act(() => window.dispatchEvent(new Event('online')));
      await tick(0);
      online.mockReturnValue(false);
      await act(async () => release(Response.json({ available: true })));
    } else {
      online.mockReturnValue(false);
      const calls = fetch.mock.calls.length;
      act(() => window.dispatchEvent(new Event('online')));
      await tick(0);
      expect(fetch).toHaveBeenCalledTimes(calls);
    }
    expect(result.current.inputBlocked).toBe(true);
    expect(result.current.text).toBe('Behåll min oskickade fråga.');
    expect(result.current.voice.state).toBe('idle');
    const calls = fetch.mock.calls.length;
    await act(async () => result.current.send());
    expect(fetch).toHaveBeenCalledTimes(calls);
    hold = false;
    online.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event('online')));
    await tick(0);
    expect(result.current.inputBlocked).toBe(false);
    await act(async () => result.current.send());
    expect(fetch).toHaveBeenLastCalledWith(
      `${path}/network/messages`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.text).toBe('');
  },
);

test('a periodic availability failure blocks an existing conversation, while unavailable service recovery requires a fresh explicit request', async () => {
  vi.useFakeTimers();
  let availability: boolean | 'error' = true;
  const unavailable = vi.fn();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json(initial);
    if (url === path) {
      if (availability === 'error') throw Error('network');
      return Response.json({ available: availability });
    }
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.endsWith('/map/operations')) return Response.json({ operations: [] });
    return Response.json(initial);
  });
  const { result } = renderHook(() => useConversation({ ...options, onUnavailable: unavailable }));
  await tick(0);
  await start(result);
  availability = 'error';
  await tick(5000);
  expect(result.current.disconnected).toBe(true);
  availability = false;
  act(() => window.dispatchEvent(new Event('online')));
  await tick(0);
  expect(result.current.disconnected).toBe(false);
  expect(result.current.inputBlocked).toBe(true);
  act(() => result.current.begin('voice'));
  expect(unavailable).toHaveBeenCalledOnce();
  expect(result.current.voice.state).toBe('idle');
  availability = true;
  await tick(5000);
  expect(result.current.inputBlocked).toBe(false);
  expect(result.current.voice.state).toBe('idle');
});
