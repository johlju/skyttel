import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import {
  ConversationNoticeCard,
  useConversationNotice,
} from '../../../src/client/ConversationNotice.js';
import { useVoice } from '../../../src/client/use-voice.js';
import { VoiceBox } from '../../../src/client/VoiceBox.js';
import { WorkspaceTools } from '../../../src/client/WorkspaceTools.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { voiceMedia } from '../../support/voice-media.js';

const view: TextAssistantView = {
  id: 'held-session',
  revision: 0,
  phase: 'ready',
  operations: [],
  review: {
    version: 0,
    contentVersion: 1,
    changes: [],
    readyToSave: false,
    conflicts: [],
    unresolvedIdentities: [],
    pendingOperations: [],
  },
};
const path = '/api/households/linden/text-assistant/held-session/voice';
function HeldVoice(options: Parameters<typeof useVoice>[0]) {
  const voice = useVoice(options);
  const notices = useConversationNotice({
    conditions: {
      ...(voice.failure ? { [voice.failure.noticeId]: true } : {}),
      playbackStopped: voice.playbackBlocked,
    },
    ongoing: voice.starting || voice.state === 'listening',
    requested: 0,
    eventKey: String(voice.failure?.occurrence ?? 0),
  });
  return (
    <>
      <WorkspaceTools
        expanded={false}
        onExpandedChange={() => {}}
        onOpen={() => voice.activate()}
        voiceControl={voice}
        holdVoice={{
          canHold:
            !voice.disabled &&
            voice.microphone === 'off' &&
            !options.inputBlocked &&
            !options.saveChecking &&
            !options.contextFailed,
          prepare: () => voice.prepareAudio?.(),
          start: () => voice.startHeld?.(),
          release: () => voice.releaseHeld?.(),
        }}
      />
      <button type="button" onClick={() => void voice.stop()}>
        Lämna kartan
      </button>
      <VoiceBox
        conversation={{ voice, working: false, cancel: () => voice.silence() }}
        microphoneButton={() => screen.getByRole('button', { name: 'Prata med Skyttel' })}
        notice={
          notices.notice && (
            <ConversationNoticeCard
              notice={notices.notice}
              closable={notices.closable}
              onDismiss={notices.dismiss}
              onAction={voice.playAudio}
              focusAfterRemoval={button}
            />
          )
        }
      />
    </>
  );
}
const button = () => screen.getByRole('button', { name: 'Prata med Skyttel' });
const press = () => fireEvent.keyDown(window, { code: 'Space', key: ' ', ctrlKey: true });
const release = () => fireEvent.keyUp(window, { code: 'Space', key: ' ' });
afterEach(async () => {
  await act(async () => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

test('a held start released before provider readiness stops new capture but preserves its microphone for delayed delivery', async () => {
  const media = voiceMedia();
  let finish = () => {};
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const requests: { url: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    if (url === path) await held;
    return Response.json({
      voice: {
        id: 'voice-held',
        phase: url.endsWith('/stop') ? 'closed' : 'listening',
        seconds: null,
        usageFinal: false,
      },
      assistant: view,
      sdp: 'synthetic-answer',
    });
  });
  render(
    <HeldVoice
      householdId="linden"
      assistant={view}
      onAssistant={() => {}}
      onAccessLost={() => {}}
    />,
  );
  press();
  await waitFor(() => expect(button().getAttribute('aria-pressed')).toBe('true'));
  expect(media.microphone.enabled).toBe(true);
  release();
  expect(media.microphone.enabled).toBe(false);
  expect(media.microphone.stopped).toBe(false);
  await act(async () => finish());
  await waitFor(() => expect(media.peers[0]?.channel.readyState).toBe('open'));
  await act(async () =>
    media.peers[0].channel.emit({ type: 'session.started', session: { id: 'provider-held' } }),
  );
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(media.microphone.enabled).toBe(false);
  expect(media.outgoing.enabled).toBe(true);
  media.processors[0].port.onmessage(new MessageEvent('message', { data: { drained: true } }));
  expect(media.outgoing.enabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Lämna kartan' }));
  await waitFor(() => expect(media.microphone.stopped).toBe(true));
  expect(media.outgoing.stopped).toBe(true);
  expect(requests.some((request) => request.url.endsWith('/stop'))).toBe(true);
});

test('held speech captured before the conversation exists survives release and joins only the later authorized session', async () => {
  const media = voiceMedia();
  const calls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url);
    return Response.json({
      voice: {
        id: 'late-voice',
        phase: url.endsWith('/stop') ? 'closed' : 'listening',
        seconds: null,
        usageFinal: false,
      },
      assistant: view,
      sdp: 'synthetic-answer',
    });
  });
  const options = {
    householdId: 'linden',
    onAssistant: () => {},
    onAccessLost: () => {},
    autoStart: true,
  };
  const rendered = render(<HeldVoice {...options} assistant={null} />);
  press();
  await waitFor(() => expect(button().getAttribute('aria-pressed')).toBe('true'));
  expect(calls).toEqual([]);
  release();
  expect(media.microphone.enabled).toBe(false);
  rendered.rerender(<HeldVoice {...options} assistant={view} />);
  await waitFor(() => expect(media.peers[0]?.channel.readyState).toBe('open'));
  await act(async () =>
    media.peers[0].channel.emit({ type: 'session.started', session: { id: 'late-provider' } }),
  );
  expect(media.microphone.enabled).toBe(false);
  expect(media.outgoing.enabled).toBe(true);
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(calls.filter((url) => url === path)).toHaveLength(1);
});

test('cancelling local capture before conversation startup prevents a late session from recording or sending the discarded speech', async () => {
  const media = voiceMedia();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const options = {
    householdId: 'linden',
    onAssistant: () => {},
    onAccessLost: () => {},
    autoStart: true,
  };
  const rendered = render(<HeldVoice {...options} assistant={null} />);
  press();
  await waitFor(() => expect(button().getAttribute('aria-pressed')).toBe('true'));
  fireEvent.click(screen.getByRole('button', { name: 'Lämna kartan' }));
  release();
  expect(media.microphone.stopped).toBe(true);
  expect(media.outgoing.stopped).toBe(true);
  rendered.rerender(<HeldVoice {...options} assistant={view} />);
  await act(async () => {});
  expect(media.getUserMedia).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(media.peers).toHaveLength(0);
});

test.each(['permission', 'processor', 'overflow'] as const)(
  'held %s failure before a conversation exists never falls back to an ordinary live microphone',
  async (failure) => {
    const media = voiceMedia();
    if (failure === 'permission')
      media.getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    if (failure === 'processor')
      media.addModule.mockRejectedValue(new Error('Audio module unavailable'));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const options = {
      householdId: 'linden',
      onAssistant: () => {},
      onAccessLost: () => {},
      autoStart: true,
    };
    const rendered = render(<HeldVoice {...options} assistant={null} />);
    press();
    if (failure === 'overflow') {
      await waitFor(() => expect(button().getAttribute('aria-pressed')).toBe('true'));
      act(() =>
        media.processors[0].port.onmessage(new MessageEvent('message', { data: { failed: true } })),
      );
    }
    await screen.findByRole('button', { name: 'Stäng notisen' });
    release();
    rendered.rerender(<HeldVoice {...options} assistant={view} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Stäng notisen' })).toBeDefined(),
    );
    expect(media.getUserMedia).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(media.peers).toHaveLength(0);
    if (failure !== 'permission') expect(media.microphone.stopped).toBe(true);
  },
);

test('explicit audio recovery after releasing a blocked held start never resumes microphone capture', async () => {
  const media = voiceMedia();
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
    new DOMException('Blocked', 'NotAllowedError'),
  );
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json({
      voice: {
        id: 'audio-voice',
        phase: url.endsWith('/stop') ? 'closed' : 'listening',
        seconds: null,
        usageFinal: false,
      },
      assistant: view,
      sdp: 'synthetic-answer',
    }),
  );
  const options = {
    householdId: 'linden',
    onAssistant: () => {},
    onAccessLost: () => {},
    autoStart: true,
  };
  const rendered = render(<HeldVoice {...options} assistant={null} />);
  press();
  const recover = await screen.findByRole('button', { name: 'Starta ljudet' });
  expect(media.microphone.enabled).toBe(false);
  release();
  fireEvent.click(recover);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Starta ljudet' })).toBeNull());
  expect(media.microphone.enabled).toBe(false);
  rendered.rerender(<HeldVoice {...options} assistant={view} />);
  await waitFor(() => expect(media.peers[0]?.channel.readyState).toBe('open'));
  await act(async () =>
    media.peers[0].channel.emit({ type: 'session.started', session: { id: 'audio-provider' } }),
  );
  expect(media.microphone.enabled).toBe(false);
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(media.outgoing.enabled).toBe(true);
});

test('a second held press reuses the authorized connection, and a system blur releases input while preserving output', async () => {
  const media = voiceMedia();
  vi.stubGlobal('fetch', async (url: string) =>
    Response.json({
      voice: {
        id: 'reused-voice',
        phase: url.endsWith('/stop') ? 'closed' : 'listening',
        seconds: null,
        usageFinal: false,
      },
      assistant: view,
      sdp: 'synthetic-answer',
    }),
  );
  render(
    <HeldVoice
      householdId="linden"
      assistant={view}
      onAssistant={() => {}}
      onAccessLost={() => {}}
    />,
  );
  press();
  await waitFor(() => expect(media.peers[0]?.channel.readyState).toBe('open'));
  await act(async () =>
    media.peers[0].channel.emit({ type: 'session.started', session: { id: 'reused-provider' } }),
  );
  release();
  expect(media.microphone.enabled).toBe(false);
  press();
  await waitFor(() => expect(button().getAttribute('aria-pressed')).toBe('true'));
  fireEvent.blur(window);
  expect(button().getAttribute('aria-pressed')).toBe('false');
  expect(media.microphone.enabled).toBe(false);
  expect(media.microphone.stopped).toBe(false);
  expect(media.peers).toHaveLength(1);
  expect(media.peers[0].remote.stopped).toBe(false);
  expect(media.getUserMedia).toHaveBeenCalledOnce();
});

test.each(['inputBlocked', 'contextFailed', 'saveChecking'] as const)(
  '%s during held speech stops recording, and releasing while blocked prevents automatic capture after recovery',
  async (blocked) => {
    const media = voiceMedia();
    vi.stubGlobal('fetch', async (url: string) =>
      Response.json({
        voice: {
          id: 'blocked-voice',
          phase: url.endsWith('/stop') ? 'closed' : 'listening',
          seconds: null,
          usageFinal: false,
        },
        assistant: view,
        sdp: 'synthetic-answer',
      }),
    );
    const options = {
      householdId: 'linden',
      assistant: view,
      onAssistant: () => {},
      onAccessLost: () => {},
    };
    const rendered = render(<HeldVoice {...options} />);
    press();
    await waitFor(() => expect(media.peers[0]?.channel.readyState).toBe('open'));
    await act(async () =>
      media.peers[0].channel.emit({ type: 'session.started', session: { id: 'blocked-provider' } }),
    );
    expect(media.microphone.enabled).toBe(true);
    rendered.rerender(<HeldVoice {...options} {...{ [blocked]: true }} />);
    expect(media.microphone.enabled).toBe(false);
    expect(button().getAttribute('aria-pressed')).toBe('false');
    release();
    rendered.rerender(<HeldVoice {...options} />);
    expect(media.microphone.enabled).toBe(false);
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(media.microphone.stopped).toBe(false);
    expect(media.peers).toHaveLength(1);
  },
);

test('a delayed playback permission granted after context failure cannot resume a still-held local microphone', async () => {
  const media = voiceMedia();
  const captureAssignments: boolean[] = [];
  let enabled = media.microphone.enabled;
  Object.defineProperty(media.microphone, 'enabled', {
    get: () => enabled,
    set: (value: boolean) => {
      enabled = value;
      captureAssignments.push(value);
    },
  });
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
    new DOMException('Audio gesture required', 'NotAllowedError'),
  );
  let allow!: () => void;
  const allowed = new Promise<void>((resolve) => {
    allow = resolve;
  });
  const options = {
    householdId: 'linden',
    assistant: null,
    onAssistant: () => {},
    onAccessLost: () => {},
  };
  const page = render(<HeldVoice {...options} />);
  press();
  const audio = await screen.findByRole('button', { name: 'Starta ljudet' });
  expect(media.microphone.enabled).toBe(false);
  vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(() => allowed);
  fireEvent.click(audio);
  captureAssignments.length = 0;
  media.processors[0].port.postMessage.mockClear();
  page.rerender(<HeldVoice {...options} contextFailed />);
  expect(media.microphone.enabled).toBe(false);
  await act(async () => allow());
  expect(captureAssignments).not.toContain(true);
  expect(media.processors[0].port.postMessage.mock.calls).not.toContainEqual([{ capture: true }]);
  expect(media.microphone.enabled).toBe(false);
  expect(media.processors[0].port.postMessage).toHaveBeenLastCalledWith({ capture: false });
  expect(button().getAttribute('aria-pressed')).toBe('false');
  release();
});
