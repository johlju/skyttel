import { closeTextView, openDraftReview, openTable } from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { collaborators } from '../support/draft-conflict-http.js';
import { downloadHouseholdExport } from '../support/household-export-download.js';
import { createPreparedContext, expect, test } from '../support/test.js';

for (const [id, variant, width] of [
  ['27', 'suppressed', 320],
  ['28', 'blocked', 1280],
] as const) {
  test(`IMPORT-${id}: restore ${variant} relationship work and continue through ordinary controls`, async ({
    page,
    browser,
  }) => {
    const other = await createPreparedContext(browser);
    const app = await collaborators(page.request, other.request);
    const householdPath = app.path.slice(0, -4);
    try {
      const initial = await app.read();
      const value = {
        typeId: initial.relationshipTypes[0].id,
        sourceId: 'lo',
        targetId: 'service',
        properties: [
          { id: 'empty', label: 'Samma' },
          { id: 'date', label: 'Samma', kind: 'date' as const },
          { id: 'zero', label: 'Samma', kind: 'number' as const, value: 0 },
          { id: 'false', label: 'Samma', kind: 'boolean' as const, value: false },
        ],
      };
      await app.propose(page.request, 'relationship', 'retained', value);
      expect((await app.save(page.request, 'original-relationship')).status()).toBe(200);
      await app.propose(page.request, 'relationship', 'retained', {
        ...value,
        properties: [...value.properties].reverse(),
      });
      if (variant === 'suppressed') await app.propose(page.request, 'draft', 'lo', null);
      else {
        await app.propose(other.request, 'draft', 'service', null);
        expect((await app.save(other.request, 'removed-endpoint')).status()).toBe(200);
      }
      await page.setViewportSize({ width, height: 900 });
      await page.goto(app.installation.origin);
      const archive = await downloadHouseholdExport(page, householdPath);
      await page.goto(`${householdPath.replace('/api/', '/')}/settings/import`);
      await page
        .getByLabel('Skyttel-export (ZIP)')
        .setInputFiles({ name: 'skyttel.zip', mimeType: 'application/zip', buffer: archive });
      await page.getByRole('button', { name: 'Kontrollera importfil', exact: true }).click();
      const confirmation = page.getByRole('checkbox', {
        name: 'Jag vill ersätta allt hushållsinnehåll med den kontrollerade filen.',
        exact: true,
      });
      await expect(confirmation).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Ersätt hushållets innehåll', exact: true }),
      ).toBeDisabled();
      await confirmation.check();
      await page.getByRole('button', { name: 'Ersätt hushållets innehåll', exact: true }).click();
      await expect(page.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
      await app.installation.restart();
      await page.goto(app.installation.origin);
      const draft = await openDraftReview(page);
      if (variant === 'suppressed') {
        await expect(draft).toContainText('Följer objektborttagning: Lo Exempel.');
        await draft.locator('#draft-read-relationship-retained').click();
        const retained = page.getByRole('dialog').filter({
          has: page.getByRole('heading', { name: /Lo Exempel → .* → Molnmusik/, exact: true }),
        });
        await expect(
          retained.getByRole('heading', { name: 'Bevarat sambandsförslag', exact: true }),
        ).toBeVisible();
        await expect(retained).toContainText('Nej (Ja/nej)');
        await expect(retained).toContainText('0 (Tal)');
        await expect(retained).toContainText('Tomt (Datum)');
        await page.keyboard.press('Escape');
        await draft.locator('#draft-remove-object-lo').focus();
        await page.keyboard.press('Enter');
        await expect(draft).not.toContainText('Följer objektborttagning:');
      } else {
        await expect(draft).toContainText('Blockerat samband: ett objekt saknas.');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
        const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
        await conflict.getByRole('button', { name: 'Rätta ändpunkter', exact: true }).click();
        const editor = page.getByRole('dialog', { name: 'Rätta blockerat samband', exact: true });
        await editor.getByLabel('Till objekt', { exact: true }).selectOption('lo');
        await editor.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
        await expect(
          editor.getByRole('status').filter({ hasText: 'Sambandet lades i ditt utkast' }),
        ).toBeVisible();
        await editor.getByRole('button', { name: 'Stäng dialogen', exact: true }).click();
        await page.keyboard.press('Escape');
      }
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      await openTable(page);
      if (variant === 'blocked')
        await expect(page.getByRole('button', { name: 'Molnmusik', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Samband för Lo Exempel', exact: true }).click();
      const relationships = page.getByRole('dialog', {
        name: 'Samband för Lo Exempel',
        exact: true,
      });
      await expect(
        relationships.locator('dd').filter({
          hasText: /^(Nej \(Ja\/nej\)|0 \(Tal\)|Tomt \(Datum\)|Tomt \(ingen datatyp\))$/,
        }),
      ).toHaveText(['Nej (Ja/nej)', '0 (Tal)', 'Tomt (Datum)', 'Tomt (ingen datatyp)']);
      expect(
        await relationships.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
    } finally {
      await other.close();
      await app.installation.close();
    }
  });
}
