import type { Locator, Page } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openTable,
  setAllLabels,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  closeTableObject,
  editObjectRelationship,
  editTableObject,
  readTableObject,
} from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { focusMapSearch, mapFilters } from '../support/object-search.js';
import {
  openProperties,
  propertyRow,
  propertyValue,
  setProperty,
} from '../support/property-controls.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function expectContextIcons(page: Page, anchor: Locator) {
  const actions = page.getByRole('toolbar', { name: 'Åtgärder för Molnmusik', exact: true });
  await expect(actions).toBeVisible();
  await expect(actions.getByRole('button')).toHaveCount(7);
  expect(await actions.locator('button').allTextContents()).toEqual(['', '', '', '', '', '', '']);
  await expect(
    actions.getByRole('button', { name: 'Redigera objekt', exact: true }),
  ).toHaveAttribute('title', /redigeringsformulär/);
  await expect(
    actions.getByRole('button', { name: 'Visa i kartan', exact: true }),
  ).toHaveAccessibleDescription(/Rensar kartans sökning och filter/);
  await expect(
    actions.getByRole('button', { name: 'Visa samband i kartan', exact: true }),
  ).toHaveAccessibleDescription(/Behåller kartans sökning och filter/);
  await expect(
    actions.getByRole('button', { name: 'Fokusera markering', exact: true }),
  ).toHaveAccessibleDescription(/alla markerade objekt.*Behåller markeringen/);
  const bounds = await actions.boundingBox();
  const target = await anchor.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(target).not.toBeNull();
  if (!bounds || !target || !viewport) throw new Error('Context actions need visible bounds');
  expect(bounds.x).toBeGreaterThanOrEqual(8);
  expect(bounds.y).toBeGreaterThanOrEqual(8);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 8);
  if (target.x + target.width + 8 + bounds.width <= viewport.width - 8)
    expect(bounds.x).toBeCloseTo(target.x + target.width + 8, 0);
  return actions;
}

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
            value: { name, typeId: state.types.find((item) => item.name === type)?.id },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  return { read, path, household };
}

async function expectVisibleDirection(space: Locator) {
  const line = space.locator('line.connection');
  const { arrow, surface, target } = await line.evaluate((element: SVGLineElement) => {
    const region = element.closest('.spatial-map');
    const svg = element.ownerSVGElement;
    const connection = element.closest('.spatial-connection');
    const node = region?.querySelector('[aria-label="Välj objekt: Molnmusik"]');
    if (!svg || !node || !connection) throw new Error('The map and target must be visible');
    const bounds = (item: Element) => {
      const { x, y, width, height } = item.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      arrow: {
        start: { x: element.x1.baseVal.value, y: element.y1.baseVal.value },
        tip: { x: element.x2.baseVal.value, y: element.y2.baseVal.value },
        color: getComputedStyle(element).stroke.match(/\d+/g)?.map(Number) ?? [],
        opacity: Number(getComputedStyle(connection).opacity),
        width: Number.parseFloat(getComputedStyle(element).strokeWidth),
      },
      surface: bounds(svg),
      target: bounds(node),
    };
  });
  const svg = space.locator('svg.spatial-depth-lines');
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
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }).click();
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Namn', { exact: true })).toHaveCount(0);
    await editTableObject(page, 'Molnmusik');
    await page.getByLabel('Namn', { exact: true }).fill('Molnmusik familj');
    await page
      .locator('dialog.object-dialog-C')
      .getByRole('button', { name: 'Avbryt', exact: true })
      .click();
    await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Molnmusik familj');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    expect((await read()).objects).toHaveLength(0);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openMap(page);
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik familj', exact: true }),
    ).toBeVisible();
    expect((await read()).objects.map((item) => item.name).sort()).toEqual([
      'Lo Exempel',
      'Molnmusik familj',
    ]);
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await expect(table.getByRole('button', { name: 'Lo Exempel', exact: true })).toBeVisible();
    await expect(
      table.getByRole('button', { name: 'Molnmusik familj', exact: true }),
    ).toBeVisible();
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
        },
      },
    });
    await page.goto(installation.origin);
    await openMap(page);
    const fullMap = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await expect(
      fullMap.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toBeVisible();
    await expect(fullMap.locator('.spatial-edge')).toHaveCount(1);
    await expectVisibleDirection(fullMap);
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await expectVisibleDirection(fullMap);
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
    await expect(
      space.getByRole('button', {
        name: 'Välj samband: Lo Exempel → Använder → Molnmusik',
        exact: true,
      }),
    ).toBeVisible();
    await focusMapSearch(page);
    const search = page.getByRole('region', { name: 'Kartans sökning och filter', exact: true });
    await (await mapFilters(page)).getByRole('checkbox', { name: 'Person', exact: true }).check();
    await expect(space.locator('.spatial-node')).toHaveCount(2);
    await expect(page.getByRole('complementary', { name: 'Kartans sökresultat' })).toContainText(
      '1 objekt visas som sammanhang',
    );
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toBeVisible();
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await (await mapFilters(page))
      .getByRole('button', { name: 'Återställ filter', exact: true })
      .click();
    await search.getByRole('searchbox').press('Escape');
    await space
      .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
      .click({ button: 'right' });
    await page
      .getByRole('toolbar', { name: /^Åtgärder för/ })
      .getByRole('button', { name: 'Visa samband i kartan', exact: true })
      .click();
    await expect(
      page.getByText(
        'Visar direkta samband för Lo Exempel. Sökningen och tidigare innehåll finns kvar.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole('toolbar', { name: /^Åtgärder för/ })).toHaveCount(0);
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

    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    const position = async () => {
      const label = await space
        .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
        .boundingBox();
      const surface = await space.locator('canvas').boundingBox();
      return { x: (label?.x ?? 0) - (surface?.x ?? 0), y: (label?.y ?? 0) - (surface?.y ?? 0) };
    };
    const beforeClear = await position();
    await focusMapSearch(page);
    await (await mapFilters(page))
      .getByRole('button', { name: 'Återställ filter', exact: true })
      .click();
    expect(await position()).toEqual(beforeClear);
    const query = search.getByRole('searchbox', { name: 'Sök objekt i kartan', exact: true });
    await query.fill('Lo');
    await search.getByRole('searchbox').press('Escape');
    await page.getByRole('button', { name: 'Zooma in', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(query).toHaveValue('Lo');
    await space.locator('canvas').press('Escape');
    await focusMapSearch(page);
    await expect(query).toHaveValue('');
    await search.getByRole('button', { name: 'Rensa sökning', exact: true }).click();
    await search.getByRole('searchbox').press('Escape');
    await expect(
      space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }),
    ).toBeVisible();
    await space
      .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
      .click({ button: 'right' });
    await page
      .getByRole('toolbar', { name: /^Åtgärder för/ })
      .getByRole('button', { name: 'Visa samband i kartan', exact: true })
      .click();
    await focusMapSearch(page);
    await query.fill('Lo');
    await (await mapFilters(page)).getByRole('checkbox', { name: 'Person', exact: true }).check();
    await search.getByRole('searchbox').press('Escape');
    await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
    await focusMapSearch(page);
    await expect(query).toHaveValue('');
    await expect(
      (await mapFilters(page)).getByRole('checkbox', { name: 'Person', exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('button', { name: 'Tillbaka till sökträffarna', exact: true }),
    ).toHaveCount(0);
    await search.getByRole('searchbox').press('Escape');
    await setAllLabels(page, true);
    await space
      .getByRole('button', { name: 'Välj samband: Lo Exempel → Använder → Molnmusik', exact: true })
      .dblclick();
    await page
      .getByRole('region', { name: 'Valt samband', exact: true })
      .getByRole('button', { name: 'Redigera valt samband', exact: true })
      .click();
    await expect(page.getByLabel('Till objekt', { exact: true })).toHaveValue('music');
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
        },
      },
    });
    await page.goto(installation.origin);
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const music = space.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true });
    await setAllLabels(page, true);
    await expect(music).toContainText('+');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await openMap(page);
    await music.click();
    await music.click({ button: 'right' });
    const actions = await expectContextIcons(page, music);
    await expect(
      actions.getByRole('button', { name: 'Redigera objekt', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(
      actions.getByRole('button', { name: 'Visa uppgifter för Molnmusik', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(
      actions.getByRole('button', { name: 'Samband för Molnmusik', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(actions.getByRole('button', { name: 'Visa i kartan', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(
      actions.getByRole('button', { name: 'Visa samband i kartan', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(
      actions.getByRole('button', { name: 'Fokusera markering', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(actions).toHaveCount(0);
    await expect(music).toBeFocused();
    await page.keyboard.press('Shift+F10');
    await expect(actions).toBeVisible();
    await space.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).click();
    await expect(actions).toHaveCount(0);
    await music.click({ button: 'right' });
    await page.getByRole('button', { name: 'Redigera objekt', exact: true }).click();
    await setProperty(page, 'Beskrivning', 'Syntetiskt musikexempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openMap(page);
    await expect(music).toContainText('✎');
    const musicName = space.getByRole('button', { name: 'Markera objekt: Molnmusik', exact: true });
    await expect(musicName).toBeVisible();
    expect(
      await musicName.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
        );
      }),
    ).toBe(true);
    await musicName.click({ button: 'right' });
    await expectContextIcons(page, musicName);
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
    const draft = await openDraftReview(page);
    await expect(draft).toContainText('Tas bort');
    await expect(draft).toContainText('Lo Exempel → Använder → Molnmusik');
    await draft.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
      .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
      .click();
    await expect(
      page.getByRole('status', { name: 'Utkastets åtgärdsstatus', exact: true }),
    ).toContainText('Hela ditt utkast har tagits bort');
    expect((await read()).objects).toEqual(state.objects);
    expect((await read()).relationships).toEqual(state.relationships);
  } finally {
    await installation.close();
  }
});

test('RYMD-04: touch menus, viewport changes and graphics recovery retain unsent editing', async ({
  browser,
}) => {
  const installation = await createInstallation();
  const context = await createPreparedContext(browser, {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  try {
    const { read } = await arrange(page, installation.origin);
    await page.goto(installation.origin);
    await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Hushållets tabell', exact: true })
        .getByRole('button', { name: '＋ Nytt objekt', exact: true }),
    ).not.toBeVisible();
    await openMap(page);
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
    const actions = await expectContextIcons(page, music);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(actions).toBeVisible();
    await expect(page.locator('dialog.object-dialog-C')).toHaveCount(0);
    await page.getByRole('button', { name: 'Redigera objekt', exact: true }).click();
    const form = page.locator('dialog.object-dialog-C');
    await setProperty(form, 'Beskrivning', 'Oskickad mobiltext');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(propertyRow(form, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Oskickad mobiltext',
    );
    await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('The test browser must support context loss');
      extension.loseContext();
      window.setTimeout(() => extension.restoreContext(), 400);
    });
    const interrupted = page.getByText(
      'Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.',
      { exact: true },
    );
    await expect(interrupted).toBeVisible();
    await expect(interrupted).toHaveCount(0);
    await expect(propertyRow(form, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Oskickad mobiltext',
    );
    expect(
      propertyValue(
        (await read()).draft.changes.find((change) => change.id === 'music')?.after,
        'Beskrivning',
      ),
    ).toBeUndefined();
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openMap(page);
    await expect
      .poll(async () => (await space.locator('canvas').boundingBox())?.height)
      .toBeGreaterThan(200);
    const surface = await space.locator('canvas').boundingBox();
    expect((surface?.y ?? 0) + (surface?.height ?? 0)).toBeLessThanOrEqual(390);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    expect(
      propertyValue(
        (await read()).objects.find((object) => object.id === 'music'),
        'Beskrivning',
      ),
    ).toBe('Oskickad mobiltext');
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
        },
      },
    });
    await page.goto(installation.origin);
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await expect(page.getByRole('button', { name: 'Återställ vy', exact: true })).toBeDisabled();
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
      expect(label.dash).toBe('1px, 4px');
    }
    await setAllLabels(page, true);
    await expect
      .poll(async () => separation(await geometry()))
      .toBeGreaterThan(separation(overview) * 1.2);
    const labelView = await space.locator('.spatial-node').first().getAttribute('style');
    await setAllLabels(page, false);
    await setAllLabels(page, true);
    expect(await space.locator('.spatial-node').first().getAttribute('style')).toBe(labelView);
    await expect(
      page.getByText('Närmare utsnitt. Panorera för att se fler etiketter.', { exact: true }),
    ).toBeVisible();
    const beforePan = await geometry();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await expect
      .poll(async () =>
        Math.abs(objectPoints(await geometry())[0].anchor.x - objectPoints(beforePan)[0].anchor.x),
      )
      .toBeGreaterThan(25);
    await page.getByRole('button', { name: 'Återställ vy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Alla etiketter', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const objectRow = table.getByRole('button', { name: 'Lo Exempel', exact: true });
    await objectRow.focus();
    await page.keyboard.press('Enter');
    await expect(objectRow).toHaveAttribute('aria-expanded', 'true');
    const edit = table.getByRole('button', { name: 'Redigera Lo Exempel', exact: true });
    await edit.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(objectRow).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(edit).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      table.getByRole('button', { name: 'Samband för Lo Exempel', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      table.getByRole('button', { name: 'Visa Lo Exempel i kartan', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      table.getByRole('button', { name: 'Visa samband för Lo Exempel i kartan', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      table.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true }),
    ).toBeFocused();
    const readAll = table.getByRole('button', {
      name: 'Redigera Lo Exempel',
      exact: true,
    });
    await readAll.focus();
    await page.keyboard.press('Enter');
    const reader = page.getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true });
    await expect(reader.getByLabel('Namn', { exact: true })).toBeFocused();
    await closeSupportDialog(page, 'Redigera Lo Exempel', 'Stäng objektdialogen');
    await expect(
      table.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true }),
    ).toHaveAccessibleDescription(
      /Objektet och dess 1 samband läggs som borttagningar i ditt utkast/,
    );
    await edit.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Namn', { exact: true })).toBeFocused();
    await page
      .locator('dialog.object-dialog-C')
      .getByRole('button', { name: 'Avbryt', exact: true })
      .click();
    const relationship = table.getByRole('button', { name: 'Samband för Lo Exempel', exact: true });
    await relationship.focus();
    await page.keyboard.press('Enter');
    let relationshipDialog = page.getByRole('dialog', {
      name: 'Samband för Lo Exempel',
      exact: true,
    });
    await relationshipDialog.getByRole('button', { name: 'Redigera samband', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      relationshipDialog.getByRole('button', { name: 'Redigera samband', exact: true }),
    ).toBeFocused();
    const source = relationshipDialog.getByLabel('Från objekt', { exact: true });
    for (let step = 0; step < 20; step++) {
      await page.keyboard.press('Tab');
      if (await source.evaluate((element) => element === document.activeElement)) break;
    }
    await expect(source).toBeFocused();
    const beforeRelationshipEdit = (await read()).draft;
    await setProperty(relationshipDialog, 'Slutdatum', '2026-12-31', 'date');
    await relationshipDialog.getByRole('button', { name: 'Molnmusik', exact: true }).click();
    await page.setViewportSize({ width: 900, height: 600 });
    const endpoint = page.getByRole('dialog', { name: 'Uppgifter för Molnmusik', exact: true });
    await expect(
      endpoint.getByRole('heading', { name: 'Uppgifter för Molnmusik', exact: true }),
    ).toBeFocused();
    await endpoint.getByRole('button', { name: 'Tillbaka', exact: true }).click();
    relationshipDialog = page.getByRole('dialog', { name: 'Samband för Lo Exempel', exact: true });
    await expect(
      propertyRow(relationshipDialog, 'Slutdatum').getByLabel('Värde', { exact: true }),
    ).toHaveValue('2026-12-31');
    expect((await read()).draft).toEqual(beforeRelationshipEdit);
    await stageRelationshipAndClose(page);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    expect((await read()).relationships[0].properties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Slutdatum', kind: 'date', value: '2026-12-31' }),
      ]),
    );
  } finally {
    await installation.close();
  }
});

test('RYMD-06: losing household access in fullscreen restores login navigation', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  try {
    const { read, household } = await arrange(page, installation.origin);
    const state = await read();
    const other = await createPreparedContext(browser);
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin, 'microsoft');
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const householdPath = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    const invitation = await page.request.post(`${householdPath}/invitations`, {
      headers,
      data: { userId: user.id },
    });
    expect(invitation.status()).toBe(201);
    const { code } = await invitation.json();
    expect(
      (
        await other.request.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await page.request.post(`${householdPath}/members/${user.id}/role`, {
          headers,
          data: { role: 'administrator' },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await other.request.post(`${householdPath}/members/${state.userId}/role`, {
          headers,
          data: { role: 'member' },
        })
      ).status(),
    ).toBe(200);
    await page.goto(installation.origin);
    await openMap(page);
    await page.getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true }).click();
    await editTableObject(page, 'Molnmusik');
    await setProperty(page, 'Beskrivning', 'Syntetisk text före åtkomstbyte');
    expect(
      (
        await other.request.post(`${householdPath}/members/${state.userId}/revoke`, {
          headers,
          data: {},
        })
      ).status(),
    ).toBe(200);
    await other.close();
    const denied = page.waitForResponse(
      (response) => response.url().endsWith('/map/object-form') && response.status() === 403,
    );
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await denied;
    await expect(
      page.getByRole('heading', { name: 'Du har inte tillgång till hushållet', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hushållskarta', exact: true })).toHaveCount(0);
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
          },
        })
      ).ok(),
    ).toBe(true);
    for (const change of state.draft.changes) {
      if (!change.after) throw new Error('Initial object proposals must contain values');
      await page.goto(installation.origin);
      const editor = await editTableObject(page, change.after.name);
      await openProperties(editor);
      await setProperty(editor, 'Slutdatum', '2000-01-01', 'date');
      await editor.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
      await editor
        .getByLabel('Objektets status', { exact: true })
        .selectOption(change.id === 'music' ? 'ended' : 'active');
      await editor.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(editor).not.toBeVisible();
      expect(
        (await read()).draft.changes.find((value) => value.id === change.id)?.after,
      ).toMatchObject({
        ...change.after,
        lifecycle: change.id === 'music' ? 'ended' : 'active',
        properties: expect.arrayContaining([
          expect.objectContaining({ label: 'Slutdatum', kind: 'date', value: '2000-01-01' }),
        ]),
      });
      expect(
        (
          await post('draft', {
            version: (await read()).draft.version,
            id: change.id,
            baseRevision: null,
            value: {
              ...change.after,
              lifecycle: change.id === 'music' ? 'ended' : 'active',
              properties: [
                { id: 'endDate', label: 'Slutdatum', kind: 'text' as const, value: '2000-01-01' },
              ],
            },
          })
        ).ok(),
      ).toBe(true);
    }
    await page.reload();
    const nativeRelationship = await editObjectRelationship(
      page,
      'Lo Exempel',
      'Lo Exempel → Använder → Molnmusik',
    );
    await setProperty(nativeRelationship, 'Slutdatum', '2000-01-01', 'date');
    await nativeRelationship.getByLabel('Sambandets status', { exact: true }).selectOption('ended');
    await stageRelationshipAndClose(page);
    expect(
      (await read()).draft.relationships?.find((change) => change.after?.sourceId === 'lo')?.after,
    ).toMatchObject({
      typeId: state.relationshipTypes.find((item) => item.name === 'Använder')?.id,
      sourceId: 'lo',
      targetId: 'music',
      lifecycle: 'ended',
      properties: [
        expect.objectContaining({ label: 'Slutdatum', kind: 'date', value: '2000-01-01' }),
      ],
    });
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
            lifecycle: 'ended',
            properties: [
              { id: 'endDate', label: 'Slutdatum', kind: 'date' as const, value: '2000-01-01' },
            ],
          },
        })
      ).ok(),
    ).toBe(true);
    await page.goto(installation.origin);
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await setAllLabels(page, true);
    await focusMapSearch(page);
    const search = page.getByRole('region', { name: 'Kartans sökning och filter', exact: true });
    await (await mapFilters(page))
      .getByRole('checkbox', { name: 'Ta med upphörda', exact: true })
      .check();
    await search.getByRole('searchbox').press('Escape');
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
      await expect(symbolContainer.getByTitle('Nytt förslag')).toHaveCSS(
        'color',
        'rgb(24, 119, 71)',
      );
    }
    await expect(lo).not.toContainText('Upphört');
    await expect(musicNode).toHaveAccessibleDescription(/Upphört/);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openMap(page);
    await focusMapSearch(page);
    await (await mapFilters(page))
      .getByRole('checkbox', { name: 'Ta med upphörda', exact: true })
      .check();
    await search.getByRole('searchbox').press('Escape');
    await expect(music.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(musicNode).toHaveAccessibleDescription(/Upphört/);
    await expect(edge.getByText('Upphört', { exact: true })).toBeVisible();
    await expect(lo).not.toContainText('Upphört');
    await expect(space.getByTitle('Nytt förslag')).toHaveCount(0);
    await edge.dblclick();
    await page
      .getByRole('region', { name: 'Valt samband', exact: true })
      .getByRole('button', { name: 'Redigera valt samband', exact: true })
      .click();
    await page.getByLabel('Sambandets status').selectOption('active');
    await stageRelationshipAndClose(page);
    await openMap(page);
    await expect(edge).not.toContainText('Upphört');
    await expect(edge).toContainText('✎');
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
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await space
      .getByRole('button', { name: 'Välj objekt: Molnmusik', exact: true })
      .click({ button: 'right' });
    await page
      .getByRole('toolbar', { name: /^Åtgärder för/ })
      .getByRole('button', { name: 'Visa samband i kartan', exact: true })
      .click();
    for (const name of ['Lo Exempel', 'Kim Exempel'])
      await expect(
        space.getByRole('button', { name: `Välj objekt: ${name}`, exact: true }),
      ).toBeVisible();
    const previous = space.getByRole('button', {
      name: 'Välj tidigare samband: Lo Exempel → Betalar → Molnmusik',
      exact: true,
    });
    await expect(previous).toContainText('×');
    await previous.dblclick();
    const inspector = page.getByRole('region', { name: 'Valt samband', exact: true });
    await expect(inspector).toContainText('Lo Exempel → Betalar → Molnmusik');
    await focusMapSearch(page);
    const search = page.getByRole('region', { name: 'Kartans sökning och filter', exact: true });
    await expect(
      page.getByRole('button', { name: 'Tillbaka till sökträffarna', exact: true }),
    ).toBeVisible();
    await search.getByRole('searchbox').press('Escape');
    await inspector.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    await space
      .getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true })
      .click({ button: 'right' });
    await page
      .getByRole('toolbar', { name: /^Åtgärder för/ })
      .getByRole('button', { name: 'Visa samband i kartan', exact: true })
      .click();
    await space
      .getByRole('button', { name: 'Välj samband: Kim Exempel → Betalar → Molnmusik', exact: true })
      .dblclick();
    await page
      .getByRole('region', { name: 'Valt samband', exact: true })
      .getByRole('button', { name: 'Redigera valt samband', exact: true })
      .click();
    await expect(page.getByLabel('Från objekt', { exact: true })).toHaveValue('kim');
    expect((await read()).draft.version).toBe(state.draft.version + 1);
  } finally {
    await installation.close();
  }
});

test('RYMD-09: dense mobile maps offer separate pointer and keyboard targets with selected label priority and text alternatives', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read } = await arrange(page, installation.origin);
    const initial = await read();
    for (let index = 0; index < 8; index += 1) {
      expect(
        (
          await page.request.post(`${path}/draft`, {
            headers: { origin: installation.origin },
            data: {
              version: (await read()).draft.version,
              id: `dense-${index}`,
              baseRevision: null,
              value: { name: `Nära objekt ${index + 1}`, typeId: initial.types[0].id },
            },
          })
        ).ok(),
      ).toBe(true);
    }
    expect(
      (
        await page.request.post(`${path}/relationship`, {
          headers: { origin: installation.origin },
          data: {
            version: (await read()).draft.version,
            id: 'dense-edge',
            baseRevision: null,
            value: {
              typeId: initial.relationshipTypes[0].id,
              sourceId: 'dense-6',
              targetId: 'dense-7',
            },
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.post(`${path}/save`, {
          headers: { origin: installation.origin },
          data: { version: (await read()).draft.version, operationId: 'dense-map' },
        })
      ).ok(),
    ).toBe(true);
    const saved = await read();
    for (const [index, object] of saved.objects.entries()) {
      expect(
        (
          await page.request.post(`${path}/view/position`, {
            headers: { origin: installation.origin },
            data: {
              id: object.id,
              version: 0,
              position: { x: index * 0.04, y: index * 0.03, z: index * 0.04 },
            },
          })
        ).ok(),
      ).toBe(true);
    }
    const personal = await (await page.request.get(`${path}/view`)).json();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(installation.origin);
      await openMap(page);
      const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
      await expect(space.locator('button[data-object-id]')).toHaveCount(saved.objects.length);
      const names = space.getByRole('button', { name: /^Markera objekt:/ });
      await expect.poll(() => names.count()).toBeGreaterThanOrEqual(4);
      const first = names.nth(3);
      const name = (await first.getAttribute('aria-label'))?.replace('Markera objekt: ', '');
      const marker = space.getByRole('button', { name: `Välj objekt: ${name}`, exact: true });
      const before = await space
        .locator('button[data-object-id]')
        .evaluateAll((nodes) =>
          nodes.map((node) => [node.getAttribute('data-object-id'), node.getAttribute('style')]),
        );
      await first.click();
      await expect(marker).toHaveAttribute('aria-pressed', 'true');
      expect(
        await space
          .locator('button[data-object-id]')
          .evaluateAll((nodes) =>
            nodes.map((node) => [node.getAttribute('data-object-id'), node.getAttribute('style')]),
          ),
      ).toEqual(before);
      const selectedName = space.getByRole('button', {
        name: `Markera objekt: ${name}`,
        exact: true,
      });
      await expect(selectedName).toBeInViewport({ ratio: 1 });
      const targets = await names.evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            hit: node.contains(
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
            ),
          };
        }),
      );
      expect(
        targets.every((target) => target.width >= 24 && target.height >= 24 && target.hit),
      ).toBe(true);
      const keyboardTarget = space.getByRole('button', {
        name: 'Välj objekt: Nära objekt 8',
        exact: true,
      });
      await keyboardTarget.focus();
      await page.keyboard.press('Enter');
      await expect(keyboardTarget).toHaveAttribute('aria-pressed', 'true');
      await expect(
        space.getByRole('button', { name: 'Markera objekt: Nära objekt 8', exact: true }),
      ).toBeInViewport({ ratio: 1 });
      const relationship = space.getByRole('button', {
        name: 'Välj samband: Nära objekt 7 → Använder → Nära objekt 8',
        exact: true,
      });
      await relationship.click();
      await expect(relationship).toHaveClass(/selected/);
      await expect(relationship).toBeInViewport({ ratio: 1 });
      expect(
        await relationship.evaluate((label) => {
          const box = label.getBoundingClientRect();
          return (
            label.contains(
              document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
            ) &&
            [...document.querySelectorAll('.spatial-name')].every((name) => {
              const other = name.getBoundingClientRect();
              return (
                box.right <= other.left ||
                box.left >= other.right ||
                box.bottom <= other.top ||
                box.top >= other.bottom
              );
            })
          );
        }),
      ).toBe(true);
      expect(
        await space
          .locator('button[data-object-id]')
          .evaluateAll((nodes) =>
            nodes.map((node) => [node.getAttribute('data-object-id'), node.getAttribute('style')]),
          ),
      ).toEqual(before);
      const graphics = await space.locator('canvas').evaluateHandle((canvas: HTMLCanvasElement) => {
        const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
        if (!extension) throw new Error('Native graphics loss must be available');
        extension.loseContext();
        return extension;
      });
      await expect(
        space.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.'),
      ).toBeVisible();
      await openTable(page);
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      const textObject = table.getByRole('button', { name: 'Nära objekt 1', exact: true });
      await expect(textObject).toBeVisible();
      await textObject.focus();
      await page.keyboard.press('Enter');
      if ((await textObject.getAttribute('aria-expanded')) !== 'true')
        await page.keyboard.press('Enter');
      await expect(textObject).toHaveAttribute('aria-expanded', 'true');
      await expect(textObject.locator('xpath=ancestor::tr')).toHaveAttribute(
        'data-selected',
        'true',
      );
      await graphics.evaluate((extension) => extension.restoreContext());
      await graphics.dispose();
      await openMap(page);
      await expect(
        space.getByText('Grafiken är tillfälligt avbruten. Ditt utkast finns kvar.'),
      ).toHaveCount(0);
      await expect(space.locator('button[data-object-id]')).toHaveCount(saved.objects.length);
      expect(await (await page.request.get(`${path}/view`)).json()).toEqual(personal);
      expect(await read()).toEqual(saved);
    }
  } finally {
    await installation.close();
  }
});

test('RYMD-10: label notices remain stable while a compact map opens its saved and private list', async ({
  page,
}) => {
  const app = await createInstallation();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 640, height: 500 });
    // These fictional IDs reproduce the default positions of the connected
    // family workflow that exposed an unstable hidden-label notice.
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const initial = await read();
    const person = initial.types.find((item) => item.name === 'Person');
    const subscription = initial.types.find((item) => item.name === 'Abonnemang');
    if (!person || !subscription) throw new Error('The real household catalog is incomplete');
    for (const [id, value] of [
      [
        '131b9df9-be76-4fc4-af0e-f8bfcf2589e4',
        {
          name: 'Familjens Molnmusik',
          typeId: subscription.id,
          properties: [
            {
              id: 'description',
              label: 'Beskrivning',
              kind: 'text' as const,
              value: 'Rättad för hand',
            },
            { id: 'price', label: 'Pris', kind: 'text' as const, value: '189' },
            { id: 'currency', label: 'Valuta', kind: 'text' as const, value: 'SEK' },
            {
              id: 'paymentInterval',
              label: 'Betalningsintervall',
              kind: 'text' as const,
              value: 'månad',
            },
          ],
        },
      ],
      ['882e85e4-be1d-45a8-941a-93faf8ee99dc', { name: 'Kim Exempel', typeId: person.id }],
    ]) {
      const response = await page.request.post(`${path}/draft`, {
        headers: { origin: app.origin },
        data: { version: (await read()).draft.version, id, baseRevision: null, value },
      });
      expect(response.ok(), await response.text()).toBe(true);
    }
    const relationship = await page.request.post(`${path}/relationship`, {
      headers: { origin: app.origin },
      data: {
        version: (await read()).draft.version,
        id: '482eba24-34c3-43e9-a71d-1b91cc343d17',
        baseRevision: null,
        value: {
          typeId: initial.relationshipTypes.find((item) => item.name === 'Betalar')?.id,
          sourceId: '882e85e4-be1d-45a8-941a-93faf8ee99dc',
          targetId: '131b9df9-be76-4fc4-af0e-f8bfcf2589e4',
        },
      },
    });
    expect(relationship.ok(), await relationship.text()).toBe(true);
    const save = await page.request.post(`${path}/save`, {
      headers: { origin: app.origin },
      data: { version: (await read()).draft.version, operationId: 'layout-regression' },
    });
    expect(save.ok(), await save.text()).toBe(true);
    const privateProposal = await page.request.post(`${path}/draft`, {
      headers: { origin: app.origin },
      data: {
        version: (await read()).draft.version,
        id: '4a363b9b-5e73-4c60-9a9c-4624cd687255',
        baseRevision: null,
        value: { name: 'Robins notering', typeId: person.id },
      },
    });
    expect(privateProposal.ok(), await privateProposal.text()).toBe(true);

    await page.goto(app.origin);
    await openMap(page);
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).toBeVisible();
    await expect(await readTableObject(page, 'Familjens Molnmusik')).toContainText(
      'Rättad för hand',
    );
    await closeTableObject(page, 'Familjens Molnmusik');
    await openTable(page);
    const objects = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await expect(objects).toContainText('Robins notering');
    expect((await read()).objects).toHaveLength(2);
    expect((await read()).draft.changes.map((change) => change.after?.name)).toEqual([
      'Robins notering',
    ]);
    await openMap(page);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    // Keep default graph positions: select through the native keyboard control
    // when the protected display row covers the object's pointer target.
    const kim = space.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    await kim.focus();
    await kim.press('Enter');
    await expect(kim).toHaveAttribute('aria-pressed', 'true');
    await expect(
      space.getByRole('button', { name: 'Markera objekt: Kim Exempel', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        space.evaluate((element) => {
          const note = document.querySelector('.label-note');
          if (!note || getComputedStyle(note).visibility === 'hidden') return true;
          const obstacle = note.getBoundingClientRect();
          return [...element.querySelectorAll('.spatial-name')].every((label) => {
            const box = label.getBoundingClientRect();
            return (
              box.right <= obstacle.left ||
              box.left >= obstacle.right ||
              box.bottom <= obstacle.top ||
              box.top >= obstacle.bottom
            );
          });
        }),
      )
      .toBe(true);
    await page.setViewportSize({ width: 320, height: 250 });
    const allLabels = page.getByRole('button', { name: 'Alla etiketter', exact: true });
    await setAllLabels(page, true);
    await expect(space.getByRole('button', { name: /^Markera objekt:/ })).toHaveCount(3);
    await setAllLabels(page, false);
    await expect(allLabels).toHaveAttribute('aria-pressed', 'false');
    await expect(allLabels).toBeVisible();
    await page.setViewportSize({ width: 640, height: 500 });
    await expect(allLabels).toBeVisible();
    await openTable(page);
    await expect(objects).toContainText('Familjens Molnmusik');
    await expect(objects).toContainText('Robins notering');
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});
