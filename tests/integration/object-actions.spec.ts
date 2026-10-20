import { openDraftReview, openTable } from '../support/client.js';
import { prepareHouseholdReading } from '../support/household-reading.js';
import { createInstallation } from '../support/installation.js';
import { openProperties, propertyRow } from '../support/property-controls.js';
import { expect, test } from '../support/test.js';

test('LISTA-07: text object actions preserve cancellation and stage only the chosen removal without map graphics', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const app = await prepareHouseholdReading(page.request, installation.origin, false);
    const initial = await app.read();
    await app.post('draft', {
      id: 'independent',
      baseRevision: null,
      value: {
        typeId: initial.types[0].id,
        name: 'Behåll mig',
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Mitt oberoende förslag',
          },
        ],
      },
    });
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: function (kind: string, ...args: unknown[]) {
          return kind.startsWith('webgl') ? null : Reflect.apply(original, this, [kind, ...args]);
        },
      });
    });
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(installation.origin);
    await expect(
      page.getByText('Rymdkartan kan inte visas. Använd Tabell för att fortsätta.', {
        exact: true,
      }),
    ).toBeVisible();
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const removal = table.getByRole('button', { name: 'Ta bort Cykel', exact: true });
    await expect(removal).toBeEnabled();
    await expect(removal).toHaveAccessibleDescription(
      /Objektet och dess 4 samband läggs som borttagningar i ditt utkast/,
    );
    const row = table.getByRole('row').filter({
      has: page.getByRole('button', { name: 'Ta bort Cykel', exact: true }),
    });
    await expect(row.getByRole('button').last()).toHaveAccessibleName('Ta bort Cykel');
    for (const name of ['Visa Cykel i kartan', 'Visa samband för Cykel i kartan'])
      await expect(table.getByRole('button', { name, exact: true })).toBeDisabled();
    expect(await app.read()).toEqual(before);
    const edit = table.getByRole('button', { name: 'Redigera Cykel', exact: true });
    await edit.focus();
    await page.keyboard.press('Enter');
    const editor = page.getByRole('dialog', { name: 'Redigera Cykel', exact: true });
    await openProperties(editor);
    const description = propertyRow(editor, 'Beskrivning').getByLabel('Värde', { exact: true });
    await description.fill('Behåll mina oskickade uppgifter');
    await editor.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect(
      loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(description).toHaveValue('Behåll mina oskickade uppgifter');
    expect(await app.read()).toEqual(before);
    await editor.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    await loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(editor).not.toBeVisible();
    await expect(edit).toBeFocused();
    expect(await app.read()).toEqual(before);
    await removal.focus();
    await page.screenshot({ path: test.info().outputPath('text-object-actions.png') });
    await page.keyboard.press('Enter');
    await expect(removal).toBeDisabled();
    const after = await app.read();
    expect(after.draft.changes.find((change) => change.id === 'bike')?.after).toBeNull();
    expect(after.draft.changes.find((change) => change.id === 'independent')).toEqual(
      before.draft.changes.find((change) => change.id === 'independent'),
    );
    expect(after.draft.relationships?.map((change) => change.id).sort()).toEqual([
      'alex-bike',
      'bike-garage',
      'bike-none',
      'bike-unknown',
    ]);
    expect(after.draft.relationships?.every((change) => change.after === null)).toBe(true);
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await expect(table.getByRole('button', { name: 'Ta bort Garage', exact: true })).toBeFocused();
    await expect(table.getByRole('row', { name: /Cykel/ }).first()).toContainText(
      'Föreslagen borttagning',
    );
    const draft = await openDraftReview(page);
    await expect(draft).toContainText('Cykel');
    await expect(draft).toContainText('Behåll mig');
    await expect(draft.getByRole('button', { name: /^Visa förslaget:/ })).toHaveCount(6);
  } finally {
    await installation.close();
  }
});
