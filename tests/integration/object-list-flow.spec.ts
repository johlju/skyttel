import type { Locator } from '@playwright/test';
import {
  closeSupportDialog,
  createHousehold,
  openMap,
  openSettings,
  openTable,
  signIn,
} from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { focusMapSearch } from '../support/object-search.js';
import { expect, test } from '../support/test.js';

// The 500-object map repeats tens of megabytes of SVG occlusion markup per DOM
// snapshot. Omit snapshots and the coupled browser network-tab capture; retain
// action/API events, screencast screenshots, pending/error diagnostics and geometry
// attachments without consuming the navigation test's budget on snapshot capture.
test.use({
  trace: {
    mode: 'retain-on-failure',
    snapshots: false,
    screenshots: true,
  },
});

test('LISTA-05: short-screen table returns preserve the visible result and keyboard focus', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.seedLargeMap(user.id, household.id);
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const before = await (await page.request.get(path)).json();
    await page.setViewportSize({ width: 320, height: 250 });
    // Navigation can finish before startup has fetched the large household map.
    // Begin the table journey only after that prerequisite has loaded.
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url() === `${path}/view` &&
          response.request().method() === 'GET' &&
          response.ok(),
      ),
      page.goto(installation.origin),
    ]);
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'Filter', exact: true }).click();
    const filters = page.getByRole('dialog', { name: 'Tabellens filter', exact: true });
    await filters.getByLabel('Ta med upphörda', { exact: true }).check();
    await filters.getByRole('button', { name: 'Stäng filter', exact: true }).click();
    await table.getByRole('button', { name: 'Provobjekt 045', exact: true }).click();
    const result = table.getByRole('button', {
      name: 'Redigera Provobjekt 045',
      exact: true,
    });
    await result.scrollIntoViewIfNeeded();
    await result.focus();
    const body = table.getByRole('region', { name: 'Rullbar objekttabell', exact: true });
    const position = async () => ({
      inner: await body.evaluate((element) => ({
        top: element.scrollTop,
        left: element.scrollLeft,
      })),
      outer: await table.evaluate((element) => element.scrollTop),
    });
    const remembered = await position();
    expect(remembered.inner.top).toBeGreaterThan(500);
    await result.click();
    const detail = page.getByRole('dialog', { name: 'Redigera Provobjekt 045', exact: true });
    await expect(detail.getByLabel('Namn', { exact: true })).toBeFocused();
    await closeSupportDialog(page, 'Redigera Provobjekt 045', 'Stäng objektdialogen');
    await expect(result).toBeFocused();
    expect(await position()).toEqual(remembered);
    await expectUncovered(result);
    await openMap(page);
    await openTable(page);
    await expect(result).toBeFocused();
    expect(await position()).toEqual(remembered);
    await expectUncovered(result);
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(table).toBeVisible();
    await expect(result).toBeFocused();
    await expectUncovered(result);
    const returned = await position();
    // The full-page toolbar can change height. Keep the same row accessible;
    // reveal only the offscreen control instead of restoring an unusable offset.
    expect(Math.abs(returned.inner.top - remembered.inner.top)).toBeLessThanOrEqual(250);
    expect(Math.abs(returned.outer - remembered.outer)).toBeLessThanOrEqual(250);
    const mapResult = table.getByRole('button', {
      name: 'Visa Provobjekt 045 i kartan',
      exact: true,
    });
    await mapResult.scrollIntoViewIfNeeded();
    await mapResult.focus();
    const mapScroll = await position();
    await mapResult.click();
    await expect(table).not.toBeVisible();
    await openTable(page);
    expect(await position()).toEqual(mapScroll);
    await expect(mapResult).toBeFocused();
    await expectUncovered(mapResult);
    await openMap(page);
    await focusMapSearch(page);
    await expect(page.getByLabel('Sök objekt i kartan', { exact: true })).toBeFocused();
    expect(await (await page.request.get(path)).json()).toEqual(before);
  } finally {
    await installation.close();
  }
});

async function expectUncovered(target: Locator) {
  const geometry = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      top: box.top,
      bottom: box.bottom,
      height: innerHeight,
      focused: document.activeElement === element,
      hit: hit?.outerHTML.slice(0, 400),
    };
  });
  await test.info().attach('Focused table control geometry', {
    body: JSON.stringify(geometry),
    contentType: 'application/json',
  });
  await expect
    .poll(() =>
      target.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return {
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          height: innerHeight,
          width: innerWidth,
          hit: hit?.tagName,
          hitName: hit?.getAttribute('aria-label'),
          uncovered: box.top >= 0 && box.bottom <= innerHeight && element.contains(hit),
        };
      }),
    )
    .toMatchObject({ uncovered: true });
}
