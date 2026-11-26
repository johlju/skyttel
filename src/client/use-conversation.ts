import { useCallback, useContext, useEffect, useRef, useState } from 'react';
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
import { deliveryFailureNotice } from '../shared/task-delivery.js';
import type {
  MapSelection,
  RetainedConversation,
  TextAssistantView,
} from '../shared/text-assistant.js';
import type { TranscriptRow } from './ConversationTranscript.js';
import { conversationCompletion, draftUpdated } from './conversation-completion.js';
import { MapRequestError, request } from './map-request.js';
import { TaskDeliveryContext, TaskDeliveryResultsContext } from './task-delivery.js';
import { useVoice, type Voice } from './use-voice.js';

const deliveryUnavailableMessage =
  'Instruktionen skickades inte. Skyttel kunde inte öppna anslutningen för hela svaret. Texten finns kvar; försök igen när kontakten fungerar.';

/** Rebuild display turns from retained provider fragments without changing their text. */
function restoreConversationTranscript(
  sessionId: string,
  conversation: TextAssistantView['conversation'] = [],
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  const spokenRows: Partial<Record<TranscriptRow['role'], TranscriptRow>> = {};
  let adjacentUtterance: TranscriptRow | undefined;
  for (const [index, row] of conversation.entries()) {
    if (row.partial && !row.notice && row.utteranceStart !== true) {
      // Only an explicit continuation can cross an interleaved row. Older
      // fragments may have no boundary metadata and join only adjacent speech.
      const utterance = row.utteranceStart === false ? spokenRows[row.role] : adjacentUtterance;
      if (utterance?.role === row.role) {
        if (row.requestId) utterance.id = row.requestId;
        if (row.speechEventId)
          utterance.speechEventIds = [...(utterance.speechEventIds ?? []), row.speechEventId];
        utterance.text += row.text;
        adjacentUtterance = utterance;
        continue;
      }
    }
    adjacentUtterance = undefined;
    if (row.notice) continue;
    const entry: TranscriptRow = {
      id: row.role === 'user' && row.requestId ? row.requestId : `restored-${sessionId}-${index}`,
      role: row.role,
      text: row.text,
      partial: row.partial,
      requestId: row.requestId,
      speechEventIds: row.speechEventId ? [row.speechEventId] : undefined,
      voicePending: false,
    };
    rows.push(entry);
    if (row.partial) {
      spokenRows[row.role] = entry;
      adjacentUtterance = entry;
    }
  }
  return rows;
}

function resetReplyId(view: Pick<TextAssistantView, 'id' | 'contextRevision'>) {
  return `new-${view.id}-${view.contextRevision ?? 0}`;
}

function conversationResultReply(
  view: Pick<TextAssistantView, 'reply' | 'result' | 'requiredNotice' | 'error'> & {
    failed?: boolean;
  },
) {
  if (view.error || view.failed) return undefined;
  return draftUpdated(view) || view.result?.changes?.length ? view.requiredNotice : view.reply;
}

/** How a conversation starts: with the microphone, or with the conversation text. */
export type ConversationMode = 'voice' | 'text';

/**
 * The state and the commands of the household's conversation with Skyttel.
 * Every presentation reads the state and calls the commands. None of them
 * owns the conversation, so it survives whichever of them is shown.
 */
export type Conversation = {
  switchBlocked?: boolean;
  retainedConversations?: RetainedConversation[];
  listError?: string;
  listRetained?: () => Promise<void>;
  openRetained?: (id: string) => Promise<boolean>;
  deleteRetained?: (id: string) => Promise<string | undefined>;
  resumeConversation?: (requestId?: string) => Promise<void>;
  configureModel?: (choice: ConversationModelChoice) => Promise<boolean>;
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
  deliveryError?: string;
  /** The outcome of a save is unknown and must be checked before new work. */
  unknown: boolean;
  saveChecking?: boolean;
  saveCheckFailed?: boolean;
  working: boolean;
  needsAnswer: boolean;
  saveBlocked?: boolean;
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
  endConversation: () => Promise<void>;
  recover: () => Promise<void>;
  retry: (operationId: string) => Promise<void>;
  retryWork?: () => Promise<void>;
  abandonWork?: () => Promise<void>;
};

/**
 * A conversation is ongoing when the transcript has content, the microphone
 * is on or starting, Skyttel is working or speaking, or an established
 * conversation's text view is open. Opening the text view alone starts nothing.
 */
export function conversationOngoing(
  conversation: Pick<Conversation, 'transcript' | 'working'> & {
    session?: Conversation['session'];
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
    (textViewOpen && Boolean(conversation.session))
  );
}

export function useConversation({
  householdId,
  enabled = true,
  manualSaveOperationId,
  onMapChange,
  onSaveConfirmed,
  onStarted,
  onEnded,
  onUnavailable,
  onAccessLost,
  onSelectItem,
}: {
  householdId: string;
  /** The conversation exists only while the household's map is loaded. */
  enabled?: boolean;
  /** A local save request still owns this operation's completion. */
  manualSaveOperationId?: string;
  onMapChange: () => void;
  onSaveConfirmed?: (operationId: string) => void;
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
  const delivery = useContext(TaskDeliveryContext);
  const deliveryResults = useContext(TaskDeliveryResultsContext);
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
  const [retainedConversations, setRetainedConversations] = useState<RetainedConversation[]>();
  const resumeRequested = useRef(false);
  const resetCommand = useRef<string | null>(null);
  const selectedAction = useRef<{
    type: 'send' | 'voice' | 'retry' | 'retry-work' | 'abandon-work';
    requestId?: string;
  } | null>(null);
  const resolveSelected = useRef<
    (action: 'retry' | 'abandon', view: TextAssistantView) => Promise<void>
  >(async () => {});
  const sendSelected = useRef<(view: TextAssistantView) => Promise<void>>(async () => {});
  const listRead = useRef(0);
  const [listError, setListError] = useState('');
  const deliverySessionId = session?.requiresActivation ? undefined : session?.id;
  useEffect(() => {
    if (deliverySessionId) void delivery?.connect(`${path}/${deliverySessionId}`);
  }, [delivery, path, deliverySessionId]);
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
  const manualSave = useRef(manualSaveOperationId);
  manualSave.current = manualSaveOperationId;
  const checkOccurrence = useRef<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptRow[]>([]);
  const voiceConnected = useRef(false);
  const active = useRef<TextAssistantView | null>(null);
  const completion = useRef(conversationCompletion());
  const hydratedReplies = useRef(new Map<string, number | undefined>());
  const showTranscript = useCallback((row: TranscriptRow) => {
    if (!active.current) return;
    setTranscript((rows) =>
      rows.some((item) => item.id === row.id)
        ? rows.map((item) =>
            item.id === row.id
              ? {
                  ...row,
                  requestId: row.requestId ?? item.requestId,
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
    onSaveConfirmed,
    onStarted,
    onEnded,
    onUnavailable,
    onAccessLost,
    onSelectItem,
  });
  callbacks.current = {
    onMapChange,
    onSaveConfirmed,
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
      if (previous && (next.modelChoiceRevision ?? 0) < (previous.modelChoiceRevision ?? 0)) {
        next = {
          ...next,
          modelChoice: previous.modelChoice,
          modelChoiceRevision: previous.modelChoiceRevision,
          enabledModelChoices: previous.enabledModelChoices,
          modelChoiceUnavailable: previous.modelChoiceUnavailable,
        };
      }
      if (
        previous &&
        (next.id !== previous.id ||
          next.revision < previous.revision ||
          next.review.contentVersion < previous.review.contentVersion ||
          (next.review.contentVersion === previous.review.contentVersion &&
            next.review.version < previous.review.version))
      )
        return;
      // A poll and a message response can arrive in reverse order at the
      // same revision. Work steps only grow within a conversation context.
      const previousSteps = previous?.workSteps ?? [];
      const nextSteps = next.workSteps ?? [];
      if (
        previous?.id === next.id &&
        (previous.contextRevision ?? 0) === (next.contextRevision ?? 0) &&
        (previousSteps.length > nextSteps.length ||
          (previousSteps.length === nextSteps.length &&
            (previousSteps.at(-1)?.count ?? 0) > (nextSteps.at(-1)?.count ?? 0)))
      )
        next = { ...next, workSteps: previousSteps };
      if (previous) {
        const knownReceipts = new Set([
          previous.receipt?.operationId,
          ...(previous.completedReplies ?? []).map((reply) => reply.receipt?.operationId),
        ]);
        const receipts = [
          next.receipt,
          ...(next.completedReplies ?? []).map((reply) => reply.receipt),
        ];
        for (const receipt of receipts) {
          if (receipt && !knownReceipts.has(receipt.operationId)) {
            knownReceipts.add(receipt.operationId);
            callbacks.current.onSaveConfirmed?.(receipt.operationId);
          }
        }
      }
      active.current = next;
      setSession(next);
      if (next.paused || next.requiresActivation || (!previous && next.conversation?.length)) {
        completion.current = conversationCompletion(next);
        hydratedReplies.current = new Map(
          (next.completedReplies ?? []).map((reply) => [reply.id, reply.revision]),
        );
        const rows = restoreConversationTranscript(next.id, next.conversation);
        if (
          next.interruptedSpeech &&
          next.interruptedRequestId &&
          !rows.some((row) => row.id === next.interruptedRequestId)
        ) {
          const row = rows.findLast(
            (entry) => entry.role === 'user' && entry.text === next.interruptedSpeech,
          );
          if (row) row.id = next.interruptedRequestId;
          else
            rows.push({
              role: 'user',
              id: next.interruptedRequestId,
              text: next.interruptedSpeech,
            });
        }
        setTranscript([
          ...rows,
          ...(next.queuedRequests ?? [])
            .filter(({ source }) => source !== 'voice')
            .map(({ id, text }) => ({
              id,
              role: 'user' as const,
              text,
              voicePending: false,
            })),
        ]);
        setTaskFailed(false);
        return;
      }
      if ((next.contextRevision ?? 0) > (previous?.contextRevision ?? 0)) {
        hydratedReplies.current.clear();
        setUnknown(false);
        setError('');
        setTranscript(
          next.reply
            ? [
                {
                  id: resetReplyId(next),
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
          id: next.resetSource ? resetReplyId(next) : `discard-${next.id}-${next.revision}`,
          role: 'assistant',
          text: next.reply,
          voicePending: voiceConnected.current,
        });
      }
      if (next.replyVoiced !== undefined)
        setTranscript((rows) =>
          rows.map((row) =>
            row.id === resetReplyId(next)
              ? { ...row, voiced: next.replyVoiced, voicePending: false }
              : row,
          ),
        );
      if (next.revision !== previous?.revision || next.error !== previous?.error)
        // A blocked action has its own notice. Classify this task's error so
        // retained security references cannot hide a later, distinct failure.
        setTaskFailed(
          next.phase === 'error' &&
            Boolean(next.error) &&
            next.error !== 'assistant_action_out_of_scope',
        );
      for (const reply of next.completedReplies ?? []) {
        if (
          hydratedReplies.current.has(reply.id) &&
          hydratedReplies.current.get(reply.id) === reply.revision
        )
          continue;
        const voiced = reply.source === 'voice' ? true : reply.voiced;
        const voicePending = voiced === undefined && voiceConnected.current;
        const resultReply = conversationResultReply(reply);
        if (reply.saveCheck)
          showTranscript({
            id: `check-${reply.saveCheck.id}`,
            requestId: reply.id,
            role: 'assistant',
            text: reply.saveCheck.reply,
            voiced,
            voicePending,
          });
        if (
          reply.text &&
          !reply.failed &&
          !reply.questionPending &&
          reply.text !== reply.result?.message
        )
          showTranscript({
            id:
              reply.revision === undefined
                ? `queued-${next.id}-${reply.id}`
                : `text-${next.id}-${reply.revision}`,
            requestId: reply.id,
            role: 'assistant',
            text: reply.text,
            voiced,
            voicePending,
          });
        if (reply.receipt && !reply.saveCheck)
          showTranscript({
            id: `saved-${next.id}-${reply.receipt.operationId}`,
            requestId: reply.id,
            role: 'assistant',
            text: 'Sparat.',
            voiced,
            voicePending,
          });
        else if ((reply.result || reply.requiredNotice) && resultReply)
          showTranscript({
            id:
              reply.resetContextRevision === undefined
                ? `result-${next.id}-${reply.revision}`
                : resetReplyId({ id: next.id, contextRevision: reply.resetContextRevision }),
            requestId: reply.id,
            role: 'assistant',
            text: resultReply,
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
          requestId: next.taskId,
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
          requestId: next.taskId,
          role: 'assistant',
          text: 'Sparat.',
          voiced,
          voicePending: voiced === undefined && voiceConnected.current,
        });
      const resultReply = conversationResultReply(next);
      if (
        (next.result || next.requiredNotice) &&
        resultReply &&
        !next.receipt &&
        !(next.completedReplies ?? []).some(
          (reply) => reply.revision === next.revision && reply.reply === next.reply,
        ) &&
        (next.reply !== previous?.reply || next.revision !== previous?.revision)
      )
        showTranscript({
          id:
            next.resetSource && next.discarded
              ? resetReplyId(next)
              : `result-${next.id}-${next.revision}`,
          requestId: next.taskId,
          role: 'assistant',
          text: resultReply,
          voiced,
          voicePending: voiced === undefined && voiceConnected.current,
        });
      if (
        next.modelReply &&
        !next.error &&
        !next.questionPending &&
        next.modelReply !== next.result?.message &&
        !(next.completedReplies ?? []).some((reply) => reply.text === next.modelReply) &&
        (next.modelReply !== previous?.modelReply || next.revision !== previous?.revision)
      )
        showTranscript({
          id: `text-${next.id}-${next.revision}`,
          requestId: next.taskId,
          role: 'assistant',
          text: next.modelReply,
          voiced,
          voicePending: voiced === undefined && voiceConnected.current,
        });
      for (const summary of next.contextSummaries ?? [])
        showTranscript({
          id: `summary-${next.id}-${summary.id}`,
          role: 'assistant',
          text: summary.text,
          voiced: false,
        });
      const completed = completion.current(next);
      if (completed) showTranscript(completed);
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
  const replaceConversation = useCallback(
    (next: TextAssistantView) => {
      active.current = null;
      completion.current = conversationCompletion();
      hydratedReplies.current.clear();
      setTranscript([]);
      setUnknown(false);
      update(next);
    },
    [update],
  );
  const clear = useCallback((keepListAndText = false) => {
    active.current = null;
    completion.current = conversationCompletion();
    hydratedReplies.current.clear();
    setSession(null);
    if (!keepListAndText) {
      setRetainedConversations(undefined);
      setListError('');
      setText('');
    }
    resumeRequested.current = false;
    setTranscript([]);
    setUnknown(false);
    setDiscovered(null);
    setSaveCheckFailed(false);
    checkedReplies.current.clear();
    checkOccurrence.current = null;
  }, []);
  const removeDeletedConversation = useCallback(
    (id: string) => {
      // A list response sent before deletion must not restore its old row.
      listRead.current++;
      setRetainedConversations((rows) => rows?.filter((row) => row.id !== id));
      if (active.current?.id !== id) return;
      requestEpoch.current++;
      selectedAction.current = null;
      clear(true);
      setError('');
      setTaskFailed(false);
      setStartWithVoice(false);
      setPending(false);
      setRequested(null);
      endVoice.current();
      callbacks.current.onMapChange();
    },
    [clear],
  );
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
        failure.code === 'assistant_conversation_deleted'
      ) {
        if (active.current) removeDeletedConversation(active.current.id);
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
    [clear, removeDeletedConversation],
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
    const leave = () => {
      const current = active.current;
      if (current && !current.requiresActivation)
        void request(`${path}/${current.id}/pause`, {}, undefined, true).catch(() => {});
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      selectedAction.current = null;
      resetCommand.current = null;
      mounted.current = false;
      requestEpoch.current++;
      consentEpoch.current++;
      controller.abort();
      const current = active.current;
      if (current && !current.requiresActivation)
        void request(`${path}/${current.id}/pause`, {}).catch(() => undefined);
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
        void request<TextAssistantView>(
          session.requiresActivation
            ? `${path}/retained/${session.id}/open`
            : `${path}/${session.id}`,
          undefined,
          controller.signal,
        )
          .catch((error) => {
            if (
              relevant() &&
              !session.requiresActivation &&
              error instanceof MapRequestError &&
              error.code === 'assistant_session_expired'
            )
              return request<TextAssistantView>(
                `${path}/retained/${session.id}/open`,
                undefined,
                controller.signal,
              );
            throw error;
          })
          .then((result) => {
            if (relevant()) update(result);
          })
          .catch((failure) => {
            if (relevant()) fail(failure);
          });
      },
      session.phase === 'working' || session.contextSummaryState === 'summarizing' ? 250 : 5000,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [session, unknown, pending, connected, path, update, fail]);
  const saveChecking =
    unknown ||
    checking ||
    Boolean(discovered?.some((id) => id !== manualSaveOperationId)) ||
    (!session?.requiresActivation && (session?.batchPending || session?.phase === 'recovery')) ||
    Boolean(
      !session?.requiresActivation &&
        session?.operations.some(
          (item) => item.status === 'pending' && item.operationId !== manualSaveOperationId,
        ),
    );
  const voice = useVoice({
    householdId,
    assistant: session,
    autoStart: startWithVoice,
    onAssistant: updateFromVoice,
    // A refusal for a revoked consent ends the conversation, not the access.
    onAccessLost: fail,
    onTranscript: showTranscript,
    inputBlocked: !connected || available === false || session?.paused === true,
    saveChecking,
    contextFailed: session?.contextSummaryState === 'failed',
    onRecoveryNeeded: () => setUnknown(true),
    onNewConversation: () => {
      if (saveChecking || switchBlocked || resetInProgress.current || revoking.current)
        return false;
      void newConversation('voice');
      return true;
    },
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
  const inputBlocked =
    disconnected ||
    available === false ||
    saveChecking ||
    (session?.contextSummaryState === 'failed' && !session.capacityPaused);
  useEffect(() => {
    if (disconnected || available === false) pauseCapture.current();
  }, [disconnected, available]);
  const previouslyConnected = useRef(connected);
  useEffect(() => {
    if (connected && !previouslyConnected.current) setSaveCheckFailed(false);
    previouslyConnected.current = connected;
  }, [connected]);
  const recover = useCallback(async () => {
    // Recovery can finish registered operations. Wait for the local request's
    // outcome before treating its operation as uncertain, including stale timers.
    if (manualSave.current || recovering.current || !connection.current || !navigator.onLine)
      return;
    recovering.current = true;
    checkOccurrence.current ??= crypto.randomUUID();
    const checkId = checkOccurrence.current;
    setChecking(true);
    setSaveCheckFailed(false);
    setError('');
    const epoch = requestEpoch.current;
    const current = active.current;
    try {
      if (current && !current.requiresActivation) {
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
      if (
        failure instanceof MapRequestError &&
        current &&
        (failure.status === 404 ||
          failure.code === conversationConsentRequired ||
          failure.code === conversationConsentRevoked)
      ) {
        active.current = null;
        setSession(null);
        if (
          failure.code === conversationConsentRequired ||
          failure.code === conversationConsentRevoked
        ) {
          setSavedConsent(null);
          setVisitConsent(false);
          endVoice.current();
        }
        if (failure.code === conversationConsentRevoked) {
          setConsentRevoked(true);
          setRevokedHere(false);
        }
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
      pending ||
      manualSaveOperationId
    )
      return;
    const timer = setTimeout(
      () => void recover(),
      nextCheckAt ? Math.max(0, nextCheckAt - Date.now()) : 250,
    );
    return () => clearTimeout(timer);
  }, [
    enabled,
    connected,
    saveChecking,
    saveCheckFailed,
    checking,
    pending,
    manualSaveOperationId,
    nextCheckAt,
    recover,
  ]);
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
          ?.filter((item) => item.status === 'pending' && item.operationId !== manualSave.current)
          .map((item) => item.operationId);
        if (!controller.signal.aborted && pending?.length) setDiscovered(pending);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, household]);
  const consentValid = visitConsent || savedConsent?.textVersion === conversationConsentTextVersion;
  const resumeConversation = useCallback(async () => {
    const current = active.current;
    if (!current?.paused || pending) return;
    if (!consentValid) {
      resumeRequested.current = true;
      setRequested('text');
      return;
    }
    resumeRequested.current = false;
    const epoch = ++requestEpoch.current;
    setPending(true);
    setError('');
    try {
      const next = await request<TextAssistantView>(
        `${path}/${current.id}/resume`,
        visitConsent ? { consent: { textVersion: conversationConsentTextVersion } } : {},
      );
      if (mounted.current && epoch === requestEpoch.current) {
        update(next);
        setUnknown(false);
      }
    } catch (failure) {
      if (epoch === requestEpoch.current) {
        if (failure instanceof MapRequestError && failure.code === conversationConsentRequired) {
          setSavedConsent(null);
          setVisitConsent(false);
          resumeRequested.current = true;
          setRequested('text');
        } else fail(failure);
      }
    } finally {
      if (mounted.current && epoch === requestEpoch.current) setPending(false);
    }
  }, [path, visitConsent, consentValid, pending, update, fail]);
  const start = useCallback(
    async (mode: ConversationMode) => {
      const command = resetCommand.current;
      resetCommand.current = null;
      const action = selectedAction.current;
      selectedAction.current = null;
      if (action && active.current) {
        const current = active.current;
        const epoch = ++requestEpoch.current;
        const consent = visitConsent
          ? { consent: { textVersion: conversationConsentTextVersion } }
          : {};
        setPending(true);
        try {
          const activated = await request<TextAssistantView>(
            `${path}/retained/${current.id}/open`,
            { activate: true, ...consent },
          );
          if (!mounted.current || epoch !== requestEpoch.current) return;
          update(activated);
          if (action.type === 'retry' && action.requestId === activated.interruptedRequestId) {
            const next = await request<TextAssistantView>(`${path}/${current.id}/resume`, {
              requestId: action.requestId,
              ...consent,
            });
            if (epoch === requestEpoch.current) update(next);
          } else if (
            (action.type === 'abandon-work' || action.type === 'retry-work') &&
            action.requestId === activated.workFailure?.requestId &&
            !activated.paused
          ) {
            await resolveSelected.current(
              action.type === 'retry-work' ? 'retry' : 'abandon',
              activated,
            );
          } else if (action.type === 'voice' && !activated.paused) setStartWithVoice(true);
          else if (action.type === 'send' && !activated.paused)
            await sendSelected.current(activated);
        } catch (error) {
          if (epoch === requestEpoch.current) {
            if (error instanceof MapRequestError && error.code === 'assistant_conversation_busy')
              setError(
                'Samtalet används på en annan enhet. Vänta tills arbetet är klart och mikrofonen är avstängd.',
              );
            else fail(error);
          }
        } finally {
          if (mounted.current && epoch === requestEpoch.current) setPending(false);
        }
        return;
      }
      if (resumeRequested.current) {
        await resumeConversation();
        return;
      }
      setStartWithVoice(mode === 'voice');
      const epoch = ++requestEpoch.current;
      setPending(true);
      setError('');
      try {
        // A saved consent is on the server. One for the visit is stated with each start.
        const result = await request<TextAssistantView>(path, {
          previousId: active.current?.requiresActivation ? undefined : active.current?.id,
          ...(visitConsent ? { consent: { textVersion: conversationConsentTextVersion } } : {}),
        });
        if (!mounted.current || epoch !== requestEpoch.current) {
          void request(`${path}/${result.id}/pause`, {}).catch(() => undefined);
          return;
        }
        replaceConversation(result);
        if (command) setText((value) => (value === command ? '' : value));
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
    [path, visitConsent, update, replaceConversation, fail, voice.stop, resumeConversation],
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
      // The confirming gesture already ended local audio. A lost revocation
      // reply cannot discard an uncertain save or trust the retired session.
      const current = active.current;
      const ids = current?.operations
        .filter(
          (item) => item.status === 'pending' || item.operationId === current.receipt?.operationId,
        )
        .map((item) => item.operationId);
      if (unknown || current?.phase === 'recovery' || ids?.length) {
        active.current = null;
        setSession(null);
        setDiscovered(ids?.length ? ids : discovered);
        setUnknown(true);
        setSaveCheckFailed(false);
        setSavedConsent(null);
        setVisitConsent(false);
        setRequested(null);
        callbacks.current.onEnded?.();
      }
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
    setDiscovered(null);
    setSaveCheckFailed(false);
    setChecking(false);
    setNextCheckAt(0);
    checkOccurrence.current = null;
    checkedReplies.current.clear();
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
        return result;
      } catch (failure) {
        if (epoch === requestEpoch.current) fail(failure);
      } finally {
        if (mounted.current && epoch === requestEpoch.current) setPending(false);
      }
    },
    [path, update, fail],
  );
  async function send(queue = true, current = session) {
    const control = conversationCommand(text);
    if (current && control?.reset && !control.discard) {
      if (!navigator.onLine || !connection.current || inputBlocked) return;
      const sent = text;
      if (!consentValid) {
        resetCommand.current = sent;
        setRequested('text');
        return;
      }
      await newConversation();
      if (active.current && active.current.id !== current.id)
        setText((value) => (value === sent ? '' : value));
      return;
    }
    if (current?.requiresActivation && !current.interruptedRequestId) {
      selectedAction.current = { type: 'send' };
      setRequested('text');
      return;
    }
    if (
      !current ||
      current.paused ||
      current.workFailure?.code === 'assistant_draft_changed' ||
      revoking.current ||
      !text.trim() ||
      inputBlocked ||
      current.contextSummaryState === 'summarizing' ||
      !connection.current ||
      !navigator.onLine
    )
      return;
    if (control?.reset) {
      const sent = text;
      await resetContext(control.discard);
      if (
        active.current?.id === current.id &&
        (active.current.contextRevision ?? 0) > (current.contextRevision ?? 0)
      )
        setText((value) => (value === sent ? '' : value));
      return;
    }
    const epoch = ++requestEpoch.current;
    const sent = text;
    const messageId = crypto.randomUUID();
    const correction = voice.prepareTextCorrection?.();
    setPending(true);
    setError('');
    setTaskFailed(false);
    try {
      const deliveryConnection = await delivery?.connect(`${path}/${current.id}`);
      if (epoch !== requestEpoch.current) return;
      if (delivery && !deliveryConnection) {
        setError(deliveryUnavailableMessage);
        setPending(false);
        try {
          // A refused socket cannot expose its authentication failure. Check
          // existing authority without admitting or retrying this instruction.
          await request<TextAssistantView>(`${path}/${current.id}`);
        } catch (failure) {
          if (
            mounted.current &&
            epoch === requestEpoch.current &&
            active.current?.id === current.id &&
            failure instanceof MapRequestError &&
            [401, 403, 404].includes(failure.status)
          )
            fail(failure);
        }
        return;
      }
      // Wait for the stop to cancel the preceding work. Keep the draft versions
      // that the person saw when they wrote the new message.
      const confirmed = correction?.interruption ? await correction.interruption : true;
      const latest = active.current;
      if (epoch !== requestEpoch.current || latest?.id !== current.id) return;
      if (!confirmed) return;
      showTranscript({ id: messageId, role: 'user', text: sent });
      // The user's fresh submission arms the silence gate before any reply can
      // reach Live, even if the response to this POST is delayed.
      correction?.armPlayback?.();
      const result = await request<TextAssistantView>(`${path}/${current.id}/messages`, {
        revision: correction?.interruption ? latest.revision : current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
        requestId: messageId,
        text: sent,
        restate: current.capacityPaused === true,
        queue,
        deliveryConnectionId: deliveryConnection?.id,
        deliveryAudio: voiceConnected.current,
      });
      if (epoch !== requestEpoch.current) return;
      const accepted = result.tasks?.find((task) => task.id === messageId)?.delivery;
      if (accepted) deliveryConnection?.observeAccepted(accepted);
      update(result);
      setText((value) => (value === sent ? '' : value));
      setUnknown(false);
    } catch (failure) {
      if (epoch === requestEpoch.current) {
        if (
          failure instanceof MapRequestError &&
          failure.code === 'assistant_delivery_unavailable'
        ) {
          setError(deliveryUnavailableMessage);
          setTranscript((rows) => rows.filter((row) => row.id !== messageId));
        } else fail(failure);
      }
    } finally {
      if (mounted.current && epoch === requestEpoch.current) setPending(false);
    }
  }
  sendSelected.current = (view) => send(true, view);
  async function resolveWork(action: 'retry' | 'abandon', activated?: TextAssistantView) {
    const current = activated ?? active.current;
    if (!current?.workFailure || (!activated && pending) || revoking.current) return;
    if (current.requiresActivation) {
      selectedAction.current = {
        type: action === 'retry' ? 'retry-work' : 'abandon-work',
        requestId: current.workFailure.requestId,
      };
      setRequested('text');
      return;
    }
    if (current.paused) return;
    const requestId = current.workFailure.requestId;
    const epoch = ++requestEpoch.current;
    setPending(true);
    setError('');
    try {
      const connection =
        action === 'retry' ? await delivery?.connect(`${path}/${current.id}`) : undefined;
      if (epoch !== requestEpoch.current) return;
      if (action === 'retry' && delivery && !connection) {
        setError(deliveryUnavailableMessage);
        return;
      }
      const result = await request<TextAssistantView>(`${path}/${current.id}/${action}-work`, {
        revision: current.revision,
        requestId,
        ...(visitConsent ? { consent: { textVersion: conversationConsentTextVersion } } : {}),
        deliveryConnectionId: connection?.id,
        deliveryAudio: voiceConnected.current,
      });
      if (epoch !== requestEpoch.current) return;
      const accepted = result.tasks?.find((task) => task.id === requestId)?.delivery;
      if (accepted) connection?.observeAccepted(accepted);
      setUnknown(false);
      update(result);
      if (action === 'abandon' && !result.workFailure && result.reply)
        showTranscript({
          id: `result-${result.id}-${result.revision}`,
          role: 'assistant',
          text: result.reply,
        });
    } catch (failure) {
      if (epoch === requestEpoch.current) fail(failure);
    } finally {
      if (mounted.current && epoch === requestEpoch.current) setPending(false);
    }
  }
  resolveSelected.current = resolveWork;
  async function resetContext(discard = false) {
    const current = active.current;
    if (!current || resetInProgress.current || saveChecking || revoking.current) return;
    if (current.paused && !consentValid) {
      setRequested('text');
      return;
    }
    // A reset may interrupt a pending message, but a second reset must not
    // replace the first one's retained microphone while the server answers.
    resetInProgress.current = true;
    const epoch = ++requestEpoch.current;
    setPending(true);
    setError('');
    try {
      const result = await voice.newConversation(() =>
        request<TextAssistantView>(`${path}/${current.id}/new`, {
          discard,
          ...(visitConsent ? { consent: { textVersion: conversationConsentTextVersion } } : {}),
        }),
      );
      if (epoch !== requestEpoch.current) return;
      setUnknown(false);
      update(result);
      // The conversation text starts over with what Skyttel says about the draft.
      setTranscript((rows) =>
        result.reply
          ? [
              {
                id: resetReplyId(result),
                role: 'assistant',
                text: result.reply,
                voiced: rows.find((row) => row.id === resetReplyId(result))?.voiced,
                voicePending:
                  rows.find((row) => row.id === resetReplyId(result))?.voicePending ??
                  voiceConnected.current,
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
  const switchBlocked = Boolean(
    pending ||
      (!session?.requiresActivation &&
        !session?.waitingForRetainedWork &&
        session?.phase === 'working') ||
      voice.working ||
      voice.speaking ||
      voice.playbackPending ||
      voice.starting ||
      (!session?.requiresActivation && session?.contextSummaryState === 'summarizing'),
  );
  async function newConversation(resetSource?: 'voice') {
    if (saveChecking || switchBlocked || resetInProgress.current || revoking.current) return;
    if (!consentValid) {
      setRequested('text');
      return;
    }
    const epoch = ++requestEpoch.current;
    resetInProgress.current = true;
    setPending(true);
    setStartWithVoice(false);
    try {
      const next = await voice.newConversation(() =>
        request<TextAssistantView>(path, {
          resetSource,
          previousId: active.current?.requiresActivation ? undefined : active.current?.id,
          ...(visitConsent ? { consent: { textVersion: conversationConsentTextVersion } } : {}),
        }),
      );
      if (!mounted.current || epoch !== requestEpoch.current) {
        void request(`${path}/${next.id}/pause`, {}).catch(() => undefined);
        return;
      }
      setError('');
      replaceConversation(next);
    } catch (failure) {
      if (epoch === requestEpoch.current) fail(failure);
    } finally {
      resetInProgress.current = false;
      if (mounted.current && epoch === requestEpoch.current) setPending(false);
    }
  }
  const selectionAcknowledged = useRef<string | null>(null);
  const selectionKey =
    !session?.requiresActivation &&
    session?.phase === 'working' &&
    session.selection?.revision === session.revision
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
  const working = !session?.requiresActivation && session?.phase === 'working';
  const deliveryFailed = deliveryResults.some(
    (item) =>
      item.state === 'failed' &&
      session?.tasks?.some((task) => task.id === item.taskId) &&
      !session.completedReplies?.some((reply) => reply.id === item.taskId && reply.failed),
  );
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
    switchBlocked,
    retainedConversations,
    listError,
    listRetained: async () => {
      const read = ++listRead.current;
      const epoch = requestEpoch.current;
      try {
        const result = await request<{ conversations: RetainedConversation[] }>(`${path}/retained`);
        if (mounted.current && epoch === requestEpoch.current && read === listRead.current) {
          setListError('');
          setRetainedConversations(result.conversations);
        }
      } catch {
        if (mounted.current && epoch === requestEpoch.current && read === listRead.current)
          setListError('Samtalslistan kunde inte hämtas.');
      }
    },
    deleteRetained: async (id) => {
      try {
        await request(`${path}/retained/${id}/delete`, {});
      } catch (failure) {
        if (failure instanceof MapRequestError && failure.code === 'assistant_conversation_busy')
          return 'Skyttel arbetar eller talar i samtalet. Vänta tills det är klart.';
        if (!(failure instanceof MapRequestError && failure.code === 'assistant_session_expired'))
          return 'Samtalet kunde inte tas bort. Försök igen.';
      }
      if (mounted.current) removeDeletedConversation(id);
    },
    openRetained: async (id) => {
      if (switchBlocked) return false;
      const epoch = ++requestEpoch.current;
      setPending(true);
      setError('');
      try {
        const next = await request<TextAssistantView>(`${path}/retained/${id}/open`);
        if (!mounted.current || epoch !== requestEpoch.current) return false;
        setStartWithVoice(false);
        await voice.stop();
        const current = active.current;
        if (current && !current.requiresActivation && current.id !== id)
          await request(`${path}/${current.id}/pause`, {});
        if (!mounted.current || epoch !== requestEpoch.current) return false;
        replaceConversation(next);
        return true;
      } catch (failure) {
        if (epoch === requestEpoch.current) {
          if (failure instanceof MapRequestError && failure.status === 404) {
            setRetainedConversations((rows) => rows?.filter((row) => row.id !== id));
            setError('Det valda samtalet är inte längre tillgängligt.');
          } else fail(failure);
        }
        return false;
      } finally {
        if (mounted.current && epoch === requestEpoch.current) setPending(false);
      }
    },
    resumeConversation: async (requestId) => {
      if (!requestId) return resumeConversation();
      if (active.current?.interruptedRequestId !== requestId) return;
      selectedAction.current = { type: 'retry', requestId };
      setRequested('text');
    },
    transcript,
    configureModel: async (choice: ConversationModelChoice) => {
      const current = active.current;
      if (!current) return false;
      const epoch = requestEpoch.current;
      try {
        const next = await request<TextAssistantView>(`${path}/${current.id}/model-choice`, choice);
        if (epoch !== requestEpoch.current || active.current?.id !== current.id) return false;
        update(next);
        return true;
      } catch {
        return false;
      }
    },
    text,
    pending,
    error,
    deliveryError: deliveryFailed ? deliveryFailureNotice : undefined,
    unknown,
    saveChecking: Boolean(saveChecking && !saveCheckFailed),
    saveCheckFailed,
    working,
    needsAnswer: Boolean(!working && session?.questionPending),
    saveBlocked: Boolean(session?.saveBlocked ?? session?.questionPending),
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
      if (mode === 'voice' && session?.requiresActivation && !pending) {
        selectedAction.current = { type: 'voice' };
        voice.prepareAudio?.();
        setRequested(mode);
      } else if (!session && !pending) {
        if (mode === 'voice' && consentValid && available === true) voice.prepareAudio?.();
        setRequested(mode);
      }
    },
    approve,
    decline: () => {
      // The user has approved, and the save is on its way: it cannot be taken back here.
      if (savingConsent) return;
      resumeRequested.current = false;
      selectedAction.current = null;
      resetCommand.current = null;
      void voice.stop();
      setRequested(null);
      setConsentError('');
    },
    saveConsent,
    revokeConsent,
    send,
    cancel: async () => {
      const current = active.current;
      if (!current) return;
      const cancelWork = () =>
        command('cancel', {
          revision: current.revision,
          contextRevision: current.contextRevision ?? 0,
          all: true,
        });
      if (voice.state === 'listening' || voice.starting)
        await voice.silence(async () => {
          const canceled = await cancelWork();
          if (!canceled) throw new Error('Conversation cancellation could not be confirmed');
          return canceled;
        });
      else await cancelWork();
    },
    newConversation,
    endConversation: async () => {
      const current = active.current;
      if (!current || pending) return;
      const epoch = ++requestEpoch.current;
      setPending(true);
      endVoice.current();
      try {
        await request(`${path}/${current.id}/stop`, {});
        if (epoch !== requestEpoch.current) return;
        active.current = null;
        completion.current = conversationCompletion();
        setSession(null);
        hydratedReplies.current.clear();
        setTranscript([]);
        setUnknown(false);
        setTaskFailed(false);
        callbacks.current.onMapChange();
      } catch (failure) {
        if (epoch === requestEpoch.current) fail(failure);
      } finally {
        if (mounted.current && epoch === requestEpoch.current) setPending(false);
      }
    },
    recover,
    retry: async (operationId) => {
      await command('retry', { operationId });
    },
    retryWork: () => resolveWork('retry'),
    abandonWork: () => resolveWork('abandon'),
  };
}

import type { ConversationModelChoice } from '../shared/conversation-model.js';
