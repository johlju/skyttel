import { openTable } from '../support/client.js';
import { openObjectRelationships } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { preparePropertyReading } from '../support/property-reading.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';

test('SÖK-17: saved and proposed properties remain readable and searchable in table, map and relationship details', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await preparePropertyReading(page.request, installation.origin);
    const before = await read();
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(installation.origin);
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await expect(table.getByRole('columnheader')).toHaveText(['Namn', 'Typ', 'Status', 'Åtgärder']);
    const search = table.getByRole('searchbox');
    await search.fill('ramnummer grön');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    const opener = table.getByRole('button', { name: 'Cykel', exact: true });
    await opener.focus();
    await page.keyboard.press('Enter');
    const details = table.getByRole('region', { name: 'Uppgifter för Cykel', exact: true });
    await expect(details).toContainText('Tomt (ingen datatyp)');
    await expect(details).toContainText('Sparat: Röd (Text)');
    await expect(details).toContainText('Ditt förslag: Grön (Text)');
    await expect(details).toContainText('0 (Tal)');
    await expect(details).toContainText('Nej (Ja/nej)');
    await expect(
      details.locator('dt').filter({ hasText: /^(Ramnummer|Antal|Kontrollerad|Slutdatum)$/ }),
    ).toHaveText(['Ramnummer', 'Ramnummer', 'Antal', 'Kontrollerad', 'Slutdatum']);
    expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await opener.press('Enter');
    await expect(opener).toBeFocused();
    await search.fill('ramnummer blå');
    await table.getByRole('button', { name: 'Cykel', exact: true }).click();
    await expect(
      table.getByRole('region', { name: 'Uppgifter för Cykel', exact: true }),
    ).toContainText('Tomt (Tal)');
    await search.fill('');
    const links = await openObjectRelationships(page, 'Alex');
    await expect(links.locator('dt').filter({ hasText: /^Avtal$/ })).toHaveCount(2);
    await expect(links).toContainText('Tomt (Text)');
    await expect(links).toContainText('Nej (Ja/nej)');
    await links.getByText('Sparade egenskaper i sin ordning', { exact: true }).click();
    await expect(links.locator('details ol > li')).toHaveText([
      'Avtal: Tomt (ingen datatyp)',
      'Avtal: Nej (Ja/nej)',
    ]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Karta', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Sök objekt i kartan' }).fill('ramnummer grön');
    await expect(page.locator('.spatial-node[data-object-id="one"]')).toBeVisible();
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('SÖK-18: inspect same-name endpoint candidates before explicitly choosing the intended identity', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await preparePropertyReading(page.request, installation.origin);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(installation.origin);
    const dialog = await openObjectRelationships(page, 'Alex');
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog
      .getByLabel('Sambandstyp', { exact: true })
      .selectOption((await read()).relationshipTypes[0].id);
    const target = dialog.getByRole('region', {
      name: 'Till objekt: välj eller granska',
      exact: true,
    });
    await target.getByRole('searchbox').fill('ramnummer');
    const inspect = target.getByText('Granska Cykel [two]', { exact: true });
    await inspect.focus();
    await page.keyboard.press('Enter');
    await expect(target.getByText('Blå (Text)', { exact: true })).toBeVisible();
    await expect(target.getByLabel('Till objekt', { exact: true })).toHaveValue('');
    const choose = target.getByRole('button', { name: 'Välj Cykel [two]', exact: true });
    await choose.focus();
    await page.keyboard.press('Enter');
    await expect(target.getByLabel('Till objekt', { exact: true })).toBeFocused();
    await expect(target.getByLabel('Till objekt', { exact: true })).toHaveValue('two');
    await stageRelationshipAndClose(page);
    const state = await read();
    expect(state.draft.relationships?.find((change) => change.id !== 'edge')?.after).toMatchObject({
      sourceId: 'alex',
      targetId: 'two',
    });
    expect(state.relationships).toHaveLength(1);
  } finally {
    await installation.close();
  }
});
