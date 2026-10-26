import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SpatialMap } from '../../../src/client/SpatialMap.js';
import { usePersonalView } from '../../../src/client/use-personal-view.js';
import type { MapState } from '../../../src/shared/map.js';
import {
  defaultViewSettings,
  type PersonalView,
  type ViewSettings,
} from '../../../src/shared/personal-view.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openPreferences() {
  // jsdom has no layout or WebGL. Keep the existing real scene, camera and
  // position service; assert controls and HTTP behavior rather than graphics.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
  const state: MapState = {
    userId: 'alex',
    contentVersion: 1,
    types: [],
    relationshipTypes: [],
    objects: [{ id: 'lamp', name: 'Lampan', typeId: 'thing', householdId: 'home', revision: 1 }],
    relationships: [],
    draft: { version: 0, changes: [] },
  };
  let saved: PersonalView = {
    contentVersion: 1,
    positions: [{ id: 'lamp', x: 3.25, y: -2, z: 7, version: 4 }],
    settings: {
      ...defaultViewSettings,
      background: false,
      zeroReferenceOnMovement: true,
      zeroReferenceTint: 23,
      zeroReferenceKeepSize: true,
      version: 0,
    },
  };
  const writes: { version: number; settings: ViewSettings }[] = [];
  let paused: Promise<void> | undefined;
  let conflict: PersonalView['settings'] | undefined;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/view')) return Response.json(saved);
    if (!url.endsWith('/view/settings')) throw new Error(`Unexpected reference request: ${url}`);
    const body = JSON.parse(init?.body as string) as (typeof writes)[number];
    writes.push(body);
    if (paused) await paused;
    if (conflict) {
      saved = { ...saved, settings: conflict };
      conflict = undefined;
      return Response.json({ error: 'view_settings_conflict' }, { status: 409 });
    }
    saved = { ...saved, settings: { ...body.settings, version: body.version + 1 } };
    return Response.json(saved.settings);
  });
  const mount = document.createElement('div');
  document.body.append(mount);
  const onAccessLost = vi.fn();
  const properties = {
    state,
    active: true,
    objects: new Map(state.objects.map((object) => [object.id, object])),
    relationships: new Map(),
    selection: { kind: 'object' as const, id: 'lamp' },
    disabled: false,
    settingsMount: mount,
    onSelect: () => {},
    onSelectRelationship: () => {},
    onFocus: () => {},
    onClear: () => {},
    onReset: () => {},
    onRemove: () => {},
  };
  function PersonalMap() {
    const personal = usePersonalView('/api/households/home/map', onAccessLost);
    return <SpatialMap {...properties} personal={personal} />;
  }
  const view = render(<PersonalMap />);
  await screen.findByRole('button', { name: 'Välj objekt: Lampan' });
  return {
    writes,
    read: () => structuredClone(saved),
    pause() {
      let release = () => {};
      paused = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        paused = undefined;
        release();
      };
    },
    conflict(settings: PersonalView['settings']) {
      conflict = settings;
    },
    close() {
      view.unmount();
      mount.remove();
    },
  };
}

test('all reference variants and visual weights save independently while the background is off', async () => {
  const preferences = await openPreferences();
  try {
    const variant = screen.getByRole('combobox', { name: 'Variant' }) as HTMLSelectElement;
    const weight = screen.getByRole('combobox', { name: 'Synlighet' }) as HTMLSelectElement;
    const visible = screen.getByRole('checkbox', { name: 'Alltid synlig' }) as HTMLInputElement;
    const original = preferences.read();
    const { version: _version, ...originalSettings } = original.settings;
    fireEvent.click(visible);
    await waitFor(() => expect(preferences.read().settings.zeroReferenceAlwaysVisible).toBe(true));
    for (const choice of ['square', 'oval', 'circle', 'lines']) {
      fireEvent.change(variant, { target: { value: choice } });
      await waitFor(() => expect(preferences.read().settings.zeroReferenceVariant).toBe(choice));
      for (const strength of ['original', 'prominent', 'subtle']) {
        weight.focus();
        fireEvent.change(weight, { target: { value: strength } });
        await waitFor(() => expect(preferences.read().settings.zeroReferenceWeight).toBe(strength));
        expect(variant.value).toBe(choice);
        expect(weight.value).toBe(strength);
        expect(visible.checked).toBe(true);
        expect(document.activeElement).toBe(weight);
        expect(preferences.read().settings).toMatchObject({
          background: false,
          zeroReferenceOnMovement: true,
          zeroReferenceTint: 23,
          zeroReferenceKeepSize: true,
        });
      }
    }
    expect(preferences.read().positions).toEqual(original.positions);
    expect(preferences.writes.at(-1)?.settings).toEqual({
      ...originalSettings,
      zeroReferenceVariant: 'lines',
      zeroReferenceAlwaysVisible: true,
    });
  } finally {
    preferences.close();
  }
});

test('pending reference saves preserve the selected controls and shared Navigation choice until the response completes', async () => {
  const preferences = await openPreferences();
  try {
    fireEvent.click(screen.getByRole('button', { name: 'Navigera' }));
    const variant = screen.getByRole('combobox', { name: 'Variant' }) as HTMLSelectElement;
    const weight = screen.getByRole('combobox', { name: 'Synlighet' }) as HTMLSelectElement;
    const visible = screen.getByRole('checkbox', { name: 'Alltid synlig' }) as HTMLInputElement;
    const navigation = screen.getByRole('checkbox', { name: 'Nollreferens' }) as HTMLInputElement;
    const original = preferences.read();
    const release = preferences.pause();
    fireEvent.change(variant, { target: { value: 'oval' } });
    await waitFor(() => expect(preferences.writes).toHaveLength(1));
    expect(variant.getAttribute('aria-disabled')).toBe('true');
    expect(weight.getAttribute('aria-disabled')).toBe('true');
    expect(visible.getAttribute('aria-disabled')).toBe('true');
    expect(navigation.getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(variant, { target: { value: 'square' } });
    fireEvent.change(weight, { target: { value: 'prominent' } });
    fireEvent.click(visible);
    fireEvent.click(navigation);
    expect(preferences.writes).toHaveLength(1);
    expect(variant.value).toBe('oval');
    expect(weight.value).toBe('subtle');
    expect(visible.checked).toBe(false);
    expect(navigation.checked).toBe(false);
    await act(async () => release());
    await waitFor(() => expect(variant.getAttribute('aria-disabled')).toBeNull());
    expect(preferences.read().settings.zeroReferenceVariant).toBe('oval');
    fireEvent.click(screen.getByRole('button', { name: 'Visa mininavigering' }));
    fireEvent.click(navigation);
    await waitFor(() => expect(preferences.read().settings.zeroReferenceAlwaysVisible).toBe(true));
    expect(visible.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Visa normal navigering' }));
    expect(navigation.checked).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Sidled (X)' }) as HTMLInputElement).value).toBe(
      '3.25',
    );
    expect(preferences.read().positions).toEqual(original.positions);
    expect(preferences.writes).toHaveLength(2);
  } finally {
    preferences.close();
  }
});

test('a rejected reference save restores the latest whole preference and uses its version for the next edit', async () => {
  const preferences = await openPreferences();
  try {
    const original = preferences.read();
    preferences.conflict({
      ...original.settings,
      zeroReferenceVariant: 'square',
      zeroReferenceWeight: 'prominent',
      zeroReferenceAlwaysVisible: true,
      version: 8,
    });
    const variant = screen.getByRole('combobox', { name: 'Variant' }) as HTMLSelectElement;
    const weight = screen.getByRole('combobox', { name: 'Synlighet' }) as HTMLSelectElement;
    fireEvent.change(weight, { target: { value: 'original' } });
    await screen.findAllByText(/Din äldre ändring sparades inte/);
    expect(variant.value).toBe('square');
    expect(weight.value).toBe('prominent');
    expect(
      (screen.getByRole('checkbox', { name: 'Alltid synlig' }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.change(variant, { target: { value: 'lines' } });
    await waitFor(() => expect(preferences.read().settings.version).toBe(9));
    expect(preferences.writes.at(-1)?.version).toBe(8);
    expect(preferences.read().settings).toEqual({
      ...original.settings,
      zeroReferenceVariant: 'lines',
      zeroReferenceWeight: 'prominent',
      zeroReferenceAlwaysVisible: true,
      version: 9,
    });
    expect(preferences.read().positions).toEqual(original.positions);
  } finally {
    preferences.close();
  }
});
