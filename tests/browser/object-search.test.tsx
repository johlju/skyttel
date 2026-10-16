import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect, onTestFinished, test, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import type { MapState } from '../../src/shared/map.js';
import { createAccountThemeFixture } from '../support/account-theme-browser.js';
import captured from '../support/household-table-browser.json' with { type: 'json' };

let imageSession: ReturnType<typeof cdp>;
const images: Record<string, { body: string; contentType: string }> = captured.images;
async function serveImage({ requestId, request }: { requestId: string; request: { url: string } }) {
  const id = decodeURIComponent(new URL(request.url).pathname.split('/').at(-1) ?? '');
  const image = images[id];
  if (!image) throw new Error(`Unexpected profile image: ${id}`);
  await imageSession.send('Fetch.fulfillRequest', {
    requestId,
    responseCode: 200,
    responseHeaders: [
      { name: 'Content-Type', value: image.contentType },
      { name: 'Cache-Control', value: 'no-store' },
    ],
    body: image.body,
  });
}
beforeAll(async () => {
  imageSession = cdp();
  // Establish the CDP session before on() starts its asynchronous registration,
  // so Fetch interception and its listener use the same native session.
  await imageSession.send('Page.getLayoutMetrics');
  imageSession.on('Fetch.requestPaused', serveImage);
  await imageSession.send('Fetch.enable', {
    patterns: [{ urlPattern: '*/api/households/*/profile-images/*', resourceType: 'Image' }],
  });
});
afterAll(async () => {
  await imageSession.send('Fetch.disable');
  imageSession.off('Fetch.requestPaused', serveImage);
});

// Complete synthetic response captured from prepareHouseholdTable's public HTTP
// preparation, including its saved deletion, three proposals and both images.
// The remaining integration cases still execute that preparation against SQLite.
async function open(width: number, height = 900) {
  await page.viewport(width, height);
  const state = structuredClone(captured.state) as MapState;
  const requests: { url: string; method: string }[] = [];
  const theme = createAccountThemeFixture(state.userId);
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    requests.push({ url, method });
    if (url === '/api/theme-preference') return theme.respond(init);
    if (method !== 'GET') throw new Error(`Unexpected search mutation: ${method} ${url}`);
    if (url.endsWith('/view')) return Response.json(captured.view);
    if (url.endsWith('/operations')) return Response.json(captured.operations);
    if (url.endsWith('/conversation-consent')) return Response.json({ saved: null });
    if (url.endsWith('/text-assistant')) return Response.json({ available: false });
    if (url.includes('/map?')) return Response.json(state);
    throw new Error(`Unexpected search request: ${url}`);
  });
  render(
    <theme.Boundary>
      <main>
        <section className="panel household-panel">
          <HouseholdMap householdId={state.objects[0].householdId} />
        </section>
      </main>
    </theme.Boundary>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
  await expect.poll(() => document.querySelectorAll('.spatial-portrait').length).toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        [...document.querySelectorAll<HTMLImageElement>('.spatial-portrait')].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      { timeout: 10000 },
    )
    .toBe(true);
  return { requests };
}

async function mapFilters() {
  const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
  const button = panel.getByRole('button', { name: /^Filter/ });
  if (button.element().getAttribute('aria-expanded') !== 'true') await button.click();
  return page.getByRole('dialog', { name: 'Kartans filter', exact: true });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

for (const width of [1280, 390])
  test(`${width === 1280 ? 'SÖK-11' : 'SÖK-15'}: opening filters overlays the map without moving markers or labels at ${width}px`, async () => {
    const { requests } = await open(width);
    const geometry = () =>
      [
        ...document.querySelectorAll('.spatial-node, [data-layout-id], .label-leader, .connection'),
      ].map((element) => {
        const box = element.getBoundingClientRect();
        return {
          id: element.getAttribute('data-layout-id') ?? element.getAttribute('data-object-id'),
          name: element.getAttribute('aria-label'),
          box: [box.x, box.y, box.width, box.height].map((value) => Math.round(value * 100)),
        };
      });
    await expect
      .poll(() => document.querySelector('[data-layout-id]')?.checkVisibility() ?? false)
      .toBe(true);
    const unchangedFor = async (expected: ReturnType<typeof geometry>) => {
      // All thirty samples per transition protect jumps that settle back later.
      for (let sample = 0; sample < 30; sample++) {
        expect(geometry()).toEqual(expected);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };
    for (const withActiveFilter of [false, true]) {
      if (withActiveFilter) {
        await (await mapFilters()).getByLabelText('Ta med upphörda').click();
        await userEvent.keyboard('{Escape}');
        await expect
          .element(page.getByRole('button', { name: 'Ta bort filter: Ta med upphörda' }))
          .toBeVisible();
      }
      await expect
        .poll(
          async () => {
            const current = geometry();
            await new Promise((resolve) => setTimeout(resolve, 1700));
            return JSON.stringify(current) === JSON.stringify(geometry());
          },
          { timeout: 10000 },
        )
        .toBe(true);
      const current = geometry();
      const filters = await mapFilters();
      await expect.element(filters.getByRole('heading')).toHaveFocus();
      await unchangedFor(current);
      await userEvent.keyboard('{Escape}');
      await expect.poll(() => filters.query()?.checkVisibility() ?? false).toBe(false);
      await expect.element(page.getByRole('button', { name: /^Filter/ })).toHaveFocus();
      await unchangedFor(current);
    }
    // Complete map responses remain read-only: no proposal or save route occurs.
    expect(requests.filter((request) => request.method !== 'GET')).toEqual([]);
  }, 45000);

test('SÖK-12: dashed label leaders are readable against the map in both themes', async () => {
  await open(1280, 720);
  const map = page.getByRole('region', { name: 'Hushållskarta', exact: true });
  const session = cdp();
  onTestFinished(async () => {
    await session.send('Emulation.setEmulatedMedia', { features: [] });
  });
  for (const theme of ['light', 'dark'] as const) {
    await page.getByRole('button', { name: /^Tema:/ }).click();
    await page.getByRole('radio', { name: 'System', exact: true }).click();
    await session.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme }],
    });
    await expect.element(map).toHaveAttribute('data-theme', theme);
    await page.getByRole('button', { name: /^Tema:/ }).click();
    await page
      .getByRole('radio', { name: theme === 'light' ? 'Ljust' : 'Mörkt', exact: true })
      .click();
    await expect.element(map).toHaveAttribute('data-theme', theme);
    await expect.poll(() => document.querySelector('.label-leader')).not.toBeNull();
    const line = document.querySelector('.label-leader');
    if (!line) throw new Error('A label leader must be rendered.');
    const style = getComputedStyle(line);
    const root = line.closest('.household-map');
    if (!root) throw new Error('The leader must be part of the map.');
    const background = getComputedStyle(root).getPropertyValue('--space-bg');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Colour measurement requires a canvas.');
    const luminance = (pixel: Uint8ClampedArray) => {
      const [red, green, blue] = [...pixel].slice(0, 3).map((value) => {
        const unit = value / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    context.fillStyle = background;
    context.fillRect(0, 0, 1, 1);
    const surface = luminance(context.getImageData(0, 0, 1, 1).data);
    context.globalAlpha = Number(style.opacity);
    context.fillStyle = style.stroke;
    context.fillRect(0, 0, 1, 1);
    const foreground = luminance(context.getImageData(0, 0, 1, 1).data);
    const contrast =
      (Math.max(foreground, surface) + 0.05) / (Math.min(foreground, surface) + 0.05);
    expect(contrast, `Dashed label leader contrast in ${theme} theme`).toBeGreaterThanOrEqual(3);
    expect(
      getComputedStyle(
        document.querySelector('.workspace-context .map-legend-symbol.connector') as Element,
      ).color,
    ).toBe(style.stroke);
  }
}, 30000);
