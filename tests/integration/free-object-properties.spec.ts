import type { MapState } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openTable,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { readDraftProposal } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

for (const width of [1440, 320]) {
  test(`${width === 1440 ? 'EGENSKAP-01' : 'EGENSKAP-02'}: edit independent properties with keyboard and retain invalid input at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      await page.goto(`${installation.origin}/households/${household.id}`);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
      await dialog.getByLabel('Namn', { exact: true }).fill('Egenskapscykeln');
      await dialog.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
      await dialog.getByRole('button', { name: 'Lägg till egenskap', exact: true }).click();
      let first = dialog.getByRole('group', { name: 'Egenskap 1', exact: true });
      await expect(first.getByLabel('Etikett', { exact: true })).toBeFocused();
      await first.getByLabel('Etikett', { exact: true }).fill('Pris');
      await first.getByLabel('Datatyp', { exact: true }).selectOption('text');
      await first.getByLabel('Värde', { exact: true }).fill('Gratis idag');
      await first.getByLabel('Datatyp', { exact: true }).selectOption('number');
      await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(dialog.getByRole('alert', { name: 'Formuläret innehåller fel' })).toBeFocused();
      expect((await read()).draft.changes).toEqual([]);
      await expect(first.getByLabel('Värde', { exact: true })).toHaveValue('Gratis idag');
      await first.getByLabel('Värde', { exact: true }).fill('0');
      await dialog.getByRole('button', { name: 'Lägg till egenskap', exact: true }).click();
      const second = dialog.getByRole('group', { name: 'Egenskap 2', exact: true });
      await second.getByLabel('Etikett', { exact: true }).fill('Pris');
      await second.getByLabel('Datatyp', { exact: true }).selectOption('boolean');
      await second.getByLabel('Värde', { exact: true }).selectOption('false');
      await second.getByRole('button', { name: 'Flytta upp', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(dialog.getByRole('status', { name: 'Egenskapernas ordning' })).toContainText(
        'position 1',
      );
      first = dialog.getByRole('group', { name: 'Egenskap 1', exact: true });
      await expect(first.getByLabel('Värde', { exact: true })).toHaveValue('false');
      await expect(first.getByLabel('Etikett', { exact: true })).toBeFocused();
      for (const [index, label, kind, value] of [
        [3, 'Beskrivning', 'text', 'Egen anteckning'],
        [4, 'Slutdatum', 'date', '2000-01-01'],
        [5, 'Tomt tal', 'number', ''],
        [6, 'Tomt utan datatyp', '', ''],
      ] as const) {
        await dialog.getByRole('button', { name: 'Lägg till egenskap', exact: true }).click();
        const group = dialog.getByRole('group', { name: `Egenskap ${index}`, exact: true });
        await group.getByLabel('Etikett', { exact: true }).fill(label);
        if (kind) await group.getByLabel('Datatyp', { exact: true }).selectOption(kind);
        if (value) await group.getByLabel('Värde', { exact: true }).fill(value);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: test.info().outputPath(`free-properties-${width}.png`) });
      await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      const staged = (await read()).draft.changes[0];
      expect(staged.after?.properties).toMatchObject([
        { label: 'Pris', kind: 'boolean', value: false },
        { label: 'Pris', kind: 'number', value: 0 },
        { label: 'Beskrivning', kind: 'text', value: 'Egen anteckning' },
        { label: 'Slutdatum', kind: 'date', value: '2000-01-01' },
        { label: 'Tomt tal', kind: 'number' },
        { label: 'Tomt utan datatyp' },
      ]);
      await page.getByRole('button', { name: 'Tabell', exact: true }).click();
      const proposal = await readDraftProposal(page, 'Egenskapscykeln');
      await expect(proposal).toContainText('Nej');
      await expect(proposal).toContainText('0');
      await expect(proposal).toContainText('Egen anteckning');
      await expect(proposal).toContainText('2000-01-01');
      await expect(proposal).toContainText('Tomt (Tal)');
      await expect(proposal).toContainText('Tomt (ingen datatyp)');
      await closeSupportDialog(page, 'Egenskapscykeln');
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      await installation.restart();
      await page.reload();
      await openTable(page);
      await page.getByRole('button', { name: 'Redigera Egenskapscykeln', exact: true }).click();
      const edit = page.getByRole('dialog', { name: 'Redigera Egenskapscykeln', exact: true });
      await edit.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
      const savedFirst = edit.getByRole('group', { name: 'Egenskap 1', exact: true });
      await expect(savedFirst.getByLabel('Värde', { exact: true })).toHaveValue('false');
      await savedFirst.getByLabel('Datatyp', { exact: true }).selectOption('number');
      await edit.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      expect((await read()).draft.changes).toEqual([]);
      await page.keyboard.press('Escape');
      const leave = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
      await expect(leave).toBeVisible();
      await leave.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
      await expect(savedFirst.getByLabel('Värde', { exact: true })).toHaveValue('false');
      await savedFirst.getByLabel('Datatyp', { exact: true }).selectOption('boolean');
      await savedFirst.getByRole('button', { name: 'Töm värdet', exact: true }).click();
      await expect(savedFirst.getByLabel('Datatyp', { exact: true })).toHaveValue('boolean');
      await expect(savedFirst.getByLabel('Värde', { exact: true })).toHaveValue('');
      await edit
        .getByRole('group', { name: 'Egenskap 2', exact: true })
        .getByRole('button', { name: 'Ta bort egenskapen', exact: true })
        .click();
      await edit.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
      const state = await read();
      const nextType = state.types.find((type) => type.id !== staged.after?.typeId);
      if (!nextType) throw new Error('Missing second object type');
      await edit.getByLabel('Objekttyp', { exact: true }).selectOption(nextType.id);
      await edit.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(edit).not.toBeVisible();
      const changed = (await read()).draft.changes[0];
      expect(changed.after?.properties).toEqual([
        { id: staged.after?.properties?.[0].id, label: 'Pris', kind: 'boolean' },
        ...(staged.after?.properties?.slice(2) ?? []),
      ]);
      expect(changed.id).toBe(staged.id);
      expect((await read()).objects[0].properties).toEqual(staged.after?.properties);
      await page.getByRole('button', { name: 'Redigera Egenskapscykeln', exact: true }).click();
      await expect(edit.getByLabel('Objekttyp', { exact: true })).toHaveValue(nextType.id);
      await edit.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
      await expect(savedFirst.getByLabel('Etikett', { exact: true })).toHaveValue('Pris');
      await expect(savedFirst.getByLabel('Datatyp', { exact: true })).toHaveValue('boolean');
      await expect(savedFirst.getByLabel('Värde', { exact: true })).toHaveValue('');
      await expect(edit.getByRole('group', { name: 'Egenskap 6', exact: true })).toHaveCount(0);
      const remainingSecond = edit.getByRole('group', { name: 'Egenskap 2', exact: true });
      await expect(remainingSecond.getByLabel('Etikett', { exact: true })).toHaveValue(
        'Beskrivning',
      );
      await expect(remainingSecond.getByLabel('Värde', { exact: true })).toHaveValue(
        'Egen anteckning',
      );
    } finally {
      await installation.close();
    }
  });
}
