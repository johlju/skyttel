import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import {
  chooseConversationText,
  queryConsentBox,
  startConversationWithVoice,
} from '../../support/conversation-dom.js';
import { StandaloneConversation } from '../../support/conversation-harness.js';
import { closeVoiceConnection, StandaloneVoice } from '../../support/voice-harness.js';

class Track extends EventTarget {
  enabled = true;
  stop = vi.fn();
}
class Stream {
  constructor(private tracks: Track[] = []) {}
  getTracks() {
    return this.tracks;
  }
}
class Channel extends EventTarget {
  readyState = 'connecting';
  send = vi.fn();
  close() {
    this.readyState = 'closed';
    this.dispatchEvent(new Event('close'));
  }
  emit(value: object) {
    this.dispatchEvent(
      new MessageEvent('message', { data: JSON.stringify({ event_id: 'event', ...value }) }),
    );
  }
}
class Peer extends EventTarget {
  static all: Peer[] = [];
  connectionState = 'new';
  localDescription: object | null = null;
  channel = new Channel();
  remote = new Track();
  addTrack = vi.fn();
  constructor() {
    super();
    Peer.all.push(this);
  }
  createDataChannel() {
    return this.channel;
  }
  async createOffer() {
    return { type: 'offer', sdp: 'synthetic-offer' };
  }
  async setLocalDescription(value: object) {
    this.localDescription = value;
  }
  async setRemoteDescription() {
    this.connectionState = 'connected';
    this.dispatchEvent(new Event('connectionstatechange'));
    this.dispatchEvent(Object.assign(new Event('track'), { track: this.remote }));
    this.channel.readyState = 'open';
    this.channel.dispatchEvent(new Event('open'));
  }
  close() {
    this.connectionState = 'closed';
  }
}
const base = '/api/households/linden/text-assistant/text-session/voice';
function assistant(): TextAssistantView {
  return {
    id: 'text-session',
    revision: 2,
    phase: 'ready',
    operations: [],
    review: {
      version: 3,
      contentVersion: 1,
      changes: [],
      readyToSave: false,
      conflicts: [],
      unresolvedIdentities: [],
      pendingOperations: [],
    },
  };
}
function setup() {
  Peer.all = [];
  const track = new Track();
  const getUserMedia = vi.fn().mockResolvedValue(new Stream([track]));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('MediaStream', Stream);
  const audios: HTMLAudioElement[] = [];
  vi.stubGlobal('Audio', function Audio() {
    const audio = document.createElement('audio');
    audios.push(audio);
    return audio;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const calls: { url: string; body: unknown }[] = [];
  const view = assistant();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({
        voice: {
          id: 'voice-session',
          phase: url.endsWith('/stop') ? 'closed' : 'listening',
          seconds: null,
          usageFinal: false,
        },
        assistant: view,
        sdp: 'synthetic-answer',
      });
    }),
  );
  const changed = vi.fn();
  const accessLost = vi.fn();
  const recoveryNeeded = vi.fn();
  const component = render(
    <StandaloneVoice
      householdId="linden"
      assistant={view}
      onAssistant={changed}
      onAccessLost={accessLost}
      onRecoveryNeeded={recoveryNeeded}
    />,
  );
  return {
    track,
    getUserMedia,
    calls,
    changed,
    accessLost,
    recoveryNeeded,
    component,
    view,
    audios,
  };
}
// The button that turns the microphone on and off, and the voice box that follows the voice.
const microphoneButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: 'Prata med Skyttel' });
const voiceBox = () => screen.queryByRole('group', { name: 'Röstruta' });
// What a screen reader is told, and the element that is replaced for each new telling.
const announced = () => document.querySelector('.voice-announcement')?.firstElementChild;
const announcement = () => announced()?.textContent;
afterEach(async () => {
  await act(async () => cleanup());
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'mediaDevices');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// An audio context whose analysers measure what the test sets for each track,
// as a deviation from silence between 0 and 127.
function meteredAudio() {
  const signals = new Map<Track, number>();
  const disconnects: ReturnType<typeof vi.fn>[] = [];
  const close = vi.fn().mockResolvedValue(undefined);
  const context = { state: 'running' };
  vi.stubGlobal(
    'AudioContext',
    class {
      get state() {
        return context.state;
      }
      close = close;
      resume = vi.fn().mockResolvedValue(undefined);
      createMediaStreamSource(stream: Stream) {
        const disconnect = vi.fn();
        disconnects.push(disconnect);
        return {
          connect: (node: { stream?: Stream }) => {
            node.stream = stream;
          },
          disconnect,
        };
      }
      createAnalyser() {
        const disconnect = vi.fn();
        disconnects.push(disconnect);
        return {
          stream: undefined as Stream | undefined,
          disconnect,
          getByteTimeDomainData(data: Uint8Array) {
            const heard = this.stream?.getTracks().map((track) => signals.get(track) ?? 0) ?? [];
            data.fill(128 + Math.max(0, ...heard));
          },
        };
      }
    },
  );
  return { signals, disconnects, close, context };
}
// Starts the voice and lets Skyttel's audio in, so that both speakers can be heard.
async function startWithAudio() {
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  const peer = Peer.all[0];
  const remote = peer.remote;
  await act(async () => {
    peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
  });
  return { peer, remote };
}

test('the voice box follows who is heard, and Skyttel is heard on with the microphone off', async () => {
  const { signals, disconnects, close, context } = meteredAudio();
  const { track } = setup();
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('false');
  expect(voiceBox()).toBeNull();
  const { peer, remote } = await startWithAudio();
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('true');
  expect(voiceBox()?.textContent).toBe('Lyssnar');
  signals.set(track, 22);
  await screen.findByText('Du talar');
  signals.set(remote, 22);
  await screen.findByText('Skyttel talar');
  await userEvent.click(microphoneButton());
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('false');
  expect(track.enabled).toBe(false);
  expect(remote.stop).not.toHaveBeenCalled();
  expect(voiceBox()?.textContent).toBe('Skyttel talar');
  signals.set(remote, 0);
  await waitFor(() => expect(voiceBox()).toBeNull());
  expect(peer.connectionState).toBe('connected');
  await userEvent.click(microphoneButton());
  await screen.findByText('Du talar');
  context.state = 'suspended';
  await waitFor(() => expect(screen.queryByText('Du talar')).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: closeVoiceConnection }));
  await waitFor(() => expect(peer.connectionState).toBe('closed'));
  expect(voiceBox()).toBeNull();
  expect(close).toHaveBeenCalled();
  expect(disconnects).toHaveLength(4);
  for (const disconnect of disconnects) expect(disconnect).toHaveBeenCalled();
  expect(track.stop).toHaveBeenCalled();
  expect(remote.stop).toHaveBeenCalled();
});

test("the bars follow the microphone's sound level while the user talks", async () => {
  const { signals } = meteredAudio();
  const { track } = setup();
  await startWithAudio();
  const tallest = () =>
    Math.max(
      ...[...(voiceBox()?.querySelectorAll('i') ?? [])].map(
        (bar) => Number.parseFloat(bar.style.height) || 0,
      ),
    );
  expect(voiceBox()?.querySelectorAll('[aria-hidden="true"] i')).toHaveLength(7);
  expect(tallest()).toBe(0);
  signals.set(track, 26);
  await screen.findByText('Du talar');
  // A quiet voice: at most 4 + 0.2 × 20 = 8 px. A loud one: more than 4 + 0.9 × 20 × 0.65 px.
  await waitFor(() => expect(tallest()).toBeGreaterThan(4));
  expect(tallest()).toBeLessThanOrEqual(8.1);
  signals.set(track, 120);
  await waitFor(() => expect(tallest()).toBeGreaterThan(15));
  signals.set(track, 0);
  await screen.findByText('Lyssnar');
  expect(tallest()).toBe(0);
});

test('the stop icon silences Skyttel, stops work in progress and gives the focus to the microphone', async () => {
  const { signals } = meteredAudio();
  const cancel = vi.fn(async () => {});
  const { component, view, audios, changed } = setup();
  const show = (phase: TextAssistantView['phase']) =>
    component.rerender(
      <StandaloneVoice
        householdId="linden"
        assistant={{ ...view, phase }}
        onAssistant={changed}
        onAccessLost={() => {}}
        onCancel={cancel}
      />,
    );
  show('ready');
  const { remote } = await startWithAudio();
  expect(screen.queryByRole('button', { name: 'Avbryt' })).toBeNull();
  signals.set(remote, 22);
  await screen.findByText('Skyttel talar');
  await userEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
  expect(audios[0].muted).toBe(true);
  expect(cancel).not.toHaveBeenCalled();
  expect(voiceBox()?.textContent).toBe('Lyssnar');
  expect(document.activeElement).toBe(microphoneButton());
  // What Skyttel says next is heard again, once the silenced words have ended.
  signals.set(remote, 0);
  await waitFor(() => expect(audios[0].muted).toBe(false), { timeout: 3000 });
  signals.set(remote, 22);
  await screen.findByText('Skyttel talar');
  signals.set(remote, 0);
  await screen.findByText('Lyssnar');
  // A written message counts while the microphone is on.
  show('working');
  expect(voiceBox()?.textContent).toBe('Skyttel arbetar');
  await userEvent.click(screen.getByRole('button', { name: 'Avbryt' }));
  expect(cancel).toHaveBeenCalledOnce();
});

test('a screen reader is told Lyssnar once, Skyttel arbetar, and Mikrofonen är av when the box goes', async () => {
  const { signals } = meteredAudio();
  const { track, view } = setup();
  let phase = 'listening';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json({
        sdp: 'answer',
        assistant: view,
        voice: {
          id: 'voice-session',
          phase: url.endsWith('/stop') ? 'closed' : phase,
          seconds: null,
          usageFinal: false,
        },
      }),
    ),
  );
  await userEvent.click(microphoneButton());
  // The focus is elsewhere, so the button's own state is not what the user hears.
  microphoneButton().blur();
  expect(voiceBox()?.textContent).toBe('Rösten startar');
  expect(announcement()).toBe('');
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  const peer = Peer.all[0];
  const remote = new Track();
  await act(async () => {
    peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
    peer.dispatchEvent(Object.assign(new Event('track'), { track: remote }));
  });
  await waitFor(() => expect(announcement()).toBe('Lyssnar'));
  const first = announced();
  signals.set(track, 22);
  await screen.findByText('Du talar');
  signals.set(track, 0);
  await waitFor(() => expect(voiceBox()?.textContent).toBe('Lyssnar'));
  // The word came back after talk. It is not read again.
  expect(announced()).toBe(first);
  phase = 'working';
  await waitFor(() => expect(announcement()).toBe('Skyttel arbetar'), { timeout: 2000 });
  expect(voiceBox()?.textContent).toBe('Skyttel arbetar');
  phase = 'listening';
  signals.set(remote, 22);
  await screen.findByText('Skyttel talar');
  expect(announcement()).toBe('Skyttel arbetar');
  await userEvent.click(microphoneButton());
  microphoneButton().blur();
  expect(voiceBox()?.textContent).toBe('Skyttel talar');
  expect(announcement()).toBe('Skyttel arbetar');
  signals.set(remote, 0);
  await waitFor(() => expect(announcement()).toBe('Mikrofonen är av'));
  expect(voiceBox()).toBeNull();
});

test('the button says its own state while it has the focus, so nothing more is read', async () => {
  setup();
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  await act(async () =>
    Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
  );
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(microphoneButton());
  expect(announcement()).toBe('');
  await userEvent.click(microphoneButton());
  expect(voiceBox()).toBeNull();
  expect(announcement()).toBe('');
});

test('with the microphone off the connection stays while Skyttel finishes, and the microphone stays off after a reconnection', async () => {
  const { track, calls, getUserMedia } = setup();
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  const peer = Peer.all[0];
  await act(async () =>
    peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
  );
  await userEvent.click(microphoneButton());
  expect(track.enabled).toBe(false);
  expect(track.stop).not.toHaveBeenCalled();
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('false');
  await act(async () => {
    peer.connectionState = 'disconnected';
    peer.dispatchEvent(new Event('connectionstatechange'));
    peer.connectionState = 'connected';
    peer.dispatchEvent(new Event('connectionstatechange'));
  });
  expect(track.enabled).toBe(false);
  await userEvent.click(microphoneButton());
  expect(track.enabled).toBe(true);
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('true');
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(calls.filter((call) => call.url === base)).toHaveLength(1);
  expect(calls.some((call) => call.url.endsWith('/stop'))).toBe(false);
});

test('the muted connection outlasts delayed delegation and quiet gaps in the answer', async () => {
  const { track, calls } = setup();
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  const peer = Peer.all[0];
  await act(async () =>
    peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
  );
  const stopped = () => calls.some((call) => call.url.endsWith('/stop'));
  vi.useFakeTimers();
  fireEvent.click(microphoneButton());
  expect(track.enabled).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(stopped()).toBe(false);
  // Skyttel takes on what was said just before the microphone was turned off.
  await act(async () =>
    peer.channel.emit({
      type: 'session.delegation.created',
      offset_ms: 100,
      delegation: { id: 'task', type: 'delegation', target: 'client' },
    }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(stopped()).toBe(false);
  expect(track.stop).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(501);
  });
  expect(stopped()).toBe(false);
  expect(track.stop).not.toHaveBeenCalled();
  expect(peer.connectionState).toBe('connected');
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a task that was said is worked through with the microphone off, including a delayed answer', async () => {
  const { view, track } = setup();
  let phase = 'working';
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      return Response.json({
        sdp: 'answer',
        assistant: view,
        voice: {
          id: 'voice-session',
          phase: url.endsWith('/poll') ? phase : url.endsWith('/stop') ? 'closed' : 'listening',
          seconds: null,
          usageFinal: false,
        },
      });
    }),
  );
  // The polls that follow the task run on the test's clock from the start.
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(microphoneButton());
  });
  await act(async () => {
    Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
    await vi.advanceTimersByTimeAsync(600);
  });
  expect(voiceBox()?.textContent).toBe('Skyttel arbetar');
  fireEvent.click(microphoneButton());
  expect(track.enabled).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000 * 3);
  });
  // The box stays for the task that was said, with the stop icon, and the microphone can be turned on.
  expect(voiceBox()?.textContent).toBe('Skyttel arbetar');
  expect(screen.getByRole('button', { name: 'Avbryt' })).toBeDefined();
  expect(microphoneButton().disabled).toBe(false);
  expect(urls.some((url) => url.endsWith('/stop'))).toBe(false);
  phase = 'listening';
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000 / 2);
  });
  expect(voiceBox()).toBeNull();
  expect(urls.some((url) => url.endsWith('/stop'))).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
  expect(urls.some((url) => url.endsWith('/stop'))).toBe(false);
  expect(track.stop).not.toHaveBeenCalled();
});

test.each(['a new conversation', 'revoked access'])(
  'the conversation text keeps both speakers and short pauses, then is emptied by %s',
  async (ending) => {
    const { component } = setup();
    component.unmount();
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (url.endsWith('/messages')) return Response.json({ error: 'forbidden' }, { status: 403 });
      if (url.includes('/voice'))
        return Response.json({
          voice: { id: 'voice', phase: 'listening', seconds: null, usageFinal: false },
          assistant: assistant(),
          sdp: 'answer',
        });
      return Response.json(
        init?.method === 'POST' || url.endsWith('/text-session')
          ? assistant()
          : { available: true },
      );
    });
    render(
      <StandaloneConversation
        householdId="linden"
        onMapChange={vi.fn()}
        onAccessLost={vi.fn()}
        onSelectItem={async () => false}
      />,
    );
    await startConversationWithVoice();
    await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
    const peer = Peer.all[0];
    await act(async () =>
      peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
    );
    const fragment = async (
      role: 'input' | 'output',
      delta: string,
      start_ms: number,
      end_ms: number,
    ) => {
      await act(async () =>
        peer.channel.emit({ type: `session.${role}_transcript.delta`, delta, start_ms, end_ms }),
      );
    };
    await fragment('input', 'Kim betalar', 0, 1000);
    const log = await screen.findByRole('log', { name: 'Samtalstext' });
    expect(log.textContent).toContain('Du: Kim betalar');
    await fragment('output', 'Jag lyssnar.', 1100, 1300);
    await fragment('input', ' för musiken.', 1500, 1900);
    expect(log.querySelectorAll('li')).toHaveLength(2);
    expect(log.textContent).toContain('Kim betalar för musiken.');
    await fragment('output', ' Berätta mer.', 2000, 2600);
    await fragment('input', 'Rätta till Lo.', 5000, 6000);
    await fragment('output', 'Sparat säger rösten.', 6100, 6500);
    expect(log.querySelectorAll('li')).toHaveLength(4);
    expect(log.textContent).toContain('Skyttel: Jag lyssnar. Berätta mer.');
    expect(screen.getByRole('status').textContent).toContain('Nya förslag är osparade');
    expect(voiceBox()?.textContent).toBe('Lyssnar');
    const newConversation = () =>
      screen.getByRole('button', { name: 'Nytt samtal' }) as HTMLButtonElement;
    if (ending === 'a new conversation') {
      expect(log.textContent).toContain('Kim betalar för musiken.');
      await userEvent.click(newConversation());
      await fragment('output', 'För sent.', 7000, 7500);
      expect(log.textContent).not.toContain('För sent.');
    } else {
      await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Privat text');
      await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
    }
    const emptied = 'Här visas det du och Skyttel säger och skriver.';
    await waitFor(() => expect(log.textContent).toBe(emptied));
    if (ending === 'revoked access') {
      expect(newConversation().disabled).toBe(true);
      // The consent for the visit still applies, so the next conversation starts directly.
      await chooseConversationText();
      await waitFor(() => expect(newConversation().disabled).toBe(false));
    }
    expect(queryConsentBox()).toBeNull();
    expect(log.textContent).toBe(emptied);
  },
);

test('a voice poll answered after access is revoked cannot reopen the conversation', async () => {
  const { component } = setup();
  component.unmount();
  const held = new Map<string, (response: Response) => void>();
  const voice = { id: 'voice', phase: 'listening', seconds: null, usageFinal: false };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const name = url.split('/').at(-1) ?? '';
    if (['messages', 'poll'].includes(name))
      return new Promise<Response>((resolve) => held.set(name, resolve));
    if (url.includes('/voice'))
      return Response.json({ voice, assistant: assistant(), sdp: 'answer' });
    return Response.json(
      init?.method === 'POST' || url.endsWith('/text-session') ? assistant() : { available: true },
    );
  });
  render(
    <StandaloneConversation
      householdId="linden"
      onMapChange={vi.fn()}
      onAccessLost={vi.fn()}
      onSelectItem={async () => false}
    />,
  );
  await startConversationWithVoice();
  await waitFor(() => expect(held.has('poll')).toBe(true), { timeout: 2000 });
  await userEvent.type(screen.getByLabelText('Meddelande till Skyttel'), 'Privat text');
  await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
  await waitFor(() => expect(held.has('messages')).toBe(true));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  await act(async () => {
    held.get('messages')?.(Response.json({ error: 'forbidden' }, { status: 403 }));
    await settle();
    held.get('poll')?.(Response.json({ voice, assistant: assistant() }));
    await settle();
  });
  expect(screen.getByRole('alert').textContent).toBe('Åtkomsten har upphört.');
  expect((screen.getByRole('button', { name: 'Nytt samtal' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(screen.getByRole('region', { name: 'Arbetsyta' }).dataset.sessionActive).toBe('false');
});

test('temporary disconnection leaves capture off until another press, and an unusable connection stops server work', async () => {
  const { track, calls } = setup();
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  const peer = Peer.all[0];
  await act(async () =>
    peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
  );
  vi.useFakeTimers();
  await act(async () => {
    peer.connectionState = 'disconnected';
    peer.dispatchEvent(new Event('connectionstatechange'));
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(track.enabled).toBe(false);
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('false');
  await act(async () => {
    peer.connectionState = 'connected';
    peer.dispatchEvent(new Event('connectionstatechange'));
  });
  expect(track.enabled).toBe(false);
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(microphoneButton());
  expect(track.enabled).toBe(true);
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('true');
  await act(async () => {
    peer.connectionState = 'disconnected';
    peer.dispatchEvent(new Event('connectionstatechange'));
    await vi.advanceTimersByTimeAsync(3001);
  });
  expect(track.stop).toHaveBeenCalled();
  expect(calls.some((call) => call.url.endsWith('/stop'))).toBe(true);
  expect(peer.connectionState).toBe('closed');
  expect(screen.getByRole('alert').textContent).toContain('inte ångrat');
});

test('voice starts only on request, gates microphone on protocol readiness and stops without claiming a save', async () => {
  const { track, getUserMedia, calls } = setup();
  expect(getUserMedia).not.toHaveBeenCalled();
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(calls[0]?.url).toBe(base));
  expect(calls[0].body).toEqual({
    sdp: 'synthetic-offer',
    revision: 2,
    draftVersion: 3,
    contentVersion: 1,
  });
  expect(track.enabled).toBe(false);
  // The voice starts: the name stays, and the description says what a press does.
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('false');
  expect(microphoneButton().title).toBe('Avbryt starten av rösten');
  expect(voiceBox()?.textContent).toBe('Rösten startar');
  expect(screen.queryByRole('button', { name: 'Avbryt' })).toBeNull();
  await act(async () =>
    Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
  );
  await waitFor(() => expect(track.enabled).toBe(true));
  expect(microphoneButton().title).toBe('');
  expect(voiceBox()?.textContent).toBe('Lyssnar');
  await userEvent.click(screen.getByRole('button', { name: closeVoiceConnection }));
  expect(track.stop).toHaveBeenCalled();
  await waitFor(() => expect(Peer.all[0].connectionState).toBe('closed'));
  expect(calls.some((call) => call.url === `${base}/voice-session/stop`)).toBe(true);
  expect(screen.queryByText(/^Sparat/)).toBeNull();
  expect(Peer.all[0].channel.send).not.toHaveBeenCalled();
});

test('protocol readiness keeps capture off until remote playback succeeds', async () => {
  const { track } = setup();
  let playing!: () => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(
    new Promise<void>((resolve) => {
      playing = resolve;
    }),
  );
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  await act(async () =>
    Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
  );
  expect(track.enabled).toBe(false);
  expect(voiceBox()?.textContent).toBe('Rösten startar');
  await act(async () => playing());
  expect(track.enabled).toBe(true);
  expect(voiceBox()?.textContent).toBe('Lyssnar');
});

test('blocked remote audio can be resumed explicitly and all remote tracks stop with the voice session', async () => {
  const { track } = setup();
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
    new DOMException('blocked', 'NotAllowedError'),
  );
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  const remote = new Track();
  await act(async () => {
    Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
    Peer.all[0].dispatchEvent(
      Object.assign(new Event('track'), { track: remote, streams: [new Stream([remote])] }),
    );
  });
  const resume = await screen.findByRole('button', { name: 'Spela upp ljud' });
  expect(track.enabled).toBe(false);
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('false');
  vi.mocked(HTMLMediaElement.prototype.play).mockResolvedValue();
  await userEvent.click(resume);
  await waitFor(() => expect(track.enabled).toBe(true));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Spela upp ljud' })).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: closeVoiceConnection }));
  expect(remote.stop).toHaveBeenCalled();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

test('a microphone refusal offers recovery without creating a remote session', async () => {
  const { getUserMedia, calls } = setup();
  getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
  await userEvent.click(microphoneButton());
  expect((await screen.findByRole('alert')).textContent).toContain('Mikrofonen tilläts inte');
  expect(calls).toHaveLength(0);
  expect(Peer.all[0].connectionState).toBe('closed');
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(calls[0]?.url).toBe(base));
});

test.each([
  ['NotFoundError', 'Ingen mikrofon hittades'],
  ['NotReadableError', 'Mikrofonen kunde inte öppnas'],
])(
  'microphone failure %s explains how to recover without exposing raw errors',
  async (name, message) => {
    const { getUserMedia, calls } = setup();
    getUserMedia.mockRejectedValueOnce(new DOMException('private device details', name));
    await userEvent.click(microphoneButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).not.toContain('private device details');
    expect(calls).toHaveLength(0);
  },
);

test('unsupported browsers explain missing voice support before capturing audio', async () => {
  const { calls, getUserMedia } = setup();
  vi.stubGlobal('RTCPeerConnection', undefined);
  await userEvent.click(microphoneButton());
  expect((await screen.findByRole('alert')).textContent).toContain('saknar stöd för röstsamtal');
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(calls).toHaveLength(0);
});

test.each([
  ['voice_unavailable', 'inte konfigurerad'],
  ['voice_provider_authentication_failed', 'nekade serverns API-nyckel'],
  ['voice_provider_access_denied', 'nekade åtkomst'],
  ['voice_provider_limit', 'användningsgräns'],
  ['voice_provider_rejected', 'avvisade begäran'],
  ['voice_provider_unavailable', 'kunde inte starta rösttjänsten just nu'],
  ['voice_provider_timeout', 'svarade inte i tid'],
  ['voice_connection_failed', 'Servern kunde inte ansluta'],
  ['assistant_draft_changed', 'Utkastet eller samtalet har ändrats'],
  ['voice_session_expired', 'Röstsamtalet har avslutats'],
])(
  'server failure %s remains visible with its diagnostic reference and allows retry',
  async (code, message) => {
    const { track, accessLost } = setup();
    const diagnosticId = '91c11f4f-f4c7-4f75-86d9-cb91d91ddcb8';
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: code, diagnosticId }, { status: 503 }),
    );
    await userEvent.click(microphoneButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).toContain(`Felreferens: ${diagnosticId}`);
    expect(track.stop).toHaveBeenCalled();
    expect(accessLost).not.toHaveBeenCalled();
    await userEvent.click(microphoneButton());
    await waitFor(() => expect(Peer.all[1]?.channel.readyState).toBe('open'));
    expect(screen.queryByRole('alert')).toBeNull();
  },
);

test('untrusted diagnostic references and error messages are not rendered', async () => {
  setup();
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json(
      { error: 'voice_connection_failed', diagnosticId: 'private provider details' },
      { status: 503 },
    ),
  );
  await userEvent.click(microphoneButton());
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Servern kunde inte ansluta');
  expect(alert.textContent).not.toContain('private provider details');
  expect(alert.textContent).not.toContain('Felreferens');
});

test('cancelling permission stops a late microphone stream without opening a session', async () => {
  const { getUserMedia, track, calls, changed } = setup();
  let grant!: (stream: Stream) => void;
  getUserMedia.mockReturnValueOnce(
    new Promise<Stream>((resolve) => {
      grant = resolve;
    }),
  );
  await userEvent.click(microphoneButton());
  expect(voiceBox()?.textContent).toBe('Rösten startar');
  await userEvent.click(microphoneButton());
  await act(async () => grant(new Stream([track])));
  expect(track.stop).toHaveBeenCalled();
  expect(calls).toHaveLength(0);
  expect(changed).not.toHaveBeenCalled();
  expect(voiceBox()).toBeNull();
  expect(microphoneButton().getAttribute('aria-pressed')).toBe('false');
});

test('a late creation response after cancellation closes that session without replacing the current assistant', async () => {
  const { track, view, changed } = setup();
  let reply!: (response: Response) => void;
  const posted: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      posted.push(url);
      if (url === base)
        return new Promise<Response>((resolve) => {
          reply = resolve;
        });
      return Response.json({
        voice: { id: 'late', phase: 'closed', seconds: null, usageFinal: false },
        assistant: view,
      });
    }),
  );
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(posted).toContain(base));
  await userEvent.click(microphoneButton());
  await act(async () =>
    reply(
      Response.json({
        sdp: 'late-answer',
        voice: { id: 'late' },
        assistant: { ...view, reply: 'stale text' },
      }),
    ),
  );
  expect(posted).toContain(`${base}/late/stop`);
  expect(track.stop).toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

test.each(['microphone', 'audio', 'provider', 'channel', 'peer'] as const)(
  '%s failure stops capture and cancels the associated server work',
  async (kind) => {
    const { track, calls, audios } = setup();
    await userEvent.click(microphoneButton());
    await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
    await act(async () => {
      const peer = Peer.all[0];
      peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
      if (kind === 'microphone') track.dispatchEvent(new Event('ended'));
      if (kind === 'audio') audios[0].dispatchEvent(new Event('error'));
      if (kind === 'provider')
        peer.channel.emit({ type: 'error', error: { message: 'private provider detail' } });
      if (kind === 'channel') peer.channel.close();
      if (kind === 'peer') {
        peer.connectionState = 'failed';
        peer.dispatchEvent(new Event('connectionstatechange'));
      }
    });
    expect(track.stop).toHaveBeenCalled();
    expect(calls.some((call) => call.url.endsWith('/stop'))).toBe(true);
    expect(screen.getByRole('alert').textContent).not.toContain('private provider detail');
    expect(microphoneButton()).toBeDefined();
  },
);

test('a server-reported voice failure explains the interruption while preserving text recovery', async () => {
  const { view } = setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      Response.json({
        sdp: 'answer',
        assistant: view,
        voice: {
          id: 'voice-session',
          phase: url.endsWith('/poll') ? 'error' : url.endsWith('/stop') ? 'closed' : 'listening',
          seconds: null,
          usageFinal: false,
        },
      }),
    ),
  );
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  expect((await screen.findByRole('alert')).textContent).toContain('Rösttjänsten avbröt');
});

test('a delayed poll after stopping cannot replace newer assistant work', async () => {
  const { view, changed } = setup();
  let reply!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/poll'))
        return new Promise<Response>((resolve) => {
          reply = resolve;
        });
      return Response.json({
        sdp: 'answer',
        assistant: view,
        voice: {
          id: 'voice-session',
          phase: url.endsWith('/stop') ? 'closed' : 'listening',
          seconds: null,
          usageFinal: false,
        },
      });
    }),
  );
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(reply).toBeDefined());
  await userEvent.click(screen.getByRole('button', { name: closeVoiceConnection }));
  await waitFor(() => expect(microphoneButton().disabled).toBe(false));
  changed.mockClear();
  await act(async () =>
    reply(
      Response.json({
        assistant: { ...view, revision: 99, reply: 'late abandoned work' },
        voice: { id: 'voice-session', phase: 'working' },
      }),
    ),
  );
  expect(changed).not.toHaveBeenCalled();
  expect(voiceBox()).toBeNull();
});

test('losing the polling connection stops capture and preserves an explicit recovery message', async () => {
  const { view, track } = setup();
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/poll')) throw new TypeError('Network interrupted');
      return Response.json({
        sdp: 'answer',
        assistant: view,
        voice: {
          id: 'voice-session',
          phase: url.endsWith('/stop') ? 'closed' : 'listening',
          seconds: null,
          usageFinal: false,
        },
      });
    }),
  );
  await userEvent.click(microphoneButton());
  expect((await screen.findByRole('alert')).textContent).toContain('kontrollera sparförsök');
  expect(track.stop).toHaveBeenCalled();
  expect(calls).toContain(`${base}/voice-session/stop`);
});

test('an unconfirmed remote stop has a bounded drain and never claims known final usage', async () => {
  const { track, view, recoveryNeeded } = setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/stop')) return new Promise<Response>(() => {});
      return Response.json({
        sdp: 'answer',
        assistant: view,
        voice: { id: 'voice-session', phase: 'listening', seconds: 12, usageFinal: false },
      });
    }),
  );
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: closeVoiceConnection }));
  expect(track.stop).toHaveBeenCalled();
  expect(Peer.all[0].connectionState).toBe('connected');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5001);
  });
  expect(Peer.all[0].connectionState).toBe('closed');
  expect(screen.getByRole('alert').textContent).toContain('Serverns avslut kunde inte bekräftas');
  expect(recoveryNeeded).toHaveBeenCalledOnce();
});

test('missing protocol startup times out without ever enabling microphone capture', async () => {
  const { track, calls } = setup();
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(microphoneButton());
  });
  expect(Peer.all[0].channel.readyState).toBe('open');
  // The SDK negotiated, but no session.started event arrived.
  await act(async () => Peer.all[0].channel.emit({ type: 'session.started', session: {} }));
  expect(track.enabled).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_001);
  });
  expect(track.stop).toHaveBeenCalled();
  expect(calls.some((call) => call.url.endsWith('/stop'))).toBe(true);
});

test('revoked access during setup reports access loss and releases microphone resources', async () => {
  const { accessLost, track } = setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ error: 'forbidden' }, { status: 403 })),
  );
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(accessLost).toHaveBeenCalledOnce());
  expect(track.stop).toHaveBeenCalled();
  expect(Peer.all[0].connectionState).toBe('closed');
});

test('the microphone cannot be turned on while Skyttel works with a written message, and recovery keeps it available', async () => {
  const { component, view, getUserMedia } = setup();
  const changed = vi.fn();
  component.rerender(
    <StandaloneVoice
      householdId="linden"
      assistant={{ ...view, phase: 'working' }}
      onAssistant={changed}
      onAccessLost={() => {}}
    />,
  );
  expect(microphoneButton().disabled).toBe(true);
  // A conversation with text alone never shows the voice box.
  expect(voiceBox()).toBeNull();
  expect(getUserMedia).not.toHaveBeenCalled();
  component.rerender(
    <StandaloneVoice
      householdId="linden"
      assistant={{ ...view, phase: 'recovery' }}
      onAssistant={changed}
      onAccessLost={() => {}}
    />,
  );
  expect(microphoneButton().disabled).toBe(false);
});

test.each([
  ['working', 'Skyttel arbetar'],
  ['recovery', 'Lyssnar'],
  ['closed', null],
  ['closing', null],
])(
  'the public %s state updates the voice box with the current displayed anchor',
  async (phase, word) => {
    const { view } = setup();
    const polls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.endsWith('/poll')) polls.push(JSON.parse(String(init.body)));
        return Response.json({
          sdp: 'answer',
          assistant: view,
          voice: {
            id: 'voice-session',
            phase: url.endsWith('/poll') ? phase : url.endsWith('/stop') ? 'closed' : 'listening',
            seconds: null,
            usageFinal: false,
          },
        });
      }),
    );
    await userEvent.click(microphoneButton());
    await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
    await act(async () =>
      Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
    );
    await waitFor(() => expect(polls).not.toEqual([]), { timeout: 2000 });
    await waitFor(() => expect(voiceBox()?.textContent ?? null).toBe(word));
    expect(microphoneButton().getAttribute('aria-pressed')).toBe(String(word !== null));
    expect(polls[0]).toEqual({ revision: 2, draftVersion: 3, contentVersion: 1 });
  },
);

test.each(['resolved', 'rejected'])(
  'late %s playback and provider events cannot re-enable stopped capture during finalization',
  async (outcome) => {
    const { view, track } = setup();
    let finishAudio!: () => void;
    vi.mocked(HTMLMediaElement.prototype.play).mockReturnValueOnce(
      new Promise<void>((resolve, reject) => {
        finishAudio = () =>
          outcome === 'resolved'
            ? resolve()
            : reject(new DOMException('blocked', 'NotAllowedError'));
      }),
    );
    let finishStop!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/stop'))
          return new Promise<Response>((resolve) => {
            finishStop = resolve;
          });
        return Response.json({
          sdp: 'answer',
          assistant: view,
          voice: { id: 'voice-session', phase: 'listening', seconds: null, usageFinal: false },
        });
      }),
    );
    await userEvent.click(microphoneButton());
    await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
    const peer = Peer.all[0];
    const remote = new Track();
    await act(async () => {
      peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
      peer.dispatchEvent(Object.assign(new Event('track'), { track: remote, streams: [] }));
    });
    await userEvent.click(screen.getByRole('button', { name: closeVoiceConnection }));
    const late = new Track();
    await act(async () => {
      peer.dispatchEvent(Object.assign(new Event('track'), { track: late, streams: [] }));
      peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
      peer.channel.emit({ type: 'session.closed', session: { id: 'provider-session' } });
      peer.channel.emit({ type: 'error', error: {} });
      finishAudio();
    });
    expect(track.enabled).toBe(false);
    expect(remote.stop).toHaveBeenCalled();
    expect(late.stop).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Spela upp ljud' })).toBeNull();
    await act(async () =>
      finishStop(
        Response.json({
          assistant: view,
          voice: { id: 'voice-session', phase: 'closed', seconds: 15, usageFinal: true },
        }),
      ),
    );
    expect(peer.connectionState).toBe('closed');
  },
);

test('a remote protocol close stops microphone input and fetches the server finalization result', async () => {
  const { calls, track } = setup();
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  await act(async () =>
    Peer.all[0].channel.emit({ type: 'session.closed', session: { id: 'provider-session' } }),
  );
  expect(track.stop).toHaveBeenCalled();
  expect(calls.some((call) => call.url.endsWith('/stop'))).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('Rösttjänsten avslutade samtalet');
});

test('a rejected stop request closes local resources and requires receipt recovery before text work', async () => {
  const { view, track, recoveryNeeded } = setup();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/stop')) throw new TypeError('Connection lost');
      return Response.json({
        sdp: 'answer',
        assistant: view,
        voice: { id: 'voice-session', phase: 'listening', seconds: null, usageFinal: false },
      });
    }),
  );
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  await userEvent.click(screen.getByRole('button', { name: closeVoiceConnection }));
  expect(track.stop).toHaveBeenCalled();
  expect(Peer.all[0].connectionState).toBe('closed');
  expect(recoveryNeeded).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert').textContent).toContain('Serverns avslut kunde inte bekräftas');
});

test('an older voice reply cannot overwrite a newer displayed text revision', async () => {
  const { component, view, changed, calls } = setup();
  await userEvent.click(microphoneButton());
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  changed.mockClear();
  component.rerender(
    <StandaloneVoice
      householdId="linden"
      assistant={{ ...view, revision: 3 }}
      onAssistant={changed}
      onAccessLost={() => {}}
    />,
  );
  await waitFor(() => expect(calls.some((call) => call.url.endsWith('/poll'))).toBe(true));
  expect(calls.find((call) => call.url.endsWith('/poll'))?.body).toEqual({
    revision: 3,
    draftVersion: 3,
    contentVersion: 1,
  });
  expect(changed).not.toHaveBeenCalled();
});
