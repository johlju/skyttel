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
    await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
    await openProfile(page);
    await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Lista', exact: true })).toBeFocused();
    await expect(page.getByLabel('Beskrivning', { exact: true })).not.toBeVisible();
  } finally {
    await installation.close();
  }
});

test('INST-04: settings and profile restore map and toolbar focus without opening panels', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Cykeln');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
    const object = page.getByRole('button', { name: 'Välj objekt: Cykeln', exact: true });
    const microphone = page.getByRole('button', { name: 'Prata med Skyttel', exact: true });
    for (const target of [object, microphone]) {
      await target.focus();
      await openSettings(page);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect(target).toBeFocused();
      await openProfile(page);
      await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
      await expect(target).toBeFocused();
      await expect(
        page.getByRole('button', { name: 'Nytt objekt', exact: true }),
      ).not.toBeVisible();
    }
  } finally {
    await installation.close();
  }
});

test('INST-05: leaving the compact profile exposes keyboard focus in the retained work', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Kvar bakom profilen');
    await openProfile(page);
    const profile = page.getByRole('region', { name: 'Din profil', exact: true });
    await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(profile).not.toBeVisible();
    expect(
      await page.evaluate(() => {
        const focused = document.activeElement;
        if (!(focused instanceof HTMLElement)) return false;
        const box = focused.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          focused.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
        );
      }),
    ).toBe(true);
    await expect(page.getByLabel('Objektets namn')).toHaveValue('Kvar bakom profilen');
  } finally {
    await installation.close();
  }
});

test('INST-06: settings form buttons retain readable contrast when hovered in both themes', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openSettings(page);
    await page.getByRole('link', { name: 'Administrera tillgång', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Administrera tillgång', exact: true }),
    ).toBeFocused();
    for (const theme of ['Mörkt', 'Ljust']) {
      await page.getByRole('button', { name: /Byt tema/ }).click();
      await page.getByRole('radio', { name: theme, exact: true }).click();
      for (const label of ['Hämta aktuella innehållskopplingar', 'Skapa inbjudan']) {
        const button = page.getByRole('button', { name: label, exact: true });
        await button.hover();
        expect(
          await button.evaluate((element) => {
            const style = getComputedStyle(element);
            const luminance = (color: string) => {
              const channels = (color.match(/\d+/g) ?? [])
                .slice(0, 3)
                .map(Number)
                .map((value) => {
                  const unit = value / 255;
                  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
                });
              return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
            };
            const foreground = luminance(style.color);
            const background = luminance(style.backgroundColor);
            return (
              (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
            );
          }),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  } finally {
    await installation.close();
  }
});

for (const width of [390, 320]) {
  test(`INST-07: reverse keyboard navigation exposes covered profile tools at ${width}px`, async ({
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
      await page.getByLabel('Objektets namn').fill('Behåll mobiltexten');
      await openProfile(page);
      const profile = page.getByRole('region', { name: 'Din profil', exact: true });
      await expect(profile.getByRole('heading', { name: 'Din profil', exact: true })).toBeFocused();
      const expansion = page.getByRole('button', { name: 'Dölj verktygens namn', exact: true });
      const coveredTool = width === 390 ? page.getByRole('button', { name: /^Tema:/ }) : expansion;
      expect(
        await coveredTool.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return document
            .querySelector('.workspace-utility')
            ?.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
        }),
      ).toBe(true);
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(expansion).toBeFocused();
      if (width === 390) await page.keyboard.press('Shift+Tab');
      await expect(coveredTool).toBeFocused();
      await expect(profile).not.toBeVisible();
      expect(
        await coveredTool.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        }),
      ).toBe(true);
      if (width === 390) await page.keyboard.press('Tab');
      await expect(expansion).toBeFocused();
      await expansion.press('Enter');
      await expect(page.getByLabel('Objektets namn')).toHaveValue('Behåll mobiltexten');
    } finally {
      await installation.close();
    }
  });
}
