import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ConversationWorkspace } from '../../../src/client/TextAssistant.js';
import {
  type Conversation,
  conversationOngoing,
  useConversation,
} from '../../../src/client/use-conversation.js';
import type { SavedConversationConsent } from '../../../src/shared/conversation-consent.js';
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
    const track = new Track();
    this.dispatchEvent(
      Object.assign(new Event('track'), { track, streams: [new Stream([track])] }),
    );
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
const consentPath = '/api/households/linden/conversation-consent';
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
/**
 * Answers as the server does and records every command it receives. A start
 * needs a consent for text version 1: saved, or stated for the visit.
 */
function server({
  saved = null,
  saves = true,
}: {
  saved?: SavedConversationConsent | null;
  saves?: boolean;
} = {}) {
  const commands: string[] = [];
  const starts: unknown[] = [];
  let current = session();
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.method === 'POST' ? JSON.parse(String(init.body)) : undefined;
    if (url === consentPath) {
      if (!body) return Response.json({ saved });
      commands.push('consent');
      if (!saves) return Response.json({ error: 'internal_error' }, { status: 500 });
      saved = { textVersion: body.textVersion, savedAt: '2026-10-01T08:00:00.000Z' };
      return Response.json({ saved });
    }
    if (!body) return Response.json(url === path ? { available: true } : current);
    commands.push(url.slice(path.length) || '/');
    if (url === path) {
      starts.push(body);
      if (saved?.textVersion !== 1 && body.consent?.textVersion !== 1)
        return Response.json({ error: 'conversation_consent_required' }, { status: 403 });
    }
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
    if (url.endsWith('/new'))
      current = {
        ...current,
        revision: current.revision + 1,
        phase: 'ready',
        reply: 'Nytt samtal. Utkastet är tomt.',
      };
    return Response.json(current);
  });
  return { commands, starts };
}
/** The hook once the server has said that the conversation is offered. */
async function conversationHook(onAccessLost = vi.fn()) {
  const hook = renderHook(() => useConversation({ ...household, onAccessLost }));
  await waitFor(() => expect(hook.result.current.available).toBe(true));
  return hook.result;
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

test('the conversation is started, written to, cancelled and started over without any panel', async () => {
  const { commands } = server();
  const result = await conversationHook();
  expect(conversationOngoing(result.current, false)).toBe(false);
  act(() => result.current.begin('text'));
  await act(() => result.current.approve(false));
  await waitFor(() => expect(result.current.session?.id).toBe('session'));

  act(() => result.current.setText('Lägg till cykeln.'));
  expect(result.current.text).toBe('Lägg till cykeln.');
  await act(() => result.current.send());
  expect(result.current.text).toBe('');
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Lägg till cykeln.']);
  expect(result.current.working).toBe(true);
  expect(conversationOngoing(result.current, false)).toBe(true);

  await act(() => result.current.cancel());
  expect(result.current.working).toBe(false);
  // A new conversation empties the conversation text. Skyttel says what the
  // draft keeps, and the conversation and the unsent text stay.
  act(() => result.current.setText('Oskickat'));
  await act(() => result.current.newConversation());
  expect(result.current.session?.id).toBe('session');
  expect(result.current.transcript.map((row) => [row.role, row.text])).toEqual([
    ['assistant', 'Nytt samtal. Utkastet är tomt.'],
  ]);
  expect(result.current.text).toBe('Oskickat');
  expect(conversationOngoing(result.current, false)).toBe(true);
  expect(commands).toEqual(['/', '/session/messages', '/session/cancel', '/session/new']);
});

test('a new conversation needs a conversation, and one that is not answered keeps the conversation text', async () => {
  const { commands } = server();
  const result = await conversationHook();
  await act(() => result.current.newConversation());
  expect(commands).toEqual([]);

  act(() => result.current.begin('text'));
  await act(() => result.current.approve(false));
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  act(() => result.current.setText('Lägg till cykeln.'));
  await act(() => result.current.send());
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/new')) throw new TypeError('Synthetic network failure');
    return respond(url, init);
  });
  await act(() => result.current.newConversation());
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Lägg till cykeln.']);
  expect(result.current.unknown).toBe(true);
  expect(result.current.error).toContain('Svaret saknas');
  expect(result.current.pending).toBe(false);
  act(() => result.current.setText('Nytt samtal'));
  await act(() => result.current.send());
  expect(result.current.text).toBe('Nytt samtal');
  expect(result.current.transcript.map((row) => row.text)).toEqual(['Lägg till cykeln.']);
});

test('a new conversation that is answered after the user has left the map changes nothing', async () => {
  let answer: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    answer = resolve;
  });
  server();
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/new')) await held;
    return respond(url, init);
  });
  const { result, rerender } = renderHook(
    ({ enabled }) => useConversation({ ...household, enabled }),
    { initialProps: { enabled: true } },
  );
  await waitFor(() => expect(result.current.available).toBe(true));
  act(() => result.current.begin('text'));
  await act(() => result.current.approve(false));
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  let renewed: Promise<void> | undefined;
  act(() => {
    renewed = result.current.newConversation();
  });
  rerender({ enabled: false });
  await act(async () => {
    answer?.();
    await renewed;
  });
  expect(result.current.session).toBeNull();
  expect(result.current.transcript).toEqual([]);
});

test('the conversation waits for the map and ends when the map is lost', async () => {
  const { commands } = server();
  const fetched = vi.spyOn(globalThis, 'fetch');
  const { result, rerender } = renderHook(
    ({ enabled }) => useConversation({ ...household, enabled }),
    { initialProps: { enabled: false } },
  );
  expect(fetched).not.toHaveBeenCalled();
  expect(result.current.available).toBeNull();
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.available).toBe(true));
  act(() => result.current.begin('text'));
  await act(() => result.current.approve(false));
  await waitFor(() => expect(result.current.session).not.toBeNull());
  act(() => result.current.setText('Oskickat'));
  rerender({ enabled: false });
  expect(result.current.session).toBeNull();
  expect(result.current.text).toBe('');
  expect(result.current.available).toBeNull();
  expect(commands).toEqual(['/', '/session/stop']);

  // A consent that is not saved ends when the user leaves the household's map.
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.available).toBe(true));
  expect(result.current.consent).toMatchObject({ visit: false, valid: false });
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.consent.asking).toBe('text'));
  expect(commands).toEqual(['/', '/session/stop']);
});

test('without a valid consent the consent box asks first, and the chosen button decides how the conversation starts', async () => {
  const { commands, starts } = server();
  const result = await conversationHook();
  await waitFor(() => expect(result.current.consent.saved).toBeNull());
  expect(result.current.consent).toMatchObject({ visit: false, valid: false, asking: null });

  act(() => result.current.begin('voice'));
  await waitFor(() => expect(result.current.consent.asking).toBe('voice'));
  act(() => result.current.decline());
  expect(result.current.consent.asking).toBeNull();
  expect(result.current.session).toBeNull();
  expect(commands).toEqual([]);

  act(() => result.current.begin('text'));
  expect(result.current.consent.asking).toBe('text');
  await act(() => result.current.approve(false));
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  expect(result.current.consent).toMatchObject({
    saved: null,
    visit: true,
    valid: true,
    asking: null,
  });
  // The conversation has started with text: the microphone is not started.
  expect(result.current.voice.starting).toBe(false);
  expect(commands).toEqual(['/']);
  expect(starts).toEqual([{ consent: { textVersion: 1 } }]);

  // A started conversation is not started again.
  act(() => result.current.begin('voice'));
  expect(result.current.consent.asking).toBeNull();
  expect(commands).toEqual(['/']);

  // A new conversation does not ask again.
  await act(() => result.current.newConversation());
  expect(result.current.consent.asking).toBeNull();
  expect(result.current.session?.id).toBe('session');
  expect(commands).toEqual(['/', '/session/new']);
  expect(starts).toHaveLength(1);
});

test('a remembered consent is saved before the conversation starts, and a saved consent starts conversations directly', async () => {
  const { commands, starts } = server();
  const started = vi.fn();
  const { result, unmount } = renderHook(() =>
    useConversation({ ...household, onStarted: started }),
  );
  await waitFor(() => expect(result.current.available).toBe(true));
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.consent.asking).toBe('text'));
  await act(() => result.current.approve(true));
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  expect(started).toHaveBeenCalledOnce();
  expect(result.current.consent).toMatchObject({
    saved: { textVersion: 1, savedAt: '2026-10-01T08:00:00.000Z' },
    visit: false,
    valid: true,
    asking: null,
    saving: false,
    error: '',
  });
  expect(commands).toEqual(['consent', '/']);
  // The saved consent is on the server. The start does not state one for the visit.
  expect(starts).toEqual([{}]);
  unmount();

  // Another visit, or another of the user's devices: nothing is asked.
  commands.length = 0;
  const returning = await conversationHook();
  act(() => returning.current.begin('voice'));
  await waitFor(() => expect(returning.current.session?.id).toBe('session'));
  expect(returning.current.consent.asking).toBeNull();
  expect(commands[0]).toBe('/');
  expect(commands).not.toContain('consent');
});

test('a saved consent for an older consent text asks again', async () => {
  const { commands } = server({
    saved: { textVersion: 0, savedAt: '2026-09-01T08:00:00.000Z' },
  });
  const result = await conversationHook();
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.consent.asking).toBe('text'));
  expect(result.current.consent).toMatchObject({
    saved: { textVersion: 0, savedAt: '2026-09-01T08:00:00.000Z' },
    valid: false,
  });
  expect(commands).toEqual([]);
  await act(() => result.current.approve(true));
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  expect(result.current.consent.saved?.textVersion).toBe(1);
});

test('a consent that cannot be saved keeps the consent box open and starts nothing', async () => {
  const { commands } = server({ saves: false });
  const result = await conversationHook();
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.consent.asking).toBe('text'));
  await act(() => result.current.approve(true));
  expect(result.current.consent).toMatchObject({
    asking: 'text',
    saving: false,
    valid: false,
    error: 'Medgivandet kunde inte sparas. Försök igen.',
  });
  expect(result.current.session).toBeNull();
  expect(commands).toEqual(['consent']);

  // The user can still approve for the visit alone.
  await act(() => result.current.approve(false));
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  expect(result.current.consent.error).toBe('');
});

test('closing the consent box after a failed save removes the failure', async () => {
  server({ saves: false });
  const result = await conversationHook();
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.consent.asking).toBe('text'));
  await act(() => result.current.approve(true));
  expect(result.current.consent.error).not.toBe('');
  act(() => result.current.decline());
  expect(result.current.consent).toMatchObject({ asking: null, error: '' });
});

test('a consent that is being saved is not withdrawn by closing the consent box', async () => {
  let answer: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    answer = resolve;
  });
  const { commands } = server();
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === consentPath && init?.method === 'POST') await held;
    return respond(url, init);
  });
  const result = await conversationHook();
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.consent.asking).toBe('text'));
  let approved: Promise<void> | undefined;
  act(() => {
    approved = result.current.approve(true);
  });
  expect(result.current.consent.saving).toBe(true);
  act(() => result.current.decline());
  expect(result.current.consent.asking).toBe('text');
  await act(async () => {
    answer?.();
    await approved;
  });
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  expect(result.current.consent.saved?.textVersion).toBe(1);
  expect(commands).toEqual(['consent', '/']);
});

test('a start requested before the server has answered waits and then starts', async () => {
  let answer: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    answer = resolve;
  });
  const { commands } = server({
    saved: { textVersion: 1, savedAt: '2026-10-01T08:00:00.000Z' },
  });
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') await held;
    return respond(url, init);
  });
  const { result } = renderHook(() => useConversation(household));
  act(() => result.current.begin('voice'));
  expect(result.current.consent.asking).toBeNull();
  expect(commands).toEqual([]);
  await act(async () => answer?.());
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  expect(result.current.consent.asking).toBeNull();
});

test('a conversation that the server does not offer is not started and not asked about', async () => {
  const { commands } = server();
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
    url === path && init?.method !== 'POST'
      ? Response.json({ available: false })
      : respond(url, init),
  );
  const unavailable = vi.fn();
  const { result } = renderHook(() =>
    useConversation({ ...household, onUnavailable: unavailable }),
  );
  // A request that is made before the server has answered is told the same.
  act(() => result.current.begin('voice'));
  expect(unavailable).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.available).toBe(false));
  await waitFor(() => expect(unavailable).toHaveBeenCalledOnce());
  act(() => result.current.begin('text'));
  expect(unavailable).toHaveBeenCalledTimes(2);
  expect(result.current.consent.asking).toBeNull();
  await act(() => result.current.approve(false));
  expect(result.current.session).toBeNull();
  expect(commands).toEqual([]);
});

test('an unanswered question about the saved consent lets the consent box ask', async () => {
  server();
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === consentPath && init?.method !== 'POST') throw new Error('Synthetic lost response');
    return respond(url, init);
  });
  const result = await conversationHook();
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.consent.asking).toBe('text'));
});

test('a start that the server refuses for want of consent asks again without losing access', async () => {
  const lost = vi.fn();
  // This client believes that a consent is saved. The server no longer has it.
  const { starts } = server({
    saved: { textVersion: 1, savedAt: '2026-10-01T08:00:00.000Z' },
  });
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
    url === path && init?.method === 'POST' && !JSON.parse(String(init.body)).consent
      ? Response.json({ error: 'conversation_consent_required' }, { status: 403 })
      : respond(url, init),
  );
  const result = await conversationHook(lost);
  await waitFor(() => expect(result.current.consent.valid).toBe(true));
  act(() => result.current.begin('voice'));
  await waitFor(() => expect(result.current.consent.asking).toBe('voice'));
  expect(result.current.consent).toMatchObject({ saved: null, visit: false, valid: false });
  expect(result.current.session).toBeNull();
  expect(result.current.error).toBe('');
  expect(lost).not.toHaveBeenCalled();
  await act(() => result.current.approve(false));
  await waitFor(() => expect(result.current.session?.id).toBe('session'));
  expect(starts).toEqual([{ consent: { textVersion: 1 } }]);
});

test('access that is lost while the consent is saved ends the work in the household', async () => {
  const lost = vi.fn();
  server();
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
    url === consentPath && init?.method === 'POST'
      ? Response.json({ error: 'forbidden' }, { status: 403 })
      : respond(url, init),
  );
  const result = await conversationHook(lost);
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.consent.asking).toBe('text'));
  await act(() => result.current.approve(true));
  expect(lost).toHaveBeenCalledOnce();
  expect(result.current.error).toBe('Åtkomsten har upphört.');
  expect(result.current.consent.error).toBe('');
});

test('a start that fails for another reason does not ask for the consent again', async () => {
  server({ saved: { textVersion: 1, savedAt: '2026-10-01T08:00:00.000Z' } });
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === path && init?.method === 'POST') throw new TypeError('Synthetic lost response');
    return respond(url, init);
  });
  const result = await conversationHook();
  await waitFor(() => expect(result.current.consent.valid).toBe(true));
  act(() => result.current.begin('text'));
  await waitFor(() => expect(result.current.error).toContain('Svaret saknas.'));
  expect(result.current.consent).toMatchObject({ valid: true, asking: null });
  expect(result.current.session).toBeNull();
});

test('a saved consent that is answered after the user has left the map is not for the new visit', async () => {
  let answer: ((response: Response) => void) | undefined;
  const { commands } = server();
  const respond = globalThis.fetch;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) =>
    url === consentPath && init?.method === 'POST'
      ? new Promise<Response>((resolve) => {
          answer = resolve;
        })
      : respond(url, init),
  );
  const { result, rerender } = renderHook(
    ({ enabled }) => useConversation({ ...household, enabled }),
    { initialProps: { enabled: true } },
  );
  await waitFor(() => expect(result.current.available).toBe(true));
  act(() => result.current.begin('voice'));
  await waitFor(() => expect(result.current.consent.asking).toBe('voice'));
  let approved: Promise<void> | undefined;
  act(() => {
    approved = result.current.approve(true);
  });
  expect(result.current.consent.saving).toBe(true);
  rerender({ enabled: false });
  rerender({ enabled: true });
  await waitFor(() => expect(result.current.available).toBe(true));
  await act(async () => {
    answer?.(Response.json({ saved: { textVersion: 1, savedAt: '2026-10-01T08:00:00.000Z' } }));
    await approved;
  });
  // The new visit reads the consent from the server itself, and nothing has started.
  expect(result.current.consent).toMatchObject({ saved: null, asking: null, saving: false });
  expect(result.current.session).toBeNull();
  expect(commands).toEqual([]);
});

test('the microphone and the voice connection outlive every presentation of the conversation', async () => {
  const { commands } = server();
  const track = microphone();
  let conversation!: Conversation;
  function Workspace({ shown }: { shown: 'text view' | 'map' | 'settings' | 'nothing' }) {
    conversation = useConversation(household);
    return shown === 'nothing' ? null : (
      <ConversationWorkspace
        conversation={conversation}
        householdId="linden"
        active={shown !== 'settings'}
        textViewOpen={shown === 'text view'}
        renderWorkspace={(work) => work}
      />
    );
  }
  const textView = () => screen.getByRole('region', { name: 'Skriv till Skyttel' });
  const map = render(<Workspace shown="text view" />);
  act(() => conversation.begin('voice'));
  await act(() => conversation.approve(false));
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
  expect(textView().contains(status())).toBe(true);

  for (const shown of ['map', 'settings', 'nothing', 'text view'] as const) {
    map.rerender(<Workspace shown={shown} />);
    if (shown === 'map' || shown === 'settings') {
      expect(status().closest('.workspace-voice-controls')).not.toBeNull();
      expect(screen.queryByRole('region', { name: 'Skriv till Skyttel' })).toBeNull();
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
  expect(textView().contains(status())).toBe(true);

  map.rerender(<Workspace shown="nothing" />);
  await act(() => conversation.voice.stop());
  expect(track.stop).toHaveBeenCalled();
  expect(conversation.voice.microphone).toBe('off');
  expect(commands).toContain('/session/voice/voice/stop');
});
