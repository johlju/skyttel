import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { SpatialMap } from '../../../src/client/SpatialMap.js';
import type { MapState } from '../../../src/shared/map.js';
import { defaultViewSettings, type ViewSettings } from '../../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('automatic display is a retained preference with readable disabled help when always visible', () => {
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [],
    relationshipTypes: [],
    objects: [],
    relationships: [],
    draft: { version: 0, changes: [] },
  };
  function PersonalMap() {
    const [settings, setSettings] = useState(defaultViewSettings);
    const [mount, setMount] = useState<HTMLElement | null>(null);
    return (
      <>
        <div ref={setMount} />
        <SpatialMap
          state={state}
          active
          objects={new Map()}
          relationships={new Map()}
          settingsMount={mount}
          selection={null}
          disabled={false}
          onSelect={() => {}}
          onSelectRelationship={() => {}}
          onFocus={() => {}}
          onClear={() => {}}
          onReset={() => {}}
          onRemove={() => {}}
          personal={{
            view: { contentVersion: 1, positions: [], settings: { ...settings, version: 1 } },
            pending: false,
            message: '',
            refresh: async () => {},
            move: async () => {},
            configure: async (value: ViewSettings) => {
              setSettings(value);
            },
          }}
        />
      </>
    );
  }
  render(<PersonalMap />);
  const automatic = screen.getByRole('checkbox', { name: 'Synlig vid dragning' });
  expect((automatic as HTMLInputElement).checked).toBe(false);
  expect(automatic.getAttribute('aria-describedby')).toBeTruthy();
  const description = document.getElementById(automatic.getAttribute('aria-describedby') ?? '');
  expect(description?.textContent).toMatch(/flyttknappar.*koordinater.*1,5 sekunder/);
  fireEvent.click(automatic);
  expect((automatic as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Alltid synlig' }));
  expect((automatic as HTMLInputElement).disabled).toBe(true);
  expect((automatic as HTMLInputElement).checked).toBe(true);
  expect(description?.textContent).toContain('Alltid synlig');
  fireEvent.click(screen.getByRole('button', { name: 'Navigera' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /^Nollreferens$/ }));
  expect((automatic as HTMLInputElement).disabled).toBe(false);
  expect((automatic as HTMLInputElement).checked).toBe(true);
});
