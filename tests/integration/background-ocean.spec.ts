import type { Browser, Page } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import { backgroundDifference, captureBackground } from '../support/background-pixels.js';
import { createHousehold, openMap, openSettings, setAllLabels, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { waitForMapScene } from '../support/map-scene.js';
import { createPreparedContext, expect, test } from '../support/test.js';

const space = (page: Page) => page.getByRole('region', { name: 'Rymdkarta', exact: true });
async function settings(page: Page) {
  await openSettings(page);
  await page
    .getByRole('link', { name: /^Rymdkartan/ })
    .first()
    .click();
}
async function back(page: Page) {
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
  await waitForMapScene(page);
}
async function tint(page: Page) {
  const pixels = await sharp(await space(page).locator('canvas').screenshot())
    .removeAlpha()
    .raw()
    .toBuffer();
  let warmth = 0;
  let samples = 0;
  for (let i = 0; i < pixels.length; i += 3) {
    // The canvas capture includes overlaid labels and panels. Their white
    // cards must not dilute the background's sand/water colour comparison.
    if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 235) continue;
    warmth += pixels[i] - pixels[i + 2];
    samples++;
  }
  expect(samples).toBeGreaterThan(0);
  return warmth / samples;
}
async function captureLightViews(page: Page, reference: string) {
  await page.getByRole('button', { name: 'Navigera', exact: true }).click();
  const water = await tint(page);
  await page.screenshot({ path: test.info().outputPath(`${reference}-water.png`) });
  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'Luta uppåt', exact: true }).click();
  const sand = await tint(page);
  expect(sand).toBeGreaterThan(water + 8);
  await page.screenshot({ path: test.info().outputPath(`${reference}-sand.png`) });
  for (let i = 0; i < 12; i++)
    await page.getByRole('button', { name: 'Luta nedåt', exact: true }).click();
  expect(await tint(page)).toBeLessThan(sand - 8);
  await page.screenshot({ path: test.info().outputPath(`${reference}-surface.png`) });
  for (let i = 0; i < 6; i++)
    await page.getByRole('button', { name: 'Luta uppåt', exact: true }).click();
  await page.getByRole('button', { name: 'Panorera vänster', exact: true }).click();
  await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
  await page.getByRole('button', { name: 'Zooma in', exact: true }).click();
  await page.getByRole('button', { name: 'Zooma ut', exact: true }).click();
  return water;
}

async function arrangeMap(page: Page, origin: string, path: string, count: number) {
  const state: MapState = await (await page.request.get(path)).json();
  let version = state.draft.version;
  for (let index = state.objects.length; index < count; index++)
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version: version++,
            id: `ocean-${index}`,
            baseRevision: null,
            value: { name: `Havsobjekt ${index}`, description: '', typeId: state.types[0].id },
          },
        })
      ).ok(),
    ).toBe(true);
  for (let index = state.objects.length; index < count - 1; index += 4)
    expect(
      (
        await page.request.post(`${path}/relationship`, {
          headers: { origin },
          data: {
            version: version++,
            id: `ocean-edge-${index}`,
            baseRevision: null,
            value: {
              typeId: state.relationshipTypes[0].id,
              sourceId: `ocean-${index}`,
              targetId: `ocean-${index + 1}`,
              knowledge: 'known',
            },
          },
        })
      ).ok(),
    ).toBe(true);
  expect(
    (
      await page.request.post(`${path}/save`, {
        headers: { origin },
        data: { version, operationId: `ocean-map-${count}` },
      })
    ).ok(),
  ).toBe(true);
}

// Capture actual pixels and UI-controlled directions. Shape recognition and
// dense-map label overlap are assessed from these images, not shader internals.
async function captureDarkViews(page: Page, reference: string) {
  const navigate = page.getByRole('button', { name: 'Navigera', exact: true });
  const close = page.getByRole('button', { name: 'Stäng navigering', exact: true });
  await navigate.click();
  const canvas = space(page).locator('canvas');
  const image = await sharp(await canvas.screenshot()).stats();
  // This image includes the ordinary map and open panel over the dark water.
  expect(image.channels[0].mean).toBeLessThan(35);
  expect(image.channels[1].max).toBeGreaterThan(40);
  await page.screenshot({ path: test.info().outputPath(`${reference}-water.png`) });
  // Panel edges, axes and transient feedback can change over a still motif.
  // Keep their ordinary screenshots, then measure the unobscured background.
  await expect(page.locator('.personal-view-toast:popover-open')).toHaveCount(0);
  await close.click();
  let captureIndex = 0;
  const pixels = () =>
    captureBackground(
      page,
      test.info().outputPath(`${reference}-background-${captureIndex++}.png`),
    );
  const still = await pixels();
  expect(backgroundDifference(still, await pixels())).toBe(0);
  await navigate.click();
  for (const [direction, inverse] of [
    ['Rotera vänster', 'Rotera höger'],
    ['Rotera höger', 'Rotera vänster'],
    ['Luta uppåt', 'Luta nedåt'],
    ['Luta nedåt', 'Luta uppåt'],
  ]) {
    for (let index = 0; index < 4; index++)
      await page.getByRole('button', { name: direction, exact: true }).click();
    await page.screenshot({
      path: test.info().outputPath(`${reference}-${direction.replaceAll(' ', '-')}.png`),
    });
    await close.click();
    expect(backgroundDifference(still, await pixels())).toBeGreaterThan(0);
    await navigate.click();
    for (let index = 0; index < 4; index++)
      await page.getByRole('button', { name: inverse, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Panorera vänster', exact: true }).click();
  await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
  await page.getByRole('button', { name: 'Zooma in', exact: true }).click();
  await page.getByRole('button', { name: 'Zooma ut', exact: true }).click();
  return tint(page);
}

async function checkOceanPersistence(
  page: Page,
  browser: Browser,
  { theme, allLabels }: { theme: 'light' | 'dark'; allLabels: boolean },
) {
  const background = theme === 'light' ? 'lightBackground' : 'darkBackground';
  const otherBackground = theme === 'light' ? 'darkBackground' : 'lightBackground';
  const backgroundLabel = theme === 'light' ? 'Bakgrund i ljust tema' : 'Bakgrund i mörkt tema';
  const otherBackgroundLabel =
    theme === 'light' ? 'Bakgrund i mörkt tema' : 'Bakgrund i ljust tema';
  const otherTheme = theme === 'light' ? 'dark' : 'light';
  const capture = theme === 'light' ? captureLightViews : captureDarkViews;
  // Persistence plus five complete capture passes share this deadline. Each
  // dark-ocean navigation click can take seconds on software-rendered CI.
  // The shorter timeout below still bounds each individual action.
  test.setTimeout(600_000);
  page.setDefaultTimeout(10_000);
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<PersonalView> => (await page.request.get(`${path}/view`)).json();
    await arrangeMap(page, installation.origin, path, 16);
    expect(
      (
        await page.request.post(`${path}/view/position`, {
          headers: { origin: installation.origin },
          data: { id: 'ocean-0', version: 0, position: { x: 3, y: 2, z: -1 } },
        })
      ).ok(),
    ).toBe(true);
    await page.goto(installation.origin);
    await openMap(page);
    if (allLabels) await setAllLabels(page, true);
    await expect(page.getByRole('button', { name: 'Alla etiketter', exact: true })).toHaveAttribute(
      'aria-pressed',
      String(allLabels),
    );
    const markers = space(page).getByRole('button', {
      name: 'Välj objekt: Havsobjekt 0',
      exact: true,
    });
    await markers.focus();
    await page.keyboard.press('Enter');
    await expect(markers).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    await page.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
    const projection = await markers.getAttribute('style');
    const before = await read();
    await settings(page);
    const choice = page.getByLabel(backgroundLabel, { exact: true });
    await expect(choice.locator('option[value="ocean"]')).toHaveCount(1);
    await choice.focus();
    await choice.selectOption({ label: 'Under världshavet' });
    await expect(choice).toBeFocused();
    await expect(page.locator('.map-settings').getByRole('status')).toHaveText(
      'Din personliga vy är sparad.',
    );
    await expect.poll(async () => (await read()).settings[background]).toBe('ocean');
    await expect(page.getByLabel(otherBackgroundLabel, { exact: true })).toHaveValue(
      before.settings[otherBackground],
    );
    await back(page);
    await expect(markers).toHaveAttribute('aria-pressed', 'true');
    expect(await markers.getAttribute('style')).toBe(projection);
    const saved = await read();
    expect(saved.positions).toEqual(before.positions);
    expect(saved.settings).toEqual({
      ...before.settings,
      [background]: 'ocean',
      version: theme === 'light' ? before.settings.version + 1 : 1,
    });
    const water = await capture(page, `${theme}-ocean-16-1440`);
    const themeProjection = await markers.getAttribute('style');
    await page.emulateMedia({ colorScheme: otherTheme });
    const otherWater = await tint(page);
    expect(Math.abs(otherWater - water)).toBeGreaterThan(5);
    expect(await markers.getAttribute('style')).toBe(themeProjection);
    await page.emulateMedia({ colorScheme: theme });
    expect(await tint(page)).toBeCloseTo(water, 0);
    expect(await markers.getAttribute('style')).toBe(themeProjection);
    await installation.restart();
    await page.reload();
    await settings(page);
    await expect(choice).toHaveValue('ocean');
    expect(await read()).toEqual(saved);
    await signIn(other.request, installation.origin);
    const second = await other.newPage();
    await second.goto(installation.origin);
    await settings(second);
    await expect(second.getByLabel(backgroundLabel, { exact: true })).toHaveValue('ocean');
    await back(second);
    await expect(
      second.getByRole('button', { name: 'Alla etiketter', exact: true }),
    ).toHaveAttribute('aria-pressed', String(allLabels));
    await back(page);
    for (const count of [16, 80]) {
      if (count === 80) await arrangeMap(page, installation.origin, path, count);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
        await page.reload();
        await openMap(page);
        await expect(
          page.getByRole('button', { name: 'Alla etiketter', exact: true }),
        ).toHaveAttribute('aria-pressed', String(allLabels));
        await expect(space(page).locator('button[data-object-id]')).toHaveCount(count);
        const marker = space(page).getByRole('button', {
          name: 'Välj objekt: Havsobjekt 0',
          exact: true,
        });
        await marker.focus();
        await marker.press('Shift+F10');
        await page
          .getByRole('button', { name: 'Visa uppgifter för Havsobjekt 0', exact: true })
          .click();
        const details = page.getByRole('region', { name: 'Havsobjekt 0', exact: true });
        await expect(details).toBeVisible();
        await page.screenshot({
          path: test.info().outputPath(`${theme}-ocean-${count}-${width}-details.png`),
        });
        await details.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
        await capture(page, `${theme}-ocean-${count}-${width}`);
        expect((await read()).positions).toEqual(saved.positions);
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await other.close();
    await installation.close();
  }
}

test('BAKGRUND-03: light ocean persists and ordinary navigation reaches sand, water and surface', async ({
  page,
  browser,
}) => {
  await checkOceanPersistence(page, browser, { theme: 'light', allLabels: true });
});

test('BAKGRUND-04: complete dark ocean persists and stays still through ordinary map navigation', async ({
  page,
  browser,
}) => {
  await checkOceanPersistence(page, browser, { theme: 'dark', allLabels: false });
});
