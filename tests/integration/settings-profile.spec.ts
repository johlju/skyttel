import {
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openProfile,
  openSettings,
  openTable,
  signIn,
} from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';
import { verifyObjectDepartureAndDiscard } from '../support/object-form-departure.js';
import { openProperties, setProperty } from '../support/property-controls.js';
import { createPreparedContext, expect, test } from '../support/test.js';

for (const width of [1280, 390, 320]) {
  const caseId = width === 1280 ? 'INST-01' : width === 390 ? 'INST-09' : 'INST-10';
  test(`${caseId}: full-page settings protect native form input and retain draft feedback at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      await createHousehold(page.request, installation.origin);
      await page.goto(installation.origin);
      await openTable(page);
      await openNewObject(page);
      const name = page.getByLabel('Namn', { exact: true });
      await name.fill('Oskickad cykel');
      await name.focus();
      await verifyObjectDepartureAndDiscard(page, { Namn: 'Oskickad cykel' });
      await openSettings(page);
      await expect(
        page.getByRole('heading', { name: 'Inställningar', level: 1, exact: true }),
      ).toBeFocused();
      await expect(page).toHaveURL(/\/settings$/);
      await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).not.toBeVisible();
      await expect(name).toHaveCount(0);
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
      await openNewObject(page);
      await expect(name).toHaveValue('');
      await page.keyboard.press('Escape');
      await openSettings(page);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect(page).toHaveURL(/\/households\/[^/]+$/);
      await openNewObject(page);
      await expect(name).toHaveValue('');
      await name.fill('Oskickad cykel');
      await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await openSettings(page);
      const feedback = page.locator('.household-work-background .workspace-feedback');
      const status = feedback.getByRole('status');
      await expect(status).toHaveText('Ändringen finns i ditt utkast. Kartan sparas separat.');
      const fragments = await status.evaluate((element) => {
        const close = element.parentElement?.querySelector('button')?.getBoundingClientRect();
        if (!close) throw new Error('Expected the visible status close control');
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const lines: boolean[] = [];
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          for (const box of range.getClientRects())
            if (box.width && box.height)
              lines.push(
                box.right <= close.left ||
                  box.left >= close.right ||
                  box.bottom <= close.top ||
                  box.top >= close.bottom,
              );
        }
        return lines;
      });
      expect(fragments.length).toBeGreaterThan(0);
      expect(fragments.every(Boolean)).toBe(true);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      const draft = await openDraftReview(page);
      await expect(page).toHaveURL(/\/households\/[^/]+$/);
      await expect(draft).toContainText('Oskickad cykel');
      await draft
        .getByRole('button', { name: 'Visa förslaget: Oskickad cykel', exact: true })
        .click();
      const proposal = page.getByRole('dialog', { name: 'Oskickad cykel', exact: true });
      await expect(proposal).toContainText('Oskickad cykel');
      await expect(proposal).toContainText('Person');
      await expect(proposal.locator('dt').filter({ hasText: /^Beskrivning$/ })).toHaveCount(0);
    } finally {
      await installation.close();
    }
  });
}

for (const role of ['administrator', 'member'] as const) {
  const caseId = role === 'administrator' ? 'INST-02' : 'INST-08';
  test(`${caseId}: type settings retain unsent definitions and save with the same map draft as ${role}`, async ({
    page,
    browser,
  }) => {
    const installation = await createInstallation();
    const administrator = await createPreparedContext(browser);
    try {
      const owner = role === 'administrator' ? page.request : administrator.request;
      await signIn(owner, installation.origin);
      const { household } = await (await createHousehold(owner, installation.origin)).json();
      if (role === 'member') {
        installation.setIdentity(robin);
        await signIn(page.request, installation.origin);
        const { user } = await (
          await page.request.get(`${installation.origin}/api/bootstrap`)
        ).json();
        const headers = { origin: installation.origin };
        const { code } = await (
          await owner.post(`${installation.origin}/api/households/${household.id}/invitations`, {
            headers,
            data: { userId: user.id },
          })
        ).json();
        expect(
          (
            await page.request.post(`${installation.origin}/api/invitations/accept`, {
              headers,
              data: { code },
            })
          ).status(),
        ).toBe(200);
      }
      await page.goto(installation.origin);
      await openTable(page);
      await openNewObject(page);
      await page.getByLabel('Namn', { exact: true }).fill('Cykel i samma utkast');
      await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await page
        .getByRole('region', { name: 'Hushållets tabell', exact: true })
        .getByRole('button', { name: 'Cykel i samma utkast', exact: true })
        .click();
      await openSettings(page);
      await page.getByRole('link', { name: 'Typer', exact: true }).click();
      await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
      await page.getByLabel('Typens namn', { exact: true }).fill('Oskickad typ');
      await page.getByLabel('Typens beskrivning').fill('Behåll även definitionens text');
      await page.getByRole('link', { name: 'Översikt', exact: true }).click();
      await page.getByRole('link', { name: 'Typer', exact: true }).click();
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
      await openTable(page);
      const draft = await openDraftReview(page);
      await expect(draft).toContainText('Oskickad typ');
      await expect(draft).toContainText('Cykel i samma utkast');
      await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      await expect(page.getByRole('status', { name: 'Sparbekräftelse' })).toContainText(
        'Utkastet är sparat',
      );
      await page.reload();
      await openSettings(page);
      await page.getByRole('link', { name: 'Typer', exact: true }).click();
      await page.getByText('Objekttyper', { exact: true }).click();
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
      await administrator.close();
      await installation.close();
    }
  });
}

test('INST-03: the separate profile protects native form input and groups personal entries', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Profilens cykel');
    await setProperty(page, 'Beskrivning', 'Fortsätt här');
    await verifyObjectDepartureAndDiscard(page, {
      Namn: 'Profilens cykel',
      Beskrivning: 'Fortsätt här',
    });
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
    const fresh = await openNewObject(page);
    await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('');
    await openProperties(fresh);
    await expect(fresh.locator('.property-editor-row')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await openProfile(page);
    await profile.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Inloggningssätt', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Din profil', exact: true }).click();
    await expect(profile.getByRole('heading', { name: 'Din profil', exact: true })).toBeFocused();
    await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Hushållets tabell', exact: true })
        .getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeFocused();
    await openProfile(page);
    await profile.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await expect(
      page
        .getByRole('region', { name: 'Hushållets tabell', exact: true })
        .getByRole('heading', { name: 'Hushållet Linden', exact: true }),
    ).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Nytt objekt', exact: true })).not.toBeVisible();
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
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Cykeln');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await openMap(page);
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
      await expect(page.getByRole('dialog', { name: 'Nytt objekt', exact: true })).toHaveCount(0);
      await expect(
        page.getByRole('region', { name: 'Hushållets tabell', exact: true }),
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
    await openTable(page);
    await openNewObject(page);
    await page.getByLabel('Namn', { exact: true }).fill('Kvar bakom profilen');
    await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
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
    await expect(
      page.getByRole('button', { name: 'Kvar bakom profilen', exact: true }),
    ).toBeVisible();
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
      for (const [destination, label] of [
        ['Koppla historiskt innehåll', 'Hämta aktuella innehållskopplingar'],
        ['Administrera tillgång', 'Skapa inbjudan'],
      ]) {
        await page
          .getByRole('navigation', { name: 'Inställningarnas sidor' })
          .getByRole('link', { name: destination, exact: true })
          .click();
        await expect(page.getByRole('heading', { name: destination, exact: true })).toBeFocused();
        if (destination === 'Administrera tillgång')
          await page
            .getByRole('button', { name: 'Jag har personens användar-ID', exact: true })
            .click();
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
  const caseId = width === 390 ? 'INST-07' : 'INST-11';
  test(`${caseId}: reverse keyboard navigation keeps profile tools reachable at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      await createHousehold(page.request, installation.origin);
      await page.goto(installation.origin);
      await openTable(page);
      await openNewObject(page);
      await page.getByLabel('Namn', { exact: true }).fill('Behåll mobiltexten');
      await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await openProfile(page);
      const profile = page.getByRole('region', { name: 'Din profil', exact: true });
      await expect(profile.getByRole('heading', { name: 'Din profil', exact: true })).toBeFocused();
      const expansion = page.getByRole('button', { name: 'Dölj verktygens namn', exact: true });
      const coveredTool = expansion;
      const covered = await coveredTool.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return document
          .querySelector('.workspace-utility')
          ?.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      });
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(expansion).toBeFocused();
      await expect(coveredTool).toBeFocused();
      if (covered) await expect(profile).not.toBeVisible();
      expect(
        await coveredTool.evaluate((element) => {
          const box = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          );
        }),
      ).toBe(true);
      await expect(expansion).toBeFocused();
      await expansion.press('Enter');
      if (width === 390) {
        const row = page.getByRole('button', { name: 'Behåll mobiltexten', exact: true });
        for (
          let tabs = 0;
          tabs < 20 && !(await row.evaluate((element) => element === document.activeElement));
          tabs++
        )
          await page.keyboard.press('Tab');
        await expect(row).toBeFocused();
        await expect(profile).not.toBeVisible();
      }
      await expect(
        page.getByRole('button', { name: 'Behåll mobiltexten', exact: true }),
      ).toBeVisible();
    } finally {
      await installation.close();
    }
  });
}
