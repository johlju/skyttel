import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapState, SaveOperation, SaveReceipt } from '../shared/map.js';
import type { MapSelection } from '../shared/text-assistant.js';
import { MapRequestError, request } from './map-request.js';
import { initialObjectSearch } from './ObjectSearch.js';
import {
  checkOperation,
  checkSaveIdentity,
  receiptMessage,
  rejectionMessage,
  type SaveAttempt,
  type SaveProgress,
} from './SaveOperations.js';
import { type ConversationMode, useConversation } from './use-conversation.js';
import { useConversationPreferences } from './use-conversation-preferences.js';
import { usePersonalView } from './use-personal-view.js';
import { useSaveToast } from './use-save-toast.js';

function checkOperations(operations: SaveOperation[], householdId: string, current: MapState) {
  for (const operation of operations)
    checkOperation(operation, {
      operationId: operation.operationId,
      version: operation.draftVersion,
      contentVersion: current.contentVersion,
      householdId,
      userId: current.userId,
    });
}

async function readOperations(path: string, householdId: string, current: MapState) {
  const result = await request<{ operations: SaveOperation[] }>(`${path}/operations`);
  checkOperations(result.operations, householdId, current);
  return result.operations;
}

/**
 * One household work lifetime, retained above its presentation surfaces.
 * Mount once per household/user and retire on content replacement or logout.
 * Navigation hides surfaces; it does not recreate this owner or its map renderer.
 * Browsing belongs to the map presentation and can coexist with a table's own
 * search/filter state without copying the shared draft or conversation.
 */
export function useHouseholdWork(options: {
  householdId: string;
  contentVersion?: number;
  onContentReplaced?: () => void;
  onAccessLost: () => void;
  onSaved: () => void;
  onConversationStarted: (mode: ConversationMode) => void;
  onConversationEnded: () => void;
  onSelectItem: (target: MapSelection, signal: AbortSignal) => Promise<boolean>;
}) {
  const { householdId, contentVersion, onContentReplaced } = options;
  const callbacks = useRef(options);
  callbacks.current = options;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const isCurrent = useCallback(() => alive.current, []);
  const path = `/api/households/${encodeURIComponent(householdId)}/map`;
  const [state, setState] = useState<MapState | null>(null);
  const initialContentVersion = useRef<number | null>(null);
  const loadedContentVersion = state?.contentVersion;
  useEffect(() => {
    if (loadedContentVersion === undefined) return;
    initialContentVersion.current ??= loadedContentVersion;
    // The shared map can open before personal positions arrive. Either read
    // can discover a replacement, which ends this entire work lifetime.
    if (
      loadedContentVersion > initialContentVersion.current ||
      (contentVersion ?? 0) > initialContentVersion.current
    )
      onContentReplaced?.();
  }, [loadedContentVersion, contentVersion, onContentReplaced]);
  const [browsing, setBrowsing] = useState(initialObjectSearch);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selection, setSelection] = useState<{
    kind: 'object' | 'relationship';
    id: string;
    ids?: string[];
    previous?: boolean;
  } | null>(null);
  const selectedIds = useMemo(
    () => (selection?.kind === 'object' ? (selection.ids ?? [selection.id]) : []),
    [selection],
  );
  const [pending, setPending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [errorDetails, setErrorDetails] = useState<{
    message: string;
    imageObjectId?: string;
  }>({ message: '' });
  const error = errorDetails.message;
  const setError = useCallback((message: string, imageObjectId?: string) => {
    setErrorDetails({ message, imageObjectId });
  }, []);
  const [status, setStatus] = useState('');
  const saveToast = useSaveToast();
  const saveAttempt = useRef<SaveAttempt | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgress>();
  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;
  const [operations, setOperations] = useState<SaveOperation[]>([]);
  const [load, setLoad] = useState(0);
  const [mapUnfiltered, setMapUnfiltered] = useState(false);
  const [cameraFocusRequest, setCameraFocusRequest] = useState<{
    id: string;
    objectIds: string[];
  }>();
  const loseAccess = useCallback(() => {
    setSelection(null);
    setFocusId(null);
    setCameraFocusRequest(undefined);
    setBrowsing(initialObjectSearch);
    setMapUnfiltered(false);
    setState(null);
    setOperations([]);
    saveAttempt.current = null;
    setSaveProgress(undefined);
    setStatus('');
    setError('Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.');
    callbacks.current.onAccessLost();
  }, [setError]);
  const personal = usePersonalView(path, loseAccess);
  const conversationPreferences = useConversationPreferences(path);
  const confirmSave = useCallback(
    (receipt: SaveReceipt) => {
      setStatus(receiptMessage(receipt));
      saveToast.confirm(receipt.operationId);
      saveAttempt.current = null;
      setSaveProgress({ operationId: receipt.operationId, status: 'succeeded' });
      setState((previous) =>
        previous && previous.draft.version === receipt.draftVersion
          ? { ...previous, draft: { version: receipt.draftVersion + 1, changes: [] } }
          : previous,
      );
      setBlocked(false);
      // Confirmation consumes only the saved draft; unsent form text remains.
      callbacks.current.onSaved();
    },
    [saveToast.confirm],
  );
  useEffect(() => {
    let active = true;
    let confirmed = false;
    setPending(true);
    void (async () => {
      const result = await request<{ operations: SaveOperation[] }>(`${path}/operations`);
      const attempt = saveAttempt.current;
      const operation = attempt
        ? (
            await request<{ operation: SaveOperation | null }>(
              `${path}/operations/${encodeURIComponent(attempt.operationId)}`,
            )
          ).operation
        : null;
      if (!active) return;
      let recent = result.operations;
      if (attempt && operation) {
        checkOperation(operation, attempt);
        recent = [
          operation,
          ...recent.filter((item) => item.operationId !== operation.operationId),
        ];
        if (operation.status === 'succeeded') {
          setOperations(recent);
          confirmSave(operation.receipt);
          confirmed = true;
        }
      }
      // Read the map after the results: another client may have completed a
      // pending save while this client was discovering its durable receipt.
      const value = await request<MapState>(`${path}?reload=${load}`);
      if (!active) return;
      checkOperations(result.operations, householdId, value);
      let message = '';
      if (attempt) {
        if (
          attempt.contentVersion !== value.contentVersion ||
          attempt.userId !== value.userId ||
          attempt.householdId !== householdId
        ) {
          saveAttempt.current = null;
          setStatus('');
          message = rejectionMessage('content_conflict');
        } else if (operation) {
          if (operation.status === 'rejected') {
            message = rejectionMessage(operation.error);
            saveAttempt.current = null;
            setSaveProgress({ operationId: operation.operationId, status: 'rejected', message });
          }
        } else {
          message =
            'Utfallet är okänt. Inget registrerat resultat hittades. Återförsök samma sparande.';
        }
      }
      if (!attempt) {
        const tracked = recent.find(
          (item) => item.operationId === saveProgressRef.current?.operationId,
        );
        if (tracked?.status === 'succeeded' && saveProgressRef.current?.status !== 'succeeded') {
          confirmSave(tracked.receipt);
          confirmed = true;
        } else if (
          tracked?.status === 'rejected' &&
          saveProgressRef.current?.status !== 'rejected'
        ) {
          message = rejectionMessage(tracked.error);
          setSaveProgress({ operationId: tracked.operationId, status: 'rejected', message });
        }
      }
      const unresolved = recent.find((item) => item.status === 'pending');
      const waiting = Boolean(unresolved);
      if (unresolved && !attempt)
        setSaveProgress({ operationId: unresolved.operationId, status: 'unknown' });
      else if (!attempt && !saveProgressRef.current && recent[0]?.status === 'rejected')
        setSaveProgress({
          operationId: recent[0].operationId,
          status: 'rejected',
          message: rejectionMessage(recent[0].error),
        });
      setState(value);
      setOperations(recent);
      setBlocked(waiting || Boolean(saveAttempt.current));
      setError(message || (waiting ? rejectionMessage('operation_pending') : ''));
    })()
      .catch((failure) => {
        if (!active) return;
        setBlocked(true);
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) loseAccess();
        else
          setError(
            confirmed
              ? 'Ändringarna är sparade enligt kvittot, men kartan kunde inte hämtas. Hämta aktuellt underlag.'
              : 'Kartan och sparförsöken kunde inte hämtas. Försök igen.',
          );
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [path, load, householdId, loseAccess, setError, confirmSave]);

  async function save(attempt: SaveAttempt, recover = false) {
    if (!isCurrent() || !state || pending) return;
    saveAttempt.current = attempt;
    setSaveProgress({ operationId: attempt.operationId, status: recover ? 'checking' : 'pending' });
    setPending(true);
    setError('');
    setStatus('');
    let confirmed = false;
    try {
      const body = {
        operationId: attempt.operationId,
        version: attempt.version,
        contentVersion: attempt.contentVersion,
        ...(conversation.session ? { conversationId: conversation.session.id } : {}),
      };
      let operation: SaveOperation | null = null;
      if (recover) {
        const result = await request<{ operation: SaveOperation | null }>(
          `${path}/operations/${encodeURIComponent(attempt.operationId)}`,
        );
        if (!isCurrent()) return;
        operation = result.operation;
      }
      if (!operation) {
        const result = await request<{ operation: SaveOperation }>(`${path}/operations`, body);
        if (!isCurrent()) return;
        operation = result.operation;
      }
      if (!isCurrent()) return;
      checkOperation(operation, attempt);
      setOperations((previous) => [
        operation,
        ...previous.filter((item) => item.operationId !== attempt.operationId),
      ]);
      if (operation.status === 'rejected') throw new MapRequestError(409, operation.error);
      const receipt =
        operation.status === 'succeeded'
          ? operation.receipt
          : (await request<{ receipt: SaveReceipt }>(`${path}/save`, body)).receipt;
      if (!isCurrent()) return;
      checkSaveIdentity(receipt, attempt);
      setOperations((previous) =>
        previous.map((item) =>
          item.operationId === attempt.operationId
            ? { ...item, status: 'succeeded', receipt }
            : item,
        ),
      );
      confirmSave(receipt);
      confirmed = true;
      const { operations: recent } = await request<{ operations: SaveOperation[] }>(
        `${path}/operations`,
      );
      if (!isCurrent()) return;
      const latest = await request<MapState>(path);
      if (!isCurrent()) return;
      checkOperations(recent, householdId, latest);
      setState(latest);
      setOperations(recent);
      setBlocked(recent.some((item) => item.status === 'pending'));
    } catch (failure) {
      if (!isCurrent()) return;
      setBlocked(true);
      if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) {
        loseAccess();
      } else if (confirmed) {
        setError(
          'Ändringarna är sparade enligt kvittot, men kartan kunde inte hämtas. Hämta aktuellt underlag.',
        );
      } else if (failure instanceof MapRequestError && failure.status === 409) {
        // An ID mismatch does not disprove an earlier successful save.
        if (!['operation_conflict', 'client_outdated'].includes(failure.code))
          saveAttempt.current = null;
        setError(rejectionMessage(failure.code));
        setSaveProgress({
          operationId: attempt.operationId,
          status: saveAttempt.current ? 'unknown' : 'rejected',
          message: rejectionMessage(failure.code),
        });
        try {
          const recent = await readOperations(path, householdId, state);
          if (isCurrent()) setOperations(recent);
        } catch {
          // Keep the received rejection visible when the follow-up read fails.
        }
      } else {
        setSaveProgress({ operationId: attempt.operationId, status: 'unknown' });
        setError(
          'Sparandet kunde inte bekräftas. Utfallet är okänt. Försök hämta samma kvitto igen.',
        );
      }
    } finally {
      if (isCurrent()) setPending(false);
    }
  }

  const conversation = useConversation({
    householdId,
    enabled: Boolean(state),
    manualSaveOperationId: saveAttempt.current?.operationId,
    onSaveConfirmed: saveToast.confirm,
    onMapChange: () => {
      // The local save owns completion and the following map refresh.
      // A session poll must not replace its pending state with recovery.
      if (!pending || !saveAttempt.current) setLoad((value) => value + 1);
    },
    // The microphone opens no panel: the voice box follows the voice.
    onStarted: (mode) => {
      callbacks.current.onConversationStarted(mode);
    },
    onAccessLost: loseAccess,
    onEnded: () => {
      callbacks.current.onConversationEnded();
    },
    onSelectItem: (target, signal) => callbacks.current.onSelectItem(target, signal),
  });
  useEffect(() => {
    if (conversation.revocationReceipt) {
      setStatus(receiptMessage(conversation.revocationReceipt));
      saveToast.confirm(conversation.revocationReceipt.operationId);
    }
  }, [conversation.revocationReceipt, saveToast.confirm]);
  return {
    isCurrent,
    path,
    state,
    setState,
    pending,
    setPending,
    blocked,
    setBlocked,
    error,
    errorDetails,
    setError,
    status,
    setStatus,
    saveToast,
    saveAttempt,
    saveProgress,
    operations,
    setLoad,
    save,
    loseAccess,
    conversation,
    conversationPreferences,
    personal,
    browsing,
    setBrowsing,
    selection,
    setSelection,
    selectedIds,
    focusId,
    setFocusId,
    mapUnfiltered,
    setMapUnfiltered,
    cameraFocusRequest,
    setCameraFocusRequest,
  };
}
