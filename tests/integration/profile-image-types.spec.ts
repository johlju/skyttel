import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, openWorkspace, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

for (const typeName of [
  'Person',
  'Tjänst',
  'Tjänstekonto',
  'Abonnemang',
  'E-postadress',
  'Bankkonto',
  'Kort',
  'Företag',
  'Förening',
  'Bostad',
  'Garage',
  'Fordon',
  'Avtal',
  'Hyresavtal',
  'Låneavtal',
  'Kreditavtal',
  'Avbetalningsavtal',
  'Försäkringsavtal',
  'Egen bildtyp',
]) {
  test(`BILD-06: ${typeName} shares text, icon and image in one proposal and removes the latest image`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      if (typeName === 'Egen bildtyp') {
        expect(
          (
            await page.request.post(`${path}/object-type`, {
              headers: { origin: installation.origin },
              data: {
                id: 'own-image-type',
                version: 0,
                baseRevision: null,
                value: { name: typeName, description: 'Egen typ med profilbild', fields: [] },
              },
            })
          ).status(),
        ).toBe(200);
      }
      await page.goto(installation.origin);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      const details = page.getByRole('group', { name: 'Objektets detaljer', exact: true });
      const name = `Bild för ${typeName}`;
      const panel = page.getByRole('region', { name, exact: true });
      await details.getByLabel('Objektets namn', { exact: true }).fill(name);
      await details.getByLabel('Objekttyp', { exact: true }).selectOption({ label: typeName });
      await details.getByLabel('Beskrivning', { exact: true }).fill('Text i samma förslag');
      await expect(details.getByLabel('Välj profilbild')).toBeDisabled();
      expect((await read()).draft.changes).toEqual([]);
      await details.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      const edit = async () => {
        await openWorkspace(page);
        await page.getByRole('button', { name: `Uppgifter för ${name}`, exact: true }).click();
        await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
      };
      const save = async (): Promise<SaveReceipt> => {
        await panel
          .getByRole('button', { name: 'Stäng utan att skicka texten', exact: true })
          .click();
        const response = page.waitForResponse(
          (response) => response.url() === `${path}/save` && response.request().method() === 'POST',
        );
        await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
        const saved = await response;
        expect(saved.status()).toBe(200);
        await expect(page.getByRole('status')).toContainText('Sparat');
        return (await saved.json()).receipt;
      };
      await edit();
      const picker = details.getByRole('region', { name: 'Ikon', exact: true });
      await picker.getByRole('searchbox', { name: 'Sök ikon' }).fill('cykel');
      await picker.getByRole('button', { name: 'Välj Cykel', exact: true }).click();
      await expect.poll(async () => (await read()).draft.changes[0].after?.iconId).toBe('bike');
      const imageInput = details.getByLabel('Välj profilbild');
      const source = await sharp({
        create: { width: 600, height: 400, channels: 3, background: '#0088ff' },
      })
        .png()
        .toBuffer();
      await imageInput.setInputFiles({ name: 'bild.png', mimeType: 'image/png', buffer: source });
      await expect(details.getByAltText(`Profilbild för ${name}`)).toBeVisible();
      await expect(imageInput).toBeEnabled();
      const proposed = await read();
      expect(proposed.objects).toEqual([]);
      expect(proposed.draft.changes).toHaveLength(1);
      const first = proposed.draft.changes[0];
      expect(first.after).toMatchObject({
        name,
        description: 'Text i samma förslag',
        iconId: 'bike',
        profileImageId: expect.any(String),
      });
      expect(first.type.name).toBe(typeName);
      const initialReceipt = await save();
      expect(initialReceipt.changes).toHaveLength(1);
      expect(initialReceipt.changes[0]).toMatchObject({ before: null, after: first.after });
      const shared = await read();
      expect(shared.objects).toHaveLength(1);
      expect(shared.objects[0]).toMatchObject({ ...first.after });
      expect(shared.draft.changes).toEqual([]);

      await edit();
      await details.getByLabel('Beskrivning', { exact: true }).fill('Ny text före bildbytet');
      await expect(imageInput).toBeDisabled();
      await details.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      await edit();
      await imageInput.setInputFiles({
        name: 'ny.webp',
        mimeType: 'image/webp',
        buffer: await sharp(source).negate().webp().toBuffer(),
      });
      await expect(imageInput).toBeEnabled();
      const replacement = await read();
      expect(replacement.draft.changes).toHaveLength(1);
      const latest = replacement.draft.changes[0].after?.profileImageId;
      expect(latest).toBeTruthy();
      expect(latest).not.toBe(first.after?.profileImageId);
      expect(replacement.objects).toEqual(shared.objects);
      expect(replacement.draft.changes[0].after).toMatchObject({
        name,
        typeId: first.after?.typeId,
        description: 'Ny text före bildbytet',
        iconId: 'bike',
      });
      await imageInput.setInputFiles([]);
      await expect(imageInput).toBeEnabled();
      expect(await read()).toEqual(replacement);
      await imageInput.setInputFiles({
        name: 'fel.png',
        mimeType: 'image/png',
        buffer: Buffer.from('synthetic invalid pixels'),
      });
      await expect(page.getByRole('alert')).toContainText('Bilden kunde inte behandlas');
      expect(await read()).toEqual(replacement);
      await expect(details.getByAltText(`Profilbild för ${name}`)).toHaveAttribute(
        'src',
        new RegExp(`/profile-images/${latest}$`),
      );
      await details.getByRole('button', { name: 'Ta bort profilbild', exact: true }).click();
      await expect(details.getByText('Ingen profilbild', { exact: true })).toBeVisible();
      await expect(details.getByText('Ikon: Cykel', { exact: true })).toBeVisible();
      const removed = await read();
      expect(removed.objects).toEqual(shared.objects);
      expect(removed.draft.changes).toHaveLength(1);
      expect(removed.draft.changes[0].id).toBe(first.id);
      expect(removed.draft.changes[0].after).toMatchObject({
        name,
        typeId: first.after?.typeId,
        description: 'Ny text före bildbytet',
        iconId: 'bike',
      });
      expect(removed.draft.changes[0].after).not.toHaveProperty('profileImageId');
      const removedReceipt = await save();
      expect(removedReceipt.operationId).not.toBe(initialReceipt.operationId);
      expect(removedReceipt.changes).toHaveLength(1);
      expect(removedReceipt.changes[0].before).toMatchObject({
        profileImageId: first.after?.profileImageId,
        iconId: 'bike',
        description: 'Text i samma förslag',
      });
      expect(removedReceipt.changes[0].after).toMatchObject({
        id: first.id,
        name,
        typeId: first.after?.typeId,
        iconId: 'bike',
        description: 'Ny text före bildbytet',
      });
      expect(removedReceipt.changes[0].after).not.toHaveProperty('profileImageId');
      const final = await read();
      expect(final.draft.changes).toEqual([]);
      expect(final.objects).toHaveLength(1);
      expect(final.objects[0]).toEqual(removedReceipt.changes[0].after);
      expect(final.objects[0]).not.toHaveProperty('profileImageId');
      const history = (await (await page.request.get(`${path}/history`)).json()).history;
      expect(history).toEqual([initialReceipt, removedReceipt]);
    } finally {
      await installation.close();
    }
  });
}
