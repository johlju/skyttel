import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useConversationPreferences } from '../../../src/client/use-conversation-preferences.js';
import { defaultConversationPreferences as defaults } from '../../../src/shared/conversation-preferences.js';

const path = '/api/households/linden/map';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function delayed<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('rapid width choices serialize partial writes while a new drag preview remains visible and cancellation restores all queued choices', async () => {
  const writes: Record<string, unknown>[] = [];
  const responses = [delayed<Response>(), delayed<Response>()];
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json(defaults);
    writes.push(JSON.parse(String(init.body)));
    return responses[writes.length - 1].promise;
  });
  const { result } = renderHook(() => useConversationPreferences(path));
  await waitFor(() => expect(result.current.known).toBe(true));
  let first!: Promise<boolean>;
  let second!: Promise<boolean>;
  act(() => {
    first = result.current.resize({ textWidth: 424 });
  });
  act(() => {
    second = result.current.resize({ draftWidth: 364 });
  });
  act(() => result.current.previewWidths({ textWidth: 460 }));
  expect(result.current.preferences).toEqual({ ...defaults, textWidth: 460, draftWidth: 364 });
  act(() => result.current.cancelPreview());
  expect(result.current.preferences).toEqual({ ...defaults, textWidth: 424, draftWidth: 364 });
  expect(await result.current.configure(false)).toBe(false);
  act(() => result.current.previewWidths({ textWidth: 480 }));
  await act(async () => {
    responses[0].resolve(Response.json({ ...defaults, textWidth: 424 }));
    expect(await first).toBe(true);
  });
  expect(result.current.preferences.textWidth).toBe(480);
  expect(result.current.preferences.draftWidth).toBe(364);
  expect(writes).toEqual([{ textWidth: 424 }, { draftWidth: 364 }]);
  await act(async () => {
    responses[1].resolve(Response.json({ ...defaults, textWidth: 424, draftWidth: 364 }));
    expect(await second).toBe(true);
  });
  act(() => result.current.cancelPreview());
  expect(result.current.preferences.textWidth).toBe(424);
  expect(result.current.pending).toBe(false);
});

test('a failed width save rejects subsequent queued changes and restores the last server choice; reset then confirms both defaults', async () => {
  const response = delayed<Response>();
  let writes = 0;
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json({ ...defaults, textWidth: 460 });
    return ++writes === 1 ? response.promise : Response.json(defaults);
  });
  const { result } = renderHook(() => useConversationPreferences(path));
  await waitFor(() => expect(result.current.known).toBe(true));
  let first!: Promise<boolean>;
  let queued!: Promise<boolean>;
  act(() => {
    first = result.current.resize({ textWidth: 484 });
  });
  act(() => {
    queued = result.current.resize({ draftWidth: 364 });
  });
  await act(async () => {
    response.resolve(Response.json({ error: 'temporarily_unavailable' }, { status: 503 }));
    expect(await first).toBe(false);
    expect(await queued).toBe(false);
  });
  expect(writes).toBe(1);
  expect(result.current.preferences).toEqual({ ...defaults, textWidth: 460 });
  expect(result.current.widthFeedback).toBe('Bredderna kunde inte sparas. Försök igen.');
  await act(async () => {
    expect(await result.current.resetWidths()).toBe(true);
  });
  expect(result.current.widthFeedback).toBe('Bredderna är återställda');
  expect(result.current.preferences).toEqual(defaults);
});

test('a stale focus refresh cannot overwrite a newer saved choice or a live preview', async () => {
  const stale = delayed<Response>();
  let reads = 0;
  vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Response.json({ ...defaults, textWidth: 424 });
    return ++reads === 2 ? stale.promise : Response.json(defaults);
  });
  const { result } = renderHook(() => useConversationPreferences(path));
  await waitFor(() => expect(result.current.known).toBe(true));
  act(() => window.dispatchEvent(new Event('focus')));
  await act(async () => {
    expect(await result.current.resize({ textWidth: 424 })).toBe(true);
  });
  await act(async () => stale.resolve(Response.json({ ...defaults, textWidth: 300 })));
  expect(result.current.preferences.textWidth).toBe(424);
  act(() => result.current.previewWidths({ textWidth: 450 }));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(reads).toBe(2);
  expect(result.current.preferences.textWidth).toBe(450);
  act(() => result.current.cancelPreview());
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.preferences).toEqual(defaults));
});

test('leaving a household rejects queued writes and ignores the old response after another household loads', async () => {
  const old = delayed<Response>();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return old.promise;
    return Response.json({ ...defaults, draftWidth: url.includes('/eken/') ? 380 : 340 });
  });
  const { result, rerender } = renderHook(
    ({ household }) => useConversationPreferences(`/api/households/${household}/map`),
    { initialProps: { household: 'linden' } },
  );
  await waitFor(() => expect(result.current.known).toBe(true));
  let first!: Promise<boolean>;
  let queued!: Promise<boolean>;
  act(() => {
    first = result.current.resize({ textWidth: 424 });
  });
  act(() => {
    queued = result.current.resize({ draftWidth: 364 });
  });
  rerender({ household: 'eken' });
  expect(await queued).toBe(false);
  await waitFor(() => expect(result.current.preferences.draftWidth).toBe(380));
  await act(async () => {
    old.resolve(Response.json({ ...defaults, textWidth: 424 }));
    expect(await first).toBe(false);
  });
  expect(result.current.preferences).toEqual({ ...defaults, draftWidth: 380 });
  expect(result.current.pending).toBe(false);
});

test('changes are refused before the personal choice has loaded', async () => {
  const response = delayed<Response>();
  const fetch = vi.fn(async () => response.promise);
  vi.stubGlobal('fetch', fetch);
  const { result, unmount } = renderHook(() => useConversationPreferences(path));
  expect(await result.current.resize({ textWidth: 424 })).toBe(false);
  expect(await result.current.configure(false)).toBe(false);
  unmount();
  await act(async () => response.resolve(Response.json(defaults)));
  expect(fetch).toHaveBeenCalledOnce();
});
