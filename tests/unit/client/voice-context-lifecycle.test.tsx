import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { useVoice } from '../../../src/client/use-voice.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { voiceMedia } from '../../support/voice-media.js';

const initial: TextAssistantView = {
  id: 'context',
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
const path = '/api/households/linden/text-assistant/context';
function Page({ recovered }: { recovered: () => void }) {
  const [assistant, onAssistant] = useState(initial);
  const voice = useVoice({
    householdId: 'linden',
    assistant,
    onAssistant,
    onAccessLost: () => {},
    onRecoveryNeeded: recovered,
  });
  return (
    <>
      <button type="button" onClick={voice.activate} aria-pressed={voice.microphone === 'on'}>
        Prata med Skyttel
      </button>
      <button type="button" onClick={() => void voice.startHeld?.()}>
        Håll
      </button>
      <button type="button" onClick={voice.releaseHeld}>
        Släpp
      </button>
      <button type="button" onClick={() => void voice.stop()}>
        Lämna
      </button>
      <button
        type="button"
        onClick={() =>
          void voice.newConversation(async () => {
            const response = await fetch(`${path}/new`, { method: 'POST' });
            return response.json();
          })
        }
      >
        Nytt samtal
      </button>
      <output aria-label="Samtalets tillstånd">
        {JSON.stringify({ assistant, state: voice.state, error: voice.error })}
      </output>
    </>
  );
}
const microphone = () => screen.getByRole('button', { name: 'Prata med Skyttel' });
const state = () => JSON.parse(screen.getByLabelText('Samtalets tillstånd').textContent ?? '{}');
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
function delayed<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function setup(held = false) {
  vi.useFakeTimers();
  const media = voiceMedia();
  const recovered = vi.fn();
  const summary = delayed<Response>();
  const reset = delayed<Response>();
  const server = { assistant: initial, rejectStartup: false };
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    if (url.endsWith('/summarize')) return summary.promise;
    if (url.endsWith('/new')) return reset.promise;
    if (url === path) return Response.json(server.assistant);
    if (url.endsWith('/voice') && server.rejectStartup)
      return Response.json({ error: 'assistant_context_summary_failed' }, { status: 409 });
    return Response.json({
      assistant: server.assistant,
      voice: {
        id: `voice-${media.peers.length}`,
        phase: url.endsWith('/stop') ? 'closed' : 'listening',
        seconds: null,
        usageFinal: false,
        summaryReady: true,
      },
      sdp: 'synthetic-answer',
    });
  });
  render(<Page recovered={recovered} />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: held ? 'Håll' : 'Prata med Skyttel' }));
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () =>
    media.peers[0].channel.emit({ type: 'session.started', session: { id: 'provider' } }),
  );
  expect(microphone().getAttribute('aria-pressed')).toBe('true');
  return { media, server, summary, reset, calls, recovered };
}
afterEach(async () => {
  await act(async () => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

test('automatic summary pauses capture and transfers pre-release held speech into the replacement peer without recording again', async () => {
  const { media, server, summary, calls } = await setup(true);
  fireEvent.click(screen.getByRole('button', { name: 'Släpp' }));
  expect(media.microphone.enabled).toBe(false);
  expect(media.outgoing.enabled).toBe(true);
  server.assistant = { ...initial, contextSummaryState: 'needed' };
  await tick(1000);
  expect(calls.filter((url) => url.endsWith('/summarize'))).toHaveLength(1);
  expect(media.peers[0].remote.stopped).toBe(true);
  expect(media.microphone.stopped).toBe(false);
  server.assistant = {
    ...initial,
    contextGeneration: 1,
    contextSummaries: [{ id: 'summary', text: 'Det tidigare samtalet i korthet.' }],
  };
  await act(async () => summary.resolve(Response.json(server.assistant)));
  expect(media.peers).toHaveLength(2);
  await act(async () =>
    media.peers[1].channel.emit({ type: 'session.started', session: { id: 'replacement' } }),
  );
  expect(media.getUserMedia).toHaveBeenCalledOnce();
  expect(microphone().getAttribute('aria-pressed')).toBe('false');
  expect(media.microphone.enabled).toBe(false);
  expect(media.outgoing.enabled).toBe(true);
  media.processors[0].port.onmessage(new MessageEvent('message', { data: { drained: true } }));
  expect(media.outgoing.enabled).toBe(false);
  expect(state().assistant.contextGeneration).toBe(1);
});

test('leaving while an automatic summary waits prevents its late response from reconnecting or acquiring the microphone', async () => {
  const { media, server, summary } = await setup();
  server.assistant = { ...initial, contextSummaryState: 'needed' };
  await tick(1000);
  expect(state().state).toBe('connecting');
  fireEvent.click(screen.getByRole('button', { name: 'Lämna' }));
  await tick(0);
  expect(media.microphone.stopped).toBe(true);
  await act(async () => summary.resolve(Response.json({ ...initial, contextGeneration: 1 })));
  expect(media.peers).toHaveLength(1);
  expect(media.getUserMedia).toHaveBeenCalledOnce();
  expect(state().state).toBe('idle');
});

test('failed automatic summary retains the authorized microphone paused until an explicit new conversation, without replaying held speech', async () => {
  const { media, server, summary, reset } = await setup(true);
  fireEvent.click(screen.getByRole('button', { name: 'Släpp' }));
  server.assistant = { ...initial, contextSummaryState: 'needed' };
  await tick(1000);
  server.assistant = { ...initial, contextSummaryState: 'failed' };
  await act(async () => summary.resolve(Response.json(server.assistant)));
  expect(state().state).toBe('idle');
  expect(media.microphone.enabled).toBe(false);
  expect(media.outgoing.enabled).toBe(false);
  expect(media.microphone.stopped).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Nytt samtal' }));
  server.assistant = { ...initial, revision: 1, contextRevision: 1 };
  await act(async () => reset.resolve(Response.json(server.assistant)));
  expect(media.outgoing.stopped).toBe(true);
  expect(media.peers).toHaveLength(2);
  await act(async () =>
    media.peers[1].channel.emit({ type: 'session.started', session: { id: 'fresh' } }),
  );
  expect(media.microphone.enabled).toBe(false);
  expect(media.getUserMedia).toHaveBeenCalledOnce();
});

test('a rejected summary request closes retained input and offers a recoverable failure without silently reopening capture', async () => {
  const { media, server, summary } = await setup(true);
  server.assistant = { ...initial, contextSummaryState: 'needed' };
  await tick(1000);
  await act(async () =>
    summary.resolve(Response.json({ error: 'assistant_unavailable' }, { status: 503 })),
  );
  expect(media.microphone.stopped).toBe(true);
  expect(media.outgoing.stopped).toBe(true);
  expect(state().state).toBe('idle');
  expect(media.peers).toHaveLength(1);
  expect(media.getUserMedia).toHaveBeenCalledOnce();
  await tick(1000);
  expect(media.peers).toHaveLength(1);
});

test('summary failure during provider startup retains input OFF and closes it when the map is left', async () => {
  const { media, server } = await setup();
  server.assistant = { ...initial, contextRevision: 1, contextSummaryState: 'failed' };
  server.rejectStartup = true;
  await tick(500);
  expect(state().state).toBe('idle');
  expect(state().assistant.contextSummaryState).toBe('failed');
  expect(media.microphone.enabled).toBe(false);
  expect(media.microphone.stopped).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Lämna' }));
  await tick(0);
  expect(media.microphone.stopped).toBe(true);
});
