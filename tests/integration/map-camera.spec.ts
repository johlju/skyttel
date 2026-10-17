import type { Locator, Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openMap, openTable, setAllLabels, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { mapFilters } from '../support/object-search.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function arrange(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  const state = await read();
  for (const [id, name] of [
    ['lo', 'Lo Exempel'],
    ['kim', 'Kim Exempel'],
    ['alex', 'Alex Exempel'],
    ['far', 'Långt borta'],
  ]) {
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version: (await read()).draft.version,
            id,
            baseRevision: null,
            value: { name, description: '', typeId: state.types[0].id },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  for (const [id, sourceId, targetId] of [
    ['lo-kim', 'lo', 'kim'],
    ['kim-far', 'kim', 'far'],
  ]) {
    expect(
      (
        await page.request.post(`${path}/relationship`, {
          headers: { origin },
          data: {
            version: (await read()).draft.version,
            id,
            baseRevision: null,
            value: {
              sourceId,
              targetId,
              knowledge: 'known',
              typeId: state.relationshipTypes[0].id,
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  expect(
    (
      await page.request.post(`${path}/save`, {
        headers: { origin },
        data: { version: (await read()).draft.version, operationId: 'camera-fixture' },
      })
    ).ok(),
  ).toBe(true);
  const saved = await read();
  expect(saved.objects).toHaveLength(4);
  expect(saved.relationships).toHaveLength(2);
  for (const object of saved.objects) {
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version: (await read()).draft.version,
            id: object.id,
            baseRevision: object.revision,
            value: {
              name: object.name,
              typeId: object.typeId,
              description: 'Privat kameraförslag',
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  for (const edge of saved.relationships) {
    expect(
      (
        await page.request.post(`${path}/relationship`, {
          headers: { origin },
          data: {
            version: (await read()).draft.version,
            id: edge.id,
            baseRevision: edge.revision,
            value: {
              sourceId: edge.sourceId,
              targetId: edge.targetId,
              typeId: edge.typeId,
              knowledge: 'uncertain',
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  const privateWork = (await read()).draft;
  const privateRelationships = privateWork.relationships ?? [];
  expect(privateWork.changes).toHaveLength(4);
  expect(privateRelationships).toHaveLength(2);
  for (const change of privateWork.changes)
    expect(change.after?.description).toBe('Privat kameraförslag');
  for (const change of privateRelationships) expect(change.after?.knowledge).toBe('uncertain');
  const view = await (await page.request.get(`${path}/view`)).json();
  for (const [id, x, y, z] of [
    ['lo', 8, 4, 10],
    ['kim', -4, -6, 3],
    ['alex', 3, 9, -8],
    ['far', -60, 20, -40],
  ] as const) {
    expect(
      (
        await page.request.post(`${path}/view/position`, {
          headers: { origin },
          data: { id, contentVersion: view.contentVersion, version: 0, position: { x, y, z } },
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto(origin);
  await openMap(page);
  const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
  const lo = map.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
  // Native actionability waits for the initial ResizeObserver projection.
  await lo.click({ trial: true });
  return { map, lo, read, path };
}

async function openSelectionFocus(page: Page, object: Locator) {
  await object.focus();
  await page.keyboard.press('Shift+F10');
  return page.getByRole('button', { name: 'Fokusera markering', exact: true });
}

async function center(node: Locator) {
  const box = await node.boundingBox();
  if (!box) throw new Error('The object must have a visible position.');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('KAMERA-01: rotation keeps the selected personal position fixed on screen without a selection jump', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { map, lo, read } = await arrange(page, installation.origin);
    const initial = await center(lo);
    const content = await read();
    await lo.click();
    expect(await center(lo)).toEqual(initial);
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    const rotate = page.getByRole('button', { name: 'Rotera vänster', exact: true });
    await rotate.click();
    expect((await center(lo)).x).toBeCloseTo(initial.x, 5);
    expect((await center(lo)).y).toBeCloseTo(initial.y, 5);
    await rotate.focus();
    await page.keyboard.press('Enter');
    expect((await center(lo)).x).toBeCloseTo(initial.x, 5);
    expect((await center(lo)).y).toBeCloseTo(initial.y, 5);
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    expect(await read()).toEqual(content);
    await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
    await expect(map.getByText('Din personliga vy är sparad.', { exact: true })).toBeVisible();
    const moved = await center(lo);
    expect(moved).not.toEqual(initial);
    await page.getByRole('button', { name: 'Luta nedåt', exact: true }).click();
    expect(await center(lo)).toEqual(moved);
    expect(await read()).toEqual(content);
  } finally {
    await installation.close();
  }
});

test('KAMERA-02: focus fits only selection and direct neighbors while camera history preserves work', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { map, lo, read } = await arrange(page, installation.origin);
    const content = await read();
    const focus = page.getByRole('button', { name: 'Fokusera markering', exact: true });
    await openSelectionFocus(page, lo);
    await expect(focus).toBeDisabled();
    await page.keyboard.press('Escape');
    await lo.click();
    const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    const separation = async () => {
      const a = await center(lo);
      const b = await center(kim);
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const overview = await separation();
    await lo.dblclick();
    const panel = page.getByRole('region', { name: 'Lo Exempel', exact: true });
    await expect(panel).toContainText('Lo Exempel');
    await expect(panel).toContainText(content.types[0].name);
    await expect(panel.locator('.household-table-description')).toContainText(
      'Sparat: Ej uppgivet',
    );
    await expect(panel.locator('.household-table-description')).toContainText(
      'Ditt förslag: Privat kameraförslag',
    );
    const panelPosition = await panel.boundingBox();
    await openSelectionFocus(page, lo);
    await focus.click();
    await expect(map.getByRole('img', { name: /Rymdens bakgrund/ })).toBeFocused();
    expect(await panel.boundingBox()).toEqual(panelPosition);
    expect(await separation()).toBeGreaterThan(overview * 2);
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await expect(kim).toHaveAttribute('aria-pressed', 'false');
    for (const node of [lo, kim]) {
      const box = await node.boundingBox();
      if (!box) throw new Error('Focused object has no visible target');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1440);
      expect(box.y + box.height).toBeLessThanOrEqual(1000);
      await node.click({ trial: true });
    }
    const beforeNavigation = await center(lo);
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await page.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
    const previous = page.getByRole('button', { name: 'Föregående vy', exact: true });
    await previous.click();
    await previous.click();
    await expect(previous).toBeEnabled();
    expect((await center(lo)).x).toBeCloseTo(beforeNavigation.x, 5);
    expect((await center(lo)).y).toBeCloseTo(beforeNavigation.y, 5);
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await panel.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true });
    await form.getByLabel('Beskrivning', { exact: true }).fill('Oskickat under kamerafokus');
    await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect(
      loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Oskickat under kamerafokus',
    );
    expect(await read()).toEqual(content);
    await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    await loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(form).not.toBeVisible();
    expect(await center(lo)).toEqual(beforeNavigation);
    expect(await read()).toEqual(content);
  } finally {
    await installation.close();
  }
});

async function emptyPoint(page: Page) {
  return page.locator('.spatial-surface canvas').evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    for (let y = box.top + 180; y < box.bottom - 180; y += 30)
      for (let x = box.left + 40; x < box.right - 90; x += 30)
        if ([0, 2, 50].every((delta) => document.elementFromPoint(x + delta, y + delta) === canvas))
          return { x, y };
    throw new Error('An unobstructed real canvas target is required.');
  });
}

test('KAMERA-03: mouse and touch rotation preserve the pivot and narrow focus controls survive unavailable graphics', async ({
  browser,
}) => {
  const installation = await createInstallation();
  const context = await createPreparedContext(browser, {
    hasTouch: true,
    viewport: { width: 390, height: 1000 },
  });
  const page = await context.newPage();
  try {
    const { map, lo } = await arrange(page, installation.origin);
    const focus = page.getByRole('button', { name: 'Fokusera markering', exact: true });
    const cdp = await context.newCDPSession(page);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await lo.click();
      await openSelectionFocus(page, lo);
      await focus.click();
      const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
      for (const node of [lo, kim]) {
        await expect.poll(async () => (await center(node)).x).toBeGreaterThanOrEqual(32);
        await expect.poll(async () => (await center(node)).x).toBeLessThanOrEqual(width - 32);
        await expect.poll(async () => (await center(node)).y).toBeGreaterThanOrEqual(150);
        await expect.poll(async () => (await center(node)).y).toBeLessThanOrEqual(850);
      }
      await page.screenshot({ path: test.info().outputPath(`focused-${width}.png`) });
      for (const control of await page.locator('.spatial-view-actions button').all()) {
        const box = await control.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      }
      const initial = await center(lo);
      const point = await emptyPoint(page);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      expect(await center(lo)).toEqual(initial);
      await page.mouse.move(point.x + 2, point.y + 2);
      expect(await center(lo)).toEqual(initial);
      await page.mouse.move(point.x + 50, point.y + 50, { steps: 5 });
      await page.mouse.up();
      expect(await center(lo)).toEqual(initial);
      const touch = await emptyPoint(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
      expect(await center(lo)).toEqual(initial);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: touch.x + 50, y: touch.y + 50 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await center(lo)).toEqual(initial);
      await expect(lo).toHaveAttribute('aria-pressed', 'true');
      await openTable(page);
      await openMap(page);
      await openSelectionFocus(page, lo);
      await expect(focus).toBeEnabled();
      await page.keyboard.press('Escape');
    }
    const extension = await map
      .locator('canvas')
      .evaluateHandle((canvas: HTMLCanvasElement) =>
        canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context'),
      );
    await openSelectionFocus(page, lo);
    await extension.evaluate((value) => value?.loseContext());
    await expect(focus).toBeDisabled();
    await extension.evaluate((value) => value?.restoreContext());
    await expect(focus).toBeEnabled();
    await cdp.detach();
  } finally {
    await context.close();
    await installation.close();
  }
});

test('KAMERA-04: short viewports retain a usable focus rectangle and reachable camera and display controls', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 320, height: 1000 });
    const { lo, map, read, path } = await arrange(page, installation.origin);
    await lo.click();
    await page.setViewportSize({ width: 320, height: 250 });
    const focus = page.getByRole('button', { name: 'Fokusera markering', exact: true });
    await openSelectionFocus(page, lo);
    await focus.click({ trial: true });
    await focus.focus();
    await page.keyboard.press('Enter');
    await expect(map.getByRole('img', { name: /Rymdens bakgrund/ })).toBeFocused();
    const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    async function expectUsableFocus() {
      for (const node of [lo, kim]) {
        await expect.poll(async () => (await center(node)).x).toBeGreaterThanOrEqual(32);
        await expect.poll(async () => (await center(node)).x).toBeLessThanOrEqual(288);
        await expect.poll(async () => (await center(node)).y).toBeGreaterThanOrEqual(44);
        await expect.poll(async () => (await center(node)).y).toBeLessThanOrEqual(226);
        await node.click({ trial: true });
      }
    }
    await expectUsableFocus();
    await page.screenshot({ path: test.info().outputPath('short-focus.png') });
    const expand = page.getByRole('button', { name: 'Visa verktygens namn', exact: true });
    await expand.click();
    const previous = page.getByRole('button', { name: 'Föregående vy', exact: true });
    await previous.click();
    await expect(previous).toBeFocused();
    await expect(previous).toBeDisabled();
    await expect(expand).toBeVisible();
    await expand.click();
    await openSelectionFocus(page, lo);
    await focus.click();
    await expect(map.getByRole('img', { name: /Rymdens bakgrund/ })).toBeFocused();
    await expect(expand).toBeVisible();
    await expectUsableFocus();
    await setAllLabels(page, true);
    await setAllLabels(page, false);
    const beforeMoves = await read();
    for (const viewport of [
      { width: 640, height: 500 },
      { width: 320, height: 250 },
    ]) {
      await page.setViewportSize(viewport);
      await page.getByRole('button', { name: 'Navigera', exact: true }).click();
      const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
      const context = page.locator('.workspace-context');
      await expect
        .poll(async () => {
          const nav = await navigation.boundingBox();
          const status = await context.boundingBox();
          return Boolean(
            nav && status && (nav.x + nav.width <= status.x || status.x + status.width <= nav.x),
          );
        })
        .toBe(true);
      await context.focus();
      await expect(context).toBeFocused();
      await page.screenshot({
        path: test.info().outputPath(`navigation-status-${viewport.width}.png`),
      });
      for (const direction of ['vänster', 'höger', 'uppåt', 'nedåt', 'framåt', 'bakåt']) {
        const move = navigation.getByRole('button', {
          name: `Flytta Lo Exempel: ${direction}`,
          exact: true,
        });
        await move.focus();
        await move.click({ trial: true });
        const before = await (await page.request.get(`${path}/view`)).json();
        const version =
          before.positions.find((position: { id: string; version: number }) => position.id === 'lo')
            ?.version ?? 0;
        const applied = page.waitForResponse(
          (response) =>
            response.url() === `${path}/view/position` &&
            response.request().method() === 'POST' &&
            response.status() === 200,
        );
        await expect(move).toBeFocused();
        await page.keyboard.press('Enter');
        await applied;
        const after = await (await page.request.get(`${path}/view`)).json();
        expect(
          after.positions.find((position: { id: string; version: number }) => position.id === 'lo')
            ?.version,
        ).toBe(version + 1);
        await expect(move).toBeEnabled();
        await expect(move).toBeFocused();
        await move.click({ trial: true });
      }
      await page.screenshot({
        path: test.info().outputPath(`navigation-moves-${viewport.width}.png`),
      });
      expect(await read()).toEqual(beforeMoves);
      for (const departure of ['later-focus', 'closed']) {
        let release!: () => void;
        let committed!: () => void;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const actualCommit = new Promise<void>((resolve) => {
          committed = resolve;
        });
        await page.route(`${path}/view/position`, async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(200);
          committed();
          await held;
          await route.fulfill({ response });
        });
        const move = navigation.getByRole('button', {
          name: 'Flytta Lo Exempel: vänster',
          exact: true,
        });
        await move.focus();
        await page.keyboard.press('Enter');
        await actualCommit;
        await expect(move).toBeDisabled();
        const close = navigation.getByRole('button', { name: 'Stäng navigering', exact: true });
        await close.focus();
        if (departure === 'closed') await page.keyboard.press('Enter');
        const delivered = page.waitForResponse(
          (response) => response.url() === `${path}/view/position` && response.status() === 200,
        );
        release();
        await delivered;
        await expect(
          page.locator('.map-navigation button[aria-label="Flytta Lo Exempel: vänster"]'),
        ).toBeEnabled();
        if (departure === 'later-focus') {
          await expect(close).toBeFocused();
          await close.click({ trial: true });
        } else {
          const trigger = page.getByRole('button', { name: 'Navigera', exact: true });
          await expect(navigation).not.toBeVisible();
          await expect(trigger).toBeFocused();
          await trigger.click({ trial: true });
          await trigger.click();
        }
        await page.unroute(`${path}/view/position`);
        expect(await read()).toEqual(beforeMoves);
      }
      await navigation.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
      await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    }
    await expand.click();
    await page
      .getByRole('button', { name: 'Skriv till Skyttel', exact: true })
      .click({ trial: true });
    await openSelectionFocus(page, lo);
    await focus.focus();
    await page.keyboard.press('Enter');
    await expect(map.getByRole('img', { name: /Rymdens bakgrund/ })).toBeFocused();
    await expect(expand).toBeVisible();
    await expectUsableFocus();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await installation.close();
  }
});

test('KAMERA-05: context focus preserves multiple selections and filters with distinct described actions', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { map, lo, read } = await arrange(page, installation.origin);
    const before = await read();
    const search = page.getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true });
    await search.fill('Exempel');
    const filters = await mapFilters(page);
    await filters.getByLabel('Ta med upphörda').check();
    await filters.getByRole('button', { name: 'Stäng filter', exact: true }).click();
    const alex = map.getByRole('button', { name: 'Välj objekt: Alex Exempel', exact: true });
    const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    await lo.click();
    await alex.click({ modifiers: ['Control'] });
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await expect(alex).toHaveAttribute('aria-pressed', 'true');
    const far = map.getByRole('button', { name: 'Välj objekt: Långt borta', exact: true });
    await far.click({ button: 'right' });
    const actions = page.getByRole('toolbar', { name: 'Åtgärder för Långt borta', exact: true });
    const focus = actions.getByRole('button', { name: 'Fokusera markering', exact: true });
    await expect(focus).toHaveAccessibleDescription(/alla markerade objekt.*Behåller markeringen/);
    const names = ['Visa i kartan', 'Visa samband i kartan', 'Fokusera markering'];
    const icons = [];
    for (const name of names) {
      const button = actions.getByRole('button', { name, exact: true });
      await expect(button).toHaveAttribute(
        'title',
        await button.evaluate((element) => {
          const description = document.getElementById(
            element.getAttribute('aria-describedby') ?? '',
          );
          return description?.textContent ?? '';
        }),
      );
      icons.push(await button.locator('svg path').getAttribute('d'));
    }
    expect(new Set(icons).size).toBe(3);
    const previous = await center(lo);
    await focus.focus();
    await page.keyboard.press('Enter');
    await expect(map.getByRole('img', { name: /Rymdens bakgrund/ })).toBeFocused();
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await expect(alex).toHaveAttribute('aria-pressed', 'true');
    await expect(kim).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => center(lo)).not.toEqual(previous);
    for (const node of [lo, alex, kim]) await node.click({ trial: true });
    await page.getByRole('button', { name: 'Föregående vy', exact: true }).click();
    expect((await center(lo)).x).toBeCloseTo(previous.x, 5);
    expect((await center(lo)).y).toBeCloseTo(previous.y, 5);
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await expect(alex).toHaveAttribute('aria-pressed', 'true');
    await expect(search).toHaveValue('Exempel');
    await expect((await mapFilters(page)).getByLabel('Ta med upphörda')).toBeChecked();
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('KAMERA-06: toolbar label mode toggles with pointer and keyboard and survives reload', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { path, read } = await arrange(page, installation.origin);
    const before = await read();
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    const previous = tools.getByRole('button', { name: 'Föregående vy', exact: true });
    const labels = tools.getByRole('button', { name: 'Alla etiketter', exact: true });
    await expect(labels).toHaveAttribute('aria-pressed', 'false');
    const previousBox = await previous.boundingBox();
    const labelsBox = await labels.boundingBox();
    expect(labelsBox?.y).toBeGreaterThanOrEqual((previousBox?.y ?? 0) + (previousBox?.height ?? 0));
    await labels.click();
    await expect(labels).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await (await page.request.get(`${path}/view`)).json()).settings.allLabels)
      .toBe(true);
    await page.reload();
    await openMap(page);
    await expect(labels).toHaveAttribute('aria-pressed', 'true');
    await expect(previous).toBeDisabled();
    await page.setViewportSize({ width: 320, height: 250 });
    await labels.focus();
    await page.keyboard.press('Space');
    await expect(labels).toHaveAttribute('aria-pressed', 'false');
    await expect(labels).toBeFocused();
    await expect
      .poll(async () => (await (await page.request.get(`${path}/view`)).json()).settings.allLabels)
      .toBe(false);
    await page.reload();
    await openMap(page);
    await expect(labels).toHaveAttribute('aria-pressed', 'false');
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('KAMERA-07: toolbar reset clears map search and selection while preserving label mode and personal positions', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { lo, path, read } = await arrange(page, installation.origin);
    const before = await read();
    const viewBefore = await (await page.request.get(`${path}/view`)).json();
    const search = page.getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true });
    await search.fill('Lo');
    await lo.click();
    await setAllLabels(page, true);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    const labels = tools.getByRole('button', { name: 'Alla etiketter', exact: true });
    const reset = tools.getByRole('button', { name: 'Återställ vy', exact: true });
    const labelsBox = await labels.boundingBox();
    const resetBox = await reset.boundingBox();
    expect(resetBox?.y).toBeGreaterThanOrEqual((labelsBox?.y ?? 0) + (labelsBox?.height ?? 0));
    await reset.focus();
    await page.keyboard.press('Enter');
    await expect(reset).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(reset).toBeDisabled();
    await expect(tools.getByRole('button', { name: 'Föregående vy', exact: true })).toBeDisabled();
    await expect(labels).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Lo Exempel', 'Kim Exempel', 'Alex Exempel', 'Långt borta']) {
      const node = page.getByRole('button', { name: `Välj objekt: ${name}`, exact: true });
      await expect(node).toHaveAttribute('aria-pressed', 'false');
      await node.click({ trial: true });
    }
    const viewAfter = await (await page.request.get(`${path}/view`)).json();
    expect(viewAfter.positions).toEqual(viewBefore.positions);
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});
