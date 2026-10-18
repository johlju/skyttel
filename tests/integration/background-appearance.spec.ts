import type { Browser, Page } from '@playwright/test';
import sharp from 'sharp';
import type { PersonalView } from '../../src/shared/personal-view.js';
import { createBackgroundMapFixture } from '../support/background-map.js';
import { openMap, openSettings, setAllLabels, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { waitForMapScene } from '../support/map-scene.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test.use({ actionTimeout: 10_000 });

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
  const { path, household } = await createBackgroundMapFixture(
    page.request,
    origin,
    count,
    'appearance',
  );
  await page.goto(`${origin}/households/${household.id}`);
  await openMap(page);
  await setAllLabels(page, true);
  const read = async (): Promise<PersonalView> => (await page.request.get(`${path}/view`)).json();
  if (count === 16) {
    await space(page)
      .getByRole('button', { name: 'Välj objekt: Provobjekt 00', exact: true })
      .click();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
    await navigation
      .getByRole('button', { name: 'Flytta Provobjekt 00: uppåt', exact: true })
      .click();
    await expect.poll(async () => (await read()).positions.length).toBe(1);
    await navigation.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
    await navigation.getByRole('button', { name: 'Panorera höger', exact: true }).click();
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  }
  return {
    path,
    household,
    read,
  };
}

async function imageDifference(before: Buffer, after: Buffer) {
  const first = await sharp(before).removeAlpha().raw().toBuffer();
  const second = await sharp(after).removeAlpha().raw().toBuffer();
  expect(second.length).toBe(first.length);
  let changed = 0;
  for (let index = 0; index < first.length; index += 3) {
    if (
      Math.abs(first[index] - second[index]) +
        Math.abs(first[index + 1] - second[index + 1]) +
        Math.abs(first[index + 2] - second[index + 2]) >
      12
    )
      changed += 1;
  }
  return changed / (first.length / 3);
}

async function capturePresentations(page: Page, appearance: string, count: number) {
  for (const viewport of [
    { width: 1440, height: 960 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    // Resize preserves the camera. Explicitly frame the new viewport after the
    // preceding direction comparison rather than expect an automatic reset.
    const reset = page.getByRole('button', { name: 'Återställ vy', exact: true });
    if ((await reset.getAttribute('aria-disabled')) !== 'true') await reset.click();
    const marker = space(page).getByRole('button', {
      name: 'Välj objekt: Provobjekt 00',
      exact: true,
    });
    await expect(marker).toBeVisible();
    const prefix = `${appearance}-${count}-${viewport.width}`;
    await page.screenshot({ path: test.info().outputPath(`${prefix}-map.png`) });
    await marker.focus();
    await marker.press('Shift+F10');
    await page
      .getByRole('button', { name: 'Visa uppgifter för Provobjekt 00', exact: true })
      .click();
    const details = page.getByRole('region', { name: 'Provobjekt 00', exact: true });
    await expect(details).toBeVisible();
    await expect(details).toContainText('Påhittat underlag för bakgrundsbedömning.');
    await page.screenshot({ path: test.info().outputPath(`${prefix}-details.png`) });
    await details.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    await page.getByRole('button', { name: 'Navigera', exact: true }).click();
    const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
    await expect(navigation).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`${prefix}-navigation.png`) });
    for (let turn = 0; turn < 4; turn += 1)
      await navigation.getByRole('button', { name: 'Rotera vänster', exact: true }).click();
    await navigation.getByRole('button', { name: 'Luta uppåt', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`${prefix}-rotated.png`) });
    await page.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
  }
}

async function compareDenseAndSparse(
  page: Page,
  browser: Browser,
  appearance: 'dawn' | 'universe',
) {
  await back(page);
  await capturePresentations(page, appearance, 16);
  const installation = await createInstallation();
  const context = await createPreparedContext(browser);
  try {
    const dense = await context.newPage();
    const errors = observeErrors(dense);
    await dense.emulateMedia({ colorScheme: appearance === 'dawn' ? 'light' : 'dark' });
    await dense.setViewportSize({ width: 1440, height: 960 });
    const { read } = await arrange(dense, installation.origin, 80);
    await settings(dense);
    const label = appearance === 'dawn' ? 'Bakgrund i ljust tema' : 'Bakgrund i mörkt tema';
    await dense.getByLabel(label, { exact: true }).selectOption(appearance);
    await expect
      .poll(async () => {
        const value = (await read()).settings;
        return appearance === 'dawn' ? value.lightBackground : value.darkBackground;
      })
      .toBe(appearance);
    await back(dense);
    await capturePresentations(dense, appearance, 80);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await installation.close();
  }
}

function observeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

for (const { caseId, name, appearance, theme } of [
  { caseId: 'BAKGRUND-01', name: 'Gryningsdis', appearance: 'dawn', theme: 'light' },
  { caseId: 'BAKGRUND-02', name: 'Universum', appearance: 'universe', theme: 'dark' },
] as const) {
  test(`${caseId}: ${name} is visible, theme-correct and durable without moving the map`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const setting = theme === 'light' ? 'lightBackground' : 'darkBackground';
    const otherSetting = theme === 'light' ? 'darkBackground' : 'lightBackground';
    const label = theme === 'light' ? 'Bakgrund i ljust tema' : 'Bakgrund i mörkt tema';
    const otherLabel = theme === 'light' ? 'Bakgrund i mörkt tema' : 'Bakgrund i ljust tema';
    const installation = await createInstallation();
    const other = await createPreparedContext(browser);
    const errors = observeErrors(page);
    try {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: 1440, height: 960 });
      const { path, household, read } = await arrange(page, installation.origin, 16);
      const marker = space(page).getByRole('button', {
        name: 'Välj objekt: Provobjekt 08',
        exact: true,
      });
      await marker.click({ trial: true });
      const before = await marker.getAttribute('style');
      const savedBefore = await read();
      const content = await (await page.request.get(path)).json();
      const baseline = await space(page).locator('canvas').screenshot();
      await settings(page);
      const active = page.getByLabel(label, { exact: true });
      const inactive = page.getByLabel(otherLabel, { exact: true });
      await expect(active.getByRole('option', { name, exact: true })).toHaveCount(1);
      await expect(inactive.getByRole('option', { name, exact: true })).toHaveCount(0);
      await active.selectOption({ label: name });
      await expect.poll(async () => (await read()).settings[setting]).toBe(appearance);
      await back(page);
      expect(
        await imageDifference(baseline, await space(page).locator('canvas').screenshot()),
      ).toBeGreaterThan(0.1);
      await expect(marker).toHaveAttribute('style', before ?? '');
      await marker.click();
      await expect(marker).toHaveAttribute('aria-pressed', 'true');
      await page.screenshot({ path: test.info().outputPath(`${appearance}-16-desktop.png`) });
      await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' });
      await settings(page);
      await expect(active).toHaveValue(appearance);
      await expect(inactive).toHaveValue(savedBefore.settings[otherSetting]);
      await back(page);
      await page.emulateMedia({ colorScheme: theme });
      await expect(marker).toHaveAttribute('style', before ?? '');
      const saved = await read();
      expect(saved.settings).toEqual({
        ...savedBefore.settings,
        [setting]: appearance,
        version: saved.settings.version,
      });
      expect(saved.positions).toEqual(savedBefore.positions);
      expect(
        (
          await page.request.post(`${path}/view/settings`, {
            headers: { origin: installation.origin },
            data: {
              version: saved.settings.version,
              settings: { ...saved.settings, version: undefined, [otherSetting]: appearance },
            },
          })
        ).status(),
      ).toBe(400);
      expect(await read()).toEqual(saved);
      expect(await (await page.request.get(path)).json()).toEqual(content);
      await installation.restart();
      await page.reload();
      await settings(page);
      await expect(active).toHaveValue(appearance);
      const otherPage = await other.newPage();
      await signIn(other.request, installation.origin);
      await otherPage.goto(`${installation.origin}/households/${household.id}`);
      await settings(otherPage);
      await expect(otherPage.getByLabel(label, { exact: true })).toHaveValue(appearance);
      expect(await read()).toEqual(saved);
      await compareDenseAndSparse(page, browser, appearance);
      expect(await read()).toEqual(saved);
      expect(errors).toEqual([]);
    } finally {
      await other.close();
      await installation.close();
    }
  });
}
