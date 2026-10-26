import './spatial.css';
import './spatial-camera.css';
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { MapObject, MapRelationship, MapState } from '../shared/map.js';
import { defaultViewSettings, type Position, type ViewSettings } from '../shared/personal-view.js';
import { relationshipLabel } from '../shared/relationship-label.js';
import { BackgroundMotionSlider } from './BackgroundMotionSlider.js';
import { LifecycleStatus } from './Lifecycle.js';
import { formatCoordinate, MapNavigation } from './MapNavigation.js';
import type { MapRevealRequest } from './map-display.js';
import { mapConnections, proposalKind } from './map-presentation.js';
import { ObjectActions, type ObjectActionsEntry } from './ObjectActions.js';
import { SpatialHeightGuide } from './SpatialHeightGuide.js';
import { SpatialObjectGlyph } from './SpatialObjectGlyph.js';
import { SpatialOrientation } from './SpatialOrientation.js';
import { navigationDragThreshold } from './spatial-navigation.js';
import { connectionOcclusion } from './spatial-occlusion.js';
import {
  type ProjectedPoint,
  type ProjectedReferenceLabel,
  spatialScene,
} from './spatial-scene.js';
import { useObjectMovement } from './use-object-movement.js';
import type { usePersonalView } from './use-personal-view.js';
import { WorkspaceIcon } from './WorkspaceTools.js';
import { ZeroReferenceTint } from './ZeroReferenceTint.js';
import { depthTintRegions, verticalCurveTints } from './zero-reference-depth.js';

type LabelBox = { x: number; y: number; width: number; height: number };

export function ProposalSymbol({ change }: { change?: { before: unknown; after: unknown } }) {
  if (!change) return null;
  const kind = !change.after ? 'removed' : !change.before ? 'added' : 'changed';
  return (
    <span
      className={`proposal-symbol ${kind}`}
      title={
        kind === 'removed'
          ? 'Föreslås tas bort'
          : kind === 'added'
            ? 'Nytt förslag'
            : 'Ändrat förslag'
      }
    >
      {kind === 'removed' ? '×' : kind === 'added' ? '+' : '✎'}
    </span>
  );
}

const connectionKinds = ['existing', 'added', 'changed', 'removed'] as const;
function arrowTip(
  source: Pick<ProjectedPoint, 'x' | 'y' | 'depth'>,
  target: Pick<ProjectedPoint, 'x' | 'y' | 'depth'>,
  radius = 28,
) {
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const fraction = Math.min(radius / (Math.hypot(dx, dy) || 1), 0.45);
  return {
    x: target.x + dx * fraction,
    y: target.y + dy * fraction,
    depth: 1 / ((1 - fraction) / target.depth + fraction / source.depth),
  };
}

export function SpatialMap({
  theme = 'dark',
  state,
  active,
  objects,
  searchHitIds,
  previousIds,
  relationships,
  selection,
  selectedIds = selection?.kind === 'object' ? [selection.id] : [],
  disabled,
  onSelect,
  onEdit = onSelect,
  onOpenDetails = onEdit,
  onSelectRelationship,
  onOpenRelationshipDetails = onSelectRelationship,
  onFocus,
  onReveal,
  onRead,
  onRelationships,
  onClear,
  onReset,
  resetAvailable = Boolean(selection),
  onSearchStart,
  onSearchClear,
  onRemove,
  onObjectActions,
  personal,
  positionRecoveryActive = false,
  revealRequest,
  focusRequest,
  onFocusSelection,
  cameraMount,
  labelMount,
  settingsMount,
  onCameraAction,
  navigationMount,
  onNavigationChange,
  floatingArea,
  navigationHidden = false,
  navigationFocus = true,
  onAvailabilityChange,
}: {
  onAvailabilityChange?: (available: boolean) => void;
  theme?: 'light' | 'dark';
  state: MapState;
  active: boolean;
  objects: Map<string, MapObject>;
  searchHitIds?: ReadonlySet<string>;
  previousIds?: ReadonlySet<string>;
  relationships: Map<string, MapRelationship>;
  selection: { kind: 'object' | 'relationship'; id: string; previous?: boolean } | null;
  selectedIds?: string[];
  disabled: boolean;
  onSelect: (object: MapObject, additive?: boolean) => void;
  onEdit?: (object: MapObject) => void;
  onOpenDetails?: (object: MapObject) => void;
  onSelectRelationship: (edge: MapRelationship, previous?: boolean) => void;
  onOpenRelationshipDetails?: (edge: MapRelationship, previous?: boolean) => void;
  onFocus: (id: string) => void;
  onReveal?: (object: MapObject) => void;
  onRead?: (object: MapObject) => void;
  onRelationships?: (object: MapObject) => void;
  onClear: () => void;
  onReset: () => void;
  resetAvailable?: boolean;
  onSearchStart?: (text: string) => void;
  onSearchClear?: () => void;
  onRemove: (object: MapObject) => void;
  onObjectActions?: (entry: ObjectActionsEntry) => void;
  personal?: Pick<
    ReturnType<typeof usePersonalView>,
    'view' | 'pending' | 'message' | 'toast' | 'messageId' | 'refresh' | 'move' | 'configure'
  >;
  positionRecoveryActive?: boolean;
  revealRequest?: MapRevealRequest;
  focusRequest?: { id: string; objectIds: string[] };
  onFocusSelection?: () => void;
  cameraMount?: HTMLElement | null;
  labelMount?: HTMLElement | null;
  settingsMount?: HTMLElement | null;
  onCameraAction?: () => void;
  navigationMount?: HTMLElement | null;
  onNavigationChange?: (open: boolean) => void;
  floatingArea?: import('./floating-windows.js').FloatingArea;
  navigationHidden?: boolean;
  navigationFocus?: boolean;
}) {
  const labelPrefix = useId();
  const showPersonalToast = useCallback(
    (element: HTMLParagraphElement | null) => {
      if (element?.popover !== 'manual') return;
      if (active && !element.matches(':popover-open')) element.showPopover();
      else if (!active && element.matches(':popover-open')) element.hidePopover();
    },
    [active],
  );
  const relationshipLabelPrefix = useId();
  const occlusionPrefix = useId();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  function changeNavigation(open: boolean) {
    setNavigationOpen(open);
    onNavigationChange?.(open);
    if (!open) navigationTrigger.current?.focus();
  }
  const [activated, setActivated] = useState(active);
  useEffect(() => {
    if (active) setActivated(true);
  }, [active]);
  const [menuEntry, setMenuEntry] = useState<ObjectActionsEntry | null>(null);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);
  const contextClick = useRef<string | null>(null);
  const cancelHold = useCallback(() => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  }, []);
  function openMenu(object: MapObject, target: HTMLElement, focusActions = true) {
    cancelHold();
    movement.cancel();
    const entry: ObjectActionsEntry = {
      object,
      anchor: target,
      focusActions,
      restoreFocus: () => {
        if (
          target.isConnected &&
          target.getClientRects().length &&
          !target.closest('[hidden], [inert]')
        )
          target.focus();
        else canvas.current?.focus();
      },
      consumeHeldClick: () => {
        const consumed = held.current;
        held.current = false;
        return consumed;
      },
    };
    if (onObjectActions) onObjectActions(entry);
    else setMenuEntry(entry);
  }
  function closeMenu() {
    setMenuEntry(null);
  }
  useEffect(() => () => cancelHold(), [cancelHold]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const labelLayer = useRef<HTMLDivElement>(null);
  const labelObserver = useRef<ResizeObserver | null>(null);
  const observeLabel = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    labelObserver.current?.observe(element);
    return () => labelObserver.current?.unobserve(element);
  }, []);
  const [reservedBoxes, setReservedBoxes] = useState<LabelBox[]>([]);
  const measureReservedBoxes = useCallback(() => {
    const bounds = canvas.current?.getBoundingClientRect();
    const root =
      surface.current?.closest('.household-map') ?? surface.current?.closest('.spatial-map');
    if (!bounds || !root) return;
    // The filter dialog overlays the map without reserving label space.
    const boxes = [
      ...root.querySelectorAll(
        `.workspace-tools, .workspace-context, .map-object-search, .map-search-filter, .workspace-feedback, .voice-box, .workspace-voice-controls, .conversation-notice, .map-navigation, .label-note, .spatial-view-actions${revealRequest ? ', .map-selection-details' : ''}`,
      ),
    ].flatMap((element) => {
      if (element.closest('details:not([open])') && !element.matches('summary')) return [];
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return [];
      return [
        {
          x: box.x + box.width / 2 - bounds.x,
          y: box.y + box.height / 2 - bounds.y,
          width: box.width,
          height: box.height,
        },
      ];
    });
    setReservedBoxes((previous) =>
      JSON.stringify(previous) === JSON.stringify(boxes) ? previous : boxes,
    );
  }, [revealRequest]);
  useLayoutEffect(measureReservedBoxes);
  const [labelSizes, setLabelSizes] = useState(
    new Map<string, { width: number; height: number }>(),
  );
  useLayoutEffect(() => {
    if (!activated || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      setLabelSizes((previous) => {
        const next = new Map(previous);
        let changed = false;
        for (const { target } of entries) {
          const label = target as HTMLElement;
          const id = label.dataset.layoutId;
          if (!id) continue;
          const width = label.offsetWidth;
          const height = label.offsetHeight;
          if (!width || !height) continue;
          if (previous.get(id)?.width !== width || previous.get(id)?.height !== height) {
            next.set(id, { width, height });
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    });
    labelObserver.current = observer;
    for (const label of labelLayer.current?.children ?? []) observer.observe(label);
    return () => {
      observer.disconnect();
      labelObserver.current = null;
    };
  }, [activated]);
  const scene = useRef<ReturnType<typeof spatialScene> | null>(null);
  const [orientation, setOrientation] = useState<Position[]>([]);
  const [moving, setMoving] = useState(false);
  const motionTimer = useRef<number>(0);
  const motion = useCallback(() => {
    setMoving(true);
    window.clearTimeout(motionTimer.current);
    motionTimer.current = window.setTimeout(() => setMoving(false), 1400);
  }, []);
  useEffect(() => () => window.clearTimeout(motionTimer.current), []);
  const settings = personal?.view?.settings ?? defaultViewSettings;
  const [localSettings, setLocalSettings] = useState(defaultViewSettings);
  const preferences = personal ? settings : localSettings;
  const [hasUnsavedMotion, setHasUnsavedMotion] = useState(false);
  const [hasUnsavedTint, setHasUnsavedTint] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const backgroundMotionDisabled =
    !preferences.background || reducedMotion || Boolean(personal && !personal.view);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  function configure(value: Partial<ViewSettings>) {
    if (
      (Object.keys(value) as (keyof ViewSettings)[]).every((key) => value[key] === preferences[key])
    )
      return;
    const { version: _version, ...current } = { ...preferences, version: 0 };
    const next = { ...current, ...value };
    if (personal) void personal.configure(next);
    else setLocalSettings(next);
  }
  const [points, setPoints] = useState<ProjectedPoint[]>([]);
  const [referenceLabels, setReferenceLabels] = useState<ProjectedReferenceLabel[]>([]);
  const [completedRevealId, setCompletedRevealId] = useState<string>();
  const [completedFocusId, setCompletedFocusId] = useState<string>();
  const [cameraHistory, setCameraHistory] = useState({ canGoBack: false, changed: false });
  const [unavailable, setUnavailable] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => {
    onAvailabilityChange?.(!unavailable && !contextLost);
  }, [unavailable, contextLost, onAvailabilityChange]);
  const allLabels = preferences.allLabels;
  const previousLabels = useRef(false);
  const referenceVisitActive = useRef(false);
  const labelsInitialized = useRef(false);
  const [closerLabels, setCloserLabels] = useState(false);
  const [heightHelp, setHeightHelp] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (
        active &&
        event.key === 'Shift' &&
        !(
          event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable]')
        )
      )
        setShiftHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftHeld(false);
    };
    const blur = () => setShiftHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [active]);
  const [resetRequested, setResetRequested] = useState(false);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    moved: boolean;
    multiple: boolean;
  } | null>(null);
  useEffect(() => {
    const cancel = () => {
      pointer.current = null;
    };
    if (!active) cancel();
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [active]);
  const movement = useObjectMovement(scene, {
    enabled: Boolean(personal?.view) && !contextLost,
    active,
    cancelHold,
    referenceAlwaysVisible: preferences.zeroReferenceAlwaysVisible,
    referenceOnMovement: preferences.zeroReferenceOnMovement,
    onMove: (id, position) => personal?.move(id, position),
  });
  const announcedMove = movement.announcement;
  const announcedObject = announcedMove && objects.get(announcedMove.id);
  const movementResult =
    announcedMove && announcedObject
      ? `${announcedObject.name}: ${announcedMove.axes
          .map(
            (axis) =>
              `${{ x: 'Sidled (X)', y: 'Höjd (Y)', z: 'Djup (Z)' }[axis]} ${formatCoordinate(announcedMove.position[axis])}`,
          )
          .join(', ')}.`
      : '';
  useEffect(() => {
    if (!activated || !canvas.current) return;
    const element = canvas.current;
    const lost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
      movement.interrupt();
      scene.current?.contextLost(true);
    };
    const restored = () => {
      // Three restores its renderer during the same browser event.
      queueMicrotask(() => {
        scene.current?.contextLost(false);
        setContextLost(false);
      });
    };
    element.addEventListener('webglcontextlost', lost);
    element.addEventListener('webglcontextrestored', restored);
    try {
      referenceVisitActive.current = false;
      scene.current = spatialScene(
        element,
        setPoints,
        setOrientation,
        motion,
        surface.current ?? element,
        setCameraHistory,
        setReferenceLabels,
      );
    } catch {
      setUnavailable(true);
    }
    return () => {
      element.removeEventListener('webglcontextlost', lost);
      element.removeEventListener('webglcontextrestored', restored);
      scene.current?.dispose();
      scene.current = null;
    };
  }, [activated, motion, movement.interrupt]);
  const personalReady = !personal || Boolean(personal.view);
  useEffect(() => {
    // The first scene update frames the layout, including saved personal positions.
    if (!activated || !personalReady) return;
    scene.current?.update(
      [...objects.keys()],
      personal?.view?.positions,
      [...relationships.values()],
      movement.movingObjectId(),
    );
    movement.clearStaleAnnouncement();
  }, [
    objects,
    relationships,
    activated,
    personal?.view?.positions,
    personalReady,
    movement.movingObjectId,
    movement.clearStaleAnnouncement,
  ]);
  useEffect(() => {
    if (!activated) return;
    scene.current?.select(selectedIds);
  }, [activated, selectedIds]);
  useEffect(() => {
    if (!activated || !personalReady) {
      referenceVisitActive.current = false;
      return;
    }
    scene.current?.configure(preferences, theme, reducedMotion, movement.referenceVisible);
    if (!active) {
      referenceVisitActive.current = false;
      return;
    }
    if (preferences.allLabels && !previousLabels.current) {
      if (scene.current?.openLabelView(labelsInitialized.current)) setCloserLabels(true);
    }
    labelsInitialized.current = true;
    previousLabels.current = preferences.allLabels;
    if (!referenceVisitActive.current) scene.current?.startReferenceVisit();
    referenceVisitActive.current = true;
  }, [
    preferences,
    activated,
    active,
    personalReady,
    theme,
    reducedMotion,
    movement.referenceVisible,
  ]);
  const focusObjects = useCallback((ids: string[], reveal?: MapRevealRequest) => {
    const element = canvas.current;
    if (!element) return false;
    const bounds = element.getBoundingClientRect();
    // Short screens need every available pixel for the full 44px targets.
    const clearance = (window.visualViewport?.height ?? window.innerHeight) <= 450 ? 0 : 12;
    // Reserve actual fixed tools, including expanded controls and live status.
    // The filter dialog is an overlay and must not change camera framing.
    // Reading details stay open; focus reserves their actual visible area.
    let areas = [{ left: 0, top: 0, right: bounds.width, bottom: bounds.height }];
    const overlays = element
      .closest('.household-map')
      ?.querySelectorAll(
        '.workspace-tools, .workspace-context, .map-object-search, .map-search-filter, .workspace-feedback, .voice-box, .workspace-voice-controls, .spatial-tools, .map-navigation, .spatial-view-actions, .map-selection-details',
      );
    for (const overlay of overlays ?? []) {
      const closedTools = overlay.closest('details:not([open])');
      if (closedTools && closedTools !== overlay) continue;
      const box = overlay.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const obstacle = {
        left: box.left - bounds.left,
        right: box.right - bounds.left,
        top: box.top - bounds.top,
        bottom: box.bottom - bounds.top,
      };
      const candidates = areas.flatMap((area) => {
        if (
          obstacle.left >= area.right ||
          obstacle.right <= area.left ||
          obstacle.top >= area.bottom ||
          obstacle.bottom <= area.top
        )
          return [area];
        return [
          { ...area, left: Math.max(area.left, obstacle.right + clearance) },
          { ...area, right: Math.min(area.right, obstacle.left - clearance) },
          { ...area, top: Math.max(area.top, obstacle.bottom + clearance) },
          { ...area, bottom: Math.min(area.bottom, obstacle.top - clearance) },
        ].filter((value) => value.right - value.left >= 44 && value.bottom - value.top >= 44);
      });
      // Keep alternative free rectangles until every overlay is considered.
      // Choosing greedily can leave an unusably thin strip below the legend.
      areas = candidates.filter(
        (area, index) =>
          !candidates.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              other.left <= area.left &&
              other.right >= area.right &&
              other.top <= area.top &&
              other.bottom >= area.bottom &&
              (otherIndex < index ||
                other.left < area.left ||
                other.right > area.right ||
                other.top < area.top ||
                other.bottom > area.bottom),
          ),
      );
    }
    const fittingAreas = areas
      .filter((area) => area.right - area.left >= 44 && area.bottom - area.top >= 44)
      .map((area) => {
        const width = area.right - area.left;
        const height = area.bottom - area.top;
        // A short viewport can leave just enough space for the 44px targets.
        // Keep a positive fitting area while protecting their full pointer box.
        const marginX = Math.min(64, Math.max(24, width / 4), (width - 1) / 2);
        const marginY = Math.min(64, Math.max(24, height / 4), (height - 1) / 2);
        // Leave the full 44px label target and collision gap above the endpoints.
        const labelRow = reveal?.relationshipId
          ? Math.min(49, Math.max(0, height - 2 * marginY - 1))
          : 0;
        return {
          left: area.left + marginX,
          right: area.right - marginX,
          top: area.top + marginY + labelRow,
          bottom: area.bottom - marginY,
        };
      });
    // Rank the space left for object centers after reserving targets and labels.
    // A large but shallow strip can otherwise squeeze both endpoints together.
    const size = (value: (typeof fittingAreas)[number]) =>
      (value.right - value.left) * (value.bottom - value.top);
    const area = fittingAreas.sort((a, b) => size(b) - size(a))[0];
    return area ? (scene.current?.focus(ids, area) ?? false) : false;
  }, []);
  useEffect(() => {
    if (
      revealRequest &&
      !revealRequest.complete &&
      active &&
      activated &&
      personalReady &&
      !contextLost &&
      revealRequest.objectIds.every((id) => objects.has(id)) &&
      (!revealRequest.relationshipId || relationships.has(revealRequest.relationshipId))
    ) {
      if (navigationOpen) {
        // Close navigation for the initial reveal, then respect any navigation
        // the user opens while the acknowledgement is still pending.
        if (revealRequest.id !== completedRevealId) {
          setNavigationOpen(false);
          onNavigationChange?.(false);
        }
        return;
      }
      // Keep framing against the actual layout until display is acknowledged.
      // A later toolbar, search or inspector resize can invalidate the first fit.
      let frame = 0;
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (focusObjects(revealRequest.objectIds, revealRequest))
            setCompletedRevealId(revealRequest.id);
        });
      };
      const observer = new ResizeObserver(schedule);
      if (canvas.current) {
        observer.observe(canvas.current);
        for (const overlay of canvas.current
          .closest('.household-map')
          ?.querySelectorAll(
            '.workspace-tools, .workspace-context, .map-object-search, .map-selection-details, .map-navigation, .conversation-corner',
          ) ?? [])
          observer.observe(overlay);
      }
      schedule();
      return () => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      };
    }
  }, [
    revealRequest,
    completedRevealId,
    navigationOpen,
    active,
    activated,
    personalReady,
    contextLost,
    objects,
    relationships,
    onNavigationChange,
    focusObjects,
  ]);
  useEffect(() => {
    if (
      focusRequest &&
      focusRequest.id !== completedFocusId &&
      active &&
      personalReady &&
      !contextLost &&
      !unavailable &&
      focusRequest.objectIds.every((id) => objects.has(id))
    ) {
      // Expanded tools close with the request. Wait for their final layout,
      // including the search row that follows them on small screens.
      const frame = requestAnimationFrame(() => {
        if (focusObjects(focusRequest.objectIds)) setCompletedFocusId(focusRequest.id);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [
    focusRequest,
    completedFocusId,
    active,
    personalReady,
    contextLost,
    unavailable,
    objects,
    focusObjects,
  ]);
  useEffect(() => {
    if (!resetRequested) return;
    // Reframe after the shared view has revealed previously filtered objects.
    scene.current?.reset();
    setResetRequested(false);
  }, [resetRequested]);
  function objectEvents(object: MapObject): ButtonHTMLAttributes<HTMLButtonElement> {
    return {
      onContextMenu: (event) => {
        event.preventDefault();
        if (event.ctrlKey) {
          cancelHold();
          movement.cancel();
          contextClick.current = object.id;
          if (event.altKey) onOpenDetails(object);
          else onSelect(object, true);
        } else openMenu(object, event.currentTarget, !held.current);
      },
      onPointerDown: (event) => {
        contextClick.current = null;
        cancelHold();
        held.current = false;
        movement.start(object.id, event);
        if (event.pointerType === 'touch' && event.isPrimary) {
          const target = event.currentTarget;
          hold.current = {
            x: event.clientX,
            y: event.clientY,
            timer: window.setTimeout(() => {
              held.current = true;
              openMenu(object, target, false);
            }, 550),
          };
        }
      },
      onPointerMove: (event) => {
        if (
          hold.current &&
          Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 8
        )
          cancelHold();
      },
      onPointerUp: cancelHold,
      onPointerCancel: cancelHold,
      onPointerLeave: () => {
        cancelHold();
        movement.leave();
      },
      onClick: (event) => {
        const pairedContextClick = contextClick.current === object.id && event.detail > 0;
        contextClick.current = null;
        if (pairedContextClick) return;
        if (held.current) {
          held.current = false;
          return;
        }
        if (event.detail > 1) return;
        if ((event.ctrlKey || event.metaKey) && event.altKey) onOpenDetails(object);
        else onSelect(object, event.ctrlKey || event.metaKey);
      },
      onDoubleClick: () => onOpenDetails(object),
      onKeyDown: (event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          event.stopPropagation();
          openMenu(object, event.currentTarget);
        }
      },
    };
  }
  // Strengthen the depth cue while limiting foreground growth separately for
  // symbols and text. Native click targets retain their minimum size.
  const projectedLocations = new Map(
    points
      .filter((point) => point.visible)
      .map((point) => [point.id, { ...point, scale: point.scale ** 2 }]),
  );
  const locations = new Map(
    [...projectedLocations].map(([id, point]) => [
      id,
      { ...point, scale: Math.min(point.scale, 1.15) },
    ]),
  );
  function textScale(id: string, targetId?: string) {
    const source = projectedLocations.get(id)?.scale ?? 1;
    const scale = targetId
      ? Math.sqrt(source * (projectedLocations.get(targetId)?.scale ?? source))
      : source;
    return Math.min(scale, 15 / 13);
  }
  const surfaceWidth = canvas.current?.clientWidth ?? 0;
  const surfaceHeight = canvas.current?.clientHeight ?? 0;
  const depthPatches = scene.current?.referenceDepthPatches() ?? [];
  const tintOpacity = preferences.zeroReferenceTint / 100;
  const markerTints = new Map(
    [...locations.values()].flatMap((point) => {
      const radius = 17 * point.scale;
      const regions = depthTintRegions(
        depthPatches,
        { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 },
        () => 1 / point.depth,
      );
      return regions.length ? [[point.id, regions] as const] : [];
    }),
  );
  function labelSize(id: string, fallback: { width: number; height: number }) {
    const size = labelSizes.get(id) ?? fallback;
    // A narrower canvas must permit the label to render before its observer
    // can replace a size measured in the previous, wider viewport.
    return { ...size, width: Math.min(size.width, Math.max(0, surfaceWidth - 16)) };
  }
  const occupied = new Map<string, LabelBox[]>();
  function cells(box: LabelBox, margin = 0) {
    const keys: string[] = [];
    for (
      let x = Math.floor((box.x - box.width / 2 - margin) / 64);
      x <= Math.floor((box.x + box.width / 2 + margin) / 64);
      x += 1
    )
      for (
        let y = Math.floor((box.y - box.height / 2 - margin) / 64);
        y <= Math.floor((box.y + box.height / 2 + margin) / 64);
        y += 1
      )
        keys.push(`${x},${y}`);
    return keys;
  }
  function reserve(box: LabelBox) {
    for (const key of cells(box)) {
      const boxes = occupied.get(key);
      if (boxes) boxes.push(box);
      else occupied.set(key, [box]);
    }
  }
  function nearby(box: LabelBox) {
    // Candidate checks depend on nearby geometry, not the entire graph.
    return new Set(cells(box, 5).flatMap((key) => occupied.get(key) ?? []));
  }
  for (const box of reservedBoxes) reserve(box);
  for (const point of locations.values()) {
    // Match the native target and the depth-scaled orb. The collision gap
    // also protects their focus and proposal outlines.
    const diameter = Math.max(44, 34 * point.scale);
    reserve({ ...point, width: diameter, height: diameter });
  }
  const edges = mapConnections(state.draft, objects, relationships, previousIds).flatMap(
    ({ edge, previous, kind }) => {
      const source = locations.get(edge.sourceId);
      const target = edge.targetId ? locations.get(edge.targetId) : undefined;
      if (!source || (edge.targetId && !target)) return [];
      const end = target ?? {
        x: source.x + (source.x > surfaceWidth * 0.65 ? -100 : 100),
        y: source.y + (source.y > surfaceHeight * 0.65 ? -80 : 80),
        depth: source.depth,
      };
      const tip = arrowTip(source, end, target ? 29 : 0);
      const start = arrowTip(end, source, 22);
      const selected =
        selection?.kind === 'relationship'
          ? selection.id === edge.id && Boolean(selection.previous) === previous
          : selectedIds.includes(edge.sourceId) ||
            Boolean(edge.targetId && selectedIds.includes(edge.targetId));
      const length = Math.hypot(tip.x - start.x, tip.y - start.y) || 1;
      const bend = kind === 'removed' ? 23 : 0;
      const geometry = bend
        ? `M ${start.x} ${start.y} Q ${(start.x + tip.x) / 2} ${(start.y + tip.y) / 2 + bend} ${tip.x} ${tip.y}`
        : `M ${start.x} ${start.y} L ${tip.x} ${tip.y}`;
      reserve({
        x: tip.x - ((tip.x - start.x) / length) * 7,
        y: tip.y - ((tip.y - start.y) / length) * 7,
        width: 26,
        height: 26,
      });
      return [
        {
          edge,
          source,
          start,
          end,
          tip,
          bend,
          geometry,
          selected,
          kind,
          previous,
          key: `${previous ? 'previous-' : ''}${edge.id}`,
        },
      ];
    },
  );
  function place(candidates: LabelBox[], selected = false): LabelBox | null {
    let fallback: LabelBox | undefined;
    let leastOverlap = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (
        candidate.x - candidate.width / 2 < 8 ||
        candidate.x + candidate.width / 2 > surfaceWidth - 8 ||
        candidate.y - candidate.height / 2 < 8 ||
        candidate.y + candidate.height / 2 > surfaceHeight - 8
      )
        continue;
      const overlap = [...nearby(candidate)].reduce((sum, other) => {
        const width =
          Math.min(other.x + other.width / 2, candidate.x + candidate.width / 2) -
          Math.max(other.x - other.width / 2, candidate.x - candidate.width / 2) +
          5;
        const height =
          Math.min(other.y + other.height / 2, candidate.y + candidate.height / 2) -
          Math.max(other.y - other.height / 2, candidate.y - candidate.height / 2) +
          5;
        return sum + Math.max(0, width) * Math.max(0, height);
      }, 0);
      if (overlap === 0) {
        reserve(candidate);
        return candidate;
      }
      if (overlap < leastOverlap) {
        leastOverlap = overlap;
        fallback = candidate;
      }
    }
    if (allLabels) {
      let box = fallback ?? candidates[0];
      if (box && selected) {
        box = {
          ...box,
          x: Math.max(box.width / 2 + 8, Math.min(surfaceWidth - box.width / 2 - 8, box.x)),
          y: Math.max(box.height / 2 + 8, Math.min(surfaceHeight - box.height / 2 - 8, box.y)),
        };
      }
      if (box) reserve(box);
      return box ?? null;
    }
    if (selected && candidates[0]) {
      // A dense cluster may fill every nearby slot. Find the nearest free
      // name target without moving the marker, camera or fixed controls.
      const origin = candidates[0];
      const available: LabelBox[] = [];
      const centers = (size: number, limit: number) => {
        const end = limit - size / 2 - 8;
        const values = [end];
        for (let center = size / 2 + 8; center <= end; center += 24) values.push(center);
        return values;
      };
      // A narrow free slot can fall between grid steps. Try the exact edges
      // of nearby obstacles too, without multiplying their X/Y combinations.
      for (const other of nearby(origin)) {
        const offsetX = (other.width + origin.width) / 2 + 5;
        const offsetY = (other.height + origin.height) / 2 + 5;
        available.push(
          { ...origin, x: other.x - offsetX },
          { ...origin, x: other.x + offsetX },
          { ...origin, y: other.y - offsetY },
          { ...origin, y: other.y + offsetY },
        );
      }
      // The last free slot on a small surface can lie beyond the grid's
      // final step. Include the boundary centers in the collision search.
      for (const y of centers(origin.height, surfaceHeight))
        for (const x of centers(origin.width, surfaceWidth)) available.push({ ...origin, x, y });
      available.sort(
        (a, b) =>
          Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y),
      );
      return place(available);
    }
    return null;
  }
  const labelEdges = edges.filter(
    ({ selected, kind }) => allLabels || selected || kind !== 'existing',
  );
  function placeEdges(candidates: typeof labelEdges) {
    return candidates.flatMap((edge) => {
      const type = state.relationshipTypes.find((type) => type.id === edge.edge.typeId);
      const size = labelSize(`relationship-${edge.key}`, {
        width: Math.min(230, (type?.forwardLabel ?? type?.name ?? '').length * 7 + 24),
        height: 44,
      });
      const positions = [0, 22, -22, 44, -44, 66, -66, 88, -88, 110, -110, 132, -132].flatMap(
        (offset) =>
          [0.5, 0.3, 0.7].map((fraction) => ({
            ...size,
            x: edge.source.x + (edge.end.x - edge.source.x) * fraction,
            y: edge.source.y + (edge.end.y - edge.source.y) * fraction + offset,
          })),
      );
      const label = place(positions, edge.selected);
      return label ? [{ ...edge, ...label }] : [];
    });
  }
  const primaryEdges = labelEdges
    .filter(({ selected }) => selection?.kind === 'relationship' && selected)
    .sort((a, b) => Number(b.selected) - Number(a.selected));
  // A selected relationship gets space before unrelated object names.
  const labeledEdges = placeEdges(primaryEdges);
  const labels = new Map<string, LabelBox>();
  // Prefer names beside their pictograms; selected names get first use of space.
  const nodePoints = [...locations.values()].sort((a, b) => {
    const priority = (id: string) =>
      selectedIds.includes(id) ? 0 : state.draft.changes.some((change) => change.id === id) ? 1 : 2;
    return priority(a.id) - priority(b.id) || a.id.localeCompare(b.id);
  });
  for (const point of nodePoints) {
    const object = objects.get(point.id);
    if (!object) continue;
    const size = labelSize(`object-${point.id}`, {
      width: Math.min(230, Math.max(70, object.name.length * 7 + 12)),
      height: 44,
    });
    const offsets = [
      [0, 30 + size.height / 2],
      [0, -30 - size.height / 2],
      [30 + size.width / 2, 0],
      [-30 - size.width / 2, 0],
      [size.width / 3, 35 + size.height / 2],
      [-size.width / 3, 35 + size.height / 2],
      [size.width / 3, -35 - size.height / 2],
      [-size.width / 3, -35 - size.height / 2],
    ];
    const candidates = offsets.map(([x, y]) => ({ ...size, x: point.x + x, y: point.y + y }));
    // Keep crowded objects selectable without changing their spatial positions.
    // A short leader connects each name to its true marker. The
    // selected names receive first use of the available label space.
    for (const distance of [90, 145, 200]) {
      for (const direction of [-1, 1]) {
        candidates.push({
          ...size,
          x: Math.max(size.width / 2 + 8, Math.min(surfaceWidth - size.width / 2 - 8, point.x)),
          y: point.y + direction * distance,
        });
      }
    }
    const box = place(candidates, selectedIds.includes(point.id));
    if (box) labels.set(point.id, box);
  }
  labeledEdges.push(...placeEdges(labelEdges.filter((edge) => !primaryEdges.includes(edge))));
  // Reference text has one projected anchor and yields to all household text.
  // It never uses the object-label fallback or a viewport-edge position.
  const visibleReferenceLabels = referenceLabels.filter((label) => {
    if (!label.visible) return false;
    const size = labelSize(`reference-${label.id}`, { width: 108, height: 24 });
    const box = { ...label, ...size };
    if (
      box.x - box.width / 2 < 8 ||
      box.x + box.width / 2 > surfaceWidth - 8 ||
      box.y - box.height / 2 < 8 ||
      box.y + box.height / 2 > surfaceHeight - 8
    )
      return false;
    if (
      [...nearby(box)].some(
        (other) =>
          Math.abs(other.x - box.x) < (other.width + box.width) / 2 + 5 &&
          Math.abs(other.y - box.y) < (other.height + box.height) / 2 + 5,
      )
    )
      return false;
    reserve(box);
    return true;
  });
  const hiddenLabels = locations.size - labels.size + labelEdges.length - labeledEdges.length;
  const adjacent = new Set<string>();
  const guideId = movement.heightActive
    ? movement.guide?.id
    : selectedIds.length === 1
      ? selectedIds[0]
      : undefined;
  const guidePosition = guideId && locations.has(guideId) ? scene.current?.position(guideId) : null;
  const heightGuide =
    guidePosition && (heightHelp || shiftHeld || movement.heightActive)
      ? {
          start:
            (movement.heightActive || !shiftHeld) && movement.guide && movement.guide.id === guideId
              ? movement.guide.start
              : guidePosition,
          end: guidePosition,
        }
      : null;
  if (selectedIds.length) {
    for (const id of selectedIds) adjacent.add(id);
    for (const { edge, selected } of edges)
      if (selected) {
        adjacent.add(edge.sourceId);
        if (edge.targetId) adjacent.add(edge.targetId);
      }
  }
  const labelFeedback = (
    <>
      {!allLabels && objects.size > 0 && (
        <p className={`label-note label-note-reservation${hiddenLabels ? '' : ' inactive'}`}>
          {/* Size the obstacle independently of the labels it displaces. */}
          <span aria-hidden="true" className="label-note-size">
            <span className="label-note-count">{objects.size + edges.length}</span> etiketter döljs
            för läsbarhet.
          </span>
          {hiddenLabels > 0 && (
            <span className="label-note-message">
              <span className="label-note-count">{hiddenLabels}</span> etiketter döljs för
              läsbarhet.
            </span>
          )}
        </p>
      )}
      {allLabels && closerLabels && (
        <p className="label-note">Närmare utsnitt. Panorera för att se fler etiketter.</p>
      )}
    </>
  );
  const cameraTools = (
    <nav className="spatial-view-actions" aria-label="Kameravy">
      <button
        type="button"
        ref={navigationTrigger}
        title="Navigera"
        aria-label="Navigera"
        aria-expanded={navigationOpen && !navigationHidden}
        onClick={() => {
          onCameraAction?.();
          changeNavigation(navigationHidden || !navigationOpen);
        }}
      >
        <WorkspaceIcon name="navigate" />
        <span>Navigera</span>
      </button>
      <button
        type="button"
        title="Gå tillbaka ett steg i kamerans vyhistorik. Behåller sökning, filter, markering och objektplaceringar."
        aria-label="Föregående vy"
        disabled={!active || !personalReady || unavailable || contextLost}
        aria-disabled={!cameraHistory.canGoBack || undefined}
        onClick={() => {
          if (!cameraHistory.canGoBack) return;
          onCameraAction?.();
          scene.current?.previousView();
        }}
      >
        <WorkspaceIcon name="returnView" />
        <span>Föregående vy</span>
      </button>
      <button
        type="button"
        title="Visa alla objekt- och sambandsetiketter. Tryck igen för att återgå till automatiska etiketter. Valet sparas i din personliga vy."
        aria-label="Alla etiketter"
        aria-pressed={allLabels}
        disabled={personal && !personal.view}
        aria-disabled={personal?.pending || undefined}
        onClick={() => {
          if (personal?.pending) return;
          onCameraAction?.();
          configure({ allLabels: !allLabels });
        }}
      >
        <WorkspaceIcon name="labels" />
        <span>Alla etiketter</span>
      </button>
      <button
        type="button"
        title="Visa hela kartan och återställ sökning, filter, markering och kamerans vyhistorik. Behåller dina objektplaceringar och valet Alla etiketter."
        aria-label="Återställ vy"
        disabled={!active || !personalReady || unavailable || contextLost}
        aria-disabled={
          (!resetAvailable && !cameraHistory.changed && !cameraHistory.canGoBack) || undefined
        }
        onClick={() => {
          if (!resetAvailable && !cameraHistory.changed && !cameraHistory.canGoBack) return;
          onCameraAction?.();
          setCloserLabels(false);
          onReset();
          setResetRequested(true);
        }}
      >
        <WorkspaceIcon name="reset" />
        <span>Återställ vy</span>
      </button>
    </nav>
  );
  function editPosition(id: string, axis: keyof Position, value: number) {
    const start = scene.current?.position(id);
    if (!start || !personal?.view || disabled || unavailable || contextLost) return;
    const end = scene.current?.place(id, { ...start, [axis]: value });
    if (!end || (end.x === start.x && end.y === start.y && end.z === start.z)) return;
    movement.recordMove(id, start, end, axis === 'y');
    return personal.move(id, end);
  }
  const navigation = (
    <MapNavigation
      open={navigationOpen && !navigationHidden}
      area={floatingArea}
      focusOnOpen={navigationFocus}
      onClose={() => changeNavigation(false)}
      onNavigate={(command) => scene.current?.navigate(command)}
      object={selectedIds.length === 1 ? objects.get(selectedIds[0]) : undefined}
      objectPosition={
        selectedIds.length === 1 ? scene.current?.position(selectedIds[0]) : undefined
      }
      disabled={!personalReady || unavailable || contextLost}
      movementDisabled={!personal?.view || disabled || unavailable || contextLost}
      onEditPosition={(id, axis, value) => void editPosition(id, axis, value)}
      onMove={(id, axis, step) => {
        const position = scene.current?.position(id);
        if (!position) return;
        return editPosition(id, axis, position[axis] + step);
      }}
    >
      <label className="navigation-zero-reference">
        <input
          type="checkbox"
          checked={preferences.zeroReferenceAlwaysVisible}
          disabled={Boolean(personal && !personal.view)}
          aria-disabled={personal?.pending || undefined}
          onChange={(event) => {
            if (!personal?.pending) configure({ zeroReferenceAlwaysVisible: event.target.checked });
          }}
        />
        Nollreferens
      </label>
      <div className="navigation-height-help">
        <label>
          <input
            type="checkbox"
            checked={heightHelp}
            disabled={selectedIds.length !== 1}
            aria-describedby={selectedIds.length !== 1 ? `${labelPrefix}-height-help` : undefined}
            onChange={(event) => setHeightHelp(event.target.checked)}
          />
          Visa höjdhjälp
        </label>
        {selectedIds.length !== 1 && (
          <p id={`${labelPrefix}-height-help`}>Välj ett objekt för att visa höjdhjälp</p>
        )}
      </div>
      <details className="navigation-settings">
        <summary>Ordna min vy</summary>
        <fieldset disabled={personal && (!personal.view || personal.pending)}>
          <legend>Personliga visningsval</legend>
          {(
            [
              ['invertX', 'Vänd panorering i sidled'],
              ['invertY', 'Vänd panorering i höjdled'],
              ['axisPinned', 'Visa axlar hela tiden'],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={preferences[key]}
                onChange={(event) => configure({ [key]: event.target.checked })}
              />
              {label}
            </label>
          ))}
          <label htmlFor="personal-axis-corner">Axelvisarens hörn</label>
          <select
            id="personal-axis-corner"
            value={preferences.axisCorner}
            onChange={(event) =>
              configure({ axisCorner: event.target.value as ViewSettings['axisCorner'] })
            }
          >
            <option value="bottom-right">Nere till höger</option>
            <option value="bottom-left">Nere till vänster</option>
            <option value="top-right">Uppe till höger</option>
            <option value="top-left">Uppe till vänster</option>
          </select>
        </fieldset>
        {personal && (
          <button type="button" disabled={personal.pending} onClick={() => void personal.refresh()}>
            Läs in min aktuella vy
          </button>
        )}
      </details>
    </MapNavigation>
  );
  return (
    <section className="spatial-map" aria-label="Rymdkarta">
      <h2>Rymdkarta</h2>
      {settingsMount &&
        createPortal(
          <div className="map-settings">
            <h3>Bakgrund</h3>
            <label>
              <input
                type="checkbox"
                checked={preferences.background}
                disabled={Boolean(personal && !personal.view)}
                aria-disabled={personal?.pending || undefined}
                onChange={(event) => {
                  if (!personal?.pending) configure({ background: event.target.checked });
                }}
              />
              Visa bakgrund
            </label>
            <fieldset
              disabled={!preferences.background || Boolean(personal && !personal.view)}
              aria-busy={personal?.pending || undefined}
              className="background-choices"
            >
              <legend>Bakgrundsval</legend>
              <label htmlFor={`${labelPrefix}-light-background`}>Bakgrund i ljust tema</label>
              <select
                id={`${labelPrefix}-light-background`}
                value={preferences.lightBackground}
                aria-disabled={personal?.pending || undefined}
                onChange={(event) => {
                  if (!personal?.pending)
                    configure({
                      lightBackground: event.target.value as ViewSettings['lightBackground'],
                    });
                }}
              >
                <option value="pearl">Pärlemor</option>
                <option value="dawn">Gryningsdis</option>
                <option value="ocean">Under världshavet</option>
              </select>
              <label htmlFor={`${labelPrefix}-dark-background`}>Bakgrund i mörkt tema</label>
              <select
                id={`${labelPrefix}-dark-background`}
                value={preferences.darkBackground}
                aria-disabled={personal?.pending || undefined}
                onChange={(event) => {
                  if (!personal?.pending)
                    configure({
                      darkBackground: event.target.value as ViewSettings['darkBackground'],
                    });
                }}
              >
                <option value="atmosphere">Atmosfär</option>
                <option value="mist">Dis och ljuspunkter</option>
                <option value="universe">Universum</option>
                <option value="ocean">Under världshavet</option>
              </select>
            </fieldset>
            <fieldset
              disabled={backgroundMotionDisabled}
              aria-busy={personal?.pending || undefined}
              className="background-motion"
            >
              <legend>Bakgrundens rörelse</legend>
              {(
                [
                  ['panStrength', 'Panoreringsstyrka'],
                  ['zoomStrength', 'Zoomstyrka'],
                  ['layerDistance', 'Lageravstånd'],
                ] as const
              ).map(([key, label]) => (
                <BackgroundMotionSlider
                  key={key}
                  id={`${labelPrefix}-${key}`}
                  label={label}
                  value={preferences[key]}
                  percent={key !== 'layerDistance'}
                  busy={personal?.pending ?? false}
                  disabled={backgroundMotionDisabled}
                  onCommit={(value) => configure({ [key]: value })}
                  onUnsavedChange={setHasUnsavedMotion}
                />
              ))}
              <button
                type="button"
                aria-disabled={personal?.pending || undefined}
                onClick={() => {
                  if (!personal?.pending)
                    configure({
                      panStrength: defaultViewSettings.panStrength,
                      zoomStrength: defaultViewSettings.zoomStrength,
                      layerDistance: defaultViewSettings.layerDistance,
                    });
                }}
              >
                Återställ rörelse
              </button>
            </fieldset>
            {reducedMotion && <p>Bakgrunden är stilla eftersom minskad rörelse är aktiverad.</p>}
            <fieldset
              className="zero-reference-settings"
              disabled={Boolean(personal && !personal.view)}
              aria-busy={personal?.pending || undefined}
            >
              <legend>Nollreferens</legend>
              <label htmlFor={`${labelPrefix}-reference-variant`}>Variant</label>
              <select
                id={`${labelPrefix}-reference-variant`}
                value={preferences.zeroReferenceVariant}
                aria-disabled={personal?.pending || undefined}
                onChange={(event) => {
                  if (!personal?.pending)
                    configure({
                      zeroReferenceVariant: event.target
                        .value as ViewSettings['zeroReferenceVariant'],
                    });
                }}
              >
                <option value="square">Kvadrat</option>
                <option value="oval">Oval</option>
                <option value="circle">Cirkel</option>
                <option value="lines">Linjer</option>
              </select>
              <label htmlFor={`${labelPrefix}-reference-weight`}>Synlighet</label>
              <select
                id={`${labelPrefix}-reference-weight`}
                value={preferences.zeroReferenceWeight}
                aria-describedby={`${labelPrefix}-reference-weight-help`}
                aria-disabled={personal?.pending || undefined}
                onChange={(event) => {
                  if (!personal?.pending)
                    configure({
                      zeroReferenceWeight: event.target
                        .value as ViewSettings['zeroReferenceWeight'],
                    });
                }}
              >
                <option value="subtle">Diskret</option>
                <option value="original">Ursprunglig</option>
                <option value="prominent">Framträdande</option>
              </select>
              <p id={`${labelPrefix}-reference-weight-help`}>
                Synlighet anger referensens visuella styrka.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.zeroReferenceAlwaysVisible}
                  aria-disabled={personal?.pending || undefined}
                  onChange={(event) => {
                    if (!personal?.pending)
                      configure({ zeroReferenceAlwaysVisible: event.target.checked });
                  }}
                />
                Alltid synlig
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={preferences.zeroReferenceOnMovement}
                  disabled={preferences.zeroReferenceAlwaysVisible}
                  aria-describedby={`${labelPrefix}-reference-movement-help`}
                  aria-disabled={personal?.pending || undefined}
                  onChange={(event) => {
                    if (!personal?.pending)
                      configure({ zeroReferenceOnMovement: event.target.checked });
                  }}
                />
                Synlig vid dragning
              </label>
              <p id={`${labelPrefix}-reference-movement-help`}>
                Visar referensen vid objektflytt med dragning, flyttknappar eller koordinater och
                när du håller musens primära knapp stilla över ett objekt i 1,5 sekunder.
                {preferences.zeroReferenceAlwaysVisible &&
                  ' Alltid synlig är på. Ditt val för Synlig vid dragning finns kvar.'}
              </p>
              <ZeroReferenceTint
                id={`${labelPrefix}-reference-tint`}
                value={preferences.zeroReferenceTint}
                busy={personal?.pending ?? false}
                lines={preferences.zeroReferenceVariant === 'lines'}
                onCommit={(zeroReferenceTint) => configure({ zeroReferenceTint })}
                onUnsavedChange={setHasUnsavedTint}
              />
              <label>
                <input
                  type="checkbox"
                  checked={preferences.zeroReferenceKeepSize}
                  aria-describedby={`${labelPrefix}-reference-size-help`}
                  aria-disabled={personal?.pending || undefined}
                  onChange={(event) => {
                    if (!personal?.pending)
                      configure({ zeroReferenceKeepSize: event.target.checked });
                  }}
                />
                Behåll storlek vid zoom
              </label>
              <p id={`${labelPrefix}-reference-size-help`}>
                Nollreferensen behåller ungefär samma storlek på skärmen när du zoomar. Objektens
                positioner ändras inte.
              </p>
              <p>
                Referensen visar kartans fasta nollpunkt. Den är inget verkligt mått, golv eller
                tak. Dina val gäller bara dig i det här hushållet.
              </p>
            </fieldset>
            <p>Bakgrunden är dekorativ. Dina val sparas direkt för dig i det här hushållet.</p>
            <div role="status" aria-atomic="true">
              {(hasUnsavedMotion || hasUnsavedTint) && !personal?.pending ? (
                <p>Ändringen är inte sparad än.</p>
              ) : (
                personal?.message && (
                  <p
                    key={personal.messageId}
                    className={personal.toast ? 'personal-view-toast' : undefined}
                  >
                    {personal.message}
                  </p>
                )
              )}
            </div>
            {personal && (
              <button
                type="button"
                disabled={personal.pending}
                onClick={() => void personal.refresh()}
              >
                Läs in min aktuella vy
              </button>
            )}
          </div>,
          settingsMount,
        )}
      {cameraMount ? createPortal(cameraTools, cameraMount) : cameraTools}
      {navigationMount ? createPortal(navigation, navigationMount) : navigation}
      {menuEntry && active && !onObjectActions && (
        <ObjectActions
          entry={menuEntry}
          state={state}
          disabled={disabled}
          mapAvailable={active && personalReady && !unavailable && !contextLost}
          selectionAvailable={selectedIds.length > 0}
          onFocusSelection={() => {
            onCameraAction?.();
            if (onFocusSelection) onFocusSelection();
            else {
              const ids = new Set(selectedIds);
              for (const edge of relationships.values()) {
                if (
                  !selectedIds.includes(edge.sourceId) &&
                  (!edge.targetId || !selectedIds.includes(edge.targetId))
                )
                  continue;
                ids.add(edge.sourceId);
                if (edge.targetId) ids.add(edge.targetId);
              }
              focusObjects([...ids]);
            }
            canvas.current?.focus();
          }}
          onClose={closeMenu}
          onEdit={onEdit}
          onFocus={onFocus}
          onReveal={onReveal}
          onRead={onRead}
          onRelationships={onRelationships}
          onRemove={async (object) => {
            onRemove(object);
            return true;
          }}
        />
      )}
      {contextLost && (
        <p className="graphics-notice">Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.</p>
      )}
      {unavailable && <p>Rymdkartan kan inte visas. Använd Tabell för att fortsätta.</p>}
      <div
        ref={surface}
        className="spatial-surface"
        data-reveal-request={contextLost || unavailable ? undefined : completedRevealId}
        role="presentation"
        onPointerDownCapture={(event) => {
          if (!event.isPrimary) cancelHold();
          movement.down(event);
        }}
        onPointerMoveCapture={movement.move}
        onPointerUpCapture={movement.end}
        onPointerCancelCapture={movement.interrupt}
        onLostPointerCapture={(event) => {
          // An object's implicit touch capture is lost when the surface takes
          // over its drag. That bubbled event does not end the active gesture.
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) movement.lostCapture(event);
        }}
        onClickCapture={(event) => {
          if (movement.suppressClick()) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <canvas
          ref={canvas}
          role="img"
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              event.target !== event.currentTarget ||
              document.activeElement !== event.currentTarget ||
              !active ||
              event.nativeEvent.isComposing ||
              event.ctrlKey ||
              event.metaKey ||
              event.altKey
            )
              return;
            if (event.key === 'Escape' && onSearchClear) {
              event.preventDefault();
              event.stopPropagation();
              onSearchClear();
            } else if (/^[\p{L}\p{N}]$/u.test(event.key) && onSearchStart) {
              event.preventDefault();
              event.stopPropagation();
              onSearchStart(event.key);
            }
          }}
          onCompositionEnd={(event) => {
            if (
              event.target === event.currentTarget &&
              document.activeElement === event.currentTarget &&
              active &&
              /^[\p{L}\p{N}]+$/u.test(event.data.normalize('NFC'))
            )
              onSearchStart?.(event.data.normalize('NFC'));
          }}
          aria-label="Rymdens bakgrund. Välj innehåll med etiketterna eller tabellen."
          onContextMenu={(event) => {
            if (event.ctrlKey && !pointer.current?.moved) onClear();
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if (pointer.current) pointer.current.multiple = true;
            else
              pointer.current = {
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                moved: false,
                multiple: !event.isPrimary,
              };
          }}
          onPointerMove={(event) => {
            if (
              pointer.current &&
              Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) >=
                navigationDragThreshold
            )
              pointer.current.moved = true;
          }}
          onPointerUp={(event) => {
            if (
              pointer.current &&
              pointer.current.id === event.pointerId &&
              !pointer.current.moved &&
              !pointer.current.multiple &&
              Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) <
                navigationDragThreshold
            )
              onClear();
            pointer.current = null;
          }}
          onPointerCancel={() => {
            pointer.current = null;
          }}
          onLostPointerCapture={() => {
            pointer.current = null;
          }}
        />
        {visibleReferenceLabels.map((label) => (
          <span
            key={label.id}
            ref={observeLabel}
            data-layout-id={`reference-${label.id}`}
            className="zero-reference-label"
            aria-hidden="true"
            style={{ left: label.x, top: label.y }}
          >
            {label.text}
          </span>
        ))}
        <svg className="spatial-lines" aria-hidden="true">
          <defs>
            {/* WebKit ignores context-stroke, so each kind colours its own arrowhead. */}
            {connectionKinds.map((kind) => (
              <marker
                key={kind}
                id={`spatial-arrow-${kind}`}
                viewBox="0 0 10 10"
                refX="10"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="12"
                markerHeight="12"
                orient="auto-start-reverse"
                overflow="visible"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" className={`connection-arrow ${kind}`} />
              </marker>
            ))}
          </defs>
          {heightGuide && (
            <SpatialHeightGuide
              start={heightGuide.start}
              end={heightGuide.end}
              project={(position) => scene.current?.project(position)}
            />
          )}
          {[...locations].map(([id, point]) => {
            const label = labels.get(id);
            return (
              label && (
                <line
                  key={`leader-${id}`}
                  data-object-id={id}
                  className="label-leader"
                  x1={point.x}
                  y1={point.y}
                  x2={label.x}
                  y2={label.y}
                  strokeDasharray="1 4"
                />
              )
            );
          })}
          {labeledEdges.map(({ key, source, end, x, y }) => (
            <line
              key={`edge-leader-${key}`}
              className="label-leader"
              x1={(source.x + end.x) / 2}
              y1={(source.y + end.y) / 2}
              x2={x}
              y2={y}
              strokeDasharray="1 4"
            />
          ))}
          {edges.map(({ edge, geometry, previous, key }) => {
            return (
              // biome-ignore lint/a11y/useSemanticElements: SVG geometry supplies pointer selection; the HTML label supplies the keyboard route.
              <g
                key={key}
                role="button"
                tabIndex={-1}
                aria-label={`Välj ${previous ? 'tidigare samband' : 'samband'}: ${relationshipLabel(edge, state, objects)}`}
                onKeyDown={(event) => {
                  if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    if (event.altKey && event.key === 'Enter')
                      onOpenRelationshipDetails(edge, previous);
                    else onSelectRelationship(edge, previous);
                  }
                }}
                onClick={() => {
                  if (!disabled) onSelectRelationship(edge, previous);
                }}
                onDoubleClick={() => {
                  if (!disabled) onOpenRelationshipDetails(edge, previous);
                }}
              >
                <path d={geometry} className="connection-hit" />
              </g>
            );
          })}
        </svg>
        <div className="spatial-labels" ref={labelLayer}>
          {labeledEdges.map(({ edge, x, y, selected, kind, previous, key }) => (
            <button
              key={key}
              data-layout-id={`relationship-${key}`}
              ref={observeLabel}
              type="button"
              disabled={disabled}
              className={`spatial-edge ${kind}${selected ? ' selected' : ''}`}
              aria-label={`Välj ${previous ? 'tidigare samband' : 'samband'}: ${relationshipLabel(edge, state, objects)}`}
              aria-describedby={`${relationshipLabelPrefix}-${previous ? 'previous' : 'current'}-${edge.id}`}
              style={
                {
                  left: x,
                  top: y,
                  '--label-scale': textScale(edge.sourceId, edge.targetId),
                } as CSSProperties
              }
              onClick={() => onSelectRelationship(edge, previous)}
              onDoubleClick={() => onOpenRelationshipDetails(edge, previous)}
              onKeyDown={(event) => {
                if (!disabled && event.altKey && event.key === 'Enter') {
                  event.preventDefault();
                  onOpenRelationshipDetails(edge, previous);
                }
              }}
            >
              <span
                id={`${relationshipLabelPrefix}-${previous ? 'previous' : 'current'}-${edge.id}`}
                className="spatial-label-card"
              >
                <span className="spatial-caption">
                  <ProposalSymbol
                    change={
                      kind === 'existing'
                        ? undefined
                        : {
                            before: kind === 'added' ? null : edge,
                            after: kind === 'removed' ? null : edge,
                          }
                    }
                  />{' '}
                  →{' '}
                  {state.relationshipTypes.find((type) => type.id === edge.typeId)?.forwardLabel ??
                    state.relationshipTypes.find((type) => type.id === edge.typeId)?.name}
                </span>
                <LifecycleStatus value={edge} />
              </span>
            </button>
          ))}
          {[...labels].map(([id, label]) => {
            const object = objects.get(id);
            if (!object) return null;
            const kind = proposalKind(state.draft.changes.find((change) => change.id === id));
            return (
              <button
                type="button"
                disabled={disabled}
                aria-label={`Markera objekt: ${object.name}`}
                aria-pressed={selectedIds.includes(id)}
                {...objectEvents(object)}
                key={id}
                aria-describedby={`${labelPrefix}-${id}`}
                data-layout-id={`object-${id}`}
                data-object-label={id}
                ref={observeLabel}
                className={`spatial-name ${kind}${searchHitIds && !searchHitIds.has(id) ? ' search-context' : ''}${adjacent.size && !adjacent.has(id) ? ' subdued' : ''}`}
                style={
                  { left: label.x, top: label.y, '--label-scale': textScale(id) } as CSSProperties
                }
              >
                <span id={`${labelPrefix}-${id}`} className="spatial-label-card">
                  <span className="spatial-caption">{object.name}</span>
                  {searchHitIds && (
                    <span className="spatial-search-kind">
                      {searchHitIds.has(id) ? '● Sökträff' : '↔ Sammanhang'}
                    </span>
                  )}
                  <span className="spatial-type-name">
                    {state.types.find((type) => type.id === object.typeId)?.name}
                    {kind === 'added'
                      ? ' · + Nytt förslag'
                      : kind === 'changed'
                        ? ' · ✎ Ändrat förslag'
                        : kind === 'removed'
                          ? ' · × Föreslås tas bort'
                          : ''}
                  </span>
                  <LifecycleStatus value={object} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="spatial-objects">
          {[...locations.values()]
            .sort((a, b) => b.depth - a.depth)
            .map((point) => {
              const object = objects.get(point.id);
              if (!object) return null;
              const kind = proposalKind(
                state.draft.changes.find((change) => change.id === object.id),
              );
              return (
                <button
                  key={point.id}
                  data-object-id={object.id}
                  type="button"
                  disabled={disabled}
                  aria-label={`Välj objekt: ${object.name}`}
                  aria-describedby={
                    labels.has(object.id) ? `${labelPrefix}-${object.id}` : undefined
                  }
                  aria-pressed={selectedIds.includes(object.id)}
                  className={`spatial-node ${kind}${adjacent.size && !adjacent.has(object.id) ? ' subdued' : ''}`}
                  style={{ left: point.x, top: point.y }}
                  {...objectEvents(object)}
                >
                  <span
                    className="spatial-orb"
                    style={{ '--symbol-scale': point.scale } as CSSProperties}
                  >
                    <SpatialObjectGlyph
                      typeName={state.types.find((type) => type.id === object.typeId)?.name ?? ''}
                      name={object.name}
                      householdId={object.householdId}
                      profileImageId={object.profileImageId}
                      iconId={object.iconId}
                    />
                  </span>
                  {markerTints.has(point.id) && (
                    <svg
                      className="zero-reference-marker-tint"
                      aria-hidden="true"
                      width={34 * point.scale}
                      height={34 * point.scale}
                      viewBox={`${point.x - 17 * point.scale} ${point.y - 17 * point.scale} ${34 * point.scale} ${34 * point.scale}`}
                    >
                      {markerTints.get(point.id)?.map((region) => (
                        <path
                          key={region.name}
                          d={region.path}
                          fill={region.color}
                          fillOpacity={tintOpacity}
                        />
                      ))}
                    </svg>
                  )}
                  <ProposalSymbol
                    change={state.draft.changes.find((change) => change.id === object.id)}
                  />
                </button>
              );
            })}
        </div>
        <svg className="spatial-lines spatial-depth-lines" aria-hidden="true">
          {surfaceWidth > 0 &&
            surfaceHeight > 0 &&
            edges.map(({ edge, start, tip, bend, geometry, selected, kind, previous, key }) => {
              const maskId = `${occlusionPrefix}-${key}`;
              const occluders = connectionOcclusion(start, tip, locations.values(), bend);
              const arrowOccluders = connectionOcclusion(tip, tip, locations.values());
              const region = (left: number, top: number, right: number, bottom: number) => {
                // Round outward to retain a whole-pixel margin at every edge.
                const x = Math.max(0, Math.min(surfaceWidth, Math.floor(left)));
                const y = Math.max(0, Math.min(surfaceHeight, Math.floor(top)));
                return {
                  x,
                  y,
                  width: Math.max(0, Math.min(surfaceWidth, Math.ceil(right)) - x),
                  height: Math.max(0, Math.min(surfaceHeight, Math.ceil(bottom)) - y),
                };
              };
              const controlY = (start.y + tip.y) / 2 + bend;
              const masks = [
                {
                  id: maskId,
                  points: occluders,
                  // The quadratic stays inside its control hull; eight pixels
                  // also enclose the selected 7.4px surround and antialiasing.
                  bounds: region(
                    Math.min(start.x, tip.x) - 8,
                    Math.min(start.y, tip.y, controlY) - 8,
                    Math.max(start.x, tip.x) + 8,
                    Math.max(start.y, tip.y, controlY) + 8,
                  ),
                },
                {
                  id: `${maskId}-arrow`,
                  points: arrowOccluders,
                  // Include the 12px marker, its outline and rotated miters.
                  bounds: region(tip.x - 16, tip.y - 16, tip.x + 16, tip.y + 16),
                },
              ];
              // A short shaft establishes the endpoint tangent for the marker.
              // Its separate mask uses endpoint depth across the entire arrowhead.
              const tangentX = tip.x - start.x;
              const tangentY = tip.y - start.y - 2 * bend;
              const tangentLength = Math.hypot(tangentX, tangentY) || 1;
              const tintBounds = region(
                Math.min(start.x, tip.x) - 18,
                Math.min(start.y, tip.y, controlY) - 18,
                Math.max(start.x, tip.x) + 18,
                Math.max(start.y, tip.y, controlY) + 18,
              );
              const tint =
                bend && tangentX === 0
                  ? verticalCurveTints(depthPatches, start, tip, bend).map((region) => ({
                      ...region,
                      geometry,
                    }))
                  : depthTintRegions(depthPatches, tintBounds, (point) => {
                      const fraction =
                        bend && tangentX !== 0
                          ? (point.x - start.x) / tangentX
                          : ((point.x - start.x) * tangentX + (point.y - start.y) * tangentY) /
                            (tangentX ** 2 + tangentY ** 2 || 1);
                      return (
                        1 / start.depth +
                        (1 / tip.depth - 1 / start.depth) * Math.max(0, Math.min(1, fraction))
                      );
                    }).map((region) => ({ ...region, geometry, mask: undefined }));
              const arrowTint = depthTintRegions(depthPatches, tintBounds, () => 1 / tip.depth);
              const unitX = tangentX / tangentLength;
              const unitY = tangentY / tangentLength;
              const arrowShape = `M ${tip.x} ${tip.y} L ${tip.x - 12 * unitX + 6 * unitY} ${tip.y - 12 * unitY - 6 * unitX} L ${tip.x - 12 * unitX - 6 * unitY} ${tip.y - 12 * unitY + 6 * unitX} Z`;
              return (
                <g key={key} className={`spatial-connection ${kind}${selected ? ' selected' : ''}`}>
                  <defs>
                    {masks.map((mask) => (
                      <g key={mask.id}>
                        {mask.points.map((point) => (
                          <clipPath key={point.id} id={`${mask.id}-${point.id}`}>
                            <circle cx={point.x} cy={point.y} r={point.radius} />
                          </clipPath>
                        ))}
                        <mask id={mask.id} maskUnits="userSpaceOnUse" {...mask.bounds}>
                          <rect {...mask.bounds} fill="white" />
                          {mask.points.map((point) => (
                            <path
                              key={point.id}
                              clipPath={`url(#${mask.id}-${point.id})`}
                              d={point.path}
                              fill="black"
                            />
                          ))}
                        </mask>
                      </g>
                    ))}
                  </defs>
                  <path
                    d={geometry}
                    fill="none"
                    mask={occluders.length ? `url(#${maskId})` : undefined}
                    className={`connection-underlay ${kind}${selected ? ' selected' : ''}`}
                  />
                  {kind === 'removed' ? (
                    <path
                      d={geometry}
                      fill="none"
                      mask={occluders.length ? `url(#${maskId})` : undefined}
                      className={`connection ${kind}${previous ? ' previous' : ''}${selected ? ' selected' : ''}`}
                      data-previous-relationship={previous ? edge.id : undefined}
                    >
                      <title>
                        {previous ? 'Tidigare samband: ' : ''}
                        {relationshipLabel(edge, state, objects)}
                      </title>
                    </path>
                  ) : (
                    <line
                      x1={start.x}
                      y1={start.y}
                      x2={tip.x}
                      y2={tip.y}
                      mask={occluders.length ? `url(#${maskId})` : undefined}
                      className={`connection ${kind}${selected ? ' selected' : ''}`}
                    />
                  )}
                  <path
                    d={`M ${tip.x - (tangentX / tangentLength) * 0.001} ${tip.y - (tangentY / tangentLength) * 0.001} L ${tip.x} ${tip.y}`}
                    fill="none"
                    mask={arrowOccluders.length ? `url(#${maskId}-arrow)` : undefined}
                    markerEnd={`url(#spatial-arrow-${kind})`}
                    className={`connection-arrow-shaft ${kind}${selected ? ' selected' : ''}`}
                  />
                  {tint.map((region, index) => (
                    <g
                      key={region.name}
                      className="zero-reference-connection-tint"
                      clipPath={`url(#${maskId}-tint-${index})`}
                      mask={region.mask ? `url(#${maskId}-tint-depth-${index})` : undefined}
                    >
                      <defs>
                        <clipPath id={`${maskId}-tint-${index}`}>
                          <path d={region.path} />
                        </clipPath>
                        {region.mask && (
                          <>
                            {region.mask.foreground.map((interval, part) => (
                              <clipPath
                                key={interval.geometry}
                                id={`${maskId}-tint-front-${index}-${part}`}
                              >
                                <rect
                                  x={tintBounds.x}
                                  y={interval.minimum}
                                  width={tintBounds.width}
                                  height={interval.maximum - interval.minimum}
                                />
                              </clipPath>
                            ))}
                            <mask
                              id={`${maskId}-tint-depth-${index}`}
                              maskUnits="userSpaceOnUse"
                              {...tintBounds}
                            >
                              {region.mask.behind.map((interval) => (
                                <rect
                                  key={`${interval.minimum}:${interval.maximum}`}
                                  x={tintBounds.x}
                                  y={interval.minimum}
                                  width={tintBounds.width}
                                  height={interval.maximum - interval.minimum}
                                  fill="white"
                                />
                              ))}
                              {region.mask.foreground.map((interval, part) => (
                                <path
                                  key={interval.geometry}
                                  clipPath={`url(#${maskId}-tint-front-${index}-${part})`}
                                  d={interval.geometry}
                                  className={`connection ${kind}${selected ? ' selected' : ''}`}
                                  style={{ stroke: 'black', strokeDashoffset: interval.dashOffset }}
                                  fill="none"
                                />
                              ))}
                            </mask>
                          </>
                        )}
                      </defs>
                      <path
                        d={region.geometry}
                        className={`connection ${kind}${previous ? ' previous' : ''}${selected ? ' selected' : ''}`}
                        style={{ stroke: region.color }}
                        opacity={tintOpacity}
                        fill="none"
                        mask={occluders.length ? `url(#${maskId})` : undefined}
                      />
                    </g>
                  ))}
                  {arrowTint.map((region, index) => (
                    <g
                      key={region.name}
                      className="zero-reference-connection-tint"
                      clipPath={`url(#${maskId}-arrow-tint-${index})`}
                    >
                      <defs>
                        <clipPath id={`${maskId}-arrow-tint-${index}`}>
                          <path d={region.path} />
                        </clipPath>
                      </defs>
                      <path
                        d={arrowShape}
                        fill={region.color}
                        opacity={tintOpacity}
                        mask={arrowOccluders.length ? `url(#${maskId}-arrow)` : undefined}
                      />
                    </g>
                  ))}
                </g>
              );
            })}
        </svg>
        {(moving || preferences.axisPinned) && (
          <SpatialOrientation orientation={orientation} corner={preferences.axisCorner} />
        )}
      </div>
      <p
        className="spatial-movement-result"
        role="status"
        aria-label="Flyttresultat"
        aria-atomic="true"
      >
        {movementResult}
      </p>
      <div aria-live="polite" aria-atomic="true">
        {personal?.message && !positionRecoveryActive && (
          <p
            key={personal.messageId}
            ref={showPersonalToast}
            popover={personal.toast ? 'manual' : undefined}
            className={`personal-view-status${personal.toast ? ' personal-view-toast' : ''}`}
          >
            {personal.message}
          </p>
        )}
      </div>
      {labelMount ? createPortal(labelFeedback, labelMount) : labelFeedback}
    </section>
  );
}
