import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { MapState, ObjectValue } from '../../src/shared/map.js';
import { createHousehold, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

for (const width of [1280, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`SAMMANSLAGNING-04: complete typed values, images, icons and edges survive explicit merge and restart at ${width}px in ${theme}`, async ({
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
        const imagePath = `${installation.origin}/api/households/${household.id}/profile-images`;
        const read = async (): Promise<MapState> => (await page.request.get(path)).json();
        const post = (route: string, data: unknown) =>
          page.request.post(`${path}/${route}`, {
            headers: { origin: installation.origin },
            data,
          });
        const propose = async (route: string, id: string, value: unknown) => {
          expect(
            (
              await post(route, {
                version: (await read()).draft.version,
                id,
                baseRevision: null,
                value,
              })
            ).status(),
          ).toBe(200);
        };
        const save = async (operationId: string) => {
          expect(
            (
              await post('save', {
                version: (await read()).draft.version,
                operationId,
              })
            ).status(),
          ).toBe(200);
        };
        const firstId = 'forsta-objektets-stabila-identitet-som-behover-radbrytas';
        const secondId = 'andra-objektets-stabila-identitet-som-behover-radbrytas';
        await propose('object-type', 'equipment', {
          name: 'Utrustning',
          description: '',
          sections: [],
          builtins: [],
          fields: [
            { id: 'number', name: 'Nummer', description: '', kind: 'number', sectionId: '' },
            { id: 'insured', name: 'Försäkrad', description: '', kind: 'boolean', sectionId: '' },
          ],
        });
        await propose('object-type', 'registration', {
          name: 'Registrering',
          description: '',
          sections: [],
          builtins: [],
          fields: [{ id: 'number', name: 'Nummer', description: '', kind: 'text', sectionId: '' }],
        });
        await propose('relationship-type', 'parking', {
          name: 'Förvaring',
          description: 'Var föremålet finns',
          forwardLabel: 'förvaras i',
          reverseLabel: 'innehåller',
          sections: [],
          fields: [
            { id: 'places', name: 'Platser', description: '', kind: 'number', sectionId: '' },
            { id: 'covered', name: 'Under tak', description: '', kind: 'boolean', sectionId: '' },
          ],
        });
        const financialFacts: ObjectValue['financialFacts'] = {
          debt: { knowledge: 'uncertain', value: '125 000,50', reportedOn: '2026-09-01' },
          creditLimit: { knowledge: 'none', reportedOn: '2026-09-02' },
          usedCredit: { knowledge: 'known', value: '0', reportedOn: '2026-09-03' },
          price: { knowledge: 'unknown' },
        };
        await propose('draft', firstId, {
          typeId: 'equipment',
          name: 'Alex blå cykel',
          description: 'Första beskrivningen',
          identity: 'unspecified',
          lifecycle: 'ended',
          iconId: 'bike',
          customValues: { number: 0, insured: false },
          financialFacts,
        });
        await propose('draft', secondId, {
          typeId: 'registration',
          name: 'Alex blå cykel',
          description: 'Andra beskrivningen',
          iconId: 'music',
          customValues: { number: 'SYNTH-42' },
          financialFacts: {
            debt: { knowledge: 'known', value: '140 000', reportedOn: '2026-08-01' },
          },
        });
        await propose('draft', 'garage', { typeId: 'equipment', name: 'Garaget', description: '' });
        for (const [id, sourceId] of [
          ['first', firstId],
          ['second', secondId],
        ]) {
          await propose('relationship', id, {
            typeId: 'parking',
            sourceId,
            targetId: 'garage',
            knowledge: 'known',
            lifecycle: id === 'second' ? 'ended' : 'active',
            customValues: { places: id === 'second' ? 0 : 2, covered: id === 'first' },
          });
        }
        await save('initial');
        for (const [id, color] of [
          [firstId, '#0088ff'],
          [secondId, '#ff8800'],
        ]) {
          const state = await read();
          const source = await sharp({
            create: { width: 80, height: 80, channels: 3, background: color },
          })
            .png()
            .toBuffer();
          expect(
            (
              await page.request.post(`${imagePath}/${id}`, {
                headers: {
                  origin: installation.origin,
                  'content-type': 'image/png',
                  'x-skyttel-draft-version': String(state.draft.version),
                  'x-skyttel-content-version': String(state.contentVersion),
                  'x-skyttel-object-revision': String(
                    state.objects.find((object) => object.id === id)?.revision,
                  ),
                },
                data: source,
              })
            ).status(),
          ).toBe(200);
        }
        await save('images');
        const original = await read();
        const sourceImage = original.objects.find(
          (object) => object.id === secondId,
        )?.profileImageId;
        expect(sourceImage).toBeTruthy();
        const originalImage = await (await page.request.get(`${imagePath}/${sourceImage}`)).body();
        await page.goto(installation.origin);
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme);
        await openWorkspace(page);
        await page.getByRole('button', { name: 'Slå samman objekt', exact: true }).click();
        const form = page.getByRole('region', { name: 'Sammanslagning', exact: true });
        await form.getByLabel('Objekt som behåller sin identitet').selectOption(firstId);
        await form.getByLabel('Objekt som tas in i det första').selectOption(secondId);
        const first = form.getByRole('article').first();
        const second = form.getByRole('article').nth(1);
        await expect(first).toContainText(`Identitet: ${firstId}`);
        await expect(second).toContainText(`Identitet: ${secondId}`);
        await expect(first).toContainText('Nummer: 0');
        await expect(first).toContainText('Försäkrad: Nej');
        await expect(first).toContainText('125 000,50 (Osäkert uppgivet)');
        await expect(first).toContainText('2026-09-01');
        await expect(first).toContainText('2026-09-02');
        await expect(first).toContainText('2026-09-03');
        await expect(second).toContainText('Nummer: SYNTH-42');
        await expect(first.getByAltText('Profilbild för Alex blå cykel')).toBeVisible();
        await expect(second.getByAltText('Profilbild för Alex blå cykel')).toBeVisible();
        for (const [name, choice] of [
          ['Objekttyp', 'survivor'],
          ['Beskrivning', 'absorbed'],
          ['Status', 'survivor'],
          ['Identitetsstatus', 'survivor'],
          ['Ikon', 'absorbed'],
          ['Profilbild', 'absorbed'],
          ['Senast uppgiven skuld', 'survivor'],
          ['Beviljat kreditutrymme', 'survivor'],
          ['Utnyttjad kredit', 'survivor'],
          ['Pris', 'survivor'],
          ['Utrustning: Nummer', 'survivor'],
          ['Utrustning: Försäkrad', 'survivor'],
          ['Registrering: Nummer', 'absorbed'],
        ])
          await form
            .getByRole('combobox', { name: `Välj ${name}`, exact: true })
            .selectOption(choice);
        await form.getByLabel('Val för samband first').selectOption('remove');
        await form.getByLabel('Val för samband second').selectOption('keep');
        const submit = form.getByRole('button', { name: 'Lägg sammanslagningen i mitt utkast' });
        await expect(submit).toBeDisabled();
        await expect(form.getByRole('alert')).toContainText(
          'Välj egna fält från den valda objekttypen',
        );
        expect((await read()).draft).toEqual(original.draft);
        await form
          .getByRole('combobox', { name: 'Välj Registrering: Nummer', exact: true })
          .selectOption('omit');
        await form.getByLabel('Jag bekräftar att objekten är samma företeelse').check();
        await expect(form).toContainText('Platser: 0');
        await expect(form).toContainText('Under tak: Nej');
        await expect(form).toContainText('Manuellt upphört');
        expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await submit.click();
        const staged = await read();
        expect(staged.objects).toEqual(original.objects);
        expect(staged.relationships).toEqual(original.relationships);
        const copiedImage = staged.draft.changes.find((change) => change.id === firstId)?.after
          ?.profileImageId;
        expect(copiedImage).toBeTruthy();
        expect(copiedImage).not.toBe(sourceImage);
        expect(staged.draft.changes.find((change) => change.id === firstId)?.after).toMatchObject({
          typeId: 'equipment',
          name: 'Alex blå cykel',
          description: 'Andra beskrivningen',
          identity: 'unspecified',
          lifecycle: 'ended',
          iconId: 'music',
          customValues: { number: 0, insured: false },
          financialFacts,
        });
        await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
        await expect(page.getByRole('status')).toContainText('Sparat:');
        await installation.restart();
        await page.reload();
        await openWorkspace(page);
        const saved = await read();
        expect(saved.objects).toHaveLength(2);
        expect(saved.objects.find((object) => object.id === firstId)).toMatchObject({
          typeId: 'equipment',
          name: 'Alex blå cykel',
          description: 'Andra beskrivningen',
          identity: 'unspecified',
          lifecycle: 'ended',
          iconId: 'music',
          profileImageId: copiedImage,
          customValues: { number: 0, insured: false },
          financialFacts,
        });
        expect(saved.objects.find((object) => object.id === firstId)?.customValues).toEqual({
          number: 0,
          insured: false,
        });
        expect(saved.objects.find((object) => object.id === firstId)?.financialFacts).toEqual(
          financialFacts,
        );
        expect(saved.relationships).toEqual([
          expect.objectContaining({
            id: 'second',
            typeId: 'parking',
            sourceId: firstId,
            targetId: 'garage',
            knowledge: 'known',
            lifecycle: 'ended',
            customValues: { places: 0, covered: false },
          }),
        ]);
        expect(await (await page.request.get(`${imagePath}/${copiedImage}`)).body()).toEqual(
          originalImage,
        );
        const { history } = await (await page.request.get(`${path}/history`)).json();
        expect(history).toHaveLength(3);
        const receipt = history.at(-1);
        expect(receipt.changes).toHaveLength(2);
        expect(receipt.relationships).toHaveLength(2);
        expect(
          receipt.changes.find((change: { merge?: unknown }) => change.merge).merge.objects,
        ).toEqual([
          original.objects.find((object) => object.id === firstId),
          original.objects.find((object) => object.id === secondId),
        ]);
        await page.getByRole('button', { name: 'Visa historik', exact: true }).click();
        const group = page
          .getByRole('region', { name: 'Ändringshistorik', exact: true })
          .getByRole('article')
          .filter({ hasText: `Sparande: ${receipt.operationId}` });
        await group.getByText('Visa ändringarna', { exact: true }).click();
        const disclosure = group.getByText('Granskade objekt före sammanslagningen', {
          exact: true,
        });
        await disclosure.click();
        const sources = disclosure.locator('..');
        await expect(sources).toContainText(firstId);
        await expect(sources).toContainText(secondId);
        await expect(sources).toContainText('Nummer: 0');
        await expect(sources).toContainText('Nummer: SYNTH-42');
        await expect(sources).toContainText('Försäkrad: Nej');
        await expect(sources).toContainText('Under tak: Nej');
        await expect(sources).toContainText('125 000,50 (Osäkert uppgivet)');
        await expect(sources).toContainText('2026-09-01');
        await expect(sources.getByAltText('Profilbild för Alex blå cykel')).toHaveCount(2);
        expect(
          await sources.evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      } finally {
        await installation.close();
      }
    });
  }
}
