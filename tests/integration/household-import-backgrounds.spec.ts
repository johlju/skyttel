import type { APIRequestContext, Page } from '@playwright/test';
import sharp from 'sharp';
import {
  defaultViewSettings,
  type PersonalView,
  type ViewSettings,
} from '../../src/shared/personal-view.js';
import { createHousehold, openMap, openSettings, signIn } from '../support/client.js';
import { downloadHouseholdExport } from '../support/household-export-download.js';
import {
  reloadRestoredHousehold,
  seedRecoveryContent,
} from '../support/household-recovery-reading.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

test.use({ viewport: { width: 1280, height: 720 } });

async function backgroundPixels(image: Buffer) {
  // Keep labels, the object and controls outside this free background area.
  // Compare broad appearance, allowing fine caustics to shift on a new camera fit.
  return sharp(image)
    .extract({ left: 900, top: 200, width: 250, height: 300 })
    .resize(8)
    .blur(1)
    .raw()
    .toBuffer();
}

async function backgroundDifference(before: Buffer, after: Buffer) {
  const original = await backgroundPixels(before);
  const restored = await backgroundPixels(after);
  let difference = 0;
  for (let pixel = 0; pixel < original.length; pixel += 1)
    difference += Math.abs(original[pixel] - restored[pixel]);
  return difference / original.length;
}

async function expectBackgroundSettings(page: Page, settings: ViewSettings) {
  await openSettings(page);
  await page
    .getByRole('link', { name: /^Rymdkartan/ })
    .first()
    .click();
  await expect(page.getByLabel('Visa bakgrund', { exact: true })).toBeChecked({
    checked: settings.background,
  });
  await expect(page.getByLabel('Bakgrund i ljust tema', { exact: true })).toHaveValue(
    settings.lightBackground,
  );
  await expect(page.getByLabel('Bakgrund i mörkt tema', { exact: true })).toHaveValue(
    settings.darkBackground,
  );
  await expect(page.getByRole('slider', { name: 'Panoreringsstyrka', exact: true })).toHaveValue(
    String(settings.panStrength * 100),
  );
  await expect(page.getByRole('slider', { name: 'Zoomstyrka', exact: true })).toHaveValue(
    String(settings.zoomStrength * 100),
  );
  await expect(page.getByRole('slider', { name: 'Lageravstånd', exact: true })).toHaveValue(
    String(settings.layerDistance),
  );
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
}

test('IMPORT-26: full export and reimport restore all background choices and motion endpoints per personal view', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const installation = await createInstallation();
  const member = await createPreparedContext(browser);
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}`;
    const headers = { origin: installation.origin };
    await seedRecoveryContent(page.request, path);
    installation.setIdentity(robin);
    await signIn(member.request, installation.origin, 'microsoft');
    const { user } = await (
      await member.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${path}/invitations`, { headers, data: { userId: user.id } })
    ).json();
    expect(
      (
        await member.request.post(`${installation.origin}/api/invitations/accept`, {
          headers,
          data: { code },
        })
      ).status(),
    ).toBe(200);
    const memberPage = await member.newPage();
    await memberPage.emulateMedia({ reducedMotion: 'reduce' });
    await memberPage.goto(installation.origin);
    await openMap(memberPage);
    const read = async (actor: APIRequestContext = page.request): Promise<PersonalView> =>
      (await actor.get(`${path}/map/view`)).json();
    const configure = async (settings: ViewSettings, actor: APIRequestContext = page.request) => {
      const current = await read(actor);
      expect(
        (
          await actor.post(`${path}/map/view/settings`, {
            headers,
            data: {
              contentVersion: current.contentVersion,
              version: current.settings.version,
              settings,
            },
          })
        ).status(),
      ).toBe(200);
    };
    const memberSettings: ViewSettings = {
      ...defaultViewSettings,
      background: false,
      darkBackground: 'ocean',
      panStrength: 0.25,
      zoomStrength: 0.95,
      layerDistance: 1.4,
    };
    await configure(memberSettings, member.request);
    expect(
      (
        await page.request.post(`${path}/map/view/position`, {
          headers,
          data: {
            id: 'recovery-lamp',
            version: 0,
            position: { x: 23, y: -7, z: 2 },
          },
        })
      ).status(),
    ).toBe(200);
    const pairs = [
      ['pearl', 'atmosphere'],
      ['dawn', 'mist'],
      ['ocean', 'universe'],
      ['pearl', 'ocean'],
      ['dawn', 'atmosphere'],
    ] as const;
    for (const [index, [lightBackground, darkBackground]] of pairs.entries()) {
      const settings: ViewSettings = {
        ...defaultViewSettings,
        invertX: true,
        axisPinned: true,
        axisCorner: 'top-left',
        allLabels: true,
        background: index !== 4,
        lightBackground,
        darkBackground,
        panStrength: index % 2 ? 1 : 0,
        zoomStrength: index % 2 ? 0 : 1,
        layerDistance: index % 2 ? 2 : 0.5,
      };
      await configure(settings);
      const saved = await read();
      const memberSaved = await read(member.request);
      await page.goto(installation.origin);
      await openMap(page);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const originalBackgrounds = new Map<string, Buffer>();
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        originalBackgrounds.set(
          colorScheme,
          await page
            .getByRole('region', {
              name: 'Rymdkarta',
              exact: true,
            })
            .locator('canvas')
            .screenshot({ path: test.info().outputPath(`${index}-${colorScheme}-original.png`) }),
        );
      }
      const archive = await downloadHouseholdExport(page, path);
      await configure({
        ...defaultViewSettings,
        lightBackground: lightBackground === 'dawn' ? 'pearl' : 'dawn',
        darkBackground: darkBackground === 'mist' ? 'atmosphere' : 'mist',
      });
      await configure(defaultViewSettings, member.request);
      if (index === 0) {
        await page.emulateMedia({ colorScheme: 'light' });
        await page.goto(installation.origin);
        await openMap(page);
        const changed = await page
          .getByRole('region', { name: 'Rymdkarta', exact: true })
          .locator('canvas')
          .screenshot();
        expect(
          await backgroundDifference(originalBackgrounds.get('light') ?? Buffer.alloc(0), changed),
        ).toBeGreaterThan(1);
      }
      await page.goto(`${installation.origin}/households/${household.id}/settings/import`);
      await page
        .getByLabel('Skyttel-export (ZIP)')
        .setInputFiles({ name: 'backgrounds.zip', mimeType: 'application/zip', buffer: archive });
      await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
      const replace = page.getByRole('button', { name: 'Ersätt hushållets innehåll' });
      await expect(replace).toBeDisabled();
      await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
      await replace.click();
      await expect(page.getByText(/Hushållets innehåll är ersatt/)).toBeVisible();
      await reloadRestoredHousehold(page);
      expect(await read()).toEqual({ ...saved, contentVersion: saved.contentVersion + 1 });
      expect(await read(member.request)).toEqual({
        ...memberSaved,
        contentVersion: memberSaved.contentVersion + 1,
      });
      await expectBackgroundSettings(page, settings);
      await memberPage.reload();
      await expectBackgroundSettings(memberPage, memberSettings);
      await openMap(page);
      const space = page.getByRole('region', { name: 'Rymdkarta', exact: true });
      await expect(
        space.getByRole('button', { name: 'Välj objekt: Lampa från exporten', exact: true }),
      ).toBeVisible();
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        const restoredBackground = await space
          .locator('canvas')
          .screenshot({ path: test.info().outputPath(`${index}-${colorScheme}-restored.png`) });
        // Allow subpixel rasterization differences across recreated renderers.
        expect(
          await backgroundDifference(
            originalBackgrounds.get(colorScheme) ?? Buffer.alloc(0),
            restoredBackground,
          ),
        ).toBeLessThan(1);
      }
    }
    const final = await read();
    await installation.restart();
    await page.reload();
    expect(await read()).toEqual(final);
    expect((await read(member.request)).settings).toMatchObject(memberSettings);
    await expectBackgroundSettings(page, final.settings);
    await memberPage.reload();
    await expectBackgroundSettings(memberPage, memberSettings);
  } finally {
    await member.close();
    await installation.close();
  }
});
