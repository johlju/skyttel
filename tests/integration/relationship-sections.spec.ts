import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openSettings,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editObjectRelationship, openObjectRelationships } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';

for (const [caseId, width] of [
  ['STY-08', 1440],
  ['STY-10', 390],
  ['STY-11', 320],
] as const)
  test(`${caseId}: relationship sections preserve hidden answers and private presentation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const installation = await createInstallation();
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const initial = await (await page.request.get(path)).json();
      for (const [version, id, name] of [
        [0, 'bike', 'Cykeln'],
        [1, 'garage', 'Garaget'],
      ] as const)
        expect(
          (
            await page.request.post(`${path}/draft`, {
              headers: { origin: installation.origin },
              data: {
                version,
                id,
                baseRevision: null,
                value: { typeId: initial.types[0].id, name, description: '' },
              },
            })
          ).status(),
        ).toBe(200);
      const settings = async () => {
        await openSettings(page);
        const nav = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
        if (width <= 800) await nav.getByText('Välj inställning', { exact: true }).click();
        await nav.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
      };
      await page.goto(installation.origin);
      await settings();
      await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
      await page.getByLabel('Sambandstypens namn').fill('Förvaring');
      await page.getByLabel('Benämning från startobjektet').fill('förvaras i');
      await page.getByLabel('Benämning från målobjektet').fill('innehåller');
      await page.getByLabel('Avsnitt 1', { exact: true }).fill('Uppgifter');
      await page.getByRole('button', { name: 'Lägg till avsnitt', exact: true }).click();
      await page.getByLabel('Avsnitt 2', { exact: true }).fill('Service');
      await page.getByRole('button', { name: 'Flytta avsnittet Service upp', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('Avsnitt 1', { exact: true })).toBeFocused();
      await expect(page.getByLabel('Avsnitt 1', { exact: true })).toHaveValue('Service');
      for (const [name, kind] of [
        ['Leverantör', 'text'],
        ['Effekt', 'number'],
        ['Datum', 'date'],
        ['Batteri', 'boolean'],
        ['Reserv', 'boolean'],
      ]) {
        await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
        const field = page.getByRole('group', { name: /^Eget fält/ }).last();
        await field.getByLabel('Fältets namn').fill(name);
        await field.getByLabel('Värdeslag', { exact: true }).selectOption(kind);
        await field.getByLabel('Visa i avsnitt').selectOption({ label: 'Uppgifter' });
      }
      for (const theme of ['light', 'dark']) {
        await page.getByRole('button', { name: /^Tema:/ }).click();
        await page
          .getByRole('radio', { name: theme === 'light' ? 'Ljust' : 'Mörkt', exact: true })
          .click();
        await page.keyboard.press('Escape');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        for (const button of await page.locator('.object-type-editor button:visible').all())
          expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.screenshot({
          path: test.info().outputPath(`relationship-sections-${width}-${theme}.png`),
          fullPage: true,
        });
      }
      await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      const relationshipDialog = await openObjectRelationships(page, 'Cykeln');
      await relationshipDialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
      await page.getByLabel('Från objekt').selectOption('bike');
      await page.getByLabel('Till objekt').selectOption('garage');
      await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
      await page.getByLabel('Leverantör', { exact: true }).fill('Exempelsol');
      await page.getByLabel('Effekt', { exact: true }).fill('0');
      await page.getByLabel('Datum', { exact: true }).fill('2026-09-01');
      await page.getByLabel('Batteri', { exact: true }).selectOption('false');
      await stageRelationshipAndClose(page);
      await settings();
      if (
        (await page
          .getByText('Sambandstyper och riktning', { exact: true })
          .locator('..')
          .getAttribute('open')) === null
      )
        await page.getByText('Sambandstyper och riktning', { exact: true }).click();
      await page.getByRole('button', { name: 'Ändra sambandstyp: Förvaring', exact: true }).click();
      await page.getByRole('button', { name: 'Dölj Effekt, behåll värden', exact: true }).click();
      await page
        .getByRole('group', { name: 'Eget fält 1', exact: true })
        .getByLabel('Visa i avsnitt')
        .selectOption({ label: 'Service' });
      await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
      const draft = await (await page.request.get(path)).json();
      expect(draft.objects).toEqual([]);
      expect(draft.draft.relationshipTypes).toHaveLength(1);
      const originalValues = draft.draft.relationships[0].after.customValues;
      const originalFields = draft.draft.relationshipTypes[0].after.fields;
      expect(Object.values(originalValues)).toEqual(['Exempelsol', 0, '2026-09-01', false]);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      if (width === 1440) {
        await saveReviewedConflictDraft(page);
        await closeTextView(page);
        await installation.restart();
        await page.reload();
      }
      await editObjectRelationship(page, 'Cykeln', 'Cykeln → förvaras i → Garaget');
      await expect(page.getByLabel('Effekt', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('false');
      await expect(page.getByLabel('Reserv', { exact: true })).toHaveValue('');
      const cancel = page.getByRole('button', { name: 'Avbryt redigeringen', exact: true });
      await cancel.focus();
      await expect(cancel).toBeFocused();
      const bounds = await cancel.boundingBox();
      expect(bounds?.y).toBeGreaterThanOrEqual(0);
      expect((bounds?.y ?? 1000) + (bounds?.height ?? 0)).toBeLessThanOrEqual(1000);
      await page.getByRole('button', { name: 'Avbryt redigeringen', exact: true }).click();
      await closeSupportDialog(page, 'Samband för Cykeln');
      await settings();
      if (
        (await page
          .getByText('Sambandstyper och riktning', { exact: true })
          .locator('..')
          .getAttribute('open')) === null
      )
        await page.getByText('Sambandstyper och riktning', { exact: true }).click();
      await page.getByRole('button', { name: 'Ändra sambandstyp: Förvaring', exact: true }).click();
      await page
        .getByRole('group', { name: 'Eget fält 2', exact: true })
        .getByLabel('Visa i avsnitt')
        .selectOption({ label: 'Service' });
      await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await editObjectRelationship(page, 'Cykeln', 'Cykeln → förvaras i → Garaget');
      await expect(page.getByLabel('Effekt', { exact: true })).toHaveValue('0');
      await expect(page.getByLabel('Leverantör', { exact: true })).toHaveValue('Exempelsol');
      await expect(page.getByLabel('Datum', { exact: true })).toHaveValue('2026-09-01');
      const current = await (await page.request.get(path)).json();
      expect(
        (width === 1440 ? current.relationships[0] : current.draft.relationships[0].after)
          .customValues,
      ).toEqual(originalValues);
      expect(
        current.draft.relationshipTypes[0].after.fields.map((field: { id: string }) => field.id),
      ).toEqual(originalFields.map((field: { id: string }) => field.id));
    } finally {
      await installation.close();
    }
  });
