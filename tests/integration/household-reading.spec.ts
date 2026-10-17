import type { Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openTable, signIn } from '../support/client.js';
import { startConversationWithText } from '../support/conversation-page.js';
import { prepareHouseholdReading } from '../support/household-reading.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

async function removeFromAnotherTab(page: Page, origin: string, names: string[]) {
  const other = await page.context().newPage();
  try {
    await other.goto(origin);
    await openTable(other);
    const table = other.getByRole('region', { name: 'Hushållets tabell', exact: true });
    for (const name of names) {
      await table.getByRole('searchbox', { name: 'Sök objekt i tabellen' }).fill(name);
      await table.getByRole('button', { name: `Ta bort ${name}`, exact: true }).click();
      await expect(table.getByRole('button', { name, exact: true })).toHaveCount(0);
    }
  } finally {
    await other.close();
  }
}

function expectOnlyRemoved(before: MapState, after: MapState, ids: string[]) {
  expect(after).toEqual({
    ...before,
    draft: {
      ...before.draft,
      version: after.draft.version,
      changes: before.draft.changes.filter((change) => !ids.includes(change.id)),
    },
  });
}

test('LÄS-05: identity reading distinguishes identified, unresolved and a proposal replacing unspecified identity', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post } = await prepareHouseholdReading(page.request, installation.origin, false);
    const garage = (await read()).objects.find((object) => object.id === 'garage');
    if (!garage) throw new Error('Missing garage fixture');
    await post('draft', {
      id: garage.id,
      baseRevision: garage.revision,
      value: { ...garage, identity: undefined },
    });
    await post('draft', {
      id: 'unresolved',
      baseRevision: null,
      value: {
        name: 'Oklart objekt',
        typeId: garage.typeId,
        description: '',
        identity: 'unresolved',
      },
    });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    for (const [name, expected] of [
      ['Alex', 'Identifierat objekt'],
      ['Oklart objekt', 'Identiteten behöver redas ut'],
      ['Garage', 'Identifierat objekt'],
    ]) {
      await page.getByRole('button', { name, exact: true }).click();
      const dialog = page.getByRole('region', { name: `Uppgifter för ${name}`, exact: true });
      const identity = dialog.locator('dl > div').filter({
        has: page.getByText('Identitet', { exact: true }),
      });
      await expect(identity).toContainText(expected);
      await expect(identity).not.toContainText('Ej uppgivet');
      if (name === 'Garage') {
        await expect(identity).toContainText('Sparat: Ospecificerat objekt');
        await expect(identity).toContainText('◇ Ditt förslag: Identifierat objekt');
      }
      await page.getByRole('button', { name, exact: true }).click();
      await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
    }
    const unchanged = (await read()).objects.find((object) => object.id === garage.id);
    expect(unchanged?.identity).toBe('unspecified');
    expect(
      (await read()).draft.changes.find((change) => change.id === garage.id)?.after?.identity,
    ).toBeUndefined();
  } finally {
    await installation.close();
  }
});

test('LÄS-06: a vanished sole second-page row restores the preceding control after page collapse', async ({
  page,
}) => {
  const installation = await createInstallation(undefined, {
    modelFetch: async () => Response.json({ output: [] }),
  });
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    async function propose(id: string, name: string | null) {
      const state = await read();
      const response = await page.request.post(`${path}/draft`, {
        headers: { origin: installation.origin },
        data: {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id,
          baseRevision: null,
          value: name ? { name, typeId: state.types[0]?.id, description: '' } : null,
        },
      });
      expect(response.status(), await response.text()).toBe(200);
    }
    for (let index = 1; index <= 51; index++) await propose(`item-${index}`, `Objekt ${index}`);
    await page.goto(installation.origin);
    await startConversationWithText(page);
    await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'Nästa', exact: true }).click();
    await expect(table.getByText('Sida 2 av 2 · 50 objekt per sida')).toBeVisible();
    await table.getByRole('button', { name: 'Samband för Objekt 51', exact: true }).click();
    const beforeRemoval = await read();
    await removeFromAnotherTab(page, installation.origin, ['Objekt 51']);
    expectOnlyRemoved(beforeRemoval, await read(), ['item-51']);
    await expect(
      page.getByRole('dialog', { name: 'Objektet finns inte längre', exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('Escape');
    await expect(table.getByText('Sida 1 av 1 · 50 objekt per sida')).toBeVisible();
    await expect(
      table.getByRole('button', { name: 'Samband för Objekt 50', exact: true }),
    ).toBeFocused();
    expect((await read()).draft.changes).toHaveLength(50);
    // Replay the retained HTTP removal only after all native background/focus checks.
    await propose('item-51', 'Objekt 51');
    await propose('item-51', null);
    expect((await read()).draft.changes).toHaveLength(50);
  } finally {
    await installation.close();
  }
});

test('LÄS-07: a long unbroken object name wraps in full reading at 320 CSS pixels', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { post } = await prepareHouseholdReading(page.request, installation.origin, false);
    const name = 'Långtobjektnamn'.repeat(12);
    await post('draft', {
      id: 'long-name',
      baseRevision: null,
      value: { name, typeId: 'read-type', description: '' },
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('region', { name: `Uppgifter för ${name}`, exact: true });
    const heading = dialog.getByRole('heading', { name: `${name} · alla uppgifter`, exact: true });
    await expect(heading).toBeVisible();
    for (const area of [dialog, dialog.locator('.household-table-details')])
      expect(await area.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    const bounds = await heading.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320);
  } finally {
    await installation.close();
  }
});

for (const fallback of ['previous', 'heading'] as const) {
  test(`${fallback === 'previous' ? 'LÄS-04' : 'LÄS-08'}: vanished read openers return to ${fallback} when no next row remains`, async ({
    page,
  }) => {
    const installation = await createInstallation(undefined, {
      modelFetch: async () => Response.json({ output: [] }),
    });
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      async function propose(id: string, name: string | null) {
        const state = await read();
        const result = await page.request.post(`${path}/draft`, {
          headers: { origin: installation.origin },
          data: {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            id,
            baseRevision: null,
            value: name ? { name, typeId: state.types[0]?.id, description: '' } : null,
          },
        });
        expect(result.status(), await result.text()).toBe(200);
      }
      await propose('a', 'A');
      await propose('b', 'B');
      await page.goto(installation.origin);
      await startConversationWithText(page);
      await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
      await page.getByRole('button', { name: 'Tabell', exact: true }).click();
      await page.getByRole('button', { name: 'Samband för B', exact: true }).click();
      const beforeRemoval = await read();
      await removeFromAnotherTab(page, installation.origin, [
        'B',
        ...(fallback === 'heading' ? ['A'] : []),
      ]);
      expectOnlyRemoved(beforeRemoval, await read(), [
        'b',
        ...(fallback === 'heading' ? ['a'] : []),
      ]);
      await expect(
        page.getByRole('dialog', { name: 'Objektet finns inte längre', exact: true }),
      ).toBeVisible({ timeout: 15000 });
      await page.keyboard.press('Escape');
      const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
      await expect(
        fallback === 'previous'
          ? table.getByRole('button', { name: 'Samband för A', exact: true })
          : table.getByRole('heading', { name: 'Hushållet Linden', exact: true }),
      ).toBeFocused();
      // Independent protocol setup follows the completed native other-tab workflow.
      await propose('b', 'B');
      if (fallback === 'heading') await propose('a', 'A');
      await propose('b', null);
      if (fallback === 'heading') await propose('a', null);
      expectOnlyRemoved(beforeRemoval, await read(), [
        'b',
        ...(fallback === 'heading' ? ['a'] : []),
      ]);
    } finally {
      await installation.close();
    }
  });
}

test('LÄS-01: keyboard follows Alex to bicycle to garage and back without graphics or lost table state', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read } = await prepareHouseholdReading(page.request, installation.origin);
    const before = await read();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value: function (kind: string, ...args: unknown[]) {
          return kind.startsWith('webgl') ? null : Reflect.apply(original, this, [kind, ...args]);
        },
      });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    await table.getByRole('button', { name: 'A 1', exact: true }).click();
    await table.getByRole('button', { name: 'A 2', exact: true }).click();
    await table.getByRole('button', { name: 'Nästa', exact: true }).click();
    await table.getByRole('button', { name: 'Alex', exact: true }).click();
    await table.getByRole('button', { name: 'Cykel', exact: true }).click();
    const scroller = table.getByRole('region', { name: 'Rullbar objekttabell' });
    await scroller.evaluate((element) => {
      element.scrollTop = 100;
    });
    const scroll = await scroller.evaluate((element) => element.scrollTop);
    const opener = table.getByRole('button', { name: 'Samband för Alex', exact: true });
    await expect(opener).toHaveAccessibleDescription('1 samband');
    await opener.focus();
    await page.keyboard.press('Enter');
    let dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await expect(
      dialog.getByRole('heading', { name: 'Samband för Alex', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Stäng samband', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Stäng dialogen', exact: true })).toBeFocused();
    await dialog.getByRole('heading', { name: 'Samband för Alex', exact: true }).focus();
    await page
      .getByRole('button', { name: 'Karta', exact: true })
      .evaluate((button) => (button as HTMLButtonElement).focus());
    await expect(
      dialog.getByRole('heading', { name: 'Samband för Alex', exact: true }),
    ).toBeFocused();
    await dialog.getByRole('button', { name: 'Cykel', exact: true }).focus();
    await page.keyboard.press('Enter');
    dialog = page.getByRole('dialog', { name: 'Uppgifter för Cykel', exact: true });
    await expect(
      dialog.getByRole('heading', { name: 'Uppgifter för Cykel', exact: true }),
    ).toBeFocused();
    await expect(dialog.getByText('Sparat: 2000 SEK', { exact: true })).toBeVisible();
    await expect(
      dialog
        .locator('dt')
        .filter({ hasText: /^Pris$/ })
        .locator('..'),
    ).toContainText('◇ Ditt förslag: 2500 SEK');
    await expect(
      dialog.getByText('Ramens märkning är ett påhittat exempel', { exact: true }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Samband för Cykel', exact: true }).focus();
    await page.keyboard.press('Enter');
    dialog = page.getByRole('dialog', { name: 'Samband för Cykel', exact: true });
    await expect(
      dialog.getByText('Sparat: Sparad dold sambandsuppgift', { exact: true }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Garage', exact: true }).focus();
    await page.keyboard.press('Enter');
    dialog = page.getByRole('dialog', { name: 'Uppgifter för Garage', exact: true });
    await expect(dialog.getByText('Ospecificerat objekt', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^(Stäng|Stäng samband)$/ })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Tillbaka', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Stäng dialogen', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Tillbaka', exact: true })).toBeFocused();
    for (const name of ['Samband för Cykel', 'Uppgifter för Cykel', 'Samband för Alex']) {
      await dialog.getByRole('button', { name: 'Tillbaka', exact: true }).focus();
      await page.keyboard.press('Enter');
      dialog = page.getByRole('dialog', { name, exact: true });
      await expect(dialog.getByRole('heading', { name, exact: true })).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBe(scroll);
    await expect(table.getByText('Sida 2 av 2 · 50 objekt per sida')).toBeVisible();
    await expect(table.getByRole('button', { name: 'Alex', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(table.getByRole('button', { name: 'Cykel', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await table.getByRole('button', { name: 'Föregående', exact: true }).click();
    await expect(table.getByRole('button', { name: 'A 1', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(table.getByRole('button', { name: 'A 2', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('LÄS-02: mobile full relationship reading separates absent targets, uncertainty and proposed removal', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { read, post } = await prepareHouseholdReading(page.request, installation.origin, false);
    const before = await read();
    const removal = before.relationships.find((value) => value.id === 'alex-bike');
    if (!removal) throw new Error('Missing fixture link');
    await post('relationship', { id: removal.id, baseRevision: removal.revision, value: null });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(installation.origin);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Cykel', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Cykel', exact: true });
    await expect(
      dialog.getByRole('heading', { name: 'Samband för Cykel', exact: true }),
    ).toBeFocused();
    await expect(
      dialog.getByText('Aktuellt · ◇ Föreslagen borttagning', { exact: true }),
    ).toBeVisible();
    const links = dialog.locator('.household-read-relationships > li');
    await expect(links).toHaveCount(4);
    const none = links.filter({ has: page.getByRole('heading', { name: /Har ingen|har ingen/ }) });
    await expect(none.locator('.household-read-link')).toHaveCount(0);
    await expect(none.getByRole('button', { name: 'Redigera samband', exact: true })).toBeVisible();
    await expect(none).toContainText('Uttryckligen inget');
    const unknown = links.filter({ has: page.getByRole('heading', { name: /okänd koppling/ }) });
    await expect(unknown.locator('.household-read-link')).toHaveCount(0);
    await expect(
      unknown.getByRole('button', { name: 'Redigera samband', exact: true }),
    ).toBeVisible();
    await expect(unknown).toContainText('Okänt');
    const storage = links.filter({
      has: page.getByRole('button', { name: 'Garage', exact: true }),
    });
    await expect(storage).toContainText('Osäkert uppgivet');
    await expect(storage).toContainText('2024-12-31');
    await expect(storage).toContainText('Manuellt upphört');
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(
      await dialog
        .locator('.household-read-body')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await expect(dialog.getByRole('button', { name: 'Stäng samband', exact: true })).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Samband för Cykel', exact: true }),
    ).toBeFocused();
  } finally {
    await installation.close();
  }
});

test('LÄS-03: a vanished table opener returns to the next equivalent control after a real background update', async ({
  page,
}) => {
  const installation = await createInstallation(undefined, {
    modelFetch: async () => Response.json({ output: [] }),
  });
  try {
    const { read, post } = await prepareHouseholdReading(page.request, installation.origin, false);
    await post('draft', {
      id: 'temporary',
      baseRevision: null,
      value: { name: 'B Tillfälligt objekt', typeId: 'read-type', description: '' },
    });
    await page.goto(installation.origin);
    await startConversationWithText(page);
    await page.getByRole('button', { name: 'Stäng textvyn', exact: true }).click();
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page
      .getByRole('button', { name: 'Samband för B Tillfälligt objekt', exact: true })
      .click();
    const beforeRemoval = await read();
    await removeFromAnotherTab(page, installation.origin, ['B Tillfälligt objekt']);
    expectOnlyRemoved(beforeRemoval, await read(), ['temporary']);
    await expect(
      page.getByRole('dialog', { name: 'Objektet finns inte längre', exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Samband för Cykel', exact: true }),
    ).toBeFocused();
    expect((await read()).draft.changes.some((change) => change.id === 'temporary')).toBe(false);
    // Keep the original HTTP removal assertion in independently restored setup.
    await post('draft', {
      id: 'temporary',
      baseRevision: null,
      value: { name: 'B Tillfälligt objekt', typeId: 'read-type', description: '' },
    });
    await post('draft', { id: 'temporary', baseRevision: null, value: null });
    expectOnlyRemoved(beforeRemoval, await read(), ['temporary']);
  } finally {
    await installation.close();
  }
});
