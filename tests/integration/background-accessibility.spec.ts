import type { Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import { contrast, measureContrast } from '../support/accessibility.js';
import { createHousehold, openMap, openSettings, openTable, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { waitForMapScene } from '../support/map-scene.js';
import { createPreparedContext, expect, test } from '../support/test.js';

const space = (page: Page) => page.getByRole('region', { name: 'Rymdkarta', exact: true });

async function settings(page: Page) {
  if (await page.getByRole('heading', { name: 'Rymdkartan', exact: true }).isVisible()) return;
  if (!(await page.locator('.settings-screen').isVisible())) await openSettings(page);
  await page
    .getByRole('link', { name: /^Rymdkartan/ })
    .first()
    .click();
}

async function back(page: Page) {
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
  await waitForMapScene(page);
}

async function arrange(page: Page, origin: string, path: string, count: number) {
  const state: MapState = await (await page.request.get(path)).json();
  let version = state.draft.version;
  for (let index = state.objects.length; index < count; index++) {
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version: version++,
            id: `readable-${index}`,
            baseRevision: null,
            value: {
              name: `Läsobjekt ${String(index).padStart(2, '0')}`,
              typeId: state.types[0].id,
              properties: [
                {
                  id: 'description',
                  label: 'Beskrivning',
                  kind: 'text' as const,
                  value: 'Hela beskrivningen går att läsa i tabellen.',
                },
              ],
            },
          },
        })
      ).ok(),
    ).toBe(true);
    if (index > 0)
      expect(
        (
          await page.request.post(`${path}/relationship`, {
            headers: { origin },
            data: {
              version: version++,
              id: `readable-edge-${index}`,
              baseRevision: null,
              value: {
                sourceId: `readable-${index - 1}`,
                targetId: `readable-${index}`,
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
        data: { version, operationId: `readable-map-${count}` },
      })
    ).ok(),
  ).toBe(true);
}

test('BAKGRUND-06: backgrounds preserve object reading and the ordinary table alternative', async ({
  page,
}) => {
  // One background per theme exercises the shared reading journey.
  // The technical browser suite measures contrast across all seven motifs.
  test.setTimeout(300_000);
  page.setDefaultTimeout(10_000);
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    for (const count of [16, 80]) {
      await arrange(page, installation.origin, path, count);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
        await page.goto(installation.origin);
        await openMap(page);
        for (const [theme, appearance] of [
          ['light', 'dawn'],
          ['dark', 'universe'],
        ] as const) {
          await page.emulateMedia({ colorScheme: theme });
          await settings(page);
          const choice = page.getByLabel(
            theme === 'light' ? 'Bakgrund i ljust tema' : 'Bakgrund i mörkt tema',
            { exact: true },
          );
          if ((await choice.inputValue()) !== appearance) {
            await choice.selectOption(appearance);
            await expect(page.locator('.map-settings').getByRole('status')).toHaveText(
              'Din personliga vy är sparad.',
            );
          }
          await back(page);
          const marker = space(page).getByRole('button', {
            name: 'Välj objekt: Läsobjekt 00',
            exact: true,
          });
          await marker.focus();
          await marker.press('Enter');
          await expect(marker).toHaveAttribute('aria-pressed', 'true');
          await marker.press('Shift+F10');
          await page
            .getByRole('button', { name: 'Visa uppgifter för Läsobjekt 00', exact: true })
            .click();
          const details = page.getByRole('region', { name: 'Läsobjekt 00', exact: true });
          await expect(details).toContainText('Hela beskrivningen går att läsa i tabellen.');
          await page.screenshot({
            path: test.info().outputPath(`${theme}-${appearance}-${count}-${width}-details.png`),
          });
          const navigate = page.getByRole('button', { name: 'Navigera', exact: true });
          // The details window can cover the toolbar on narrow screens. The
          // ordinary keyboard route raises the focused toolbar, without a forced click.
          await navigate.focus();
          await navigate.press('Enter');
          await page.screenshot({
            path: test.info().outputPath(`${theme}-${appearance}-${count}-${width}-panels.png`),
          });
          // Closing the frontmost window exposes the other window's header.
          await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
          await details.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
          expect(
            await space(page).evaluate((region) => region.contains(document.activeElement)),
          ).toBe(true);
          await marker.focus();
          await marker.press('Shift+F10');
          await page.getByRole('button', { name: 'Fokusera markering', exact: true }).click();
          // The ordinary focus action exposes connected lines without a
          // navigation panel covering them, including in the narrow viewport.
          await expect(space(page).locator('line.connection').first()).toBeVisible();
          await page.screenshot({
            path: test.info().outputPath(`${theme}-${appearance}-${count}-${width}-focused.png`),
          });
          const reset = page.getByRole('button', { name: 'Återställ vy', exact: true });
          if ((await reset.getAttribute('aria-disabled')) !== 'true') await reset.click();
        }
        await openTable(page);
        await page
          .getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true })
          .fill(`Läsobjekt ${count - 1}`);
        const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
        await table
          .getByRole('button', { name: `Läsobjekt ${count - 1}`, exact: true })
          .press('Enter');
        await expect(
          table.getByRole('region', { name: `Uppgifter för Läsobjekt ${count - 1}`, exact: true }),
        ).toContainText('Hela beskrivningen går att läsa i tabellen.');
      }
    }
  } finally {
    await installation.close();
  }
});

test('BAKGRUND-07: keyboard and touch settings reflow with honest disabled and saving states', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const installation = await createInstallation();
  const context = await createPreparedContext(browser, {
    hasTouch: true,
    viewport: { width: 320, height: 568 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  let release = () => {};
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<PersonalView> => (await page.request.get(`${path}/view`)).json();
    await arrange(page, installation.origin, path, 16);
    await page.goto(installation.origin);
    await openMap(page);
    await settings(page);
    const form = page.locator('.map-settings');
    const status = form.getByRole('status');
    const visible = page.getByRole('checkbox', { name: 'Visa bakgrund', exact: true });
    const light = page.getByRole('combobox', { name: 'Bakgrund i ljust tema', exact: true });
    const dark = page.getByRole('combobox', { name: 'Bakgrund i mörkt tema', exact: true });
    const ranges = ['Panoreringsstyrka', 'Zoomstyrka', 'Lageravstånd'].map((name) =>
      page.getByRole('slider', { name, exact: true }),
    );
    const reset = page.getByRole('button', { name: 'Återställ rörelse', exact: true });
    const refresh = page.getByRole('button', { name: 'Läs in min aktuella vy', exact: true });
    const reference = form.getByRole('group', { name: 'Nollreferens', exact: true });
    const tabThroughReference = async () => {
      await expect(reference.getByRole('combobox', { name: 'Variant', exact: true })).toBeFocused();
      const controls = reference.locator('select:enabled, input:enabled, button:enabled');
      expect(await controls.count()).toBeGreaterThanOrEqual(3);
      for (const control of await controls.all()) {
        await expect(control).toBeFocused();
        await control.press('Tab');
      }
      await expect(refresh).toBeFocused();
    };
    for (const control of [light, dark, ...ranges, reset, refresh]) {
      const target = await control.boundingBox();
      expect(target?.height, 'background control target height').toBeGreaterThanOrEqual(24);
      expect(target?.width, 'background control target width').toBeGreaterThanOrEqual(24);
    }
    await visible.focus();
    await visible.press('Tab');
    await expect(light).toBeFocused();
    await light.press('ArrowDown');
    await expect(status).toHaveText('Din personliga vy är sparad.');
    await light.press('Tab');
    await expect(dark).toBeFocused();
    await dark.press('End');
    await expect.poll(async () => (await read()).settings.darkBackground).toBe('ocean');
    await expect(status).toHaveText('Din personliga vy är sparad.');
    await dark.press('Tab');
    for (const range of ranges) {
      await expect(range).toBeFocused();
      expect(await range.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
        'none',
      );
      expect(await range.evaluate(measureContrast, 'outlineColor' as const)).toBeGreaterThanOrEqual(
        3,
      );
      await range.press('End');
      await expect(status).toHaveText('Din personliga vy är sparad.');
      await expect(range).toBeFocused();
      await range.press('Tab');
    }
    await expect(reset).toBeFocused();
    await reset.press('Enter');
    await expect.poll(async () => (await read()).settings.layerDistance).toBe(1);
    await expect(status).toHaveText('Din personliga vy är sparad.');
    await expect(reset).toBeFocused();
    // A tap on a native track is a single-pointer alternative to dragging.
    await ranges[0].scrollIntoViewIfNeeded();
    const track = await ranges[0].boundingBox();
    if (!track) throw new Error('The pan track must be visible');
    await page.touchscreen.tap(track.x + 3, track.y + track.height / 2);
    await expect.poll(async () => (await read()).settings.panStrength).toBe(0);
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`${path}/view/settings`, async (route) => {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    });
    await ranges[0].focus();
    await ranges[0].press('End');
    await expect(status).toHaveText('Din personliga vy sparas…');
    await expect(ranges[0]).toBeFocused();
    for (const control of [visible, light, dark, ...ranges, reset])
      await expect(control).toHaveAttribute('aria-disabled', 'true');
    await expect(refresh).toBeDisabled();
    await ranges[0].press('Home');
    await expect(ranges[0]).toHaveValue('100');
    release();
    await expect(status).toHaveText('Din personliga vy är sparad.');
    await expect(ranges[0]).toBeFocused();
    await page.unroute(`${path}/view/settings`);
    await visible.focus();
    await visible.press('Space');
    await expect(status).toHaveText('Din personliga vy är sparad.');
    for (const control of [light, dark, ...ranges, reset]) await expect(control).toBeDisabled();
    await visible.press('Tab');
    await tabThroughReference();
    await visible.focus();
    await visible.press('Space');
    await expect(status).toHaveText('Din personliga vy är sparad.');
    const saved = await read();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(form).toContainText('Bakgrunden är stilla eftersom minskad rörelse är aktiverad.');
    for (const control of [light, dark]) await expect(control).toBeEnabled();
    for (const control of [...ranges, reset]) await expect(control).toBeDisabled();
    await light.focus();
    await light.press('Tab');
    await expect(dark).toBeFocused();
    await dark.press('Tab');
    await tabThroughReference();
    expect(await read()).toEqual(saved);
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      expect(
        await contrast(form.getByText('Bakgrunden är dekorativ.', { exact: false })),
      ).toBeGreaterThanOrEqual(4.5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      );
      expect(await form.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(320);
      await page.screenshot({ path: test.info().outputPath(`settings-320-${theme}.png`) });
    }
    await page.reload();
    await settings(page);
    await expect(visible).toBeChecked();
    await expect(ranges[0]).toHaveValue('100');
    await expect(ranges[0]).toBeDisabled();
    expect(await read()).toEqual(saved);
    await back(page);
    await page.getByRole('button', { name: 'Navigera', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Panorera vänster', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Återställ vy', exact: true }).press('Enter');
    await expect(page.getByRole('button', { name: 'Återställ vy', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await page.getByRole('button', { name: 'Navigera', exact: true }).tap();
    const marker = space(page).getByRole('button', {
      name: 'Välj objekt: Läsobjekt 00',
      exact: true,
    });
    await marker.focus();
    await marker.press('Shift+F10');
    await page.getByRole('button', { name: 'Visa uppgifter för Läsobjekt 00', exact: true }).tap();
    const details = page.getByRole('region', { name: 'Läsobjekt 00', exact: true });
    await expect(details).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('320-touch-stacked-panels.png') });
    await details.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).tap();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).tap();
    await expect(details).not.toBeVisible();
    await expect(page.getByRole('region', { name: 'Navigation', exact: true })).not.toBeVisible();
    expect(await read()).toEqual(saved);
  } finally {
    release();
    await context.close();
    await installation.close();
  }
});
