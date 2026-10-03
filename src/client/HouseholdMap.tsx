import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type DraftConflict,
  draftConflicts,
  resolvedRelationshipType,
} from '../shared/draft-conflicts.js';
import type {
  MapDraft,
  MapObject,
  MapRelationship,
  MapState,
  ObjectType,
  ObjectValue,
  RelationshipType,
  RelationshipValue,
  SaveOperation,
  SaveReceipt,
} from '../shared/map.js';
import {
  proposedObjectTypes,
  proposedRelationships,
  proposedRelationshipTypes,
} from '../shared/map.js';
import { mergeFor } from '../shared/object-merge.js';
import type { MapSelection } from '../shared/text-assistant.js';
import { buildHeader, notifyOutdatedClient } from './build-guard.js';
import { DraftStatus } from './DraftStatus.js';
import './draft-status.css';
import { ConversationConsent } from './ConversationConsent.js';
import {
  ConversationNoticeAnnouncements,
  ConversationNoticeCard,
  useConversationNotice,
} from './ConversationNotice.js';
import { ConversationSettings } from './ConversationSettings.js';
import { LifecycleDetails, LifecycleStatus } from './Lifecycle.js';
import { MapHistory } from './MapHistory.js';
import { type MapRevealRequest, waitForMapDisplay } from './map-display.js';
import { MapRequestError, request } from './map-request.js';
import { initialObjectBrowsing, ObjectList, objectListResults } from './ObjectList.js';
import { MergeSourceDetails, ObjectMerge } from './ObjectMerge.js';
import { ObjectPropertiesDetails } from './ObjectProperties.js';
import { ObjectRemovalNotice } from './ObjectRemovalNotice.js';
import { CustomFieldsDetails, ObjectTypeDetails, ObjectTypeEditor } from './ObjectTypes.js';
import { type ObjectEditor, ObjectWork } from './ObjectWork.js';
import { PagedList } from './PagedList.js';
import { ProfileImage } from './ProfileImage.js';
import { RelationshipEditor, relationshipLabel } from './RelationshipEditor.js';
import { RelationshipTypeDetails, RelationshipTypeEditor } from './RelationshipTypes.js';
import {
  checkOperation,
  checkSaveIdentity,
  receiptMessage,
  rejectionMessage,
  type SaveAttempt,
  SaveOperations,
} from './SaveOperations.js';
import { ProposalSymbol, SpatialMap } from './SpatialMap.js';
import { ConversationWorkspace } from './TextAssistant.js';
import { VoiceBox } from './VoiceBox.js';
import { WelcomeGuidance } from './WelcomeGuidance.js';
import { type PanelAnchor, type PanelFocusRequest, WorkspacePanels } from './WorkspacePanels.js';
import {
  textViewButtonName,
  WorkspaceIcon,
  type WorkspaceTarget,
  WorkspaceTools,
} from './WorkspaceTools.js';
import './workspace.css';
import './workspace-panels.css';
import './text-view.css';
import { type ConversationMode, conversationOngoing, useConversation } from './use-conversation.js';
import { useConversationPreferences } from './use-conversation-preferences.js';
import { useConversationViewport } from './use-conversation-viewport.js';
import { usePersonalView } from './use-personal-view.js';
import { useTextButtonStatus } from './use-text-button-status.js';
import { useWorkspaceTheme, WorkspaceTheme } from './WorkspaceTheme.js';

function draftEntryId(kind: DraftConflict['kind'], id: string) {
  return `draft-entry-${kind}-${id}`;
}

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

export function HouseholdMap({
  householdId,
  active = true,
  contentVersion,
  onContentReplaced,
  householdName = 'Hushållets karta',
  account,
  profileRequested,
  onSettings,
  onReturnToMap,
  typeSettingsTarget,
  mapSettingsTarget,
  conversationSettingsTarget,
}: {
  householdId: string;
  active?: boolean;
  contentVersion?: number;
  onContentReplaced?: () => void;
  householdName?: string;
  account?: ReactNode;
  profileRequested?: boolean;
  onSettings?: (section?: 'types') => void;
  onReturnToMap?: () => void;
  typeSettingsTarget?: HTMLElement | null;
  mapSettingsTarget?: HTMLElement | null;
  conversationSettingsTarget?: HTMLElement | null;
}) {
  const theme = useWorkspaceTheme();
  const [typeHost] = useState(() => document.createElement('div'));
  const typeSlot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const target = typeSettingsTarget ?? typeSlot.current;
    if (target && typeHost.parentElement !== target) target.append(typeHost);
  });
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
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeGeneration, setMergeGeneration] = useState(1);
  const [objectPanels, setObjectPanels] = useState<
    {
      id: string;
      title: string;
      initial: ObjectEditor;
      editing: number;
      newObject: boolean;
      unsentName: string;
      anchor?: PanelAnchor;
    }[]
  >([]);
  const [objectDirty, setObjectDirty] = useState<Record<string, boolean>>({});
  const [openPanels, setOpenPanels] = useState<string[]>([]);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [panelFocusRequest, setPanelFocusRequest] = useState<PanelFocusRequest | null>(null);
  function openPanel(id: string, element?: HTMLElement | null) {
    setOpenPanels((previous) => (previous.includes(id) ? previous : [...previous, id]));
    setActivePanel(id);
    setPanelFocusRequest({ id, element });
    setPresentation('combined');
    setRevealRequest(undefined);
    // On a narrow screen the text view would cover the panel.
    if (narrow) setTextViewOpen(false);
  }
  function focusTools() {
    workspace.current
      ?.querySelector<HTMLButtonElement>('.workspace-tools button[aria-label="Lista"]')
      ?.focus();
  }
  function closePanel(id: string) {
    setOpenPanels((previous) => previous.filter((entry) => entry !== id));
  }

  const [edgeEditor, setEdgeEditor] = useState<{
    id: string;
    version: number;
    contentVersion: number;
    baseRevision: number | null;
    value: RelationshipValue;
  } | null>(null);
  const [typeEditor, setTypeEditor] = useState<{
    type: ObjectType;
    version: number;
    contentVersion: number;
    baseRevision: number | null;
  } | null>(null);
  const [edgeTypeEditor, setEdgeTypeEditor] = useState<{
    type: RelationshipType;
    version: number;
    contentVersion: number;
    baseRevision: number | null;
  } | null>(null);
  const [presentation, setPresentation] = useState<'list' | 'combined' | 'map'>('map');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const editorDialog = useRef<HTMLDialogElement>(null);
  const editMapButton = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const resumeListFocus = useRef<() => boolean>(() => false);
  const lastWorkFocus = useRef<HTMLElement | null>(null);
  const lastOutsideFocus = useRef<HTMLElement | string | null>(null);
  const routeOutsideFocus = useRef<HTMLElement | string | null>(null);
  const previousActive = useRef(active);
  function restoreOutsideFocus(target: HTMLElement | string | null) {
    const element =
      typeof target === 'string'
        ? [
            ...(workspace.current?.querySelectorAll<HTMLButtonElement>('.workspace-tools button') ??
              []),
          ].find((button) =>
            target === textViewButtonName
              ? button.classList.contains('workspace-text')
              : button.getAttribute('aria-label') === target,
          )
        : target;
    if (!element?.isConnected || !element.offsetHeight || element.closest('[hidden], [inert]'))
      return false;
    element.focus();
    return true;
  }
  useLayoutEffect(() => {
    if (!active) routeOutsideFocus.current = lastOutsideFocus.current;
  }, [active]);
  useEffect(() => {
    const returning = active && !previousActive.current;
    previousActive.current = active;
    if (returning && !profileRequested) restoreOutsideFocus(routeOutsideFocus.current);
  });
  const [revealRequest, setRevealRequest] = useState<MapRevealRequest>();
  const [mapAvailable, setMapAvailable] = useState(true);
  const [mapUnfiltered, setMapUnfiltered] = useState(false);
  const [cameraFocusRequest, setCameraFocusRequest] = useState<{
    id: string;
    objectIds: string[];
  }>();
  const [cameraMount, setCameraMount] = useState<HTMLDivElement | null>(null);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationMount, setNavigationMount] = useState<HTMLDivElement | null>(null);
  const revealAbort = useRef<AbortController | null>(null);
  useEffect(() => () => revealAbort.current?.abort(), []);
  const listModeButton = useRef<HTMLButtonElement>(null);
  const workTrigger = useRef<HTMLElement | null>(null);
  const [guidance, setGuidance] = useState(true);
  const [textViewOpen, setTextViewOpen] = useState(false);
  const workOpen = openPanels.length > 0 && (presentation !== 'map' || detailsOpen || editorOpen);
  const viewport = useConversationViewport();
  const { narrow } = viewport;
  // On a narrow screen the text view fills the screen under the toolbar. The
  // panels wait behind it, unchanged.
  const panelsCovered = narrow && textViewOpen;
  const mapCovered = narrow && (workOpen || textViewOpen) && !revealRequest && !navigationOpen;
  useLayoutEffect(() => {
    // Panel focus can scroll the ordinary work flow before navigation closes.
    // Reset only when the requested reveal layout has actually been committed.
    if (revealRequest && !navigationOpen && workspace.current) workspace.current.scrollTop = 0;
  }, [revealRequest, navigationOpen]);
  // The button that the user chose to start a conversation with. The consent
  // box opens next to it and gives the focus back to it.
  const conversationChoice = useRef<HTMLElement | null>(null);
  /** How a target starts a conversation that is not yet going on. Null when it starts none. */
  function conversationStart(target: WorkspaceTarget): ConversationMode | null {
    if (conversation.session) return null;
    return target === 'voice' ? 'voice' : target === 'conversation' ? 'text' : null;
  }
  function openWork(target: WorkspaceTarget, chosen?: HTMLElement) {
    workTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (
      (target === 'voice' || target === 'conversation') &&
      conversation.inputBlocked &&
      (target === 'voice' || !ongoing)
    ) {
      conversation.showNotice?.();
      return;
    }
    const start = conversationStart(target);
    if (start) {
      // The conversation starts first, after the consent box when no consent
      // is valid. The text view opens when the conversation has started.
      conversationChoice.current = chosen ?? workTrigger.current;
      conversation.begin(start);
      return;
    }
    if (target === 'voice' && conversation.session) {
      // The microphone opens no panel. The voice box shows what it does.
      conversation.voice.activate();
      return;
    }
    if (target === 'conversation') {
      // The text button opens and closes the text view.
      if (textViewOpen) closeTextView();
      else showConversation();
      return;
    }
    openPanel(
      'work',
      target === 'search'
        ? workspace.current?.querySelector<HTMLInputElement>('.object-browser input[type="search"]')
        : undefined,
    );
  }
  // Closing the text view ends nothing: the conversation, the microphone and
  // the unsent text stay.
  function closeTextView() {
    setTextViewOpen(false);
    if (!restoreOutsideFocus(textViewButtonName)) focusTools();
  }
  function openGuidedWork(target: WorkspaceTarget, chosen: HTMLElement) {
    // The guidance stays while a conversation waits for its start, so that
    // the consent box can give the focus back to the chosen button.
    if (!conversationStart(target)) setGuidance(false);
    openWork(target, chosen);
  }
  function dismissGuidance() {
    setGuidance(false);
    workspace.current?.querySelector<HTMLButtonElement>('.workspace-tools button')?.focus();
    if (workspace.current) workspace.current.scrollTop = 0;
  }
  function closeWork() {
    setPresentation('map');
    setRevealRequest(undefined);
    setDetailsOpen(false);
    setEditorOpen(false);
    const trigger = workTrigger.current;
    if (trigger?.isConnected && trigger.offsetWidth && trigger.offsetHeight) trigger.focus();
    else
      workspace.current
        ?.querySelector<HTMLButtonElement>('.workspace-tools button[aria-label="Lista"]')
        ?.focus();
  }
  const [legacyDirty, setDirty] = useState(false);
  const dirty = legacyDirty || Object.values(objectDirty).some(Boolean);
  const [browsing, setBrowsing] = useState(initialObjectBrowsing);
  const { query, types: typeFilter, onlySelected, sort } = browsing;
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
  const [conflictLinksOpen, setConflictLinksOpen] = useState(false);
  function returnFromStatus() {
    routeOutsideFocus.current = null;
    if (!active) onReturnToMap?.();
  }
  const failedProposalOrigin = useRef<HTMLElement | null>(null);
  const [proposalRecoveryFocus, setProposalRecoveryFocus] = useState<{
    origin: Element | null;
    target: HTMLElement | null;
  } | null>(null);
  useLayoutEffect(() => {
    if (!proposalRecoveryFocus || pending) return;
    setProposalRecoveryFocus(null);
    if (!error) failedProposalOrigin.current = null;
    if (
      !active ||
      !state ||
      (document.activeElement !== proposalRecoveryFocus.origin &&
        document.activeElement !== document.body)
    )
      return;
    const target = error
      ? workspace.current?.querySelector<HTMLButtonElement>('[data-refresh-map]')
      : proposalRecoveryFocus.target;
    if (target && !target.matches(':disabled') && restoreOutsideFocus(target)) return;
    restoreOutsideFocus(
      workspace.current?.querySelector<HTMLElement>('.workspace-window[data-active="true"] h2') ??
        null,
    );
  });
  const hasMap = state !== null;
  useLayoutEffect(() => {
    const measure = () => {
      workspace.current?.style.setProperty('--work-height', `${viewport.height}px`);
      workspace.current?.style.setProperty('--work-offset', `${viewport.offset}px`);
      for (const [selector, property] of [
        ['.workspace-feedback', '--feedback-height'],
        ['.spatial-bottom-bar', '--display-height'],
      ]) {
        const element = workspace.current?.querySelector<HTMLElement>(selector);
        workspace.current?.style.setProperty(property, `${element?.offsetHeight ?? 0}px`);
      }
      // On a narrow screen the text view starts under the toolbar, whose
      // buttons can stand in two rows. Its expanded names lie over the view.
      const toolbar = workspace.current?.querySelector<HTMLElement>('.workspace-tools');
      if (toolbar) {
        const bounds = toolbar.getBoundingClientRect();
        workspace.current?.style.setProperty('--tools-right', `${bounds.right}px`);
        workspace.current?.style.setProperty(
          '--tools-bottom',
          `${bounds.bottom - viewport.offset}px`,
        );
      }
      const tools = workspace.current?.querySelector<HTMLElement>(
        '.workspace-tools:not(.expanded)',
      );
      if (tools) workspace.current?.style.setProperty('--tools-height', `${tools.offsetHeight}px`);
      const composer = workspace.current?.querySelector('.text-view-message');
      const inlineNotice = workspace.current?.querySelector(
        '.text-view-conversation > .conversation-notice',
      );
      if (composer)
        workspace.current?.style.setProperty(
          '--composer-top',
          `${(inlineNotice ?? composer).getBoundingClientRect().top - 4}px`,
        );
      const floor = Math.min(
        viewport.height + viewport.offset - 12,
        ...['.spatial-bottom-bar', '.workspace-feedback', '.workspace-voice-controls']
          .map((selector) => workspace.current?.querySelector<HTMLElement>(selector))
          .filter((element): element is HTMLElement => Boolean(element?.offsetHeight))
          .map((element) => element.getBoundingClientRect().top),
      );
      workspace.current?.style.setProperty('--conversation-floor', `${floor - 8}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    // The toolbar is shown only while the map is the active view.
    const measured = [
      '.workspace-feedback',
      hasMap && '.spatial-bottom-bar',
      active && '.workspace-tools',
      hasMap && '.workspace-voice-controls',
      textViewOpen && '.text-view-message',
      textViewOpen && '.text-view',
      textViewOpen && '.text-view-body',
      textViewOpen && '.text-view-conversation > .conversation-notice',
    ]
      .filter(Boolean)
      .join(', ');
    for (const element of workspace.current?.querySelectorAll(measured) ?? [])
      observer.observe(element);
    // Insertion/removal or a flow-class change can move a footer without
    // changing its size (for example after the first object is saved).
    const layout = new MutationObserver(measure);
    if (workspace.current)
      layout.observe(workspace.current, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'hidden'],
      });
    return () => {
      observer.disconnect();
      layout.disconnect();
    };
  }, [hasMap, active, textViewOpen, viewport.height, viewport.offset]);
  useEffect(() => {
    if (!state && error) workspace.current?.focus();
  }, [state, error]);
  const saveAttempt = useRef<SaveAttempt | null>(null);
  const [operations, setOperations] = useState<SaveOperation[]>([]);
  useLayoutEffect(() => {
    if (active && editorOpen && hasMap) {
      editorDialog.current?.querySelector<HTMLSelectElement>('#relationship-source')?.focus();
    }
  }, [active, editorOpen, hasMap]);
  useEffect(() => {
    if (!active || !(workOpen || textViewOpen)) return;
    workspace.current?.style.setProperty('--work-height', `${viewport.height}px`);
    workspace.current?.style.setProperty('--work-offset', `${viewport.offset}px`);
    const frame = requestAnimationFrame(() => {
      const field = document.activeElement;
      const workSurface = workspace.current?.querySelector('.assistant-workspace');
      if (field instanceof HTMLElement && workSurface?.contains(field)) {
        field.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [active, workOpen, textViewOpen, viewport.height, viewport.offset]);
  const newButton = useRef<HTMLButtonElement>(null);
  const mergeButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (mergeOpen)
      setPanelFocusRequest({ id: 'work', element: document.getElementById('merge-title') });
  }, [mergeOpen]);
  const [load, setLoad] = useState(0);

  const loseAccess = useCallback(() => {
    revealAbort.current?.abort();
    setPresentation('list');
    setDetailsOpen(false);
    setEditorOpen(false);
    setSelection(null);
    setFocusId(null);
    setCameraFocusRequest(undefined);
    setBrowsing(initialObjectBrowsing);
    setMapUnfiltered(false);
    setState(null);
    setObjectPanels([]);
    setObjectDirty({});
    setOpenPanels([]);
    setMergeOpen(false);
    setOperations([]);

    setEdgeEditor(null);
    setTypeEditor(null);
    setEdgeTypeEditor(null);
    setDirty(false);
    saveAttempt.current = null;
    setStatus('');
    setError('Du har inte längre tillgång. Logga in och kontrollera din tillgång till hushållet.');
  }, [setError]);
  const personal = usePersonalView(path, loseAccess);
  const conversationPreferences = useConversationPreferences(path);

  useEffect(() => {
    let active = true;
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
      // Read the map after the results: another client may have completed a
      // pending save while this client was discovering its durable receipt.
      const value = await request<MapState>(`${path}?reload=${load}`);
      if (!active) return;
      checkOperations(result.operations, householdId, value);
      let recent = result.operations;
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
          checkOperation(operation, attempt);
          recent = [
            operation,
            ...recent.filter((item) => item.operationId !== operation.operationId),
          ];
          if (operation.status === 'succeeded') {
            setStatus(receiptMessage(operation.receipt));
            saveAttempt.current = null;
          } else if (operation.status === 'rejected') {
            message = rejectionMessage(operation.error);
            saveAttempt.current = null;
          }
        } else {
          message =
            'Utfallet är okänt. Inget registrerat resultat hittades. Återförsök samma sparande.';
        }
      }
      const waiting = recent.some((item) => item.status === 'pending');
      setState(value);
      setOperations(recent);
      setBlocked(waiting || Boolean(saveAttempt.current));
      setError(message || (waiting ? rejectionMessage('operation_pending') : ''));
    })()
      .catch((failure) => {
        if (!active) return;
        setBlocked(true);
        if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) loseAccess();
        else setError('Kartan och sparförsöken kunde inte hämtas. Försök igen.');
      })
      .finally(() => {
        if (active) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [path, load, householdId, loseAccess, setError]);

  useEffect(() => {
    if (!active) return;
    if (edgeEditor?.id)
      editorDialog.current?.querySelector<HTMLSelectElement>('#relationship-source')?.focus();
  }, [edgeEditor?.id, active]);

  function reloadMap(origin: HTMLElement) {
    if (failedProposalOrigin.current) {
      setProposalRecoveryFocus({ origin, target: failedProposalOrigin.current });
      setPending(true);
    }
    setLoad((value) => value + 1);
  }

  function retrySave(operation: SaveOperation) {
    void save(
      {
        operationId: operation.operationId,
        version: operation.draftVersion,
        contentVersion: operation.contentVersion,
        householdId: operation.householdId,
        userId: operation.userId,
      },
      true,
    );
  }

  function saveDraft() {
    if (!state) return;
    void save({
      version: state.draft.version,
      operationId: crypto.randomUUID(),
      contentVersion: state.contentVersion,
      userId: state.userId,
      householdId,
    });
  }

  async function save(attempt: SaveAttempt, recover = false) {
    if (!state || pending) return;
    const saveOrigin = document.activeElement;
    saveAttempt.current = attempt;
    setPending(true);
    setError('');
    setStatus('');
    let confirmed = false;
    try {
      const body = {
        operationId: attempt.operationId,
        version: attempt.version,
        contentVersion: attempt.contentVersion,
      };
      let operation: SaveOperation | null = null;
      if (recover) {
        const result = await request<{ operation: SaveOperation | null }>(
          `${path}/operations/${encodeURIComponent(attempt.operationId)}`,
        );
        operation = result.operation;
      }
      if (!operation) {
        const result = await request<{ operation: SaveOperation }>(`${path}/operations`, body);
        operation = result.operation;
      }
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
      checkSaveIdentity(receipt, attempt);
      setStatus(receiptMessage(receipt));
      setOperations((previous) =>
        previous.map((item) =>
          item.operationId === attempt.operationId
            ? { ...item, status: 'succeeded', receipt }
            : item,
        ),
      );
      saveAttempt.current = null;
      confirmed = true;
      // Recovery can happen while an older form has unsent text. Keep that text
      // and let its draft-version check prevent it from overwriting newer work.
      if (!dirty) {
        setEdgeEditor(null);
        setTypeEditor(null);
        setEdgeTypeEditor(null);
      }
      const { operations: recent } = await request<{ operations: SaveOperation[] }>(
        `${path}/operations`,
      );
      const latest = await request<MapState>(path);
      checkOperations(recent, householdId, latest);
      setState(latest);
      setOperations(recent);
      setBlocked(recent.some((item) => item.status === 'pending'));
      if (!dirty && document.activeElement === saveOrigin) newButton.current?.focus();
    } catch (failure) {
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
        try {
          setOperations(await readOperations(path, householdId, state));
        } catch {
          // Keep the received rejection visible when the follow-up read fails.
        }
      } else {
        setError(
          'Sparandet kunde inte bekräftas. Utfallet är okänt. Försök hämta samma kvitto igen.',
        );
      }
    } finally {
      setPending(false);
    }
  }

  async function changeImage(editor: ObjectEditor, file: File | null) {
    if (!state || pending || blocked) return;
    setPending(true);
    setStatus('');
    setError('');
    try {
      const response = await fetch(
        `/api/households/${encodeURIComponent(householdId)}/profile-images/${encodeURIComponent(editor.id)}`,
        {
          method: file ? 'POST' : 'DELETE',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Skyttel-Build': buildHeader,
            'X-Skyttel-Draft-Version': String(editor.version),
            'X-Skyttel-Content-Version': String(editor.contentVersion),
            'X-Skyttel-Object-Revision': String(editor.baseRevision),
          },
          body: file,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        notifyOutdatedClient(result.error);
        throw new MapRequestError(response.status, result.error);
      }
      const draft = result as MapDraft;
      const value = draft.changes.find((change) => change.id === editor.id)?.after;
      if (!value) throw new Error('invalid_image_result');
      setState({ ...state, draft });

      setStatus('Bildförslaget finns i ditt privata utkast. Kartan är inte ändrad.');
      return { ...editor, value, version: draft.version };
    } catch (failure) {
      if (failure instanceof MapRequestError && [401, 403].includes(failure.status)) loseAccess();
      else if (failure instanceof MapRequestError && failure.status === 413)
        setError(
          'Bilden är för stor. Välj en bild på högst 10 MB. Dina förslag är kvar.',
          editor.id,
        );
      else if (
        failure instanceof MapRequestError &&
        ['invalid_image', 'image_processing_failed', 'image_size'].includes(failure.code)
      )
        setError(
          'Bilden kunde inte behandlas. Välj en hel JPEG-, PNG- eller WebP-bild inom gränserna. Dina förslag är kvar.',
          editor.id,
        );
      else {
        setBlocked(true);
        setError(
          'Bildändringen kunde inte bekräftas. Hämta aktuellt underlag innan du försöker igen.',
          editor.id,
        );
      }
    } finally {
      setPending(false);
    }
  }

  async function action(
    kind:
      | 'merge'
      | 'draft'
      | 'relationship'
      | 'object-type'
      | 'relationship-type'
      | 'discard'
      | 'resolve'
      | 'undo'
      | 'discard-change',
    body: unknown,
    retainObject?: (draft: MapDraft) => void,
  ) {
    if (!state || pending || blocked) return false;
    const submittedFocus = document.activeElement;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const draft = await request<MapDraft & { existingId?: string }>(`${path}/${kind}`, {
        contentVersion: state.contentVersion,
        ...(body as Record<string, unknown>),
      });
      if (draft.existingId) {
        const latest = await request<MapState>(path);
        setState(latest);
        const edge = proposedRelationships(latest.relationships, latest.draft.relationships).get(
          draft.existingId,
        );
        const objects = new Map(latest.objects.map((object) => [object.id, object]));
        for (const change of latest.draft.changes) {
          if (change.after)
            objects.set(change.id, {
              ...change.after,
              id: change.id,
              householdId,
              revision: change.before?.revision ?? 0,
            });
        }
        setStatus(
          edge
            ? `Sambandet finns redan: ${relationshipLabel(edge, { ...latest, relationshipTypes: proposedRelationshipTypes(latest.relationshipTypes, latest.draft.relationshipTypes) }, objects)}. Ingen dubblett skapades.`
            : 'Det befintliga sambandet har ändrats. Granska aktuellt underlag.',
        );
      } else {
        setState(kind === 'undo' ? await request<MapState>(path) : { ...state, draft });
        setStatus(
          kind === 'resolve'
            ? 'Konfliktvalet finns i ditt privata utkast. Granska hela utkastet och ge ett nytt sparbesked.'
            : kind === 'discard'
              ? 'Utkastet är kastat. Kartan är inte ändrad.'
              : 'Förslaget finns i ditt privata utkast. Kartan är inte ändrad.',
        );
      }
      failedProposalOrigin.current = null;
      if (retainObject) retainObject(draft);
      else {
        setMergeOpen(false);

        setEdgeEditor(null);
        setTypeEditor(null);
        setEdgeTypeEditor(null);
        setDirty(false);
        setBlocked(false);
        if (document.activeElement === submittedFocus || document.activeElement === document.body) {
          if (kind === 'undo' || kind === 'resolve' || kind === 'merge')
            openPanel('work', document.getElementById('draft-title'));
          else newButton.current?.focus();
        }
      }
      return true;
    } catch (failure) {
      if (retainObject && submittedFocus instanceof HTMLElement) {
        failedProposalOrigin.current = submittedFocus;
        setProposalRecoveryFocus({ origin: submittedFocus, target: null });
      }
      if (
        failure instanceof MapRequestError &&
        [
          'merge_choices_required',
          'merge_review_required',
          'merge_conflict',
          'duplicate_relationship',
          'invalid_custom_value',
          'invalid_type_definition',
          'invalid_relationship_type',
          'field_kind_in_use',
          'undo_draft_overlap',
          'undo_unavailable',
          'definition_in_use',
          'field_in_use',
        ].includes(failure.code)
      ) {
        setError(rejectionMessage(failure.code));
        if (
          kind === 'undo' &&
          submittedFocus instanceof HTMLElement &&
          (document.activeElement === submittedFocus || document.activeElement === document.body)
        )
          openPanel('work', submittedFocus);
        return false;
      }
      setBlocked(true);
      if (
        failure instanceof MapRequestError &&
        (failure.status === 401 || failure.status === 403)
      ) {
        loseAccess();
      } else if (failure instanceof MapRequestError && failure.status === 409) {
        saveAttempt.current = null;
        setError(rejectionMessage(failure.code));
      } else {
        setError('Ändringen kunde inte bekräftas. Hämta aktuellt underlag innan du fortsätter.');
      }
    } finally {
      setPending(false);
    }
    return false;
  }

  const effectiveTypes = useMemo(
    () => proposedObjectTypes(state?.types ?? [], state?.draft.objectTypes),
    [state],
  );
  const effectiveEdgeTypes = proposedRelationshipTypes(
    state?.relationshipTypes ?? [],
    state?.draft.relationshipTypes,
  );
  const effectiveState = state
    ? { ...state, types: effectiveTypes, relationshipTypes: effectiveEdgeTypes }
    : null;
  const conflicts = state ? draftConflicts(state) : [];
  const hasConflicts = conflicts.length > 0;
  useEffect(() => {
    if (!hasConflicts) setConflictLinksOpen(false);
  }, [hasConflicts]);
  function conflictReview(conflict: DraftConflict) {
    if (conflict.kind === 'objectType' || conflict.kind === 'relationshipType') return null;
    const proposal = (
      conflict.kind === 'object' ? state?.draft.changes : state?.draft.relationships
    )?.find((change) => change.id === conflict.id);
    const deleted = Boolean(proposal?.before && !conflict.current);
    const editableObject =
      conflict.kind === 'object' &&
      !deleted &&
      state &&
      !mergeFor(state.draft, 'object', conflict.id)
        ? displayed.get(conflict.id)
        : undefined;
    const editableRelationship =
      conflict.kind === 'relationship' &&
      !deleted &&
      state &&
      !mergeFor(state.draft, 'relationship', conflict.id)
        ? displayedEdges.get(conflict.id)
        : undefined;
    return (
      <div className="conflict-review">
        <h4>Konflikt: sparat i kartan nu</h4>
        {conflict.kind === 'object' ? (
          details(
            conflict.current,
            state?.types.find((type) => type.id === conflict.current?.typeId),
          )
        ) : (
          <p>
            {conflict.current && state
              ? relationshipLabel(conflict.current, state, savedObjects)
              : 'Finns inte i kartan'}
          </p>
        )}
        {conflict.kind === 'relationship' && conflict.current && (
          <>
            <CustomFieldsDetails
              type={state?.relationshipTypes.find((type) => type.id === conflict.current?.typeId)}
              values={conflict.current.customValues}
              showHidden
            />
            <LifecycleDetails value={conflict.current} />
          </>
        )}
        <p>Välj vilket värde du vill behålla. Valet ändrar bara ditt utkast.</p>
        {editableObject && (
          <button
            type="button"
            disabled={pending || blocked || legacyDirty}
            onClick={() => edit(editableObject)}
          >
            Rätta objektet
          </button>
        )}
        {editableRelationship && (
          <button
            type="button"
            disabled={pending || blocked || legacyDirty}
            onClick={() => editRelationship(editableRelationship)}
          >
            Rätta sambandet
          </button>
        )}
        {conflict.type !== undefined && (
          <p>
            Typdefinitionen har ändrats:{' '}
            {conflict.type
              ? `${conflict.type.name}. ${conflict.type.description}`
              : 'Typen finns inte längre.'}
          </p>
        )}
        {conflict.missingEndpoints && (
          <p>
            Sambandet hänvisar till ett borttaget objekt. Ta bort förslaget eller öppna sambandet
            och välj ett annat objekt.
          </p>
        )}
        {conflict.duplicates && state && (
          <>
            <p>
              Samma samband finns redan. Använd sparat värde för att ta bort ditt överlappande
              förslag.
            </p>
            <ul>
              {conflict.duplicates.map((edge) => (
                <li key={edge.id}>{relationshipLabel(edge, effectiveState ?? state, displayed)}</li>
              ))}
            </ul>
          </>
        )}
        {conflict.connections && state && (
          <>
            <p>
              Borttagningen berör också dessa samband. Behåll förslaget för att lägga deras
              borttagningar i utkastet.
            </p>
            <ul>
              {conflict.connections.map((edge) => (
                <li key={edge.id}>{relationshipLabel(edge, state, savedObjects)}</li>
              ))}
            </ul>
          </>
        )}
        <button
          type="button"
          disabled={pending || blocked || dirty}
          onClick={() =>
            void action('resolve', { version: state?.draft.version, conflict, choice: 'saved' })
          }
        >
          Använd sparat värde
        </button>
        {conflict.type !== null &&
          !conflict.duplicates &&
          !conflict.missingEndpoints &&
          (!deleted || proposal?.undo) && (
            <button
              type="button"
              disabled={pending || blocked || dirty}
              onClick={() =>
                void action('resolve', {
                  version: state?.draft.version,
                  conflict,
                  choice: 'proposed',
                })
              }
            >
              Behåll mitt förslag
            </button>
          )}
        {deleted && (
          <p>
            {proposal?.undo
              ? 'Objektet eller sambandet är borttaget. Behåll förslaget för att återställa det i ditt utkast.'
              : 'Objektet eller sambandet är borttaget. Skapa ett nytt förslag om det fortfarande behövs.'}
          </p>
        )}
      </div>
    );
  }

  function objectEditor(object?: MapObject): ObjectEditor {
    if (!state) throw new Error('map_not_loaded');
    const proposal = state?.draft.changes.find((change) => change.id === object?.id);
    return {
      typeRevision:
        effectiveTypes.find(
          (type) =>
            type.id === (proposal?.after?.typeId ?? object?.typeId ?? effectiveTypes[0]?.id),
        )?.revision ?? 0,
      id: object?.id ?? crypto.randomUUID(),
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : (object?.revision ?? null),
      value: proposal?.after ??
        object ?? { typeId: effectiveTypes[0]?.id ?? '', name: '', description: '' },
    };
  }
  function edit(object?: MapObject, editing = true) {
    if (!state) return;
    const initial = objectEditor(object);
    const id = initial.id;
    const node =
      !narrow && object
        ? [...(workspace.current?.querySelectorAll<HTMLElement>('.spatial-node') ?? [])].find(
            (node) => node.dataset.objectId === object.id,
          )
        : undefined;
    const bounds = node?.getBoundingClientRect();
    const anchor = bounds?.width
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      : undefined;
    setObjectPanels((previous) =>
      previous.some((panel) => panel.id === id)
        ? previous.map((panel) =>
            panel.id === id ? { ...panel, editing: panel.editing + (editing ? 1 : 0) } : panel,
          )
        : [
            ...previous,
            {
              id,
              initial,
              title: object?.name ?? 'Nytt objekt',
              editing: editing ? 1 : 0,
              newObject: !object,
              unsentName: '',
              anchor,
            },
          ],
    );
    if (object) selectObject(object, 'include');
    openPanel(id);
  }
  const {
    displayed,
    displayedEdges,
    visibleObjects,
    visibleEdges,
    listObjects,
    listResults,
    listEdges,
  } = useMemo(() => {
    const displayed = state
      ? new Map(state.objects.map((object) => [object.id, object]))
      : new Map<string, MapObject>();
    for (const change of state?.draft.changes ?? []) {
      if (change.after)
        displayed.set(change.id, {
          ...change.after,
          id: change.id,
          householdId,
          revision: change.before?.revision ?? 0,
        });
    }
    const displayedEdges = proposedRelationships(
      state?.relationships ?? [],
      state?.draft.relationships,
    );
    const spatialEdges = new Map(displayedEdges);
    for (const change of state?.draft.relationships ?? []) {
      if (!change.after && change.before) spatialEdges.set(change.id, change.before);
    }
    const connected = new Set([focusId]);
    const beforeEdges = (state?.draft.relationships ?? []).flatMap((change) =>
      change.before ? [change.before] : [],
    );
    for (const edge of [...spatialEdges.values(), ...beforeEdges]) {
      if (edge.sourceId === focusId || edge.targetId === focusId) {
        connected.add(edge.sourceId);
        connected.add(edge.targetId);
      }
    }
    const listObjects = [...displayed.values()].filter(
      (object) => !focusId || connected.has(object.id),
    );
    const listResults = objectListResults(
      listObjects,
      effectiveTypes,
      { query, types: typeFilter, onlySelected, sort },
      selectedIds,
    );
    const visibleObjects = new Map(
      (mapUnfiltered ? listObjects : listResults.items).map((object) => [object.id, object]),
    );
    const listIds = new Set(listResults.items.map((object) => object.id));
    function edgesFor(ids: Set<string>) {
      return new Map(
        [...spatialEdges].filter(
          ([, edge]) =>
            ids.has(edge.sourceId) &&
            (!edge.targetId || ids.has(edge.targetId)) &&
            (!focusId || edge.sourceId === focusId || edge.targetId === focusId),
        ),
      );
    }
    const listEdges = edgesFor(listIds);
    const visibleEdges = mapUnfiltered ? edgesFor(new Set(visibleObjects.keys())) : listEdges;
    return {
      displayed,
      displayedEdges,
      visibleObjects,
      visibleEdges,
      listObjects,
      listResults,
      listEdges,
    };
  }, [
    state,
    householdId,
    effectiveTypes,
    focusId,
    query,
    typeFilter,
    onlySelected,
    sort,
    selectedIds,
    mapUnfiltered,
  ]);
  function showAll() {
    setBrowsing(initialObjectBrowsing);
    setMapUnfiltered(false);
    setFocusId(null);
    setSelection(null);
    setStatus('Hela rymden visas. Kameran behåller sin vinkel, zoom och panorering.');
  }
  function clearSelection() {
    setSelection(null);
  }
  function focusSelection(ids = selectedIds) {
    const neighbors = new Set(ids);
    const edges = [
      ...displayedEdges.values(),
      ...(state?.draft.relationships ?? []).flatMap((change) =>
        change.before ? [change.before] : [],
      ),
    ];
    for (const edge of edges) {
      if (!ids.includes(edge.sourceId) && (!edge.targetId || !ids.includes(edge.targetId)))
        continue;
      neighbors.add(edge.sourceId);
      if (edge.targetId) neighbors.add(edge.targetId);
    }
    setMapUnfiltered(true);
    setFocusId(null);
    setCameraFocusRequest({
      id: crypto.randomUUID(),
      objectIds: [...neighbors].filter((id) => displayed.has(id)),
    });
  }
  function showListObject(object: MapObject) {
    if (!mapAvailable) return;
    selectObject(object, 'replace');
    focusSelection([object.id]);
    closePanel('work');
    setRevealRequest(undefined);
    if (narrow) {
      setPresentation('map');
      setDetailsOpen(false);
      setEditorOpen(false);
    }
    focusTools();
  }
  function focusObject(id: string) {
    setFocusId(id);
    setMapUnfiltered(false);
    setBrowsing((previous) => ({
      ...previous,
      query: '',
      types: [],
      onlySelected: false,
      page: 0,
    }));
    setSelection({ kind: 'object', id });
    setStatus(
      `Visar direkta samband för ${displayed.get(id)?.name}. Visa hela rymden lämnar fokus.`,
    );
  }
  const savedObjects = new Map((state?.objects ?? []).map((object) => [object.id, object]));
  const conflictEntries = conflicts.map((conflict) => {
    let label: string;
    if (conflict.kind === 'relationship') {
      const change = state?.draft.relationships?.find((item) => item.id === conflict.id);
      const value = change?.after ?? change?.before;
      label = `Samband: ${
        value && change
          ? relationshipLabel(
              value,
              { relationshipTypes: [change.type] },
              new Map([
                ...Object.entries(change.objectNames ?? {}).map(
                  ([id, name]) => [id, { name }] as const,
                ),
                ...displayed,
              ]),
            )
          : conflict.id
      }`;
    } else {
      const changes =
        conflict.kind === 'object'
          ? state?.draft.changes
          : conflict.kind === 'objectType'
            ? state?.draft.objectTypes
            : state?.draft.relationshipTypes;
      const change = changes?.find((item) => item.id === conflict.id);
      const kind =
        conflict.kind === 'object'
          ? 'Objekt'
          : conflict.kind === 'objectType'
            ? 'Objekttyp'
            : 'Sambandstyp';
      label = `${kind}: ${change?.after?.name ?? change?.before?.name ?? conflict.id}`;
    }
    return { id: draftEntryId(conflict.kind, conflict.id), label, entityId: conflict.id };
  });
  const hasChanges = Boolean(
    state &&
      (state.draft.changes.length ||
        state.draft.relationships?.length ||
        state.draft.objectTypes?.length ||
        state.draft.relationshipTypes?.length),
  );
  const pendingOperation = operations.find((operation) => operation.status === 'pending');
  const unresolved =
    state?.draft.changes.some((change) => change.after?.identity === 'unresolved') ||
    state?.draft.relationships?.some((change) => change.after?.knowledge === 'unresolved');
  function editRelationship(edge?: MapRelationship, previous = false) {
    if (!state) return;
    if (presentation === 'map') setEditorOpen(true);
    else setDetailsOpen(true);
    if (edge) setSelection({ kind: 'relationship', id: edge.id, previous });
    if (legacyDirty) return;
    if (previous) {
      setEdgeEditor(null);
      setTypeEditor(null);
      setEdgeTypeEditor(null);
      setDirty(false);
      return;
    }
    if (edge && edgeEditor?.id === edge.id) {
      editorDialog.current?.querySelector<HTMLSelectElement>('#relationship-source')?.focus();
      return;
    }
    const proposal = state.draft.relationships?.find((change) => change.id === edge?.id);

    setTypeEditor(null);
    setEdgeTypeEditor(null);
    setEdgeEditor({
      id: edge?.id ?? crypto.randomUUID(),
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : (edge?.revision ?? null),
      value: proposal?.after ??
        edge ?? { typeId: '', sourceId: '', targetId: '', knowledge: 'known' },
    });
    setDirty(true);
  }
  function editObjectType(type: ObjectType) {
    if (!state || legacyDirty) return;
    const proposal = state.draft.objectTypes?.find((item) => item.id === type.id);
    setEdgeEditor(null);
    setDirty(false);
    setEdgeTypeEditor(null);
    setTypeEditor({
      type,
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : type.revision,
    });
  }
  function editRelationshipType(type: RelationshipType) {
    if (!state || legacyDirty) return;
    const proposal = state.draft.relationshipTypes?.find((item) => item.id === type.id);
    setEdgeEditor(null);
    setTypeEditor(null);
    setDirty(false);
    setEdgeTypeEditor({
      type,
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : type.revision,
    });
  }
  function selectObject(
    object: MapObject,
    mode: 'select' | 'toggle' | 'include' | 'replace' = 'select',
  ) {
    setSelection((previous) => {
      const ids = previous?.kind === 'object' ? (previous.ids ?? [previous.id]) : [];
      const selected = ids.includes(object.id);
      let next = ids;
      if (mode === 'replace' || (mode === 'select' && !selected)) next = [object.id];
      else if (!selected) next = [...ids, object.id];
      else if (mode === 'toggle') next = ids.filter((id) => id !== object.id);
      if (!next.length) return null;
      return {
        kind: 'object',
        id: next.includes(object.id) ? object.id : next[next.length - 1],
        ids: next,
      };
    });
    if (legacyDirty) return;
    setEdgeEditor(null);
    setTypeEditor(null);
    setEdgeTypeEditor(null);
  }
  function selectRelationship(edge: MapRelationship, previous = false) {
    setSelection({ kind: 'relationship', id: edge.id, previous });
    if (legacyDirty) return;
    if (previous || edgeEditor?.id !== edge.id) setEdgeEditor(null);
    setTypeEditor(null);
    setEdgeTypeEditor(null);
  }
  const selectedObject = selection?.kind === 'object' ? displayed.get(selection.id) : undefined;
  const selectedEdge =
    selection?.kind === 'relationship' && !selection.previous
      ? displayedEdges.get(selection.id)
      : undefined;
  async function revealAssistantItem(target: MapSelection, signal: AbortSignal) {
    revealAbort.current?.abort();
    if (!state || dirty || pending || blocked || !workspace.current || signal.aborted) return false;
    const object = target.kind === 'object' ? displayed.get(target.id) : undefined;
    const edge = target.kind === 'relationship' ? displayedEdges.get(target.id) : undefined;
    if (!object && !edge) return false;
    const objectIds = object
      ? [object.id]
      : edge
        ? [edge.sourceId, ...(edge.targetId ? [edge.targetId] : [])]
        : [];
    const request: MapRevealRequest = {
      id: crypto.randomUUID(),
      objectIds,
      ...(edge ? { relationshipId: edge.id } : {}),
    };
    const abort = new AbortController();
    revealAbort.current = abort;
    const cancel = () => abort.abort();
    signal.addEventListener('abort', cancel, { once: true });
    setMapUnfiltered(true);
    setFocusId(null);
    setPresentation('combined');
    if (object) edit(object, false);
    else if (edge) {
      selectRelationship(edge);
      openPanel('work');
    }
    setRevealRequest(request);
    try {
      return await waitForMapDisplay(workspace.current, request, target, abort.signal);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }
  // The conversation belongs to the map, not to a panel. The toolbar, the
  // voice box, notice and text view all read it and call its commands.
  function showConversation() {
    setGuidance(false);
    setTextViewOpen(true);
  }
  const conversation = useConversation({
    householdId,
    enabled: Boolean(state),
    onMapChange: () => {
      // The local save owns completion and the following map refresh.
      // A session poll must not replace its pending state with recovery.
      if (!pending || !saveAttempt.current) setLoad((value) => value + 1);
    },
    // The microphone opens no panel: the voice box follows the voice.
    onStarted: (mode) => (mode === 'voice' ? setGuidance(false) : showConversation()),
    onAccessLost: loseAccess,
    onEnded: () => {
      if (document.activeElement?.closest('.text-view')) closeTextView();
      else setTextViewOpen(false);
    },
    onSelectItem: revealAssistantItem,
  });
  useEffect(() => {
    if (conversation.revocationReceipt) setStatus(receiptMessage(conversation.revocationReceipt));
  }, [conversation.revocationReceipt]);
  const textButton = useTextButtonStatus(conversation, textViewOpen && active, active);
  const liveOngoing = conversationOngoing(conversation, textViewOpen);
  const beforeConnection = useRef({ blocked: false, ongoing: false });
  const interruptedConversation = useRef(false);
  if (conversation.inputBlocked && !beforeConnection.current.blocked)
    interruptedConversation.current = liveOngoing || beforeConnection.current.ongoing;
  if (!conversation.inputBlocked) interruptedConversation.current = false;
  if (conversation.revokedHere) interruptedConversation.current = false;
  const ongoing =
    liveOngoing ||
    interruptedConversation.current ||
    Boolean(conversation.saveChecking || conversation.saveCheckFailed);
  beforeConnection.current = { blocked: Boolean(conversation.inputBlocked), ongoing };
  const noticeState = useConversationNotice({
    conditions: {
      saveChecking: Boolean(conversation.saveChecking),
      saveCheckFailed: Boolean(conversation.saveCheckFailed),
      disconnectedActive: Boolean(
        !conversation.revokedHere && conversation.disconnected && ongoing,
      ),
      disconnectedIdle: Boolean(!conversation.revokedHere && conversation.disconnected && !ongoing),
      unavailable: !conversation.revokedHere && conversation.available === false,
      taskFailed: Boolean(conversation.taskFailed),
      consentRevoked: Boolean(conversation.consentRevoked),
      contextFull: conversation.session?.contextSummaryState === 'failed',
      ...(conversation.voice.failure ? { [conversation.voice.failure.noticeId]: true } : {}),
      playbackStopped: conversation.voice.playbackBlocked,
    },
    ongoing,
    requested: conversation.noticeRequested ?? 0,
    eventKey: `${conversation.session?.id}:${conversation.session?.revision}:${conversation.voice.failure?.occurrence ?? 0}`,
    diagnostic: conversation.voice.failure
      ? {
          noticeId: conversation.voice.failure.noticeId,
          reference: conversation.voice.failure.diagnosticId,
        }
      : undefined,
  });
  const notice = noticeState.notice && (
    <ConversationNoticeCard
      key={noticeState.notice.id}
      notice={noticeState.notice}
      closable={noticeState.closable}
      onDismiss={noticeState.dismiss}
      onAction={
        noticeState.notice.id === 'playbackStopped'
          ? conversation.voice.playAudio
          : noticeState.notice.id === 'saveCheckFailed'
            ? () => void conversation.recover()
            : noticeState.notice.id === 'contextFull'
              ? () => void conversation.newConversation()
              : undefined
      }
      focusAfterRemoval={() =>
        active
          ? (workspace.current?.querySelector<HTMLElement>('.workspace-talk') ?? null)
          : document.querySelector<HTMLElement>('.settings-return')
      }
    />
  );
  const voiceBox = (
    <VoiceBox
      conversation={conversation}
      notice={textViewOpen && active ? null : notice}
      hideStop={textViewOpen && !viewport.computer && conversation.working}
      microphoneButton={() =>
        workspace.current?.querySelector<HTMLElement>('.workspace-talk') ?? null
      }
      focusAfterStop={() =>
        active
          ? (workspace.current?.querySelector<HTMLElement>('.workspace-talk') ?? null)
          : document.querySelector<HTMLElement>('.settings-return')
      }
    />
  );
  function remove(kind: 'draft' | 'relationship', item: MapObject | MapRelationship) {
    if (!state) return;
    const changes = kind === 'draft' ? state.draft.changes : state.draft.relationships;
    const proposal = changes?.find((change) => change.id === item.id);
    void action(kind, {
      id: item.id,
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: proposal ? (proposal.before?.revision ?? null) : item.revision,
      value: null,
    });
  }
  function typeName(id: string) {
    return effectiveTypes.find((type) => type.id === id)?.name ?? id;
  }
  function details(value: ObjectValue | null, definition?: ObjectType, showHidden = true) {
    return value ? (
      <>
        <p>Namn: {value.name}</p>
        <ProfileImage
          householdId={householdId}
          value={value}
          typeName={definition?.name ?? typeName(value.typeId)}
        />
        <p>Objekttyp: {definition?.name ?? typeName(value.typeId)}</p>
        <ObjectPropertiesDetails
          showHidden={showHidden}
          type={definition ?? effectiveTypes.find((type) => type.id === value.typeId)}
          value={value}
        />
        <LifecycleDetails value={value} />
        {value.identity && (
          <p>
            {value.identity === 'unspecified'
              ? 'Ospecificerat objekt'
              : 'Obesvarad identitetsfråga'}
          </p>
        )}
      </>
    ) : (
      <p>Finns inte i kartan</p>
    );
  }

  return (
    <section
      ref={workspace}
      tabIndex={-1}
      className={`household-map${active ? ' workspace-shell' : ''}${workOpen ? ' workspace-open' : ''}${textViewOpen ? ' text-view-open' : ''}${revealRequest && !navigationOpen ? ' workspace-revealing' : ''} presentation-${active ? presentation : 'list'}${detailsOpen ? ' map-details-open' : ''}${editorOpen ? ' map-editor-open' : ''}`}
      onFocusCapture={(event) => {
        if (
          !active ||
          !event.currentTarget.contains(event.target) ||
          !(event.target instanceof HTMLElement) ||
          event.target.closest('.workspace-utility, .workspace-tools-footer, [data-secondary]')
        )
          return;
        if (event.target.closest('.workspace-window')) {
          setToolsExpanded(false);
          lastWorkFocus.current = event.target;
          lastOutsideFocus.current = null;
        } else {
          lastOutsideFocus.current = event.target.closest('.workspace-tools')
            ? event.target.classList.contains('workspace-text')
              ? textViewButtonName
              : event.target.getAttribute('aria-label')
            : event.target;
        }
      }}
      aria-label="Hushållskarta"
      data-navigation-open={navigationOpen}
      data-conversation-ongoing={conversationOngoing(conversation, textViewOpen)}
      data-mobile={viewport.mobile}
      data-narrow={narrow}
      data-short={viewport.short}
      data-wide-touch={viewport.wideTouch}
      data-theme={theme.theme}
      onKeyDown={(event) => {
        if (
          active &&
          event.currentTarget.contains(event.target as Node) &&
          event.key === 'Escape' &&
          !(
            event.target instanceof HTMLElement &&
            event.target.closest('form, input, select, textarea, dialog')
          )
        )
          showAll();
      }}
    >
      {conversationSettingsTarget &&
        // The page in Settings shows and changes the consent of the map's own conversation.
        createPortal(
          <ConversationSettings
            conversation={conversation}
            householdName={householdName}
            personal={conversationPreferences}
            ongoing={ongoing}
          />,
          conversationSettingsTarget,
        )}
      {active && (
        <>
          <a className="skip-link" href="#workspace-tools">
            Till verktygen
          </a>
          <button type="button" className="skip-link" onClick={() => openWork('list')}>
            Till lista och formulär
          </button>
          <button
            type="button"
            className="skip-link"
            onClick={(event) => openWork('conversation', event.currentTarget)}
          >
            Till samtalet med Skyttel
          </button>
          <WorkspaceTools
            conversationUnavailable={Boolean(conversation.inputBlocked)}
            conversationOngoing={ongoing}
            voiceControl={
              conversation.session ||
              conversation.voice.microphone === 'on' ||
              conversation.voice.starting
                ? conversation.voice
                : null
            }
            holdVoice={{
              canHold:
                conversation.consent.valid &&
                conversation.available === true &&
                !conversation.pending &&
                !conversation.unknown,
              prepare: () => conversation.voice.prepareAudio?.(),
              start: () => {
                conversation.voice.startHeld?.();
                if (!conversation.session) conversation.begin('voice');
              },
              release: () => conversation.voice.releaseHeld?.(),
            }}
            voiceBox={voiceBox}
            textViewOpen={textViewOpen}
            textButton={textButton}
            cameraMount={setCameraMount}
            expanded={toolsExpanded}
            onExpandedChange={setToolsExpanded}
            onOpen={openWork}
            account={account}
            profileRequested={profileRequested}
            onReturnWork={() => {
              if (restoreOutsideFocus(lastOutsideFocus.current)) return true;
              if (
                !workOpen ||
                !activePanel ||
                !openPanels.includes(activePanel) ||
                !lastWorkFocus.current?.isConnected ||
                lastWorkFocus.current.closest('[hidden], [inert]')
              )
                return false;
              setPanelFocusRequest({ id: activePanel, element: lastWorkFocus.current });
              return true;
            }}
            onSettings={onSettings}
            theme={<WorkspaceTheme mode={theme.mode} onChange={theme.changeMode} />}
            onDetails={() => {
              if (selectedObject) edit(selectedObject, false);
            }}
            detailsAvailable={Boolean(selectedObject) && !pending && !blocked}
            detailsVisible={Boolean(
              selectedObject &&
                workOpen &&
                openPanels.includes(selectedObject.id) &&
                (!(narrow || revealRequest) || activePanel === selectedObject.id),
            )}
          />
          <ConversationConsent conversation={conversation} chosen={conversationChoice} />
          <div className="workspace-context">
            {householdName}
            <span>Gemensam karta</span>
            <span
              className="workspace-selection-count"
              data-multiple={selectedIds.length > 1}
              aria-live="polite"
              aria-atomic="true"
            >
              {selectedIds.length} markerade
            </span>
          </div>
          {guidance && !workOpen && Boolean(visibleObjects.size) && (
            <WelcomeGuidance onOpen={openGuidedWork} onDismiss={dismissGuidance} />
          )}
          {state && !visibleObjects.size && !query && !typeFilter.length && !workOpen && (
            <div className="workspace-empty">
              <h2>Din karta börjar här</h2>
              <p>Lägg till ditt första objekt genom Lista eller berätta för Skyttel.</p>
              {guidance ? (
                <WelcomeGuidance empty onOpen={openGuidedWork} onDismiss={dismissGuidance} />
              ) : (
                <button type="button" onClick={() => openWork('list')}>
                  Öppna Lista
                </button>
              )}
            </div>
          )}
        </>
      )}
      {/* Outside the map, where its tools are not shown, the voice box still says what the voice does. */}
      {!active && voiceBox}
      <ConversationNoticeAnnouncements announcement={noticeState.announcement} />
      <p className="visually-hidden text-button-announcement" aria-live="polite" aria-atomic="true">
        <span key={textButton.announcement.count}>{textButton.announcement.text}</span>
      </p>
      <div className="workspace-feedback">
        {status && !pending && !error && (
          <button
            type="button"
            className="workspace-close"
            aria-label="Stäng status"
            onClick={() => setStatus('')}
          >
            <WorkspaceIcon name="close" />
          </button>
        )}
        <p role="status">
          {pending
            ? saveAttempt.current
              ? 'Väntande: kontrollerar sparandet…'
              : 'Arbetar…'
            : status}
        </p>
        {!state && error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!state && (error || blocked) && (
          <button
            type="button"
            disabled={pending}
            data-refresh-map
            onClick={(event) => reloadMap(event.currentTarget)}
          >
            Hämta aktuellt underlag
          </button>
        )}
        {!state && saveAttempt.current && blocked && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (saveAttempt.current) void save(saveAttempt.current, true);
            }}
          >
            Hämta samma kvitto igen
          </button>
        )}
        {!state && !error && (
          <div className="map-loading" role="status" aria-busy="true">
            <span className="assistant-spinner" aria-hidden="true" />
            Hushållets karta hämtas…
          </div>
        )}
      </div>
      {active && workOpen && !panelsCovered && (
        <button
          type="button"
          className="workspace-work-close"
          onClick={closeWork}
          aria-label="Stäng arbetsytan"
        >
          <WorkspaceIcon name="close" />
          Till kartan
        </button>
      )}
      <div className="workspace-navigation-mount" ref={setNavigationMount} hidden={!active} />
      {state && (
        <div className="map-space" hidden={!active} inert={mapCovered} aria-hidden={mapCovered}>
          <SpatialMap
            cameraMount={cameraMount}
            navigationMount={navigationMount}
            onNavigationChange={setNavigationOpen}
            openWork={workOpen ? openPanels : undefined}
            onCameraAction={() => setToolsExpanded(false)}
            theme={theme.theme}
            revealRequest={revealRequest}
            focusRequest={cameraFocusRequest}
            onFocusSelection={() => focusSelection()}
            onShowOverview={() => {
              setMapUnfiltered(true);
              setFocusId(null);
            }}
            onAvailabilityChange={setMapAvailable}
            personal={personal}
            settingsMount={mapSettingsTarget}
            active={active && !mapCovered}
            state={effectiveState ?? state}
            objects={visibleObjects}
            relationships={visibleEdges}
            selection={selection}
            selectedIds={selectedIds}
            disabled={pending || blocked}
            onSelect={(object, additive) => selectObject(object, additive ? 'toggle' : 'select')}
            onEdit={edit}
            onOpenDetails={(object) => edit(object, false)}
            onSelectRelationship={selectRelationship}
            onFocus={focusObject}
            onClear={clearSelection}
            onReset={() => {
              showAll();
              setStatus('Översikt återställd. Alla objekt visas.');
            }}
            onRemove={(object) => remove('draft', object)}
          />
        </div>
      )}
      {state && (
        <ConversationWorkspace
          conversation={conversation}
          draftFeedback={({ working, needsAnswer, compact }) => (
            <>
              <DraftStatus
                compact={compact || (narrow && textViewOpen)}
                draft={state.draft}
                operation={pendingOperation ?? operations[0]}
                saving={Boolean(pending && saveAttempt.current)}
                unknown={Boolean(blocked && saveAttempt.current && !pending)}
                dirty={dirty}
                unresolved={Boolean(unresolved)}
                conflicts={conflictEntries.map((entry) => ({
                  id: entry.id,
                  label:
                    conflictEntries.filter((other) => other.label === entry.label).length > 1
                      ? `${entry.label} [${entry.entityId}]`
                      : entry.label,
                }))}
                conflictLinks={{ open: conflictLinksOpen, onOpenChange: setConflictLinksOpen }}
                expanded={false}
                error={error}
                imageError={
                  errorDetails.imageObjectId
                    ? {
                        name:
                          displayed.get(errorDetails.imageObjectId)?.name ??
                          objectPanels.find((panel) => panel.id === errorDetails.imageObjectId)
                            ?.title ??
                          'objektet',
                        onReturn: () => {
                          const id = errorDetails.imageObjectId;
                          if (id && objectPanels.some((panel) => panel.id === id)) openPanel(id);
                          else {
                            const object = id ? displayed.get(id) : undefined;
                            if (object) edit(object);
                          }
                          routeOutsideFocus.current = null;
                          if (!active) onReturnToMap?.();
                        },
                      }
                    : undefined
                }
                working={pending && !saveAttempt.current}
                onRefresh={(origin) => reloadMap(origin)}
                onRecover={
                  (saveAttempt.current || pendingOperation) && blocked
                    ? () => {
                        if (saveAttempt.current) void save(saveAttempt.current, true);
                        else if (pendingOperation) retrySave(pendingOperation);
                      }
                    : undefined
                }
                pending={pending}
                showSave={!workOpen && !working && !needsAnswer}
                disabled={
                  pending ||
                  blocked ||
                  dirty ||
                  !hasChanges ||
                  Boolean(unresolved) ||
                  conflicts.length > 0
                }
                onSave={saveDraft}
                onDraft={() => {
                  returnFromStatus();
                  openPanel(
                    'work',
                    document.getElementById(hasChanges ? 'draft-title' : 'save-operations-title'),
                  );
                }}
                onConflict={(id) => {
                  returnFromStatus();
                  openPanel('work', document.getElementById(id));
                }}
                onContinue={() => {
                  returnFromStatus();
                  const objectId = Object.keys(objectDirty).find((id) => objectDirty[id]);
                  if (objectId) openPanel(objectId, lastWorkFocus.current);
                  else openWork('list');
                }}
              />
            </>
          )}
          active={active}
          textViewOpen={textViewOpen}
          draft={state.draft}
          showDraftOnStart={conversationPreferences.preferences.showDraftOnStart}
          preferencesKnown={conversationPreferences.known}
          widthPreferences={conversationPreferences}
          notice={active ? notice : null}
          onCloseTextView={closeTextView}
          householdId={householdId}
          renderWorkspace={(work, floatingStatus) => (
            <WorkspacePanels
              floatingStatus={floatingStatus}
              hidden={!active || !workOpen || panelsCovered}
              restoreFocusOnReveal={!profileRequested}
              activeId={activePanel}
              focusRequest={panelFocusRequest}
              onActivate={(id) => {
                setPanelFocusRequest(null);
                setActivePanel(id);
                if (id !== activePanel) setRevealRequest(undefined);
              }}
              focused={Boolean(revealRequest)}
              onClose={closePanel}
              onEmpty={focusTools}
              windows={[
                {
                  id: 'work',
                  title: 'Lista och utkast',
                  open: openPanels.includes('work'),
                  content: work,
                  resumeFocus: () => resumeListFocus.current(),
                },
                ...objectPanels.map((panel) => {
                  const selectedObject = displayed.get(panel.id);
                  return {
                    id: panel.id,
                    title: selectedObject?.name ?? panel.title,
                    open: openPanels.includes(panel.id),
                    anchor: panel.anchor,
                    content: (
                      <ObjectWork
                        initial={
                          selectedObject
                            ? objectEditor(selectedObject)
                            : { ...panel.initial, version: state.draft.version }
                        }
                        object={selectedObject}
                        state={state}
                        effectiveTypes={effectiveTypes}
                        householdId={householdId}
                        pending={pending}
                        blocked={blocked || legacyDirty}
                        editing={panel.editing}
                        onDirty={(value) =>
                          setObjectDirty((previous) => ({ ...previous, [panel.id]: value }))
                        }
                        onName={(name) => {
                          if (!panel.newObject) return;
                          setObjectPanels((previous) =>
                            previous.map((entry) =>
                              entry.id === panel.id ? { ...entry, unsentName: name } : entry,
                            ),
                          );
                        }}
                        onDone={() => {
                          const focused = document.activeElement;
                          const returnToWork =
                            focused === document.body ||
                            (focused instanceof HTMLElement &&
                              focused.closest<HTMLElement>('.workspace-window')?.dataset
                                .windowId === panel.id);
                          closePanel(panel.id);
                          setObjectPanels((previous) =>
                            previous.filter((entry) => entry.id !== panel.id),
                          );
                          if (returnToWork) openPanel('work', newButton.current);
                        }}
                        action={(body) => action('draft', body)}
                        changeImage={changeImage}
                        stageObject={async (editor) => {
                          let next: ObjectEditor | undefined;
                          await action(
                            'draft',
                            {
                              ...editor,
                              value: { ...editor.value, iconId: editor.value.iconId ?? null },
                            },
                            (draft) => {
                              const value = draft.changes.find(
                                (change) => change.id === editor.id,
                              )?.after;
                              if (value) next = { ...editor, value, version: draft.version };
                            },
                          );
                          return next;
                        }}
                        details={details(selectedObject ?? panel.initial.value, undefined, false)}
                        relationships={
                          selectedObject && (
                            <button
                              type="button"
                              onClick={() => {
                                focusObject(selectedObject.id);
                                openWork('list');
                              }}
                            >
                              Visa samband i listan
                            </button>
                          )
                        }
                      />
                    ),
                  };
                }),
              ]}
            />
          )}
          inspector={
            <dialog
              ref={editorDialog}
              className="map-editor-dialog"
              role="presentation"
              aria-label={editorOpen ? 'Redigera val' : undefined}
              open={active && workOpen}
            >
              <section
                className="map-inspector"
                aria-label="Val och redigering"
                data-selection-kind={selectedEdge ? 'relationship' : undefined}
                data-selection-id={
                  !edgeEditor
                    ? selectedEdge?.id
                    : edgeEditor.version === state.draft.version &&
                        edgeEditor.contentVersion === state.contentVersion
                      ? edgeEditor.id
                      : undefined
                }
              >
                <h3>Val och redigering</h3>
                {edgeEditor && (
                  <p className="muted">
                    Skriv inte fullständiga konto- eller kortnummer, lösenord, pinkoder,
                    säkerhetskoder eller återställningskoder.
                  </p>
                )}
                {!edgeEditor && !selection && (
                  <p className="muted">
                    Välj ett objekt eller samband för att se uppgifter och samband.
                  </p>
                )}
                {!edgeEditor && selectedEdge && (
                  <>
                    <p>{relationshipLabel(selectedEdge, effectiveState ?? state, displayed)}</p>
                    <CustomFieldsDetails
                      type={effectiveEdgeTypes.find((type) => type.id === selectedEdge.typeId)}
                      values={selectedEdge.customValues}
                    />
                    <LifecycleDetails value={selectedEdge} />
                    <button
                      type="button"
                      disabled={pending || blocked}
                      onClick={() => editRelationship(selectedEdge)}
                    >
                      Redigera valt samband
                    </button>
                  </>
                )}
                {selection?.kind === 'relationship' &&
                  selection.previous &&
                  (() => {
                    const before = state.draft.relationships?.find(
                      (change) => change.id === selection.id,
                    )?.before;
                    return before ? (
                      <section aria-label="Tidigare samband">
                        <h2>Tidigare samband</h2>
                        <p>× Ersätts i utkastet. Detta är det sparade sambandet före ändringen.</p>
                        <p>{relationshipLabel(before, effectiveState ?? state, displayed)}</p>
                        <CustomFieldsDetails
                          type={
                            state.draft.relationships?.find((change) => change.id === before.id)
                              ?.beforeType ??
                            state.relationshipTypes.find((type) => type.id === before.typeId)
                          }
                          values={before.customValues}
                          showHidden
                        />
                        <LifecycleDetails value={before} />
                        <button type="button" onClick={() => setSelection(null)}>
                          Stäng tidigare samband
                        </button>
                      </section>
                    ) : null;
                  })()}
                {edgeEditor && (
                  <RelationshipEditor
                    key={edgeEditor.id}
                    state={effectiveState ?? state}
                    objects={displayed}
                    initial={edgeEditor}
                    disabled={pending || blocked}
                    onSubmit={(body) =>
                      void action('relationship', {
                        ...(body as Record<string, unknown>),
                        contentVersion: edgeEditor.contentVersion,
                      })
                    }
                    onClose={() => {
                      setEdgeEditor(null);
                      setDirty(false);
                    }}
                  />
                )}
              </section>
            </dialog>
          }
        >
          {(assistant) => (
            <>
              <div className="household-map-heading">
                <h2>Hushållets karta</h2>
                <span className={`map-state-badge${hasChanges ? ' has-changes' : ''}`}>
                  {hasChanges ? 'Med förslag' : 'Sparad'}
                </span>
              </div>
              <nav className="map-presentation" aria-label="Kartans visning">
                <button
                  type="button"
                  ref={listModeButton}
                  aria-pressed={presentation === 'list'}
                  onClick={() => setPresentation('list')}
                >
                  Lista och detaljer
                </button>
                <button
                  type="button"
                  className="combined-mode-button"
                  aria-pressed={presentation === 'combined'}
                  onClick={() => setPresentation('combined')}
                >
                  Samlad vy
                </button>
                <button
                  type="button"
                  className="open-map-button"
                  aria-pressed={presentation === 'map'}
                  onClick={() => {
                    setPresentation('map');
                    setDetailsOpen(false);
                  }}
                >
                  Öppna rymdkartan
                </button>
                {presentation === 'map' && (
                  <button
                    ref={editMapButton}
                    type="button"
                    disabled={!selection || pending || blocked}
                    onClick={() => {
                      if (selectedObject) edit(selectedObject);
                      else if (selectedEdge) editRelationship(selectedEdge);
                      else setEditorOpen(true);
                    }}
                  >
                    Redigera val
                  </button>
                )}
                {presentation === 'map' && (
                  <button type="button" onClick={() => setDetailsOpen((open) => !open)}>
                    {detailsOpen ? 'Till kartan' : 'Visa detaljer och utkast'}
                  </button>
                )}
              </nav>
              <div className="map-workspace">
                <div className="map-content" hidden={!workOpen}>
                  <div className="map-management">
                    <ObjectList
                      objects={listObjects}
                      resumeFocus={resumeListFocus}
                      types={effectiveTypes}
                      results={listResults}
                      browsing={browsing}
                      onBrowse={(next) => {
                        if (
                          next.query !== browsing.query ||
                          next.types !== browsing.types ||
                          next.onlySelected !== browsing.onlySelected
                        )
                          setMapUnfiltered(false);
                        setBrowsing(next);
                      }}
                      active={
                        active && workOpen && openPanels.includes('work') && activePanel === 'work'
                      }
                      selectedIds={selectedIds}
                      mapAvailable={mapAvailable}
                      onClearSelection={clearSelection}
                      selectedId={selection?.kind === 'object' ? selection.id : undefined}
                      renderItem={(object) => (
                        <li key={object.id}>
                          <div className="object-list-row">
                            <button
                              type="button"
                              className="object-list-mark"
                              aria-label={`Markera ${object.name}`}
                              aria-pressed={selectedIds.includes(object.id)}
                              disabled={pending || blocked}
                              onClick={() => selectObject(object, 'toggle')}
                            >
                              <span aria-hidden="true">
                                {selectedIds.includes(object.id) ? '✓' : '□'}
                              </span>
                            </button>
                            <span className="object-list-appearance">
                              <ProfileImage
                                householdId={householdId}
                                value={object}
                                typeName={typeName(object.typeId)}
                                compact
                              />
                            </span>
                            <button
                              type="button"
                              className="object-list-name"
                              aria-label={`Visa ${object.name} i kartan`}
                              title={
                                !mapAvailable
                                  ? 'Kartan kan inte visas. Använd Uppgifter.'
                                  : undefined
                              }
                              disabled={pending || blocked || !mapAvailable}
                              onClick={() => showListObject(object)}
                            >
                              <span>
                                <strong>{object.name}</strong>
                                <small>{typeName(object.typeId)}</small>
                              </span>
                            </button>
                            <button
                              type="button"
                              className="object-list-details"
                              aria-label={`Uppgifter för ${object.name}`}
                              disabled={pending || blocked}
                              onClick={() => edit(object, false)}
                            >
                              Uppgifter
                            </button>
                          </div>
                          <ProposalSymbol
                            change={state.draft.changes.find((change) => change.id === object.id)}
                          />
                          {selectedIds.includes(object.id) && (
                            <div className="access-actions">
                              <button
                                type="button"
                                aria-label={`Redigera ${object.name}`}
                                disabled={pending || blocked}
                                onClick={() => edit(object)}
                              >
                                Redigera
                              </button>
                              <button
                                type="button"
                                aria-label={`Ta bort ${object.name}`}
                                aria-describedby={`list-removal-${object.id}`}
                                disabled={
                                  pending ||
                                  dirty ||
                                  blocked ||
                                  state.draft.changes.some(
                                    (change) => change.id === object.id && !change.after,
                                  )
                                }
                                onClick={() => remove('draft', object)}
                              >
                                Ta bort
                              </button>
                              <ObjectRemovalNotice
                                state={state}
                                objectId={object.id}
                                id={`list-removal-${object.id}`}
                              />
                            </div>
                          )}
                          <LifecycleStatus value={object} />
                          {state.draft.changes.some((change) => change.id === object.id) && (
                            <span className="proposed-status">
                              {state.draft.changes.some(
                                (change) => change.id === object.id && !change.after,
                              )
                                ? 'Borttagning i ditt utkast'
                                : 'Förslag i ditt utkast'}
                            </span>
                          )}
                          {!state.draft.changes.some(
                            (change) => change.id === object.id && !change.after,
                          ) && (
                            <details>
                              <summary>Åtgärder för {object.name}</summary>
                              <button
                                type="button"
                                aria-describedby={`actions-removal-${object.id}`}
                                disabled={pending || dirty || blocked}
                                onClick={() => remove('draft', object)}
                              >
                                Ta bort
                              </button>
                              <ObjectRemovalNotice
                                state={state}
                                objectId={object.id}
                                id={`actions-removal-${object.id}`}
                              />
                            </details>
                          )}
                        </li>
                      )}
                    />
                    <div className="map-list-context">
                      <button type="button" onClick={showAll}>
                        Visa hela rymden
                      </button>
                      <button
                        type="button"
                        disabled={selection?.kind !== 'object'}
                        onClick={() => {
                          if (selection?.kind === 'object') focusObject(selection.id);
                        }}
                      >
                        Visa objektets kopplingar
                      </button>
                      <p aria-live="polite">
                        {listResults.items.length} objekt och {listEdges.size} samband
                        {focusId && (
                          <>
                            {' '}
                            · <span>Fokus: {displayed.get(focusId)?.name}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      ref={newButton}
                      type="button"
                      disabled={pending || blocked}
                      onClick={() => edit()}
                    >
                      Nytt objekt
                    </button>
                    {objectPanels.some((panel) => panel.newObject && !displayed.has(panel.id)) && (
                      <section aria-label="Påbörjade objekt">
                        <h3>Påbörjade objekt</h3>
                        <p>Dessa formulär är inte skickade till ditt utkast.</p>
                        <ul>
                          {objectPanels
                            .filter((panel) => panel.newObject && !displayed.has(panel.id))
                            .map((panel, index) => (
                              <li key={panel.id}>
                                <button
                                  type="button"
                                  disabled={pending || blocked}
                                  onClick={() => openPanel(panel.id)}
                                >
                                  Fortsätt: {panel.unsentName || `Nytt objekt ${index + 1}`}
                                </button>
                              </li>
                            ))}
                        </ul>
                      </section>
                    )}
                    <button
                      ref={mergeButton}
                      type="button"
                      disabled={pending || legacyDirty || blocked}
                      onClick={() => {
                        setEdgeEditor(null);
                        setMergeGeneration(state.contentVersion);
                        setMergeOpen(true);
                        setDirty(true);
                      }}
                    >
                      Slå samman objekt
                    </button>
                    {mergeOpen && (
                      <ObjectMerge
                        state={state}
                        selectedId={selection?.kind === 'object' ? selection.id : undefined}
                        disabled={pending || blocked}
                        onSubmit={(body) =>
                          void action('merge', {
                            ...(body as Record<string, unknown>),
                            contentVersion: mergeGeneration,
                          })
                        }
                        onClose={() => {
                          setMergeOpen(false);
                          setDirty(false);
                          openPanel('work', mergeButton.current);
                        }}
                      />
                    )}
                    <h2>Samband</h2>
                    <PagedList
                      label="Samband"
                      key={`edges-${query}-${typeFilter}-${focusId}`}
                      items={[...displayedEdges.values()].filter((edge) => listEdges.has(edge.id))}
                      selectedId={selection?.kind === 'relationship' ? selection.id : undefined}
                      renderItem={(edge) => (
                        <li key={edge.id}>
                          <button
                            type="button"
                            disabled={pending || dirty || blocked}
                            onClick={() => selectRelationship(edge)}
                          >
                            {relationshipLabel(
                              edge,
                              effectiveState ?? state,
                              displayed,
                              focusId ?? undefined,
                            )}
                          </button>
                          {selection?.kind === 'relationship' && selection.id === edge.id && (
                            <button
                              type="button"
                              aria-label={`Redigera ${relationshipLabel(edge, effectiveState ?? state, displayed, focusId ?? undefined)}`}
                              disabled={pending || blocked}
                              onClick={() => editRelationship(edge)}
                            >
                              Redigera
                            </button>
                          )}
                          <LifecycleStatus value={edge} />
                          {state.draft.relationships?.some((change) => change.id === edge.id) && (
                            <span className="proposed-status">Förslag i ditt utkast</span>
                          )}
                          <details>
                            <summary>
                              Åtgärder för{' '}
                              {relationshipLabel(
                                edge,
                                effectiveState ?? state,
                                displayed,
                                focusId ?? undefined,
                              )}
                            </summary>
                            <button
                              type="button"
                              disabled={pending || dirty || blocked}
                              onClick={() => remove('relationship', edge)}
                            >
                              Ta bort
                            </button>
                          </details>
                        </li>
                      )}
                    />
                    <button
                      type="button"
                      disabled={pending || dirty || blocked}
                      onClick={() => editRelationship()}
                    >
                      Nytt samband
                    </button>
                    <div className="map-definition-tools">
                      <SaveOperations
                        operations={operations}
                        disabled={pending}
                        onRetry={retrySave}
                      />
                      <MapHistory
                        generation={state.contentVersion}
                        path={path}
                        version={state.draft.version}
                        disabled={pending || dirty || blocked}
                        onAccessLost={loseAccess}
                        onUndo={(receipt, contentVersion) =>
                          void action('undo', {
                            version: state.draft.version,
                            contentVersion,
                            userId: receipt.userId,
                            operationId: receipt.operationId,
                          })
                        }
                      />
                      <div ref={typeSlot} />
                      {createPortal(
                        <div className="shared-type-settings">
                          <details>
                            <summary>Objekttyper och egna fält</summary>
                            <p>
                              Alla medlemmar kan föreslå ändringar, även i förifyllda typer. Egna
                              fält är inte till för hemliga uppgifter.
                            </p>
                            <ul aria-label="Objekttyper">
                              {effectiveTypes.map((type) => (
                                <li key={type.id}>
                                  <button
                                    type="button"
                                    disabled={pending || dirty || blocked}
                                    onClick={() => editObjectType(type)}
                                  >
                                    Ändra typ: {type.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </details>
                          <button
                            type="button"
                            disabled={pending || legacyDirty || blocked}
                            onClick={() => {
                              setEdgeEditor(null);
                              setDirty(true);
                              setEdgeTypeEditor(null);
                              setTypeEditor({
                                type: {
                                  id: crypto.randomUUID(),
                                  householdId,
                                  revision: 0,
                                  name: '',
                                  description: '',
                                },
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                baseRevision: null,
                              });
                            }}
                          >
                            Ny objekttyp
                          </button>
                          {typeEditor && (
                            <ObjectTypeEditor
                              key={typeEditor.type.id}
                              initial={typeEditor.type}
                              disabled={pending || blocked}
                              stale={
                                typeEditor.version !== state.draft.version ||
                                typeEditor.contentVersion !== state.contentVersion
                              }
                              onDirty={() => setDirty(true)}
                              onSubmit={(value) =>
                                void action('object-type', {
                                  version: typeEditor.version,
                                  contentVersion: typeEditor.contentVersion,
                                  id: typeEditor.type.id,
                                  baseRevision: typeEditor.baseRevision,
                                  value,
                                })
                              }
                              onClose={() => {
                                setTypeEditor(null);
                                setEdgeTypeEditor(null);
                                setDirty(false);
                              }}
                            />
                          )}
                          <details>
                            <summary>Sambandstyper och riktning</summary>
                            <p>
                              Alla medlemmar kan ändra definitionerna, även förifyllda typer. En
                              ändrad definition kopplar inte om objekten.
                            </p>
                            <ul aria-label="Sambandstyper">
                              {effectiveEdgeTypes.map((type) => (
                                <li key={type.id}>
                                  <button
                                    type="button"
                                    disabled={pending || dirty || blocked}
                                    onClick={() => editRelationshipType(type)}
                                  >
                                    Ändra sambandstyp: {type.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </details>
                          <button
                            type="button"
                            disabled={pending || dirty || blocked}
                            onClick={() => {
                              setEdgeEditor(null);
                              setTypeEditor(null);
                              setDirty(true);
                              setEdgeTypeEditor({
                                type: {
                                  id: crypto.randomUUID(),
                                  householdId,
                                  revision: 0,
                                  name: '',
                                  description: '',
                                },
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                baseRevision: null,
                              });
                            }}
                          >
                            Ny sambandstyp
                          </button>
                          {edgeTypeEditor && (
                            <RelationshipTypeEditor
                              key={edgeTypeEditor.type.id}
                              initial={edgeTypeEditor.type}
                              disabled={pending || blocked}
                              stale={
                                edgeTypeEditor.version !== state.draft.version ||
                                edgeTypeEditor.contentVersion !== state.contentVersion
                              }
                              onDirty={() => setDirty(true)}
                              onSubmit={(value) =>
                                void action('relationship-type', {
                                  version: edgeTypeEditor.version,
                                  contentVersion: edgeTypeEditor.contentVersion,
                                  id: edgeTypeEditor.type.id,
                                  baseRevision: edgeTypeEditor.baseRevision,
                                  value,
                                })
                              }
                              onClose={() => {
                                setEdgeTypeEditor(null);
                                setDirty(false);
                              }}
                            />
                          )}
                        </div>,
                        typeHost,
                      )}
                    </div>
                    <section aria-labelledby="draft-title" className="draft-review">
                      <h2 id="draft-title" tabIndex={-1}>
                        Hela mitt utkast
                      </h2>
                      <p className="muted">
                        Ta bort lägger borttagningen direkt i ditt utkast. Det är ingen permanent
                        radering.
                      </p>
                      {!hasChanges && <p>Inga förslag i utkastet.</p>}
                      {state.draft.relationshipTypes?.map((change) => (
                        <article key={change.id}>
                          <h3 id={draftEntryId('relationshipType', change.id)} tabIndex={-1}>
                            {!change.after
                              ? 'Borttagen sambandstyp'
                              : change.before
                                ? 'Ändrad sambandstyp'
                                : change.restoreRevision !== undefined
                                  ? 'Återställ sambandstyp'
                                  : 'Ny sambandstyp'}
                            : {change.after?.name ?? change.before?.name}
                          </h3>
                          <h4>Sparat underlag</h4>
                          <RelationshipTypeDetails type={change.before} />
                          <h4>Förslag</h4>
                          <RelationshipTypeDetails type={change.after} />
                          <button
                            type="button"
                            disabled={pending || blocked || dirty}
                            onClick={() =>
                              void action('discard-change', {
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                kind: 'relationshipType',
                                id: change.id,
                              })
                            }
                          >
                            Kasta förslaget
                          </button>
                          {conflicts
                            .filter(
                              (conflict) =>
                                conflict.kind === 'relationshipType' && conflict.id === change.id,
                            )
                            .map((conflict) => (
                              <div key={conflict.id}>
                                <h4>Konflikt: sparad sambandstyp</h4>
                                <RelationshipTypeDetails
                                  type={
                                    conflict.kind === 'relationshipType' ? conflict.current : null
                                  }
                                />
                                {conflict.kind === 'relationshipType' && conflict.current && (
                                  <>
                                    <h4>Mitt förslag med oberoende rättelser bevarade</h4>
                                    <RelationshipTypeDetails
                                      type={resolvedRelationshipType(change, conflict.current)}
                                    />
                                  </>
                                )}
                                <p>
                                  Välj definition för utkastet. Oberoende rättelser bevaras när du
                                  behåller ditt förslag. Granska hela utkastet före ett nytt
                                  sparbesked.
                                </p>
                                {change.after && (
                                  <button
                                    type="button"
                                    disabled={pending || blocked || legacyDirty}
                                    onClick={() => {
                                      if (!change.after) return;
                                      editRelationshipType(change.after);
                                      onSettings?.('types');
                                    }}
                                  >
                                    Rätta sambandstypen
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={pending || blocked || dirty}
                                  onClick={() =>
                                    void action('resolve', {
                                      version: state.draft.version,
                                      contentVersion: state.contentVersion,
                                      conflict,
                                      choice: 'saved',
                                    })
                                  }
                                >
                                  Använd sparad sambandstyp
                                </button>
                                <button
                                  type="button"
                                  disabled={pending || blocked || dirty}
                                  onClick={() =>
                                    void action('resolve', {
                                      version: state.draft.version,
                                      contentVersion: state.contentVersion,
                                      conflict,
                                      choice: 'proposed',
                                    })
                                  }
                                >
                                  Behåll min sambandstyp
                                </button>
                              </div>
                            ))}
                        </article>
                      ))}
                      {state.draft.objectTypes?.map((change) => (
                        <article key={change.id}>
                          <h3 id={draftEntryId('objectType', change.id)} tabIndex={-1}>
                            {!change.after
                              ? 'Borttagen objekttyp'
                              : change.before
                                ? 'Ändrad objekttyp'
                                : change.restoreRevision !== undefined
                                  ? 'Återställ objekttyp'
                                  : 'Ny objekttyp'}
                            : {change.after?.name ?? change.before?.name}
                          </h3>
                          <h4>Sparat underlag</h4>
                          <ObjectTypeDetails type={change.before} />
                          <h4>Förslag</h4>
                          <ObjectTypeDetails type={change.after} />
                          <button
                            type="button"
                            disabled={pending || blocked || dirty}
                            onClick={() =>
                              void action('discard-change', {
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                kind: 'objectType',
                                id: change.id,
                              })
                            }
                          >
                            Kasta förslaget
                          </button>
                          {conflicts
                            .filter(
                              (conflict) =>
                                conflict.kind === 'objectType' && conflict.id === change.id,
                            )
                            .map((conflict) => (
                              <div key={conflict.id}>
                                <h4>Konflikt: sparad typdefinition</h4>
                                <ObjectTypeDetails
                                  type={conflict.kind === 'objectType' ? conflict.current : null}
                                />
                                <p>
                                  Välj definition för utkastet och granska hela utkastet före ett
                                  nytt sparbesked.
                                </p>
                                {change.after && (
                                  <button
                                    type="button"
                                    disabled={pending || blocked || legacyDirty}
                                    onClick={() => {
                                      if (!change.after) return;
                                      editObjectType(change.after);
                                      onSettings?.('types');
                                    }}
                                  >
                                    Rätta objekttypen
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={pending || blocked || dirty}
                                  onClick={() =>
                                    void action('resolve', {
                                      version: state.draft.version,
                                      contentVersion: state.contentVersion,
                                      conflict,
                                      choice: 'saved',
                                    })
                                  }
                                >
                                  Använd sparad typdefinition
                                </button>
                                <button
                                  type="button"
                                  disabled={pending || blocked || dirty}
                                  onClick={() =>
                                    void action('resolve', {
                                      version: state.draft.version,
                                      contentVersion: state.contentVersion,
                                      conflict,
                                      choice: 'proposed',
                                    })
                                  }
                                >
                                  Behåll min typdefinition
                                </button>
                              </div>
                            ))}
                        </article>
                      ))}
                      {state.draft.changes.map((change) => (
                        <article key={change.id}>
                          <h3 id={draftEntryId('object', change.id)} tabIndex={-1}>
                            {!change.after
                              ? 'Borttagning'
                              : !change.before
                                ? 'Nytt objekt'
                                : 'Ändring'}
                            : {change.after?.name ?? change.before?.name}
                          </h3>
                          {change.merge && (
                            <div>
                              <h4>Sammanslagning</h4>
                              <MergeSourceDetails merge={change.merge} />
                              <p>
                                Identitet {change.merge.absorbedId} tas in i{' '}
                                {change.merge.survivorId}.
                              </p>
                              <p>
                                {change.merge.identityConfirmed
                                  ? 'Samma företeelse är uttryckligen bekräftad.'
                                  : 'Identiteten är inte bekräftad. Hela sparandet är blockerat.'}
                              </p>
                              <p>
                                För att rätta: kasta sammanslagningen, rätta eventuella tidigare
                                förslag och välj objekten igen. Tidigare egna förslag återkommer;
                                övriga förslag finns kvar.
                              </p>
                              <button
                                type="button"
                                disabled={pending || blocked || dirty}
                                onClick={() =>
                                  void action('discard-change', {
                                    version: state.draft.version,
                                    contentVersion: state.contentVersion,
                                    kind: 'object',
                                    id: change.id,
                                  })
                                }
                              >
                                Kasta sammanslagningen för att rätta
                              </button>
                            </div>
                          )}
                          <h4>Sparat underlag</h4>
                          {details(
                            change.before,
                            change.beforeType ??
                              state.types.find((type) => type.id === change.before?.typeId) ??
                              change.type,
                          )}
                          {change.before &&
                            change.after &&
                            change.before.typeId !== change.after.typeId && (
                              <p>
                                Typbyte: objektets identitet och samband finns kvar. Tidigare
                                fältvärden ersätts av den nya typens uppgifter i förslaget.
                              </p>
                            )}
                          <h4>Förslag</h4>
                          {details(change.after, change.type)}
                          {change.after?.identity === 'unresolved' &&
                            !mergeFor(state.draft, 'object', change.id) && (
                              <button
                                type="button"
                                disabled={pending || blocked || legacyDirty}
                                onClick={() => {
                                  const object = displayed.get(change.id);
                                  if (object) edit(object);
                                }}
                              >
                                Red ut identiteten för {change.after.name}
                              </button>
                            )}
                          <button
                            type="button"
                            disabled={pending || blocked || dirty}
                            onClick={() =>
                              void action('discard-change', {
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                kind: 'object',
                                id: change.id,
                              })
                            }
                          >
                            {mergeFor(state.draft, 'object', change.id)
                              ? 'Kasta hela sammanslagningen'
                              : 'Kasta förslaget'}
                          </button>
                          {conflicts
                            .filter(
                              (conflict) => conflict.kind === 'object' && conflict.id === change.id,
                            )
                            .map((conflict) => (
                              <div key={conflict.id}>{conflictReview(conflict)}</div>
                            ))}
                        </article>
                      ))}
                      {(state.draft.relationships ?? []).map((change) => (
                        <article key={change.id}>
                          <h3 id={draftEntryId('relationship', change.id)} tabIndex={-1}>
                            {change.after ? 'Samband' : 'Borttagning av samband'}
                          </h3>
                          <h4>Sparat underlag</h4>
                          <p>
                            {change.before
                              ? relationshipLabel(
                                  change.before,
                                  state,
                                  new Map([
                                    ...savedObjects,
                                    ...Object.entries(change.objectNames ?? {}).map(
                                      ([id, name]) => [id, { name }] as const,
                                    ),
                                  ]),
                                )
                              : 'Finns inte i kartan'}
                          </p>
                          {change.before && (
                            <>
                              <CustomFieldsDetails
                                type={
                                  change.beforeType ??
                                  state.relationshipTypes.find(
                                    (type) => type.id === change.before?.typeId,
                                  ) ??
                                  change.type
                                }
                                values={change.before.customValues}
                                showHidden
                              />
                              <LifecycleDetails value={change.before} />
                            </>
                          )}
                          <h4>Förslag</h4>
                          <p>
                            {change.after
                              ? relationshipLabel(
                                  change.after,
                                  { ...state, relationshipTypes: [change.type] },
                                  new Map([
                                    ...Object.entries(change.objectNames ?? {}).map(
                                      ([id, name]) => [id, { name }] as const,
                                    ),
                                    ...displayed,
                                  ]),
                                )
                              : 'Borttaget'}
                          </p>
                          {change.after && (
                            <>
                              <CustomFieldsDetails
                                type={change.type}
                                values={change.after.customValues}
                                showHidden
                              />
                              <LifecycleDetails value={change.after} />
                            </>
                          )}
                          <button
                            type="button"
                            disabled={pending || blocked || dirty}
                            onClick={() =>
                              void action('discard-change', {
                                version: state.draft.version,
                                contentVersion: state.contentVersion,
                                kind: 'relationship',
                                id: change.id,
                              })
                            }
                          >
                            {mergeFor(state.draft, 'relationship', change.id)
                              ? 'Kasta hela sammanslagningen'
                              : 'Kasta förslaget'}
                          </button>
                          {conflicts
                            .filter(
                              (conflict) =>
                                conflict.kind === 'relationship' && conflict.id === change.id,
                            )
                            .map((conflict) => (
                              <div key={conflict.id}>{conflictReview(conflict)}</div>
                            ))}
                        </article>
                      ))}
                      {unresolved && (
                        <p role="alert">
                          Obesvarad identitetsfråga: välj rätt objekt eller uttryckligen ett
                          ospecificerat objekt före sparande.
                        </p>
                      )}
                      {dirty && (
                        <p>
                          Lägg formulärets text i utkastet eller stäng formuläret innan du sparar
                          eller kastar utkastet.
                        </p>
                      )}
                      <div className="access-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={
                            assistant.working ||
                            assistant.needsAnswer ||
                            pending ||
                            blocked ||
                            dirty ||
                            !hasChanges ||
                            unresolved ||
                            conflicts.length > 0
                          }
                          onClick={saveDraft}
                        >
                          Spara hela utkastet
                        </button>
                        <button
                          type="button"
                          disabled={pending || blocked || dirty || !hasChanges}
                          onClick={() => void action('discard', { version: state.draft.version })}
                        >
                          Kasta hela utkastet
                        </button>
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            </>
          )}
        </ConversationWorkspace>
      )}
    </section>
  );
}
