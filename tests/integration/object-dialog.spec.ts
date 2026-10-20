import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import { closeSupportDialog, closeTextView, createHousehold, signIn } from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { readDraftProposal, readTableObject } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import {
  openProperties,
  propertyRow,
  propertyValues,
  setProperty,
} from '../support/property-controls.js';
import { expect, test } from '../support/test.js';

test('KARTA-19: unchanged edits open relationships without staging and every reading entry uses the same object dialog', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const state = await read();
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    expect(
      (
        await post('draft', {
          version: 0,
          id: 'saved-bike',
          baseRevision: null,
          value: {
            typeId: state.types[0].id,
            name: 'Sparad cykel',
            properties: [
              {
                id: 'description',
                label: 'Beskrivning',
                kind: 'text' as const,
                value: 'Hela beskrivningen',
              },
              { id: 'price', label: 'Pris', kind: 'text' as const, value: '249' },
              { id: 'currency', label: 'Valuta', kind: 'text' as const, value: 'SEK' },
            ],
          },
        })
      ).status(),
    ).toBe(200);
    expect((await post('save', { version: 1, operationId: 'bike-save' })).status()).toBe(200);
    const saved = await read();
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const editButton = page.getByRole('button', { name: 'Redigera Sparad cykel', exact: true });
    await editButton.click();
    const form = page.getByRole('dialog', { name: 'Redigera Sparad cykel', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Tillfällig text');
    await form.getByLabel('Namn', { exact: true }).fill('Sparad cykel');
    await openProperties(form);
    await setProperty(form, 'Pris', '249', 'text');
    await form
      .getByRole('button', { name: 'Lägg i utkastet och öppna samband', exact: true })
      .click();
    const relationships = page.getByRole('dialog', {
      name: 'Samband för Sparad cykel',
      exact: true,
    });
    await expect(
      relationships.getByRole('heading', { name: 'Samband för Sparad cykel', exact: true }),
    ).toBeFocused();
    expect((await read()).draft).toEqual(saved.draft);
    await relationships.getByRole('button', { name: 'Stäng dialogen', exact: true }).click();
    await expect(editButton).toBeFocused();
    await page.getByRole('button', { name: 'Sparad cykel', exact: true }).click();
    const details = page.getByRole('region', { name: 'Uppgifter för Sparad cykel', exact: true });
    await expect(details.getByRole('button', { name: /^Redigera/ })).toHaveCount(0);
    await editButton.click();
    await expect(form).toBeVisible({ timeout: 1000 });
    await expect(form.getByRole('button', { name: 'Grunduppgifter', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(editButton).toBeFocused();
    expect((await read()).draft).toEqual(saved.draft);
  } finally {
    await installation.close();
  }
});

test('KARTA-17: pending staging blocks duplicate sends and known rejection keeps all values', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    let release = () => {};
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let sends = 0;
    await page.route(`${path}/object-form`, async (route) => {
      sends++;
      await wait;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_request' }),
      });
    });
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Väntande cykel');
    await setProperty(form, 'Beskrivning', 'Bevarad beskrivning');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).dblclick();
    await expect(form.getByLabel('Namn', { exact: true })).toBeDisabled();
    await expect(
      form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }),
    ).toBeDisabled();
    await expect(
      form.getByRole('status', { name: 'Tillägg till utkastet', exact: true }),
    ).toContainText('Lägger');
    await page.keyboard.press('Escape');
    await expect(form).toBeVisible();
    expect(sends).toBe(1);
    release();
    await expect(form.getByRole('alert')).toContainText('uppgifter finns kvar');
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Väntande cykel');
    await expect(propertyRow(form, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Bevarad beskrivning',
    );
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
    await page.unroute(`${path}/object-form`);
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(form).not.toBeVisible();
    expect((await (await page.request.get(path)).json()).draft.changes).toHaveLength(1);
  } finally {
    await installation.close();
  }
});

for (const applied of [true, false]) {
  test(`${applied ? 'KARTA-18' : 'KARTA-21'}: lost staging response is checked before ${applied ? 'confirmed relationship transition' : 'safe retry'}`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      let sends = 0;
      await page.route(`${path}/object-form`, async (route) => {
        sends++;
        if (applied) expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      });
      await page.goto(`${installation.origin}/households/${household.id}`);
      const opener = page.getByRole('button', { name: 'Nytt objekt', exact: true });
      await opener.click();
      const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
      await form.getByLabel('Namn', { exact: true }).fill('Cykeln efter tappat svar');
      if (applied) {
        await form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
        await form.getByLabel('Profilbild', { exact: true }).setInputFiles({
          name: 'recovery.png',
          mimeType: 'image/png',
          buffer: await sharp({
            create: { width: 32, height: 32, channels: 3, background: '#0088ff' },
          })
            .png()
            .toBuffer(),
        });
      }

      await form
        .getByRole('button', { name: 'Lägg i utkastet och öppna samband', exact: true })
        .click();
      const check = form.getByRole('button', {
        name: 'Kontrollera om ändringen lades i utkastet',
        exact: true,
      });
      await expect(check).toBeVisible({ timeout: 1000 });
      await expect(form.getByLabel('Namn', { exact: true })).toBeDisabled();
      await expect(
        form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }),
      ).toBeDisabled();
      await page.keyboard.press('Escape');
      await expect(form).toBeVisible();
      expect(sends).toBe(1);
      await check.click();
      const relationships = page.getByRole('dialog', {
        name: 'Samband för Cykeln efter tappat svar',
        exact: true,
      });
      if (!applied) {
        await expect(form.getByRole('alert')).toContainText('inte lades i utkastet');
        await expect(form.getByLabel('Namn', { exact: true })).toHaveValue(
          'Cykeln efter tappat svar',
        );
        expect((await (await page.request.get(path)).json()).draft.changes).toEqual([]);
        await page.unroute(`${path}/object-form`);
        await form
          .getByRole('button', { name: 'Lägg i utkastet och öppna samband', exact: true })
          .click();
      }
      await expect(relationships).toBeVisible();
      await expect(
        relationships.getByRole('heading', {
          name: 'Samband för Cykeln efter tappat svar',
          exact: true,
        }),
      ).toBeFocused();
      const state: MapState = await (await page.request.get(path)).json();
      expect(state.objects).toHaveLength(0);
      expect(state.draft.changes).toHaveLength(1);
      if (applied) {
        const imageId = state.draft.changes[0].after?.profileImageId;
        expect(imageId).toBeTruthy();
        expect(
          (
            await page.request.get(
              `${installation.origin}/api/households/${household.id}/profile-images/${imageId}`,
            )
          ).status(),
        ).toBe(200);
      }

      await relationships.getByRole('button', { name: 'Stäng dialogen', exact: true }).click();
      await expect(opener).toBeFocused();
      const proposal = await readDraftProposal(page, 'Cykeln efter tappat svar');
      await expect(proposal).toContainText('Cykeln efter tappat svar');
      if (applied) await expect(proposal).toContainText('Profilbild finns');
    } finally {
      await installation.close();
    }
  });
}

test('KARTA-16: browser back protects unsent work and confirms navigation', async ({ page }) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const settings = `${installation.origin}/households/${household.id}/settings`;
    await page.goto(settings);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Text att behålla');
    await page.goBack();
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect(loss).toBeVisible({ timeout: 1000 });
    await expect(
      loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
    ).toBeFocused();
    await loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('Text att behålla');
    await expect(page).toHaveURL(new RegExp(`/households/${household.id}$`));
    await page.goBack();
    await loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(page).toHaveURL(settings);
    const state: MapState = await (
      await page.request.get(`${installation.origin}/api/households/${household.id}/map`)
    ).json();
    expect(state.draft.changes).toEqual([]);
  } finally {
    await installation.close();
  }
});

test('KARTA-10: create a complete object in the shared dialog and return without saving', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const before = await read();
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    const opener = table.getByRole('button', { name: /Nytt objekt/ });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Namn', exact: true })).toBeFocused();
    await expect(
      dialog.getByRole('button', { name: 'Grunduppgifter', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await dialog.getByRole('textbox', { name: 'Namn', exact: true }).fill('Alex blå cykel');
    await setProperty(dialog, 'Beskrivning', 'Hela cykelns beskrivning.');
    await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(opener).toBeFocused();
    const after = await read();
    expect(after.objects).toEqual(before.objects);
    expect(after.draft.changes).toHaveLength(1);
    expect(after.draft.changes[0].after).toMatchObject({
      name: 'Alex blå cykel',
      properties: expect.arrayContaining([
        expect.objectContaining({
          label: 'Beskrivning',
          kind: 'text',
          value: 'Hela cykelns beskrivning.',
        }),
      ]),
    });
  } finally {
    await installation.close();
  }
});

test('KARTA-14: image and full form stage atomically and invalid image preserves the unsent form', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const before = await read();
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await dialog.getByLabel('Namn', { exact: true }).fill('Cykeln med bild');
    await setProperty(dialog, 'Beskrivning', 'Text och bild skickas tillsammans.');
    await dialog.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    const image = dialog.getByLabel('Profilbild', { exact: true });
    await expect(image).toBeVisible({ timeout: 1000 });
    await image.setInputFiles({
      name: 'bad.png',
      mimeType: 'image/png',
      buffer: Buffer.from('not an image'),
    });
    await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('bild');
    expect((await read()).draft).toEqual(before.draft);
    await dialog.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
    await expect(dialog.getByLabel('Namn', { exact: true })).toHaveValue('Cykeln med bild');
    await expect(
      propertyRow(dialog, 'Beskrivning').getByLabel('Värde', { exact: true }),
    ).toHaveValue('Text och bild skickas tillsammans.');
    await dialog.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    const png = await sharp({
      create: { width: 30, height: 20, channels: 3, background: '#0088ff' },
    })
      .png()
      .toBuffer();
    await image.setInputFiles({ name: 'bike.png', mimeType: 'image/png', buffer: png });
    await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const after = await read();
    expect(after.draft.version).toBe(before.draft.version + 1);
    expect(after.draft.changes).toHaveLength(1);
    expect(after.draft.changes[0].after).toMatchObject({
      name: 'Cykeln med bild',
      properties: expect.arrayContaining([
        expect.objectContaining({
          label: 'Beskrivning',
          kind: 'text',
          value: 'Text och bild skickas tillsammans.',
        }),
      ]),
      profileImageId: expect.any(String),
    });
    expect(after.objects).toEqual(before.objects);
    const savedImage = await page.request.get(
      `${installation.origin}/api/households/${household.id}/profile-images/${after.draft.changes[0].after?.profileImageId}`,
    );
    expect(savedImage.status()).toBe(200);
    expect(savedImage.headers()['content-type']).toBe('image/webp');
  } finally {
    await installation.close();
  }
});

test('KARTA-11: closed-section errors preserve all fields and focus the linked correction', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const before = await read();
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await dialog.getByLabel('Namn', { exact: true }).fill('Hela cykeln');
    await setProperty(dialog, 'Pris', 'inte ett tal', 'number');
    const row = propertyRow(dialog, 'Pris');
    await dialog.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
    await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const summary = dialog.getByRole('alert', { name: 'Formuläret innehåller fel' });
    await expect(summary).toBeFocused();
    expect((await read()).draft).toEqual(before.draft);
    await summary.getByRole('link', { name: /Värde/ }).click();
    await expect(
      dialog.getByRole('button', { name: 'Fria egenskaper', exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(row.getByLabel('Värde', { exact: true })).toBeFocused();
    await row.getByLabel('Värde', { exact: true }).fill('399');
    await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    expect((await read()).draft.changes[0].after).toMatchObject({
      name: 'Hela cykeln',
      properties: [expect.objectContaining({ label: 'Pris', kind: 'number', value: 399 })],
    });
  } finally {
    await installation.close();
  }
});

test('KARTA-12: identity, free properties, lifecycle and icon stay together when staging and editing', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    expect(
      (
        await post('object-type', {
          version: 0,
          id: 'bicycle',
          baseRevision: null,
          value: { name: 'Cykel', description: '' },
        })
      ).status(),
    ).toBe(200);
    expect((await post('save', { version: 1, operationId: 'bicycle-definition' })).status()).toBe(
      200,
    );
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await expect(dialog.getByLabel('Identitet', { exact: true })).toBeVisible({ timeout: 1000 });
    await dialog.getByLabel('Namn', { exact: true }).fill('Pendlarcykeln');
    await dialog.getByLabel('Objekttyp', { exact: true }).selectOption('bicycle');
    await dialog.getByLabel('Identitet', { exact: true }).selectOption('unspecified');
    await setProperty(dialog, 'Beskrivning', 'Hela cykelns beskrivning.');
    await setProperty(dialog, 'Tillverkare', 'Exempelcykel');
    await setProperty(dialog, 'Antal växlar', '8', 'number');
    await setProperty(dialog, 'Inköpsdatum', '2026-04-03', 'date');
    await setProperty(dialog, 'Elcykel', 'false', 'boolean');
    await dialog.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await dialog.getByLabel('Objektets status', { exact: true }).selectOption('ended');
    await dialog.getByLabel('Sök ikon', { exact: true }).fill('bike');
    await dialog.getByRole('button', { name: 'Välj Cykel', exact: true }).click();
    await setProperty(dialog, 'Slutdatum', '2026-04-04', 'date');
    await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const proposal = (await read()).draft.changes[0];
    expect(proposal.after).toMatchObject({
      name: 'Pendlarcykeln',
      typeId: 'bicycle',
      identity: 'unspecified',
      lifecycle: 'ended',
      iconId: 'bike',
      properties: [
        {
          id: expect.any(String),
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Hela cykelns beskrivning.',
        },
        {
          id: expect.any(String),
          label: 'Tillverkare',
          kind: 'text' as const,
          value: 'Exempelcykel',
        },
        { id: expect.any(String), label: 'Antal växlar', kind: 'number' as const, value: 8 },
        {
          id: expect.any(String),
          label: 'Inköpsdatum',
          kind: 'date' as const,
          value: '2026-04-03',
        },
        { id: expect.any(String), label: 'Elcykel', kind: 'boolean' as const, value: false },
        { id: expect.any(String), label: 'Slutdatum', kind: 'date' as const, value: '2026-04-04' },
      ],
    });
    expect((await read()).objects).toHaveLength(0);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    const filters = page.getByRole('dialog', { name: 'Tabellens filter', exact: true });
    await filters.getByLabel('Ta med upphörda').check();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Redigera Pendlarcykeln', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Redigera Pendlarcykeln', exact: true });
    await expect(edit.getByRole('button', { name: 'Grunduppgifter', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(edit.getByLabel('Identitet', { exact: true })).toHaveValue('unspecified');
    await expect(propertyRow(edit, 'Beskrivning').getByLabel('Värde', { exact: true })).toHaveValue(
      'Hela cykelns beskrivning.',
    );
    await edit.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
    await expect(propertyRow(edit, 'Tillverkare').getByLabel('Värde', { exact: true })).toHaveValue(
      'Exempelcykel',
    );
    await expect(
      propertyRow(edit, 'Antal växlar').getByLabel('Värde', { exact: true }),
    ).toHaveValue('8');
    await expect(propertyRow(edit, 'Inköpsdatum').getByLabel('Värde', { exact: true })).toHaveValue(
      '2026-04-03',
    );
    await expect(propertyRow(edit, 'Elcykel').getByLabel('Värde', { exact: true })).toHaveValue(
      'false',
    );
    await edit.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await expect(edit.getByLabel('Objektets status', { exact: true })).toHaveValue('ended');
    await edit.getByLabel('Sök ikon', { exact: true }).fill('bike');
    await expect(edit.getByRole('button', { name: 'Välj Cykel', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await edit.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
    await expect(propertyRow(edit, 'Slutdatum').getByLabel('Värde', { exact: true })).toHaveValue(
      '2026-04-04',
    );
    await edit.getByRole('button', { name: 'Grunduppgifter', exact: true }).click();
    await edit.getByLabel('Namn', { exact: true }).fill('Pendlarcykeln i garaget');
    await edit.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(edit).not.toBeVisible();
    expect((await read()).draft.changes[0].after).toEqual({
      ...proposal.after,
      name: 'Pendlarcykeln i garaget',
    });
    expect((await read()).objects).toHaveLength(0);
  } finally {
    await installation.close();
  }
});

test('KARTA-13: changing type preserves all individual property identities and values', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const post = (route: string, data: unknown) =>
      page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
    let current: MapState = await (await page.request.get(path)).json();
    const nextType = current.types[0];
    expect(
      (
        await post('object-type', {
          version: current.draft.version,
          id: 'cycle-fields',
          baseRevision: null,
          value: { name: 'Cykel med ramnummer', description: '' },
        })
      ).status(),
    ).toBe(200);
    current = await (await page.request.get(path)).json();
    const proposed = {
      name: 'Cykeln',
      typeId: 'cycle-fields',
      properties: [
        {
          id: 'description',
          label: 'Beskrivning',
          kind: 'text' as const,
          value: 'Behåll beskrivningen',
        },
        { id: 'frame', label: 'Ramnummer', kind: 'text' as const, value: 'ABC123' },
        { id: 'price', label: 'Pris', kind: 'text' as const, value: '1200 SEK' },
      ],
    };
    expect(
      (
        await post('draft', {
          version: current.draft.version,
          id: 'bike-form',
          baseRevision: null,
          value: proposed,
        })
      ).status(),
    ).toBe(200);
    current = await (await page.request.get(path)).json();
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Tabell', exact: true }).click();
    await page.getByRole('button', { name: 'Redigera Cykeln', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Redigera Cykeln', exact: true });
    await dialog.getByLabel('Objekttyp', { exact: true }).focus();
    await dialog.getByLabel('Objekttyp', { exact: true }).selectOption(nextType.id);
    await expect(dialog.getByLabel('Objekttyp', { exact: true })).toHaveValue(nextType.id);
    await dialog.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
    await expect(propertyRow(dialog, 'Ramnummer').getByLabel('Värde', { exact: true })).toHaveValue(
      'ABC123',
    );
    expect((await (await page.request.get(path)).json()).draft).toEqual(current.draft);
    await dialog.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    const after: MapState = await (await page.request.get(path)).json();
    expect(after.draft.changes[0].after).toEqual({ ...proposed, typeId: nextType.id });
  } finally {
    await installation.close();
  }
});

test('KARTA-15: close and Escape protect only unsent form changes and restore the editing focus', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const form = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    await form.getByLabel('Namn', { exact: true }).fill('Redan i utkastet');
    await form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(form).not.toBeVisible();
    const staged: MapState = await (await page.request.get(path)).json();
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    const name = form.getByLabel('Namn', { exact: true });
    await name.fill('Oskickad cykel');
    await page.keyboard.press('Escape');
    const loss = page.getByRole('dialog', { name: 'Lämna ändrade uppgifter?', exact: true });
    await expect(loss.getByRole('button', { name: 'Fortsätt redigera', exact: true })).toBeFocused({
      timeout: 1000,
    });
    await page.keyboard.press('Escape');
    await expect(loss).not.toBeVisible();
    await expect(name).toBeFocused();
    await expect(name).toHaveValue('Oskickad cykel');
    await form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
    await loss.getByRole('button', { name: 'Fortsätt redigera', exact: true }).click();
    await expect(
      form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }),
    ).toBeFocused();
    await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await loss.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    await expect(form).not.toBeVisible();
    expect((await (await page.request.get(path)).json()).draft).toEqual(staged.draft);
    await page.getByRole('button', { name: 'Nytt objekt', exact: true }).click();
    await expect(form.getByLabel('Namn', { exact: true })).toHaveValue('');
    await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(form).not.toBeVisible();
    await expect(loss).not.toBeVisible();
  } finally {
    await installation.close();
  }
});

for (const width of [1440, 320]) {
  test(`${width === 1440 ? 'KARTA-20' : 'KARTA-22'}: individual properties keep their order and complete values in the single-section dialog at ${width}px`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      await page.setViewportSize({ width, height: 900 });
      await signIn(page.request, installation.origin);
      const { household } = await (await createHousehold(page.request, installation.origin)).json();
      const path = `${installation.origin}/api/households/${household.id}/map`;
      const read = async (): Promise<MapState> => (await page.request.get(path)).json();
      const post = (route: string, data: unknown) =>
        page.request.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
      expect(
        (
          await post('object-type', {
            version: 0,
            id: 'configured',
            baseRevision: null,
            value: { name: 'Dialogavtal', description: '' },
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await post('draft', {
            version: 1,
            id: 'contract',
            baseRevision: null,
            value: {
              typeId: 'configured',
              name: 'Hushållets avtal',
              properties: [
                {
                  id: 'description',
                  label: 'Beskrivning',
                  kind: 'text' as const,
                  value: 'Fullständig avtalstext',
                },
                { id: 'memo', label: 'Anteckning', kind: 'text' as const, value: 'Före rättelsen' },
                {
                  id: 'hidden',
                  label: 'Dolt underlag',
                  kind: 'text' as const,
                  value: 'Bevaras oförändrat',
                },
                { id: 'price', label: 'Pris', kind: 'text' as const, value: '249' },
              ],
            },
          })
        ).status(),
      ).toBe(200);
      expect((await post('save', { version: 2, operationId: 'configured-save' })).status()).toBe(
        200,
      );
      await page.goto(`${installation.origin}/households/${household.id}`);
      await page.getByRole('button', { name: 'Tabell', exact: true }).click();
      const opener = page.getByRole('button', { name: 'Redigera Hushållets avtal', exact: true });
      await opener.click();
      const form = page.getByRole('dialog', { name: 'Redigera Hushållets avtal', exact: true });
      await expect(
        form.getByRole('button', { name: 'Grunduppgifter', exact: true }),
      ).toHaveAttribute('aria-expanded', 'true');
      await form.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
      expect(await form.locator('button[aria-expanded="true"]').count()).toBe(1);
      expect(
        await form
          .locator('.property-editor-row')
          .getByLabel('Etikett', { exact: true })
          .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
      ).toEqual(['Beskrivning', 'Anteckning', 'Dolt underlag', 'Pris']);
      await expect(
        propertyRow(form, 'Anteckning').getByLabel('Värde', { exact: true }),
      ).toHaveValue('Före rättelsen');
      await expect(
        propertyRow(form, 'Dolt underlag').getByLabel('Värde', { exact: true }),
      ).toHaveValue('Bevaras oförändrat');
      await setProperty(form, 'Anteckning', 'Efter rättelsen');
      const footer = form.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true });
      await expect(footer).toBeVisible();
      const bounds = await footer.boundingBox();
      expect(
        bounds &&
          bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= width &&
          bounds.y + bounds.height <= 900,
      ).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(
        form.getByRole('button', { name: 'Stäng objektdialogen', exact: true }),
      ).toBeInViewport();
      await page.screenshot({ path: test.info().outputPath(`configured-dialog-${width}.png`) });
      await footer.click();
      await expect(opener).toBeFocused();
      const after = await read();
      expect(propertyValues(after.objects[0])?.memo).toBe('Före rättelsen');
      expect(after.draft.changes[0].after).toMatchObject({
        properties: [
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: 'Fullständig avtalstext',
          },
          { id: 'memo', label: 'Anteckning', kind: 'text' as const, value: 'Efter rättelsen' },
          {
            id: 'hidden',
            label: 'Dolt underlag',
            kind: 'text' as const,
            value: 'Bevaras oförändrat',
          },
          { id: 'price', label: 'Pris', kind: 'text' as const, value: '249' },
        ],
      });
      const proposal = await readDraftProposal(page, 'Hushållets avtal');
      await expect(proposal).toContainText('Efter rättelsen');
      await expect(proposal).toContainText('Bevaras oförändrat');
      await closeSupportDialog(page, 'Hushållets avtal');
      if (width === 1440) {
        await saveReviewedConflictDraft(page);
        await closeTextView(page);
        await installation.restart();
        await page.reload();
        const saved = await readTableObject(page, 'Hushållets avtal');
        await expect(saved).toContainText('Efter rättelsen');
        await expect(saved).toContainText('Bevaras oförändrat');
        await expect(saved).toContainText('Fullständig avtalstext');
        await expect(saved).toContainText('249');
        expect((await read()).objects[0].id).toBe(after.objects[0].id);
        expect((await read()).draft.changes).toEqual([]);
      }
    } finally {
      await installation.close();
    }
  });
}
