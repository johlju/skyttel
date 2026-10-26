import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { MapNavigation } from '../../../src/client/MapNavigation.js';
import { SpatialMap } from '../../../src/client/SpatialMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';

afterEach(cleanup);

test('reading coordinates preserves full precision and does not request a move', () => {
  const onMove = vi.fn();
  const position = { x: -10000, y: 1.23456789, z: -0.001 };
  const properties = {
    open: true,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    object: { id: 'lo', name: 'Lo Exempel' },
    objectPosition: position,
    onMove,
    disabled: false,
    movementDisabled: false,
  };
  const view = render(<MapNavigation {...properties} />);
  expect(screen.getByRole('group', { name: 'Position för Lo Exempel' })).toBeTruthy();
  expect((screen.getByRole('textbox', { name: 'Sidled (X)' }) as HTMLInputElement).value).toBe(
    '-10000.00',
  );
  expect((screen.getByRole('textbox', { name: 'Höjd (Y)' }) as HTMLInputElement).value).toBe(
    '1.23',
  );
  expect((screen.getByRole('textbox', { name: 'Djup (Z)' }) as HTMLInputElement).value).toBe(
    '0.00',
  );
  for (const field of screen.getAllByRole('textbox'))
    expect((field as HTMLInputElement).readOnly).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Visa mininavigering' }));
  fireEvent.click(screen.getByRole('button', { name: 'Visa normal navigering' }));
  view.rerender(<MapNavigation {...properties} objectPosition={{ ...position, y: 2.987654 }} />);
  expect((screen.getByRole('textbox', { name: 'Höjd (Y)' }) as HTMLInputElement).value).toBe(
    '2.99',
  );
  expect(position).toEqual({ x: -10000, y: 1.23456789, z: -0.001 });
  expect(onMove).not.toHaveBeenCalled();
});

test('coordinate help closes with Escape and preserves its open state through mini mode', () => {
  const onClose = vi.fn();
  render(
    <MapNavigation
      open
      onClose={onClose}
      onNavigate={() => {}}
      object={{ id: 'lo', name: 'Lo Exempel' }}
      objectPosition={{ x: 0, y: 0, z: 0 }}
      onMove={() => {}}
      disabled={false}
      movementDisabled={false}
    />,
  );
  const help = screen.getByRole('button', { name: 'Om koordinater' });
  expect(help.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(help);
  expect(help.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(/X är sidled/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Visa mininavigering' }));
  expect(screen.queryByRole('button', { name: 'Om koordinater' })).toBeNull();
  expect(screen.getAllByRole('textbox').map((field) => field.getAttribute('aria-label'))).toEqual([
    'Sidled (X)',
    'Höjd (Y)',
    'Djup (Z)',
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Visa normal navigering' }));
  expect(help.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(help, { key: 'Escape' });
  expect(help.getAttribute('aria-expanded')).toBe('false');
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.keyDown(help, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledOnce();
});

test('the map reads automatic and saved scene positions without saving or reducing precision', async () => {
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [],
    relationshipTypes: [],
    objects: [
      { id: 'lo', name: 'Lo Exempel', typeId: 'person', householdId: 'home', revision: 1 },
      { id: 'kim', name: 'Kim Exempel', typeId: 'person', householdId: 'home', revision: 1 },
    ],
    relationships: [],
    draft: { version: 0, changes: [] },
  };
  const saved = { id: 'lo', x: -10000, y: 1.23456789, z: -0.001, version: 3 };
  const move = vi.fn();
  const personal = {
    view: {
      contentVersion: 1,
      positions: [saved],
      settings: { ...defaultViewSettings, background: false, version: 0 },
    },
    message: '',
    pending: false,
    move,
    configure: async () => {},
    refresh: async () => {},
  };
  const properties = {
    state,
    active: true,
    objects: new Map(state.objects.map((object) => [object.id, object])),
    relationships: new Map(),
    disabled: false,
    onSelect: () => {},
    onSelectRelationship: () => {},
    onFocus: () => {},
    onClear: () => {},
    onReset: () => {},
    onRemove: () => {},
    personal,
  };
  const view = render(<SpatialMap {...properties} selection={{ kind: 'object', id: 'lo' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Navigera' }));
  await waitFor(() =>
    expect((screen.getByRole('textbox', { name: 'Höjd (Y)' }) as HTMLInputElement).value).toBe(
      '1.23',
    ),
  );
  view.rerender(<SpatialMap {...properties} selection={{ kind: 'object', id: 'kim' }} />);
  const automatic = screen.getByRole('group', { name: 'Position för Kim Exempel' });
  expect(automatic.querySelectorAll('input')).toHaveLength(3);
  for (const field of automatic.querySelectorAll('input'))
    expect(field.value).toMatch(/^-?\d+\.\d{2}$/);
  expect(personal.view.positions).toEqual([
    { id: 'lo', x: -10000, y: 1.23456789, z: -0.001, version: 3 },
  ]);
  expect(move).not.toHaveBeenCalled();
});
