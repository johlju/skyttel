import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import { defaultConversationPreferences } from '../../src/shared/conversation-preferences.js';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';
import type { MapSelection, TextAssistantView } from '../../src/shared/text-assistant.js';
import {
  openConversationText,
  startConversationWithText,
} from '../support/conversation-browser.js';

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

    properties: [
      {
        id: 'description',
        label: 'Beskrivning',
        kind: 'text',
        value: `${name}s påhittade uppgifter`,
      },
    ],
  })),
  relationships: [
    {
      id: 'edge',
      householdId: 'home',
      revision: 1,
      sourceId: 'lo',
      targetId: 'kim',
      typeId: 'uses',
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
    if (url.endsWith('/conversation-preferences'))
      return Response.json(defaultConversationPreferences);
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
        canceled: true,
      };
    return Response.json(current);
  });
  render(
    <main>
      <HouseholdMap householdId="home" />
    </main>,
  );
  await expect.element(page.getByRole('button', { name: 'Karta', exact: true })).toBeEnabled();
  async function showToolNames() {
    if (width <= 700 && height <= 450)
      await page.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
  }
  async function openText() {
    // The expanded names would lie over a text view that is already open.
    if (page.getByRole('region', { name: 'Skriv till Skyttel', exact: true }).query()) return;
    await showToolNames();
    await openConversationText();
  }
  await showToolNames();
  await startConversationWithText();
  await expect.element(page.getByLabelText('Meddelande till Skyttel')).toBeVisible();
  return {
    acknowledgements,
    async show(item: MapSelection) {
      target = item;
      await openText();
      await page.getByLabelText('Meddelande till Skyttel').fill('Visa urvalet.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test.each([
  [320, 250],
  [390, 844],
  [640, 500],
  [1280, 900],
])(
  'object action keyboard navigation reveals the complete target at %i×%i',
  { tags: ['technical'] },
  async (width, height) => {
    const app = await open(width, height);
    await app.show({ kind: 'object', id: 'lo' });
    await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
    const panel = page.getByRole('region', { name: 'Lo', exact: true });
    const toolbar = panel.getByRole('toolbar', { name: 'Objektåtgärder för Lo', exact: true });
    const buttons = [...toolbar.element().querySelectorAll('button')];
    const selected = page.getByRole('button', { name: 'Välj objekt: Lo', exact: true });
    const selectedBounds = selected.element().getBoundingClientRect().toJSON();
    panel.getByRole('button', { name: 'Redigera Lo', exact: true }).element().focus();

    async function expectCurrentAction(index: number, keyboard = true) {
      const action = buttons[index];
      expect(action).toHaveFocus();
      await expect
        .poll(() => {
          const box = action.getBoundingClientRect();
          const bounds = toolbar.element().getBoundingClientRect();
          return (
            box.width >= 44 &&
            box.height >= 44 &&
            box.left >= Math.max(0, bounds.left) &&
            box.right <= Math.min(innerWidth, bounds.right) &&
            box.top >= Math.max(0, bounds.top) &&
            box.bottom <= Math.min(innerHeight, bounds.bottom) &&
            action.contains(
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
            )
          );
        })
        .toBe(true);
      if (keyboard) {
        expect(action.matches(':focus-visible')).toBe(true);
        const style = getComputedStyle(action);
        expect(Number.parseFloat(style.outlineWidth)).toBeGreaterThan(0);
        expect(style.outlineStyle).not.toBe('none');
        const outset = Math.max(
          0,
          Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.outlineWidth),
        );
        const box = action.getBoundingClientRect();
        expect(box.left - outset).toBeGreaterThanOrEqual(0);
        expect(box.right + outset).toBeLessThanOrEqual(innerWidth);
        expect(box.top - outset).toBeGreaterThanOrEqual(0);
        expect(box.bottom + outset).toBeLessThanOrEqual(innerHeight);
        for (let ancestor = action.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const clipping = getComputedStyle(ancestor);
          const bounds = ancestor.getBoundingClientRect();
          if (clipping.overflowX !== 'visible') {
            expect(box.left - outset).toBeGreaterThanOrEqual(bounds.left);
            expect(box.right + outset).toBeLessThanOrEqual(bounds.right);
          }
          if (clipping.overflowY !== 'visible') {
            expect(box.top - outset).toBeGreaterThanOrEqual(bounds.top);
            expect(box.bottom + outset).toBeLessThanOrEqual(bounds.bottom);
          }
        }
      }
      expect(selected.element()).toHaveAttribute('aria-pressed', 'true');
      expect(selected.element().getBoundingClientRect().toJSON()).toEqual(selectedBounds);
      expect(panel.element().querySelector('form')).toBeNull();
      const close = panel.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).element();
      const box = close.getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(innerHeight);
      expect(
        close.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
      ).toBe(true);
    }

    await expectCurrentAction(0, false);
    for (let index = 1; index < buttons.length; index++) {
      await userEvent.keyboard('{ArrowRight}');
      await expectCurrentAction(index);
    }
    await userEvent.keyboard('{ArrowRight}');
    await expectCurrentAction(0);
    await userEvent.keyboard('{ArrowLeft}');
    await expectCurrentAction(buttons.length - 1);
    for (let index = buttons.length - 2; index >= 0; index--) {
      await userEvent.keyboard('{ArrowLeft}');
      await expectCurrentAction(index);
    }
    await userEvent.keyboard('{End}');
    await expectCurrentAction(buttons.length - 1);
    await userEvent.keyboard('{Home}');
    await expectCurrentAction(0);
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByLabelText('Namn', { exact: true })).toHaveValue('Lo');
  },
);

test('populated object details can be acknowledged without any free properties', {
  tags: ['technical'],
}, async () => {
  const app = await open(1280, 900, {
    ...state,
    objects: state.objects.map((object) => ({ ...object, properties: [] })),
  });
  await app.show({ kind: 'object', id: 'lo' });
  await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
  expect(app.acknowledgements[0]).toMatchObject({ kind: 'object', id: 'lo', displayed: true });
  const panel = page.getByRole('region', { name: 'Lo', exact: true });
  await expect.element(panel.getByText('Namn', { exact: true })).toBeVisible();
});

test('assistant display shows the map and populated inspector before confirming the actual object and relationship', async () => {
  const app = await open();
  await app.show({ kind: 'object', id: 'lo' });
  await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
  expect(app.acknowledgements[0]).toMatchObject({ kind: 'object', id: 'lo', displayed: true });
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Lo', exact: true }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(
    document.querySelector('.map-inspector[data-selection-kind="object"][data-selection-id="lo"]')
      ?.textContent,
  ).toContain('Los påhittade uppgifter');
  await app.show({ kind: 'relationship', id: 'edge' });
  await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(2);
  expect(app.acknowledgements[1]).toMatchObject({
    kind: 'relationship',
    id: 'edge',
    displayed: true,
  });
  const edge = document.querySelector('.spatial-edge.selected');
  expect(edge?.checkVisibility()).toBe(true);
  expect(
    document
      .querySelector('.map-inspector[data-selection-kind="relationship"]')
      ?.getAttribute('data-selection-id'),
  ).toBe('edge');
});

test('a lost graphics context cannot be acknowledged, and canceling its pending reveal prevents a late confirmation', async () => {
  const app = await open();
  const canvas = document.querySelector('.spatial-surface canvas') as HTMLCanvasElement;
  const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
  expect(extension).toBeTruthy();
  extension?.loseContext();
  await expect.element(page.getByText(/Grafiken är tillfälligt avbruten/)).toBeVisible();
  await app.show({ kind: 'object', id: 'lo' });
  await openConversationText();
  await expect.element(page.getByRole('log').getByText(/Skyttel arbetar…/)).toBeVisible();
  expect(app.acknowledgements).toEqual([]);
  await page.getByLabelText('Meddelande till Skyttel').click();
  await userEvent.keyboard('{Escape}');
  await expect
    .element(page.getByText('Avbrutet. Föreslagna ändringar ligger kvar i utkastet.'))
    .toBeVisible();
  extension?.restoreContext();
  await expect.element(page.getByText(/Grafiken är tillfälligt avbruten/)).not.toBeInTheDocument();
  expect(app.acknowledgements).toEqual([]);
  await app.show({ kind: 'object', id: 'lo' });
  await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
  expect(app.acknowledgements[0].displayed).toBe(true);
});

test('an unavailable target is rejected without replacing the current inspector', async () => {
  const app = await open();
  await app.show({ kind: 'object', id: 'absent' });
  await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
  expect(app.acknowledgements[0]).toMatchObject({ id: 'absent', displayed: false });
  expect(document.querySelector('.map-inspector[data-selection-id]')).toBeNull();
});

test('a hidden document never reports a visible map selection', async () => {
  const app = await open();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  await app.show({ kind: 'object', id: 'lo' });
  await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
  expect(app.acknowledgements[0].displayed).toBe(false);
});

test('a panel covering the actual inspector prevents a successful display acknowledgement', async () => {
  const app = await open();
  const cover = document.createElement('style');
  cover.textContent = `
    .map-inspector[data-selection-id]::after {
      content: ''; position: absolute; inset: 0; z-index: 100; background: white;
    }
  `;
  document.head.append(cover);
  try {
    await app.show({ kind: 'object', id: 'lo' });
    await expect.element(page.getByRole('region', { name: 'Lo', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await expect
      .element(page.getByRole('region', { name: 'Navigation', exact: true }))
      .toBeVisible();
    expect(app.acknowledgements).toEqual([]);
    await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
    expect(app.acknowledgements[0].displayed).toBe(false);
  } finally {
    cover.remove();
  }
});

test('a visible object title cannot confirm display when the details scroller is collapsed', async () => {
  const app = await open();
  const collapse = document.createElement('style');
  collapse.textContent = '.object-property-body { max-height: 0 !important; }';
  document.head.append(collapse);
  try {
    await app.show({ kind: 'object', id: 'lo' });
    const panel = page.getByRole('region', { name: 'Lo', exact: true });
    await expect.element(panel.getByRole('heading', { name: 'Lo', exact: true })).toBeVisible();
    expect(panel.element().querySelector('.object-property-body')?.clientHeight).toBe(0);
    await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
    expect(app.acknowledgements[0].displayed).toBe(false);
  } finally {
    collapse.remove();
  }
});

test.each([
  ['display: none', false],
  ['line-height: normal', true],
] as const)('object details styled with %s report displayed=%s', async (declaration, displayed) => {
  const app = await open();
  const style = document.createElement('style');
  style.textContent = `.object-property-window .household-table-details dl > div:first-child dd { ${declaration}; }`;
  document.head.append(style);
  try {
    await app.show({ kind: 'object', id: 'lo' });
    const panel = page.getByRole('region', { name: 'Lo', exact: true });
    await expect.element(panel.getByRole('heading', { name: 'Lo', exact: true })).toBeVisible();
    const description = panel
      .element()
      .querySelector('.household-table-details dl > div:first-child dd');
    expect(description?.checkVisibility()).toBe(displayed);
    await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
    expect(app.acknowledgements[0].displayed).toBe(displayed);
  } finally {
    style.remove();
  }
});

test.each([
  [390, 844],
  [640, 500],
  [320, 250],
])(
  'long details at %i×%i remain scrollable beside the visible selection and require explicit editing',
  async (width, height) => {
    const app = await open(width, height, {
      ...state,
      objects: state.objects.map((object) => ({
        ...object,

        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text',
            value: 'Påhittade uppgifter om hushållets objekt. '.repeat(40),
          },
          { id: 'inventory', label: 'Inventarienummer', kind: 'text', value: 'SYNTH-42' },
        ],
      })),
    });
    await app.show({ kind: 'object', id: 'lo' });
    await expect.poll(() => app.acknowledgements.length, { timeout: 7_000 }).toBe(1);
    expect(app.acknowledgements[0].displayed).toBe(true);
    const objectPanel = page.getByRole('region', { name: 'Lo', exact: true });
    const inspector = objectPanel.element();
    const body = inspector.querySelector('.object-property-body') as HTMLElement;
    // Compact readers scroll the window; taller readers scroll only its body.
    const scroller = [body, inspector].find((element) =>
      /^(auto|scroll)$/.test(getComputedStyle(element).overflowY),
    );
    expect(scroller).toBeDefined();
    if (!scroller) throw new Error('The object details need a scroll container');
    expect(body.clientHeight).toBeGreaterThanOrEqual(
      Number.parseFloat(getComputedStyle(body).lineHeight),
    );
    expect(scroller.clientHeight).toBeGreaterThanOrEqual(
      Number.parseFloat(getComputedStyle(scroller).lineHeight),
    );
    expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
    expect(scroller.getBoundingClientRect().bottom).toBeLessThanOrEqual(innerHeight);
    function expectOnscreen(element: Element, box = element.getBoundingClientRect()) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(innerWidth);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(innerHeight);
      expect(
        element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
      ).toBe(true);
    }
    function expectSelectionAndHeader() {
      const selected = page.getByRole('button', { name: 'Välj objekt: Lo', exact: true });
      expect(selected.element()).toHaveAttribute('aria-pressed', 'true');
      expectOnscreen(selected.element());
      expectOnscreen(objectPanel.getByRole('heading', { name: 'Lo', exact: true }).element());
      const close = objectPanel.getByRole('button', { name: 'Stäng uppgifterna', exact: true });
      expect(close.element()).toBeEnabled();
      expectOnscreen(close.element());
      expect(close.element().getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(close.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    const expectReadable = (element: Element, box = element.getBoundingClientRect()) => {
      expectOnscreen(element, box);
      const bounds = scroller.getBoundingClientRect();
      const header = inspector.querySelector('header') as HTMLElement;
      expect(box.top).toBeGreaterThanOrEqual(
        Math.max(bounds.top, header.getBoundingClientRect().bottom),
      );
      expect(box.bottom).toBeLessThanOrEqual(bounds.bottom);
    };
    const description = [...body.querySelectorAll('dt')].find(
      (term) => term.textContent === 'Beskrivning',
    )?.nextElementSibling as HTMLElement;
    description.scrollIntoView({ block: 'start' });
    const lines = document.createRange();
    lines.selectNodeContents(description);
    expectReadable(description, lines.getClientRects()[0]);
    expectSelectionAndHeader();
    description.scrollIntoView({ block: 'end' });
    await expect.poll(() => scroller.scrollTop).toBeGreaterThan(0);
    expectReadable(description, [...lines.getClientRects()].at(-1));
    expectSelectionAndHeader();
    const lastDetail = body.querySelector('dl > div:last-child dd') as HTMLElement;
    lastDetail.scrollIntoView({ block: 'center' });
    const detailText = document.createRange();
    detailText.selectNodeContents(lastDetail);
    // At maximum scroll, fractional line-box leading can extend past the port.
    // Measure every actual text fragment, as for the description above.
    const detailFragments = [...detailText.getClientRects()];
    expect(detailFragments.length).toBeGreaterThan(0);
    for (const fragment of detailFragments) expectReadable(lastDetail, fragment);
    expectSelectionAndHeader();
    expect(inspector.querySelector('form')).toBeNull();
    const edit = objectPanel.getByRole('button', { name: 'Redigera Lo', exact: true });
    edit.element().focus();
    await expect.element(edit).toHaveFocus();
    const actions = objectPanel.getByRole('toolbar', {
      name: 'Objektåtgärder för Lo',
      exact: true,
    });
    for (const action of actions.element().querySelectorAll('button')) {
      action.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      expectOnscreen(action);
      expect(action.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(action.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    expectSelectionAndHeader();
    await objectPanel.getByRole('button', { name: 'Redigera Lo', exact: true }).click();
    await expect.element(page.getByLabelText('Namn', { exact: true })).toHaveValue('Lo');
  },
);
