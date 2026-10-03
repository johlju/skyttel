import { useCallback, useEffect, useRef, useState } from 'react';
import { conversationCommand } from '../shared/conversation-command.js';
import {
  type ConversationConsentView,
  conversationConsentRequired,
  conversationConsentRevoked,
  conversationConsentTextVersion,
  type SavedConversationConsent,
} from '../shared/conversation-consent.js';
import type { SaveOperation, SaveReceipt } from '../shared/map.js';
import type { SaveCheck } from '../shared/save-check.js';
import type { MapSelection, TextAssistantView } from '../shared/text-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import { MapRequestError, request } from './map-request.js';
import { useVoice, type Voice } from './use-voice.js';

/** How a conversation starts: with the microphone, or with the conversation text. */
export type ConversationMode = 'voice' | 'text';

/**
 * The state and the commands of the household's conversation with Skyttel.
 * Every presentation reads the state and calls the commands. None of them
 * owns the conversation, so it survives whichever of them is shown.
 */
export type Conversation = {
  /** Conversation input is stopped; the unsent text remains editable. */
  inputBlocked?: boolean;
  disconnected?: boolean;
  /** A press while idle asks to see the blocking notice, without opening a view. */
  noticeRequested?: number;
  taskFailed?: boolean;
  consentRevoked?: boolean;
  /** This tab confirmed revocation; hide conversation notices until the next request. */
  revokedHere?: boolean;
  revocationReceipt?: SaveReceipt;
  showNotice?: () => void;
  /** Whether the server offers the conversation. Null until it has answered. */
  available: boolean | null;
  /** The conversation consent for this household, and the consent box that asks for it. */
  consent: {
    /** The saved consent, whatever text version it approves. Null when none is saved. */
    saved: SavedConversationConsent | null;
    /** Approved without being saved. It lasts until the user leaves the household's map. */
    visit: boolean;
    /** Saved for the current consent text, or approved for the visit. */
    valid: boolean;
    /** The server has answered whether a consent is saved. */
    known: boolean;
    /** How the conversation starts once the user approves. Null while the box is not shown. */
    asking: ConversationMode | null;
    /** The server is saving the consent. */
    saving: boolean;
    error: string;
  };
  session: TextAssistantView | null;
  transcript: TranscriptRow[];
  /** The text the user has written but not sent. */
  text: string;
  /** A command is waiting for the server's answer. */
  pending: boolean;
  error: string;
  /** The outcome of a save is unknown and must be checked before new work. */
  unknown: boolean;
  saveChecking?: boolean;
  saveCheckFailed?: boolean;
  working: boolean;
  needsAnswer: boolean;
  /** The microphone and the voice connection: `start`, `stop` and `activate`. */
  voice: Voice;
  setText: (text: string) => void;
  /** Starts a conversation, after the consent box when no consent is valid. */
  begin: (mode: ConversationMode) => void;
  /** Approves in the consent box, and saves the consent when it is to be remembered. */
  approve: (remember: boolean) => Promise<void>;
  /** Closes the consent box. Nothing starts. A consent that is being saved is not withdrawn. */
  decline: () => void;
  /** Saves the consent from Settings. It never starts a conversation. Tells whether it was saved. */
  saveConsent: () => Promise<boolean>;
  /**
   * Revokes the consent, saved or for the visit, and ends the conversation
   * that goes on. The draft is not touched. Tells whether it was revoked.
   */
  revokeConsent: () => Promise<boolean>;
  send: (queue?: boolean) => Promise<void>;
  cancel: () => Promise<void>;
  /**
   * Empties the conversation text and the context and stops ongoing work. The
   * microphone, the unsent text and the draft stay as they are.
   */
  newConversation: () => Promise<void>;
  recover: () => Promise<void>;
  retry: (operationId: string) => Promise<void>;
};

/**
 * A conversation is ongoing when the transcript has content, the microphone
 * is on or starting, Skyttel is working or speaking, or the text view is open.
 */
export function conversationOngoing(
  conversation: Pick<Conversation, 'transcript' | 'working'> & {
    voice: Pick<Voice, 'microphone' | 'starting' | 'speaking' | 'phase'>;
  },
  textViewOpen: boolean,
) {
  const { voice } = conversation;
  return (
    conversation.transcript.length > 0 ||
    voice.microphone === 'on' ||
    voice.starting ||
    conversation.working ||
    voice.phase === 'working' ||
    voice.speaking ||
    textViewOpen
  );
}

export function useConversation({
  householdId,
  enabled = true,
  onMapChange,
  onStarted,
  onEnded,
  onUnavailable,
  onAccessLost,
  onSelectItem,
}: {
  householdId: string;
  /** The conversation exists only while the household's map is loaded. */
  enabled?: boolean;
  onMapChange: () => void;
  /** A conversation has started, so the caller can show it as the chosen button asks. */
  onStarted?: (mode: ConversationMode) => void;
  /** Explicit revocation ends its presentations without disturbing Settings focus. */
  onEnded?: () => void;
  /** A requested conversation is not offered by the server, so the caller can say so. */
  onUnavailable?: () => void;
  onAccessLost: () => void;
  onSelectItem: (target: MapSelection, signal: AbortSignal) => Promise<boolean>;
}): Conversation {
  const household = `/api/households/${encodeURIComponent(householdId)}`;
  const path = `${household}/text-assistant`;
  const consentPath = `${household}/conversation-consent`;
  const [available, setAvailable] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(navigator.onLine);
  const connection = useRef(navigator.onLine);
  const pauseCapture = useRef<() => void>(() => {});
  const [noticeRequested, setNoticeRequested] = useState(0);
  const [taskFailed, setTaskFailed] = useState(false);
  const [consentRevoked, setConsentRevoked] = useState(false);
  const [revokedHere, setRevokedHere] = useState(false);
  const [revocationReceipt, setRevocationReceipt] = useState<SaveReceipt>();
  const endVoice = useRef<() => void>(() => {});
  // Undefined until the server has answered.
  const [savedConsent, setSavedConsent] = useState<SavedConversationConsent | null>();
  const [visitConsent, setVisitConsent] = useState(false);
  const [requested, setRequested] = useState<ConversationMode | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentError, setConsentError] = useState('');
  const [session, setSession] = useState<TextAssistantView | null>(null);
  const [text, setText] = useState('');
  const [startWithVoice, setStartWithVoice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [saveCheckFailed, setSaveCheckFailed] = useState(false);
  const [nextCheckAt, setNextCheckAt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [discovered, setDiscovered] = useState<string[] | null>(null);
  const checkedReplies = useRef(new Set<string>());
  const recovering = useRef(false);
  const checkOccurrence = useRef<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRow[]>([]);
  const voiceConnected = useRef(false);
  const active = useRef<TextAssistantView | null>(null);
  const showTranscript = useCallback((row: TranscriptRow) => {
    if (!active.current) return;
    setTranscript((rows) =>
      rows.some((item) => item.id === row.id)
        ? rows.map((item) =>
            item.id === row.id
              ? {
                  ...row,
                  voiced: row.voiced ?? item.voiced,
                  voicePending: (row.voiced ?? item.voiced) === undefined && row.voicePending,
                }
              : item,
          )
        : [...rows, row],
    );
  }, []);
  const callbacks = useRef({
    onMapChange,
    onStarted,
    onEnded,
    onUnavailable,
    onAccessLost,
    onSelectItem,
  });
  callbacks.current = {
    onMapChange,
    onStarted,
    onEnded,
    onUnavailable,
    onAccessLost,
    onSelectItem,
  };
  const mounted = useRef(true);
  const requestEpoch = useRef(0);
  const resetInProgress = useRef(false);
  const revoking = useRef(false);
  // Counts the visits and what Settings does with the consent, so that an
  // answer is not applied after the user has left the map or done something newer.
  const consentEpoch = useRef(0);
  const update = useCallback(
    (next: TextAssistantView) => {
      if (!mounted.current) return;
      const previous = active.current;
      if (
        previous &&
        (next.id !== previous.id ||
          next.revision < previous.revision ||
          next.review.contentVersion < previous.review.contentVersion ||
          (next.review.contentVersion === previous.review.contentVersion &&
            next.review.version < previous.review.version))
      )
        return;
      active.current = next;
      setSession(next);
      if ((next.contextRevision ?? 0) > (previous?.contextRevision ?? 0)) {
        setUnknown(false);
        setError('');
        setTranscript(
          next.reply
            ? [
                {
                  id: `new-${next.id}-${next.revision}`,
                  role: 'assistant',
                  text: next.reply,
                  voiced: next.resetSource === 'voice' ? true : next.replyVoiced,
                  voicePending:
                    next.resetSource !== 'voice' &&
                    next.replyVoiced === undefined &&
                    voiceConnected.current,
                },
              ]
            : [],
        );
      } else if (
        next.discarded &&
        next.revision !== previous?.revision &&
        next.reply &&
        !(next.completedReplies ?? []).some((reply) => reply.reply === next.reply)
      ) {
        showTranscript({
          id: `discard-${next.id}-${next.revision}`,
          role: 'assistant',
          text: next.reply,
          voicePending: voiceConnected.current,
        });
      }
      if (next.replyVoiced !== undefined)
        setTranscript((rows) =>
          rows.map((row) =>
            row.id === `new-${next.id}-${next.revision}`
              ? { ...row, voiced: next.replyVoiced, voicePending: false }
              : row,
          ),
        );
      if (next.revision !== previous?.revision || next.error !== previous?.error)
        setTaskFailed(next.phase === 'error' && Boolean(next.error));
      for (const reply of next.completedReplies ?? []) {
        const voiced = reply.source === 'voice' ? true : reply.voiced;
        const voicePending = voiced === undefined && voiceConnected.current;
        if (reply.saveCheck)
          showTranscript({
            id: `check-${reply.saveCheck.id}`,
            role: 'assistant',
            text: reply.saveCheck.reply,
            voiced,
            voicePending,
          });
        if (reply.text)
          showTranscript({
            id:
              reply.revision === undefined
                ? `queued-${next.id}-${reply.id}`
                : `text-${next.id}-${reply.revision}`,
            role: 'assistant',
            text: reply.text,
            voiced,
            voicePending,
          });
        if (reply.receipt && !reply.saveCheck)
          showTranscript({
            id: `saved-${next.id}-${reply.receipt.operationId}`,
            role: 'assistant',
            text: 'Sparat.',
            voiced,
            voicePending,
          });
        else if (reply.result && reply.reply)
          showTranscript({
            id: `result-${next.id}-${reply.revision}`,
            role: 'assistant',
            text: reply.reply,
            voiced,
            voicePending,
          });
      }
      if (
        next.saveCheck &&
        !(next.completedReplies ?? []).some((reply) => reply.saveCheck?.id === next.saveCheck?.id)
      ) {
        checkedReplies.current.add(next.saveCheck.id);
        showTranscript({
          id: `check-${next.saveCheck.id}`,
          role: 'assistant',
          text: next.saveCheck.reply,
          voicePending: voiceConnected.current,
        });
      }
      const voiced = (next.completedReplies ?? []).some(
        (reply) => reply.revision === next.revision && reply.source === 'voice',
      )
        ? true
        : undefined;
      if (
        next.receipt &&
        !next.saveCheck &&
        next.receipt.operationId !== previous?.receipt?.operationId &&
        !(next.completedReplies ?? []).some(
          (reply) => reply.receipt?.operationId === next.receipt?.operationId,
        )
      )
        showTranscript({
          id: `saved-${next.id}-${next.receipt.operationId}`,
          role: 'assistant',
          text: 'Sparat.',
          voiced,
          voicePending: voiced === undefined && voiceConnected.current,
        });
      if (
        next.result &&
        next.reply &&
        !next.receipt &&
        !(next.completedReplies ?? []).some(
          (reply) => reply.revision === next.revision && reply.reply === next.reply,
        ) &&
        (next.reply !== previous?.reply || next.revision !== previous?.revision)
      )
        showTranscript({
          id: `result-${next.id}-${next.revision}`,
          role: 'assistant',
          text: next.reply,
          voiced,
          voicePending: voiced === undefined && voiceConnected.current,
        });
      if (
        next.modelReply &&
        !(next.completedReplies ?? []).some((reply) => reply.text === next.modelReply) &&
        (next.modelReply !== previous?.modelReply || next.revision !== previous?.revision)
      )
        showTranscript({
          id: `text-${next.id}-${next.revision}`,
          role: 'assistant',
          text: next.modelReply,
          voiced,
          voicePending: voiced === undefined && voiceConnected.current,
        });
      if (
        !previous ||
        next.review.version !== previous.review.version ||
        next.review.contentVersion !== previous.review.contentVersion ||
        next.receipt?.operationId !== previous.receipt?.operationId
      )
        callbacks.current.onMapChange();
    },
    [showTranscript],
  );
  const updateFromVoice = useCallback(
    (next: TextAssistantView) => {
      if (active.current?.id === next.id) update(next);
    },
    [update],
  );
  const clear = useCallback(() => {
    active.current = null;
    setSession(null);
    setText('');
    setTranscript([]);
    setUnknown(false);
    setDiscovered(null);
    setSaveCheckFailed(false);
    checkedReplies.current.clear();
    checkOccurrence.current = null;
  }, []);
  const fail = useCallback(
    (failure: unknown) => {
      if (!mounted.current) return;
      if (failure instanceof MapRequestError && failure.code === conversationConsentRevoked) {
        requestEpoch.current++;
        active.current = null;
        setSession(null);
        setTranscript([]);
        setUnknown(false);
        setPending(false);
        setError('');
        setTaskFailed(false);
        setStartWithVoice(false);
        setSavedConsent(null);
        setVisitConsent(false);
        setRequested(null);
        setConsentRevoked(true);
        setRevokedHere(false);
        endVoice.current();
        callbacks.current.onEnded?.();
        callbacks.current.onMapChange();
      } else if (
        failure instanceof MapRequestError &&
        failure.code === conversationConsentRequired
      ) {
        // The server has no valid consent, whatever this client last knew.
        // The access is not lost, and the next start asks for the consent.
        clear();
        setSavedConsent(null);
        setVisitConsent(false);
      } else if (failure instanceof MapRequestError && [401, 403, 404].includes(failure.status)) {
        clear();
        setError(
          failure.status === 404
            ? 'Samtalet har avslutats eller innehållet har ersatts. Starta en ny anslutning; ditt beständiga utkast och dina sparförsök finns kvar.'
            : 'Åtkomsten har upphört.',
        );
        if (failure.status !== 404) callbacks.current.onAccessLost();
      } else {
        setUnknown(true);
        setError('');
        setSaveCheckFailed(false);
      }
    },
    [clear],
  );
  useEffect(() => {
    if (!enabled) return;
    mounted.current = true;
    const controller = new AbortController();
    void request<{ available: boolean }>(path, undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setAvailable(result.available);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          connection.current = false;
          pauseCapture.current();
          setConnected(false);
        }
      });
    void request<ConversationConsentView>(consentPath, undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSavedConsent(result.saved ?? null);
      })
      .catch(() => {
        // Without an answer the consent box asks. The server decides what is valid.
        if (!controller.signal.aborted) setSavedConsent(null);
      });
    return () => {
      mounted.current = false;
      requestEpoch.current++;
      consentEpoch.current++;
      controller.abort();
      const current = active.current;
      if (current) void request(`${path}/${current.id}/stop`, {}).catch(() => undefined);
      // A conversation that is enabled again starts as it does the first time.
      clear();
      setAvailable(null);
      // A consent that is not saved lasts until the user leaves the household's map.
      setSavedConsent(undefined);
      setVisitConsent(false);
      setRequested(null);
      setSavingConsent(false);
      setConsentError('');
      setStartWithVoice(false);
      setPending(false);
      setConsentRevoked(false);
      setRevokedHere(false);
      setRevocationReceipt(undefined);
      revoking.current = false;
      setError('');
    };
  }, [path, consentPath, enabled, clear]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const offline = () => {
      connection.current = false;
      pauseCapture.current();
      setConnected(false);
      // Canceling a poll on contact loss is not evidence that its work did not
      // save. Check the original task before accepting another instruction.
      if (active.current?.phase === 'working') setUnknown(true);
    };
    const check = async () => {
      if (!navigator.onLine) return offline();
      try {
        const result = await request<{ available: boolean }>(path, undefined, controller.signal);
        if (controller.signal.aborted) return;
        if (!navigator.onLine) return offline();
        connection.current = true;
        setConnected(true);
        setAvailable(result.available);
        if (!result.available) pauseCapture.current();
      } catch {
        if (!controller.signal.aborted) offline();
      }
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', check);
    const timer = setInterval(() => void check(), 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', check);
    };
  }, [enabled, path]);
  useEffect(() => {
    if (!session || unknown || pending || !connected) return;
    const controller = new AbortController();
    const epoch = requestEpoch.current;
    const relevant = () =>
      !controller.signal.aborted &&
      epoch === requestEpoch.current &&
      active.current?.id === session.id;
    const timer = setTimeout(
      () => {
        void request<TextAssistantView>(`${path}/${session.id}`, undefined, controller.signal)
          .then((result) => {
            if (relevant()) update(result);
          })
          .catch((failure) => {
            if (relevant()) fail(failure);
          });
      },
      session.phase === 'working' ? 250 : 5000,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [session, unknown, pending, connected, path, update, fail]);
  const voice = useVoice({
    householdId,
    assistant: session,
    autoStart: startWithVoice,
    onAssistant: updateFromVoice,
    // A refusal for a revoked consent ends the conversation, not the access.
    onAccessLost: fail,
    onTranscript: showTranscript,
    transcript,
    inputBlocked: !connected || available === false,
    saveChecking:
      unknown ||
      checking ||
      Boolean(discovered) ||
      session?.phase === 'recovery' ||
      Boolean(session?.operations.some((item) => item.status === 'pending')),
    onRecoveryNeeded: () => setUnknown(true),
  });
  endVoice.current = () => {
    void voice.endConversation?.();
  };
  voiceConnected.current = voice.state === 'listening' || voice.starting;
  useEffect(() => {
    if (voice.state !== 'idle' && voice.state !== 'closing') return;
    // If the connection ends before a handoff, the retained reply is text.
    setTranscript((rows) =>
      rows.some((row) => row.voicePending)
        ? rows.map((row) =>
            row.voicePending ? { ...row, voicePending: false, voiced: false } : row,
          )
        : rows,
    );
  }, [voice.state]);
  pauseCapture.current = () => voice.pauseMicrophone?.();
  const disconnected = !navigator.onLine || !connected || voice.disconnected;
  const saveChecking =
    unknown ||
    checking ||
    Boolean(discovered) ||
    session?.phase === 'recovery' ||
    Boolean(session?.operations.some((item) => item.status === 'pending'));
  const inputBlocked = disconnected || available === false || saveChecking;
  useEffect(() => {
    if (disconnected || available === false) pauseCapture.current();
  }, [disconnected, available]);
  const previouslyConnected = useRef(connected);
  useEffect(() => {
    if (connected && !previouslyConnected.current) setSaveCheckFailed(false);
    previouslyConnected.current = connected;
  }, [connected]);
  const recover = useCallback(async () => {
    if (recovering.current || !connection.current || !navigator.onLine) return;
    recovering.current = true;
    checkOccurrence.current ??= crypto.randomUUID();
    const checkId = checkOccurrence.current;
    setChecking(true);
    setSaveCheckFailed(false);
    setError('');
    const epoch = requestEpoch.current;
    const current = active.current;
    try {
      if (current) {
        const result = await request<TextAssistantView>(`${path}/${current.id}/recover`, {
          checkId,
        });
        if (!mounted.current || epoch !== requestEpoch.current) return;
        update(result);
        if (result.phase === 'working' || result.phase === 'recovery') {
          setNextCheckAt(Date.now() + 250);
          setUnknown(true);
          return;
        }
      } else {
        const result = await request<SaveCheck>(`${path}/recover`, {
          checkId,
          ...(discovered ? { operationIds: discovered } : {}),
        });
        if (!mounted.current || epoch !== requestEpoch.current) return;
        if ('checking' in result) {
          setNextCheckAt(Date.now() + 250);
          setUnknown(true);
          return;
        }
        if (!checkedReplies.current.has(result.id)) {
          checkedReplies.current.add(result.id);
          setTranscript((rows) => [
            ...rows,
            { id: `check-${result.id}`, role: 'assistant', text: result.reply },
          ]);
        }
        callbacks.current.onMapChange();
      }
      setUnknown(false);
      setDiscovered(null);
      checkOccurrence.current = null;
    } catch (failure) {
      if (!mounted.current || epoch !== requestEpoch.current) return;
      if (failure instanceof MapRequestError && failure.status === 404 && current) {
        active.current = null;
        setSession(null);
        setDiscovered(
          current.operations
            .filter(
              (item) =>
                item.status === 'pending' || item.operationId === current.receipt?.operationId,
            )
            .map((item) => item.operationId),
        );
        setUnknown(true);
      } else if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
        fail(failure);
      else setSaveCheckFailed(true);
    } finally {
      recovering.current = false;
      if (mounted.current) setChecking(false);
    }
  }, [path, discovered, update, fail]);
  useEffect(() => {
    if (
      !enabled ||
      !connected ||
      !navigator.onLine ||
      !saveChecking ||
      saveCheckFailed ||
      checking ||
      pending
    )
      return;
    const timer = setTimeout(
      () => void recover(),
      nextCheckAt ? Math.max(0, nextCheckAt - Date.now()) : 250,
    );
    return () => clearTimeout(timer);
  }, [enabled, connected, saveChecking, saveCheckFailed, checking, pending, nextCheckAt, recover]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void request<{ operations: SaveOperation[] }>(
      `${household}/map/operations`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        const pending = result.operations
          ?.filter((item) => item.status === 'pending')
          .map((item) => item.operationId);
        if (!controller.signal.aborted && pending?.length) setDiscovered(pending);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, household]);
  const consentValid = visitConsent || savedConsent?.textVersion === conversationConsentTextVersion;
  const start = useCallback(
    async (mode: ConversationMode) => {
      setStartWithVoice(mode === 'voice');
      const epoch = ++requestEpoch.current;
      setPending(true);
      setError('');
      try {
        // A saved consent is on the server. One for the visit is stated with each start.
        const result = await request<TextAssistantView>(
          path,
          visitConsent ? { consent: { textVersion: conversationConsentTextVersion } } : {},
        );
        if (!mounted.current || epoch !== requestEpoch.current) {
          void request(`${path}/${result.id}/stop`, {}).catch(() => undefined);
          return;
        }
        setUnknown(false);
        update(result);
        callbacks.current.onStarted?.(mode);
      } catch (failure) {
        if (epoch !== requestEpoch.current) return;
        void voice.stop();
        fail(failure);
        if (failure instanceof MapRequestError && failure.code === conversationConsentRequired)
          setRequested(mode);
      } finally {
        if (mounted.current && epoch === requestEpoch.current) setPending(false);
      }
    },
    [path, visitConsent, update, fail, voice.stop],
  );
  // A requested start waits for the server's answers about the conversation
  // and the saved consent. It then starts, or the consent box asks first.
  const answered = available !== null && savedConsent !== undefined;
  useEffect(() => {
    if (!requested || !answered) return;
    if (!available || !connection.current || !navigator.onLine) {
      setRequested(null);
      setNoticeRequested((value) => value + 1);
      callbacks.current.onUnavailable?.();
    } else if (consentValid) {
      setRequested(null);
      void start(requested);
    }
  }, [requested, answered, available, consentValid, start]);
  async function approve(remember: boolean) {
    if (requested === 'voice') voice.prepareAudio?.();
    setConsentError('');
    if (!remember) {
      setVisitConsent(true);
      return;
    }
    const epoch = requestEpoch.current;
    setSavingConsent(true);
    const outcome = await request<ConversationConsentView>(consentPath, {
      textVersion: conversationConsentTextVersion,
    }).catch((failure: unknown) => ({ failure }));
    // An answer that comes after the user has left the household's map is not for this visit.
    if (epoch !== requestEpoch.current) return;
    setSavingConsent(false);
    if (!('failure' in outcome)) setSavedConsent(outcome.saved);
    else {
      void voice.stop();
      if (outcome.failure instanceof MapRequestError && [401, 403].includes(outcome.failure.status))
        fail(outcome.failure);
      else setConsentError('Medgivandet kunde inte sparas. Försök igen.');
    }
  }
  /** Sends what Settings does with the consent. Null when the answer is missing or no longer applies. */
  async function changeConsent(changePath: string, body: unknown) {
    const epoch = ++consentEpoch.current;
    const outcome = await request<ConversationConsentView>(changePath, body).catch(
      (failure: unknown) => ({ failure }),
    );
    if (epoch !== consentEpoch.current) return null;
    if (!('failure' in outcome)) return outcome;
    if (outcome.failure instanceof MapRequestError && [401, 403].includes(outcome.failure.status))
      fail(outcome.failure);
    return null;
  }
  async function saveConsent() {
    // Saving in Settings starts nothing, so a start that waits for a consent is dropped.
    setRequested(null);
    const outcome = await changeConsent(consentPath, {
      textVersion: conversationConsentTextVersion,
    });
    if (outcome) setSavedConsent(outcome.saved);
    return Boolean(outcome);
  }
  async function revokeConsent() {
    if (revoking.current) return false;
    revoking.current = true;
    requestEpoch.current++;
    setPending(true);
    // Capture and buffered input stop in the confirming gesture. Closing local
    // audio sends no cancel that could abort a registered save on the server.
    setStartWithVoice(false);
    endVoice.current();
    const outcome = await changeConsent(`${consentPath}/revoke`, {});
    revoking.current = false;
    if (!outcome) {
      setPending(false);
      return false;
    }
    // The server has ended the user's conversations in the household. This one
    // ends here too, and an answer to an earlier command is not for a new one.
    // The text that the user has written but not sent stays.
    requestEpoch.current++;
    active.current = null;
    setSession(null);
    setTranscript([]);
    setUnknown(false);
    setPending(false);
    setError('');
    setRequested(null);
    // A consent that the consent box is still saving gets no answer for this visit.
    setSavingConsent(false);
    setConsentError('');
    setSavedConsent(outcome.saved);
    setVisitConsent(false);
    setStartWithVoice(false);
    setTaskFailed(false);
    setConsentRevoked(false);
    setRevokedHere(true);
    setRevocationReceipt(outcome.receipts?.[0]);
    callbacks.current.onEnded?.();
    callbacks.current.onMapChange();
    return true;
  }
  const command = useCallback(
    async (name: string, body: unknown = {}) => {
      const current = active.current;
      if (!current || revoking.current) return;
      const epoch = ++requestEpoch.current;
      setPending(true);
      setError('');
      try {
        const result = await request<TextAssistantView>(`${path}/${current.id}/${name}`, body);
        if (epoch !== requestEpoch.current) return;
        setUnknown(false);
        update(result);
      } catch (failure) {
        if (epoch === requestEpoch.current) fail(failure);
      } finally {
        if (mounted.current && epoch === requestEpoch.current) setPending(false);
      }
    },
    [path, update, fail],
  );
  async function send(queue = true) {
    const current = session;
    if (
      !current ||
      revoking.current ||
      !text.trim() ||
      inputBlocked ||
      !connection.current ||
      !navigator.onLine
    )
      return;
    const control = conversationCommand(text);
    if (control?.reset) {
      const sent = text;
      await newConversation(control.discard);
      if (
        active.current?.id === current.id &&
        (active.current.contextRevision ?? 0) > (current.contextRevision ?? 0)
      )
        setText((value) => (value === sent ? '' : value));
      return;
    }
    const epoch = ++requestEpoch.current;
    const sent = text;
    showTranscript({ id: crypto.randomUUID(), role: 'user', text: sent });
    setPending(true);
    setError('');
    setTaskFailed(false);
    try {
      const result = await request<TextAssistantView>(`${path}/${current.id}/messages`, {
        revision: current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
        requestId: crypto.randomUUID(),
        text: sent,
        queue,
      });
      if (epoch !== requestEpoch.current) return;
      update(result);
      setText((value) => (value === sent ? '' : value));
      setUnknown(false);
    } catch (failure) {
      if (epoch === requestEpoch.current) fail(failure);
    } finally {
      if (mounted.current && epoch === requestEpoch.current) setPending(false);
    }
  }
  async function newConversation(discard = false) {
    const current = active.current;
    if (!current || resetInProgress.current || saveChecking || revoking.current) return;
    // A reset may interrupt a pending message, but a second reset must not
    // replace the first one's retained microphone while the server answers.
    resetInProgress.current = true;
    const epoch = ++requestEpoch.current;
    setPending(true);
    setError('');
    try {
      const result = await voice.newConversation(() =>
        request<TextAssistantView>(`${path}/${current.id}/new`, { discard }),
      );
      if (epoch !== requestEpoch.current) return;
      setUnknown(false);
      update(result);
      // The conversation text starts over with what Skyttel says about the draft.
      setTranscript((rows) =>
        result.reply
          ? [
              {
                id: `new-${result.id}-${result.revision}`,
                role: 'assistant',
                text: result.reply,
                voiced: rows.find((row) => row.id === `new-${result.id}-${result.revision}`)
                  ?.voiced,
                voicePending:
                  rows.find((row) => row.id === `new-${result.id}-${result.revision}`)
                    ?.voicePending ?? voiceConnected.current,
              },
            ]
          : [],
      );
    } catch (failure) {
      if (epoch === requestEpoch.current) fail(failure);
    } finally {
      resetInProgress.current = false;
      if (mounted.current && epoch === requestEpoch.current) setPending(false);
    }
  }
  const selectionAcknowledged = useRef<string | null>(null);
  const selectionKey =
    session?.phase === 'working' && session.selection?.revision === session.revision
      ? JSON.stringify([session.id, session.selection])
      : null;
  useEffect(() => {
    const selection = active.current?.selection;
    if (!selectionKey || !selection || pending || selectionAcknowledged.current === selectionKey)
      return;
    const target: MapSelection = selection.kind
      ? { kind: selection.kind, id: selection.id }
      : { kind: 'object', id: selection.objectId };
    const epoch = requestEpoch.current;
    const abort = new AbortController();
    void (async () => {
      let displayed = false;
      try {
        displayed = await callbacks.current.onSelectItem(target, abort.signal);
      } catch {
        // A failed display is never evidence for a successful map selection.
      }
      if (abort.signal.aborted || epoch !== requestEpoch.current) return;
      selectionAcknowledged.current = selectionKey;
      void command('selection', { ...selection, ...target, displayed });
    })();
    return () => abort.abort();
  }, [selectionKey, pending, command]);
  const working = session?.phase === 'working';
  return {
    available,
    disconnected,
    inputBlocked,
    noticeRequested,
    taskFailed,
    consentRevoked,
    revokedHere,
    revocationReceipt,
    showNotice: () => setNoticeRequested((value) => value + 1),
    consent: {
      saved: savedConsent ?? null,
      visit: visitConsent,
      valid: consentValid,
      known: savedConsent !== undefined,
      asking: answered && available && !consentValid ? requested : null,
      saving: savingConsent,
      error: consentError,
    },
    session,
    transcript,
    text,
    pending,
    error,
    unknown,
    saveChecking: Boolean(saveChecking && !saveCheckFailed),
    saveCheckFailed,
    working,
    needsAnswer: Boolean(!working && session?.questionPending),
    voice,
    setText,
    begin: (mode) => {
      setConsentRevoked(false);
      setRevokedHere(false);
      setTaskFailed(false);
      if (inputBlocked || !connection.current || !navigator.onLine) {
        setNoticeRequested((value) => value + 1);
        callbacks.current.onUnavailable?.();
        return;
      }
      if (!session && !pending) {
        if (mode === 'voice' && consentValid && available === true) voice.prepareAudio?.();
        setRequested(mode);
      }
    },
    approve,
    decline: () => {
      // The user has approved, and the save is on its way: it cannot be taken back here.
      if (savingConsent) return;
      void voice.stop();
      setRequested(null);
      setConsentError('');
    },
    saveConsent,
    revokeConsent,
    send,
    cancel: async () => {
      const cancelWork = () => command('cancel', { revision: active.current?.revision, all: true });
      if (voice.state === 'listening' || voice.starting) await voice.silence(cancelWork);
      else await cancelWork();
    },
    newConversation,
    recover,
    retry: (operationId) => command('retry', { operationId }),
  };
}
