import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import {
  activatePanel,
  createHousehold,
  openMap,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { createInstallation } from '../support/installation.js';

for (const [width, height] of [
  [1440, 1000],
  [1440, 500],
  [320, 1000],
  [320, 250],
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`BILD-04: a delayed image error returns to its closed object without losing newer work at ${width}x${height}px ${colorScheme}`, async ({
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
        await openWorkspace(page);
        await page.getByRole('button', { name: 'Uppgifter för Garaget', exact: true }).click();
        const garage = page.getByRole('region', { name: 'Garaget', exact: true });
        await garage.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
        await garage.getByLabel('Beskrivning', { exact: true }).fill('Oskickat om Garaget');
        await garage.getByRole('button', { name: 'Stäng Garaget', exact: true }).click();
        await openWorkspace(page);
        await page.getByRole('button', { name: 'Uppgifter för Cykeln', exact: true }).click();
        const cycle = page.getByRole('region', { name: 'Cykeln', exact: true });
        await cycle.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
        const imageInput = cycle.getByLabel('Välj profilbild');
        const images: string[] = [];
        for (const background of ['#0088ff', '#33aa44']) {
          await imageInput.setInputFiles({
            name: 'bild.png',
            mimeType: 'image/png',
            buffer: await sharp({ create: { width: 600, height: 400, channels: 3, background } })
              .png()
              .toBuffer(),
          });
          await expect(imageInput).toBeEnabled();
          const image = (await read()).draft.changes.find((change) => change.id === 'cycle')?.after
            ?.profileImageId;
          expect(image).toBeTruthy();
          images.push(image as string);
        }
        expect(images[1]).not.toBe(images[0]);
        const before = await read();
        let responseReady = () => {};
        const ready = new Promise<void>((resolve) => {
          responseReady = resolve;
        });
        const released = new Promise<void>((resolve) => {
          releaseResponse = resolve;
        });
        await page.route(`**/profile-images/cycle`, async (route) => {
          const response = await route.fetch();
          expect(response.status()).toBe(400);
          expect(await response.json()).toEqual({ error: 'invalid_image' });
          responseReady();
          await released;
          await route.fulfill({ response });
        });
        await imageInput.setInputFiles({
          name: 'fel.png',
          mimeType: 'image/png',
          buffer: Buffer.from('synthetic invalid pixels'),
        });
        await ready;
        await expect(imageInput).toBeDisabled();
        await cycle.getByRole('button', { name: 'Stäng Cykeln', exact: true }).click();
        await openWorkspace(page);
        const search = page.getByLabel('Sök objekt', { exact: true });
        await search.fill('Gar');
        releaseResponse();
        await expect(page.getByRole('alert')).toContainText('Bilden kunde inte behandlas');
        await expect(cycle).not.toBeVisible();
        await expect(search).toBeFocused();
        await page.keyboard.type('aget');
        await expect(search).toHaveValue('Garaget');
        expect(await read()).toEqual(before);
        const returnToImage = page.getByRole('button', {
          name: 'Återgå till bilden för Cykeln',
          exact: true,
        });
        await expect(returnToImage).toBeVisible();
        await returnToImage.click();
        await expect(cycle.getByRole('heading', { name: 'Cykeln', exact: true })).toBeFocused();
        await expect(cycle.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Skickad text om Cykeln',
        );
        await expect(cycle.getByAltText('Profilbild för Cykeln')).toHaveAttribute(
          'src',
          new RegExp(`/profile-images/${images[1]}$`),
        );
        expect(
          (await read()).draft.changes.find((change) => change.id === 'cycle')?.after,
        ).toMatchObject({
          name: 'Cykeln',
          description: 'Skickad text om Cykeln',
          iconId: 'bike',
          profileImageId: images[1],
        });
        await openWorkspace(page);
        await page.getByRole('button', { name: 'Uppgifter för Garaget', exact: true }).click();
        await activatePanel(page, 'Garaget');
        await expect(garage.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickat om Garaget',
        );
        expect(await read()).toEqual(before);
        await returnToImage.click();
        await cycle
          .getByLabel('Beskrivning', { exact: true })
          .fill('Kasta just denna oskickade text');
        await cycle
          .getByRole('button', { name: 'Stäng utan att skicka texten', exact: true })
          .click();
        await expect(cycle).not.toBeVisible();
        expect(await read()).toEqual(before);
        await page.keyboard.press('Tab');
        await returnToImage.focus();
        await returnToImage.hover();
        await expect(returnToImage).toBeFocused();
        const appearance = await returnToImage.evaluate((element) => {
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
          return {
            foreground: style.color,
            background: style.backgroundColor,
            contrast:
              (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
            focusVisible: element.matches(':focus-visible'),
            outline: style.outlineStyle,
            outlineWidth: Number.parseFloat(style.outlineWidth),
          };
        });
        expect(appearance.focusVisible).toBe(true);
        expect(appearance.outline).not.toBe('none');
        expect(appearance.outlineWidth).toBeGreaterThanOrEqual(2);
        expect(appearance.contrast, JSON.stringify(appearance)).toBeGreaterThanOrEqual(4.5);
        await returnToImage.click();
        await expect(cycle.getByRole('heading', { name: 'Cykeln', exact: true })).toBeFocused();
        await expect(cycle.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Skickad text om Cykeln',
        );
        await expect(cycle.getByAltText('Profilbild för Cykeln')).toHaveAttribute(
          'src',
          new RegExp(`/profile-images/${images[1]}$`),
        );
        expect(await read()).toEqual(before);
        await openWorkspace(page);
        await page.getByRole('button', { name: 'Uppgifter för Garaget', exact: true }).click();
        await activatePanel(page, 'Garaget');
        await expect(garage.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickat om Garaget',
        );
        await page.getByRole('button', { name: 'Stäng arbetsytan', exact: true }).click();
        await expect(garage).not.toBeVisible();
        await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
        expect(await read()).toEqual(before);
        await openWorkspace(page);
        await page.getByRole('button', { name: 'Uppgifter för Garaget', exact: true }).click();
        await activatePanel(page, 'Garaget');
        await expect(garage.getByLabel('Beskrivning', { exact: true })).toHaveValue(
          'Oskickat om Garaget',
        );
        expect(await read()).toEqual(before);
      } finally {
        releaseResponse();
        await installation.close();
      }
    });
  }
}

for (const width of [1440, 390, 320]) {
  test(`BILD-05: Settings preserves pending image work and retires its error destination at ${width}px`, async ({
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
      await page.goto(installation.origin);
      await openWorkspace(page);
      await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
      await page.getByLabel('Objektets namn', { exact: true }).fill('Bildarbete');
      await page.getByLabel('Beskrivning', { exact: true }).fill('Behåll bildens text');
      await expect(page.getByLabel('Välj profilbild')).toBeDisabled();
      expect((await read()).draft.changes).toEqual([]);
      await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      await page.getByRole('button', { name: 'Uppgifter för Bildarbete', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Bildarbete', exact: true });
      await panel.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
      const file = panel.getByLabel('Välj profilbild');
      const before = await read();
      let uploads = 0;
      page.on('request', (request) => {
        if (request.url().includes('/profile-images/') && request.method() === 'POST') uploads++;
      });
      await file.setInputFiles([]);
      await expect(file).toBeEnabled();
      expect(uploads).toBe(0);
      expect(await read()).toEqual(before);
      let responseReady = () => {};
      const ready = new Promise<void>((resolve) => {
        responseReady = resolve;
      });
      const released = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      await page.route('**/profile-images/*', async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(400);
        expect(await response.json()).toEqual({ error: 'invalid_image' });
        responseReady();
        await released;
        await route.fulfill({ response });
      });
      await file.setInputFiles({
        name: 'fel.png',
        mimeType: 'image/png',
        buffer: Buffer.from('synthetic invalid pixels'),
      });
      await ready;
      await expect(file).toBeDisabled();
      await panel.getByRole('button', { name: 'Stäng Bildarbete', exact: true }).click();
      await openMap(page);
      await expect(
        page.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
      ).toBeDisabled();
      await openSettings(page);
      await expect(
        page.getByRole('heading', { name: 'Inställningar', level: 1, exact: true }),
      ).toBeFocused();
      await expect(page.getByRole('region', { name: 'Utkastets återkoppling' })).toBeVisible();
      const settingsReturn = page.getByRole('link', { name: 'Tillbaka till kartan', exact: true });
      await settingsReturn.focus();
      releaseResponse();
      await expect(page.getByRole('alert')).toContainText('Bilden kunde inte behandlas');
      await expect(page).toHaveURL(/\/settings$/);
      await expect(settingsReturn).toBeFocused();
      await expect(panel).not.toBeVisible();
      expect(await read()).toEqual(before);
      const imageReturn = page.getByRole('button', {
        name: 'Återgå till bilden för Bildarbete',
        exact: true,
      });
      await imageReturn.click();
      await expect(page).toHaveURL(new RegExp(`/households/${household.id}$`));
      await expect(panel.getByRole('heading', { name: 'Bildarbete', exact: true })).toBeFocused();
      await expect(panel.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Behåll bildens text',
      );
      await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(imageReturn).toHaveCount(0);
      expect(await read()).toEqual(before);
      await panel.getByLabel('Beskrivning', { exact: true }).fill('Oskickat efter bildfelet');
      await page.route(
        '**/map/draft',
        async (route) => {
          const current = await read();
          const sibling = await page.request.post(`${path}/draft`, {
            headers: { origin: installation.origin },
            data: {
              id: 'independent',
              version: current.draft.version,
              contentVersion: current.contentVersion,
              baseRevision: null,
              value: { typeId: current.types[0].id, name: 'Annat förslag', description: '' },
            },
          });
          expect(sibling.status()).toBe(200);
          const response = await route.fetch();
          expect(response.status()).toBe(409);
          await route.fulfill({ response });
        },
        { times: 1 },
      );
      await panel.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('alert')).not.toContainText('Bilden');
      await expect(imageReturn).toHaveCount(0);
      await expect(panel.getByLabel('Beskrivning', { exact: true })).toHaveValue(
        'Oskickat efter bildfelet',
      );
      const after = await read();
      expect(after.objects).toEqual([]);
      expect(
        after.draft.changes.find((change) => change.id === before.draft.changes[0].id),
      ).toEqual(before.draft.changes[0]);
      expect(after.draft.changes.find((change) => change.id === 'independent')?.after?.name).toBe(
        'Annat förslag',
      );
    } finally {
      releaseResponse();
      await installation.close();
    }
  });
}
