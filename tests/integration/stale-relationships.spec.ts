import { closeTextView, openDraftReview, openTable } from '../support/client.js';
import {
  prepareRelationshipSpecialConflict,
  saveReviewedConflictDraft,
} from '../support/conflict-special.js';
import { propertyRow } from '../support/property-controls.js';
import { createPreparedContext, expect, test } from '../support/test.js';

for (const [id, kind, width] of [
  ['151', 'missing-endpoint', 1280],
  ['152', 'edited-missing-endpoint', 320],
] as const) {
  test(`UTKAST-${id}: correct a retained ${kind === 'missing-endpoint' ? 'new' : 'edited'} relationship after another member removes its endpoint`, async ({
    page,
    browser,
  }) => {
    const other = await createPreparedContext(browser);
    const app = await prepareRelationshipSpecialConflict(page.request, other.request, kind);
    try {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(app.installation.origin);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      await expect(conflict).toContainText(
        'Hela utkastet kan sparas först när du har rättat ändpunkterna eller kastat förslaget.',
      );
      await expect(
        conflict.getByRole('region', { name: 'Ditt förslag', exact: true }),
      ).toContainText('Osäkert uppgivet');
      await page.keyboard.press('Escape');
      const draft = await openDraftReview(page);
      await expect(draft).toContainText('Blockerat samband: ett objekt saknas.');
      await expect(draft).toContainText('Oberoende förslag');
      await closeTextView(page);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      const correct = conflict.getByRole('button', { name: 'Rätta ändpunkter', exact: true });
      await correct.focus();
      await page.keyboard.press('Enter');
      const editor = page.getByRole('dialog', { name: 'Rätta blockerat samband', exact: true });
      await expect(
        editor.getByRole('heading', { name: 'Rätta blockerat samband', exact: true }),
      ).toBeFocused();
      await expect(
        propertyRow(editor, 'Uppgiftens säkerhet').getByLabel('Värde', { exact: true }),
      ).toHaveValue('Osäkert uppgivet');
      await editor.getByLabel('Till objekt', { exact: true }).selectOption('lo');
      await expect(editor).not.toContainText('Molnmusik ·');
      expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await editor.getByRole('button', { name: 'Lägg i utkastet', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(
        editor.getByRole('status').filter({ hasText: 'Sambandet lades i ditt utkast' }),
      ).toBeVisible();
      await editor.getByRole('button', { name: 'Stäng dialogen', exact: true }).click();
      await page.keyboard.press('Escape');
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      await openTable(page);
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      await expect(
        table.getByRole('button', { name: 'Oberoende förslag', exact: true }),
      ).toBeVisible();
      await expect(table.getByRole('button', { name: 'Molnmusik', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Samband för Lo Exempel', exact: true }).click();
      const relationships = page.getByRole('dialog', {
        name: 'Samband för Lo Exempel',
        exact: true,
      });
      await expect(relationships).toContainText('Osäkert uppgivet');
      await expect(relationships).toContainText('Lo Exempel');
    } finally {
      await other.close();
      await app.installation.close();
    }
  });
}
