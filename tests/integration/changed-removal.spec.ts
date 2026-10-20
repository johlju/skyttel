import { closeTextView, openDraftReview, openTable } from '../support/client.js';
import {
  prepareOwnRemovalConflict,
  saveReviewedConflictDraft,
} from '../support/conflict-special.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('UTKAST-155: withdraw an object removal after reviewing new consequences and keep the saved connection', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareOwnRemovalConflict(page.request, other.request, 'connections');
  try {
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(
      dialog.getByRole('heading', { name: 'Granska konflikter', exact: true }),
    ).toBeFocused();
    await dialog
      .getByRole('button', { name: 'Objekt: Ditt förslag – Föreslagen borttagning', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await dialog
      .getByRole('button', {
        name: 'Samband: Ditt förslag – Föreslagen borttagning av sambandet',
        exact: true,
      })
      .focus();
    await page.keyboard.press('Space');
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
    await page.keyboard.press('Escape');
    const draft = await openDraftReview(page);
    await expect(draft).toContainText('Följer objektborttagning: Lo Exempel.');
    await draft.locator('#draft-remove-object-lo').focus();
    await page.keyboard.press('Enter');
    const discard = page.getByRole('dialog', {
      name: 'Ta bort förslaget och dess beroenden?',
      exact: true,
    });
    await expect(discard.getByRole('listitem')).toHaveText([
      'Lo Exempel · Objekt',
      'Lo Exempel → Använder → Molnmusik · Samband',
    ]);
    await expect(discard.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(discard.getByRole('button', { name: 'Ta bort', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(discard).toHaveCount(0);
    await expect(draft).not.toContainText('Följer objektborttagning:');
    await expect(draft.locator('#draft-read-relationship-new-edge')).toHaveCount(0);
    await expect(
      draft.getByRole('button', { name: 'Visa förslaget: Oberoende förslag', exact: true }),
    ).toBeVisible();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await openTable(page);
    await expect(
      page.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ta bort Oberoende förslag', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Samband för Lo Exempel', exact: true }).click();
    await expect(
      page.getByRole('dialog', { name: 'Samband för Lo Exempel', exact: true }),
    ).toContainText('Molnmusik');
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-156: a second new deletion consequence rejects the reviewed save until another review and save', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await prepareOwnRemovalConflict(page.request, other.request, 'connections');
  try {
    await page.goto(app.installation.origin);
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    async function review(refresh = false) {
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      if (refresh)
        await dialog.getByRole('button', { name: 'Visa aktuell jämförelse', exact: true }).click();
      await dialog
        .getByRole('button', { name: 'Objekt: Ditt förslag – Föreslagen borttagning', exact: true })
        .click();
      await dialog
        .getByRole('button', {
          name: 'Samband: Ditt förslag – Föreslagen borttagning av sambandet',
          exact: true,
        })
        .click();
      await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
      await page.keyboard.press('Escape');
    }
    await review();
    const draft = await openDraftReview(page);
    await page.route('**/map/save', async (route) => {
      const state = await app.read();
      await app.propose(other.request, 'relationship', 'later-incoming', {
        typeId: state.relationshipTypes[0].id,
        sourceId: 'service',
        targetId: 'lo',
      });
      expect((await app.save(other.request, 'later-consequence')).status()).toBe(200);
      await route.fulfill({ response: await route.fetch() });
    });
    await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    const save = page.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(save).toContainText('Utkastet kunde inte sparas.');
    await expect(save).toContainText('Inget sparades av detta försök.');
    await page.keyboard.press('Escape');
    await page.unroute('**/map/save');
    await closeTextView(page);
    await page
      .getByRole('region', { name: 'Kartans status', exact: true })
      .getByRole('button', { name: 'Hämta aktuellt underlag', exact: true })
      .click();
    await review(true);
    const currentDraft = await openDraftReview(page);
    await expect(currentDraft.locator('#draft-read-relationship-new-edge')).toBeVisible();
    await expect(currentDraft.locator('#draft-read-relationship-later-incoming')).toBeVisible();
    await expect(
      currentDraft.getByRole('button', { name: 'Visa förslaget: Oberoende förslag', exact: true }),
    ).toBeVisible();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await openTable(page);
    await expect(page.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: 'Ta bort Oberoende förslag', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Samband för Molnmusik', exact: true }).click();
    const relationships = page.getByRole('dialog', { name: 'Samband för Molnmusik', exact: true });
    await expect(relationships).toContainText('Inga samband');
  } finally {
    await other.close();
    await app.installation.close();
  }
});
