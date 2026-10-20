import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { conversationWidths } from '../shared/conversation-preferences.js';
import { type DraftConflict, draftConflicts } from '../shared/draft-conflicts.js';
import { hasEnded } from '../shared/lifecycle.js';
import type {
  MapDraft,
  MapObject,
  MapRelationship,
  MapState,
  ObjectType,
  RelationshipType,
  SaveOperation,
} from '../shared/map.js';
import {
  effectiveRelationships,
  proposedObjectTypes,
  proposedRelationships,
  proposedRelationshipTypes,
} from '../shared/map.js';
import type { RelationshipFormResult } from '../shared/relationship-form.js';
import type { MapSelection } from '../shared/text-assistant.js';
import { ConflictDialog } from './ConflictDialog.js';
import { DraftReview } from './DraftReview.js';
import { DraftSaveDialog, DraftSaveFollowUp } from './DraftSaveDialog.js';
import { DraftStatus } from './DraftStatus.js';
import { useFloatingArea } from './floating-windows.js';
import {
  HouseholdReadDialog,
  type HouseholdReadEntry,
  householdReadRelationships,
} from './HouseholdReadDialog.js';
import { HouseholdTable, householdTableRows } from './HouseholdTable.js';
import './draft-status.css';
import { relationshipLabel } from '../shared/relationship-label.js';
import { ConversationConsent } from './ConversationConsent.js';
import {
  ConversationNoticeAnnouncements,
  ConversationNoticeCard,
  useConversationNotice,
} from './ConversationNotice.js';
import { ConversationSettings } from './ConversationSettings.js';
import { useFormLeave } from './FormLeave.js';
import { MapLegend } from './MapLegend.js';
import { MapSelectionDetails } from './MapSelectionDetails.js';
import { type MapRevealRequest, waitForMapDisplay } from './map-display.js';
import { mapConnections } from './map-presentation.js';
import { MapRequestError, request } from './map-request.js';
import { mapSearchContext } from './map-search-context.js';
import { ObjectActions, type ObjectActionsEntry } from './ObjectActions.js';
import { ObjectDialog } from './ObjectDialog.js';
import { ObjectRemovalNotice } from './ObjectRemovalNotice.js';
import {
  initialObjectSearch,
  MapSearchContext,
  ObjectSearch,
  type ObjectSearchState,
  objectSearchResults,
  searchRestricted,
  useDraftFilterReset,
} from './ObjectSearch.js';
import { ObjectTypeEditor } from './ObjectTypes.js';
import type { ObjectEditor } from './object-editor.js';
import { RelationshipTypeEditor } from './RelationshipTypes.js';
import { Reports } from './Reports.js';
import { rejectionMessage } from './SaveOperations.js';
import { SpatialMap } from './SpatialMap.js';
import { ConversationWorkspace, conversationFeedback } from './TextAssistant.js';
import type { TextOpeningFocus } from './TextView.js';
import { useHouseholdWork } from './use-household-work.js';
import { VoiceBox, VoiceStatusAnnouncements } from './VoiceBox.js';
import {
  textViewButtonName,
  WorkspaceIcon,
  type WorkspaceTarget,
  WorkspaceTools,
} from './WorkspaceTools.js';
import './workspace.css';
import './map-legend.css';
import './text-view.css';
import { type ConversationMode, conversationOngoing } from './use-conversation.js';
import { useConversationViewport } from './use-conversation-viewport.js';
import { useTextButtonStatus } from './use-text-button-status.js';
import { useWorkspaceTheme, WorkspaceTheme } from './WorkspaceTheme.js';

function draftEntryId(kind: DraftConflict['kind'], id: string) {
  return `draft-entry-${kind}-${id}`;
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
  useLayoutEffect(() => {
    const target = typeSettingsTarget;
    if (target && typeHost.parentElement !== target) target.append(typeHost);
  });
  const {
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
    setFocusId,
    setMapUnfiltered,
    cameraFocusRequest,
    setCameraFocusRequest,
    isCurrent,
  } = useHouseholdWork({
    householdId,
    contentVersion,
    onContentReplaced,
    onAccessLost: () => {
      revealAbort.current?.abort();
      setDetailsOpen(false);
      setObjectWindows([]);
      setObjectActions(null);
      setTypeEditor(null);
      setEdgeTypeEditor(null);
      setDirty(false);
    },
    onSaved: () => {
      if (!dirty) {
        setTypeEditor(null);
        setEdgeTypeEditor(null);
      }
    },
    onConversationStarted: (mode) => {
      if (mode === 'text') showConversation();
    },
    onConversationEnded: () => {
      if (document.activeElement?.closest('.text-view')) closeTextView();
      else setTextViewOpen(false);
    },
    onSelectItem: (target, signal) => revealAssistantItem(target, signal),
  });
  const [draftRemovalStatus, setDraftRemovalStatus] = useState('');
  const [objectActions, setObjectActions] = useState<ObjectActionsEntry | null>(null);
  const [objectDialog, setObjectDialog] = useState<ObjectEditor | null>(null);
  const [objectFormDirty, setObjectFormDirty] = useState(false);
  const [relationshipFormDirty, setRelationshipFormDirty] = useState(false);
  const { requestLeave } = useFormLeave();
  const objectReturnFocus = useRef<(() => void) | undefined>(undefined);
  const [conflictResolutionStatus, setConflictResolutionStatus] = useState('');
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
  const [reportSelection, setReportSelection] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    return query.get('report') === 'history' && query.get('save') && query.get('savedBy')
      ? { operationId: query.get('save') as string, userId: query.get('savedBy') as string }
      : undefined;
  });
  const [workspaceSurface, setWorkspaceSurface] = useState<'map' | 'table' | 'reports'>(() =>
    new URLSearchParams(window.location.search).get('report') === 'history' ? 'reports' : 'map',
  );
  const reportReturnSurface = useRef<'map' | 'table'>('map');
  const reportReturnFocus = useRef<HTMLElement | null>(null);
  const [readEntry, setReadEntry] = useState<HouseholdReadEntry | null>(null);
  const [exploredIds, setExploredIds] = useState<string[]>([]);
  const [mapSearchEntryRequestId, setMapSearchEntryRequestId] = useState(0);
  function requestMapSearch() {
    setMapSearchEntryRequestId((previous) => previous + 1);
  }
  function changeMapSearch(next: ObjectSearchState) {
    setBrowsing((previous) => ({ ...previous, ...next }));
    setMapUnfiltered(false);
    setExploredIds([]);
  }
  const workspace = useRef<HTMLElement>(null);
  const floatingArea = useFloatingArea(workspace);
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
    if (!active) {
      routeOutsideFocus.current = lastOutsideFocus.current;
      setObjectActions(null);
    }
  }, [active]);
  useEffect(() => {
    const returning = active && !previousActive.current;
    previousActive.current = active;
    if (returning && !profileRequested) restoreOutsideFocus(routeOutsideFocus.current);
  });
  const [revealRequest, setRevealRequest] = useState<MapRevealRequest>();
  const [mapAvailable, setMapAvailable] = useState(true);
  const [cameraMount, setCameraMount] = useState<HTMLDivElement | null>(null);
  const [labelMount, setLabelMount] = useState<HTMLDivElement | null>(null);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationMount, setNavigationMount] = useState<HTMLDivElement | null>(null);
  const revealAbort = useRef<AbortController | null>(null);
  useEffect(() => () => revealAbort.current?.abort(), []);
  const workTrigger = useRef<HTMLElement | null>(null);
  const [textViewOpen, setTextViewOpen] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<'map' | 'navigation' | 'text'>('map');
  const [textFocusRequest, setTextFocusRequest] = useState(0);
  const [draftViewOpen, setDraftViewOpen] = useState(false);
  const [draftOpenRequest, setDraftOpenRequest] = useState(0);
  const [textOpeningFocus, setTextOpeningFocus] = useState<TextOpeningFocus>('text');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [objectWindows, setObjectWindows] = useState<
    {
      id: string;
      order: number;
      focus: number;
      offset: number;
      restoreFocus: () => void;
    }[]
  >([]);
  const nextWindowOrder = useRef(0);
  const viewport = useConversationViewport();
  const { narrow } = viewport;
  const widths = conversationWidths(
    conversationPreferences.preferences,
    viewport.width,
    draftViewOpen,
  );
  const textViewWidth = narrow
    ? viewport.width
    : viewport.mobile
      ? 400
      : widths.textWidth + (draftViewOpen ? widths.draftWidth : 0);
  const exclusiveViews = narrow || viewport.width - textViewWidth < 350;
  const textViewVisible =
    workspaceSurface !== 'reports' &&
    textViewOpen &&
    (!exclusiveViews || workspaceView === 'text') &&
    !(narrow && revealRequest);
  // Limited space switches complete views; it never narrows a work window.
  const navigationCovered = exclusiveViews && textViewVisible;
  const mapCovered =
    narrow && textViewVisible && !revealRequest && !(navigationOpen && !navigationCovered);
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
    return target === 'voice' ? 'voice' : null;
  }
  function openWork(target: WorkspaceTarget, chosen?: HTMLElement) {
    if (target === 'reports') {
      if (workspaceSurface !== 'reports') reportReturnSurface.current = workspaceSurface;
      reportReturnFocus.current = chosen ?? null;
      setWorkspaceSurface('reports');
      return;
    }
    requestLeave(() => {
      setObjectDialog(null);
      setReadEntry(null);
      openWorkConfirmed(target, chosen);
    });
  }
  function openWorkConfirmed(target: WorkspaceTarget, chosen?: HTMLElement) {
    if (target === 'map' || target === 'table') {
      setWorkspaceSurface(target);
      setWorkspaceView('map');
      return;
    }
    if (target === 'new') {
      edit();
      return;
    }
    workTrigger.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (target === 'voice' && conversation.inputBlocked && (target === 'voice' || !ongoing)) {
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
      if (conversation.inputBlocked) conversation.showNotice?.();
      // The text button opens and closes the text view.
      if (textViewVisible) closeTextView();
      else showConversation();
      return;
    }
    if (target === 'draft') {
      showConversation();
      setDraftOpenRequest((previous) => previous + 1);
      return;
    }
  }
  // Closing the text view ends nothing: the conversation, the microphone and
  // the unsent text stay.
  function closeTextView() {
    setTextViewOpen(false);
    setWorkspaceView('map');
    if (!restoreOutsideFocus(textViewButtonName)) focusTools();
  }
  const [typeFormDirty, setDirty] = useState(false);
  const dirty = typeFormDirty || objectFormDirty || relationshipFormDirty;
  const { query, types: typeFilter } = browsing;
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [conflictDialogKey, setConflictDialogKey] = useState<string>();
  const [conflictRecovery, setConflictRecovery] = useState(false);
  const [conflictLinksOpen, setConflictLinksOpen] = useState(false);
  function returnFromStatus() {
    routeOutsideFocus.current = null;
    if (!active) onReturnToMap?.();
  }
  function returnToImage(id?: string) {
    const object = id ? displayed.get(id) : undefined;
    if (object) edit(object);
    returnFromStatus();
  }
  function focusTools() {
    workspace.current
      ?.querySelector<HTMLElement>('.workspace-tools button[aria-label="Karta"]')
      ?.focus();
  }
  function focusNewObject() {
    workspace.current
      ?.querySelector<HTMLElement>('.workspace-tools button[aria-label="Nytt objekt"]')
      ?.focus({ preventScroll: true });
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
      workspace.current?.querySelector<HTMLElement>(
        '.workspace-tools button[aria-label="Karta"]',
      ) ?? null,
    );
  });
  const hasMap = state !== null;
  useLayoutEffect(() => {
    const measure = () => {
      workspace.current?.style.setProperty('--work-height', `${viewport.height}px`);
      workspace.current?.style.setProperty('--work-offset', `${viewport.offset}px`);
      for (const [selector, property] of [['.workspace-feedback', '--feedback-height']]) {
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
      const searchRow = workspace.current?.querySelector<HTMLElement>('.map-object-search');
      if (searchRow) {
        workspace.current?.style.setProperty(
          '--map-search-bottom',
          `${searchRow.getBoundingClientRect().bottom - viewport.offset}px`,
        );
      }
      const context = workspace.current?.querySelector<HTMLElement>('.workspace-context');
      if (context) {
        workspace.current?.style.setProperty(
          '--context-bottom',
          `${context.getBoundingClientRect().bottom - viewport.offset + 12}px`,
        );
      }
      const composer = workspace.current?.querySelector('.text-view-message');
      const inlineNotice = workspace.current?.querySelector<HTMLElement>('.text-view-notice-slot');
      const card = workspace.current?.querySelector<HTMLElement>('.conversation-notice');
      if (inlineNotice && card) {
        const slot = inlineNotice.getBoundingClientRect();
        card.style.setProperty('--notice-left', `${slot.left}px`);
        card.style.setProperty('--notice-top', `${slot.top}px`);
        card.style.setProperty('--notice-width', `${slot.width}px`);
        // Use the actual conversation column, not the toolbar's height: the
        // toolbar is vertical on a computer and can be taller than this view.
        const column = workspace.current?.querySelector('.text-view-conversation');
        const header = workspace.current?.querySelector('.text-view-header');
        if (column && composer && header) {
          const available =
            composer.getBoundingClientRect().top -
            Math.max(column.getBoundingClientRect().top, header.getBoundingClientRect().bottom);
          card.style.setProperty('--notice-available-height', `${Math.max(46, available - 28)}px`);
        }
        workspace.current?.style.setProperty('--notice-height', `${card.offsetHeight}px`);
      }
      if (composer)
        workspace.current?.style.setProperty(
          '--composer-top',
          `${(inlineNotice ?? composer).getBoundingClientRect().top - 4}px`,
        );
      const corner = workspace.current?.querySelector<HTMLElement>('.conversation-corner');
      const visibleTools = workspace.current?.querySelector<HTMLElement>('.workspace-tools');
      const cornerHeight = corner?.offsetHeight ?? 0;
      workspace.current?.style.setProperty(
        '--conversation-corner-width',
        `${corner?.offsetWidth ?? 0}px`,
      );
      const cornerBounds = cornerHeight ? corner?.getBoundingClientRect() : null;
      workspace.current?.style.setProperty(
        '--conversation-corner-top',
        `${cornerBounds ? cornerBounds.top - viewport.offset : 0}px`,
      );
      workspace.current?.style.setProperty(
        '--conversation-corner-bottom',
        `${cornerBounds ? cornerBounds.bottom - viewport.offset : 0}px`,
      );
      const minimumFloor = (visibleTools?.getBoundingClientRect().bottom ?? 0) + cornerHeight + 12;
      workspace.current?.style.setProperty(
        '--conversation-controls-bottom',
        `${minimumFloor + 8}px`,
      );
      const floor = Math.min(
        viewport.height + viewport.offset - 12,
        ...['.workspace-feedback', '.workspace-voice-controls']
          .map((selector) => workspace.current?.querySelector<HTMLElement>(selector))
          .filter((element): element is HTMLElement => Boolean(element?.offsetHeight))
          .map((element) => element.getBoundingClientRect().top),
      );
      // A tall corner must not cover conversation buttons when text closes.
      workspace.current?.style.setProperty('--conversation-floor', `${floor - 8}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    // The toolbar is shown only while the map is the active view.
    const measured = [
      '.workspace-feedback',
      active && '.workspace-tools',
      active && '.workspace-context',
      active && '.map-object-search',
      hasMap && '.workspace-voice-controls',
      textViewOpen && '.text-view-message',
      textViewOpen && '.text-view',
      textViewOpen && '.text-view-body',
      textViewOpen && '.text-view-notice-slot',
      '.conversation-notice',
      '.conversation-corner',
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
  useEffect(() => {
    if (!active || !textViewOpen) return;
    workspace.current?.style.setProperty('--work-height', `${viewport.height}px`);
    workspace.current?.style.setProperty('--work-offset', `${viewport.offset}px`);
    const frame = requestAnimationFrame(() => {
      const field = document.activeElement;
      const workSurface = workspace.current?.querySelector('.assistant-workspace');
      if (field instanceof HTMLElement && workSurface?.contains(field)) {
        const bounds = field.getBoundingClientRect();
        // Route return can already have restored a visible list result and
        // its exact scroll. Only reveal a target clipped by the viewport.
        if (bounds.top < viewport.offset || bounds.bottom > viewport.offset + viewport.height)
          field.scrollIntoView({ block: 'center', behavior: 'instant' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [active, textViewOpen, viewport.height, viewport.offset]);
  function reloadMap(origin: HTMLElement) {
    setProposalRecoveryFocus({
      origin,
      target:
        failedProposalOrigin.current ??
        workspace.current?.querySelector<HTMLElement>(
          '.workspace-tools button[aria-label="Karta"]',
        ) ??
        null,
    });
    setPending(true);
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
    if (!state || pending || blocked || dirty || conversation.working || conversation.needsAnswer)
      return;
    setSaveDialogOpen(true);
    void save({
      version: state.draft.version,
      operationId: crypto.randomUUID(),
      contentVersion: state.contentVersion,
      userId: state.userId,
      householdId,
    });
  }

  async function action(
    kind: 'draft' | 'relationship' | 'object-type' | 'relationship-type',
    body: unknown,
    retainObject?: (draft: MapDraft) => void,
  ) {
    if (!isCurrent() || !state || pending || blocked) return false;
    const submittedFocus = document.activeElement;
    setPending(true);
    setError('');
    setStatus('');
    try {
      const draft = await request<MapDraft & { existingId?: string }>(`${path}/${kind}`, {
        contentVersion: state.contentVersion,
        ...(body as Record<string, unknown>),
      });
      if (!isCurrent()) return false;
      if (draft.existingId) {
        const latest = await request<MapState>(path);
        if (!isCurrent()) return false;
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
        const latest = { ...state, draft };
        if (!isCurrent()) return false;
        setState(latest);
        setStatus('Förslaget finns i ditt privata utkast. Kartan är inte ändrad.');
      }
      failedProposalOrigin.current = null;
      if (retainObject) retainObject(draft);
      else {
        setTypeEditor(null);
        setEdgeTypeEditor(null);
        setDirty(false);
        setBlocked(false);
        if (document.activeElement === submittedFocus || document.activeElement === document.body) {
          focusNewObject();
        }
      }
      return true;
    } catch (failure) {
      if (!isCurrent()) return false;
      if (retainObject && submittedFocus instanceof HTMLElement) {
        failedProposalOrigin.current = submittedFocus;
        setProposalRecoveryFocus({ origin: submittedFocus, target: null });
      }
      if (
        failure instanceof MapRequestError &&
        [
          'duplicate_relationship',
          'invalid_properties',
          'invalid_type_definition',
          'invalid_relationship_type',
          'definition_in_use',
        ].includes(failure.code)
      ) {
        setError(rejectionMessage(failure.code));
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
      if (isCurrent()) setPending(false);
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
  const readRows = state ? householdTableRows(state, effectiveTypes) : [];
  useEffect(() => {
    const ids = new Set(readRows.map((row) => row.object.id));
    setObjectWindows((previous) => {
      const remaining = previous.filter((window) => ids.has(window.id));
      return remaining.length === previous.length ? previous : remaining;
    });
  }, [readRows]);
  const readRelationships = state ? householdReadRelationships(state, effectiveEdgeTypes) : [];
  const relationshipCounts = new Map<string, number>();
  for (const { value } of readRelationships) {
    relationshipCounts.set(value.sourceId, (relationshipCounts.get(value.sourceId) ?? 0) + 1);
    if (value.targetId && value.targetId !== value.sourceId)
      relationshipCounts.set(value.targetId, (relationshipCounts.get(value.targetId) ?? 0) + 1);
  }
  const conflicts = state ? draftConflicts(state) : [];
  const hasConflicts = conflicts.length > 0;
  const conflictFollowUp = conflictRecovery && conflicts.length === 0 && !conflictDialogOpen && (
    <button type="button" className="map-conflict" onClick={() => setConflictDialogOpen(true)}>
      Visa konfliktvalet
    </button>
  );
  useEffect(() => {
    if (!hasConflicts) setConflictLinksOpen(false);
  }, [hasConflicts]);
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
      value: proposal?.after ?? object ?? { typeId: effectiveTypes[0]?.id ?? '', name: '' },
    };
  }
  function edit(object?: MapObject, editing = true, restoreFocus?: () => void) {
    requestLeave(() => editConfirmed(object, editing, restoreFocus));
  }
  function editConfirmed(object?: MapObject, editing = true, restoreFocus?: () => void) {
    if (!state) return;
    if (!editing && object) {
      selectObject(object, 'include');
      openObjectWindow(object, restoreFocus);
      return;
    }
    setRevealRequest(undefined);
    const initial = objectEditor(object);
    if (editing) {
      objectReturnFocus.current = restoreFocus;
      setReadEntry(null);
      setObjectDialog(initial);
      return;
    }
  }
  function openObjectWindow(object: MapObject, restoreFocus?: () => void) {
    setDetailsOpen(false);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const order = ++nextWindowOrder.current;
    setObjectWindows((previous) => {
      const existing = previous.find((window) => window.id === object.id);
      if (existing)
        return previous.map((window) =>
          window.id === object.id ? { ...window, order, focus: order } : window,
        );
      return [
        ...previous,
        {
          id: object.id,
          order,
          focus: order,
          offset: previous.length,
          restoreFocus:
            restoreFocus ??
            (() => {
              if (
                opener?.isConnected &&
                opener.getClientRects().length &&
                !opener.closest('[hidden], [inert]')
              )
                opener.focus({ preventScroll: true });
              else workspace.current?.querySelector<HTMLElement>('canvas[tabindex]')?.focus();
            }),
        },
      ];
    });
  }
  const {
    displayed,
    displayedEdges,
    visibleObjects,
    visibleEdges,
    contextSource,
    searchHitIds,
    hiddenEnded,
    previousEdges,
    previousIds,
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
    const displayedEdges = state
      ? effectiveRelationships(state)
      : new Map<string, MapRelationship>();
    const spatialEdges = new Map(displayedEdges);
    for (const change of state?.draft.relationships ?? []) {
      if (!change.after && change.before) spatialEdges.set(change.id, change.before);
    }
    const mapRows = objectSearchResults(
      (state ? householdTableRows(state, effectiveTypes) : []).filter((row) => !row.removed),
      { ...browsing, query: '', types: [], onlySelected: false },
      selectedIds,
    );
    const hits = objectSearchResults(mapRows, browsing, selectedIds);
    const listIds = new Set(hits.map((row) => row.object.id));
    const previousEdges = state
      ? mapConnections(state.draft, displayed, spatialEdges)
          .filter((connection) => connection.previous)
          .map((connection) => connection.edge)
      : [];
    const contextSource = {
      objects: displayed,
      relationships: spatialEdges,
      previousRelationships: previousEdges,
    };
    const context = mapSearchContext(
      contextSource,
      listIds,
      exploredIds,
      Boolean(browsing.includeEnded),
    );
    return {
      displayed,
      displayedEdges,
      visibleObjects: context.objects,
      visibleEdges: context.relationships,
      contextSource,
      searchHitIds: listIds,
      hiddenEnded: context.hiddenEnded,
      previousEdges,
      previousIds: context.previousIds,
    };
  }, [state, householdId, effectiveTypes, selectedIds, browsing, exploredIds]);
  function showAll() {
    setBrowsing(initialObjectSearch);
    setMapUnfiltered(false);
    setFocusId(null);
    setExploredIds([]);
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
    setFocusId(null);
    setCameraFocusRequest({
      id: crypto.randomUUID(),
      objectIds: [...neighbors].filter((id) => displayed.has(id)),
    });
  }
  function revealObject(object: MapObject) {
    if (!mapAvailable) return;
    const context = mapSearchContext(contextSource, [object.id], [], true);
    const includeEnded =
      [...context.objects.values()].some((value) => hasEnded(value)) ||
      [...context.relationships.values()].some((value) => hasEnded(value)) ||
      previousEdges.some((value) => context.previousIds.has(value.id) && hasEnded(value));
    changeMapSearch({
      query: '',
      types: [],
      proposals: [],
      onlySelected: false,
      includeEnded,
    });
    setSelection({ kind: 'object', id: object.id });
    setWorkspaceSurface('map');
    setCameraFocusRequest({
      id: crypto.randomUUID(),
      objectIds: [...context.objects.keys()],
    });
    requestAnimationFrame(() =>
      workspace.current?.querySelector<HTMLElement>('canvas[tabindex]')?.focus(),
    );
  }
  function focusObject(id: string) {
    setFocusId(id);
    setExploredIds((previous) => [...new Set([...previous, id])]);
    setSelection({ kind: 'object', id });
    const context = mapSearchContext(contextSource, [id], [], Boolean(browsing.includeEnded));
    setCameraFocusRequest({ id: crypto.randomUUID(), objectIds: [...context.objects.keys()] });
    setStatus(
      `Visar direkta samband för ${displayed.get(id)?.name}. Sökningen och tidigare innehåll finns kvar.`,
    );
  }
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
    return {
      id: draftEntryId(conflict.kind, conflict.id),
      key: `${conflict.kind}:${conflict.id}`,
      label,
      entityId: conflict.id,
    };
  });
  const hasChanges = Boolean(
    state &&
      (state.draft.changes.length ||
        state.draft.relationships?.length ||
        state.draft.objectTypes?.length ||
        state.draft.relationshipTypes?.length),
  );
  const mapSearchNotice = useDraftFilterReset(hasChanges, browsing, changeMapSearch);
  const pendingOperation = operations.find((operation) => operation.status === 'pending');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  useEffect(() => {
    if (saveProgress?.status === 'succeeded') setSaveDialogOpen(false);
  }, [saveProgress]);
  const unresolved = state?.draft.changes.some((change) => change.after?.identity === 'unresolved');
  function editRelationship(edge?: MapRelationship, previous = false) {
    if (!state) return;
    if (previous) return;
    const object = edge
      ? displayed.get(edge.sourceId)
      : (selectedObject ?? readRows.find((row) => !row.removed)?.object);
    if (!object) {
      setStatus('Skapa ett objekt separat med Nytt objekt innan du lägger till ett samband.');
      return;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestLeave(() => {
      setTypeEditor(null);
      setEdgeTypeEditor(null);
      setDirty(false);
      setObjectDialog(null);
      setReadEntry({
        kind: 'relationships',
        id: object.id,
        ...(edge ? { relationshipId: edge.id } : { startNewRelationship: true }),
        restoreFocus: () => {
          if (opener?.isConnected && !opener.matches(':disabled'))
            opener.focus({ preventScroll: true });
          else focusNewObject();
        },
      });
    });
  }
  function editObjectType(type: ObjectType) {
    if (!state || typeFormDirty) return;
    const proposal = state.draft.objectTypes?.find((item) => item.id === type.id);
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
    if (!state || typeFormDirty) return;
    const proposal = state.draft.relationshipTypes?.find((item) => item.id === type.id);
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
    if (typeFormDirty) return;
    setTypeEditor(null);
    setEdgeTypeEditor(null);
  }
  function selectRelationship(edge: MapRelationship, previous = false) {
    setSelection({ kind: 'relationship', id: edge.id, previous });
    if (typeFormDirty) return;
    setTypeEditor(null);
    setEdgeTypeEditor(null);
  }
  const selectedObject = selection?.kind === 'object' ? displayed.get(selection.id) : undefined;
  const selectedEdge =
    selection?.kind === 'relationship'
      ? selection.previous
        ? previousEdges.find((edge) => edge.id === selection.id)
        : displayedEdges.get(selection.id)
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
    setWorkspaceSurface('map');
    if (object) {
      selectObject(object, 'include');
      openObjectWindow(object);
    } else if (edge) {
      selectRelationship(edge);
      setDetailsOpen(true);
    }
    setRevealRequest(request);
    try {
      return await waitForMapDisplay(workspace.current, request, target, abort.signal);
    } finally {
      signal.removeEventListener('abort', cancel);
      setRevealRequest((current) =>
        current?.id === request.id ? { ...current, complete: true } : current,
      );
    }
  }
  // The household work owns the conversation. Views only choose where to
  // show its text, voice, notice and controls.
  function showConversation() {
    if (workspaceSurface === 'reports') setWorkspaceSurface(reportReturnSurface.current);
    setRevealRequest(undefined);
    setTextOpeningFocus('text');
    setTextViewOpen(true);
    setWorkspaceView('text');
    setTextFocusRequest((previous) => previous + 1);
  }
  const textButton = useTextButtonStatus(conversation, textViewVisible && active, active);
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
      inline={textViewVisible && active}
    />
  );
  const voiceBox = (
    <VoiceBox
      conversation={conversation}
      announce={false}
      notice={notice}
      hideStop={textViewVisible && !viewport.computer && conversation.working}
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
    if (!state || pending || blocked || dirty) return;
    const changes = kind === 'draft' ? state.draft.changes : state.draft.relationships;
    const proposal = changes?.find((change) => change.id === item.id);
    return action(
      kind,
      {
        id: item.id,
        version: state.draft.version,
        contentVersion: state.contentVersion,
        baseRevision: proposal ? (proposal.before?.revision ?? null) : item.revision,
        value: null,
      },
      () => {},
    );
  }

  const workStatus = status && !pending && !error && (
    <p
      role="status"
      aria-label="Hushållsarbetets status"
      aria-live={status.startsWith('Sparat:') ? 'off' : 'polite'}
      aria-atomic="true"
    >
      {status}
    </p>
  );

  return (
    <section
      ref={workspace}
      tabIndex={-1}
      className={`household-map${active ? ' workspace-shell' : ''}${textViewVisible ? ' text-view-open' : ''}${revealRequest && !navigationOpen ? ' workspace-revealing' : ''}${detailsOpen && selectedEdge ? ' map-details-open' : ''}`}
      onFocusCapture={(event) => {
        if (
          !active ||
          !event.currentTarget.contains(event.target) ||
          !(event.target instanceof HTMLElement) ||
          event.target.closest('.workspace-utility, .workspace-tools-footer, [data-secondary]')
        )
          return;
        if (event.target.closest('.map-navigation')) setWorkspaceView('navigation');
        if (event.target.closest('.text-view')) setWorkspaceView('text');
        lastOutsideFocus.current = event.target.closest('.workspace-tools')
          ? event.target.classList.contains('workspace-text')
            ? textViewButtonName
            : event.target.getAttribute('aria-label')
          : event.target;
      }}
      aria-label="Hushållskarta"
      data-workspace-surface={workspaceSurface}
      data-empty-map={
        (Boolean(state) && !visibleObjects.size && !query && !typeFilter.length) || undefined
      }
      data-navigation-open={navigationOpen}
      data-workspace-view={workspaceView}
      data-conversation-ongoing={conversationOngoing(conversation, textViewOpen)}
      data-mobile={viewport.mobile}
      data-narrow={narrow}
      data-short={viewport.short}
      data-work-layout={
        viewport.height <= 180
          ? 'minimal'
          : viewport.height <= 450
            ? 'compact'
            : viewport.height <= 600
              ? 'short'
              : 'tall'
      }
      data-wide-touch={viewport.wideTouch}
      data-theme={theme.theme}
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
      <p
        className="visually-hidden"
        role="status"
        aria-label="Sparbekräftelse"
        aria-live="polite"
        aria-atomic="true"
      >
        {saveToast.announcementOperationId && (
          <span key={saveToast.announcementOperationId}>Utkastet är sparat</span>
        )}
      </p>
      {saveToast.operationId && (
        <p className="draft-save-toast" aria-hidden="true">
          Utkastet är sparat
        </p>
      )}
      {active && (
        <>
          <a className="skip-link" href="#workspace-tools">
            Till verktygen
          </a>
          <button type="button" className="skip-link" onClick={() => openWork('table')}>
            Till tabellen
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
            textViewOpen={textViewVisible}
            hasDraft={hasChanges}
            textButton={textButton}
            cameraMount={setCameraMount}
            expanded={toolsExpanded}
            onExpandedChange={setToolsExpanded}
            onOpen={openWork}
            surface={workspaceSurface}
            workDisabled={!state || pending || blocked}
            account={account}
            profileRequested={profileRequested}
            onReturnWork={() => restoreOutsideFocus(lastOutsideFocus.current)}
            onSettings={
              onSettings
                ? () =>
                    requestLeave(() => {
                      setToolsExpanded(false);
                      onSettings();
                    })
                : undefined
            }
            theme={<WorkspaceTheme mode={theme.mode} onChange={theme.changeMode} />}
          />
          <ConversationConsent conversation={conversation} chosen={conversationChoice} />
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need to scroll the map's status and legend. */}
          <section className="workspace-context" aria-label="Kartans sammanhang" tabIndex={0}>
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
            <section aria-label="Kartans status" className="map-status">
              {workspaceSurface === 'map' && workStatus}
              {conflictFollowUp}
              <DraftSaveFollowUp
                progress={saveProgress}
                hidden={saveDialogOpen}
                onOpen={() => setSaveDialogOpen(true)}
              />
              <p aria-live="polite" aria-atomic="true">
                {conversationFeedback(conversation)}
              </p>
              <p aria-live="polite" aria-atomic="true">
                {!state && !error
                  ? 'Hushållets karta hämtas…'
                  : pending
                    ? saveAttempt.current
                      ? 'Väntar på sparkvitto'
                      : 'Hämtar aktuellt underlag…'
                    : ''}
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {(saveAttempt.current || pendingOperation) && blocked && !pending && (
                <p>Sparutfall okänt. Kontrollera samma sparförsök innan du sparar mer.</p>
              )}
              <p aria-live="polite" aria-atomic="true">
                {unresolved &&
                  'Sparandet är blockerat: granska identiteter och okända samband i utkastet och skapa ett nytt förslag via vanliga formulär.'}
              </p>
              {(saveAttempt.current || pendingOperation) && blocked && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (saveAttempt.current) void save(saveAttempt.current, true);
                    else if (pendingOperation) retrySave(pendingOperation);
                  }}
                >
                  Hämta samma kvitto igen
                </button>
              )}
              {(error || blocked) && (
                <button
                  type="button"
                  disabled={pending}
                  data-refresh-map
                  onClick={(event) => reloadMap(event.currentTarget)}
                >
                  Hämta aktuellt underlag
                </button>
              )}
              {errorDetails.imageObjectId && (
                <button type="button" onClick={() => returnToImage(errorDetails.imageObjectId)}>
                  Återgå till bilden för{' '}
                  {displayed.get(errorDetails.imageObjectId)?.name ?? 'objektet'}
                </button>
              )}
              {conflicts.length > 0 && (
                <button
                  type="button"
                  className="map-conflict"
                  onClick={() => {
                    setConflictDialogKey(undefined);
                    setConflictDialogOpen(true);
                  }}
                >
                  <span aria-hidden="true">⚠</span> {conflicts.length}{' '}
                  {conflicts.length === 1 ? 'konflikt' : 'konflikter'} i ditt utkast
                </button>
              )}
            </section>
            <div
              className="workspace-label-feedback"
              ref={setLabelMount}
              hidden={workspaceSurface !== 'map'}
            />
            {state && workspaceSurface === 'map' && (
              <MapSearchContext
                search={browsing}
                onChange={changeMapSearch}
                notice={mapSearchNotice}
                contextCount={Math.max(0, visibleObjects.size - searchHitIds.size)}
                hiddenEnded={hiddenEnded}
                explored={exploredIds.length > 0}
                onReturnToHits={() => {
                  setFocusId(null);
                  setExploredIds([]);
                  const context = mapSearchContext(
                    contextSource,
                    searchHitIds,
                    [],
                    Boolean(browsing.includeEnded),
                  );
                  setCameraFocusRequest({
                    id: crypto.randomUUID(),
                    objectIds: [...context.objects.keys()],
                  });
                  workspace.current?.querySelector<HTMLElement>('canvas[tabindex]')?.focus();
                }}
              />
            )}
            {state && (
              <MapLegend
                draft={state.draft}
                objects={visibleObjects}
                relationships={visibleEdges}
                selectedIds={selectedIds}
                previousIds={previousIds}
              />
            )}
          </section>
        </>
      )}
      {/* Outside the map, where its tools are not shown, the voice box still says what the voice does. */}
      {!active && voiceBox}
      <VoiceStatusAnnouncements
        conversation={conversation}
        announceSaved={!active}
        textViewOpen={textViewVisible && active}
        microphoneOffExplained={noticeState.notice?.id === 'disconnectedActive'}
        microphoneButton={() =>
          workspace.current?.querySelector<HTMLElement>('.workspace-talk') ?? null
        }
      />
      <ConversationNoticeAnnouncements announcement={noticeState.announcement} />
      <p
        className="visually-hidden"
        role="status"
        aria-label="Utkastets åtgärdsstatus"
        aria-atomic="true"
        hidden={!active}
      >
        {draftRemovalStatus}
      </p>
      <p
        className="visually-hidden"
        role="status"
        aria-label="Konfliktvalens status"
        aria-live={conflictDialogOpen ? 'off' : 'polite'}
        aria-atomic="true"
        hidden={!active}
      >
        {conflictResolutionStatus}
      </p>
      <p className="visually-hidden text-button-announcement" aria-live="polite" aria-atomic="true">
        <span key={textButton.announcement.count}>{textButton.announcement.text}</span>
      </p>
      {!active && (
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
          <p
            role="status"
            aria-live={status.startsWith('Sparat:') ? 'off' : 'polite'}
            aria-label="Hushållsarbetets status"
          >
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
      )}
      <div
        className="workspace-navigation-mount"
        ref={setNavigationMount}
        hidden={!active || workspaceSurface !== 'map'}
      />
      {state && (
        <div hidden={!active || workspaceSurface !== 'map' || mapCovered}>
          <ObjectSearch
            active={active && workspaceSurface === 'map' && !mapCovered}
            entryRequestId={mapSearchEntryRequestId}
            search={browsing}
            onChange={changeMapSearch}
            onReturnToMap={() =>
              workspace.current?.querySelector<HTMLElement>('canvas[tabindex]')?.focus()
            }
            types={effectiveTypes}
            selectedIds={selectedIds}
            hasProposals={hasChanges}
            matchingCount={searchHitIds.size}
          />
        </div>
      )}
      {state && (
        <div
          className="map-space"
          hidden={!active || workspaceSurface !== 'map'}
          inert={mapCovered}
          aria-hidden={mapCovered}
        >
          <SpatialMap
            previousIds={previousIds}
            searchHitIds={searchRestricted(browsing) ? searchHitIds : undefined}
            onSearchClear={() => changeMapSearch(initialObjectSearch)}
            onSearchStart={(text) => {
              changeMapSearch({ ...browsing, query: text });
              requestMapSearch();
            }}
            cameraMount={cameraMount}
            labelMount={labelMount}
            navigationMount={navigationMount}
            onNavigationChange={(open) => {
              setNavigationOpen(open);
              if (open) setWorkspaceView('navigation');
            }}
            navigationHidden={navigationCovered}
            navigationFocus={workspaceView === 'navigation'}
            floatingArea={floatingArea}
            onCameraAction={() => setToolsExpanded(false)}
            theme={theme.theme}
            revealRequest={revealRequest}
            focusRequest={cameraFocusRequest}
            resetAvailable={Boolean(
              browsing.query ||
                browsing.types.length ||
                browsing.proposals?.length ||
                browsing.onlySelected ||
                browsing.includeEnded ||
                selection ||
                exploredIds.length,
            )}
            onAvailabilityChange={setMapAvailable}
            personal={personal}
            settingsMount={mapSettingsTarget}
            active={active && workspaceSurface === 'map' && !mapCovered}
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
            onOpenRelationshipDetails={(edge, previous) => {
              selectRelationship(edge, previous);
              setDetailsOpen(true);
            }}
            onFocus={focusObject}
            onClear={clearSelection}
            onReset={() => {
              showAll();
              setStatus('Översikt återställd. Alla objekt visas.');
            }}
            onObjectActions={(entry) => requestLeave(() => setObjectActions(entry))}
            onRemove={(object) => remove('draft', object)}
          />
        </div>
      )}
      <div
        className="object-property-layer"
        hidden={!active || workspaceSurface !== 'map' || (navigationCovered && !revealRequest)}
      >
        {state &&
          objectWindows.map((window) => {
            const row = readRows.find((row) => row.object.id === window.id);
            if (!row) return null;
            return (
              <MapSelectionDetails
                key={window.id}
                object={row}
                state={effectiveState ?? state}
                objects={displayed}
                active={
                  active &&
                  workspaceSurface === 'map' &&
                  (!navigationCovered || Boolean(revealRequest))
                }
                order={window.order}
                focusRequest={window.focus}
                offset={window.offset}
                disabled={pending || blocked || dirty}
                mapAvailable={mapAvailable}
                onActivate={() =>
                  setObjectWindows((previous) => {
                    if (window.order === Math.max(...previous.map((item) => item.order)))
                      return previous;
                    const order = ++nextWindowOrder.current;
                    return previous.map((item) =>
                      item.id === window.id ? { ...item, order } : item,
                    );
                  })
                }
                onClose={() => {
                  setObjectWindows((previous) => previous.filter((item) => item.id !== window.id));
                  window.restoreFocus();
                }}
                onRead={(entry) => requestLeave(() => setReadEntry(entry))}
                onRevealObject={revealObject}
                onFocusObject={focusObject}
                onRemoveObject={(object) => remove('draft', object)}
                onEditObject={(object, restoreFocus) => edit(object, true, restoreFocus)}
                onEditRelationship={() => {}}
              />
            );
          })}
      </div>
      {state &&
        active &&
        workspaceSurface === 'map' &&
        detailsOpen &&
        selection?.kind === 'relationship' &&
        (!navigationCovered || Boolean(revealRequest)) && (
          <MapSelectionDetails
            relationship={
              selection?.kind === 'relationship'
                ? (() => {
                    const row = readRelationships.find((row) => row.value.id === selection.id);
                    return selection.previous && row?.before
                      ? { ...row, value: row.before, type: row.beforeType }
                      : row;
                  })()
                : undefined
            }
            previous={selection?.kind === 'relationship' && selection.previous}
            state={effectiveState ?? state}
            objects={displayed}
            disabled={pending || blocked || dirty}
            onClose={() => {
              setDetailsOpen(false);
              focusTools();
            }}
            onRead={setReadEntry}
            onEditObject={(object, restoreFocus) => editConfirmed(object, true, restoreFocus)}
            onEditRelationship={(id) => {
              const edge = displayedEdges.get(id);
              if (edge) editRelationship(edge);
            }}
          />
        )}
      {state && (
        <Reports
          active={active && workspaceSurface === 'reports'}
          path={path}
          version={state.draft.version}
          selection={reportSelection}
          onSelect={(selection, href) => {
            window.history.replaceState(window.history.state, '', href);
            setReportSelection(selection);
          }}
          onAccessLost={loseAccess}
          onReturn={() => {
            setWorkspaceSurface(reportReturnSurface.current);
            if (reportReturnSurface.current === 'map')
              requestAnimationFrame(() => reportReturnFocus.current?.focus());
          }}
        />
      )}
      {state && (
        <HouseholdTable
          householdName={householdName}
          active={active && workspaceSurface === 'table'}
          rows={readRows}
          hasProposals={hasChanges}
          objectTypes={effectiveTypes}
          selectedIds={selectedIds}
          workDisabled={pending || blocked}
          mapAvailable={mapAvailable}
          onSelect={(object) => selectObject(object, 'select')}
          onNew={() => edit()}
          onEdit={(object, restoreFocus) =>
            requestLeave(() => editConfirmed(object, true, restoreFocus))
          }
          onRelationships={(object, restoreFocus) =>
            setReadEntry({ kind: 'relationships', id: object.id, restoreFocus })
          }
          relationshipCounts={relationshipCounts}
          onFocusRelationships={(object) => {
            setWorkspaceSurface('map');
            focusObject(object.id);
            requestAnimationFrame(() =>
              workspace.current?.querySelector<HTMLElement>('canvas[tabindex]')?.focus(),
            );
          }}
          onRemove={(object) => remove('draft', object)}
          removalNotice={(object, id) => (
            <ObjectRemovalNotice state={state} objectId={object.id} id={id} />
          )}
          onReveal={revealObject}
          statusContent={
            <>
              {active && workspaceSurface === 'table' && workStatus}
              <DraftSaveFollowUp
                progress={saveProgress}
                hidden={saveDialogOpen}
                onOpen={() => setSaveDialogOpen(true)}
              />
            </>
          }
          actionContent={
            <>
              {conflictFollowUp}
              {conflicts.length > 0 && (
                <button
                  type="button"
                  className="map-conflict"
                  onClick={() => {
                    setConflictDialogKey(undefined);
                    setConflictDialogOpen(true);
                  }}
                >
                  <span aria-hidden="true">⚠</span> {conflicts.length}{' '}
                  {conflicts.length === 1 ? 'konflikt' : 'konflikter'} i ditt utkast
                </button>
              )}
            </>
          }
        />
      )}
      {state && active && objectActions && (
        <ObjectActions
          entry={objectActions}
          state={state}
          disabled={pending || blocked || dirty}
          mapAvailable={mapAvailable}
          selectionAvailable={selectedIds.length > 0 && Boolean(personal.view)}
          onFocusSelection={() => {
            setToolsExpanded(false);
            setWorkspaceSurface('map');
            focusSelection();
            requestAnimationFrame(() =>
              workspace.current?.querySelector<HTMLElement>('canvas[tabindex]')?.focus(),
            );
          }}
          onClose={() => setObjectActions(null)}
          onEdit={edit}
          onFocus={(id) => {
            setWorkspaceSurface('map');
            focusObject(id);
            requestAnimationFrame(() =>
              workspace.current?.querySelector<HTMLElement>('canvas[tabindex]')?.focus(),
            );
          }}
          onReveal={revealObject}
          onRead={openObjectWindow}
          onRelationships={(object) =>
            setReadEntry({
              kind: 'relationships',
              id: object.id,
              restoreFocus: objectActions.restoreFocus,
            })
          }
          onRemove={(object) => remove('draft', object)}
        />
      )}
      {state && (
        <ConflictDialog
          state={state}
          open={conflictDialogOpen}
          initialKey={conflictDialogKey}
          disabled={pending || blocked || dirty}
          onClose={() => setConflictDialogOpen(false)}
          onCorrectRelationship={(id) => {
            setConflictDialogOpen(false);
            setReadEntry({
              kind: 'relationships',
              id: `blocked-${id}`,
              retainedRelationshipId: id,
              restoreFocus: () => setConflictDialogOpen(true),
            });
          }}
          onStatus={setConflictResolutionStatus}
          onUnknownChange={setConflictRecovery}
          onRefresh={async () => {
            const latest = await request<MapState>(path);
            if (isCurrent()) setState(latest);
            return latest;
          }}
          onResolve={async (resolution) => {
            const draft = await request<MapDraft>(`${path}/resolve`, {
              version: state.draft.version,
              contentVersion: state.contentVersion,
              ...resolution,
            });
            if (isCurrent()) setState({ ...state, draft });
          }}
        />
      )}
      <DraftSaveDialog
        open={saveDialogOpen}
        progress={saveProgress}
        onClose={() => setSaveDialogOpen(false)}
        onCheck={() => {
          if (saveAttempt.current) void save(saveAttempt.current, true);
          else if (pendingOperation) retrySave(pendingOperation);
        }}
        onRestoreDraft={() => {
          setTextOpeningFocus('draft');
          setTextFocusRequest((previous) => previous + 1);
          setTextViewOpen(true);
          setWorkspaceView('text');
          setDraftOpenRequest((previous) => previous + 1);
        }}
      />
      {state && objectDialog && (
        <ObjectDialog
          key={objectDialog.id}
          initial={objectDialog}
          active={active && (workspaceSurface === 'map' || workspaceSurface === 'table')}
          restoreFocus={objectReturnFocus.current}
          householdId={householdId}
          isNew={
            !state.objects.some((object) => object.id === objectDialog.id) &&
            !state.draft.changes.some((change) => change.id === objectDialog.id)
          }
          types={effectiveTypes}
          historicalType={state.draft.changes.find((change) => change.id === objectDialog.id)?.type}
          onClose={() => setObjectDialog(null)}
          onDirty={setObjectFormDirty}
          onStage={async (editor, stagingId, image) => {
            setPending(true);
            try {
              const proposal = {
                ...editor,
                stagingId,
                value: {
                  ...editor.value,
                  profileImageId: editor.value.profileImageId ?? null,
                  iconId: editor.value.iconId ?? null,
                },
              };
              let body: typeof proposal | FormData = proposal;
              if (image) {
                body = new FormData();
                body.set('metadata', JSON.stringify(proposal));
                body.set('image', image);
              }
              const draft = await request<MapDraft>(`${path}/object-form`, body);
              if (isCurrent()) setState((current) => (current ? { ...current, draft } : current));
              setStatus('Ändringen finns i ditt utkast. Kartan sparas separat.');
              return draft;
            } catch (failure) {
              if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
                loseAccess();
              throw failure;
            } finally {
              if (isCurrent()) setPending(false);
            }
          }}
          onCheck={async () => {
            const latest = await request<MapState>(path);
            if (isCurrent()) setState(latest);
            return latest;
          }}
          onConfirmed={(id, relationships, restoreFocus) => {
            setObjectDialog(null);
            if (relationships) setReadEntry({ kind: 'relationships', id, restoreFocus });
          }}
        />
      )}
      {state && readEntry && (
        <HouseholdReadDialog
          key={`${readEntry.kind}:${readEntry.id}`}
          entry={readEntry}
          active={active && workspaceSurface !== 'reports'}
          suspended={active && workspaceSurface === 'reports'}
          onDirty={setRelationshipFormDirty}
          rows={readRows}
          state={effectiveState ?? state}
          relationshipTypes={effectiveEdgeTypes}
          onStageRelationship={async (editor, stagingId) => {
            setPending(true);
            try {
              const result = await request<RelationshipFormResult>(`${path}/relationship-form`, {
                ...editor,
                stagingId,
              });
              if (isCurrent()) setState(result.state);
              return result;
            } catch (failure) {
              if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
                loseAccess();
              throw failure;
            } finally {
              if (isCurrent()) setPending(false);
            }
          }}
          onCheckRelationship={async (stagingId, contentVersion) => {
            try {
              const result = await request<RelationshipFormResult>(
                `${path}/relationship-form/${encodeURIComponent(stagingId)}?contentVersion=${contentVersion}`,
              );
              if (isCurrent()) setState(result.state);
              return result;
            } catch (failure) {
              if (failure instanceof MapRequestError && [401, 403].includes(failure.status))
                loseAccess();
              throw failure;
            }
          }}
          onClose={() => setReadEntry(null)}
          onEdit={(id, restoreFocus) => {
            const object = displayed.get(id);
            if (object) editConfirmed(object, true, restoreFocus);
          }}
        />
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
                error={error}
                imageError={
                  errorDetails.imageObjectId
                    ? {
                        name: displayed.get(errorDetails.imageObjectId)?.name ?? 'objektet',
                        onReturn: () => returnToImage(errorDetails.imageObjectId),
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
                showSave={!working && !needsAnswer}
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
                  openWork('draft');
                }}
                onConflict={(id) => {
                  returnFromStatus();
                  setConflictDialogKey(conflictEntries.find((entry) => entry.id === id)?.key);
                  setConflictDialogOpen(true);
                }}
              />
            </>
          )}
          active={active}
          textViewOpen={textViewOpen}
          textViewHidden={!textViewVisible}
          textFocusRequest={textFocusRequest}
          textOpeningFocus={textOpeningFocus}
          onDraftOpenChange={setDraftViewOpen}
          draftOpenRequest={draftOpenRequest}
          onStartConversation={(chosen) => {
            conversationChoice.current = chosen;
            conversation.begin('text');
          }}
          draftContent={
            <DraftReview
              state={state}
              blocked={pending || blocked || dirty}
              onSave={
                conversation.working || conversation.needsAnswer || unresolved
                  ? undefined
                  : saveDraft
              }
              feedback={draftRemovalStatus}
              removalOwner={{
                path,
                onChange: (result) => {
                  if (isCurrent()) setState(result);
                },
                onStatus: (message) => {
                  setStatus(message);
                  setDraftRemovalStatus(message);
                },
              }}
            />
          }
          draft={state.draft}
          showDraftOnStart={conversationPreferences.preferences.showDraftOnStart}
          preferencesKnown={conversationPreferences.known}
          widthPreferences={conversationPreferences}
          notice={
            active && notice ? <div className="text-view-notice-slot" aria-hidden="true" /> : null
          }
          onCloseTextView={closeTextView}
          householdId={householdId}
        />
      )}
      {state &&
        createPortal(
          <div className="shared-type-settings">
            <details>
              <summary>Objekttyper</summary>
              <p>
                Alla medlemmar kan föreslå ändringar, även i förifyllda typer. Egna fält är inte
                till för hemliga uppgifter.
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
              disabled={pending || typeFormDirty || blocked}
              onClick={() => {
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
                Alla medlemmar kan ändra definitionerna, även förifyllda typer. En ändrad definition
                kopplar inte om objekten.
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
    </section>
  );
}
