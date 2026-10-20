import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { startConversationWithText } from '../support/conversation-page.js';
import { prepareHouseholdTable } from '../support/household-table.js';
import { createInstallation } from '../support/installation.js';
import { prepareTableDetailProposals } from '../support/table-detail-proposals.js';
import { expect, test } from '../support/test.js';

for (const [caseId, action, title] of [
  [
    'TABELL-04',
    'edit',
    'disappearing edited rows restore the next Edit control then previous then heading',
  ],
  [
    'TABELL-05',
    'reveal',
    'map visits restore the corresponding table control after its row disappears',
  ],
] as const) {
  test(`${caseId}: ${title}`, async ({ page }) => {
    const installation = await createInstallation();
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      const post = async (route: string, data: object) => {
        const current = await read();
        const response = await page.request.post(`${path}/${route}`, {
          headers: { origin: installation.origin },
          data: { version: current.draft.version, contentVersion: current.contentVersion, ...data },
        });
        expect(response.status(), await response.text()).toBe(200);
      };
      const typeId = (await read()).types[0].id;
      for (const name of ['Alpha', 'Beta', 'Gamma'])
        await post('draft', {
          id: `focus-${name}`,
          baseRevision: null,
          value: { typeId, name: `Fokus ${name}` },
        });
      await post('save', { operationId: `table-${action}-focus` });
      const saved = await read();
      await page.goto(`${installation.origin}/households/${household.id}`);
      await page.getByRole('button', { name: 'Tabell', exact: true }).click();
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      await table.getByRole('searchbox', { name: 'Sök objekt i tabellen' }).fill('Fokus');
      const control = (name: string) =>
        table.getByRole('button', {
          name: action === 'edit' ? `Redigera Fokus ${name}` : `Visa Fokus ${name} i kartan`,
          exact: true,
        });
      await control('Beta').click();
      if (action === 'edit') {
        await page
          .getByRole('dialog', { name: 'Redigera Fokus Beta', exact: true })
          .getByRole('button', { name: 'Avbryt', exact: true })
          .click();
      } else {
        await page.getByRole('button', { name: 'Tabell', exact: true }).click();
      }
      await expect(control('Beta')).toBeFocused();
      for (const [name, remaining] of [
        ['Beta', 'Gamma'],
        ['Gamma', 'Alpha'],
        ['Alpha', null],
      ] as const) {
        await control(name).click();
        if (action === 'reveal') {
          await page
            .getByRole('button', { name: `Välj objekt: Fokus ${name}`, exact: true })
            .dblclick();
          await page.getByRole('button', { name: `Redigera Fokus ${name}`, exact: true }).click();
        }
        const form = page.getByRole('dialog', { name: `Redigera Fokus ${name}`, exact: true });
        await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
        await form.getByLabel('Objektets status', { exact: true }).selectOption('ended');
        await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        await expect(form).not.toBeVisible();
        if (action === 'reveal')
          await page.getByRole('button', { name: 'Tabell', exact: true }).click();
        await expect(control(name)).toHaveCount(0);
        await expect(
          remaining
            ? control(remaining)
            : table.getByRole('heading', {
                name: 'Hushållet Linden',
                exact: true,
              }),
        ).toBeFocused();
        await expect(table.getByRole('searchbox', { name: 'Sök objekt i tabellen' })).toHaveValue(
          'Fokus',
        );
        const current = await read();
        expect(current.objects).toEqual(saved.objects);
        expect(
          current.draft.changes.find((change) => change.id === `focus-${name}`)?.after?.lifecycle,
        ).toBe('ended');
      }
      expect((await read()).draft.changes).toHaveLength(3);
      await expect(table.getByRole('rowheader')).toHaveCount(0);
      await table.getByRole('button', { name: /^Filter/ }).click();
      await page
        .getByRole('dialog', { name: 'Tabellens filter', exact: true })
        .getByLabel('Ta med upphörda')
        .check();
      await page.keyboard.press('Escape');
      for (const name of ['Alpha', 'Beta', 'Gamma']) {
        await table.getByRole('button', { name: `Fokus ${name}`, exact: true }).click();
        const details = table.getByRole('cell').filter({
          has: page.getByRole('heading', { name: `Fokus ${name} · alla uppgifter`, exact: true }),
        });
        await expect(
          details.getByText('Sparat: Gäller fortfarande', { exact: true }),
        ).toBeVisible();
        await expect(details).toContainText('◇ Ditt förslag: Manuellt upphört');
      }
      await page.getByRole('button', { name: 'Utkast', exact: true }).click();
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await expect(draft.getByRole('rowheader')).toHaveCount(3);
      for (const name of ['Alpha', 'Beta', 'Gamma']) {
        const row = draft.getByRole('row').filter({
          has: page.getByRole('button', { name: `Visa förslaget: Fokus ${name}`, exact: true }),
        });
        await expect(row).toContainText('Status: Gäller fortfarande → Manuellt upphört');
      }
      expect((await read()).objects).toEqual(saved.objects);
    } finally {
      await installation.close();
    }
  });
}

test('TABELL-01: Swedish natural sorting, pagination and expanded rows survive map visits', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await prepareHouseholdTable(page.request, installation.origin);
    const before = await read();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(installation.origin);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await expect(
      table.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeFocused();
    await expect(table.getByRole('table')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).not.toBeVisible();
    await expect(table.getByRole('rowheader')).toHaveCount(50);
    await expect(table.getByRole('rowheader').nth(0)).toHaveText('▸A 2');
    await expect(table.getByRole('rowheader').nth(1)).toHaveText('▸A 10');
    await table.getByRole('button', { name: 'A 2', exact: true }).click();
    await table.getByRole('button', { name: 'A 10', exact: true }).click();
    await expect(table.getByRole('heading', { name: 'A 2 · alla uppgifter' })).toBeVisible();
    await expect(table.getByRole('heading', { name: 'A 10 · alla uppgifter' })).toBeVisible();
    const nameSort = table.getByRole('button', { name: 'Namn', exact: true });
    await nameSort.focus();
    await page.keyboard.press('Enter');
    await expect(nameSort).toBeFocused();
    await expect(table.getByRole('columnheader', { name: 'Namn', exact: true })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await expect(table.getByRole('rowheader').nth(0)).toHaveText('▸Örn');
    await expect(table.getByRole('rowheader').nth(1)).toHaveText('▸Älg');
    await expect(table.getByRole('rowheader').nth(2)).toHaveText('▸Åke');
    await table.getByRole('button', { name: 'Typ', exact: true }).click();
    await expect(table.getByRole('columnheader', { name: 'Typ', exact: true })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await expect(table.getByRole('columnheader', { name: 'Namn', exact: true })).toHaveAttribute(
      'aria-sort',
      'none',
    );
    await expect(table.getByRole('row').nth(1).getByRole('cell').nth(0)).toHaveText('Typ 2');
    await table.getByRole('button', { name: 'Typ', exact: true }).click();
    await expect(table.getByRole('row').nth(1).getByRole('cell').nth(0)).toHaveText('Typ 10');
    await table.getByRole('button', { name: 'Namn', exact: true }).click();
    await table.getByRole('button', { name: 'Nästa', exact: true }).click();
    await expect(
      table.getByRole('region', { name: 'Objekt i läsläge', exact: true }),
    ).toBeFocused();
    await expect(table.getByText('Sida 2 av 2 · 50 objekt per sida')).toBeVisible();
    const focus = table.getByRole('rowheader').first().getByRole('button');
    await focus.click();
    const scroller = table.getByRole('region', { name: 'Rullbar objekttabell' });
    await scroller.evaluate((element) => {
      element.scrollTop = 75;
    });
    const scroll = await scroller.evaluate((element) => element.scrollTop);
    await focus.focus();
    await tools.getByRole('button', { name: 'Karta', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    await expect(focus).toBeFocused();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(scroll);
    await expect(focus).toHaveAttribute('aria-expanded', 'true');
    await expect(table.getByRole('columnheader', { name: 'Namn', exact: true })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await table.getByRole('button', { name: 'Föregående', exact: true }).click();
    await expect(table.getByRole('button', { name: 'A 2', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('TABELL-02: full saved and proposed details distinguish every lifecycle and proposal status', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await prepareTableDetailProposals(page.request, installation.origin);
    const before = await read();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: function (kind: string, ...args: unknown[]) {
          return kind.startsWith('webgl') ? null : Reflect.apply(original, this, [kind, ...args]);
        },
      });
    });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'A 2', exact: true }).click();
    await expect(table.getByText('Sparat: 299 SEK (Text)', { exact: true })).toBeVisible();
    await expect(table.getByText('399 SEK', { exact: false })).toBeVisible();
    await expect(table.getByText('Uttryckligen inget (Text)', { exact: true })).toBeVisible();
    await expect(table.getByText('100 000 SEK (Text)', { exact: true })).toBeVisible();
    const inline = table.getByRole('region', { name: 'Uppgifter för A 2', exact: true });
    const details = inline.locator('.household-table-details');
    const field = (name: string) =>
      details.locator('dl > div').filter({ has: page.getByText(name, { exact: true }) });
    await expect(field('Namn')).toHaveText('NamnA 2');
    await expect(field('Typ')).toHaveText('TypTyp 2');
    const rowEdit = table.getByRole('button', {
      name: 'Redigera A 2',
      exact: true,
    });
    await expect(rowEdit).toHaveCount(1);
    await rowEdit.click();
    const editor = page.getByRole('dialog', { name: 'Redigera A 2', exact: true });
    await expect(editor.getByLabel('Namn', { exact: true })).toHaveValue('A 2');
    await expect(editor.getByLabel('Namn', { exact: true })).toBeFocused();
    await editor.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(rowEdit).toBeFocused();
    await expect(inline).toBeVisible();
    await expect(field('Ramnummer')).toHaveText(
      'RamnummerSparat: Ej uppgivet◇ Ditt förslag: RAM-2026-42 (Text)',
    );
    await expect(field('Antal')).toHaveText('AntalSparat: Ej uppgivet◇ Ditt förslag: 0 (Tal)');
    await expect(field('Reserv')).toHaveText(
      'ReservSparat: Ej uppgivet◇ Ditt förslag: Nej (Ja/nej)',
    );
    await expect(field('Föreslagen anteckning')).toContainText('Sparat (Egen anteckning):');
    await expect(field('Föreslagen anteckning')).toContainText(
      `Sparat (Egen anteckning): ${'Lång egen uppgift '.repeat(30).trim()} (Text)`,
    );
    await expect(field('Föreslagen anteckning')).toContainText(
      `◇ Ditt förslag: ${'Lång egen uppgift '.repeat(30).trim()}`,
    );
    await expect(details).not.toContainText('undefined');
    await expect(table.getByText('◇ Ändrat', { exact: true })).toBeVisible();
    await expect(table.getByText('Sparat: Cykel', { exact: true })).toBeVisible();
    const images = table.getByRole('img', { name: 'Profilbild för A 2', exact: true });
    await expect(images).toHaveCount(2);
    expect(await images.nth(0).getAttribute('src')).not.toBe(
      await images.nth(1).getAttribute('src'),
    );
    for (const image of await images.all())
      await expect
        .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
        .toBe(96);
    await table.getByRole('button', { name: 'Filter', exact: true }).click();
    const filters = page.getByRole('dialog', { name: 'Tabellens filter', exact: true });
    await expect(filters.getByRole('heading', { name: 'Tabellens filter' })).toBeFocused();
    await filters.getByLabel('Ta med upphörda').check();
    await filters.getByLabel('Ta med borttagna').check();
    await page.keyboard.press('Escape');
    await expect(table.getByRole('button', { name: 'Filter · aktiva', exact: true })).toBeFocused();
    await table.getByRole('button', { name: 'Nästa', exact: true }).click();
    await expect(table.getByRole('row', { name: /Nytt prov/ })).toContainText('◇ Nytt');
    await expect(table.getByRole('row', { name: /Tas bort prov/ })).toContainText(
      'Upphört◇ Föreslagen borttagning',
    );
    await expect(table.getByRole('row', { name: /Upphört prov/ })).toContainText('Upphört');
    await expect(table.getByRole('row', { name: /Borttaget prov/ })).toContainText('Borttaget');
    await table.getByRole('button', { name: 'Borttaget prov', exact: true }).click();
    await expect(
      table.getByRole('heading', { name: 'Borttaget prov · alla uppgifter' }),
    ).toBeVisible();
    await expect(
      table.getByRole('row', { name: /Borttaget prov/ }).getByRole('button', { name: /^Redigera/ }),
    ).toHaveCount(0);
    await expect(
      table
        .getByRole('region', { name: 'Uppgifter för Borttaget prov', exact: true })
        .getByRole('button', { name: /^Redigera/ }),
    ).toHaveCount(0);
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('TABELL-03: mobile horizontal reading preserves shared selection, draft and unsent conversation', async ({
  page,
}) => {
  const installation = await createInstallation(undefined, {
    modelFetch: async () => Response.json({ output: [] }),
  });
  try {
    const { read } = await prepareHouseholdTable(page.request, installation.origin);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(installation.origin);
    await startConversationWithText(page);
    const message = page.getByLabel('Meddelande till Skyttel', { exact: true });
    await message.fill('Oskickat meddelande vid tabellbesök');
    await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    const before = await read();
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'A 2', exact: true }).click();
    const details = table.locator('.household-table-details').first();
    expect((await details.boundingBox())?.width).toBeLessThanOrEqual(336);
    expect(await details.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    const scroller = table.getByRole('region', { name: 'Rullbar objekttabell' });
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
    await scroller.focus();
    const scrollEnd = scroller.evaluate(
      (element) =>
        new Promise<number>((resolve) => {
          element.addEventListener('scrollend', () => resolve(element.scrollLeft), { once: true });
        }),
    );
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    const horizontal = await scrollEnd;
    await page.getByRole('button', { name: 'Karta', exact: true }).click();
    const mapObject = page.getByRole('button', { name: 'Välj objekt: A 2', exact: true });
    await expect(mapObject).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    expect(await scroller.evaluate((element) => element.scrollLeft)).toBe(horizontal);
    await expect(
      table
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: 'A 2', exact: true }) }),
    ).toHaveAttribute('data-selected', 'true');
    await expect(table.getByText('✓ Markerad', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Skriv till Skyttel/ }).click();
    await expect(message).toHaveValue('Oskickat meddelande vid tabellbesök');
    expect((await read()).draft).toEqual(before.draft);
  } finally {
    await installation.close();
  }
});
