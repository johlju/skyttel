import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { cdp, page, userEvent } from 'vitest/browser';
import { HouseholdMap } from '../../src/client/HouseholdMap.js';
import '../../src/client/styles.css';
import type { MapState } from '../../src/shared/map.js';
import { defaultViewSettings } from '../../src/shared/personal-view.js';

const state: MapState = {
  userId: 'alex',
  contentVersion: 1,
  types: [
    { id: 'person', householdId: 'home', revision: 1, name: 'Person', description: '' },
    { id: 'service', householdId: 'home', revision: 1, name: 'Tjänst', description: '' },
  ],
  relationshipTypes: [],
  relationships: [],
  objects: [
    {
      id: 'alex',
      householdId: 'home',
      typeId: 'person',
      revision: 1,
      name: 'Alex',
      description: '',
    },
    {
      id: 'music',
      householdId: 'home',
      typeId: 'service',
      revision: 1,
      name: 'Tonmoln',
      description: '',
    },
  ],
  draft: { version: 0, changes: [] },
};

async function open(width: number) {
  await page.viewport(width, 960);
  await expect.poll(() => window.innerWidth).toBe(width);
  await expect
    .poll(() => window.matchMedia('(min-width: 1100px) and (pointer: fine)').matches)
    .toBe(width >= 1100);
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith('/view'))
      return Response.json({
        contentVersion: 1,
        positions: [],
        settings: { ...defaultViewSettings, version: 0 },
      });
    if (url.endsWith('/operations')) return Response.json({ operations: [] });
    if (url.endsWith('/text-assistant')) return Response.json({ available: true });
    if (url.includes('/map?')) return Response.json(state);
    throw new Error(`Unexpected request: ${url}`);
  });
  render(
    <main>
      <section className="panel household-panel">
        <HouseholdMap householdId="home" />
      </section>
    </main>,
  );
  await expect.element(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('desktop keeps the map beside a bounded work panel with conversation, selection and list', async () => {
  await open(1440);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  const surface = document.querySelector('.spatial-surface');
  const inspector = page.getByRole('region', { name: 'Val och redigering' });
  await expect.element(inspector).toBeVisible();
  expect(surface).not.toBeNull();
  const bounds = surface?.getBoundingClientRect();
  const details = inspector.element().getBoundingClientRect();
  const speech = page.getByRole('region', { name: 'Talsamtal' }).element().getBoundingClientRect();
  expect(bounds?.width).toBeGreaterThan(800);
  expect(details.left).toBeGreaterThan(bounds?.right ?? 0);
  expect(details.right).toBeLessThanOrEqual(1440);
  expect(speech.height).toBeGreaterThan(0);
  expect(
    page.getByRole('button', { name: 'Alex', exact: true }).element().getBoundingClientRect().top,
  ).toBeGreaterThan(details.top);
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  await expect.element(page.getByText('Namn: Alex', { exact: true })).toBeVisible();
  await expect
    .element(page.getByLabelText('Objektets namn', { exact: true }))
    .not.toBeInTheDocument();
});

test('phone opens the list from the map and preserves an edited name through map navigation', async () => {
  await open(390);
  await expect
    .element(page.getByRole('button', { name: 'Nytt objekt', exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Alex', exact: true }).click();
  await expect.element(page.getByRole('button', { name: 'Alex', exact: true })).toHaveFocus();
  await userEvent.keyboard('{Tab}');
  await expect
    .element(page.getByRole('button', { name: 'Redigera Alex', exact: true }))
    .toHaveFocus();
  await userEvent.keyboard('{Enter}');
  await expect.element(page.getByLabelText('Objektets namn', { exact: true })).toHaveFocus();
  await page.getByLabelText('Objektets namn', { exact: true }).fill('Alex ändrat');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await expect
    .element(page.elementLocator(document.querySelector('.assistant-bar') as HTMLElement))
    .not.toBeVisible();
  await expect
    .element(page.elementLocator(document.querySelector('.map-inspector') as HTMLElement))
    .not.toBeVisible();
  const bounds = document.querySelector('.spatial-surface')?.getBoundingClientRect();
  expect(bounds?.height).toBeGreaterThan(500);
  expect(bounds?.width).toBeGreaterThan(340);
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect
    .element(page.getByLabelText('Objektets namn', { exact: true }))
    .toHaveValue('Alex ändrat');
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await expect.element(page.getByRole('region', { name: 'Talsamtal' })).toBeVisible();
  await expect
    .element(page.getByLabelText('Objektets namn', { exact: true }))
    .toHaveValue('Alex ändrat');
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});

test('landscape toolbar overflow preserves canvas height and reachable controls', async ({
  onTestFinished,
}) => {
  const session = cdp();
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  onTestFinished(async () => {
    await session.send('Emulation.setEmulatedMedia', { features: [] });
  });
  await open(640);
  await page.viewport(640, 390);
  const toolbar = document.querySelector('.spatial-bottom-bar') as HTMLElement;
  await expect.poll(() => toolbar.scrollWidth > toolbar.clientWidth).toBe(true);
  const height = () => document.querySelector('canvas')?.getBoundingClientRect().height;
  await expect.poll(height).toBeGreaterThan(200);
  const heightHelp = page.getByLabelText('Visa höjdhjälp', { exact: true });
  await heightHelp.click();
  await expect.element(heightHelp).toBeChecked();
  await expect.element(heightHelp).toBeInViewport();
  await expect.poll(height).toBeGreaterThan(200);
});

test('full map fills the available desktop and landscape phone area', async () => {
  await open(1280);
  const surface = () => document.querySelector('.spatial-surface')?.getBoundingClientRect();
  await expect.poll(() => surface()?.width).toBeGreaterThan(1200);
  await page.viewport(844, 390);
  await expect.poll(() => surface()?.width).toBeGreaterThan(800);
  await expect.poll(() => surface()?.height).toBeGreaterThan(200);
  await page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }).click();
  await expect
    .element(page.getByRole('button', { name: 'Välj objekt: Alex', exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByLabelText('Objektets namn', { exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
  await expect.element(page.getByLabelText('Objektets namn', { exact: true })).toHaveValue('Alex');
  const work = page.elementLocator(document.querySelector('.assistant-workspace') as HTMLElement);
  await expect.element(work).toBeVisible();
  expect(work.element().getBoundingClientRect().height).toBeLessThanOrEqual(390);
  expect(work.element().getBoundingClientRect().width).toBeLessThan(844);
  await page.viewport(844, 140);
  const name = page.getByLabelText('Objektets namn', { exact: true });
  await expect.poll(() => name.element().getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  await expect.poll(() => name.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(140);
  await expect.element(name).toHaveValue('Alex');
  await page.viewport(844, 390);
  await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
  await expect.element(page.getByRole('button', { name: 'Lista', exact: true })).toHaveFocus();
});
