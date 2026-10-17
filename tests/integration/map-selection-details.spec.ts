import type { Locator } from '@playwright/test';
import { openMap, openTable, utilityButton } from '../support/client.js';
import { prepareHouseholdReading } from '../support/household-reading.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 320, height: 640 },
  { width: 320, height: 250 },
]) {
  const caseId =
    viewport.width === 1280
      ? 'MARKERING-05'
      : viewport.height === 640
        ? 'MARKERING-09'
        : 'MARKERING-10';
  test(`${caseId}: selected information is read only and ordinary work remains reachable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    const installation = await createInstallation();
    try {
      const app = await prepareHouseholdReading(page.request, installation.origin, false);
      const before = await app.read();
      await page.setViewportSize(viewport);
      await page.goto(installation.origin);
      await openMap(page);
      const node = page.locator('.spatial-node[data-object-id="bike"]');
      await node.focus();
      await page.keyboard.press('Enter');
      await node.press('Shift+F10');
      await page
        .getByRole('toolbar', { name: 'Åtgärder för Cykel', exact: true })
        .getByRole('button', { name: 'Visa uppgifter för Cykel', exact: true })
        .click();
      const details = page.locator('.map-selection-details');
      await expect(details).toBeVisible();
      await expect(details).toHaveAttribute('data-selection-id', 'bike');
      await expect(details).toContainText('Cykel');
      await expect(details).toContainText('2000 SEK');
      await expect(details).toContainText('2500 SEK');
      await expect(page.locator('.object-property-window')).toHaveCount(1);
      await details.getByRole('button', { name: 'Redigera Cykel', exact: true }).focus();
      await page.keyboard.press('Enter');
      const editor = page.getByRole('dialog', { name: 'Redigera Cykel', exact: true });
      await expect(editor).toBeVisible();
      const current = before.draft.changes.find((change) => change.id === 'bike')?.after;
      if (!current) throw new Error('The current bicycle proposal must exist');
      await expect(editor.getByLabel('Namn', { exact: true })).toHaveValue(current.name);
      await expect(editor.getByLabel('Objekttyp', { exact: true })).toHaveValue(current.typeId);
      await expect(editor.getByLabel('Identitet', { exact: true })).toHaveValue('identified');
      await expect(editor.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        current.description,
      );
      await editor.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true }).click();
      await expect(editor.getByLabel('Pris: uppgiftens säkerhet', { exact: true })).toHaveValue(
        'known',
      );
      await expect(editor.getByLabel('Pris', { exact: true })).toHaveValue('2500 SEK');
      await expect(
        editor.getByLabel('Senast uppgiven skuld: uppgiftens säkerhet', { exact: true }),
      ).toHaveValue('none');
      await expect(
        editor.getByLabel('Slutdatum: uppgiftens säkerhet', { exact: true }),
      ).toHaveValue('unknown');

      await editor.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      await expect(editor).not.toBeVisible();
      await expect(
        details.getByRole('button', { name: 'Redigera Cykel', exact: true }),
      ).toBeFocused();
      expect(await app.read()).toEqual(before);
      await details.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({ path: testInfo.outputPath('selected-information.png') });
      await details.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
      await openTable(page);
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      const tableEdit = table.getByRole('button', { name: 'Redigera Cykel', exact: true });
      await tableEdit.click();
      await editor.getByLabel('Beskrivning', { exact: true }).fill('Mitt privata läsförslag');
      await editor.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(editor).not.toBeVisible();
      await expect(tableEdit).toBeFocused();
      const status = page.getByRole('status', { name: 'Hushållsarbetets status', exact: true });
      await expect(status).toHaveCount(1);
      await expect(status).toHaveText('Ändringen finns i ditt utkast. Kartan sparas separat.');
      const after = await app.read();
      expect(after.objects).toEqual(before.objects);
      expect(after.relationships).toEqual(before.relationships);
      expect(after.draft.changes.find((change) => change.id === 'bike')?.after).toEqual({
        ...before.draft.changes.find((change) => change.id === 'bike')?.after,
        description: 'Mitt privata läsförslag',
      });
      await (await utilityButton(page, 'Karta')).click();
      await expect(status).toHaveCount(1);
      await expect(status).toHaveText('Ändringen finns i ditt utkast. Kartan sparas separat.');
    } finally {
      await installation.close();
    }
  });
}

test('MARKERING-06: independent property windows share context actions and move without moving the map', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const installation = await createInstallation();
  try {
    const app = await prepareHouseholdReading(page.request, installation.origin, false);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(installation.origin);
    await openMap(page);
    const before = await app.read();
    const personalBefore = await (await page.request.get(`${app.path}/view`)).json();
    const bike = page.getByRole('button', { name: 'Välj objekt: Cykel', exact: true });
    const garage = page.getByRole('button', { name: 'Välj objekt: Garage', exact: true });
    await bike.click({ trial: true });
    const positions = () =>
      page.locator('.spatial-node').evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { id: (node as HTMLElement).dataset.objectId, x: box.x, y: box.y };
        }),
      );
    const cameraBefore = await positions();
    await bike.click({ button: 'right' });
    const actions = page.getByRole('toolbar', { name: 'Åtgärder för Cykel', exact: true });
    await expect(actions.getByRole('button')).toHaveCount(7);
    await actions.getByRole('button', { name: 'Samband för Cykel', exact: true }).click();
    const relationships = page.getByRole('dialog', { name: 'Samband för Cykel', exact: true });
    await expect(
      relationships.getByRole('region', { name: 'Befintliga samband', exact: true }),
    ).toContainText('Garage');
    await relationships.getByRole('button', { name: 'Stäng dialogen', exact: true }).click();
    await bike.click({ button: 'right' });
    const sharedActionNames = ['Samband för Cykel', 'Visa i kartan', 'Visa samband i kartan'];
    const expectNamedActions = async (toolbar: Locator, names: string[]) => {
      for (const name of names) {
        const action = toolbar.getByRole('button', { name, exact: true });
        await expect(action).toHaveAccessibleName(name);
        await action.click({ trial: true });
      }
    };
    await expectNamedActions(actions, ['Redigera objekt', ...sharedActionNames, 'Ta bort objekt']);
    await actions.getByRole('button', { name: 'Visa uppgifter för Cykel', exact: true }).click();
    const first = page.getByRole('region', { name: 'Cykel', exact: true });
    await expect(first).toBeVisible();
    await expect(first).toContainText('Ramens märkning är ett påhittat exempel');
    await expect(first).toContainText('2000 SEK');
    await expect(first).toContainText('2500 SEK');
    const firstActions = first.getByRole('toolbar', {
      name: 'Objektåtgärder för Cykel',
      exact: true,
    });
    // Icon artwork and order may change; each shared action must remain named and usable.
    const propertyActionNames = ['Redigera Cykel', ...sharedActionNames, 'Ta bort Cykel'];
    await expect(firstActions.getByRole('button')).toHaveCount(propertyActionNames.length);
    await expectNamedActions(firstActions, propertyActionNames);
    const close = first.getByRole('button', { name: 'Stäng uppgifterna', exact: true });
    await expect(close).toHaveAccessibleName('Stäng uppgifterna');
    await close.click({ trial: true });
    await expect.poll(positions).toEqual(cameraBefore);
    const move = async (panel: Locator, x: number, y: number) => {
      const header = panel.locator('.object-property-header');
      const box = await header.boundingBox();
      if (!box) throw new Error('The window title must be visible');
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(x, y, { steps: 5 });
      await page.mouse.up();
    };
    await move(first, 180, 200);
    const firstPosition = await first.boundingBox();
    await expect.poll(positions).toEqual(cameraBefore);
    await garage.dblclick();
    const second = page.getByRole('region', { name: 'Garage', exact: true });
    await expect(second).toBeVisible();
    await expect(page.locator('.object-property-window')).toHaveCount(2);
    await expect(first).toHaveAttribute('data-selection-id', 'bike');
    expect(await first.boundingBox()).toEqual(firstPosition);
    await move(second, 870, 290);
    expect(await first.boundingBox()).toEqual(firstPosition);
    await expect.poll(positions).toEqual(cameraBefore);
    const handle = second.getByRole('group', {
      name: 'Flytta uppgiftsfönstret för Garage',
      exact: true,
    });
    const secondPosition = await second.boundingBox();
    await handle.press('Shift+ArrowLeft');
    expect((await second.boundingBox())?.x).toBe((secondPosition?.x ?? 0) - 40);
    expect(await first.boundingBox()).toEqual(firstPosition);
    await expect.poll(positions).toEqual(cameraBefore);
    await page.screenshot({ path: testInfo.outputPath('independent-property-windows.png') });
    await second.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    await expect(second).toHaveCount(0);
    await expect(first).toBeVisible();
    expect(await first.boundingBox()).toEqual(firstPosition);
    await bike.focus();
    await bike.press('Shift+F10');
    await actions.getByRole('button', { name: 'Visa uppgifter för Cykel', exact: true }).click();
    await expect(page.locator('.object-property-window')).toHaveCount(1);
    expect(await first.boundingBox()).toEqual(firstPosition);
    await firstActions.getByRole('button', { name: 'Redigera Cykel', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Redigera Cykel', exact: true });
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    await expect(
      firstActions.getByRole('button', { name: 'Redigera Cykel', exact: true }),
    ).toBeFocused();
    await first.locator('.object-property-body').hover();
    await page.mouse.wheel(0, 160);
    await expect.poll(positions).toEqual(cameraBefore);
    const header = first.locator('.object-property-header');
    const headerBox = await header.boundingBox();
    if (!headerBox) throw new Error('The title must be available for cancelled dragging');
    await page.mouse.move(headerBox.x + 20, headerBox.y + 20);
    await page.mouse.down();
    await page.mouse.move(headerBox.x + 80, headerBox.y + 60);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect(await first.boundingBox()).toEqual(firstPosition);
    await expect(first).toBeVisible();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 640 });
      await expect
        .poll(async () => {
          const bounds = await first.boundingBox();
          return bounds ? bounds.x + bounds.width : Number.POSITIVE_INFINITY;
        })
        .toBeLessThanOrEqual(width - 8);
      const box = await first.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(8);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width - 8);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(632);
      await expect(
        first.getByRole('button', { name: 'Stäng uppgifterna', exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`property-window-${width}px.png`) });
    }
    const touchCamera = await positions();
    const touchOrigin = await first.boundingBox();
    const touchHeader = await header.boundingBox();
    if (!touchOrigin || !touchHeader) throw new Error('The touch title must be visible');
    const cdp = await page.context().newCDPSession(page);
    const touchPoint = { x: touchHeader.x + 20, y: touchHeader.y + 20 };
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: touchPoint.x, y: touchPoint.y + 40 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await first.boundingBox())?.y).toBe(touchOrigin.y + 40);
    await expect.poll(positions).toEqual(touchCamera);
    await cdp.detach();
    expect(await app.read()).toEqual(before);
    expect(await (await page.request.get(`${app.path}/view`)).json()).toEqual(personalBefore);
    await firstActions.getByRole('button', { name: 'Ta bort Cykel', exact: true }).click();
    await expect(first.getByRole('heading', { name: 'Cykel', exact: true })).toBeFocused();
    const afterRemoval = await app.read();
    expect(afterRemoval.objects).toEqual(before.objects);
    expect(afterRemoval.relationships).toEqual(before.relationships);
    expect(afterRemoval.draft.changes.find((change) => change.id === 'bike')?.after).toBeNull();
    await first.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
    await expect(page.locator('.object-property-window')).toHaveCount(0);
  } finally {
    await installation.close();
  }
});
