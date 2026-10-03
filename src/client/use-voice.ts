import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextAssistantView } from '../shared/text-assistant.js';
import type { VoiceAssistantResponse, VoiceAssistantView } from '../shared/voice-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import { MapRequestError, request } from './map-request.js';
import { type VoiceFailure, voiceErrorNotice, voiceFailureMessage } from './voice-error.js';
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
  /** A necessary question that this voice has spoken still awaits an answer. */
  waitingForAnswer?: boolean;
  /** A verified save, shown for four seconds after the bounded spoken acknowledgement drains. */
  saved?: boolean;
  savedId?: string;
  error: string;
  failure?: VoiceFailure & { occurrence: number };
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
  ready?: boolean;
  output?: { text: string; heard: boolean; speaking: boolean; matched?: string };
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
  saveChecking?: boolean;
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
  const [failure, setFailure] = useState<(VoiceFailure & { occurrence: number }) | null>(null);
  const error = voiceFailureMessage(failure);
  const failedCount = useRef(0);
  const setError = useCallback(
    (value: VoiceFailure | null) =>
      setFailure(value ? { ...value, occurrence: ++failedCount.current } : null),
    [],
  );
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  // Microphone-off keeps the connection alive: Live has no reliable answer-complete event.
  const [off, setOff] = useState(false);
  const offRef = useRef(off);
  offRef.current = off;
  const [activity, setActivity] = useState({ microphone: false, speaker: false });
  const [heldListening, setHeldListening] = useState(false);
  const [spokenQuestion, setSpokenQuestion] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [savedId, setSavedId] = useState('');
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const completedOutput = useRef(new Set<string>());
  const announceSave = useCallback((id: string) => {
    clearTimeout(savedTimer.current);
    setSavedId(id);
    setSaved(true);
    savedTimer.current = setTimeout(() => setSaved(false), 4000);
  }, []);
  const checkOutput = useRef<() => void>(() => {});
  const outputTask = useRef<string | undefined>(undefined);
  useEffect(() => {
    const taskId = options.assistant?.taskId;
    if (!taskId || taskId === outputTask.current) return;
    outputTask.current = taskId;
    // A typed task has no Live delegation event. Output from a preceding task
    // must not prove completion of this task's question or save response.
    const attempt = current.current;
    if (attempt) attempt.output = { text: '', heard: false, speaking: false };
  }, [options.assistant?.taskId]);
  checkOutput.current = () => {
    const attempt = current.current;
    const response = voice?.response;
    const output = attempt?.output;
    if (!attempt || !response || !output || completedOutput.current.has(response.id)) return;
    const words = (text: string) =>
      text
        .toLocaleLowerCase('sv')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    if (!response.text || !words(output.text).includes(words(response.text))) return;
    if (output.matched !== response.id) {
      output.matched = response.id;
      // Earlier audio and a pause before the final word do not prove that the
      // audio associated with a newly delivered transcript has even started.
      output.heard = output.speaking;
    }
    if (!output.heard || output.speaking) return;
    // A matching transcript alone never starts the timer: audio must first be
    // observed, and then drain. Live offers no complete-turn event; future
    // unsolicited output cannot be ruled out by this bounded-word check.
    completedOutput.current.add(response.id);
    attempt.output = { text: '', heard: false, speaking: false };
    if (response.questionPending) setSpokenQuestion(response.revision);
    if (
      response.receiptOperationId &&
      response.receiptOperationId === latest.current.assistant?.receipt?.operationId
    )
      announceSave(response.receiptOperationId);
  };
  useEffect(() => {
    if (voice?.response) checkOutput.current();
  }, [voice?.response]);
  const apply = useCallback(
    (view: TextAssistantView, delivery?: VoiceAssistantView['replyDelivery']) => {
      const shown = latest.current.assistant;
      if (
        shown &&
        view.id === shown.id &&
        view.revision >= shown.revision &&
        view.review.contentVersion >= shown.review.contentVersion &&
        (view.review.contentVersion > shown.review.contentVersion ||
          view.review.version >= shown.review.version)
      )
        latest.current.onAssistant(
          delivery?.length
            ? {
                ...view,
                completedReplies: view.completedReplies?.map((reply) => {
                  const disposition = delivery.find((item) => item.id === reply.id);
                  return disposition ? { ...reply, voiced: disposition.voiced } : reply;
                }),
              }
            : view,
        );
    },
    [],
  );
  const stop = useCallback(
    async (message: VoiceFailure | null = null) => {
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
        apply(result.assistant, result.voice.replyDelivery);
        setVoice(result.voice);
      }
      setState('idle');
      setDisconnected(false);
      if (attempt.voiceId && !result) {
        latest.current.onRecoveryNeeded?.();
        if (!message) setError(voiceErrorNotice(undefined, 'interrupted'));
      }
    },
    [apply, setError],
  );
  useEffect(() => {
    mounted.current = true;
    setState('idle');
    setVoice(null);
    setError(null);
    setPlaybackBlocked(false);
    setDisconnected(false);
    setOff(false);
    setSpokenQuestion(null);
    setSaved(false);
    completedOutput.current.clear();
    setActivity((value) =>
      value.microphone || value.speaker ? { microphone: false, speaker: false } : value,
    );
    return () => {
      mounted.current = false;
      clearTimeout(savedTimer.current);
      if (current.current?.path === path) void stop();
      epoch.current++;
    };
  }, [path, stop, setError]);
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
        output: { text: '', heard: false, speaking: false },
      };
      current.current = attempt;
      epoch.current++;
      setState('permission');
      setOff(attempt.held?.released ?? reuse?.paused ?? false);
      setDisconnected(false);
      setPlaybackBlocked(false);
      setActivity({ microphone: false, speaker: false });
      setVoice(null);
      setError(null);
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
      const fail = (failure?: unknown) => {
        if (!active()) return;
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
          latest.current.onAccessLost(failure);
        void stop(voiceErrorNotice(failure, attempt.ready ? 'interrupted' : 'startup'));
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
            { ...anchor(), microphoneOn: !offRef.current },
            attempt.controller.signal,
          );
          if (!active()) return;
          apply(result.assistant, result.voice.replyDelivery);
          if ((result.assistant.contextRevision ?? 0) > (initial.contextRevision ?? 0)) {
            resetVoice.current(result.assistant);
            return;
          }
          setVoice(result.voice);
          if (result.voice.phase === 'error') {
            fail(
              new MapRequestError(
                503,
                result.voice.error,
                result.voice.diagnosticId,
                result.voice.errorGroup,
              ),
            );
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
            inputAllowed: () =>
              !latest.current.inputBlocked &&
              !latest.current.saveChecking &&
              navigator.onLine !== false,
            onMicrophoneReady: () => {
              if (active()) setState('connecting');
            },
            onReady: () => {
              if (!active()) return;
              attempt.ready = true;
              if (latest.current.inputBlocked) {
                attempt.transport?.setMicrophonePaused(true);
                setOff(true);
              }
              setState('listening');
            },
            onClosed: () => {
              if (active()) void stop(voiceErrorNotice(undefined, 'interrupted'));
            },
            onFailure: () => fail(),
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
            onOutputTranscript: (text) => {
              if (!active() || !attempt.output) return;
              attempt.output.text += text;
              checkOutput.current();
            },
            onAudioActivity: (value) => {
              if (!active()) return;
              setActivity(value);
              if (attempt.output) {
                attempt.output.speaking = value.speaker;
                attempt.output.heard ||= value.speaker;
                checkOutput.current();
              }
            },
            onDelegation: () => {
              attempt.output = { text: '', heard: false, speaking: false };
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
                  microphoneOn: !(reuse?.paused ?? attempt.held?.released ?? false),
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
            apply(result.assistant, result.voice.replyDelivery);
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
    [path, apply, stop, setError],
  );
  useEffect(() => {
    if (options.autoStart) void start();
  }, [options.autoStart, start]);
  const starting = state === 'connecting' || state === 'permission';
  const working = state === 'listening' && voice?.phase === 'working';
  const speaking = state === 'listening' && activity.speaker;
  const activate = useCallback(() => {
    if (latest.current.inputBlocked || latest.current.saveChecking || !navigator.onLine) return;
    if (state === 'idle') {
      setError(null);
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
  }, [state, starting, off, start, stop, prepareAudio, setError]);
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
  const playAudio = useCallback(() => {
    const transport = current.current?.transport;
    if (transport) {
      void transport.playAudio();
      return;
    }
    const playback = prepared.current;
    const request = held.current;
    if (!playback) return;
    void Promise.all([playback.audio.play(), playback.audioContext.resume()])
      .then(() => {
        if (prepared.current !== playback || held.current !== request) return;
        request?.buffer?.playbackReady();
        const capture = Boolean(
          request &&
            !request.released &&
            !latest.current.inputBlocked &&
            navigator.onLine !== false,
        );
        request?.buffer?.capture(capture);
        setHeldListening(capture && Boolean(request?.buffer?.ready));
        setPlaybackBlocked(false);
      })
      .catch(() => setPlaybackBlocked(true));
  }, []);
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
      const response = voice?.response;
      if (
        response?.receiptOperationId === latest.current.assistant?.receipt?.operationId &&
        response?.receiptOperationId
      ) {
        completedOutput.current.add(response.id);
        announceSave(response.receiptOperationId);
      }
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
          setError(voiceErrorNotice(undefined, 'interrupted'));
        });
    },
    [renew, apply, voice?.response, announceSave, setError],
  );
  const level = useCallback(() => current.current?.transport?.microphoneLevel() ?? 0, []);
  const startHeld = useCallback(() => {
    if (
      latest.current.inputBlocked ||
      latest.current.saveChecking ||
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
    setError(null);
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
          const message = voiceErrorNotice(undefined, 'interrupted');
          if (current.current) void stop(message);
          else {
            request.failed = new Error('Held microphone ended');
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
        const message = voiceErrorNotice(failure);
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
  }, [state, start, prepareAudio, stop, setError]);
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
  useEffect(() => {
    const transport = current.current?.transport;
    if (options.saveChecking) {
      held.current?.buffer?.capture(false);
      transport?.setMicrophonePaused(true);
    } else if (!off && !options.inputBlocked && navigator.onLine !== false)
      transport?.setMicrophonePaused(false);
  }, [options.saveChecking, options.inputBlocked, off]);
  const microphone =
    (state === 'listening' || heldListening) &&
    !off &&
    !disconnected &&
    !playbackBlocked &&
    !options.saveChecking
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
    waitingForAnswer: Boolean(
      options.assistant?.questionPending && spokenQuestion === options.assistant.revision,
    ),
    saved,
    savedId,
    error,
    failure: failure ?? undefined,
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
