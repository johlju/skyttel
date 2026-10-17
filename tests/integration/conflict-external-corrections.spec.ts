import type { Locator, Page } from '@playwright/test';
import { closeTextView, openSettings } from '../support/client.js';
import { prepareArchiveConflict } from '../support/conflict-archive.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  expectConflictDraftValues,
  expectConflictReadValue,
  expectSavedConflictObject,
  expectSavedConflictRelationship,
  refreshConflictReader,
} from '../support/current-conflict-reading.js';
import {
  expectHistoricalProposalAbsent,
  readIndependentHistoricalProposal,
} from '../support/historical-conflict-reading.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function readCorrectedProposal(
  page: Page,
  relationship: boolean,
  typeName: string,
  forwardLabel: string,
  year?: string,
) {
  await expectConflictDraftValues(
    page,
    relationship ? `Lo Exempel → ${forwardLabel} → Molnmusik` : 'Solcellsanläggningen',
    relationship
      ? {
          Från: 'Lo Exempel',
          Till: 'Molnmusik',
          Sambandstyp: typeName,
          'Uppgiftens säkerhet': 'Bekräftat',
          Gäller: 'Aktuellt',
          ...(year ? { Installationsår: year } : {}),
        }
      : {
          Namn: 'Solcellsanläggningen',
          Beskrivning: 'Tidigare privat förslag',
          Typ: typeName,
          ...(year ? { Installationsår: year } : {}),
        },
  );
  await closeTextView(page);
  await readIndependentHistoricalProposal(page);
}

async function readSavedCorrection(
  page: Page,
  origin: string,
  relationship: boolean,
  typeName: string,
  forwardLabel: string,
  year?: string,
) {
  await refreshConflictReader(page, origin);
  if (relationship)
    await expectSavedConflictRelationship(
      page,
      'Lo Exempel',
      `Lo Exempel → ${forwardLabel} → Molnmusik`,
      {
        Typ: typeName,
        'Från objekt': 'Lo Exempel',
        'Till objekt': 'Molnmusik',
        ...(year ? { Installationsår: year } : {}),
      },
    );
  else {
    const details = await expectSavedConflictObject(
      page,
      'Solcellsanläggningen',
      'Tidigare privat förslag',
    );
    await expectConflictReadValue(details, 'Typ', typeName);
    if (year) await expectConflictReadValue(details, 'Installationsår', year);
  }
  await expectSavedConflictObject(page, 'Oberoende förslag');
}

async function closeConflictWithEscape(page: Page, dialog: Locator) {
  await expect(
    dialog.getByRole('button', { name: 'Stäng konfliktdialogen', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
}

async function addReplacementField(page: Page) {
  await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
  const field = page.getByRole('group', { name: /^Eget fält/ }).last();
  await field.getByLabel('Fältets namn', { exact: true }).fill('Installationsår');
  await field.getByLabel('Värdeslag', { exact: true }).selectOption('number');
}

test('UTKAST-75: a missing endpoint and missing relationship type remain visible until only the explicit target proposal is discarded', async ({
  page,
  browser,
}) => {
  const administrator = await createPreparedContext(browser);
  const app = await prepareArchiveConflict(
    administrator.request,
    page.request,
    'missing-relationship-type',
    { missingEndpoint: true },
  );
  try {
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(dialog).toContainText('Ett objekt som sambandet pekar på saknas.');
    await expect(dialog).toContainText(
      'Den föreslagna sambandstypen saknas i det aktuella underlaget.',
    );
    await expect(dialog).toContainText(
      'lägg till sambandstypen under Inställningar → Typer och egna fält',
    );
    await expect(dialog.getByRole('region', { name: 'Ditt förslag', exact: true })).toContainText(
      'Molnmusik',
    );
    await expect(dialog.getByRole('region', { name: 'Ditt förslag', exact: true })).toContainText(
      'Lo Exempel',
    );
    await expect(dialog.getByRole('region', { name: 'Ditt förslag', exact: true })).toContainText(
      'Installationsår',
    );
    await expect(dialog.getByRole('region', { name: 'Ditt förslag', exact: true })).toContainText(
      'Våren 2021',
    );
    await closeConflictWithEscape(page, dialog);
    expect((await app.read()).draft).toEqual(before.draft);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Ta bort sambandet ur ditt utkast', exact: true })
      .click();
    await expect(dialog.getByRole('status')).toContainText(
      'Förslaget har tagits bort ur ditt utkast',
    );
    const after = await app.read();
    expect(after.draft.relationships ?? []).toEqual([]);
    expect(after.draft.changes).toEqual(before.draft.changes);
    expect(after.objects).toEqual(before.objects);
    expect(after.relationshipTypes).toEqual(before.relationshipTypes);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await closeConflictWithEscape(page, dialog);
    await expectHistoricalProposalAbsent(page, 'Lo Exempel → förvaras i → Molnmusik');
    await readIndependentHistoricalProposal(page);
  } finally {
    await administrator.close();
    await app.installation.close();
  }
});

for (const kind of ['object', 'relationship'] as const)
  test(`UTKAST-${kind === 'object' ? 74 : 138}: ${kind === 'object' ? 'an' : 'a'} ${kind} type with a replaced field preserves the owned historical answer label during explicit type-loss review`, async ({
    page,
    browser,
  }) => {
    const administrator = await createPreparedContext(browser);
    const app = await prepareArchiveConflict(
      administrator.request,
      page.request,
      kind === 'object' ? 'replaced-object-field' : 'replaced-relationship-field',
    );
    try {
      const before = await app.read();
      const currentType = (kind === 'object' ? before.types : before.relationshipTypes).find(
        (type) => type.id === app.typeId,
      );
      expect(currentType?.fields).toEqual([
        expect.objectContaining({
          id: 'replacement-year',
          name: 'Installationsår',
          kind: 'number',
        }),
      ]);
      await page.goto(app.installation.origin);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      await expect(
        conflict.getByRole('region', { name: 'Ditt förslag', exact: true }),
      ).toContainText('Installationsår');
      await expect(
        conflict.getByRole('region', { name: 'Ditt förslag', exact: true }),
      ).toContainText('Våren 2021');
      await closeConflictWithEscape(page, conflict);
      await page.getByRole('button', { name: 'Tabell', exact: true }).click();
      await page
        .getByRole('button', {
          name: kind === 'object' ? 'Redigera Solcellsanläggningen' : 'Samband för Lo Exempel',
          exact: true,
        })
        .click();
      const form = page.getByRole('dialog', {
        name: kind === 'object' ? 'Redigera Solcellsanläggningen' : 'Samband för Lo Exempel',
        exact: true,
      });
      if (kind === 'relationship')
        await form.getByRole('button', { name: 'Redigera samband', exact: true }).click();
      const selectedType = kind === 'object' ? before.types[0].id : before.relationshipTypes[0].id;
      const type = form.getByLabel(kind === 'object' ? 'Objekttyp' : 'Sambandstyp', {
        exact: true,
      });
      await type.selectOption(selectedType);
      const loss = page.getByRole('dialog', { name: 'Ta bort tidigare egna fält?', exact: true });
      await expect(loss).toContainText('Installationsår: Våren 2021');
      await expect(loss).not.toContainText(kind === 'object' ? 'year:' : 'storage-year:');
      await page.keyboard.press('Escape');
      await expect(loss).not.toBeVisible();
      expect((await app.read()).draft).toEqual(before.draft);
      await type.selectOption(selectedType);
      await loss
        .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
        .click();
      await form
        .getByRole('button', {
          name: kind === 'object' ? 'Lägg i utkastet och stäng' : 'Lägg i utkastet',
          exact: true,
        })
        .click();
      if (kind === 'relationship') {
        await expect(form.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
        await form.getByRole('button', { name: 'Stäng samband', exact: true }).click();
      }
      await expect(form).not.toBeVisible();
      const corrected = await app.read();
      const proposal = (
        kind === 'object' ? corrected.draft.changes : corrected.draft.relationships
      )?.find((change) => change.id === 'private-target');
      expect(proposal?.after?.typeId).toBe(selectedType);
      expect(proposal?.after?.customValues ?? {}).toEqual({});
      expect(corrected.objects).toEqual(before.objects);
      expect(corrected.relationships).toEqual(before.relationships);
      expect(corrected.draft.changes.find((change) => change.id === 'independent')).toEqual(
        before.draft.changes.find((change) => change.id === 'independent'),
      );
      const selected = kind === 'object' ? before.types[0] : before.relationshipTypes[0];
      await readCorrectedProposal(
        page,
        kind === 'relationship',
        selected.name,
        'forwardLabel' in selected ? (selected.forwardLabel ?? selected.name) : selected.name,
      );
      await saveReviewedConflictDraft(page);
      await app.installation.restart();
      await readSavedCorrection(
        page,
        app.installation.origin,
        kind === 'relationship',
        selected.name,
        'forwardLabel' in selected ? (selected.forwardLabel ?? selected.name) : selected.name,
      );
    } finally {
      await administrator.close();
      await app.installation.close();
    }
  });

test('UTKAST-66: a missing relationship type needs an actual new definition and explicit ordinary correction with readable historical field loss', async ({
  page,
  browser,
}) => {
  const administrator = await createPreparedContext(browser);
  const app = await prepareArchiveConflict(
    administrator.request,
    page.request,
    'missing-relationship-type',
  );
  try {
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(conflict).toContainText(
      'Den föreslagna sambandstypen saknas i det aktuella underlaget.',
    );
    await expect(conflict).toContainText(
      'Justera sedan sambandet i den vanliga sambandsdialogen så att det använder rätt typ',
    );
    await expect(conflict.getByRole('region', { name: 'Ditt förslag' })).toContainText(
      'Installationsår',
    );
    await expect(conflict.getByRole('region', { name: 'Ditt förslag' })).toContainText(
      'Våren 2021',
    );
    await closeConflictWithEscape(page, conflict);
    expect((await app.read()).draft).toEqual(before.draft);
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
    await page.getByLabel('Sambandstypens namn', { exact: true }).fill('Förvaras i');
    await page
      .getByLabel('Sambandstypens beskrivning', { exact: true })
      .fill('Ny faktisk definition');
    await page.getByLabel('Benämning från startobjektet', { exact: true }).fill('förvaras i');
    await page.getByLabel('Benämning från målobjektet', { exact: true }).fill('förvarar');
    await addReplacementField(page);
    await page
      .getByRole('button', { name: 'Lägg sambandstypen i mitt utkast', exact: true })
      .click();
    const named = await app.read();
    const definition = named.draft.relationshipTypes?.find(
      (change) => change.after?.name === 'Förvaras i',
    );
    expect(definition?.id).not.toBe(app.typeId);
    expect(definition?.after?.fields?.[0]?.id).not.toBe('storage-year');
    expect(named.draft.relationships).toEqual(before.draft.relationships);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    await expect(conflict).toContainText('Den föreslagna sambandstypen saknas');
    await closeConflictWithEscape(page, conflict);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Lo Exempel', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Lo Exempel', exact: true });
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption(definition?.id ?? '');
    const loss = page.getByRole('dialog', { name: 'Ta bort tidigare egna fält?', exact: true });
    await expect(loss).toContainText('Installationsår: Våren 2021');
    await expect(loss).not.toContainText('storage-year:');
    await page.keyboard.press('Escape');
    await expect(loss).not.toBeVisible();
    expect((await app.read()).draft).toEqual(named.draft);
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption(definition?.id ?? '');
    await loss
      .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
      .click();
    await expect(dialog.getByLabel('Installationsår', { exact: true })).toHaveValue('');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Sambandet lades i ditt utkast');
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await expect(
      page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }),
    ).toHaveCount(0);
    const corrected = await app.read();
    expect(
      corrected.draft.relationships?.find((change) => change.id === 'private-target'),
    ).toMatchObject({ after: { typeId: definition?.id } });
    expect(
      Object.keys(
        corrected.draft.relationships?.find((change) => change.id === 'private-target')?.after
          ?.customValues ?? {},
      ),
    ).toEqual([]);
    expect(corrected.draft.changes).toEqual(before.draft.changes);
    expect(corrected.relationships).toEqual(before.relationships);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await readCorrectedProposal(page, true, 'Förvaras i', 'förvaras i', 'Ej uppgivet');
    await saveReviewedConflictDraft(page);
    const saved = await app.read();
    expect(saved.relationships.find((edge) => edge.id === 'private-target')).toMatchObject({
      typeId: definition?.id,
    });
    expect(saved.relationshipTypes.find((type) => type.id === definition?.id)?.fields).toEqual(
      definition?.after?.fields,
    );
    await app.installation.restart();
    await readSavedCorrection(
      page,
      app.installation.origin,
      true,
      'Förvaras i',
      'förvaras i',
      'Ej uppgivet',
    );
  } finally {
    await administrator.close();
    await app.installation.close();
  }
});

test('UTKAST-64: a missing object type keeps its proposal readable and discards only the explicitly confirmed object', async ({
  page,
  browser,
}) => {
  const administrator = await createPreparedContext(browser);
  const app = await prepareArchiveConflict(
    administrator.request,
    page.request,
    'missing-object-type',
  );
  try {
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(dialog).toContainText(
      'Den föreslagna objekttypen saknas i det aktuella underlaget.',
    );
    await expect(dialog).toContainText(
      'Objektet kan inte läggas till eftersom objekttypen saknas.',
    );
    await expect(dialog).toContainText(
      'Stäng konfliktfönstret och lägg till objekttypen under Inställningar → Typer och egna fält. Ditt förslag ligger kvar. Alternativt kan du ta bort objektet ur ditt utkast nedan.',
    );
    await expect(dialog.getByRole('region', { name: 'Ditt förslag' })).toContainText('Våren 2021');
    await expect(dialog.getByRole('region', { name: 'Ditt förslag' })).toContainText(
      'Solcellsanläggningen',
    );
    await expect(dialog.getByRole('region', { name: 'Ditt förslag' })).toContainText(
      'Tidigare privat förslag',
    );
    await expect(dialog.getByRole('region', { name: 'Ditt förslag' })).toContainText(
      'Installationsår',
    );
    const preview = dialog.getByRole('region', { name: 'Resultat av valen', exact: true });
    await expect(preview.locator('dt')).toHaveText('Objektet i ditt utkast');
    await expect(preview.locator('dd')).toHaveText('Tas bort ur ditt utkast');
    await expect(preview).toContainText('Övriga objekt och samband i kartan påverkas inte.');
    await expect(preview).not.toContainText('✓ Förvalt');
    await closeConflictWithEscape(page, dialog);
    expect((await app.read()).draft).toEqual(before.draft);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    await dialog
      .getByRole('button', { name: 'Ta bort objektet ur ditt utkast', exact: true })
      .click();
    await expect(dialog.getByRole('status')).toContainText(
      'Förslaget har tagits bort ur ditt utkast',
    );
    await expect(
      dialog.getByRole('heading', {
        name: '✓ Objektet har tagits bort ur ditt utkast',
        exact: true,
      }),
    ).toBeVisible();
    await expect(dialog.locator('.cp-preview dt')).toHaveText('Objektet i ditt utkast');
    await expect(dialog.locator('.cp-preview dd')).toHaveText('Borttaget ur ditt utkast');
    const after = await app.read();
    expect(after.draft.changes).toEqual(
      before.draft.changes.filter((change) => change.id !== 'private-target'),
    );
    expect(after.objects).toEqual(before.objects);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await closeConflictWithEscape(page, dialog);
    await expectHistoricalProposalAbsent(page, 'Solcellsanläggningen');
    await readIndependentHistoricalProposal(page);
  } finally {
    await administrator.close();
    await app.installation.close();
  }
});

test('UTKAST-72: ordinary correction of a missing object type preserves historical field labels until explicitly confirmed loss', async ({
  page,
  browser,
}) => {
  const administrator = await createPreparedContext(browser);
  const app = await prepareArchiveConflict(
    administrator.request,
    page.request,
    'missing-object-type',
  );
  try {
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await page.goto(app.installation.origin);
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    await page.getByLabel('Typens namn', { exact: true }).fill('Solcellsanläggning');
    await page.getByLabel('Typens beskrivning', { exact: true }).fill('Ny faktisk definition');
    await addReplacementField(page);
    await page
      .getByRole('button', { name: 'Lägg typförslaget i mitt utkast', exact: true })
      .click();
    const named = await app.read();
    const definition = named.draft.objectTypes?.find(
      (change) => change.after?.name === 'Solcellsanläggning',
    );
    expect(definition?.id).not.toBe(app.typeId);
    expect(definition?.after?.fields?.[0]?.id).not.toBe('year');
    expect(named.draft.changes).toEqual(before.draft.changes);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(conflict).toContainText('Den föreslagna objekttypen saknas');
    await closeConflictWithEscape(page, conflict);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera Solcellsanläggningen', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Redigera Solcellsanläggningen', exact: true });
    await form.getByLabel('Objekttyp', { exact: true }).selectOption(definition?.id ?? '');
    const loss = page.getByRole('dialog', { name: 'Ta bort tidigare egna fält?', exact: true });
    await expect(loss).toContainText('Installationsår: Våren 2021');
    await expect(loss).not.toContainText('year:');
    await page.keyboard.press('Escape');
    await expect(loss).not.toBeVisible();
    expect((await app.read()).draft).toEqual(named.draft);
    await form.getByLabel('Objekttyp', { exact: true }).selectOption(definition?.id ?? '');
    await loss
      .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
      .click();
    await form.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await expect(form.getByLabel('Installationsår', { exact: true })).toHaveValue('');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(form).not.toBeVisible();
    const corrected = await app.read();
    expect(corrected.draft.changes.find((change) => change.id === 'private-target')).toMatchObject({
      after: { typeId: definition?.id },
    });
    expect(
      Object.keys(
        corrected.draft.changes.find((change) => change.id === 'private-target')?.after
          ?.customValues ?? {},
      ),
    ).toEqual([]);
    expect(corrected.draft.changes.find((change) => change.id === 'independent')).toEqual(
      before.draft.changes.find((change) => change.id === 'independent'),
    );
    expect(corrected.objects).toEqual(before.objects);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await expect(
      page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }),
    ).toHaveCount(0);
    await readCorrectedProposal(page, false, 'Solcellsanläggning', '', 'Ej uppgivet');
    await saveReviewedConflictDraft(page);
    expect(
      (await app.read()).objects.find((object) => object.id === 'private-target')?.typeId,
    ).toBe(definition?.id);
    await app.installation.restart();
    await readSavedCorrection(
      page,
      app.installation.origin,
      false,
      'Solcellsanläggning',
      '',
      'Ej uppgivet',
    );
  } finally {
    await administrator.close();
    await app.installation.close();
  }
});

test('UTKAST-65: an incompatible historical field is corrected in the ordinary object form before fresh conflict assessment', async ({
  page,
  browser,
}) => {
  const administrator = await createPreparedContext(browser);
  const app = await prepareArchiveConflict(administrator.request, page.request, 'invalid-datatype');
  try {
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await expect(dialog).toContainText(
      'Ett eget fält har ändrats från text till tal. Det föreslagna värdet passar inte den ändrade typen.',
    );
    await expect(dialog).toContainText('Det föreslagna värdet måste vara ett tal.');
    await expect(dialog.locator('.cp-warning [aria-hidden="true"]')).toHaveCount(0);
    await expect(dialog).toContainText(
      'Stäng konfliktfönstret och rätta uppgiften i den vanliga objektdialogen. Lägg ändringen i ditt utkast och kom sedan tillbaka hit. Ditt förslag ligger kvar under tiden.',
    );
    await expect(dialog.getByRole('region', { name: 'Ditt förslag' })).toContainText('Våren 2021');
    await dialog.getByRole('button', { name: 'Stäng konfliktfönstret', exact: true }).click();
    expect((await app.read()).draft).toEqual(before.draft);
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Tabell', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera Solcellsanläggningen', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Redigera Solcellsanläggningen', exact: true });
    await form.getByRole('button', { name: 'Egna fält', exact: true }).click();
    await form.getByLabel('Installationsår', { exact: true }).fill('2021');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }),
    ).toHaveCount(0);
    const after = await app.read();
    expect(after.objects).toEqual(before.objects);
    expect(after.draft.changes.find((change) => change.id === 'private-target')).toMatchObject({
      after: { customValues: { year: 2021 } },
      type: { fields: [expect.objectContaining({ id: 'year', kind: 'number' })] },
    });
    expect(after.draft.changes.find((change) => change.id === 'independent')).toEqual(
      before.draft.changes.find((change) => change.id === 'independent'),
    );
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await readCorrectedProposal(page, false, 'Solcellsanläggning', '', '2021');
    await saveReviewedConflictDraft(page);
    expect(
      (await app.read()).objects.find((object) => object.id === 'private-target')?.customValues,
    ).toEqual({ year: 2021 });
    await app.installation.restart();
    await readSavedCorrection(
      page,
      app.installation.origin,
      false,
      'Solcellsanläggning',
      '',
      '2021',
    );
  } finally {
    await administrator.close();
    await app.installation.close();
  }
});
