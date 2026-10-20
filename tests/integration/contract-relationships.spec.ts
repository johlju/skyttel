import type { Page } from '@playwright/test';
import type { MapState, RelationshipValue, SaveReceipt } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openTable,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  editObjectRelationship,
  editTableObject,
  openObjectRelationships,
  readDraftProposal,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { setProperty } from '../support/property-controls.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';

async function addRelationship(
  page: Page,
  sourceName: string,
  sourceId: string,
  type: string,
  targetId: string,
  certainty = '',
) {
  const dialog = await openObjectRelationships(page, sourceName);
  await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
  await page.getByLabel('Från objekt', { exact: true }).selectOption(sourceId);
  await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: type });
  if (certainty) await setProperty(page, 'Uppgiftens säkerhet', certainty);
  if (targetId) await page.getByLabel('Till objekt', { exact: true }).selectOption(targetId);
  await stageRelationshipAndClose(page);
}

test('AVTAL-05: contract relationships preserve separate roles and identities through a blocked save and correction', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const history = async (): Promise<{ history: SaveReceipt[] }> =>
      (await page.request.get(`${path}/history`)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    let state = await read();
    const objects = [
      ['home', 'Bostad', 'Björkbacken'],
      ['garage', 'Garage', 'Garaget'],
      ['vehicle', 'Fordon', 'Blå bilen'],
      ['home-rent', 'Hyresavtal', 'Bostadshyra'],
      ['garage-rent', 'Hyresavtal', 'Garagehyra'],
      ['electricity', 'Avtal', 'Elavtalet'],
      ['loan', 'Låneavtal', 'Bostadslånet'],
      ['credit', 'Kreditavtal', 'Reservkrediten'],
      ['installment', 'Avbetalningsavtal', 'Bilavbetalningen'],
      ['insurance', 'Försäkringsavtal', 'Bilförsäkringen'],
      ['alex', 'Person', 'Alex'],
      ['kim', 'Person', 'Kim'],
      ['lo', 'Person', 'Lo'],
      ['landlord', 'Företag', 'Björkhem AB'],
      ['lender', 'Förening', 'Låneföreningen'],
      ['bank', 'Bankkonto', 'Betalkontot'],
    ] as const;
    // Arrange objects through the same public draft flow; the browser creates
    // and corrects the scenario's directed relationships below.
    for (const [id, type, name] of objects) {
      const response = await post('draft', {
        version: state.draft.version,
        id,
        baseRevision: null,
        value: {
          typeId: state.types.find((item) => item.name === type)?.id,
          name,
          ...(id === 'bank' ? { identity: 'unresolved' } : {}),
        },
      });
      expect(response.status()).toBe(200);
      state = await read();
    }
    await page.goto(installation.origin);
    await openTable(page);
    const relationships: [string, string, string, string][] = [
      ['home-rent', 'Gäller', 'home', ''],
      ['garage-rent', 'Gäller', 'garage', ''],
      ['electricity', 'Gäller', 'home', ''],
      ['home-rent', 'Hyresvärd', 'landlord', ''],
      ['garage-rent', 'Hyresvärd', 'landlord', ''],
      ['home-rent', 'Står på avtalet', 'alex', ''],
      ['home-rent', 'Står på avtalet', 'landlord', ''],
      ['garage-rent', 'Står på avtalet', 'kim', ''],
      ['garage-rent', 'Står på avtalet', 'landlord', ''],
      ['loan', 'Står på avtalet', 'alex', ''],
      ['loan', 'Står på avtalet', 'lender', ''],
      ['loan', 'Långivare', 'lender', ''],
      ['loan', 'Gäller', 'home', ''],
      ['credit', 'Står på avtalet', 'alex', ''],
      ['credit', 'Står på avtalet', 'lender', ''],
      ['credit', 'Långivare', 'lender', ''],
      ['installment', 'Står på avtalet', 'alex', ''],
      ['installment', 'Står på avtalet', 'lender', ''],
      ['installment', 'Finansierar', 'vehicle', ''],
      ['insurance', 'Försäkrar', 'vehicle', ''],
      ['vehicle', 'Äger', 'kim', ''],
      ['lo', 'Använder', 'vehicle', 'Osäkert uppgivet'],
      ['kim', 'Betalar', 'installment', ''],
      ['garage-rent', 'Betalas med', 'bank', ''],
      ['home-rent', 'Betalas med', 'bank', 'Obesvarad fråga'],
    ];
    for (const [sourceId, type, targetId, certainty] of relationships) {
      const source = objects.find(([id]) => id === sourceId);
      if (!source) throw new Error(`Missing arranged source: ${sourceId}`);
      await addRelationship(page, source[2], sourceId, type, targetId, certainty);
    }

    await page.reload();

    await openTable(page);
    const review = await openDraftReview(page);
    await expect(review).toContainText('Lo → Använder → Blå bilen');
    const bankProposal = await readDraftProposal(page, 'Betalkontot');
    await expect(bankProposal).toContainText('Identiteten behöver redas ut');
    await closeSupportDialog(page, 'Betalkontot');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    const blocked = await read();
    expect(blocked.objects).toEqual([]);
    expect(blocked.relationships).toEqual([]);
    const rejection = await post('save', {
      version: blocked.draft.version,
      contentVersion: blocked.contentVersion,
      operationId: 'contracts-unresolved',
    });
    expect(rejection.status()).toBe(409);
    expect(await rejection.json()).toMatchObject({ error: 'unresolved_identity' });
    expect(await read()).toEqual(blocked);
    expect(await history()).toEqual({ history: [] });

    await page.reload();

    await openTable(page);
    const bankForm = await editTableObject(page, 'Betalkontot');
    await bankForm.getByLabel('Identitet').selectOption('unspecified');
    await bankForm.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await expect(review).toContainText('Utkastet är tomt.');
    await closeTextView(page);
    const saved = await read();
    expect(saved.objects).toHaveLength(objects.length);
    for (const [id, type, name] of objects) {
      const object = saved.objects.find((item) => item.id === id);
      expect(object).toMatchObject({
        id,
        typeId: saved.types.find((item) => item.name === type)?.id,
        name,
      });
      expect(object?.properties ?? []).toEqual([]);
    }
    expect(saved.objects.find((object) => object.id === 'bank')?.identity).toBe('unspecified');
    const expectedRelationships = relationships.map(([sourceId, type, targetId]) => ({
      sourceId,
      typeId: saved.relationshipTypes.find((item) => item.name === type)?.id,
      targetId,
    }));
    const publicValues = (values: RelationshipValue[]) =>
      values.map(({ sourceId, typeId, targetId }) => ({ sourceId, typeId, targetId }));
    expect(publicValues(saved.relationships)).toEqual(
      expect.arrayContaining(expectedRelationships),
    );
    expect(saved.relationships).toHaveLength(expectedRelationships.length);
    const firstHistory = (await history()).history;
    expect(firstHistory).toHaveLength(1);
    expect(firstHistory[0]).toMatchObject({ householdId: household.id, userId: saved.userId });
    expect(firstHistory[0].savedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(firstHistory[0].changes.every((change) => change.before === null)).toBe(true);
    expect(firstHistory[0].changes.map((change) => change.after)).toEqual(
      expect.arrayContaining(saved.objects),
    );
    expect(firstHistory[0].relationships?.map((change) => change.after)).toEqual(
      expect.arrayContaining(saved.relationships),
    );

    await installation.restart();
    await page.reload();
    await openTable(page);
    expect((await read()).objects).toEqual(saved.objects);
    expect((await read()).relationships).toEqual(saved.relationships);
    await page.getByRole('searchbox', { name: 'Sök objekt i tabellen' }).fill('bostadshyra');
    const found = page.getByRole('table').getByRole('rowheader').getByRole('button');
    await expect(found).toHaveCount(1);
    await expect(found).toHaveAccessibleName('Bostadshyra');
    await editTableObject(page, 'Bostadshyra');
    await page.getByLabel('Namn', { exact: true }).fill('Hyran på Björkbacken');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Sök objekt i tabellen' }).fill('');
    await editTableObject(page, 'Betalkontot');
    await expect(page.getByLabel('Identitet')).toHaveValue('unspecified');
    await page.getByLabel('Identitet').selectOption('identified');
    await page.getByLabel('Namn', { exact: true }).fill('Hushållets bankkonto');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await editObjectRelationship(page, 'Blå bilen', 'Blå bilen → Äger → Kim');
    await page.getByLabel('Till objekt', { exact: true }).selectOption('alex');
    await stageRelationshipAndClose(page);
    const ownership = await readDraftProposal(page, 'Blå bilen → Äger → Alex');
    await expect(
      ownership.getByRole('heading', { name: 'Sparade värden' }).locator('..'),
    ).toContainText('Kim');
    await expect(
      ownership.getByRole('heading', { name: 'Föreslagna värden' }).locator('..'),
    ).toContainText('Alex');
    await closeSupportDialog(page, 'Blå bilen → Äger → Alex');
    const bankChange = await readDraftProposal(page, 'Hushållets bankkonto');
    await expect(bankChange).toContainText('Betalkontot');
    await expect(bankChange).toContainText('Hushållets bankkonto');
    await closeSupportDialog(page, 'Hushållets bankkonto');
    await saveReviewedConflictDraft(page);
    await expect(review).toContainText('Utkastet är tomt.');
    await closeTextView(page);
    await page.reload();
    await openTable(page);
    const corrected = await read();
    expect(corrected.objects).toHaveLength(saved.objects.length);
    expect(corrected.objects.find((object) => object.id === 'home-rent')?.name).toBe(
      'Hyran på Björkbacken',
    );
    expect(corrected.objects.find((object) => object.id === 'bank')).toMatchObject({
      id: 'bank',
      name: 'Hushållets bankkonto',
    });
    expect(corrected.objects.find((object) => object.id === 'bank')?.identity).toBeUndefined();
    expect(corrected.objects.find((object) => object.id === 'vehicle')).toEqual(
      saved.objects.find((object) => object.id === 'vehicle'),
    );
    const ownerType = corrected.relationshipTypes.find((type) => type.name === 'Äger')?.id;
    const oldOwnership = saved.relationships.find((edge) => edge.typeId === ownerType);
    expect(corrected.relationships.find((edge) => edge.id === oldOwnership?.id)).toMatchObject({
      sourceId: 'vehicle',
      targetId: 'alex',
    });
    expect(corrected.relationships.filter((edge) => edge.id !== oldOwnership?.id)).toEqual(
      saved.relationships.filter((edge) => edge.id !== oldOwnership?.id),
    );
    const correctedRelationships = await openObjectRelationships(page, 'Hyran på Björkbacken');
    await expect(correctedRelationships).toContainText(
      'Hyran på Björkbacken → Betalas med → Hushållets bankkonto',
    );
    const finalHistory = (await history()).history;
    expect(finalHistory).toHaveLength(2);
    expect(finalHistory[1]).toEqual(firstHistory[0]);
    expect(finalHistory[0].userId).toBe(saved.userId);
    expect(Date.parse(finalHistory[0].savedAt)).toBeGreaterThanOrEqual(
      Date.parse(firstHistory[0].savedAt),
    );
    expect(finalHistory[0].relationships?.[0].before).toEqual(oldOwnership);
    expect(finalHistory[0].changes.find((change) => change.before?.id === 'bank')?.before).toEqual(
      saved.objects.find((object) => object.id === 'bank'),
    );
  } finally {
    await installation.close();
  }
});
