import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Position } from '../shared/personal-view.js';
import type { spatialScene } from './spatial-scene.js';

type Gesture = {
  id: string;
  primary: number;
  origin: Position;
  segment: Position;
  x: number;
  y: number;
  currentX: number;
  currentY: number;
  height: boolean;
  moved: boolean;
  second?: { id: number; x: number; y: number };
};
type MovementResult = { id: string; position: Position; axes: (keyof Position)[] };

export function useObjectMovement(
  scene: RefObject<ReturnType<typeof spatialScene> | null>,
  {
    enabled,
    active,
    onMove,
    cancelHold,
  }: {
    enabled: boolean;
    active: boolean;
    onMove: (id: string, position: Position) => unknown;
    cancelHold: () => void;
  },
) {
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const waiting = useRef(false);
  const suppressed = useRef(false);
  const [guide, setGuide] = useState<{
    id: string;
    start: Position;
    end: Position;
    source: 'drag' | 'buttons';
  } | null>(null);
  const [heightActive, setHeightActive] = useState(false);
  const [announcement, setAnnouncement] = useState<MovementResult | null>(null);
  const latestAnnouncement = useRef<MovementResult | null>(null);
  const announcementTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearAnnouncement = useCallback(() => {
    clearTimeout(announcementTimer.current);
    latestAnnouncement.current = null;
    setAnnouncement(null);
  }, []);
  const clearStaleAnnouncement = useCallback(() => {
    const result = latestAnnouncement.current;
    if (!result) return;
    const position = scene.current?.position(result.id);
    if (
      !position ||
      (['x', 'y', 'z'] as const).some((axis) => position[axis] !== result.position[axis])
    )
      clearAnnouncement();
  }, [scene, clearAnnouncement]);
  useEffect(() => () => clearTimeout(announcementTimer.current), []);
  function announce(id: string, start: Position, end: Position) {
    const axes = (['x', 'y', 'z'] as const).filter((axis) => start[axis] !== end[axis]);
    if (!axes.length) return;
    clearAnnouncement();
    const result = { id, position: end, axes };
    latestAnnouncement.current = result;
    announcementTimer.current = setTimeout(() => {
      setAnnouncement(result);
    }, 500);
  }
  const movingObjectId = useCallback(
    () => (gesture.current?.moved ? gesture.current.id : undefined),
    [],
  );
  const cancel = useCallback(() => {
    const current = gesture.current;
    if (current) {
      scene.current?.place(current.id, current.origin);
      suppressed.current = true;
      setGuide(null);
      if (current.moved) clearAnnouncement();
    }
    gesture.current = null;
    touches.current.clear();
    waiting.current = false;
    setHeightActive(false);
    cancelHold();
  }, [scene, cancelHold, clearAnnouncement]);
  useEffect(() => {
    const interrupt = () => {
      cancel();
      clearAnnouncement();
    };
    if (!active || !enabled) interrupt();
    window.addEventListener('blur', interrupt);
    const visibility = () => {
      if (document.hidden) interrupt();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('blur', interrupt);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, enabled, cancel, clearAnnouncement]);
  function rebase(current: Gesture, height: boolean) {
    current.segment = scene.current?.position(current.id) ?? current.segment;
    current.x = current.currentX;
    current.y = current.currentY;
    current.height = height;
  }
  return {
    guide,
    heightActive,
    announcement,
    clearStaleAnnouncement,
    movingObjectId,
    cancel,
    recordMove(id: string, start: Position, end: Position, height: boolean) {
      announce(id, start, end);
      setGuide((previous) =>
        height
          ? {
              id,
              start: previous?.id === id && previous.source === 'buttons' ? previous.start : start,
              end,
              source: 'buttons',
            }
          : null,
      );
    },
    suppressClick() {
      const value = suppressed.current;
      suppressed.current = false;
      return value;
    },
    start(id: string, event: ReactPointerEvent) {
      if (
        !enabled ||
        !active ||
        event.button !== 0 ||
        !event.isPrimary ||
        gesture.current ||
        waiting.current
      )
        return;
      const origin = scene.current?.position(id);
      if (!origin) return;
      suppressed.current = false;
      gesture.current = {
        id,
        primary: event.pointerId,
        origin,
        segment: origin,
        x: event.clientX,
        y: event.clientY,
        currentX: event.clientX,
        currentY: event.clientY,
        height: event.shiftKey,
        moved: false,
      };
    },
    down(event: ReactPointerEvent) {
      if (event.pointerType === 'touch')
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const current = gesture.current;
      if (!current || event.pointerId === current.primary) return;
      cancelHold();
      event.stopPropagation();
      if (current.second) return;
      if (event.pointerType !== 'touch') {
        cancel();
        return;
      }
      current.second = { id: event.pointerId, x: event.clientX, y: event.clientY };
      rebase(current, true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.setPointerCapture(current.primary);
    },
    move(event: ReactPointerEvent) {
      if (touches.current.has(event.pointerId))
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const current = gesture.current;
      if (!current) return;
      if (!event.buttons) {
        cancel();
        return;
      }
      if (event.pointerId === current.second?.id) {
        if (Math.hypot(event.clientX - current.second.x, event.clientY - current.second.y) > 10) {
          scene.current?.place(current.id, current.origin);
          gesture.current = null;
          waiting.current = true;
          suppressed.current = true;
          setGuide(null);
          setHeightActive(false);
          clearAnnouncement();
          scene.current?.beginCameraGesture(touches.current);
        }
        return;
      }
      if (event.pointerId !== current.primary) return;
      if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 8)
        return;
      current.moved = true;
      suppressed.current = true;
      cancelHold();
      event.currentTarget.setPointerCapture(event.pointerId);
      const height = Boolean(current.second) || event.shiftKey;
      if (height !== current.height) rebase(current, height);
      current.currentX = event.clientX;
      current.currentY = event.clientY;
      const position = scene.current?.displacement(
        current.segment,
        event.clientX - current.x,
        event.clientY - current.y,
        height,
      );
      if (position) {
        const previous = scene.current?.position(current.id);
        const end = scene.current?.place(current.id, position) ?? position;
        if (previous) announce(current.id, previous, end);
        setGuide(height ? { id: current.id, start: current.segment, end, source: 'drag' } : null);
        setHeightActive(height);
      }
      event.preventDefault();
      event.stopPropagation();
    },
    end(event: ReactPointerEvent) {
      touches.current.delete(event.pointerId);
      if (!touches.current.size) waiting.current = false;
      const current = gesture.current;
      if (!current) return;
      if (event.pointerId !== current.primary && event.pointerId !== current.second?.id) return;
      if (current.second) waiting.current = touches.current.size > 0;
      gesture.current = null;
      setHeightActive(false);
      cancelHold();
      const position = scene.current?.position(current.id);
      if (current.moved && position) void onMove(current.id, position);
    },
  };
}
