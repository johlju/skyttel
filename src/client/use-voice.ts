import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { conversationConsentRevoked } from '../shared/conversation-consent.js';
import type { TextAssistantView } from '../shared/text-assistant.js';
import {
  unconfirmedPlaybackIdleMs,
  type VoiceAssistantResponse,
  type VoiceAssistantView,
} from '../shared/voice-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import { MapRequestError, request } from './map-request.js';
import { type TaskDeliveryConnection, TaskDeliveryContext } from './task-delivery.js';
import { type VoiceFailure, voiceErrorNotice, voiceFailureMessage } from './voice-error.js';
import { createHeldInput, type HeldInput, prepareHeldInput } from './voice-held-input.js';
import { VoiceSessionContext } from './voice-session-context.js';
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
  /** Retained user choice during an internal pause; never announce it as a toggle. */
  microphoneAnnouncement?: 'off' | 'on';
  starting: boolean;
  /** Skyttel is heard. */
  speaking: boolean;
  playbackPending?: boolean;
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
  refusal?: VoiceAssistantView['refusal'];
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
  /** Drop local audio immediately; consent revocation owns server work cleanup. */
  endConversation?: () => Promise<void>;
  /** Silences what Skyttel is saying. */
  silence: (cancelWork?: () => Promise<TextAssistantView | void>) => Promise<void>;
  /** Captures the current audible interruption for a fresh written correction. */
  prepareTextCorrection?: () =>
    | { interruption?: Promise<boolean>; armPlayback?: () => void }
    | undefined;
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
  delivery?: TaskDeliveryConnection;
  /** Microphone owned while a conversation reset waits for the server. */
  retained?: MediaStream;
  poll?: ReturnType<typeof setTimeout>;
  resumeRequested?: boolean;
  resumeMicrophone?: (mode?: 'prepare' | 'resume') => void;
  held?: HeldRequest;
  ready?: boolean;
  /** Keep the microphone choice through the new peer's asynchronous ready event. */
  contextRenewal?: boolean;
  summaryPausedAt?: number;
  providerGeneration?: number;
  inputVersion?: number;
  playedResponseId?: string;
  output?: {
    text: string;
    audibleTextLength?: number;
    mediaEnd?: number;
    evidence?: {
      started: boolean;
      fragments: { from: number; remainingMs: number; textLength: number }[];
    };
    speaking: boolean;
  };
  acknowledgement?: { id: string; lastActivity: number; notified: boolean };
  refusalId?: string;
  newConversationHandled?: boolean;
};

function voiceAnchor(view: TextAssistantView) {
  return {
    revision: view.revision,
    draftVersion: view.review.version,
    contentVersion: view.review.contentVersion,
  };
}

function matchesVoiceAnchor(anchor: ReturnType<typeof voiceAnchor>, view: TextAssistantView) {
  return (
    anchor.revision === view.revision &&
    anchor.draftVersion === view.review.version &&
    anchor.contentVersion === view.review.contentVersion
  );
}

function workingOnWrittenMessage(view: TextAssistantView | null) {
  return view?.phase === 'working' && view.taskSource === 'text';
}

function spokenWords(text: string) {
  return text
    .toLocaleLowerCase('sv')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function reflectsOrdinaryReply(expected: string, spoken: string) {
  const expectedText = spokenWords(expected);
  const expectedWords = expectedText.split(' ');
  if (expectedWords.length >= 3 && ` ${spoken} `.includes(` ${expectedText} `)) return true;
  const spokenTerms = new Set(spoken.split(' '));
  const mainWords = expectedWords.filter((word) => word.length >= 4);
  const terms = [...new Set(mainWords)];
  const matched = terms.filter((word) => spokenTerms.has(word)).length;
  // A brief acknowledgement or an opening fragment should still leave the
  // text-view notice available. Look for substantial overlap including the end.
  return (
    matched >= 3 &&
    matched * 3 >= terms.length * 2 &&
    spoken.split(' ').length * 4 >= expectedWords.length * 3 &&
    mainWords.slice(-2).some((word) => spokenTerms.has(word))
  );
}

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
  onNewConversation?: () => boolean;
  autoStart?: boolean;
  onTranscript?: (row: TranscriptRow) => void;
  /** Network or service conditions forbid sending microphone input. */
  inputBlocked?: boolean;
  saveChecking?: boolean;
  contextFailed?: boolean;
}): Voice {
  const voiceSession = useContext(VoiceSessionContext);
  const delivery = useContext(TaskDeliveryContext);
  const path = options.assistant
    ? `/api/households/${encodeURIComponent(options.householdId)}/text-assistant/${encodeURIComponent(options.assistant.id)}/voice`
    : null;
  const transfer = useRef<{
    id: string;
    input?: RetainedInput;
    resetConversation?: boolean;
  } | null>(null);
  const latest = useRef(options);
  latest.current = options;
  // Permission promises and transport callbacks must read the same current
  // admission rules before they can resume recording.
  const inputAllowed = useCallback(() => {
    return (
      !latest.current.inputBlocked &&
      !latest.current.saveChecking &&
      !latest.current.contextFailed &&
      navigator.onLine !== false
    );
  }, []);
  const current = useRef<Attempt | null>(null);
  const interrupting = useRef<{ path: string | null; result: Promise<boolean> } | null>(null);
  const prepared = useRef<VoicePlayback | null>(null);
  const held = useRef<HeldRequest | null>(null);
  const cancelledHeldStart = useRef(false);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const resetVoice = useRef<(view: TextAssistantView) => void>(() => {});
  const summarizeVoice = useRef<(view: TextAssistantView) => void>(() => {});
  const summaryRenewal = useRef(false);
  const [contextPaused, setContextPaused] = useState(false);
  const [state, setState] = useState<Voice['state']>('idle');
  useEffect(() => {
    voiceSession?.active(state === 'permission' || state === 'connecting' || state === 'listening');
    return () => voiceSession?.active(false);
  }, [voiceSession, state]);
  const [voice, setVoice] = useState<VoiceAssistantView | null>(null);
  const [failure, setFailure] = useState<(VoiceFailure & { occurrence: number }) | null>(null);
  const error = voiceFailureMessage(failure);
  const failedCount = useRef(0);
  const setError = useCallback(
    (value: VoiceFailure | null) => {
      if (value?.noticeId === 'voiceSessionExpired') voiceSession?.expired();
      setFailure(value ? { ...value, occurrence: ++failedCount.current } : null);
    },
    [voiceSession],
  );
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  // Microphone-off keeps the connection alive: Live has no reliable answer-complete event.
  const [off, setOff] = useState(false);
  const offRef = useRef(off);
  offRef.current = off;
  const pauseCapture = useCallback(() => {
    const attempt = current.current;
    if (attempt) {
      attempt.resumeRequested = false;
      attempt.transport?.setMicrophonePaused(true);
    }
    offRef.current = true;
    setOff(true);
  }, []);
  const writtenWork = workingOnWrittenMessage(options.assistant);
  useEffect(() => {
    if (writtenWork && current.current) current.current.resumeRequested = false;
  }, [writtenWork]);
  const [activity, setActivity] = useState({ microphone: false, speaker: false });
  const activityRef = useRef(activity);
  activityRef.current = activity;
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
    if (attempt) attempt.output = { text: '', speaking: false };
  }, [options.assistant?.taskId]);
  checkOutput.current = () => {
    const attempt = current.current;
    const response = voice?.response;
    const output = attempt?.output;
    if (!attempt || !response || !output || completedOutput.current.has(response.id)) return;
    const expected = spokenWords(response.text);
    const audible = spokenWords(output.text.slice(0, output.audibleTextLength ?? 0));
    if (!expected || output.speaking) return;
    const replyHeard =
      ` ${audible} `.includes(` ${expected} `) ||
      (output.audibleTextLength === output.text.length &&
        response.conversationalText &&
        !response.questionPending &&
        !response.receiptOperationId &&
        reflectsOrdinaryReply(response.conversationalText, audible));
    if (!replyHeard) return;
    // Live offers no complete-turn event. Acknowledge the words matched to
    // observed audio after playback drains.
    completedOutput.current.add(response.id);
    attempt.playedResponseId = response.id;
    setFailure((previous) => (previous?.noticeId === 'voiceReplyUnconfirmed' ? null : previous));
    attempt.output = { text: '', speaking: false };
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
    async (message: VoiceFailure | null = null, revoked = false) => {
      if (revoked) {
        clearTimeout(savedTimer.current);
        setSaved(false);
        setSavedId('');
        setSpokenQuestion(null);
      }
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
          if (revoked) {
            setVoice(null);
            setPlaybackBlocked(false);
            setActivity({ microphone: false, speaker: false });
            setDisconnected(false);
          }
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
      if (revoked) {
        attempt.transport?.close();
        setVoice(null);
        setActivity({ microphone: false, speaker: false });
        setPlaybackBlocked(false);
        setState('idle');
        setDisconnected(false);
        return;
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
    const attempt = current.current;
    if (attempt) {
      if (offRef.current) attempt.resumeMicrophone?.('prepare');
      return;
    }
    if (
      prepared.current ||
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
    async (reuse?: RetainedInput, next?: TextAssistantView, resetConversation = false) => {
      const initial = next ?? latest.current.assistant;
      if (!path || !initial || current.current || cancelledHeldStart.current) return;
      if (
        latest.current.inputBlocked ||
        latest.current.saveChecking ||
        latest.current.contextFailed ||
        !navigator.onLine
      ) {
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
        contextRenewal: summaryRenewal.current,
        output: { text: '', speaking: false },
      };
      current.current = attempt;
      epoch.current++;
      setState('permission');
      setContextPaused(false);
      setOff(attempt.held?.released ?? reuse?.paused ?? false);
      setDisconnected(false);
      setPlaybackBlocked(false);
      setActivity({ microphone: false, speaker: false });
      setVoice(null);
      setError(null);
      const active = () => mounted.current && current.current === attempt;
      let admitted = initial;
      let synchronized: TextAssistantView | undefined;
      const anchor = () => {
        const shown = latest.current.assistant;
        const assistant =
          shown &&
          shown.id === admitted.id &&
          shown.revision >= admitted.revision &&
          shown.review.contentVersion >= admitted.review.contentVersion &&
          (shown.review.contentVersion > admitted.review.contentVersion ||
            shown.review.version >= admitted.review.version)
            ? shown
            : admitted;
        return voiceAnchor(assistant);
      };
      const fail = (failure?: unknown) => {
        if (!active()) return;
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) {
          latest.current.onAccessLost(failure);
          if (failure.code === conversationConsentRevoked) return;
        }
        void stop(voiceErrorNotice(failure, attempt.ready ? 'interrupted' : 'startup'));
      };
      const observeDelivery = (result: VoiceAssistantResponse) => {
        const ids = new Set([
          result.voice.response?.id,
          result.assistant.taskSource === 'voice' ? result.assistant.taskId : undefined,
        ]);
        for (const task of result.assistant.tasks ?? [])
          if (task.delivery && ids.has(task.id)) attempt.delivery?.observeAccepted(task.delivery);
      };
      const poll = async () => {
        attempt.poll = undefined;
        if (!active() || !attempt.voiceId) return;
        if (!navigator.onLine || latest.current.inputBlocked) {
          attempt.poll = setTimeout(() => void poll(), 500);
          return;
        }
        try {
          // connect reuses the live socket and opens a new one if it closed.
          const responseDelivery = await delivery?.connect(path.replace(/\/voice$/, ''));
          if (!active()) return;
          if (responseDelivery) attempt.delivery = responseDelivery;
          const rendered = anchor();
          const result = await request<VoiceAssistantResponse>(
            `${path}/${attempt.voiceId}/poll`,
            {
              ...rendered,
              microphoneOn: !offRef.current,
              microphoneActive: !offRef.current && activityRef.current.microphone,
              speakerActive: activityRef.current.speaker,
              confirmedInputVersion:
                interrupting.current?.path === path ? undefined : attempt.inputVersion,
              playedResponseId:
                interrupting.current?.path === path ? undefined : attempt.playedResponseId,
              deliveryConnectionId: responseDelivery?.id,
            },
            attempt.controller.signal,
          );
          if (!active()) return;
          if (result.voice.newConversationRequested && !attempt.newConversationHandled)
            attempt.newConversationHandled = latest.current.onNewConversation?.();
          if (!active()) return;
          if (workingOnWrittenMessage(result.assistant)) attempt.resumeRequested = false;
          // A successful poll has registered both the displayed anchor and
          // the server's current pending questions on this voice connection.
          synchronized = matchesVoiceAnchor(rendered, result.assistant)
            ? result.assistant
            : undefined;
          attempt.inputVersion = result.voice.inputVersion;
          observeDelivery(result);
          apply(result.assistant, result.voice.replyDelivery);
          if ((result.assistant.contextRevision ?? 0) > (initial.contextRevision ?? 0)) {
            resetVoice.current(result.assistant);
            return;
          }
          if (result.assistant.contextSummaryState === 'failed') {
            attempt.transport?.suspendInput();
            pauseCapture();
            attempt.poll = setTimeout(() => void poll(), 500);
            return;
          }
          if (
            result.assistant.contextSummaryState === 'needed' ||
            (result.assistant.contextGeneration ?? 0) >
              (attempt.providerGeneration ?? initial.contextGeneration ?? 0)
          ) {
            attempt.transport?.suspendInput();
            setContextPaused(true);
            attempt.summaryPausedAt ??= Date.now();
          }
          if (
            result.assistant.phase !== 'working' &&
            result.assistant.phase !== 'recovery' &&
            result.voice.summaryReady !== false &&
            Date.now() - (attempt.summaryPausedAt ?? Date.now()) >= 500 &&
            !activityRef.current.speaker &&
            (!result.voice.response || completedOutput.current.has(result.voice.response.id)) &&
            (result.assistant.contextSummaryState === 'needed' ||
              (result.assistant.contextGeneration ?? 0) >
                (attempt.providerGeneration ?? initial.contextGeneration ?? 0))
          ) {
            summarizeVoice.current(result.assistant);
            return;
          }
          setVoice(result.voice);
          const refusal = result.voice.refusal;
          const newRefusal = refusal && refusal.id !== attempt.refusalId;
          if (newRefusal) {
            attempt.refusalId = refusal.id;
            // This newer outcome supersedes the playback warning. Actual
            // playback may still be verified by the audio path.
            if (attempt.acknowledgement) attempt.acknowledgement.notified = true;
            setFailure((previous) =>
              previous?.noticeId === 'voiceReplyUnconfirmed' ? null : previous,
            );
          }
          const response = result.voice.response;
          if (response && !completedOutput.current.has(response.id)) {
            if (attempt.acknowledgement?.id !== response.id)
              attempt.acknowledgement = {
                id: response.id,
                lastActivity: Date.now(),
                notified: Boolean(newRefusal),
              };
            const acknowledgement = attempt.acknowledgement;
            if (activityRef.current.speaker || activityRef.current.microphone)
              acknowledgement.lastActivity = Date.now();
            if (
              !acknowledgement.notified &&
              Date.now() - acknowledgement.lastActivity >= unconfirmedPlaybackIdleMs
            ) {
              acknowledgement.notified = true;
              setError({ noticeId: 'voiceReplyUnconfirmed' });
            }
          }
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
          if (attempt.resumeRequested) attempt.resumeMicrophone?.();
          attempt.poll = setTimeout(() => void poll(), 500);
        } catch (failure) {
          if (!navigator.onLine || latest.current.inputBlocked)
            attempt.poll = setTimeout(() => void poll(), 500);
          else fail(failure);
        }
      };
      attempt.resumeMicrophone = (mode = 'resume') => {
        if (
          !inputAllowed() ||
          attempt.summaryPausedAt !== undefined ||
          workingOnWrittenMessage(latest.current.assistant)
        ) {
          attempt.resumeRequested = false;
          return;
        }
        if (
          synchronized &&
          matchesVoiceAnchor(anchor(), synchronized) &&
          latest.current.assistant?.phase === synchronized.phase
        ) {
          if (mode === 'prepare') return;
          attempt.resumeRequested = false;
          attempt.transport?.setMicrophonePaused(false);
          offRef.current = false;
          setOff(false);
          return;
        }
        if (mode === 'resume') attempt.resumeRequested = true;
        if (attempt.poll !== undefined) {
          clearTimeout(attempt.poll);
          void poll();
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
            inputAllowed,
            onMicrophoneReady: () => {
              if (active()) setState('connecting');
            },
            onReady: () => {
              if (!active()) return;
              attempt.ready = true;
              attempt.contextRenewal = false;
              if (latest.current.inputBlocked) {
                attempt.transport?.setMicrophonePaused(true);
                setOff(true);
              }
              setState('listening');
            },
            onClosed: () => {
              if (!active()) return;
              // Stop capture immediately. A read-only status check can then
              // distinguish expired authority from an ordinary provider close.
              attempt.transport?.suspendInput();
              void request<VoiceAssistantResponse>(`${path}/${attempt.voiceId}/poll`, {
                ...anchor(),
                microphoneOn: false,
              }).then((result) => {
                if (active())
                  void stop(
                    voiceErrorNotice(
                      result.voice.error ? new MapRequestError(503, result.voice.error) : undefined,
                      'interrupted',
                    ),
                  );
              }, fail);
            },
            onFailure: () => fail(),
            onPlaybackBlocked: (blocked) => {
              if (active()) setPlaybackBlocked(blocked);
            },
            onDisconnected: (value) => {
              if (!active()) return;
              setDisconnected(value);
              if (value) pauseCapture();
            },
            onTranscript: (row) => {
              if (active()) latest.current.onTranscript?.(row);
            },
            onOutputTranscript: (text, interval) => {
              const output = attempt.output;
              if (!active() || !output) return;
              if (attempt.acknowledgement) attempt.acknowledgement.lastActivity = Date.now();
              output.text += text;
              if (interval && (output.mediaEnd === undefined || interval.end > output.mediaEnd)) {
                const from = Math.max(interval.start, output.mediaEnd ?? interval.start);
                output.evidence ??= { started: false, fragments: [] };
                output.evidence.fragments.push({
                  from: performance.now(),
                  remainingMs: interval.end - from,
                  textLength: output.text.length,
                });
                output.mediaEnd = interval.end;
              }
              checkOutput.current();
            },
            needsPlaybackProgress: () => Boolean(attempt.output?.evidence),
            onPlaybackProgress: (from, at, renderedMs, speaker) => {
              const output = attempt.output;
              const evidence = output?.evidence;
              if (!active() || !output || !evidence) return;
              if (!evidence.started && !speaker) return;
              const previousAudibleLength = output.audibleTextLength;
              // A stats read can finish after more transcript has arrived. Spend
              // its frames once, and only on fragments present during the sample.
              while (renderedMs > 0 && evidence.fragments.length) {
                const fragment = evidence.fragments[0];
                if (at <= fragment.from) break;
                if (from < fragment.from) renderedMs = Math.min(renderedMs, at - fragment.from);
                const credit = Math.min(renderedMs, fragment.remainingMs);
                evidence.started = true;
                fragment.remainingMs -= credit;
                fragment.from = at;
                renderedMs -= credit;
                if (fragment.remainingMs >= 0.001) break;
                output.audibleTextLength = fragment.textLength;
                evidence.fragments.shift();
              }
              if (!evidence.fragments.length) output.evidence = undefined;
              // Receiver stats can finish after activity has already reported silence.
              if (!speaker && output.audibleTextLength !== previousAudibleLength)
                checkOutput.current();
            },
            onAudioActivity: (value) => {
              activityRef.current = value;
              if (!active()) return;
              setActivity(value);
              if (attempt.output) {
                attempt.output.speaking = value.speaker;
                checkOutput.current();
              }
            },
            onDelegation: () => {
              attempt.output = { text: '', speaking: false };
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
              const fresh = await request<TextAssistantView>(
                path.replace(/\/voice$/, ''),
                undefined,
                options.signal,
              );
              if (!active()) throw new DOMException('Voice setup cancelled', 'AbortError');
              if (fresh.id !== initial.id)
                throw new Error('Conversation changed during voice setup');
              admitted = fresh;
              if (JSON.stringify(fresh) !== JSON.stringify(initial)) apply(fresh);
              attempt.delivery = await delivery?.connect(path.replace(/\/voice$/, ''));
              if (!active()) throw new DOMException('Voice setup cancelled', 'AbortError');
              if (delivery && !attempt.delivery)
                throw new Error('The whole-answer delivery connection is unavailable');
              const rendered = anchor();
              result = await request<VoiceAssistantResponse>(
                path,
                {
                  sdp,
                  confirmBrowserInput: true,
                  freshConversationControls: true,
                  deliveryConnectionId: attempt.delivery?.id,
                  ...rendered,
                  microphoneOn: !(reuse?.paused ?? attempt.held?.released ?? false),
                  // The server supplies the authoritative conversation context.
                  // Only an actual reset authorizes its spoken acknowledgement.
                  ...(resetConversation && !summaryRenewal.current
                    ? { newConversation: true }
                    : {}),
                },
                options.signal,
              );
              if (matchesVoiceAnchor(rendered, result.assistant)) synchronized = result.assistant;
            } catch (failure) {
              if (
                failure instanceof MapRequestError &&
                failure.code === 'assistant_context_summary_failed'
              ) {
                const failedView = await request<TextAssistantView>(
                  path.replace(/\/voice$/, ''),
                  undefined,
                  attempt.controller.signal,
                );
                if (active()) {
                  apply(failedView);
                  attempt.transport?.suspendInput();
                  prepared.current = attempt.transport?.releasePlayback() ?? prepared.current;
                  const stream = attempt.transport?.releaseMicrophone();
                  attempt.transport?.releaseBufferedInput();
                  current.current = { path, controller: new AbortController(), retained: stream };
                  attempt.controller.abort();
                  attempt.transport?.close();
                  setContextPaused(true);
                  setOff(true);
                  setState('idle');
                }
                throw new DOMException('Voice context is full', 'AbortError');
              }
              fail(failure);
              throw failure;
            }
            if (!active()) {
              void stopRemote(path, result.voice.id);
              throw new DOMException('Voice setup cancelled', 'AbortError');
            }
            attempt.voiceId = result.voice.id;
            attempt.providerGeneration = result.assistant.contextGeneration ?? 0;
            observeDelivery(result);
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
    [path, apply, stop, setError, inputAllowed, delivery, pauseCapture],
  );
  useEffect(() => {
    const next = transfer.current;
    if (next && next.id === options.assistant?.id) {
      transfer.current = null;
      void start(next.input, undefined, next.resetConversation);
    } else if (options.autoStart) void start();
  }, [options.autoStart, options.assistant?.id, start]);
  useEffect(
    () => () => {
      for (const track of transfer.current?.input?.stream.getTracks() ?? []) track.stop();
      transfer.current = null;
    },
    [],
  );
  const starting = state === 'connecting' || state === 'permission';
  const working = state === 'listening' && voice?.phase === 'working';
  const speaking = state === 'listening' && activity.speaker;
  const activate = useCallback(() => {
    if (!inputAllowed()) return;
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
      const attempt = current.current;
      if (offRef.current && !attempt?.resumeRequested) attempt?.resumeMicrophone?.();
      else pauseCapture();
    } else if (starting) void stop();
  }, [state, starting, start, stop, prepareAudio, setError, inputAllowed, pauseCapture]);
  // Quiet gaps cannot prove that the final utterance or answer has finished.
  // The muted connection closes with the conversation, access loss or leaving the household.
  const renew = useCallback(
    async (
      reset: () => Promise<TextAssistantView>,
      resetConversation = false,
      preserveInput = false,
    ) => {
      const attempt = current.current;
      if (!attempt) return reset();
      // Preserve the unlocked output too: spoken reset has no new browser gesture.
      prepared.current?.close();
      prepared.current = attempt.transport?.releasePlayback() ?? prepareVoicePlayback();
      current.current = null;
      epoch.current++;
      clearTimeout(attempt.poll);
      attempt.controller.abort();
      const stream = attempt.transport?.releaseMicrophone() ?? attempt.retained;
      const pendingInput = preserveInput ? attempt.transport?.releaseBufferedInput() : undefined;
      // Explicit reset retires startup speech; summary transfers its existing queue.
      if (pendingInput && held.current) held.current.buffer = pendingInput;
      else {
        held.current?.buffer?.close();
        held.current?.controller.abort();
        held.current = null;
      }
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
        if (preserveInput) apply(assistant);
        if (assistant.contextSummaryState === 'failed') {
          // Keep pre-release queued speech locally, paused, until the user's
          // explicit reset/stop. Failure does not erase the original context.
          held.current?.buffer?.capture(false);
          held.current?.buffer?.transmit(false);
          setOff(true);
          setState('idle');
          return assistant;
        }
        if (mounted.current && current.current === continuation) {
          current.current = null;
          if (assistant.id !== latest.current.assistant?.id) {
            transfer.current = {
              id: assistant.id,
              resetConversation,
              input: stream ? { stream, paused: offRef.current } : undefined,
            };
            return assistant;
          }
          await start(
            stream ? { stream, paused: offRef.current } : undefined,
            assistant,
            resetConversation,
          );
        } else for (const track of stream?.getTracks() ?? []) track.stop();
        return assistant;
      } catch (failure) {
        if (preserveInput) {
          held.current?.buffer?.close();
          held.current?.controller.abort();
          held.current = null;
          setHeldListening(false);
          setContextPaused(false);
        }
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
    [apply, start],
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
        const capture = Boolean(request && !request.released && inputAllowed());
        // Playback readiness can enable the track; apply the current input gate first.
        request?.buffer?.capture(capture);
        request?.buffer?.playbackReady();
        setHeldListening(capture && Boolean(request?.buffer?.ready));
        setPlaybackBlocked(false);
      })
      .catch(() => setPlaybackBlocked(true));
  }, [inputAllowed]);
  const newConversation = useCallback(
    (reset: () => Promise<TextAssistantView>) => renew(reset, true),
    [renew],
  );
  resetVoice.current = (view) => {
    void newConversation(async () => view).catch(() => latest.current.onRecoveryNeeded?.());
  };
  summarizeVoice.current = (view) => {
    if (summaryRenewal.current) return;
    summaryRenewal.current = true;
    void renew(
      async () =>
        view.contextSummaryState === 'needed'
          ? request<TextAssistantView>(`${path?.replace(/\/voice$/, '')}/summarize`, {})
          : view,
      false,
      true,
    )
      .catch((failure) => {
        if (failure instanceof MapRequestError) latest.current.onAccessLost(failure);
        else setError(voiceErrorNotice(failure, 'interrupted'));
      })
      .finally(() => {
        summaryRenewal.current = false;
      });
  };
  const interrupt = useCallback(
    async (cancelWork?: () => Promise<TextAssistantView | void>) => {
      const attempt = current.current;
      const response = voice?.response;
      if (
        response?.receiptOperationId === latest.current.assistant?.receipt?.operationId &&
        response?.receiptOperationId
      ) {
        completedOutput.current.add(response.id);
        announceSave(response.receiptOperationId);
      }
      const playedBeforeInterrupt = attempt?.playedResponseId;
      const interruption = attempt?.voiceId && attempt.transport?.interruptSpeech();
      if (attempt && interruption) {
        // Muting publishes silence synchronously. It cannot prove the reply drained.
        attempt.playedResponseId = playedBeforeInterrupt;
        if (response) completedOutput.current.add(response.id);
        attempt.output = undefined;
        try {
          const result = await request<VoiceAssistantResponse>(
            `${attempt.path}/${attempt.voiceId}/interrupt`,
            interruption,
            attempt.controller.signal,
          );
          if (current.current !== attempt) return false;
          apply(result.assistant, result.voice.replyDelivery);
          return true;
        } catch (failure) {
          if (current.current === attempt) {
            latest.current.onRecoveryNeeded?.();
            await stop(voiceErrorNotice(failure, 'interrupted'));
          }
          return false;
        }
      }
      // Stopping work without an audible reply retires its provider context, retaining
      // the authorized input and conversation as historical text in a fresh session.
      const interrupted = renew(async () => {
        const [result, canceled] = await Promise.all([
          attempt?.voiceId ? stopRemote(attempt.path, attempt.voiceId) : Promise.resolve(null),
          cancelWork?.(),
        ]);
        if (attempt?.voiceId && !result)
          throw new Error('Voice interruption could not be confirmed');
        const shown = latest.current.assistant;
        // Cancellation can advance the conversation before React renders it.
        // Carry that result into renewal instead of relying on rendered props.
        const view =
          canceled && (!result || canceled.revision >= result.assistant.revision)
            ? canceled
            : result?.assistant;
        const assistant = shown && (!view || shown.revision >= view.revision) ? shown : view;
        if (!assistant) throw new Error('Conversation ended');
        apply(assistant);
        return assistant;
      });
      const generation = epoch.current;
      try {
        await interrupted;
        return true;
      } catch {
        if (mounted.current && epoch.current === generation) {
          latest.current.onRecoveryNeeded?.();
          setError(voiceErrorNotice(undefined, 'interrupted'));
        }
        return false;
      }
    },
    [renew, apply, voice?.response, announceSave, setError, stop],
  );
  const silence = useCallback<Voice['silence']>(
    async (cancelWork) => {
      if (interrupting.current?.path === path) {
        await interrupting.current.result;
        return;
      }
      const result = interrupt(cancelWork);
      interrupting.current = { path, result };
      try {
        await result;
      } finally {
        if (interrupting.current?.result === result) interrupting.current = null;
      }
    },
    [interrupt, path],
  );
  const level = useCallback(() => current.current?.transport?.microphoneLevel() ?? 0, []);
  const startHeld = useCallback(() => {
    if (!inputAllowed() || latest.current.assistant?.phase === 'working') return;
    const attempt = current.current;
    if (attempt?.transport && state === 'listening') {
      held.current = { released: false, controller: new AbortController() };
      attempt.held = held.current;
      if (offRef.current) attempt.resumeMicrophone?.();
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
        const capture = !request.released && inputAllowed();
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
  }, [state, start, prepareAudio, stop, setError, inputAllowed]);
  const releaseHeld = useCallback(() => {
    if (!held.current) return;
    held.current.released = true;
    held.current.buffer?.capture(false);
    pauseCapture();
    setHeldListening(false);
  }, [pauseCapture]);
  useEffect(() => {
    if (!options.contextFailed) return;
    held.current?.buffer?.capture(false);
    held.current?.buffer?.transmit(false);
    current.current?.transport?.suspendInput();
    pauseCapture();
  }, [options.contextFailed, pauseCapture]);
  useEffect(() => {
    const blocked = () => {
      if (!latest.current.inputBlocked && navigator.onLine !== false) return;
      releaseHeld();
      held.current?.buffer?.discard();
      current.current?.transport?.discardPendingInput();
      pauseCapture();
    };
    if (options.inputBlocked) blocked();
    window.addEventListener('offline', blocked);
    return () => window.removeEventListener('offline', blocked);
  }, [options.inputBlocked, pauseCapture, releaseHeld]);
  useEffect(() => {
    const transport = current.current?.transport;
    if (options.saveChecking) {
      held.current?.buffer?.capture(false);
      transport?.setMicrophonePaused(true);
    } else if (
      !off &&
      // A blur can release input before this render's passive effect runs.
      !offRef.current &&
      !options.inputBlocked &&
      !options.contextFailed &&
      !contextPaused &&
      navigator.onLine !== false
    )
      transport?.setMicrophonePaused(false);
  }, [options.saveChecking, options.inputBlocked, options.contextFailed, contextPaused, off]);
  const microphone =
    (state === 'listening' || heldListening) &&
    !off &&
    !contextPaused &&
    !disconnected &&
    !playbackBlocked &&
    !options.saveChecking
      ? 'on'
      : 'off';
  return {
    state,
    phase: voice?.phase ?? null,
    microphone,
    // Automatic context handoff temporarily pauses actual capture and starts
    // a new peer. Announce user choices, including a release during that pause.
    microphoneAnnouncement:
      (contextPaused || summaryRenewal.current || current.current?.contextRenewal) &&
      current.current &&
      !off &&
      !disconnected &&
      !playbackBlocked
        ? 'on'
        : microphone,
    starting,
    speaking,
    playbackPending: Boolean(
      state === 'listening' &&
        voice?.response &&
        !completedOutput.current.has(voice.response.id) &&
        !current.current?.acknowledgement?.notified,
    ),
    userSpeaking: microphone === 'on' && activity.microphone,
    working,
    waitingForAnswer: Boolean(
      options.assistant?.questionPending && spokenQuestion === options.assistant.revision,
    ),
    saved,
    savedId,
    refusal: state === 'listening' && current.current?.path === path ? voice?.refusal : undefined,
    error,
    failure: failure ?? undefined,
    playbackBlocked,
    disconnected,
    disabled:
      contextPaused ||
      state === 'closing' ||
      (microphone === 'off' &&
        !starting &&
        options.assistant?.phase === 'working' &&
        (!working || writtenWork)),
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
      pauseCapture();
    },
    newConversation,
    stop: close,
    endConversation: () => stop(null, true),
    silence,
    prepareTextCorrection: () => {
      const attempt = current.current;
      const interruption =
        interrupting.current?.path === path ? interrupting.current.result : undefined;
      const armPlayback = offRef.current ? undefined : attempt?.transport?.prepareTextCorrection();
      if (armPlayback || interruption) return { interruption, armPlayback };
    },
    playAudio,
  };
}
