import type { MapState } from '../../src/shared/map.js';
import { closeTextView, createHousehold, openNewObject, signIn } from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editTableObject, readTableObject } from '../support/domain-work.js';
import {
  addFreeProperty,
  freeProperty,
  openFreeProperties,
} from '../support/free-property-forms.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

for (const [caseId, width, height] of [
  ['TYP-10', 1280, 900],
  ['TYP-15', 390, 900],
  ['TYP-16', 320, 900],
  ['TYP-17', 640, 456],
] as const) {
  test(`${caseId}: free properties and validation remain reachable at ${width}x${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const installation = await createInstallation();
    try {
      await signIn(page.request, installation.origin);
      await createHousehold(page.request, installation.origin);
      await page.goto(installation.origin);
      await openNewObject(page);
      const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      const errors = form.getByRole('alert', { name: 'Formuläret innehåller fel' });
      await expect(errors).toBeFocused();
      await errors.getByRole('link', { name: /Namn/ }).click();
      await expect(form.getByLabel('Namn', { exact: true })).toBeFocused();
      await form.getByLabel('Namn', { exact: true }).fill('Husets lån');
      await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Låneavtal' });
      await openFreeProperties(form);
      await addFreeProperty(form, 'Beskrivning', 'text', 'Gemensam avtalstext');
      await addFreeProperty(form, 'Skuld', 'number', '12300');
      await addFreeProperty(form, 'Uppgiftsdatum', 'date', '2026-09-01');
      await addFreeProperty(form, 'Osäkert uppgivet', 'boolean', 'true');
      const day = freeProperty(form, 'Uppgiftsdatum');
      await day.getByLabel('Värde', { exact: true }).fill('2026-02-30');
      await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(errors).toBeFocused();
      await errors.getByRole('link', { name: /Värde/ }).click();
      await expect(day.getByLabel('Värde', { exact: true })).toBeFocused();
      await day.getByLabel('Värde', { exact: true }).fill('2026-09-01');
      const stage = form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true });
      await stage.focus();
      await expect(stage).toBeFocused();
      expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.keyboard.press('Enter');
      await expect(form).not.toBeVisible();
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      await installation.restart();
      await page.reload();
      const details = await readTableObject(page, 'Husets lån');
      for (const value of ['Gemensam avtalstext', '12300', '2026-09-01', 'Ja'])
        await expect(details).toContainText(value);
      const edit = await editTableObject(page, 'Husets lån');
      await edit.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Avtal' });
      await openFreeProperties(edit);
      await expect(freeProperty(edit, 'Skuld').getByLabel('Värde', { exact: true })).toHaveValue(
        '12300',
      );
    } finally {
      await installation.close();
    }
  });
}

test('TYP-12: keyboard property order preserves zero and false in forms and table readers', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openNewObject(page);
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Ordningsprov');
    await openFreeProperties(form);
    await addFreeProperty(form, 'Första uppgiften', 'number', '0');
    const second = await addFreeProperty(form, 'Andra uppgiften', 'boolean', 'false');
    await second.getByRole('button', { name: 'Flytta upp', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(second.getByLabel('Etikett', { exact: true })).toBeFocused();
    await expect(form.getByRole('status', { name: 'Egenskapernas ordning' })).toContainText(
      'position 1 av 2',
    );
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    const details = await readTableObject(page, 'Ordningsprov');
    await expect(details).toContainText('Nej');
    await expect(details).toContainText('0');
    const state: MapState = await (await page.request.get(path)).json();
    expect(
      state.objects[0].properties?.map((property) => [
        property.label,
        'value' in property ? property.value : undefined,
      ]),
    ).toEqual([
      ['Andra uppgiften', false],
      ['Första uppgiften', 0],
    ]);
    const edit = await editTableObject(page, 'Ordningsprov');
    await openFreeProperties(edit);
    await expect(
      edit
        .getByRole('group', { name: 'Egenskap 1', exact: true })
        .getByLabel('Etikett', { exact: true }),
    ).toHaveValue('Andra uppgiften');
  } finally {
    await installation.close();
  }
});
