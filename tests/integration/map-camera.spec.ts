import { expect, type Locator, type Page, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openMap, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

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

test('KAMERA-02: focus fits only selection and direct neighbors while overview retains its return view', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { map, lo } = await arrange(page, installation.origin);
    const focus = page.getByRole('button', { name: 'Fokusera markering', exact: true });
    await expect(focus).toBeDisabled();
    await lo.click();
    const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    const separation = async () => {
      const a = await center(lo);
      const b = await center(kim);
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const overview = await separation();
    await page.getByRole('button', { name: 'Visa detaljer', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Lo Exempel', exact: true });
    await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await panel.getByLabel('Beskrivning', { exact: true }).fill('Oskickat under kamerafokus');
    const panelPosition = await panel.boundingBox();
    await focus.click();
    await expect(focus).toBeFocused();
    expect(await panel.boundingBox()).toEqual(panelPosition);
    expect(await separation()).toBeGreaterThan(overview * 2);
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await expect(kim).toHaveAttribute('aria-pressed', 'false');
    for (const node of [lo, kim]) {
      const point = await center(node);
      expect(point.x).toBeGreaterThan(112);
      expect(point.x).toBeLessThan(1360);
      expect(point.y).toBeGreaterThan(90);
      expect(point.y).toBeLessThan(830);
    }
    const beforeOverview = await center(lo);
    await page.getByRole('button', { name: 'Visa hela kartan', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Återgå till föregående vy', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await focus.click();
    await page.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
    await page.getByRole('button', { name: 'Återgå till föregående vy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Visa hela kartan', exact: true })).toBeVisible();
    expect(await center(lo)).toEqual(beforeOverview);
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await expect(panel.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Oskickat under kamerafokus',
    );
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
  const context = await browser.newContext({
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
      await openWorkspace(page);
      await expect(
        page.getByRole('button', { name: 'Fokusera markering', exact: true }),
      ).toBeDisabled();
      await openMap(page);
      await expect(focus).toBeEnabled();
    }
    const extension = await map
      .locator('canvas')
      .evaluateHandle((canvas: HTMLCanvasElement) =>
        canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context'),
      );
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
    const { lo, map } = await arrange(page, installation.origin);
    await lo.click();
    await page.setViewportSize({ width: 320, height: 250 });
    const focus = page.getByRole('button', { name: 'Fokusera markering', exact: true });
    await focus.click({ trial: true });
    await focus.focus();
    await page.keyboard.press('Enter');
    await expect(focus).toBeFocused();
    const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    async function expectUsableFocus() {
      for (const node of [lo, kim]) {
        await expect.poll(async () => (await center(node)).x).toBeGreaterThanOrEqual(32);
        await expect.poll(async () => (await center(node)).x).toBeLessThanOrEqual(288);
        await expect.poll(async () => (await center(node)).y).toBeGreaterThanOrEqual(110);
        await expect.poll(async () => (await center(node)).y).toBeLessThanOrEqual(172);
        await node.click({ trial: true });
      }
    }
    await expectUsableFocus();
    await page.screenshot({ path: test.info().outputPath('short-focus.png') });
    const expand = page.getByRole('button', { name: 'Visa verktygens namn', exact: true });
    await expand.click();
    await page.getByRole('button', { name: 'Visa hela kartan', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Återgå till föregående vy', exact: true }),
    ).toBeFocused();
    await expect(expand).toBeVisible();
    await expand.click();
    await page.getByRole('button', { name: 'Återgå till föregående vy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Visa hela kartan', exact: true })).toBeFocused();
    await expect(expand).toBeVisible();
    await expectUsableFocus();
    await map.getByText('Visningsval', { exact: true }).click();
    await map.getByLabel('Alla etiketter', { exact: true }).check();
    await map.getByLabel('Alla etiketter', { exact: true }).uncheck();
    await map.getByText('Visningsval', { exact: true }).click();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await expand.click();
    await page.getByRole('button', { name: 'Samtal och text', exact: true }).click({ trial: true });
    await page.getByRole('button', { name: 'Visa detaljer', exact: true }).click({ trial: true });
    await focus.focus();
    await page.keyboard.press('Enter');
    await expect(focus).toBeFocused();
    await expect(expand).toBeVisible();
    await expectUsableFocus();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await installation.close();
  }
});
