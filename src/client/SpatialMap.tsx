import './spatial.css';
import './spatial-camera.css';
import {
  type ButtonHTMLAttributes,
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
import { LifecycleStatus } from './Lifecycle.js';
import { MapNavigation } from './MapNavigation.js';
import { ObjectRemovalNotice } from './ObjectRemovalNotice.js';
import { relationshipLabel } from './RelationshipEditor.js';
import { SpatialHeightGuide } from './SpatialHeightGuide.js';
import { SpatialObjectGlyph } from './SpatialObjectGlyph.js';
import { SpatialOrientation } from './SpatialOrientation.js';
import { navigationDragThreshold } from './spatial-navigation.js';
import { type ProjectedPoint, spatialScene } from './spatial-scene.js';
import { useObjectMovement } from './use-object-movement.js';
import type { usePersonalView } from './use-personal-view.js';
import { WorkspaceIcon } from './WorkspaceTools.js';

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
function proposalKind(change?: { before: unknown; after: unknown }) {
  return change ? (!change.after ? 'removed' : !change.before ? 'added' : 'changed') : 'existing';
}
function arrowTip(source: { x: number; y: number }, target: { x: number; y: number }, radius = 28) {
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const fraction = Math.min(radius / (Math.hypot(dx, dy) || 1), 0.45);
  return { x: target.x + dx * fraction, y: target.y + dy * fraction };
}

export function SpatialMap({
  theme = 'dark',
  state,
  active,
  objects,
  relationships,
  selection,
  selectedIds = selection?.kind === 'object' ? [selection.id] : [],
  disabled,
  onSelect,
  onEdit = onSelect,
  onOpenDetails = onEdit,
  onSelectRelationship,
  onFocus,
  onClear,
  onReset,
  onRemove,
  personal,
  revealRequest,
  focusRequest,
  onFocusSelection,
  onShowOverview,
  cameraMount,
  settingsMount,
  onCameraAction,
  navigationMount,
  onNavigationChange,
  onAvailabilityChange,
  openWork,
}: {
  onAvailabilityChange?: (available: boolean) => void;
  theme?: 'light' | 'dark';
  state: MapState;
  active: boolean;
  objects: Map<string, MapObject>;
  relationships: Map<string, MapRelationship>;
  selection: { kind: 'object' | 'relationship'; id: string; previous?: boolean } | null;
  selectedIds?: string[];
  disabled: boolean;
  onSelect: (object: MapObject, additive?: boolean) => void;
  onEdit?: (object: MapObject) => void;
  onOpenDetails?: (object: MapObject) => void;
  onSelectRelationship: (edge: MapRelationship, previous?: boolean) => void;
  onFocus: (id: string) => void;
  onClear: () => void;
  onReset: () => void;
  onRemove: (object: MapObject) => void;
  personal?: ReturnType<typeof usePersonalView>;
  revealRequest?: { id: string; objectIds: string[]; relationshipId?: string };
  focusRequest?: { id: string; objectIds: string[] };
  onFocusSelection?: () => void;
  onShowOverview?: () => void;
  cameraMount?: HTMLElement | null;
  settingsMount?: HTMLElement | null;
  onCameraAction?: () => void;
  navigationMount?: HTMLElement | null;
  onNavigationChange?: (open: boolean) => void;
  openWork?: readonly string[];
}) {
  const labelPrefix = useId();
  const relationshipLabelPrefix = useId();
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
  const menu = useRef<HTMLDialogElement>(null);
  const [menuObject, setMenuObject] = useState<MapObject | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);
  const contextClick = useRef<string | null>(null);
  const cancelHold = useCallback(() => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
  }, []);
  function openMenu(object: MapObject, target: HTMLElement) {
    cancelHold();
    movement.cancel();
    returnFocus.current = target;
    setMenuObject(object);
  }
  function closeMenu() {
    menu.current?.close();
    setMenuObject(null);
    returnFocus.current?.focus();
  }
  useEffect(() => {
    if (menuObject && active) menu.current?.showModal();
    else if (menu.current?.open) menu.current.close();
  }, [menuObject, active]);
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
    const boxes = [
      ...root.querySelectorAll(
        '.workspace-tools, .workspace-context, .workspace-feedback, .voice-box, .workspace-voice-controls, .conversation-notice, .map-navigation, .spatial-bottom-bar, .label-note, .spatial-display-tools > summary, .spatial-view-actions',
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
  }, []);
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
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const [shortViewport, setShortViewport] = useState(
    () => window.matchMedia?.('(max-width: 700px) and (max-height: 450px)').matches ?? false,
  );
  useEffect(() => {
    const viewport = window.matchMedia?.('(max-width: 700px) and (max-height: 450px)');
    if (!viewport) return;
    const update = () => setShortViewport(viewport.matches);
    update();
    viewport.addEventListener('change', update);
    return () => viewport.removeEventListener('change', update);
  }, []);
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
  const [completedRevealId, setCompletedRevealId] = useState<string>();
  const [completedFocusId, setCompletedFocusId] = useState<string>();
  const [overviewShown, setOverviewShown] = useState(false);
  const [overviewRequested, setOverviewRequested] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => {
    onAvailabilityChange?.(!unavailable && !contextLost);
  }, [unavailable, contextLost, onAvailabilityChange]);
  const allLabels = preferences.allLabels;
  const previousLabels = useRef(false);
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
    enabled: Boolean(personal?.view) && !personal?.pending && !contextLost,
    active,
    cancelHold,
    onMove: (id, position) => personal?.move(id, position),
  });
  useEffect(() => {
    if (!activated || !canvas.current) return;
    const element = canvas.current;
    const lost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
      movement.cancel();
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
      scene.current = spatialScene(
        element,
        setPoints,
        setOrientation,
        motion,
        surface.current ?? element,
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
  }, [activated, motion, movement.cancel]);
  const personalReady = !personal || Boolean(personal.view);
  useEffect(() => {
    // The first scene update frames the layout, including saved personal positions.
    if (!activated || !personalReady) return;
    scene.current?.update([...objects.keys()], personal?.view?.positions, [
      ...relationships.values(),
    ]);
  }, [objects, relationships, activated, personal?.view?.positions, personalReady]);
  useEffect(() => {
    if (!activated) return;
    scene.current?.select(selectedIds);
  }, [activated, selectedIds]);
  useEffect(() => {
    if (!activated) return;
    scene.current?.configure({ ...preferences, stars: preferences.stars && !reducedMotion }, theme);
    if (!active) return;
    if (preferences.allLabels && !previousLabels.current) {
      if (scene.current?.openLabelView()) setCloserLabels(true);
    }
    previousLabels.current = preferences.allLabels;
  }, [preferences, activated, active, reducedMotion, theme]);
  useEffect(() => {
    if (
      revealRequest &&
      revealRequest.id !== completedRevealId &&
      active &&
      activated &&
      personalReady &&
      !contextLost &&
      revealRequest.objectIds.every((id) => objects.has(id)) &&
      (!revealRequest.relationshipId || relationships.has(revealRequest.relationshipId))
    ) {
      if (navigationOpen) {
        // Framing uses the committed canvas dimensions after navigation closes.
        setNavigationOpen(false);
        onNavigationChange?.(false);
        return;
      }
      if (scene.current?.reveal(revealRequest.objectIds)) setCompletedRevealId(revealRequest.id);
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
  ]);
  const focusObjects = useCallback((ids: string[]) => {
    const element = canvas.current;
    if (!element) return false;
    const bounds = element.getBoundingClientRect();
    // Reserve actual fixed tools, including expanded controls and live status.
    // Free detail panels retain their position and are never closed by focus.
    let area = { left: 0, top: 0, right: bounds.width, bottom: bounds.height };
    const overlays = element
      .closest('.household-map')
      ?.querySelectorAll(
        '.workspace-tools, .workspace-context, .workspace-feedback, .voice-box, .workspace-voice-controls, .spatial-tools, .map-navigation, .spatial-bottom-bar, .spatial-display-tools, .spatial-view-actions',
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
      if (
        obstacle.left >= area.right ||
        obstacle.right <= area.left ||
        obstacle.top >= area.bottom ||
        obstacle.bottom <= area.top
      )
        continue;
      const candidates = [
        { ...area, left: Math.max(area.left, obstacle.right + 12) },
        { ...area, right: Math.min(area.right, obstacle.left - 12) },
        { ...area, top: Math.max(area.top, obstacle.bottom + 12) },
        { ...area, bottom: Math.min(area.bottom, obstacle.top - 12) },
      ];
      const size = (value: typeof area) =>
        Math.max(0, value.right - value.left) * Math.max(0, value.bottom - value.top);
      area = candidates.reduce((largest, candidate) =>
        size(candidate) > size(largest) ? candidate : largest,
      );
    }
    if (area.right - area.left <= 48 || area.bottom - area.top <= 48) return false;
    const marginX = Math.min(64, Math.max(24, (area.right - area.left) / 4));
    const marginY = Math.min(64, Math.max(24, (area.bottom - area.top) / 4));
    return (
      scene.current?.focus(ids, {
        left: area.left + marginX,
        right: area.right - marginX,
        top: area.top + marginY,
        bottom: area.bottom - marginY,
      }) ?? false
    );
  }, []);
  useEffect(() => {
    if (
      focusRequest &&
      focusRequest.id !== completedFocusId &&
      active &&
      personalReady &&
      !contextLost &&
      !unavailable &&
      focusRequest.objectIds.every((id) => objects.has(id)) &&
      focusObjects(focusRequest.objectIds)
    )
      setCompletedFocusId(focusRequest.id);
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
    if (!overviewRequested) return;
    setOverviewShown(scene.current?.toggleOverview() ?? false);
    setOverviewRequested(false);
  }, [overviewRequested]);
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
        } else openMenu(object, event.currentTarget);
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
              openMenu(object, target);
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
      onPointerLeave: cancelHold,
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
    };
  }
  const locations = new Map(
    points.filter((point) => point.visible).map((point) => [point.id, point]),
  );
  const surfaceWidth = canvas.current?.clientWidth ?? 0;
  const surfaceHeight = canvas.current?.clientHeight ?? 0;
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
  const previousEdges = (state.draft.relationships ?? []).flatMap(({ before, after }) => {
    if (
      !before ||
      !after ||
      (before.sourceId === after.sourceId &&
        before.targetId === after.targetId &&
        before.typeId === after.typeId &&
        before.knowledge === after.knowledge)
    )
      return [];
    return [{ edge: before, previous: true }];
  });
  const edges = [...relationships.values()]
    .map((edge) => ({ edge, previous: false }))
    .concat(previousEdges)
    .flatMap(({ edge, previous }) => {
      const source = locations.get(edge.sourceId);
      const target = edge.targetId ? locations.get(edge.targetId) : undefined;
      if (!source || (edge.targetId && !target)) return [];
      const end = target ?? {
        x: source.x + (source.x > surfaceWidth * 0.65 ? -100 : 100),
        y: source.y + (source.y > surfaceHeight * 0.65 ? -80 : 80),
      };
      const tip = arrowTip(source, end, target ? 29 : 0);
      const start = arrowTip(end, source, 22);
      const selected =
        selection?.kind === 'relationship'
          ? selection.id === edge.id && Boolean(selection.previous) === previous
          : selectedIds.includes(edge.sourceId) ||
            Boolean(edge.targetId && selectedIds.includes(edge.targetId));
      const kind = previous
        ? 'removed'
        : proposalKind(state.draft.relationships?.find((change) => change.id === edge.id));
      const length = Math.hypot(tip.x - start.x, tip.y - start.y) || 1;
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
          selected,
          kind,
          previous,
          key: `${previous ? 'previous-' : ''}${edge.id}`,
        },
      ];
    });
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
      for (let y = origin.height / 2 + 8; y <= surfaceHeight - origin.height / 2 - 8; y += 24)
        for (let x = origin.width / 2 + 8; x <= surfaceWidth - origin.width / 2 - 8; x += 24)
          available.push({ ...origin, x, y });
      available.sort(
        (a, b) =>
          Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y),
      );
      return place(available);
    }
    return null;
  }
  const labelEdges = edges.filter(({ selected }) => allLabels || selected);
  function placeEdges(candidates: typeof labelEdges) {
    return candidates.flatMap((edge) => {
      const type = state.relationshipTypes.find((type) => type.id === edge.edge.typeId);
      const size = labelSize(`relationship-${edge.key}`, {
        width: Math.min(230, (type?.forwardLabel ?? type?.name ?? '').length * 7 + 24),
        height: 30,
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
  const primaryEdges =
    selection?.kind === 'relationship' ? labelEdges.filter(({ selected }) => selected) : [];
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
  const hiddenLabels = locations.size - labels.size + labelEdges.length - labeledEdges.length;
  const adjacent = new Set<string>();
  const guideId = movement.heightActive
    ? movement.guide?.id
    : selection?.kind === 'object'
      ? selection.id
      : undefined;
  const guidePosition = guideId && locations.has(guideId) ? scene.current?.position(guideId) : null;
  const heightGuide =
    guidePosition && (heightHelp || shiftHeld || movement.heightActive)
      ? {
          start:
            movement.guide && movement.guide.id === guideId ? movement.guide.start : guidePosition,
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
  const cameraTools = (
    <nav className="spatial-view-actions" aria-label="Kameravy">
      <button
        type="button"
        ref={navigationTrigger}
        title="Navigera"
        aria-label="Navigera"
        aria-expanded={navigationOpen}
        onClick={() => {
          onCameraAction?.();
          changeNavigation(!navigationOpen);
        }}
      >
        <WorkspaceIcon name="navigate" />
        <span>Navigera</span>
      </button>
      <button
        type="button"
        title="Fokusera markering"
        aria-label="Fokusera markering"
        disabled={!selectedIds.length || !active || !personalReady || unavailable || contextLost}
        onClick={() => {
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
        }}
      >
        <WorkspaceIcon name="focus" />
        <span>Fokusera markering</span>
      </button>
      <button
        type="button"
        title={overviewShown ? 'Återgå till föregående vy' : 'Visa hela kartan'}
        aria-label={overviewShown ? 'Återgå till föregående vy' : 'Visa hela kartan'}
        disabled={!active || !personalReady || unavailable || contextLost}
        onClick={() => {
          onCameraAction?.();
          if (!overviewShown) onShowOverview?.();
          setOverviewRequested(true);
        }}
      >
        <WorkspaceIcon name={overviewShown ? 'returnView' : 'overview'} />
        <span>{overviewShown ? 'Återgå till föregående vy' : 'Visa hela kartan'}</span>
      </button>
    </nav>
  );
  const navigation = (
    <MapNavigation
      open={navigationOpen}
      openWork={openWork}
      onClose={() => changeNavigation(false)}
      onNavigate={(command) => scene.current?.navigate(command)}
      object={selectedIds.length === 1 ? objects.get(selectedIds[0]) : undefined}
      disabled={!personalReady || unavailable || contextLost}
      movementDisabled={
        !personal?.view || personal.pending || disabled || unavailable || contextLost
      }
      onMove={(id, axis, step) => {
        const position = scene.current?.position(id);
        if (!position) return;
        const next = { ...position, [axis]: position[axis] + step };
        const end = scene.current?.place(id, next) ?? next;
        movement.recordMove(id, position, end, axis === 'y');
        if (axis === 'y') setHeightHelp(true);
        void personal?.move(id, end);
      }}
    >
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
            <label>
              <input
                type="checkbox"
                checked={preferences.stars && !reducedMotion}
                disabled={
                  reducedMotion || Boolean(personal && (!personal.view || personal.pending))
                }
                onChange={(event) => configure({ stars: event.target.checked })}
              />
              Visa stjärnhimmel
            </label>
            {reducedMotion && <span>Minskad rörelse: stjärnhimlen är avstängd.</span>}
            <p>Stjärnhimlen följer panorering, rotation och zoom. Ditt val sparas direkt.</p>
            {personal?.message && <p role="status">{personal.message}</p>}
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
      <dialog
        ref={menu}
        className="spatial-menu"
        onClickCapture={(event) => {
          if (held.current) {
            held.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
      >
        <h3>{menuObject?.name}</h3>
        <button
          type="button"
          onClick={() => {
            if (menuObject) onEdit(menuObject);
            closeMenu();
          }}
        >
          Redigera objekt
        </button>
        <button
          type="button"
          onClick={() => {
            if (menuObject) onFocus(menuObject.id);
            closeMenu();
          }}
        >
          Visa kopplingar
        </button>
        <button
          type="button"
          aria-describedby={`${labelPrefix}-removal`}
          disabled={
            disabled ||
            state.draft.changes.some((change) => change.id === menuObject?.id && !change.after)
          }
          onClick={() => {
            if (menuObject) onRemove(menuObject);
            closeMenu();
          }}
        >
          Ta bort objekt
        </button>
        {menuObject && (
          <ObjectRemovalNotice
            state={state}
            objectId={menuObject.id}
            id={`${labelPrefix}-removal`}
          />
        )}
        <button type="button" onClick={closeMenu}>
          Avbryt
        </button>
      </dialog>
      {contextLost && (
        <p className="graphics-notice">Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.</p>
      )}
      {unavailable && (
        <p>Rymdkartan kan inte visas. Använd Lista och detaljer för att fortsätta.</p>
      )}
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
        onPointerCancelCapture={movement.cancel}
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
          aria-label="Rymdens bakgrund. Välj innehåll med etiketterna eller listan."
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
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
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
                  strokeDasharray={
                    Math.hypot(point.x - label.x, point.y - label.y) > 80 ? '5 5' : undefined
                  }
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
              strokeDasharray={
                Math.hypot((source.x + end.x) / 2 - x, (source.y + end.y) / 2 - y) > 80
                  ? '5 5'
                  : undefined
              }
            />
          ))}
          {edges.map(({ edge, start, tip, selected, kind, previous, key }) => {
            const geometry =
              kind === 'removed'
                ? `M ${start.x} ${start.y} Q ${(start.x + tip.x) / 2} ${(start.y + tip.y) / 2 + 23} ${tip.x} ${tip.y}`
                : `M ${start.x} ${start.y} L ${tip.x} ${tip.y}`;
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
                    onSelectRelationship(edge, previous);
                  }
                }}
                onClick={() => {
                  if (!disabled) onSelectRelationship(edge, previous);
                }}
              >
                <path d={geometry} className="connection-hit" />
                {kind === 'removed' ? (
                  <path
                    d={geometry}
                    fill="none"
                    markerEnd={`url(#spatial-arrow-${kind})`}
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
                    markerEnd={`url(#spatial-arrow-${kind})`}
                    className={`connection ${kind}${selected ? ' selected' : ''}`}
                  />
                )}
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
              style={{ left: x, top: y }}
              onClick={() => onSelectRelationship(edge, previous)}
            >
              <span
                id={`${relationshipLabelPrefix}-${previous ? 'previous' : 'current'}-${edge.id}`}
              >
                <span className="spatial-caption">
                  <ProposalSymbol
                    change={
                      previous
                        ? { before: edge, after: null }
                        : state.draft.relationships?.find((change) => change.id === edge.id)
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
                className={`spatial-name ${kind}${adjacent.size && !adjacent.has(id) ? ' subdued' : ''}`}
                style={{ left: label.x, top: label.y }}
              >
                <span id={`${labelPrefix}-${id}`}>
                  <span className="spatial-caption">{object.name}</span>
                  <span className="spatial-type-name">
                    {kind === 'added'
                      ? '+ Nytt förslag'
                      : kind === 'changed'
                        ? '✎ Ändrat förslag'
                        : kind === 'removed'
                          ? '× Föreslås tas bort'
                          : state.types.find((type) => type.id === object.typeId)?.name}
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
                    style={{ width: 34 * point.scale, height: 34 * point.scale }}
                  >
                    <SpatialObjectGlyph
                      typeName={state.types.find((type) => type.id === object.typeId)?.name ?? ''}
                      name={object.name}
                      householdId={object.householdId}
                      profileImageId={object.profileImageId}
                      iconId={object.iconId}
                    />
                  </span>
                  <ProposalSymbol
                    change={state.draft.changes.find((change) => change.id === object.id)}
                  />
                </button>
              );
            })}
        </div>
        {(moving || preferences.axisPinned) && (
          <SpatialOrientation orientation={orientation} corner={preferences.axisCorner} />
        )}
      </div>
      {personal?.message && (
        <p aria-live="polite" className="personal-view-status">
          {personal.message}
        </p>
      )}
      <details
        className="spatial-display-tools"
        open={!shortViewport}
        onToggle={measureReservedBoxes}
      >
        <summary>Visningsval</summary>
        <div className="spatial-bottom-bar">
          <button
            type="button"
            onClick={() => {
              setCloserLabels(false);
              onReset();
              setResetRequested(true);
            }}
          >
            Återställ vy
          </button>
          <label>
            <input
              type="checkbox"
              checked={allLabels}
              disabled={personal && (!personal.view || personal.pending)}
              onChange={(event) => {
                configure({ allLabels: event.target.checked });
              }}
            />{' '}
            Alla etiketter
          </label>
          <label>
            <input
              type="checkbox"
              checked={heightHelp}
              onChange={(event) => setHeightHelp(event.target.checked)}
            />
            Visa höjdhjälp
          </label>
        </div>
        {!allLabels && objects.size > 0 && (
          <p className={`label-note label-note-reservation${hiddenLabels ? '' : ' inactive'}`}>
            {/* Size the obstacle independently of the labels it displaces. */}
            <span aria-hidden="true" className="label-note-size">
              <span className="label-note-count">{objects.size + edges.length}</span> etiketter
              döljs för läsbarhet. Alla objekt och samband finns i listan. Sök eller välj ett objekt
              och visa dess kopplingar.
            </span>
            {hiddenLabels > 0 && (
              <span className="label-note-message">
                <span className="label-note-count">{hiddenLabels}</span> etiketter döljs för
                läsbarhet. Alla objekt och samband finns i listan. Sök eller välj ett objekt och
                visa dess kopplingar.
              </span>
            )}
          </p>
        )}
        {allLabels && closerLabels && (
          <p className="label-note">Närmare utsnitt. Panorera för att se fler etiketter.</p>
        )}
      </details>
    </section>
  );
}
