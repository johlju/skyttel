import type { Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openNewObject,
  openTable,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import {
  editObjectRelationship,
  editTableObject,
  openObjectRelationships,
  readDraftProposal,
  readTableObject,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { propertyRow, propertyValue, setProperty } from '../support/property-controls.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';

async function openMap(page: Page) {
  const installation = await createInstallation();
  await signIn(page.request, installation.origin);
  const { household } = await (await createHousehold(page.request, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}/map`;
  await page.goto(installation.origin);
  await openTable(page);
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  return { installation, read };
}

async function addObject(page: Page, name: string, type: string, description?: string) {
  await openNewObject(page);
  await page.getByLabel('Namn', { exact: true }).fill(name);
  await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: type });
  if (description !== undefined) await setProperty(page, 'Beskrivning', description);
  await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
}

async function addRelationship(page: Page, source: string, type: string, target: string) {
  const dialog = await openObjectRelationships(page, source.split(' (')[0]);
  await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
  await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: type });
  const id = target.includes('[')
    ? target.match(/\[([^\]]+)\]$/)?.[1]
    : await page
        .getByLabel('Till objekt', { exact: true })
        .getByRole('option')
        .filter({ hasText: `${target.split(' (')[0]} ·` })
        .getAttribute('value');
  expect(id).toEqual(expect.any(String));
  await page.getByLabel('Till objekt', { exact: true }).selectOption(id ?? '');
  await stageRelationshipAndClose(page);
}

async function save(page: Page) {
  await saveReviewedConflictDraft(page);
  await expect(page.getByRole('region', { name: 'Utkastet' })).toContainText('Utkastet är tomt');
  await closeTextView(page);
  await openTable(page);
}

async function removeObject(page: Page, name: string) {
  await openTable(page);
  const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
  await table.getByRole('button', { name: `Ta bort ${name}`, exact: true }).click();
}

async function expectUncoveredFocus(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const target = document.activeElement;
        if (!(target instanceof HTMLElement)) return false;
        const box = target.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          box.left >= 0 &&
          box.top >= 0 &&
          box.right <= innerWidth &&
          box.bottom <= innerHeight &&
          target.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
        );
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('KARTA-01: Swedish object search and closing unsent forms preserve the saved map', async ({
  page,
}) => {
  const { installation, read } = await openMap(page);
  try {
    await addObject(page, 'Åsas tjänst', 'Tjänst', 'Gemensam musik');
    await addObject(page, 'Övrigt konto', 'Tjänstekonto');
    await addObject(page, 'Kim', 'Person');
    await save(page);
    const saved = await read();
    const objects = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const search = page.getByLabel('Sök objekt i tabellen', { exact: true });
    await search.fill('åSAS');
    await expect(objects.locator('.household-table-row-toggle')).toHaveText([/Åsas tjänst/]);
    await openDraftReview(page);
    await editTableObject(page, 'Åsas tjänst');
    await expect(page.getByLabel('Namn', { exact: true })).toBeFocused();
    await page.getByLabel('Namn', { exact: true }).fill('Text som inte skickas');
    await setProperty(page, 'Beskrivning', 'Inte heller denna text skickas');
    await expect(
      page.getByRole('button', { name: 'Spara hela utkastet', includeHidden: true }),
    ).toBeDisabled();
    await page.getByRole('dialog').getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }).click();
    await expect(
      objects.getByRole('button', { name: 'Redigera Åsas tjänst', exact: true }),
    ).toBeFocused();
    await editTableObject(page, 'Åsas tjänst');
    await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Åsas tjänst');
    await expect(propertyRow(page, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Gemensam musik',
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Avbryt', exact: true }).click();
    if (await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }).isVisible())
      await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }).click();
    await search.fill('finns inte');
    await expect(objects.locator('.household-table-row-toggle')).toHaveCount(0);
    await search.fill('');
    await expect(objects.locator('.household-table-row-toggle')).toHaveCount(3);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Avbrutet objekt');
    await page.getByRole('dialog').getByRole('button', { name: 'Avbryt', exact: true }).click();
    if (await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }).isVisible())
      await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt' }).click();
    await page.reload();
    await openTable(page);
    await expect(objects.locator('.household-table-row-toggle')).toHaveCount(3);
    expect((await read()).objects).toEqual(saved.objects);
    expect((await read()).draft.changes).toEqual([]);
  } finally {
    await installation.close();
  }
});

test('KARTA-02: an unresolved object can become unspecified and later identified without changing its links', async ({
  page,
}) => {
  const { installation, read } = await openMap(page);
  try {
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Betalkonto');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Bankkonto' });
    await page.getByLabel('Identitet').selectOption('unresolved');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const objectId = (await read()).draft.changes[0].id;
    await page.reload();
    await openDraftReview(page);
    await expect(page.getByRole('region', { name: 'Utkastet' })).toContainText(
      'Identiteten är olöst',
    );
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    expect((await read()).objects).toEqual([]);
    await closeTextView(page);
    await editTableObject(page, 'Betalkonto');
    await expect(page.getByLabel('Identitet')).toHaveValue('unresolved');
    await page.getByLabel('Identitet').selectOption('unspecified');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await addObject(page, 'Familjemusik', 'Abonnemang');
    await addRelationship(
      page,
      'Familjemusik (Abonnemang)',
      'Betalas med',
      'Betalkonto (Bankkonto)',
    );
    await save(page);
    const before = await read();
    expect(before.objects.find((object) => object.id === objectId)?.identity).toBe('unspecified');
    const relationship = before.relationships[0];
    expect(relationship.targetId).toBe(objectId);
    await page.reload();
    await openTable(page);
    await editTableObject(page, 'Betalkonto');
    await expect(page.getByLabel('Identitet')).toHaveValue('unspecified');
    await page.getByLabel('Identitet').selectOption('identified');
    await page.getByLabel('Namn', { exact: true }).fill('Hushållskontot');
    await setProperty(page, 'Beskrivning', 'Gemensamt bankkonto');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await save(page);
    await page.reload();
    await openTable(page);
    const relationshipRead = await openObjectRelationships(page, 'Familjemusik');
    await expect(relationshipRead).toContainText('Familjemusik → Betalas med → Hushållskontot');
    await relationshipRead.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await editTableObject(page, 'Hushållskontot');
    await expect(page.getByLabel('Identitet')).toHaveValue('identified');
    const after = await read();
    expect(after.objects).toHaveLength(2);
    expect(after.objects.find((object) => object.id === objectId)).toMatchObject({
      name: 'Hushållskontot',
      properties: expect.arrayContaining([
        expect.objectContaining({
          label: 'Beskrivning',
          kind: 'text',
          value: 'Gemensamt bankkonto',
        }),
      ]),
    });
    expect(after.objects.find((object) => object.id === objectId)?.identity).toBeUndefined();
    expect(after.relationships).toEqual([relationship]);
  } finally {
    await installation.close();
  }
});

for (const width of [1280, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    const caseId =
      width === 1280 && theme === 'light'
        ? 'KARTA-08'
        : `KARTA-${26 + [1280, 390, 320].indexOf(width) * 2 + (theme === 'dark' ? 1 : 0) - 1}`;
    test(`${caseId}: discarding unsent object text preserves proposals before correcting an unresolved identity at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const { installation, read } = await openMap(page);
      try {
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme);
        await addObject(page, 'Familjemusik', 'Abonnemang', 'Sparad beskrivning');
        await save(page);
        const before = await read();
        await openNewObject(page);
        await page.getByLabel('Namn', { exact: true }).fill('Betalkonto');
        await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Bankkonto' });
        await page.getByLabel('Identitet').selectOption('unresolved');
        await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        const accountId = (await read()).draft.changes[0].id;
        await addRelationship(
          page,
          'Familjemusik (Abonnemang)',
          'Betalas med',
          'Betalkonto (Bankkonto)',
        );
        const proposed = await read();
        const relationship = proposed.draft.relationships?.[0];
        expect(relationship?.after?.targetId).toBe(accountId);

        await editTableObject(page, 'Familjemusik');
        const unrelated = page.getByRole('dialog', { name: 'Redigera Familjemusik', exact: true });
        await setProperty(unrelated, 'Beskrivning', 'Oskickat om Familjemusik');
        await unrelated.getByRole('button', { name: 'Avbryt', exact: true }).click();
        await page
          .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
          .click();
        expect((await read()).draft).toEqual(proposed.draft);
        await editTableObject(page, 'Betalkonto');
        const editor = page.getByRole('dialog', { name: 'Redigera Betalkonto', exact: true });
        await expect(editor.getByLabel('Namn', { exact: true })).toBeFocused();
        await expectUncoveredFocus(page);
        await expect(editor.getByLabel('Identitet', { exact: true })).toHaveValue('unresolved');
        await editor.getByLabel('Identitet', { exact: true }).selectOption('unspecified');
        await setProperty(editor, 'Beskrivning', 'Rättad beskrivning');
        await editor
          .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
          .click();
        const corrected = await read();
        expect(corrected.objects).toEqual(before.objects);
        expect(corrected.relationships).toEqual(before.relationships);
        expect(corrected.draft.changes).toEqual([
          expect.objectContaining({
            id: accountId,
            after: expect.objectContaining({
              name: 'Betalkonto',
              identity: 'unspecified',
              properties: expect.arrayContaining([
                expect.objectContaining({
                  label: 'Beskrivning',
                  kind: 'text',
                  value: 'Rättad beskrivning',
                }),
              ]),
            }),
          }),
        ]);
        expect(corrected.draft.relationships).toEqual(proposed.draft.relationships);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (width !== 1280 || theme !== 'light') return;
        await save(page);
        await installation.restart();
        await page.reload();
        await openTable(page);
        const saved = await read();
        expect(saved.objects).toHaveLength(2);
        expect(saved.objects.find((object) => object.id === accountId)).toMatchObject({
          name: 'Betalkonto',
          identity: 'unspecified',
          properties: expect.arrayContaining([
            expect.objectContaining({
              label: 'Beskrivning',
              kind: 'text',
              value: 'Rättad beskrivning',
            }),
          ]),
        });
        expect(saved.objects.find((object) => object.id === before.objects[0].id)).toEqual(
          before.objects[0],
        );
        expect(saved.relationships).toEqual([
          expect.objectContaining({ id: relationship?.id, ...relationship?.after }),
        ]);
        await expect(await readTableObject(page, 'Betalkonto')).toContainText('Rättad beskrivning');
        await expect(await readTableObject(page, 'Betalkonto')).toContainText(
          'Ospecificerat objekt',
        );
        await expect(await readTableObject(page, 'Familjemusik')).toContainText(
          'Sparad beskrivning',
        );
        await expect(await openObjectRelationships(page, 'Familjemusik')).toContainText(
          'Familjemusik → Betalas med → Betalkonto',
        );
      } finally {
        await installation.close();
      }
    });
  }
}

test('KARTA-03: equal object names stay distinct when correcting and deleting a relationship', async ({
  page,
}) => {
  const { installation, read } = await openMap(page);
  try {
    await addObject(page, 'Musikkonto', 'Tjänstekonto');
    await addObject(page, 'familj@example.test', 'E-postadress', 'Första adressobjektet');
    await addObject(page, 'familj@example.test', 'E-postadress', 'Andra adressobjektet');
    const draft = await read();
    const first = draft.draft.changes.find(
      (change) => propertyValue(change.after, 'Beskrivning') === 'Första adressobjektet',
    )?.id;
    const second = draft.draft.changes.find(
      (change) => propertyValue(change.after, 'Beskrivning') === 'Andra adressobjektet',
    )?.id;
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    const firstLabel = `familj@example.test (E-postadress) — Första adressobjektet [${first}]`;
    const secondLabel = `familj@example.test (E-postadress) — Andra adressobjektet [${second}]`;
    await addRelationship(page, 'Musikkonto (Tjänstekonto)', 'Inloggningsadress', firstLabel);
    await addRelationship(page, 'Musikkonto (Tjänstekonto)', 'Kontaktadress', secondLabel);
    await save(page);
    const saved = await read();
    const loginType = saved.relationshipTypes.find((type) => type.name === 'Inloggningsadress');
    const login = saved.relationships.find((relationship) => relationship.typeId === loginType?.id);
    expect(login?.targetId).toBe(first);
    const contact = saved.relationships.find((relationship) => relationship.id !== login?.id);
    expect(contact?.targetId).toBe(second);
    const duplicate = await openObjectRelationships(page, 'Musikkonto');
    await duplicate.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await duplicate
      .getByLabel('Sambandstyp', { exact: true })
      .selectOption({ label: 'Inloggningsadress' });
    await duplicate.getByLabel('Till objekt', { exact: true }).selectOption(first ?? '');
    await duplicate.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(duplicate.getByRole('alert')).toContainText('Sambandet finns redan');
    await expect(duplicate.locator('.household-read-relationships > li')).toHaveCount(2);
    expect((await read()).draft.relationships ?? []).toEqual([]);
    await duplicate.getByRole('button', { name: 'Avbryt redigeringen', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true })
      .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
      .click();
    await duplicate.getByRole('button', { name: 'Stäng samband', exact: true }).click();

    const loginName = 'Musikkonto → Inloggningsadress → familj@example.test';
    let editor = await editObjectRelationship(page, 'Musikkonto', loginName);
    await expect(editor.getByLabel('Till objekt', { exact: true })).toHaveValue(first ?? '');
    const secondOption = editor
      .getByLabel('Till objekt', { exact: true })
      .getByRole('option')
      .filter({ hasText: `[${second}]` });
    await expect(secondOption).toHaveText(`familj@example.test · E-postadress [${second}]`);
    await expect(secondOption).toHaveAttribute('value', second ?? 'missing');
    const candidates = editor.getByRole('region', {
      name: 'Till objekt: välj eller granska',
      exact: true,
    });
    const secondCandidate = candidates
      .getByText(`Granska familj@example.test [${second}]`, { exact: true })
      .locator('..');
    await secondCandidate.locator('summary').click();
    await expect(secondCandidate).toContainText('Beskrivning');
    await expect(secondCandidate).toContainText('Andra adressobjektet (Text)');
    await secondCandidate
      .getByRole('button', { name: `Välj familj@example.test [${second}]`, exact: true })
      .click();
    await editor.getByRole('button', { name: 'Avbryt redigeringen', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true })
      .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
      .click();
    expect((await read()).relationships).toEqual(saved.relationships);
    await editor.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    editor = await editObjectRelationship(page, 'Musikkonto', loginName);
    await expect(editor.getByLabel('Till objekt', { exact: true })).toHaveValue(first ?? '');
    await editor.getByLabel('Till objekt', { exact: true }).selectOption(second ?? '');
    await stageRelationshipAndClose(page);
    await save(page);
    await page.reload();
    editor = await editObjectRelationship(page, 'Musikkonto', loginName);
    await expect(editor.getByLabel('Till objekt', { exact: true })).toHaveValue(second ?? '');
    const corrected = await read();
    expect(corrected.objects).toEqual(saved.objects);
    expect(
      corrected.relationships.find((relationship) => relationship.id === login?.id),
    ).toMatchObject({ targetId: second, sourceId: login?.sourceId, typeId: login?.typeId });
    await editor.getByRole('button', { name: 'Föreslå borttagning', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Lägg i utkastet', exact: true })).toHaveCount(
      0,
    );
    await editor.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await expect(await openDraftReview(page)).toContainText('Tas bort');
    await save(page);
    await page.reload();
    const remaining = await openObjectRelationships(page, 'Musikkonto');
    await expect(remaining.getByRole('heading', { name: loginName, exact: true })).toHaveCount(0);
    await expect(
      remaining.getByRole('heading', {
        name: 'Musikkonto → Kontaktadress → familj@example.test',
        exact: true,
      }),
    ).toBeVisible();
    const after = await read();
    expect(after.relationships).toEqual([contact]);
    expect(after.objects).toEqual(saved.objects);
  } finally {
    await installation.close();
  }
});

test('KARTA-04: object deletion reviews incoming and outgoing links and can be discarded', async ({
  page,
}) => {
  const { installation, read } = await openMap(page);
  try {
    await addObject(page, 'Kim', 'Person');
    await addObject(page, 'Molnmusik', 'Tjänst');
    await addObject(page, 'Musikkonto', 'Tjänstekonto');
    await addObject(page, 'Familjemusik', 'Abonnemang');
    await addRelationship(page, 'Kim (Person)', 'Använder', 'Molnmusik (Tjänst)');
    await addRelationship(
      page,
      'Musikkonto (Tjänstekonto)',
      'Tillhör tjänsten',
      'Molnmusik (Tjänst)',
    );
    await addRelationship(
      page,
      'Familjemusik (Abonnemang)',
      'Gäller tjänstekontot',
      'Musikkonto (Tjänstekonto)',
    );
    await save(page);
    const saved = await read();
    const object = saved.objects.find((item) => item.name === 'Musikkonto');
    await removeObject(page, 'Musikkonto');
    const review = await openDraftReview(page);
    await expect(review.getByRole('button', { name: /^Visa förslaget:/ })).toHaveCount(3);
    await expect(review).toContainText('Tas bort');
    for (const name of [
      'Musikkonto',
      'Musikkonto → Tillhör tjänsten → Molnmusik',
      'Familjemusik → Gäller tjänstekontot → Musikkonto',
    ]) {
      await expect(await readDraftProposal(page, name)).toContainText(name);
      await page.keyboard.press('Escape');
    }
    expect((await read()).objects).toEqual(saved.objects);
    expect((await read()).relationships).toEqual(saved.relationships);
    await closeTextView(page);
    const relationshipForm = await openObjectRelationships(page, 'Kim');
    await relationshipForm.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    for (const field of ['Från objekt', 'Till objekt'])
      await expect(
        relationshipForm
          .getByLabel(field, { exact: true })
          .getByRole('option', { name: /Musikkonto/ }),
      ).toHaveCount(0);
    await relationshipForm
      .getByRole('button', { name: 'Avbryt redigeringen', exact: true })
      .click();
    await relationshipForm.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await openDraftReview(page);
    await review.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
      .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
      .click();
    await expect(review).toContainText('Utkastet är tomt');
    await closeTextView(page);
    const restored = await openObjectRelationships(page, 'Musikkonto');
    await expect(restored.locator('.household-read-relationships > li')).toHaveCount(2);
    await restored.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    const kim = await openObjectRelationships(page, 'Kim');
    await expect(kim.locator('.household-read-relationships > li')).toHaveCount(1);
    await kim.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    expect((await read()).objects).toEqual(saved.objects);
    expect((await read()).relationships).toEqual(saved.relationships);
    await removeObject(page, 'Musikkonto');
    await save(page);
    await page.reload();
    await openTable(page);
    await expect(page.locator('.household-table-row-toggle')).toHaveText([
      /Familjemusik/,
      /Kim/,
      /Molnmusik/,
    ]);
    const remaining = await openObjectRelationships(page, 'Kim');
    await expect(remaining.locator('.household-read-relationships > li h4')).toHaveText([
      'Kim → Använder → Molnmusik',
    ]);
    const after = await read();
    expect(after.objects).toEqual(saved.objects.filter((item) => item.id !== object?.id));
    expect(after.relationships).toEqual(
      saved.relationships.filter(
        (relationship) =>
          relationship.sourceId !== object?.id && relationship.targetId !== object?.id,
      ),
    );
  } finally {
    await installation.close();
  }
});
