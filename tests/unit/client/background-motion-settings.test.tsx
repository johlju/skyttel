import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SpatialMap } from '../../../src/client/SpatialMap.js';
import type { MapState } from '../../../src/shared/map.js';

test('Milky Way panoramas support zoom and retain the settings for other backgrounds', () => {
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
  const map = (theme: 'light' | 'dark') => (
    <SpatialMap
      theme={theme}
      state={state}
      active
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
    />
  );
  const view = render(map('dark'));
  try {
    const choice = screen.getByRole('combobox', { name: 'Bakgrund i mörkt tema' });
    const pan = screen.getByRole('slider', { name: 'Panoreringsstyrka' }) as HTMLInputElement;
    const zoom = screen.getByRole('slider', { name: 'Zoomstyrka' }) as HTMLInputElement;
    const depth = screen.getByRole('slider', { name: 'Lageravstånd' }) as HTMLInputElement;
    const group = screen.getByRole('group', { name: 'Bakgrundens rörelse' });
    function setRange(slider: HTMLInputElement, value: string) {
      fireEvent.keyDown(slider, { key: 'ArrowRight' });
      fireEvent.change(slider, { target: { value } });
      fireEvent.keyUp(slider, { key: 'ArrowRight' });
    }

    setRange(pan, '35');
    setRange(depth, '1.4');
    for (const [value, credit, description] of [
      ['milky-way', 'ESO/S. Brunier', 'Himmelsfoto av ESO/S. Brunier'],
      ['milky-way-2', 'Källor till stjärnhimlen', 'Källor och licens för Vintergatan 2'],
    ]) {
      fireEvent.change(choice, { target: { value } });
      const creditLink = screen.getByRole('link', {
        name: `${credit}. ${description} (öppnas i ny flik)`,
      });
      expect(creditLink.textContent).toBe(credit);
      expect(pan.disabled).toBe(true);
      expect(depth.disabled).toBe(true);
      expect(zoom.disabled).toBe(false);
      const helpId = group.getAttribute('aria-describedby') ?? '';
      expect(document.getElementById(helpId)?.textContent).toContain('fasta riktningar');
      setRange(zoom, '55');
      expect(zoom.value).toBe('55');
      fireEvent.click(screen.getByRole('button', { name: 'Återställ zoomstyrka' }));
      expect(zoom.value).toBe('70');
      expect(pan.value).toBe('35');
      expect(depth.value).toBe('1.4');
    }

    view.rerender(map('light'));
    expect(pan.disabled).toBe(false);
    expect(depth.disabled).toBe(false);
    expect(group.hasAttribute('aria-describedby')).toBe(false);

    view.rerender(map('dark'));
    fireEvent.change(choice, { target: { value: 'universe' } });
    expect(pan.disabled).toBe(false);
    expect(depth.disabled).toBe(false);
    expect(group.hasAttribute('aria-describedby')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Återställ rörelse' }));
    expect(pan.value).toBe('70');
    expect(depth.value).toBe('1');
  } finally {
    view.unmount();
    mount.remove();
  }
});
