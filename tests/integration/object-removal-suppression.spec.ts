import { closeTextView, openDraftReview, openTable } from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { collaborators } from '../support/draft-conflict-http.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('UTKAST-154: undo object removals restores retained relationship proposals while preserving a separate deletion', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await collaborators(page.request, other.request);
  try {
    const initial = await app.read();
    const value = { typeId: initial.relationshipTypes[0].id, sourceId: 'lo', targetId: 'service' };
    await app.propose(page.request, 'relationship', 'edited', value);
    await app.propose(page.request, 'relationship', 'explicit', {
      ...value,
      sourceId: 'service',
      targetId: 'service',
    });
    expect((await app.save(page.request, 'edges')).status()).toBe(200);
    await app.propose(page.request, 'relationship', 'edited', {
      ...value,
      properties: [
        { id: 'last', label: 'Samma', kind: 'boolean', value: false },
        { id: 'first', label: 'Samma', kind: 'number', value: 0 },
      ],
    });
    await app.propose(page.request, 'relationship', 'new', {
      ...value,
      sourceId: 'service',
      targetId: 'lo',
      properties: [
        { id: 'new-note', label: 'Anteckning', kind: 'text', value: 'Bevarat nytt samband' },
      ],
    });
    await app.propose(page.request, 'relationship', 'self', { ...value, targetId: 'lo' });
    await app.propose(page.request, 'relationship', 'explicit', null);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(app.installation.origin);
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true }).click();
    await table.getByRole('button', { name: 'Ta bort Molnmusik', exact: true }).click();
    const draft = await openDraftReview(page);
    await expect(draft).toContainText('Följer objektborttagning: Lo Exempel, Molnmusik.');
    await draft.locator('#draft-read-relationship-new').focus();
    await page.keyboard.press('Enter');
    const reader = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: /Molnmusik → .* → Lo Exempel/, exact: true }),
    });
    await expect(
      reader.getByRole('heading', { name: 'Bevarat sambandsförslag', exact: true }),
    ).toBeVisible();
    await expect(reader).toContainText('Bevarat nytt samband');
    await expect(reader.getByRole('heading').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(draft.locator('#draft-read-relationship-new')).toBeFocused();
    await draft.locator('#draft-remove-object-lo').focus();
    await page.keyboard.press('Enter');
    await expect(draft).toContainText('Följer objektborttagning: Molnmusik.');
    const selfRow = draft.locator('#draft-read-relationship-self').locator('xpath=ancestor::tr');
    await expect(selfRow).toContainText('Läggs till');
    await expect(selfRow).not.toContainText('Följer objektborttagning:');
    for (const id of ['edited', 'new']) {
      await expect(
        draft.locator(`#draft-read-relationship-${id}`).locator('xpath=ancestor::tr'),
      ).toContainText('Följer objektborttagning: Molnmusik.');
    }
    await draft.locator('#draft-remove-object-service').focus();
    await page.keyboard.press('Enter');
    await expect(draft).not.toContainText('Följer objektborttagning:');
    await draft.locator('#draft-read-relationship-edited').click();
    const edited = page.getByRole('dialog').filter({
      has: page.getByRole('heading', { name: /Lo Exempel → .* → Molnmusik/, exact: true }),
    });
    await expect(
      edited
        .locator('.draft-values > section')
        .last()
        .locator('dd')
        .filter({ hasText: /^(Nej \(Ja\/nej\)|0 \(Tal\))$/ }),
    ).toHaveText(['Nej (Ja/nej)', '0 (Tal)']);
    await page.keyboard.press('Escape');
    const explicitRow = draft
      .locator('#draft-read-relationship-explicit')
      .locator('xpath=ancestor::tr');
    await expect(explicitRow).toContainText('Tas bort');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await openTable(page);
    await expect(
      table.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true }),
    ).toBeVisible();
    await expect(
      table.getByRole('button', { name: 'Ta bort Molnmusik', exact: true }),
    ).toBeVisible();
  } finally {
    await other.close();
    await app.installation.close();
  }
});
