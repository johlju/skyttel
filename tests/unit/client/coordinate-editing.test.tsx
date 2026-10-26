import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useMemo } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { PersonalPositionRecovery } from '../../../src/client/PersonalPositionRecovery.js';
import { SpatialMap } from '../../../src/client/SpatialMap.js';
import { spatialScene } from '../../../src/client/spatial-scene.js';
import { usePersonalView } from '../../../src/client/use-personal-view.js';
import type { MapState } from '../../../src/shared/map.js';
import {
  defaultViewSettings,
  type PersonalPosition,
  type PersonalView,
  type Position,
} from '../../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openMap(positions: PersonalPosition[] = []) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [],
    relationshipTypes: [],
    objects: [
      { id: 'lamp', name: 'Lampan', typeId: 'thing', householdId: 'home', revision: 1 },
      { id: 'bike', name: 'Cykeln', typeId: 'thing', householdId: 'home', revision: 1 },
    ],
    relationships: [],
    draft: { version: 0, changes: [] },
  };
  let saved: PersonalView = {
    contentVersion: 1,
    positions,
    settings: { ...defaultViewSettings, background: false, version: 0 },
  };
  type Write = { id: string; position: Position; version: number; contentVersion: number };
  const writes: Write[] = [];
  let read: (() => Promise<Response>) | undefined;
  let write: ((body: Write) => Promise<Response>) | undefined;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/view')) return read ? read() : Response.json(saved);
    const body = JSON.parse(init?.body as string) as Write;
    writes.push(body);
    if (write) return write(body);
    const position = { id: body.id, ...body.position, version: body.version + 1 };
    saved = {
      ...saved,
      positions: [...saved.positions.filter(({ id }) => id !== body.id), position],
    };
    return Response.json(position);
  });
  const objects = new Map(state.objects.map((object) => [object.id, object]));
  const relationships = new Map();
  const onAccessLost = () => {};
  function PersonalMap({ id, active = true }: { id: string; active?: boolean }) {
    const personal = usePersonalView('/map', onAccessLost);
    const selection = useMemo(() => ({ kind: 'object' as const, id }), [id]);
    return (
      <>
        <SpatialMap
          state={state}
          active={active}
          objects={objects}
          relationships={relationships}
          selection={selection}
          disabled={false}
          onSelect={(object) => view.rerender(<PersonalMap id={object.id} />)}
          onSelectRelationship={() => {}}
          onFocus={() => {}}
          onClear={() => {}}
          onReset={() => {}}
          onRemove={() => {}}
          personal={personal}
        />
        <PersonalPositionRecovery
          personal={personal}
          householdId="home"
          objectName={(objectId) => (objectId === 'lamp' ? 'Lampan' : 'Cykeln')}
        />
      </>
    );
  }
  const view = render(<PersonalMap id="lamp" />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Navigera' }));
  return {
    writes,
    select(id: string) {
      view.rerender(<PersonalMap id={id} />);
    },
    saved(next: PersonalView) {
      saved = next;
    },
    read(operation: () => Promise<Response>) {
      read = operation;
    },
    write(operation: (body: Write) => Promise<Response>) {
      write = operation;
    },
    close() {
      view.rerender(<PersonalMap id="lamp" active={false} />);
    },
  };
}

test('editing one axis preserves other axes precision and field focus', async () => {
  const map = await openMap([{ id: 'lamp', x: 1, y: 1.23456789, z: -0.001, version: 3 }]);
  const field = screen.getByRole('textbox', { name: 'Sidled (X)' });
  field.focus();
  await act(async () => {
    fireEvent.change(field, { target: { value: '-1.005' } });
  });
  expect(map.writes[0]).toMatchObject({
    id: 'lamp',
    position: { x: -1.01, y: 1.23456789, z: -0.001 },
    version: 3,
  });
  expect(document.activeElement).toBe(field);
});

test('an invalid axis restores independently while another axis can move and save', async () => {
  const map = await openMap([{ id: 'lamp', x: 1.23456789, y: 2, z: -0.001, version: 3 }]);
  const user = userEvent.setup();
  const x = screen.getByRole('textbox', { name: 'Sidled (X)' });
  await user.clear(x);
  await user.type(x, '-');
  const y = screen.getByRole('textbox', { name: 'Höjd (Y)' });
  await user.clear(y);
  await user.type(y, '5.005');
  expect(x).toHaveProperty('value', '1.23');
  expect(map.writes.at(-1)?.position).toEqual({ x: 1.23456789, y: 5.01, z: -0.001 });
  expect(screen.getByText(/Sidled \(X\).*1.23 återställs/)).toBeTruthy();
  expect(document.activeElement).toBe(y);
});

test('character typing keeps its draft and caret through immediate scene echoes and a pending save', async () => {
  const map = await openMap([{ id: 'lamp', x: 4, y: 1.23456789, z: -0.001, version: 3 }]);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  map.write(async (body) => {
    if (body.position.x === 1) await held;
    return Response.json({ id: body.id, ...body.position, version: body.version + 1 });
  });
  const user = userEvent.setup();
  const field = screen.getByRole('textbox', { name: 'Sidled (X)' }) as HTMLInputElement;
  await user.clear(field);
  await user.type(field, '1,005');
  expect(field.value).toBe('1,005');
  expect(field.selectionStart).toBe(5);
  expect(field.disabled).toBe(false);
  expect(map.writes.map(({ position }) => position.x)).toEqual([1]);
  await act(async () => release());
  expect(map.writes.at(-1)).toMatchObject({
    id: 'lamp',
    version: 4,
    position: { x: 1.01, y: 1.23456789, z: -0.001 },
  });
  await user.tab();
  expect(field.value).toBe('1.01');
});

test('the first edit of an automatic placement saves its complete actual position', async () => {
  const map = await openMap();
  // Read the existing scene boundary's initial placement for the same map.
  // The assertion concerns the whole saved value, without inspecting graphics.
  const initial = spatialScene(document.createElement('canvas'), () => {});
  initial.update(['lamp', 'bike']);
  const automatic = initial.position('lamp');
  initial.dispose();
  expect(map.writes).toEqual([]);
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
      target: { value: '3.005' },
    });
  });
  expect(map.writes[0]).toMatchObject({
    id: 'lamp',
    version: 0,
    position: { ...automatic, x: 3.01 },
  });
});

test('coordinate conflicts retry the latest complete local position without echoing the remote axes', async () => {
  const map = await openMap([{ id: 'lamp', x: 4, y: 1.23456789, z: -0.001, version: 3 }]);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let conflicted = false;
  map.write(async (body) => {
    if (!conflicted) {
      await held;
      conflicted = true;
      return Response.json({ error: 'position_conflict' }, { status: 409 });
    }
    return Response.json({ id: body.id, ...body.position, version: body.version + 1 });
  });
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
      target: { value: '2.005' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Höjd (Y)' }), {
      target: { value: '3.005' },
    });
  });
  map.saved({
    contentVersion: 1,
    positions: [{ id: 'lamp', x: 900, y: 800, z: 700, version: 8 }],
    settings: { ...defaultViewSettings, background: false, version: 0 },
  });
  await act(async () => release());
  expect(map.writes.at(-1)).toMatchObject({
    id: 'lamp',
    version: 8,
    position: { x: 2.01, y: 3.01, z: -0.001 },
  });
  expect(screen.getByRole('textbox', { name: 'Sidled (X)' })).toHaveProperty('value', '2.01');
  expect(screen.getByRole('textbox', { name: 'Höjd (Y)' })).toHaveProperty('value', '3.005');
});

test('failed coordinate moves survive object changes and recover through the existing actions', async () => {
  const map = await openMap([
    { id: 'lamp', x: 1, y: 2, z: 3, version: 0 },
    { id: 'bike', x: 4, y: 5, z: 6, version: 0 },
  ]);
  map.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
      target: { value: '7.005' },
    });
  });
  map.select('bike');
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Djup (Z)' }), {
      target: { value: '8.005' },
    });
  });
  const recovery = within(screen.getByRole('region', { name: 'Osparade personliga positioner' }));
  expect(recovery.getByRole('group', { name: 'Position för Lampan' })).toBeTruthy();
  expect(recovery.getByRole('group', { name: 'Position för Cykeln' })).toBeTruthy();
  map.select('lamp');
  expect(screen.getByRole('textbox', { name: 'Sidled (X)' })).toHaveProperty('value', '7.01');
  map.write(async (body) => Response.json({ id: body.id, ...body.position, version: 1 }));
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Försök igen' })[0]);
  });
  expect(recovery.queryByRole('group', { name: 'Position för Lampan' })).toBeNull();
  expect(recovery.getByRole('group', { name: 'Position för Cykeln' })).toBeTruthy();
  map.select('bike');
  expect(screen.getByRole('textbox', { name: 'Djup (Z)' })).toHaveProperty('value', '8.01');
});

test('movement feedback announces only the latest result after a quiet half second', async () => {
  await openMap([{ id: 'lamp', x: 0, y: 0, z: 0, version: 0 }]);
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
      target: { value: '2.005' },
    });
  });
  await act(async () => vi.advanceTimersByTime(450));
  const feedback = screen.getByRole('status', { name: 'Flyttresultat' });
  expect(feedback.textContent).toBe('');
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Höjd (Y)' }), {
      target: { value: '-3.005' },
    });
  });
  await act(async () => vi.advanceTimersByTime(499));
  expect(feedback.textContent).toBe('');
  await act(async () => vi.advanceTimersByTime(1));
  expect(feedback.textContent).toBe('Lampan: Höjd (Y) -3.01.');
  fireEvent.click(screen.getByRole('button', { name: 'Stäng navigering' }));
  expect(feedback.textContent).toBe('Lampan: Höjd (Y) -3.01.');
});

test.each([100, 600])(
  'reloading after %sms discards feedback for the replaced local move',
  async (delay) => {
    const map = await openMap([{ id: 'lamp', x: 1, y: 2, z: 3, version: 0 }]);
    map.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
        target: { value: '7.005' },
      });
    });
    await act(async () => vi.advanceTimersByTime(delay));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Läs in sparad position' }));
    });
    expect(screen.getByRole('textbox', { name: 'Sidled (X)' })).toHaveProperty('value', '1.00');
    await act(async () => vi.advanceTimersByTime(500));
    expect(screen.getByRole('status', { name: 'Flyttresultat' }).textContent).toBe('');
  },
);

test('reloading another object preserves the latest local movement result', async () => {
  const map = await openMap([
    { id: 'lamp', x: 1, y: 2, z: 3, version: 0 },
    { id: 'bike', x: 4, y: 5, z: 6, version: 0 },
  ]);
  map.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
      target: { value: '7.005' },
    });
  });
  map.select('bike');
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Djup (Z)' }), {
      target: { value: '8.005' },
    });
  });
  await act(async () => {
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Position för Lampan' })).getByRole('button', {
        name: 'Läs in sparad position',
      }),
    );
  });
  await act(async () => vi.advanceTimersByTime(500));
  expect(screen.getByRole('textbox', { name: 'Djup (Z)' })).toHaveProperty('value', '8.005');
  expect(screen.getByRole('status', { name: 'Flyttresultat' }).textContent).toBe(
    'Cykeln: Djup (Z) 8.01.',
  );
});

test('a delayed reload cannot clear feedback for a newer local move', async () => {
  const map = await openMap([{ id: 'lamp', x: 1, y: 2, z: 3, version: 0 }]);
  map.write(async () => Response.json({ error: 'unavailable' }, { status: 503 }));
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
      target: { value: '7.005' },
    });
  });
  let release!: (response: Response) => void;
  map.read(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Läs in sparad position' }));
  });
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
      target: { value: '9.005' },
    });
  });
  await act(async () =>
    release(
      Response.json({
        contentVersion: 1,
        positions: [{ id: 'lamp', x: 1, y: 2, z: 3, version: 0 }],
        settings: { ...defaultViewSettings, background: false, version: 0 },
      }),
    ),
  );
  await act(async () => vi.advanceTimersByTime(500));
  expect(screen.getByRole('textbox', { name: 'Sidled (X)' })).toHaveProperty('value', '9.005');
  expect(screen.getByRole('status', { name: 'Flyttresultat' }).textContent).toBe(
    'Lampan: Sidled (X) 9.01.',
  );
});

test('leaving the map clears pending feedback for a completed move', async () => {
  const map = await openMap([{ id: 'lamp', x: 1, y: 2, z: 3, version: 0 }]);
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
      target: { value: '7.005' },
    });
  });
  map.close();
  await act(async () => vi.advanceTimersByTime(500));
  expect(screen.getByRole('status', { name: 'Flyttresultat', hidden: true }).textContent).toBe('');
});

test.each(['context menu', 'control selection'])(
  'a completed move keeps its feedback through ordinary %s',
  async (transition) => {
    await openMap([{ id: 'lamp', x: 1, y: 2, z: 3, version: 0 }]);
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
        target: { value: '7.005' },
      });
    });
    await act(async () => vi.advanceTimersByTime(100));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Välj objekt: Cykeln' }), {
      ctrlKey: transition === 'control selection',
    });
    await act(async () => vi.advanceTimersByTime(400));
    expect(screen.getByRole('status', { name: 'Flyttresultat' }).textContent).toBe(
      'Lampan: Sidled (X) 7.01.',
    );
  },
);

test('incomplete input does not postpone the result of an actual movement button', async () => {
  await openMap([{ id: 'lamp', x: 0, y: 0, z: 0, version: 0 }]);
  vi.useFakeTimers();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Flytta Lampan: uppåt' }));
  });
  await act(async () => vi.advanceTimersByTime(400));
  fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
    target: { value: '-' },
  });
  await act(async () => vi.advanceTimersByTime(100));
  expect(screen.getByRole('status', { name: 'Flyttresultat' }).textContent).toBe(
    'Lampan: Höjd (Y) 1.00.',
  );
});

test('dragging updates the coordinate fields and cancelled movement clears pending feedback', async () => {
  const map = await openMap([{ id: 'lamp', x: 0, y: 0, z: 0, version: 0 }]);
  vi.useFakeTimers();
  const object = screen.getByRole('button', { name: 'Välj objekt: Lampan' });
  const surface = object.closest('.spatial-surface') as HTMLElement;
  surface.setPointerCapture = () => {};
  const pointer = {
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    clientX: 480,
    clientY: 300,
    shiftKey: true,
  };
  fireEvent.pointerDown(object, pointer);
  fireEvent.pointerMove(object, { ...pointer, clientY: 260 });
  const y = screen.getByRole('textbox', { name: 'Höjd (Y)' }) as HTMLInputElement;
  expect(Number(y.value)).toBeGreaterThan(0);
  await act(async () => vi.advanceTimersByTime(500));
  expect(screen.getByRole('status', { name: 'Flyttresultat' }).textContent).toBe(
    `Lampan: Höjd (Y) ${y.value}.`,
  );
  fireEvent.pointerMove(object, { ...pointer, clientY: 250 });
  fireEvent.pointerCancel(surface, { ...pointer, buttons: 0 });
  await act(async () => vi.advanceTimersByTime(500));
  expect(y.value).toBe('0.00');
  expect(map.writes).toEqual([]);
  expect(screen.getByRole('status', { name: 'Flyttresultat' }).textContent).toBe('');
});

test('switching a touch drag to camera navigation clears its cancelled movement result', async () => {
  const map = await openMap([{ id: 'lamp', x: 0, y: 0, z: 0, version: 0 }]);
  vi.useFakeTimers();
  const object = screen.getByRole('button', { name: 'Välj objekt: Lampan' });
  const surface = object.closest('.spatial-surface') as HTMLElement;
  surface.setPointerCapture = () => {};
  const pointer = {
    pointerId: 1,
    isPrimary: true,
    pointerType: 'touch',
    button: 0,
    buttons: 1,
    clientX: 480,
    clientY: 300,
  };
  fireEvent.pointerDown(object, pointer);
  fireEvent.pointerMove(object, { ...pointer, clientY: 260 });
  fireEvent.pointerDown(surface, { ...pointer, pointerId: 2, isPrimary: false, clientX: 520 });
  fireEvent.pointerMove(surface, {
    ...pointer,
    pointerId: 2,
    isPrimary: false,
    clientX: 545,
  });
  await act(async () => vi.advanceTimersByTime(500));
  expect(map.writes).toEqual([]);
  expect(screen.getByRole('status', { name: 'Flyttresultat' }).textContent).toBe('');
  expect(screen.getByRole('textbox', { name: 'Höjd (Y)' })).toHaveProperty('value', '0.00');
});
