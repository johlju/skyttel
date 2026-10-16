import { closeTextView, openDraftReview } from '../support/client.js';
import { openTypeDefinitions } from '../support/domain-work.js';
import { prepareHouseholdTable } from '../support/household-table.js';
import { createInstallation } from '../support/installation.js';
import { focusMapSearch, mapFilters, prepareObjectSearch } from '../support/object-search.js';
import { expect, test } from '../support/test.js';

test('SÖK-01: own detail fields, every word and Swedish normalization find objects', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await prepareObjectSearch(page.request, installation.origin);
    const before = await read();
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const search = table.getByRole('searchbox', { name: 'Sök objekt i tabellen' });
    await search.fill('399 EGEN');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await expect(table.getByRole('button', { name: 'A 2', exact: true })).toBeVisible();
    await expect(table.getByText('Träff i Egen anteckning, Pris', { exact: true })).toBeVisible();
    await search.fill('299 egen');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await expect(table.getByRole('button', { name: 'A 2', exact: true })).toBeVisible();
    await search.fill('anteck elan öv');
    await expect(table.getByRole('rowheader')).toHaveCount(0);
    await search.fill('anteck e\u0301lan o\u0308v');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await expect(table.getByRole('button', { name: 'Övrigt Élan', exact: true })).toBeVisible();
    await search.fill('Endast i sambandet');
    await expect(table.getByRole('rowheader')).toHaveCount(0);
    await search.fill('Övrigt Élan');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await expect(table.getByRole('button', { name: 'A 2', exact: true })).toHaveCount(0);
    await search.fill('ake');
    await expect(table.getByRole('rowheader')).toHaveCount(0);
    await expect(search).toBeFocused();
    await table.getByRole('button', { name: /^Filter/ }).click();
    await page
      .getByRole('dialog', { name: 'Tabellens filter' })
      .getByRole('button', { name: 'Återställ sökning och filter', exact: true })
      .click();
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await search.fill('åke beskrivning');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await expect(table.getByRole('button', { name: 'Åke', exact: true })).toBeVisible();
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('SÖK-04: the last proposal resets only draft filters in both views and type-only proposals expose them', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { post, read } = await prepareHouseholdTable(page.request, installation.origin);
    await page.goto(installation.origin);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    await focusMapSearch(page);
    const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
    await panel.getByRole('searchbox').fill('A 2');
    await (await mapFilters(page)).getByLabel('Typ 2', { exact: true }).check();
    await (await mapFilters(page)).getByLabel('Ändrat', { exact: true }).check();
    await page.keyboard.press('Escape');
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('searchbox').fill('prov');
    await table.getByRole('button', { name: /^Filter/ }).click();
    const filters = page.getByRole('dialog', { name: 'Tabellens filter' });
    await filters.getByLabel('Typ 2', { exact: true }).check();
    await filters.getByLabel('Nytt', { exact: true }).check();
    await page.keyboard.press('Escape');
    await tools.getByRole('button', { name: 'Utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
      .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
      .click();
    await expect.poll(async () => (await read()).draft.changes.length).toBe(0);
    await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    await expect(table.getByRole('searchbox')).toHaveValue('prov');
    await expect(
      table.getByText('Utkastfiltret är återställt eftersom ditt utkast är tomt.', {
        exact: true,
      }),
    ).toBeVisible();
    await table.getByRole('button', { name: /^Filter/ }).click();
    await expect(filters.getByLabel('Typ 2', { exact: true })).toBeChecked();
    await expect(filters.getByRole('group', { name: 'Förslag i ditt utkast' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await focusMapSearch(page);
    await expect(panel.getByRole('searchbox')).toHaveValue('A 2');
    await expect((await mapFilters(page)).getByLabel('Typ 2', { exact: true })).toBeChecked();
    await expect(panel.getByRole('group', { name: 'Förslag i ditt utkast' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const nativeBefore = await read();
    await openTypeDefinitions(page);
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    const definition = page.getByRole('group', { name: 'Objekttypens definition', exact: true });
    await definition.getByLabel('Typens namn', { exact: true }).fill('Enbart typförslag');
    await definition
      .getByRole('button', { name: 'Lägg typförslaget i mitt utkast', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('Förslaget finns i ditt privata utkast');
    const nativeType = await read();
    expect(nativeType.types).toEqual(nativeBefore.types);
    expect(nativeType.objects).toEqual(nativeBefore.objects);
    expect(nativeType.draft.changes).toEqual([]);
    expect(nativeType.draft.objectTypes).toHaveLength(1);
    expect(nativeType.draft.objectTypes?.[0]?.after).toMatchObject({
      name: 'Enbart typförslag',
      description: '',
    });
    expect(nativeType.draft.objectTypes?.[0]?.after?.fields ?? []).toEqual([]);
    expect(nativeType.draft.relationshipTypes ?? []).toEqual([]);
    expect(nativeType.draft.relationships ?? []).toEqual([]);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await focusMapSearch(page);
    await panel.getByRole('searchbox').fill('finns inte');
    await expect(
      (await mapFilters(page)).getByRole('group', { name: 'Förslag i ditt utkast' }),
    ).toBeVisible();
    await expect(page.locator('.spatial-node')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // Reset only after proving the complete browser-created type-only scenario.
    await openDraftReview(page);
    await page.getByRole('button', { name: 'Kasta hela utkastet', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Ta bort hela utkastet?', exact: true })
      .getByRole('button', { name: 'Ta bort hela utkastet', exact: true })
      .click();
    await expect.poll(async () => (await read()).draft.objectTypes?.length ?? 0).toBe(0);
    await closeTextView(page);
    await post('object-type', {
      id: 'only-type',
      baseRevision: null,
      value: { name: 'Enbart typförslag', description: '', fields: [] },
    });
    await page.reload();
    await focusMapSearch(page);
    await panel.getByRole('searchbox').fill('finns inte');
    await expect(
      (await mapFilters(page)).getByRole('group', { name: 'Förslag i ditt utkast' }),
    ).toBeVisible();
    await expect(page.locator('.spatial-node')).toHaveCount(0);
  } finally {
    await installation.close();
  }
});

test('SÖK-05: shared compact search and filter dialogs preserve restrictions on mobile and desktop', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await prepareHouseholdTable(page.request, installation.origin);
    const before = await read();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(installation.origin);
    await focusMapSearch(page);
    const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
    await expect(panel.getByRole('searchbox')).toBeFocused();
    await panel.getByRole('searchbox').fill('prov');
    await (await mapFilters(page)).getByLabel('Ta med upphörda').check();
    await page.keyboard.press('Escape');
    await expect(panel.getByRole('searchbox')).toHaveValue('prov');
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const search = table.getByRole('searchbox');
    const trigger = table.getByRole('button', { name: /^Filter/ });
    const filters = page.getByRole('dialog', { name: 'Tabellens filter' });
    await search.fill('399 egen');
    // Search text alone does not activate filters in either view.
    await expect(trigger).toHaveAccessibleName('Filter');
    const searchBox = await search.boundingBox();
    const triggerBox = await trigger.boundingBox();
    if (!searchBox || !triggerBox) throw new Error('Search and Filter must be visible.');
    expect(triggerBox.x).toBeGreaterThanOrEqual(searchBox.x + searchBox.width);
    expect(triggerBox.y).toBe(searchBox.y);
    await trigger.click();
    await expect(filters.getByRole('heading')).toBeFocused();
    await filters.getByLabel('Typ 2', { exact: true }).check();
    await expect(filters.getByRole('status')).toContainText('1 träff');
    await filters.getByRole('button', { name: 'Stäng filter', exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(search).toHaveValue('399 egen');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    const clear = table.getByRole('button', { name: 'Rensa sökning', exact: true });
    await expect(clear).toHaveText('×');
    await clear.click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();
    const badge = table.getByRole('button', { name: 'Ta bort filter: Typ 2', exact: true });
    await expect(badge).toBeVisible();
    await expect(table.getByRole('rowheader')).toHaveCount(30);
    await search.fill('399 egen');
    for (const viewport of [
      { width: 320, height: 640 },
      { width: 320, height: 250 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await trigger.click();
      await expect(filters.getByRole('heading')).toBeFocused();
      await expect(filters.getByLabel('Typ 2', { exact: true })).toBeChecked();
      const frame = await filters.boundingBox();
      if (!frame) throw new Error('The compact filter dialog must be visible.');
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.width);
      expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.height);
      expect(frame.width).toBeLessThanOrEqual(440);
      expect(await filters.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      for (const checkbox of await filters.getByRole('checkbox').all()) {
        await checkbox.scrollIntoViewIfNeeded();
        expect(
          await checkbox.evaluate((input) => {
            const box = input.getBoundingClientRect();
            return (
              box.width >= 24 &&
              box.height >= 24 &&
              input.contains(
                document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
              )
            );
          }),
        ).toBe(true);
      }
      const reset = filters.getByRole('button', {
        name: 'Återställ sökning och filter',
        exact: true,
      });
      await reset.focus();
      await expect(reset).toBeInViewport();
      await page.keyboard.press('Escape');
      await expect(filters).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await expect(search).toHaveValue('399 egen');
      await expect(table.getByRole('rowheader')).toHaveCount(1);
      await trigger.click();
      await filters.getByRole('button', { name: 'Stäng filter' }).click();
      await expect(filters).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.click();
      if (viewport.height === 250) {
        // The short-screen overlay uses most of the viewport; dismiss it
        // through the exposed edge before returning to the search field.
        await page.mouse.click(1, 1);
        await expect(filters).not.toBeVisible();
      }
      await search.click();
      await expect(filters).not.toBeVisible();
      await expect(search).toBeFocused();
      await expect(badge).toBeVisible();
    }
    await badge.click();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAccessibleName('Filter');
    await expect(search).toHaveValue('399 egen');
    await trigger.click();
    await filters.getByLabel('Ta med borttagna').check();
    await page.keyboard.press('Escape');
    await table.getByRole('button', { name: 'Ta bort filter: Ta med borttagna' }).click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(filters.getByLabel('Ta med borttagna')).not.toBeChecked();
    await filters.getByLabel('Typ 10', { exact: true }).check();
    await filters
      .getByRole('button', { name: 'Återställ sökning och filter', exact: true })
      .click();
    await expect(search).toHaveValue('');
    await expect(filters.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Karta', exact: true }).click();
    await expect(panel.getByRole('searchbox')).toHaveValue('prov');
    await expect(
      panel.getByRole('button', { name: 'Ta bort filter: Ta med upphörda' }),
    ).toBeVisible();
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('SÖK-02: multiple filters combine independently and keep proposals distinct from lifecycle', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await prepareHouseholdTable(page.request, installation.origin);
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'Filter', exact: true }).click();
    const filters = page.getByRole('dialog', { name: 'Tabellens filter' });
    await filters.getByLabel('Typ 2', { exact: true }).check();
    await filters.getByLabel('Typ 10', { exact: true }).check();
    await filters.getByLabel('Nytt', { exact: true }).check();
    await filters.getByLabel('Ändrat', { exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(table.getByRole('rowheader')).toHaveCount(2);
    await expect(table.getByRole('button', { name: 'A 2', exact: true })).toBeVisible();
    await expect(table.getByRole('button', { name: 'Nytt prov', exact: true })).toBeVisible();
    await table.getByRole('button', { name: 'A 2', exact: true }).click();
    await table.getByRole('button', { name: /^Filter/ }).click();
    await filters.getByLabel('Bara markerade').check();
    await page.keyboard.press('Escape');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await table.getByRole('button', { name: /^Filter/ }).click();
    await filters.getByRole('button', { name: 'Återställ sökning och filter' }).click();
    await filters.getByLabel('Föreslagen borttagning', { exact: true }).check();
    await expect(table.getByRole('rowheader')).toHaveCount(0);
    await expect(filters.getByRole('group', { name: 'Förslag i ditt utkast' })).toBeVisible();
    await filters.getByLabel('Ta med upphörda').check();
    await page.keyboard.press('Escape');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await expect(table.getByRole('button', { name: 'Tas bort prov', exact: true })).toBeVisible();
    await table.getByRole('button', { name: /^Filter/ }).click();
    await filters.getByLabel('Föreslagen borttagning', { exact: true }).uncheck();
    await filters.getByLabel('Ta med borttagna').check();
    await page.keyboard.press('Escape');
    await table.getByRole('searchbox').fill('borttaget');
    await expect(table.getByRole('button', { name: 'Borttaget prov', exact: true })).toBeVisible();
  } finally {
    await installation.close();
  }
});

test('SÖK-03: map-only character and composition entry preserve separate searches and Escape restrictions', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await prepareHouseholdTable(page.request, installation.origin);
    const before = await read();
    await page.goto(installation.origin);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
    const mapSearch = panel.getByRole('searchbox', { name: 'Sök objekt i kartan' });
    const canvas = page.getByRole('img', { name: /Rymdens bakgrund/ });
    const nodes = page
      .getByRole('region', { name: 'Rymdkarta', exact: true })
      .locator('.spatial-node');
    await expect(mapSearch).toBeVisible();
    await expect(mapSearch).toHaveValue('');
    await expect(panel.getByRole('button', { name: 'Filter', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await focusMapSearch(page);
    await expect(mapSearch).toBeFocused();
    await mapSearch.fill('299 EGEN');
    await expect(nodes).toHaveCount(1);
    await expect(nodes).toHaveAccessibleName('Välj objekt: A 2');
    // Search text alone does not mark filters as active.
    await expect(panel.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
    const filters = await mapFilters(page);
    await expect(filters.getByRole('heading', { name: 'Kartans filter' })).toBeFocused();
    await expect(filters.getByRole('status')).toHaveText('1 träff · uppdateras direkt');
    await filters.getByLabel('Typ 10', { exact: true }).check();
    await expect(filters.getByRole('status')).toHaveText('0 träffar · uppdateras direkt');
    await page.keyboard.press('Escape');
    await expect(filters).not.toBeVisible();
    await expect(panel.getByRole('button', { name: 'Filter · aktiva', exact: true })).toBeFocused();
    await expect(mapSearch).toHaveValue('299 EGEN');
    const activeType = panel.getByRole('button', { name: 'Ta bort filter: Typ 10', exact: true });
    await expect(activeType).toBeVisible();
    const filterButton = panel.getByRole('button', { name: 'Filter · aktiva', exact: true });
    await expect(filterButton).toHaveText('Filter');
    const filterBox = await filterButton.boundingBox();
    const badgeBox = await activeType.boundingBox();
    if (!filterBox || !badgeBox) throw new Error('Filter and its active badge must be visible.');
    expect(badgeBox.x).toBeGreaterThanOrEqual(filterBox.x + filterBox.width);
    await expect(panel.getByRole('group', { name: 'Aktiva filter' })).toHaveCSS(
      'border-width',
      '0px',
    );
    await activeType.click();
    await expect(mapSearch).toHaveValue('299 EGEN');
    await expect(nodes).toHaveCount(1);
    await expect(panel.getByRole('button', { name: 'Filter', exact: true })).toBeFocused();
    await (await mapFilters(page)).getByLabel('Typ 10', { exact: true }).check();
    await page.keyboard.press('Escape');
    await canvas.focus();
    await page.keyboard.press('b');
    await expect(mapSearch).toBeFocused();
    await page.keyboard.type(' 12');
    await expect(mapSearch).toHaveValue('b 12');
    await expect(filters).not.toBeVisible();
    await focusMapSearch(page);
    await expect(mapSearch).toBeFocused();
    await expect(filters).not.toBeVisible();
    await mapSearch.fill('A 10');
    await (await mapFilters(page)).getByRole('button', { name: 'Stäng filter' }).click();
    await mapSearch.press('Escape');
    await expect(canvas).toBeFocused();
    await expect(mapSearch).toHaveValue('A 10');
    await expect((await mapFilters(page)).getByLabel('Typ 10', { exact: true })).toBeChecked();
    // Outside click closes the dialog and keeps its changes.
    await mapSearch.click();
    await expect(filters).not.toBeVisible();
    await expect(mapSearch).toHaveValue('A 10');
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'A 2', exact: true }).click();
    await expect(table.getByText('✓ Markerad', { exact: true })).toBeVisible();
    const tableSearch = table.getByRole('searchbox');
    await tableSearch.fill('åke');
    await page.keyboard.type('x');
    await expect(tableSearch).toHaveValue('åkex');
    await tools.getByRole('button', { name: 'Karta', exact: true }).click();
    await canvas.focus();
    await canvas.dispatchEvent('keydown', { key: 'ö' });
    await expect(mapSearch).toHaveValue('ö');
    await expect(mapSearch).toBeFocused();
    await expect((await mapFilters(page)).getByLabel('Typ 10', { exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    await canvas.focus();
    await canvas.dispatchEvent('keydown', { key: 'Process', isComposing: true });
    await expect(mapSearch).toHaveValue('ö');
    await expect(mapSearch).not.toBeFocused();
    await canvas.evaluate((element) => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
      element.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: 'a\u030a' }),
      );
    });
    await expect(mapSearch).toHaveValue('å');
    await expect(mapSearch).toBeFocused();
    await mapSearch.press('Escape');
    await page.keyboard.press('Control+f');
    await expect(canvas).toBeFocused();
    await expect(mapSearch).toHaveValue('å');
    await tools.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const objectName = page.getByLabel('Namn', { exact: true });
    await objectName.pressSequentially('Ö Testnamn 123');
    await expect(objectName).toHaveValue('Ö Testnamn 123');
    await expect(objectName).toBeFocused();
    await expect(mapSearch).toHaveValue('å');
    await page
      .getByRole('dialog', { name: 'Nytt objekt', exact: true })
      .getByRole('button', { name: 'Avbryt', exact: true })
      .click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await tools.getByRole('button', { name: 'Skriv till Skyttel', exact: true }).click();
    const message = page.getByRole('textbox', { name: 'Meddelande till Skyttel', exact: true });
    await message.pressSequentially('Å Oskickat meddelande 456');
    await expect(message).toHaveValue('Å Oskickat meddelande 456');
    await expect(message).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    await expect(mapSearch).toHaveValue('å');
    await panel.getByRole('button', { name: 'Rensa sökning', exact: true }).click();
    await expect(mapSearch).toHaveValue('');
    await expect(mapSearch).toBeFocused();
    await expect((await mapFilters(page)).getByLabel('Typ 10', { exact: true })).toBeChecked();
    await expect(filters.getByLabel('Bara markerade (1)', { exact: true })).not.toBeChecked();
    await page.keyboard.press('Escape');
    await mapSearch.fill('A 2');
    await (await mapFilters(page))
      .getByRole('button', { name: 'Återställ filter', exact: true })
      .click();
    await expect(mapSearch).toHaveValue('A 2');
    await expect(filters.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
    await filters.getByLabel('Typ 2', { exact: true }).check();
    await filters.getByLabel('Bara markerade').check();
    await page.keyboard.press('Escape');
    await canvas.focus();
    await page.keyboard.press('Escape');
    await expect(canvas).toBeFocused();
    await expect(mapSearch).toHaveValue('');
    await expect(panel.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
    await expect(page.locator('.spatial-node[aria-pressed="true"]')).toHaveCount(1);
    await expect((await mapFilters(page)).getByRole('checkbox', { checked: true })).toHaveCount(0);
    // One Escape also clears filters when the text was already empty.
    await filters.getByLabel('Typ 10', { exact: true }).check();
    await page.keyboard.press('Escape');
    await canvas.press('Escape');
    await expect(panel.getByRole('button', { name: 'Filter', exact: true })).toBeVisible();
    await mapSearch.fill('finns inte');
    await expect(nodes).toHaveCount(0);
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    await expect(tableSearch).toHaveValue('åkex');
    await expect(table.getByRole('rowheader')).toHaveCount(0);
    await tableSearch.fill('A 2');
    await expect(table.getByText('✓ Markerad', { exact: true })).toBeVisible();
    await tools.getByRole('button', { name: 'Skriv till Skyttel', exact: true }).click();
    await expect(message).toHaveValue('Å Oskickat meddelande 456');
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('SÖK-10: capsule search and attached filters fit desktop and narrow short screens', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await prepareHouseholdTable(page.request, installation.origin);
    await page.goto(installation.origin);
    const panel = page.getByRole('region', { name: 'Kartans sökning och filter' });
    const search = panel.getByRole('searchbox');
    const clear = panel.getByRole('button', { name: 'Rensa sökning', exact: true });
    const filter = panel.getByRole('button', { name: 'Filter', exact: true });
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 800, height: 900 },
      { width: 390, height: 844 },
      { width: 320, height: 640 },
      { width: 320, height: 250 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(search).toBeVisible();
      const input = await search.boundingBox();
      const x = await clear.boundingBox();
      const f = await filter.boundingBox();
      if (!input || !x || !f) throw new Error('Search controls must be visible');
      expect(input.x).toBeGreaterThanOrEqual(0);
      expect(f.x + f.width).toBeLessThanOrEqual(viewport.width);
      expect(f.x).toBeGreaterThanOrEqual(input.x + input.width);
      expect(x.x).toBeGreaterThanOrEqual(input.x);
      expect(x.x + x.width).toBeLessThanOrEqual(input.x + input.width);
      expect(x.width).toBeGreaterThanOrEqual(44);
      expect(x.height).toBeGreaterThanOrEqual(44);
      expect(await clear.textContent()).toBe('×');
      const circle = await clear.evaluate((element) => {
        const background = getComputedStyle(element, '::before');
        return {
          width: Number.parseFloat(background.width),
          height: Number.parseFloat(background.height),
          fontSize: getComputedStyle(element).fontSize,
        };
      });
      expect(circle).toEqual({ width: 32, height: 32, fontSize: '22px' });
      expect(
        await search.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).borderRadius),
        ),
      ).toBeGreaterThanOrEqual(input.height / 2);
      if (viewport.width > 700) {
        expect(input.width).toBe(300);
        expect(input.x + input.width / 2).toBeCloseTo(viewport.width / 2, 0);
      } else {
        const toolbar = await page
          .getByRole('navigation', { name: 'Kartans verktyg' })
          .boundingBox();
        if (!toolbar) throw new Error('Toolbar must be visible');
        expect(input.y).toBeGreaterThan(toolbar.y + toolbar.height);
      }
      await clear.click({ trial: true });
      const dialog = await mapFilters(page);
      const box = await dialog.boundingBox();
      if (!box) throw new Error('Filter dialog must be visible');
      expect(box.y).toBeGreaterThanOrEqual(f.y + f.height);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.width).toBeLessThanOrEqual(440);
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await expect(dialog.getByRole('group', { name: 'Objekttyp' })).toBeVisible();
      await expect(dialog.getByRole('group', { name: 'Status' })).toBeVisible();
      await expect(dialog.getByRole('group', { name: 'Förslag i ditt utkast' })).toBeVisible();
      const person = dialog.getByRole('checkbox', { name: 'Person', exact: true });
      await person.focus();
      await person.press('Space');
      await expect(person).toBeChecked();
      await expect(person).toBeFocused();
      const badge = panel.getByRole('button', { name: 'Ta bort filter: Person', exact: true });
      const badgeBox = await badge.boundingBox();
      if (!badgeBox) throw new Error('The selected type must have an active badge.');
      await expect(panel.getByRole('button', { name: /^Filter/ })).toHaveText('Filter');
      expect(badgeBox.x).toBeGreaterThanOrEqual(0);
      expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(viewport.width);
      if (viewport.width > 700) {
        expect(badgeBox.x).toBeGreaterThanOrEqual(f.x + f.width);
      } else {
        expect(badgeBox.y).toBeGreaterThanOrEqual(f.y + f.height);
        expect(badgeBox.height).toBeGreaterThanOrEqual(44);
      }
      const personTargetHeight = await person.evaluate(
        (control) => control.closest('label')?.getBoundingClientRect().height ?? 0,
      );
      expect(personTargetHeight).toBeGreaterThanOrEqual(viewport.width > 700 ? 32 : 44);
      await person.press('Space');
      await expect(person).not.toBeChecked();
      await page.screenshot({
        path: `/tmp/skyttel-search/filters-${viewport.width}x${viewport.height}.png`,
      });
      const reset = dialog.getByRole('button', { name: 'Återställ filter', exact: true });
      await reset.focus();
      await reset.press('Enter');
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(filter).toBeFocused();
      await page.screenshot({
        path: `/tmp/skyttel-search/search-${viewport.width}x${viewport.height}.png`,
      });
      if (viewport.width > 700) {
        await page.getByRole('button', { name: 'Utkast', exact: true }).click();
        const message = page.getByRole('textbox', { name: 'Meddelande till Skyttel' });
        await message.fill('Oskickat meddelande');
        await mapFilters(page);
        expect(
          await dialog.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2),
            );
          }),
        ).toBe(true);
        await reset.click();
        await page.keyboard.press('Escape');
        await expect(message).toHaveValue('Oskickat meddelande');
        await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
      }
      if (viewport.width === 320 && viewport.height === 250) {
        await page.getByRole('button', { name: 'Tabell', exact: true }).click();
        const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
        const object = table.getByRole('button', { name: 'A 2', exact: true });
        await object.click();
        await table.getByRole('button', { name: 'Visa A 2 i kartan', exact: true }).click();
        const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
        const node = page.getByRole('button', { name: 'Välj objekt: A 2', exact: true });
        await node.focus();
        await node.press('Shift+F10');
        await page
          .getByRole('toolbar', { name: 'Åtgärder för A 2', exact: true })
          .getByRole('button', { name: 'Visa uppgifter för A 2', exact: true })
          .click();
        await expect(search).toBeVisible();
        await clear.click({ trial: true });
        const toolbar = await tools.boundingBox();
        const input = await search.boundingBox();
        if (!toolbar || !input) throw new Error('Reading search and toolbar must be visible');
        expect(input.x).toBeGreaterThanOrEqual(toolbar.x + toolbar.width);
        await page.getByRole('button', { name: 'Stäng uppgifterna', exact: true }).click();
        await expect
          .poll(async () => (await search.boundingBox())?.y ?? 0)
          .toBeGreaterThan(toolbar.y + toolbar.height);
      }
    }
  } finally {
    await installation.close();
  }
});
