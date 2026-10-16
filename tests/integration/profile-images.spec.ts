import type { Page } from '@playwright/test';
import sharp from 'sharp';
import type { MapState } from '../../src/shared/map.js';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  signIn,
} from '../support/client.js';
import { saveReviewedConflictDraft } from '../support/conflict-special.js';
import { editTableObject } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { createPreparedContext, expect, test } from '../support/test.js';

async function expectSpatialPortrait(page: Page, imageId: string | null | undefined) {
  expect(imageId).toBeTruthy();
  const portrait = page
    .getByRole('region', { name: 'Rymdkarta', exact: true })
    .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
    .getByAltText('Profilbild för Lo Exempel');
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute('src', new RegExp(`/profile-images/${imageId}$`));
  await expect
    .poll(() =>
      portrait.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  const { data, info } = await sharp(await portrait.screenshot())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset =
    (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
  const pixel = [...data.subarray(offset, offset + 3)];
  // The uploaded synthetic blue pixels must actually paint inside the node.
  for (const [index, expected] of [0, 136, 255].entries()) {
    expect(Math.abs(pixel[index] - expected)).toBeLessThan(15);
  }
}

test('BILD-01: profile image proposals preserve text, survive restart and expose historical replacements', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const state = await read();
    await page.request.post(`${path}/draft`, {
      headers: { origin: installation.origin },
      data: {
        id: 'person',
        version: 0,
        baseRevision: null,
        value: {
          typeId: state.types[0].id,
          name: 'Lo Exempel',
          description: 'Bevara beskrivningen',
        },
      },
    });
    await page.goto(installation.origin);
    await editTableObject(page, 'Lo Exempel');
    await page
      .getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true })
      .getByRole('button', { name: 'Livscykel och utseende', exact: true })
      .click();
    const details = page.getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true });
    const source = await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#0088ff' },
    })
      .png()
      .toBuffer();
    await details
      .getByLabel('Profilbild', { exact: true })
      .setInputFiles({ name: 'syntetisk.png', mimeType: 'image/png', buffer: source });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const first = (await read()).draft.changes[0].after?.profileImageId;
    expect((await read()).objects).toEqual([]);
    await openMap(page);
    await expectSpatialPortrait(page, first);
    await editTableObject(page, 'Lo Exempel');
    await details.getByLabel('Beskrivning', { exact: true }).fill('Oskickad text');
    await details.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await expect(details.getByLabel('Profilbild', { exact: true })).toBeEnabled();
    expect((await read()).draft.changes[0].after?.description).toBe('Bevara beskrivningen');
    await details.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await installation.restart();
    await page.reload();
    await editTableObject(page, 'Lo Exempel');
    await page
      .getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true })
      .getByRole('button', { name: 'Livscykel och utseende', exact: true })
      .click();
    await expect(details.getByAltText('Profilbild för Lo Exempel')).toBeVisible();
    await details.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await openMap(page);
    await expectSpatialPortrait(page, first);
    await editTableObject(page, 'Lo Exempel');
    await details.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await details.getByLabel('Profilbild', { exact: true }).setInputFiles({
      name: 'ny.webp',
      mimeType: 'image/webp',
      buffer: await sharp(source).negate().webp().toBuffer(),
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const history = page.getByRole('region', { name: 'Ändringshistorik' });
    await history
      .getByRole('article')
      .first()
      .getByText('Visa ändringarna', { exact: true })
      .click();
    await expect(history.getByRole('article').first().getByRole('img')).toHaveCount(2);
    await expect(history.getByRole('article').first().getByRole('img').first()).toBeVisible();
    await expect(history.getByRole('article').first().getByRole('img').last()).toBeVisible();
    expect((await read()).objects[0].profileImageId).not.toBe(first);
    expect((await read()).objects[0].description).toBe('Oskickad text');
    await expect(history.getByRole('button', { name: 'Ångra sparandet' })).toHaveCount(0);
  } finally {
    await installation.close();
  }
});

test('BILD-02: invalid images retain proposals and interrupted removal recovers its durable receipt', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const state = await read();
    await page.request.post(`${path}/draft`, {
      headers: { origin: installation.origin },
      data: {
        id: 'person',
        version: 0,
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Bevara texten' },
      },
    });
    await page.goto(installation.origin);
    await editTableObject(page, 'Lo Exempel');
    await page
      .getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true })
      .getByRole('button', { name: 'Livscykel och utseende', exact: true })
      .click();
    const details = page.getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true });
    const source = await sharp({
      create: { width: 450, height: 600, channels: 3, background: '#992233' },
    })
      .jpeg()
      .toBuffer();
    await details
      .getByLabel('Profilbild', { exact: true })
      .setInputFiles({ name: 'bild.jpg', mimeType: 'image/jpeg', buffer: source });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const before = await read();
    await editTableObject(page, 'Lo Exempel');
    await details.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await details.getByLabel('Profilbild', { exact: true }).setInputFiles({
      name: 'fel.png',
      mimeType: 'image/png',
      buffer: Buffer.from('synthetic invalid pixels'),
    });
    await details.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(details.getByRole('alert')).toContainText('Profilbilden kunde inte läggas');
    expect(await read()).toEqual(before);
    await details
      .getByLabel('Profilbild', { exact: true })
      .setInputFiles({ name: 'stor.png', mimeType: 'image/png', buffer: Buffer.alloc(10_000_001) });
    await details.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
    await expect(details.getByRole('alert')).toContainText('Profilbilden kunde inte läggas');
    await details.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true }).click();
    expect(await read()).toEqual(before);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    await editTableObject(page, 'Lo Exempel');
    await page
      .getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true })
      .getByRole('button', { name: 'Livscykel och utseende', exact: true })
      .click();
    await details.getByRole('button', { name: 'Ta bort profilbilden ur formuläret' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect((await read()).objects[0].profileImageId).toBeDefined();
    await page.route(
      '**/map/save',
      async (route) => {
        await route.fetch();
        await route.abort('failed');
      },
      { times: 1 },
    );
    const draft = await openDraftReview(page);
    await draft.getByRole('button', { name: 'Spara hela utkastet' }).click();
    await expect(page.getByRole('dialog', { name: 'Spara utkastet' })).toContainText(
      'Sparandet kunde inte bekräftas.',
    );
    await page
      .getByRole('dialog', { name: 'Spara utkastet', exact: true })
      .getByRole('button', { name: 'Kontrollera sparandet igen', exact: true })
      .click();
    await expect(
      page.getByRole('dialog', { name: 'Spara utkastet', exact: true }),
    ).not.toBeVisible();
    await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
      'Utkastet är sparat',
    );
    await closeTextView(page);
    expect((await read()).objects[0].profileImageId).toBeUndefined();
    const history = (await (await page.request.get(`${path}/history`)).json()).history;
    expect(history).toHaveLength(2);
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const card = page
      .getByRole('region', { name: 'Ändringshistorik' })
      .getByRole('article')
      .first();
    await card.getByText('Visa ändringarna', { exact: true }).click();
    await expect(card.getByRole('img')).toHaveCount(1);
    await expect(card.getByRole('img')).toBeVisible();
    expect((await read()).objects[0].profileImageId).toBeUndefined();
    expect((await read()).draft.changes).toEqual([]);
  } finally {
    await installation.close();
  }
});

test('BILD-03: private, historical and known image addresses enforce current household access', async ({
  page,
  browser,
}) => {
  const installation = await createInstallation();
  const second = await createPreparedContext(browser);
  const anonymous = await createPreparedContext(browser);
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const images = `${installation.origin}/api/households/${household.id}/profile-images`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const state = await read();
    await page.request.post(`${path}/draft`, {
      headers: { origin: installation.origin },
      data: {
        id: 'person',
        version: 0,
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
      },
    });
    installation.setIdentity(robin);
    await signIn(second.request, installation.origin);
    const { user } = await (
      await second.request.get(`${installation.origin}/api/bootstrap`)
    ).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: installation.origin },
        data: { userId: user.id },
      })
    ).json();
    await second.request.post(`${installation.origin}/api/invitations/accept`, {
      headers: { origin: installation.origin },
      data: { code },
    });
    await page.goto(installation.origin);
    await editTableObject(page, 'Lo Exempel');
    await page
      .getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true })
      .getByRole('button', { name: 'Livscykel och utseende', exact: true })
      .click();
    const input = page.getByLabel('Profilbild', { exact: true });
    const source = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#332244' },
    })
      .webp()
      .toBuffer();
    await input.setInputFiles({ name: 'bild.webp', mimeType: 'image/webp', buffer: source });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const first = (await read()).draft.changes[0].after?.profileImageId;
    expect((await second.request.get(`${images}/${first}`)).status()).toBe(404);
    expect((await anonymous.request.get(`${images}/${first}`)).status()).toBe(401);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    expect((await second.request.get(`${images}/${first}`)).status()).toBe(200);
    await editTableObject(page, 'Lo Exempel');
    await page
      .getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true })
      .getByRole('button', { name: 'Livscykel och utseende', exact: true })
      .click();
    await input.setInputFiles({
      name: 'andra.webp',
      mimeType: 'image/webp',
      buffer: await sharp(source).negate().webp().toBuffer(),
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const replacementId = (await read()).draft.changes[0].after?.profileImageId;
    expect(replacementId).not.toBe(first);
    expect((await second.request.get(`${images}/${replacementId}`)).status()).toBe(404);
    await saveReviewedConflictDraft(page);
    await closeTextView(page);
    const replaced = await read();
    expect(replaced.objects[0].profileImageId).toBe(replacementId);
    expect(replaced.draft.changes).toEqual([]);
    const { history } = await (await page.request.get(`${path}/history`)).json();
    expect(history[0].changes[0]).toMatchObject({
      before: { profileImageId: first },
      after: { profileImageId: replacementId },
    });
    await page.getByRole('button', { name: 'Rapporter', exact: true }).click();
    const replacementCard = page
      .getByRole('region', { name: 'Ändringshistorik', exact: true })
      .getByRole('article')
      .first();
    await replacementCard.getByText('Visa ändringarna', { exact: true }).click();
    const historicalImages = replacementCard.getByAltText('Profilbild för Lo Exempel');
    await expect(historicalImages).toHaveCount(2);
    for (const [index, id] of [first, replacementId].entries()) {
      const image = historicalImages.nth(index);
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute('src', new RegExp(`/profile-images/${id}$`));
      await expect
        .poll(() =>
          image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
        )
        .toBe(true);
    }
    expect(await read()).toEqual(replaced);
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    // The old image is retained only through history; the replacement is current.
    for (const id of [first, replacementId])
      expect((await second.request.get(`${images}/${id}`)).status()).toBe(200);
    await editTableObject(page, 'Lo Exempel');
    await page
      .getByRole('dialog', { name: 'Redigera Lo Exempel', exact: true })
      .getByRole('button', { name: 'Livscykel och utseende', exact: true })
      .click();
    await input.setInputFiles({
      name: 'tredje.webp',
      mimeType: 'image/webp',
      buffer: await sharp(source).grayscale().webp().toBuffer(),
    });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true })
      .click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    const privateId = (await read()).draft.changes[0].after?.profileImageId;
    expect(privateId).not.toBe(first);
    expect(privateId).not.toBe(replacementId);
    expect((await second.request.get(`${images}/${privateId}`)).status()).toBe(404);
    const imageIds = [first, replacementId, privateId];
    for (const id of imageIds)
      expect((await anonymous.request.get(`${images}/${id}`)).status()).toBe(401);
    await page.request.post(`${path.replace('/map', '')}/members/${user.id}/revoke`, {
      headers: { origin: installation.origin },
      data: {},
    });
    for (const id of imageIds)
      expect((await second.request.get(`${images}/${id}`)).status()).toBe(403);
    installation.seedMembership(user.id, 'elsewhere', 'Annat hushåll');
    expect(
      (await second.request.get(`${installation.origin}/api/households/elsewhere/map`)).status(),
    ).toBe(200);
    expect((await second.request.get(path)).status()).toBe(403);
    for (const id of imageIds)
      expect(
        (
          await second.request.get(
            `${installation.origin}/api/households/elsewhere/profile-images/${id}`,
          )
        ).status(),
      ).toBe(404);
    const headers = {
      origin: installation.origin,
      'x-skyttel-draft-version': '0',
      'x-skyttel-content-version': String(state.contentVersion),
      'x-skyttel-object-revision': '1',
    };
    for (const actor of [second.request, anonymous.request]) {
      const status = actor === second.request ? 403 : 401;
      expect((await actor.post(`${images}/person`, { headers, data: source })).status()).toBe(
        status,
      );
      expect((await actor.delete(`${images}/person`, { headers })).status()).toBe(status);
    }
  } finally {
    await second.close();
    await anonymous.close();
    await installation.close();
  }
});
