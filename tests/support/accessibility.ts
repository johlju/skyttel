import type { Locator } from '@playwright/test';

// Measurements for the accessibility checks of Playwright tests.

/** Where a control stands on the screen. */
export async function bounds(control: Locator) {
  const box = await control.boundingBox();
  if (!box) throw new Error('The control has no place on the screen');
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
}

/** The contrast between a text and the surface behind it. */
export const contrast = (text: Locator) =>
  text.evaluate((element) => {
    const luminance = (color: string) => {
      if (!/^rgb\(\d+, \d+, \d+\)$/.test(color))
        throw new Error(`Expected an opaque RGB color, received ${color}`);
      const [red, green, blue] = (color.match(/\d+/g) ?? []).map(Number).map((value) => {
        const unit = value / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    let surface: Element | null = element;
    while (surface && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)')
      surface = surface.parentElement;
    if (!surface) throw new Error('The text has no surface behind it');
    const foreground = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(surface).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
