import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, test } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import { SpatialMap } from '../../src/client/SpatialMap.js';
import '../../src/client/styles.css';
import '../../src/client/workspace.css';
import type { MapRevealRequest } from '../../src/client/map-display.js';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings, type PersonalView } from '../../src/shared/personal-view.js';

const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [
    { id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' },
    { id: 'own', householdId: 'home', revision: 1, name: 'Musiksak', description: '' },
  ],
  relationshipTypes: [
    {
      id: 'uses',
      householdId: 'home',
      revision: 1,
      name: 'Använder',
      description: '',
      forwardLabel: 'använder',
      reverseLabel: 'används av',
    },
  ],
  objects: [
    {
      id: 'lo',
      typeId: 'person',
      householdId: 'home',
      revision: 1,
      name: 'Lo Exempel',
    },
    {
      id: 'music',
      typeId: 'own',
      householdId: 'home',
      revision: 1,
      name: 'Musikspelaren',
    },
    {
      id: 'kim',
      typeId: 'person',
      householdId: 'home',
      revision: 1,
      name: 'Kim Exempel',
    },
  ],
  relationships: [
    {
      id: 'edge',
      householdId: 'home',
      revision: 1,
      typeId: 'uses',
      sourceId: 'lo',
      targetId: 'music',
    },
    {
      id: 'other',
      householdId: 'home',
      revision: 1,
      typeId: 'uses',
      sourceId: 'kim',
      targetId: 'music',
    },
  ],
  draft: { version: 0, changes: [] },
};

test('an own icon paints ahead of the type and remains the fallback for an unavailable profile image', async () => {
  const icons = structuredClone(state);
  icons.draft = { version: 0, changes: [] };
  icons.objects[0].iconId = 'bike';
  icons.objects[1].iconId = 'telescope';
  icons.objects[1].profileImageId = 'unavailable';
  render(<MapView mapState={icons} />);
  const cycle = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  const telescope = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
  await expect.poll(() => cycle.element().querySelector('[data-icon-id="bike"]')).not.toBeNull();
  await expect
    .poll(() => telescope.element().querySelector('[data-icon-id="telescope"]'))
    .not.toBeNull();
  expect(telescope.element().querySelector('img')).toBeNull();
});

state.draft.changes = state.objects.map((object, index) => ({
  id: object.id,
  before: index === 1 ? null : object,
  after: index === 2 ? null : object,
  type: state.types[object.typeId === 'person' ? 0 : 1],
}));
state.draft.relationships = state.relationships.map((edge, index) => ({
  id: edge.id,
  before: edge,
  after: index ? null : edge,
  type: state.relationshipTypes[0],
  objectNames: {},
}));

const selectionStatus = () => page.getByRole('status', { name: 'Kartans urval', exact: true });

function MapView({
  mapState = state,
  relationships = mapState.relationships,
  active = true,
  revealRequest,
  positions = [],
  theme = 'dark',
}: {
  mapState?: MapState;
  relationships?: MapState['relationships'];
  active?: boolean;
  revealRequest?: MapRevealRequest;
  positions?: PersonalView['positions'];
  theme?: 'light' | 'dark';
} = {}) {
  const [settingsMount, setSettingsMount] = useState<HTMLDivElement | null>(null);
  const [view, setView] = useState<PersonalView>({
    contentVersion: 1,
    positions,
    settings: { ...defaultViewSettings, background: false, version: 0 },
  });
  const [selection, setSelection] = useState<{
    kind: 'object' | 'relationship';
    id: string;
    previous?: boolean;
  } | null>(null);
  const [objects, setObjects] = useState(
    new Map(mapState.objects.map((object) => [object.id, object])),
  );
  const [message, setMessage] = useState('Ingen vald');
  return (
    <>
      <p role="status" aria-label="Kartans urval">
        {message}
      </p>
      <pre data-placement>{JSON.stringify(view.positions)}</pre>
      <SpatialMap
        theme={theme}
        settingsMount={settingsMount}
        personal={{
          view,
          pending: false,
          message: '',
          refresh: async () => {},
          move: async (id, position) =>
            setView((previous) => ({
              ...previous,
              contentVersion: 1,
              positions: [
                ...previous.positions.filter((item) => item.id !== id),
                { ...position, id, version: 1 },
              ],
            })),
          configure: async (settings) =>
            setView((previous) => ({ ...previous, settings: { ...settings, version: 1 } })),
        }}
        active={active}
        revealRequest={revealRequest}
        state={mapState}
        objects={objects}
        relationships={new Map(relationships.map((edge) => [edge.id, edge]))}
        selection={selection}
        disabled={false}
        onSelect={(object) => {
          setSelection({ kind: 'object', id: object.id });
          setMessage(object.name);
        }}
        onSelectRelationship={(edge, previous) => {
          setSelection({ kind: 'relationship', id: edge.id, previous });
          setMessage(previous ? `Tidigare: ${edge.sourceId}` : `Samband: ${edge.id}`);
        }}
        onFocus={(id) => {
          setSelection({ kind: 'object', id });
          setMessage(`Kopplingar för ${id}`);
        }}
        onReveal={(object) => {
          setSelection({ kind: 'object', id: object.id });
          setMessage(`Visar ${object.name} i kartan`);
        }}
        onRead={(object) => setMessage(`Uppgifter för ${object.name}`)}
        onRelationships={(object) => setMessage(`Samband för ${object.name}`)}
        onClear={() => {
          setSelection(null);
          setMessage('Hela rymden');
        }}
        onReset={() => {
          setSelection(null);
          setMessage('Översikt återställd');
        }}
        onRemove={(object) => {
          setObjects((previous) => {
            const next = new Map(previous);
            next.delete(object.id);
            return next;
          });
          setMessage('Borttagning föreslagen');
        }}
      />
      <div ref={setSettingsMount} />
    </>
  );
}

test('RYMD-13: relationship lines and object symbols retain overlap depth through movement and camera navigation', async ({
  onTestFinished,
}) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  onTestFinished(() => page.viewport(viewport.width, viewport.height));
  await page.viewport(1280, 1000);
  const map = render(
    <MapView
      mapState={{ ...state, draft: { version: 0, changes: [] } }}
      relationships={[state.relationships[0]]}
      positions={[
        { id: 'lo', x: -7.701, y: 0.797, z: 8.065, version: 1 },
        { id: 'music', x: 11.086, y: 0.797, z: 1.207, version: 1 },
        { id: 'kim', x: -1.693, y: -0.797, z: -4.636, version: 1 },
      ]}
    />,
  );
  const kim = page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
  await expect.element(kim).toBeVisible();
  const surface = document.querySelector('.spatial-surface') as HTMLElement;
  const lineVisibleOnKim = async (direction = 1) => {
    const surface = document.querySelector('.spatial-surface') as HTMLElement;
    const line = document.querySelector('line.connection') as SVGLineElement;
    const node = kim.element().getBoundingClientRect();
    const orb = kim.element().querySelector('.spatial-orb') as HTMLElement;
    const offset = direction * orb.getBoundingClientRect().width * 0.325;
    const box = surface.getBoundingClientRect();
    const x = node.left + node.width / 2 - box.left + offset;
    const x1 = Number(line.getAttribute('x1'));
    const y1 = Number(line.getAttribute('y1'));
    const x2 = Number(line.getAttribute('x2'));
    const y2 = Number(line.getAttribute('y2'));
    const y = y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
    expect(Math.hypot(offset, y - (node.top + node.height / 2 - box.top))).toBeLessThan(
      orb.getBoundingClientRect().width / 2 - 2,
    );
    const screenshot = await page.screenshot({ element: surface, base64: true });
    const picture = new Image();
    picture.src = `data:image/png;base64,${screenshot.base64}`;
    await picture.decode();
    const sample = document.createElement('canvas');
    sample.width = picture.width;
    sample.height = picture.height;
    const context = sample.getContext('2d');
    if (!context) throw new Error('Pixel sampling unavailable');
    context.drawImage(picture, 0, 0);
    // Sample a short vertical strip to tolerate stroke antialiasing.
    const pixels = context.getImageData(Math.round(x), Math.round(y) - 2, 1, 5).data;
    return Array.from({ length: 5 }, (_, index) => pixels[index * 4]).some((red) => red > 45);
  };
  expect(await lineVisibleOnKim()).toBe(true);
  // Check during the drag and again after the personal placement settles.
  const capture = surface.setPointerCapture;
  surface.setPointerCapture = () => {};
  const node = kim.element().getBoundingClientRect();
  const pointer = { pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientY: node.top + 22 };
  fireEvent.pointerDown(kim.element(), { ...pointer, clientX: node.left + 22 });
  fireEvent.pointerMove(surface, { ...pointer, clientX: node.left + 42 });
  expect(await lineVisibleOnKim()).toBe(true);
  fireEvent.pointerUp(surface, { ...pointer, buttons: 0, clientX: node.left + 42 });
  surface.setPointerCapture = capture;
  await expect.poll(() => document.querySelector('[data-placement]')?.textContent).toContain('kim');
  expect(await lineVisibleOnKim()).toBe(true);
  for (const name of ['Panorera vänster', 'Zooma in', 'Rotera vänster']) {
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    expect(await lineVisibleOnKim()).toBe(true);
  }
  map.unmount();
  const foreground = render(
    <MapView
      mapState={{ ...state, draft: { version: 0, changes: [] } }}
      relationships={[state.relationships[0]]}
      positions={[
        { id: 'lo', x: -7.701, y: 0.797, z: 8.065, version: 1 },
        { id: 'music', x: 11.086, y: 0.797, z: 1.207, version: 1 },
        { id: 'kim', x: 5.078, y: 2.39, z: 13.908, version: 1 },
      ]}
    />,
  );
  await expect.element(kim).toBeVisible();
  expect(await lineVisibleOnKim()).toBe(false);
  for (const name of ['Panorera vänster', 'Zooma in', 'Rotera vänster']) {
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    expect(await lineVisibleOnKim()).toBe(false);
  }
  foreground.unmount();
  render(
    <MapView
      mapState={{ ...state, draft: { version: 0, changes: [] } }}
      relationships={[state.relationships[0]]}
      positions={[
        { id: 'lo', x: -6.008, y: 1.593, z: 12.701, version: 1 },
        { id: 'music', x: 6.008, y: -1.593, z: -12.701, version: 1 },
        { id: 'kim', x: 0, y: 0, z: 0, version: 1 },
      ]}
    />,
  );
  await expect.element(kim).toBeVisible();
  expect(await lineVisibleOnKim(-1)).toBe(true);
  expect(await lineVisibleOnKim(1)).toBe(false);
});

test('RYMD-14: depth-scaled symbols, text and backgrounds preserve targets and foreground limits', async ({
  onTestFinished,
}) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  onTestFinished(() => page.viewport(viewport.width, viewport.height));
  for (const [width, height] of [
    [1280, 1000],
    [390, 844],
  ]) {
    await page.viewport(width, height);
    for (const theme of ['light', 'dark'] as const) {
      const map = render(
        <div className="household-map workspace-shell" data-theme={theme}>
          <MapView
            theme={theme}
            mapState={{ ...state, draft: { version: 0, changes: [] } }}
            relationships={[state.relationships[0]]}
            positions={[
              { id: 'lo', x: -6.008, y: 1.593, z: 12.701, version: 1 },
              { id: 'music', x: 6.008, y: -1.593, z: -12.701, version: 1 },
              { id: 'kim', x: 0, y: 0, z: 0, version: 1 },
            ]}
          />
        </div>,
      );
      const near = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
      const far = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
      const farName = page.getByRole('button', {
        name: 'Markera objekt: Musikspelaren',
        exact: true,
      });
      await expect.element(near).toBeVisible();
      await expect.element(farName).toBeVisible();
      const orbSize = (element: Element) =>
        (element.querySelector('.spatial-orb') as HTMLElement).getBoundingClientRect().width;
      await expect.poll(() => orbSize(near.element()) > orbSize(far.element())).toBe(true);
      const nameFont = (id: string) =>
        Number.parseFloat(
          getComputedStyle(
            document.querySelector(`[data-object-label="${id}"] .spatial-caption`) as Element,
          ).fontSize,
        );
      expect(nameFont('lo')).toBeGreaterThan(nameFont('music'));
      const farCard = farName.element().querySelector('.spatial-label-card') as HTMLElement;
      expect(farCard.getBoundingClientRect().height).toBeLessThan(
        farName.element().getBoundingClientRect().height,
      );
      const positions = () =>
        [...document.querySelectorAll<HTMLElement>('.spatial-node')].map((node) => [
          node.dataset.objectId,
          node.style.left,
          node.style.top,
        ]);
      const beforeSelection = positions();
      (farName.element() as HTMLElement).focus();
      await userEvent.keyboard('{Enter}');
      await expect.element(selectionStatus()).toHaveTextContent('Musikspelaren');
      expect(positions()).toEqual(beforeSelection);
      expect(farName.element().matches(':focus-visible')).toBe(true);
      const checkPresentation = () => {
        for (const node of document.querySelectorAll('.spatial-node')) {
          const bounds = node.getBoundingClientRect();
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          expect(getComputedStyle(node).backgroundColor).toBe('rgba(0, 0, 0, 0)');
          const orb = orbSize(node);
          expect(orb).toBeGreaterThanOrEqual(16.6);
          expect(orb).toBeLessThanOrEqual(39.2);
          const icon = (node.querySelector('svg') as SVGSVGElement).getBoundingClientRect().width;
          expect(icon / orb).toBeCloseTo(24 / 34, 2);
        }
        for (const label of document.querySelectorAll('.spatial-name, .spatial-edge')) {
          const bounds = label.getBoundingClientRect();
          expect(bounds.width).toBeGreaterThanOrEqual(44);
          expect(bounds.height).toBeGreaterThanOrEqual(44);
          expect(getComputedStyle(label).backgroundColor).toBe('rgba(0, 0, 0, 0)');
          const card = label.querySelector('.spatial-label-card') as HTMLElement;
          expect(getComputedStyle(card).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
          const font = Number.parseFloat(
            getComputedStyle(label.querySelector('.spatial-caption') as Element).fontSize,
          );
          expect(font).toBeLessThanOrEqual(label.classList.contains('spatial-name') ? 15 : 14);
        }
      };
      checkPresentation();
      await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
      await expect.poll(() => document.querySelectorAll('[data-object-label]').length).toBe(3);
      await page.getByRole('button', { name: 'Navigera', exact: true }).click();
      for (const command of ['Zooma in', 'Zooma in', 'Rotera vänster', 'Zooma ut']) {
        const beforeCommand = positions();
        await page.getByRole('button', { name: command, exact: true }).click();
        await expect.poll(() => positions()).not.toEqual(beforeCommand);
        checkPresentation();
        await expect.element(selectionStatus()).toHaveTextContent('Musikspelaren');
      }
      expect(document.querySelector('[data-placement]')?.textContent).toContain('12.701');
      map.unmount();
    }
  }
});

test('the approved spatial presentation uses compact pictogram nodes, separate names and contextual relationship labels', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  const button = lo.element();
  const bounds = button.getBoundingClientRect();
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.width).toBeLessThanOrEqual(48);
  expect(bounds.height).toBe(bounds.width);
  expect(button.querySelector('svg path, svg circle')).not.toBeNull();
  const name = page.getByText('Lo Exempel', { exact: true }).element();
  expect(button.contains(name)).toBe(false);
  const nameBounds = name.getBoundingClientRect();
  expect(
    nameBounds.top >= bounds.bottom ||
      nameBounds.bottom <= bounds.top ||
      nameBounds.left >= bounds.right ||
      nameBounds.right <= bounds.left,
  ).toBe(true);
  expect(document.querySelectorAll('.spatial-edge')).toHaveLength(2);
  const hit = document.querySelector('.connection-hit');
  expect(hit).not.toBeNull();
  expect(Number.parseFloat(getComputedStyle(hit as Element).strokeWidth)).toBeGreaterThanOrEqual(
    18,
  );
  await lo.click();
  await expect
    .element(
      page.getByRole('button', {
        name: 'Välj samband: Lo Exempel → använder → Musikspelaren',
        exact: true,
      }),
    )
    .toBeVisible();
  await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
  await expect.poll(() => document.querySelectorAll('.spatial-edge').length).toBe(2);
});

test('an explicit reveal opens an inactive scene and brings requested objects into its viewport', async () => {
  const view = render(<MapView active={false} />);
  view.rerender(<MapView revealRequest={{ id: 'show-music', objectIds: ['music'] }} />);
  const surface = document.querySelector('.spatial-surface') as HTMLElement;
  await expect.poll(() => surface.dataset.revealRequest).toBe('show-music');
  const music = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
  const inside = () => {
    const a = surface.getBoundingClientRect();
    const b = music.element().getBoundingClientRect();
    return b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
  };
  await expect.poll(inside).toBe(true);
  view.rerender(
    <MapView revealRequest={{ id: 'show-music', objectIds: ['music'], complete: true }} />,
  );
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  for (let index = 0; index < 10; index++)
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
  expect(inside()).toBe(false);
  view.rerender(<MapView revealRequest={{ id: 'show-music-again', objectIds: ['music'] }} />);
  await expect.poll(() => surface.dataset.revealRequest).toBe('show-music-again');
  await expect.poll(inside).toBe(true);
  expect(document.querySelector('[data-placement]')?.textContent).toBe('[]');
});

test('a pending reveal reframes when an obstructing panel grows after the first fit', async () => {
  const view = render(
    <div className="household-map">
      <div
        className="workspace-context"
        style={{ position: 'fixed', left: 0, height: 0, padding: 0, zIndex: 40 }}
      />
      <MapView revealRequest={{ id: 'pending-music', objectIds: ['music'] }} />
    </div>,
  );
  const surface = document.querySelector('.spatial-surface') as HTMLElement;
  await expect.poll(() => surface.dataset.revealRequest).toBe('pending-music');
  const music = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
  const panel = view.container.querySelector('.workspace-context') as HTMLElement;
  const bounds = surface.getBoundingClientRect();
  const target = music.element().getBoundingClientRect();
  panel.style.top = `${bounds.top}px`;
  panel.style.width = `${bounds.width}px`;
  panel.style.maxWidth = 'none';
  panel.style.height = `${target.bottom - bounds.top + 12}px`;
  await expect
    .poll(() => {
      const box = music.element().getBoundingClientRect();
      return (
        box.top >= panel.getBoundingClientRect().bottom &&
        box.bottom <= surface.getBoundingClientRect().bottom &&
        music
          .element()
          .contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
      );
    })
    .toBe(true);
});

test('a relationship reveal keeps both endpoints reachable beside a wide legend on a phone map', async () => {
  const content = (revealRequest?: MapRevealRequest) => (
    <div className="household-map" style={{ position: 'fixed', inset: 0 }}>
      <div
        className="map-object-search"
        style={{
          position: 'absolute',
          left: 14,
          top: 0,
          width: 362,
          height: 44,
          transform: 'none',
        }}
      />
      <div
        className="workspace-context"
        style={{
          position: 'absolute',
          left: 18,
          top: 56,
          width: 222,
          height: 94,
          maxWidth: 'none',
        }}
      />
      <MapView active={Boolean(revealRequest)} revealRequest={revealRequest} />
    </div>
  );
  const view = render(content());
  const surface = document.querySelector('.spatial-surface') as HTMLElement;
  Object.assign(surface.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '390px',
    height: '235px',
    minHeight: '0',
  });
  for (const control of view.container.querySelectorAll<HTMLElement>(
    '.spatial-tools, .spatial-view-actions',
  ))
    control.style.display = 'none';
  view.rerender(
    content({ id: 'phone-relationship', objectIds: ['lo', 'music'], relationshipId: 'edge' }),
  );
  await expect.poll(() => surface.dataset.revealRequest).toBe('phone-relationship');
  await expect
    .poll(() =>
      ['lo', 'music'].every((id) => {
        const node = surface.querySelector(`.spatial-node[data-object-id="${id}"]`);
        if (!node) return false;
        const box = node.getBoundingClientRect();
        const bounds = surface.getBoundingClientRect();
        return (
          box.left >= bounds.left &&
          box.right <= bounds.right &&
          box.top >= bounds.top &&
          box.bottom <= bounds.bottom &&
          node.contains(
            document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2),
          )
        );
      }),
    )
    .toBe(true);
});

test('changing a relationship retains its prior route while the current route remains selectable', async () => {
  const before = state.relationships[0];
  const after = { ...before, sourceId: 'kim' };
  render(
    <MapView
      mapState={{
        ...state,
        relationships: [before],
        draft: {
          version: 1,
          changes: [],
          relationships: [
            { id: before.id, before, after, type: state.relationshipTypes[0], objectNames: {} },
          ],
        },
      }}
      relationships={[after]}
    />,
  );
  await expect
    .element(
      page.getByRole('button', {
        name: 'Välj samband: Kim Exempel → använder → Musikspelaren',
        exact: true,
      }),
    )
    .toHaveTextContent('+ → använder');
  expect(document.querySelector('.connection.added')).not.toBeNull();
  const previous = document.querySelector('[data-previous-relationship="edge"]');
  expect(previous).not.toBeNull();
  expect(previous?.textContent).toContain('Lo Exempel → använder → Musikspelaren');
  expect(previous?.getAttribute('d')).toContain('Q');
  expect(getComputedStyle(previous as Element).strokeDasharray).not.toBe('none');
  await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
  const priorLabel = page.getByRole('button', {
    name: 'Välj tidigare samband: Lo Exempel → använder → Musikspelaren',
    exact: true,
  });
  await expect.element(priorLabel).toHaveTextContent('× → använder');
  await priorLabel.click();
  await expect.element(selectionStatus()).toHaveTextContent('Tidigare: lo');
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Kim Exempel → använder → Musikspelaren',
      exact: true,
    })
    .click();
  await expect.element(selectionStatus()).toHaveTextContent('Samband: edge');
});

test.each([
  { name: 'type', update: { typeId: 'other' } },
  {
    name: 'property',
    update: {
      properties: [{ id: 'note', label: 'Anteckning', kind: 'text' as const, value: 'Ny uppgift' }],
    },
  },
])(
  'a same-endpoint $name edit uses one amber solid connection and a default pen label',
  async ({ update }) => {
    const before = state.relationships[0];
    const after = { ...before, ...update };
    render(
      <MapView
        mapState={{
          ...state,
          relationshipTypes: [
            ...state.relationshipTypes,
            { ...state.relationshipTypes[0], id: 'other', forwardLabel: 'lånar' },
          ],
          relationships: [before],
          draft: {
            version: 1,
            changes: [],
            relationships: [
              { id: before.id, before, after, type: state.relationshipTypes[0], objectNames: {} },
            ],
          },
        }}
        relationships={[after]}
      />,
    );
    const connection = document.querySelector('.connection.changed');
    expect(connection).not.toBeNull();
    expect(document.querySelector('[data-previous-relationship]')).toBeNull();
    expect(getComputedStyle(connection as Element).strokeDasharray).toBe('none');
    await expect
      .poll(() => document.querySelector('.spatial-edge.changed')?.textContent)
      .toContain('✎');
    for (const connector of document.querySelectorAll('.label-leader'))
      expect(connector.getAttribute('stroke-dasharray')).toBe('1 4');
  },
);

test('reversing directed endpoints shows a red old connection and green new connection without changing identity', async () => {
  const before = state.relationships[0];
  const after = { ...before, sourceId: 'music', targetId: 'lo' };
  render(
    <MapView
      mapState={{
        ...state,
        relationships: [before],
        draft: {
          version: 1,
          changes: [],
          relationships: [
            { id: before.id, before, after, type: state.relationshipTypes[0], objectNames: {} },
          ],
        },
      }}
      relationships={[after]}
    />,
  );
  const old = page.getByRole('button', {
    name: 'Välj tidigare samband: Lo Exempel → använder → Musikspelaren',
    exact: true,
  });
  const current = page.getByRole('button', {
    name: 'Välj samband: Musikspelaren → använder → Lo Exempel',
    exact: true,
  });
  await expect.element(old).toHaveTextContent('× → använder');
  await expect.element(current).toHaveTextContent('+ → använder');
  expect(document.querySelectorAll('.connection.added')).toHaveLength(1);
  expect(document.querySelectorAll('.connection.removed')).toHaveLength(1);
  await old.click();
  await expect.element(selectionStatus()).toHaveTextContent('Tidigare: lo');
  await current.click();
  await expect.element(selectionStatus()).toHaveTextContent('Samband: edge');
});

test('navigation keeps height help beside movement controls and respects the manual choice', async () => {
  render(<MapView />);
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
  const help = navigation.getByLabelText('Visa höjdhjälp', { exact: true });
  await expect.element(help).toBeDisabled();
  await expect
    .element(navigation.getByText('Välj ett objekt för att visa höjdhjälp', { exact: true }))
    .toBeVisible();
  await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await expect.element(help).toBeEnabled();
  const up = navigation.getByRole('button', { name: /^Flytta .+: uppåt$/ });
  await up.click();
  await expect.element(help).not.toBeChecked();
  await expect.element(page.getByText('Höjdflyttning · personlig vy')).not.toBeInTheDocument();
  await help.click();
  await up.click();
  await up.click();
  await expect.element(page.getByText('↑ 3 steg högre än start', { exact: true })).toBeVisible();
  await help.click();
  await up.click();
  await expect.element(help).not.toBeChecked();
  await help.click();
  await navigation.getByRole('button', { name: 'Visa mininavigering', exact: true }).click();
  await expect.element(help).toBeVisible();
  await expect.element(navigation.getByText('Visa höjdhjälp', { exact: true })).toBeVisible();
  await expect.element(help).toBeChecked();
  await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await expect.element(help).toBeChecked();
  await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true }).click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await expect.element(help).toBeChecked();
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  await expect.element(help).toBeDisabled();
  await expect.element(help).toBeChecked();
});

test('height movement keeps the preview plane fixed during a drag and prepares the next reference', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await lo.click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByLabelText('Visa höjdhjälp', { exact: true }).click();
  await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await userEvent.keyboard('{Shift>}');
  await expect.element(page.getByText('Startläge', { exact: true })).toBeVisible();
  const session = cdp();
  const plane = () => document.querySelector('.spatial-height-guide > path')?.getAttribute('d');
  for (let drag = 0; drag < 2; drag++) {
    const preview = plane();
    expect(preview).toBeTruthy();
    const rect = lo.element().getBoundingClientRect();
    const offset = window.frameElement?.getBoundingClientRect();
    const start = {
      x: rect.x + rect.width / 2 + (offset?.x ?? 0),
      y: rect.y + rect.height / 2 + (offset?.y ?? 0),
    };
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...start,
      button: 'left',
      buttons: 1,
      modifiers: 8,
      clickCount: 1,
    });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: start.x,
      y: start.y - 24,
      button: 'left',
      buttons: 1,
      modifiers: 8,
    });
    await expect.element(page.getByText(/^↑ .* steg högre än start$/)).toBeVisible();
    expect(plane()).toBe(preview);
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: start.x,
      y: start.y - 24,
      button: 'left',
      buttons: 0,
      modifiers: 8,
      clickCount: 1,
    });
    await expect.element(page.getByText('Startläge', { exact: true })).toBeVisible();
  }
  await userEvent.keyboard('{/Shift}');
  await expect.element(page.getByText(/^↑ .* steg högre än start$/)).toBeVisible();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByRole('button', { name: /^Flytta .+: nedåt$/ }).click();
  await expect.element(page.getByText('↓ 1 steg lägre än start', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Flytta .+: nedåt$/ }).click();
  await expect.element(page.getByText('↓ 2 steg lägre än start', { exact: true })).toBeVisible();
});

test('personal placement buttons move the selected object in three dimensions without editing household facts', async () => {
  render(<MapView />);
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await userEvent.keyboard('{Shift>}');
  await expect.element(page.getByText('Startläge', { exact: true })).toBeVisible();
  await userEvent.keyboard('{/Shift}');
  await expect.element(page.getByText('Startläge', { exact: true })).not.toBeInTheDocument();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByLabelText('Visa höjdhjälp', { exact: true }).click();
  await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
  await expect.element(page.getByLabelText('Visa höjdhjälp', { exact: true })).toBeChecked();
  await expect.element(page.getByText('↑ 1 steg högre än start', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByLabelText('Visa höjdhjälp', { exact: true }).click();
  await page.getByLabelText('Visa höjdhjälp', { exact: true }).click();
  await expect.element(page.getByText('↑ 1 steg högre än start', { exact: true })).toBeVisible();
  const first = JSON.parse(document.querySelector('[data-placement]')?.textContent ?? '[]');
  expect(first).toHaveLength(1);
  await page.getByRole('button', { name: /^Flytta .+: nedåt$/ }).click();
  const second = JSON.parse(document.querySelector('[data-placement]')?.textContent ?? '[]');
  expect(second[0].y).toBeCloseTo(first[0].y - 1);
  expect(second[0].x).toBe(first[0].x);
  expect(second[0].z).toBe(first[0].z);
});

// CDP dispatches native touch events directly. Touch device emulation would also
// change pointer media queries in the shared runner page after this file finishes.
test('native touch height gestures retain either release order and wait for all fingers before another move', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  const session = cdp();
  const location = () => {
    const rect = lo.element().getBoundingClientRect();
    const offset = window.frameElement?.getBoundingClientRect();
    return {
      x: rect.x + rect.width / 2 + (offset?.x ?? 0),
      y: rect.y + rect.height / 2 + (offset?.y ?? 0),
    };
  };
  const send = (
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    points: { id: number; x: number; y: number }[],
  ) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const positions = () =>
    JSON.parse(document.querySelector('[data-placement]')?.textContent ?? '[]');
  let start = location();
  await send('touchStart', [{ id: 1, ...start }]);
  await send('touchMove', [{ id: 1, x: start.x + 30, y: start.y + 20 }]);
  await send('touchEnd', []);
  await expect.poll(() => positions().length).toBe(1);
  const before = positions()[0];
  start = location();
  const second = { id: 2, x: start.x + 100, y: start.y };
  await send('touchStart', [{ id: 1, ...start }]);
  await send('touchStart', [{ id: 1, ...start }, second]);
  await send('touchMove', [{ id: 1, x: start.x, y: start.y - 35 }, second]);
  await expect.element(page.getByText('Höjdflyttning · personlig vy')).toBeVisible();
  await expect.element(page.getByText('Hjälpplan', { exact: true })).toBeVisible();
  await expect.element(page.getByText(/^↑ .* steg högre än start$/, { exact: true })).toBeVisible();
  await send('touchEnd', [second]);
  await send('touchEnd', []);
  await expect.poll(() => positions()[0].y).toBeGreaterThan(before.y);
  expect(positions()[0].x).toBe(before.x);
  expect(positions()[0].z).toBe(before.z);
  for (const released of [1, 2]) {
    start = location();
    const driver = { id: 1, ...start };
    const anchor = { id: 2, x: start.x + 100, y: start.y };
    const extra = { id: 3, x: start.x + 130, y: start.y };
    const beforeHeight = positions()[0];
    await send('touchStart', [driver]);
    await send('touchStart', [driver, anchor]);
    await send('touchStart', [driver, anchor, extra]);
    const raised = { ...driver, y: start.y - 30 };
    await send('touchMove', [raised, anchor, extra]);
    await send('touchEnd', [released === 1 ? raised : anchor]);
    await expect.poll(() => positions()[0].y).toBeGreaterThan(beforeHeight.y);
    expect(positions()[0].x).toBe(beforeHeight.x);
    expect(positions()[0].z).toBe(beforeHeight.z);
    const completed = positions();
    const remaining = released === 1 ? anchor : raised;
    const bounds = lo.element().getBoundingClientRect();
    await send('touchMove', [{ ...remaining, x: remaining.x + 40 }, extra]);
    expect(positions()).toEqual(completed);
    expect(lo.element().getBoundingClientRect().x).toBeCloseTo(bounds.x);
    expect(lo.element().getBoundingClientRect().y).toBeCloseTo(bounds.y);
    await send('touchEnd', []);
  }
  const saved = positions();
  start = location();
  await send('touchStart', [{ id: 1, ...start }]);
  await send('touchMove', [{ id: 1, x: start.x + 30, y: start.y }]);
  await send('touchCancel', []);
  expect(positions()).toEqual(saved);
});

test('a moving height anchor restores the object and hands the stable pair to pan and pinch', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  const music = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
  await expect.element(lo).toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Återställ vy', exact: true }))
    .toHaveAttribute('aria-disabled', 'true');
  const initial = lo.element().getBoundingClientRect();
  const musicInitial = music.element().getBoundingClientRect();
  const offset = window.frameElement?.getBoundingClientRect();
  const driver = {
    id: 1,
    x: initial.x + initial.width / 2 + (offset?.x ?? 0),
    y: initial.y + initial.height / 2 + (offset?.y ?? 0),
  };
  const anchor = { id: 2, x: driver.x + 100, y: driver.y };
  const session = cdp();
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: { id: number; x: number; y: number }[],
  ) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [driver]);
  await touch('touchMove', [{ ...driver, x: driver.x + 20 }]);
  driver.x += 20;
  await touch('touchStart', [driver, anchor]);
  driver.y -= 25;
  await touch('touchMove', [driver, anchor]);
  anchor.y += 30;
  await touch('touchMove', [driver, anchor]);
  await expect.poll(() => lo.element().getBoundingClientRect().x).toBeCloseTo(initial.x, 1);
  await expect.poll(() => lo.element().getBoundingClientRect().y).toBeCloseTo(initial.y, 1);
  expect(music.element().getBoundingClientRect().x).toBeCloseTo(musicInitial.x, 1);
  driver.x += 30;
  anchor.x += 30;
  await touch('touchMove', [driver, anchor]);
  await expect
    .poll(() => music.element().getBoundingClientRect().x)
    .not.toBeCloseTo(musicInitial.x, 1);
  const distance = () =>
    Math.hypot(
      lo.element().getBoundingClientRect().x - music.element().getBoundingClientRect().x,
      lo.element().getBoundingClientRect().y - music.element().getBoundingClientRect().y,
    );
  const beforePinch = distance();
  driver.x -= 30;
  anchor.x += 30;
  await touch('touchMove', [driver, anchor]);
  await expect.poll(distance).toBeGreaterThan(beforePinch);
  await touch('touchEnd', [anchor]);
  const stopped = lo.element().getBoundingClientRect();
  await touch('touchMove', [{ ...driver, y: driver.y + 30 }]);
  expect(lo.element().getBoundingClientRect().y).toBeCloseTo(stopped.y);
  await touch('touchEnd', []);
  expect(document.querySelector('[data-placement]')?.textContent).toBe('[]');
});

test('personal display controls retain corner choices, independent pan inversions and all movement alternatives', async () => {
  render(<MapView />);
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByText('Ordna min vy', { exact: true }).click();
  await page.getByLabelText('Visa axlar hela tiden', { exact: true }).click();
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) {
    await page.getByLabelText('Axelvisarens hörn', { exact: true }).selectOptions(corner);
    await expect
      .element(page.getByRole('img', { name: 'Rummets axlar: sidled X, höjd Y, djup Z' }))
      .toHaveClass(new RegExp(corner));
  }
  for (const label of ['Vänd panorering i sidled', 'Vänd panorering i höjdled']) {
    await page.getByLabelText(label, { exact: true }).click();
    await expect.element(page.getByLabelText(label, { exact: true })).toBeChecked();
  }
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByLabelText('Visa bakgrund', { exact: true }).click();
  await expect.element(page.getByLabelText('Visa bakgrund', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  for (const label of ['vänster', 'höger', 'uppåt', 'nedåt', 'bakåt', 'framåt'])
    await page.getByRole('button', { name: `Flytta Lo Exempel: ${label}`, exact: true }).click();
  for (const label of ['Panorera vänster', 'Panorera höger', 'Panorera uppåt', 'Panorera nedåt'])
    await page.getByRole('button', { name: label, exact: true }).click();
});

test('wheel pan follows both system axes over canvas, icons and labels; Ctrl alone zooms', async () => {
  // Put every object at the initial camera target's depth, where a pixel pan
  // projects to exactly one pixel despite the overview's yaw and pitch.
  const positions = [
    { id: 'lo', x: -4, y: 0, z: 4 * Math.tan(0.35), version: 1 },
    { id: 'music', x: 4, y: 0, z: -4 * Math.tan(0.35), version: 1 },
    { id: 'kim', x: 0, y: 4, z: (-4 * Math.tan(0.16)) / Math.cos(0.35), version: 1 },
  ];
  render(<MapView positions={positions} />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  await expect
    .element(page.getByRole('button', { name: 'Återställ vy', exact: true }))
    .toHaveAttribute('aria-disabled', 'true');
  const position = () => {
    const bounds = lo.element().getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  };
  const music = page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true });
  const separation = () => {
    const a = position();
    const b = music.element().getBoundingClientRect();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  for (const target of [
    canvas,
    lo.element(),
    page.getByText('Lo Exempel', { exact: true }).element(),
  ]) {
    const before = position();
    const distance = separation();
    const wheel = new WheelEvent('wheel', { deltaY: 20, bubbles: true, cancelable: true });
    target.dispatchEvent(wheel);
    await expect.poll(() => position().y).toBeCloseTo(before.y - 20, 0);
    expect(position().x).toBeCloseTo(before.x, 0);
    expect(separation()).toBeCloseTo(distance, 0);
    expect(wheel.defaultPrevented).toBe(true);
  }
  const before = position();
  canvas.dispatchEvent(
    new WheelEvent('wheel', { deltaX: 2, deltaY: 1, deltaMode: 1, bubbles: true }),
  );
  await expect.poll(() => position().x).toBeCloseTo(before.x - 32, 0);
  expect(position().y).toBeCloseTo(before.y - 16, 0);
  const pageScroll = position();
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 0.01, deltaMode: 2, bubbles: true }));
  await expect.poll(() => position().y).toBeCloseTo(pageScroll.y - canvas.clientHeight * 0.01, 0);
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByText('Ordna min vy', { exact: true }).click();
  await page.getByLabelText('Vänd panorering i höjdled', { exact: true }).click();
  const inverted = position();
  lo.element().dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: 20, bubbles: true }));
  await expect.poll(() => position().y).toBeCloseTo(inverted.y + 20, 0);
  expect(position().x).toBeCloseTo(inverted.x - 10, 0);
  await page.getByLabelText('Vänd panorering i sidled', { exact: true }).click();
  const bothInverted = position();
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaX: 10, deltaY: 20, bubbles: true }));
  await expect.poll(() => position().x).toBeCloseTo(bothInverted.x + 10, 0);
  expect(position().y).toBeCloseTo(bothInverted.y + 20, 0);
  const distance = separation();
  const pinch = new WheelEvent('wheel', {
    deltaY: -30,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  lo.element().dispatchEvent(pinch);
  await expect.poll(separation).toBeGreaterThan(distance);
  expect(pinch.defaultPrevented).toBe(true);
  expect(JSON.parse(document.querySelector('[data-placement]')?.textContent ?? 'null')).toEqual(
    positions,
  );
});

test('native empty-space mouse, wheel and touch navigation changes the camera without moving objects', async () => {
  render(<MapView />);
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }))
    .toBeVisible();
  const session = cdp();
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('Visible map required');
  const rect = canvas.getBoundingClientRect();
  const offset = window.frameElement?.getBoundingClientRect();
  const start = { x: rect.x + 15 + (offset?.x ?? 0), y: rect.y + 15 + (offset?.y ?? 0) };
  const line = () => document.querySelector('line[data-object-id="lo"]')?.getAttribute('x1');
  const before = line();
  for (const [button, buttons, modifiers] of [
    ['left', 1, 0],
    ['right', 2, 0],
    ['left', 1, 8],
  ] as const) {
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...start,
      button,
      buttons,
      modifiers,
      clickCount: 1,
    });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: start.x + 30,
      y: start.y + 15,
      button,
      buttons,
      modifiers,
    });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: start.x + 30,
      y: start.y + 15,
      button,
      buttons: 0,
      modifiers,
      clickCount: 1,
    });
  }
  expect(line()).not.toBe(before);
  for (const [deltaX, deltaY, modifiers] of [
    [0, 20, 0],
    [10, 20, 0],
    [0, 15, 8],
    [0, -20, 2],
  ]) {
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      ...start,
      deltaX,
      deltaY,
      modifiers,
    });
  }
  const touch = (
    type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
    touchPoints: { id: number; x: number; y: number }[],
  ) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
  await touch('touchStart', [{ id: 1, ...start }]);
  await touch('touchMove', [{ id: 1, x: start.x + 20, y: start.y + 10 }]);
  await touch('touchStart', [
    { id: 1, x: start.x + 20, y: start.y + 10 },
    { id: 2, x: start.x + 110, y: start.y + 10 },
  ]);
  await touch('touchMove', [
    { id: 1, x: start.x + 30, y: start.y + 20 },
    { id: 2, x: start.x + 145, y: start.y + 20 },
  ]);
  await touch('touchStart', [
    { id: 1, x: start.x + 30, y: start.y + 20 },
    { id: 2, x: start.x + 145, y: start.y + 20 },
    { id: 3, x: start.x + 170, y: start.y + 20 },
  ]);
  await touch('touchMove', [
    { id: 1, x: start.x + 35, y: start.y + 20 },
    { id: 2, x: start.x + 145, y: start.y + 20 },
    { id: 3, x: start.x + 170, y: start.y + 20 },
  ]);
  await touch('touchCancel', []);
  expect(document.querySelector('[data-placement]')?.textContent).toBe('[]');
  window.dispatchEvent(new Event('blur'));
});

test('painted stars respond to panning, rotation and zoom while object movement leaves the distant sky fixed', async () => {
  render(<MapView relationships={[]} />);
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await page.getByLabelText('Visa bakgrund', { exact: true }).click();
  await page.getByLabelText('Bakgrund i mörkt tema', { exact: true }).selectOptions('mist');
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  const starPixels = async () => {
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Visible map required');
    const screenshot = await page.screenshot({ element: canvas, base64: true });
    const picture = new Image();
    picture.src = `data:image/png;base64,${screenshot.base64}`;
    await picture.decode();
    const sample = document.createElement('canvas');
    sample.width = picture.width;
    sample.height = picture.height;
    const context = sample.getContext('2d');
    if (!context) throw new Error('Pixel sampling unavailable');
    context.drawImage(picture, 0, 0);
    const { data } = context.getImageData(0, 0, sample.width, sample.height);
    const bounds = canvas.getBoundingClientRect();
    const overlays = [
      ...document.querySelectorAll(
        '.spatial-labels > *, .spatial-node, .spatial-axis, .spatial-view-actions, .map-navigation',
      ),
    ].map((element) => element.getBoundingClientRect());
    const visible = (pixel: number) => {
      const x = bounds.x + (pixel % sample.width);
      const y = bounds.y + Math.floor(pixel / sample.width);
      return !overlays.some(
        (overlay) =>
          x >= overlay.left - 6 &&
          x <= overlay.right + 6 &&
          y >= overlay.top - 6 &&
          y <= overlay.bottom + 6,
      );
    };
    const pixels = new Set<number>();
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 2] > 130 && data[index + 2] > data[index] * 1.04 && visible(index / 4))
        pixels.add(index / 4);
    }
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    return { pixels, visible };
  };
  const common = (
    a: Awaited<ReturnType<typeof starPixels>>,
    b: Awaited<ReturnType<typeof starPixels>>,
  ) => {
    const visible = [...a.pixels].filter(b.visible);
    return visible.filter((pixel) => b.pixels.has(pixel)).length / visible.length;
  };
  const original = await starPixels();
  expect(original.pixels.size).toBeGreaterThan(15);
  await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
  const panned = await starPixels();
  expect(common(original, panned)).toBeLessThan(0.3);
  await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  expect(common(panned, await starPixels())).toBeGreaterThan(0.85);
  await page.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
  const rotated = await starPixels();
  expect(common(panned, rotated)).toBeLessThan(0.3);
  await page.getByRole('button', { name: 'Zooma in', exact: true }).click();
  expect(common(rotated, await starPixels())).toBeLessThan(0.3);
});

afterEach(cleanup);

test('navigation title movement, resize and cancellation preserve the camera and button focus', async ({
  onTestFinished,
}) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  onTestFinished(() => page.viewport(viewport.width, viewport.height));
  await page.viewport(1280, 1000);
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await lo.click();
  const projected = (lo.element() as HTMLElement).style.cssText;
  const trigger = page.getByRole('button', { name: 'Navigera', exact: true });
  await trigger.click();
  const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
  const handle = navigation.getByRole('group', { name: 'Navigation', exact: true });
  const bounds = () => navigation.element().getBoundingClientRect().toJSON();
  await expect.element(handle).toHaveFocus();
  const initial = bounds();
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}{ArrowDown}');
  expect(bounds().x).toBe(initial.x - 40);
  expect(bounds().y).toBe(initial.y + 12);
  const moved = bounds();
  await userEvent.keyboard('{Control>}{ArrowRight}{/Control}a');
  expect(bounds()).toEqual(moved);
  const minimize = navigation.getByRole('button', { name: 'Visa mininavigering', exact: true });
  await minimize.click();
  await expect
    .element(navigation.getByRole('button', { name: 'Visa normal navigering', exact: true }))
    .toHaveFocus();
  await userEvent.keyboard('{ArrowLeft}');
  expect(bounds().x).toBe(moved.x);
  await navigation.getByRole('button', { name: 'Visa normal navigering', exact: true }).click();
  const session = cdp();
  const drag = async (dx: number, dy: number) => {
    const title = handle.element().getBoundingClientRect();
    const frame = window.frameElement?.getBoundingClientRect();
    const x = title.x + title.width / 2 + (frame?.x ?? 0);
    const y = title.y + title.height / 2 + (frame?.y ?? 0);
    await session.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x,
      y,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    });
    await session.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: x + dx,
      y: y + dy,
      button: 'left',
      buttons: 1,
    });
    return { x: x + dx, y: y + dy };
  };
  const release = (point: { x: number; y: number }) =>
    session.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...point,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    });
  await release(await drag(-2, 0));
  expect(bounds()).toEqual(moved);
  const cancelled = await drag(-60, 50);
  await expect.poll(() => bounds().x).toBe(moved.x - 60);
  window.dispatchEvent(new Event('blur'));
  await expect.poll(bounds).toEqual(moved);
  await release(cancelled);
  await release(await drag(-80, 30));
  await expect.poll(() => bounds().x).toBe(moved.x - 80);
  expect(bounds().y).toBe(moved.y + 30);
  expect((lo.element() as HTMLElement).style.cssText).toBe(projected);
  await page.viewport(390, 500);
  await expect.poll(() => bounds().right <= 378 && bounds().y >= 12).toBe(true);
  await handle.element().focus();
  await userEvent.keyboard('{Escape}');
  await expect.element(navigation).not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

test('standalone focus controls keep direct neighbors separate from the selected rotation center', async () => {
  render(<MapView />);
  const focus = page.getByRole('button', { name: 'Fokusera markering', exact: true });
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  lo.element().focus();
  await userEvent.keyboard('{Shift>}{F10}{/Shift}');
  await expect.element(focus).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  await lo.click();
  lo.element().focus();
  await userEvent.keyboard('{Shift>}{F10}{/Shift}');
  await focus.click();
  await expect.element(lo).toHaveAttribute('aria-pressed', 'true');
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Musikspelaren', exact: true }))
    .toHaveAttribute('aria-pressed', 'false');
  const position = () =>
    document.querySelector<HTMLElement>('[data-object-id="lo"].spatial-node')?.style.cssText;
  const focused = position();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
  expect(position()).toBe(focused);
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Föregående vy', exact: true }).click();
  await expect
    .element(page.getByRole('button', { name: 'Föregående vy', exact: true }))
    .toBeVisible();
  expect(position()).toBe(focused);
});

test('graphics navigation and label modes expose selectable objects and directed facts', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  await lo.click({ button: 'right', modifiers: ['Control'] });
  await expect.element(selectionStatus()).toHaveTextContent('Lo Exempel');
  await lo.click();
  await expect.element(selectionStatus()).toHaveTextContent('Lo Exempel');
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  for (const name of [
    'Panorera höger',
    'Panorera vänster',
    'Panorera uppåt',
    'Panorera nedåt',
    'Rotera vänster',
    'Rotera höger',
    'Luta uppåt',
    'Luta nedåt',
    'Zooma in',
    'Zooma ut',
  ]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect.element(lo).toBeInTheDocument();
  }
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
  await expect
    .element(page.getByText('Närmare utsnitt. Panorera för att se fler etiketter.'))
    .toBeVisible();
  await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
  await page.getByRole('button', { name: 'Återställ vy' }).click();
  await lo.click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Lo Exempel → använder → Musikspelaren',
      exact: true,
    })
    .click();
  await expect.element(selectionStatus()).toHaveTextContent('Samband: edge');
  await page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Kim Exempel → använder → Musikspelaren',
      exact: true,
    })
    .click();
  await expect.element(selectionStatus()).toHaveTextContent('Samband: other');
  await page
    .getByRole('img', { name: 'Rymdens bakgrund. Välj innehåll med etiketterna eller tabellen.' })
    .click({ position: { x: 5, y: 5 } });
  await expect.element(selectionStatus()).toHaveTextContent('Hela rymden');
});

test('dense labels remain readable and explicit all-label mode retains access to every label', async () => {
  const objects = Array.from({ length: 100 }, (_, index) => ({
    ...state.objects[0],
    id: `dense-${index}`,
    name: `Tätt objekt ${index}`,
  }));
  render(
    <SpatialMap
      state={{ ...state, objects, relationships: [], draft: { version: 0, changes: [] } }}
      active
      objects={new Map(objects.map((object) => [object.id, object]))}
      relationships={new Map()}
      selection={{ kind: 'object', id: 'dense-99' }}
      disabled={false}
      onSelect={() => {}}
      onSelectRelationship={() => {}}
      onFocus={() => {}}
      onClear={() => {}}
      onReset={() => {}}
      onRemove={() => {}}
    />,
  );
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Tätt objekt 99', exact: true }))
    .toBeVisible();
  await expect.element(page.getByText('Tätt objekt 99', { exact: true })).toBeVisible();
  await expect
    .poll(() => {
      const boxes = [...document.querySelectorAll('.spatial-name')].map((label) =>
        label.getBoundingClientRect(),
      );
      return (
        boxes.length > 0 &&
        boxes.length < 100 &&
        boxes.every((a, index) =>
          boxes
            .slice(index + 1)
            .every(
              (b) =>
                a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
            ),
        )
      );
    })
    .toBe(true);
  await expect
    .element(
      page.getByText(
        `${100 - document.querySelectorAll('.spatial-name').length} etiketter döljs för läsbarhet.`,
        { exact: true },
      ),
    )
    .toBeVisible();
  await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
  await expect.poll(() => document.querySelectorAll('.spatial-name').length).toBe(100);
});

test.each(['added', 'removed', 'changed'] as const)(
  'automatic $0 draft connection labels keep object names readable in a dense map',
  async (kind) => {
    const objects = Array.from({ length: 100 }, (_, index) => ({
      ...state.objects[0],
      id: `dense-${index}`,
      name: `Tätt objekt ${index}`,
    }));
    const edges = Array.from({ length: 30 }, (_, index) => ({
      ...state.relationships[0],
      id: `dense-edge-${index}`,
      sourceId: 'dense-5',
      targetId: `dense-${index + 20}`,
    }));
    const mapState = {
      ...state,
      objects,
      relationships: edges,
      draft: { version: 0, changes: [] },
    };
    const { rerender } = render(<MapView mapState={mapState} />);
    const names = () =>
      [...document.querySelectorAll('[data-object-label]')]
        .map((label) => label.getAttribute('data-object-label'))
        .sort();
    await expect.poll(() => names().length).toBeGreaterThan(0);
    const visibleNames = names();
    rerender(
      <MapView
        mapState={{
          ...mapState,
          draft: {
            version: 1,
            changes: [],
            relationships: edges.map((edge) => ({
              id: edge.id,
              before: kind === 'added' ? null : edge,
              after:
                kind === 'removed'
                  ? null
                  : {
                      ...edge,
                      properties: [
                        {
                          id: 'note',
                          label: 'Anteckning',
                          kind: 'text' as const,
                          value: 'Ny uppgift',
                        },
                      ],
                    },
              type: state.relationshipTypes[0],
              objectNames: {},
            })),
          },
        }}
      />,
    );
    await expect.poll(names).toEqual(visibleNames);
    expect(document.querySelectorAll(`.connection.${kind}`)).toHaveLength(edges.length);
    expect(document.querySelectorAll(`.spatial-edge.${kind}`).length).toBeLessThan(edges.length);
    await expect
      .poll(() => {
        const boxes = [...document.querySelectorAll('.spatial-name, .spatial-edge')].map((label) =>
          label.getBoundingClientRect(),
        );
        return boxes.every((a, index) =>
          boxes
            .slice(index + 1)
            .every(
              (b) =>
                a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom,
            ),
        );
      })
      .toBe(true);
    await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
    await expect
      .poll(() => document.querySelectorAll(`.spatial-edge.${kind}`).length)
      .toBe(edges.length);
  },
);

test('automatic draft labels hide near a crowded connector and return when nearby space is available', async ({
  onTestFinished,
}) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  onTestFinished(() => page.viewport(viewport.width, viewport.height));
  await page.viewport(1280, 1000);
  const objects = state.objects.slice(0, 2);
  const relationshipTypes = Array.from({ length: 30 }, (_, index) => ({
    ...state.relationshipTypes[0],
    id: `draft-type-${index}`,
    name: `Samband ${index}`,
  }));
  const edges = relationshipTypes.map((type, index) => ({
    ...state.relationships[0],
    id: `draft-edge-${index}`,
    typeId: type.id,
  }));
  const mapState = {
    ...state,
    objects,
    relationships: edges,
    relationshipTypes,
    draft: {
      version: 1,
      changes: [],
      relationships: edges.map((edge, index) => ({
        id: edge.id,
        before: null,
        after: edge,
        type: relationshipTypes[index],
        objectNames: {},
      })),
    },
  };
  const { rerender } = render(<MapView mapState={mapState} />);
  const labels = () => [...document.querySelectorAll('.spatial-edge.added')];
  await expect.poll(() => labels().length).toBeGreaterThan(0);
  expect(labels().length).toBeLessThan(edges.length);
  const hidden = edges.find(
    (edge) => !document.querySelector(`[data-layout-id="relationship-${edge.id}"]`),
  );
  expect(hidden).toBeDefined();
  if (!hidden) throw new Error('A crowded connector must have a hidden label');
  const layoutId = `relationship-${hidden.id}`;
  const connection = document.querySelector('.connection.added');
  expect(connection).not.toBeNull();
  expect(document.querySelectorAll('.connection.added')).toHaveLength(edges.length);
  // Selecting the connector gives its label first use of space, even when
  // the automatic label was hidden.
  const geometry = [...document.querySelectorAll('.spatial-lines g[role="button"]')][
    edges.indexOf(hidden)
  ];
  fireEvent.click(geometry);
  await expect
    .poll(() =>
      document.querySelector(`[data-layout-id="${layoutId}"]`)?.classList.contains('selected'),
    )
    .toBe(true);
  await page
    .getByRole('img', { name: 'Rymdens bakgrund. Välj innehåll med etiketterna eller tabellen.' })
    .click({ position: { x: 5, y: 5 } });
  await expect.poll(() => document.querySelector(`[data-layout-id="${layoutId}"]`)).toBeNull();
  // Remove other proposals without moving the endpoints or camera.
  rerender(
    <MapView
      mapState={{
        ...mapState,
        relationships: [hidden],
        draft: {
          ...mapState.draft,
          relationships: mapState.draft.relationships.filter((change) => change.id === hidden.id),
        },
      }}
    />,
  );
  await expect.poll(() => document.querySelector(`[data-layout-id="${layoutId}"]`)).not.toBeNull();
  await expect.element(page.getByText('Lo Exempel', { exact: true })).toBeVisible();
  await expect.element(page.getByText('Musikspelaren', { exact: true })).toBeVisible();
});

test('hidden labels do not change the emphasis of unselected relationship lines', async () => {
  const objects = Array.from({ length: 100 }, (_, index) => ({
    ...state.objects[0],
    id: `dense-${index}`,
    name: `Tätt objekt ${index}`,
  }));
  const edges = [1, 2, 3].map((index) => ({
    ...state.relationships[0],
    id: `dense-edge-${index}`,
    sourceId: `dense-${index}`,
    targetId: `dense-${index + 10}`,
  }));
  render(
    <SpatialMap
      state={{ ...state, objects, relationships: edges, draft: { version: 0, changes: [] } }}
      active
      objects={new Map(objects.map((object) => [object.id, object]))}
      relationships={new Map(edges.map((edge) => [edge.id, edge]))}
      selection={{ kind: 'object', id: 'dense-99' }}
      disabled={false}
      onSelect={() => {}}
      onSelectRelationship={() => {}}
      onFocus={() => {}}
      onClear={() => {}}
      onReset={() => {}}
      onRemove={() => {}}
    />,
  );
  const opacity = () =>
    [...document.querySelectorAll('line.connection')].map((line) => getComputedStyle(line).opacity);
  // Hidden labels depend on the camera angle, so they must not restyle lines
  // while the map turns.
  await expect.poll(() => document.querySelector('.label-note-count')).not.toBeNull();
  const withHiddenLabels = opacity();
  expect(withHiddenLabels).toHaveLength(3);
  await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
  await expect.poll(() => document.querySelectorAll('.spatial-name').length).toBe(100);
  expect(opacity()).toEqual(withHiddenLabels);
});

test('a selected relationship keeps its directed label readable in a dense map', async () => {
  const objects = Array.from({ length: 100 }, (_, index) => ({
    ...state.objects[0],
    id: `dense-${index}`,
    name: `Tätt objekt ${index}`,
  }));
  const edge = { ...state.relationships[0], sourceId: 'dense-5', targetId: 'dense-6' };
  render(
    <MapView
      mapState={{ ...state, objects, relationships: [edge], draft: { version: 0, changes: [] } }}
    />,
  );
  const marker = page.getByRole('button', { name: 'Välj objekt: Tätt objekt 5', exact: true });
  await expect.element(marker).toBeVisible();
  (marker.element() as HTMLButtonElement).focus();
  await userEvent.keyboard('{Enter}');
  const label = page.getByRole('button', {
    name: 'Välj samband: Tätt objekt 5 → använder → Tätt objekt 6',
    exact: true,
  });
  // Normal filtering may hide an unselected label in this dense cluster.
  const allLabels = page.getByRole('button', { name: 'Alla etiketter', exact: true });
  await allLabels.click();
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  (label.element() as HTMLButtonElement).focus();
  await userEvent.keyboard('{Enter}');
  await allLabels.click();
  await expect.element(selectionStatus()).toHaveTextContent('Samband: edge');
  await expect.element(label).toBeVisible();
});

test('all labels only opens a closer view when needed and retains an already close camera', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  const location = () => (lo.element() as HTMLElement).style.cssText;
  const toggle = page.getByRole('button', { name: 'Alla etiketter', exact: true });
  await toggle.click();
  const working = location();
  await toggle.click();
  expect(location()).toBe(working);
  await toggle.click();
  expect(location()).toBe(working);
  await toggle.click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByRole('button', { name: 'Zooma in', exact: true }).click();
  const close = location();
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await toggle.click();
  expect(location()).toBe(close);
});

test('direction rendering retains selectable self references and ordinary endpoints', async ({
  onTestFinished,
}) => {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  onTestFinished(() => page.viewport(viewport.width, viewport.height));
  await page.viewport(1280, 1000);
  render(
    <MapView
      relationships={[
        { ...state.relationships[0], id: 'self', targetId: 'lo' },
        { ...state.relationships[1], id: 'none' },
      ]}
    />,
  );
  // Overview labels may be culled when font metrics or the viewport leave no room.
  await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
  await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Lo Exempel → använder → Lo Exempel',
      exact: true,
    })
    .click();
  await expect.element(selectionStatus()).toHaveTextContent('Samband: self');
  await page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Välj samband: Kim Exempel → använder → Musikspelaren',
      exact: true,
    })
    .click();
  await expect.element(selectionStatus()).toHaveTextContent('Samband: none');
});

test('context icons edit, focus, dismiss and remove only the chosen object', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await lo.click({ button: 'right', modifiers: ['Control'] });
  await expect.element(selectionStatus()).toHaveTextContent('Lo Exempel');
  expect(document.querySelector('dialog[open]')).toBeNull();
  await lo.click({ button: 'right' });
  const actions = page.getByRole('toolbar', { name: 'Åtgärder för Lo Exempel', exact: true });
  await expect.element(actions).toBeVisible();
  expect(actions.element().closest('dialog, form')).toBeNull();
  expect(actions.element().querySelector('h3')).toBeNull();
  expect(
    [...actions.element().querySelectorAll('button')].map((button) => button.textContent),
  ).toEqual(['', '', '', '', '', '', '']);
  const anchorBox = lo.element().getBoundingClientRect();
  const actionsBox = actions.element().getBoundingClientRect();
  expect(actionsBox.left).toBeCloseTo(anchorBox.right + 8, 0);
  expect(actionsBox.top + actionsBox.height / 2).toBeCloseTo(
    anchorBox.top + anchorBox.height / 2,
    0,
  );
  await expect
    .element(page.getByRole('button', { name: 'Redigera objekt', exact: true }))
    .toHaveFocus();
  await page.getByRole('button', { name: 'Redigera objekt', exact: true }).click();
  await expect.element(selectionStatus()).toHaveTextContent('Lo Exempel');
  await lo.click({ button: 'right' });
  await page.getByRole('button', { name: 'Visa uppgifter för Lo Exempel', exact: true }).click();
  await expect.element(selectionStatus()).toHaveTextContent('Uppgifter för Lo Exempel');
  await lo.click({ button: 'right' });
  await page.getByRole('button', { name: 'Samband för Lo Exempel', exact: true }).click();
  await expect.element(selectionStatus()).toHaveTextContent('Samband för Lo Exempel');
  await lo.click({ button: 'right' });
  await page.getByRole('button', { name: 'Visa i kartan', exact: true }).click();
  await expect.element(selectionStatus()).toHaveTextContent('Visar Lo Exempel i kartan');
  await lo.click({ button: 'right' });
  await page.getByRole('button', { name: 'Visa samband i kartan', exact: true }).click();
  await expect.element(selectionStatus()).toHaveTextContent('Kopplingar för lo');
  await lo.click({ button: 'right' });
  await userEvent.keyboard('{Escape}');
  await expect.element(lo).toHaveFocus();
  await userEvent.keyboard('{Shift>}{F10}{/Shift}');
  await expect.element(actions).toBeVisible();
  await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
  await expect
    .element(page.getByRole('button', { name: 'Visa i kartan', exact: true }))
    .toHaveFocus();
  await userEvent.keyboard('{ArrowRight}');
  await expect
    .element(page.getByRole('button', { name: 'Visa samband i kartan', exact: true }))
    .toHaveFocus();
  await userEvent.keyboard('{End}');
  await expect
    .element(page.getByRole('button', { name: 'Ta bort objekt', exact: true }))
    .toHaveFocus();
  await userEvent.keyboard('{Home}{Escape}');
  await expect.element(actions).not.toBeInTheDocument();
  await expect.element(lo).toHaveFocus();
  await lo.click({ button: 'right' });
  await page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }).click();
  await expect.element(actions).not.toBeInTheDocument();
  await expect.element(selectionStatus()).toHaveTextContent('Kim Exempel');
  await lo.click({ button: 'right' });
  await expect
    .element(page.getByRole('button', { name: 'Ta bort objekt', exact: true }))
    .toHaveAccessibleDescription(
      /Objektet och dess 1 samband läggs som borttagningar i ditt utkast/,
    );
  await page.getByRole('button', { name: 'Ta bort objekt', exact: true }).click();
  await expect.element(lo).not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true }))
    .toBeVisible();
});

test('a real WebGL context can recover without replacing selected household content', async () => {
  render(<MapView />);
  await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
  const extension = document
    .querySelector('canvas')
    ?.getContext('webgl2')
    ?.getExtension('WEBGL_lose_context');
  expect(extension).toBeTruthy();
  extension?.loseContext();
  await expect
    .element(page.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.'))
    .toBeVisible();
  extension?.restoreContext();
  await expect
    .element(page.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.'))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('long press does not activate a menu action on release and movement cancels a pending menu', async () => {
  render(<MapView />);
  const lo = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  await expect.element(lo).toBeVisible();
  const element = lo.element();
  fireEvent.pointerDown(element, {
    pointerType: 'touch',
    isPrimary: true,
    clientX: 20,
    clientY: 20,
  });
  fireEvent.pointerMove(element, { pointerType: 'touch', clientX: 50, clientY: 20 });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await expect
    .element(page.getByRole('button', { name: 'Redigera objekt', exact: true }))
    .not.toBeInTheDocument();
  fireEvent.pointerDown(element, {
    pointerType: 'touch',
    isPrimary: true,
    clientX: 20,
    clientY: 20,
  });
  await expect
    .element(page.getByRole('button', { name: 'Redigera objekt', exact: true }))
    .toBeVisible();
  fireEvent.pointerUp(element, { pointerType: 'touch' });
  fireEvent.click(page.getByRole('button', { name: 'Redigera objekt', exact: true }).element());
  await expect
    .element(page.getByRole('button', { name: 'Redigera objekt', exact: true }))
    .toBeVisible();
  await expect.element(selectionStatus()).toHaveTextContent('Ingen vald');
  await page.getByRole('button', { name: 'Redigera objekt', exact: true }).click();
  await expect.element(selectionStatus()).toHaveTextContent('Lo Exempel');
});

test('reduced motion retains saved background visibility and usable choices through system changes', async () => {
  const session = cdp();
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  render(<MapView relationships={[]} />);
  const stars = page.getByLabelText('Visa bakgrund', { exact: true });
  await stars.click();
  await expect.element(stars).toBeChecked();
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  await expect.element(stars).toBeChecked();
  await expect.element(stars).toBeEnabled();
  const screenshot = await page.screenshot({
    element: document.querySelector('canvas') as HTMLCanvasElement,
    base64: true,
  });
  const picture = new Image();
  picture.src = `data:image/png;base64,${screenshot.base64}`;
  await picture.decode();
  const sample = document.createElement('canvas');
  sample.width = picture.width;
  sample.height = picture.height;
  const context = sample.getContext('2d');
  if (!context) throw new Error('Pixel sampling unavailable');
  context.drawImage(picture, 0, 0);
  // Reduced motion preserves the decorative environment instead of hiding it.
  expect([...context.getImageData(30, 30, 1, 1).data]).not.toEqual([16, 27, 41, 255]);
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  await expect.element(stars).toBeEnabled();
  await expect.element(stars).toBeChecked();
});
