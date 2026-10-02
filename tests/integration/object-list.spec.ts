import { expect, type Page, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import {
  activatePanel,
  createHousehold,
  openMap,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { openConversationText, startConversationWithText } from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';

test('LISTA-01: multiple type filters combine with search and marks across 500 objects', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.seedLargeMap(user.id, household.id);
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const before = await (await page.request.get(path)).json();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(installation.origin);
    await openWorkspace(page);
    const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    const details = work.getByRole('button', {
      name: 'Uppgifter för Provobjekt 000',
      exact: true,
    });
    await expect(details).toHaveText('Uppgifter');
    await expect(details).toHaveAccessibleName('Uppgifter för Provobjekt 000');
    await work.getByRole('button', { name: 'Markera Provobjekt 000', exact: true }).click();
    await work.getByRole('button', { name: 'Markera Provobjekt 001', exact: true }).click();
    await work.getByText('Filter', { exact: true }).click();
    const filters = work.getByRole('group', { name: 'Objekttyper', exact: true });
    await filters.getByRole('checkbox', { name: 'Person', exact: true }).check();
    await filters.getByRole('checkbox', { name: 'Tjänst', exact: true }).check();
    await expect(filters).toBeVisible();
    await expect(work.getByText('200 av 500 objekt', { exact: true })).toBeVisible();
    await work.getByLabel('Sök objekt', { exact: true }).fill('sammanhang 0.');
    await expect(work.getByText('10 av 500 objekt', { exact: true })).toBeVisible();
    await expect(filters.getByText('5', { exact: true })).toHaveCount(5);
    await work.getByRole('checkbox', { name: /^Bara markerade/ }).check();
    await expect(work.getByText('2 av 500 objekt', { exact: true })).toBeVisible();
    await work.getByRole('button', { name: /^Alla typer/ }).click();
    await expect(filters.getByRole('checkbox', { checked: true })).toHaveCount(0);
    await expect(work.getByText('2 av 500 objekt', { exact: true })).toBeVisible();
    await work.getByRole('checkbox', { name: /^Bara markerade/ }).uncheck();
    await expect(work.getByText('25 av 500 objekt', { exact: true })).toBeVisible();
    await filters.getByRole('checkbox', { name: 'Person', exact: true }).check();
    await work.getByRole('button', { name: 'Visa 5 objekt', exact: true }).click();
    await expect(work.getByRole('region', { name: 'Sökträffar', exact: true })).toBeFocused();
    await expect(filters).not.toBeVisible();
    await expect(work.getByText('Filter · Person', { exact: true })).toBeVisible();
    await expect(
      work.getByRole('button', { name: 'Markera Provobjekt 000', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(work.getByText('Person · 5 träffar', { exact: true })).toBeVisible();
    await work.getByLabel('Sök objekt', { exact: true }).fill('finns inte');
    await expect(work.getByRole('heading', { name: 'Inga objekt matchar' })).toBeVisible();
    await work.getByRole('button', { name: 'Rensa sökning och filter', exact: true }).click();
    await expect(work.getByText('500 av 500 objekt', { exact: true })).toBeVisible();
    await expect(
      work.getByRole('button', { name: 'Markera Provobjekt 001', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(await (await page.request.get(path)).json()).toEqual(before);
  } finally {
    await installation.close();
  }
});

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
            value: { name, description: '', typeId: initial.types[0].id },
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
            value: {
              sourceId,
              targetId,
              knowledge: 'known',
              typeId: initial.relationshipTypes[0].id,
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  await page.goto(origin);
  await openMap(page);
  return { read, path };
}

test('LISTA-03: a map result focuses only its direct neighbors and closes only the list', async ({
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
    await lo.click({ trial: true });
    await openConversationText(page);
    const conversation = page.getByRole('region', { name: 'Samtal och text', exact: true });
    await startConversationWithText(conversation);
    await conversation
      .getByLabel('Meddelande till textassistenten', { exact: true })
      .fill('Oskickat medan jag söker');
    await openWorkspace(page);
    const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    await work.getByRole('button', { name: 'Markera Lo Exempel', exact: true }).click();
    await work.getByRole('button', { name: 'Markera Kim Exempel', exact: true }).click();
    const before = await lo.boundingBox();
    const beforeKim = await map
      .getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true })
      .boundingBox();
    await work.getByLabel('Sök objekt', { exact: true }).fill('Lo Exempel');
    expect(await lo.boundingBox()).toEqual(before);
    await work.getByRole('button', { name: 'Visa Lo Exempel i kartan', exact: true }).click();
    await expect(work).not.toBeVisible();
    await expect(conversation).toBeVisible();
    await expect(
      conversation.getByLabel('Meddelande till textassistenten', { exact: true }),
    ).toHaveValue('Oskickat medan jag söker');
    await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toHaveCount(0);
    await expect(lo).toHaveAttribute('aria-pressed', 'true');
    const kim = map.getByRole('button', { name: 'Välj objekt: Kim Exempel', exact: true });
    await expect(kim).toHaveAttribute('aria-pressed', 'false');
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
    if (!far) throw new Error('The second neighbor must retain its projected position');
    // Perspective can leave an unrelated marker at the edge of the canvas;
    // it must not enlarge the usable rectangle fitted to Lo and Kim.
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
    await openWorkspace(page);
    await expect(work.getByLabel('Sök objekt', { exact: true })).toHaveValue('Lo Exempel');
    await expect(
      work.getByRole('list', { name: 'Objekt', exact: true }).getByRole('listitem'),
    ).toHaveCount(1);
    expect(await read()).toEqual(content);
    expect(await (await page.request.get(`${path}/view`)).json()).toEqual(personal);
  } finally {
    await installation.close();
  }
});

test('LISTA-02: sorting, pages and scroll survive details, settings and map-result navigation', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { user } = await (await page.request.get(`${installation.origin}/api/bootstrap`)).json();
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    installation.seedLargeMap(user.id, household.id);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(installation.origin);
    await openWorkspace(page);
    const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
    await work.getByLabel('Sök objekt', { exact: true }).fill('Provobjekt');
    await work.getByText('Filter', { exact: true }).click();
    await work.getByRole('checkbox', { name: 'Person', exact: true }).check();
    await work.getByRole('checkbox', { name: 'Tjänst', exact: true }).check();
    await work.getByRole('button', { name: 'Visa 200 objekt', exact: true }).click();
    const namesBySort: string[][] = [];
    for (const sort of ['name', 'type']) {
      await work.getByRole('combobox', { name: 'Sortering', exact: true }).selectOption(sort);
      const names: string[] = [];
      for (const number of ['1', '2', '3', '4']) {
        await work
          .getByRole('combobox', { name: 'Sida för objekt', exact: true })
          .selectOption(number);
        names.push(
          ...(await work
            .getByRole('list', { name: 'Objekt', exact: true })
            .getByRole('button', { name: /^Uppgifter för/ })
            .evaluateAll((buttons) =>
              buttons.map((button) => button.getAttribute('aria-label') ?? ''),
            )),
        );
      }
      namesBySort.push(names);
      await expect(work.getByText('200 av 500 objekt', { exact: true })).toBeVisible();
    }
    expect(namesBySort[0]).toHaveLength(200);
    expect(namesBySort[1].sort()).toEqual(namesBySort[0].sort());
    await expect(work.getByText('Tjänst · 100 träffar', { exact: true })).toBeVisible();
    const details = work.getByRole('button', {
      name: 'Uppgifter för Provobjekt 496',
      exact: true,
    });
    await details.scrollIntoViewIfNeeded();
    const body = work.locator('.workspace-panel-body');
    const remembered = await body.evaluate((element) => element.scrollTop);
    expect(remembered).toBeGreaterThan(500);
    await details.click();
    const detail = page.getByRole('region', { name: 'Provobjekt 496', exact: true });
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await detail.getByLabel('Beskrivning', { exact: true }).fill('Oskickat under listbesöket');
    await activatePanel(page, 'Lista och utkast');
    expect(await body.evaluate((element) => element.scrollTop)).toBe(remembered);
    await work.getByRole('button', { name: 'Stäng Lista och utkast', exact: true }).click();
    await openWorkspace(page);
    await expect(work.getByRole('combobox', { name: 'Sida för objekt', exact: true })).toHaveValue(
      '4',
    );
    expect(await body.evaluate((element) => element.scrollTop)).toBe(remembered);
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(work.getByLabel('Sök objekt', { exact: true })).toHaveValue('Provobjekt');
    await expect(work.getByRole('combobox', { name: 'Sortering', exact: true })).toHaveValue(
      'type',
    );
    await expect(work.getByText('Filter · Person, Tjänst', { exact: true })).toBeVisible();
    expect(await body.evaluate((element) => element.scrollTop)).toBe(remembered);
    await work.getByRole('button', { name: 'Visa Provobjekt 496 i kartan', exact: true }).click();
    await expect(work).not.toBeVisible();
    await expect(detail).toBeVisible();
    await expect(detail.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Oskickat under listbesöket',
    );
    await openWorkspace(page);
    await expect(work.getByRole('combobox', { name: 'Sida för objekt', exact: true })).toHaveValue(
      '4',
    );
    await expect(work.getByLabel('Sök objekt', { exact: true })).toHaveValue('Provobjekt');
    expect(await body.evaluate((element) => element.scrollTop)).toBe(remembered);
    await work.getByLabel('Sök objekt', { exact: true }).fill('Provobjekt 496');
    await expect(
      work.getByRole('list', { name: 'Objekt', exact: true }).getByRole('listitem'),
    ).toHaveCount(1);
    await expect(work.getByRole('combobox', { name: 'Sida för objekt', exact: true })).toHaveCount(
      0,
    );
  } finally {
    await installation.close();
  }
});

for (const width of [390, 320]) {
  test(`LISTA-04: narrow lists retain search and accessible details after graphics loss at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 844 });
      const { read, path } = await arrangeNeighbors(page, installation.origin);
      const content = await read();
      const personal = await (await page.request.get(`${path}/view`)).json();
      await openWorkspace(page);
      const work = page.getByRole('region', { name: 'Lista och utkast', exact: true });
      await work.getByLabel('Sök objekt', { exact: true }).fill('Lo Exempel');
      await work.getByText('Filter', { exact: true }).click();
      const person = work.getByRole('checkbox', { name: 'Person', exact: true });
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
      await work.getByRole('button', { name: 'Visa 1 objekt', exact: true }).click();
      await expect(work.getByRole('region', { name: 'Sökträffar', exact: true })).toBeFocused();
      await work.getByRole('button', { name: 'Visa Lo Exempel i kartan', exact: true }).click();
      await expect(work).not.toBeVisible();
      await expect(page.getByRole('region', { name: 'Lo Exempel', exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await openWorkspace(page);
      await expect(work.getByLabel('Sök objekt', { exact: true })).toHaveValue('Lo Exempel');
      await page.locator('.spatial-surface canvas').evaluate((element) => {
        const extension = (element as HTMLCanvasElement)
          .getContext('webgl2')
          ?.getExtension('WEBGL_lose_context');
        if (!extension) throw new Error('Native WebGL context loss is required');
        extension.loseContext();
      });
      await expect(
        work.getByRole('button', { name: 'Visa Lo Exempel i kartan', exact: true }),
      ).toBeDisabled();
      await expect(work).toBeVisible();
      await expect(
        work.getByText(
          'Kartan kan inte visas. Använd Uppgifter för att läsa och redigera objekten.',
        ),
      ).toBeVisible();
      await work.getByRole('button', { name: 'Uppgifter för Lo Exempel', exact: true }).click();
      const details = page.getByRole('region', { name: 'Lo Exempel', exact: true });
      await expect(details.getByRole('heading', { name: 'Lo Exempel', exact: true })).toBeFocused();
      await details.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
      await details.getByLabel('Beskrivning', { exact: true }).fill('Utan grafik');
      await activatePanel(page, 'Lista och utkast');
      await expect(work.getByLabel('Sök objekt', { exact: true })).toHaveValue('Lo Exempel');
      await expect(work.getByText('Filter · Person', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      expect(await read()).toEqual(content);
      expect(await (await page.request.get(`${path}/view`)).json()).toEqual(personal);
    } finally {
      await installation.close();
    }
  });
}
