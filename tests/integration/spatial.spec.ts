import { expect, type Locator, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function arrange(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  const state = await read();
  for (const [id, name, type] of [
    ['lo', 'Lo Exempel', 'Person'],
    ['music', 'Molnmusik', 'Tjänst'],
  ]) {
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin: origin },
          data: {
            version: (await read()).draft.version,
            id,
            baseRevision: null,
            value: {
              name,
              description: '',
              typeId: state.types.find((item) => item.name === type)?.id,
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  return { read, path };
}

async function expectVisibleDirection(space: Locator) {
  const line = space.locator('line.connection');
  const { arrow, surface, target } = await line.evaluate((element: SVGLineElement) => {
    const region = element.closest('.spatial-map');
    const svg = region?.querySelector('.spatial-lines');
    const node = region?.querySelector('[aria-label="Välj objekt: Molnmusik"]');
    if (!svg || !node) throw new Error('The map and target must be visible');
    const bounds = (item: Element) => {
      const { x, y, width, height } = item.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      arrow: {
        start: { x: element.x1.baseVal.value, y: element.y1.baseVal.value },
        tip: { x: element.x2.baseVal.value, y: element.y2.baseVal.value },
        color: getComputedStyle(element).stroke.match(/\d+/g)?.map(Number) ?? [],
        opacity: Number(getComputedStyle(element).opacity),
        width: Number.parseFloat(getComputedStyle(element).strokeWidth),
      },
      surface: bounds(svg),
      target: bounds(node),
    };
  });
  const svg = space.locator('svg.spatial-lines');
  const tip = { x: arrow.tip.x + surface.x, y: arrow.tip.y + surface.y };
  expect(
    tip.x < target.x ||
      tip.x > target.x + target.width ||
      tip.y < target.y ||
      tip.y > target.y + target.height,
    'The directional tip must be outside the target circle',
  ).toBe(true);
  const dx = arrow.tip.x - arrow.start.x;
  const dy = arrow.tip.y - arrow.start.y;
  const length = Math.hypot(dx, dy);
  expect(length).toBeGreaterThan(25);
  const towardTarget =
    dx * (target.x + target.width / 2 - tip.x) + dy * (target.y + target.height / 2 - tip.y);
  expect(towardTarget, 'The visible arrow must point toward the target').toBeGreaterThan(0);
  const screenshot = await svg.screenshot();
  const { data, info } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true });
  // Check painted wings, away from the narrow line: the arrow must survive
  // compositing with HTML labels, not merely exist as an SVG marker.
  for (const side of [-1, 1]) {
    const x = Math.round(arrow.tip.x - (dx / length) * 8 - (dy / length) * side * 2.5);
    const y = Math.round(arrow.tip.y - (dy / length) * 8 + (dx / length) * side * 2.5);
    const backgroundX = Math.round(arrow.tip.x - (dx / length) * 8 - (dy / length) * side * 12);
    const backgroundY = Math.round(arrow.tip.y - (dy / length) * 8 + (dx / length) * side * 12);
    const backgroundOffset = (backgroundY * info.width + backgroundX) * info.channels;
    const background = [...data.subarray(backgroundOffset, backgroundOffset + 3)];
    const expected = arrow.color.map(
      (channel, index) => channel * arrow.opacity + background[index] * (1 - arrow.opacity),
    );
    expect(expected).toHaveLength(3);
    // Match the painted stroke in a small wing area, allowing antialiasing.
    // The adjacent background must remain distinct, so a missing or covered
    // marker cannot pass just because its SVG geometry exists.
    const wingPixels = [-1, 0, 1].flatMap((offsetY) =>
      [-1, 0, 1].flatMap((offsetX) => {
        const distance =
          (side *
            (-dy * (x + offsetX + 0.5 - arrow.tip.x) + dx * (y + offsetY + 0.5 - arrow.tip.y))) /
          length;
        // Exclude the shaft and its antialiasing, even after pixel rounding.
        if (distance <= arrow.width / 2 + 1.25) return [];
        const offset = ((y + offsetY) * info.width + x + offsetX) * info.channels;
        return [[...data.subarray(offset, offset + 3)]];
      }),
    );
    const painted = wingPixels.some(
      (pixel) =>
        pixel.every((channel, index) => Math.abs(channel - expected[index]) < 45) &&
        Math.hypot(...pixel.map((channel, index) => channel - background[index])) > 40,
    );
    if (!painted) {
      await test.info().attach('directional-arrow', { body: screenshot, contentType: 'image/png' });
    }
    expect(painted, `The ${side < 0 ? 'left' : 'right'} arrow wing must be visibly painted`).toBe(
      true,
    );
  }
}

test('RYMD-01: spatial and list editing share private proposals and one durable save', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await arrange(page, installation.origin);
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }).click();
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Objektets namn')).toHaveCount(0);
    await page.getByRole('button', { name: 'Redigera val', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Molnmusik familj');
    await page.getByRole('button', { name: 'Till kartan', exact: true }).click();
    await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
    await expect(page.getByLabel('Objektets namn')).toHaveValue('Molnmusik familj');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    expect((await read()).objects).toHaveLength(0);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik familj', exact: true }),
    ).toBeVisible();
    expect((await read()).objects.map((item) => item.name).sort()).toEqual([
      'Lo Exempel',
      'Molnmusik familj',
    ]);
  } finally {
    await installation.close();
  }
});

test('RYMD-02: focus, filters and camera navigation preserve the shared selection', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read } = await arrange(page, installation.origin);
    const state = await read();
    await page.request.post(`${path}/relationship`, {
      headers: { origin: installation.origin },
      data: {
        version: state.draft.version,
        id: 'use',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes.find((item) => item.name === 'Använder')?.id,
          sourceId: 'lo',
          targetId: 'music',
          knowledge: 'known',
        },
      },
    });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    const fullMap = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await expect(
      fullMap.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toBeVisible();
    await expect(fullMap.locator('.spatial-edge')).toHaveCount(0);
    await expectVisibleDirection(fullMap);
    await fullMap.getByText('Navigera rymden', { exact: true }).click();
    await fullMap.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
    await fullMap.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await expectVisibleDirection(fullMap);
    await fullMap.getByText('Navigera rymden', { exact: true }).click();
    await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
    await page.getByRole('button', { name: 'Samlad vy', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
    await expect(
      space.getByRole('button', {
        name: 'Välj samband: Lo Exempel → Använder → Molnmusik',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel('Filtrera objekttyp').selectOption({ label: 'Person' });
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Visa hela rymden', exact: true }).click();
    await space
      .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
      .click({ button: 'right', modifiers: ['Control'] });
    await expect(page.getByText('Fokus: Lo Exempel', { exact: true })).toBeVisible();
    await expect(space.getByRole('dialog')).not.toBeVisible();
    const loIcon = space.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    for (const hit of [
      space.locator('canvas'),
      loIcon,
      space.locator('[data-object-label="lo"]'),
    ]) {
      const before = await loIcon.boundingBox();
      const target = await hit.boundingBox();
      if (!target) throw new Error('Navigation target must be visible');
      await page.mouse.move(target.x + 10, target.y + 10);
      await page.mouse.wheel(0, 12);
      await expect
        .poll(async () => (await loIcon.boundingBox())?.y)
        .toBeLessThan((before?.y ?? 0) - 5);
      expect((await loIcon.boundingBox())?.x).toBeCloseTo(before?.x ?? 0, 0);
    }

    await page.getByText('Navigera rymden', { exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    const position = async () => {
      const label = await space
        .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
        .boundingBox();
      const surface = await space.locator('canvas').boundingBox();
      return { x: (label?.x ?? 0) - (surface?.x ?? 0), y: (label?.y ?? 0) - (surface?.y ?? 0) };
    };
    const beforeClear = await position();
    await page.getByRole('button', { name: 'Visa hela rymden', exact: true }).click();
    expect(await position()).toEqual(beforeClear);
    await page.getByLabel('Sök objekt').fill('Lo');
    await space.getByRole('button', { name: 'Zooma in', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Sök objekt')).toHaveValue('');
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toBeVisible();
    await space
      .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
      .click({ modifiers: ['Control'] });
    await page.getByLabel('Sök objekt').fill('Lo');
    await page.getByLabel('Filtrera objekttyp').selectOption({ label: 'Person' });
    await space.getByRole('button', { name: 'Återställ vy', exact: true }).click();
    await expect(page.getByLabel('Sök objekt')).toHaveValue('');
    await expect(page.getByLabel('Filtrera objekttyp')).toHaveValue('');
    await expect(page.getByText('Fokus: Lo Exempel', { exact: true })).toHaveCount(0);
    await space.getByLabel('Alla etiketter', { exact: true }).check();
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toBeVisible();
    await space
      .getByRole('button', { name: 'Välj samband: Lo Exempel → Använder → Molnmusik', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await expect(page.getByLabel('Till objekt')).toHaveValue('music');
  } finally {
    await installation.close();
  }
});

test('RYMD-03: context actions and draft symbols distinguish proposals from saved content', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read } = await arrange(page, installation.origin);
    let state = await read();
    await page.request.post(`${path}/relationship`, {
      headers: { origin: installation.origin },
      data: {
        version: state.draft.version,
        id: 'use',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes.find((item) => item.name === 'Använder')?.id,
          sourceId: 'lo',
          targetId: 'music',
          knowledge: 'known',
        },
      },
    });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const music = space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true });
    await space.getByLabel('Alla etiketter', { exact: true }).check();
    await expect(music).toContainText('+');
    await page.getByRole('button', { name: 'Visa detaljer och utkast' }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await page.getByRole('button', { name: 'Till kartan', exact: true }).click();
    await music.click({ button: 'right' });
    await page.getByRole('button', { name: 'Redigera objekt', exact: true }).click();
    await page.getByLabel('Beskrivning', { exact: true }).fill('Syntetiskt musikexempel');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Till kartan', exact: true }).click();
    await expect(music).toContainText('~');
    await music.click({ button: 'right' });
    await expect(
      page.getByRole('button', { name: 'Ta bort objekt', exact: true }),
    ).toHaveAccessibleDescription(
      /Objektet och dess 1 samband läggs som borttagningar i ditt utkast/,
    );
    await page.getByRole('button', { name: 'Ta bort objekt', exact: true }).click();
    await expect(music).toContainText('×');
    await expect(
      space.getByRole('button', {
        name: 'Välj samband: Lo Exempel → Använder → Molnmusik',
        exact: true,
      }),
    ).toContainText('×');
    const removedConnection = space.locator('path.connection.removed');
    await expect(removedConnection).toBeVisible();
    const removedGeometry = await removedConnection.evaluate((path: SVGPathElement) => {
      const length = path.getTotalLength();
      const start = path.getPointAtLength(0);
      const end = path.getPointAtLength(length);
      const middle = path.getPointAtLength(length / 2);
      return {
        dash: getComputedStyle(path).strokeDasharray,
        bend:
          Math.abs(
            (end.x - start.x) * (middle.y - start.y) - (end.y - start.y) * (middle.x - start.x),
          ) / Math.hypot(end.x - start.x, end.y - start.y),
      };
    });
    expect(removedGeometry.dash).not.toBe('none');
    expect(removedGeometry.bend).toBeGreaterThan(3);
    state = await read();
    expect(state.objects).toHaveLength(2);
    expect(state.relationships).toHaveLength(1);
    expect(state.draft.changes.map((change) => [change.id, change.after])).toEqual([
      ['music', null],
    ]);
    await page.getByRole('button', { name: 'Visa detaljer och utkast' }).click();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Borttagning av samband',
    );
    await page.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Kartan är inte ändrad');
  } finally {
    await installation.close();
  }
});

test('RYMD-04: touch menus, viewport changes and graphics recovery retain unsent editing', async ({
  browser,
}) => {
  const installation = await createInstallation();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    const { read } = await arrange(page, installation.origin);
    await page.goto(installation.origin);
    await expect(
      page.getByRole('button', { name: 'Lista och detaljer', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const music = space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true });
    const box = await music.boundingBox();
    expect(box).not.toBeNull();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 },
      ],
    });
    await expect(page.getByRole('button', { name: 'Redigera objekt', exact: true })).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: 'Redigera objekt', exact: true }).click();
    await page.getByLabel('Beskrivning', { exact: true }).fill('Oskickad mobiltext');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByRole('button', { name: 'Till kartan', exact: true }).click();
    await page.getByRole('button', { name: 'Lista och detaljer', exact: true }).click();
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue('Oskickad mobiltext');
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await expect
      .poll(async () => (await space.locator('canvas').boundingBox())?.height)
      .toBeGreaterThan(200);
    const surface = await space.locator('canvas').boundingBox();
    expect((surface?.y ?? 0) + (surface?.height ?? 0)).toBeLessThanOrEqual(390);
    await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('The test browser must support context loss');
      extension.loseContext();
      window.setTimeout(() => extension.restoreContext(), 400);
    });
    await expect(
      page.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.', { exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Visa detaljer och utkast' }).click();
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue('Oskickad mobiltext');
    expect(
      (await read()).draft.changes.find((change) => change.id === 'music')?.after?.description,
    ).toBe('');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    expect((await read()).objects.find((object) => object.id === 'music')?.description).toBe(
      'Oskickad mobiltext',
    );
  } finally {
    await context.close();
    await installation.close();
  }
});

test('RYMD-05: labels, keyboard editing and relationship text survive view changes', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read } = await arrange(page, installation.origin);
    const state = await read();
    await page.request.post(`${path}/relationship`, {
      headers: { origin: installation.origin },
      data: {
        version: state.draft.version,
        id: 'use',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes.find((item) => item.name === 'Använder')?.id,
          sourceId: 'lo',
          targetId: 'music',
          knowledge: 'known',
        },
      },
    });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Samlad vy', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
    const geometry = () =>
      space.evaluate((region) => {
        const surface = region.querySelector('.spatial-lines')?.getBoundingClientRect();
        if (!surface) throw new Error('The map surface must be visible');
        const leaders = [...region.querySelectorAll<SVGLineElement>('.label-leader')];
        return [...region.querySelectorAll<HTMLElement>('[data-layout-id]')].map((label) => {
          const box = label.getBoundingClientRect();
          const x = box.x + box.width / 2 - surface.x;
          const y = box.y + box.height / 2 - surface.y;
          const leader = leaders.find(
            (line) => Math.hypot(line.x2.baseVal.value - x, line.y2.baseVal.value - y) < 1,
          );
          if (!leader) throw new Error(`Missing attachment for ${label.dataset.layoutId}`);
          const anchor = { x: leader.x1.baseVal.value, y: leader.y1.baseVal.value };
          return {
            id: label.dataset.layoutId,
            anchor,
            x,
            y,
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            distance: Math.hypot(x - anchor.x, y - anchor.y),
            dash: getComputedStyle(leader).strokeDasharray,
            stroke: getComputedStyle(leader).stroke,
          };
        });
      });
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }),
    ).toBeVisible();
    const overview = await geometry();
    const objectPoints = (items: typeof overview) =>
      items.filter((item) => item.id?.startsWith('object-'));
    const separation = (items: typeof overview) => {
      const [first, second] = objectPoints(items);
      return Math.hypot(first.anchor.x - second.anchor.x, first.anchor.y - second.anchor.y);
    };
    expect(objectPoints(overview)).toHaveLength(2);
    expect(overview.find((item) => item.id === 'relationship-use')).toBeDefined();
    const nodes = await space.locator('.spatial-node').evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        };
      }),
    );
    for (const node of nodes) {
      expect(node.width).toBe(44);
      expect(node.height).toBe(44);
    }
    // Names remain close to their compact circles. Every visible label in
    // this bounded overview must be distinct from other names and circles.
    for (const label of objectPoints(overview)) {
      expect(label.distance).toBeGreaterThan(22);
      expect(label.distance).toBeLessThan(160);
    }
    for (const [index, label] of overview.entries()) {
      for (const other of [...overview.slice(index + 1), ...nodes]) {
        expect(
          label.right <= other.left ||
            label.left >= other.right ||
            label.bottom <= other.top ||
            label.top >= other.bottom,
        ).toBe(true);
      }
    }
    for (const label of overview) {
      expect(label.stroke).not.toBe('none');
      if (label.distance > 100) expect(label.dash).not.toBe('none');
      if (label.distance < 20) expect(label.dash).toBe('none');
    }
    await space.getByLabel('Alla etiketter', { exact: true }).check();
    await expect
      .poll(async () => separation(await geometry()))
      .toBeGreaterThan(separation(overview) * 1.2);
    const labelView = await space.locator('.spatial-node').first().getAttribute('style');
    await space.getByLabel('Alla etiketter', { exact: true }).uncheck();
    await space.getByLabel('Alla etiketter', { exact: true }).check();
    expect(await space.locator('.spatial-node').first().getAttribute('style')).toBe(labelView);
    await expect(
      space.getByText('Närmare utsnitt. Panorera för att se fler etiketter.', { exact: true }),
    ).toBeVisible();
    const beforePan = await geometry();
    await space.getByText('Navigera rymden', { exact: true }).click();
    await space.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await expect
      .poll(async () =>
        Math.abs(objectPoints(await geometry())[0].anchor.x - objectPoints(beforePan)[0].anchor.x),
      )
      .toBeGreaterThan(25);
    await space.getByRole('button', { name: 'Återställ vy', exact: true }).click();
    await expect(space.getByLabel('Alla etiketter', { exact: true })).toBeChecked();
    await expect
      .poll(async () => Math.abs(separation(await geometry()) - separation(overview)))
      .toBeLessThan(2);
    for (const [index, object] of objectPoints(await geometry()).entries()) {
      expect(
        Math.hypot(
          object.anchor.x - objectPoints(overview)[index].anchor.x,
          object.anchor.y - objectPoints(overview)[index].anchor.y,
        ),
      ).toBeLessThan(2);
    }
    const relationship = page
      .getByRole('list', { name: 'Samband', exact: true })
      .getByRole('button', { name: 'Lo Exempel → Använder → Molnmusik', exact: true });
    const objectRow = page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Lo Exempel', exact: true });
    await objectRow.focus();
    await page.keyboard.press('Enter');
    await expect(objectRow).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true }),
    ).toHaveAccessibleDescription(
      /Objektet och dess 1 samband läggs som borttagningar i ditt utkast/,
    );
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Objektets namn')).toBeFocused();
    await expect(
      page
        .getByRole('group', { name: 'Objektets detaljer' })
        .getByRole('button', { name: 'Ta bort', exact: true }),
    ).toHaveAccessibleDescription(
      /Objektet och dess 1 samband läggs som borttagningar i ditt utkast/,
    );
    await page.getByRole('button', { name: 'Stäng utan att skicka texten', exact: true }).click();
    await relationship.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await expect(page.getByLabel('Från objekt', { exact: true })).toBeFocused();
    await page
      .getByLabel('Sambandets slutdatum: uppgiftens säkerhet', { exact: true })
      .selectOption('known');
    await page.getByLabel('Sambandets slutdatum', { exact: true }).fill('2026-12-31');
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await page.setViewportSize({ width: 900, height: 600 });
    await page.getByRole('button', { name: 'Visa detaljer och utkast', exact: true }).click();
    await expect(page.getByLabel('Sambandets slutdatum', { exact: true })).toHaveValue(
      '2026-12-31',
    );
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    expect((await read()).relationships[0].endDate?.value).toBe('2026-12-31');
  } finally {
    await installation.close();
  }
});

test('RYMD-06: losing household access in fullscreen restores login navigation', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await arrange(page, installation.origin);
    const state = await read();
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await page.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera val', exact: true }).click();
    await page.getByLabel('Beskrivning', { exact: true }).fill('Syntetisk text före åtkomstbyte');
    installation.revokeMembership(state.userId);
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Du har inte längre tillgång');
    await expect(page.getByRole('button', { name: 'Logga ut', exact: true })).toBeVisible({
      timeout: 1000,
    });
    await page.getByRole('button', { name: 'Logga ut', exact: true }).click({ timeout: 1000 });
    await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
    await expect(page.getByText('Syntetisk text före åtkomstbyte', { exact: true })).toHaveCount(0);
  } finally {
    await installation.close();
  }
});

test('RYMD-07: ended objects and relationships retain status beside draft symbols', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read } = await arrange(page, installation.origin);
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const state = await read();
    for (const change of state.draft.changes) {
      expect(
        (
          await post('draft', {
            version: (await read()).draft.version,
            id: change.id,
            baseRevision: null,
            value: {
              ...change.after,
              lifecycle: change.id === 'music' ? 'ended' : 'active',
              financialFacts: { endDate: { knowledge: 'known', value: '2000-01-01' } },
            },
          })
        ).ok(),
      ).toBe(true);
    }
    expect(
      (
        await post('relationship', {
          version: (await read()).draft.version,
          id: 'use',
          baseRevision: null,
          value: {
            typeId: state.relationshipTypes.find((item) => item.name === 'Använder')?.id,
            sourceId: 'lo',
            targetId: 'music',
            knowledge: 'known',
            endDate: { knowledge: 'known', value: '2000-01-01' },
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByLabel('Alla etiketter', { exact: true }).check();
    const musicNode = space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true });
    const music = space.locator('[data-object-label="music"]');
    const lo = space.locator('[data-object-label="lo"]');
    const edge = space.getByRole('button', {
      name: 'Välj samband: Lo Exempel → Använder → Molnmusik',
      exact: true,
    });
    for (const [label, symbolContainer] of [
      [music, musicNode],
      [edge, edge],
    ]) {
      await expect(label.getByText('Upphört', { exact: true })).toBeVisible();
      await expect(symbolContainer).toContainText('+');
      const endedColor = await label
        .getByText('Upphört')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      const proposalColor = await symbolContainer
        .getByTitle('Nytt förslag')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(endedColor).not.toBe(proposalColor);
    }
    await expect(lo).not.toContainText('Upphört');
    await expect(musicNode).toHaveAccessibleDescription(/Upphört/);
    await page.getByRole('button', { name: 'Visa detaljer och utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    await page.getByRole('button', { name: 'Öppna rymdkartan', exact: true }).click();
    await expect(music.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(musicNode).toHaveAccessibleDescription(/Upphört/);
    await expect(edge.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(lo).not.toContainText('Upphört');
    await expect(space.getByTitle('Nytt förslag')).toHaveCount(0);
    await edge.click();
    await page.getByRole('button', { name: 'Redigera val', exact: true }).click();
    await page.getByLabel('Sambandets status').selectOption('active');
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Till kartan', exact: true }).click();
    await expect(edge).not.toContainText('Upphört');
    await expect(edge).toContainText('~');
    await expect(music.getByText('Upphört', { exact: true })).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('RYMD-08: focus retains old and proposed relationship endpoints and opens the saved route read-only', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read } = await arrange(page, installation.origin);
    let state = await read();
    await page.request.post(`${path}/draft`, {
      headers: { origin: installation.origin },
      data: {
        version: state.draft.version,
        id: 'kim',
        baseRevision: null,
        value: {
          name: 'Kim Exempel',
          description: '',
          typeId: state.types.find((type) => type.name === 'Person')?.id,
        },
      },
    });
    state = await read();
    await page.request.post(`${path}/relationship`, {
      headers: { origin: installation.origin },
      data: {
        version: state.draft.version,
        id: 'payer',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes.find((type) => type.name === 'Betalar')?.id,
          sourceId: 'lo',
          targetId: 'music',
          knowledge: 'known',
        },
      },
    });
    state = await read();
    await page.request.post(`${path}/save`, {
      headers: { origin: installation.origin },
      data: { version: state.draft.version, operationId: 'saved-payer' },
    });
    state = await read();
    const edge = state.relationships[0];
    await page.request.post(`${path}/relationship`, {
      headers: { origin: installation.origin },
      data: {
        version: state.draft.version,
        id: edge.id,
        baseRevision: edge.revision,
        value: { ...edge, sourceId: 'kim' },
      },
    });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Samlad vy', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space
      .getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true })
      .click({ button: 'right', modifiers: ['Control'] });
    for (const name of ['Lo Exempel', 'Kim Exempel'])
      await expect(
        space.getByRole('button', { name: `Välj objekt: ${name}`, exact: true }),
      ).toBeVisible();
    const previous = space.getByRole('button', {
      name: 'Välj tidigare samband: Lo Exempel → Betalar → Molnmusik',
      exact: true,
    });
    await expect(previous).toContainText('×');
    await previous.click();
    const inspector = page.getByRole('region', { name: 'Tidigare samband', exact: true });
    await expect(inspector).toContainText('Lo Exempel → Betalar → Molnmusik');
    await expect(inspector.locator('input, select, textarea')).toHaveCount(0);
    await expect(page.getByText('Fokus: Molnmusik', { exact: true })).toBeVisible();
    await space
      .getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true })
      .click({ modifiers: ['Control'] });
    await space
      .getByRole('button', { name: 'Välj samband: Kim Exempel → Betalar → Molnmusik', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await expect(page.getByLabel('Från objekt')).toHaveValue('kim');
    expect((await read()).draft.version).toBe(state.draft.version + 1);
  } finally {
    await installation.close();
  }
});
