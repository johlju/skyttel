import type { Locator } from '@playwright/test';

// Browser measurements for accessibility checks and their tooling tests.

/** Where a control stands on the screen. */
export async function bounds(control: Locator) {
  const box = await control.boundingBox();
  if (!box) throw new Error('The control has no place on the screen');
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
}

/** The contrast between a text and the surface behind it. */
export const contrast = (text: Locator) => text.evaluate(measureContrast);

/** Measure a real DOM element; keep this callback self-contained for Locator.evaluate. */
export function measureContrast(
  element: Element,
  foregroundProperty: 'color' | 'outlineColor' = 'color',
) {
  // Let the browser convert CSS Color 4 values to sRGB before measuring them.
  const context = new OffscreenCanvas(1, 1).getContext('2d', { colorSpace: 'srgb' });
  if (!context) throw new Error('The contrast measurement needs a canvas');
  const channels = (color: string) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    return context.getImageData(0, 0, 1, 1).data;
  };
  const luminance = (color: string) => {
    const values = channels(color);
    if (values[3] !== 255) throw new Error(`Expected an opaque color, received ${color}`);
    const [red, green, blue] = Array.from(values)
      .slice(0, 3)
      .map((value) => {
        const unit = value / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  let surface: Element | null = element;
  while (surface && channels(getComputedStyle(surface).backgroundColor)[3] === 0)
    surface = surface.parentElement;
  if (!surface) throw new Error('The text has no surface behind it');
  const foreground = luminance(getComputedStyle(element)[foregroundProperty]);
  const background = luminance(getComputedStyle(surface).backgroundColor);
  return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
}
