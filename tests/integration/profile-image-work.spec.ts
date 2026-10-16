import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, openNewObject, signIn } from '../support/client.js';
import { editTableObject } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

for (const [width, height, lightId, darkId] of [
  [1440, 1000, 'BILD-04', 'BILD-07'],
  [1440, 500, 'BILD-08', 'BILD-09'],
  [320, 1000, 'BILD-10', 'BILD-11'],
  [320, 250, 'BILD-12', 'BILD-13'],
] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    const caseId = colorScheme === 'light' ? lightId : darkId;
    test(`${caseId}: delayed whole-form image rejection retains local values and earlier proposals at ${width}x${height}px ${colorScheme}`, async ({
      page,
    }) => {
      const installation = await createInstallation();
      let releaseResponse = () => {};
      try {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme });
        await signIn(page.request, installation.origin);
        const { household } = await (
          await createHousehold(page.request, installation.origin)
        ).json();
        const path = `${installation.origin}/api/households/${household.id}/map`;
        const read = async (): Promise<MapState> => (await page.request.get(path)).json();
        for (const [id, name] of [
          ['cycle', 'Cykeln'],
          ['garage', 'Garaget'],
        ]) {
          const state = await read();
          const response = await page.request.post(`${path}/draft`, {
            headers: { origin: installation.origin },
            data: {
              id,
              version: state.draft.version,
              contentVersion: state.contentVersion,
              baseRevision: null,
              value: {
                typeId: state.types[0].id,
                name,
                description: `Skickad text om ${name}`,
                iconId: 'bike',
              },
            },
          });
          expect(response.status()).toBe(200);
        }
        await page.goto(installation.origin);
        const form = page.locator('dialog.object-dialog-C');
        const edit = async (name: string) => {
          await editTableObject(page, name);
        };
        const stage = () =>
          form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
        await edit('Garaget');
        await form.getByLabel('Beskrivning', { exact: true }).fill('Separat förslag om Garaget');
        await stage();
        const images: string[] = [];
        for (const background of ['#0088ff', '#33aa44']) {
          await edit('Cykeln');
          await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
          await form.getByLabel('Profilbild', { exact: true }).setInputFiles({
            name: 'bild.png',
            mimeType: 'image/png',
            buffer: await sharp({ create: { width: 600, height: 400, channels: 3, background } })
              .png()
              .toBuffer(),
          });
          await stage();
          await expect(form).not.toBeVisible();
          const image = (await read()).draft.changes.find((change) => change.id === 'cycle')?.after
            ?.profileImageId;
          expect(image).toBeTruthy();
          images.push(image as string);
        }
        expect(images[1]).not.toBe(images[0]);
        const before = await read();
        await edit('Cykeln');
        await form.getByLabel('Beskrivning', { exact: true }).fill('Oskickad bildtext');
        await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
        const file = form.getByLabel('Profilbild', { exact: true });
        await file.setInputFiles({
          name: 'fel.png',
          mimeType: 'image/png',
          buffer: Buffer.from('synthetic invalid pixels'),
        });
        expect(await read()).toEqual(before);
        let responseReady = () => {};
        const ready = new Promise<void>((resolve) => {
          responseReady = resolve;
        });
        const released = new Promise<void>((resolve) => {
          releaseResponse = resolve;
        });
        await page.route('**/map/object-form', async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(400);
          expect(await response.json()).toEqual({ error: 'invalid_image' });
          responseReady();
          await released;
          await route.fulfill({ response });
        });
        await stage();
        await ready;
        await expect(file).toBeDisabled();
        await expect(form.getByRole('button', { name: 'Avbryt', exact: true })).toBeDisabled();
        await page.keyboard.press('Escape');
        await expect(form).toBeVisible();
        const search = page.getByRole('searchbox', { name: 'Sök objekt i tabellen', exact: true });
        await search.evaluate((element) => (element as HTMLElement).focus());
        await expect(search).not.toBeFocused();
        releaseResponse();
        await expect(form.getByRole('alert')).toContainText('Profilbilden');
        await expect(file).toBeEnabled();
        await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
        await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickad bildtext',
        );
        expect(await read()).toEqual(before);
        await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
        const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
        const keep = loss.getByRole('button', { name: 'Fortsätt redigera', exact: true });
        await expect(keep).toBeFocused();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(keep).toBeFocused();
        await keep.hover();
        const appearance = await keep.evaluate((element) => {
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
          const foreground = luminance(style.color),
            background = luminance(style.backgroundColor);
          return {
            contrast:
              (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
            outline: style.outlineStyle,
            outlineWidth: Number.parseFloat(style.outlineWidth),
          };
        });
        expect(appearance.outline).not.toBe('none');
        expect(appearance.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(appearance.contrast, JSON.stringify(appearance)).toBeGreaterThanOrEqual(4.5);
        await page.keyboard.press('Escape');
        await expect(form.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
        await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickad bildtext',
        );
        await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
        await loss
          .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
          .click();
        await expect(form).not.toBeVisible();
        await edit('Cykeln');
        await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Skickad text om Cykeln',
        );
        await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
        await expect(form.getByAltText('Profilbild för Cykeln')).toHaveAttribute(
          'src',
          new RegExp(`/profile-images/${images[1]}$`),
        );
        await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
        await edit('Garaget');
        await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Separat förslag om Garaget',
        );
        expect(await read()).toEqual(before);
        expect(before.objects).toEqual([]);
        expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
      } finally {
        releaseResponse();
        await installation.close();
      }
    });
  }
}

for (const [width, caseId] of [
  [1440, 'BILD-05'],
  [390, 'BILD-14'],
  [320, 'BILD-15'],
] as const) {
  test(`${caseId}: pending image staging blocks navigation and stale rejection preserves the complete form at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    let releaseResponse = () => {};
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      const settings = `${installation.origin}/households/${household.id}/settings`;
      await page.goto(settings);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await openNewObject(page);
      const form = page.locator('dialog.object-dialog-C');
      await form.getByLabel('Namn', { exact: true }).fill('Bildarbete');
      await form.getByLabel('Beskrivning', { exact: true }).fill('Behåll bildens text');
      await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
      const file = form.getByLabel('Profilbild', { exact: true });
      await file.setInputFiles([]);
      const before = await read();
      expect(before.draft.changes).toEqual([]);
      await file.setInputFiles({
        name: 'fel.png',
        mimeType: 'image/png',
        buffer: Buffer.from('synthetic invalid pixels'),
      });
      let responseReady = () => {};
      const ready = new Promise<void>((resolve) => {
        responseReady = resolve;
      });
      const released = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      await page.route(
        '**/map/object-form',
        async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(400);
          responseReady();
          await released;
          await route.fulfill({ response });
        },
        { times: 1 },
      );
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await ready;
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/households/${household.id}$`));
      await expect(form.getByRole('alert')).toContainText('Vänta');
      await expect(file).toBeDisabled();
      releaseResponse();
      await expect(form.getByRole('alert')).toContainText('Profilbilden');
      expect(await read()).toEqual(before);
      await page.goBack();
      const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
      await expect(
        loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(form).toBeVisible();
      await page.goBack();
      await loss
        .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
        .click();
      await expect(page).toHaveURL(settings);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await openNewObject(page);
      await form.getByLabel('Namn', { exact: true }).fill('Bildarbete');
      await form.getByLabel('Beskrivning', { exact: true }).fill('Oskickat efter bildfelet');
      await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
      await file.setInputFiles({
        name: 'bild.png',
        mimeType: 'image/png',
        buffer: await sharp({
          create: { width: 100, height: 100, channels: 3, background: '#0088ff' },
        })
          .png()
          .toBuffer(),
      });
      const current = await read();
      expect(
        (
          await page.request.post(`${path}/draft`, {
            headers: { origin: installation.origin },
            data: {
              id: 'independent',
              version: current.draft.version,
              contentVersion: current.contentVersion,
              baseRevision: null,
              value: { typeId: current.types[0].id, name: 'Annat förslag', description: '' },
            },
          })
        ).status(),
      ).toBe(200);
      const newer = await read();
      await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      await expect(form.getByRole('alert')).toContainText('Dina uppgifter finns kvar');
      await expect(form.getByRole('alert')).not.toContainText('Profilbilden');
      await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
      await expect(form.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Oskickat efter bildfelet',
      );
      await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
      expect(await file.evaluate((element) => (element as HTMLInputElement).files?.[0]?.name)).toBe(
        'bild.png',
      );
      expect(await read()).toEqual(newer);
      expect(newer.objects).toEqual([]);
      expect(newer.draft.changes).toHaveLength(1);
      expect(newer.draft.changes[0].after?.name).toBe('Annat förslag');
      expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
    } finally {
      releaseResponse();
      await installation.close();
    }
  });
}
