import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings, type PersonalView } from '../../src/shared/personal-view.js';
import { openConversationText } from '../support/conversation-browser.js';

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
      description: '',
    },
    {
      id: 'music',
      householdId: 'home',
      typeId: 'service',
      revision: 1,
      name: 'Tonmoln',
      description: '',
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
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: 1,
        positions,
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/text-assistant')) return Response.json({ available: true });
    if (url.includes('/map?')) return Response.json(mapState);
    throw new Error(`Unexpected request: ${url}`);
  });
  render(
    <main>
      <section className="panel household-panel">
        <HouseholdMap householdId="home" />
      </section>
    </main>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('camera focus includes previous direct neighbors and preserves work through overview and compact tool expansion', async () => {
  const mapState = structuredClone(state);
  const type = { ...state.types[0], id: 'uses', name: 'Använder' };
  const edge = {
    id: 'edge',
    householdId: 'home',
    revision: 1,
    typeId: type.id,
    sourceId: 'alex',
    targetId: 'music',
    knowledge: 'known' as const,
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
      after: { ...edge, targetId: null, knowledge: 'unknown' },
      type,
    },
  ];
  await open(1440, mapState, [
    { id: 'alex', x: 8, y: 4, z: 10, version: 1 },
    { id: 'music', x: -4, y: -6, z: 3, version: 1 },
    { id: 'far', x: -60, y: 20, z: -40, version: 1 },
  ]);
  await page.getByRole('button', { name: 'Stäng vägledningen', exact: true }).click();
  const alex = page.getByRole('button', { name: 'Välj objekt: Alex', exact: true });
  const music = page.getByRole('button', { name: 'Välj objekt: Tonmoln', exact: true });
  const focus = page.getByRole('button', { name: 'Fokusera markering', exact: true });
  const position = (node: typeof alex) => {
    const box = node.element().getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const separation = () =>
    Math.hypot(position(alex).x - position(music).x, position(alex).y - position(music).y);
  await expect.element(focus).toBeDisabled();
  await alex.click();
  const initialSeparation = separation();
  await page.getByRole('button', { name: 'Visa detaljer', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Alex', exact: true });
  await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
  const description = panel.getByLabelText('Beskrivning', { exact: true });
  await description.fill('Oskickat under kamerafokus');
  const panelBox = panel.element().getBoundingClientRect().toJSON();
  await focus.click();
  await expect.poll(separation).toBeGreaterThan(initialSeparation * 2);
  expect(panel.element().getBoundingClientRect().toJSON()).toEqual(panelBox);
  for (const node of [alex, music]) {
    expect(position(node).x).toBeGreaterThan(112);
    expect(position(node).x).toBeLessThan(1360);
    expect(position(node).y).toBeGreaterThan(90);
    expect(position(node).y).toBeLessThan(830);
  }
  await expect.element(music).toHaveAttribute('aria-pressed', 'false');
  const focused = position(alex);
  await page.getByRole('button', { name: 'Visa hela kartan', exact: true }).click();
  await focus.click();
  await page.getByRole('button', { name: 'Återgå till föregående vy', exact: true }).click();
  await expect
    .element(page.getByRole('button', { name: 'Visa hela kartan', exact: true }))
    .toBeVisible();
  expect(position(alex)).toEqual(focused);
  await expect.element(description).toHaveValue('Oskickat under kamerafokus');
  await expect.element(alex).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await page.viewport(320, 250);
  await page.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
  (focus.element() as HTMLElement).focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(focus).toHaveFocus();
  await expect
    .element(page.getByRole('button', { name: 'Visa verktygens namn', exact: true }))
    .toBeVisible();
  for (const node of [alex, music]) {
    await expect.poll(() => position(node).y).toBeGreaterThanOrEqual(110);
    await expect.poll(() => position(node).y).toBeLessThanOrEqual(172);
    await node.hover();
  }
});

test('compact profile returns to visible work and dismisses before keyboard focus enters the map', async () => {
  await open(1440);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
  const name = page.getByLabelText('Objektets namn', { exact: true });
  await name.fill('Oskickad profiltext');
  const profileButton = page.getByRole('button', { name: 'Din profil', exact: true });
  const profile = page.getByRole('region', { name: 'Din profil', exact: true });
  await profileButton.click();
  await expect
    .element(profile.getByRole('heading', { name: 'Din profil', exact: true }))
    .toHaveFocus();
  await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
  await expect.element(name).toHaveFocus();
  await expect.element(name).toHaveValue('Oskickad profiltext');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  for (const target of [
    page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }),
    page.getByRole('button', { name: 'Prata med Skyttel', exact: true }),
  ]) {
    (target.element() as HTMLElement).focus();
    await profileButton.click();
    await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect.element(target).toHaveFocus();
    await expect.element(name).not.toBeVisible();
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
  const details = page
    .getByRole('navigation', { name: 'Kartans verktyg' })
    .getByRole('button', { name: 'Visa detaljer', exact: true });
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
  await expect.element(details).toHaveAttribute('aria-pressed', 'false');
  await music.click({ modifiers: ['Meta'] });
  await expect.element(music).toHaveAttribute('aria-pressed', 'false');
  await music.click();
  await expect.element(alex).toHaveAttribute('aria-pressed', 'false');
  await music.dblClick();
  await expect.element(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
  await panel.getByLabelText('Beskrivning', { exact: true }).fill('Oskickat arbete');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await alex.click({ modifiers: ['Control', 'Alt'] });
  await expect.element(page.getByRole('region', { name: 'Alex', exact: true })).toBeVisible();
  await expect.element(music).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await music.click({ modifiers: ['Meta', 'Alt'] });
  await expect
    .element(panel.getByLabelText('Beskrivning', { exact: true }))
    .toHaveValue('Oskickat arbete');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await alex.click({ button: 'right', modifiers: ['Control'] });
  await expect.element(alex).toHaveAttribute('aria-pressed', 'false');
  await expect.element(details).toHaveAttribute('aria-pressed', 'false');
  // Some platforms follow the context-menu gesture with a click from the same press.
  alex
    .element()
    .dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true, detail: 1 }));
  await expect.element(alex).toHaveAttribute('aria-pressed', 'false');
  await alex.click({ button: 'right', modifiers: ['Control', 'Alt'] });
  await expect.element(page.getByRole('region', { name: 'Alex', exact: true })).toBeVisible();
  await expect.element(alex).toHaveAttribute('aria-pressed', 'true');
  await expect.element(music).toHaveAttribute('aria-pressed', 'true');
  expect(positions()).toEqual(before);
});

test('desktop keeps the map and bounded conversation, object and list panels available', async () => {
  await open(1440);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  const surface = document.querySelector('.spatial-surface');
  const list = page.getByRole('region', { name: 'Lista och utkast', exact: true });
  await expect.element(list).toBeVisible();
  expect(surface).not.toBeNull();
  const bounds = surface?.getBoundingClientRect();
  expect(bounds?.width).toBeGreaterThan(1300);
  await openConversationText();
  const speech = page.getByRole('region', { name: 'Talsamtal' }).element().getBoundingClientRect();
  expect(speech.height).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await list.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
  const object = page.getByRole('region', { name: 'Alex', exact: true });
  await expect.element(object.getByText('Namn: Alex', { exact: true })).toBeVisible();
  for (const panel of [
    list,
    object,
    page.getByRole('region', { name: 'Samtal och text', exact: true }),
  ]) {
    await expect.element(panel).toBeVisible();
    const box = panel.element().getBoundingClientRect();
    expect(box.width).toBeGreaterThan(250);
    expect(box.width).toBeLessThan(600);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(1440);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(960);
  }
  await expect
    .element(page.getByLabelText('Objektets namn', { exact: true }))
    .not.toBeInTheDocument();
});

test.each([320, 390, 1440])(
  'returning to an open object from the list focuses its heading at %i pixels',
  async (width) => {
    await open(width);
    const listButton = page.getByRole('button', { name: 'Lista', exact: true });
    const list = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    await listButton.click();
    await list.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
    const object = page.getByRole('region', { name: 'Alex', exact: true });
    await object.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    const name = object.getByLabelText('Objektets namn', { exact: true });
    await name.fill('Alex oskickat');
    await expect.element(name).toHaveFocus();
    await listButton.click();
    const entry = list.getByRole('button', { name: 'Uppgifter för Alex', exact: true });
    entry.element().focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(object.getByRole('heading', { name: 'Alex', exact: true })).toHaveFocus();
    await expect.element(name).toHaveValue('Alex oskickat');
    await name.click();
    await userEvent.keyboard(' kvar');
    await expect.element(name).toHaveFocus();
    await expect.element(name).toHaveValue('Alex oskickat kvar');
  },
);

test('opening an editor does not redirect typing after the user chooses another field', async ({
  onTestFinished,
}) => {
  await open(1440);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
  const object = page.getByRole('region', { name: 'Alex', exact: true });
  const panel = object.element();
  // Choose the description as soon as it appears, before the next paint.
  // Initial name focus must finish with the form commit, not steal this choice later.
  const observer = new MutationObserver(() => {
    const description = panel.querySelector('textarea');
    if (!description) return;
    observer.disconnect();
    description.focus();
  });
  observer.observe(panel, { childList: true, subtree: true });
  onTestFinished(() => observer.disconnect());
  await object.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await userEvent.keyboard('Min oskickade text');
  await expect
    .element(object.getByLabelText('Beskrivning', { exact: true }))
    .toHaveValue('Min oskickade text');
  await expect
    .element(object.getByLabelText('Objektets namn', { exact: true }))
    .toHaveValue('Alex');
  await expect.element(object.getByLabelText('Beskrivning', { exact: true })).toHaveFocus();
});

test.each(['chooser', 'close', 'finish'] as const)(
  '%s panel transition preserves a newer choice to type in search',
  async (transition) => {
    await open(390);
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
    const object = page.getByRole('region', { name: 'Alex', exact: true });
    if (transition === 'finish')
      await object.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    const work = document.querySelector<HTMLElement>('.workspace-window[data-window-id="work"]');
    const search = page.getByLabelText('Sök objekt', { exact: true }).element();
    if (!work || !search) throw new Error('The retained list and search must exist');
    const observer = new MutationObserver(() => {
      if (work.hidden) return;
      observer.disconnect();
      search.focus();
    });
    observer.observe(work, { attributes: true });
    onTestFinished(() => observer.disconnect());
    if (transition === 'chooser')
      await page
        .getByLabelText(/^Öppna paneler/)
        .selectOptions(page.getByRole('option', { name: 'Lista och utkast', exact: true }));
    else if (transition === 'close')
      await object.getByRole('button', { name: 'Stäng Alex', exact: true }).click();
    else
      await object
        .getByRole('button', { name: 'Stäng utan att skicka texten', exact: true })
        .click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await userEvent.keyboard('Min sökning');
    await expect
      .element(page.getByLabelText('Sök objekt', { exact: true }))
      .toHaveValue('Min sökning');
    await expect.element(page.getByLabelText('Sök objekt', { exact: true })).toHaveFocus();
  },
);

test('short list flow restores the used result and yields to an explicit search request', async () => {
  await open(320, {
    ...state,
    objects: Array.from({ length: 50 }, (_, index) => ({
      ...state.objects[0],
      id: `object-${index}`,
      name: `Objekt ${String(index).padStart(2, '0')}`,
    })),
  });
  await page.viewport(320, 250);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
  const details = work.getByRole('button', { name: 'Uppgifter för Objekt 45', exact: true });
  details.element().scrollIntoView({ block: 'center' });
  details.element().focus();
  const flow = page.getByRole('region', { name: 'Hushållskarta', exact: true }).element();
  const remembered = flow.scrollTop;
  expect(remembered).toBeGreaterThan(500);
  await details.click();
  await page.getByLabelText(/^Öppna paneler/).selectOptions('work');
  expect(flow.scrollTop).toBe(remembered);
  await expect.element(details).toHaveFocus();
  const bounds = details.element().getBoundingClientRect();
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(innerHeight);
  expect(
    details
      .element()
      .contains(
        document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
      ),
  ).toBe(true);
  const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
  await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
  await tools.getByRole('button', { name: 'Sök i kartan', exact: true }).click();
  await expect.element(work.getByLabelText('Sök objekt', { exact: true })).toHaveFocus();
});

test('a smaller desktop keeps the panel reachable and restores its chosen position when widened', async () => {
  await open(1440);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
  const object = page.getByRole('region', { name: 'Alex', exact: true });
  const handle = object.getByRole('button', { name: 'Flytta Alex', exact: true });
  handle.element().focus();
  await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}');
  const chosen = object.element().getBoundingClientRect();
  expect(chosen.right).toBeGreaterThan(900);
  await page.viewport(900, 960);
  await expect.poll(() => object.element().getBoundingClientRect().right).toBeLessThanOrEqual(900);
  const fitted = object.element().getBoundingClientRect();
  expect(fitted.left).toBeGreaterThanOrEqual(0);
  expect(fitted.left).toBeLessThan(chosen.left);
  await page.viewport(1440, 960);
  await expect.poll(() => object.element().getBoundingClientRect().left).toBe(chosen.left);
  expect(object.element().getBoundingClientRect().top).toBe(chosen.top);
});

test('panel placement has reversible keyboard and click controls with a reset and focus return', async () => {
  await open(1440);
  // Leave room below the object's new nearby panel for both movement
  // directions even while the optional move controls are expanded.
  await page.viewport(1440, 1400);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
  const object = page.getByRole('region', { name: 'Alex', exact: true });
  const handle = object.getByRole('button', { name: 'Flytta Alex', exact: true });
  const position = () => {
    const { x, y } = object.element().getBoundingClientRect();
    return { x, y };
  };
  const initial = position();
  handle.element().focus();
  await userEvent.keyboard('{ArrowLeft}');
  const shortStep = initial.x - position().x;
  expect(shortStep).toBeGreaterThan(0);
  await userEvent.keyboard('{ArrowRight}');
  expect(position()).toEqual(initial);
  await userEvent.keyboard('{ArrowDown}');
  expect(position().y).toBeGreaterThan(initial.y);
  await userEvent.keyboard('{ArrowUp}');
  expect(position()).toEqual(initial);
  await userEvent.keyboard('{Shift>}{ArrowLeft}{ArrowDown}{/Shift}');
  expect(initial.x - position().x).toBeGreaterThan(shortStep);
  expect(position().y - initial.y).toBeGreaterThan(shortStep);
  await expect.element(page.getByText(/^Panelens position:/)).toBeInTheDocument();

  await userEvent.keyboard('{Enter}');
  await expect.element(handle).toHaveAttribute('aria-expanded', 'true');
  const beforeClicks = position();
  await object.getByRole('button', { name: 'Vänster', exact: true }).click();
  expect(position().x).toBeLessThan(beforeClicks.x);
  await object.getByRole('button', { name: 'Höger', exact: true }).click();
  expect(position()).toEqual(beforeClicks);
  await object.getByRole('button', { name: 'Nedåt', exact: true }).click();
  expect(position().y).toBeGreaterThan(beforeClicks.y);
  await object.getByRole('button', { name: 'Uppåt', exact: true }).click();
  expect(position()).toEqual(beforeClicks);
  await object.getByRole('button', { name: 'Återställ position', exact: true }).click();
  expect(position()).toEqual(initial);
  await expect
    .element(page.getByText('Panelens position återställd.', { exact: true }))
    .toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  await expect.element(handle).toHaveFocus();
  await expect.element(handle).toHaveAttribute('aria-expanded', 'false');
  await userEvent.keyboard('{Enter}{Escape}');
  await expect.element(handle).toHaveFocus();
  await expect.element(handle).toHaveAttribute('aria-expanded', 'false');
  expect(position()).toEqual(initial);
});

test('desktop panels reserve only the status column and retain chosen positions as the card changes', async () => {
  await open(1440);
  await page.getByRole('button', { name: 'Stäng vägledningen', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
  const status = page.getByRole('region', { name: 'Aktuell status', exact: true });
  const handle = work.getByRole('button', { name: 'Flytta Lista och utkast', exact: true });
  const box = () => work.element().getBoundingClientRect();
  handle.element().focus();
  await userEvent.keyboard(`{Shift>}${'{ArrowDown}'.repeat(20)}{/Shift}`);
  expect(box().right).toBeLessThan(status.element().getBoundingClientRect().left);
  expect(box().bottom).toBeGreaterThan(status.element().getBoundingClientRect().top);

  await userEvent.keyboard(`{Shift>}${'{ArrowRight}'.repeat(25)}{/Shift}`);
  await expect
    .poll(() => box().bottom)
    .toBeLessThanOrEqual(status.element().getBoundingClientRect().top - 12);
  expect(box().right).toBeGreaterThan(status.element().getBoundingClientRect().left);
  const body = work.element().querySelector<HTMLElement>('.workspace-panel-body');
  expect(body?.scrollHeight).toBeGreaterThan(body?.clientHeight ?? 0);
  const chosen = box().toJSON();

  await page.getByRole('button', { name: 'Aktuell status', exact: true }).click();
  await expect
    .poll(() => box().bottom)
    .toBeLessThanOrEqual(status.element().getBoundingClientRect().top - 12);
  expect(box().height).toBeLessThan(chosen.height);
  await page.getByRole('button', { name: 'Stäng aktuell status', exact: true }).click();
  await expect.poll(() => box().toJSON()).toEqual(chosen);
  await page.viewport(900, 960);
  await expect.poll(() => box().right).toBeLessThanOrEqual(876);
  await expect
    .poll(() => box().bottom)
    .toBeLessThanOrEqual(status.element().getBoundingClientRect().top - 12);
  await page.viewport(1440, 960);
  await expect.poll(() => box().toJSON()).toEqual(chosen);
  await handle.click();
  await work.getByRole('button', { name: 'Återställ position', exact: true }).click();
  expect(box().x).toBe(112);
  expect(box().y).toBe(110);
});

test.each([390, 250])(
  'wide short work at %i pixels keeps panel actions and status reachable',
  async (height) => {
    await open(1440);
    await page.getByRole('button', { name: 'Stäng vägledningen', exact: true }).click();
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    work.getByRole('button', { name: 'Flytta Lista och utkast', exact: true }).element().focus();
    await userEvent.keyboard(`{Shift>}${'{ArrowRight}'.repeat(25)}{/Shift}`);
    await page.getByRole('button', { name: 'Aktuell status', exact: true }).click();
    await page.viewport(1440, height);
    const handle = work.getByRole('button', { name: 'Flytta Lista och utkast', exact: true });
    await handle.click();
    await expect.element(handle).toHaveAttribute('aria-expanded', 'true');
    await handle.click();
    await work.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabelText('Objektets namn').fill('Behåll bred text');
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await page.getByRole('button', { name: 'Stäng aktuell status', exact: true }).click();
    await expect.element(page.getByLabelText('Objektets namn')).toHaveValue('Behåll bred text');
  },
);

test('native panel dragging moves only the held primary pointer and recovers after touch cancellation', async () => {
  await open(1440);
  // Leave room for the movement disclosure above the persistent status card.
  await page.viewport(1440, 1600);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
  const object = page.getByRole('region', { name: 'Alex', exact: true });
  const handle = object.getByRole('button', { name: 'Flytta Alex', exact: true });
  const position = () => {
    const { x, y } = object.element().getBoundingClientRect();
    return { x, y };
  };
  const pointerStart = () => {
    const box = handle.element().getBoundingClientRect();
    const frame = window.frameElement?.getBoundingClientRect();
    return { x: box.x + 35 + (frame?.x ?? 0), y: box.y + 20 + (frame?.y ?? 0) };
  };
  const session = cdp();
  const before = position();
  let start = pointerStart();
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...start,
    button: 'right',
    buttons: 2,
    clickCount: 1,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: start.x - 30,
    y: start.y + 20,
    button: 'right',
    buttons: 2,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: start.x - 30,
    y: start.y + 20,
    button: 'right',
    buttons: 0,
  });
  expect(position()).toEqual(before);
  await userEvent.keyboard('{Escape}');
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...start,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: start.x + 1,
    y: start.y + 1,
    button: 'left',
    buttons: 1,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: start.x + 1,
    y: start.y + 1,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  expect(position()).toEqual(before);
  await expect.element(handle).toHaveAttribute('aria-expanded', 'true');
  await handle.click();
  await expect.element(handle).toHaveAttribute('aria-expanded', 'false');

  start = pointerStart();
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...start,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: start.x - 80,
    y: start.y + 30,
    button: 'left',
    buttons: 1,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: start.x - 80,
    y: start.y + 30,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await expect.poll(position).toEqual({ x: before.x - 80, y: before.y + 30 });
  await expect.element(handle).toHaveAttribute('aria-expanded', 'false');
  const dragged = position();
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: start.x - 100,
    y: start.y + 50,
    buttons: 0,
  });
  expect(position()).toEqual(dragged);

  start = pointerStart();
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, ...start }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ id: 1, x: start.x - 30, y: start.y + 20 }],
  });
  await expect.poll(position).toEqual({ x: dragged.x - 30, y: dragged.y + 20 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  const cancelled = position();
  await handle.click();
  await expect.element(handle).toHaveAttribute('aria-expanded', 'true');
  expect(position()).toEqual(cancelled);
  await object.getByRole('button', { name: 'Återställ position', exact: true }).click();
  expect(position()).toEqual(before);
  await userEvent.keyboard('{Escape}');
  await expect.element(handle).toHaveAttribute('aria-expanded', 'false');
  expect(position()).toEqual(before);
});

test('keyboard focus and pointer activation bring an overlapping object panel to the front', async () => {
  await open(900);
  const list = page.getByRole('button', { name: 'Lista', exact: true });
  await list.click();
  await page.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
  await list.click();
  await page.getByRole('button', { name: 'Uppgifter för Tonmoln', exact: true }).click();
  const alex = page.getByRole('region', { name: 'Alex', exact: true });
  const music = page.getByRole('region', { name: 'Tonmoln', exact: true });
  const handle = alex.getByRole('button', { name: 'Flytta Alex', exact: true });
  // Arrange an exposed lower edge even when both panels initially clamp above status.
  handle.element().focus();
  await userEvent.keyboard('{Shift>}{ArrowUp}{ArrowUp}{/Shift}');
  music.getByRole('button', { name: 'Flytta Tonmoln', exact: true }).element().focus();
  await expect.element(music).toHaveAttribute('data-active', 'true');
  const first = alex.element().getBoundingClientRect();
  const second = music.element().getBoundingClientRect();
  const overlap = {
    x: Math.max(first.left, second.left) + 30,
    y: Math.max(first.top, second.top) + 20,
  };
  expect(overlap.x).toBeLessThan(Math.min(first.right, second.right));
  expect(overlap.y).toBeLessThan(Math.min(first.bottom, second.bottom));
  const foreground = () => document.elementFromPoint(overlap.x, overlap.y);
  expect(music.element().contains(foreground())).toBe(true);
  handle.element().focus();
  await expect.element(handle).toHaveFocus();
  await expect.poll(() => alex.element().contains(foreground())).toBe(true);

  // The lower edge is exposed even while the other panel covers its heading.
  expect(second.bottom).toBeGreaterThan(first.bottom);
  expect(
    music.element().contains(document.elementFromPoint(second.left + 20, second.bottom - 10)),
  ).toBe(true);
  const frame = window.frameElement?.getBoundingClientRect();
  const point = { x: second.left + 20 + (frame?.x ?? 0), y: second.bottom - 10 + (frame?.y ?? 0) };
  const session = cdp();
  await session.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    buttons: 1,
    clickCount: 1,
  });
  await session.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    buttons: 0,
    clickCount: 1,
  });
  await expect.poll(() => music.element().contains(foreground())).toBe(true);
});

test.each([390, 900])(
  'closing panels preserves the others and returns focus after the last close at %i pixels',
  async (width) => {
    await open(width);
    const listButton = page.getByRole('button', { name: 'Lista', exact: true });
    const list = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    await listButton.click();
    await list.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
    await listButton.click();
    await list.getByRole('button', { name: 'Uppgifter för Tonmoln', exact: true }).click();
    const chooser = page.getByLabelText(/^Öppna paneler/);
    await chooser.selectOptions(page.getByRole('option', { name: 'Alex', exact: true }));
    await page.getByRole('button', { name: 'Stäng Alex', exact: true }).click();
    await expect.element(page.getByRole('region', { name: 'Tonmoln', exact: true })).toBeVisible();
    await expect
      .element(page.getByRole('region', { name: 'Alex', exact: true }))
      .not.toBeInTheDocument();
    await expect.element(chooser).toHaveValue('music');
    await expect
      .element(width < 700 ? chooser : page.getByRole('heading', { name: 'Tonmoln', exact: true }))
      .toHaveFocus();
    await page.getByRole('button', { name: 'Stäng Tonmoln', exact: true }).click();
    await expect.element(list).toBeVisible();
    await expect
      .element(
        width < 700
          ? chooser
          : list.getByRole('heading', { name: 'Lista och utkast', exact: true }),
      )
      .toHaveFocus();
    await page.getByRole('button', { name: 'Stäng Lista och utkast', exact: true }).click();
    await expect.element(listButton).toHaveFocus();
    await expect.element(chooser).not.toBeVisible();
    await expect
      .element(page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }))
      .toBeVisible();
  },
);

test('selecting a map relationship preserves unsent relationship and type forms', async () => {
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
        knowledge: 'known',
      },
    ],
  });
  await page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }).click();
  const listButton = page.getByRole('button', { name: 'Lista', exact: true });
  for (const scenario of [
    {
      action: 'Nytt samband',
      label: 'Från objekt',
      value: 'alex',
      close: 'Stäng sambandet utan att skicka',
    },
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
    await listButton.click();
    await page.getByRole('button', { name: scenario.action, exact: true }).click();
    const field = page.getByLabelText(scenario.label, { exact: true });
    if (scenario.label === 'Från objekt')
      await field.selectOptions(field.getByRole('option', { name: 'Alex (Person)', exact: true }));
    else await field.fill(scenario.value);
    await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
    await page.getByRole('button', { name: /^Välj samband:/ }).click();
    await listButton.click();
    await expect.element(field).toHaveValue(scenario.value);
    await page.getByRole('button', { name: scenario.close, exact: true }).click();
  }
});

test('phone opens the list from the map and preserves an edited name through map navigation', async () => {
  await open(390);
  await expect
    .element(page.getByRole('button', { name: 'Nytt objekt', exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Uppgifter för Alex', exact: true }).click();
  const object = page.getByRole('region', { name: 'Alex', exact: true });
  await expect.element(object.getByRole('heading', { name: 'Alex', exact: true })).toHaveFocus();
  object.getByRole('button', { name: 'Redigera valt objekt', exact: true }).element().focus();
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByLabelText('Objektets namn', { exact: true })).toHaveFocus();
  await page.getByLabelText('Objektets namn', { exact: true }).fill('Alex ändrat');
  const objectElement = object.element();
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await expect
    .element(
      page.getByRole('region', { name: 'Samtal och text', exact: true, includeHidden: true }),
    )
    .not.toBeVisible();
  await expect
    .element(page.getByRole('region', { name: 'Aktuell status', exact: true }))
    .toBeVisible();
  await expect.element(page.elementLocator(objectElement)).not.toBeVisible();
  const bounds = document.querySelector('.spatial-surface')?.getBoundingClientRect();
  expect(bounds?.height).toBeGreaterThan(500);
  expect(bounds?.width).toBeGreaterThan(340);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page
    .getByLabelText(/^Öppna paneler/)
    .selectOptions(page.getByRole('option', { name: 'Alex', exact: true }));
  await expect
    .element(page.getByLabelText('Objektets namn', { exact: true }))
    .toHaveValue('Alex ändrat');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await openConversationText();
  await expect.element(page.getByRole('region', { name: 'Talsamtal' })).toBeVisible();
  await page
    .getByLabelText(/^Öppna paneler/)
    .selectOptions(page.getByRole('option', { name: 'Alex', exact: true }));
  await expect
    .element(page.getByLabelText('Objektets namn', { exact: true }))
    .toHaveValue('Alex ändrat');
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});

test('landscape display options preserve canvas height and reachable controls', async ({
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
  await page.getByText('Visningsval', { exact: true }).click();
  const toolbar = document.querySelector('.spatial-bottom-bar') as HTMLElement;
  await expect.poll(() => toolbar.scrollWidth <= toolbar.clientWidth).toBe(true);
  const height = () => document.querySelector('canvas')?.getBoundingClientRect().height;
  await expect.poll(height).toBeGreaterThan(200);
  const heightHelp = page.getByLabelText('Visa höjdhjälp', { exact: true });
  await heightHelp.click();
  await expect.element(heightHelp).toBeChecked();
  await expect.element(heightHelp).toBeInViewport();
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
  await expect
    .element(page.getByLabelText('Objektets namn', { exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page
    .getByRole('region', { name: 'Lista och utkast', exact: true })
    .getByRole('button', { name: 'Uppgifter för Alex', exact: true })
    .click();
  const object = page.getByRole('region', { name: 'Alex', exact: true });
  await object.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
  await expect.element(page.getByLabelText('Objektets namn', { exact: true })).toHaveValue('Alex');
  const work = object;
  await expect.element(work).toBeVisible();
  expect(work.element().getBoundingClientRect().height).toBeLessThanOrEqual(390);
  expect(work.element().getBoundingClientRect().width).toBeLessThan(844);
  await page.viewport(844, 140);
  const name = page.getByLabelText('Objektets namn', { exact: true });
  await expect.poll(() => name.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  await expect.poll(() => name.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(140);
  await expect.element(name).toHaveValue('Alex');
  await page.viewport(844, 390);
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await expect.element(page.getByRole('button', { name: 'Lista', exact: true })).toHaveFocus();
});
