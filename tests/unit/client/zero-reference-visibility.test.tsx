import { act, cleanup, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { spatialScene } from '../../../src/client/spatial-scene.js';
import { useObjectMovement } from '../../../src/client/use-object-movement.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function openMovement() {
  vi.useFakeTimers();
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = () => {};
  Object.defineProperties(canvas, {
    clientWidth: { value: 960 },
    clientHeight: { value: 600 },
  });
  const scene = { current: spatialScene(canvas, () => {}) };
  scene.current.update(['bike'], [{ id: 'bike', x: 0, y: 0, z: 0, version: 1 }]);
  const options = {
    enabled: true,
    active: true,
    referenceAlwaysVisible: false,
    referenceOnMovement: true,
    onMove: vi.fn(),
    cancelHold: () => {},
  };
  const hook = renderHook((value) => useObjectMovement(scene, value), { initialProps: options });
  const target = document.createElement('div');
  target.setPointerCapture = () => {};
  const pointer = (change: Partial<ReactPointerEvent> = {}) =>
    ({
      button: 0,
      buttons: 1,
      isPrimary: true,
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 480,
      clientY: 300,
      currentTarget: target,
      preventDefault() {},
      stopPropagation() {},
      ...change,
    }) as ReactPointerEvent;
  return {
    ...hook,
    scene,
    pointer,
    options,
    run(action: (movement: ReturnType<typeof useObjectMovement>) => void) {
      act(() => action(hook.result.current));
    },
    wait(ms: number) {
      act(() => vi.advanceTimersByTime(ms));
    },
    close() {
      hook.unmount();
      scene.current.dispose();
    },
  };
}

test('automatic reference appears only after actual dragging and hides one second after release', () => {
  const map = openMovement();
  try {
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.start('bike', map.pointer()));
    map.run((movement) => movement.move(map.pointer({ clientX: 485 })));
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.move(map.pointer({ clientX: 500 })));
    expect(map.result.current.referenceVisible).toBe(true);
    map.wait(3000);
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.wait(999);
    expect(map.result.current.referenceVisible).toBe(true);
    map.wait(1);
    expect(map.result.current.referenceVisible).toBe(false);
  } finally {
    map.close();
  }
});

test('stationary primary mouse holds reveal at 1.5 seconds and continue through a later drag', () => {
  const map = openMovement();
  try {
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(1499);
    expect(map.result.current.referenceVisible).toBe(false);
    map.wait(1);
    expect(map.result.current.referenceVisible).toBe(true);
    expect(map.result.current.announcement).toBeNull();
    map.wait(2000);
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.move(map.pointer({ clientY: 260 })));
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.wait(1000);
    expect(map.result.current.referenceVisible).toBe(false);
  } finally {
    map.close();
  }
});

test('a held reference hides one second after mouse release outside the map', () => {
  const map = openMovement();
  const outside = document.createElement('button');
  outside.addEventListener('pointerup', (event) => event.stopPropagation());
  document.body.append(outside);
  try {
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(1500);
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.leave());
    outside.focus();
    act(() =>
      outside.dispatchEvent(
        Object.assign(new Event('pointerup', { bubbles: true }), { pointerId: 1 }),
      ),
    );
    map.wait(999);
    expect(map.result.current.referenceVisible).toBe(true);
    map.wait(1);
    expect(map.result.current.referenceVisible).toBe(false);
    expect(document.activeElement).toBe(outside);
    expect(map.options.onMove).not.toHaveBeenCalled();
    expect(map.result.current.announcement).toBeNull();
  } finally {
    outside.remove();
    map.close();
  }
});

test('outside cancellation clears only the active hold and leaves no callback for the next gesture', () => {
  const map = openMovement();
  try {
    const outsidePointer = (type: string, pointerId: number) =>
      act(() =>
        document.body.dispatchEvent(
          Object.assign(new Event(type, { bubbles: true }), { pointerId }),
        ),
      );
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(1500);
    expect(map.result.current.referenceVisible).toBe(true);
    outsidePointer('pointercancel', 2);
    expect(map.result.current.referenceVisible).toBe(true);
    outsidePointer('pointercancel', 1);
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.start('bike', map.pointer({ pointerId: 3 })));
    map.wait(1499);
    expect(map.result.current.referenceVisible).toBe(false);
    map.wait(1);
    expect(map.result.current.referenceVisible).toBe(true);
    outsidePointer('pointerup', 1);
    map.wait(2000);
    expect(map.result.current.referenceVisible).toBe(true);
    outsidePointer('pointerup', 3);
    map.wait(1000);
    expect(map.result.current.referenceVisible).toBe(false);
    expect(map.options.onMove).not.toHaveBeenCalled();
  } finally {
    map.close();
  }
});

test('successive actual button or coordinate moves restart the delay while no-op edits do not', () => {
  const map = openMovement();
  try {
    map.run((movement) =>
      movement.recordMove('bike', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, false),
    );
    expect(map.result.current.referenceVisible).toBe(true);
    map.wait(900);
    map.run((movement) =>
      movement.recordMove('bike', { x: 1, y: 0, z: 0 }, { x: 1, y: 2, z: 0 }, true),
    );
    map.wait(900);
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) =>
      movement.recordMove('bike', { x: 1, y: 2, z: 0 }, { x: 1, y: 2, z: 0 }, false),
    );
    map.wait(100);
    expect(map.result.current.referenceVisible).toBe(false);
  } finally {
    map.close();
  }
});

test.each(['mouse', 'pen', 'touch'] as const)(
  '%s dragging restarts a pending hide without flickering',
  (pointerType) => {
    const map = openMovement();
    const pointer = map.pointer({ pointerType });
    try {
      map.run((movement) => movement.start('bike', pointer));
      map.run((movement) => movement.move(map.pointer({ pointerType, clientX: 500 })));
      map.run((movement) => movement.end(pointer));
      map.wait(900);
      map.run((movement) => movement.start('bike', pointer));
      map.run((movement) => movement.move(map.pointer({ pointerType, clientX: 500 })));
      map.wait(1000);
      expect(map.result.current.referenceVisible).toBe(true);
      map.run((movement) => movement.end(pointer));
      map.wait(999);
      expect(map.result.current.referenceVisible).toBe(true);
      map.wait(1);
      expect(map.result.current.referenceVisible).toBe(false);
    } finally {
      map.close();
    }
  },
);

test.each([
  { pointerType: 'touch' },
  { pointerType: 'pen' },
  { button: 2 },
  { isPrimary: false },
] as const)(
  'a stationary $pointerType $button $isPrimary press does not qualify as a mouse hold',
  (pointer) => {
    const map = openMovement();
    try {
      map.run((movement) => movement.start('bike', map.pointer(pointer)));
      map.wait(2000);
      expect(map.result.current.referenceVisible).toBe(false);
    } finally {
      map.close();
    }
  },
);

test('releasing or leaving the object before the hold threshold retires its callback', () => {
  const map = openMovement();
  try {
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(1400);
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.wait(200);
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(1000);
    map.run((movement) => movement.leave());
    map.wait(1000);
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(1500);
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.wait(1000);
    expect(map.result.current.referenceVisible).toBe(false);
  } finally {
    map.close();
  }
});

test('always-visible and automatic choices apply immediately through an active drag and its release', () => {
  const map = openMovement();
  try {
    map.rerender({ ...map.options, referenceOnMovement: false });
    map.run((movement) => movement.start('bike', map.pointer()));
    map.run((movement) => movement.move(map.pointer({ clientX: 500 })));
    expect(map.result.current.referenceVisible).toBe(false);
    map.rerender({ ...map.options, referenceAlwaysVisible: true, referenceOnMovement: false });
    expect(map.result.current.referenceVisible).toBe(true);
    map.rerender({ ...map.options, referenceOnMovement: false });
    expect(map.result.current.referenceVisible).toBe(false);
    map.rerender(map.options);
    expect(map.result.current.referenceVisible).toBe(true);
    map.wait(3000);
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.wait(1000);
    expect(map.result.current.referenceVisible).toBe(false);
    map.rerender({ ...map.options, referenceAlwaysVisible: true });
    map.run((movement) => movement.cancel());
    map.wait(5000);
    expect(map.result.current.referenceVisible).toBe(true);
  } finally {
    map.close();
  }
});

test('cancellation clears pending holds and visible drags before a fresh gesture', () => {
  const map = openMovement();
  try {
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(1000);
    map.run((movement) => movement.cancel());
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(500);
    expect(map.result.current.referenceVisible).toBe(false);
    map.wait(1000);
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.move(map.pointer({ clientX: 500 })));
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.cancel());
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.end(map.pointer()));
    map.wait(1500);
    expect(map.result.current.referenceVisible).toBe(false);
  } finally {
    map.close();
  }
});

test('empty-map holds, ordinary object clicks, selection and camera movement do not trigger visibility', () => {
  const map = openMovement();
  try {
    map.run((movement) => movement.down(map.pointer()));
    map.wait(2000);
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(100);
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.scene.current.select(['bike']);
    map.scene.current.navigate('left');
    map.wait(2000);
    expect(map.result.current.referenceVisible).toBe(false);
    expect(map.result.current.announcement).toBeNull();
  } finally {
    map.close();
  }
});

test('map departure clears pending callbacks and reopening begins with the retained preference only', () => {
  const map = openMovement();
  try {
    map.run((movement) => movement.start('bike', map.pointer()));
    map.wait(1000);
    map.rerender({ ...map.options, active: false });
    map.wait(5000);
    map.rerender(map.options);
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) =>
      movement.recordMove('bike', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, false),
    );
    expect(map.result.current.referenceVisible).toBe(true);
    map.wait(900);
    map.rerender({ ...map.options, active: false });
    map.rerender(map.options);
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.start('bike', map.pointer()));
    map.run((movement) => movement.move(map.pointer({ clientX: 500 })));
    map.wait(200);
    expect(map.result.current.referenceVisible).toBe(true);
    map.rerender({ ...map.options, active: false, referenceAlwaysVisible: true });
    map.wait(5000);
    map.rerender({ ...map.options, referenceAlwaysVisible: true });
    expect(map.result.current.referenceVisible).toBe(true);
  } finally {
    map.close();
  }
});

test('a moving second touch cancels object visibility when the gesture becomes camera navigation', () => {
  const map = openMovement();
  const primary = map.pointer({ pointerType: 'touch' });
  const second = map.pointer({ pointerType: 'touch', pointerId: 2, isPrimary: false });
  try {
    map.run((movement) => {
      movement.down(primary);
      movement.start('bike', primary);
      movement.move(map.pointer({ pointerType: 'touch', clientY: 260 }));
      movement.down(second);
    });
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.move({ ...second, clientX: 520 }));
    expect(map.result.current.referenceVisible).toBe(false);
    map.wait(2000);
    expect(map.result.current.referenceVisible).toBe(false);
  } finally {
    map.close();
  }
});

test('losing an active pointer capture cancels immediately while normal release keeps its delay', () => {
  const map = openMovement();
  try {
    map.run((movement) => movement.start('bike', map.pointer()));
    map.run((movement) => movement.move(map.pointer({ clientX: 500 })));
    expect(map.result.current.referenceVisible).toBe(true);
    map.run((movement) => movement.lostCapture(map.pointer()));
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) => movement.start('bike', map.pointer()));
    map.run((movement) => movement.move(map.pointer({ clientX: 500 })));
    map.run((movement) => movement.end(map.pointer({ buttons: 0 })));
    map.run((movement) => movement.lostCapture(map.pointer()));
    map.wait(999);
    expect(map.result.current.referenceVisible).toBe(true);
    map.wait(1);
    expect(map.result.current.referenceVisible).toBe(false);
  } finally {
    map.close();
  }
});

test('ordinary menu or selection cleanup preserves a completed move delay, while interruption clears it', () => {
  const map = openMovement();
  try {
    map.run((movement) =>
      movement.recordMove('bike', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, false),
    );
    map.wait(900);
    map.run((movement) => movement.cancel());
    expect(map.result.current.referenceVisible).toBe(true);
    map.wait(100);
    expect(map.result.current.referenceVisible).toBe(false);
    map.run((movement) =>
      movement.recordMove('bike', { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, false),
    );
    act(() => window.dispatchEvent(new Event('blur')));
    expect(map.result.current.referenceVisible).toBe(false);
    map.wait(2000);
    expect(map.result.current.referenceVisible).toBe(false);
  } finally {
    map.close();
  }
});
