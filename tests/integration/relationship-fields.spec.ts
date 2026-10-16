import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openSettings,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { openSavedHistory, readCommittedHistoryCard } from '../support/conversation-page.js';
import {
  editObjectRelationship,
  openObjectRelationships,
  readDraftProposal,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';

for (const [caseId, width] of [
  ['STY-06', 1440],
  ['STY-09', 390],
] as const)
  test(`${caseId}: optional relationship fields share definitions and keyboard editing at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const installation = await createInstallation();
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async () => (await page.request.get(path)).json();
      const initial = await read();
      for (const [version, id, name] of [
        [0, 'bike', 'Cykeln'],
        [1, 'garage', 'Garaget'],
      ] as const)
        expect(
          (
            await page.request.post(`${path}/draft`, {
              headers: { origin: installation.origin },
              data: {
                version,
                id,
                baseRevision: null,
                value: { typeId: initial.types[version].id, name, description: '' },
              },
            })
          ).status(),
        ).toBe(200);
      await page.goto(installation.origin);
      await openSettings(page);
      const nav = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
      if (width <= 800) await nav.getByText('Välj inställning', { exact: true }).click();
      await nav.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
      await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
      await page.getByLabel('Sambandstypens namn').fill('Förvaring');
      await page.getByLabel('Sambandstypens beskrivning').fill('Var saker finns');
      await page.getByLabel('Benämning från startobjektet').fill('förvaras i');
      await page.getByLabel('Benämning från målobjektet').fill('innehåller');
      const fieldNames = ['Anteckning', 'Belopp', 'Startdatum', 'Bekräftat', 'Obesvarat'];
      for (const [index, kind] of ['text', 'number', 'date', 'boolean', 'boolean'].entries()) {
        await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
        const field = page.getByRole('group', { name: `Eget fält ${index + 1}`, exact: true });
        await expect(field.getByLabel('Fältets namn')).toBeFocused();
        await field.getByLabel('Fältets namn').fill(fieldNames[index]);
        await field.getByLabel('Värdeslag').selectOption(kind);
      }
      await page.getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' }).click();
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      const relationships = await openObjectRelationships(page, 'Cykeln');
      await relationships.getByRole('button', { name: 'Nytt samband', exact: true }).click();
      await page.getByLabel('Från objekt').selectOption('bike');
      await page.getByLabel('Till objekt').selectOption('garage');
      await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Förvaring' });
      await page.getByLabel('Anteckning', { exact: true }).fill('Låst skåp');
      await page.getByLabel('Belopp', { exact: true }).fill('0');
      await page.getByLabel('Startdatum', { exact: true }).fill('2026-09-27');
      await page.getByLabel('Bekräftat', { exact: true }).selectOption('false');
      await expect(page.getByLabel('Obesvarat', { exact: true })).toHaveValue('');
      await page.getByLabel('Anteckning', { exact: true }).focus();
      for (const name of ['Belopp', 'Startdatum', 'Bekräftat', 'Obesvarat']) {
        await page.keyboard.press('Tab');
        const field = page.getByLabel(name, { exact: true });
        // The native date control includes several internal keyboard stops.
        if (name === 'Bekräftat')
          for (let stop = 0; stop < 4; stop++) {
            if (await field.evaluate((element) => element === document.activeElement)) break;
            await expect(page.getByLabel('Startdatum', { exact: true })).toBeFocused();
            await page.keyboard.press('Tab');
          }
        await expect(field).toBeFocused();
      }
      const stage = relationships.getByRole('button', { name: 'Lägg i utkastet', exact: true });
      await stage.focus();
      await expect(stage).toBeFocused();
      const bounds = await stage.boundingBox();
      expect(bounds?.y).toBeGreaterThanOrEqual(0);
      expect((bounds?.y ?? 1000) + (bounds?.height ?? 0)).toBeLessThanOrEqual(1000);
      expect(
        await relationships.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await stageRelationshipAndClose(page);
      const review = await readDraftProposal(page, 'Cykeln → förvaras i → Garaget');
      await expect(review).toContainText('Låst skåp');
      await expect(review).toContainText('Nej');
      await closeSupportDialog(page, 'Cykeln → förvaras i → Garaget');
      if (width !== 1440) {
        await closeTextView(page);
        await editObjectRelationship(page, 'Cykeln', 'Cykeln → förvaras i → Garaget');
        await expect(page.getByLabel('Belopp', { exact: true })).toHaveValue('0');
        await expect(page.getByLabel('Bekräftat', { exact: true })).toHaveValue('false');
        await expect(page.getByLabel('Obesvarat', { exact: true })).toHaveValue('');
        await page.getByLabel('Anteckning', { exact: true }).fill('Övre hyllan');
        await stageRelationshipAndClose(page);
        await expect(
          page.getByRole('button', { name: 'Samband för Cykeln', exact: true }),
        ).toBeFocused();
        expect((await read()).objects).toEqual([]);
        expect((await read()).relationships).toEqual([]);
        return;
      }
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      await installation.restart();
      await page.reload();
      await editObjectRelationship(page, 'Cykeln', 'Cykeln → förvaras i → Garaget');
      await expect(page.getByLabel('Anteckning', { exact: true })).toHaveValue('Låst skåp');
      await expect(page.getByLabel('Belopp', { exact: true })).toHaveValue('0');
      await expect(page.getByLabel('Startdatum', { exact: true })).toHaveValue('2026-09-27');
      await expect(page.getByLabel('Bekräftat', { exact: true })).toHaveValue('false');
      await expect(page.getByLabel('Obesvarat', { exact: true })).toHaveValue('');
      await page.getByLabel('Anteckning', { exact: true }).fill('Övre hyllan');
      await stageRelationshipAndClose(page);
      await saveReviewedConflictDraft(page);
      await closeTextView(page);
      const state = await read();
      const fields = state.relationshipTypes.find(
        (type: { name: string }) => type.name === 'Förvaring',
      ).fields;
      expect(state.relationships[0].customValues).toEqual({
        [fields[0].id]: 'Övre hyllan',
        [fields[1].id]: 0,
        [fields[2].id]: '2026-09-27',
        [fields[3].id]: false,
      });
    } finally {
      await installation.close();
    }
  });

test('STY-07: relationship type changes require an explicit decision about earlier custom answers', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async () => (await page.request.get(path)).json();
    const propose = async (route: string, id: string, value: unknown) => {
      const response = await page.request.post(`${path}/${route}`, {
        headers: { origin: installation.origin },
        data: { version: (await read()).draft.version, id, baseRevision: null, value },
      });
      expect(response.status()).toBe(200);
    };
    const initial = await read();
    for (const id of ['bike', 'garage'])
      await propose('draft', id, { typeId: initial.types[0].id, name: id, description: '' });
    for (const [id, name] of [
      ['first', 'Förvaring'],
      ['second', 'Tillgång'],
    ])
      await propose('relationship-type', id, {
        name,
        description: '',
        forwardLabel: 'hör till',
        reverseLabel: 'har',
        fields: [{ id: 'note', name: 'Anteckning', description: '', kind: 'text' }],
      });
    await propose('relationship', 'edge', {
      typeId: 'first',
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
      customValues: { note: 'Behåll som historik' },
    });
    expect(
      (
        await page.request.post(`${path}/save`, {
          headers: { origin: installation.origin },
          data: { version: (await read()).draft.version, operationId: 'initial' },
        })
      ).status(),
    ).toBe(200);
    const originalReceipt = (await (await page.request.get(`${path}/history`)).json()).history[0];
    await page.goto(installation.origin);
    await editObjectRelationship(page, 'bike', 'bike → hör till → garage');
    await page.getByLabel('Sambandstyp', { exact: true }).selectOption('second');
    const loss = page.getByRole('dialog', { name: 'Ta bort tidigare egna fält?', exact: true });
    await expect(loss).toContainText('Anteckning: Behåll som historik');
    await expect(page.getByLabel('Sambandstyp', { exact: true })).toHaveValue('first');
    expect((await read()).draft.relationships ?? []).toHaveLength(0);
    await loss
      .getByRole('button', { name: 'Ta bort fältvärdena och byt typ', exact: true })
      .click();
    await expect(page.getByLabel('Anteckning', { exact: true })).toHaveValue('');
    await page.getByLabel('Anteckning', { exact: true }).fill('Ny betydelse');
    await stageRelationshipAndClose(page);
    const review = await readDraftProposal(page, 'bike → hör till → garage');
    await expect(review).toContainText('Behåll som historik');
    await expect(review).toContainText('Ny betydelse');
    await closeSupportDialog(page, 'bike → hör till → garage');
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    expect((await read()).relationships[0]).toMatchObject({
      typeId: 'second',
      customValues: { note: 'Ny betydelse' },
    });
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history[0].relationships[0]).toMatchObject({
      before: { customValues: { note: 'Behåll som historik' } },
      beforeType: { id: 'first' },
      type: { id: 'second' },
    });
    const nativeHistory = await openSavedHistory(page);
    const changedCard = await readCommittedHistoryCard(nativeHistory, history[0]);
    await changedCard.getByText('Visa ändringarna', { exact: true }).click();
    const changedRelationship = changedCard
      .locator('.history-changes > div')
      .filter({ has: page.getByRole('heading', { name: 'Samband: Tillgång', exact: true }) });
    await expect(changedRelationship.getByText('Identitet: edge', { exact: true })).toBeVisible();
    for (const [title, answer] of [
      ['Före sparandet', 'Behåll som historik'],
      ['Efter sparandet', 'Ny betydelse'],
    ]) {
      const fields = changedRelationship.locator(
        `xpath=./section[preceding-sibling::h5[1][text()="${title}"]]`,
      );
      await expect(fields.getByText(`Anteckning: ${answer}`, { exact: true })).toBeVisible();
    }
    const originalCard = await readCommittedHistoryCard(nativeHistory, originalReceipt);
    await originalCard.getByText('Visa ändringarna', { exact: true }).click();
    const definition = originalCard
      .locator('.history-changes > div')
      .filter({ has: page.getByRole('heading', { name: 'Sambandstyp: Förvaring', exact: true }) });
    for (const value of ['Identitet: first', 'Förvaring', 'hör till', 'har', 'Anteckning', 'Text'])
      await expect(definition).toContainText(value);
    const originalRelationship = originalCard
      .locator('.history-changes > div')
      .filter({ has: page.getByRole('heading', { name: 'Samband: Förvaring', exact: true }) });
    await expect(originalRelationship.getByText('Identitet: edge', { exact: true })).toBeVisible();
    await expect(originalRelationship).toContainText('bike → hör till → garage');
    await expect(
      originalRelationship.getByText('Anteckning: Behåll som historik', { exact: true }),
    ).toBeVisible();
  } finally {
    await installation.close();
  }
});
