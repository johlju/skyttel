import { expect, test } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, openSettings, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

for (const width of [1280, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`KARTA-09: unsent creation uses new draft types and objects in one durable relationship save at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      const installation = await createInstallation();
      try {
        await signIn(page.request, installation.origin);
        const { household } = await (
          await createHousehold(page.request, installation.origin)
        ).json();
        const path = `${installation.origin}/api/households/${household.id}/map`;
        const read = async (): Promise<MapState> => (await page.request.get(path)).json();
        const initial = await read();
        await page.goto(installation.origin);
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme);
        await openWorkspace(page);
        await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
        const form = page.getByRole('region', { name: 'Nytt objekt', exact: true });
        await form.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
        await expect(form.getByLabel('Objektets namn')).toBeFocused();
        expect((await read()).draft.changes).toEqual([]);
        await form.getByLabel('Objektets namn').fill('Paneler på taket');
        await form.getByLabel('Beskrivning', { exact: true }).fill('Oskickat före den nya typen');
        await openSettings(page);
        const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
        if (width <= 800) await navigation.getByText('Välj inställning', { exact: true }).click();
        await navigation.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
        await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
        const definition = page.getByRole('group', {
          name: 'Objekttypens definition',
          exact: true,
        });
        await definition.getByLabel('Typens namn').fill('Solutrustning');
        await definition.getByLabel('Typens beskrivning').fill('Hushållets elproduktion');
        await definition.getByLabel('Avsnitt 1', { exact: true }).fill('Uppgifter');
        for (const [name, kind] of [
          ['Placering', 'text'],
          ['Reserv', 'boolean'],
        ]) {
          await definition.getByRole('button', { name: 'Lägg till fält', exact: true }).click();
          const field = definition.getByRole('group', { name: /^Eget fält/ }).last();
          await field.getByLabel('Fältets namn').fill(name);
          await field.getByLabel('Värdeslag').selectOption(kind);
        }
        await definition.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
        await expect(page.getByRole('status')).toContainText(
          'Förslaget finns i ditt privata utkast',
        );
        const typedDraft = await read();
        expect(typedDraft.draft.objectTypes).toHaveLength(1);
        expect(typedDraft.draft.changes).toEqual([]);
        expect(typedDraft.objects).toEqual(initial.objects);
        expect(typedDraft.types).toEqual(initial.types);
        await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
        await expect(
          page.getByRole('region', { name: 'Aktuell status', exact: true }),
        ).toContainText('Oskickad formulärtext finns kvar');
        await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickat före den nya typen',
        );
        await expect(form.getByLabel('Objektets namn')).toHaveValue('Paneler på taket');
        await form
          .getByLabel('Objekttyp', { exact: true })
          .selectOption({ label: 'Solutrustning' });
        await expect(form.getByLabel('Objektets identitet')).toHaveValue('identified');
        const section = form.getByRole('group', { name: 'Uppgifter', exact: true });
        await expect(section.getByLabel('Placering', { exact: true })).toHaveValue('');
        await expect(section.getByLabel('Reserv', { exact: true })).toHaveValue('');
        await section.getByLabel('Placering', { exact: true }).fill('Södertak');
        await section.getByLabel('Reserv', { exact: true }).selectOption('false');
        await form.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
        await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
        await form.getByLabel('Objektets namn').fill('Batteriet');
        await form
          .getByLabel('Objekttyp', { exact: true })
          .selectOption({ label: 'Solutrustning' });
        await form.getByLabel('Objektets identitet').selectOption('unspecified');
        await expect(section.getByLabel('Reserv', { exact: true })).toHaveValue('');
        await form.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
        await page.getByRole('button', { name: 'Ny sambandstyp', exact: true }).click();
        const relationshipType = page.getByRole('group', {
          name: 'Sambandstypens definition',
          exact: true,
        });
        await relationshipType.getByLabel('Sambandstypens namn').fill('Komplettering');
        await relationshipType
          .getByLabel('Sambandstypens beskrivning')
          .fill('Delar som används ihop');
        await relationshipType.getByLabel('Benämning från startobjektet').fill('kompletteras av');
        await relationshipType.getByLabel('Benämning från målobjektet').fill('kompletterar');
        await relationshipType
          .getByRole('button', { name: 'Lägg sambandstypen i mitt utkast' })
          .click();
        await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
        const relationship = page.getByRole('group', { name: 'Sambandets detaljer', exact: true });
        await relationship
          .getByLabel('Från objekt')
          .selectOption({ label: 'Paneler på taket (Solutrustning)' });
        await relationship
          .getByLabel('Sambandstyp', { exact: true })
          .selectOption({ label: 'Komplettering' });
        await relationship
          .getByLabel('Uppgiftens säkerhet', { exact: true })
          .selectOption('uncertain');
        await relationship
          .getByLabel('Till objekt')
          .selectOption({ label: 'Batteriet (Solutrustning)' });
        await relationship.getByRole('button', { name: 'Lägg sambandet i mitt utkast' }).click();
        const proposed = await read();
        expect(proposed.objects).toEqual([]);
        expect(proposed.relationships).toEqual([]);
        expect(proposed.types).toEqual(initial.types);
        expect(proposed.relationshipTypes).toEqual(initial.relationshipTypes);
        expect(proposed.draft.objectTypes).toHaveLength(1);
        expect(proposed.draft.relationshipTypes).toHaveLength(1);
        expect(proposed.draft.changes).toHaveLength(2);
        expect(proposed.draft.relationships).toHaveLength(1);
        const type = proposed.draft.objectTypes?.[0];
        const panels = proposed.draft.changes.find(
          ({ after }) => after?.name === 'Paneler på taket',
        );
        const battery = proposed.draft.changes.find(({ after }) => after?.name === 'Batteriet');
        const edge = proposed.draft.relationships?.[0];
        const customRelationship = proposed.draft.relationshipTypes?.[0];
        const placement = type?.after?.fields?.find(({ name }) => name === 'Placering')?.id ?? '';
        const reserve = type?.after?.fields?.find(({ name }) => name === 'Reserv')?.id ?? '';
        expect(panels?.after).toMatchObject({
          typeId: type?.id,
          name: 'Paneler på taket',
          description: 'Oskickat före den nya typen',
          customValues: { [placement]: 'Södertak', [reserve]: false },
        });
        expect(panels?.after?.identity).toBeUndefined();
        expect(battery?.after).toMatchObject({ typeId: type?.id, identity: 'unspecified' });
        expect(battery?.after?.customValues ?? {}).toEqual({});
        expect(edge?.after).toMatchObject({
          sourceId: panels?.id,
          targetId: battery?.id,
          typeId: customRelationship?.id,
          knowledge: 'uncertain',
        });
        await installation.restart();
        await page.reload();
        await openWorkspace(page);
        const draft = page.getByRole('region', { name: 'Hela mitt utkast', exact: true });
        await expect(draft).toContainText('Solutrustning');
        await expect(draft).toContainText('Paneler på taket');
        await expect(draft).toContainText('Reserv: Nej');
        await expect(draft).toContainText('Reserv: Obesvarat');
        expect((await read()).draft).toEqual(proposed.draft);
        const response = page.waitForResponse(
          (value) => value.url() === `${path}/save` && value.request().method() === 'POST',
        );
        await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
        const savedResponse = await response;
        expect(savedResponse.status()).toBe(200);
        const { receipt }: { receipt: SaveReceipt } = await savedResponse.json();
        await expect(page.getByRole('status')).toContainText('Sparat');
        expect(receipt.objectTypes?.map(({ id }) => id)).toEqual([type?.id]);
        expect(receipt.relationshipTypes?.map(({ id }) => id)).toEqual([customRelationship?.id]);
        expect(receipt.changes.map(({ after }) => after?.id).sort()).toEqual(
          [panels?.id, battery?.id].sort(),
        );
        expect(receipt.relationships?.map(({ id }) => id)).toEqual([edge?.id]);
        expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
          receipt,
        ]);
        await installation.restart();
        await page.reload();
        await openWorkspace(page);
        const saved = await read();
        expect(saved.objects).toHaveLength(2);
        expect(saved.objects.find(({ id }) => id === panels?.id)).toMatchObject({
          ...panels?.after,
        });
        expect(saved.objects.find(({ id }) => id === battery?.id)).toMatchObject({
          ...battery?.after,
        });
        expect(saved.relationships).toEqual([
          expect.objectContaining({ id: edge?.id, ...edge?.after }),
        ]);
        expect(saved.draft.changes).toEqual([]);
        await expect(page.getByRole('list', { name: 'Samband', exact: true })).toContainText(
          'Paneler på taket → kompletteras av → Batteriet (Osäkert uppgivet)',
        );
        await page
          .getByRole('button', { name: 'Uppgifter för Paneler på taket', exact: true })
          .click();
        await expect(
          page.getByRole('region', { name: 'Paneler på taket', exact: true }),
        ).toContainText('Placering: Södertak');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      } finally {
        await installation.close();
      }
    });
  }
}
