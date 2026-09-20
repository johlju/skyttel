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
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function addRelationship(
  page: Page,
  sourceId: string,
  type: string,
  targetId: string | null,
  knowledge: Knowledge = 'known',
) {
  await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
  await page.getByLabel('Från objekt').selectOption(sourceId);
  await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: type });
  await page.getByLabel('Uppgiftens säkerhet').selectOption(knowledge);
  if (targetId) await page.getByLabel('Till objekt').selectOption(targetId);
  await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
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
    for (const [sourceId, type, targetId, knowledge] of relationships)
      await addRelationship(page, sourceId, type, targetId, knowledge);

    await page.reload();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Björkbacken → Används av → Okänt');
    await expect(review).toContainText('Garaget → Används av → Uttryckligen inget');
    await expect(review).toContainText('Lo → Använder → Blå bilen (Osäkert uppgivet)');
    await expect(review).toContainText('Ospecificerat objekt');
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
    await page
      .getByRole('button', { name: 'Bostadshyra → Betalas med → Obesvarad identitetsfråga' })
      .click();
    await page.getByLabel('Uppgiftens säkerhet').selectOption('known');
    await page.getByLabel('Till objekt').selectOption('bank');
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    relationships[relationships.length - 1] = ['home-rent', 'Betalas med', 'bank', 'known'];
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await expect(review).toContainText('Inga förslag');
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
    expect((await read()).objects).toEqual(saved.objects);
    expect((await read()).relationships).toEqual(saved.relationships);
    await page.getByLabel('Sök objekt').fill('bostadshyra');
    await expect(
      page.getByRole('list', { name: 'Objekt', exact: true }).getByRole('button'),
    ).toHaveText(['Bostadshyra']);
    await page.getByRole('button', { name: 'Bostadshyra', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Hyran på Björkbacken');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByLabel('Sök objekt').fill('');
    await page.getByRole('button', { name: 'Betalkontot', exact: true }).click();
    await expect(page.getByLabel('Objektets identitet')).toHaveValue('unspecified');
    await page.getByLabel('Objektets identitet').selectOption('identified');
    await page.getByLabel('Objektets namn').fill('Hushållets bankkonto');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Blå bilen → Äger → Kim', exact: true }).click();
    await page.getByLabel('Till objekt').selectOption('alex');
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await expect(review).toContainText('Blå bilen → Äger → Kim');
    await expect(review).toContainText('Blå bilen → Äger → Alex');
    await expect(review).toContainText('Betalkontot');
    await expect(review).toContainText('Hushållets bankkonto');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await expect(review).toContainText('Inga förslag');
    await page.reload();
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
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Hyran på Björkbacken → Betalas med → Hushållets bankkonto',
    );
    const finalHistory = (await history()).history;
    expect(finalHistory).toHaveLength(2);
    expect(finalHistory[0]).toEqual(firstHistory[0]);
    expect(finalHistory[1].userId).toBe(saved.userId);
    expect(Date.parse(finalHistory[1].savedAt)).toBeGreaterThanOrEqual(
      Date.parse(firstHistory[0].savedAt),
    );
    expect(finalHistory[1].relationships?.[0].before).toEqual(oldOwnership);
    expect(finalHistory[1].changes.find((change) => change.before?.id === 'bank')?.before).toEqual(
      saved.objects.find((object) => object.id === 'bank'),
    );
  } finally {
    await installation.close();
  }
});

test('AVTAL-06: upgrading preserves household definitions and an older private draft', async ({
  request,
}) => {
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
    await copyFile('migrations/007_contracts.sql', join(migrationsDirectory, '007_contracts.sql'));
    await installation.restart();
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
    const saved = await request.post(`${path}/save`, {
      headers: { origin: installation.origin },
      data: {
        version: draft.version,
        contentVersion: state.contentVersion,
        operationId: 'save-old-draft',
      },
    });
    expect(saved.status()).toBe(200);
    const { receipt }: { receipt: SaveReceipt } = await saved.json();
    expect(receipt.changes[0]).toMatchObject({
      before,
      after: { ...before, name: 'Björkbacken hemma', revision: 2 },
      type,
    });
    expect(receipt.userId).toBe(user.id);
    expect((await (await request.get(`${path}/history`)).json()).history).toEqual([receipt]);
    await installation.restart();
    const reopened: MapState = await (await request.get(path, { maxRetries: 1 })).json();
    expect(reopened.objects).toEqual([receipt.changes[0].after]);
    expect(reopened.types).toEqual(state.types);
    expect(reopened.relationshipTypes).toEqual(state.relationshipTypes);
  } finally {
    await installation.close();
    await rm(migrationsDirectory, { recursive: true, force: true });
  }
});
