import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

export type WorkspacePanel = {
  id: string;
  title: string;
  content: ReactNode;
  open: boolean;
};
export type PanelFocusRequest = { id: string; element?: HTMLElement | null };

type TransitionFocus =
  | { kind: 'panel' | 'selector'; id: string }
  | { kind: 'empty'; focus: () => void };

type Position = { x: number; y: number };
type Drag = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  position: Position;
  moved: boolean;
};

const panelWidth = 380;
const panelGap = 18;

function startingPosition(index: number, width: number): Position {
  const columns = Math.max(1, Math.floor((width + panelGap) / (panelWidth + panelGap)));
  return {
    x: (index % columns) * (panelWidth + panelGap),
    y: Math.floor(index / columns) * 52,
  };
}

function clampPosition(position: Position, region: HTMLElement, panel?: HTMLElement): Position {
  return {
    x: Math.round(
      Math.max(0, Math.min(position.x, region.clientWidth - (panel?.offsetWidth ?? panelWidth))),
    ),
    y: Math.round(
      Math.max(0, Math.min(position.y, region.clientHeight - (panel?.offsetHeight ?? 0))),
    ),
  };
}

export function WorkspacePanels({
  windows,
  activeId,
  focusRequest,
  onActivate,
  onClose,
  hidden = false,
  onEmpty,
  focused = false,
}: {
  windows: WorkspacePanel[];
  activeId: string | null;
  focusRequest: PanelFocusRequest | null;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  hidden?: boolean;
  onEmpty: () => void;
  focused?: boolean;
}) {
  const prefix = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const selectorRef = useRef<HTMLSelectElement>(null);
  const panelRefs = useRef(new Map<string, HTMLElement>());
  const lastFocus = useRef(new Map<string, HTMLElement>());
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const dragRef = useRef<Drag | null>(null);
  const previousHidden = useRef(hidden);
  const appliedFocusRequest = useRef(focusRequest);
  const explicitFocusCommitted = useRef(false);
  const appliedTransition = useRef<TransitionFocus | null>(null);
  const rememberedPositions = useRef<Record<string, Position>>({});
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [stack, setStack] = useState<string[]>([]);
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [movementStatus, setMovementStatus] = useState('');
  const [transitionFocus, setTransitionFocus] = useState<TransitionFocus | null>(null);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const opened = windows.filter((entry) => entry.open);
  const visibleId = opened.some((entry) => entry.id === activeId) ? activeId : opened[0]?.id;

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!activeId) return;
    setStack((previous) =>
      previous.at(-1) === activeId
        ? previous
        : [...previous.filter((id) => id !== activeId), activeId],
    );
  }, [activeId]);

  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region || compact || hidden) return;
    const fitPanels = () => {
      if (!region.clientWidth || !region.clientHeight) return;
      setPositions((previous) => {
        let changed = false;
        const next = { ...previous };
        windows.forEach((entry, index) => {
          const panel = panelRefs.current.get(entry.id);
          const proposed =
            rememberedPositions.current[entry.id] || startingPosition(index, region.clientWidth);
          rememberedPositions.current[entry.id] = proposed;
          const position = clampPosition(proposed, region, panel);
          next[entry.id] = position;
          if (position.x !== previous[entry.id]?.x || position.y !== previous[entry.id]?.y) {
            changed = true;
          }
        });
        return changed ? next : previous;
      });
    };
    fitPanels();
    const observer = new ResizeObserver(() => fitPanels());
    observer.observe(region);
    for (const panel of panelRefs.current.values()) observer.observe(panel);
    return () => observer.disconnect();
  }, [windows, compact, hidden]);

  useLayoutEffect(() => {
    if (hidden || !focusRequest || appliedFocusRequest.current === focusRequest) return;
    appliedFocusRequest.current = focusRequest;
    const panel = panelRefs.current.get(focusRequest.id);
    if (focusRequest.id !== visibleId || !panel || panel.hidden) return;
    explicitFocusCommitted.current = true;
    const element = focusRequest.element;
    if (element?.isConnected && panel.contains(element) && element.offsetHeight) element.focus();
    else panel.querySelector('h2')?.focus();
  }, [focusRequest, hidden, visibleId]);

  useLayoutEffect(() => {
    if (!transitionFocus || appliedTransition.current === transitionFocus) return;
    appliedTransition.current = transitionFocus;
    if (transitionFocus.kind !== 'empty' && (hidden || transitionFocus.id !== visibleId)) return;
    explicitFocusCommitted.current = true;
    if (transitionFocus.kind === 'empty') transitionFocus.focus();
    else if (transitionFocus.kind === 'selector') selectorRef.current?.focus();
    else panelRefs.current.get(transitionFocus.id)?.querySelector('h2')?.focus();
  }, [transitionFocus, hidden, visibleId]);

  // Route return follows the application's heading effect. Explicit panel
  // transitions already focused during their commit and must not run again.
  useEffect(() => {
    const reopened = previousHidden.current && !hidden;
    const explicit = explicitFocusCommitted.current;
    previousHidden.current = hidden;
    explicitFocusCommitted.current = false;
    if (hidden || !reopened || explicit || !visibleId) return;
    const panel = panelRefs.current.get(visibleId);
    if (panel?.contains(document.activeElement)) return;
    const previousFocus = lastFocus.current.get(visibleId);
    if (previousFocus?.isConnected && previousFocus.offsetHeight) previousFocus.focus();
    else panel?.querySelector('h2')?.focus();
  });

  const activate = (id: string) => {
    onActivate(id);
    setStack((previous) =>
      previous.at(-1) === id ? previous : [...previous.filter((entry) => entry !== id), id],
    );
  };

  const move = (id: string, position: Position) => {
    const region = regionRef.current;
    if (!region || compact) return;
    const next = clampPosition(position, region, panelRefs.current.get(id));
    rememberedPositions.current[id] = next;
    setPositions((previous) => ({ ...previous, [id]: next }));
    return next;
  };

  const step = (id: string, x: number, y: number) => {
    const current = positions[id] ?? { x: 0, y: 0 };
    const next = move(id, { x: current.x + x, y: current.y + y });
    if (next) setMovementStatus(`Panelens position: ${next.x}, ${next.y}.`);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (compact || event.button !== 0) return;
    activate(id);
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      position: positions[id] ?? { x: 0, y: 0 },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  };

  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId || !draggingId) return;
    const x = event.clientX - current.startX;
    const y = event.clientY - current.startY;
    current.moved ||= Math.abs(x) + Math.abs(y) > 3;
    if (current.moved) {
      move(current.id, { x: current.position.x + x, y: current.position.y + y });
    }
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraggingId(null);
    if (event.type === 'pointercancel') dragRef.current = null;
  };

  const keyMove = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (event.key === 'Escape') {
      if (moveMenuId === id) {
        event.preventDefault();
        event.stopPropagation();
      }
      setMoveMenuId(null);
      return;
    }
    const distance = event.shiftKey ? 40 : 12;
    const directions: Record<string, Position> = {
      ArrowLeft: { x: -distance, y: 0 },
      ArrowRight: { x: distance, y: 0 },
      ArrowUp: { x: 0, y: -distance },
      ArrowDown: { x: 0, y: distance },
    };
    const direction = directions[event.key];
    if (direction) {
      event.preventDefault();
      step(id, direction.x, direction.y);
    }
  };

  const close = (id: string) => {
    const index = opened.findIndex((entry) => entry.id === id);
    const next = opened[index + 1] ?? opened[index - 1];
    setMoveMenuId(null);
    onClose(id);
    if (next) onActivate(next.id);
    setTransitionFocus(
      next
        ? { kind: compact ? 'selector' : 'panel', id: next.id }
        : { kind: 'empty', focus: onEmpty },
    );
  };

  return (
    <div className="workspace-windows" hidden={hidden || opened.length === 0} ref={regionRef}>
      <p className="visually-hidden" id={`${prefix}-move-help`}>
        Dra rubriken för att flytta panelen. Du kan också använda piltangenterna eller trycka för
        att visa flyttknappar. Skift och piltangent flyttar ett större steg.
      </p>
      {movementStatus && (
        <span className="visually-hidden" role="status">
          {movementStatus}
        </span>
      )}
      <label className="workspace-window-selector">
        Öppna paneler ({opened.length})
        <select
          ref={selectorRef}
          value={visibleId ?? ''}
          onChange={(event) => {
            const id = event.target.value;
            activate(id);
            setTransitionFocus({ kind: 'panel', id });
          }}
        >
          {opened.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title}
            </option>
          ))}
        </select>
      </label>
      {windows.map((entry, index) => {
        const titleId = `${prefix}-title-${entry.id}`;
        const menuId = `${prefix}-move-${entry.id}`;
        const position = positions[entry.id] ?? { x: index * 28, y: index * 28 };
        const style = {
          '--workspace-window-x': `${position.x}px`,
          '--workspace-window-y': `${position.y}px`,
          zIndex:
            entry.id === activeId ? windows.length + stack.length + 1 : stack.indexOf(entry.id) + 1,
        } as CSSProperties;
        return (
          <section
            className="workspace-panel workspace-window"
            key={entry.id}
            aria-label={entry.title}
            tabIndex={-1}
            hidden={!entry.open || ((compact || focused) && entry.id !== visibleId)}
            data-window-id={entry.id}
            data-active={entry.id === activeId}
            data-dragging={entry.id === draggingId}
            style={style}
            onPointerDownCapture={(event) => {
              if (event.currentTarget.contains(event.target as Node)) activate(entry.id);
            }}
            onFocusCapture={(event) => {
              if (!event.currentTarget.contains(event.target)) return;
              lastFocus.current.set(entry.id, event.target as HTMLElement);
              activate(entry.id);
            }}
            ref={(element) => {
              if (element) panelRefs.current.set(entry.id, element);
              else panelRefs.current.delete(entry.id);
            }}
          >
            <header className="workspace-window-header">
              <h2 id={titleId} tabIndex={-1} aria-label={entry.title}>
                {compact ? (
                  entry.title
                ) : (
                  <button
                    className="workspace-window-drag"
                    type="button"
                    aria-label={`Flytta ${entry.title}`}
                    aria-describedby={`${prefix}-move-help`}
                    aria-expanded={moveMenuId === entry.id}
                    aria-controls={menuId}
                    onPointerDown={(event) => startDrag(event, entry.id)}
                    onPointerMove={drag}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                    onKeyDown={(event) => keyMove(event, entry.id)}
                    onClick={() => {
                      if (dragRef.current?.moved) {
                        dragRef.current = null;
                        return;
                      }
                      setMoveMenuId((previous) => (previous === entry.id ? null : entry.id));
                    }}
                    ref={(element) => {
                      if (element) handleRefs.current.set(entry.id, element);
                      else handleRefs.current.delete(entry.id);
                    }}
                  >
                    <span className="workspace-window-grip" aria-hidden="true">
                      ⠿
                    </span>
                    <span>
                      <span className="workspace-window-title">{entry.title}</span>
                      <span className="workspace-window-move-label">Flytta</span>
                    </span>
                  </button>
                )}
              </h2>
              <button
                type="button"
                className="workspace-window-close"
                aria-label={`Stäng ${entry.title}`}
                onClick={() => close(entry.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>
            <fieldset
              className="workspace-window-move-controls"
              id={menuId}
              hidden={compact || moveMenuId !== entry.id}
              aria-label={`Flytta ${entry.title}`}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                setMoveMenuId(null);
                handleRefs.current.get(entry.id)?.focus();
              }}
            >
              <div className="workspace-window-directions">
                <button type="button" onClick={() => step(entry.id, -40, 0)}>
                  Vänster
                </button>
                <button type="button" onClick={() => step(entry.id, 0, -40)}>
                  Uppåt
                </button>
                <button type="button" onClick={() => step(entry.id, 0, 40)}>
                  Nedåt
                </button>
                <button type="button" onClick={() => step(entry.id, 40, 0)}>
                  Höger
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const region = regionRef.current;
                  if (region) move(entry.id, startingPosition(index, region.clientWidth));
                  setMovementStatus('Panelens position återställd.');
                }}
              >
                Återställ position
              </button>
            </fieldset>
            <div className="workspace-panel-body">{entry.content}</div>
          </section>
        );
      })}
    </div>
  );
}
