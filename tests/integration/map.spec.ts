import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openNewObject,
  openTable,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editTableObject, readDraftProposal } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test('KARTA-23: refreshing after a conflict preserves text without authorizing a stale form', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const second = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    await signIn(second.request, installation.origin);
    const tab = await second.newPage();
    await tab.goto(installation.origin);
    await openTable(tab);
    for (const editor of [page, tab]) {
      await editTableObject(editor, 'Lo Exempel');
    }
    await page.getByLabel('Namn', { exact: true }).fill('Lo gammalt förslag');
    await tab.getByLabel('Namn', { exact: true }).fill('Lo nytt förslag');
    await tab.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    const form = page.locator('dialog.object-dialog-C');
    await expect(form.getByRole('alert')).toContainText('Dina uppgifter finns kvar');
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Lo gammalt förslag');
    await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Lo gammalt förslag');
    await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await page.reload();
    await openDraftReview(page);
    await expect(page.getByRole('region', { name: 'Utkastet' })).toContainText('Lo nytt förslag');
    await closeTextView(page);
    await editTableObject(page, 'Lo nytt förslag');
    await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Lo nytt förslag');
    await expect(page.getByRole('button', { name: 'Lägg i utkastet och stäng' })).toBeEnabled();
  } finally {
    await second.close();
    await installation.close();
  }
});

test('KARTA-24: an uncertain save recovers its receipt and stale tabs cannot save newer drafts', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    await signIn(other.request, installation.origin);
    const tab = await other.newPage();
    await tab.goto(installation.origin);
    await openDraftReview(tab);
    await expect(tab.getByRole('region', { name: 'Utkastet' })).toContainText('Lo Exempel');
    await editTableObject(page, 'Lo Exempel');
    await page.getByLabel('Namn', { exact: true }).fill('Lo Lind');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
    await tab.getByRole('button', { name: 'Spara hela utkastet' }).click();
    const save = tab.getByRole('dialog', { name: 'Spara utkastet', exact: true });
    await expect(save).toContainText('Inget sparades');
    await expect(tab.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await tab.keyboard.press('Escape');
    await tab.getByRole('button', { name: 'Hämta aktuellt underlag' }).click();
    await expect(tab.getByRole('region', { name: 'Utkastet' })).toContainText('Lo Lind');
    await tab.route('**/map/save', async (route) => {
      expect((await route.fetch()).status()).toBe(200);
      await route.abort();
    });
    await tab.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(save).toContainText('Sparandet kunde inte bekräftas');
    await tab.unroute('**/map/save');
    await save.getByRole('button', { name: 'Kontrollera sparandet igen' }).click();
    await expect(save).toBeHidden();
    await expect(tab.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
      'Utkastet är sparat',
    );
    await expect(tab.getByRole('region', { name: 'Utkastet' })).toContainText('Utkastet är tomt');
  } finally {
    await other.close();
    await installation.close();
  }
});

test('KARTA-06: objects move from a persistent private proposal to the shared map after review', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
    await page.getByLabel('Beskrivning', { exact: true }).fill('En påhittad person');
    const loType = await page
      .getByLabel('Objekttyp', { exact: true })
      .locator('option:checked')
      .innerText();
    await page.setViewportSize({ width: 320, height: 568 });
    await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Lo Exempel');
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue('En påhittad person');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng' }).focus();
    await page.keyboard.press('Enter');
    await openDraftReview(page);
    await expect(page.getByRole('region', { name: 'Utkastet' })).toContainText('Lo Exempel');
    await page.reload();
    await expect(await readDraftProposal(page, 'Lo Exempel')).toContainText('En påhittad person');
    await page.keyboard.press('Escape');
    await installation.restart();
    const second = await createPreparedContext(browser);
    try {
      await signIn(second.request, installation.origin);
      const reopened = await second.newPage();
      await reopened.goto(installation.origin);
      await openDraftReview(reopened);
      await expect(reopened.getByRole('region', { name: 'Utkastet' })).toContainText('Lo Exempel');
      const restored = await readDraftProposal(reopened, 'Lo Exempel');
      await expect(restored.locator('dt').filter({ hasText: /^Typ$/ }).locator('..')).toContainText(
        loType,
      );
      await expect(
        restored
          .locator('dt')
          .filter({ hasText: /^Beskrivning$/ })
          .locator('..'),
      ).toContainText('En påhittad person');
      await expect(
        restored
          .locator('dt')
          .filter({ hasText: /^Identitet$/ })
          .locator('..'),
      ).toContainText('Identifierat objekt');
      await reopened.keyboard.press('Escape');
      await saveReviewedConflictDraft(reopened);
      await expect(reopened.getByRole('region', { name: 'Utkastet' })).toContainText(
        'Utkastet är tomt',
      );
      await closeTextView(reopened);
      await openTable(reopened);
      await reopened.getByLabel('Sök objekt i tabellen', { exact: true }).fill('Lo');
      await editTableObject(reopened, 'Lo Exempel');
      await reopened.getByLabel('Namn', { exact: true }).fill('Lo Lind');
      await reopened.getByRole('button', { name: 'Lägg i utkastet och stäng' }).click();
      const proposal = await readDraftProposal(reopened, 'Lo Lind');
      await expect(proposal).toContainText('Lo Exempel');
      await expect(proposal).toContainText('Lo Lind');
      for (const [title, name] of [
        ['Sparade värden', 'Lo Exempel'],
        ['Föreslagna värden', 'Lo Lind'],
      ]) {
        const values = proposal.locator('section').filter({
          has: reopened.getByRole('heading', { name: title, exact: true }),
        });
        for (const [label, value] of [
          ['Namn', name],
          ['Typ', loType],
          ['Beskrivning', 'En påhittad person'],
          ['Identitet', 'Identifierat objekt'],
        ]) {
          await expect(
            values
              .locator('dt')
              .filter({ hasText: new RegExp(`^${label}(?: · ändrat)?$`) })
              .locator('..'),
          ).toContainText(value);
        }
      }
      await reopened.keyboard.press('Escape');
      const review = reopened.getByRole('region', { name: 'Utkastet' });
      await expect(review).toContainText('Lo Exempel');
      await expect(review).toContainText('Lo Lind');
      await reopened.getByRole('button', { name: 'Kasta hela utkastet' }).click();
      await reopened
        .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
        .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
        .click();
      await closeTextView(reopened);
      await editTableObject(reopened, 'Lo Exempel');
      await reopened
        .locator('dialog.object-dialog-C')
        .getByRole('button', { name: 'Avbryt', exact: true })
        .click();
      await openTable(reopened);
      const table = reopened.getByRole('region', { name: 'Hushållets tabell', exact: true });
      await table.getByRole('button', { name: 'Lo Exempel', exact: true }).click();
      await table.getByRole('button', { name: 'Ta bort Lo Exempel', exact: true }).click();
      await openDraftReview(reopened);
      await expect(review).toContainText('Tas bort');
      await saveReviewedConflictDraft(reopened);
      await closeTextView(reopened);
      await openTable(reopened);
      await expect(table.getByRole('button', { name: 'Lo Exempel', exact: true })).toHaveCount(0);
    } finally {
      await second.close();
    }
  } finally {
    await installation.close();
  }
});
