import type { Page } from '@playwright/test';
import sharp from 'sharp';
import { expect } from './test.js';

// Compare only visible, unobscured background pixels. Hit testing excludes
// controls and labels; SVG bounds also exclude non-interactive map lines.
export async function captureBackground(page: Page, path: string) {
  const canvas = page.getByRole('region', { name: 'Rymdkarta', exact: true }).locator('canvas');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const free = await canvas.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const lines = [
      ...(element.parentElement?.querySelectorAll('svg path, svg line, svg polygon') ?? []),
    ].map((line) => line.getBoundingClientRect());
    const cards = [
      ...document.querySelectorAll(
        'nav, input, [role="region"]:not([aria-label="Rymdkarta"]), .map-navigation, .spatial-label-card, .spatial-node, .spatial-name, .spatial-axis',
      ),
    ].map((card) => ({
      bounds: card.getBoundingClientRect(),
      margin: card.matches('.spatial-label-card, .spatial-node, .spatial-name, .spatial-axis')
        ? 8
        : 112,
    }));
    const points: [number, number][] = [];
    for (let y = 8; y < bounds.height - 8; y += 8)
      for (let x = 8; x < bounds.width - 8; x += 8) {
        const px = bounds.x + x,
          py = bounds.y + y;
        if (
          document.elementFromPoint(px, py) === element &&
          !cards.some(
            ({ bounds: card, margin }) =>
              card.width &&
              card.height &&
              px >= card.left - margin &&
              px <= card.right + margin &&
              py >= card.top - margin &&
              py <= card.bottom + margin,
          ) &&
          !lines.some(
            (line) =>
              px >= line.left - 3 &&
              px <= line.right + 3 &&
              py >= line.top - 3 &&
              py <= line.bottom + 3,
          )
        )
          points.push([x, y]);
      }
    return points;
  });
  const image = await sharp(await canvas.screenshot({ path }))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const samples = new Map(
    free.map(([x, y]) => {
      const start = (Math.round(y) * image.info.width + Math.round(x)) * 3;
      return [`${x},${y}`, image.data.subarray(start, start + 3)];
    }),
  );
  return samples;
}
export function backgroundDifference(before: Map<string, Buffer>, after: Map<string, Buffer>) {
  let samples = 0,
    changed = 0;
  for (const [point, value] of before) {
    const current = after.get(point);
    if (!current) continue;
    samples++;
    if (!value.equals(current)) changed++;
  }
  expect(samples).toBeGreaterThan(40);
  return changed / samples;
}
