import type { Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openMap,
  openSettings,
  openTable,
  signIn,
} from '../support/client.js';
import { openConversationText, startConversationWithText } from '../support/conversation-page.js';
import { closeTableObject, editTableObject, readTableObject } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { propertyRow, setProperty } from '../support/property-controls.js';
import { expect, test } from '../support/test.js';

async function arrangeNeighbors(page: Page, origin: string) {
  await signIn(page.request, origin);
  const { household } = await (await createHousehold(page.request, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  const initial = await read();
  for (const [id, name, x, y, z] of [
    ['lo', 'Lo Exempel', 8, 4, 10],
    ['kim', 'Kim Exempel', -4, -6, 3],
    ['far', 'Långt borta', -60, 20, -40],
  ] as const) {
    expect(
      (
        await page.request.post(`${path}/draft`, {
          headers: { origin },
          data: {
            id,
            version: (await read()).draft.version,
            baseRevision: null,
            value: { name, typeId: initial.types[0].id },
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.post(`${path}/view/position`, {
          headers: { origin },
          data: { id, version: 0, contentVersion: initial.contentVersion, position: { x, y, z } },
        })
      ).ok(),
    ).toBe(true);
  }
  for (const [id, sourceId, targetId] of [
    ['lo-kim', 'lo', 'kim'],
    ['kim-far', 'kim', 'far'],
  ]) {
    expect(
      (
        await page.request.post(`${path}/relationship`, {
          headers: { origin },
          data: {
            id,
            version: (await read()).draft.version,
            baseRevision: null,
            value: { sourceId, targetId, typeId: initial.relationshipTypes[0].id },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto(origin);
  await openMap(page);
  return { read, path };
}

test('LISTA-01: multiple type filters combine with search and the current row across 500 objects', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await arrangeLargeTable(page, installation);
    const before = await read();
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await includeEnded(page);
    await table.getByRole('button', { name: 'Provobjekt 000', exact: true }).click();
    await table.getByRole('button', { name: 'Provobjekt 001', exact: true }).click();
    await expect(table.getByText('✓ Markerad', { exact: true })).toHaveCount(1);
    const filters = await tableFilters(page);
    await filters.getByLabel('Person', { exact: true }).check();
    await filters.getByLabel('Tjänst', { exact: true }).check();
    await expect(filters).toBeVisible();
    await closeFilters(page);
    await expect(table.getByRole('rowheader')).toHaveCount(50);
    await table.getByLabel('Sök objekt i tabellen', { exact: true }).fill('sammanhang 0.');
    await expect(table.getByRole('rowheader')).toHaveCount(20);
    await tableFilters(page);
    await filters.getByLabel(/^Bara markerade/).check();
    await closeFilters(page);
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await expect(table.getByRole('button', { name: 'Provobjekt 001', exact: true })).toBeVisible();
    await tableFilters(page);
    await filters.getByLabel('Person', { exact: true }).uncheck();
    await filters.getByLabel('Tjänst', { exact: true }).uncheck();
    await expect(
      filters
        .getByRole('group', { name: 'Objekttyp', exact: true })
        .getByRole('checkbox', { checked: true }),
    ).toHaveCount(0);
    await closeFilters(page);
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await tableFilters(page);
    await filters.getByLabel(/^Bara markerade/).uncheck();
    await closeFilters(page);
    await expect(table.getByRole('rowheader')).toHaveCount(50);
    await tableFilters(page);
    await filters.getByLabel('Person', { exact: true }).check();
    await closeFilters(page);
    await expect(table.getByRole('button', { name: 'Filter · aktiva', exact: true })).toBeFocused();
    await expect(table.getByRole('rowheader')).toHaveCount(10);
    await table.getByLabel('Sök objekt i tabellen', { exact: true }).fill('finns inte');
    await expect(table.getByRole('rowheader')).toHaveCount(0);
    await tableFilters(page);
    await filters
      .getByRole('button', { name: 'Återställ sökning och filter', exact: true })
      .click();
    await closeFilters(page);
    await includeEnded(page);
    await expect(table.getByRole('rowheader')).toHaveCount(50);
    await expect(
      table.getByRole('row', { name: /Provobjekt 001/ }).getByText('✓ Markerad', { exact: true }),
    ).toBeVisible();
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('LISTA-03: a table map result focuses direct neighbors and preserves unsent conversation', async ({
  page,
}) => {
  const installation = await createInstallation(undefined, {
    modelFetch: async () => Response.json({ output: [] }),
  });
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const { read, path } = await arrangeNeighbors(page, installation.origin);
    const content = await read();
    const personal = await (await page.request.get(`${path}/view`)).json();
    const map = page.getByRole('region', { name: 'Rymdkarta', exact: true });
    const lo = map.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    await lo.click({ trial: true });
    await startConversationWithText(page);
    const message = page.getByLabel('Meddelande till Skyttel', { exact: true });
    await message.fill('Oskickat medan jag söker');
    await closeTextView(page);
    const before = await lo.boundingBox();
    const beforeKim = await kim.boundingBox();
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'Lo Exempel', exact: true }).click();
    await table.getByRole('button', { name: 'Kim Exempel', exact: true }).click();
    await table.getByLabel('Sök objekt i tabellen', { exact: true }).fill('Lo Exempel');
    await table.getByRole('button', { name: 'Visa Lo Exempel i kartan', exact: true }).click();
    await expect(table).not.toBeVisible();
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    await expect(kim).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toHaveCount(0);
    const focusedLo = await lo.boundingBox();
    const focusedKim = await kim.boundingBox();
    expect(
      Math.hypot(
        (focusedLo?.x ?? 0) - (focusedKim?.x ?? 0),
        (focusedLo?.y ?? 0) - (focusedKim?.y ?? 0),
      ),
    ).toBeGreaterThan(
      Math.hypot((before?.x ?? 0) - (beforeKim?.x ?? 0), (before?.y ?? 0) - (beforeKim?.y ?? 0)) *
        2,
    );
    const far = await map
      .getByRole('button', { name: 'Välj objekt: Långt borta', exact: true })
      .boundingBox();
    if (!far) throw new Error('The indirect neighbor must retain its projected position');
    expect(far.x < 112 || far.x + far.width > 1400 || far.y < 80 || far.y + far.height > 900).toBe(
      true,
    );
    for (const node of [lo, kim]) {
      const box = await node.boundingBox();
      expect(box?.x).toBeGreaterThan(112);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThan(1400);
      expect(box?.y).toBeGreaterThan(80);
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(900);
    }
    await openConversationText(page);
    await expect(message).toHaveValue('Oskickat medan jag söker');
    await closeTextView(page);
    await openTable(page);
    await expect(table.getByLabel('Sök objekt i tabellen', { exact: true })).toHaveValue(
      'Lo Exempel',
    );
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    expect(await read()).toEqual(content);
    expect(await (await page.request.get(`${path}/view`)).json()).toEqual(personal);
  } finally {
    await installation.close();
  }
});

test('LISTA-02: sorting, pages and scroll survive native details, settings and map-result navigation', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const installation = await createInstallation();
  try {
    const { read } = await arrangeLargeTable(page, installation);
    const before = await read();
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await includeEnded(page);
    await table.getByLabel('Sök objekt i tabellen', { exact: true }).fill('Provobjekt');
    const filters = await tableFilters(page);
    await filters.getByLabel('Person', { exact: true }).check();
    await filters.getByLabel('Tjänst', { exact: true }).check();
    await closeFilters(page);
    const pages = table.getByRole('navigation', { name: 'Tabellsidor', exact: true });
    const namesBySort: string[][] = [];
    for (const sort of ['name-asc', 'type-asc']) {
      if (sort === 'type-asc')
        await table.getByRole('button', { name: 'Typ', exact: true }).click();
      while (await pages.getByRole('button', { name: 'Föregående', exact: true }).isEnabled())
        await pages.getByRole('button', { name: 'Föregående', exact: true }).click();
      const names: string[] = [];
      for (let number = 1; number <= 4; number++) {
        await expect(pages.getByRole('status')).toHaveText(
          `Sida ${number} av 4 · 50 objekt per sida`,
        );
        names.push(...(await table.getByRole('rowheader').getByRole('button').allTextContents()));
        if (number < 4) await pages.getByRole('button', { name: 'Nästa', exact: true }).click();
      }
      namesBySort.push(names);
      await expect(table.getByRole('rowheader')).toHaveCount(50);
    }
    expect(namesBySort[0]).toHaveLength(200);
    expect(new Set(namesBySort[0]).size).toBe(200);
    expect([...namesBySort[1]].sort()).toEqual([...namesBySort[0]].sort());
    const result = table.getByRole('button', { name: 'Provobjekt 496', exact: true });
    await result.click();
    const details = table.getByRole('button', {
      name: 'Redigera Provobjekt 496',
      exact: true,
    });
    await details.scrollIntoViewIfNeeded();
    const body = table.getByRole('region', { name: 'Rullbar objekttabell', exact: true });
    const remembered = await body.evaluate((element) => element.scrollTop);
    expect(remembered).toBeGreaterThan(500);
    await details.click();
    await expect(
      page
        .getByRole('dialog', { name: 'Redigera Provobjekt 496', exact: true })
        .getByLabel('Namn', { exact: true }),
    ).toBeFocused();
    await closeSupportDialog(page, 'Redigera Provobjekt 496', 'Stäng objektdialogen');
    await expect(details).toBeFocused();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(remembered);
    const editor = await editTableObject(page, 'Provobjekt 496');
    await setProperty(editor, 'Beskrivning', 'Oskickat under listbesöket');
    await editor.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(
      propertyRow(editor, 'Beskrivning').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Oskickat under listbesöket');
    await editor.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(table).toBeVisible();
    await expect(table.getByLabel('Sök objekt i tabellen', { exact: true })).toHaveValue(
      'Provobjekt',
    );
    await expect(table.getByRole('columnheader', { name: 'Typ', exact: true })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await expect(pages.getByRole('status')).toHaveText('Sida 4 av 4 · 50 objekt per sida');
    await expect(result).toHaveAttribute('aria-expanded', 'true');
    const mapResult = table.getByRole('button', {
      name: 'Visa Provobjekt 496 i kartan',
      exact: true,
    });
    await mapResult.click();
    await expect(table).not.toBeVisible();
    await openTable(page);
    await expect(pages.getByRole('status')).toHaveText('Sida 4 av 4 · 50 objekt per sida');
    await expect(table.getByLabel('Sök objekt i tabellen', { exact: true })).toHaveValue(
      'Provobjekt',
    );
    await tableFilters(page);
    await expect(filters.getByLabel('Person', { exact: true })).toBeChecked();
    await expect(filters.getByLabel('Tjänst', { exact: true })).toBeChecked();
    await closeFilters(page);
    await table.getByLabel('Sök objekt i tabellen', { exact: true }).fill('Provobjekt 496');
    await expect(table.getByRole('rowheader')).toHaveCount(1);
    await expect(pages.getByRole('status')).toHaveText('Sida 1 av 1 · 50 objekt per sida');
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

for (const width of [390, 320]) {
  test(`${width === 320 ? 'LISTA-04' : 'LISTA-08'}: narrow tables retain search and native details after graphics loss at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 844 });
      const { read, path } = await arrangeNeighbors(page, installation.origin);
      const content = await read();
      const personal = await (await page.request.get(`${path}/view`)).json();
      await openTable(page);
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      await table.getByLabel('Sök objekt i tabellen', { exact: true }).fill('Lo Exempel');
      const filters = await tableFilters(page);
      const person = filters.getByLabel('Person', { exact: true });
      await person.check();
      await person.focus();
      await expect(person).toBeFocused();
      const target = await person.evaluate((element) => {
        const label = element.closest('label');
        if (!label) throw new Error('A native type target is required');
        const box = label.getBoundingClientRect();
        return {
          height: box.height,
          width: box.width,
          hit: label.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          ),
        };
      });
      expect(target.height).toBeGreaterThanOrEqual(44);
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.hit).toBe(true);
      await closeFilters(page);
      const reveal = table.getByRole('button', { name: 'Visa Lo Exempel i kartan', exact: true });
      await reveal.click();
      await expect(table).not.toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toHaveCount(0);
      await openTable(page);
      await page.locator('.spatial-surface canvas').evaluate((element) => {
        const extension = (element as HTMLCanvasElement)
          .getContext('webgl2')
          ?.getExtension('WEBGL_lose_context');
        if (!extension) throw new Error('Native WebGL context loss is required');
        extension.loseContext();
      });
      await expect(reveal).toBeDisabled();
      await expect(table).toBeVisible();
      await expect(
        table.getByText(
          'Kartans grafik är inte tillgänglig. Du kan läsa och arbeta med alla uppgifter här i tabellen.',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(table.getByLabel('Sök objekt i tabellen', { exact: true })).toHaveValue(
        'Lo Exempel',
      );
      const details = await readTableObject(page, 'Lo Exempel');
      await expect(
        details.getByRole('heading', { name: 'Lo Exempel · alla uppgifter', exact: true }),
      ).toBeVisible();
      await closeTableObject(page, 'Lo Exempel');
      await expect(table.getByRole('button', { name: 'Lo Exempel', exact: true })).toBeFocused();
      const editor = await editTableObject(page, 'Lo Exempel');
      await expect(editor.getByLabel('Namn', { exact: true })).toBeFocused();
      await setProperty(editor, 'Beskrivning', 'Utan grafik');
      await editor.getByRole('button', { name: 'Avbryt', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(
        propertyRow(editor, 'Beskrivning').getByLabel('Värde', { exact: true }),
      ).toHaveValue('Utan grafik');
      expect(await read()).toEqual(content);
      await editor.getByRole('button', { name: 'Avbryt', exact: true }).click();
      await page
        .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
        .click();
      await tableFilters(page);
      await expect(person).toBeChecked();
      await person.focus();
      await expect(person).toBeFocused();
      const restoredTarget = await person.evaluate((element) => {
        const label = element.closest('label');
        if (!label) throw new Error('The post-loss native target must exist');
        const box = label.getBoundingClientRect();
        return {
          width: box.width,
          height: box.height,
          hit: label.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          ),
        };
      });
      expect(restoredTarget.width).toBeGreaterThanOrEqual(44);
      expect(restoredTarget.height).toBeGreaterThanOrEqual(44);
      expect(restoredTarget.hit).toBe(true);
      await closeFilters(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect(await read()).toEqual(content);
      expect(await (await page.request.get(`${path}/view`)).json()).toEqual(personal);
    } finally {
      await installation.close();
    }
  });
}

async function tableFilters(page: Page) {
  const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
  await table.getByRole('button', { name: /^Filter/ }).click();
  return page.getByRole('dialog', { name: 'Tabellens filter', exact: true });
}
async function closeFilters(page: Page) {
  await page
    .getByRole('dialog', { name: 'Tabellens filter', exact: true })
    .getByRole('button', { name: 'Stäng filter', exact: true })
    .click();
}
async function includeEnded(page: Page) {
  const filters = await tableFilters(page);
  await filters.getByLabel('Ta med upphörda', { exact: true }).check();
  await closeFilters(page);
}
async function arrangeLargeTable(
  page: Page,
  installation: Awaited<ReturnType<typeof createInstallation>>,
) {
  await signIn(page.request, installation.origin);
  const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
  const { household } = await (await createHousehold(page.request, installation.origin)).json();
  installation.seedLargeMap(user.id, household.id);
  const path = `${installation.origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(installation.origin);
  return { read, path };
}
