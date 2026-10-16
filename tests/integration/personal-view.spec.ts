import type { Page } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import {
  createHousehold,
  openMap,
  openNewObject,
  openProfile,
  openSettings,
  openTable,
  setAllLabels,
  signIn,
} from '../support/client.js';
import { closeTableObject, editTableObject, readTableObject } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import {
  readPersonalProjection,
  verifyRestoredPersonalMove,
} from '../support/personal-view-reading.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function arrange(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const state: MapState = await (await page.request.get(path)).json();
  for (const [version, [id, name]] of [
    ['lamp', 'Lampan'],
    ['bike', 'Cykeln'],
  ].entries()) {
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version,
            id,
            baseRevision: null,
            value: { name, description: '', typeId: state.types[0].id },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  expect(
    (
      await page.request.post(`${path}/save`, {
        headers: { origin },
        data: { version: 2, operationId: 'shared' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(origin);
  await openMap(page);
  const read = async (): Promise<PersonalView> => (await page.request.get(`${path}/view`)).json();
  return { path, read };
}
const space = (page: Page) => page.getByRole('region', { name: 'Rymdkarta', exact: true });
async function openMapSettings(page: Page) {
  await openSettings(page);
  await page
    .locator('.settings-cards')
    .getByRole('link', { name: /^Rymdkartan/ })
    .click();
}
async function returnToMap(page: Page) {
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
  await expect(space(page)).toBeVisible();
}
async function center(page: Page, name = 'Lampan') {
  const box = await space(page)
    .getByRole('button', { name: `Välj objekt: ${name}`, exact: true })
    .boundingBox();
  if (!box) throw new Error('Object must be visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function drag(page: Page, dx: number, dy: number, height = false) {
  const start = await center(page);
  if (height) await page.keyboard.down('Shift');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 5 });
  if (height) await expect(space(page).getByText('Höjdflyttning · personlig vy')).toBeVisible();
  await page.mouse.up();
  if (height) await page.keyboard.up('Shift');
  await expect(space(page).getByText('Din personliga vy är sparad.')).toBeVisible();
}
async function selectAndArrange(page: Page, name = 'Lampan') {
  await openTable(page);
  await page
    .getByRole('region', { name: 'Hushållets tabell', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
  await openMap(page);
  const navigation = page.getByRole('button', { name: 'Navigera', exact: true });
  if ((await navigation.getAttribute('aria-expanded')) !== 'true') await navigation.click();
  const choices = page.getByText('Ordna min vy', { exact: true });
  if (!(await choices.evaluate((summary) => (summary.parentElement as HTMLDetailsElement).open)))
    await choices.click();
}

for (const width of [1440, 390]) {
  const caseId = width === 1440 ? 'PLACERING-09' : 'PLACERING-10';
  test(`${caseId}: personal save toasts expire while preserving focus and saved choices at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 1000 });
      const { read, path } = await arrange(page, installation.origin);
      const content = await (await page.request.get(path)).json();
      await selectAndArrange(page);
      const move = page.getByRole('button', { name: 'Flytta Lampan: uppåt', exact: true });
      await move.focus();
      await page.keyboard.press('Enter');
      const toast = space(page).locator('.personal-view-toast');
      await expect(toast).toHaveText('Din personliga vy är sparad.');
      await expect(toast).toBeVisible();
      await expect(toast.locator('..')).toHaveAttribute('aria-live', 'polite');
      await expect(move).toBeFocused();
      const box = await toast.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: test.info().outputPath(`personal-save-toast-${width}.png`) });
      await expect(toast).toHaveCount(0, { timeout: 4500 });
      await expect(move).toBeFocused();
      const moved = (await read()).positions;
      expect(moved).toHaveLength(1);
      await setAllLabels(page, true);
      const labels = page.getByRole('button', { name: 'Alla etiketter', exact: true });
      await expect(toast).toHaveText('Din personliga vy är sparad.');
      await expect(labels).toBeFocused();
      await expect(toast).toHaveCount(0, { timeout: 4500 });
      await expect(labels).toBeFocused();
      await expect(labels).toHaveAttribute('aria-pressed', 'true');
      await openTable(page);
      await openMap(page);
      await expect(toast).toHaveCount(0);
      const saved = await read();
      expect(saved.settings.allLabels).toBe(true);
      expect(saved.positions).toEqual(moved);
      expect(await (await page.request.get(path)).json()).toEqual(content);
      if (width === 1440) {
        await installation.restart();
        await page.reload();
        await openMap(page);
        await expect(labels).toHaveAttribute('aria-pressed', 'true');
        await expect(
          space(page).getByRole('button', { name: 'Välj objekt: Lampan', exact: true }),
        ).toBeVisible();
        expect(await read()).toEqual(saved);
        expect(await (await page.request.get(path)).json()).toEqual(content);
        await verifyRestoredPersonalMove(page, 'Lampan', saved.positions[0], saved.contentVersion);
      }
    } finally {
      await installation.close();
    }
  });
}

test('PLACERING-01: mouse, height and keyboard movement persist across reload, clients and server restart', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    const { read, path } = await arrange(page, installation.origin);
    const mapBefore = await (await page.request.get(path)).json();
    await drag(page, 40, 20);
    const first = (await read()).positions[0];
    expect(first).toMatchObject({ id: 'lamp', version: 1 });
    await drag(page, 0, -40, true);
    await expect.poll(async () => (await read()).positions[0].version).toBe(2);
    const raised = (await read()).positions[0];
    expect(raised.x).toBe(first.x);
    expect(raised.z).toBe(first.z);
    expect(raised.y).toBeGreaterThan(first.y);
    await selectAndArrange(page);
    await page.getByRole('button', { name: /^Flytta .+: nedåt$/ }).focus();
    await page.keyboard.down('Shift');
    await expect(space(page).getByText('Höjdflyttning · personlig vy')).toBeVisible();
    await page.keyboard.up('Shift');
    const heightHelp = page
      .getByRole('region', { name: 'Navigation', exact: true })
      .getByLabel('Visa höjdhjälp', { exact: true });
    await heightHelp.check();
    await expect(space(page).getByText(/^↑ .* steg högre än start$/)).toBeVisible();
    const down = page.getByRole('button', { name: /^Flytta .+: nedåt$/ });
    await down.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await read()).positions[0].version).toBe(3);
    expect((await read()).positions[0].y).toBeCloseTo(raised.y - 1);
    await expect(space(page).getByText('↓ 1 steg lägre än start', { exact: true })).toBeVisible();
    await expect(heightHelp).toBeChecked();
    await heightHelp.uncheck();
    await down.click();
    await expect.poll(async () => (await read()).positions[0].version).toBe(4);
    await expect(heightHelp).not.toBeChecked();
    await expect(space(page).getByText('Höjdflyttning · personlig vy')).toHaveCount(0);
    await heightHelp.check();
    await expect(space(page).getByText('↓ 2 steg lägre än start', { exact: true })).toBeVisible();
    await expect(space(page).getByText('Höjdflyttning · personlig vy')).toBeVisible();
    await openMapSettings(page);
    await page.getByLabel('Visa stjärnhimmel', { exact: true }).check();
    await expect.poll(async () => (await read()).settings.stars).toBe(true);
    const expected = await read();
    await returnToMap(page);
    expect(await (await page.request.get(path)).json()).toEqual(mapBefore);
    await installation.restart();
    await page.reload();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await expect(heightHelp).not.toBeChecked();
    expect(await read()).toEqual(expected);
    await signIn(other.request, installation.origin);
    expect(await (await other.request.get(`${path}/view`)).json()).toEqual(expected);
    const secondPage = await other.newPage();
    await secondPage.goto(installation.origin);
    await openMap(secondPage);
    await expect(
      space(secondPage).getByRole('button', { name: 'Välj objekt: Lampan', exact: true }),
    ).toBeVisible();
    await openMapSettings(secondPage);
    await expect(secondPage.getByLabel('Visa stjärnhimmel', { exact: true })).toBeChecked();
    await returnToMap(secondPage);
    await verifyRestoredPersonalMove(
      secondPage,
      'Lampan',
      expected.positions[0],
      expected.contentVersion,
    );
  } finally {
    await other.close();
    await installation.close();
  }
});

test('PLACERING-08: height help keeps its preview stable and manual choice across navigation modes and selection', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await arrange(page, installation.origin);
    await selectAndArrange(page);
    const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
    const heightHelp = navigation.getByLabel('Visa höjdhjälp', { exact: true });
    await heightHelp.focus();
    await page.keyboard.press('Space');
    await expect(heightHelp).toBeChecked();
    await navigation.getByRole('button', { name: 'Visa mininavigering', exact: true }).click();
    await expect(heightHelp).toBeVisible();
    await expect(navigation.getByText('Visa höjdhjälp', { exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await page.keyboard.down('Shift');
    for (let move = 0; move < 2; move++) {
      await expect(space(page).getByText('Startläge', { exact: true })).toBeVisible();
      const plane = () =>
        space(page).locator('.spatial-height-guide > path').first().getAttribute('d');
      const preview = await plane();
      const start = await center(page);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x, start.y - 24, { steps: 3 });
      await expect(space(page).getByText(/^↑ .* steg högre än start$/)).toBeVisible();
      expect(await plane()).toBe(preview);
      await page.mouse.up();
      await expect(space(page).getByText('Startläge', { exact: true })).toBeVisible();
      await expect(space(page).getByText('Din personliga vy är sparad.')).toBeVisible();
    }
    await page.keyboard.up('Shift');
    await expect(space(page).getByText(/^↑ .* steg högre än start$/)).toBeVisible();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await expect(heightHelp).toBeChecked();
    await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await selectAndArrange(page, 'Cykeln');
    await expect(heightHelp).toBeChecked();
    await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    await space(page)
      .getByRole('button', { name: 'Välj objekt: Lampan', exact: true })
      .click({ modifiers: ['Control'] });
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await expect(heightHelp).toBeDisabled();
    await expect(heightHelp).toBeChecked();
    await expect(navigation.getByText('Välj ett objekt för att visa höjdhjälp')).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('PLACERING-02: concurrent clients retain independent moves and visibly reject stale placement and settings', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    const { read, path } = await arrange(page, installation.origin);
    await signIn(other.request, installation.origin);
    const second = await other.newPage();
    await second.goto(installation.origin);
    await openMap(second);
    await selectAndArrange(page);
    await selectAndArrange(second);
    await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
    await expect.poll(async () => (await read()).positions[0]?.version).toBe(1);
    await second.getByRole('button', { name: /^Flytta .+: nedåt$/ }).click();
    await expect(space(second).getByText(/Din äldre ändring sparades inte/)).toBeVisible();
    expect((await read()).positions[0].version).toBe(1);
    await second.getByRole('button', { name: /^Flytta .+: nedåt$/ }).click();
    await expect.poll(async () => (await read()).positions[0].version).toBe(2);
    const sharedPosition = (await read()).positions[0];
    // The first client still holds lamp version1, but moving bike is independent.
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await selectAndArrange(page, 'Cykeln');
    await page.getByRole('button', { name: /^Flytta .+: framåt$/ }).click();
    await expect.poll(async () => (await read()).positions.length).toBe(2);
    expect((await read()).positions.find(({ id }) => id === 'lamp')).toEqual(sharedPosition);
    await page.getByLabel('Visa axlar hela tiden', { exact: true }).check();
    await expect.poll(async () => (await read()).settings.version).toBe(1);
    await openMapSettings(second);
    await second.getByLabel('Visa stjärnhimmel', { exact: true }).click();
    await expect(
      second.locator('.map-settings').getByText(/Din äldre ändring sparades inte/),
    ).toBeVisible();
    await expect(second.getByLabel('Visa stjärnhimmel', { exact: true })).not.toBeChecked();
    await returnToMap(second);
    await expect(second.getByLabel('Visa axlar hela tiden', { exact: true })).toBeChecked();
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
  } finally {
    await other.close();
    await installation.close();
  }
});

test('PLACERING-03: synthetic touch gestures handle height, interruption, finger changes and empty-space navigation', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 820, height: 1180 });
    const { read } = await arrange(page, installation.origin);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
      points: { id: number; x: number; y: number }[],
    ) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const surface = await space(page).locator('canvas').boundingBox();
    if (!surface) throw new Error('Touch gestures require a visible map');
    const anchorX = (x: number, distance: number) =>
      x + distance < surface.x + surface.width - 10 ? x + distance : x - distance;
    let start = await center(page);
    await touch('touchStart', [{ id: 1, ...start }]);
    await touch('touchMove', [{ id: 1, x: start.x + 40, y: start.y + 20 }]);
    await touch('touchEnd', []);
    await expect.poll(async () => (await read()).positions[0]?.version).toBe(1);
    // The server can commit before the browser has finished its save response.
    // Wait for the visible completion before starting another object gesture.
    await expect(space(page).getByText('Din personliga vy är sparad.')).toBeVisible();
    const before = (await read()).positions[0];
    start = await center(page);
    const anchor = { id: 2, x: anchorX(start.x, 110), y: start.y };
    await touch('touchStart', [{ id: 1, ...start }]);
    await touch('touchStart', [{ id: 1, ...start }, anchor]);
    await touch('touchMove', [{ id: 1, x: start.x, y: start.y - 40 }, anchor]);
    await expect(space(page).getByText('Höjdflyttning · personlig vy')).toBeVisible();
    await touch('touchEnd', [anchor]);
    await touch('touchEnd', []);
    await expect.poll(async () => (await read()).positions[0].version).toBe(2);
    const raised = (await read()).positions[0];
    expect(raised.y).toBeGreaterThan(before.y);
    expect(raised.x).toBe(before.x);
    expect(raised.z).toBe(before.z);
    let saved = await read();
    start = await center(page);
    await touch('touchStart', [{ id: 1, ...start }]);
    await touch('touchMove', [{ id: 1, x: start.x - 30, y: start.y }]);
    await touch('touchCancel', []);
    expect(await read()).toEqual(saved);
    start = await center(page);
    const finger = { id: 2, x: anchorX(start.x, 100), y: start.y };
    await touch('touchStart', [{ id: 1, ...start }]);
    await touch('touchStart', [{ id: 1, ...start }, finger]);
    await touch('touchMove', [{ id: 1, x: start.x, y: start.y - 30 }, finger]);
    await touch('touchEnd', [{ id: 1, x: start.x, y: start.y - 30 }]);
    await expect.poll(async () => (await read()).positions[0].version).toBe(3);
    const completed = (await read()).positions[0];
    expect(completed.y).toBeGreaterThan(raised.y);
    expect(completed.x).toBe(raised.x);
    expect(completed.z).toBe(raised.z);
    saved = await read();
    await touch('touchMove', [{ ...finger, y: finger.y + 30 }]);
    await touch('touchEnd', []);
    expect(await read()).toEqual(saved);
    start = await center(page);
    const driver = { id: 1, ...start };
    const movingAnchor = { id: 2, x: anchorX(start.x, 100), y: start.y };
    const extra = { id: 3, x: anchorX(start.x, 130), y: start.y };
    await touch('touchStart', [driver]);
    await touch('touchMove', [{ ...driver, x: driver.x + 20 }]);
    driver.x += 20;
    await touch('touchStart', [driver, movingAnchor]);
    await touch('touchStart', [driver, movingAnchor, extra]);
    driver.y -= 25;
    await touch('touchMove', [driver, movingAnchor, extra]);
    await expect(space(page).getByText('Höjdflyttning · personlig vy')).toBeVisible();
    movingAnchor.y += 30;
    await touch('touchMove', [driver, movingAnchor, extra]);
    await expect.poll(async () => (await center(page)).x).toBeCloseTo(start.x);
    await expect.poll(async () => (await center(page)).y).toBeCloseTo(start.y);
    driver.x += 30;
    movingAnchor.x += 30;
    await touch('touchMove', [driver, movingAnchor, extra]);
    await expect.poll(async () => (await center(page)).x).not.toBeCloseTo(start.x);
    await touch('touchEnd', []);
    expect(await read()).toEqual(saved);
    const projection = () =>
      space(page).evaluate((region) => {
        const points = ['lamp', 'bike'].map((id) => {
          const node = region.querySelector(`.spatial-node[data-object-id="${id}"]`);
          if (!node) throw new Error('Both projected objects must remain visible');
          const box = node.getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        });
        return {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
          separation: Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y),
        };
      });
    const resetView = async () => {
      const before = await projection();
      await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
      // Reset updates projected positions in a React effect after the click.
      await expect.poll(projection).not.toEqual(before);
      return projection();
    };
    await resetView();
    const box = await space(page).locator('canvas').boundingBox();
    if (!box) throw new Error('Canvas must be visible');
    // The bottom of the canvas also contains floating map controls. Start
    // background gestures above them and verify the actual hit targets.
    const empty = { id: 1, x: box.x + box.width / 2 - 75, y: box.y + box.height / 4 };
    const expectEmptyCanvas = async (points: { x: number; y: number }[]) => {
      expect(
        await space(page)
          .locator('canvas')
          .evaluate(
            (canvas, points) =>
              points.every(({ x, y }) => document.elementFromPoint(x, y) === canvas),
            points,
          ),
      ).toBe(true);
    };
    const oldPoint = await center(page);
    await expectEmptyCanvas([empty, { ...empty, x: empty.x + 50 }]);
    await touch('touchStart', [empty]);
    await touch('touchMove', [{ ...empty, x: empty.x + 50 }]);
    await touch('touchEnd', []);
    await expect.poll(async () => (await center(page)).x).not.toBe(oldPoint.x);
    const panBefore = await resetView();
    const panStart = empty;
    const second = { id: 2, x: panStart.x + 150, y: panStart.y };
    await expectEmptyCanvas([
      panStart,
      second,
      { ...panStart, x: panStart.x + 30, y: panStart.y + 20 },
      { ...second, x: second.x + 30, y: second.y + 20 },
    ]);
    await touch('touchStart', [panStart, second]);
    await touch('touchMove', [
      { ...panStart, x: panStart.x + 30, y: panStart.y + 20 },
      { ...second, x: second.x + 30, y: second.y + 20 },
    ]);
    await touch('touchEnd', []);
    await expect
      .poll(async () => {
        const after = await projection();
        return Math.hypot(after.x - panBefore.x, after.y - panBefore.y);
      })
      .toBeGreaterThan(10);
    await expect
      .poll(async () => (await projection()).separation / panBefore.separation)
      .toBeCloseTo(1, 1);
    expect(await read()).toEqual(saved);
    const pinchBefore = await resetView();
    await expectEmptyCanvas([
      panStart,
      second,
      { ...panStart, x: panStart.x - 35 },
      { ...second, x: second.x + 35 },
    ]);
    await touch('touchStart', [panStart, second]);
    await touch('touchMove', [
      { ...panStart, x: panStart.x - 35 },
      { ...second, x: second.x + 35 },
    ]);
    await touch('touchEnd', []);
    await expect
      .poll(async () => (await projection()).separation)
      .toBeGreaterThan(pinchBefore.separation * 1.2);
    expect(await read()).toEqual(saved);
    await expect(space(page).getByRole('img', { name: /Rummets axlar/ })).toBeVisible();
    await expect(space(page).getByRole('img', { name: /Rummets axlar/ })).not.toBeVisible({
      timeout: 3000,
    });
  } finally {
    await installation.close();
  }
});

test('PLACERING-04: personal display settings, new proposals and viewport changes preserve existing placement and unsent text', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { read, path } = await arrange(page, installation.origin);
    await drag(page, 25, -20);
    const placement = (await read()).positions;
    await selectAndArrange(page);
    await page.getByLabel('Visa axlar hela tiden', { exact: true }).check();
    await expect.poll(async () => (await read()).settings.axisPinned).toBe(true);
    await page.getByLabel('Axelvisarens hörn', { exact: true }).selectOption('top-left');
    await expect.poll(async () => (await read()).settings.axisCorner).toBe('top-left');
    for (const label of ['Vänd panorering i sidled', 'Vänd panorering i höjdled']) {
      await page.getByLabel(label, { exact: true }).check();
      await expect(
        page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }),
      ).toBeEnabled();
    }
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    const canvas = space(page).locator('canvas');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('The map background must be visible');
    // Floating controls now share the canvas area. Compare its unobscured
    // center so focus rings and disabled controls do not masquerade as stars.
    // The status card at the lower right edge is left out of it.
    const card = await page
      .getByRole('region', { name: 'Kartans status', exact: true })
      .boundingBox();
    const top = bounds.y + bounds.height / 4;
    const bottom = Math.min(
      top + bounds.height / 2,
      card && card.y > top ? card.y - 12 : Number.POSITIVE_INFINITY,
    );
    const background = async () =>
      sharp(
        await page.screenshot({
          clip: {
            x: bounds.x + bounds.width / 4,
            y: top,
            width: bounds.width / 2,
            height: bottom - top,
          },
        }),
      )
        .raw()
        .toBuffer();
    const dark = await background();
    await openMapSettings(page);
    const starControl = page.getByLabel('Visa stjärnhimmel', { exact: true });
    await expect(starControl).not.toBeChecked();
    await expect(starControl).toBeDisabled();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await starControl.check();
    await expect.poll(async () => (await read()).settings.stars).toBe(true);
    await returnToMap(page);
    const stars = await background();
    expect(stars.equals(dark)).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMapSettings(page);
    await expect(starControl).not.toBeChecked();
    await expect(starControl).toBeDisabled();
    await returnToMap(page);
    expect((await background()).equals(dark)).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openMapSettings(page);
    await expect(starControl).toBeEnabled();
    await expect(starControl).toBeChecked();
    await returnToMap(page);
    const projection = () =>
      space(page)
        .locator('line[data-object-id="lamp"]')
        .evaluate((line: SVGLineElement) => {
          const canvas = line.ownerSVGElement?.parentElement?.querySelector('canvas');
          if (!canvas?.clientWidth || !canvas.clientHeight) throw new Error('Map must be visible');
          // The scene projects in the canvas's integer client dimensions; its
          // fractional bounding rectangle can change when the draft resizes it.
          const { clientWidth: width, clientHeight: height } = canvas;
          return {
            x: (line.x1.baseVal.value - width / 2) / height,
            y: (line.y1.baseVal.value - height / 2) / height,
          };
        });
    const pointBefore = await projection();
    const addition = await openNewObject(page);
    await addition.getByLabel('Namn', { exact: true }).fill('Ny sak');
    await addition.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openMap(page);
    expect((await read()).positions).toEqual(placement);
    await expect.poll(async () => (await projection()).x).toBeCloseTo(pointBefore.x, 3);
    await expect.poll(async () => (await projection()).y).toBeCloseTo(pointBefore.y, 3);
    const lamp = await editTableObject(page, 'Lampan');
    await lamp.getByLabel('Namn', { exact: true }).fill('Oskickad text');
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(lamp.getByLabel('Namn', { exact: true })).toHaveValue('Oskickad text');
    }
    await lamp.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect(
      loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(lamp.getByLabel('Namn', { exact: true })).toHaveValue('Oskickad text');
    await lamp.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    await loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(lamp).not.toBeVisible();
    await openMap(page);
    const axis = await space(page)
      .getByRole('img', { name: /Rummets axlar/ })
      .boundingBox();
    expect(axis?.x).toBeGreaterThanOrEqual(0);
    expect((axis?.y ?? 0) + (axis?.height ?? 0)).toBeLessThanOrEqual(390);
    expect((await read()).positions).toEqual(placement);
    expect((await (await page.request.get(path)).json()).draft.changes[0].after.name).toBe(
      'Ny sak',
    );
    const retained = await readTableObject(page, 'Ny sak');
    await expect(retained).toContainText('Ny sak');
    await expect(retained).toContainText('Person');
    await expect(retained.locator('.household-table-description')).toHaveText(
      '◇ Ditt förslag: Ej uppgivet',
    );
    await closeTableObject(page, 'Ny sak');
    await openMap(page);
  } finally {
    await installation.close();
  }
});

test('PLACERING-06: delayed initial personal positions frame once and later refreshes preserve the camera', async ({
  page,
}) => {
  const installation = await createInstallation();
  let releaseView = () => {};
  const delayedView = new Promise<void>((resolve) => {
    releaseView = resolve;
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { path } = await arrange(page, installation.origin);
    for (const [id, position] of [
      ['lamp', { x: 900, y: 800, z: 700 }],
      ['bike', { x: 910, y: 805, z: 705 }],
    ] as const) {
      expect(
        (
          await page.request.post(`${path}/view/position`, {
            headers: { origin: installation.origin },
            data: { id, position, version: 0 },
          })
        ).ok(),
      ).toBe(true);
    }
    await page.route(`${path}/view`, async (route) => {
      const response = await route.fetch();
      await delayedView;
      await route.fulfill({ response });
    });
    await page.reload();
    const canvas = space(page).locator('canvas');
    await expect(canvas).toBeVisible();
    await openTable(page);
    await expect(
      page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
    ).toBeVisible();
    await openMap(page);
    await openMapSettings(page);
    const stars = page.getByLabel('Visa stjärnhimmel', { exact: true });
    await expect(stars).toBeDisabled();
    // Let the initial shared-map render finish while the personal response waits.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    releaseView();
    await expect(stars).toBeEnabled();
    await returnToMap(page);
    await canvas.scrollIntoViewIfNeeded();
    for (const name of ['Lampan', 'Cykeln']) {
      await expect(
        space(page).getByRole('button', { name: `Välj objekt: ${name}`, exact: true }),
      ).toBeInViewport({ ratio: 1 });
    }
    const projection = () =>
      space(page)
        .locator('line[data-object-id="lamp"]')
        .evaluate((line: SVGLineElement) => ({
          x: line.x1.baseVal.value,
          y: line.y1.baseVal.value,
        }));
    const framed = await projection();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await expect.poll(projection).not.toEqual(framed);
    const navigated = await projection();
    await page.getByText('Ordna min vy', { exact: true }).click();
    await page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
    await expect(space(page).getByText('Aktuell personlig vy är inläst.')).toBeVisible();
    expect(await projection()).toEqual(navigated);
    await openMapSettings(page);
    await stars.check();
    await expect(
      page.locator('.map-settings').getByText('Din personliga vy är sparad.', { exact: true }),
    ).toBeVisible();
    await returnToMap(page);
    expect(await projection()).toEqual(navigated);
  } finally {
    releaseView();
    await installation.close();
  }
});

test('PLACERING-05: personal views stay private and revocation denies further reads and both mutations', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const member = await createPreparedContext(browser);
  const anonymous = await createPreparedContext(browser);
  try {
    const { read, path } = await arrange(page, installation.origin);
    await drag(page, 30, 10);
    const own = await read();
    const ownRendered = await readPersonalProjection(page, 'lamp');
    installation.setIdentity(robin);
    await signIn(member.request, installation.origin, 'microsoft');
    const { user } = await (
      await member.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    installation.seedMembership(user.id, 'other-home', 'Eken');
    const movement = { id: 'lamp', version: 0, position: { x: 5, y: 6, z: 7 } };
    const configuration = {
      version: 0,
      settings: { ...own.settings, version: undefined, stars: true },
    };
    for (const [context, status] of [
      [anonymous, 401],
      [member, 403],
    ] as const) {
      expect((await context.request.get(`${path}/view`)).status()).toBe(status);
      for (const [suffix, data] of [
        ['position', movement],
        ['settings', configuration],
      ] as const)
        expect(
          (
            await context.request.post(`${path}/view/${suffix}`, {
              headers: { origin: installation.origin },
              data,
            })
          ).status(),
        ).toBe(status);
    }
    const memberPage = await member.newPage();
    const householdUrl = path.replace('/api/households/', '/households/').replace(/\/map$/, '');
    await memberPage.goto(householdUrl);
    await expect(
      memberPage.getByRole('heading', { name: 'Du har inte tillgång till hushållet', exact: true }),
    ).toBeVisible();
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(householdUrl);
    await expect(
      anonymousPage.getByRole('button', { name: 'Fortsätt med Google', exact: true }),
    ).toBeVisible();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await member.request.post(`${installation.origin}/api/invitations/accept`, {
          headers: { origin: installation.origin },
          data: { code },
        })
      ).ok(),
    ).toBe(true);
    expect((await (await member.request.get(`${path}/view`)).json()).positions).toEqual([]);
    await memberPage.goto(householdUrl);
    await openMap(memberPage);
    await selectAndArrange(memberPage);
    await memberPage.getByRole('button', { name: 'Flytta Lampan: uppåt', exact: true }).click();
    await expect(
      space(memberPage).getByText('Din personliga vy är sparad.', { exact: true }),
    ).toBeVisible();
    await memberPage.goto(`${householdUrl}/settings/map`);
    await expect(memberPage).toHaveURL(`${householdUrl}/settings/map`);
    await memberPage.getByLabel('Visa stjärnhimmel', { exact: true }).check();
    await expect(
      memberPage
        .locator('.map-settings')
        .getByText('Din personliga vy är sparad.', { exact: true }),
    ).toBeVisible();
    await expect(memberPage.getByLabel('Visa stjärnhimmel', { exact: true })).toBeChecked();
    await expect
      .poll(async () => (await (await member.request.get(`${path}/view`)).json()).settings.stars)
      .toBe(true);
    const memberView: PersonalView = await (await member.request.get(`${path}/view`)).json();
    expect(memberView.positions).toHaveLength(1);
    expect(memberView.settings.stars).toBe(true);
    expect(await read()).toEqual(own);
    expect(
      (
        await member.request.post(`${path}/view/position`, {
          headers: { origin: installation.origin },
          data: { ...movement, version: memberView.positions[0].version },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await member.request.post(`${path}/view/settings`, {
          headers: { origin: installation.origin },
          data: { ...configuration, version: memberView.settings.version },
        })
      ).ok(),
    ).toBe(true);
    expect(await read()).toEqual(own);
    await memberPage.goto(householdUrl);
    await expect
      .poll(() => readPersonalProjection(page, 'lamp'))
      .toEqual({ x: expect.closeTo(ownRendered.x, 5), y: expect.closeTo(ownRendered.y, 5) });
    await openMapSettings(page);
    await expect(page.getByLabel('Visa stjärnhimmel', { exact: true })).not.toBeChecked();
    await returnToMap(page);
    await openMap(memberPage);
    await memberPage.getByRole('button', { name: 'Navigera', exact: true }).click();
    await memberPage.getByText('Ordna min vy', { exact: true }).click();
    expect(
      (
        await page.request.post(`${path.replace('/map', '')}/members/${user.id}/revoke`, {
          headers: { origin: installation.origin },
          data: {},
        })
      ).ok(),
    ).toBe(true);
    await memberPage.getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
    await openProfile(memberPage);
    await expect(memberPage.getByRole('button', { name: 'Logga ut', exact: true })).toBeVisible();
    expect((await member.request.get(`${path}/view`)).status()).toBe(403);
    for (const [suffix, data] of [
      ['position', { ...movement, version: 1 }],
      ['settings', { ...configuration, version: 1 }],
    ] as const)
      expect(
        (
          await member.request.post(`${path}/view/${suffix}`, {
            headers: { origin: installation.origin },
            data,
          })
        ).status(),
      ).toBe(403);
    expect(await read()).toEqual(own);
  } finally {
    await member.close();
    await anonymous.close();
    await installation.close();
  }
});

test('PLACERING-07: map settings retain the personal star choice through navigation, reduced motion and restart', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await arrange(page, installation.origin);
    await selectAndArrange(page);
    await page.getByRole('button', { name: /^Flytta .+: uppåt$/ }).click();
    await expect.poll(async () => (await read()).positions.length).toBe(1);
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    const marker = space(page).getByRole('button', { name: 'Välj objekt: Lampan', exact: true });
    const before = await marker.getAttribute('style');
    await openSettings(page);
    await page
      .getByRole('link', { name: /^Rymdkartan/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Rymdkartan', exact: true })).toBeFocused();
    const stars = page.getByLabel('Visa stjärnhimmel', { exact: true });
    await stars.check();
    await expect(
      page.locator('.map-settings').getByText('Din personliga vy är sparad.', { exact: true }),
    ).toBeVisible();
    await expect.poll(async () => (await read()).settings.stars).toBe(true);
    const saved = await read();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(stars).toBeDisabled();
    await expect(stars).not.toBeChecked();
    expect(await read()).toEqual(saved);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(stars).toBeChecked();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(marker).toHaveAttribute('aria-pressed', 'true');
    await expect(marker).toHaveAttribute('style', before ?? '');
    await expect(space(page).getByLabel('Visa stjärnhimmel', { exact: true })).toHaveCount(0);
    await installation.restart();
    await page.reload();
    await openSettings(page);
    await page
      .getByRole('link', { name: /^Rymdkartan/ })
      .first()
      .click();
    await expect(stars).toBeChecked();
    expect(await read()).toEqual(saved);
  } finally {
    await installation.close();
  }
});
