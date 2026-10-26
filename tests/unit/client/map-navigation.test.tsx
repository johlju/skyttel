import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ComponentProps, useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { MapNavigation } from '../../../src/client/MapNavigation.js';
import { SpatialMap } from '../../../src/client/SpatialMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { defaultViewSettings, type Position } from '../../../src/shared/personal-view.js';

afterEach(cleanup);

function openCoordinates(
  position: Position,
  onEditPosition: ComponentProps<typeof MapNavigation>['onEditPosition'],
) {
  return render(
    <MapNavigation
      open
      onClose={() => {}}
      onNavigate={() => {}}
      object={{ id: 'lo', name: 'Lo Exempel' }}
      objectPosition={position}
      onMove={() => {}}
      onEditPosition={onEditPosition}
      disabled={false}
      movementDisabled={false}
    />,
  );
}

test('a decimal coordinate edit applies immediately using halfway-away rounding', () => {
  const edit = vi.fn();
  openCoordinates({ x: 0, y: 1.23456789, z: -0.001 }, edit);
  const x = screen.getByRole('textbox', { name: 'Sidled (X)' });
  x.focus();
  fireEvent.change(x, { target: { value: '1,005' } });
  expect(edit).toHaveBeenCalledExactlyOnceWith('lo', 'x', 1.01);
  expect(document.activeElement).toBe(x);
});

test('unfinished text survives a newer position and restores its latest value with blur feedback', () => {
  const edit = vi.fn();
  const properties = {
    open: true,
    onClose: () => {},
    onNavigate: () => {},
    object: { id: 'lo', name: 'Lo Exempel' },
    objectPosition: { x: 1.23456, y: 2, z: 3 },
    onMove: () => {},
    onEditPosition: edit,
    disabled: false,
    movementDisabled: false,
  };
  const view = render(<MapNavigation {...properties} />);
  const x = screen.getByRole('textbox', { name: 'Sidled (X)' });
  fireEvent.change(x, { target: { value: '-' } });
  view.rerender(<MapNavigation {...properties} objectPosition={{ x: 4.98765, y: 2, z: 3 }} />);
  expect(x).toHaveProperty('value', '-');
  expect(edit).not.toHaveBeenCalled();
  fireEvent.blur(x);
  expect(x).toHaveProperty('value', '4.99');
  expect(screen.getByRole('status').textContent).toContain('Sidled (X)');
  expect(screen.getByRole('status').textContent).toContain('4.99');
});

test('a valid input draft follows a later external move without rounding untouched positions', () => {
  let move!: (x: number) => void;
  function Navigation() {
    const [position, setPosition] = useState({ x: 1, y: 2.1234567, z: 3 });
    move = (x) => setPosition((current) => ({ ...current, x }));
    return (
      <MapNavigation
        open
        onClose={() => {}}
        onNavigate={() => {}}
        object={{ id: 'lo', name: 'Lo Exempel' }}
        objectPosition={position}
        onMove={() => {}}
        onEditPosition={(_id, axis, value) =>
          setPosition((current) => ({ ...current, [axis]: value }))
        }
        disabled={false}
        movementDisabled={false}
      />
    );
  }
  render(<Navigation />);
  const field = screen.getByRole('textbox', { name: 'Sidled (X)' });
  field.focus();
  fireEvent.change(field, { target: { value: '2.500' } });
  expect(field).toHaveProperty('value', '2.500');
  act(() => move(4.987654));
  expect(field).toHaveProperty('value', '4.99');
  expect(document.activeElement).toBe(field);
});

test.each([
  ['-1.005', -1.01],
  ['-0.001', 0],
  ['0.005', 0.01],
  ['-0.005', -0.01],
  ['1.0049', 1],
  ['9999.999', 10000],
  ['-9999.999', -10000],
  ['10000', 10000],
  ['-10000', -10000],
  ['.5', 0.5],
  [' 2,5 ', 2.5],
  ['+0002.345', 2.35],
])('coordinate %s applies the bounded rounded value %s', (text, expected) => {
  const edit = vi.fn();
  openCoordinates({ x: 123, y: 0, z: 0 }, edit);
  fireEvent.change(screen.getByRole('textbox', { name: 'Sidled (X)' }), {
    target: { value: text },
  });
  expect(edit).toHaveBeenCalledExactlyOnceWith('lo', 'x', expected);
});

test.each([
  '',
  '-',
  '2.',
  '2,',
  '10001',
  '-10001',
  '10000.000000000000001',
  'Infinity',
  'NaN',
  '1e309',
  '2,3.4',
])('incomplete or invalid coordinate %j does not move and is explained on blur', (text) => {
  const edit = vi.fn();
  openCoordinates({ x: 1.234567, y: 0, z: 0 }, edit);
  const field = screen.getByRole('textbox', { name: 'Sidled (X)' });
  fireEvent.change(field, { target: { value: text } });
  expect(field).toHaveProperty('value', text);
  expect(edit).not.toHaveBeenCalled();
  fireEvent.blur(field);
  expect(field).toHaveProperty('value', '1.23');
  expect(screen.getByRole('status').textContent).toContain('1.23');
});

test('reading coordinates preserves full precision and does not request a move', () => {
  const onMove = vi.fn();
  const onEditPosition = vi.fn();
  const position = { x: -10000, y: 1.23456789, z: -0.001 };
  const properties = {
    open: true,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    object: { id: 'lo', name: 'Lo Exempel' },
    objectPosition: position,
    onMove,
    onEditPosition,
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
    expect((field as HTMLInputElement).readOnly).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Visa mininavigering' }));
  fireEvent.click(screen.getByRole('button', { name: 'Visa normal navigering' }));
  view.rerender(<MapNavigation {...properties} objectPosition={{ ...position, y: 2.987654 }} />);
  expect((screen.getByRole('textbox', { name: 'Höjd (Y)' }) as HTMLInputElement).value).toBe(
    '2.99',
  );
  expect(position).toEqual({ x: -10000, y: 1.23456789, z: -0.001 });
  expect(onMove).not.toHaveBeenCalled();
  expect(onEditPosition).not.toHaveBeenCalled();
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
      onEditPosition={() => {}}
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
