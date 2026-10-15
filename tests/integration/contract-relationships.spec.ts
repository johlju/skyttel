import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import Database from 'better-sqlite3';
import type {
  Knowledge,
  MapDraft,
  MapObject,
  MapState,
  RelationshipValue,
  SaveReceipt,
} from '../../src/shared/map.js';
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
  openTypeDefinitions,
  readDraftProposal,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';

async function addRelationship(
  page: Page,
  sourceName: string,
  sourceId: string,
  type: string,
  targetId: string | null,
  knowledge: Knowledge = 'known',
) {
  const dialog = await openObjectRelationships(page, sourceName);
  await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
  await page.getByLabel('Från objekt').selectOption(sourceId);
  await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: type });
  await page.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption(knowledge);
  if (targetId) await page.getByLabel('Till objekt').selectOption(targetId);
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
          description: '',
          ...(id === 'bank' ? { identity: 'unspecified' } : {}),
        },
      });
      expect(response.status()).toBe(200);
      state = await read();
    }
    await page.goto(installation.origin);
    await openTable(page);
    const relationships: [string, string, string | null, Knowledge][] = [
      ['home-rent', 'Gäller', 'home', 'known'],
      ['garage-rent', 'Gäller', 'garage', 'known'],
      ['electricity', 'Gäller', 'home', 'known'],
      ['home-rent', 'Hyresvärd', 'landlord', 'known'],
      ['garage-rent', 'Hyresvärd', 'landlord', 'known'],
      ['home-rent', 'Står på avtalet', 'alex', 'known'],
      ['home-rent', 'Står på avtalet', 'landlord', 'known'],
      ['garage-rent', 'Står på avtalet', 'kim', 'known'],
      ['garage-rent', 'Står på avtalet', 'landlord', 'known'],
      ['loan', 'Står på avtalet', 'alex', 'known'],
      ['loan', 'Står på avtalet', 'lender', 'known'],
      ['loan', 'Långivare', 'lender', 'known'],
      ['loan', 'Gäller', 'home', 'known'],
      ['credit', 'Står på avtalet', 'alex', 'known'],
      ['credit', 'Står på avtalet', 'lender', 'known'],
      ['credit', 'Långivare', 'lender', 'known'],
      ['installment', 'Står på avtalet', 'alex', 'known'],
      ['installment', 'Står på avtalet', 'lender', 'known'],
      ['installment', 'Finansierar', 'vehicle', 'known'],
      ['insurance', 'Försäkrar', 'vehicle', 'known'],
      ['vehicle', 'Äger', 'kim', 'known'],
      ['lo', 'Använder', 'vehicle', 'uncertain'],
      ['kim', 'Betalar', 'installment', 'known'],
      ['home', 'Används av', null, 'unknown'],
      ['garage', 'Används av', null, 'none'],
      ['garage-rent', 'Betalas med', 'bank', 'known'],
      ['home-rent', 'Betalas med', null, 'unresolved'],
    ];
    for (const [sourceId, type, targetId, knowledge] of relationships) {
      const source = objects.find(([id]) => id === sourceId);
      if (!source) throw new Error(`Missing arranged source: ${sourceId}`);
      await addRelationship(page, source[2], sourceId, type, targetId, knowledge);
    }

    await page.reload();

    await openTable(page);
    const review = await openDraftReview(page);
    await expect(review).toContainText('Björkbacken → Används av → Okänt');
    await expect(review).toContainText('Garaget → Används av → Uttryckligen inget');
    await expect(review).toContainText('Lo → Använder → Blå bilen (osäkert uppgivet)');
    const bankProposal = await readDraftProposal(page, 'Betalkontot');
    await expect(bankProposal).toContainText('Ospecificerat objekt');
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
    await editObjectRelationship(
      page,
      'Bostadshyra',
      'Bostadshyra → Betalas med → Obesvarad identitetsfråga',
    );
    await page.getByLabel('Uppgiftens säkerhet', { exact: true }).selectOption('known');
    await page.getByLabel('Till objekt').selectOption('bank');
    await stageRelationshipAndClose(page);
    relationships[relationships.length - 1] = ['home-rent', 'Betalas med', 'bank', 'known'];
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
      expect(object?.financialFacts).toBeUndefined();
    }
    expect(saved.objects.find((object) => object.id === 'bank')?.identity).toBe('unspecified');
    const expectedRelationships = relationships.map(([sourceId, type, targetId, knowledge]) => ({
      sourceId,
      typeId: saved.relationshipTypes.find((item) => item.name === type)?.id,
      targetId,
      knowledge,
    }));
    const publicValues = (values: RelationshipValue[]) =>
      values.map(({ sourceId, typeId, targetId, knowledge }) => ({
        sourceId,
        typeId,
        targetId,
        knowledge,
      }));
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
    await page.getByLabel('Till objekt').selectOption('alex');
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

test('AVTAL-06: upgrading preserves household definitions and an older private draft', async ({
  page,
}) => {
  const request = page.request;
  const migrationsDirectory = await mkdtemp(join(tmpdir(), 'skyttel-contract-upgrade-'));
  const names = (await readdir('migrations')).filter(
    (name) => name.endsWith('.sql') && name < '007',
  );
  await Promise.all(
    names.map((name) => copyFile(join('migrations', name), join(migrationsDirectory, name))),
  );
  const installation = await createInstallation(undefined, { migrationsDirectory });
  try {
    await signIn(request, installation.origin);
    const { household } = await (await createHousehold(request, installation.origin)).json();
    const { user } = await (await request.get(`${installation.origin}/api/bootstrap`)).json();
    const type = {
      id: 'household-home-type',
      householdId: household.id,
      revision: 7,
      name: 'Bostad',
      description: 'Hushållets egen beskrivning av bostad',
    };
    const role = {
      id: 'household-landlord-role',
      householdId: household.id,
      revision: 4,
      name: 'Hyresvärd',
      description: 'Hushållets egen beskrivning av hyresvärd',
    };
    const before: MapObject = {
      id: 'home-before-upgrade',
      householdId: household.id,
      typeId: type.id,
      revision: 1,
      name: 'Björkbacken',
      description: '',
    };
    const draft: MapDraft = {
      version: 3,
      changes: [
        {
          id: before.id,
          before,
          after: { typeId: type.id, name: 'Björkbacken hemma', description: '' },
          type,
        },
      ],
    };
    // Arrange a previous-version installation. Every compatibility assertion
    // below goes through the running upgraded application's public HTTP API.
    const database = new Database(join(installation.directory, 'skyttel.db'));
    try {
      database
        .prepare(
          'INSERT INTO object_type (id, householdId, revision, name, description) VALUES (?, ?, ?, ?, ?)',
        )
        .run(type.id, type.householdId, type.revision, type.name, type.description);
      database
        .prepare(
          'INSERT INTO relationship_type (id, householdId, revision, name, description) VALUES (?, ?, ?, ?, ?)',
        )
        .run(role.id, role.householdId, role.revision, role.name, role.description);
      database
        .prepare(
          'INSERT INTO map_object (id, householdId, typeId, revision, name, description) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          before.id,
          before.householdId,
          before.typeId,
          before.revision,
          before.name,
          before.description,
        );
      database
        .prepare(
          'INSERT INTO map_draft (householdId, userId, version, changes) VALUES (?, ?, ?, ?)',
        )
        .run(household.id, user.id, draft.version, JSON.stringify(draft.changes));
    } finally {
      database.close();
    }
    await Promise.all(
      (await readdir('migrations'))
        .filter((name) => name.endsWith('.sql') && name >= '007')
        .map((name) => copyFile(join('migrations', name), join(migrationsDirectory, name))),
    );
    await installation.upgradeLegacyLogin();
    expect(
      (await request.get(`${installation.origin}/api/households/${household.id}/map`)).status(),
    ).toBe(401);
    await signIn(request, installation.origin);
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const response = await request.get(path, { maxRetries: 1 });
    expect(response.status()).toBe(200);
    const state: MapState = await response.json();
    expect(state.types.filter((item) => item.name === 'Bostad')).toEqual([type]);
    expect(state.relationshipTypes.filter((item) => item.name === 'Hyresvärd')).toEqual([role]);
    expect(state.objects).toEqual([before]);
    expect(state.draft).toEqual(draft);
    expect(state.types.map((item) => item.name)).toEqual(
      expect.arrayContaining([
        'Bostad',
        'Garage',
        'Fordon',
        'Avtal',
        'Hyresavtal',
        'Låneavtal',
        'Kreditavtal',
        'Avbetalningsavtal',
        'Försäkringsavtal',
      ]),
    );
    expect(state.relationshipTypes.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Gäller', 'Finansierar', 'Försäkrar', 'Hyresvärd', 'Långivare']),
    );
    await page.goto(installation.origin);
    await openTypeDefinitions(page);
    await page.getByText('Objekttyper och egna fält', { exact: true }).click();
    const homeType = page.getByRole('button', { name: 'Ändra typ: Bostad', exact: true });
    await expect(homeType).toHaveCount(1);
    await homeType.click();
    await expect(page.getByLabel('Typens beskrivning', { exact: true })).toHaveValue(
      type.description,
    );
    await page
      .getByRole('button', { name: 'Stäng typformuläret utan att skicka', exact: true })
      .click();
    for (const name of [
      'Garage',
      'Fordon',
      'Avtal',
      'Hyresavtal',
      'Låneavtal',
      'Kreditavtal',
      'Avbetalningsavtal',
      'Försäkringsavtal',
    ])
      await expect(
        page.getByRole('button', { name: `Ändra typ: ${name}`, exact: true }),
      ).toBeVisible();
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    const landlord = page.getByRole('button', {
      name: 'Ändra sambandstyp: Hyresvärd',
      exact: true,
    });
    await expect(landlord).toHaveCount(1);
    await landlord.click();
    await expect(page.getByLabel('Sambandstypens beskrivning', { exact: true })).toHaveValue(
      role.description,
    );
    await page
      .getByRole('button', { name: 'Stäng sambandstypen utan att skicka', exact: true })
      .click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    const proposal = await readDraftProposal(page, 'Björkbacken hemma');
    await expect(proposal).toContainText('Björkbacken');
    await expect(proposal).toContainText('Björkbacken hemma');
    await closeSupportDialog(page, 'Björkbacken hemma');
    const responsePromise = page.waitForResponse(
      (response) => response.url() === `${path}/save` && response.request().method() === 'POST',
    );
    await saveReviewedConflictDraft(page);
    const saved = await responsePromise;
    expect(saved.status()).toBe(200);
    const { receipt }: { receipt: SaveReceipt } = await saved.json();
    expect(receipt.changes[0]).toMatchObject({
      before,
      after: { ...before, name: 'Björkbacken hemma', revision: 2 },
      type,
    });
    expect(receipt.userId).toBe(user.id);
    expect((await (await request.get(`${path}/history`)).json()).history).toEqual([receipt]);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    const form = await editTableObject(page, 'Björkbacken hemma');
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Björkbacken hemma');
    await expect(form.getByLabel('Objekttyp', { exact: true })).toHaveValue(type.id);
    const reopened: MapState = await (await request.get(path, { maxRetries: 1 })).json();
    expect(reopened.objects).toEqual([receipt.changes[0].after]);
    expect(reopened.types).toEqual(state.types);
    expect(reopened.relationshipTypes).toEqual(state.relationshipTypes);
  } finally {
    await installation.close();
    await rm(migrationsDirectory, { recursive: true, force: true });
  }
});
