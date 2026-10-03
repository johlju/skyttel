import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ConversationConsentView,
  conversationConsentRequired,
  conversationConsentTextVersion,
  type SavedConversationConsent,
} from '../shared/conversation-consent.js';
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
  send: () => Promise<void>;
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
  /** A requested conversation is not offered by the server, so the caller can say so. */
  onUnavailable?: () => void;
  onAccessLost: () => void;
  onSelectItem: (target: MapSelection, signal: AbortSignal) => Promise<boolean>;
}): Conversation {
  const household = `/api/households/${encodeURIComponent(householdId)}`;
  const path = `${household}/text-assistant`;
  const consentPath = `${household}/conversation-consent`;
  const [available, setAvailable] = useState<boolean | null>(null);
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
  const [transcript, setTranscript] = useState<TranscriptRow[]>([]);
  const active = useRef<TextAssistantView | null>(null);
  const showTranscript = useCallback((row: TranscriptRow) => {
    if (!active.current) return;
    setTranscript((rows) =>
      rows.some((item) => item.id === row.id)
        ? rows.map((item) => (item.id === row.id ? row : item))
        : [...rows, row],
    );
  }, []);
  const callbacks = useRef({ onMapChange, onStarted, onUnavailable, onAccessLost, onSelectItem });
  callbacks.current = { onMapChange, onStarted, onUnavailable, onAccessLost, onSelectItem };
  const mounted = useRef(true);
  const requestEpoch = useRef(0);
  const resetInProgress = useRef(false);
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
      if (
        next.modelReply &&
        (next.modelReply !== previous?.modelReply || next.revision !== previous?.revision)
      )
        showTranscript({
          id: `text-${next.id}-${next.revision}`,
          role: 'assistant',
          text: next.modelReply,
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
  }, []);
  const fail = useCallback(
    (failure: unknown) => {
      if (!mounted.current) return;
      if (failure instanceof MapRequestError && failure.code === conversationConsentRequired) {
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
        setError(
          'Svaret saknas. Kontrollera sparresultat innan du skickar något nytt. Ett genomfört sparande är inte ångrat.',
        );
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
        if (!controller.signal.aborted) setAvailable(false);
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
      setError('');
    };
  }, [path, consentPath, enabled, clear]);
  useEffect(() => {
    if (!session || unknown || pending) return;
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
  }, [session, unknown, pending, path, update, fail]);
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
        fail(failure);
        if (failure instanceof MapRequestError && failure.code === conversationConsentRequired)
          setRequested(mode);
      } finally {
        if (mounted.current && epoch === requestEpoch.current) setPending(false);
      }
    },
    [path, visitConsent, update, fail],
  );
  // A requested start waits for the server's answers about the conversation
  // and the saved consent. It then starts, or the consent box asks first.
  const answered = available !== null && savedConsent !== undefined;
  useEffect(() => {
    if (!requested || !answered) return;
    if (!available) {
      setRequested(null);
      callbacks.current.onUnavailable?.();
    } else if (consentValid) {
      setRequested(null);
      void start(requested);
    }
  }, [requested, answered, available, consentValid, start]);
  async function approve(remember: boolean) {
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
    else if (
      outcome.failure instanceof MapRequestError &&
      [401, 403].includes(outcome.failure.status)
    )
      fail(outcome.failure);
    else setConsentError('Medgivandet kunde inte sparas. Försök igen.');
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
    const outcome = await changeConsent(`${consentPath}/revoke`, {});
    if (!outcome) return false;
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
    return true;
  }
  const command = useCallback(
    async (name: string, body: unknown = {}) => {
      const current = active.current;
      if (!current) return;
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
  async function send() {
    const current = session;
    if (!current || !text.trim()) return;
    const epoch = ++requestEpoch.current;
    const sent = text;
    showTranscript({ id: crypto.randomUUID(), role: 'user', text: sent });
    setPending(true);
    setError('');
    try {
      const result = await request<TextAssistantView>(`${path}/${current.id}/messages`, {
        revision: current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
        requestId: crypto.randomUUID(),
        text: sent,
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
  async function newConversation() {
    const current = active.current;
    if (!current || resetInProgress.current) return;
    // A reset may interrupt a pending message, but a second reset must not
    // replace the first one's retained microphone while the server answers.
    resetInProgress.current = true;
    const epoch = ++requestEpoch.current;
    setPending(true);
    setError('');
    try {
      const result = await voice.newConversation(() =>
        request<TextAssistantView>(`${path}/${current.id}/new`, {}),
      );
      if (epoch !== requestEpoch.current) return;
      setUnknown(false);
      update(result);
      // The conversation text starts over with what Skyttel says about the draft.
      setTranscript(
        result.reply
          ? [{ id: `new-${result.id}-${result.revision}`, role: 'assistant', text: result.reply }]
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
  const voice = useVoice({
    householdId,
    assistant: session,
    autoStart: startWithVoice,
    onAssistant: updateFromVoice,
    // A refusal for a revoked consent ends the conversation, not the access.
    onAccessLost: fail,
    onTranscript: showTranscript,
    onRecoveryNeeded: () => setUnknown(true),
  });
  const working = session?.phase === 'working';
  return {
    available,
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
    working,
    needsAnswer: Boolean(
      session &&
        !working &&
        (session.questions?.length ||
          session.review.unresolvedIdentities.length ||
          session.review.conflicts.length),
    ),
    voice,
    setText,
    begin: (mode) => {
      if (!session && !pending) setRequested(mode);
    },
    approve,
    decline: () => {
      // The user has approved, and the save is on its way: it cannot be taken back here.
      if (savingConsent) return;
      setRequested(null);
      setConsentError('');
    },
    saveConsent,
    revokeConsent,
    send,
    cancel: () => command('cancel', { revision: session?.revision }),
    newConversation,
    recover: () => command('recover'),
    retry: (operationId) => command('retry', { operationId }),
  };
}
