import type { Locator } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openNewObject,
  openSettings,
  openTable,
  signIn,
} from '../support/client.js';
import {
  openObjectRelationships,
  readDraftProposal,
  readTableObject,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { stageRelationshipAndClose } from '../support/relationship-dialog.js';
import { expect, test } from '../support/test.js';

async function expectSolarObject(details: Locator, name: string, table = false) {
  const description = table
    ? details.locator('.household-table-description')
    : details
        .locator('dt')
        .filter({ hasText: /^Beskrivning$/ })
        .locator('..');
  await expect(description).toContainText(
    name === 'Batteriet' ? 'Ej uppgivet' : 'Beskrivning till den nya typen',
  );
  for (const [label, value] of [
    ['Namn', name],
    ['Typ', 'Solutrustning'],
    ['Identitet', name === 'Batteriet' ? 'Ospecificerat objekt' : 'Identifierat objekt'],
    ['Placering', name === 'Batteriet' ? 'Ej uppgivet' : 'Södertak'],
  ]) {
    await expect(
      details
        .locator('dt')
        .filter({ hasText: new RegExp(`^${label}$`) })
        .locator('..'),
    ).toContainText(value);
  }
}

for (const width of [1280, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    const caseId =
      width === 1280 && theme === 'light'
        ? 'KARTA-09'
        : `KARTA-${31 + [1280, 390, 320].indexOf(width) * 2 + (theme === 'dark' ? 1 : 0) - 1}`;
    test(`${caseId}: complete forms use new draft types and objects in one durable relationship save at ${width}px in ${theme}`, async ({
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
        await openTable(page);
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
        await openNewObject(page);
        const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
        await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        await expect(form.getByRole('alert', { name: 'Formuläret innehåller fel' })).toBeFocused();
        await form.getByRole('link', { name: /^Namn:/ }).click();
        await expect(form.getByLabel('Namn', { exact: true })).toBeFocused();
        expect((await read()).draft.changes).toEqual([]);
        await form.getByLabel('Namn', { exact: true }).fill('Paneler på taket');
        await form
          .getByLabel('Beskrivning', { exact: true })
          .fill('Beskrivning till den nya typen');
        await form
          .getByLabel('Objekttyp', { exact: true })
          .selectOption({ label: 'Solutrustning' });
        await expect(form.getByLabel('Identitet')).toHaveValue('identified');
        await form.getByRole('button', { name: 'Uppgifter', exact: true }).click();
        const section = form;
        await expect(section.getByLabel('Placering', { exact: true })).toHaveValue('');
        await expect(section.getByLabel('Reserv', { exact: true })).toHaveValue('');
        await section.getByLabel('Placering', { exact: true }).fill('Södertak');
        await section.getByLabel('Reserv', { exact: true }).selectOption('false');
        await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        await openNewObject(page);
        await form.getByLabel('Namn', { exact: true }).fill('Batteriet');
        await form
          .getByLabel('Objekttyp', { exact: true })
          .selectOption({ label: 'Solutrustning' });
        await form.getByLabel('Identitet').selectOption('unspecified');
        await form.getByRole('button', { name: 'Uppgifter', exact: true }).click();
        await expect(section.getByLabel('Reserv', { exact: true })).toHaveValue('');
        await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        await openSettings(page);
        if (width <= 800) await navigation.getByText('Välj inställning', { exact: true }).click();
        await navigation.getByRole('link', { name: 'Typer och egna fält', exact: true }).click();
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
        await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
        await openObjectRelationships(page, 'Paneler på taket');
        await page.getByRole('button', { name: 'Nytt samband', exact: true }).click();
        const relationship = page.getByRole('group', { name: 'Sambandets detaljer', exact: true });
        await relationship.getByLabel('Från objekt').selectOption({
          label: 'Paneler på taket · Solutrustning · Beskrivning till den nya typen',
        });
        await relationship
          .getByLabel('Sambandstyp', { exact: true })
          .selectOption({ label: 'Komplettering' });
        await relationship
          .getByLabel('Uppgiftens säkerhet', { exact: true })
          .selectOption('uncertain');
        await relationship
          .getByLabel('Till objekt')
          .selectOption({ label: 'Batteriet · Solutrustning · Ingen beskrivning' });
        await stageRelationshipAndClose(page);
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
          description: 'Beskrivning till den nya typen',
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
        const beforeRestart = await openDraftReview(page);
        await expect(beforeRestart).toContainText('Solutrustning');
        await expect(beforeRestart).toContainText('Komplettering');
        for (const [name, expected] of [
          ['Paneler på taket', 'Nej'],
          ['Batteriet', 'Ej uppgivet'],
        ]) {
          const proposal = await readDraftProposal(page, name);
          await expectSolarObject(proposal, name);
          await expect(
            proposal
              .locator('dt')
              .filter({ hasText: /^Reserv$/ })
              .locator('..'),
          ).toContainText(expected);
          await closeSupportDialog(page, name);
        }
        await closeTextView(page);
        await installation.restart();
        await page.reload();
        await openTable(page);
        const draft = await openDraftReview(page);
        await expect(draft).toContainText('Solutrustning');
        await expect(draft).toContainText('Paneler på taket');
        const proposedPanels = await readDraftProposal(page, 'Paneler på taket');
        await expectSolarObject(proposedPanels, 'Paneler på taket');
        await expect(
          proposedPanels
            .locator('dt')
            .filter({ hasText: /^Reserv$/ })
            .locator('..'),
        ).toContainText('Nej');
        await closeSupportDialog(page, 'Paneler på taket');
        const proposedBattery = await readDraftProposal(page, 'Batteriet');
        await expectSolarObject(proposedBattery, 'Batteriet');
        await expect(
          proposedBattery
            .locator('dt')
            .filter({ hasText: /^Reserv$/ })
            .locator('..'),
        ).toContainText('Ej uppgivet');
        await closeSupportDialog(page, 'Batteriet');
        expect((await read()).draft).toEqual(proposed.draft);
        const response = page.waitForResponse(
          (value) => value.url() === `${path}/save` && value.request().method() === 'POST',
        );
        await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
        const savedResponse = await response;
        expect(savedResponse.status()).toBe(200);
        const { receipt }: { receipt: SaveReceipt } = await savedResponse.json();
        await expect(
          page.getByRole('dialog', { name: 'Spara utkastet', exact: true }),
        ).not.toBeVisible();
        await expect(
          page.getByRole('status', { name: 'Sparbekräftelse', exact: true }),
        ).toContainText('Utkastet är sparat');
        await closeTextView(page);
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
        await openTable(page);
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
        await expect(await openObjectRelationships(page, 'Paneler på taket')).toContainText(
          'Paneler på taket → kompletteras av → Batteriet (Osäkert uppgivet)',
        );
        await closeSupportDialog(page, 'Samband för Paneler på taket');
        const completePanels = await readTableObject(page, 'Paneler på taket');
        await expectSolarObject(completePanels, 'Paneler på taket', true);
        await expect(
          completePanels
            .locator('dt')
            .filter({ hasText: /^Reserv$/ })
            .locator('..'),
        ).toContainText('Nej');
        await expect(
          completePanels
            .locator('dt')
            .filter({ hasText: /^Placering$/ })
            .locator('..'),
        ).toContainText('Södertak');
        const completeBattery = await readTableObject(page, 'Batteriet');
        await expectSolarObject(completeBattery, 'Batteriet', true);
        await expect(completeBattery).toContainText('Ospecificerat objekt');
        await expect(
          completeBattery
            .locator('dt')
            .filter({ hasText: /^Reserv$/ })
            .locator('..'),
        ).toContainText('Ej uppgivet');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      } finally {
        await installation.close();
      }
    });
  }
}
