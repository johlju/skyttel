import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SpatialMap } from '../../../src/client/SpatialMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { defaultViewSettings, type PersonalView } from '../../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function openMap() {
  // jsdom supplies no dimensions or pointer capture. Keep the real scene and
  // camera; this test observes the whole position sent for saving, not graphics.
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
  const move = vi.fn();
  const personal = (positions: PersonalView['positions']) => ({
    view: {
      contentVersion: 1,
      positions,
      settings: { ...defaultViewSettings, background: false, version: 0 },
    },
    message: '',
    pending: true,
    move,
    configure: async () => {},
    refresh: async () => {},
  });
  const properties = {
    state,
    active: true,
    objects: new Map(state.objects.map((object) => [object.id, object])),
    relationships: new Map(),
    selection: { kind: 'object' as const, id: 'bike' },
    disabled: false,
    onSelect: () => {},
    onSelectRelationship: () => {},
    onFocus: () => {},
    onClear: () => {},
    onReset: () => {},
    onRemove: () => {},
  };
  const view = render(
    <SpatialMap
      {...properties}
      personal={personal([
        { id: 'lamp', x: -5, y: 0, z: 0, version: 0 },
        { id: 'bike', x: 0, y: 0, z: 0, version: 0 },
      ])}
    />,
  );
  const bike = screen.getByRole('button', { name: 'Välj objekt: Cykeln' });
  const surface = bike.closest('.spatial-surface') as HTMLElement;
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
  return {
    move,
    surface,
    pointer,
    drag() {
      fireEvent.pointerDown(bike, pointer);
      fireEvent.pointerMove(bike, { ...pointer, clientY: 260 });
    },
    refresh() {
      // A different object's save conflict refreshes the whole personal view.
      // Its response carries this object's newer position from another device.
      view.rerender(
        <SpatialMap
          {...properties}
          personal={personal([
            { id: 'lamp', x: -4, y: 0, z: 0, version: 3 },
            { id: 'bike', x: 900, y: 800, z: 700, version: 2 },
          ])}
        />,
      );
    },
  };
}

test('a refreshed position for another client cannot replace an active local drag before release', () => {
  const map = openMap();
  const { move, surface, pointer } = map;
  map.drag();
  map.refresh();
  fireEvent.pointerUp(surface, { ...pointer, buttons: 0, clientY: 260 });
  expect(move).toHaveBeenCalledOnce();
  expect(move.mock.calls[0][0]).toBe('bike');
  expect(move.mock.calls[0][1]).toMatchObject({ x: 0, z: 0 });
  expect(move.mock.calls[0][1].y).toBeGreaterThan(0);
});

test('touch dragging completes after capture transfers from the object to the map surface', () => {
  const map = openMap();
  const bike = screen.getByRole('button', { name: 'Välj objekt: Cykeln' });
  const pointer = { ...map.pointer, pointerType: 'touch', shiftKey: false };
  map.surface.hasPointerCapture = (id) => id === pointer.pointerId;

  fireEvent.pointerDown(bike, pointer);
  fireEvent.pointerMove(bike, { ...pointer, clientY: 260 });
  // Touch starts with implicit capture on the object. Transferring it to the
  // surface bubbles the object's lost-capture event through that surface.
  fireEvent.lostPointerCapture(bike, pointer);
  fireEvent.pointerUp(map.surface, { ...pointer, buttons: 0, clientY: 260 });

  expect(map.move).toHaveBeenCalledOnce();
  expect(map.move.mock.calls[0][0]).toBe('bike');
  expect(map.move.mock.calls[0][1]).not.toEqual({ x: 0, y: 0, z: 0 });
});

test('losing the map surface capture still cancels a touch drag without saving it', () => {
  const map = openMap();
  const bike = screen.getByRole('button', { name: 'Välj objekt: Cykeln' });
  const pointer = { ...map.pointer, pointerType: 'touch', shiftKey: false };
  map.surface.hasPointerCapture = () => false;

  fireEvent.pointerDown(bike, pointer);
  fireEvent.pointerMove(bike, { ...pointer, clientY: 260 });
  fireEvent.lostPointerCapture(map.surface, pointer);
  fireEvent.pointerUp(map.surface, { ...pointer, buttons: 0, clientY: 260 });

  expect(map.move).not.toHaveBeenCalled();
});

test('cancelling an active drag keeps later saved-position refreshes available', () => {
  const map = openMap();
  map.drag();
  map.refresh();
  fireEvent.pointerCancel(map.surface, { ...map.pointer, buttons: 0 });
  expect(map.move).not.toHaveBeenCalled();

  map.refresh();
  fireEvent.click(screen.getByRole('button', { name: 'Navigera' }));
  fireEvent.click(screen.getByRole('button', { name: 'Flytta Cykeln: höger' }));
  expect(map.move).toHaveBeenCalledExactlyOnceWith('bike', { x: 901, y: 800, z: 700 });
});
