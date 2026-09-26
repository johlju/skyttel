import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { TextAssistant } from '../../../src/client/TextAssistant.js';
import { VoiceAssistant } from '../../../src/client/VoiceAssistant.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';

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
    <VoiceAssistant
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
afterEach(async () => {
  await act(async () => cleanup());
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'mediaDevices');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('pausing the microphone preserves the session and remains paused after reconnection', async () => {
  const { track, calls, getUserMedia } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  const peer = Peer.all[0];
  await act(async () =>
    peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Pausa mikrofon' }));
  expect(track.enabled).toBe(false);
  expect(track.stop).not.toHaveBeenCalled();
  expect(screen.getByText('Mikrofonen är pausad')).toBeDefined();
  await act(async () => {
    peer.connectionState = 'disconnected';
    peer.dispatchEvent(new Event('connectionstatechange'));
    peer.connectionState = 'connected';
    peer.dispatchEvent(new Event('connectionstatechange'));
  });
  expect(track.enabled).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Återuppta mikrofon' }));
  expect(track.enabled).toBe(true);
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(calls.filter((call) => call.url === base)).toHaveLength(1);
  expect(calls.some((call) => call.url.endsWith('/stop'))).toBe(false);
});

test.each(['stop', 'revoked'])(
  'the conversation keeps both speakers and short pauses, then clears on %s',
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
      <TextAssistant
        householdId="linden"
        onMapChange={vi.fn()}
        onAccessLost={vi.fn()}
        onSelectItem={async () => false}
      />,
    );
    await userEvent.click(await screen.findByLabelText(/Jag tillåter att OpenAI/));
    await userEvent.click(screen.getByLabelText(/Jag tillåter förslag och sparande/));
    await userEvent.click(screen.getByRole('button', { name: 'Starta talsamtal' }));
    await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
    const peer = Peer.all[0];
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
    const log = await screen.findByRole('log', { name: 'Samtalets dialog' });
    expect(log.textContent).toContain('DuKim betalar');
    await fragment('output', 'Jag lyssnar.', 1100, 1300);
    await fragment('input', ' för musiken.', 1500, 1900);
    expect(log.querySelectorAll('li')).toHaveLength(2);
    expect(log.textContent).toContain('Kim betalar för musiken.');
    await fragment('output', ' Berätta mer.', 2000, 2600);
    await fragment('input', 'Rätta till Lo.', 5000, 6000);
    await fragment('output', 'Sparat säger rösten.', 6100, 6500);
    expect(log.querySelectorAll('li')).toHaveLength(4);
    expect(log.textContent).toContain('SkyttelJag lyssnar. Berätta mer.');
    expect(screen.getByRole('status').textContent).toContain('Nya förslag är osparade');
    if (ending === 'stop') {
      await userEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
      await fragment('output', 'För sent.', 7000, 7500);
      expect(log.textContent).not.toContain('För sent.');
      expect(log.textContent).toContain('Kim betalar för musiken.');
      await userEvent.click(screen.getByRole('button', { name: 'Avsluta textassistenten' }));
    } else {
      await userEvent.type(screen.getByLabelText('Meddelande till textassistenten'), 'Privat text');
      await userEvent.click(screen.getByRole('button', { name: 'Skicka' }));
    }
    expect(screen.queryByRole('log')).toBeNull();
    await userEvent.click(screen.getByLabelText(/Jag tillåter att OpenAI/));
    await userEvent.click(screen.getByLabelText(/Jag tillåter förslag och sparande/));
    await userEvent.click(screen.getByRole('button', { name: 'Starta textassistenten' }));
    expect(screen.queryByRole('log')).toBeNull();
  },
);

test('temporary disconnection mutes capture, recovery re-enables it and an unusable connection stops server work', async () => {
  const { track, calls } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
  expect(screen.getByText(/^Anslutningen är tillfälligt bruten/)).toBeDefined();
  await act(async () => {
    peer.connectionState = 'connected';
    peer.dispatchEvent(new Event('connectionstatechange'));
  });
  expect(track.enabled).toBe(true);
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(calls[0]?.url).toBe(base));
  expect(calls[0].body).toEqual({
    sdp: 'synthetic-offer',
    revision: 2,
    draftVersion: 3,
    contentVersion: 1,
  });
  expect(track.enabled).toBe(false);
  await act(async () =>
    Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
  );
  await waitFor(() => expect(track.enabled).toBe(true));
  expect(screen.getByText(/^Lyssnar\./)).toBeDefined();
  await userEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
  expect(track.stop).toHaveBeenCalled();
  await waitFor(() => expect(Peer.all[0].connectionState).toBe('closed'));
  expect(calls.some((call) => call.url === `${base}/voice-session/stop`)).toBe(true);
  expect(screen.queryByText(/^Sparat/)).toBeNull();
  expect(Peer.all[0].channel.send).not.toHaveBeenCalled();
});

test('blocked remote audio can be resumed explicitly and all remote tracks stop with the voice session', async () => {
  const { track } = setup();
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(
    new DOMException('blocked', 'NotAllowedError'),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  const remote = new Track();
  await act(async () => {
    Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
    Peer.all[0].dispatchEvent(
      Object.assign(new Event('track'), { track: remote, streams: [new Stream([remote])] }),
    );
  });
  const resume = await screen.findByRole('button', { name: 'Spela upp ljud' });
  expect(track.enabled).toBe(true);
  await userEvent.click(resume);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Spela upp ljud' })).toBeNull());
  await userEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
  expect(remote.stop).toHaveBeenCalled();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

test('a microphone refusal offers recovery without creating a remote session', async () => {
  const { getUserMedia, calls } = setup();
  getUserMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Mikrofonen tilläts inte');
  expect(calls).toHaveLength(0);
  expect(Peer.all[0].connectionState).toBe('closed');
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).not.toContain('private device details');
    expect(calls).toHaveLength(0);
  },
);

test('unsupported browsers explain missing voice support before capturing audio', async () => {
  const { calls, getUserMedia } = setup();
  vi.stubGlobal('RTCPeerConnection', undefined);
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).toContain(`Felreferens: ${diagnosticId}`);
    expect(track.stop).toHaveBeenCalled();
    expect(accessLost).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await userEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
  await act(async () => grant(new Stream([track])));
  expect(track.stop).toHaveBeenCalled();
  expect(calls).toHaveLength(0);
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByText('Rösten är avstängd.')).toBeDefined();
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(posted).toContain(base));
  await userEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
    expect(screen.getByRole('button', { name: 'Starta röst' })).toBeDefined();
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(reply).toBeDefined());
  await userEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
  await screen.findByRole('button', { name: 'Starta röst' });
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
  expect(screen.getByText('Rösten är avstängd.')).toBeDefined();
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(accessLost).toHaveBeenCalledOnce());
  expect(track.stop).toHaveBeenCalled();
  expect(Peer.all[0].connectionState).toBe('closed');
});

test('working text tasks prevent a new voice connection and recovery keeps voice available', async () => {
  const { component, view, getUserMedia } = setup();
  const changed = vi.fn();
  component.rerender(
    <VoiceAssistant
      householdId="linden"
      assistant={{ ...view, phase: 'working' }}
      onAssistant={changed}
      onAccessLost={() => {}}
    />,
  );
  expect((screen.getByRole('button', { name: 'Starta röst' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  expect(getUserMedia).not.toHaveBeenCalled();
  component.rerender(
    <VoiceAssistant
      householdId="linden"
      assistant={{ ...view, phase: 'recovery' }}
      onAssistant={changed}
      onAccessLost={() => {}}
    />,
  );
  expect((screen.getByRole('button', { name: 'Starta röst' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

test.each([
  ['working', 'Assistenten arbetar…'],
  ['recovery', 'Kontrollera det tidigare sparförsöket innan nya ändringar.'],
  ['closed', 'Rösten är avstängd.'],
  ['closing', 'Rösten är avstängd.'],
])(
  'the public %s state updates voice status with the current displayed anchor',
  async (phase, message) => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
    await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
    await act(async () =>
      Peer.all[0].channel.emit({ type: 'session.started', session: { id: 'provider-session' } }),
    );
    expect(await screen.findByText(message)).toBeDefined();
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
    await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
    await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
    const peer = Peer.all[0];
    const remote = new Track();
    await act(async () => {
      peer.channel.emit({ type: 'session.started', session: { id: 'provider-session' } });
      peer.dispatchEvent(Object.assign(new Event('track'), { track: remote, streams: [] }));
    });
    await userEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
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
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  await userEvent.click(screen.getByRole('button', { name: 'Stäng av rösten' }));
  expect(track.stop).toHaveBeenCalled();
  expect(Peer.all[0].connectionState).toBe('closed');
  expect(recoveryNeeded).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert').textContent).toContain('Serverns avslut kunde inte bekräftas');
});

test('an older voice reply cannot overwrite a newer displayed text revision', async () => {
  const { component, view, changed, calls } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Starta röst' }));
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  changed.mockClear();
  component.rerender(
    <VoiceAssistant
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
