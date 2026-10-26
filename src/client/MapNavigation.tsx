import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Position } from '../shared/personal-view.js';
import {
  clampWindow,
  type FloatingArea,
  fitWindow,
  measureFloatingArea,
  moveWindow,
} from './floating-windows.js';
import { WorkspaceIcon } from './WorkspaceTools.js';
import './map-navigation.css';

function navigationArea(element: HTMLElement): FloatingArea {
  const area = measureFloatingArea(element);
  const style = getComputedStyle(element);
  // Narrow layouts keep movement inside the usable region beside/below the toolbar.
  const left = Number.parseFloat(style.getPropertyValue('--navigation-left-limit')) || 0;
  const toolbar = Number.parseFloat(style.getPropertyValue('--navigation-toolbar-bottom')) || 0;
  const insetX = Math.max(0, left - area.viewport.x);
  const insetY = toolbar ? Math.max(0, toolbar + 12) : 0;
  return {
    ...area,
    viewport: {
      ...area.viewport,
      x: area.viewport.x + insetX,
      y: area.viewport.y + insetY,
      width: area.viewport.width - insetX,
      height: area.viewport.height - insetY,
    },
  };
}

const cameraButtons = [
  ['left', 'Panorera vänster', 'panLeft'],
  ['right', 'Panorera höger', 'panRight'],
  ['up', 'Panorera uppåt', 'panUp'],
  ['down', 'Panorera nedåt', 'panDown'],
  ['rotate-left', 'Rotera vänster', 'rotateLeft'],
  ['rotate-right', 'Rotera höger', 'rotateRight'],
  ['tilt-up', 'Luta uppåt', 'tiltUp'],
  ['tilt-down', 'Luta nedåt', 'tiltDown'],
  ['in', 'Zooma in', 'zoomIn'],
  ['out', 'Zooma ut', 'zoomOut'],
] as const;
const directions = [
  ['Vänster', 'panLeft', 'x', -1],
  ['Höger', 'panRight', 'x', 1],
  ['Uppåt', 'panUp', 'y', 1],
  ['Nedåt', 'panDown', 'y', -1],
  ['Framåt', 'depthForward', 'z', 1],
  ['Bakåt', 'depthBackward', 'z', -1],
] as const;
type WindowPosition = { x: number; y: number };
type Drag = {
  pointer: number;
  start: WindowPosition;
  origin: WindowPosition;
  preferred: WindowPosition | null;
  moved: boolean;
};

const coordinateAxes = [
  ['x', 'Sidled (X)'],
  ['y', 'Höjd (Y)'],
  ['z', 'Djup (Z)'],
] as const;

function coordinate(text: string): number | null {
  const match = /^([+-]?)(?:(\d+)(?:[.,](\d+))?|[.,](\d+))$/.exec(text.trim());
  if (!match) return null;
  const integer = (match[2] ?? '0').replace(/^0+/, '') || '0';
  const fraction = match[3] ?? match[4] ?? '';
  if (
    integer.length > 5 ||
    (integer.length === 5 && integer > '10000') ||
    (integer === '10000' && /[1-9]/.test(fraction))
  )
    return null;
  // Decimal digits determine ties before binary floating-point conversion.
  const hundredths =
    Number(integer) * 100 +
    Number(`${fraction}00`.slice(0, 2)) +
    Number((fraction[2] ?? '0') >= '5');
  const value = (match[1] === '-' ? -hundredths : hundredths) / 100;
  return value === 0 ? 0 : value;
}

export function formatCoordinate(value: number) {
  const formatted = value.toFixed(2);
  return formatted === '-0.00' ? '0.00' : formatted;
}

function CoordinateFields({
  position,
  disabled,
  onEdit,
}: {
  position: Position;
  disabled: boolean;
  onEdit: (axis: keyof Position, value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{
    axis: keyof Position;
    text: string;
    applied: number | null;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ axis: keyof Position; text: string } | null>(null);
  const observedPosition = useRef({ ...position });
  useEffect(() => {
    const previous = observedPosition.current;
    observedPosition.current = { ...position };
    if (
      draft &&
      draft.applied !== null &&
      previous[draft.axis] !== position[draft.axis] &&
      draft.applied !== position[draft.axis]
    )
      setDraft(null);
  }, [position, draft]);
  return (
    <>
      <div className="navigation-coordinate-fields">
        {coordinateAxes.map(([axis, label]) => (
          <label key={axis}>
            <span aria-hidden="true">{axis.toUpperCase()}</span>
            <input
              type="text"
              spellCheck={false}
              aria-label={label}
              disabled={disabled}
              aria-invalid={draft?.axis === axis && draft.applied === null ? true : undefined}
              aria-describedby={feedback?.axis === axis ? `${id}-feedback` : undefined}
              value={draft?.axis === axis ? draft.text : formatCoordinate(position[axis])}
              onChange={(event) => {
                const text = event.target.value;
                const value = coordinate(text);
                setDraft({ axis, text, applied: value });
                setFeedback((current) => (current?.axis === axis ? null : current));
                if (value !== null && value !== position[axis]) onEdit(axis, value);
              }}
              onBlur={() => {
                if (draft?.axis === axis && draft.applied === null)
                  setFeedback({
                    axis,
                    text: `${label}: Ange ett tal från −10000 till +10000 med decimalpunkt eller decimalkomma. Värdet ${formatCoordinate(position[axis])} återställs.`,
                  });
                setDraft(null);
              }}
            />
          </label>
        ))}
      </div>
      <p id={`${id}-feedback`} role="status" aria-atomic="true" hidden={!feedback}>
        {feedback?.text}
      </p>
    </>
  );
}

export function MapNavigation({
  open,
  area,
  focusOnOpen = true,
  onClose,
  onNavigate,
  object,
  objectPosition,
  onMove,
  onEditPosition,
  disabled,
  movementDisabled,
  children,
}: {
  open: boolean;
  area?: FloatingArea;
  focusOnOpen?: boolean;
  onClose: () => void;
  onNavigate: (action: (typeof cameraButtons)[number][0]) => void;
  object?: { id: string; name: string };
  objectPosition?: Position | null;
  onMove: (id: string, axis: keyof Position, step: number) => void | Promise<void>;
  onEditPosition: (id: string, axis: keyof Position, value: number) => void;
  disabled: boolean;
  movementDisabled: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const handle = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const [mini, setMini] = useState(false);
  const [coordinateHelp, setCoordinateHelp] = useState(false);
  const [position, setPosition] = useState<WindowPosition | null>(null);
  const preferredPosition = useRef<WindowPosition | null>(null);
  const [size, setSize] = useState({
    width: 350,
    height: 124,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('');
  const moveFocus = useRef<AbortController | null>(null);
  const completedMove = useRef<(() => void) | null>(null);
  const [moveCompleted, setMoveCompleted] = useState(0);

  useEffect(() => {
    if (!open) {
      moveFocus.current?.abort();
      completedMove.current = null;
    }
    return () => moveFocus.current?.abort();
  }, [open]);
  useLayoutEffect(() => {
    if (!movementDisabled && moveCompleted > 0) {
      completedMove.current?.();
      completedMove.current = null;
    }
  }, [movementDisabled, moveCompleted]);

  function moveObject(
    opener: HTMLButtonElement,
    objectId: string,
    axis: keyof Position,
    step: number,
  ) {
    moveFocus.current?.abort();
    completedMove.current = null;
    const controller = new AbortController();
    moveFocus.current = controller;
    let leftControl = false;
    const leave = (event: Event) => {
      if (event.target !== document.body && !opener.contains(event.target as Node))
        leftControl = true;
    };
    document.addEventListener('focusin', leave, { signal: controller.signal });
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!opener.contains(event.target as Node)) leftControl = true;
      },
      { signal: controller.signal },
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Tab' || event.key === 'Escape') leftControl = true;
      },
      { signal: controller.signal },
    );
    const result = onMove(objectId, axis, step);
    if (!result) {
      controller.abort();
      return;
    }
    const complete = () => {
      if (controller.signal.aborted) return;
      // Restore after the owning hook has rendered the control enabled again.
      completedMove.current = () => {
        if (
          !controller.signal.aborted &&
          !leftControl &&
          opener.isConnected &&
          opener.dataset.movementObject === objectId &&
          !opener.disabled &&
          !opener.closest('[hidden], [inert]') &&
          opener.getClientRects().length &&
          (document.activeElement === document.body || document.activeElement === opener)
        )
          opener.focus();
        controller.abort();
      };
      setMoveCompleted((previous) => previous + 1);
    };
    void result.then(complete, complete);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: Reveal requests focus Navigation; a resize or focus within an already open window must not move focus.
  useLayoutEffect(() => {
    if (!open || !focusOnOpen) return;
    handle.current?.focus({ preventScroll: true });
  }, [open]);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const measure = () =>
      setSize((previous) => {
        const next = {
          width: element.offsetWidth,
          height: element.offsetHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
        return previous.width === next.width &&
          previous.height === next.height &&
          previous.viewportWidth === next.viewportWidth &&
          previous.viewportHeight === next.viewportHeight
          ? previous
          : next;
      });
    const fitPanel = () => {
      measure();
      if (
        !area ||
        !element.offsetWidth ||
        !element.offsetHeight ||
        getComputedStyle(element).position !== 'fixed'
      )
        return;
      const box = element.getBoundingClientRect();
      const proposed = preferredPosition.current ?? { x: box.x, y: box.y };
      const dimensions = { width: element.offsetWidth, height: element.offsetHeight };
      // Layout effects run before observer notifications. Read this commit's
      // surfaces so switching views cannot relocate against a hidden text view.
      const currentArea = navigationArea(element);
      const next = fitWindow(proposed, dimensions, currentArea);
      const viewportOnly = clampWindow(proposed, dimensions, currentArea.viewport);
      if (next.x !== viewportOnly.x || next.y !== viewportOnly.y) preferredPosition.current = next;
      if (preferredPosition.current || next.x !== box.x || next.y !== box.y) {
        setPosition((previous) =>
          previous?.x === next.x && previous.y === next.y ? previous : next,
        );
      }
    };
    fitPanel();
    const resize = () => {
      // The parent first decides whether a resized screen switches views.
      // Refitting belongs to the committed layout/observer, not this event's
      // previous visibility state.
      measure();
    };
    const observer = new ResizeObserver(fitPanel);
    observer.observe(element);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [open, area]);
  const cancelDrag = useCallback(() => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    setPosition(current.preferred);
    preferredPosition.current = current.preferred;
    setDragging(false);
    setStatus('Flyttningen av navigeringsfönstret avbröts.');
    if (handle.current?.hasPointerCapture(current.pointer))
      handle.current.releasePointerCapture(current.pointer);
  }, []);
  useEffect(() => {
    window.addEventListener('blur', cancelDrag);
    return () => window.removeEventListener('blur', cancelDrag);
  }, [cancelDrag]);
  function clamp(value: WindowPosition) {
    if (area && panel.current && getComputedStyle(panel.current).position === 'fixed') {
      return clampWindow(value, size, navigationArea(panel.current).viewport);
    }
    return {
      x: Math.round(Math.max(12, Math.min(value.x, size.viewportWidth - size.width - 12))),
      y: Math.round(Math.max(12, Math.min(value.y, size.viewportHeight - 124))),
    };
  }
  function move(value: WindowPosition) {
    const box = panel.current?.getBoundingClientRect();
    const next =
      area && box && getComputedStyle(panel.current as HTMLElement).position === 'fixed'
        ? moveWindow(
            { x: box.x, y: box.y },
            value,
            size,
            navigationArea(panel.current as HTMLElement),
          )
        : clamp(value);
    preferredPosition.current = next;
    setPosition(next);
    setStatus(`Navigeringsfönstret: ${next.x} från vänster, ${next.y} uppifrån.`);
  }
  function step(offset: WindowPosition) {
    const box = panel.current?.getBoundingClientRect();
    if (box) move({ x: box.x + offset.x, y: box.y + offset.y });
  }
  function start(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || !event.isPrimary || (event.target as Element).closest('button'))
      return;
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    drag.current = {
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: box.x, y: box.y },
      preferred: position,
      moved: false,
    };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }
  function dragMove(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    const x = event.clientX - current.start.x;
    const y = event.clientY - current.start.y;
    current.moved ||= Math.hypot(x, y) > 3;
    if (current.moved) {
      move({ x: current.origin.x + x, y: current.origin.y + y });
    }
  }
  function finish(event: PointerEvent<HTMLElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyMove(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const distance = event.shiftKey ? 40 : 12;
    const offset: Record<string, WindowPosition> = {
      ArrowLeft: { x: -distance, y: 0 },
      ArrowRight: { x: distance, y: 0 },
      ArrowUp: { x: 0, y: -distance },
      ArrowDown: { x: 0, y: distance },
    };
    const direction = offset[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();
    step(direction);
  }
  const displayed = position && clamp(position);
  return (
    <section
      ref={panel}
      className="map-navigation"
      hidden={!open}
      data-mini={mini}
      data-dragging={dragging}
      aria-labelledby={`${id}-title`}
      style={
        displayed
          ? ({
              left: displayed.x,
              top: displayed.y,
              right: 'auto',
              '--navigation-top': `${displayed.y}px`,
            } as CSSProperties)
          : undefined
      }
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        if (drag.current) cancelDrag();
        else onClose();
      }}
    >
      {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole lint/a11y/useSemanticElements: A focusable window title group provides keyboard movement without being a form or button. */}
      <header
        ref={handle}
        className="map-navigation-header"
        role="group"
        tabIndex={0}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-help`}
        onPointerDown={start}
        onPointerMove={dragMove}
        onPointerUp={finish}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onKeyDown={keyMove}
      >
        <button
          type="button"
          aria-label={mini ? 'Visa normal navigering' : 'Visa mininavigering'}
          title={mini ? 'Visa normal navigering' : 'Visa mininavigering'}
          onClick={() => {
            setMini(!mini);
          }}
        >
          <WorkspaceIcon name={mini ? 'maximize' : 'minimize'} />
        </button>
        <h2 id={`${id}-title`}>Navigation</h2>
        <button
          type="button"
          aria-label="Stäng navigering"
          title="Stäng navigering"
          onClick={onClose}
        >
          <WorkspaceIcon name="close" />
        </button>
      </header>
      <div className="map-navigation-body">
        <p className="map-navigation-description">
          Flytta vyn med knapparna. Ett objektval flyttar inte kameran.
        </p>
        <div className="map-navigation-grid map-navigation-camera">
          {cameraButtons.map(([action, label, icon]) => (
            <button
              key={action}
              type="button"
              aria-label={label}
              title={label}
              disabled={disabled}
              onClick={() => onNavigate(action)}
            >
              <WorkspaceIcon name={icon} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        {object && (
          <section className="map-navigation-placement" aria-labelledby={`${id}-object`}>
            <h3 id={`${id}-object`}>Flytta {object.name}</h3>
            <p className="map-navigation-description">
              Flytta bara det markerade objektet i din personliga vy. Hushållets uppgifter ändras
              inte.
            </p>
            {objectPosition && (
              <fieldset className="navigation-coordinates">
                <legend className="visually-hidden">Position för {object.name}</legend>
                <div className="navigation-coordinate-heading" hidden={mini}>
                  <span>Ange position</span>
                  <button
                    type="button"
                    aria-label="Om koordinater"
                    aria-expanded={coordinateHelp}
                    aria-controls={`${id}-coordinates-help`}
                    onClick={() => setCoordinateHelp(!coordinateHelp)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Escape' || !coordinateHelp) return;
                      event.preventDefault();
                      event.stopPropagation();
                      setCoordinateHelp(false);
                    }}
                  >
                    <WorkspaceIcon name="info" />
                  </button>
                </div>
                <div
                  id={`${id}-coordinates-help`}
                  className="navigation-coordinate-help"
                  hidden={mini || !coordinateHelp}
                >
                  <p>
                    X är sidled, Y är höjd och Z är djup i kartans fasta axlar. Värdena är inte
                    verkliga mått.
                  </p>
                  <p>
                    Värden mellan −10 000 och +10 000, inklusive gränserna. Nya värden avrundas till
                    två decimaler.
                  </p>
                </div>
                <CoordinateFields
                  key={object.id}
                  position={objectPosition}
                  disabled={movementDisabled}
                  onEdit={(axis, value) => onEditPosition(object.id, axis, value)}
                />
              </fieldset>
            )}
            <div className="map-navigation-grid">
              {directions.map(([label, icon, axis, step]) => (
                <button
                  key={axis + step}
                  type="button"
                  disabled={movementDisabled}
                  data-movement-object={object.id}
                  aria-label={`Flytta ${object.name}: ${label.toLocaleLowerCase('sv')}`}
                  title={`Flytta ${object.name}: ${label.toLocaleLowerCase('sv')}`}
                  onClick={(event) => moveObject(event.currentTarget, object.id, axis, step)}
                >
                  <WorkspaceIcon name={icon} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {children}
        <details className="navigation-settings">
          <summary>Fönstrets placering</summary>
          <div className="map-navigation-grid">
            {(
              [
                ['åt vänster', -12, 0],
                ['åt höger', 12, 0],
                ['uppåt', 0, -12],
                ['nedåt', 0, 12],
              ] as const
            ).map(([label, x, y]) => (
              <button key={label} type="button" onClick={() => step({ x, y })}>
                Flytta fönstret {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setPosition(null);
              preferredPosition.current = null;
              setStatus('Navigeringsfönstrets placering återställdes.');
            }}
          >
            Återställ fönstrets placering
          </button>
        </details>
        <p className="visually-hidden" id={`${id}-help`}>
          Dra titelraden för att flytta navigeringsfönstret. Piltangenter på titelraden flyttar ett
          litet steg; Skift och piltangent flyttar ett större steg. Escape avbryter en pågående
          dragning.
        </p>
        {status && (
          <p className="visually-hidden" role="status">
            {status}
          </p>
        )}
      </div>
    </section>
  );
}
