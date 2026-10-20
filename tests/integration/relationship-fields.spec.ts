import { closeTextView } from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editObjectRelationship, openObjectRelationships } from '../support/domain-work.js';
import { addFreeProperty, freeProperty } from '../support/free-property-forms.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { createRelationshipFixture } from '../support/relationship-fixture.js';
import { expect, test } from '../support/test.js';

for (const [caseId, width] of [
  ['STY-06', 1440],
  ['STY-09', 390],
] as const) {
  test(`${caseId}: ordered relationship properties retain empty, zero and false at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const installation = await createInstallation();
    try {
      const { read } = await createRelationshipFixture(page.request, installation.origin);
      await page.goto(installation.origin);
      const dialog = await openObjectRelationships(page, 'Alex');
      await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
      await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
      await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
      await addFreeProperty(dialog, 'Anteckning', 'text', 'Låst skåp');
      await addFreeProperty(dialog, 'Belopp', 'number', '0');
      await addFreeProperty(dialog, 'Startdatum', 'date', '2026-09-27');
      await addFreeProperty(dialog, 'Bekräftat', 'boolean', 'false');
      const empty = await addFreeProperty(dialog, 'Obesvarat', 'boolean');
      await empty.getByRole('button', { name: 'Flytta upp', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(empty.getByLabel('Etikett', { exact: true })).toBeFocused();
      const stage = dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true });
      await stage.focus();
      await expect(stage).toBeFocused();
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await stageRelationshipAndClose(page);
      const proposed = (await read()).draft.relationships?.[0].after?.properties;
      expect(proposed?.map((property) => property.label)).toEqual([
        'Anteckning',
        'Belopp',
        'Startdatum',
        'Obesvarat',
        'Bekräftat',
      ]);
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      await installation.restart();
      await page.reload();
      const edit = await editObjectRelationship(page, 'Alex', 'Alex → Använder → Blå cykeln');
      for (const [label, value] of [
        ['Anteckning', 'Låst skåp'],
        ['Belopp', '0'],
        ['Startdatum', '2026-09-27'],
        ['Bekräftat', 'false'],
        ['Obesvarat', ''],
      ])
        await expect(freeProperty(edit, label).getByLabel('Värde', { exact: true })).toHaveValue(
          value,
        );
      await freeProperty(edit, 'Anteckning')
        .getByLabel('Värde', { exact: true })
        .fill('Övre hyllan');
      await stageRelationshipAndClose(page);
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      const current = (await read()).relationships[0].properties;
      expect(current?.map((property) => property.id)).toEqual(
        proposed?.map((property) => property.id),
      );
      expect(current?.[0]).toMatchObject({ value: 'Övre hyllan' });
      expect(current?.[1]).toMatchObject({ value: 0 });
      expect(current?.[3]).not.toHaveProperty('value');
      expect(current?.[4]).toMatchObject({ value: false });
    } finally {
      await installation.close();
    }
  });
}

test('STY-07: changing relationship type preserves every individual property immediately', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post } = await createRelationshipFixture(page.request, installation.origin);
    const state = await read();
    const original = state.relationshipTypes.find((type) => type.name === 'Använder');
    const next = state.relationshipTypes.find((type) => type.name === 'Äger');
    const properties = [
      { id: 'note', label: 'Anteckning', kind: 'text', value: 'Behåll uppgiften' },
      { id: 'flag', label: 'Kontrollerat', kind: 'boolean', value: false },
    ];
    await post('relationship', {
      id: 'edge',
      baseRevision: null,
      value: { typeId: original?.id, sourceId: 'alex', targetId: 'bicycle', properties },
    });
    await post('save', { operationId: 'baseline' });
    await page.goto(installation.origin);
    const form = await editObjectRelationship(page, 'Alex', 'Alex → Använder → Blå cykeln');
    await form.getByLabel('Sambandstyp', { exact: true }).selectOption(next?.id ?? '');
    await expect(freeProperty(form, 'Anteckning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Behåll uppgiften',
    );
    await expect(
      freeProperty(form, 'Kontrollerat').getByLabel('Värde', { exact: true }),
    ).toHaveValue('false');
    await stageRelationshipAndClose(page);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    expect((await read()).relationships[0]).toMatchObject({
      id: 'edge',
      typeId: next?.id,
      properties,
    });
    const dialog = await openObjectRelationships(page, 'Alex');
    await expect(dialog).toContainText('Behåll uppgiften');
    await expect(dialog).toContainText('Nej');
  } finally {
    await installation.close();
  }
});
