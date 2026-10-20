import { addFreeProperty, freeProperty } from '../support/free-property-forms.js';
import { createInstallation } from '../support/installation.js';
import { createRelationshipFixture } from '../support/relationship-fixture.js';
import { expect, test } from '../support/test.js';

test('SAMBAND-12: long relationship names and field labels reflow without horizontal overflow at 320 CSS pixels', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const targetName = 'C'.repeat(180);
    const fieldName = 'F'.repeat(180);
    const label = 'L'.repeat(180);
    const { post, read, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
      {
        targetName,
        objectDescription: 'Syntetiskt provobjekt',
      },
    );
    await post('relationship-type', {
      id: 'long-labels',
      baseRevision: null,
      value: {
        name: 'Långa provuppgifter',
        description: '',
        forwardLabel: label,
        reverseLabel: 'gäller för',
      },
    });
    const before = await read();
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption('long-labels');
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await addFreeProperty(dialog, fieldName, 'text', 'Bevara uppgiften');
    const sentence = dialog.getByRole('region', { name: 'Sambandet före inskickning' });
    await expect(sentence).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(sentence).toContainText(targetName);
    await expect(sentence).toContainText(`l${'L'.repeat(179)}`);
    await expect
      .poll(() => sentence.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    await expect
      .poll(() =>
        dialog
          .locator('.household-read-body')
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      )
      .toBe(true);
    await expect(freeProperty(dialog, fieldName).getByLabel('Värde', { exact: true })).toHaveValue(
      'Bevara uppgiften',
    );
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('SAMBAND-13: staging cancel and explicit outcome checks retain meaningful focus without stealing later reading focus', async ({
  page,
}) => {
  const installation = await createInstallation();
  let releaseCheck = () => {};
  try {
    const { path, read, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
      {
        objectDescription: 'Syntetiskt provobjekt',
      },
    );
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    const heading = dialog.getByRole('heading', { name: 'Samband för Alex', exact: true });
    await expect(
      dialog.getByText('Ändringar läggs i ditt utkast. Kartan sparas separat.', { exact: true }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      dialog.getByRole('status').filter({ hasText: /Sambandet lades|Föreslagen borttagning/ }),
    ).toContainText('Sambandet lades i ditt utkast');
    await expect(heading).toBeFocused();
    let state = await read();
    expect(state.relationships).toEqual([]);
    expect(state.draft.relationships).toHaveLength(1);
    expect(state.draft.relationships?.[0].after).toMatchObject({
      sourceId: 'alex',
      targetId: 'bicycle',
    });
    const completed = state.draft;
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sök det andra objektet', { exact: true }).fill('cykel');
    await dialog.getByRole('button', { name: 'Avbryt redigeringen', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true })
      .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
      .click();
    await expect(dialog.getByLabel('Sambandstyp', { exact: true })).toHaveCount(0);
    await expect(heading).toBeFocused();
    expect((await read()).draft).toEqual(completed);

    await page.route(`${path}/relationship-form`, async (route) => {
      await route.fetch();
      await route.abort();
    });
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await dialog.getByLabel('Sambandets status', { exact: true }).selectOption('ended');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    const check = dialog.getByRole('button', {
      name: 'Kontrollera om ändringen lades i utkastet',
      exact: true,
    });
    await expect(check).toBeVisible();
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(dialog.getByLabel('Sambandstyp', { exact: true })).toHaveCount(0);
    await expect(heading).toBeFocused();
    expect((await read()).draft.relationships?.[0].after?.lifecycle).toBe('ended');

    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await dialog.getByLabel('Sambandets status', { exact: true }).selectOption('active');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(check).toBeVisible();
    let checkArrived = () => {};
    const arrived = new Promise<void>((resolve) => {
      checkArrived = resolve;
    });
    const delivery = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    await page.route(`${path}/relationship-form/*`, async (route) => {
      const response = await route.fetch();
      checkArrived();
      await delivery;
      await route.fulfill({ response });
    });
    await check.click();
    await arrived;
    await dialog.getByRole('button', { name: 'Blå cykeln', exact: true }).click();
    const later = page.getByRole('dialog', { name: 'Uppgifter för Blå cykeln', exact: true });
    await expect(
      later.getByText('Sparade uppgifter och ditt utkast', { exact: true }),
    ).toBeVisible();
    const laterHeading = later.getByRole('heading', {
      name: 'Uppgifter för Blå cykeln',
      exact: true,
    });
    await expect(laterHeading).toBeFocused();
    releaseCheck();
    await expect(
      later.getByRole('status').filter({ hasText: /Sambandet lades|Föreslagen borttagning/ }),
    ).toContainText('Sambandet lades i ditt utkast');
    await expect(laterHeading).toBeFocused();
    state = await read();
    expect(state.relationships).toEqual([]);
    expect(state.draft.relationships).toHaveLength(1);
    expect(state.draft.relationships?.[0].after?.lifecycle).toBe('active');
    await later.getByRole('button', { name: 'Tillbaka', exact: true }).click();
    await expect(heading).toBeFocused();
    await expect(dialog.getByLabel('Sambandstyp', { exact: true })).toHaveCount(0);
  } finally {
    releaseCheck();
    await installation.close();
  }
});
