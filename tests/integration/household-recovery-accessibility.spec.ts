import { expect, type Locator, test } from '@playwright/test';
import { createHousehold, openSettings, signIn } from '../support/client.js';
import { expectContentOwnerReview } from '../support/content-owners.js';
import { createInstallation } from '../support/installation.js';

async function expectUncoveredFocus(control: Locator) {
  await expect(control).toBeFocused();
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const css = getComputedStyle(element);
        return (
          box.top >= 0 &&
          box.left >= 0 &&
          box.bottom <= innerHeight &&
          box.right <= innerWidth &&
          element.contains(
            document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2),
          ) &&
          css.outlineStyle === 'solid' &&
          Number.parseFloat(css.outlineWidth) >= 2
        );
      }),
    )
    .toBe(true);
}

async function expectReadableAccent(control: Locator) {
  await expect(control).toBeVisible();
  const contrast = await control.evaluate((element) => {
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
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
}

async function expectReadableNavigation(navigation: Locator, name: string, width: number) {
  if (width <= 800) {
    await navigation.getByText('Välj inställning', { exact: true }).focus();
    await navigation.page().keyboard.press('Enter');
  }
  const current = navigation.getByRole('link', { name, exact: true });
  await expect(current).toHaveAttribute('aria-current', 'page');
  await current.scrollIntoViewIfNeeded();
  await expectReadableAccent(current);
  if (width <= 800) {
    await navigation.getByText('Välj inställning', { exact: true }).focus();
    await navigation.page().keyboard.press('Enter');
  }
}

for (const { width, height } of [
  { width: 1280, height: 900 },
  { width: 390, height: 900 },
  { width: 320, height: 900 },
  { width: 640, height: 500 },
]) {
  test(`IMPORT-15: keyboard recovery controls remain visible through review, errors and assignment at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    let release = () => {};
    try {
      await page.setViewportSize({ width, height });
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const { user } = await (
        await page.request.get(`${installation.origin}/api/bootstrap`)
      ).json();
      const path = `${installation.origin}/api/households/${household.id}`;
      const headers = { origin: installation.origin };
      const initial = await (await page.request.get(`${path}/map`)).json();
      expect(
        (
          await page.request.post(`${path}/map/draft`, {
            headers,
            data: {
              id: 'private',
              version: 0,
              baseRevision: null,
              value: {
                name: 'Bevarat privat arbete',
                description: '',
                typeId: initial.types[0].id,
              },
            },
          })
        ).status(),
      ).toBe(200);
      const original = await (await page.request.get(`${path}/map`)).json();
      const exported = await (
        await page.request.post(`${path}/exports`, { headers, data: {} })
      ).json();
      const archive = await (await page.request.get(`${path}/exports/${exported.id}`)).body();
      let expectedVersion = 1;
      for (const theme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto(installation.origin);
        await openSettings(page);
        const navigation = page.getByRole('navigation', { name: 'Inställningarnas sidor' });
        if (width <= 800) await navigation.getByText('Välj inställning', { exact: true }).click();
        await navigation
          .getByRole('link', { name: 'Återimportera hushållet', exact: true })
          .focus();
        await page.keyboard.press('Enter');
        const importer = page.getByRole('region', { name: 'Återimportera hushållet', exact: true });
        await expectUncoveredFocus(importer.getByRole('heading', { level: 1 }));
        await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', theme);
        await expectReadableNavigation(navigation, 'Återimportera hushållet', width);
        const file = importer.getByLabel('Skyttel-export (ZIP)');
        await file.setInputFiles({
          name: 'invalid.zip',
          mimeType: 'application/zip',
          buffer: Buffer.from('Invalid ZIP'),
        });
        const prepare = importer.getByRole('button', { name: 'Kontrollera importfil' });
        await prepare.focus();
        await expectUncoveredFocus(prepare);
        await page.keyboard.press('Enter');
        await expect(importer.getByRole('alert')).toContainText('Filen kan inte importeras');
        await expectUncoveredFocus(file);
        expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
          ...original,
          contentVersion: expectedVersion,
        });
        await file.setInputFiles({
          name: 'skyttel.zip',
          mimeType: 'application/zip',
          buffer: archive,
        });
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let prepared = () => {};
        const serverReady = new Promise<void>((resolve) => {
          prepared = resolve;
        });
        await page.route(
          `${path}/imports`,
          async (route) => {
            if (route.request().method() !== 'POST') return route.continue();
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            prepared();
            await held;
            await route.fulfill({ response });
          },
          { times: 1 },
        );
        await prepare.focus();
        await page.keyboard.press('Enter');
        await serverReady;
        const returnLink = page.getByRole('link', { name: 'Tillbaka till kartan', exact: true });
        await returnLink.focus();
        release();
        const review = importer.getByRole('group', { name: 'Granska ersättningen' });
        await expect(review).toBeVisible();
        await expectUncoveredFocus(returnLink);
        await importer.getByRole('button', { name: 'Hämta importens status' }).focus();
        await page.keyboard.press('Enter');
        await expectUncoveredFocus(review.locator('legend'));
        const cancel = importer.getByRole('button', { name: 'Avbryt förberedelsen', exact: true });
        await cancel.focus();
        await expectUncoveredFocus(cancel);
        expect((await cancel.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Enter');
        await expect(importer.getByRole('status')).toContainText('Förberedelsen är avbruten');
        await expectUncoveredFocus(file);
        expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
          ...original,
          contentVersion: expectedVersion,
        });
        await file.setInputFiles({
          name: 'skyttel.zip',
          mimeType: 'application/zip',
          buffer: archive,
        });
        await prepare.focus();
        await page.keyboard.press('Enter');
        await expect(review).toBeVisible();
        await expectUncoveredFocus(review.locator('legend'));
        const confirmation = importer.getByRole('checkbox', {
          name: 'Jag vill ersätta allt hushållsinnehåll',
        });
        const replace = importer.getByRole('button', { name: 'Ersätt hushållets innehåll' });
        await expect(replace).toBeDisabled();
        await confirmation.focus();
        await expectUncoveredFocus(confirmation);
        expect((await confirmation.locator('..').boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Space');
        await replace.focus();
        await expectUncoveredFocus(replace);
        await expectReadableAccent(replace);
        expect((await replace.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Enter');
        await expect(importer.getByRole('status')).toContainText('Hushållets innehåll är ersatt');
        await expectUncoveredFocus(
          importer.getByRole('button', { name: 'Läs in det återställda hushållet' }),
        );
        expectedVersion++;
        expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
          ...original,
          contentVersion: expectedVersion,
        });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );

        if (width <= 800) await navigation.getByText('Välj inställning', { exact: true }).click();
        await navigation
          .getByRole('link', { name: 'Koppla historiskt innehåll', exact: true })
          .focus();
        await page.keyboard.press('Enter');
        const owners = page.getByRole('region', {
          name: 'Koppla historiskt innehåll',
          exact: true,
        });
        await expectUncoveredFocus(owners.getByRole('heading', { level: 1 }));
        await expectReadableNavigation(navigation, 'Koppla historiskt innehåll', width);
        const load = owners.getByRole('button', { name: 'Hämta aktuella innehållskopplingar' });
        await load.focus();
        await page.keyboard.press('Enter');
        await expect(owners.getByLabel('Historisk innehållsidentitet')).toBeVisible();
        await expectUncoveredFocus(load);
        const identity = owners.getByLabel('Historisk innehållsidentitet');
        await identity.selectOption(original.userId);
        await identity.focus();
        await expectUncoveredFocus(identity);
        const member = owners.getByLabel('Aktuell verifierad medlem');
        await member.selectOption('');
        await expectContentOwnerReview(
          owners,
          `Alex Exempel (${original.userId})`,
          'Ingen aktuell ägare',
        );
        await member.focus();
        await expectUncoveredFocus(member);
        const confirmed = owners.getByRole('checkbox', {
          name: 'Jag har identifierat rätt person',
        });
        const assign = owners.getByRole('button', { name: 'Bekräfta innehållskopplingen' });
        await expect(assign).toBeDisabled();
        await confirmed.focus();
        await expectUncoveredFocus(confirmed);
        expect((await confirmed.locator('..').boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Space');
        await assign.focus();
        await expectUncoveredFocus(assign);
        await expectReadableAccent(assign);
        expect((await assign.boundingBox())?.height).toBeGreaterThanOrEqual(44);
        await page.keyboard.press('Enter');
        await expect(owners.getByRole('status')).toContainText('Innehållskopplingen är sparad');
        await expectUncoveredFocus(load);
        await expect(owners).toContainText('Nuvarande koppling: Ingen aktuell medlem');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await member.selectOption(user.id);
        await expectContentOwnerReview(
          owners,
          `Alex Exempel (${original.userId})`,
          `Alex Exempel (${user.id})`,
        );
        await expect(assign).toBeDisabled();
        await confirmed.focus();
        await page.keyboard.press('Space');
        await assign.focus();
        await page.keyboard.press('Enter');
        await expect(owners.getByRole('status')).toContainText('Innehållskopplingen är sparad');
        await expectUncoveredFocus(load);
        expectedVersion += 2;
        expect(await (await page.request.get(`${path}/map`)).json()).toEqual({
          ...original,
          contentVersion: expectedVersion,
        });
      }
    } finally {
      release();
      await installation.close();
    }
  });
}
