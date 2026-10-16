import {
  type HTMLAttributes,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { availableViewport } from './available-viewport.js';
import { clampWindow, type WindowPosition } from './floating-windows.js';

/** Independent viewport placement. Pointer capture keeps window drags off the map. */
export function useMovableWindow(
  panel: RefObject<HTMLElement | null>,
  active: boolean,
  offset: number,
) {
  const [position, setPosition] = useState<WindowPosition>();
  const preferred = useRef<WindowPosition | null>(null);
  const [status, setStatus] = useState('');
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    pointer: number;
    target: HTMLElement;
    start: WindowPosition;
    origin: WindowPosition;
  } | null>(null);
  function clamp(value: WindowPosition) {
    const viewport = availableViewport();
    return clampWindow(
      value,
      {
        width: panel.current?.offsetWidth ?? 0,
        height: panel.current?.offsetHeight ?? 0,
      },
      {
        x: viewport.x + 8,
        y: viewport.y + 8,
        width: viewport.width - 16,
        height: viewport.height - 16,
      },
    );
  }
  useLayoutEffect(() => {
    const element = panel.current;
    if (!active || !element) return;
    function fitToViewport() {
      if (!element?.offsetWidth || !element.offsetHeight) return;
      const viewport = availableViewport();
      const { width, height } = viewport;
      const text = element?.closest('.household-map')?.querySelector('.text-view');
      const textBounds = text?.getBoundingClientRect();
      const right = textBounds?.width
        ? Math.min(viewport.x + width, textBounds.left)
        : viewport.x + width;
      const search = element.closest('.household-map')?.querySelector('.map-object-search');
      const initialTop =
        width <= 700 && height <= 450
          ? Math.max(viewport.y + 8, (search?.getBoundingClientRect().bottom ?? 0) + 8)
          : viewport.y + (height < 600 ? 8 : 100);
      const initial = {
        x: right - element.offsetWidth - 24 - (offset % 5) * 24,
        y: initialTop + (offset % 5) * 24,
      };
      const next = clampWindow(
        preferred.current ?? initial,
        {
          width: element.offsetWidth,
          height: element.offsetHeight,
        },
        {
          x: viewport.x + 8,
          y: viewport.y + 8,
          width: width - 16,
          height: height - 16,
        },
      );
      setPosition((old) => (old?.x === next.x && old.y === next.y ? old : next));
    }
    fitToViewport();
    const resize = new ResizeObserver(fitToViewport);
    resize.observe(element);
    window.addEventListener('resize', fitToViewport);
    window.visualViewport?.addEventListener('resize', fitToViewport);
    window.visualViewport?.addEventListener('scroll', fitToViewport);
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', fitToViewport);
      window.visualViewport?.removeEventListener('resize', fitToViewport);
      window.visualViewport?.removeEventListener('scroll', fitToViewport);
    };
  }, [panel, active, offset]);
  function move(value: WindowPosition) {
    const next = clamp(value);
    preferred.current = next;
    setPosition(next);
    setStatus(`Fönstret: ${next.x} från vänster, ${next.y} uppifrån.`);
  }
  function cancel() {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    preferred.current = current.origin;
    setPosition(current.origin);
    setDragging(false);
    setStatus('Flyttningen av fönstret avbröts.');
    if (current.target.hasPointerCapture(current.pointer))
      current.target.releasePointerCapture(current.pointer);
  }
  useEffect(() => {
    const cancelOnBlur = () => {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      preferred.current = current.origin;
      setPosition(current.origin);
      setDragging(false);
      if (current.target.hasPointerCapture(current.pointer))
        current.target.releasePointerCapture(current.pointer);
    };
    window.addEventListener('blur', cancelOnBlur);
    return () => window.removeEventListener('blur', cancelOnBlur);
  }, []);
  const handle: HTMLAttributes<HTMLElement> = {
    onPointerDown: (event) => {
      event.stopPropagation();
      if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button'))
        return;
      const box = panel.current?.getBoundingClientRect();
      if (!box) return;
      event.preventDefault();
      drag.current = {
        pointer: event.pointerId,
        target: event.currentTarget,
        start: { x: event.clientX, y: event.clientY },
        origin: { x: box.x, y: box.y },
      };
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    },
    onPointerMove: (event) => {
      const current = drag.current;
      if (current?.pointer !== event.pointerId) return;
      event.stopPropagation();
      move({
        x: current.origin.x + event.clientX - current.start.x,
        y: current.origin.y + event.clientY - current.start.y,
      });
    },
    onPointerUp: (event) => {
      if (drag.current?.pointer !== event.pointerId) return;
      event.stopPropagation();
      drag.current = null;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey)
        return;
      if (event.key === 'Escape' && drag.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      const step = event.shiftKey ? 40 : 12;
      const directions: Record<string, WindowPosition> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step },
      };
      const direction = directions[event.key];
      const box = panel.current?.getBoundingClientRect();
      if (!direction || !box) return;
      event.preventDefault();
      event.stopPropagation();
      move({ x: box.x + direction.x, y: box.y + direction.y });
    },
  };
  return { position, handle, dragging, status };
}
