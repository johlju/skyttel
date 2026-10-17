import type { Page } from '@playwright/test';
import { draftConflicts } from '../../src/shared/draft-conflicts.js';
import {
  closeSupportDialog,
  closeTextView,
  openDraftReview,
  utilityButton,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { openSavedHistory, readCommittedHistoryCard } from '../support/conversation-page.js';
import { editObjectRelationship, readDraftProposal } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { prepareMapExploration } from '../support/map-exploration.js';
import { focusMapSearch, mapFilters } from '../support/object-search.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';

async function prepare(page: Page, origin: string, variant: 'base' | 'ended' | 'removed' = 'base') {
  const data = await prepareMapExploration(page.request, origin, variant);
  await page.goto(`${origin}/households/${data.household.id}`);
  return data;
}

test('SÖK-06: map search shows direct context and exploration preserves hits through return and table visits', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await prepare(page, installation.origin);
    const before = await data.read();
    const historyPath = `${installation.origin}/api/households/${data.household.id}/map/history`;
    const historyBefore = await (await page.request.get(historyPath)).json();
    await focusMapSearch(page);
    const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
    await panel.getByRole('searchbox').fill('Alex');
    await expect(
      page.getByRole('button', { name: 'Välj objekt: Alex Exempel', exact: true }),
    ).toHaveAccessibleDescription(/Sökträff/);
    await panel.getByRole('searchbox').press('Escape');
    const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const node = (name: string) =>
      map.getByRole('button', { name: `Välj objekt: ${name}`, exact: true });
    await expect(node('Alex Exempel')).toBeVisible();
    await expect(node('Blå cykel')).toBeVisible();
    await expect(node('Blå cykel')).toHaveAccessibleDescription(/Sammanhang/);
    await expect(node('Alex Exempel')).toHaveAccessibleDescription(/Sökträff/);
    await expect(node('Garaget')).toHaveCount(0);
    await node('Blå cykel').focus();
    await page.keyboard.press('Enter');
    await expect(node('Blå cykel')).toHaveAttribute('aria-pressed', 'true');
    await expect(node('Garaget')).toHaveCount(0);
    const cameraBefore = await node('Alex Exempel').boundingBox();
    await node('Blå cykel').press('Shift+F10');
    await page.getByRole('button', { name: 'Visa samband i kartan', exact: true }).click();
    await expect(node('Garaget')).toBeVisible();
    await expect(node('Alex Exempel')).toBeVisible();
    await expect(node('Bostaden')).toHaveCount(0);
    await expect
      .poll(async () => {
        const after = await node('Alex Exempel').boundingBox();
        return after?.x !== cameraBefore?.x || after?.y !== cameraBefore?.y;
      })
      .toBe(true);
    await node('Garaget').focus();
    await page.keyboard.press('Enter');
    await node('Garaget').press('Shift+F10');
    await page.getByRole('button', { name: 'Visa samband i kartan', exact: true }).click();
    await expect(node('Bostaden')).toBeVisible();
    await focusMapSearch(page);
    await (await mapFilters(page)).getByLabel(data.initial.types[0].name, { exact: true }).check();
    await expect(node('Garaget')).toHaveCount(0);
    await expect(node('Bostaden')).toHaveCount(0);
    await panel.getByRole('searchbox').fill('Blå');
    await expect(node('Garaget')).toBeVisible();
    await expect(node('Bostaden')).toHaveCount(0);
    await panel.getByRole('searchbox').fill('Alex');
    await panel.getByRole('searchbox').press('Escape');
    await node('Blå cykel').focus();
    await page.keyboard.press('Enter');
    await node('Blå cykel').press('Shift+F10');
    await page.getByRole('button', { name: 'Visa samband i kartan', exact: true }).click();
    await (await utilityButton(page, 'Tabell')).click();
    await (await utilityButton(page, 'Karta')).click();
    await expect(node('Garaget')).toBeVisible();
    await page.getByRole('button', { name: 'Tillbaka till sökträffarna', exact: true }).click();
    await expect(node('Garaget')).toHaveCount(0);
    await expect(node('Blå cykel')).toBeVisible();
    await expect(page.getByRole('img', { name: /Rymdens bakgrund/ })).toBeFocused();
    await focusMapSearch(page);
    await expect(panel.getByRole('searchbox')).toHaveValue('Alex');
    await panel.getByRole('searchbox').press('Escape');
    await node('Blå cykel').press('Shift+F10');
    const actions = page.getByRole('toolbar', { name: 'Åtgärder för Blå cykel', exact: true });
    await expect(
      actions.getByRole('button', { name: 'Visa i kartan', exact: true }),
    ).toHaveAccessibleDescription(/Rensar kartans sökning och filter/);
    await actions.getByRole('button', { name: 'Visa i kartan', exact: true }).click();
    await expect(actions).toHaveCount(0);
    await expect(node('Blå cykel')).toHaveAttribute('aria-pressed', 'true');
    await expect(node('Bostaden')).toBeVisible();
    await expect(page.getByRole('img', { name: /Rymdens bakgrund/ })).toBeFocused();
    await focusMapSearch(page);
    await expect(panel.getByRole('searchbox')).toHaveValue('');
    await expect(
      (await mapFilters(page)).getByLabel(data.initial.types[0].name, { exact: true }),
    ).not.toBeChecked();
    await panel.getByRole('searchbox').press('Escape');
    expect(await data.read()).toEqual(before);
    expect(await (await page.request.get(historyPath)).json()).toEqual(historyBefore);
  } finally {
    await installation.close();
  }
});

test('SÖK-09: a changed connection shows direct saved and proposed endpoints without expanding their chains', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await prepare(page, installation.origin);
    const state = await data.read();
    const edge = state.relationships.find((item) => item.id === 'uses');
    if (!edge) throw new Error('Expected connection');
    const readNativeContext = async (previous: boolean) => {
      await (await utilityButton(page, 'Karta')).click();
      await focusMapSearch(page);
      const search = page
        .getByRole('region', { name: 'Kartans sökning och filter' })
        .getByRole('searchbox');
      await search.fill('Alex');
      await search.press('Escape');
      const labels = page.getByRole('button', { name: 'Alla etiketter', exact: true });
      if ((await labels.getAttribute('aria-pressed')) !== 'true') await labels.click();
      const nativeMap = page.getByRole('region', { name: 'Rymdkarta', exact: true });
      await expect(
        nativeMap.getByRole('button', { name: 'Välj objekt: Alex Exempel', exact: true }),
      ).toBeVisible();
      await expect(
        nativeMap.getByRole('button', { name: 'Välj objekt: Garaget', exact: true }),
      ).toBeVisible();
      await expect(
        nativeMap.getByRole('button', { name: 'Välj objekt: Bostaden', exact: true }),
      ).toHaveCount(0);
      await expect(
        nativeMap.getByRole('button', { name: 'Välj objekt: Blå cykel', exact: true }),
      ).toHaveCount(previous ? 1 : 0);
      const current = nativeMap.locator(
        'button[aria-label="Välj samband: Alex Exempel → Använder → Garaget"]',
      );
      await expect(current).toBeVisible();
      await expect(current).toHaveAttribute('aria-describedby', new RegExp(`-current-${edge.id}$`));
      await expect(current).toContainText('→');
      await expect(current).toContainText('Använder');
      const old = nativeMap.locator(
        'button[aria-label="Välj tidigare samband: Alex Exempel → Använder → Blå cykel"]',
      );
      const geometry = nativeMap.locator(
        `.connection.previous[data-previous-relationship="${edge.id}"]`,
      );
      await expect(old).toHaveCount(previous ? 1 : 0);
      await expect(geometry).toHaveCount(previous ? 1 : 0);
      if (previous) {
        await expect(old).toBeVisible();
        await expect(old).toHaveAttribute('aria-describedby', new RegExp(`-previous-${edge.id}$`));
        await expect(old).toContainText('Använder');
        await expect(old).toContainText('×');
        await expect(geometry.locator('..').locator('.connection-arrow-shaft')).toHaveAttribute(
          'marker-end',
          'url(#spatial-arrow-removed)',
        );
        await expect(geometry).toHaveAttribute('d', /.+/);
        await expect(geometry.locator('title')).toHaveText(
          'Tidigare samband: Alex Exempel → Använder → Blå cykel',
        );
      }
      await expect(
        page
          .getByRole('complementary', { name: 'Kartans sökresultat' })
          .getByText(`${previous ? 2 : 1} objekt visas som sammanhang, utöver sökträffarna.`, {
            exact: true,
          }),
      ).toBeVisible();
    };
    let form = await editObjectRelationship(
      page,
      'Alex Exempel',
      'Alex Exempel → Använder → Blå cykel',
    );
    await form.getByLabel('Till objekt', { exact: true }).selectOption('garage');
    await stageRelationshipAndClose(page);
    expect(
      (await data.read()).draft.relationships?.find((change) => change.id === edge.id)?.after,
    ).toMatchObject({
      typeId: edge.typeId,
      sourceId: edge.sourceId,
      targetId: 'garage',
      knowledge: edge.knowledge,
    });
    await readNativeContext(true);
    await data.post('relationship', {
      id: edge.id,
      baseRevision: edge.revision,
      value: { ...edge, targetId: 'garage' },
    });
    await page.reload();
    await focusMapSearch(page);
    const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
    await panel.getByRole('searchbox').fill('Alex');
    await panel.getByRole('searchbox').press('Escape');
    const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    await expect(
      map.getByRole('button', { name: 'Välj objekt: Blå cykel', exact: true }),
    ).toBeVisible();
    await expect(
      map.getByRole('button', { name: 'Välj objekt: Garaget', exact: true }),
    ).toBeVisible();
    await expect(
      map.getByRole('button', { name: 'Välj objekt: Bostaden', exact: true }),
    ).toHaveCount(0);
    await expect(map.locator('.connection.previous')).toHaveCount(1);
    await expect(
      page
        .getByRole('complementary', { name: 'Kartans sökresultat' })
        .getByText('2 objekt visas som sammanhang, utöver sökträffarna.', { exact: true }),
    ).toBeVisible();
    const draft = await openDraftReview(page);
    await draft.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
      .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
      .click();
    await closeTextView(page);
    await data.post('discard', {});
    await page.reload();
    form = await editObjectRelationship(
      page,
      'Alex Exempel',
      'Alex Exempel → Använder → Blå cykel',
    );
    await form.getByLabel('Sambandets status', { exact: true }).selectOption('ended');
    await stageRelationshipAndClose(page);
    expect(
      (await data.read()).draft.relationships?.find((change) => change.id === edge.id)?.after,
    ).toMatchObject({
      typeId: edge.typeId,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      knowledge: edge.knowledge,
      lifecycle: 'ended',
    });
    const endedProposal = await readDraftProposal(page, 'Alex Exempel → Använder → Blå cykel');
    for (const [title, status, applies] of [
      ['Sparade värden', 'Följ slutdatum', 'Aktuellt'],
      ['Föreslagna värden', 'Manuellt upphört', 'Upphört'],
    ]) {
      const side = endedProposal
        .locator('section')
        .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      for (const [label, value] of [
        ['Från', 'Alex Exempel'],
        ['Sambandstyp', 'Använder'],
        ['Till', 'Blå cykel'],
        ['Uppgiftens säkerhet', 'Bekräftat'],
        ['Status', status],
        ['Gäller', applies],
      ])
        await expect(
          side
            .locator('dt')
            .filter({ hasText: new RegExp(`^${label}(?: · ändrat)?$`) })
            .locator('..')
            .locator('dd'),
        ).toHaveText(value);
    }
    await closeSupportDialog(page, 'Alex Exempel → Använder → Blå cykel');
    await closeTextView(page);
    await page.reload();
    const completed = page.waitForResponse(
      (response) =>
        response.url() === `${installation.origin}/api/households/${data.household.id}/map/save` &&
        response.request().method() === 'POST',
    );
    await saveReviewedConflictDraft(page);
    expect((await completed).status()).toBe(200);
    await closeTextView(page);
    const ended = (await data.read()).relationships.find((item) => item.id === edge.id);
    if (!ended) throw new Error('Expected ended connection');
    const endedReceipt = (await (await completed).json()).receipt;
    const nativeHistory = await openSavedHistory(page);
    const endedCard = await readCommittedHistoryCard(nativeHistory, endedReceipt);
    await endedCard.getByText('Visa ändringarna', { exact: true }).click();
    const change = endedCard
      .locator('.history-changes > div')
      .filter({ has: page.getByRole('heading', { name: 'Samband: Använder', exact: true }) });
    await expect(change.getByText(`Identitet: ${edge.id}`, { exact: true })).toBeVisible();
    for (const [title, status] of [
      ['Före sparandet', 'Följ slutdatum'],
      ['Efter sparandet', 'Manuellt upphört'],
    ]) {
      const side = change.locator(`xpath=./*[preceding-sibling::h5[1][text()="${title}"]]`);
      await expect(side.filter({ hasText: 'Alex Exempel → Använder → Blå cykel' })).toBeVisible();
      await expect(side.filter({ hasText: status })).toBeVisible();
      const identities = side.filter({
        has: page.getByText('Sambandets objektidentiteter', { exact: true }),
      });
      await identities.getByText('Sambandets objektidentiteter', { exact: true }).click();
      await expect(
        identities.getByText('Från objekt alex till objekt bike.', { exact: true }),
      ).toBeVisible();
    }
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    const committedState = await data.read();
    const committedHistory = (
      await (
        await page.request.get(
          `${installation.origin}/api/households/${data.household.id}/map/history`,
        )
      ).json()
    ).history;
    await data.post('relationship', {
      id: edge.id,
      baseRevision: ended.revision,
      value: { ...ended, lifecycle: 'ended' },
    });
    expect(draftConflicts(await data.read())).toEqual([]);
    await page.reload();
    const redundant = await openDraftReview(page);
    await redundant.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
      .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
      .click();
    await closeTextView(page);
    const { draft: committedDraft, ...committedShared } = committedState;
    const { draft: discardedDraft, ...discardedShared } = await data.read();
    expect(discardedShared).toEqual(committedShared);
    expect(discardedDraft.changes).toEqual(committedDraft.changes);
    expect(discardedDraft.objectTypes ?? []).toEqual([]);
    expect(discardedDraft.relationshipTypes ?? []).toEqual([]);
    expect(
      (
        await (
          await page.request.get(
            `${installation.origin}/api/households/${data.household.id}/map/history`,
          )
        ).json()
      ).history,
    ).toEqual(committedHistory);
    expect((await data.read()).draft.relationships ?? []).toEqual([]);
    expect(draftConflicts(await data.read())).toEqual([]);
    const table = await utilityButton(page, 'Tabell');
    await table.click();
    const householdTable = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await householdTable.getByRole('button', { name: /^Filter/ }).click();
    await page
      .getByRole('dialog', { name: 'Tabellens filter', exact: true })
      .getByLabel('Ta med upphörda', { exact: true })
      .check();
    await page.keyboard.press('Escape');
    form = await editObjectRelationship(
      page,
      'Alex Exempel',
      'Alex Exempel → Använder → Blå cykel',
    );
    await form.getByLabel('Sambandets status', { exact: true }).selectOption('active');
    await form.getByLabel('Till objekt', { exact: true }).selectOption('garage');
    await stageRelationshipAndClose(page);
    expect(
      (await data.read()).draft.relationships?.find((change) => change.id === ended.id)?.after,
    ).toMatchObject({
      typeId: ended.typeId,
      sourceId: ended.sourceId,
      targetId: 'garage',
      knowledge: ended.knowledge,
      lifecycle: 'active',
    });
    await readNativeContext(false);
    await page
      .getByRole('complementary', { name: 'Kartans sökresultat' })
      .getByRole('button', { name: 'Ta med upphörda', exact: true })
      .click();
    await readNativeContext(true);
    await focusMapSearch(page);
    await (await mapFilters(page)).getByLabel('Ta med upphörda', { exact: true }).uncheck();
    await page.keyboard.press('Escape');
    await data.post('relationship', {
      id: ended.id,
      baseRevision: ended.revision,
      value: { ...ended, lifecycle: 'active', targetId: 'garage' },
    });
    await page.reload();
    await focusMapSearch(page);
    await panel.getByRole('searchbox').fill('Alex');
    await panel.getByRole('searchbox').press('Escape');
    await expect(
      map.getByRole('button', { name: 'Välj objekt: Blå cykel', exact: true }),
    ).toHaveCount(0);
    await expect(map.locator('.connection.previous')).toHaveCount(0);
    await page
      .getByRole('complementary', { name: 'Kartans sökresultat' })
      .getByRole('button', { name: 'Ta med upphörda', exact: true })
      .click();
    await expect(
      map.getByRole('button', { name: 'Välj objekt: Blå cykel', exact: true }),
    ).toBeVisible();
    await expect(map.locator('.connection.previous')).toHaveCount(1);
  } finally {
    await installation.close();
  }
});

for (const width of [1280, 390, 320]) {
  const caseId = width === 1280 ? 'SÖK-08' : width === 390 ? 'SÖK-13' : 'SÖK-14';
  test(`${caseId}: table map actions reset only map filters and retain table work at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 950 });
      const data = await prepare(page, installation.origin, 'removed');
      const before = await data.read();
      await focusMapSearch(page);
      const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
      await panel.getByRole('searchbox').fill('Alex');
      if (width <= 700) {
        const tools = await page.getByRole('navigation', { name: 'Kartans verktyg' }).boundingBox();
        const searchBounds = await panel.boundingBox();
        expect(searchBounds?.y).toBeGreaterThan((tools?.y ?? 0) + (tools?.height ?? 0));
      }
      await (await mapFilters(page)).getByLabel('Bara markerade').check();
      await panel.getByRole('searchbox').press('Escape');

      await (await utilityButton(page, 'Tabell')).click();
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      const search = table.getByRole('searchbox');
      await search.fill('Blå');
      await table.getByRole('button', { name: 'Namn', exact: true }).click();
      await table.getByRole('button', { name: 'Blå cykel', exact: true }).click();
      const reveal = table.getByRole('button', { name: 'Visa Blå cykel i kartan', exact: true });
      await expect(reveal).toBeVisible();
      await expect(reveal).toHaveAttribute('title', /Rensar kartans sökning och filter/);
      await expect(reveal).toHaveAccessibleDescription(/Rensar kartans sökning och filter/);
      const context = table.getByRole('button', {
        name: 'Visa samband för Blå cykel i kartan',
        exact: true,
      });
      await expect(context).toHaveAttribute('title', /Behåller kartans sökning och filter/);
      await expect(context).toHaveAccessibleDescription(/Behåller kartans sökning och filter/);
      const tableMapIcons = await Promise.all([
        reveal.locator('svg path').getAttribute('d'),
        context.locator('svg path').getAttribute('d'),
      ]);
      await context.click();
      const focusedMap = page.getByRole('region', { name: 'Rymdkarta', exact: true });
      await expect(
        focusedMap.getByRole('button', { name: 'Välj objekt: Blå cykel', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        focusedMap.getByRole('button', { name: 'Välj objekt: Garaget', exact: true }),
      ).toBeVisible();
      await expect(
        focusedMap.getByRole('button', { name: 'Välj objekt: Bostaden', exact: true }),
      ).toHaveCount(0);
      await focusedMap
        .getByRole('button', { name: 'Välj objekt: Blå cykel', exact: true })
        .press('Shift+F10');
      const actions = page.getByRole('toolbar', { name: 'Åtgärder för Blå cykel', exact: true });
      await expect(actions.getByRole('button')).toHaveCount(7);
      expect(
        await actions
          .getByRole('button', { name: 'Visa i kartan', exact: true })
          .locator('svg path')
          .getAttribute('d'),
      ).toBe(tableMapIcons[0]);
      expect(
        await actions
          .getByRole('button', { name: 'Visa samband i kartan', exact: true })
          .locator('svg path')
          .getAttribute('d'),
      ).toBe(tableMapIcons[1]);
      await actions.getByRole('button', { name: 'Visa samband i kartan', exact: true }).click();
      await focusMapSearch(page);
      await expect(panel.getByRole('searchbox')).toHaveValue('Alex');
      await expect((await mapFilters(page)).getByLabel('Bara markerade')).toBeChecked();
      await panel.getByRole('searchbox').press('Escape');
      await (await utilityButton(page, 'Tabell')).click();
      await expect(context).toBeFocused();
      await expect(search).toHaveValue('Blå');
      await reveal.click();
      const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
      const node = (name: string) =>
        map.getByRole('button', { name: `Välj objekt: ${name}`, exact: true });
      await expect(node('Blå cykel')).toHaveAttribute('aria-pressed', 'true');
      await expect(node('Alex Exempel')).toHaveAttribute('aria-pressed', 'false');
      await expect(node('Garaget')).toBeInViewport();
      await expect(node('Bostaden')).toBeVisible();
      await expect(page.getByRole('img', { name: /Rymdens bakgrund/ })).toBeFocused();
      await focusMapSearch(page);
      await expect(panel.getByRole('searchbox')).toHaveValue('');
      await expect((await mapFilters(page)).getByLabel('Bara markerade')).not.toBeChecked();
      await expect(map.locator('.spatial-node')).toHaveCount(4);
      await panel.getByRole('searchbox').press('Escape');
      await (await utilityButton(page, 'Tabell')).click();
      await expect(reveal).toBeFocused();
      await expect(search).toHaveValue('Blå');
      await expect(table.getByRole('columnheader', { name: 'Namn', exact: true })).toHaveAttribute(
        'aria-sort',
        'descending',
      );
      await expect(table.getByRole('button', { name: 'Blå cykel', exact: true })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      await search.fill('Oberoende');
      await table.getByRole('button', { name: /^Filter/ }).click();
      const filters = page.getByRole('dialog', { name: 'Tabellens filter', exact: true });
      await filters.getByLabel('Ta med borttagna', { exact: true }).check();
      await page.keyboard.press('Escape');
      await expect(
        table.getByRole('button', { name: 'Oberoende objekt', exact: true }),
      ).toBeVisible();
      await expect(
        table.getByRole('button', { name: 'Visa Oberoende objekt i kartan', exact: true }),
      ).toHaveCount(0);
      await expect(
        table.getByRole('button', {
          name: 'Visa samband för Oberoende objekt i kartan',
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        table.getByRole('button', { name: 'Ta bort Oberoende objekt', exact: true }),
      ).toHaveCount(0);
      expect(await data.read()).toEqual(before);
    } finally {
      await installation.close();
    }
  });
}

test('SÖK-07: direct context ignores hit filters while ended objects and edges require inclusion', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const data = await prepare(page, installation.origin, 'ended');
    const state = await data.read();
    const before = await data.read();
    const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const node = (name: string) =>
      map.getByRole('button', { name: `Välj objekt: ${name}`, exact: true });
    await node('Alex Exempel').focus();
    await page.keyboard.press('Enter');
    await focusMapSearch(page);
    const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
    await panel.getByRole('searchbox').fill('Alex');
    await (await mapFilters(page)).getByLabel(state.types[0].name, { exact: true }).check();
    await (await mapFilters(page)).getByLabel('Ändrat', { exact: true }).check();
    await (await mapFilters(page)).getByLabel('Bara markerade').check();
    await expect(
      page.getByRole('button', { name: 'Välj objekt: Alex Exempel', exact: true }),
    ).toHaveAccessibleDescription(/Sökträff/);
    await panel.getByRole('searchbox').press('Escape');
    await expect(node('Blå cykel')).toBeVisible();
    await expect(node('Upphörd granne')).toHaveCount(0);
    await expect(node('Oberoende objekt')).toHaveCount(0);
    const summary = page.getByRole('complementary', { name: 'Kartans sökresultat' });
    await expect(summary).toContainText('Upphörda objekt eller samband döljs');
    await summary.getByRole('button', { name: 'Ta med upphörda', exact: true }).click();
    await expect(node('Upphörd granne')).toBeVisible();
    await expect(node('Oberoende objekt')).toBeVisible();
    await expect(node('Alex Exempel')).toHaveAccessibleDescription(/Sökträff/);
    expect(await data.read()).toEqual(before);
    await focusMapSearch(page);
    await (await mapFilters(page)).getByLabel('Bara markerade').uncheck();
    await (await mapFilters(page)).getByLabel('Ta med upphörda', { exact: true }).uncheck();
    await panel.getByRole('searchbox').press('Escape');
    await node('Blå cykel').focus();
    await page.keyboard.press('Enter');
    await node('Blå cykel').press('Shift+F10');
    await page.getByRole('button', { name: 'Visa samband i kartan', exact: true }).click();
    await expect(node('Garaget')).toBeVisible();
    await (await utilityButton(page, 'Tabell')).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'Redigera Blå cykel', exact: true }).click();
    await page.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await page.getByLabel('Objektets status').selectOption('ended');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await (await utilityButton(page, 'Karta')).click();
    await expect(node('Blå cykel')).toHaveCount(0);
    await expect(summary).toContainText('Upphörda objekt eller samband döljs');
    await summary.getByRole('button', { name: 'Ta med upphörda', exact: true }).click();
    await expect(node('Blå cykel')).toBeVisible();
    await expect(node('Garaget')).toHaveCount(0);
    await node('Blå cykel').focus();
    await page.keyboard.press('Enter');
    await node('Blå cykel').press('Shift+F10');
    await page.getByRole('button', { name: 'Visa samband i kartan', exact: true }).click();
    await expect(node('Garaget')).toBeVisible();
    expect((await data.read()).objects).toEqual(before.objects);
  } finally {
    await installation.close();
  }
});
