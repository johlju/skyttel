import { createInstallation } from '../support/installation.js';
import { propertyRow, setProperty } from '../support/property-controls.js';
import { createRelationshipFixture } from '../support/relationship-fixture.js';
import { expect, test } from '../support/test.js';

test('SAMBAND-14: an absent old-version attempt unlocks retained input and requires current-basis review before retry', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    const householdUrl = `${installation.origin}/households/${household.id}`;
    await page.goto(householdUrl);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const opener = page.getByRole('button', { name: 'Samband för Alex', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await setProperty(dialog, 'Uppgiftens säkerhet', 'Osäkert uppgivet');
    let originalSubmission: Record<string, unknown> | undefined;
    await page.route(
      `${path}/relationship-form`,
      async (route) => {
        originalSubmission = route.request().postDataJSON();
        await route.abort('failed');
      },
      { times: 1 },
    );
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    const check = dialog.getByRole('button', {
      name: 'Kontrollera om ändringen lades i utkastet',
      exact: true,
    });
    await expect(check).toBeVisible();

    const other = await page.context().newPage();
    await other.goto(householdUrl);
    await other.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const object = other.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await object.getByLabel('Namn', { exact: true }).fill('Lo');
    await object.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Person' });
    await object.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(object).not.toBeVisible();
    const independent = await read();
    expect(independent.draft.changes.some((change) => change.after?.name === 'Lo')).toBe(true);
    expect(independent.draft.relationships ?? []).toEqual([]);

    await check.click();
    await expect(
      propertyRow(dialog, 'Uppgiftens säkerhet').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Osäkert uppgivet');
    await expect(
      propertyRow(dialog, 'Uppgiftens säkerhet').getByLabel('Värde', { exact: true }),
    ).toBeEnabled();
    await expect(dialog).toContainText('öppna det igen');
    await expect(
      dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }),
    ).toBeDisabled();
    expect(await read()).toEqual(independent);
    const delayed = await page.request.post(`${path}/relationship-form`, {
      headers: { origin: installation.origin },
      data: originalSubmission,
    });
    expect(delayed.status(), await delayed.text()).toBe(409);
    const outcome = await page.request.get(
      `${path}/relationship-form/${originalSubmission?.stagingId}?contentVersion=${independent.contentVersion}`,
    );
    expect((await outcome.json()).outcome).toBeNull();
    expect(await read()).toEqual(independent);

    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(
      propertyRow(dialog, 'Uppgiftens säkerhet').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Osäkert uppgivet');
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(opener).toBeFocused();
    await opener.click();
    await dialog.getByRole('button', { name: 'Nytt samband', exact: true }).click();
    await dialog.getByLabel('Sambandstyp', { exact: true }).selectOption({ label: 'Använder' });
    await dialog.getByLabel('Till objekt', { exact: true }).selectOption('bicycle');
    await setProperty(dialog, 'Uppgiftens säkerhet', 'Osäkert uppgivet');
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(
      dialog.getByRole('status').filter({ hasText: 'Sambandet lades i ditt utkast' }),
    ).toBeVisible();
    const staged = await read();
    expect(staged.draft.changes).toEqual(independent.draft.changes);
    expect(staged.draft.relationships).toHaveLength(1);
    expect(staged.draft.relationships?.[0].after?.properties).toEqual([
      expect.objectContaining({
        label: 'Uppgiftens säkerhet',
        kind: 'text',
        value: 'Osäkert uppgivet',
      }),
    ]);
    expect(staged.relationships).toEqual([]);
    expect(staged.objects).toEqual([]);
    await other.close();
  } finally {
    await installation.close();
  }
});

test('SAMBAND-15: absent stale editing cannot overwrite or remove a later same-owner relationship proposal', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { path, read, post, household } = await createRelationshipFixture(
      page.request,
      installation.origin,
    );
    const initial = await read();
    await post('relationship', {
      id: 'existing',
      baseRevision: null,
      value: {
        typeId: initial.relationshipTypes.find((type) => type.name === 'Använder')?.id,
        sourceId: 'alex',
        targetId: 'bicycle',
      },
    });
    const householdUrl = `${installation.origin}/households/${household.id}`;
    await page.goto(householdUrl);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const opener = page.getByRole('button', { name: 'Samband för Alex', exact: true });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await setProperty(dialog, 'Uppgiftens säkerhet', 'Osäkert uppgivet');
    let originalSubmission: Record<string, unknown> | undefined;
    await page.route(
      `${path}/relationship-form`,
      async (route) => {
        originalSubmission = route.request().postDataJSON();
        await route.abort('failed');
      },
      { times: 1 },
    );
    await dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    const check = dialog.getByRole('button', {
      name: 'Kontrollera om ändringen lades i utkastet',
      exact: true,
    });
    await expect(check).toBeVisible();

    const other = await page.context().newPage();
    await other.goto(householdUrl);
    await other.getByRole('button', { name: 'Tabell', exact: true }).click();
    await other.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
    const laterDialog = other.getByRole('dialog', { name: 'Samband för Alex', exact: true });
    await laterDialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await setProperty(laterDialog, 'Uppgiftens säkerhet', 'Obesvarad fråga');
    await laterDialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }).click();
    await expect(
      laterDialog.getByRole('status').filter({ hasText: 'Sambandet lades i ditt utkast' }),
    ).toBeVisible();
    await laterDialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await other.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const object = other.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await object.getByLabel('Namn', { exact: true }).fill('Lo');
    await object.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Person' });
    await object.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(object).not.toBeVisible();
    const current = await read();
    expect(current.draft.relationships?.[0].after?.properties).toEqual([
      expect.objectContaining({
        label: 'Uppgiftens säkerhet',
        kind: 'text',
        value: 'Obesvarad fråga',
      }),
    ]);
    expect(current.draft.relationships?.[0].after?.targetId).toBe('bicycle');
    expect(current.draft.changes.some((change) => change.after?.name === 'Lo')).toBe(true);
    expect(current.draft.version).toBeGreaterThan(originalSubmission?.version as number);
    const checked = await page.request.get(
      `${path}/relationship-form/${originalSubmission?.stagingId}?contentVersion=${current.contentVersion}`,
    );
    const absent = await checked.json();
    expect(absent.outcome).toBeNull();
    expect(absent.state).toEqual(current);

    await check.click();
    await expect(
      propertyRow(dialog, 'Uppgiftens säkerhet').getByLabel('Värde', { exact: true }),
    ).toBeEnabled();
    await expect(
      propertyRow(dialog, 'Uppgiftens säkerhet').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Osäkert uppgivet');
    await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveValue('bicycle');
    await expect(
      dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Föreslå borttagning', exact: true }),
    ).toBeDisabled();
    expect(await read()).toEqual(current);
    const delayed = await page.request.post(`${path}/relationship-form`, {
      headers: { origin: installation.origin },
      data: originalSubmission,
    });
    expect(delayed.status(), await delayed.text()).toBe(409);
    expect(await read()).toEqual(current);
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await page.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(
      propertyRow(dialog, 'Uppgiftens säkerhet').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Osäkert uppgivet');
    await dialog.getByRole('button', { name: 'Stäng samband', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await opener.click();
    await dialog.getByRole('button', { name: 'Redigera samband', exact: true }).click();
    await expect(
      propertyRow(dialog, 'Uppgiftens säkerhet').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Obesvarad fråga');
    await expect(dialog.getByLabel('Till objekt', { exact: true })).toHaveValue('bicycle');
    await expect(
      dialog.getByRole('button', { name: 'Lägg i utkastet', exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole('button', { name: 'Föreslå borttagning', exact: true }),
    ).toBeEnabled();
    expect(await read()).toEqual(current);
    expect(current.relationships).toEqual([]);
    expect(current.objects).toEqual([]);
    await other.close();
  } finally {
    await installation.close();
  }
});
