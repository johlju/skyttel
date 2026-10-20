import { closeTextView } from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { openObjectRelationships } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { createRelationshipFixture } from '../support/relationship-fixture.js';
import { expect, test } from '../support/test.js';

for (const [caseId, width] of [
  ['EGENSKAP-03', 1440],
  ['EGENSKAP-04', 320],
] as const)
  test(`${caseId}: edit and preserve relationship properties through type change, save and restart at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      const { household, read } = await createRelationshipFixture(
        page.request,
        installation.origin,
      );
      await page.goto(`${installation.origin}/households/${household.id}`);
      const dialog = await openObjectRelationships(page, 'Alex');
      await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
      const initial = await read();
      await dialog
        .getByLabel('Sambandstyp', { exact: true })
        .selectOption(initial.relationshipTypes[0].id);
      await dialog.getByLabel('Från objekt', { exact: true }).selectOption('alex');
      await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
      await dialog.getByRole('button', { name: 'Lägg till egenskap', exact: true }).click();
      const first = dialog.getByRole('group', { name: 'Egenskap 1', exact: true });
      await expect(first.getByLabel('Etikett', { exact: true })).toBeFocused();
      await first.getByLabel('Etikett', { exact: true }).fill('Pris');
      await first.getByLabel('Datatyp', { exact: true }).selectOption('text');
      await first.getByLabel('Värde', { exact: true }).fill('Gratis idag');
      await first.getByLabel('Datatyp', { exact: true }).selectOption('number');
      await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
      await expect(dialog.getByRole('alert', { name: 'Formuläret innehåller fel' })).toBeFocused();
      await expect(first.getByLabel('Värde', { exact: true })).toHaveValue('Gratis idag');
      expect((await read()).draft.relationships ?? []).toEqual([]);
      await first.getByLabel('Värde', { exact: true }).fill('0');
      await dialog.getByRole('button', { name: 'Lägg till egenskap', exact: true }).click();
      const second = dialog.getByRole('group', { name: 'Egenskap 2', exact: true });
      await second.getByLabel('Etikett', { exact: true }).fill('Pris');
      await second.getByLabel('Datatyp', { exact: true }).selectOption('boolean');
      await second.getByLabel('Värde', { exact: true }).selectOption('false');
      await second.getByRole('button', { name: 'Flytta upp', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(first.getByLabel('Etikett', { exact: true })).toBeFocused();
      await expect(first.getByLabel('Värde', { exact: true })).toHaveValue('false');
      await expect(dialog.getByRole('status', { name: 'Egenskapernas ordning' })).toContainText(
        'position 1',
      );
      await dialog
        .getByLabel('Sambandstyp', { exact: true })
        .selectOption(initial.relationshipTypes[1].id);
      await stageRelationshipAndClose(page);
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      await installation.restart();
      await page.reload();
      const reopened = await openObjectRelationships(page, 'Alex');
      await expect(reopened).toContainText('Nej (Ja/nej)');
      await expect(reopened).toContainText('0 (Tal)');
      await reopened.getByRole('button', { name: 'Redigera samband', exact: true }).click();
      await expect(reopened.getByLabel('Sambandstyp', { exact: true })).toHaveValue(
        initial.relationshipTypes[1].id,
      );
      const savedFirst = reopened.getByRole('group', { name: 'Egenskap 1', exact: true });
      await expect(savedFirst.getByLabel('Värde', { exact: true })).toHaveValue('false');
      await savedFirst.getByRole('button', { name: 'Töm värdet', exact: true }).click();
      await expect(savedFirst.getByLabel('Datatyp', { exact: true })).toHaveValue('boolean');
      await reopened
        .getByRole('group', { name: 'Egenskap 2', exact: true })
        .getByRole('button', { name: 'Ta bort egenskapen', exact: true })
        .click();
      await stageRelationshipAndClose(page);
      const proposal = (await read()).draft.relationships?.[0];
      expect(proposal?.after?.properties).toEqual([
        { id: proposal?.before?.properties?.[0].id, label: 'Pris', kind: 'boolean' },
      ]);
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      await page.reload();
      const final = await openObjectRelationships(page, 'Alex');
      await expect(final).toContainText('Tomt (Ja/nej)');
      await final.getByRole('button', { name: 'Redigera samband', exact: true }).click();
      await expect(final.getByRole('group', { name: 'Egenskap 2', exact: true })).toHaveCount(0);
      await expect(final.getByLabel('Från objekt', { exact: true })).toHaveValue('alex');
      await expect(final.getByLabel('Till objekt', { exact: true })).toHaveValue('bicycle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      await installation.close();
    }
  });
