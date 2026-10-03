import { readFile } from 'node:fs/promises';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { unzipSync, zipSync } from 'fflate';
import { createHousehold, openSettings, signIn } from '../support/client.js';
import {
  openConversationDraft,
  startConversationWithText,
  turnMicrophoneOn,
} from '../support/conversation-page.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const view = (page: Page) => page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const handle = (page: Page, part: 'text' | 'draft') =>
  view(page).getByRole('separator', {
    name: part === 'text' ? 'Ändra samtalstextens bredd' : 'Ändra utkastlistans bredd',
    exact: true,
  });
const widths = (page: Page) => page.getByRole('region', { name: 'Textvyns bredd', exact: true });
async function openDraft(page: Page) {
  await expect(view(page)).toBeVisible();
  return openConversationDraft(page);
}
async function settings(page: Page) {
  await openSettings(page);
  await page
    .locator('.settings-cards')
    .getByRole('link', { name: /^Samtal med Skyttel/ })
    .click();
}
async function arrange(page: Page, available = true) {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    ...(available ? { modelFetch: textModel(() => [modelMessage('Ett provsvar.')]).provider } : {}),
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin, 'Breddprov')).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  expect(
    (
      await page.request.post(`${path}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id: 'lo',
          baseRevision: null,
          value: { typeId: state.types[0].id, name: 'Lo Exempel', description: '' },
        },
      })
    ).status(),
  ).toBe(200);
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(`${app.origin}/households/${household.id}`);
  return {
    app,
    household,
    path,
    read: async () => (await page.request.get(`${path}/conversation-preferences`)).json(),
  };
}
async function drag(page: Page, control: Locator, delta: number) {
  const box = await control.boundingBox();
  if (!box) throw new Error('The width handle is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - delta, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
}
async function value(control: Locator, expected: number) {
  await expect(control).toHaveAttribute('aria-valuenow', String(expected));
}
async function renderedWidths(page: Page, text: number, draft: number) {
  await expect
    .poll(async () => (await view(page).locator('.text-view-conversation').boundingBox())?.width)
    .toBe(text - 1); // The enclosing panel owns its one-pixel outer border.
  await expect
    .poll(
      async () =>
        (await view(page).getByRole('region', { name: 'Utkastet', exact: true }).boundingBox())
          ?.width,
    )
    .toBe(draft);
}

test('TEXTBREDD-01: handtagen ändrar bredderna var för sig utan att avbryta samtalet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { app, path, read } = await arrange(page);
  try {
    await startConversationWithText(page);
    await openDraft(page);
    await value(handle(page, 'text'), 400);
    await value(handle(page, 'draft'), 340);
    await renderedWidths(page, 400, 340);
    await turnMicrophoneOn(page);
    const before = await page.evaluate(() => window.skyttelVoiceFixture.stats());
    const draftBefore = (await (await page.request.get(path)).json()).draft;
    const field = view(page).getByRole('textbox', { name: 'Meddelande till Skyttel' });
    await field.fill('Oskickat medan bredden ändras');
    const fieldNode = await field.elementHandle();
    const writes: object[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/conversation-preferences') && request.method() === 'POST')
        writes.push(request.postDataJSON());
    });
    await drag(page, handle(page, 'text'), 96);
    await value(handle(page, 'text'), 496);
    await value(handle(page, 'draft'), 340);
    await expect(field).toBeFocused();
    await drag(page, handle(page, 'draft'), 72);
    await value(handle(page, 'draft'), 412);
    await value(handle(page, 'text'), 496);
    await expect(field).toBeFocused();
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    await page.route('**/conversation-preferences', async (route) => {
      if (route.request().method() === 'POST' && !held) {
        held = true;
        await wait;
      }
      await route.continue();
    });
    await handle(page, 'text').focus();
    await page.keyboard.press('ArrowLeft');
    await value(handle(page, 'text'), 520);
    await page.keyboard.press('ArrowRight');
    await value(handle(page, 'text'), 496);
    await handle(page, 'draft').focus();
    await page.keyboard.press('ArrowRight');
    await value(handle(page, 'draft'), 388);
    await expect(handle(page, 'draft')).toBeFocused();
    release();
    await expect.poll(read).toMatchObject({ textWidth: 496, draftWidth: 388 });
    await page.unroute('**/conversation-preferences');
    await renderedWidths(page, 496, 388);
    expect(writes).toEqual([
      { textWidth: 496 },
      { draftWidth: 412 },
      { textWidth: 520 },
      { textWidth: 496 },
      { draftWidth: 388 },
    ]);
    expect(
      await fieldNode?.evaluate((node) => node === document.querySelector('.text-view textarea')),
    ).toBe(true);
    await expect(field).toHaveValue('Oskickat medan bredden ändras');
    expect((await (await page.request.get(path)).json()).draft).toEqual(draftBefore);
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats())).toEqual(before);
    await expect(handle(page, 'text')).toHaveAttribute('aria-orientation', 'vertical');
    await expect(handle(page, 'draft')).toHaveAttribute('aria-valuemin', '260');
    await expect(handle(page, 'text')).toHaveAccessibleDescription(
      'Dra eller använd vänster- och högerpil för att ändra bredden.',
    );
    expect((await handle(page, 'text').boundingBox())?.width).toBe(24);
    await drag(page, handle(page, 'text'), -1000);
    await value(handle(page, 'text'), 300);
    await drag(page, handle(page, 'draft'), -1000);
    await value(handle(page, 'draft'), 260);
    await drag(page, handle(page, 'text'), 2000);
    await value(handle(page, 'text'), 1240);
    const box = await view(page).boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(99);
    await expect.poll(read).toMatchObject({ textWidth: 1240, draftWidth: 260 });
  } finally {
    await app.close();
  }
});

test('TEXTBREDD-02: bredderna följer användaren och skärmens begränsning sparas inte', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { app, household, read } = await arrange(page);
  const device = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const member = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  try {
    await startConversationWithText(page);
    await openDraft(page);
    await drag(page, handle(page, 'text'), 224);
    await drag(page, handle(page, 'draft'), 120);
    await expect.poll(read).toMatchObject({ textWidth: 624, draftWidth: 460 });
    const { user: alex } = await (await page.request.get(`${app.origin}/api/bootstrap`)).json();
    const otherId = 'width-other-household';
    app.seedMembership(alex.id, otherId, 'Andra hushållet', 'administrator');
    await signIn(device.request, app.origin);
    const second = await device.newPage();
    await second.goto(`${app.origin}/households/${otherId}`);
    await startConversationWithText(second);
    await openDraft(second);
    await value(handle(second, 'text'), 624);
    await value(handle(second, 'draft'), 460);
    await second.setViewportSize({ width: 850, height: 900 });
    await value(handle(second, 'text'), 490);
    await value(handle(second, 'draft'), 260);
    expect((await view(second).boundingBox())?.x).toBeGreaterThanOrEqual(99);
    await expect.poll(read).toMatchObject({ textWidth: 624, draftWidth: 460 });
    await view(second)
      .getByRole('button', { name: /^Dölj utkastet/ })
      .click();
    await expect(handle(second, 'draft')).toHaveCount(0);
    await value(handle(second, 'text'), 624);
    await openDraft(second);
    await value(handle(second, 'text'), 490);
    await second.setViewportSize({ width: 1600, height: 900 });
    await value(handle(second, 'text'), 624);
    await value(handle(second, 'draft'), 460);
    await handle(second, 'draft').press('ArrowLeft');
    await expect.poll(read).toMatchObject({ textWidth: 624, draftWidth: 484 });
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await value(handle(page, 'draft'), 484);
    app.setIdentity(robin);
    await signIn(member.request, app.origin, 'microsoft');
    const { user } = await (await member.request.get(`${app.origin}/api/bootstrap`)).json();
    const invitation = await page.request.post(
      `${app.origin}/api/households/${household.id}/invitations`,
      {
        headers: { origin: app.origin },
        data: { userId: user.id },
      },
    );
    expect(
      (
        await member.request.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code: (await invitation.json()).code },
        })
      ).status(),
    ).toBe(200);
    const third = await member.newPage();
    await third.goto(`${app.origin}/households/${household.id}`);
    await startConversationWithText(third);
    await openDraft(third);
    await value(handle(third, 'text'), 400);
    await value(handle(third, 'draft'), 340);
    await app.restart();
    await second.reload();
    await startConversationWithText(second);
    await openDraft(second);
    await value(handle(second, 'text'), 624);
    await value(handle(second, 'draft'), 484);
  } finally {
    await device.close();
    await member.close();
    await app.close();
  }
});

test('TEXTBREDD-03: bredderna återställs i Inställningar även utan tillgängligt samtal', async ({
  page,
}) => {
  const { app, path, read } = await arrange(page, false);
  try {
    await settings(page);
    await expect(widths(page)).toContainText('Gäller dig i alla dina hushåll.');
    await expect(widths(page)).toContainText('Du har inte ändrat bredderna.');
    await expect(widths(page).getByRole('button')).toHaveCount(0);
    expect(await widths(page).innerText()).not.toMatch(/\d/);
    // Arrange existing personal choices; resetting them goes through the visible controls.
    expect(
      (
        await page.request.post(`${path}/conversation-preferences`, {
          headers: { origin: app.origin },
          data: { textWidth: 624, draftWidth: 460, showDraftOnStart: true },
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(
      page.getByText('Samtal med Skyttel är inte tillgängligt just nu.', { exact: true }),
    ).toBeVisible();
    const reset = widths(page).getByRole('button', { name: 'Återställ bredderna' });
    await expect(reset).toBeVisible();
    expect(await widths(page).innerText()).not.toMatch(/\d/);
    await page.route('**/conversation-preferences', (route) =>
      route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue(),
    );
    await reset.click();
    await expect(widths(page).getByRole('status')).toHaveText(
      'Bredderna kunde inte sparas. Försök igen.',
    );
    await expect(reset).toBeFocused();
    await page.unroute('**/conversation-preferences');
    await reset.press('Enter');
    await expect(widths(page).getByRole('status')).toHaveText('Bredderna är återställda');
    await expect(reset).toHaveCount(0);
    await expect(widths(page).getByRole('heading')).toBeFocused();
    await expect(widths(page)).toContainText('Du har inte ändrat bredderna.');
    await expect.poll(read).toEqual({ textWidth: 400, draftWidth: 340, showDraftOnStart: true });
  } finally {
    await app.close();
  }
});

for (const mode of [
  { name: 'smal dator', viewport: { width: 700, height: 900 }, hasTouch: false, isMobile: false },
  { name: 'telefon', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: 'bred pekskärm', viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true },
]) {
  test.describe(mode.name, () => {
    test.use({ viewport: mode.viewport, hasTouch: mode.hasTouch, isMobile: mode.isMobile });
    test('TEXTBREDD-04: mobil enhet och smal skärm har inga breddhandtag', async ({ page }) => {
      const { app, path, read } = await arrange(page);
      try {
        await page.request.post(`${path}/conversation-preferences`, {
          headers: { origin: app.origin },
          data: { textWidth: 624, draftWidth: 460 },
        });
        await page.reload();
        await startConversationWithText(page);
        await openDraft(page);
        await expect(view(page).getByRole('separator')).toHaveCount(0);
        if (mode.isMobile && mode.viewport.width > 700)
          expect((await view(page).boundingBox())?.width).toBe(400);
        await settings(page);
        if (mode.isMobile) await expect(widths(page)).toHaveCount(0);
        else
          await expect(
            widths(page).getByRole('button', { name: 'Återställ bredderna' }),
          ).toBeVisible();
        await expect.poll(read).toMatchObject({ textWidth: 624, draftWidth: 460 });
      } finally {
        await app.close();
      }
    });
  });
}

test('TEXTBREDD-05: äldre hushållsarkiv lämnar personliga samtalsval kvar', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const { app, household, path, read } = await arrange(page);
  try {
    await startConversationWithText(page, { remember: true });
    await openDraft(page);
    await drag(page, handle(page, 'text'), 224);
    await drag(page, handle(page, 'draft'), 120);
    await expect.poll(read).toMatchObject({ textWidth: 624, draftWidth: 460 });
    const consentPath = `${app.origin}/api/households/${household.id}/conversation-consent`;
    const consent = await (await page.request.get(consentPath)).json();
    expect(consent.saved).not.toBeNull();
    await settings(page);
    await page
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Fullständig export', exact: true })
      .click();
    const section = page.getByRole('region', { name: 'Fullständig export', exact: true });
    await section.getByRole('button', { name: 'Förbered fullständig export' }).click();
    const pending = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Hämta ZIP-fil' }).click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const file = await download.path();
    if (!file) throw new Error('The household archive was not downloaded');
    const parts = unzipSync(new Uint8Array(await readFile(file)));
    const manifest = JSON.parse(Buffer.from(parts['manifest.json']).toString());
    expect(manifest.schemaVersion).toBe(24);
    const encoded = Buffer.from(parts['content.json']).toString();
    for (const field of [
      'showDraftOnStart',
      'textWidth',
      'draftWidth',
      'conversationPreferences',
      'conversationConsent',
    ])
      expect(encoded).not.toContain(field);
    // Household payload and checksums are unchanged by the personal-only migration.
    // This is a valid schema-23 archive, submitted through the actual upload UI.
    manifest.schemaVersion = 23;
    parts['manifest.json'] = Buffer.from(JSON.stringify(manifest));
    await page
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Samtal med Skyttel', exact: true })
      .click();
    await widths(page).getByRole('button', { name: 'Återställ bredderna' }).click();
    await expect(widths(page).getByRole('status')).toHaveText('Bredderna är återställda');
    await page
      .getByRole('checkbox', { name: 'Visa utkastet när ett samtal börjar', exact: true })
      .check();
    await expect.poll(read).toEqual({ textWidth: 400, draftWidth: 340, showDraftOnStart: true });
    await page
      .getByRole('navigation', { name: 'Inställningarnas sidor' })
      .getByRole('link', { name: 'Återimportera hushållet', exact: true })
      .click();
    await page.getByLabel('Skyttel-export (ZIP)').setInputFiles({
      name: 'skyttel-schema-23.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from(zipSync(parts)),
    });
    await page.getByRole('button', { name: 'Kontrollera importfil' }).click();
    await expect(page.getByText('Filen är kontrollerad.', { exact: false })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Jag vill ersätta allt hushållsinnehåll' }).check();
    await page.getByRole('button', { name: 'Ersätt hushållets innehåll' }).click();
    await expect(
      page.getByText('Hushållets innehåll är ersatt. Nuvarande åtkomst är bevarad.'),
    ).toBeVisible();
    await expect.poll(read).toEqual({ textWidth: 400, draftWidth: 340, showDraftOnStart: true });
    expect(await (await page.request.get(consentPath)).json()).toEqual(consent);
    expect((await (await page.request.get(path)).json()).draft.changes).toEqual([
      expect.objectContaining({ id: 'lo', after: expect.objectContaining({ name: 'Lo Exempel' }) }),
    ]);
  } finally {
    await app.close();
  }
});
