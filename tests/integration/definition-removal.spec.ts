import type { MapState } from '../../src/shared/map.js';
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
  expectConflictDraftValues,
  expectConflictReadValue,
  expectNoSavedConflictRelationships,
  expectSavedConflictDefinition,
  expectSavedConflictObject,
  expectSavedConflictRelationship,
  refreshConflictReader,
} from '../support/current-conflict-reading.js';
import { openTypeDefinitions, readDraftProposal } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function readRemovalProposal(
  page: import('@playwright/test').Page,
  name: string,
  values: Record<string, string>,
) {
  const proposal = await readDraftProposal(page, name);
  const previous = proposal
    .getByRole('heading', { name: 'Sparade värden', exact: true })
    .locator('..');
  for (const [label, value] of Object.entries(values))
    await expectConflictReadValue(previous, label, value);
  await expect(
    proposal.getByRole('heading', { name: 'Föreslagna värden', exact: true }),
  ).toHaveCount(0);
  await expect(proposal).toContainText('Tas bort');
  await closeSupportDialog(page, name);
}

test('KATALOG-01: unused fields and custom and prefilled types are reviewed, discarded or saved without automatic cleanup', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const type = initial.types[0];
    const edgeType = initial.relationshipTypes[0];
    const field = { id: 'serial', name: 'Serienummer', description: '', kind: 'text' };
    expect(
      (
        await post('object-type', {
          version: 0,
          id: type.id,
          baseRevision: type.revision,
          value: { ...type, fields: [field] },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post('object-type', {
          version: 1,
          id: 'solar',
          baseRevision: null,
          value: { name: 'Solcellsanläggning', description: '', fields: [] },
        })
      ).ok(),
    ).toBe(true);
    expect((await post('save', { version: 2, operationId: 'definitions' })).ok()).toBe(true);
    await page.goto(installation.origin);
    await openTypeDefinitions(page);
    await page.getByText('Objekttyper och egna fält', { exact: true }).click();
    await page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort fält: Serienummer' }).click();
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    const fieldProposal = await readDraftProposal(page, type.name);
    await expect(fieldProposal).toContainText('Serienummer');
    await expect(fieldProposal).toContainText('Text');
    await closeSupportDialog(page, type.name);
    await expectConflictDraftValues(
      page,
      type.name,
      {
        Namn: type.name,
        Beskrivning: type.description,
        'Eget fält: Serienummer': 'Text · Egna fält',
      },
      'Sparade värden',
    );
    await expectConflictDraftValues(page, type.name, {
      Namn: type.name,
      Beskrivning: type.description,
      'Eget fält: Serienummer': 'Ej uppgivet',
    });
    await closeTextView(page);
    await openTypeDefinitions(page);
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning' }).click();
    await page.getByRole('button', { name: 'Ta bort objekttypen' }).click();
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await page
      .getByRole('button', { name: `Ändra sambandstyp: ${edgeType.name}`, exact: true })
      .click();
    await page.getByRole('button', { name: 'Ta bort sambandstypen' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openDraftReview(page);
    await expect(draft.getByRole('row').filter({ hasText: 'Solcellsanläggning' })).toContainText(
      'Ta bort',
    );
    await expect(draft.getByRole('row').filter({ hasText: edgeType.name })).toContainText(
      'Ta bort',
    );
    await readRemovalProposal(page, 'Solcellsanläggning', {
      Namn: 'Solcellsanläggning',
      Beskrivning: 'Ej uppgivet',
      Avsnitt: 'Egna fält',
    });
    await readRemovalProposal(page, edgeType.name, {
      Namn: edgeType.name,
      Beskrivning: edgeType.description || 'Ej uppgivet',
      ...(edgeType.forwardLabel === undefined ? {} : { Framåtriktning: edgeType.forwardLabel }),
      ...(edgeType.reverseLabel === undefined ? {} : { 'Omvänd riktning': edgeType.reverseLabel }),
    });
    expect((await read()).types).toHaveLength(initial.types.length + 1);
    await page.getByRole('button', { name: 'Kasta hela utkastet' }).click();
    await page
      .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
      .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
      .click();
    await expect(draft).toContainText('Utkastet är tomt.');
    await closeTextView(page);
    await openTypeDefinitions(page);
    await expect(page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning' })).toBeVisible();
    await page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
    await expect(page.getByLabel('Fältets namn', { exact: true })).toHaveValue('Serienummer');
    await expect(page.getByLabel('Värdeslag', { exact: true })).toHaveValue('text');
    await page
      .getByRole('button', { name: 'Stäng typformuläret utan att skicka', exact: true })
      .click();
    await page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort fält: Serienummer' }).click();
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning' }).click();
    await page.getByRole('button', { name: 'Ta bort objekttypen' }).click();
    await page
      .getByRole('button', { name: `Ändra sambandstyp: ${edgeType.name}`, exact: true })
      .click();
    await page.getByRole('button', { name: 'Ta bort sambandstypen' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await openTable(page);
    const final = await read();
    expect(final.types.find((item) => item.id === type.id)?.fields).toBeUndefined();
    expect(final.types.find((item) => item.id === 'solar')).toBeUndefined();
    expect(final.relationshipTypes.find((item) => item.id === edgeType.id)).toBeUndefined();
    expect(final.types).toHaveLength(initial.types.length);
    expect(final.relationshipTypes).toHaveLength(initial.relationshipTypes.length - 1);
    await expectSavedConflictDefinition(page, true, type.name, type.description);
    await openTypeDefinitions(page);
    await expect(
      page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
    await expect(page.getByLabel('Fältets namn', { exact: true })).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Stäng typformuläret utan att skicka', exact: true })
      .click();
    await page.getByText('Sambandstyper och riktning', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: `Ändra sambandstyp: ${edgeType.name}`, exact: true }),
    ).toHaveCount(0);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openTable(page);
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const latest = page
      .getByRole('region', { name: 'Ändringshistorik' })
      .getByRole('article')
      .first();
    await latest.getByText('Visa ändringarna', { exact: true }).click();
    await expect(page.getByRole('region', { name: 'Ändringshistorik' })).toContainText(
      'Borttagen definition',
    );
    await expect(latest.getByText('Borttagen definition', { exact: true }).first()).toBeVisible();
    await expect(latest).toContainText('Serienummer: Text');
    await expect(latest).toContainText('Solcellsanläggning');
    await expect(latest).toContainText(edgeType.name);
  } finally {
    await installation.close();
  }
});

test('KATALOG-02: private drafts and ended content block removal with a useful explanation and no private disclosure', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const other = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (client = page.request): Promise<MapState> =>
      (await client.get(path)).json();
    const post = (route: string, data: unknown, client = page.request) =>
      client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const type = initial.types[0];
    const edgeType = initial.relationshipTypes[0];
    expect(
      (
        await post('object-type', {
          version: 0,
          id: type.id,
          baseRevision: type.revision,
          value: {
            ...type,
            fields: [{ id: 'serial', name: 'Serienummer', description: '', kind: 'text' }],
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post('draft', {
          version: 1,
          id: 'target',
          baseRevision: null,
          value: { typeId: initial.types[1].id, name: 'Garaget', description: '' },
        })
      ).ok(),
    ).toBe(true);
    expect((await post('save', { version: 2, operationId: 'initial' })).ok()).toBe(true);
    installation.setIdentity(robin);
    await signIn(other.request, installation.origin);
    const { user } = await (await other.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.request.post(`${installation.origin}/api/invitations/accept`, {
          headers: { origin: installation.origin },
          data: { code },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post(
          'draft',
          {
            version: 0,
            id: 'private',
            baseRevision: null,
            value: {
              typeId: type.id,
              name: 'Privat provnamn',
              description: '',
              lifecycle: 'ended',
              customValues: { serial: 'PRIVAT-PROVVÄRDE' },
            },
          },
          other.request,
        )
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post(
          'relationship',
          {
            version: 1,
            id: 'private-edge',
            baseRevision: null,
            value: {
              typeId: edgeType.id,
              sourceId: 'private',
              targetId: 'target',
              knowledge: 'known',
              lifecycle: 'ended',
            },
          },
          other.request,
        )
      ).ok(),
    ).toBe(true);
    await installation.restart();
    const memberPage = await other.newPage();
    await memberPage.goto(installation.origin);
    const readPrivate = async () => {
      await expectConflictDraftValues(memberPage, 'Privat provnamn', {
        Namn: 'Privat provnamn',
        Typ: type.name,
        Status: 'Manuellt upphört',
        Serienummer: 'PRIVAT-PROVVÄRDE',
      });
      await expectConflictDraftValues(
        memberPage,
        `Privat provnamn → ${edgeType.forwardLabel ?? edgeType.name} → Garaget`,
        {
          Från: 'Privat provnamn',
          Till: 'Garaget',
          Sambandstyp: edgeType.name,
          Gäller: 'Upphört',
        },
      );
      await closeTextView(memberPage);
    };
    await readPrivate();
    for (const stage of ['private', 'saved']) {
      if (stage === 'saved') {
        const savedResponse = memberPage.waitForResponse(
          (response) =>
            response.url().endsWith('/map/save') && response.request().method() === 'POST',
        );
        await saveReviewedConflictDraft(memberPage);
        const saved = await savedResponse;
        expect(saved.ok()).toBe(true);
        expect(saved.request().postDataJSON()).toEqual({
          version: 2,
          contentVersion: (await read(other.request)).contentVersion,
          operationId: expect.any(String),
        });
        const { receipt } = await saved.json();
        expect(receipt.changes).toContainEqual(
          expect.objectContaining({
            after: expect.objectContaining({
              id: 'private',
              name: 'Privat provnamn',
              lifecycle: 'ended',
              customValues: { serial: 'PRIVAT-PROVVÄRDE' },
            }),
          }),
        );
        expect(receipt.relationships).toContainEqual(
          expect.objectContaining({
            after: expect.objectContaining({
              id: 'private-edge',
              sourceId: 'private',
              targetId: 'target',
              lifecycle: 'ended',
            }),
          }),
        );
        await refreshConflictReader(memberPage, installation.origin);
        await memberPage
          .getByRole('region', { name: 'Hushållets tabell', exact: true })
          .getByRole('button', { name: /^Filter/ })
          .click();
        await memberPage
          .getByRole('dialog', { name: 'Tabellens filter', exact: true })
          .getByLabel('Ta med upphörda')
          .check();
        await memberPage.keyboard.press('Escape');
        const details = await expectSavedConflictObject(memberPage, 'Privat provnamn');
        await expectConflictReadValue(details, 'Status', 'Manuellt upphört');
        await expectConflictReadValue(details, 'Serienummer', 'PRIVAT-PROVVÄRDE');
        await expectSavedConflictRelationship(
          memberPage,
          'Privat provnamn',
          `Privat provnamn → ${edgeType.forwardLabel ?? edgeType.name} → Garaget`,
          {
            Typ: edgeType.name,
            'Från objekt': 'Privat provnamn',
            'Till objekt': 'Garaget',
            Status: 'Manuellt upphört',
          },
        );
      }
      const before = await read();
      const otherBefore = await read(other.request);
      await page.goto(installation.origin);
      await openTypeDefinitions(page);
      await page.getByText('Objekttyper och egna fält', { exact: true }).click();
      await page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }).click();
      await page.getByRole('button', { name: 'Ta bort objekttypen' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'ta bort eller byt typ på användande objekt',
      );
      await expect(page.getByRole('alert')).not.toContainText('Privat provnamn');
      await page.getByRole('button', { name: 'Ta bort fält: Serienummer' }).click();
      await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
      await expect(page.getByRole('alert')).toContainText('Ta bort fältvärdena');
      await expect(page.getByRole('alert')).not.toContainText('PRIVAT-PROVVÄRDE');
      await page.getByRole('button', { name: 'Stäng typformuläret utan att skicka' }).click();
      await page.getByText('Sambandstyper och riktning', { exact: true }).click();
      await page
        .getByRole('button', { name: `Ändra sambandstyp: ${edgeType.name}`, exact: true })
        .click();
      await page.getByRole('button', { name: 'Ta bort sambandstypen' }).click();
      await expect(page.getByRole('alert')).toContainText('objekten kan finnas kvar');
      await expect(page.getByRole('alert')).not.toContainText('Privat provnamn');
      expect(await read()).toEqual(before);
      expect(await read(other.request)).toEqual(otherBefore);
      if (stage === 'private')
        await expect(page.getByRole('main')).not.toContainText('Privat provnamn');
      if (stage === 'private') await readPrivate();
    }
  } finally {
    await other.close();
    await installation.close();
  }
});

test('KATALOG-03: history reads removed definitions and content without changing independent work', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    const initial = await read();
    const type = initial.types[0];
    const edgeType = initial.relationshipTypes[0];
    const object = async (id: string, typeId: string, name: string) => {
      expect(
        (
          await post('draft', {
            version: (await read()).draft.version,
            id,
            baseRevision: null,
            value: { typeId, name, description: '' },
          })
        ).ok(),
      ).toBe(true);
    };
    const save = async (operationId: string) => {
      const response = await post('save', { version: (await read()).draft.version, operationId });
      expect(response.ok()).toBe(true);
      return (await response.json()).receipt;
    };
    await object('source', type.id, 'Lo Exempel');
    await object('target', initial.types[1].id, 'Garaget');
    expect(
      (
        await post('relationship', {
          version: 2,
          id: 'edge',
          baseRevision: null,
          value: {
            typeId: edgeType.id,
            sourceId: 'source',
            targetId: 'target',
            knowledge: 'known',
          },
        })
      ).ok(),
    ).toBe(true);
    await save('content');
    expect(
      (
        await post('draft', {
          version: (await read()).draft.version,
          id: 'source',
          baseRevision: 1,
          value: null,
        })
      ).ok(),
    ).toBe(true);
    const deletion = await save('delete-content');
    expect(
      (
        await post('object-type', {
          version: (await read()).draft.version,
          id: type.id,
          baseRevision: type.revision,
          value: null,
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post('relationship-type', {
          version: (await read()).draft.version,
          id: edgeType.id,
          baseRevision: edgeType.revision,
          value: null,
        })
      ).ok(),
    ).toBe(true);
    await save('delete-catalog');
    await object('independent', initial.types[1].id, 'Oberoende förslag');
    const before = await read();
    await page.goto(installation.origin);
    await openTable(page);
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik' });
    const group = history.getByRole('article').filter({ hasText: 'Sparande: delete-content' });
    await group.getByText('Visa ändringarna', { exact: true }).click();
    await expect(group).toContainText('Lo Exempel');
    await expect(group).toContainText(`Objekttyp: ${type.name}`);
    await expect(group).toContainText(`Samband: ${edgeType.name}`);
    await expect(group.getByText('Namn: Lo Exempel.', { exact: true })).toBeVisible();
    await expect(group.getByText(`Objekttyp: ${type.name}`, { exact: false })).toBeVisible();
    await expect(group.getByRole('heading', { name: `Samband: ${edgeType.name}` })).toBeVisible();
    expect(await read()).toEqual(before);
    await expect(group.getByRole('button', { name: 'Ångra sparandet' })).toHaveCount(0);
    const readCurrentWork = async () => {
      await openTable(page);
      const garage = await expectSavedConflictObject(page, 'Garaget');
      await expectConflictReadValue(garage, 'Typ', initial.types[1].name);
      await expect(
        page
          .getByRole('region', { name: 'Hushållets tabell', exact: true })
          .getByRole('button', { name: /^Redigera / }),
      ).toHaveCount(2);
      await expect(
        page.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }),
      ).toHaveCount(0);
      await expectNoSavedConflictRelationships(page, 'Garaget');
      await openTypeDefinitions(page);
      await page.getByText('Objekttyper och egna fält', { exact: true }).click();
      await expect(
        page.getByRole('button', { name: `Ändra typ: ${type.name}`, exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Ändra typ: / })).toHaveCount(
        before.types.length,
      );
      for (const retained of before.types)
        await expect(
          page.getByRole('button', { name: `Ändra typ: ${retained.name}`, exact: true }),
        ).toBeVisible();
      await page.getByText('Sambandstyper och riktning', { exact: true }).click();
      await expect(
        page.getByRole('button', { name: `Ändra sambandstyp: ${edgeType.name}`, exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole('button', { name: /^Ändra sambandstyp: / })).toHaveCount(
        before.relationshipTypes.length,
      );
      for (const retained of before.relationshipTypes)
        await expect(
          page.getByRole('button', {
            name: `Ändra sambandstyp: ${retained.name}`,
            exact: true,
          }),
        ).toBeVisible();
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      const draft = await openDraftReview(page);
      await expect(draft.getByRole('button', { name: /^Visa förslaget: / })).toHaveCount(1);
      await expectConflictDraftValues(page, 'Oberoende förslag', {
        Namn: 'Oberoende förslag',
        Beskrivning: 'Ej uppgivet',
        Typ: initial.types[1].name,
        Gäller: 'Aktuellt',
        Status: 'Följ slutdatum',
        Ikon: 'Typens ikon',
        Profilbild: 'Ej uppgivet',
        Identitet: 'Identifierat objekt',
      });
      await closeTextView(page);
    };
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await readCurrentWork();
    expect(await read()).toEqual(before);
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    await group.getByText('Visa ändringarna', { exact: true }).click();
    await installation.restart();
    const current = await read();
    expect(current.draft).toEqual(before.draft);
    expect(current.objects).toEqual(before.objects);
    expect(current.types).toEqual(before.types);
    const historyAfter = (await (await page.request.get(`${path}/history`)).json()).history;
    expect(
      historyAfter.find(
        (receipt: { operationId: string }) => receipt.operationId === 'delete-content',
      ),
    ).toEqual(deletion);
    await expect(group.getByRole('button', { name: 'Ångra sparandet' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expectSavedConflictObject(page, 'Garaget');
    await expect(
      page.getByRole('button', { name: 'Redigera Lo Exempel', exact: true }),
    ).toHaveCount(0);
    await expectConflictDraftValues(page, 'Oberoende förslag', {
      Namn: 'Oberoende förslag',
      Beskrivning: 'Ej uppgivet',
      Typ: initial.types[1].name,
    });
    await closeTextView(page);
    await page.reload();
    await readCurrentWork();
    expect(await read()).toEqual(before);
    await openTable(page);
    await expectSavedConflictObject(page, 'Garaget');
    await expectConflictDraftValues(page, 'Oberoende förslag', {
      Namn: 'Oberoende förslag',
      Beskrivning: 'Ej uppgivet',
      Typ: initial.types[1].name,
    });
    await closeTextView(page);
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    await group.getByText('Visa ändringarna', { exact: true }).click();
    await expect(group.getByText('Namn: Lo Exempel.', { exact: true })).toBeVisible();
    await expect(group.getByRole('heading', { name: `Samband: ${edgeType.name}` })).toBeVisible();
  } finally {
    await installation.close();
  }
});
