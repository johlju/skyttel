import type { Locator } from '@playwright/test';
import { closeTextView } from '../support/client.js';
import { consentBox, giveConversationConsent } from '../support/conversation-page.js';
import { openTypeDefinitions } from '../support/domain-work.js';
import {
  prepareDraftReview,
  prepareDraftReviewLifecycle,
  prepareDraftReviewMeanings,
  prepareDraftReviewWrapping,
} from '../support/draft-review.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';
import { modelMessage, textModel } from '../support/text-model.js';

test('UTKAST-31: long unbroken field labels wrap in full draft reading at 320 CSS pixels', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { household, customLabel, builtinLabel, read } = await prepareDraftReviewWrapping(
      page.request,
      installation.origin,
    );
    const before = await read();
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const opener = page.getByRole('button', {
      name: 'Visa förslaget: Alex blå cykel',
      exact: true,
    });
    await opener.click();
    const modal = page.getByRole('dialog', { name: 'Alex blå cykel', exact: true });
    for (const label of [customLabel, builtinLabel]) {
      const field = modal.locator('dt').filter({ hasText: label });
      await expect(field).toHaveCount(1);
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeVisible();
    }
    for (const area of [modal, modal.locator('.draft-read-body')])
      expect(await area.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

test('UTKAST-32: lifecycle-only object and relationship proposals distinguish effective changes and explicit modes', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    const { household, read } = await prepareDraftReviewLifecycle(
      page.request,
      installation.origin,
    );
    const before = await read();
    await page.goto(`${installation.origin}/households/${household.id}`);
    await page.getByRole('button', { name: 'Utkast', exact: true }).click();
    const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
    await expect(draft.getByRole('columnheader')).toHaveText([
      'Symbol',
      'Namn',
      'Typ',
      'Vad som ändras',
    ]);
    await expect(draft.getByRole('rowheader')).toHaveCount(4);
    for (const [name, expired] of [
      ['Utgånget provobjekt', true],
      ['Framtida provobjekt', false],
      ['Utgånget provobjekt → granskar → Blå cykel', true],
      ['Framtida provobjekt → granskar → Blå cykel', false],
    ] as const) {
      const opener = draft.getByRole('button', { name: `Visa förslaget: ${name}`, exact: true });
      const summary = draft
        .getByRole('row')
        .filter({
          has: page.getByRole('button', { name: `Visa förslaget: ${name}`, exact: true }),
        })
        .getByRole('cell')
        .last();
      await expect(summary).toHaveText(
        `${expired ? 'Gäller: Upphört → Aktuellt' : ''}Status: Följ slutdatum → Gäller fortfarande`,
      );
      await opener.click();
      const modal = page.getByRole('dialog', { name, exact: true });
      for (const [title, applies, mode] of [
        ['Sparade värden', expired ? 'Upphört' : 'Aktuellt', 'Följ slutdatum'],
        ['Föreslagna värden', 'Aktuellt', 'Gäller fortfarande'],
      ]) {
        const side = modal
          .locator('section')
          .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
        for (const [label, expected] of [
          ['Gäller', applies],
          ['Status', mode],
        ]) {
          const field = side.locator('dl > div').filter({
            has: page.locator('dt').filter({ hasText: new RegExp(`^${label}(?: · ändrat)?$`) }),
          });
          await expect(field.locator('dd')).toHaveText(expected);
        }
      }
      await page.keyboard.press('Escape');
      await expect(opener).toBeFocused();
    }
    expect(await read()).toEqual(before);
  } finally {
    await installation.close();
  }
});

for (const mobile of [false, true])
  test(`${mobile ? 'UTKAST-92' : 'UTKAST-90'}: ${mobile ? 'mobile' : 'desktop'} complete draft review works without AI or consent`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      const { household, read } = await prepareDraftReview(page.request, installation.origin);
      const before = await read();
      const starts: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && /text-assistant(?:\/|$)/.test(request.url()))
          starts.push(request.url());
      });
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      await page.goto(`${installation.origin}/households/${household.id}`);
      const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
      await tools.getByRole('button', { name: 'Utkast', exact: true }).click();
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await expect(draft).toBeVisible();
      await expect(draft.getByRole('columnheader')).toHaveText([
        'Symbol',
        'Namn',
        'Typ',
        'Vad som ändras',
      ]);
      await expect(consentBox(page)).not.toBeVisible();
      const button = draft.getByRole('button', {
        name: 'Visa förslaget: Alex blå cykel',
        exact: true,
      });
      await button.focus();
      await page.keyboard.press('Enter');
      const modal = page.getByRole('dialog', { name: 'Alex blå cykel', exact: true });
      await expect(
        modal.getByRole('heading', { name: 'Alex blå cykel', exact: true }),
      ).toBeFocused();
      await expect(modal.getByRole('heading', { name: 'Sparade värden' })).toBeVisible();
      await expect(modal.getByRole('heading', { name: 'Föreslagna värden' })).toBeVisible();
      for (const value of [
        'SPARAT-17',
        'FÖRESLAGET-42',
        'Hela den sparade beskrivningen',
        'Fullständig föreslagen beskrivning',
        'Uttryckligen inget',
        'Okänt',
        '500 SEK (Osäkert uppgivet) · datum för uppgiften: 2026-01-01',
      ])
        await expect(modal.getByText(value, { exact: true })).toBeVisible();
      await expect(modal.getByRole('button')).toHaveCount(1);
      await page.screenshot({
        path: `/tmp/skyttel-244/252-read-${mobile ? 'mobile' : 'desktop'}.png`,
      });
      await page.keyboard.press('Tab');
      await expect(modal.getByRole('button', { name: 'Stäng dialogen' })).toBeFocused();
      await page.keyboard.press('Tab');
      expect(await modal.evaluate((element) => element.contains(document.activeElement))).toBe(
        true,
      );
      await page.keyboard.press('Escape');
      await expect(button).toBeFocused();
      for (const [name, detail] of [
        ['Utkastfordon', 'Föreslagen fältbeskrivning'],
        ['Granskar', 'kontrolleras av'],
      ]) {
        await draft.getByRole('button', { name: `Visa förslaget: ${name}`, exact: true }).click();
        const dialog = page.getByRole('dialog', { name, exact: true });
        await expect(dialog.getByText(detail, { exact: false }).last()).toBeVisible();
        await dialog.getByRole('button', { name: 'Stäng dialogen' }).click();
      }
      const edge = draft
        .getByRole('button', { name: /Visa förslaget:.*→.*Ospecificerat fordon/ })
        .first();
      await edge.click();
      await expect(
        page.getByRole('dialog').getByText('Hela dolda uppgiften known', { exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(draft.getByRole('row', { name: /Olöst fordon/ })).toContainText(
        'Identiteten är olöst',
      );
      await expect(
        draft
          .getByRole('row', { name: /Ospecificerat fordon/ })
          .first()
          .locator('.draft-row-warning'),
      ).toHaveCount(0);
      await expect(draft.locator('.draft-row-warning')).toHaveCount(2);
      expect(starts).toEqual([]);
      expect(await read()).toEqual(before);
      await draft.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.screenshot({ path: `/tmp/skyttel-244/252-${mobile ? 'mobile' : 'desktop'}.png` });
    } finally {
      await installation.close();
    }
  });

test('UTKAST-91: empty and type-only drafts preserve unsent text and first send asks consent once', async ({
  page,
}) => {
  let messages = 0;
  const submitted: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/messages'))
      submitted.push(request.postDataJSON().text);
  });
  const installation = await createInstallation(undefined, {
    modelFetch: textModel(() => {
      messages++;
      return [modelMessage('Ett provsvar.')];
    }).provider,
  });
  try {
    const { household, post, read } = await prepareDraftReview(page.request, installation.origin);
    await post('discard', {});
    await page.goto(`${installation.origin}/households/${household.id}`);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg', exact: true });
    await expect(tools.getByRole('button', { name: 'Utkast', exact: true })).toHaveCount(0);
    await tools.getByRole('button', { name: 'Skriv till Skyttel', exact: true }).click();
    await expect(consentBox(page)).not.toBeVisible();
    await page.getByRole('button', { name: /^Visa utkastet/ }).click();
    await expect(page.getByText('Utkastet är tomt.', { exact: true })).toBeVisible();
    const message = page.getByLabel('Meddelande till Skyttel', { exact: true });
    await message.fill('Behåll å, ä och ö i mitt meddelande');
    await page.getByRole('button', { name: 'Stäng textvyn' }).click();
    await tools.getByRole('button', { name: 'Tabell', exact: true }).click();
    await tools.getByRole('button', { name: 'Skriv till Skyttel', exact: true }).click();
    await expect(message).toHaveValue('Behåll å, ä och ö i mitt meddelande');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(consentBox(page)).toBeVisible();
    await giveConversationConsent(page);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText('Ett provsvar.');
    expect(messages).toBe(1);
    expect(submitted).toEqual(['Behåll å, ä och ö i mitt meddelande']);
    await expect(message).toHaveValue('');
    await closeTextView(page);
    await openTypeDefinitions(page);
    await page.getByRole('button', { name: 'Ny objekttyp', exact: true }).click();
    const definition = page.getByRole('group', { name: 'Objekttypens definition', exact: true });
    await definition.getByLabel('Typens namn').fill('Endast typförslag');
    const typeResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/map/object-type') && response.request().method() === 'POST',
    );
    await definition.getByRole('button', { name: 'Lägg typförslaget i mitt utkast' }).click();
    const stagedType = await typeResponse;
    expect(stagedType.status(), await stagedType.text()).toBe(200);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await page.reload();
    await expect(tools.getByRole('button', { name: 'Utkast', exact: true })).toBeVisible();
    await tools.getByRole('button', { name: 'Utkast', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Visa förslaget: Endast typförslag' }),
    ).toBeVisible();
    expect((await read()).draft.objectTypes).toHaveLength(1);
  } finally {
    await installation.close();
  }
});

for (const mobile of [false, true])
  test(`${mobile ? 'UTKAST-93' : 'UTKAST-27'}: ${mobile ? 'mobile' : 'desktop'} draft reading preserves lifecycle, images and configured field meanings`, async ({
    page,
  }) => {
    const installation = await createInstallation();
    try {
      const { household, read } = await prepareDraftReviewMeanings(
        page.request,
        installation.origin,
      );
      const before = await read();
      const starts: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && /text-assistant(?:\/|$)/.test(request.url()))
          starts.push(request.url());
      });
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      );
      await page.goto(`${installation.origin}/households/${household.id}`);
      await page
        .getByRole('navigation', { name: 'Kartans verktyg', exact: true })
        .getByRole('button', { name: 'Utkast', exact: true })
        .click();
      const draft = page.getByRole('region', { name: 'Utkastet', exact: true });
      await draft.getByRole('button', { name: 'Visa förslaget: Blå cykel', exact: true }).click();
      const modal = page.getByRole('dialog');
      const saved = modal.locator('section').filter({
        has: page.getByRole('heading', { name: 'Sparade värden', exact: true }),
      });
      const proposed = modal.locator('section').filter({
        has: page.getByRole('heading', { name: 'Föreslagna värden', exact: true }),
      });
      const field = (section: Locator, label: string) =>
        section.locator('dl > div').filter({
          has: page.locator('dt').filter({ hasText: new RegExp(`^${label}(?: · ändrat)?$`) }),
        });
      async function lifecycle() {
        await expect(field(saved, 'Gäller').locator('dd')).toHaveText('Upphört');
        await expect(field(proposed, 'Gäller').locator('dd')).toHaveText('Aktuellt');
        await expect(field(saved, 'Status').locator('dd')).toHaveText('Följ slutdatum');
        await expect(field(proposed, 'Status').locator('dd')).toHaveText('Gäller fortfarande');
        await expect(field(proposed, 'Gäller')).toHaveClass('draft-value-changed');
        await expect(field(proposed, 'Status')).toHaveClass('draft-value-changed');
      }
      await lifecycle();
      await expect(field(saved, 'Fordonets berättelse').locator('dd')).toHaveText(
        'Hela den sparade beskrivningen',
      );
      await expect(field(proposed, 'Cykelns berättelse').locator('dd')).toHaveText('Ej uppgivet');
      await expect(field(proposed, 'Cykelns berättelse')).toHaveClass('draft-value-changed');
      for (const side of [saved, proposed]) {
        await expect(field(side, 'Avtalat pris').locator('dd')).toHaveText('Ej uppgivet');
        await expect(field(side, 'Avtalat pris')).not.toHaveClass('draft-value-changed');
        await expect(field(side, 'Sista giltighetsdag').locator('dd')).toHaveText('2000-01-01');
        await expect(field(side, 'Profilbild')).toHaveClass('draft-value-changed');
        const image = field(side, 'Profilbild').getByRole('img', {
          name: 'Profilbild för Blå cykel',
        });
        await expect(image).toBeVisible();
        await expect
          .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
          .toBe(96);
      }
      const savedImage = await saved.getByRole('img').getAttribute('src');
      const proposedImage = await proposed.getByRole('img').getAttribute('src');
      expect(savedImage).not.toEqual(proposedImage);
      const imageBytes = [];
      for (const source of [savedImage, proposedImage]) {
        const response = await page.request.get(`${installation.origin}${source}`);
        expect(response.status()).toBe(200);
        imageBytes.push(await response.body());
      }
      expect(imageBytes[0]).not.toEqual(imageBytes[1]);
      await page.screenshot({
        path: `/tmp/skyttel-244/252-meanings-${mobile ? 'mobile' : 'desktop'}.png`,
      });
      await page.keyboard.press('Escape');
      await draft
        .getByRole('button', {
          name: 'Visa förslaget: Blå cykel → granskar → Röd cykel',
          exact: true,
        })
        .click();
      await lifecycle();
      for (const side of [saved, proposed])
        await expect(field(side, 'Slutdatum').locator('dd')).toHaveText('2000-01-01');
      await expect(consentBox(page)).not.toBeVisible();
      expect(starts).toEqual([]);
      expect(await read()).toEqual(before);
    } finally {
      await installation.close();
    }
  });
