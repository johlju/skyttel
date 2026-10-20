import type { SaveReceipt } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openNewObject,
  openSettings,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { readCommittedHistoryCard } from '../support/conversation-page.js';
import { editTableObject } from '../support/domain-work.js';
import { downloadHouseholdExport } from '../support/household-export-download.js';
import { createInstallation } from '../support/installation.js';
import { propertyRow, setProperty } from '../support/property-controls.js';
import { expect, test } from '../support/test.js';

test('IMPORT-07: property editing, replacement and historical reading preserve old meanings and ordinary corrections', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    await page.goto(installation.origin);
    const editDefinition = async (meaning: string) => {
      await openSettings(page);
      await page.getByRole('link', { name: 'Typer', exact: true }).click();
      const summary = page.getByText('Objekttyper', { exact: true });
      if ((await summary.locator('..').getAttribute('open')) === null) await summary.click();
      await page.getByRole('button', { name: 'Ändra typ: Person', exact: true }).click();
      await page.getByLabel('Typens beskrivning', { exact: true }).fill(meaning);
      await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    };
    const save = async () => {
      const saved = page.waitForResponse(
        (response) =>
          response.url() === `${path}/map/save` && response.request().method() === 'POST',
      );
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      return (await (await saved).json()).receipt as SaveReceipt;
    };
    const createMeter = async (name: string, value: string) => {
      const form = await openNewObject(page);
      await form.getByLabel('Namn', { exact: true }).fill(name);
      await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Person' });
      await setProperty(form, 'Serienummer', value, 'number');
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    };
    await editDefinition('Första betydelsen');
    const definitionReceipt = await save();
    await editDefinition('Senare betydelsen');
    await createMeter('Mätare', '42');
    const additionReceipt = await save();
    await openTable(page);
    await page.getByRole('button', { name: 'Ta bort Mätare', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ta bort Mätare', exact: true })).toBeDisabled();
    await editDefinition('Första betydelsen');
    const removalReceipt = await save();
    const before = (await (await page.request.get(`${path}/map/history`)).json()).history;
    const archive = await downloadHouseholdExport(page, path);
    await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel.zip',
      mimeType: 'application/zip',
      buffer: archive,
    });
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(page.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
    await installation.restart();
    await page.goto(installation.origin);
    await (await utilityButton(page, 'Rapporter')).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik', exact: true });
    await expect(history.getByText('Visa ändringarna', { exact: true })).toHaveCount(before.length);
    for (const details of await history.getByText('Visa ändringarna', { exact: true }).all()) {
      await details.click();
    }
    await expect(history).toContainText('Mätare');
    await expect(history).toContainText('Serienummer');
    await expect(history).toContainText('42');
    await expect(history).toContainText('Tal');
    await expect(history).toContainText('Första betydelsen');
    await expect(history).toContainText('Senare betydelsen');
    await expect(history).toContainText('Alex Exempel');
    const removal = history.locator(`article[data-save="${before[0].operationId}"]`);
    await expect(removal).toContainText('Objekt: Mätare');
    await expect(removal).toContainText('42');
    await expect(removal).toContainText('Serienummer');
    await expect(removal).toContainText('Tal');
    await expect(removal.locator('time')).toHaveAttribute('datetime', before[0].savedAt);
    for (const receipt of [removalReceipt, additionReceipt, definitionReceipt])
      await readCommittedHistoryCard(history, receipt);
    expect(before).toEqual([removalReceipt, additionReceipt, definitionReceipt]);
    expect((await (await page.request.get(`${path}/map/history`)).json()).history).toEqual(before);
    await page.goto(installation.origin);
    await editDefinition('Senare betydelsen');
    await createMeter('Ny mätare', '43');
    await save();
    await installation.restart();
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Ny mätare');
    await page.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
    await expect(propertyRow(page, 'Serienummer').getByLabel('Värde', { exact: true })).toHaveValue(
      '43',
    );
    const after = (await (await page.request.get(`${path}/map/history`)).json()).history;
    expect(after).toHaveLength(before.length + 1);
    for (const receipt of before) expect(after).toContainEqual(receipt);
  } finally {
    await installation.close();
  }
});
