import './spatial.css';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { MapObject, MapRelationship, MapState } from '../shared/map.js';
import { defaultViewSettings, type Position, type ViewSettings } from '../shared/personal-view.js';
import { LifecycleStatus } from './Lifecycle.js';
import { ObjectRemovalNotice } from './ObjectRemovalNotice.js';
import { relationshipLabel } from './RelationshipEditor.js';
import { SpatialHeightGuide } from './SpatialHeightGuide.js';
import { SpatialObjectGlyph } from './SpatialObjectGlyph.js';
import { SpatialOrientation } from './SpatialOrientation.js';
import { type ProjectedPoint, spatialScene } from './spatial-scene.js';
import { useObjectMovement } from './use-object-movement.js';
import type { usePersonalView } from './use-personal-view.js';

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
      {kind === 'removed' ? '×' : kind === 'added' ? '+' : '~'}
    </span>
  );
}

function proposalKind(change?: { before: unknown; after: unknown }) {
  return change ? (!change.after ? 'removed' : !change.before ? 'added' : 'changed') : 'existing';
}
const cameraActions = [
  ['left', 'Panorera vänster'],
  ['right', 'Panorera höger'],
  ['up', 'Panorera uppåt'],
  ['down', 'Panorera nedåt'],
  ['rotate-left', 'Rotera vänster'],
  ['rotate-right', 'Rotera höger'],
  ['tilt-up', 'Luta uppåt'],
  ['tilt-down', 'Luta nedåt'],
  ['in', 'Zooma in'],
  ['out', 'Zooma ut'],
] as const;

function arrowTip(source: { x: number; y: number }, target: { x: number; y: number }, radius = 28) {
  const dx = source.x - target.x;
  const dy = source.y - target.y;
  const fraction = Math.min(radius / (Math.hypot(dx, dy) || 1), 0.45);
  return { x: target.x + dx * fraction, y: target.y + dy * fraction };
}

export function SpatialMap({
  state,
  active,
  objects,
  relationships,
  selection,
  disabled,
  onSelect,
  onEdit = onSelect,
  onSelectRelationship,
  onFocus,
  onClear,
  onReset,
  onRemove,
  personal,
  revealRequest,
}: {
  state: MapState;
  active: boolean;
  objects: Map<string, MapObject>;
  relationships: Map<string, MapRelationship>;
  selection: { kind: 'object' | 'relationship'; id: string; previous?: boolean } | null;
  disabled: boolean;
  onSelect: (object: MapObject) => void;
  onEdit?: (object: MapObject) => void;
  onSelectRelationship: (edge: MapRelationship, previous?: boolean) => void;
  onFocus: (id: string) => void;
  onClear: () => void;
  onReset: () => void;
  onRemove: (object: MapObject) => void;
  personal?: ReturnType<typeof usePersonalView>;
  revealRequest?: { id: string; objectIds: string[]; relationshipId?: string };
}) {
  const labelPrefix = useId();
  const [activated, setActivated] = useState(active);
  useEffect(() => {
    if (active) setActivated(true);
  }, [active]);
  const menu = useRef<HTMLDialogElement>(null);
  const [menuObject, setMenuObject] = useState<MapObject | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const held = useRef(false);
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
    if (menuObject) menu.current?.showModal();
  }, [menuObject]);
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
  const [unavailable, setUnavailable] = useState(false);
  const [contextLost, setContextLost] = useState(false);
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
    scene.current?.configure({ ...preferences, stars: preferences.stars && !reducedMotion });
    if (!active) return;
    if (preferences.allLabels && !previousLabels.current) {
      if (scene.current?.openLabelView()) setCloserLabels(true);
    }
    previousLabels.current = preferences.allLabels;
  }, [preferences, activated, active, reducedMotion]);
  useEffect(() => {
    if (
      revealRequest &&
      revealRequest.id !== completedRevealId &&
      active &&
      activated &&
      personalReady &&
      !contextLost &&
      revealRequest.objectIds.every((id) => objects.has(id)) &&
      (!revealRequest.relationshipId || relationships.has(revealRequest.relationshipId)) &&
      scene.current?.reveal(revealRequest.objectIds)
    )
      setCompletedRevealId(revealRequest.id);
  }, [
    revealRequest,
    completedRevealId,
    active,
    activated,
    personalReady,
    contextLost,
    objects,
    relationships,
  ]);
  useEffect(() => {
    if (!resetRequested) return;
    // Reframe after the shared view has revealed previously filtered objects.
    scene.current?.reset();
    setResetRequested(false);
  }, [resetRequested]);
  const locations = new Map(
    points.filter((point) => point.visible).map((point) => [point.id, point]),
  );
  const surfaceWidth = canvas.current?.clientWidth ?? 0;
  const surfaceHeight = canvas.current?.clientHeight ?? 0;
  const occupied = [...locations.values()].map((point) => ({
    x: point.x,
    y: point.y,
    width: 48,
    height: 48,
  }));
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
          : selection?.id === edge.sourceId || selection?.id === edge.targetId;
      const kind = previous
        ? 'removed'
        : proposalKind(state.draft.relationships?.find((change) => change.id === edge.id));
      const length = Math.hypot(tip.x - start.x, tip.y - start.y) || 1;
      occupied.push({
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
  type LabelBox = { x: number; y: number; width: number; height: number };
  function place(candidates: LabelBox[], selected = false) {
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
      const overlap = occupied.reduce((sum, other) => {
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
        occupied.push(candidate);
        return candidate;
      }
      if (overlap < leastOverlap) {
        leastOverlap = overlap;
        fallback = candidate;
      }
    }
    if (allLabels || selected) {
      let box = fallback ?? candidates[0];
      if (box && selected) {
        box = {
          ...box,
          x: Math.max(box.width / 2 + 8, Math.min(surfaceWidth - box.width / 2 - 8, box.x)),
          y: Math.max(box.height / 2 + 8, Math.min(surfaceHeight - box.height / 2 - 8, box.y)),
        };
      }
      if (box) occupied.push(box);
      return box ?? null;
    }
    return null;
  }
  const labels = new Map<string, LabelBox>();
  // Names belong beside their pictograms. Never scatter them into unused
  // corners of the viewport just to fit another rectangular control.
  const nodePoints = [...locations.values()].sort((a, b) => {
    const priority = (id: string) =>
      selection?.id === id ? 0 : state.draft.changes.some((change) => change.id === id) ? 1 : 2;
    return priority(a.id) - priority(b.id) || a.id.localeCompare(b.id);
  });
  for (const point of nodePoints) {
    const object = objects.get(point.id);
    if (!object) continue;
    const size = labelSizes.get(`object-${point.id}`) ?? {
      width: Math.min(230, Math.max(70, object.name.length * 7 + 12)),
      height: 38,
    };
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
    const box = place(
      offsets.map(([x, y]) => ({ ...size, x: point.x + x, y: point.y + y })),
      selection?.kind === 'object' && selection.id === point.id,
    );
    if (box) labels.set(point.id, box);
  }
  const labelEdges = edges.filter(({ selected }) => allLabels || selected);
  const labeledEdges = labelEdges.flatMap((edge) => {
    const type = state.relationshipTypes.find((type) => type.id === edge.edge.typeId);
    const size = labelSizes.get(`relationship-${edge.key}`) ?? {
      width: Math.min(230, (type?.forwardLabel ?? type?.name ?? '').length * 7 + 24),
      height: 30,
    };
    const positions = [0, 22, -22, 44, -44, 66, -66, 88, -88, 110, -110, 132, -132].flatMap(
      (offset) =>
        [0.5, 0.3, 0.7].map((fraction) => ({
          ...size,
          x: edge.source.x + (edge.end.x - edge.source.x) * fraction,
          y: edge.source.y + (edge.end.y - edge.source.y) * fraction + offset,
        })),
    );
    const label = place(
      positions,
      selection?.kind === 'relationship' && selection.id === edge.edge.id,
    );
    return label ? [{ ...edge, ...label }] : [];
  });
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
  if (selection?.kind === 'object') {
    adjacent.add(selection.id);
    for (const { edge, selected } of edges)
      if (selected) {
        adjacent.add(edge.sourceId);
        if (edge.targetId) adjacent.add(edge.targetId);
      }
  }
  return (
    <section
      className={`spatial-map${!allLabels && hiddenLabels > 0 ? ' crowded' : ''}`}
      aria-label="Rymdkarta"
    >
      <h2>Rymdkarta</h2>
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
              Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) > 5
            )
              pointer.current.moved = true;
          }}
          onPointerUp={(event) => {
            if (
              pointer.current &&
              pointer.current.id === event.pointerId &&
              !pointer.current.moved &&
              !pointer.current.multiple &&
              Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) < 5
            )
              onClear();
            pointer.current = null;
          }}
          onPointerCancel={() => {
            pointer.current = null;
          }}
        />
        <svg className="spatial-lines" aria-hidden="true">
          <defs>
            <marker
              id="spatial-arrow"
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
            </marker>
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
                    markerEnd="url(#spatial-arrow)"
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
                    markerEnd="url(#spatial-arrow)"
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
              style={{ left: x, top: y }}
              onClick={() => onSelectRelationship(edge, previous)}
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
            </button>
          ))}
          {[...labels].map(([id, label]) => {
            const object = objects.get(id);
            if (!object) return null;
            const kind = proposalKind(state.draft.changes.find((change) => change.id === id));
            return (
              <span
                key={id}
                id={`${labelPrefix}-${id}`}
                data-layout-id={`object-${id}`}
                data-object-label={id}
                ref={observeLabel}
                className={`spatial-name ${kind}${adjacent.size && !adjacent.has(id) ? ' subdued' : ''}`}
                style={{ left: label.x, top: label.y }}
              >
                <span className="spatial-caption">{object.name}</span>
                <span className="spatial-type-name">
                  {kind === 'added'
                    ? '+ Nytt förslag'
                    : kind === 'changed'
                      ? '~ Ändrat förslag'
                      : kind === 'removed'
                        ? '× Föreslås tas bort'
                        : state.types.find((type) => type.id === object.typeId)?.name}
                </span>
                <LifecycleStatus value={object} />
              </span>
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
                  aria-pressed={selection?.kind === 'object' && selection.id === object.id}
                  className={`spatial-node ${kind}${adjacent.size && !adjacent.has(object.id) ? ' subdued' : ''}`}
                  style={{ left: point.x, top: point.y }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (event.ctrlKey) {
                      cancelHold();
                      movement.cancel();
                      onFocus(object.id);
                    } else openMenu(object, event.currentTarget);
                  }}
                  onPointerDown={(event) => {
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
                  }}
                  onPointerMove={(event) => {
                    if (
                      hold.current &&
                      Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 8
                    )
                      cancelHold();
                  }}
                  onPointerUp={cancelHold}
                  onPointerCancel={cancelHold}
                  onPointerLeave={cancelHold}
                  onClick={(event) => {
                    if (held.current) {
                      held.current = false;
                      return;
                    }
                    if (event.ctrlKey) onFocus(object.id);
                    else onSelect(object);
                  }}
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
      <div className="spatial-tools">
        <details className="camera-tools">
          <summary>Navigera rymden</summary>
          <p>
            Dra tom rymd för att rotera. Två fingrar panorerar och nypzoomar. Använd också
            knapparna.
          </p>
          <div className="access-actions">
            {cameraActions.map(([command, label]) => (
              <button key={command} type="button" onClick={() => scene.current?.navigate(command)}>
                {label}
              </button>
            ))}
          </div>
        </details>
        <details className="camera-tools personal-tools">
          <summary>Ordna min vy</summary>
          <p>
            Placeringarna är bara dina. Dra objektet för att flytta. Shift eller ett andra stilla
            finger ger höjdled. Avbruten gest återställer placeringen.
          </p>
          <fieldset disabled={!personal?.view || personal.pending}>
            <legend>Flytta valt objekt</legend>
            {(
              [
                ['x', -1, 'vänster i rummet'],
                ['x', 1, 'höger i rummet'],
                ['y', 1, 'uppåt i rummet'],
                ['y', -1, 'nedåt i rummet'],
                ['z', -1, 'inåt i rummet'],
                ['z', 1, 'utåt i rummet'],
              ] as const
            ).map(([axis, step, label]) => (
              <button
                key={label}
                type="button"
                disabled={selection?.kind !== 'object'}
                onClick={() => {
                  if (selection?.kind !== 'object') return;
                  const position = scene.current?.position(selection.id);
                  if (position) {
                    const next = { ...position, [axis]: position[axis] + step };
                    const end = scene.current?.place(selection.id, next) ?? next;
                    movement.recordMove(selection.id, position, end, axis === 'y');
                    if (axis === 'y') setHeightHelp(true);
                    void personal?.move(selection.id, end);
                  }
                }}
              >
                Flytta {label}
              </button>
            ))}
          </fieldset>
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
            <button
              type="button"
              disabled={personal.pending}
              onClick={() => void personal.refresh()}
            >
              Läs in min aktuella vy
            </button>
          )}
        </details>
      </div>
      {personal?.message && (
        <p aria-live="polite" className="personal-view-status">
          {personal.message}
        </p>
      )}
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
        <label>
          <input
            type="checkbox"
            checked={preferences.stars && !reducedMotion}
            disabled={reducedMotion || Boolean(personal && (!personal.view || personal.pending))}
            onChange={(event) => configure({ stars: event.target.checked })}
          />
          Visa stjärnhimmel
        </label>
        {reducedMotion && <span>Minskad rörelse: stjärnhimlen är avstängd.</span>}
      </div>
      {!allLabels && hiddenLabels > 0 && (
        <p className="label-note">
          {hiddenLabels} etiketter döljs för läsbarhet. Alla objekt och samband finns i listan. Sök
          eller välj ett objekt och visa dess kopplingar.
        </p>
      )}
      {allLabels && closerLabels && (
        <p className="label-note">Närmare utsnitt. Panorera för att se fler etiketter.</p>
      )}
    </section>
  );
}
