import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openMap,
  openNewObject,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editTableObject } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';

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
    await openNewObject(page);
    const form = page.locator('dialog.object-dialog-C');
    const stage = () =>
      form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const appearance = () =>
      form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    const edit = async () => {
      await editTableObject(page, 'Min cykel');
    };
    await form.getByLabel('Namn', { exact: true }).fill('Min cykel');
    await form.getByLabel('Beskrivning', { exact: true }).fill('Bevara texten');
    await appearance();
    const picker = form.getByRole('region', { name: 'Ikon', exact: true });
    await picker.getByRole('searchbox', { name: 'Sök ikon' }).fill('cykel');
    await picker.getByRole('button', { name: 'Välj Cykel', exact: true }).click();
    expect((await read()).draft.changes).toEqual([]);
    await form.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
    await form.getByLabel('Objekttyp', { exact: true }).selectOption({ label: 'Fordon' });
    await appearance();
    await expect(picker.getByRole('searchbox')).toBeEnabled();
    await expect(picker.getByRole('button', { name: 'Välj Cykel', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const source = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#0088ff' },
    })
      .png()
      .toBuffer();
    await form
      .getByLabel('Profilbild', { exact: true })
      .setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: source });
    await expect(picker).toContainText('Profilbilden visas i kartan och listan.');
    await stage();
    await openMap(page);
    const node = page.getByRole('button', { name: 'Välj objekt: Min cykel', exact: true });
    await expect(node.getByAltText('Profilbild för Min cykel')).toBeVisible();
    await expect(node.locator('[data-icon-id="bike"]')).toHaveCount(0);
    await edit();
    await appearance();
    await form
      .getByRole('button', { name: 'Ta bort profilbilden ur formuläret', exact: true })
      .click();
    await expect(picker).toContainText('Ikonen visas i kartan och listan.');
    await stage();
    await openMap(page);
    await expect(node.locator('[data-icon-id="bike"]')).toBeVisible();
    await edit();
    await form.getByLabel('Beskrivning', { exact: true }).fill('Bevara mer text');
    await stage();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    expect((await read()).objects[0]).toMatchObject({
      iconId: 'bike',
      description: 'Bevara mer text',
    });
    await edit();
    await appearance();
    await picker.getByRole('button', { name: 'Typens standardikon', exact: true }).click();
    expect((await read()).draft.changes).toEqual([]);
    await stage();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
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
    await editTableObject(page, 'Lo');
    await page.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
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
    await openNewObject(page);
    const details = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    const picker = details.getByRole('region', { name: 'Ikon', exact: true });
    await details.getByLabel('Namn', { exact: true }).fill('Lilla cykeln');
    await details.getByLabel('Beskrivning', { exact: true }).fill('Min oskickade text');
    // The layout size of a 1280 × 1000 browser at 400% browser zoom.
    await page.setViewportSize({ width: 320, height: 250 });
    await details.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    const search = picker.getByRole('searchbox', { name: 'Sök ikon' });
    await search.focus();
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
    await details.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
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

test('IKON-04: local keyboard icon choice and reset preserve the chosen focus until complete staging', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Nytt objekt', exact: true })
      .click();
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Lo');
    await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    const picker = form.getByRole('region', { name: 'Ikon', exact: true });
    const search = picker.getByRole('searchbox');
    await search.fill('cykel');
    for (const name of ['Välj Cykel', 'Typens standardikon', 'Välj Cykel']) {
      const button = picker.getByRole('button', { name, exact: true });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(button).toBeFocused();
    }
    await search.focus();
    await expect(search).toBeFocused();
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    expect((await (await page.request.get(path)).json()).draft.changes[0].after.iconId).toBe(
      'bike',
    );
  } finally {
    await installation.close();
  }
});

test('IKON-05: rejected and lost complete icon staging preserve the local choice and recover one proposal', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(installation.origin);
    await page
      .getByRole('navigation', { name: 'Kartans verktyg' })
      .getByRole('button', { name: 'Nytt objekt', exact: true })
      .click();
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Lo');
    await form.getByLabel('Beskrivning', { exact: true }).fill('Bevarad ikontext');
    await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    const picker = form.getByRole('region', { name: 'Ikon', exact: true });
    await picker.getByRole('searchbox').fill('cykel');
    const cycle = picker.getByRole('button', { name: 'Välj Cykel', exact: true });
    await cycle.focus();
    await page.keyboard.press('Enter');
    await page.route(
      '**/map/object-form',
      (route) => route.fulfill({ status: 400, json: { error: 'invalid_request' } }),
      { times: 1 },
    );
    const stage = form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true });
    await stage.focus();
    await page.keyboard.press('Enter');
    await expect(form.getByRole('alert')).toContainText('Dina uppgifter finns kvar.');
    await expect(cycle).toHaveAttribute('aria-pressed', 'true');
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    await page.route(
      '**/map/object-form',
      async (route) => {
        expect((await route.fetch()).ok()).toBe(true);
        await route.abort();
      },
      { times: 1 },
    );
    await stage.focus();
    await page.keyboard.press('Enter');
    const check = form.getByRole('button', {
      name: 'Kontrollera om ändringen lades i utkastet',
      exact: true,
    });
    await expect(check).toBeVisible();
    await expect(stage).toBeDisabled();
    await expect(cycle).toHaveAttribute('aria-pressed', 'true');
    await check.focus();
    await page.keyboard.press('Enter');
    await expect(form).not.toBeVisible();
    const state: MapState = await (await page.request.get(path)).json();
    expect(state.objects).toEqual([]);
    expect(state.draft.changes).toHaveLength(1);
    expect(state.draft.changes[0].after).toMatchObject({
      name: 'Lo',
      description: 'Bevarad ikontext',
      iconId: 'bike',
    });
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
  } finally {
    await installation.close();
  }
});
