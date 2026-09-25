import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

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
  await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
  const read = async (): Promise<PersonalView> => (await page.request.get(`${path}/view`)).json();
  return { path, read };
}
const space = (page: Page) => page.getByRole('region', { name: 'Rymdkarta', exact: true });
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
  await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
  await page
    .getByRole('list', { name: 'Objekt', exact: true })
    .getByRole('button', { name, exact: true })
    .click();
  await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
  await space(page).getByText('Ordna min vy', { exact: true }).click();
}

test('PLACERING-01: mouse, height and keyboard movement persist across reload, clients and server restart', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
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
    await space(page).getByRole('button', { name: 'Flytta nedåt i rummet', exact: true }).focus();
    await page.keyboard.down('Shift');
    await expect(space(page).getByText('Höjdflyttning · personlig vy')).toBeVisible();
    await page.keyboard.up('Shift');
    await space(page).getByLabel('Visa höjdhjälp', { exact: true }).check();
    await expect(space(page).getByText(/^↑ .* steg högre än start$/)).toBeVisible();
    const down = space(page).getByRole('button', { name: 'Flytta nedåt i rummet', exact: true });
    await down.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await read()).positions[0].version).toBe(3);
    expect((await read()).positions[0].y).toBeCloseTo(raised.y - 1);
    await expect(space(page).getByLabel('Visa höjdhjälp', { exact: true })).toBeChecked();
    await space(page).getByLabel('Visa höjdhjälp', { exact: true }).uncheck();
    await space(page).getByLabel('Visa höjdhjälp', { exact: true }).check();
    await expect(space(page).getByText('Höjdflyttning · personlig vy')).toBeVisible();
    await space(page).getByLabel('Visa stjärnhimmel', { exact: true }).check();
    await expect.poll(async () => (await read()).settings.stars).toBe(true);
    const expected = await read();
    expect(await (await page.request.get(path)).json()).toEqual(mapBefore);
    await installation.restart();
    await page.reload();
    expect(await read()).toEqual(expected);
    await signIn(other.request, installation.origin);
    expect(await (await other.request.get(`${path}/view`)).json()).toEqual(expected);
    const secondPage = await other.newPage();
    await secondPage.goto(installation.origin);
    await secondPage.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await space(secondPage).getByText('Ordna min vy', { exact: true }).click();
    await expect(space(secondPage).getByLabel('Visa stjärnhimmel', { exact: true })).toBeChecked();
  } finally {
    await other.close();
    await installation.close();
  }
});

test('PLACERING-02: concurrent clients retain independent moves and visibly reject stale placement and settings', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await browser.newContext();
  try {
    const { read, path } = await arrange(page, installation.origin);
    await signIn(other.request, installation.origin);
    const second = await other.newPage();
    await second.goto(installation.origin);
    await second.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await selectAndArrange(page);
    await selectAndArrange(second);
    await space(page).getByRole('button', { name: 'Flytta uppåt i rummet', exact: true }).click();
    await expect.poll(async () => (await read()).positions[0]?.version).toBe(1);
    await space(second).getByRole('button', { name: 'Flytta nedåt i rummet', exact: true }).click();
    await expect(space(second).getByText(/Din äldre ändring sparades inte/)).toBeVisible();
    expect((await read()).positions[0].version).toBe(1);
    await space(second).getByRole('button', { name: 'Flytta nedåt i rummet', exact: true }).click();
    await expect.poll(async () => (await read()).positions[0].version).toBe(2);
    const sharedPosition = (await read()).positions[0];
    // The first client still holds lamp version1, but moving bike is independent.
    await space(page).getByText('Ordna min vy', { exact: true }).click();
    await selectAndArrange(page, 'Cykeln');
    await space(page).getByRole('button', { name: 'Flytta utåt i rummet', exact: true }).click();
    await expect.poll(async () => (await read()).positions.length).toBe(2);
    expect((await read()).positions.find(({ id }) => id === 'lamp')).toEqual(sharedPosition);
    await space(page).getByLabel('Visa axlar hela tiden', { exact: true }).check();
    await expect.poll(async () => (await read()).settings.version).toBe(1);
    await space(second).getByLabel('Visa stjärnhimmel', { exact: true }).click();
    await expect(space(second).getByText(/Din äldre ändring sparades inte/)).toBeVisible();
    await expect(space(second).getByLabel('Visa axlar hela tiden', { exact: true })).toBeChecked();
    await expect(space(second).getByLabel('Visa stjärnhimmel', { exact: true })).not.toBeChecked();
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
    await space(page).getByRole('button', { name: 'Återställ vy', exact: true }).click();
    const box = await space(page).locator('canvas').boundingBox();
    if (!box) throw new Error('Canvas must be visible');
    const empty = { id: 1, x: box.x + 20, y: box.y + 25 };
    const oldPoint = await center(page);
    await touch('touchStart', [empty]);
    await touch('touchMove', [{ ...empty, x: empty.x + 50 }]);
    await touch('touchEnd', []);
    await expect.poll(async () => (await center(page)).x).not.toBe(oldPoint.x);
    await space(page).getByRole('button', { name: 'Återställ vy', exact: true }).click();
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
    const panBefore = await projection();
    const panStart = { id: 1, x: box.x + 70, y: box.y + 65 };
    const second = { id: 2, x: panStart.x + 150, y: panStart.y };
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
    await space(page).getByRole('button', { name: 'Återställ vy', exact: true }).click();
    const pinchBefore = await projection();
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
    await space(page).getByLabel('Visa axlar hela tiden', { exact: true }).check();
    await expect.poll(async () => (await read()).settings.axisPinned).toBe(true);
    await space(page).getByLabel('Axelvisarens hörn', { exact: true }).selectOption('top-left');
    await expect.poll(async () => (await read()).settings.axisCorner).toBe('top-left');
    for (const label of ['Vänd panorering i sidled', 'Vänd panorering i höjdled']) {
      await space(page).getByLabel(label, { exact: true }).check();
      await expect(
        space(page).getByRole('button', { name: 'Läs in min aktuella vy', exact: true }),
      ).toBeEnabled();
    }
    await space(page).getByText('Ordna min vy', { exact: true }).click();
    const canvas = space(page).locator('canvas');
    const dark = await sharp(await canvas.screenshot())
      .raw()
      .toBuffer();
    await space(page).getByText('Ordna min vy', { exact: true }).click();
    const starControl = space(page).getByLabel('Visa stjärnhimmel', { exact: true });
    await expect(starControl).not.toBeChecked();
    await expect(starControl).toBeDisabled();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await starControl.check();
    await expect.poll(async () => (await read()).settings.stars).toBe(true);
    await space(page).getByText('Ordna min vy', { exact: true }).click();
    const stars = await sharp(await canvas.screenshot())
      .raw()
      .toBuffer();
    expect(stars.equals(dark)).toBe(false);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(starControl).not.toBeChecked();
    await expect(starControl).toBeDisabled();
    expect(
      (
        await sharp(await canvas.screenshot())
          .raw()
          .toBuffer()
      ).equals(dark),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(starControl).toBeEnabled();
    await expect(starControl).toBeChecked();
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
    await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Ny sak');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    expect((await read()).positions).toEqual(placement);
    await expect.poll(async () => (await projection()).x).toBeCloseTo(pointBefore.x, 3);
    await expect.poll(async () => (await projection()).y).toBeCloseTo(pointBefore.y, 3);
    await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
    await page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Lampan', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera Lampan', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Oskickad text');
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setViewportSize({ width: 844, height: 390 });
    const axis = await space(page)
      .getByRole('img', { name: /Rummets axlar/ })
      .boundingBox();
    expect(axis?.x).toBeGreaterThanOrEqual(0);
    expect((axis?.y ?? 0) + (axis?.height ?? 0)).toBeLessThanOrEqual(390);
    await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
    await expect(page.getByLabel('Objektets namn')).toHaveValue('Oskickad text');
    expect((await read()).positions).toEqual(placement);
    expect((await (await page.request.get(path)).json()).draft.changes[0].after.name).toBe(
      'Ny sak',
    );
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
    await expect(page.getByRole('list', { name: 'Objekt', exact: true })).toBeVisible();
    await space(page).getByText('Ordna min vy', { exact: true }).click();
    const stars = space(page).getByLabel('Visa stjärnhimmel', { exact: true });
    await expect(stars).toBeDisabled();
    // Let the initial shared-map render finish while the personal response waits.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    releaseView();
    await expect(stars).toBeEnabled();
    await space(page).getByText('Ordna min vy', { exact: true }).click();
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
    await space(page).getByText('Navigera rymden', { exact: true }).click();
    await space(page).getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await expect.poll(projection).not.toEqual(framed);
    const navigated = await projection();
    await space(page).getByText('Ordna min vy', { exact: true }).click();
    await space(page).getByRole('button', { name: 'Läs in min aktuella vy', exact: true }).click();
    await expect(space(page).getByText('Aktuell personlig vy är inläst.')).toBeVisible();
    expect(await projection()).toEqual(navigated);
    await stars.check();
    await expect(space(page).getByText('Din personliga vy är sparad.')).toBeVisible();
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
  const member = await browser.newContext();
  const anonymous = await browser.newContext();
  try {
    const { read, path } = await arrange(page, installation.origin);
    await drag(page, 30, 10);
    const own = await read();
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
    expect(
      (
        await member.request.post(`${path}/view/position`, {
          headers: { origin: installation.origin },
          data: movement,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await member.request.post(`${path}/view/settings`, {
          headers: { origin: installation.origin },
          data: configuration,
        })
      ).ok(),
    ).toBe(true);
    expect(await read()).toEqual(own);
    const memberPage = await member.newPage();
    await memberPage.goto(installation.origin);
    await memberPage.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await space(memberPage).getByText('Ordna min vy', { exact: true }).click();
    expect(
      (
        await page.request.post(`${path.replace('/map', '')}/members/${user.id}/revoke`, {
          headers: { origin: installation.origin },
          data: {},
        })
      ).ok(),
    ).toBe(true);
    await space(memberPage)
      .getByRole('button', { name: 'Läs in min aktuella vy', exact: true })
      .click();
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
