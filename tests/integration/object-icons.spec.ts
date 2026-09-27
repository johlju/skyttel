import { expect, type Locator, test } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import {
  activatePanel,
  createHousehold,
  openMap,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('IKON-01: icon choice survives type and image changes, save and restart before explicit reset', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const details = page.getByRole('group', { name: 'Objektets detaljer', exact: true });
    const picker = details.getByRole('region', { name: 'Ikon', exact: true });
    await details.getByLabel('Objektets namn', { exact: true }).fill('Min cykel');
    await details.getByLabel('Beskrivning', { exact: true }).fill('Bevara texten');
    await picker.getByRole('button', { name: 'Lägg uppgifterna i utkastet först' }).click();
    await expect(picker.getByRole('searchbox', { name: 'Sök ikon' })).toBeFocused();
    await picker.getByRole('searchbox', { name: 'Sök ikon' }).fill('cykel');
    await picker.getByRole('button', { name: 'Välj Cykel', exact: true }).click();
    await expect.poll(async () => (await read()).draft.changes[0].after?.iconId).toBe('bike');
    await details.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Fordon' });
    await expect(picker.getByRole('searchbox')).toBeDisabled();
    await picker.getByRole('button', { name: 'Lägg uppgifterna i utkastet först' }).click();
    await expect(picker.getByRole('searchbox')).toBeEnabled();
    const source = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#0088ff' },
    })
      .png()
      .toBuffer();
    await details
      .getByLabel('Välj profilbild')
      .setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: source });
    await expect(details.getByAltText('Profilbild för Min cykel')).toBeVisible();
    await openMap(page);
    const node = page.getByRole('button', { name: 'Välj objekt: Min cykel', exact: true });
    await expect(node.getByAltText('Profilbild för Min cykel')).toBeVisible();
    await expect(node.locator('[data-icon-id="bike"]')).toHaveCount(0);
    await openWorkspace(page);
    await activatePanel(page, 'Min cykel');
    await details.getByRole('button', { name: 'Ta bort profilbild' }).click();
    await expect(details.getByText('Ikon: Cykel', { exact: true })).toBeVisible();
    await openMap(page);
    await expect(node.locator('[data-icon-id="bike"]')).toBeVisible();
    await openWorkspace(page);
    await activatePanel(page, 'Min cykel');
    await details.getByLabel('Beskrivning', { exact: true }).fill('Bevara mer text');
    await page.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    await installation.restart();
    await page.reload();
    expect((await read()).objects[0]).toMatchObject({
      iconId: 'bike',
      description: 'Bevara mer text',
    });
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Min cykel', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await picker.getByRole('button', { name: 'Typens standardikon', exact: true }).click();
    await expect.poll(async () => (await read()).draft.changes[0].after?.iconId).toBeUndefined();
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    expect((await read()).objects[0]).not.toHaveProperty('iconId');
  } finally {
    await installation.close();
  }
});

test('IKON-02: full catalog search, empty results and keyboard pagination work in narrow themes', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const state: MapState = await (await page.request.get(path)).json();
    await page.request.post(`${path}/draft`, {
      headers: { origin: installation.origin },
      data: {
        id: 'object',
        version: 0,
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Lo', description: '' },
      },
    });
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Lo', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    const picker = page.getByRole('region', { name: 'Ikon', exact: true });
    const search = picker.getByRole('searchbox', { name: 'Sök ikon' });
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await search.fill('telescope');
        const telescope = picker.getByRole('button', { name: 'Välj telescope', exact: true });
        await telescope.focus();
        await page.keyboard.press('Enter');
        await expect(telescope).toHaveAttribute('aria-pressed', 'true');
        await search.fill('ingen-symbol-xyz');
        await expect(picker.getByText(/Inga ikoner matchar/)).toBeVisible();
        await picker.getByRole('button', { name: 'Rensa sökningen' }).click();
        await expect(search).toBeFocused();
        await picker.getByRole('button', { name: 'Nästa', exact: true }).click();
        await expect(
          picker.getByRole('group', { name: 'Välj ikon för Lo' }).getByRole('button').first(),
        ).toBeFocused();
        await picker.getByRole('button', { name: 'Föregående', exact: true }).click();
        await expect(
          picker.getByRole('button', { name: 'Föregående', exact: true }),
        ).toBeDisabled();
        await search.fill('bike');
        await expect(picker.getByRole('button', { name: 'Välj Cykel', exact: true })).toBeVisible();
        const box = await picker.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.width).toBeLessThanOrEqual(width);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
    }
  } finally {
    await installation.close();
  }
});

test('IKON-03: a short viewport keeps icon controls, unsent text and shared save reachable', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const details = page.getByRole('group', { name: 'Objektets detaljer', exact: true });
    const picker = details.getByRole('region', { name: 'Ikon', exact: true });
    await details.getByLabel('Objektets namn', { exact: true }).fill('Lilla cykeln');
    await details.getByLabel('Beskrivning', { exact: true }).fill('Min oskickade text');
    // The layout size of a 1280 × 1000 browser at 400% browser zoom.
    await page.setViewportSize({ width: 320, height: 250 });
    await picker.getByRole('button', { name: 'Lägg uppgifterna i utkastet först' }).click();
    const search = picker.getByRole('searchbox', { name: 'Sök ikon' });
    await expect(search).toBeFocused();
    await search.fill('cykel');
    await picker.getByRole('button', { name: 'Välj Cykel', exact: true }).click();
    await expect(picker.getByRole('button', { name: 'Välj Cykel', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await picker.getByRole('button', { name: 'Typens standardikon', exact: true }).click();
    await expect(
      picker.getByRole('button', { name: 'Typens standardikon', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(details.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Min oskickade text',
    );
    await details.getByRole('button', { name: 'Lägg i mitt utkast', exact: true }).click();
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Sparat');
    const saved: MapState = await (await page.request.get(path)).json();
    expect(saved.objects[0]).toMatchObject({
      name: 'Lilla cykeln',
      description: 'Min oskickade text',
    });
    expect(saved.objects[0]).not.toHaveProperty('iconId');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await installation.close();
  }
});

test('IKON-04: delayed keyboard icon choice and reset restore focus without replacing a later choice', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release = () => {};
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn', { exact: true }).fill('Lo');
    const picker = page.getByRole('region', { name: 'Ikon', exact: true });
    await picker.getByRole('button', { name: 'Lägg uppgifterna i utkastet först' }).click();
    await picker.getByRole('searchbox').fill('cykel');
    async function choose(button: Locator, nextFocus?: Locator) {
      let reached = () => {};
      const ready = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/map/draft', async (route) => {
        const response = await route.fetch();
        reached();
        await held;
        await route.fulfill({ response });
      });
      await button.focus();
      await page.keyboard.press('Enter');
      await ready;
      if (nextFocus) await nextFocus.focus();
      release();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(nextFocus ?? button).toBeFocused();
      await page.unroute('**/map/draft');
    }
    await choose(picker.getByRole('button', { name: 'Välj Cykel', exact: true }));
    await choose(picker.getByRole('button', { name: 'Typens standardikon', exact: true }));
    await choose(
      picker.getByRole('button', { name: 'Välj Cykel', exact: true }),
      page.getByRole('button', { name: 'Sök i kartan', exact: true }),
    );
  } finally {
    release();
    await installation.close();
  }
});

test('IKON-05: a failed icon request focuses recovery and a successful retry returns to the picker', async ({
  page,
}) => {
  const installation = await createInstallation();
  let release = () => {};
  try {
    await signIn(page.request, installation.origin);
    await createHousehold(page.request, installation.origin);
    await page.goto(installation.origin);
    await openWorkspace(page);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await page.getByLabel('Objektets namn', { exact: true }).fill('Lo');
    const picker = page.getByRole('region', { name: 'Ikon', exact: true });
    await picker.getByRole('button', { name: 'Lägg uppgifterna i utkastet först' }).click();
    await picker.getByRole('searchbox').fill('cykel');
    await page.route(
      '**/map/draft',
      (route) => route.fulfill({ status: 503, json: { error: 'temporarily_unavailable' } }),
      { times: 1 },
    );
    const cycle = picker.getByRole('button', { name: 'Välj Cykel', exact: true });
    await cycle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Ändringen kunde inte bekräftas');
    const recovery = page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true });
    await expect(recovery).toBeFocused();
    await expect(cycle).toBeDisabled();
    await page.keyboard.press('Enter');
    await expect(cycle).toBeEnabled();
    await expect(cycle).toBeFocused();
    await expect(cycle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(cycle).toHaveAttribute('aria-pressed', 'true');
    await expect(cycle).toBeFocused();
    // Losing a successful response can leave the original editor stale after recovery.
    await page.route(
      '**/map/draft',
      async (route) => {
        expect((await route.fetch()).ok()).toBe(true);
        await route.fulfill({ status: 503, json: { error: 'response_lost' } });
      },
      { times: 1 },
    );
    const reset = picker.getByRole('button', { name: 'Typens standardikon', exact: true });
    await reset.focus();
    await page.keyboard.press('Enter');
    await expect(recovery).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Lo', exact: true })).toBeFocused();
    await expect(reset).toBeDisabled();
    await expect(page.getByRole('alert')).toContainText('äldre utkast');
    await page.getByRole('button', { name: 'Stäng utan att skicka texten' }).click();
    await page.getByRole('button', { name: 'Lo', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await expect(reset).toHaveAttribute('aria-pressed', 'true');
    await picker.getByRole('searchbox').fill('cykel');
    const toolbar = page.getByRole('button', { name: 'Sök i kartan', exact: true });
    for (const operation of ['reject', 'recover']) {
      let reached = () => {};
      const ready = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(
        operation === 'reject' ? '**/map/draft' : /\/map\?reload=/,
        async (route) => {
          const response = operation === 'recover' ? await route.fetch() : undefined;
          reached();
          await held;
          await route.fulfill(
            response ? { response } : { status: 503, json: { error: 'temporarily_unavailable' } },
          );
        },
        { times: 1 },
      );
      await (operation === 'reject' ? cycle : recovery).focus();
      await page.keyboard.press('Enter');
      await ready;
      await toolbar.focus();
      release();
      if (operation === 'reject')
        await expect(page.getByRole('alert')).toContainText('Ändringen kunde inte bekräftas');
      else await expect(cycle).toBeEnabled();
      await expect(toolbar).toBeFocused();
    }
  } finally {
    release();
    await installation.close();
  }
});
