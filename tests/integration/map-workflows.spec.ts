import { expect, type Page, test } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import {
  openMap as closeWorkspace,
  createHousehold,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { createInstallation } from '../support/installation.js';

async function openMap(page: Page) {
  const installation = await createInstallation();
  await signIn(page.request, installation.origin);
  const { household } = await (await createHousehold(page.request, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}/map`;
  await page.goto(installation.origin);
  await openWorkspace(page);
  const read = async (): Promise<MapState> => (await page.request.get(path)).json();
  return { installation, read };
}

async function addObject(page: Page, name: string, type: string, description = '') {
  await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
  await page.getByLabel('Objektets namn').fill(name);
  await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: type });
  await page.getByLabel('Beskrivning', { exact: true }).fill(description);
  await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
}

async function addRelationship(page: Page, source: string, type: string, target: string) {
  await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
  await page.getByLabel('Från objekt').selectOption({ label: source });
  await page.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: type });
  await page.getByLabel('Till objekt').selectOption({ label: target });
  await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Spara hela utkastet' }).click();
  await expect(page.getByRole('status')).toContainText('Sparat');
  await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
    'Inga förslag',
  );
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
    const objects = page.getByRole('list', { name: 'Objekt', exact: true });
    const search = page.getByLabel('Sök objekt');
    await search.fill('åSAS');
    await expect(
      objects.getByRole('button', { name: /^Visa .+ i kartan$/ }).locator('strong'),
    ).toHaveText(['Åsas tjänst']);
    await objects.getByRole('button', { name: 'Uppgifter för Åsas tjänst', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Objektets namn')).toBeFocused();
    await page.getByLabel('Objektets namn').fill('Text som inte skickas');
    await page.getByLabel('Beskrivning', { exact: true }).fill('Inte heller denna text skickas');
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Nytt objekt', exact: true })).toBeFocused();
    await objects.getByRole('button', { name: 'Uppgifter för Åsas tjänst', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Objektets namn')).toHaveValue('Åsas tjänst');
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue('Gemensam musik');
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await search.fill('finns inte');
    await expect(objects.getByRole('listitem')).toHaveCount(0);
    await search.fill('');
    await expect(objects.getByRole('listitem')).toHaveCount(3);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Avbrutet objekt');
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await page.reload();
    await openWorkspace(page);
    await expect(objects.getByRole('listitem')).toHaveCount(3);
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
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Betalkonto');
    await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Bankkonto' });
    await page.getByLabel('Objektets identitet').selectOption('unresolved');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    const objectId = (await read()).draft.changes[0].id;
    await page.reload();
    await openWorkspace(page);
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Obesvarad identitetsfråga',
    );
    await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
    expect((await read()).objects).toEqual([]);
    await page.getByRole('button', { name: 'Uppgifter för Betalkonto', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Objektets identitet')).toHaveValue('unresolved');
    await page.getByLabel('Objektets identitet').selectOption('unspecified');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
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
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Uppgifter för Betalkonto', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Objektets identitet')).toHaveValue('unspecified');
    await page.getByLabel('Objektets identitet').selectOption('identified');
    await page.getByLabel('Objektets namn').fill('Hushållskontot');
    await page.getByLabel('Beskrivning', { exact: true }).fill('Gemensamt bankkonto');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await save(page);
    await page.reload();
    await openWorkspace(page);
    await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
      'Familjemusik → Betalas med → Hushållskontot',
    );
    await page.getByRole('button', { name: 'Uppgifter för Hushållskontot', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Objektets identitet')).toHaveValue('identified');
    const after = await read();
    expect(after.objects).toHaveLength(2);
    expect(after.objects.find((object) => object.id === objectId)).toMatchObject({
      name: 'Hushållskontot',
      description: 'Gemensamt bankkonto',
    });
    expect(after.objects.find((object) => object.id === objectId)?.identity).toBeUndefined();
    expect(after.relationships).toEqual([relationship]);
  } finally {
    await installation.close();
  }
});

for (const width of [1280, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`KARTA-08: a closed-panel identity blocker opens the exact retained object without sending other text at ${width}px in ${theme}`, async ({
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
        await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
        await page.getByLabel('Objektets namn').fill('Betalkonto');
        await page.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Bankkonto' });
        await page.getByLabel('Objektets identitet').selectOption('unresolved');
        await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
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

        for (const name of ['Betalkonto', 'Familjemusik']) {
          await page.getByRole('button', { name: `Uppgifter för ${name}`, exact: true }).click();
          const panel = page.getByRole('region', { name, exact: true });
          await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
          await panel.getByLabel('Beskrivning', { exact: true }).fill(`Oskickat om ${name}`);
          await panel.getByRole('button', { name: `Stäng ${name}`, exact: true }).click();
        }
        await closeWorkspace(page);
        const status = page.getByRole('region', { name: 'Utkastets återkoppling', exact: true });
        await expect(status).toContainText('Red ut identiteter i utkastet');
        await expect(status).toContainText('Oskickad formulärtext finns kvar');
        const resolve = status.getByRole('button', {
          name: 'Red ut identiteter i utkastet',
          exact: true,
        });
        await expect(resolve).toBeVisible();
        await resolve.focus();
        await expectUncoveredFocus(page);
        await page.keyboard.press('Enter');
        const draft = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
        await expect(
          draft.getByRole('heading', { name: 'Hela mitt utkast', exact: true }),
        ).toBeFocused();
        await expectUncoveredFocus(page);
        const account = draft.getByRole('article').filter({
          has: page.getByRole('heading', { name: 'Nytt objekt: Betalkonto', exact: true }),
        });
        const correct = account.getByRole('button', {
          name: 'Red ut identiteten för Betalkonto',
          exact: true,
        });
        await expect(correct).toBeVisible();
        await correct.focus();
        await expectUncoveredFocus(page);
        await page.keyboard.press('Enter');
        const editor = page.getByRole('region', { name: 'Betalkonto', exact: true });
        await expect(
          editor.getByRole('heading', { name: 'Betalkonto', exact: true }),
        ).toBeFocused();
        await expectUncoveredFocus(page);
        await expect(editor.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickat om Betalkonto',
        );
        await expect(editor.getByLabel('Objektets identitet')).toHaveValue('unresolved');
        await editor.getByLabel('Objektets identitet').selectOption('unspecified');
        await editor.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
        expect((await read()).objects).toEqual(before.objects);
        expect((await read()).relationships).toEqual(before.relationships);
        expect((await read()).draft.changes).toEqual([
          expect.objectContaining({
            id: accountId,
            after: expect.objectContaining({
              name: 'Betalkonto',
              identity: 'unspecified',
              description: 'Oskickat om Betalkonto',
            }),
          }),
        ]);
        expect((await read()).draft.relationships).toEqual(proposed.draft.relationships);
        await expect(page.getByRole('button', { name: 'Spara hela utkastet' })).toBeDisabled();
        await page.getByRole('button', { name: 'Uppgifter för Familjemusik', exact: true }).click();
        const unrelated = page.getByRole('region', { name: 'Familjemusik', exact: true });
        await expect(unrelated.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickat om Familjemusik',
        );
        await unrelated
          .getByRole('button', { name: 'Stäng utan att skicka texten', exact: true })
          .click();
        await save(page);
        await installation.restart();
        await page.reload();
        await openWorkspace(page);
        const saved = await read();
        expect(saved.objects).toHaveLength(2);
        expect(saved.objects.find((object) => object.id === accountId)).toMatchObject({
          name: 'Betalkonto',
          identity: 'unspecified',
          description: 'Oskickat om Betalkonto',
        });
        expect(saved.objects.find((object) => object.id === before.objects[0].id)).toEqual(
          before.objects[0],
        );
        expect(saved.relationships).toEqual([
          expect.objectContaining({ id: relationship?.id, ...relationship?.after }),
        ]);
        await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
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
      (change) => change.after?.description === 'Första adressobjektet',
    )?.id;
    const second = draft.draft.changes.find(
      (change) => change.after?.description === 'Andra adressobjektet',
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
    await addRelationship(page, 'Musikkonto (Tjänstekonto)', 'Inloggningsadress', firstLabel);
    await expect(page.getByRole('status')).toContainText('Sambandet finns redan');
    await expect(
      page.getByRole('list', { name: 'Samband', exact: true }).getByRole('button'),
    ).toHaveCount(2);
    expect((await read()).draft.relationships ?? []).toEqual([]);

    const loginButton = page.getByRole('button', {
      name: 'Musikkonto → Inloggningsadress → familj@example.test',
      exact: true,
    });
    await loginButton.click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await expect(page.getByLabel('Till objekt')).toHaveValue(first ?? '');
    await page.getByLabel('Till objekt').selectOption({ label: secondLabel });
    await page.getByRole('button', { name: 'Stäng sambandet utan att skicka' }).click();
    expect((await read()).relationships).toEqual(saved.relationships);
    await loginButton.click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await expect(page.getByLabel('Till objekt')).toHaveValue(first ?? '');
    await page.getByLabel('Till objekt').selectOption({ label: secondLabel });
    await page.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
    await save(page);
    await page.reload();
    await openWorkspace(page);
    await loginButton.click();
    await page.getByRole('button', { name: 'Redigera valt samband', exact: true }).click();
    await expect(page.getByLabel('Till objekt')).toHaveValue(second ?? '');
    const corrected = await read();
    expect(corrected.objects).toEqual(saved.objects);
    expect(
      corrected.relationships.find((relationship) => relationship.id === login?.id),
    ).toMatchObject({
      targetId: second,
      sourceId: login?.sourceId,
      typeId: login?.typeId,
    });
    await page.getByRole('button', { name: 'Ta bort sambandet' }).click();
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Borttagning av samband',
    );
    await save(page);
    await page.reload();
    await openWorkspace(page);
    await expect(loginButton).toHaveCount(0);
    await expect(
      page.getByRole('button', {
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
    const review = page.getByRole('region', { name: 'Hela mitt utkast' });
    await page.getByRole('button', { name: 'Uppgifter för Musikkonto', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await expect(
      review.getByRole('heading', { name: 'Borttagning: Musikkonto', exact: true }),
    ).toBeVisible();
    await expect(
      review.getByRole('heading', { name: 'Borttagning av samband', exact: true }),
    ).toHaveCount(2);
    await expect(review).toContainText('Musikkonto → Tillhör tjänsten → Molnmusik');
    await expect(review).toContainText('Familjemusik → Gäller tjänstekontot → Musikkonto');
    expect((await read()).objects).toEqual(saved.objects);
    expect((await read()).relationships).toEqual(saved.relationships);
    await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await expect(
      page
        .getByLabel('Från objekt')
        .getByRole('option', { name: 'Musikkonto (Tjänstekonto)', exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByLabel('Till objekt')
        .getByRole('option', { name: 'Musikkonto (Tjänstekonto)', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Stäng sambandet utan att skicka' }).click();
    await page.getByRole('button', { name: 'Kasta hela utkastet' }).click();
    await expect(
      page.getByRole('list', { name: 'Samband', exact: true }).getByRole('button'),
    ).toHaveCount(3);
    expect((await read()).objects).toEqual(saved.objects);
    expect((await read()).relationships).toEqual(saved.relationships);
    await page.getByRole('button', { name: 'Uppgifter för Musikkonto', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByRole('button', { name: 'Ta bort', exact: true }).click();
    await save(page);
    await page.reload();
    await openWorkspace(page);
    await expect(
      page
        .getByRole('list', { name: 'Objekt', exact: true })
        .getByRole('button', { name: /^Visa .+ i kartan$/ })
        .locator('strong'),
    ).toHaveText(['Familjemusik', 'Kim', 'Molnmusik']);
    await expect(
      page.getByRole('list', { name: 'Samband', exact: true }).getByRole('button'),
    ).toHaveText(['Kim → Använder → Molnmusik']);
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
