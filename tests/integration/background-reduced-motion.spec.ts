import type { Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import type { PersonalView } from '../../src/shared/personal-view.js';
import {
  captureBackground,
  backgroundDifference as difference,
} from '../support/background-pixels.js';
import { createHousehold, openMap, openSettings, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { waitForMapScene } from '../support/map-scene.js';
import { expect, test } from '../support/test.js';

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
async function arrange(page: Page, origin: string, count: number) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const state: MapState = await (await page.request.get(path)).json();
  for (let index = 0; index < count; index++)
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version: index,
            id: `still-${index}`,
            baseRevision: null,
            value: { name: `Provobjekt ${index}`, typeId: state.types[0].id },
          },
        })
      ).ok(),
    ).toBe(true);
  expect(
    (
      await page.request.post(`${path}/save`, {
        headers: { origin },
        data: { version: count, operationId: 'still-map' },
      })
    ).ok(),
  ).toBe(true);
  await page.goto(origin);
  await openMap(page);
  const read = async (): Promise<PersonalView> => (await page.request.get(`${path}/view`)).json();
  return read;
}

async function capture(page: Page, name: string) {
  return captureBackground(page, test.info().outputPath(`${name}.png`));
}

for (const [id, count, width, height] of [
  ['PLACERING-15', 16, 1440, 960],
  ['PLACERING-16', 80, 390, 844],
] as const)
  test(`${id}: reduced motion freezes all backgrounds and resumes without replay at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      const read = await arrange(page, installation.origin, count);
      const navigate = async (name: string, times = 1) => {
        for (let index = 0; index < times; index++)
          await page.getByRole('button', { name, exact: true }).click();
      };
      const initial = await capture(page, 'initial-reduced');
      const marker = space(page).getByRole('button', {
        name: 'Välj objekt: Provobjekt 0',
        exact: true,
      });
      const initialPosition = await marker.getAttribute('style');
      const saved = await read();
      await navigate('Navigera');
      await navigate('Panorera höger', 3);
      await navigate('Rotera vänster', 2);
      await navigate('Zooma in');
      expect(await marker.getAttribute('style')).not.toBe(initialPosition);
      expect(difference(initial, await capture(page, 'initial-camera-moved'))).toBe(0);
      expect(await read()).toEqual(saved);
      await navigate('Återställ vy');
      expect(difference(initial, await capture(page, 'initial-reset'))).toBe(0);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      expect(difference(initial, await capture(page, 'initial-resume'))).toBe(0);
      await navigate('Återställ vy');
      await navigate('Stäng navigering');
      for (const [theme, choice] of [
        ['light', 'pearl'],
        ['light', 'dawn'],
        ['light', 'ocean'],
        ['dark', 'atmosphere'],
        ['dark', 'mist'],
        ['dark', 'universe'],
        ['dark', 'ocean'],
      ] as const) {
        await page.emulateMedia({ colorScheme: theme });
        await settings(page);
        await page
          .getByLabel(theme === 'light' ? 'Bakgrund i ljust tema' : 'Bakgrund i mörkt tema', {
            exact: true,
          })
          .selectOption(choice);
        await expect
          .poll(
            async () =>
              (await read()).settings[theme === 'light' ? 'lightBackground' : 'darkBackground'],
          )
          .toBe(choice);
        await back(page);
        await navigate('Navigera');
        const reset = page.getByRole('button', { name: 'Återställ vy', exact: true });
        if ((await reset.getAttribute('aria-disabled')) !== 'true') await reset.click();
        const baseline = await capture(page, `${theme}-${choice}-baseline`);
        await navigate('Rotera vänster', 2);
        await navigate('Panorera höger', 2);
        await navigate('Zooma in');
        const moving = await capture(page, `${theme}-${choice}-moving`);
        expect(difference(baseline, moving)).toBeGreaterThan(0);
        const before = await read();
        await page.emulateMedia({ reducedMotion: 'reduce' });
        expect(difference(moving, await capture(page, `${theme}-${choice}-freeze`))).toBe(0);
        await navigate('Rotera höger', 3);
        await navigate('Panorera vänster', 3);
        await navigate('Zooma ut', 2);
        expect(difference(moving, await capture(page, `${theme}-${choice}-frozen-camera`))).toBe(0);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        expect(difference(moving, await capture(page, `${theme}-${choice}-resume`))).toBe(0);
        await navigate('Rotera vänster');
        const resumed = await capture(page, `${theme}-${choice}-new-motion`);
        expect(difference(moving, resumed)).toBeGreaterThan(0);
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await navigate('Återställ vy');
        expect(difference(resumed, await capture(page, `${theme}-${choice}-frozen-reset`))).toBe(0);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        expect(difference(resumed, await capture(page, `${theme}-${choice}-reset-resume`))).toBe(0);
        await expect(reset).not.toHaveAttribute('aria-disabled', 'true');
        await reset.click();
        expect(difference(baseline, await capture(page, `${theme}-${choice}-aligned-reset`))).toBe(
          0,
        );
        await expect(reset).toHaveAttribute('aria-disabled', 'true');
        expect(await read()).toEqual(before);
        await navigate('Stäng navigering');
      }
      await settings(page);
      for (const [label, value, key] of [
        ['Panoreringsstyrka', '35', 'panStrength'],
        ['Zoomstyrka', '55', 'zoomStrength'],
        ['Lageravstånd', '1.4', 'layerDistance'],
      ] as const) {
        await page.getByRole('slider', { name: label, exact: true }).fill(value);
        await expect
          .poll(async () => (await read()).settings[key])
          .toBe(Number(value) / (key === 'layerDistance' ? 1 : 100));
      }
      const savedMotion = await read();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(
        page.getByText('Bakgrunden är stilla eftersom minskad rörelse är aktiverad.', {
          exact: true,
        }),
      ).toBeVisible();
      const visibility = page.getByLabel('Visa bakgrund', { exact: true });
      const light = page.getByLabel('Bakgrund i ljust tema', { exact: true });
      const dark = page.getByLabel('Bakgrund i mörkt tema', { exact: true });
      await expect(visibility).toBeChecked();
      await expect(visibility).toBeEnabled();
      await expect(light).toBeEnabled();
      await expect(dark).toBeEnabled();
      for (const [label, value] of [
        ['Panoreringsstyrka', '35'],
        ['Zoomstyrka', '55'],
        ['Lageravstånd', '1.4'],
      ]) {
        await expect(page.getByRole('slider', { name: label, exact: true })).toBeDisabled();
        await expect(page.getByRole('slider', { name: label, exact: true })).toHaveValue(value);
      }
      await expect(
        page.getByRole('button', { name: 'Återställ rörelse', exact: true }),
      ).toBeDisabled();
      expect(await read()).toEqual(savedMotion);
      for (const [control, key, first, second] of [
        [light, 'lightBackground', 'pearl', 'dawn'],
        [dark, 'darkBackground', 'atmosphere', 'mist'],
      ] as const) {
        await control.focus();
        await control.press('Home');
        await expect.poll(async () => (await read()).settings[key]).toBe(first);
        await control.press('ArrowDown');
        await expect.poll(async () => (await read()).settings[key]).toBe(second);
        await expect(control).toBeFocused();
      }
      const choices = await read();
      await visibility.focus();
      await visibility.press('Space');
      await expect.poll(async () => (await read()).settings.background).toBe(false);
      await expect(visibility).not.toBeChecked();
      await expect(light).toBeDisabled();
      await expect(dark).toBeDisabled();
      await visibility.press('Space');
      await expect.poll(async () => (await read()).settings.background).toBe(true);
      await expect(visibility).toBeChecked();
      await expect(light).toBeEnabled();
      await expect(dark).toBeEnabled();
      const restored = await read();
      expect(restored).toEqual({
        ...choices,
        settings: { ...choices.settings, version: restored.settings.version },
      });
      await back(page);
      await navigate('Navigera');
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme });
        const changedChoice = await capture(page, `${theme}-changed-while-reduced`);
        await navigate('Rotera vänster');
        await navigate('Panorera höger');
        expect(difference(changedChoice, await capture(page, `${theme}-changed-still`))).toBe(0);
      }
      expect(await read()).toEqual(restored);
    } finally {
      await installation.close();
    }
  });
