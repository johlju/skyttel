import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextAssistantView } from '../shared/text-assistant.js';
import type { VoiceAssistantResponse, VoiceAssistantView } from '../shared/voice-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import { MapRequestError, request } from './map-request.js';
import { voiceErrorMessage } from './voice-error.js';
import { createHeldInput, type HeldInput, prepareHeldInput } from './voice-held-input.js';
import {
  createVoiceTransport,
  prepareVoicePlayback,
  type VoicePlayback,
  type VoiceTransport,
} from './voice-transport.js';

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
  /** Prepare playback synchronously while a click can authorize browser audio. */
  prepareAudio?: () => void;
  /** A held press starts input and releases it without stopping Skyttel's answer. */
  startHeld?: () => void;
  releaseHeld?: () => void;
  /** Turn capture off without cutting off the current answer. It never resumes automatically. */
  pauseMicrophone?: () => void;
  /** Closes the voice connection at once, and with it the work that came by voice. */
  stop: () => Promise<void>;
  /** Silences what Skyttel is saying. */
  silence: (cancelWork?: () => Promise<void>) => Promise<void>;
  /** Replace provider context and queued audio while keeping the authorized microphone. */
  newConversation: (reset: () => Promise<TextAssistantView>) => Promise<TextAssistantView>;
  playAudio: () => void;
};

type RetainedInput = { stream: MediaStream; paused: boolean };
type HeldRequest = {
  released: boolean;
  controller: AbortController;
  input?: Promise<HeldInput>;
  buffer?: HeldInput;
  failed?: Error;
};

type Attempt = {
  path: string;
  controller: AbortController;
  transport?: VoiceTransport;
  voiceId?: string;
  /** Microphone owned while a conversation reset waits for the server. */
  retained?: MediaStream;
  poll?: ReturnType<typeof setTimeout>;
  held?: HeldRequest;
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
  /** Current ephemeral text to retain when interrupted output requires a fresh connection. */
  transcript?: TranscriptRow[];
  /** Network or service conditions forbid sending microphone input. */
  inputBlocked?: boolean;
}): Voice {
  const path = options.assistant
    ? `/api/households/${encodeURIComponent(options.householdId)}/text-assistant/${encodeURIComponent(options.assistant.id)}/voice`
    : null;
  const latest = useRef(options);
  latest.current = options;
  const current = useRef<Attempt | null>(null);
  const prepared = useRef<VoicePlayback | null>(null);
  const held = useRef<HeldRequest | null>(null);
  const cancelledHeldStart = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const resetVoice = useRef<(view: TextAssistantView) => void>(() => {});
  const [state, setState] = useState<Voice['state']>('idle');
  const [voice, setVoice] = useState<VoiceAssistantView | null>(null);
  const [error, setError] = useState('');
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  // Microphone-off keeps the connection alive: Live has no reliable answer-complete event.
  const [off, setOff] = useState(false);
  const [activity, setActivity] = useState({ microphone: false, speaker: false });
  const [heldListening, setHeldListening] = useState(false);
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
      prepared.current?.close();
      prepared.current = null;
      const attempt = current.current;
      const request = held.current;
      request?.controller.abort();
      request?.buffer?.capture(false);
      if (!attempt?.transport) {
        request?.buffer?.close();
        for (const track of request?.buffer?.stream.getTracks() ?? []) track.stop();
      }
      held.current = null;
      if (mounted.current) setHeldListening(false);
      if (!attempt) {
        if (request) cancelledHeldStart.current = true;
        if (mounted.current) {
          setError(message);
          setState('idle');
        }
        return;
      }
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
      setDisconnected(false);
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
  useEffect(() => {
    const householdId = options.householdId;
    return () => {
      // A held press may own local capture before a server session exists.
      if (
        held.current &&
        !current.current &&
        (!mounted.current || latest.current.householdId !== householdId)
      )
        void stop();
    };
  }, [options.householdId, stop]);
  const prepareAudio = useCallback(() => {
    if (
      prepared.current ||
      current.current ||
      typeof navigator.mediaDevices?.getUserMedia !== 'function' ||
      typeof RTCPeerConnection !== 'function' ||
      typeof AudioContext !== 'function'
    )
      return;
    try {
      prepared.current = prepareVoicePlayback();
      // Load processor code during the initiating gesture, before the 450 ms timer.
      void prepareHeldInput(prepared.current).catch(() => undefined);
    } catch {
      // Preparation is best effort; ordinary startup reports unsupported audio.
    }
  }, []);
  useEffect(
    () => () => {
      prepared.current?.close();
      prepared.current = null;
    },
    [],
  );
  const start = useCallback(
    async (reuse?: RetainedInput, next?: TextAssistantView, history?: TranscriptRow[]) => {
      const initial = next ?? latest.current.assistant;
      if (!path || !initial || current.current || cancelledHeldStart.current) return;
      if (latest.current.inputBlocked || !navigator.onLine) {
        for (const track of reuse?.stream.getTracks() ?? []) track.stop();
        prepared.current?.close();
        prepared.current = null;
        setOff(true);
        setState('idle');
        return;
      }
      const attempt: Attempt = {
        path,
        controller: new AbortController(),
        held: held.current ?? undefined,
      };
      current.current = attempt;
      epoch.current++;
      setState('permission');
      setOff(attempt.held?.released ?? reuse?.paused ?? false);
      setDisconnected(false);
      setPlaybackBlocked(false);
      setActivity({ microphone: false, speaker: false });
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
        if (!navigator.onLine || latest.current.inputBlocked) {
          attempt.poll = setTimeout(() => void poll(), 500);
          return;
        }
        try {
          const result = await request<VoiceAssistantResponse>(
            `${path}/${attempt.voiceId}/poll`,
            anchor(),
            attempt.controller.signal,
          );
          if (!active()) return;
          apply(result.assistant);
          if ((result.assistant.contextRevision ?? 0) > (initial.contextRevision ?? 0)) {
            resetVoice.current(result.assistant);
            return;
          }
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
          if (!navigator.onLine || latest.current.inputBlocked)
            attempt.poll = setTimeout(() => void poll(), 500);
          else fail(failure);
        }
      };
      try {
        if (
          typeof navigator.mediaDevices?.getUserMedia !== 'function' ||
          typeof RTCPeerConnection !== 'function' ||
          typeof AudioContext !== 'function'
        )
          throw new DOMException('Voice is not supported', 'NotSupportedError');
        if (attempt.held?.failed) throw attempt.held.failed;
        const buffered = await attempt.held?.input;
        if (!active()) throw new DOMException('Held input cancelled', 'AbortError');
        const playback = prepared.current ?? undefined;
        attempt.transport = createVoiceTransport(
          {
            inputAllowed: () => !latest.current.inputBlocked && navigator.onLine !== false,
            onMicrophoneReady: () => {
              if (active()) setState('connecting');
            },
            onReady: () => {
              if (!active()) return;
              if (latest.current.inputBlocked) {
                attempt.transport?.setMicrophonePaused(true);
                setOff(true);
              }
              setState('listening');
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
          },
          playback,
          buffered,
        );
        prepared.current = null;
        await attempt.transport.connect(
          async (sdp, options) => {
            let result: VoiceAssistantResponse;
            try {
              result = await request<VoiceAssistantResponse>(
                path,
                {
                  sdp,
                  ...anchor(),
                  ...(history
                    ? {
                        history: history.map(({ role, text, partial }) => ({
                          role,
                          text,
                          partial,
                        })),
                      }
                    : next
                      ? { newConversation: true }
                      : {}),
                },
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
          reuse ?? (attempt.held ? { paused: attempt.held.released } : undefined),
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
    if (latest.current.inputBlocked || !navigator.onLine) return;
    if (state === 'idle') {
      if (held.current) {
        void stop();
        return;
      }
      cancelledHeldStart.current = false;
      held.current = null;
      prepareAudio();
      void start();
    } else if (state === 'listening') {
      current.current?.transport?.setMicrophonePaused(!off);
      setOff(!off);
    } else if (starting) void stop();
  }, [state, starting, off, start, stop, prepareAudio]);
  // Quiet gaps cannot prove that the final utterance or answer has finished.
  // The muted connection closes with the conversation, access loss or leaving the household.
  const renew = useCallback(
    async (reset: () => Promise<TextAssistantView>, history?: TranscriptRow[]) => {
      const attempt = current.current;
      if (!attempt) return reset();
      // Preserve the unlocked output too: spoken reset has no new browser gesture.
      prepared.current?.close();
      prepared.current = attempt.transport?.releasePlayback() ?? prepareVoicePlayback();
      current.current = null;
      epoch.current++;
      clearTimeout(attempt.poll);
      attempt.controller.abort();
      const stream = attempt.transport?.releaseMicrophone();
      // Renewal starts a new input context; retired startup speech cannot be replayed.
      held.current?.buffer?.close();
      held.current?.controller.abort();
      held.current = null;
      setHeldListening(false);
      // Retire the old peer first. Its queued output and transcript events
      // cannot reappear while the server prepares the new connection.
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
          await start(stream ? { stream, paused: off } : undefined, assistant, history);
        } else for (const track of stream?.getTracks() ?? []) track.stop();
        return assistant;
      } catch (failure) {
        for (const track of stream?.getTracks() ?? []) track.stop();
        if (current.current === continuation) {
          prepared.current?.close();
          prepared.current = null;
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
  const newConversation = useCallback(
    (reset: () => Promise<TextAssistantView>) => renew(reset),
    [renew],
  );
  resetVoice.current = (view) => {
    void newConversation(async () => view).catch(() => latest.current.onRecoveryNeeded?.());
  };
  const silence = useCallback(
    (cancelWork?: () => Promise<void>) => {
      const attempt = current.current;
      // Live has no output-cancel event. Retire the entire output stream, retaining
      // the authorized input and conversation as historical text in a fresh session.
      const interrupted = renew(async () => {
        const [result] = await Promise.all([
          attempt?.voiceId ? stopRemote(attempt.path, attempt.voiceId) : Promise.resolve(null),
          cancelWork?.(),
        ]);
        if (attempt?.voiceId && !result)
          throw new Error('Voice interruption could not be confirmed');
        const shown = latest.current.assistant;
        const view = result?.assistant;
        const assistant = shown && (!view || shown.revision >= view.revision) ? shown : view;
        if (!assistant) throw new Error('Conversation ended');
        apply(assistant);
        return assistant;
      }, latest.current.transcript ?? []);
      const generation = epoch.current;
      return interrupted
        .then(() => undefined)
        .catch(() => {
          if (!mounted.current || epoch.current !== generation) return;
          latest.current.onRecoveryNeeded?.();
          setError(
            'Rösten kunde inte fortsätta efter avbrottet. Starta rösten igen eller fortsätt med text.',
          );
        });
    },
    [renew, apply],
  );
  const level = useCallback(() => current.current?.transport?.microphoneLevel() ?? 0, []);
  const startHeld = useCallback(() => {
    if (
      latest.current.inputBlocked ||
      navigator.onLine === false ||
      latest.current.assistant?.phase === 'working'
    )
      return;
    if (current.current?.transport && state === 'listening') {
      held.current = { released: false, controller: new AbortController() };
      current.current.held = held.current;
      current.current.transport.setMicrophonePaused(false);
      setOff(false);
      return;
    }
    if (current.current || (held.current && !held.current.released)) return;
    prepareAudio();
    const request: HeldRequest = { released: false, controller: new AbortController() };
    cancelledHeldStart.current = false;
    held.current = request;
    setState('permission');
    setOff(false);
    const playback = prepared.current;
    if (playback) {
      request.input = createHeldInput(playback, request.controller.signal).then((buffer) => {
        request.buffer = buffer;
        buffer.onFailure(() => {
          const message = 'Mikrofonen kunde inte fortsätta. Försök igen.';
          if (current.current) void stop(message);
          else {
            request.failed = new Error(message);
            request.released = true;
            buffer.discard();
            buffer.close();
            for (const track of buffer.stream.getTracks()) track.stop();
            setHeldListening(false);
            setOff(true);
            setError(message);
          }
        });
        const capture =
          !request.released && !latest.current.inputBlocked && navigator.onLine !== false;
        buffer.capture(capture);
        if (held.current === request && mounted.current) {
          setHeldListening(capture && buffer.ready);
          setPlaybackBlocked(!buffer.ready);
        }
        return buffer;
      });
      // The conversation session can still be starting; own failure cleanup now,
      // before transport startup has a chance to await this same promise.
      void request.input.catch((failure) => {
        if (held.current !== request || request.controller.signal.aborted) return;
        const message = voiceErrorMessage(failure) ?? 'Mikrofonen kunde inte startas. Försök igen.';
        if (current.current) void stop(message);
        else {
          // Keep the rejected request for the pending conversation's start.
          // It must never fall back to starting an ordinary live microphone.
          request.released = true;
          setOff(true);
          setHeldListening(false);
          setError(message);
        }
      });
    }
    if (latest.current.assistant) void start();
  }, [state, start, prepareAudio, stop]);
  const releaseHeld = useCallback(() => {
    if (!held.current) return;
    held.current.released = true;
    held.current.buffer?.capture(false);
    current.current?.transport?.setMicrophonePaused(true);
    setHeldListening(false);
    setOff(true);
  }, []);
  useEffect(() => {
    const blocked = () => {
      if (!latest.current.inputBlocked && navigator.onLine !== false) return;
      releaseHeld();
      held.current?.buffer?.discard();
      current.current?.transport?.discardPendingInput();
      setOff(true);
    };
    if (options.inputBlocked) blocked();
    window.addEventListener('offline', blocked);
    return () => window.removeEventListener('offline', blocked);
  }, [options.inputBlocked, releaseHeld]);
  const microphone =
    (state === 'listening' || heldListening) && !off && !disconnected && !playbackBlocked
      ? 'on'
      : 'off';
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
    start: () => {
      prepareAudio();
      return start();
    },
    prepareAudio,
    startHeld,
    releaseHeld,
    pauseMicrophone: () => {
      releaseHeld();
      held.current?.buffer?.discard();
      current.current?.transport?.discardPendingInput();
      current.current?.transport?.setMicrophonePaused(true);
      setOff(true);
    },
    newConversation,
    stop: close,
    silence,
    playAudio,
  };
}
