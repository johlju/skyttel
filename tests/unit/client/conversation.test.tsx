import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ConversationWorkspace } from '../../../src/client/TextAssistant.js';
import {
  type Conversation,
  conversationOngoing,
  useConversation,
} from '../../../src/client/use-conversation.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { startConversationWithVoice } from '../../support/conversation-dom.js';

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

const path = '/api/households/linden/text-assistant';
function session(): TextAssistantView {
  return {
    id: 'session',
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
}
/** Answers as the server does and records every command it receives. */
function server() {
  const commands: string[] = [];
  let current = session();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json(url === path ? { available: true } : current);
    commands.push(url.slice(path.length) || '/');
    if (url.includes('/voice'))
      return Response.json({
        voice: {
          id: 'voice',
          phase: url.endsWith('/stop') ? 'closed' : 'listening',
          seconds: null,
          usageFinal: false,
        },
        assistant: current,
        sdp: 'synthetic-answer',
      });
    if (url.endsWith('/messages'))
      current = { ...current, revision: current.revision + 1, phase: 'working' };
    if (url.endsWith('/cancel'))
      current = { ...current, revision: current.revision + 1, phase: 'ready' };
    return Response.json(current);
  });
  return commands;
}
function microphone() {
  Peer.all = [];
  const track = new Track();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(new Stream([track])) },
  });
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('MediaStream', Stream);
  vi.stubGlobal('Audio', function Audio() {
    return document.createElement('audio');
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  return track;
}
const household = {
  householdId: 'linden',
  onMapChange: () => {},
  onAccessLost: () => {},
  onSelectItem: async () => false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const quiet: Parameters<typeof conversationOngoing>[0] = {
  transcript: [],
  working: false,
  voice: { microphone: 'off', starting: false, speaking: false, phase: null },
};

test('no conversation is ongoing while nothing is said, heard, in progress or shown', () => {
  expect(conversationOngoing(quiet, false)).toBe(false);
  expect(
    conversationOngoing({ ...quiet, voice: { ...quiet.voice, microphone: 'paused' } }, false),
  ).toBe(false);
  expect(
    conversationOngoing({ ...quiet, voice: { ...quiet.voice, phase: 'listening' } }, false),
  ).toBe(false);
});

test.each<[string, typeof quiet, boolean]>([
  [
    'the transcript has content',
    { ...quiet, transcript: [{ id: 'row', role: 'user', text: 'Hej' }] },
    false,
  ],
  ['the microphone is on', { ...quiet, voice: { ...quiet.voice, microphone: 'on' } }, false],
  ['the microphone is starting', { ...quiet, voice: { ...quiet.voice, starting: true } }, false],
  ['Skyttel works on a written message', { ...quiet, working: true }, false],
  [
    'Skyttel works on a spoken message',
    { ...quiet, voice: { ...quiet.voice, phase: 'working' } },
    false,
  ],
  ['Skyttel speaks', { ...quiet, voice: { ...quiet.voice, speaking: true } }, false],
  ['the text view is open', quiet, true],
])('a conversation is ongoing when %s', (_reason, conversation, textViewOpen) => {
  expect(conversationOngoing(conversation, textViewOpen)).toBe(true);
});

test('the conversation is started, written to, cancelled and ended without any panel', async () => {
  const commands = server();
  const { result } = renderHook(() => useConversation(household));
  await waitFor(() => expect(result.current.available).toBe(true));
  expect(conversationOngoing(result.current, false)).toBe(false);
  act(() => result.current.setConsent({ externalAi: true, mapWork: true }));
  expect(result.current.consent).toEqual({ externalAi: true, mapWork: true });
  await act(() => result.current.start());
  expect(result.current.session?.id).toBe('session');

  act(() => result.current.setText('Lägg till cykeln.'));
  expect(result.current.text).toBe('Lägg till cykeln.');
  await act(() => result.current.send());
  expect(result.current.text).toBe('');
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Lägg till cykeln.']);
  expect(result.current.working).toBe(true);
  expect(result.current.workStarted).not.toBeNull();
  expect(conversationOngoing(result.current, false)).toBe(true);

  await act(() => result.current.cancel());
  expect(result.current.working).toBe(false);
  expect(result.current.workStarted).toBeNull();
  await act(() => result.current.end());
  expect(result.current.session).toBeNull();
  expect(result.current.transcript).toEqual([]);
  expect(result.current.consent).toEqual({ externalAi: false, mapWork: false });
  expect(conversationOngoing(result.current, false)).toBe(false);
  expect(commands).toEqual(['/', '/session/messages', '/session/cancel', '/session/stop']);
});

test('the conversation waits for the map and ends when the map is lost', async () => {
  const commands = server();
  const fetched = vi.spyOn(globalThis, 'fetch');
  const { result, rerender } = renderHook(
    ({ enabled }) => useConversation({ ...household, enabled }),
    { initialProps: { enabled: false } },
  );
  expect(fetched).not.toHaveBeenCalled();
  expect(result.current.available).toBeNull();
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.available).toBe(true));
  await act(() => result.current.start());
  act(() => result.current.setText('Oskickat'));
  rerender({ enabled: false });
  expect(result.current.session).toBeNull();
  expect(result.current.text).toBe('');
  expect(result.current.available).toBeNull();
  expect(commands).toEqual(['/', '/session/stop']);
});

test('the microphone and the voice connection outlive every presentation of the conversation', async () => {
  const commands = server();
  const track = microphone();
  let conversation!: Conversation;
  function Workspace({ shown }: { shown: 'panel' | 'map' | 'settings' | 'nothing' }) {
    conversation = useConversation(household);
    return shown === 'nothing' ? null : (
      <ConversationWorkspace
        conversation={conversation}
        householdId="linden"
        active={shown !== 'settings'}
        conversationVisible={shown === 'panel'}
        renderWorkspace={(_work, panel) => <div data-testid="conversation-panel">{panel}</div>}
      />
    );
  }
  const map = render(<Workspace shown="panel" />);
  await startConversationWithVoice();
  await waitFor(() => expect(Peer.all[0]?.channel.readyState).toBe('open'));
  await act(async () =>
    Peer.all[0].channel.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ event_id: 'event', type: 'session.started', session: { id: 'p' } }),
      }),
    ),
  );
  await waitFor(() => expect(conversation.voice.microphone).toBe('on'));
  const status = () => screen.getByRole('region', { name: 'Aktuell status' });
  expect(screen.getByTestId('conversation-panel').contains(status())).toBe(true);

  for (const shown of ['map', 'settings', 'nothing', 'panel'] as const) {
    map.rerender(<Workspace shown={shown} />);
    if (shown === 'map' || shown === 'settings') {
      expect(status().closest('.workspace-voice-controls')).not.toBeNull();
      expect(screen.getByTestId('conversation-panel').contains(status())).toBe(false);
    }
    if (shown === 'nothing') expect(screen.queryByRole('region')).toBeNull();
    expect(conversation.voice.microphone).toBe('on');
    expect(conversationOngoing(conversation, false)).toBe(true);
  }
  expect(Peer.all).toHaveLength(1);
  expect(Peer.all[0].connectionState).toBe('connected');
  expect(track.enabled).toBe(true);
  expect(track.stop).not.toHaveBeenCalled();
  expect(commands.filter((command) => command.endsWith('/stop'))).toEqual([]);
  expect(screen.getByTestId('conversation-panel').contains(status())).toBe(true);
  expect(screen.getByText('Mikrofonen är på')).toBeDefined();

  map.rerender(<Workspace shown="nothing" />);
  await act(() => conversation.voice.stop());
  expect(track.stop).toHaveBeenCalled();
  expect(conversation.voice.microphone).toBe('off');
  expect(commands).toContain('/session/voice/voice/stop');
});
