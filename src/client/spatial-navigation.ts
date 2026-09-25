/** Camera gestures on empty space never create object edits. */
export function cameraGestures(
  canvas: HTMLCanvasElement,
  camera: {
    rotate: (x: number, y: number) => void;
    pan: (x: number, y: number) => void;
    zoom: (factor: number) => void;
  },
  surface: HTMLElement = canvas,
) {
  const pointers = new Map<number, { x: number; y: number; button: number }>();
  let enabled = true;
  let multiple = false;
  function down(event: PointerEvent) {
    if (!enabled || (!pointers.size && event.target !== canvas)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button });
    if (pointers.size > 1) multiple = true;
    canvas.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent) {
    const before = pointers.get(event.pointerId);
    if (!before || !enabled) return;
    const pair = [...pointers].slice(0, 2);
    if (!pair.some(([id]) => id === event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: before.button });
      return;
    }
    const other = pair.find(([id]) => id !== event.pointerId)?.[1];
    const dx = event.clientX - before.x;
    const dy = event.clientY - before.y;
    if (other) {
      camera.pan(dx / 2, dy / 2);
      const oldDistance = Math.hypot(before.x - other.x, before.y - other.y);
      const distance = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (oldDistance > 2 && distance > 2) camera.zoom(oldDistance / distance);
    } else if (!multiple) {
      if (before.button === 2 || event.shiftKey) camera.pan(dx, dy);
      else
        camera.rotate(
          (2 * Math.PI * dx) / canvas.clientHeight,
          (2 * Math.PI * dy) / canvas.clientHeight,
        );
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: before.button });
  }
  function end(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (!pointers.size) multiple = false;
  }
  function cancel() {
    pointers.clear();
    multiple = false;
  }
  function wheel(event: WheelEvent) {
    event.preventDefault();
    if (!enabled) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1;
    if (event.ctrlKey) camera.zoom(Math.exp(event.deltaY * unit * 0.002));
    else camera.pan(-event.deltaX * unit, -event.deltaY * unit);
  }
  function context(event: Event) {
    event.preventDefault();
  }
  surface.addEventListener('pointerdown', down);
  surface.addEventListener('pointermove', move);
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', cancel);
  surface.addEventListener('lostpointercapture', end);
  surface.addEventListener('wheel', wheel, { passive: false });
  canvas.addEventListener('contextmenu', context);
  window.addEventListener('blur', cancel);
  return {
    beginTouch(values: ReadonlyMap<number, { x: number; y: number }>) {
      cancel();
      if (!enabled) return;
      multiple = true;
      for (const [id, point] of values) {
        pointers.set(id, { ...point, button: 0 });
        surface.setPointerCapture(id);
      }
    },
    enabled(value: boolean) {
      enabled = value;
      if (!value) cancel();
    },
    dispose() {
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', end);
      surface.removeEventListener('pointercancel', cancel);
      surface.removeEventListener('lostpointercapture', end);
      surface.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', context);
      window.removeEventListener('blur', cancel);
    },
  };
}
