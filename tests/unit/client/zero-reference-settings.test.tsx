import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SpatialMap } from '../../../src/client/SpatialMap.js';
import type { MapState } from '../../../src/shared/map.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function openSettings() {
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [],
    relationshipTypes: [],
    objects: [],
    relationships: [],
    draft: { version: 0, changes: [] },
  };
  const mount = document.createElement('div');
  document.body.append(mount);
  const view = render(
    <SpatialMap
      state={state}
      active={false}
      objects={new Map()}
      relationships={new Map()}
      selection={null}
      disabled={false}
      settingsMount={mount}
      onSelect={() => {}}
      onSelectRelationship={() => {}}
      onFocus={() => {}}
      onClear={() => {}}
      onReset={() => {}}
      onRemove={() => {}}
    />,
  );
  return {
    close() {
      view.unmount();
      mount.remove();
    },
  };
}

test('tint number and slider share one retained preference when line references disable both', () => {
  const settings = openSettings();
  try {
    const number = screen.getByRole('spinbutton', {
      name: 'Tonstyrka i procent',
    }) as HTMLInputElement;
    const slider = screen.getByRole('slider', { name: 'Tonstyrka' }) as HTMLInputElement;
    expect(number.value).toBe('0');
    expect(slider.value).toBe('0');
    fireEvent.change(number, { target: { value: '37' } });
    expect(slider.value).toBe('37');
    fireEvent.blur(number);
    fireEvent.change(screen.getByRole('combobox', { name: 'Variant' }), {
      target: { value: 'lines' },
    });
    expect(number.disabled).toBe(true);
    expect(slider.disabled).toBe(true);
    expect(
      screen.getByText('Linjer har inga ytor att tona. Ditt värde finns kvar.'),
    ).not.toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Variant' }), {
      target: { value: 'oval' },
    });
    expect(number.disabled).toBe(false);
    expect(slider.disabled).toBe(false);
    expect(number.value).toBe('37');
    expect(slider.value).toBe('37');
  } finally {
    settings.close();
  }
});

test('invalid tint input restores the saved value with an explanation and leaves the other settings usable', () => {
  const settings = openSettings();
  try {
    const number = screen.getByRole('spinbutton', {
      name: 'Tonstyrka i procent',
    }) as HTMLInputElement;
    const slider = screen.getByRole('slider', { name: 'Tonstyrka' }) as HTMLInputElement;
    fireEvent.change(number, { target: { value: '23' } });
    fireEvent.blur(number);
    for (const value of ['', '-1', '86', '1.5', '1e309']) {
      fireEvent.change(number, { target: { value } });
      expect(number.getAttribute('aria-invalid')).toBe('true');
      expect(slider.value).toBe('23');
      fireEvent.blur(number);
      expect(number.value).toBe('23');
      expect(number.getAttribute('aria-invalid')).toBeNull();
      expect(screen.getByRole('alert').textContent).toContain('återställt till 23 procent');
    }
    fireEvent.click(screen.getByRole('checkbox', { name: 'Alltid synlig' }));
    expect(
      (screen.getByRole('checkbox', { name: 'Alltid synlig' }) as HTMLInputElement).checked,
    ).toBe(true);
  } finally {
    settings.close();
  }
});

test('keyboard slider edits commit the full gesture and a cancelled pointer gesture restores the saved tint', () => {
  const settings = openSettings();
  try {
    const number = screen.getByRole('spinbutton', {
      name: 'Tonstyrka i procent',
    }) as HTMLInputElement;
    const slider = screen.getByRole('slider', { name: 'Tonstyrka' }) as HTMLInputElement;
    fireEvent.keyDown(slider, { key: 'End' });
    fireEvent.change(slider, { target: { value: '85' } });
    expect(number.value).toBe('85');
    fireEvent.keyUp(slider, { key: 'End' });
    slider.setPointerCapture = () => {};
    fireEvent.pointerDown(slider, { pointerId: 1 });
    fireEvent.change(slider, { target: { value: '0' } });
    expect(number.value).toBe('0');
    fireEvent.pointerCancel(slider, { pointerId: 1 });
    expect(number.value).toBe('85');
    expect(slider.value).toBe('85');
    expect(screen.queryByText('Ändringen är inte sparad än.')).toBeNull();
  } finally {
    settings.close();
  }
});
