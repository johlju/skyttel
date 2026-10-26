import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { useConversation } from '../../../src/client/use-conversation.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { voiceMedia } from '../../support/voice-media.js';

const path = '/api/households/linden/text-assistant';
const initial: TextAssistantView = {
  id: 'queue',
  revision: 3,
  phase: 'ready',
  operations: [],
  review: {
    version: 1,
    contentVersion: 1,
    changes: [],
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
    readyToSave: false,
  },
};

afterEach(async () => {
  await act(async () => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

test('canceling written work retains the muted microphone when voice stop returns an older conversation', async () => {
  vi.useFakeTimers();
  const media = voiceMedia();
  let current = initial;
  let voiceStarts = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.method === 'POST' ? JSON.parse(String(init.body)) : undefined;
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.endsWith('/map/operations')) return Response.json({ operations: [] });
    if (url === path) return Response.json(body ? current : { available: true });
    if (url.endsWith('/messages')) {
      current = { ...current, revision: 4, phase: 'working' };
      return Response.json(current);
    }
    if (url.endsWith('/stop'))
      return Response.json({
        assistant: { ...initial, revision: 4, phase: 'working' },
        voice: { id: 'voice', phase: 'closed', seconds: null, usageFinal: true },
      });
    if (url.endsWith('/cancel')) {
      current = { ...current, revision: 5, phase: 'ready', canceled: true };
      return Response.json(current);
    }
    if (url.endsWith('/voice')) {
      voiceStarts++;
      if (body.revision !== current.revision)
        return Response.json({ error: 'assistant_draft_changed' }, { status: 409 });
      return Response.json({
        assistant: current,
        voice: { id: 'voice', phase: 'listening', seconds: null, usageFinal: false },
        sdp: 'synthetic-answer',
      });
    }
    return Response.json(current);
  });
  const { result } = renderHook(() =>
    useConversation({
      householdId: 'linden',
      onMapChange: () => {},
      onAccessLost: () => {},
      onSelectItem: async () => false,
    }),
  );
  await act(async () => vi.advanceTimersByTimeAsync(0));
  act(() => result.current.begin('text'));
  await act(async () => result.current.approve(false));
  await act(async () => {
    result.current.voice.activate();
    await vi.advanceTimersByTimeAsync(0);
    media.peers[0].channel.emit({ type: 'session.started', session: { id: 'first' } });
  });
  expect(result.current.voice.microphone).toBe('on');
  act(() => result.current.voice.activate());
  act(() => result.current.setText('Hållet uppdrag.'));
  await act(async () => result.current.send());
  act(() => result.current.setText('Text som inte skickas'));

  await act(async () => {
    await result.current.cancel();
    await vi.advanceTimersByTimeAsync(0);
    media.peers[1]?.channel.emit({ type: 'session.started', session: { id: 'replacement' } });
  });

  expect(result.current.session?.revision).toBe(5);
  expect(result.current.session?.canceled).toBe(true);
  expect(result.current.session?.review).toEqual(initial.review);
  expect(result.current.text).toBe('Text som inte skickas');
  expect(result.current.voice.state).toBe('listening');
  expect(result.current.voice.error).toBe('');
  expect(result.current.voice.microphone).toBe('off');
  expect(media.microphone.stopped).toBe(false);
  expect(media.microphone.enabled).toBe(false);
  expect(media.getUserMedia).toHaveBeenCalledOnce();
  expect(voiceStarts).toBe(2);
});
