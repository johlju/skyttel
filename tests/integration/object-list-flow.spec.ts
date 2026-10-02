import { expect, test } from '@playwright/test';
import {
  activatePanel,
  createHousehold,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { openConversationText } from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';

test('LISTA-05: short-screen list returns preserve the visible result and keyboard focus', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.seedLargeMap(user.id, household.id);
    await page.setViewportSize({ width: 320, height: 250 });
    await page.goto(installation.origin);
    await openWorkspace(page);
    const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    const result = work.getByRole('button', {
      name: 'Uppgifter för Provobjekt 045',
      exact: true,
    });
    await result.click({ trial: true });
    await result.focus();
    const flow = page.locator('.household-map');
    const remembered = await flow.evaluate((element) => element.scrollTop);
    expect(remembered).toBeGreaterThan(500);
    await result.click();
    const detail = page.getByRole('region', { name: 'Provobjekt 045', exact: true });
    await expect(
      detail.getByRole('heading', { name: 'Provobjekt 045', exact: true }),
    ).toBeFocused();
    await activatePanel(page, 'Lista och utkast');
    expect(await flow.evaluate((element) => element.scrollTop)).toBe(remembered);
    await expect(result).toBeFocused();
    expect(
      await result.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return (
          box.top >= 0 &&
          box.bottom <= innerHeight &&
          element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
        );
      }),
    ).toBe(true);
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    // The return is a router transition, and the list restores its place and
    // focus in an effect after it. The click does not wait for either, and
    // the large map can take longer than the default wait on a busy machine.
    await expect
      .poll(() => flow.evaluate((element) => element.scrollTop), { timeout: 30_000 })
      .toBe(remembered);
    expect(
      await page.evaluate(() => {
        const element = document.activeElement;
        if (!element || element === document.body) return false;
        const box = element.getBoundingClientRect();
        return (
          box.top >= 0 &&
          box.bottom <= innerHeight &&
          element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
        );
      }),
    ).toBe(true);
    const mapResult = work.getByRole('button', {
      name: 'Visa Provobjekt 045 i kartan',
      exact: true,
    });
    await mapResult.click({ trial: true });
    await mapResult.focus();
    const mapScroll = await flow.evaluate((element) => element.scrollTop);
    await mapResult.click();
    await expect(work).not.toBeVisible();
    await openWorkspace(page);
    expect(await flow.evaluate((element) => element.scrollTop)).toBe(mapScroll);
    await expect(mapResult).toBeFocused();
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    await tools.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
    await tools.getByRole('button', { name: 'Sök i kartan', exact: true }).click();
    await expect(work.getByLabel('Sök objekt', { exact: true })).toBeFocused();
  } finally {
    await installation.close();
  }
});

test('LISTA-06: an inactive visible list opens details on the first pointer click without moving the result', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.seedLargeMap(user.id, household.id);
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const saved = await (await page.request.get(path)).json();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(installation.origin);
    await openWorkspace(page);
    const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    const body = work.locator('.workspace-panel-body');
    await openConversationText(page);
    await expect(work).toBeVisible();
    await expect(work).toHaveAttribute('data-active', 'false');
    const result = work.getByRole('button', {
      name: 'Uppgifter för Provobjekt 045',
      exact: true,
    });
    await result.scrollIntoViewIfNeeded();
    const remembered = await body.evaluate((element) => element.scrollTop);
    expect(remembered).toBeGreaterThan(500);
    await expect(result).not.toBeFocused();
    const bounds = await result.boundingBox();
    if (!bounds) throw new Error('The visible result must have a pointer target');
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await expect(work).toHaveAttribute('data-active', 'true');
    expect(await body.evaluate((element) => element.scrollTop)).toBe(remembered);
    expect(await result.boundingBox()).toEqual(bounds);
    await page.mouse.up();
    const detail = page.getByRole('region', { name: 'Provobjekt 045', exact: true });
    await expect(
      detail.getByRole('heading', { name: 'Provobjekt 045', exact: true }),
    ).toBeFocused();
    await activatePanel(page, 'Lista och utkast');
    expect(await body.evaluate((element) => element.scrollTop)).toBe(remembered);
    const after = await (await page.request.get(path)).json();
    expect(after.objects).toEqual(saved.objects);
    expect(after.relationships).toEqual(saved.relationships);
    expect(after.draft).toEqual(saved.draft);
  } finally {
    await installation.close();
  }
});
