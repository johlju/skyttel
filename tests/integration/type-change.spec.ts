import sharp from 'sharp';
import { closeSupportDialog, closeTextView, openTable } from '../support/client.js';
import {
  applyProposedConflictChanges,
  conflictCollaborators,
} from '../support/conflict-properties.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  editTableObject,
  openObjectRelationships,
  readDraftProposal,
  readTableObject,
} from '../support/domain-work.js';
import { freeProperty, openFreeProperties } from '../support/free-property-forms.js';
import { createInstallation } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';
import { typeChangeHousehold } from '../support/type-change-http.js';

test('TYP-06: changing object type preserves individual properties, identity, edges and historical reading', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await typeChangeHousehold(page.request, installation.origin);
    const before = await read();
    await page.goto(installation.origin);
    const form = await editTableObject(page, 'Alex blå cykel');
    await form.getByLabel('Objekttyp', { exact: true }).selectOption('vehicle');
    await openFreeProperties(form);
    await expect(freeProperty(form, 'Nummer').getByLabel('Värde', { exact: true })).toHaveValue(
      'SYNTH-42',
    );
    await expect(freeProperty(form, 'Försäkrad').getByLabel('Värde', { exact: true })).toHaveValue(
      'false',
    );
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const review = await readDraftProposal(page, 'Alex blå cykel');
    for (const text of ['Cykel', 'Motorfordon', 'SYNTH-42', 'Nej'])
      await expect(review).toContainText(text);
    await closeSupportDialog(page, 'Alex blå cykel');
    await installation.restart();
    await page.reload();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    const after = await read();
    expect(after.objects.find((item) => item.id === 'bike')).toMatchObject({
      id: 'bike',
      typeId: 'vehicle',
      properties: before.objects.find((item) => item.id === 'bike')?.properties,
    });
    expect(after.relationships).toEqual(before.relationships);
    const details = await readTableObject(page, 'Alex blå cykel');
    await expect(details).toContainText('Motorfordon');
    await expect(details).toContainText('SYNTH-42');
    const relationships = await openObjectRelationships(page, 'Alex blå cykel');
    await expect(relationships).toContainText('Garaget');
    await closeSupportDialog(page, 'Samband för Alex blå cykel');
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik' });
    await history.getByText('Visa ändringarna', { exact: true }).first().click();
    await expect(history).toContainText('SYNTH-42');
  } finally {
    await installation.close();
  }
});

for (const [caseId, width, theme] of [
  ['TYP-11', 1280, 'light'],
  ['TYP-18', 1280, 'dark'],
  ['TYP-19', 390, 'light'],
  ['TYP-20', 390, 'dark'],
  ['TYP-21', 320, 'light'],
  ['TYP-22', 320, 'dark'],
] as const) {
  test(`${caseId}: repeated type changes retain every property at ${width}px in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const installation = await createInstallation();
    try {
      const { read } = await typeChangeHousehold(page.request, installation.origin);
      await page.goto(installation.origin);
      let form = await editTableObject(page, 'Alex blå cykel');
      await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
      const image = await sharp({
        create: { width: 80, height: 80, channels: 3, background: '#0088ff' },
      })
        .png()
        .toBuffer();
      await form
        .getByLabel('Profilbild', { exact: true })
        .setInputFiles({ name: 'cykel.png', mimeType: 'image/png', buffer: image });
      await expect(form.getByAltText('Profilbild för Alex blå cykel')).toBeVisible();
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      const before = await read();
      const original = before.objects.find((item) => item.id === 'bike');
      expect(original?.profileImageId).toBeTruthy();
      form = await editTableObject(page, 'Alex blå cykel');
      for (const typeId of ['vehicle', 'cycle', 'vehicle']) {
        await form.getByLabel('Objekttyp', { exact: true }).selectOption(typeId);
        await openFreeProperties(form);
        await expect(freeProperty(form, 'Nummer').getByLabel('Värde', { exact: true })).toHaveValue(
          'SYNTH-42',
        );
        await expect(
          freeProperty(form, 'Försäkrad').getByLabel('Värde', { exact: true }),
        ).toHaveValue('false');
        await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
        await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Alex blå cykel');
        await expect(form.getByLabel('Identitet', { exact: true })).toHaveValue('unspecified');
      }
      expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      expect((await read()).objects).toEqual(before.objects);
      const proposed = (await read()).draft.changes[0].after;
      expect(proposed?.properties).toEqual(
        before.objects.find((item) => item.id === 'bike')?.properties,
      );
      expect(proposed).toMatchObject({
        profileImageId: original?.profileImageId,
        iconId: 'bike',
        identity: 'unspecified',
      });
      const review = await readDraftProposal(page, 'Alex blå cykel');
      await expect(review).toContainText('SYNTH-42');
      await expect(review).toContainText('Nej');
    } finally {
      await installation.close();
    }
  });
}

test('TYP-07: conflicting type changes preserve later private properties through explicit review', async ({
  page,
  browser,
}) => {
  const other = await createPreparedContext(browser);
  const app = await conflictCollaborators(page.request, other.request, [
    ['bike', 'Alex blå cykel'],
  ]);
  try {
    const before = (await app.read()).objects[0];
    const types = (await app.read()).types;
    await page.goto(app.installation.origin);
    const form = await editTableObject(page, before.name);
    await form.getByLabel('Objekttyp', { exact: true }).selectOption(types[1].id);
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const privateChange = (await app.read()).draft.changes[0].after;
    if (!privateChange) throw new Error('Missing type proposal');
    await app.propose(page.request, 'draft', 'bike', {
      ...privateChange,
      properties: [
        { id: 'serial', label: 'Nummer', kind: 'number', value: 43 },
        { id: 'insured', label: 'Försäkrad', kind: 'boolean', value: false },
      ],
    });
    await app.propose(other.request, 'draft', 'bike', { ...before, typeId: types[2].id });
    expect((await app.save(other.request, 'other-type')).status()).toBe(200);
    expect((await app.save(page.request, 'blocked-type')).status()).toBe(409);
    await page.reload();
    await openTable(page);
    await applyProposedConflictChanges(page);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await app.installation.restart();
    await page.reload();
    const details = await readTableObject(page, before.name);
    await expect(details).toContainText(types[1].name);
    await expect(details).toContainText('43');
    await expect(details).toContainText('Nej');
  } finally {
    await other.close();
    await app.installation.close();
  }
});
