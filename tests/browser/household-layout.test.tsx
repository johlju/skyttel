import { cleanup, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import { FormLeaveProvider } from '../../src/client/FormLeave.js';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import {
  closeSupportDialog,
  openMap,
  openNewObject,
  openTable,
} from '../support/workspace-browser.js';
import '../../src/client/styles.css';
import { conversationConsentTextVersion } from '../../src/shared/conversation-consent.js';
import { defaultConversationPreferences } from '../../src/shared/conversation-preferences.js';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings, type PersonalView } from '../../src/shared/personal-view.js';
import { closeConversationText, openConversationText } from '../support/conversation-browser.js';

const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [
    { id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' },
    { id: 'service', householdId: 'home', revision: 1, name: 'Tjänst', description: '' },
  ],
  relationshipTypes: [],
  relationships: [],
  objects: [
    {
      id: 'alex',
      householdId: 'home',
      typeId: 'person',
      revision: 1,
      name: 'Alex',
    },
    {
      id: 'music',
      householdId: 'home',
      typeId: 'service',
      revision: 1,
      name: 'Tonmoln',
    },
  ],
  draft: { version: 0, changes: [] },
};

async function open(width: number, mapState = state, positions: PersonalView['positions'] = []) {
  await page.viewport(width, 960);
  await expect.poll(() => window.innerWidth).toBe(width);
  await expect
    .poll(() => window.matchMedia('(min-width: 1100px) and (pointer: fine)').matches)
    .toBe(width >= 1100);
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: 1,
        positions,
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/conversation-preferences'))
      return Response.json(defaultConversationPreferences);
    if (url.endsWith('/conversation-consent'))
      return Response.json({ saved: { textVersion: conversationConsentTextVersion } });
    if (url.endsWith('/text-assistant') && init?.method !== 'POST')
      return Response.json({ available: true });
    if (url.includes('/text-assistant'))
      return Response.json({
        id: 'layout-conversation',
        revision: 0,
        phase: 'ready',
        operations: [],
        review: {
          ...mapState.draft,
          contentVersion: 1,
          readyToSave: false,
          conflicts: [],
          unresolvedIdentities: [],
          pendingOperations: [],
        },
      });
    if (url.includes('/map?')) return Response.json(mapState);
    throw new Error(`Unexpected request: ${url}`);
  });
  function Layout() {
    const [settings, setSettings] = useState(false);
    const [target, setTarget] = useState<HTMLDivElement | null>(null);
    return (
      <FormLeaveProvider>
        <main>
          <section className="panel household-panel">
            <HouseholdMap
              householdId="home"
              active={!settings}
              onSettings={() => setSettings(true)}
              typeSettingsTarget={settings ? target : null}
            />
            <section hidden={!settings} aria-label="Typer">
              <div ref={setTarget} />
              <button type="button" onClick={() => setSettings(false)}>
                Tillbaka till kartan
              </button>
            </section>
          </section>
        </main>
      </FormLeaveProvider>
    );
  }
  render(<Layout />);
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
}

async function readObject(name: string) {
  await openTable();
  const expand = page.getByRole('button', { name, exact: true });
  if (expand.element().getAttribute('aria-expanded') !== 'true') await expand.click();
  return page.getByRole('region', { name: `Uppgifter för ${name}`, exact: true });
}
async function closeObject(name: string) {
  await page.getByRole('button', { name, exact: true }).click();
  await expect
    .element(page.getByRole('region', { name: `Uppgifter för ${name}`, exact: true }))
    .not.toBeInTheDocument();
}
async function editObject(name: string) {
  await openTable();
  await page.getByRole('button', { name: `Redigera ${name}`, exact: true }).click();
  return page.getByRole('dialog', { name: `Redigera ${name}`, exact: true });
}
async function keyboardReach(target: ReturnType<typeof page.getByRole>) {
  for (let step = 0; step < 35 && document.activeElement !== target.element(); step++)
    await userEvent.keyboard('{Tab}');
  await expect.element(target).toHaveFocus();
  await expect.element(target).toBeInViewport();
  const box = target.element().getBoundingClientRect();
  expect(
    target
      .element()
      .contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
  ).toBe(true);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('relationship details open saved and proposed routes with pointer and keyboard gestures', async () => {
  const type = {
    id: 'uses',
    householdId: 'home',
    revision: 1,
    name: 'Använder',
    description: '',
    forwardLabel: 'använder',
    reverseLabel: 'används av',
  };
  const before = {
    id: 'edge',
    householdId: 'home',
    revision: 1,
    typeId: type.id,
    sourceId: 'alex',
    targetId: 'music',
  };
  const after = { ...before, sourceId: 'kim' };
  await open(1440, {
    ...state,
    objects: [...state.objects, { ...state.objects[0], id: 'kim', name: 'Kim' }],
    relationshipTypes: [type],
    relationships: [before],
    draft: {
      version: 1,
      changes: [],
      relationships: [{ id: before.id, before, after, type }],
    },
  });
  await page.getByRole('button', { name: 'Alla etiketter', exact: true }).click();
  const saved = page.getByRole('button', {
    name: 'Välj tidigare samband: Alex → använder → Tonmoln',
    exact: true,
  });
  await saved.dblClick();
  const details = page.getByRole('region', { name: 'Valt samband', exact: true });
  await expect
    .element(details.getByText('Alex → använder → Tonmoln', { exact: true }))
    .toBeVisible();
  await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
  const proposed = page.getByRole('button', {
    name: 'Välj samband: Kim → använder → Tonmoln',
    exact: true,
  });
  (proposed.element() as HTMLElement).focus();
  await userEvent.keyboard('{Alt>}{Enter}{/Alt}');
  await expect
    .element(details.getByText('Kim → använder → Tonmoln', { exact: true }))
    .toBeVisible();
  await expect
    .element(details.getByRole('button', { name: 'Redigera valt samband', exact: true }))
    .toBeVisible();
});

test('camera focus includes previous direct neighbors and preserves work through view history and compact tool expansion', async () => {
  const mapState = structuredClone(state);
  const type = { ...state.types[0], id: 'uses', name: 'Använder' };
  const edge = {
    id: 'edge',
    householdId: 'home',
    revision: 1,
    typeId: type.id,
    sourceId: 'alex',
    targetId: 'music',
  };
  mapState.relationshipTypes = [type];
  mapState.objects.push({ ...state.objects[1], id: 'far', name: 'Långt borta' });
  mapState.relationships = [
    edge,
    { ...edge, id: 'second-hop', sourceId: 'music', targetId: 'far' },
  ];
  mapState.draft.relationships = [
    {
      id: edge.id,
      before: edge,
      after: { ...edge, targetId: 'alex' },
      type,
    },
  ];
  await open(1440, mapState, [
    { id: 'alex', x: 8, y: 4, z: 10, version: 1 },
    { id: 'music', x: -4, y: -6, z: 3, version: 1 },
    { id: 'far', x: -60, y: 20, z: -40, version: 1 },
  ]);
  const alex = page.getByRole('button', { name: 'Välj objekt: Alex', exact: true });
  const music = page.getByRole('button', { name: 'Välj objekt: Tonmoln', exact: true });
  const focus = page.getByRole('button', { name: 'Fokusera markering', exact: true });
  const position = (node: typeof alex) => {
    const box = node.element().getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const separation = () =>
    Math.hypot(position(alex).x - position(music).x, position(alex).y - position(music).y);
  alex.element().focus();
  await userEvent.keyboard('{Shift>}{F10}{/Shift}');
  await expect.element(focus).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  await alex.click();
  const initialSeparation = separation();
  await alex.dblClick();
  const panel = page.getByRole('region', { name: 'Alex', exact: true });
  const reading = panel.getByRole('heading', { name: 'Alex', exact: true });
  await panel.getByRole('group', { name: 'Flytta uppgiftsfönstret för Alex', exact: true }).click();
  await userEvent.keyboard(`{Shift>}${'{ArrowLeft}'.repeat(24)}{/Shift}`);
  const panelBox = panel.element().getBoundingClientRect().toJSON();
  alex.element().focus();
  await userEvent.keyboard('{Shift>}{F10}{/Shift}');
  await focus.click();
  await expect.poll(separation).toBeGreaterThan(initialSeparation * 2);
  expect(panel.element().getBoundingClientRect().toJSON()).toEqual(panelBox);
  for (const node of [alex, music]) {
    const box = node.element().getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    await node.hover();
  }
  await expect.element(music).toHaveAttribute('aria-pressed', 'false');
  const focused = position(alex);
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await page.getByRole('button', { name: 'Föregående vy', exact: true }).click();
  await expect
    .element(page.getByRole('button', { name: 'Föregående vy', exact: true }))
    .toBeVisible();
  expect(position(alex)).toEqual(focused);
  await expect.element(reading).toBeVisible();
  await expect.element(alex).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
  await page.viewport(320, 250);
  await page.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
  alex.element().focus();
  await userEvent.keyboard('{Shift>}{F10}{/Shift}');
  (focus.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByRole('img', { name: /Rymdens bakgrund/ })).toHaveFocus();
  await expect
    .element(page.getByRole('button', { name: 'Visa verktygens namn', exact: true }))
    .toBeVisible();
  for (const node of [alex, music]) {
    await expect.poll(() => position(node).y).toBeGreaterThanOrEqual(44);
    await expect.poll(() => position(node).y).toBeLessThanOrEqual(226);
    await node.hover();
  }
});

test('compact profile returns to visible work and dismisses before keyboard focus enters the map', async () => {
  await open(1440);
  await page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }).dblClick();
  const name = page
    .getByRole('region', { name: 'Alex', exact: true })
    .getByRole('heading', { name: 'Alex', exact: true });
  const profileButton = page.getByRole('button', { name: 'Din profil', exact: true });
  const profile = page.getByRole('region', { name: 'Din profil', exact: true });
  await profileButton.click();
  await expect
    .element(profile.getByRole('heading', { name: 'Din profil', exact: true }))
    .toHaveFocus();
  await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
  await expect.element(name).toBeVisible();
  await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
  for (const target of [
    page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }),
    page.getByRole('button', { name: 'Prata med Skyttel', exact: true }),
  ]) {
    (target.element() as HTMLElement).focus();
    await profileButton.click();
    await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect.element(target).toHaveFocus();
    await expect.element(name).not.toBeInTheDocument();
  }
  await profileButton.click();
  (
    profile
      .getByRole('button', { name: 'Tillbaka till arbetet', exact: true })
      .element() as HTMLElement
  ).focus();
  await userEvent.keyboard('{Tab}');
  await expect.element(profile).not.toBeInTheDocument();
  const focused = document.activeElement as HTMLElement;
  const box = focused.getBoundingClientRect();
  expect(
    focused.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
  ).toBe(true);
});

test('map selection gestures preserve membership and open retained details only when requested', async () => {
  await open(1440);
  const alex = page.getByRole('button', { name: 'Välj objekt: Alex', exact: true });
  const music = page.getByRole('button', { name: 'Välj objekt: Tonmoln', exact: true });
  const panel = page.getByRole('region', { name: 'Tonmoln', exact: true });
  const positions = () =>
    [alex, music].map((node) => {
      const { x, y } = node.element().getBoundingClientRect();
      return { x, y };
    });
  await expect.element(alex).toBeVisible();
  await expect.element(music).toBeVisible();
  // Native pointer actionability waits for the initial projection to stop moving.
  await alex.hover();
  await music.hover();
  const before = positions();
  await alex.click();
  await music.click({ modifiers: ['Control'] });
  await alex.click();
  await expect.element(alex).toHaveAttribute('aria-pressed', 'true');
  await expect.element(music).toHaveAttribute('aria-pressed', 'true');
  await expect.element(panel).not.toBeInTheDocument();
  await music.click({ modifiers: ['Meta'] });
  await expect.element(music).toHaveAttribute('aria-pressed', 'false');
  await music.click();
  await expect.element(alex).toHaveAttribute('aria-pressed', 'false');
  await music.dblClick();
  await expect.element(panel).toBeVisible();
  await expect.element(panel.getByRole('heading', { name: 'Tonmoln', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
  await alex.click({ modifiers: ['Control', 'Alt'] });
  await expect.element(page.getByRole('region', { name: 'Alex', exact: true })).toBeVisible();
  await expect.element(music).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
  await music.click({ modifiers: ['Meta', 'Alt'] });
  await expect.element(panel.getByRole('heading', { name: 'Tonmoln', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
  await alex.click({ button: 'right', modifiers: ['Control'] });
  await expect.element(alex).toHaveAttribute('aria-pressed', 'false');
  // Some platforms follow the context-menu gesture with a click from the same press.
  alex
    .element()
    .dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, detail: 1 }));
  await expect.element(alex).toHaveAttribute('aria-pressed', 'false');
  await alex.click({ button: 'right', modifiers: ['Control', 'Alt'] });
  await expect.element(page.getByRole('region', { name: 'Alex', exact: true })).toBeVisible();
  await expect.element(alex).toHaveAttribute('aria-pressed', 'true');
  await expect.element(music).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
  await expect.poll(positions).toEqual(before);
});

test.each([320, 390, 1440])(
  'table toolbar groups search with Filter and conflicts before New at %i pixels',
  async (width) => {
    await open(width, {
      ...state,
      draft: {
        version: 1,
        changes: [
          {
            id: 'alex',
            before: { ...state.objects[0], revision: 0 },
            after: { ...state.objects[0], name: 'Alex utkast' },
            type: state.types[0],
          },
        ],
      },
    });
    await openTable();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const workspace = document.querySelector('.household-map')?.getBoundingClientRect();
    expect(workspace?.top).toBe(0);
    expect(workspace?.bottom).toBe(window.innerHeight);
    expect(document.elementFromPoint(width / 2, 1)?.closest('.household-map')).not.toBeNull();
    const search = table.getByRole('searchbox').element().getBoundingClientRect();
    const filter = table
      .getByRole('button', { name: 'Filter', exact: true })
      .element()
      .getBoundingClientRect();
    const conflict = table
      .getByRole('button', { name: '1 konflikt i ditt utkast', exact: true })
      .element()
      .getBoundingClientRect();
    const create = table
      .getByRole('button', { name: /Nytt objekt/ })
      .element()
      .getBoundingClientRect();
    expect(filter.left).toBeGreaterThanOrEqual(search.right);
    expect(filter.top).toBe(search.top);
    const actionGroup = document.querySelector('.household-table-actions')?.getBoundingClientRect();
    const buttonsFit = conflict.width + 8 + create.width <= (actionGroup?.width ?? 0);
    if (buttonsFit) {
      expect(conflict.right).toBeLessThanOrEqual(create.left);
      expect(conflict.top).toBe(create.top);
    } else {
      expect(conflict.bottom).toBeLessThanOrEqual(create.top);
      expect(conflict.right).toBe(create.right);
    }
    expect(create.right).toBeLessThanOrEqual(width);
    const toolbar = document.querySelector('.household-table-search')?.getBoundingClientRect();
    expect(create.right).toBe(toolbar?.right);
    if (width === 1440) expect(create.top).toBe(search.top);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await table.getByRole('button', { name: /Nytt objekt/ }).click();
    await expect
      .element(page.getByRole('dialog', { name: 'Nytt objekt', exact: true }))
      .toBeVisible();
  },
);

test('desktop retains the mounted map, bounded text view and complete table reading', async () => {
  await open(1440);
  const surface = document.querySelector('.spatial-surface');
  expect(surface?.getBoundingClientRect().width).toBeGreaterThan(1300);
  await openConversationText();
  const conversation = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
  await expect.element(conversation).toBeVisible();
  const speech = conversation.element().getBoundingClientRect();
  expect(speech.width).toBeGreaterThan(250);
  expect(speech.width).toBeLessThan(600);
  expect(speech.bottom).toBeLessThanOrEqual(960);
  await closeConversationText();
  const object = await readObject('Alex');
  await expect
    .element(object.getByRole('heading', { name: 'Alex · alla uppgifter', exact: true }))
    .toBeVisible();
  await expect.element(object.getByText('Alex', { exact: true })).toBeVisible();
  expect(document.querySelector('.spatial-surface')).toBe(surface);
  const box = object.element().getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(1440);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(960);
  await expect.element(page.getByLabelText('Namn', { exact: true })).not.toBeInTheDocument();
});

test.each([320, 390, 1440])(
  'reopening table details retains disclosure focus at %i pixels',
  async (width) => {
    await open(width);
    const object = await readObject('Alex');
    await expect.element(object.getByText('Alex', { exact: true })).toBeVisible();
    await closeObject('Alex');
    const entry = page.getByRole('button', { name: 'Alex', exact: true });
    await expect.element(entry).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect.element(entry).toHaveFocus();
    await expect
      .element(object.getByRole('heading', { name: 'Alex · alla uppgifter', exact: true }))
      .toBeVisible();
    await expect.element(object.getByText('Alex', { exact: true })).toBeVisible();
  },
);

test('opening an editor does not redirect typing after the user chooses another field', async ({
  onTestFinished,
}) => {
  await open(1440);
  await openTable();
  const panel = document.body;
  // Choose identity as soon as the form appears, before the next paint.
  // Initial name focus must not steal this newer focus choice.
  const observer = new MutationObserver(() => {
    const identity = panel.querySelector<HTMLSelectElement>('select[aria-label="Identitet"]');
    if (!identity) return;
    observer.disconnect();
    identity.focus();
  });
  observer.observe(panel, { childList: true, subtree: true });
  onTestFinished(() => observer.disconnect());
  await page.getByRole('button', { name: 'Redigera Alex', exact: true }).click();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await expect.element(page.getByLabelText('Identitet', { exact: true })).toHaveFocus();
  await userEvent.keyboard('{ArrowDown}');
  await expect
    .element(page.getByLabelText('Identitet', { exact: true }))
    .toHaveValue('unspecified');
  await expect.element(page.getByLabelText('Namn', { exact: true })).toHaveValue('Alex');
});

test.each(['details-collapse', 'form-close'] as const)(
  '%s transition preserves a newer choice to type in table search',
  async (transition) => {
    await open(390);
    if (transition === 'details-collapse') await readObject('Alex');
    else await editObject('Alex');
    const search = page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true });
    const observer = new MutationObserver(() => {
      if (
        document.querySelector(
          transition === 'details-collapse' ? '.household-table-inline-details' : 'dialog[open]',
        )
      )
        return;
      observer.disconnect();
      search.element().focus();
    });
    observer.observe(document.body, { attributes: true, childList: true, subtree: true });
    onTestFinished(() => observer.disconnect());
    if (transition === 'details-collapse') await closeObject('Alex');
    else await closeSupportDialog('Redigera Alex', 'Stäng objektdialogen');
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await userEvent.keyboard('Min sökning');
    await expect.element(search).toHaveValue('Min sökning');
    await expect.element(search).toHaveFocus();
  },
);

test('short table flow restores the used result and yields to an explicit map search request', async () => {
  await open(320, {
    ...state,
    objects: Array.from({ length: 50 }, (_, index) => ({
      ...state.objects[0],
      id: `object-${index}`,
      name: `Objekt ${String(index).padStart(2, '0')}`,
    })),
  });
  await page.viewport(320, 250);
  await readObject('Objekt 45');
  const details = page.getByRole('button', {
    name: 'Redigera Objekt 45',
    exact: true,
  });
  await details.click();
  await closeSupportDialog('Redigera Objekt 45', 'Stäng objektdialogen');
  await expect.element(details).toHaveFocus();
  await expect.element(details).toBeInViewport();
  const bounds = details.element().getBoundingClientRect();
  expect(
    details
      .element()
      .contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
      ),
  ).toBe(true);
  await openMap();
  await page.getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true }).click();
  await expect
    .element(page.getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true }))
    .toHaveFocus();
});

test('complete view switching retains object reading, unsent conversation text and resize focus', async () => {
  await open(1440);
  await readObject('Alex');
  await closeObject('Alex');
  await openConversationText();
  const conversation = page.getByRole('region', {
    name: 'Skriv till Skyttel',
    exact: true,
    includeHidden: true,
  });
  const message = conversation.getByLabelText('Meddelande till Skyttel');
  await message.fill('Behåll meddelande');
  await page.viewport(640, 960);
  await expect.element(conversation).toBeVisible();
  await closeConversationText();
  const object = await readObject('Alex');
  await expect.element(object.getByText('Alex', { exact: true })).toBeVisible();
  await closeObject('Alex');
  await openMap();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
  await expect.element(navigation).toBeVisible();
  await openConversationText();
  await expect.element(message).toHaveValue('Behåll meddelande');
  message.element().focus();
  await page.viewport(1440, 960);
  await expect.element(message).toHaveFocus();
  await expect.element(message).toHaveValue('Behåll meddelande');
  await closeConversationText();
  await readObject('Alex');
  await expect.element(object.getByText('Alex', { exact: true })).toBeVisible();
});

test.each([390, 250])(
  'wide short work at %i pixels keeps native actions keyboard reachable and protects input',
  async (height) => {
    await open(1440);
    await page.viewport(1440, height);
    const form = await openNewObject();
    await page.getByLabelText('Namn', { exact: true }).fill('Behåll bred text');
    await keyboardReach(
      form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }),
    );
    await userEvent.keyboard('{Escape}');
    await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect
      .element(page.getByLabelText('Namn', { exact: true }))
      .toHaveValue('Behåll bred text');
  },
);

test.each([390, 900])(
  'collapsing table details preserves other object data and disclosure focus at %i pixels',
  async (width) => {
    await open(width);
    await readObject('Alex');
    await closeObject('Alex');
    await expect.element(page.getByRole('button', { name: 'Alex', exact: true })).toHaveFocus();
    const other = await readObject('Tonmoln');
    await expect
      .element(other.getByRole('heading', { name: 'Tonmoln · alla uppgifter', exact: true }))
      .toBeVisible();
    await expect.element(other.getByText('Tonmoln', { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole('region', { name: 'Uppgifter för Alex', exact: true }))
      .not.toBeInTheDocument();
    await closeObject('Tonmoln');
    await expect.element(page.getByRole('button', { name: 'Tonmoln', exact: true })).toHaveFocus();
    await openMap();
    await expect
      .element(page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }))
      .toBeVisible();
    await expect.element(page.getByLabelText(/^Öppna paneler/)).not.toBeInTheDocument();
  },
);

test('native relationship loss is guarded and map relationship selection preserves unsent type forms', async () => {
  await open(1440, {
    ...state,
    relationshipTypes: [
      {
        id: 'uses',
        householdId: 'home',
        revision: 1,
        name: 'Använder',
        description: '',
        forwardLabel: 'Använder',
        reverseLabel: 'Används av',
      },
    ],
    relationships: [
      {
        id: 'use',
        householdId: 'home',
        revision: 1,
        sourceId: 'alex',
        targetId: 'music',
        typeId: 'uses',
      },
    ],
  });
  await page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }).click();
  await openTable();
  await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
  await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
  const query = dialog.getByLabelText('Sök det andra objektet', { exact: true });
  await query.fill('Tonmoln');
  await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
  await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
  await expect.element(query).toHaveValue('Tonmoln');
  await expect.element(dialog).toBeVisible();
  expect(dialog.element().matches(':modal')).toBe(true);
  await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
  await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
  await openMap();
  await page.getByRole('button', { name: /^Välj samband:/ }).click();
  for (const scenario of [
    {
      action: 'Ny objekttyp',
      label: 'Typens namn',
      value: 'Oskickad typ',
      close: 'Stäng typformuläret utan att skicka',
    },
    {
      action: 'Ny sambandstyp',
      label: 'Sambandstypens namn',
      value: 'Oskickat samband',
      close: 'Stäng sambandstypen utan att skicka',
    },
  ]) {
    await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
    await page.getByRole('button', { name: scenario.action, exact: true }).click();
    const field = page.getByLabelText(scenario.label, { exact: true });
    await field.fill(scenario.value);
    await page.getByRole('button', { name: 'Tillbaka till kartan', exact: true }).click();
    await page.getByRole('button', { name: /^Välj samband:/ }).click();
    await page.getByRole('button', { name: 'Inställningar', exact: true }).click();
    await expect.element(field).toHaveValue(scenario.value);
    await page.getByRole('button', { name: scenario.close, exact: true }).click();
    await page.getByRole('button', { name: 'Tillbaka till kartan', exact: true }).click();
  }
});

test('phone editing retains text during resize and canceled loss, and confirmed loss removes the unsent edit', async () => {
  await open(390);
  await editObject('Alex');
  const name = page.getByLabelText('Namn', { exact: true });
  await expect.element(name).toHaveFocus();
  await name.fill('Alex ändrat');
  await page.viewport(320, 500);
  await expect.element(name).toHaveValue('Alex ändrat');
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  const form = page.getByRole('dialog', { name: 'Redigera Alex', exact: true });
  await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
  await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
  await expect.element(name).toHaveValue('Alex ändrat');
  await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
  await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
  await page.getByRole('button', { name: 'Redigera Alex', exact: true }).click();
  await expect.element(name).toHaveValue('Alex');
  await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
  await openMap();
  await expect
    .element(page.getByRole('region', { name: 'Teckenförklaring i kartan', exact: true }))
    .toBeVisible();
  expect(document.querySelector('.spatial-surface')?.getBoundingClientRect().width).toBeGreaterThan(
    290,
  );
});

test('landscape toolbar controls preserve canvas height and reachable navigation', async ({
  onTestFinished,
}) => {
  const session = cdp();
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  onTestFinished(async () => {
    await session.send('Emulation.setEmulatedMedia', { features: [] });
  });
  await open(640);
  await page.viewport(640, 390);
  await page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }).click();
  const reset = page.getByRole('button', { name: 'Återställ vy', exact: true });
  reset.element().focus();
  await expect.element(reset).toHaveFocus();
  await reset.click();
  const height = () => document.querySelector('canvas')?.getBoundingClientRect().height;
  await expect.poll(height).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Markera objekt: Alex', exact: true }).click();
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  const heightHelp = page.getByLabelText('Visa höjdhjälp', { exact: true });
  await heightHelp.click();
  await expect.element(heightHelp).toBeChecked();
  await expect.element(heightHelp).toBeInViewport();
  await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  await expect.poll(height).toBeGreaterThan(200);
});

test('full map fills the available desktop and landscape phone area', async () => {
  await open(1280);
  const surface = () => document.querySelector('.spatial-surface')?.getBoundingClientRect();
  await expect.poll(() => surface()?.width).toBeGreaterThan(1200);
  await page.viewport(844, 390);
  await expect.poll(() => surface()?.width).toBeGreaterThan(800);
  await expect.poll(() => surface()?.height).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }).click();
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }))
    .toBeVisible();
  await expect.element(page.getByLabelText('Namn', { exact: true })).not.toBeInTheDocument();
  await editObject('Alex');
  await expect.element(page.getByLabelText('Namn', { exact: true })).toHaveValue('Alex');
  const work = page.getByRole('dialog', { name: 'Redigera Alex', exact: true });
  await expect.element(work).toBeVisible();
  expect(work.element().getBoundingClientRect().height).toBeLessThanOrEqual(390);
  expect(work.element().getBoundingClientRect().width).toBeLessThan(844);
  await keyboardReach(work.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }));
  await work.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
  await openMap();
  await expect.element(page.getByRole('button', { name: 'Karta', exact: true })).toHaveFocus();
});
