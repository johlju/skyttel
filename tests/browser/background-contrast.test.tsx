import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { SpatialMap } from '../../src/client/SpatialMap.js';
import '../../src/client/styles.css';
import '../../src/client/workspace.css';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';
import { measureContrast } from '../support/accessibility.js';

afterEach(cleanup);

// Technical compositor evidence; the manual reading journey stays in integration.
async function screenshotPixels() {
  const screenshot = await page.screenshot({ base64: true });
  const picture = new Image();
  picture.src = `data:image/png;base64,${screenshot.base64}`;
  await picture.decode();
  const canvas = document.createElement('canvas');
  canvas.width = picture.width;
  canvas.height = picture.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Pixel sampling unavailable');
  context.drawImage(picture, 0, 0);
  return {
    data: context.getImageData(0, 0, canvas.width, canvas.height).data,
    info: { width: canvas.width, height: canvas.height },
  };
}

function fixture(count: number): MapState {
  return {
    userId: 'alex',
    contentVersion: 1,
    types: [{ id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' }],
    relationshipTypes: [
      { id: 'uses', householdId: 'home', revision: 1, name: 'Använder', description: '' },
    ],
    objects: Array.from({ length: count }, (_, index) => ({
      id: `readable-${index}`,
      householdId: 'home',
      revision: 1,
      typeId: 'person',
      name: `Läsobjekt ${String(index).padStart(2, '0')}`,
      description: 'Hela beskrivningen går att läsa i tabellen.',
    })),
    relationships: Array.from({ length: count - 1 }, (_, index) => ({
      id: `edge-${index}`,
      householdId: 'home',
      revision: 1,
      typeId: 'uses',
      sourceId: `readable-${index}`,
      targetId: `readable-${index + 1}`,
      knowledge: 'known',
    })),
    draft: { version: 0, changes: [] },
  };
}

function luminance(rgb: number[]) {
  const [red, green, blue] = rgb.map((value) => {
    const unit = value / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

// Measure the final compositor image, including SVG group opacity and the
// actual WebGL motif behind each line. Raw CSS colours miss that blending.
async function connectionContrast(reference: string) {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  const samples = (() => {
    const lines = document.querySelectorAll('line.connection');
    const result: { x: number; y: number; nx: number; ny: number }[] = [];
    const obstacles = Array.from(
      document.querySelectorAll(
        '.spatial-orb, .personal-view-toast:popover-open, .workspace-label-feedback, .spatial-axis',
      ),
    ).map((element) => ({
      box: element.getBoundingClientRect(),
      margin: element.matches('.spatial-orb') ? 10 : 3,
    }));
    for (const element of lines) {
      const line = element as SVGLineElement;
      const matrix = line.getScreenCTM();
      if (!matrix) continue;
      const start = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(
        matrix,
      );
      const end = new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(
        matrix,
      );
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length < 25) continue;
      for (const fraction of [0.15, 0.3, 0.5, 0.7, 0.85]) {
        if (length * (1 - fraction) < 16) continue; // The arrowhead has its own filled area.
        const x = start.x + (end.x - start.x) * fraction;
        const y = start.y + (end.y - start.y) * fraction;
        if (
          obstacles.some(
            ({ box, margin }) =>
              x > box.left - margin &&
              x < box.right + margin &&
              y > box.top - margin &&
              y < box.bottom + margin,
          )
        )
          continue;
        const top = document.elementFromPoint(x, y);
        if (
          x < 5 ||
          y < 5 ||
          x > innerWidth - 5 ||
          y > innerHeight - 5 ||
          !top?.matches('canvas, .connection-hit, .spatial-lines')
        )
          continue;
        result.push({ x, y, nx: -(end.y - start.y) / length, ny: (end.x - start.x) / length });
      }
    }
    return result;
  })();
  const { data, info } = await screenshotPixels();
  const pixel = (x: number, y: number) => {
    const offset = (Math.round(y) * info.width + Math.round(x)) * 4;
    return Array.from(data.subarray(offset, offset + 3));
  };
  const ratios = samples.map(({ x, y, nx, ny }) => {
    const adjacent = [-1, 1].map((sign) =>
      luminance(pixel(x + sign * nx * 2.4, y + sign * ny * 2.4)),
    );
    // The central pixel of a diagonal stroke may be antialiased. Sample its
    // two closest neighbours rather than require every edge pixel to be opaque.
    return Math.max(
      ...[-0.6, 0, 0.6].flatMap((offset) => {
        const center = luminance(pixel(x + nx * offset, y + ny * offset));
        return adjacent.map(
          (background) =>
            (Math.max(center, background) + 0.05) / (Math.min(center, background) + 0.05),
        );
      }),
    );
  });
  expect(ratios.length, 'visible, unobscured connection samples').toBeGreaterThan(0);
  expect(
    Math.min(...ratios),
    `${reference}: rendered connection contrast against its adjacent surface`,
  ).toBeGreaterThanOrEqual(3);
  return { samples: ratios.length, minimum: Math.min(...ratios) };
}

async function iconContrast() {
  const measured = (() => {
    const region = document.querySelector('[aria-label="Rymdkarta"]');
    if (!region) throw new Error('The map must be rendered');
    const canvas = new OffscreenCanvas(1, 1).getContext('2d');
    if (!canvas) throw new Error('Colour conversion needs a canvas');
    const color = (value: string) => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = value;
      canvas.fillRect(0, 0, 1, 1);
      return Array.from(canvas.getImageData(0, 0, 1, 1).data);
    };
    const icons = Array.from(region.querySelectorAll('.spatial-orb')).map((orb) => {
      const style = getComputedStyle(orb);
      let opacity = 1;
      for (let parent: Element | null = orb; parent; parent = parent.parentElement)
        opacity *= Number(getComputedStyle(parent).opacity);
      return { foreground: color(style.color), surface: color(style.backgroundColor), opacity };
    });
    const backgrounds: { x: number; y: number }[] = [];
    const area = region.querySelector('canvas')?.getBoundingClientRect();
    if (!area) throw new Error('The real map must be rendered');
    for (const x of [0.02, 0.1, 0.3, 0.5, 0.7, 0.9, 0.98])
      for (const y of [0.02, 0.1, 0.5, 0.9, 0.98]) {
        const point = {
          x: Math.round(area.x + area.width * x),
          y: Math.round(area.y + area.height * y),
        };
        if (document.elementFromPoint(point.x, point.y)?.matches('canvas')) backgrounds.push(point);
      }
    return { icons, backgrounds };
  })();
  expect(measured.icons.length).toBeGreaterThan(0);
  expect(measured.backgrounds.length).toBeGreaterThan(0);
  const { data, info } = await screenshotPixels();
  const ratios = measured.icons.flatMap(({ foreground, surface, opacity }) =>
    measured.backgrounds.map(({ x, y }) => {
      const offset = (y * info.width + x) * 4;
      const background = Array.from(data.subarray(offset, offset + 3));
      // Group opacity fades the icon and its backing together onto the actual
      // motif. Checking their uncomposited CSS colours would miss that defect.
      const blend = (color: number[], behind: number[]) =>
        color
          .slice(0, 3)
          .map(
            (value, channel) => (value * color[3]) / 255 + behind[channel] * (1 - color[3] / 255),
          );
      const backing = blend(surface, background);
      const glyph = blend(foreground, backing);
      const composite = (color: number[]) =>
        luminance(
          color.map((value, channel) => value * opacity + background[channel] * (1 - opacity)),
        );
      const first = composite(glyph);
      const second = composite(backing);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    }),
  );
  const minimum = Math.min(...ratios);
  expect(minimum, 'composited object icon against its backing').toBeGreaterThanOrEqual(3);
  return minimum;
}

for (const count of [16, 80])
  for (const width of [1440, 390])
    for (const [theme, appearance] of [
      ['light', 'pearl'],
      ['light', 'dawn'],
      ['light', 'ocean'],
      ['dark', 'atmosphere'],
      ['dark', 'mist'],
      ['dark', 'universe'],
      ['dark', 'ocean'],
    ] as const)
      test(`composited background contrast: ${theme}/${appearance}, ${count} objects, ${width}px`, {
        tags: ['technical'],
        timeout: 30_000,
      }, async ({ onTestFinished }) => {
        const viewport = { width: innerWidth, height: innerHeight };
        onTestFinished(() => page.viewport(viewport.width, viewport.height));
        await page.viewport(width, width === 390 ? 844 : 960);
        const state = fixture(count);
        const settings = {
          ...defaultViewSettings,
          background: true,
          version: 0,
          ...(theme === 'light' ? { lightBackground: appearance } : { darkBackground: appearance }),
        };
        render(
          <section className="household-map workspace-shell" data-theme={theme}>
            <div className="map-space">
              <SpatialMap
                theme={theme}
                state={state}
                active
                objects={new Map(state.objects.map((object) => [object.id, object]))}
                relationships={new Map(state.relationships.map((edge) => [edge.id, edge]))}
                selection={{ kind: 'object', id: 'readable-0' }}
                focusRequest={{ id: 'contrast', objectIds: ['readable-0', 'readable-1'] }}
                disabled={false}
                onSelect={() => {}}
                onSelectRelationship={() => {}}
                onFocus={() => {}}
                onRead={() => {}}
                onRelationships={() => {}}
                onClear={() => {}}
                onReset={() => {}}
                onRemove={() => {}}
                personal={{
                  view: { contentVersion: 1, positions: [], settings },
                  pending: false,
                  message: '',
                  move: async () => {},
                  configure: async () => {},
                  refresh: async () => {},
                }}
              />
            </div>
          </section>,
        );
        await expect
          .element(
            page.getByRole('button', {
              name: 'Välj objekt: Läsobjekt 00',
              exact: true,
            }),
          )
          .toBeVisible();
        await connectionContrast(`${theme}-${appearance}-${count}-${width}-focused`);
        await iconContrast();
        const label = document.querySelector('.spatial-name .spatial-caption');
        if (label && label.getBoundingClientRect().width > 0)
          expect(measureContrast(label)).toBeGreaterThanOrEqual(4.5);
      });
