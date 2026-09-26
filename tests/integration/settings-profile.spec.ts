import { expect, test } from '@playwright/test';
import {
  createHousehold,
  openProfile,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { createInstallation } from '../support/installation.js';

for (const width of [1280, 390, 320]) {
  test(`INST-01: full-page settings preserve the active editor and focus at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      await createHousehold(page.request, installation.origin);
      await page.goto(installation.origin);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      const name = page.getByLabel('Objektets namn');
      await name.fill('Oskickad cykel');
      await name.focus();
      await openSettings(page);
      await expect(
        page.getByRole('heading', { name: 'Inställningar', level: 1, exact: true }),
      ).toBeFocused();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).not.toBeVisible();
      await expect(name).not.toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).not.toBeVisible();
      const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
      if (width <= 800) {
        await expect(
          navigation.getByRole('link', { name: 'Översikt', exact: true }),
        ).not.toBeVisible();
        await navigation.getByText('Välj inställning', { exact: true }).click();
      }
      await expect(navigation.getByRole('link', { name: 'Översikt', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect(name).toHaveValue('Oskickad cykel');
      await expect(name).toBeFocused();
    } finally {
      await installation.close();
    }
  });
}

test('INST-02: type settings retain unsent definitions and save with the same map draft', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Cykel i samma utkast');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Cykel i samma utkast', exact: true })
      .click();
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    await page.getByLabel('Typens namn', { exact: true }).fill('Oskickad typ');
    await page.getByLabel('Typens beskrivning').fill('Behåll även definitionens text');
    await page.getByRole('link', { name: 'Översikt', exact: true }).click();
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await expect(page.getByLabel('Typens namn', { exact: true })).toHaveValue('Oskickad typ');
    await expect(page.getByLabel('Typens beskrivning')).toHaveValue(
      'Behåll även definitionens text',
    );
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await expect(page.getByRole('status')).toContainText('Förslaget finns i ditt privata utkast');
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const before = await (await page.request.get(path)).json();
    expect(before.objects).toEqual([]);
    expect(before.draft.changes).toHaveLength(1);
    expect(before.draft.objectTypes).toHaveLength(1);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Cykel i samma utkast', exact: true }),
    ).toBeFocused();
    await openWorkspace(page);
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Oskickad typ',
    );
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Cykel i samma utkast',
    );
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    await page.reload();
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByText('Objekttyper och egna fält', { exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Ändra typ: Oskickad typ', exact: true }),
    ).toBeVisible();
    const after = await (await page.request.get(path)).json();
    expect(after.objects.map((object: { name: string }) => object.name)).toEqual([
      'Cykel i samma utkast',
    ]);
    expect(after.draft.changes).toEqual([]);
    expect(after.draft.objectTypes ?? []).toEqual([]);
  } finally {
    await installation.close();
  }
});

test('INST-03: the separate profile returns to the active field and groups personal entries', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Profilens cykel');
    await page.getByLabel('Beskrivning', { exact: true }).fill('Fortsätt här');
    await openProfile(page);
    const profile = page.getByRole('region', { name: 'Din profil', exact: true });
    await expect(profile.getByRole('heading', { name: 'Din profil', exact: true })).toBeFocused();
    await expect(profile.getByLabel('Ditt Skyttel-användar-ID')).not.toHaveValue('');
    await expect(profile.getByRole('link', { name: 'Inloggningssätt', exact: true })).toBeVisible();
    await expect(
      profile.getByRole('link', { name: 'Assistentanslutningar', exact: true }),
    ).toBeVisible();
    await expect(profile.getByRole('button', { name: 'Logga ut', exact: true })).toBeVisible();
    await expect(profile.getByRole('link', { name: 'Månadskostnad', exact: true })).toHaveCount(0);
    await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(page.getByLabel('Beskrivning', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue('Fortsätt här');
    await openProfile(page);
    await profile.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inloggningssätt', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Din profil', exact: true }).click();
    await expect(profile.getByRole('heading', { name: 'Din profil', exact: true })).toBeFocused();
    await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(page.getByLabel('Beskrivning', { exact: true })).toBeFocused();
  } finally {
    await installation.close();
  }
});
