import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';
import type { MapSelection, TextAssistantView } from '../../src/shared/text-assistant.js';

const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [{ id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' }],
  relationshipTypes: [
    { id: 'uses', householdId: 'home', revision: 1, name: 'Använder', description: '' },
  ],
  objects: ['Lo', 'Kim'].map((name) => ({
    id: name.toLowerCase(),
    householdId: 'home',
    revision: 1,
    typeId: 'person',
    name,
    description: `${name}s påhittade uppgifter`,
  })),
  relationships: [
    {
      id: 'edge',
      householdId: 'home',
      revision: 1,
      sourceId: 'lo',
      targetId: 'kim',
      typeId: 'uses',
      knowledge: 'known',
    },
  ],
  draft: { version: 0, changes: [] },
};

async function open(width = 1280, height = 900, mapState = state) {
  await page.viewport(width, height);
  await expect.poll(() => innerWidth).toBe(width);
  await expect
    .poll(() => matchMedia('(min-width: 1100px) and (pointer: fine)').matches)
    .toBe(width >= 1100);
  let current: TextAssistantView = {
    id: 'conversation',
    revision: 0,
    phase: 'ready',
    operations: [],
    review: {
      ...state.draft,
      contentVersion: 1,
      readyToSave: false,
      conflicts: [],
      unresolvedIdentities: [],
      pendingOperations: [],
    },
  };
  let target: MapSelection = { kind: 'object', id: 'lo' };
  const acknowledgements: { displayed: boolean; kind: string; id: string }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: 1,
        positions: [],
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.includes('/map?')) return Response.json(mapState);
    if (url.endsWith('/text-assistant'))
      return Response.json(init?.method === 'POST' ? current : { available: true });
    if (url.endsWith('/messages')) {
      const revision = current.revision + 1;
      current = {
        ...current,
        revision,
        phase: 'working',
        displayedItem: undefined,
        selection: { ...target, revision, draftVersion: 0, contentVersion: 1 },
      };
    }
    if (url.endsWith('/selection')) {
      const body = JSON.parse(String(init?.body));
      acknowledgements.push(body);
      current = {
        ...current,
        phase: 'ready',
        selection: undefined,
        displayedItem: body.displayed ? target : undefined,
      };
    }
    if (url.endsWith('/cancel'))
      current = {
        ...current,
        revision: current.revision + 1,
        phase: 'ready',
        selection: undefined,
      };
    return Response.json(current);
  });
  render(
    <main>
      <HouseholdMap householdId="home" />
    </main>,
  );
  await page.getByLabelText(/Jag tillåter att OpenAI/).click();
  await page.getByLabelText(/Jag tillåter förslag och sparande/).click();
  await page.getByRole('button', { name: 'Starta textassistenten', exact: true }).click();
  await expect.element(page.getByLabelText('Meddelande till textassistenten')).toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Nytt objekt', exact: true }))
    .toBeEnabled();
  return {
    acknowledgements,
    async show(item: MapSelection) {
      target = item;
      await page.getByLabelText('Meddelande till textassistenten').fill('Visa urvalet.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('assistant display opens a hidden map and populated inspector before confirming the actual object and relationship', async () => {
  const app = await open();
  await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
  await app.show({ kind: 'object', id: 'lo' });
  await expect.poll(() => app.acknowledgements.length).toBe(1);
  expect(app.acknowledgements[0]).toMatchObject({ kind: 'object', id: 'lo', displayed: true });
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Lo', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(page.getByRole('region', { name: 'Val och redigering' }).element().textContent).toContain(
    'Los påhittade uppgifter',
  );
  await app.show({ kind: 'relationship', id: 'edge' });
  await expect.poll(() => app.acknowledgements.length).toBe(2);
  expect(app.acknowledgements[1]).toMatchObject({
    kind: 'relationship',
    id: 'edge',
    displayed: true,
  });
  const edge = document.querySelector('.spatial-edge.selected');
  expect(edge?.checkVisibility()).toBe(true);
  expect(document.querySelector('.map-inspector')?.getAttribute('data-selection-id')).toBe('edge');
});

test('a lost graphics context cannot be acknowledged, and canceling its pending reveal prevents a late confirmation', async () => {
  const app = await open();
  const canvas = document.querySelector('.spatial-surface canvas') as HTMLCanvasElement;
  const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
  expect(extension).toBeTruthy();
  extension?.loseContext();
  await expect.element(page.getByText(/Grafiken är tillfälligt avbruten/)).toBeVisible();
  await app.show({ kind: 'object', id: 'lo' });
  await expect
    .element(page.getByRole('button', { name: 'Avbryt uppdrag', exact: true }))
    .toBeVisible();
  expect(app.acknowledgements).toEqual([]);
  await page.getByRole('button', { name: 'Avbryt uppdrag', exact: true }).click();
  extension?.restoreContext();
  await expect.element(page.getByText(/Grafiken är tillfälligt avbruten/)).not.toBeInTheDocument();
  expect(app.acknowledgements).toEqual([]);
  await app.show({ kind: 'object', id: 'lo' });
  await expect.poll(() => app.acknowledgements.length).toBe(1);
  expect(app.acknowledgements[0].displayed).toBe(true);
});

test('an unavailable target is rejected without replacing the current inspector', async () => {
  const app = await open();
  await app.show({ kind: 'object', id: 'absent' });
  await expect.poll(() => app.acknowledgements.length).toBe(1);
  expect(app.acknowledgements[0]).toMatchObject({ id: 'absent', displayed: false });
  expect(document.querySelector('.map-inspector')?.getAttribute('data-selection-id')).toBeNull();
});

test('a hidden document never reports a visible map selection', async () => {
  const app = await open();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await app.show({ kind: 'object', id: 'lo' });
  await expect.poll(() => app.acknowledgements.length).toBe(1);
  expect(app.acknowledgements[0].displayed).toBe(false);
});

test('a panel covering the actual inspector prevents a successful display acknowledgement', async () => {
  const app = await open();
  const cover = document.createElement('style');
  cover.textContent = `
    .map-inspector { position: relative; }
    .map-inspector[data-selection-id]::after {
      content: ''; position: absolute; inset: 0; z-index: 100; background: white;
    }
  `;
  document.head.append(cover);
  try {
    await app.show({ kind: 'object', id: 'lo' });
    await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
    expect(app.acknowledgements[0].displayed).toBe(false);
  } finally {
    cover.remove();
  }
});

test('long phone details remain scrollable beside the visible selection and require explicit editing', async () => {
  const app = await open(390, 844, {
    ...state,
    objects: state.objects.map((object) => ({
      ...object,
      description: 'Påhittade uppgifter om hushållets objekt. '.repeat(40),
    })),
  });
  await app.show({ kind: 'object', id: 'lo' });
  await expect.poll(() => app.acknowledgements.length).toBe(1);
  expect(app.acknowledgements[0].displayed).toBe(true);
  const inspector = page.getByRole('region', { name: 'Val och redigering' }).element();
  expect(inspector.scrollHeight).toBeGreaterThan(inspector.clientHeight);
  expect(inspector.getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight);
  expect(inspector.querySelector('form')).toBeNull();
  await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
  await expect.element(page.getByLabelText('Objektets namn', { exact: true })).toHaveValue('Lo');
});
