import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openNewObject,
  openSettings,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { closeTableObject, editTableObject, readTableObject } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

for (const { width, height } of [
  { width: 1280, height: 900 },
  { width: 390, height: 900 },
  { width: 320, height: 900 },
  { width: 640, height: 456 },
]) {
  const caseId = { 1280: 'TYP-10', 390: 'TYP-15', 320: 'TYP-16', 640: 'TYP-17' }[width];
  test(`${caseId}: canonical properties retain meaning through sections and native controls at ${width}x${height}`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height });
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      const post = (route: string, data: unknown) =>
        page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
      await post('object-type', {
        version: 0,
        id: 'other',
        baseRevision: null,
        value: {
          name: 'Annan typ',
          description: '',
          fields: [],
          sections: [],
          builtins: [],
          propertyOrder: [],
        },
      });
      await post('save', { version: 1, operationId: 'target' });
      await page.goto(installation.origin);
      const settings = async () => {
        await openSettings(page);
        const nav = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
        if (width <= 800) await nav.getByText('Välj inställning', { exact: true }).click();
        await nav.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
      };
      const returnToWork = async () => {
        await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
        await openTable(page);
      };
      const save = async (): Promise<SaveReceipt> => {
        const response = page.waitForResponse(
          (response) => response.url() === `${path}/save` && response.request().method() === 'POST',
        );
        await saveReviewedConflictDraft(page);
        const result = await response;
        expect(result.status()).toBe(200);
        const { receipt } = await result.json();
        await closeTextView(page);
        return receipt;
      };
      await settings();
      await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
      await page.getByLabel('Typens namn').fill('Husavtal');
      await page.getByLabel('Avsnitt 1', { exact: true }).fill('Avtalet');
      await page.getByLabel('Lägg till gemensam egenskap').selectOption('description');
      await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
      const note = page.getByRole('group', { name: 'Eget fält 2', exact: true });
      await note.getByLabel('Fältets namn').fill('Anteckning');
      await page.getByLabel('Lägg till gemensam egenskap').selectOption('debt');
      const debt = page.getByRole('group', {
        name: 'Gemensam egenskap: Senast uppgiven skuld',
        exact: true,
      });
      await expect(debt.getByLabel('Fältets namn')).toBeFocused();
      await debt.getByLabel('Fältets namn').fill('Skuld');
      await page.getByRole('button', { name: 'Flytta fältet Skuld upp', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(debt.getByLabel('Fältets namn')).toBeFocused();
      await page.getByRole('button', { name: 'Dölj Skuld, behåll värden', exact: true }).click();
      await expect(debt.getByLabel('Visa i avsnitt')).toBeFocused();
      await debt.getByLabel('Visa i avsnitt').selectOption({ label: 'Avtalet' });
      await page.getByLabel('Lägg till gemensam egenskap').selectOption('startDate');
      await page.getByRole('button', { name: 'Lägg till avsnitt', exact: true }).click();
      await page.getByLabel('Avsnitt 2', { exact: true }).fill('Datum');
      await page
        .getByRole('group', { name: 'Gemensam egenskap: Startdatum', exact: true })
        .getByLabel('Visa i avsnitt')
        .selectOption({ label: 'Datum' });
      for (const theme of ['light', 'dark']) {
        await page.getByRole('button', { name: /^Tema:/ }).click();
        await page
          .getByRole('radio', { name: theme === 'light' ? 'Ljust' : 'Mörkt', exact: true })
          .click();
        await page.keyboard.press('Escape');
        await page.screenshot({
          path: test.info().outputPath(`builtins-${width}-${theme}.png`),
          fullPage: true,
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
      await returnToWork();
      await openNewObject(page);
      const form = page.getByRole('dialog', { name: /^(Nytt objekt|Redigera Husets lån)$/ });
      await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Husavtal' });
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(form.getByRole('alert', { name: 'Formuläret innehåller fel' })).toBeFocused();
      await form.getByRole('link', { name: /^Namn:/ }).click();
      await expect(form.getByLabel('Namn', { exact: true })).toBeFocused();
      await form.getByLabel('Namn', { exact: true }).fill('Husets lån');
      await form.getByRole('button', { name: 'Avtalet', exact: true }).click();
      const section = form;
      await section.getByLabel('Beskrivning', { exact: true }).fill('Gemensam avtalstext');
      await section.getByLabel('Anteckning', { exact: true }).fill('Eget värde');
      await section.getByLabel('Skuld: uppgiftens säkerhet').selectOption('uncertain');
      await section.getByLabel('Skuld', { exact: true }).fill('12 300');
      await section.getByLabel('Skuld: datum för uppgiften').fill('2026-09-01');
      await form.getByRole('button', { name: 'Datum', exact: true }).click();
      await form.getByLabel('Startdatum: uppgiftens säkerhet').selectOption('known');
      await form.getByLabel('Startdatum', { exact: true }).fill('2026-08-01');
      const common = form.getByRole('button', { name: 'Ekonomiska uppgifter', exact: true });
      await common.click();
      await form.getByLabel('Pris: uppgiftens säkerhet').selectOption('unknown');
      await form.getByLabel('Valuta: uppgiftens säkerhet').selectOption('none');
      await form.getByLabel('Beviljat kreditutrymme: uppgiftens säkerhet').selectOption('known');
      await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(form.getByRole('alert', { name: 'Formuläret innehåller fel' })).toBeFocused();
      await form.getByRole('link', { name: /^Beviljat kreditutrymme:/ }).click();
      await expect(form.getByLabel('Beviljat kreditutrymme', { exact: true })).toBeFocused();
      await expect(form.getByLabel('Beviljat kreditutrymme', { exact: true })).toBeVisible();
      await form.getByLabel('Beviljat kreditutrymme: uppgiftens säkerhet').selectOption('');
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      const proposed = await read();
      expect(proposed.objects).toEqual([]);
      const original = proposed.draft.changes[0].after;
      expect(original?.financialFacts).toEqual({
        debt: { knowledge: 'uncertain', value: '12 300', reportedOn: '2026-09-01' },
        startDate: { knowledge: 'known', value: '2026-08-01' },
        price: { knowledge: 'unknown' },
        currency: { knowledge: 'none' },
      });
      if (width !== 1280) return;
      const receipt = await save();
      expect(receipt.objectTypes).toHaveLength(1);
      expect(receipt.changes[0].after?.financialFacts).toEqual(original?.financialFacts);
      await installation.restart();
      await page.reload();
      await settings();
      await page.getByText('Objekttyper och egna fält', { exact: true }).click();
      await page.getByRole('button', { name: 'Ändra typ: Husavtal', exact: true }).click();
      await page.getByRole('button', { name: 'Dölj Skuld, behåll värden', exact: true }).click();
      await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
      await returnToWork();
      const details = await readTableObject(page, 'Husets lån');
      const debtRead = details
        .locator('dt')
        .filter({ hasText: /^Skuld$/ })
        .locator('..');
      await expect(debtRead).toContainText(
        '12 300 (Osäkert uppgivet) · datum för uppgiften: 2026-09-01',
      );
      await closeTableObject(page, 'Husets lån');
      await save();
      await editTableObject(page, 'Husets lån');
      await form.getByLabel('Objekttyp', { exact: true }).selectOption('other');
      await page
        .getByRole('dialog', { name: 'Ta bort tidigare egna fält?', exact: true })
        .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
        .click();
      await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Gemensam avtalstext',
      );
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      const changed = await save();
      expect(changed.changes[0].after?.financialFacts).toEqual(original?.financialFacts);
      expect(changed.changes[0].after?.description).toBe('Gemensam avtalstext');
      await (await utilityButton(page, 'Rapporter')).click();
      const history = page
        .getByRole('region', { name: 'Ändringshistorik' })
        .getByRole('article')
        .filter({ hasText: `Sparande: ${changed.operationId}` });
      await history.getByText('Visa ändringarna', { exact: true }).click();
      await expect(history).toContainText(
        'Senast uppgiven skuld: 12 300 (Osäkert uppgivet) — datum för uppgiften: 2026-09-01',
      );
      await expect(history).toContainText('Anteckning: Eget värde');
      await expect(
        history
          .getByText(
            'Senast uppgiven skuld: 12 300 (Osäkert uppgivet) — datum för uppgiften: 2026-09-01',
            { exact: true },
          )
          .first(),
      ).toBeVisible();
      await expect(history.getByText('Anteckning: Eget värde', { exact: true })).toBeVisible();
      await installation.restart();
      expect((await read()).objects[0]).toMatchObject({ ...changed.changes[0].after });
    } finally {
      await installation.close();
    }
  });
}

test('TYP-12: explicit field order preserves zero and false through the native form, draft and table readers', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const initial: MapState = await (await page.request.get(path)).json();
    const headers = { origin: installation.origin };
    const definition = {
      name: 'Sorterad typ',
      description: '',
      fields: [
        { id: 'first', name: 'Första fältet', description: '', kind: 'number' },
        { id: 'second', name: 'Andra fältet', description: '', kind: 'boolean' },
      ],
      propertyOrder: ['field:second', 'field:first'],
    };
    expect(
      (
        await page.request.post(`${path}/object-type`, {
          headers,
          data: {
            version: initial.draft.version,
            contentVersion: initial.contentVersion,
            id: 'ordered-read-type',
            baseRevision: null,
            value: definition,
          },
        })
      ).status(),
    ).toBe(200);
    const staged: MapState = await (await page.request.get(path)).json();
    expect(
      (
        await page.request.post(`${path}/save`, {
          headers,
          data: {
            version: staged.draft.version,
            contentVersion: staged.contentVersion,
            operationId: 'ordered-read-type-setup',
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto(installation.origin);
    const form = await openNewObject(page);
    await form.getByLabel('Namn', { exact: true }).fill('Ordningsprov');
    await form.getByLabel('Objekttyp', { exact: true }).selectOption('ordered-read-type');
    await form.getByRole('button', { name: 'Egna fält', exact: true }).click();
    const orderedLabels = /^(Andra fältet|Första fältet)$/;
    await expect(form.locator('label').filter({ hasText: orderedLabels })).toHaveText([
      'Andra fältet',
      'Första fältet',
    ]);
    await form.getByLabel('Andra fältet', { exact: true }).selectOption('false');
    await form.getByLabel('Första fältet', { exact: true }).fill('0');
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(form).not.toBeVisible();
    const proposed: MapState = await (await page.request.get(path)).json();
    expect(proposed.objects).toEqual([]);
    expect(proposed.draft.changes[0].after?.customValues).toEqual({ first: 0, second: false });
    const draft = await openDraftReview(page);
    await draft.getByRole('button', { name: 'Visa förslaget: Ordningsprov', exact: true }).click();
    const proposal = page.getByRole('dialog', { name: 'Ordningsprov', exact: true });
    await expect(proposal.locator('dt').filter({ hasText: orderedLabels })).toHaveText([
      'Andra fältet',
      'Första fältet',
    ]);
    await expect(
      proposal.locator('dt').filter({ hasText: 'Andra fältet' }).locator('..'),
    ).toContainText('Nej');
    await expect(
      proposal.locator('dt').filter({ hasText: 'Första fältet' }).locator('..'),
    ).toContainText('0');
    await closeSupportDialog(page, 'Ordningsprov');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    const details = await readTableObject(page, 'Ordningsprov');
    await expect(details.locator('dt').filter({ hasText: orderedLabels })).toHaveText([
      'Andra fältet',
      'Första fältet',
    ]);
    await expect(
      details.locator('dt').filter({ hasText: 'Andra fältet' }).locator('..'),
    ).toContainText('Nej');
    await expect(
      details.locator('dt').filter({ hasText: 'Första fältet' }).locator('..'),
    ).toContainText('0');
    await closeTableObject(page, 'Ordningsprov');
    await readTableObject(page, 'Ordningsprov');
    const tableDetails = page
      .getByRole('region', { name: 'Hushållets tabell', exact: true })
      .locator('.household-table-detail-row');
    await expect(tableDetails.locator('dt').filter({ hasText: orderedLabels })).toHaveText([
      'Andra fältet',
      'Första fältet',
    ]);
    const saved: MapState = await (await page.request.get(path)).json();
    expect(saved.draft.changes).toEqual([]);
    expect(saved.objects[0].customValues).toEqual({ first: 0, second: false });
    const type = saved.types.find(({ id }) => id === 'ordered-read-type');
    expect(type?.fields?.map(({ id }) => id)).toEqual(['first', 'second']);
    expect(type?.propertyOrder).toEqual(['field:second', 'field:first']);
  } finally {
    await installation.close();
  }
});
