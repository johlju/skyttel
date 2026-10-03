import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextAssistantView } from '../shared/text-assistant.js';
import type { VoiceAssistantResponse, VoiceAssistantView } from '../shared/voice-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import { MapRequestError, request } from './map-request.js';
import { voiceErrorMessage } from './voice-error.js';
import { createVoiceTransport, type VoiceTransport } from './voice-transport.js';

/** The microphone and the voice connection of one conversation. */
export type Voice = {
  state: 'idle' | 'permission' | 'connecting' | 'listening' | 'closing';
  /** The phase the server last reported for the voice connection. */
  phase: VoiceAssistantView['phase'] | null;
  /** What the user is told about the microphone. It is off while the voice starts. */
  microphone: 'off' | 'on';
  starting: boolean;
  /** Skyttel is heard. */
  speaking: boolean;
  /** The user is heard, with the microphone on. */
  userSpeaking: boolean;
  /** Skyttel works with a task that the user gave with the voice. */
  working: boolean;
  error: string;
  playbackBlocked: boolean;
  disconnected: boolean;
  /** The microphone cannot be turned on: Skyttel works with a written message. */
  disabled: boolean;
  /** The microphone's sound level right now, from 0 to 1. */
  level: () => number;
  /** A short press: starts the voice, cancels the start, or turns the microphone on or off. */
  activate: () => void;
  start: () => Promise<void>;
  /** Closes the voice connection at once, and with it the work that came by voice. */
  stop: () => Promise<void>;
  /** Silences what Skyttel is saying. */
  silence: () => void;
  /** Replace provider context and queued audio while keeping the authorized microphone. */
  newConversation: (reset: () => Promise<TextAssistantView>) => Promise<TextAssistantView>;
  playAudio: () => void;
};

type RetainedInput = { stream: MediaStream; paused: boolean };

type Attempt = {
  path: string;
  controller: AbortController;
  transport?: VoiceTransport;
  voiceId?: string;
  /** Microphone owned while a conversation reset waits for the server. */
  retained?: MediaStream;
  poll?: ReturnType<typeof setTimeout>;
};
async function stopRemote(path: string, id: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      request<VoiceAssistantResponse>(`${path}/${id}/stop`, {}, controller.signal).catch(
        () => null,
      ),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Owns the microphone and the voice connection for the conversation's session.
 * The connection lives as long as the caller and the session do, whatever
 * presentation is shown. Without a session the voice is off and cannot start.
 */
export function useVoice(options: {
  householdId: string;
  assistant: TextAssistantView | null;
  onAssistant: (view: TextAssistantView) => void;
  /** The server refuses the voice work. The failure says why. */
  onAccessLost: (failure: MapRequestError) => void;
  onRecoveryNeeded?: () => void;
  autoStart?: boolean;
  onTranscript?: (row: TranscriptRow) => void;
}): Voice {
  const path = options.assistant
    ? `/api/households/${encodeURIComponent(options.householdId)}/text-assistant/${encodeURIComponent(options.assistant.id)}/voice`
    : null;
  const latest = useRef(options);
  latest.current = options;
  const current = useRef<Attempt | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const [state, setState] = useState<Voice['state']>('idle');
  const [voice, setVoice] = useState<VoiceAssistantView | null>(null);
  const [error, setError] = useState('');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  // Microphone-off keeps the connection alive: Live has no reliable answer-complete event.
  const [off, setOff] = useState(false);
  const [activity, setActivity] = useState({ microphone: false, speaker: false });
  const apply = useCallback((view: TextAssistantView) => {
    const shown = latest.current.assistant;
    if (
      shown &&
      view.id === shown.id &&
      view.revision >= shown.revision &&
      view.review.contentVersion >= shown.review.contentVersion &&
      (view.review.contentVersion > shown.review.contentVersion ||
        view.review.version >= shown.review.version)
    )
      latest.current.onAssistant(view);
  }, []);
  const stop = useCallback(
    async (message = '') => {
      const attempt = current.current;
      if (!attempt) return;
      attempt.transport?.stopCapture();
      for (const track of attempt.retained?.getTracks() ?? []) track.stop();
      current.current = null;
      const generation = ++epoch.current;
      clearTimeout(attempt.poll);
      attempt.controller.abort();
      if (mounted.current) {
        setState('closing');
        setPlaybackBlocked(false);
        setError(message);
      }
      const result = attempt.voiceId ? await stopRemote(attempt.path, attempt.voiceId) : null;
      attempt.transport?.close();
      if (!mounted.current || generation !== epoch.current) return;
      if (result) {
        apply(result.assistant);
        setVoice(result.voice);
      }
      setState('idle');
      if (attempt.voiceId && !result) {
        latest.current.onRecoveryNeeded?.();
        setError(
          'Mikrofonen är avstängd. Serverns avslut kunde inte bekräftas. Kontrollera sparförsök innan du fortsätter; ett genomfört sparande är inte ångrat.',
        );
      }
    },
    [apply],
  );
  useEffect(() => {
    mounted.current = true;
    setState('idle');
    setVoice(null);
    setError('');
    setPlaybackBlocked(false);
    setDisconnected(false);
    setOff(false);
    setActivity((value) =>
      value.microphone || value.speaker ? { microphone: false, speaker: false } : value,
    );
    return () => {
      mounted.current = false;
      if (current.current?.path === path) void stop();
      epoch.current++;
    };
  }, [path, stop]);
  const start = useCallback(
    async (reuse?: RetainedInput, next?: TextAssistantView) => {
      const initial = next ?? latest.current.assistant;
      if (!path || !initial || current.current) return;
      const attempt: Attempt = { path, controller: new AbortController() };
      current.current = attempt;
      epoch.current++;
      setState('permission');
      setOff(reuse?.paused ?? false);
      setDisconnected(false);
      setVoice(null);
      setError('');
      const active = () => mounted.current && current.current === attempt;
      const anchor = () => {
        const shown = latest.current.assistant;
        const assistant = shown && shown.revision >= initial.revision ? shown : initial;
        return {
          revision: assistant.revision,
          draftVersion: assistant.review.version,
          contentVersion: assistant.review.contentVersion,
        };
      };
      const fail = (failure?: unknown, reason = 'network') => {
        if (!active()) return;
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
          latest.current.onAccessLost(failure);
        void stop(
          voiceErrorMessage(failure) ??
            (reason === 'audio'
              ? 'Ljuduppspelningen avbröts. Starta rösten igen eller fortsätt med text. Ett genomfört sparande är inte ångrat.'
              : reason === 'microphone'
                ? 'Mikrofonen slutade fungera. Kontrollera mikrofonen och starta rösten igen, eller fortsätt med text.'
                : reason === 'provider'
                  ? 'Rösttjänsten avbröt samtalet. Fortsätt med text eller formulär och kontrollera sparförsök. Ett genomfört sparande är inte ångrat.'
                  : 'Röstanslutningen avbröts. Fortsätt med text eller formulär och kontrollera sparförsök. Ett genomfört sparande är inte ångrat.'),
        );
      };
      const poll = async () => {
        if (!active() || !attempt.voiceId) return;
        try {
          const result = await request<VoiceAssistantResponse>(
            `${path}/${attempt.voiceId}/poll`,
            anchor(),
            attempt.controller.signal,
          );
          if (!active()) return;
          apply(result.assistant);
          setVoice(result.voice);
          if (result.voice.phase === 'error') {
            fail(undefined, 'provider');
            return;
          }
          if (result.voice.phase === 'closed' || result.voice.phase === 'closing') {
            void stop();
            return;
          }
          attempt.poll = setTimeout(() => void poll(), 500);
        } catch (failure) {
          fail(failure);
        }
      };
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined')
          throw new DOMException('Voice is not supported', 'NotSupportedError');
        attempt.transport = createVoiceTransport({
          onMicrophoneReady: () => {
            if (active()) setState('connecting');
          },
          onReady: () => {
            if (active()) setState('listening');
          },
          onClosed: () => {
            if (active())
              void stop(
                'Rösttjänsten avslutade samtalet. Text och formulär finns kvar. Kontrollera sparförsök om utfallet är oklart.',
              );
          },
          onFailure: (reason) => fail(undefined, reason),
          onPlaybackBlocked: (blocked) => {
            if (active()) setPlaybackBlocked(blocked);
          },
          onDisconnected: (value) => {
            if (!active()) return;
            setDisconnected(value);
            if (value) setOff(true);
          },
          onTranscript: (row) => {
            if (active()) latest.current.onTranscript?.(row);
          },
          onAudioActivity: (value) => {
            if (active()) setActivity(value);
          },
        });
        await attempt.transport.connect(
          async (sdp, options) => {
            let result: VoiceAssistantResponse;
            try {
              result = await request<VoiceAssistantResponse>(
                path,
                { sdp, ...anchor(), ...(next ? { newConversation: true } : {}) },
                options.signal,
              );
            } catch (failure) {
              fail(failure);
              throw failure;
            }
            if (!active()) {
              void stopRemote(path, result.voice.id);
              throw new DOMException('Voice setup cancelled', 'AbortError');
            }
            attempt.voiceId = result.voice.id;
            apply(result.assistant);
            setVoice(result.voice);
            attempt.poll = setTimeout(() => void poll(), 500);
            if (!result.sdp) throw new Error('Missing voice answer');
            return result.sdp;
          },
          attempt.controller.signal,
          reuse,
        );
      } catch (failure) {
        fail(failure);
      }
    },
    [path, apply, stop],
  );
  useEffect(() => {
    if (options.autoStart) void start();
  }, [options.autoStart, start]);
  const starting = state === 'connecting' || state === 'permission';
  const working = state === 'listening' && voice?.phase === 'working';
  const speaking = state === 'listening' && activity.speaker;
  const activate = useCallback(() => {
    if (state === 'idle') void start();
    else if (state === 'listening') {
      current.current?.transport?.setMicrophonePaused(!off);
      setOff(!off);
    } else if (starting) void stop();
  }, [state, starting, off, start, stop]);
  // Quiet gaps cannot prove that the final utterance or answer has finished.
  // The muted connection closes with the conversation, access loss or leaving the household.
  const newConversation = useCallback(
    async (reset: () => Promise<TextAssistantView>) => {
      const attempt = current.current;
      if (!attempt) return reset();
      current.current = null;
      epoch.current++;
      clearTimeout(attempt.poll);
      attempt.controller.abort();
      const stream = attempt.transport?.releaseMicrophone();
      // Silence the old peer before requesting the reset. Its events cannot add
      // old transcript rows while the server clears the conversation.
      attempt.transport?.close();
      const continuation: Attempt = {
        path: attempt.path,
        controller: new AbortController(),
        retained: stream,
      };
      current.current = continuation;
      setState('connecting');
      try {
        const assistant = await reset();
        if (mounted.current && current.current === continuation) {
          current.current = null;
          await start(stream ? { stream, paused: off } : undefined, assistant);
        } else for (const track of stream?.getTracks() ?? []) track.stop();
        return assistant;
      } catch (failure) {
        for (const track of stream?.getTracks() ?? []) track.stop();
        if (current.current === continuation) {
          current.current = null;
          if (mounted.current) setState('idle');
        }
        throw failure;
      }
    },
    [off, start],
  );
  const close = useCallback(() => stop(), [stop]);
  const playAudio = useCallback(() => void current.current?.transport?.playAudio(), []);
  const silence = useCallback(() => current.current?.transport?.silence(), []);
  const level = useCallback(() => current.current?.transport?.microphoneLevel() ?? 0, []);
  const microphone =
    state === 'listening' && !off && !disconnected && !playbackBlocked ? 'on' : 'off';
  return {
    state,
    phase: voice?.phase ?? null,
    microphone,
    starting,
    speaking,
    userSpeaking: microphone === 'on' && activity.microphone,
    working,
    error,
    playbackBlocked,
    disconnected,
    disabled:
      state === 'closing' ||
      (microphone === 'off' && !starting && !working && options.assistant?.phase === 'working'),
    level,
    activate,
    start: () => start(),
    newConversation,
    stop: close,
    silence,
    playAudio,
  };
}
