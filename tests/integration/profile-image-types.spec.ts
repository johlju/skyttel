import sharp from 'sharp';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import {
  closeSupportDialog,
  closeTextView,
  createHousehold,
  openDraftReview,
  openNewObject,
  signIn,
} from '../support/client.js';
import { openSavedHistory, readCommittedHistoryCard } from '../support/conversation-page.js';
import { editTableObject, readDraftProposal } from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { propertyValue, setProperty } from '../support/property-controls.js';
import { expect, test } from '../support/test.js';

const typeName = 'Egen bildtyp';
test(`BILD-06: ${typeName} shares text, icon and image in one proposal and removes the latest image`, async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const path = `${installation.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    expect(
      (
        await page.request.post(`${path}/object-type`, {
          headers: { origin: installation.origin },
          data: {
            id: 'own-image-type',
            version: 0,
            baseRevision: null,
            value: { name: typeName, description: 'Egen typ med profilbild' },
          },
        })
      ).status(),
    ).toBe(200);
    await page.goto(installation.origin);
    await openNewObject(page);
    const name = `Bild för ${typeName}`;
    const newForm = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
    const form = page.locator('dialog.object-dialog-C');
    const stage = async (expectedStatus: 200 | 400 = 200) => {
      const response = page.waitForResponse(
        (response) =>
          response.url() === `${path}/object-form` && response.request().method() === 'POST',
      );
      const submit = form.getByRole('button', {
        name: 'Lägg i utkastet och stäng',
        exact: true,
      });
      await submit.click();
      expect((await response).status()).toBe(expectedStatus);
      if (expectedStatus === 200) await expect(form).not.toBeVisible();
      else {
        await expect(form).toBeVisible();
        await expect(submit).toBeEnabled();
      }
    };
    const appearance = () =>
      form.getByRole('button', { name: 'Livscykel och utseende', exact: true }).click();
    await newForm.getByLabel('Namn', { exact: true }).fill(name);
    await newForm.getByLabel('Objekttyp', { exact: true }).selectOption({ label: typeName });
    await setProperty(newForm, 'Beskrivning', 'Text i samma förslag');
    await appearance();
    const picker = form.getByRole('region', { name: 'Ikon', exact: true });
    await picker.getByRole('searchbox', { name: 'Sök ikon' }).fill('cykel');
    await picker.getByRole('button', { name: 'Välj Cykel', exact: true }).click();
    const imageInput = form.getByLabel('Profilbild', { exact: true });
    const source = await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#0088ff' },
    })
      .png()
      .toBuffer();
    await imageInput.setInputFiles({ name: 'bild.png', mimeType: 'image/png', buffer: source });
    await expect(form.getByAltText(`Profilbild för ${name}`)).toBeVisible();
    expect((await read()).draft.changes).toEqual([]);
    await stage();
    const proposed = await read();
    expect(proposed.objects).toEqual([]);
    expect(proposed.draft.changes).toHaveLength(1);
    const first = proposed.draft.changes[0];
    const initialProperties = first.after?.properties;
    expect(initialProperties).toEqual([
      {
        id: expect.any(String),
        label: 'Beskrivning',
        kind: 'text',
        value: 'Text i samma förslag',
      },
    ]);
    const correctedProperties = initialProperties?.map((property) => ({
      ...property,
      value: 'Ny text före bildbytet',
    }));
    expect(first.after).toMatchObject({
      name,
      properties: initialProperties,
      iconId: 'bike',
      profileImageId: expect.any(String),
    });
    expect(first.type.name).toBe(typeName);
    const edit = async () => {
      await editTableObject(page, name);
    };
    const save = async (): Promise<SaveReceipt> => {
      const draft = await openDraftReview(page);
      const response = page.waitForResponse(
        (response) => response.url() === `${path}/save` && response.request().method() === 'POST',
      );
      await draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
      const saved = await response;
      expect(saved.status()).toBe(200);
      await expect(
        page.getByRole('dialog', { name: 'Spara utkastet', exact: true }),
      ).not.toBeVisible();
      await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toHaveText(
        'Utkastet är sparat',
      );
      await closeTextView(page);
      return (await saved.json()).receipt;
    };
    const readProposal = async (removal: boolean) => {
      const proposal = await readDraftProposal(page, name);
      for (const [title, description, image] of [
        ...(removal ? [['Sparade värden', 'Text i samma förslag', true] as const] : []),
        [
          'Föreslagna värden',
          removal ? 'Ny text före bildbytet' : 'Text i samma förslag',
          !removal,
        ] as const,
      ]) {
        const side = proposal
          .locator('section')
          .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
        for (const [label, value] of [
          ['Namn', name],
          ['Typ', typeName],
          ['Beskrivning', `${description} (Text)`],
          ['Ikon', 'Cykel'],
          ['Gäller', 'Aktuellt'],
          ['Status', 'Gäller fortfarande'],
          ['Profilbild', image ? 'Profilbild finns' : 'Ej uppgivet'],
        ])
          await expect(
            side
              .locator('dt')
              .filter({ hasText: new RegExp(`^${label}(?: · ändrat)?$`) })
              .locator('..')
              .locator('dd'),
          ).toContainText(value);
        if (image) {
          const displayed = side.getByRole('img');
          await expect(displayed).toBeVisible();
          await expect(displayed).toHaveAttribute(
            'src',
            new RegExp(`${first.after?.profileImageId}$`),
          );
          await expect
            .poll(() => displayed.evaluate((element) => (element as HTMLImageElement).naturalWidth))
            .toBeGreaterThan(0);
        } else await expect(side.getByRole('img')).toHaveCount(0);
      }
      await closeSupportDialog(page, name);
    };
    const readHistory = async (receipts: SaveReceipt[]) => {
      const history = await openSavedHistory(page);
      await expect(history.getByRole('article')).toHaveCount(receipts.length);
      for (const [index, receipt] of receipts.entries()) {
        await expect(history.getByRole('article').nth(index)).toHaveAttribute(
          'data-save',
          receipt.operationId,
        );
        const card = await readCommittedHistoryCard(history, receipt);
        const changes = card.getByText('Visa ändringarna', { exact: true });
        if ((await changes.locator('..').getAttribute('open')) === null) await changes.click();
        const change = card
          .locator('.history-changes > div')
          .filter({ has: page.getByRole('heading', { name: `Objekt: ${name}`, exact: true }) });
        for (const [title, value] of [
          ['Före sparandet', receipt.changes[0].before],
          ['Efter sparandet', receipt.changes[0].after],
        ] as const) {
          const side = change.locator(`xpath=./*[preceding-sibling::h5[1][text()="${title}"]]`);
          if (!value) {
            await expect(side.filter({ hasText: 'Fanns inte i kartan' })).toBeVisible();
            continue;
          }
          await expect(side.filter({ hasText: `Namn: ${name}.` })).toBeVisible();
          await expect(side.filter({ hasText: `Objekttyp: ${typeName}.` })).toBeVisible();
          await expect(
            side.filter({
              hasText: String(propertyValue(value, 'Beskrivning') ?? ''),
            }),
          ).toBeVisible();
          const identity = side.filter({
            has: page.getByText('Objektets identitet', { exact: true }),
          });
          if ((await identity.getAttribute('open')) === null)
            await identity.getByText('Objektets identitet', { exact: true }).click();
          await expect(identity.getByText(first.id, { exact: true })).toBeVisible();
          if (value.profileImageId) {
            const actualImage = change.locator(
              `xpath=./img[preceding-sibling::h5[1][text()="${title}"]]`,
            );
            await expect(actualImage).toBeVisible();
            await expect(actualImage).toHaveAttribute(
              'src',
              new RegExp(`${first.after?.profileImageId}$`),
            );
            await expect(side.filter({ hasText: 'Ikon: Cykel' })).toBeVisible();
          } else {
            await expect(side.filter({ hasText: 'Ingen profilbild' })).toBeVisible();
            await expect(side.filter({ hasText: 'Cykel' })).toBeVisible();
            await expect(
              change.locator(`xpath=./img[preceding-sibling::h5[1][text()="${title}"]]`),
            ).toHaveCount(0);
          }
        }
      }
      await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    };
    await readProposal(false);
    const initialReceipt = await save();
    expect(initialReceipt.changes).toHaveLength(1);
    expect(initialReceipt.changes[0]).toMatchObject({ before: null, after: first.after });
    const shared = await read();
    expect(shared.objects).toHaveLength(1);
    expect(shared.objects[0]).toMatchObject({ ...first.after });
    expect(shared.draft.changes).toEqual([]);
    await readHistory([initialReceipt]);
    await edit();
    await setProperty(form, 'Beskrivning', 'Ny text före bildbytet');
    await appearance();
    await imageInput.setInputFiles({
      name: 'ny.webp',
      mimeType: 'image/webp',
      buffer: await sharp(source).negate().webp().toBuffer(),
    });
    expect(await read()).toEqual(shared);
    await stage();
    const replacement = await read();
    expect(replacement.draft.changes).toHaveLength(1);
    const latest = replacement.draft.changes[0].after?.profileImageId;
    expect(latest).toBeTruthy();
    expect(latest).not.toBe(first.after?.profileImageId);
    expect(replacement.objects).toEqual(shared.objects);
    expect(replacement.draft.changes[0].after).toMatchObject({
      name,
      typeId: first.after?.typeId,
      iconId: 'bike',
      properties: correctedProperties,
    });
    await edit();
    await appearance();
    await imageInput.setInputFiles([]);
    expect(await read()).toEqual(replacement);
    await imageInput.setInputFiles({
      name: 'fel.png',
      mimeType: 'image/png',
      buffer: Buffer.from('synthetic invalid pixels'),
    });
    await stage(400);
    await expect(form.getByRole('alert')).toContainText(
      'Profilbilden kunde inte läggas i utkastet',
    );
    expect(await read()).toEqual(replacement);
    await form
      .getByRole('button', { name: 'Ta bort profilbilden ur formuläret', exact: true })
      .click();
    await expect(form.getByAltText(`Profilbild för ${name}`)).toHaveCount(0);
    await picker.getByRole('searchbox', { name: 'Sök ikon' }).fill('cykel');
    await expect(picker.getByRole('button', { name: 'Välj Cykel', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await read()).toEqual(replacement);
    await stage();
    const removed = await read();
    expect(removed.objects).toEqual(shared.objects);
    expect(removed.draft.changes).toHaveLength(1);
    expect(removed.draft.changes[0].id).toBe(first.id);
    expect(removed.draft.changes[0].after).toMatchObject({
      name,
      typeId: first.after?.typeId,
      iconId: 'bike',
      properties: correctedProperties,
    });
    expect(removed.draft.changes[0].after).not.toHaveProperty('profileImageId');
    await readProposal(true);
    const removedReceipt = await save();
    expect(removedReceipt.operationId).not.toBe(initialReceipt.operationId);
    expect(removedReceipt.changes).toHaveLength(1);
    expect(removedReceipt.changes[0].before).toMatchObject({
      profileImageId: first.after?.profileImageId,
      iconId: 'bike',
      properties: initialProperties,
    });
    expect(removedReceipt.changes[0].after).toMatchObject({
      id: first.id,
      name,
      typeId: first.after?.typeId,
      iconId: 'bike',
      properties: correctedProperties,
    });
    expect(removedReceipt.changes[0].after).not.toHaveProperty('profileImageId');
    const final = await read();
    expect(final.draft.changes).toEqual([]);
    expect(final.objects).toHaveLength(1);
    expect(final.objects[0]).toEqual(removedReceipt.changes[0].after);
    expect(final.objects[0]).not.toHaveProperty('profileImageId');
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([
      removedReceipt,
      initialReceipt,
    ]);
    await readHistory([removedReceipt, initialReceipt]);
  } finally {
    await installation.close();
  }
});
