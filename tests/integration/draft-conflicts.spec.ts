import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import type {
  MapState,
  ObjectValue,
  RelationshipValue,
  SaveReceipt,
} from '../../src/shared/map.js';
import { createHousehold, openMap, openWorkspace, signIn } from '../support/client.js';
import { alex, createInstallation, robin } from '../support/installation.js';

test('UTKAST-17: closed-panel status leads to a concurrent object conflict without losing unsent work', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  const member = await other.newPage();
  try {
    await page.goto(app.installation.origin);
    await member.goto(app.installation.origin);
    for (const client of [page, member]) {
      await openWorkspace(client);
      await client.getByRole('button', { name: 'Uppgifter för Lo Exempel', exact: true }).click();
      await client.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    }
    await page.getByLabel('Objektets namn').fill('Lo Lind');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await member.getByLabel('Objektets namn').fill('Lo Berg');
    await member.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await member.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(member.getByRole('status')).toContainText('Sparat: Lo Berg');
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Inget sparades');
    await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Oskickad cykel');
    await openMap(page);
    const status = page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });
    await status.getByText('Visa 1 konflikt', { exact: true }).click();
    const destination = status.getByRole('button', { name: 'Objekt: Lo Lind', exact: true });
    await destination.focus();
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', { name: 'Ändring: Lo Lind', exact: true });
    await expect(heading).toBeFocused();
    await expectFocusedTargetUncovered(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
    await expect(review).toContainText('Lo Exempel');
    await expect(review).toContainText('Lo Lind');
    await expect(review).toContainText('Lo Berg');
    await expect(
      review.getByRole('button', { name: 'Behåll mitt förslag', exact: true }),
    ).toBeDisabled();
    await status.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(page.getByLabel('Objektets namn')).toHaveValue('Oskickad cykel');
    expect((await app.read()).objects.find((object) => object.id === 'lo')?.name).toBe('Lo Berg');
    expect((await app.read()).draft.changes.map((change) => change.after?.name)).toEqual([
      'Lo Lind',
    ]);
    expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(2);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

async function expectFocusedTargetUncovered(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const target = document.activeElement;
        if (!(target instanceof HTMLElement)) return false;
        const bounds = target.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return bounds.top >= 0 && bounds.bottom <= innerHeight && target.contains(hit);
      }),
    )
    .toBe(true);
}

for (const { width, height } of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 844 },
  { width: 640, height: 456 },
]) {
  test(`UTKAST-18: status reaches all conflict kinds and preserves complete snapshot values at ${width}px`, async ({
    page,
    browser,
  }) => {
    const other = await browser.newContext();
    const app = await collaborators(page.request, other.request);
    try {
      await page.setViewportSize({ width, height });
      const initial = await app.read();
      const objectType = initial.types[0];
      const edgeType = initial.relationshipTypes[0];
      const edgeDefinition = {
        name: edgeType.name,
        description: edgeType.description,
        forwardLabel: edgeType.forwardLabel ?? edgeType.name,
        reverseLabel: edgeType.reverseLabel ?? edgeType.name,
        fields: edgeType.fields,
        sections: edgeType.sections,
      };
      const definition = {
        ...objectType,
        sections: [{ id: 'finance', name: 'Sparad ekonomi' }],
        fields: [
          { id: 'note', name: 'Dold anteckning', description: '', kind: 'text', sectionId: '' },
        ],
        builtins: [{ key: 'debt', name: 'Sparad skuld', sectionId: 'finance' }],
        propertyOrder: ['builtin:debt', 'field:note'],
      };
      async function proposeType(
        client: APIRequestContext,
        kind: 'object-type' | 'relationship-type',
        value: unknown,
      ) {
        const state = await app.read(client);
        const type = (kind === 'object-type' ? state.types : state.relationshipTypes)[0];
        expect(
          (
            await app.post(client, kind, {
              version: state.draft.version,
              id: type.id,
              baseRevision: type.revision,
              value,
            })
          ).status(),
        ).toBe(200);
      }
      await proposeType(page.request, 'object-type', definition);
      const original: ObjectValue = {
        typeId: objectType.id,
        name: 'Lo Exempel',
        description: 'Tidigare beskrivning',
        customValues: { note: 'Tidigare dold uppgift' },
        financialFacts: { debt: { knowledge: 'known', value: '1 200', reportedOn: '2026-09-01' } },
      };
      await app.propose(page.request, 'draft', 'lo', original);
      const edge: RelationshipValue = {
        typeId: edgeType.id,
        sourceId: 'lo',
        targetId: 'service',
        knowledge: 'known',
      };
      await app.propose(page.request, 'relationship', 'edge', edge);
      expect((await app.save(page.request, 'base-values')).status()).toBe(200);
      await proposeType(page.request, 'object-type', {
        ...definition,
        name: 'Min objekttyp',
        sections: [{ id: 'finance', name: 'Mitt ekonomiska avsnitt' }],
        builtins: [{ key: 'debt', name: 'Min skuld', sectionId: 'finance' }],
      });
      await proposeType(page.request, 'relationship-type', {
        ...edgeDefinition,
        name: 'Min sambandstyp',
        forwardLabel: 'använder enligt mig',
        reverseLabel: 'används av mig',
      });
      await app.propose(page.request, 'draft', 'lo', {
        ...original,
        name: 'Lo Lind',
        customValues: { note: 'Min dolda uppgift' },
        financialFacts: { debt: { knowledge: 'known', value: '1 700', reportedOn: '2026-09-03' } },
      });
      await app.propose(page.request, 'relationship', 'edge', { ...edge, knowledge: 'uncertain' });
      await proposeType(other.request, 'object-type', {
        ...definition,
        description: 'Annans typförklaring',
      });
      await proposeType(other.request, 'relationship-type', {
        ...edgeDefinition,
        description: 'Annans sambandstyp',
      });
      await app.propose(other.request, 'draft', 'lo', {
        ...original,
        name: 'Lo Berg',
        description: 'Annans beskrivning',
        customValues: { note: 'Annans dolda uppgift' },
        financialFacts: {
          debt: { knowledge: 'uncertain', value: '2 000', reportedOn: '2026-09-02' },
        },
      });
      await app.propose(other.request, 'relationship', 'edge', {
        ...edge,
        targetId: null,
        knowledge: 'unknown',
      });
      expect((await app.save(other.request, 'concurrent-values')).status()).toBe(200);
      const unchanged = await app.read();
      await page.goto(app.installation.origin);
      await openMap(page);
      const status = page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });
      const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
      for (const [label, title] of [
        ['Objekttyp: Min objekttyp', 'Ändrad objekttyp: Min objekttyp'],
        ['Sambandstyp: Min sambandstyp', 'Ändrad sambandstyp: Min sambandstyp'],
        ['Samband: Lo Lind → använder enligt mig → Molnmusik (Osäkert uppgivet)', 'Samband'],
        ['Objekt: Lo Lind', 'Ändring: Lo Lind'],
      ]) {
        await openMap(page);
        const disclosure = status.getByText('Visa 4 konflikter', { exact: true });
        if (!(await status.getByRole('button', { name: label, exact: true }).isVisible())) {
          await disclosure.focus();
          await expectFocusedTargetUncovered(page);
          expect((await disclosure.boundingBox())?.height).toBeGreaterThanOrEqual(44);
          await disclosure.click();
        }
        await status.getByRole('button', { name: label, exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(review.getByRole('heading', { name: title, exact: true })).toBeFocused();
        await expectFocusedTargetUncovered(page);
      }
      const object = review.getByRole('article').filter({
        has: page.getByRole('heading', { name: 'Ändring: Lo Lind', exact: true }),
      });
      await expect(
        object
          .getByRole('region', { name: 'Mitt ekonomiska avsnitt', exact: true })
          .filter({ hasText: 'Min skuld: 1 700 — datum för uppgiften: 2026-09-03' }),
      ).toBeVisible();
      await expect(
        object
          .getByRole('region', { name: 'Sparad ekonomi', exact: true })
          .filter({ hasText: 'Sparad skuld: 1 200 — datum för uppgiften: 2026-09-01' }),
      ).toBeVisible();
      await expect(
        object.getByRole('region', { name: 'Sparad ekonomi', exact: true }).filter({
          hasText: 'Sparad skuld: 2 000 (Osäkert uppgivet) — datum för uppgiften: 2026-09-02',
        }),
      ).toBeVisible();
      for (const value of ['Tidigare dold uppgift', 'Min dolda uppgift', 'Annans dolda uppgift'])
        await expect(object.getByText(`Dold anteckning: ${value}`, { exact: true })).toBeVisible();
      await expect(
        review.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
      ).toBeDisabled();
      expect(await app.read()).toEqual(unchanged);
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
        3,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await review.getByRole('button', { name: 'Behåll min typdefinition', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(
        review.getByRole('heading', { name: 'Hela mitt utkast', exact: true }),
      ).toBeFocused();
      await expectFocusedTargetUncovered(page);
      await expect(status.getByText('Visa 3 konflikter', { exact: true })).toBeVisible();
      await expect(
        review.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
      ).toBeDisabled();
      expect(await app.read()).toMatchObject({
        objects: unchanged.objects,
        relationships: unchanged.relationships,
        types: unchanged.types,
        relationshipTypes: unchanged.relationshipTypes,
      });
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
        3,
      );
    } finally {
      await other.close();
      await app.installation.close();
    }
  });
}

test('UTKAST-19: an own object correction preserves unsent work and independent saved facts until a fresh save', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const { types } = await app.read();
    const value = { typeId: types[0].id, name: 'Lo Lind', description: '' };
    await app.propose(page.request, 'draft', 'lo', value);
    await app.propose(other.request, 'draft', 'lo', {
      ...value,
      name: 'Lo Berg',
      description: 'Spelar piano',
    });
    expect((await app.save(other.request, 'independent-description')).status()).toBe(200);
    const saved = await app.read();
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const unsent = page.getByRole('region', { name: 'Nytt objekt', exact: true });
    await unsent.getByLabel('Objektets namn').fill('Oskickad cykel');
    await unsent.getByLabel('Beskrivning', { exact: true }).fill('Behåll den här texten');
    await openMap(page);
    const status = page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });
    await status.getByText('Visa 1 konflikt', { exact: true }).click();
    await status.getByRole('button', { name: 'Objekt: Lo Lind', exact: true }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
    await review.getByRole('button', { name: 'Rätta objektet', exact: true }).focus();
    await page.keyboard.press('Enter');
    const correction = page.getByRole('region', { name: 'Lo Lind', exact: true });
    await expect(correction.getByRole('heading', { name: 'Lo Lind', exact: true })).toBeFocused();
    await expectFocusedTargetUncovered(page);
    await expect(correction.getByLabel('Objektets namn')).toHaveValue('Lo Lind');
    await correction.getByLabel('Objektets namn').fill('Lo Alm');
    await correction.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await expect(
      review.getByRole('heading', { name: 'Ändring: Lo Alm', exact: true }),
    ).toBeVisible();
    await expect(review.getByRole('button', { name: 'Behåll mitt förslag' })).toBeDisabled();
    await status.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(unsent.getByLabel('Objektets namn')).toHaveValue('Oskickad cykel');
    await expect(unsent.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Behåll den här texten',
    );
    const corrected = await app.read();
    expect(corrected.objects).toEqual(saved.objects);
    expect(corrected.draft.changes).toHaveLength(1);
    expect(corrected.draft.changes[0].after?.name).toBe('Lo Alm');
    expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(2);
    await unsent.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
    expect((await app.read()).objects).toEqual(saved.objects);
    expect((await app.read()).draft.changes[0].after).toMatchObject({
      name: 'Lo Alm',
      description: 'Spelar piano',
    });
    expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(2);
    await review.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat: Lo Alm');
    expect((await app.read(other.request)).objects.find(({ id }) => id === 'lo')).toMatchObject({
      name: 'Lo Alm',
      description: 'Spelar piano',
    });
    expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(3);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

for (const width of [1440, 390]) {
  test(`UTKAST-20: a relationship correction replaces a deleted endpoint and still requires a fresh save at ${width}px`, async ({
    page,
    browser,
  }) => {
    const other = await browser.newContext();
    const app = await collaborators(page.request, other.request, [
      ['lo', 'Lo Exempel'],
      ['service', 'Molnmusik'],
      ['garage', 'Garaget'],
    ]);
    try {
      await page.setViewportSize({ width, height: 900 });
      const state = await app.read();
      const edge: RelationshipValue = {
        typeId: state.relationshipTypes[0].id,
        sourceId: 'lo',
        targetId: 'service',
        knowledge: 'uncertain',
      };
      await app.propose(page.request, 'relationship', 'pending-edge', edge);
      await app.propose(page.request, 'draft', 'independent', {
        typeId: state.types[0].id,
        name: 'Privat stol',
        description: '',
      });
      await app.propose(other.request, 'draft', 'service', null);
      expect((await app.save(other.request, 'delete-endpoint')).status()).toBe(200);
      expect((await app.save(page.request, 'blocked-endpoint')).status()).toBe(409);
      const saved = await app.read();
      await page.goto(app.installation.origin);
      await openMap(page);
      const status = page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });
      await status.getByText('Visa 1 konflikt', { exact: true }).click();
      await status
        .getByRole('button', {
          name: 'Samband: Lo Exempel → Använder → Molnmusik (Osäkert uppgivet)',
          exact: true,
        })
        .click();
      const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
      await expect(review).toContainText('Sambandet hänvisar till ett borttaget objekt');
      await expect(review.getByRole('button', { name: 'Behåll mitt förslag' })).toHaveCount(0);
      await review.getByRole('button', { name: 'Rätta sambandet', exact: true }).focus();
      await page.keyboard.press('Enter');
      const editor = page.getByRole('group', { name: 'Sambandets detaljer', exact: true });
      await expect(editor.getByLabel('Från objekt')).toBeFocused();
      await expectFocusedTargetUncovered(page);
      await expect(editor.getByLabel('Från objekt')).toHaveValue('lo');
      await expect(editor.getByLabel('Sambandstyp', { exact: true })).toHaveValue(edge.typeId);
      await expect(editor.getByLabel('Uppgiftens säkerhet', { exact: true })).toHaveValue(
        'uncertain',
      );
      await expect(
        editor.getByLabel('Till objekt').getByRole('option', { name: /Molnmusik/ }),
      ).toHaveCount(0);
      await editor.getByLabel('Till objekt').selectOption('garage');
      await editor.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
      await expect(review).not.toContainText('Sambandet hänvisar till ett borttaget objekt');
      await expect(review).toContainText('Lo Exempel → Använder → Garaget (Osäkert uppgivet)');
      await expect(review).toContainText('Privat stol');
      const corrected = await app.read();
      expect(corrected.objects).toEqual(saved.objects);
      expect(corrected.relationships).toEqual([]);
      expect(corrected.draft.relationships?.[0]).toMatchObject({
        id: 'pending-edge',
        before: null,
        after: { ...edge, targetId: 'garage' },
      });
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
        2,
      );
      await review.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Sparat:');
      const shared = await app.read(other.request);
      expect(shared.relationships).toEqual([
        expect.objectContaining({ id: 'pending-edge', ...edge, targetId: 'garage' }),
      ]);
      expect(shared.objects.some(({ name }) => name === 'Privat stol')).toBe(true);
      expect(shared.objects.some(({ id }) => id === 'service')).toBe(false);
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
        3,
      );
    } finally {
      await other.close();
      await app.installation.close();
    }
  });
}

for (const kind of ['object-type', 'relationship-type'] as const) {
  for (const width of [1440, 390]) {
    test(`UTKAST-21: ${kind} correction opens retained settings and preserves independent edits until a fresh save at ${width}px`, async ({
      page,
      browser,
    }) => {
      const other = await browser.newContext();
      const app = await collaborators(page.request, other.request);
      try {
        await page.setViewportSize({ width, height: 844 });
        const initial = await app.read();
        const isObjectType = kind === 'object-type';
        const type = isObjectType ? initial.types[0] : initial.relationshipTypes[0];
        const definition = {
          name: type.name,
          description: type.description,
          fields: type.fields ?? [],
          sections: type.sections,
          ...(isObjectType
            ? {
                builtins: initial.types[0].builtins,
                propertyOrder: initial.types[0].propertyOrder,
              }
            : {
                forwardLabel: initial.relationshipTypes[0].forwardLabel ?? type.name,
                reverseLabel: initial.relationshipTypes[0].reverseLabel ?? type.name,
              }),
        };
        for (const [client, name, description] of [
          [page.request, 'Min typ', definition.description],
          [other.request, 'Annans typ', 'Oberoende typförklaring'],
        ] as const) {
          const state = await app.read(client);
          expect(
            (
              await app.post(client, kind, {
                version: state.draft.version,
                id: type.id,
                baseRevision: type.revision,
                value: { ...definition, name, description },
              })
            ).status(),
          ).toBe(200);
        }
        expect((await app.save(other.request, 'other-type')).status()).toBe(200);
        const saved = await app.read();
        expect((await app.save(page.request, 'blocked-type')).status()).toBe(409);
        expect((await app.read()).draft).toEqual(saved.draft);
        await page.goto(app.installation.origin);
        await openWorkspace(page);
        await openMap(page);
        const status = page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });
        await status.getByText('Visa 1 konflikt', { exact: true }).click();
        await status
          .getByRole('button', {
            name: `${isObjectType ? 'Objekttyp' : 'Sambandstyp'}: Min typ`,
            exact: true,
          })
          .click();
        const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
        await expect(review).toContainText('Annans typ');
        await expect(review).toContainText('Oberoende typförklaring');
        await review
          .getByRole('button', {
            name: isObjectType ? 'Rätta objekttypen' : 'Rätta sambandstypen',
            exact: true,
          })
          .focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/settings\/types$/);
        await expect(
          page.getByRole('heading', { name: 'Typer och egna fält', exact: true }),
        ).toBeFocused();
        await expectFocusedTargetUncovered(page);
        const editor = page.getByRole('group', {
          name: isObjectType ? 'Objekttypens definition' : 'Sambandstypens definition',
          exact: true,
        });
        const name = editor.getByLabel(isObjectType ? 'Typens namn' : 'Sambandstypens namn', {
          exact: true,
        });
        await expect(name).toHaveValue('Min typ');
        await name.fill('Rättad typ');
        await editor
          .getByRole('button', {
            name: isObjectType
              ? 'Lägg typförslaget i mitt utkast'
              : 'Lägg sambandstypen i mitt utkast',
            exact: true,
          })
          .click();
        await expect(editor).toHaveCount(0);
        await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
        await openWorkspace(page);
        await expect(review).toContainText('Rättad typ');
        await review
          .getByRole('button', {
            name: isObjectType ? 'Behåll min typdefinition' : 'Behåll min sambandstyp',
            exact: true,
          })
          .click();
        await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
        const corrected = await app.read();
        expect(corrected.types).toEqual(saved.types);
        expect(corrected.relationshipTypes).toEqual(saved.relationshipTypes);
        expect(corrected.objects).toEqual(saved.objects);
        expect(corrected.relationships).toEqual(saved.relationships);
        const changes = isObjectType
          ? corrected.draft.objectTypes
          : corrected.draft.relationshipTypes;
        expect(changes).toEqual([
          expect.objectContaining({
            id: type.id,
            after: expect.objectContaining({
              name: 'Rättad typ',
              description: 'Oberoende typförklaring',
            }),
          }),
        ]);
        expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
          2,
        );
        await review.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Sparat:');
        const shared = await app.read(other.request);
        expect(
          (isObjectType ? shared.types : shared.relationshipTypes).find(({ id }) => id === type.id),
        ).toMatchObject({
          id: type.id,
          name: 'Rättad typ',
          description: 'Oberoende typförklaring',
          revision: type.revision + 2,
        });
        expect(shared.objects).toEqual(saved.objects);
        expect(shared.relationships).toEqual(saved.relationships);
        expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
          3,
        );
      } finally {
        await other.close();
        await app.installation.close();
      }
    });
  }
}

for (const choice of ['saved', 'proposed'] as const) {
  test(`UTKAST-22: a ${choice} conflict choice returns focus to the draft without saving`, async ({
    page,
    browser,
  }) => {
    const other = await browser.newContext();
    const app = await collaborators(page.request, other.request);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      const initial = await app.read();
      const value = { typeId: initial.types[0].id, name: 'Lo Lind', description: '' };
      await app.propose(page.request, 'draft', 'lo', value);
      await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Lo Berg' });
      expect((await app.save(other.request, 'other-name')).status()).toBe(200);
      const saved = await app.read();
      await page.goto(app.installation.origin);
      await openWorkspace(page);
      await openMap(page);
      const status = page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });
      await status.getByText('Visa 1 konflikt', { exact: true }).click();
      await status.getByRole('button', { name: 'Objekt: Lo Lind', exact: true }).click();
      const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
      const decision = review.getByRole('button', {
        name: choice === 'saved' ? 'Använd sparat värde' : 'Behåll mitt förslag',
        exact: true,
      });
      await decision.focus();
      await page.keyboard.press('Enter');
      await expect(
        review.getByRole('heading', { name: 'Hela mitt utkast', exact: true }),
      ).toBeFocused();
      await expectFocusedTargetUncovered(page);
      await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
      await expect(review).not.toContainText('Konflikt: sparat i kartan nu');
      const resolved = await app.read();
      expect(resolved.objects).toEqual(saved.objects);
      expect(resolved.relationships).toEqual(saved.relationships);
      expect(resolved.draft.changes).toHaveLength(choice === 'saved' ? 0 : 1);
      if (choice === 'proposed') expect(resolved.draft.changes[0].after?.name).toBe('Lo Lind');
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(
        2,
      );
    } finally {
      await other.close();
      await app.installation.close();
    }
  });
}

test('UTKAST-23: delayed conflict resolution preserves a newer search and the private result', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const initial = await app.read();
    const value = { typeId: initial.types[0].id, name: 'Lo Lind', description: '' };
    await app.propose(page.request, 'draft', 'lo', value);
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Lo Berg' });
    expect((await app.save(other.request, 'other-name')).status()).toBe(200);
    const saved = await app.read();
    let resolved = false;
    await page.route('**/map/resolve', async (route) => {
      const response = await route.fetch();
      resolved = true;
      await held;
      await route.fulfill({ response });
    });
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
    const decision = review.getByRole('button', { name: 'Behåll mitt förslag', exact: true });
    await decision.click();
    await expect.poll(() => resolved).toBe(true);
    await expect(decision).toBeDisabled();
    const search = page.getByRole('searchbox', { name: 'Sök objekt', exact: true });
    await search.fill('Lo');
    release();
    await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('Lo');
    await expectFocusedTargetUncovered(page);
    const state = await app.read();
    expect(state.objects).toEqual(saved.objects);
    expect(state.relationships).toEqual(saved.relationships);
    expect(state.draft.changes[0].after?.name).toBe('Lo Lind');
    expect((await (await page.request.get(`${app.path}/history`)).json()).history).toHaveLength(2);
  } finally {
    release();
    await other.close();
    await app.installation.close();
  }
});

for (const width of [1440, 390]) {
  test(`UTKAST-24: lost resolution and save responses recover the private choice and one fresh receipt at ${width}px`, async ({
    page,
    browser,
  }) => {
    const other = await browser.newContext();
    const app = await collaborators(page.request, other.request);
    try {
      await page.setViewportSize({ width, height: 844 });
      const initial = await app.read();
      const value = { typeId: initial.types[0].id, name: 'Lo Lind', description: '' };
      await app.propose(page.request, 'draft', 'lo', value);
      await app.propose(page.request, 'draft', 'chair', { ...value, name: 'Privat stol' });
      await app.propose(other.request, 'draft', 'lo', {
        ...value,
        name: 'Lo Berg',
        description: 'Spelar piano',
      });
      expect((await app.save(other.request, 'other-name')).status()).toBe(200);
      const saved = await app.read();
      const historyBefore = (await (await page.request.get(`${app.path}/history`)).json()).history;
      const operationsBefore = (await (await page.request.get(`${app.path}/operations`)).json())
        .operations;
      let privateResult: MapState['draft'] | undefined;
      await page.route('**/map/resolve', async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        privateResult = await response.json();
        await route.abort('failed');
      });
      await page.goto(app.installation.origin);
      await openWorkspace(page);
      const review = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
      await review.getByRole('button', { name: 'Behåll mitt förslag', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Ändringen kunde inte bekräftas');
      await expect(
        review.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
      ).toBeDisabled();
      expect(privateResult).toBeDefined();
      const resolved = await app.read();
      expect(resolved.draft).toEqual(privateResult);
      expect(resolved.draft.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'lo',
            after: expect.objectContaining({ name: 'Lo Lind', description: 'Spelar piano' }),
          }),
          expect.objectContaining({
            id: 'chair',
            after: expect.objectContaining({ name: 'Privat stol' }),
          }),
        ]),
      );
      expect(resolved.objects).toEqual(saved.objects);
      expect(resolved.relationships).toEqual(saved.relationships);
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toEqual(
        historyBefore,
      );
      expect((await (await page.request.get(`${app.path}/operations`)).json()).operations).toEqual(
        operationsBefore,
      );
      await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
      await expect(review).not.toContainText('Konflikt: sparat i kartan nu');
      await expect(review).toContainText('Spelar piano');
      await expect(
        review.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
      ).toBeEnabled();
      await page.reload();
      await openWorkspace(page);
      await expect(review).toContainText('Lo Lind');
      await expect(review).toContainText('Privat stol');
      expect((await app.read()).draft).toEqual(privateResult);
      expect((await app.read(other.request)).objects).toEqual(saved.objects);
      await openMap(page);
      const status = page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });
      await expect(status).toContainText('2 förslag · privat utkast');
      let receipt: SaveReceipt | undefined;
      let saveRequests = 0;
      await page.route('**/map/save', async (route) => {
        saveRequests += 1;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        receipt = (await response.json()).receipt;
        await route.abort('failed');
      });
      await status.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      await expect(status).toContainText('Sparutfall okänt');
      await expect(
        status.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
      ).toBeDisabled();
      expect(receipt).toBeDefined();
      await status.getByRole('button', { name: 'Hämta samma kvitto igen', exact: true }).click();
      await expect(status).toContainText('Sparat · kvitto bekräftat');
      await expect(status).toContainText('Inga osparade förslag');
      const shared = await app.read(other.request);
      expect(shared.objects.find(({ id }) => id === 'lo')).toMatchObject({
        name: 'Lo Lind',
        description: 'Spelar piano',
      });
      expect(shared.objects.find(({ id }) => id === 'chair')).toMatchObject({
        name: 'Privat stol',
      });
      expect((await app.read()).draft.changes).toEqual([]);
      expect(saveRequests).toBe(1);
      expect((await (await page.request.get(`${app.path}/history`)).json()).history).toEqual([
        ...historyBefore,
        receipt,
      ]);
      const { operations } = await (await page.request.get(`${app.path}/operations`)).json();
      expect(operations).toHaveLength(operationsBefore.length + 1);
      expect(operations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            operationId: receipt?.operationId,
            status: 'succeeded',
            receipt,
          }),
        ]),
      );
    } finally {
      await other.close();
      await app.installation.close();
    }
  });
}

test('UTKAST-05: a conflict choice preserves independent proposals and requires a new save', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const { installation, path, read, propose, save } = await collaborators(
    page.request,
    other.request,
    [['lo', 'Lo Exempel']],
  );
  try {
    await propose(page.request, 'draft', 'alex', {
      typeId: (await read()).types[0].id,
      name: 'Alex Exempel',
      description: '',
    });
    await propose(page.request, 'draft', 'lo', {
      typeId: (await read()).types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    await page.goto(installation.origin);
    await openWorkspace(page);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeEnabled();
    await propose(other.request, 'draft', 'lo', {
      typeId: (await read()).types[0].id,
      name: 'Lo Berg',
      description: '',
    });
    expect((await save(other.request, 'other')).status()).toBe(200);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Inget sparades');
    expect((await read()).objects.map((object) => object.name)).toEqual(['Lo Berg']);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toHaveLength(2);
    await page.getByRole('button', { name: 'Hämta aktuellt underlag' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Exempel');
    await expect(review).toContainText('Lo Berg');
    await expect(review).toContainText('Lo Lind');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(review).toContainText('Alex Exempel');
    await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
    expect((await read()).objects[0].name).toBe('Lo Berg');
    await installation.restart();
    await page.reload();
    await openWorkspace(page);
    await expect(review).toContainText('Lo Lind');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    expect((await read(other.request)).objects.map((object) => object.name)).toEqual([
      'Alex Exempel',
      'Lo Lind',
    ]);
  } finally {
    await other.close();
    await installation.close();
  }
});

async function collaborators(
  first: APIRequestContext,
  second: APIRequestContext,
  seeds = [
    ['lo', 'Lo Exempel'],
    ['service', 'Molnmusik'],
  ],
) {
  const installation = await createInstallation();
  await signIn(first, installation.origin);
  const { household } = await (await createHousehold(first, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}/map`;
  const post = (client: APIRequestContext, route: string, data: unknown) =>
    client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
  const read = async (client = first): Promise<MapState> => (await client.get(path)).json();
  async function propose(
    client: APIRequestContext,
    kind: 'draft' | 'relationship',
    id: string,
    value: ObjectValue | RelationshipValue | null,
  ) {
    const state = await read(client);
    const previous = (kind === 'draft' ? state.objects : state.relationships).find(
      (item) => item.id === id,
    );
    expect(
      (
        await post(client, kind, {
          version: state.draft.version,
          id,
          baseRevision: previous?.revision ?? null,
          value,
        })
      ).status(),
    ).toBe(200);
  }
  const save = async (client: APIRequestContext, operationId: string) =>
    post(client, 'save', { version: (await read(client)).draft.version, operationId });
  installation.setIdentity(robin);
  await signIn(second, installation.origin);
  const { user } = await (await second.get(`${installation.origin}/api/bootstrap`)).json();
  const { code } = await (
    await first.post(`${installation.origin}/api/households/${household.id}/invitations`, {
      headers: { origin: installation.origin },
      data: { userId: user.id },
    })
  ).json();
  expect(
    (
      await second.post(`${installation.origin}/api/invitations/accept`, {
        headers: { origin: installation.origin },
        data: { code },
      })
    ).status(),
  ).toBe(200);
  const state = await read();
  for (const [id, name] of seeds) {
    await propose(first, 'draft', id, { typeId: state.types[0].id, name, description: '' });
  }
  expect((await save(first, 'initial')).status()).toBe(200);
  return { installation, path, post, read, propose, save, userId: user.id };
}

test('UTKAST-06: deleting an object requires reviewing newly saved relationships', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    await app.propose(page.request, 'draft', 'lo', null);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeEnabled();
    await app.propose(other.request, 'relationship', 'new-edge', {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'uncertain',
    });
    expect((await app.save(other.request, 'new-edge')).status()).toBe(200);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Inget sparades');
    await page.getByRole('button', { name: 'Hämta aktuellt underlag' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Exempel → Använder → Molnmusik (Osäkert uppgivet)');
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(review).toContainText('Borttagning av samband');
    expect((await app.read()).relationships).toHaveLength(1);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    const saved = await app.read(other.request);
    expect(saved.relationships).toEqual([]);
    expect(saved.objects.map((object) => object.name)).toEqual(['Molnmusik']);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-07: overlapping relationship proposals show meanings and can accept the saved value', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    const value: RelationshipValue = {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'known',
    };
    await app.propose(page.request, 'relationship', 'edge', value);
    expect((await app.save(page.request, 'edge')).status()).toBe(200);
    await app.propose(page.request, 'relationship', 'edge', { ...value, knowledge: 'uncertain' });
    await app.propose(other.request, 'relationship', 'edge', {
      ...value,
      targetId: null,
      knowledge: 'none',
    });
    expect((await app.save(other.request, 'other-edge')).status()).toBe(200);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Osäkert uppgivet');
    await expect(review).toContainText('Uttryckligen inget');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await review.getByRole('button', { name: 'Använd sparat värde' }).click();
    await expect(review).toContainText('Inga förslag');
    expect((await app.read()).relationships[0].knowledge).toBe('none');
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-10: relationship choices preserve independent status and keep date certainty with its value', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    const value: RelationshipValue = {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'known',
    };
    await app.propose(page.request, 'relationship', 'edge', value);
    expect((await app.save(page.request, 'edge')).status()).toBe(200);
    await app.propose(page.request, 'relationship', 'edge', {
      ...value,
      endDate: { knowledge: 'known', value: '2031-04-12' },
    });
    await app.propose(other.request, 'relationship', 'edge', { ...value, lifecycle: 'ended' });
    expect((await app.save(other.request, 'ended')).status()).toBe(200);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Upphört');
    await expect(review).toContainText('2031-04-12');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
    expect((await app.read()).relationships[0]).not.toHaveProperty('endDate');
    await app.installation.restart();
    await page.reload();
    await openWorkspace(page);
    await expect(review).toContainText('Upphört');
    await expect(review).toContainText('2031-04-12');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    const first = (await app.read(other.request)).relationships[0];
    expect(first).toMatchObject({
      lifecycle: 'ended',
      endDate: { knowledge: 'known', value: '2031-04-12' },
    });

    await app.propose(page.request, 'relationship', 'edge', {
      ...first,
      endDate: { knowledge: 'uncertain', value: '2031-04-12' },
    });
    await app.propose(other.request, 'relationship', 'edge', {
      ...first,
      lifecycle: 'active',
      endDate: { knowledge: 'known', value: '2031-05-15' },
    });
    expect((await app.save(other.request, 'changed-date')).status()).toBe(200);
    await page.reload();
    await openWorkspace(page);
    await expect(review).toContainText('2031-04-12 (Osäkert uppgivet)');
    await expect(review).toContainText('2031-05-15');
    await expect(review).toContainText('Gäller fortfarande');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    expect((await app.read()).relationships[0].endDate).toEqual({
      knowledge: 'known',
      value: '2031-05-15',
    });
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    expect((await app.read(other.request)).relationships[0]).toMatchObject({
      lifecycle: 'active',
      endDate: { knowledge: 'uncertain', value: '2031-04-12' },
    });
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-11: deletion after concurrent type changes retains the matching historical definitions', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    const value: RelationshipValue = {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'known',
    };
    await app.propose(page.request, 'relationship', 'edge', value);
    expect((await app.save(page.request, 'edge')).status()).toBe(200);
    await app.propose(page.request, 'draft', 'lo', null);
    await app.propose(other.request, 'draft', 'lo', {
      name: 'Lo Exempel',
      description: '',
      typeId: state.types[1].id,
    });
    await app.propose(other.request, 'relationship', 'edge', {
      ...value,
      typeId: state.relationshipTypes[1].id,
    });
    expect((await app.save(other.request, 'changed-types')).status()).toBe(200);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText(state.types[1].name);
    await expect(review).toContainText(state.relationshipTypes[1].name);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await expect(review.getByRole('button', { name: 'Behåll mitt förslag' })).toHaveCount(2);
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).first().click();
    await expect(review.getByRole('button', { name: 'Behåll mitt förslag' })).toHaveCount(1);
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    expect((await app.read(other.request)).relationships).toHaveLength(1);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    const saved = await app.read(other.request);
    expect(saved.objects.map((object) => object.id)).toEqual(['service']);
    expect(saved.relationships).toEqual([]);
    const { history } = await (await page.request.get(`${app.path}/history`)).json();
    expect(history.at(-1)).toMatchObject({
      changes: [{ before: { typeId: state.types[1].id }, after: null, type: state.types[1] }],
      relationships: [
        {
          before: { typeId: state.relationshipTypes[1].id },
          after: null,
          type: state.relationshipTypes[1],
        },
      ],
    });
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-08: a saved duplicate can be selected without losing another proposal', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    const value: RelationshipValue = {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'known',
    };
    await app.propose(page.request, 'relationship', 'my-edge', value);
    await app.propose(page.request, 'draft', 'independent', {
      typeId: state.types[0].id,
      name: 'Kim Exempel',
      description: '',
    });
    await app.propose(other.request, 'relationship', 'other-edge', value);
    expect((await app.save(other.request, 'other-edge')).status()).toBe(200);
    expect((await app.save(page.request, 'blocked-duplicate')).status()).toBe(409);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Samma samband finns redan');
    await review.getByRole('button', { name: 'Använd sparat värde' }).click();
    await expect(review).not.toContainText('Konflikt');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat: Kim Exempel');
    const saved = await app.read();
    expect(saved.relationships.map((edge) => edge.id)).toEqual(['other-edge']);
    expect(saved.objects.map((object) => object.name)).toContain('Kim Exempel');
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-09: a deleted relationship endpoint has an explicit recovery choice', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    await app.propose(page.request, 'relationship', 'pending-edge', {
      typeId: state.relationshipTypes[0].id,
      sourceId: 'lo',
      targetId: 'service',
      knowledge: 'uncertain',
    });
    await app.propose(other.request, 'draft', 'service', null);
    expect((await app.save(other.request, 'delete-service')).status()).toBe(200);
    expect((await app.save(page.request, 'blocked-endpoint')).status()).toBe(409);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Sambandet hänvisar till ett borttaget objekt');
    await app.installation.restart();
    await page.reload();
    await openWorkspace(page);
    await expect(review).toContainText('Lo Exempel → Använder → Molnmusik (Osäkert uppgivet)');
    await expect(review.getByRole('button', { name: 'Behåll mitt förslag' })).toHaveCount(0);
    await review.getByRole('button', { name: 'Använd sparat värde' }).click();
    await expect(review).toContainText('Inga förslag');
    expect((await app.read()).relationships).toEqual([]);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('HTTP clients reject stale conflict choices and enforce private drafts and revoked membership', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const sameUser = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    let state = await app.read();
    const value = { typeId: state.types[0].id, name: 'Lo Lind', description: '' };
    await app.propose(page.request, 'draft', 'lo', value);
    expect((await app.read(other.request)).draft.changes).toEqual([]);
    app.installation.setIdentity(alex);
    await signIn(sameUser.request, app.installation.origin);
    expect((await app.read(sameUser.request)).draft).toEqual((await app.read()).draft);
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Lo Berg' });
    expect((await app.save(other.request, 'first-conflict')).status()).toBe(200);
    state = await app.read();
    const resolution = {
      version: state.draft.version,
      conflict: {
        kind: 'object',
        id: 'lo',
        current: state.objects.find((object) => object.id === 'lo'),
      },
      choice: 'proposed',
    };
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Lo Ek' });
    expect((await app.save(other.request, 'second-conflict')).status()).toBe(200);
    expect((await app.post(page.request, 'resolve', resolution)).status()).toBe(409);
    expect((await app.read()).draft).toEqual(state.draft);
    state = await app.read();
    const currentResolution = {
      ...resolution,
      conflict: {
        ...resolution.conflict,
        current: state.objects.find((object) => object.id === 'lo'),
      },
    };
    expect(
      (
        await app.post(page.request, 'resolve', { ...currentResolution, choice: 'anything' })
      ).status(),
    ).toBe(400);
    expect((await app.post(sameUser.request, 'resolve', currentResolution)).status()).toBe(200);
    const resolved = (await app.read()).draft;
    for (const [route, body] of [
      ['resolve', currentResolution],
      ['discard', { version: state.draft.version }],
      ['draft', { version: state.draft.version, id: 'lo', baseRevision: 1, value }],
      ['save', { version: state.draft.version, operationId: 'old-approval' }],
    ] as const) {
      expect((await app.post(page.request, route, body)).status()).toBe(409);
      expect((await app.read()).draft).toEqual(resolved);
    }
    const { user: owner } = await (
      await page.request.get(`${app.installation.origin}/api/bootstrap`)
    ).json();
    const privateRead = await (await other.request.get(`${app.path}?userId=${owner.id}`)).json();
    expect(privateRead.draft.changes).toEqual([]);
    expect(
      (
        await app.post(other.request, 'resolve', { ...currentResolution, userId: owner.id })
      ).status(),
    ).toBe(409);
    expect((await app.read()).draft).toEqual(resolved);
    expect((await app.save(page.request, 'fresh-approval')).status()).toBe(200);
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Robin privat' });
    expect(
      (
        await page.request.post(`${app.path.replace('/map', '')}/members/${app.userId}/revoke`, {
          headers: { origin: app.installation.origin },
          data: {},
        })
      ).status(),
    ).toBe(200);
    for (const route of ['draft', 'relationship', 'resolve', 'save', 'discard'])
      expect(
        (
          await app.post(other.request, route, { ...currentResolution, operationId: 'revoked' })
        ).status(),
      ).toBe(403);
    expect((await other.request.get(app.path)).status()).toBe(403);
    expect((await other.request.get(`${app.path}/history`)).status()).toBe(403);
  } finally {
    await sameUser.close();
    await other.close();
    await app.installation.close();
  }
});

test('resolving an object preserves fields changed only by the other user', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    const value = { typeId: state.types[0].id, name: 'Lo Lind', description: '' };
    await app.propose(page.request, 'draft', 'lo', value);
    await app.propose(other.request, 'draft', 'lo', {
      ...value,
      name: 'Lo Exempel',
      description: 'Spelar piano',
    });
    expect((await app.save(other.request, 'description')).status()).toBe(200);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Lind');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    expect((await app.read()).objects.find((object) => object.id === 'lo')).toMatchObject({
      name: 'Lo Lind',
      description: 'Spelar piano',
    });
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('independent users save unrelated objects without a meaningless conflict', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const state = await app.read();
    await app.propose(page.request, 'draft', 'lo', {
      typeId: state.types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    await app.propose(other.request, 'draft', 'service', {
      typeId: state.types[0].id,
      name: 'Ny musiktjänst',
      description: '',
    });
    expect((await app.save(other.request, 'service-change')).status()).toBe(200);
    expect((await app.save(page.request, 'person-change')).status()).toBe(200);
    await app.installation.restart();
    for (const client of [page.request, other.request])
      expect((await app.read(client)).objects.map((object) => object.name)).toEqual([
        'Lo Lind',
        'Ny musiktjänst',
      ]);
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-02: a stale discard preserves newer object and relationship proposals', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  const newer = await page.context().newPage();
  try {
    const initial = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await app.propose(page.request, 'draft', 'lo', {
      typeId: initial.types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText('Lo Lind');
    await newer.goto(app.installation.origin);
    await openWorkspace(newer);
    await newer.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await newer.getByLabel('Från objekt').selectOption('lo');
    await newer
      .getByLabel('Sambandstyp', { exact: true })
      .selectOption(initial.relationshipTypes[0].id);
    await newer.getByLabel('Till objekt').selectOption('service');
    await newer.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await expect(newer.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Lo Lind → Använder → Molnmusik',
    );
    const updated = await app.read();
    await page.getByRole('button', { name: 'Kasta hela utkastet' }).click();
    await expect(page.getByRole('alert')).toContainText('Förslaget eller kartan har ändrats');
    expect((await app.read()).draft).toEqual(updated.draft);
    await expect(page.getByRole('button', { name: 'Kasta hela utkastet' })).toBeDisabled();
    await page.getByRole('button', { name: 'Hämta aktuellt underlag' }).click();
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Lind → Använder → Molnmusik');
    await page.getByRole('button', { name: 'Kasta hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Utkastet är kastat');
    await page.reload();
    await openWorkspace(page);
    await expect(review).toContainText('Inga förslag');
    const discarded = await app.read();
    expect(discarded.draft.changes).toEqual([]);
    expect(discarded.draft.relationships ?? []).toEqual([]);
    expect(discarded.objects).toEqual(initial.objects);
    expect(discarded.relationships).toEqual(initial.relationships);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
  } finally {
    await newer.close();
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-03: a stale conflict choice requires refreshed review before saving', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const { types } = await app.read();
    const value = { typeId: types[0].id, name: 'Lo Lind', description: '' };
    await app.propose(page.request, 'draft', 'lo', value);
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Lo Berg' });
    expect((await app.save(other.request, 'first-change')).status()).toBe(200);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Lo Berg');
    const beforeChoice = (await app.read()).draft;
    await app.propose(other.request, 'draft', 'lo', { ...value, name: 'Lo Ek' });
    expect((await app.save(other.request, 'second-change')).status()).toBe(200);
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(page.getByRole('alert')).toContainText('Förslaget eller kartan har ändrats');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    expect((await app.read()).draft).toEqual(beforeChoice);
    await page.getByRole('button', { name: 'Hämta aktuellt underlag' }).click();
    await expect(review).toContainText('Lo Ek');
    await expect(review).toContainText('Lo Lind');
    await review.getByRole('button', { name: 'Behåll mitt förslag' }).click();
    await expect(page.getByRole('status')).toContainText('Granska hela utkastet');
    expect((await app.read()).objects.find((object) => object.id === 'lo')?.name).toBe('Lo Ek');
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat: Lo Lind');
    expect((await app.read(other.request)).objects.find((object) => object.id === 'lo')?.name).toBe(
      'Lo Lind',
    );
  } finally {
    await other.close();
    await app.installation.close();
  }
});

test('UTKAST-04: accepting a deleted object preserves an independent proposal', async ({
  page,
  browser,
}) => {
  const other = await browser.newContext();
  const app = await collaborators(page.request, other.request);
  try {
    const { types } = await app.read();
    await app.propose(page.request, 'draft', 'lo', {
      typeId: types[0].id,
      name: 'Lo Lind',
      description: '',
    });
    await app.propose(page.request, 'draft', 'independent', {
      typeId: types[0].id,
      name: 'Kim Exempel',
      description: '',
    });
    await app.propose(other.request, 'draft', 'lo', null);
    expect((await app.save(other.request, 'delete-lo')).status()).toBe(200);
    await page.goto(app.installation.origin);
    await openWorkspace(page);
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await expect(review).toContainText('Objektet eller sambandet är borttaget');
    await expect(review.getByRole('button', { name: 'Behåll mitt förslag' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await review.getByRole('button', { name: 'Använd sparat värde' }).click();
    await expect(review).not.toContainText('Lo Lind');
    await expect(review).toContainText('Kim Exempel');
    expect((await app.read()).objects.map((object) => object.name)).toEqual(['Molnmusik']);
    await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('status')).toContainText('Sparat: Kim Exempel');
    await page.reload();
    await openWorkspace(page);
    const objects = page.getByRole('list', { name: 'Objekt' });
    await expect(objects).toContainText('Kim Exempel');
    await expect(objects).toContainText('Molnmusik');
    await expect(objects).not.toContainText('Lo');
    expect((await app.read(other.request)).objects.map((object) => object.name)).toEqual([
      'Kim Exempel',
      'Molnmusik',
    ]);
  } finally {
    await other.close();
    await app.installation.close();
  }
});
