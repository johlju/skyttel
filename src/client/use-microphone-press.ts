import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';

export function microphoneShortcut() {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? 'Ctrl+Skift+Mellanslag' : 'Ctrl+Mellanslag';
}

/** One short/long-press rule for a pointer and the platform's keyboard shortcut. */
export function useMicrophonePress(options: {
  button: React.RefObject<HTMLButtonElement | null>;
  canHold: () => boolean;
  prepare: () => void;
  short: () => void;
  startHeld: () => void;
  releaseHeld: () => void;
}) {
  const latest = useRef(options);
  latest.current = options;
  const press = useRef<{
    kind: 'pointer' | 'keyboard';
    pointer?: number;
    timer: ReturnType<typeof setTimeout>;
    long: boolean;
  } | null>(null);
  const [held, setHeld] = useState(false);
  function begin(kind: 'pointer' | 'keyboard', pointer?: number) {
    if (press.current) return;
    latest.current.prepare();
    setHeld(true);
    const item = {
      kind,
      pointer,
      long: false,
      timer: setTimeout(() => {
        if (press.current !== item || !latest.current.canHold()) return;
        item.long = true;
        latest.current.startHeld();
      }, 450),
    };
    press.current = item;
  }
  function end(kind?: 'pointer' | 'keyboard', pointer?: number, cancelled = false) {
    const item = press.current;
    if (
      !item ||
      (kind && item.kind !== kind) ||
      (pointer !== undefined && pointer !== item.pointer)
    )
      return;
    press.current = null;
    clearTimeout(item.timer);
    setHeld(false);
    if (item.long) latest.current.releaseHeld();
    else if (!cancelled) latest.current.short();
  }
  const actions = useRef({ begin, end });
  actions.current = { begin, end };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) =>
      event.code === 'Space' &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      event.shiftKey === (microphoneShortcut() === 'Ctrl+Skift+Mellanslag');
    const down = (event: KeyboardEvent) => {
      if (!shortcut(event)) return;
      event.preventDefault();
      if (!event.repeat && !latest.current.button.current?.disabled)
        actions.current.begin('keyboard');
    };
    const up = (event: KeyboardEvent) => {
      // Release Space even if Control/Shift was released first.
      if (event.code !== 'Space' || press.current?.kind !== 'keyboard') return;
      event.preventDefault();
      actions.current.end('keyboard');
    };
    const blur = () => actions.current.end(undefined, undefined, true);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      const item = press.current;
      if (item) {
        clearTimeout(item.timer);
        if (item.long) latest.current.releaseHeld();
      }
      press.current = null;
    };
  }, []);
  return {
    held,
    onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      begin('pointer', event.pointerId);
    },
    onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
      end('pointer', event.pointerId);
    },
    onPointerCancel(event: ReactPointerEvent<HTMLButtonElement>) {
      end('pointer', event.pointerId, true);
    },
    onLostPointerCapture(event: ReactPointerEvent<HTMLButtonElement>) {
      end('pointer', event.pointerId, true);
    },
    onContextMenu(event: React.MouseEvent<HTMLButtonElement>) {
      event.preventDefault();
    },
    onClick(event: React.MouseEvent<HTMLButtonElement>) {
      // Pointer presses already ran on release. AT and ordinary Enter/Space clicks remain short presses.
      if (event.detail === 0) latest.current.short();
    },
  };
}
