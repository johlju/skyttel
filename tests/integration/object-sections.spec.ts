import { expect, test } from '@playwright/test';
import { createHousehold, openSettings, openWorkspace, signIn } from '../support/client.js';
import { createInstallation, robin } from '../support/installation.js';

test('TYP-08: sections move and hide fields in the shared draft without losing values after restart', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    await page.getByLabel('Typens namn').fill('Solcellsanläggning');
    await page.getByLabel('Avsnitt 1', { exact: true }).fill('Uppgifter');
    await page.getByRole('button', { name: 'Lägg till avsnitt', exact: true }).click();
    await page.getByLabel('Avsnitt 2', { exact: true }).fill('Service');
    await page.getByRole('button', { name: 'Flytta avsnittet Service upp', exact: true }).click();
    await expect(page.getByLabel('Avsnitt 1', { exact: true })).toHaveValue('Service');
    for (const [name, kind] of [
      ['Leverantör', 'text'],
      ['Effekt', 'number'],
      ['Datum', 'date'],
      ['Batteri', 'boolean'],
      ['Reserv', 'boolean'],
    ]) {
      await page.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
      const field = page.getByRole('group', { name: /^Eget fält/ }).last();
      await field.getByLabel('Fältets namn').fill(name);
      await field.getByLabel('Värdeslag', { exact: true }).selectOption(kind);
      await field.getByLabel('Visa i avsnitt').selectOption({ label: 'Uppgifter' });
    }
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn').fill('Paneler');
    await page
      .getByLabel('Objekttyp', { exact: true })
      .selectOption({ label: 'Solcellsanläggning' });
    await page.getByLabel('Leverantör', { exact: true }).fill('Exempelsol');
    await page.getByLabel('Effekt', { exact: true }).fill('0');
    await page.getByLabel('Datum', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Batteri', { exact: true }).selectOption('false');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByText('Objekttyper och egna fält', { exact: true }).click();
    await page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning', exact: true }).click();
    await page.getByRole('button', { name: 'Dölj Effekt, behåll värden', exact: true }).click();
    await page
      .getByRole('group', { name: 'Eget fält 1', exact: true })
      .getByLabel('Visa i avsnitt')
      .selectOption({ label: 'Service' });
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    const draft = await (await page.request.get(path)).json();
    expect(draft.objects).toEqual([]);
    expect(draft.draft.objectTypes).toHaveLength(1);
    const originalValues = draft.draft.changes[0].after.customValues;
    const originalFields = draft.draft.objectTypes[0].after.fields;
    expect(Object.values(originalValues)).toEqual(['Exempelsol', 0, '2026-09-01', false]);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat:');
    await installation.restart();
    await page.reload();
    await openWorkspace(page);
    await page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Uppgifter för Paneler', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Effekt', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Batteri', { exact: true })).toHaveValue('false');
    await expect(page.getByLabel('Reserv', { exact: true })).toHaveValue('');
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await openSettings(page);
    await page.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
    await page.getByText('Objekttyper och egna fält', { exact: true }).click();
    await page.getByRole('button', { name: 'Ändra typ: Solcellsanläggning', exact: true }).click();
    await page
      .getByRole('group', { name: 'Eget fält 2', exact: true })
      .getByLabel('Visa i avsnitt')
      .selectOption({ label: 'Service' });
    await page.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openWorkspace(page);
    await page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Uppgifter för Paneler', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(page.getByLabel('Effekt', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('Leverantör', { exact: true })).toHaveValue('Exempelsol');
    await expect(page.getByLabel('Datum', { exact: true })).toHaveValue('2026-09-01');
    const current = await (await page.request.get(path)).json();
    expect(current.objects[0].customValues).toEqual(originalValues);
    expect(
      current.draft.objectTypes[0].after.fields.map((field: { id: string }) => field.id),
    ).toEqual(originalFields.map((field: { id: string }) => field.id));
  } finally {
    await installation.close();
  }
});

for (const width of [1280, 390, 320]) {
  test(`TYP-09: ordinary members retain prefilled section work and keyboard controls at ${width}px`, async ({
    page,
    browser,
  }) => {
    const installation = await createInstallation();
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const initial = await (await page.request.get(path)).json();
      const type = initial.types.find((type: { name: string }) => type.name === 'Person');
      const headers = { origin: installation.origin };
      await page.request.post(`${path}/object-type`, {
        headers,
        data: {
          version: 0,
          id: type.id,
          baseRevision: type.revision,
          value: {
            name: 'Person',
            description: '',
            fields: [
              { id: 'note', name: 'Anteckning', description: 'Frivillig text', kind: 'text' },
            ],
          },
        },
      });
      await page.request.post(`${path}/save`, {
        headers,
        data: { version: 1, operationId: 'legacy' },
      });
      installation.setIdentity(robin);
      await signIn(context.request, installation.origin);
      const { user } = await (
        await context.request.get(`${installation.origin}/api/bootstrap`)
      ).json();
      const { code } = await (
        await page.request.post(`${path.replace('/map', '')}/invitations`, {
          headers,
          data: { userId: user.id },
        })
      ).json();
      await context.request.post(`${installation.origin}/api/invitations/accept`, {
        headers,
        data: { code },
      });
      const member = await context.newPage();
      await member.goto(installation.origin);
      const settings = async () => {
        await openSettings(member);
        const nav = member.getByRole('navigation', { name: 'Inställningarnas sidor' });
        if (width <= 800) await nav.getByText('Välj inställning', { exact: true }).click();
        await nav.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
      };
      await settings();
      await member.getByText('Objekttyper och egna fält', { exact: true }).click();
      await member.getByRole('button', { name: 'Ändra typ: Person', exact: true }).click();
      await expect(member.getByLabel('Avsnitt 1', { exact: true })).toHaveValue('Egna fält');
      await expect(member.getByLabel('Visa i avsnitt')).toHaveValue('custom-fields');
      await member.getByLabel('Avsnitt 1', { exact: true }).fill('Personuppgifter');
      await member.getByRole('button', { name: 'Lägg till avsnitt', exact: true }).focus();
      await member.keyboard.press('Enter');
      await expect(member.getByLabel('Avsnitt 2', { exact: true })).toBeFocused();
      await member.keyboard.type('Kontakt');
      await member
        .getByRole('button', { name: 'Flytta avsnittet Kontakt upp', exact: true })
        .focus();
      await member.keyboard.press('Enter');
      await expect(member.getByLabel('Avsnitt 1', { exact: true })).toBeFocused();
      await expect(member.getByLabel('Avsnitt 1', { exact: true })).toHaveValue('Kontakt');
      await member.getByLabel('Visa i avsnitt').selectOption({ label: 'Kontakt' });
      await member.getByLabel('Fältets beskrivning').fill('Bevara även oskickad beskrivning');
      await expect(
        member.getByRole('button', { name: 'Ta bort det tomma avsnittet Kontakt', exact: true }),
      ).toBeDisabled();
      await member.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await settings();
      await expect(member.getByLabel('Avsnitt 1', { exact: true })).toHaveValue('Kontakt');
      await expect(member.getByLabel('Fältets beskrivning')).toHaveValue(
        'Bevara även oskickad beskrivning',
      );
      await member
        .getByRole('button', { name: 'Dölj Anteckning, behåll värden', exact: true })
        .click();
      await expect(member.getByLabel('Visa i avsnitt')).toBeFocused();
      await member
        .getByRole('button', { name: 'Ta bort det tomma avsnittet Personuppgifter', exact: true })
        .click();
      await expect(
        member.getByRole('button', { name: 'Lägg till avsnitt', exact: true }),
      ).toBeFocused();
      await member.getByRole('button', { name: 'Lägg till avsnitt', exact: true }).click();
      await member.getByLabel('Avsnitt 2', { exact: true }).fill('   ');
      await member.locator('.type-section-editor > summary').click();
      await member.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
      await expect(member.getByLabel('Avsnitt 2', { exact: true })).toBeFocused();
      await member.getByLabel('Avsnitt 2', { exact: true }).fill('Tillfälligt');
      await member
        .getByRole('button', { name: 'Ta bort det tomma avsnittet Tillfälligt', exact: true })
        .click();
      for (const theme of ['light', 'dark']) {
        await member.getByRole('button', { name: /^Tema:/ }).click();
        await member
          .getByRole('radio', { name: theme === 'light' ? 'Ljust' : 'Mörkt', exact: true })
          .click();
        await member.keyboard.press('Escape');
        await expect(member.locator('.app-shell.has-settings')).toHaveAttribute(
          'data-theme',
          theme,
        );
        await member.screenshot({
          path: test.info().outputPath(`sections-${width}-${theme}.png`),
          fullPage: true,
        });
        expect(
          await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        for (const button of await member.locator('.object-type-editor button:visible').all()) {
          const box = await button.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
        }
      }
      await member.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
      await expect(member.getByRole('status')).toContainText(
        'Förslaget finns i ditt privata utkast',
      );
      const own = await (await context.request.get(path)).json();
      expect(own.draft.objectTypes[0].after).toMatchObject({
        sections: [{ name: 'Kontakt' }],
        fields: [{ id: 'note', sectionId: '', description: 'Bevara även oskickad beskrivning' }],
      });
      expect((await (await page.request.get(path)).json()).draft.objectTypes ?? []).toEqual([]);
      expect(
        (await (await page.request.get(path)).json()).types.find(
          (item: { id: string }) => item.id === type.id,
        ),
      ).not.toHaveProperty('sections');
    } finally {
      await context.close();
      await installation.close();
    }
  });
}
