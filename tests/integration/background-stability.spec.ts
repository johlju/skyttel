import {
  backgrounds,
  chooseBackground,
  prepareBackgroundMap,
} from '../../scripts/measure-backgrounds.js';
import {
  captureBackground,
  backgroundDifference as difference,
} from '../support/background-pixels.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

test('BAKGRUND-05: every background renders, resets and preserves placement when switched', async ({
  page,
}) => {
  // PLACERING-14 covers shared camera extremes and motion settings once.
  // Here each motif only needs a short render, reset and switching check.
  test.setTimeout(600_000);
  const installation = await createInstallation();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  try {
    await page.setViewportSize({ width: 1440, height: 960 });
    const path = await prepareBackgroundMap(page, installation.origin, 16);
    const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const marker = space.getByRole('button', { name: 'Välj objekt: Provobjekt 00', exact: true });
    const command = async (name: string, times = 1) => {
      const button = page.getByRole('button', { name, exact: true });
      if (name === 'Återställ vy' && (await button.getAttribute('aria-disabled')) === 'true')
        return;
      for (let index = 0; index < times; index++) await button.click();
    };
    // Observe only background pixels unobscured in both ordinary captures.
    let captureIndex = 0;
    const pixels = () =>
      captureBackground(page, test.info().outputPath(`canvas-${captureIndex++}.png`));
    const read = async () => (await page.request.get(`${path}/view`)).json();
    await chooseBackground(page, 'light', 'pearl');
    await marker.focus();
    await marker.press('Enter');
    const arrange = page.getByText('Ordna min vy', { exact: true });
    if (!(await arrange.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)))
      await arrange.click();
    const beforeMove = await pixels();
    const previousPositions = (await read()).positions;
    await page.getByRole('button', { name: 'Flytta Provobjekt 00: uppåt', exact: true }).click();
    await expect.poll(async () => (await read()).positions).not.toEqual(previousPositions);
    expect(difference(beforeMove, await pixels()) === 0).toBe(true);
    const placed = (await read()).positions;
    await marker.focus();
    await marker.press('Enter');
    for (const [theme, appearance] of backgrounds) {
      if (appearance === 'off') continue;
      await chooseBackground(page, theme, appearance);
      await command('Återställ vy');
      const original = await pixels();
      await page.waitForTimeout(250);
      expect(difference(original, await pixels()) === 0).toBe(true);
      await command('Rotera vänster', 2);
      const rotated = await pixels();
      expect(difference(original, rotated)).toBeGreaterThan(0);
      await command('Panorera höger', 2);
      const panned = await pixels();
      expect(difference(rotated, panned)).toBeGreaterThan(0);
      await command('Zooma in', 2);
      expect(difference(panned, await pixels())).toBeGreaterThan(0);
      await command('Återställ vy');
      expect(difference(original, await pixels()) === 0).toBe(true);
      const position = await marker.getAttribute('style');
      expect((await read()).positions).toEqual(placed);
      await chooseBackground(page, theme, 'off');
      expect(await marker.getAttribute('style')).toBe(position);
      await chooseBackground(page, theme, appearance);
      expect(await marker.getAttribute('style')).toBe(position);
      expect(difference(original, await pixels()) === 0).toBe(true);
      expect((await read()).positions).toEqual(placed);
    }
    expect(errors).toEqual([]);
  } finally {
    await installation.close();
  }
});
