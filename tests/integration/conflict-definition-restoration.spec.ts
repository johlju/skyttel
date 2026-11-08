import type { Locator } from '@playwright/test';
import { conflictBasis } from '../../src/shared/conflict-properties.js';
import { draftConflicts } from '../../src/shared/draft-conflicts.js';
import { closeSupportDialog, closeTextView, openDraftReview } from '../support/client.js';
import {
  downloadConflictArchive,
  importConflictArchive,
  prepareArchiveConflict,
} from '../support/conflict-archive.js';
import {
  readRestoredHousehold,
  saveNativeRestoration,
  stageNativeRestoration,
} from '../support/conflict-definition-restoration-steps.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  expectSavedConflictObject,
  refreshConflictReader,
} from '../support/current-conflict-reading.js';
import { openTypeDefinitions } from '../support/domain-work.js';
import {
  expectHistoricalProposalAbsent,
  expectSavedHistoricalRelationshipMetadata,
  readHistoricalDefinitionProposal,
  readIndependentHistoricalProposal,
  readSavedHistoricalDefinition,
} from '../support/historical-conflict-reading.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function expectSeparateDefinitionProperties(
  container: Locator,
  _kind: 'object' | 'relationship',
) {
  const properties = container.locator('.cp-definition-property');
  await expect(properties).toHaveText([
    'Namn: Min privata typbenämning',
    'Beskrivning: Min tidigare definition',
  ]);
  const bounds = await properties.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: rect.height };
    }),
  );
  for (const [index, boundsForProperty] of bounds.entries()) {
    expect(boundsForProperty.height).toBeGreaterThan(0);
    if (index) expect(boundsForProperty.top).toBeGreaterThanOrEqual(bounds[index - 1].bottom);
  }
}

for (const kind of ['object', 'relationship'] as const)
  test(`UTKAST-${kind === 'object' ? 76 : 139}: a retained ${kind} definition without an actual removed revision can be explicitly discarded without granting restoration`, async ({
    page,
    browser,
  }) => {
    const administrator = await createPreparedContext(browser);
    const app = await prepareArchiveConflict(
      administrator.request,
      page.request,
      kind === 'object' ? 'missing-object-definition' : 'missing-relationship-definition',
    );
    try {
      const before = await app.read();
      const history = await (await page.request.get(`${app.path}/history`)).json();
      const conflict = draftConflicts(before).find(
        (conflict) => conflict.kind === (kind === 'object' ? 'objectType' : 'relationshipType'),
      );
      if (!conflict) throw new Error('Missing retained definition');
      expect(before.removedDefinitions).toBeUndefined();
      expect(
        (
          await app.post(page.request, 'resolve', {
            conflict,
            command: 'definition-choice',
            definitionChoice: 'proposed',
            basis: conflictBasis(before, conflict),
            version: before.draft.version,
            contentVersion: before.contentVersion,
          })
        ).status(),
      ).toBe(409);
      expect((await app.read()).draft).toEqual(before.draft);
      await page.goto(app.installation.origin);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      const proposed = dialog
        .getByRole('region', { name: 'Ditt förslag', exact: true })
        .getByRole('button');
      await expect(proposed).toContainText('Min privata typbenämning');
      await expectSeparateDefinitionProperties(
        dialog.getByRole('region', { name: 'Ditt förslag', exact: true }),
        kind,
      );
      await expect(proposed).toBeDisabled();
      await expect(dialog).toContainText(
        'Typdefinitionen kan inte återställas med det aktuella underlaget.',
      );
      await dialog
        .getByRole('region', { name: 'Sparat i kartan nu', exact: true })
        .getByRole('button', { name: 'Typdefinition: Sparat i kartan nu – Borttaget', exact: true })
        .click();
      await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText(
        'Förslaget har tagits bort ur ditt utkast',
      );
      const after = await app.read();
      expect(after.draft.version).toBe(before.draft.version + 1);
      expect(after.draft[kind === 'object' ? 'objectTypes' : 'relationshipTypes'] ?? []).toEqual(
        [],
      );
      expect(after.draft.changes).toEqual(before.draft.changes);
      expect(after.objects).toEqual(before.objects);
      expect(after.types).toEqual(before.types);
      expect(after.relationshipTypes).toEqual(before.relationshipTypes);
      expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
      await page.keyboard.press('Escape');
      await expectHistoricalProposalAbsent(page, 'Min privata typbenämning');
      await readIndependentHistoricalProposal(page);
    } finally {
      await administrator.close();
      await app.installation.close();
    }
  });

for (const kind of ['object', 'relationship'] as const)
  test(`UTKAST-${kind === 'object' ? 67 : 140}: an explicitly reviewed removed ${kind} definition restores its historical identity only on a separate save`, async ({
    page,
    browser,
  }, testInfo) => {
    const administrator = await createPreparedContext(browser);
    const app = await prepareArchiveConflict(
      administrator.request,
      page.request,
      kind === 'object' ? 'removed-object-definition' : 'removed-relationship-definition',
    );
    try {
      const before = await app.read();
      const history = await (await page.request.get(`${app.path}/history`)).json();
      await page.goto(app.installation.origin);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      await expect(dialog).toContainText(
        'Typdefinitionen saknas nu i kartan. Ditt förslag innehåller ändringar i den.',
      );
      const saved = dialog.getByRole('region', { name: 'Sparat i kartan nu', exact: true });
      const proposed = dialog.getByRole('region', { name: 'Ditt förslag', exact: true });
      await expect(
        saved.getByRole('button', {
          name: 'Typdefinition: Sparat i kartan nu – Borttaget',
          exact: true,
        }),
      ).toBeEnabled();
      await expect(proposed).toContainText('Min privata typbenämning');
      await expect(proposed).toContainText('Min tidigare definition');
      const apply = dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true });
      await expect(apply).toBeDisabled();
      await expect(dialog).toContainText('1 av 1 egenskaper återstår att välja.');
      await expect(
        dialog.getByRole('region', { name: 'Resultat av valen', exact: true }),
      ).toContainText('Välj ett värde');
      for (const width of [1280, 320]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        await expectSeparateDefinitionProperties(proposed, kind);
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-definition-default-${width}.png`),
          fullPage: true,
        });
      }
      await page.keyboard.press('Escape');
      expect(await app.read()).toEqual(before);
      await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
      await proposed.getByRole('button', { name: /^Typdefinition: Ditt förslag/ }).click();
      await expect(
        dialog.getByRole('region', { name: 'Resultat av valen', exact: true }),
      ).toContainText('Typdefinitionen föreslås återställas med din ändring.');
      for (const width of [1280, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expectSeparateDefinitionProperties(proposed, kind);
        await expectSeparateDefinitionProperties(
          dialog.getByRole('region', { name: 'Resultat av valen', exact: true }),
          kind,
        );
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-definition-selected-${width}.png`),
          fullPage: true,
        });
      }
      expect(await app.read()).toEqual(before);
      await apply.click();
      await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
      for (const width of [1280, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await expectSeparateDefinitionProperties(dialog.locator('.cp-preview'), kind);
        await expect(dialog.locator('.cp-preview dd')).toHaveCSS('box-shadow', 'none');
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-definition-resolved-${width}.png`),
          fullPage: true,
        });
      }
      const after = await app.read();
      const change = (
        kind === 'object' ? after.draft.objectTypes : after.draft.relationshipTypes
      )?.find((change) => change.id === app.typeId);
      expect(change).toMatchObject({
        before: null,
        after: { id: app.typeId, revision: 3, name: 'Min privata typbenämning' },
      });
      expect(kind === 'object' ? after.types : after.relationshipTypes).toEqual(
        kind === 'object' ? before.types : before.relationshipTypes,
      );
      expect(after.draft.changes).toEqual(before.draft.changes);
      expect(after.draft.version).toBe(before.draft.version + 1);
      expect(after.conflictActors).toBeUndefined();
      expect({ ...after, draft: before.draft, conflictActors: before.conflictActors }).toEqual(
        before,
      );
      expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
      await page.keyboard.press('Escape');
      await readHistoricalDefinitionProposal(page, kind === 'relationship');
      await readIndependentHistoricalProposal(page);
      await saveReviewedConflictDraft(page);
      const savedState = await app.read();
      expect(
        (kind === 'object' ? savedState.types : savedState.relationshipTypes).find(
          (type) => type.id === app.typeId,
        ),
      ).toMatchObject({
        revision: 3,
        name: 'Min privata typbenämning',
        description: 'Min tidigare definition',
      });
      const receipts = await (await page.request.get(`${app.path}/history`)).json();
      expect(JSON.stringify(receipts)).not.toContain('restoration');
      expect(
        receipts.history[0][kind === 'object' ? 'objectTypes' : 'relationshipTypes'][0],
      ).not.toHaveProperty('restoration');
      expect(savedState.objects.find((object) => object.id === 'independent')).toBeDefined();
      await app.installation.restart();
      await readRestoredHousehold(page, app.installation.origin, kind === 'relationship');
      if (kind === 'relationship')
        await expectSavedHistoricalRelationshipMetadata(page, app.path, app.typeId);
      const reader = await administrator.newPage();
      await readRestoredHousehold(reader, app.installation.origin, kind === 'relationship');
      if (kind === 'relationship')
        await expectSavedHistoricalRelationshipMetadata(reader, app.path, app.typeId);
    } finally {
      await administrator.close();
      await app.installation.close();
    }
  });

test('UTKAST-68: a newer saved definition rejects stale restoration atomically and preserves independent proposals', async ({
  page,
  browser,
}) => {
  const administrator = await createPreparedContext(browser);
  const app = await prepareArchiveConflict(
    administrator.request,
    page.request,
    'removed-object-definition',
    { administratorDefinitionProposal: true },
  );
  const administratorPage = await administrator.newPage();
  try {
    const original = await app.read();
    const conflict = draftConflicts(original).find((conflict) => conflict.kind === 'objectType');
    if (!conflict) throw new Error('Missing fixture conflict');
    const review = {
      conflict,
      basis: conflictBasis(original, conflict),
      command: 'definition-choice',
      definitionChoice: 'proposed',
      version: original.draft.version,
      contentVersion: original.contentVersion,
    };
    expect((await app.post(page.request, 'resolve', { ...review, basis: {} })).status()).toBe(409);
    expect((await app.post(administrator.request, 'resolve', review)).status()).toBe(409);
    expect((await app.read()).draft).toEqual(original.draft);
    await page.goto(app.installation.origin);
    await stageNativeRestoration(page, review);
    const privateRestoration = await app.read();
    await readHistoricalDefinitionProposal(page, false);
    await readIndependentHistoricalProposal(page);
    expect((await app.post(page.request, 'resolve', review)).status()).toBe(409);
    const administratorState = await app.administratorRead();
    const administratorConflict = draftConflicts(administratorState).find(
      (conflict) => conflict.kind === 'objectType',
    );
    if (!administratorConflict) throw new Error('Missing administrator fixture conflict');
    await administratorPage.goto(app.installation.origin);
    await stageNativeRestoration(administratorPage, {
      conflict: administratorConflict,
      basis: conflictBasis(administratorState, administratorConflict),
      command: 'definition-choice',
      definitionChoice: 'proposed',
      version: administratorState.draft.version,
      contentVersion: administratorState.contentVersion,
    });
    await readHistoricalDefinitionProposal(
      administratorPage,
      false,
      'Administratörens tidigare förslag',
      'Anläggning',
    );
    const restorationReceipt = await saveNativeRestoration(
      administratorPage,
      await app.administratorRead(),
    );
    expect(restorationReceipt.objectTypes[0]).toMatchObject({
      id: app.typeId,
      after: { revision: 3, name: 'Administratörens tidigare förslag' },
    });
    const active = (await app.administratorRead()).types.find((type) => type.id === app.typeId);
    if (!active) throw new Error('Missing restored definition');
    await closeTextView(administratorPage);
    await openTypeDefinitions(administratorPage);
    await administratorPage.getByText('Objekttyper', { exact: true }).click();
    await administratorPage
      .getByRole('button', { name: `Ändra typ: ${active.name}`, exact: true })
      .click();
    await administratorPage
      .getByRole('button', { name: 'Ta bort objekttypen', exact: true })
      .click();
    await administratorPage
      .getByRole('link', { name: 'Tillbaka till kartan', exact: true })
      .click();
    const removalReview = await openDraftReview(administratorPage);
    await expect(removalReview).toContainText(active.name);
    expect((await app.administratorRead()).draft.objectTypes).toEqual([
      expect.objectContaining({ id: active.id, after: null }),
    ]);
    expect((await app.read()).draft).toEqual(privateRestoration.draft);
    await removalReview.locator(`#draft-remove-Objekttyp-${active.id}`).click();
    await expect(removalReview.locator(`#draft-remove-Objekttyp-${active.id}`)).toHaveCount(0);
    expect((await app.read()).draft).toEqual(privateRestoration.draft);
    await closeTextView(administratorPage);
    await openTypeDefinitions(administratorPage);
    const objectTypes = administratorPage.getByText('Objekttyper', { exact: true });
    if ((await objectTypes.locator('..').getAttribute('open')) === null) await objectTypes.click();
    await administratorPage
      .getByRole('button', { name: `Ändra typ: ${active.name}`, exact: true })
      .click();
    await administratorPage
      .getByLabel('Typens namn', { exact: true })
      .fill('Ny gemensam typbenämning');
    await administratorPage
      .getByRole('button', { name: 'Lägg typförslaget i mitt utkast', exact: true })
      .click();
    await administratorPage
      .getByRole('link', { name: 'Tillbaka till kartan', exact: true })
      .click();
    await readHistoricalDefinitionProposal(
      administratorPage,
      false,
      'Ny gemensam typbenämning',
      active.description,
    );
    expect(
      (
        await app.post(administrator.request, 'object-type', {
          version: (await app.administratorRead()).draft.version,
          contentVersion: original.contentVersion,
          id: active.id,
          baseRevision: active.revision,
          value: { name: 'Ny gemensam typbenämning', description: active.description },
        })
      ).status(),
    ).toBe(200);
    await administratorPage.reload();
    const newerReceipt = await saveNativeRestoration(
      administratorPage,
      await app.administratorRead(),
    );
    expect(newerReceipt.objectTypes[0]).toMatchObject({
      id: app.typeId,
      after: { revision: 4, name: 'Ny gemensam typbenämning' },
    });
    const beforeRejectedSave = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    expect((await app.save(page.request, 'stale-restoration')).status()).toBe(409);
    const after = await app.read();
    expect(after.draft).toEqual(privateRestoration.draft);
    expect(after.objects).toEqual(beforeRejectedSave.objects);
    expect(after.types).toEqual(beforeRejectedSave.types);
    expect(after.objects.some((object) => object.id === 'independent')).toBe(false);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    expect(after.types.find((type) => type.id === app.typeId)?.revision).toBe(4);
    await page.reload();
    await readHistoricalDefinitionProposal(page, false);
    await readIndependentHistoricalProposal(page);
    const draft = await openDraftReview(page);
    const rejectedResponse = page.waitForResponse(
      (response) => response.url().endsWith('/map/save') && response.request().method() === 'POST',
    );
    await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    expect((await rejectedResponse).status()).toBe(409);
    await expect(page.getByRole('dialog', { name: 'Spara utkastet', exact: true })).toContainText(
      'Inget sparades',
    );
    expect((await app.read()).draft).toEqual(privateRestoration.draft);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await closeSupportDialog(page, 'Spara utkastet');
    await closeTextView(page);
    await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const refreshed = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    const proposedValues = refreshed.getByRole('region', { name: 'Ditt förslag', exact: true });
    const _savedValues = refreshed.getByRole('region', { name: 'Sparat i kartan nu', exact: true });
    for (const property of ['Namn', 'Beskrivning'])
      await proposedValues
        .getByRole('button', { name: new RegExp(`^${property}: Ditt förslag`) })
        .click();
    await refreshed.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(refreshed.getByRole('status')).toContainText('Valen finns i ditt utkast');
    await page.keyboard.press('Escape');
    expect((await app.read()).draft.objectTypes?.[0].after?.revision).toBe(5);
    expect((await app.read()).draft.objectTypes?.[0].restoration).toBeUndefined();
    await saveReviewedConflictDraft(page);
    expect((await app.read()).types.find((type) => type.id === app.typeId)?.revision).toBe(5);
    await app.installation.restart();
    await readRestoredHousehold(page, app.installation.origin, false);
    await readRestoredHousehold(administratorPage, app.installation.origin, false);
  } finally {
    await administrator.close();
    await app.installation.close();
  }
});

test('UTKAST-69: importing a private restoration requires a fresh explicit review in the replacement generation', async ({
  page,
  browser,
}) => {
  const administrator = await createPreparedContext(browser);
  const app = await prepareArchiveConflict(
    administrator.request,
    page.request,
    'removed-relationship-definition',
  );
  try {
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await dialog.getByRole('button', { name: /^Typdefinition: Ditt förslag/ }).click();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
    const before = await app.read();
    await page.keyboard.press('Escape');
    await readHistoricalDefinitionProposal(page, true);
    await readIndependentHistoricalProposal(page);
    const authority = before.draft.relationshipTypes?.[0].restoration;
    expect(authority?.contentVersion).toBe(before.contentVersion);
    const archive = await downloadConflictArchive(app, administrator.request);
    expect(
      archive.content.drafts.find((draft) => draft.userId === before.userId)?.relationshipTypes[0]
        .restoration,
    ).toEqual(authority);
    await importConflictArchive(app, administrator.request, archive);
    const afterImport = await app.read();
    expect(afterImport.contentVersion).toBe(before.contentVersion + 1);
    expect(afterImport.draft.relationshipTypes?.[0].restoration).toBeUndefined();
    expect(afterImport.draft.relationshipTypes?.[0].before).toEqual(authority?.definition);
    expect(afterImport.draft.changes).toEqual(before.draft.changes);
    expect((await app.save(page.request, 'unreviewed-import')).status()).toBe(409);
    expect((await app.read()).draft).toEqual(afterImport.draft);
    await page.reload();
    await readHistoricalDefinitionProposal(page, true);
    await readIndependentHistoricalProposal(page);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    await dialog.getByRole('button', { name: /^Typdefinition: Ditt förslag/ }).click();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
    expect((await app.read()).draft.relationshipTypes?.[0].restoration?.contentVersion).toBe(
      afterImport.contentVersion,
    );
    await page.keyboard.press('Escape');
    await readHistoricalDefinitionProposal(page, true);
    await readIndependentHistoricalProposal(page);
    await saveReviewedConflictDraft(page);
    expect(
      (await app.read()).relationshipTypes.find((type) => type.id === app.typeId)?.revision,
    ).toBe(3);
    await app.installation.restart();
    await readRestoredHousehold(page, app.installation.origin, true);
    await expectSavedHistoricalRelationshipMetadata(page, app.path, app.typeId);
  } finally {
    await administrator.close();
    await app.installation.close();
  }
});

for (const surface of ['Karta', 'Tabell'])
  test(`UTKAST-${surface === 'Karta' ? 70 : 141}: a lost definition restoration reply verifies its private authority without replay in ${surface}`, async ({
    page,
    browser,
  }) => {
    const administrator = await createPreparedContext(browser);
    const app = await prepareArchiveConflict(
      administrator.request,
      page.request,
      'removed-object-definition',
    );
    try {
      await page.setViewportSize({ width: 320, height: 900 });
      const before = await app.read();
      const history = await (await page.request.get(`${app.path}/history`)).json();
      let submitted = 0;
      await page.route('**/map/resolve', async (route) => {
        submitted++;
        await route.fetch();
        await route.abort();
      });
      await page.goto(app.installation.origin);
      if (surface === 'Tabell')
        await page
          .getByRole('navigation', { name: 'Kartans verktyg' })
          .getByRole('button', { name: 'Tabell', exact: true })
          .click();
      const opener = page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true });
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
      await dialog.getByRole('button', { name: /^Typdefinition: Ditt förslag/ }).click();
      await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Det är oklart');
      await page.keyboard.press('Escape');
      await opener.click();
      await expect(opener).toHaveCount(0);
      await page.keyboard.press('Escape');
      const followUp = page.getByRole('button', { name: 'Visa konfliktvalet', exact: true });
      await followUp.click();
      await expect(
        dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }),
      ).toBeDisabled();
      await dialog
        .getByRole('button', { name: 'Kontrollera om valet lades i utkastet', exact: true })
        .click();
      await expect(dialog.getByRole('status')).toContainText('Valen finns i ditt utkast');
      expect(submitted).toBe(1);
      const after = await app.read();
      expect(after.draft.objectTypes?.[0]).toMatchObject({
        before: null,
        after: { id: app.typeId, revision: 3 },
        restoration: {
          contentVersion: before.contentVersion,
          definition: before.removedDefinitions?.objectTypes[0],
        },
      });
      expect(after.types).toEqual(before.types);
      expect(after.draft.changes).toEqual(before.draft.changes);
      expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
      await page.keyboard.press('Escape');
      await expect(page.locator(':focus')).toBeVisible();
      expect(await page.locator(':focus').evaluate((element) => element.tagName)).not.toBe('BODY');
      await readHistoricalDefinitionProposal(page, false);
      await readIndependentHistoricalProposal(page);
    } finally {
      await administrator.close();
      await app.installation.close();
    }
  });

test('UTKAST-71: ordinary definition creation cannot reuse a removed identity or grant forged restoration authority', async ({
  page,
  browser,
}) => {
  const administrator = await createPreparedContext(browser);
  const app = await prepareArchiveConflict(
    administrator.request,
    page.request,
    'removed-object-definition',
  );
  try {
    await page.goto(app.installation.origin);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    await dialog
      .getByRole('button', { name: 'Typdefinition: Sparat i kartan nu – Borttaget', exact: true })
      .click();
    await dialog.getByRole('button', { name: 'Lägg valen i utkastet', exact: true }).click();
    await expect(dialog.getByRole('status')).toContainText(
      'Förslaget har tagits bort ur ditt utkast',
    );
    await expect(
      dialog.getByRole('heading', { name: '✓ Typdefinitionen förblir borttagen', exact: true }),
    ).toBeVisible();
    const before = await app.read();
    const history = await (await page.request.get(`${app.path}/history`)).json();
    expect(before.draft.objectTypes ?? []).toEqual([]);
    const rejected = await app.post(page.request, 'object-type', {
      id: app.typeId,
      version: before.draft.version,
      contentVersion: before.contentVersion,
      baseRevision: null,
      value: { name: 'Förfalskat återställningsförslag', description: '' },
      restoration: { contentVersion: before.contentVersion, definition: app.historicalType },
    });
    expect(rejected.status()).toBe(409);
    const after = await app.read();
    expect(after.draft).toEqual(before.draft);
    expect(after.types).toEqual(before.types);
    expect(after.objects).toEqual(before.objects);
    expect(await (await page.request.get(`${app.path}/history`)).json()).toEqual(history);
    await page.keyboard.press('Escape');
    await expectHistoricalProposalAbsent(page, 'Min privata typbenämning');
    await readIndependentHistoricalProposal(page);
    await openTypeDefinitions(page);
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    await page.getByLabel('Typens namn', { exact: true }).fill('Solcellsanläggning');
    await page.getByLabel('Typens beskrivning', { exact: true }).fill('Ny vanlig definition');
    await page
      .getByRole('button', { name: 'Lägg typförslaget i mitt utkast', exact: true })
      .click();
    const newlyCreated = await app.read();
    const created = newlyCreated.draft.objectTypes?.find(
      (change) => change.after?.name === 'Solcellsanläggning',
    );
    expect(created?.id).not.toBe(app.typeId);
    expect(created?.restoration).toBeUndefined();
    expect(newlyCreated.draft.changes).toEqual(before.draft.changes);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    const proposal = await openDraftReview(page);
    await proposal
      .getByRole('button', { name: 'Visa förslaget: Solcellsanläggning', exact: true })
      .click();
    const values = page.getByRole('dialog', { name: 'Solcellsanläggning', exact: true });
    await expect(values).toContainText('Ny vanlig definition');
    await expect(
      values.getByRole('heading', { name: 'Föreslagna värden', exact: true }),
    ).toBeVisible();
    await closeSupportDialog(page, 'Solcellsanläggning');
    await saveReviewedConflictDraft(page);
    await app.installation.restart();
    await refreshConflictReader(page, app.installation.origin);
    await expectSavedConflictObject(page, 'Oberoende förslag');
    await readSavedHistoricalDefinition(page, false, 'Solcellsanläggning', 'Ny vanlig definition');
  } finally {
    await administrator.close();
    await app.installation.close();
  }
});
