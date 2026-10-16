import type { Page } from '@playwright/test';
import {
  closeTextView,
  createHousehold,
  openDraftReview,
  openMap,
  openNewObject,
  openSettings,
  openTable,
  signIn,
  utilityButton,
} from '../support/client.js';
import {
  chooseConversationText,
  consentBox,
  giveConversationConsent,
  microphoneButton,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { expect, test } from '../support/test.js';
import { modelMessage, textModel } from '../support/text-model.js';
import { readVoiceProposal } from '../support/voice-work-reading.js';

const help = (page: Page) =>
  page.getByRole('region', { name: 'Information och hjälp', exact: true });
const field = (page: Page) =>
  page.getByRole('textbox', { name: 'Meddelande till Skyttel', exact: true });
async function openHelp(page: Page) {
  const button = await utilityButton(page, 'Information och hjälp');
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(
    help(page).getByRole('heading', { name: 'Information och hjälp', exact: true }),
  ).toBeFocused();
  return button;
}
async function shortcut(page: Page, held = false) {
  await page.keyboard.down('Control');
  await page.keyboard.down('Space');
  if (held) await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.up('Space');
  await page.keyboard.up('Control');
}
async function arrange(page: Page) {
  const live = liveProvider();
  const model = textModel(() => [modelMessage('Lo-förslaget ligger kvar i utkastet.')]);
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin, 'Hjälpprov')).json();
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  return { app, household, live, model };
}

test.describe('Windows och Linux', () => {
  test('YTA-07: hjälpen förklarar samtalet och leder till rätt kontroller', async ({ page }) => {
    await page.addInitScript(
      (value) => Object.defineProperty(navigator, 'platform', { configurable: true, value }),
      'Win32',
    );
    const { app, household, model, live } = await arrange(page);
    try {
      const button = await openHelp(page);
      const text = await help(page).innerText();
      expect(text).toContain('Röst och text är samma samtal');
      expect(text).toContain('Kartans teckenförklaring');
      expect(text).toContain('rött × och streckad linje');
      expect(text).toContain('samma riktade ändpunkter');
      expect(text).toContain('Punktade kopplingar');
      expect(text).toContain('Höjdhjälpens streckade markeringar');
      expect(text).toContain('separat ring');
      expect(text).toContain('tre sekunder');
      expect(text).toContain('Släpp stänger av ny inspelning direkt');
      expect(text).toContain('även efter släpp');
      expect(text).toContain('Ctrl+Mellanslag');
      expect(text).toContain('Kort tryck räcker alltid');
      expect(text).toContain('Skyttel kan höra och förstå fel');
      expect(text).toContain('samtalstexten kan innehålla fel');
      expect(text).toContain('hela ditt utkast');
      expect(text).toContain('Återkalla och avsluta samtalet');
      expect(text).toContain('Skyttel begär att OpenAI inte lagrar samtalet');
      expect(text).toContain('loggar för att förebygga missbruk');
      expect(text).toContain('inte behandling enbart i EU eller omedelbar radering');
      expect(text).toContain('Kartans formulär finns kvar som alternativ till samtalet');
      expect(text).toContain('Välj Tabell');
      expect(text).toContain('Välj Skriv till Skyttel och Visa utkastet');
      expect(text).toContain('Genomförda sparanden finns under Rapporter, Ändringshistorik');
      expect(text).toContain('oskickade samtalsmeddelande finns kvar');
      expect(text).toContain('Fortsätt redigera behåller formulärändringarna');
      expect(text).toContain('Kasta ändringarna och fortsätt kastar bara');
      expect(text).not.toMatch(/Välj Lista|Utkast och historik|Tidigare sparförsök/);
      expect(text).not.toMatch(/talsamtal|textassistent|assistenten|kontextfönster|store:|API/i);
      await expect(
        help(page).getByRole('link', { name: 'Läs OpenAI:s datavillkor', exact: true }),
      ).toHaveAttribute('href', 'https://developers.openai.com/api/docs/guides/your-data');
      expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests)).toBe(
        0,
      );
      expect(model.requests).toHaveLength(0);
      expect(live.requests).toHaveLength(0);
      await page.keyboard.press('Escape');
      await expect(button).toBeFocused();

      // Follow the documented form alternative before granting conversation consent.
      await openTable(page);
      await openNewObject(page);
      const object = page.getByRole('dialog', { name: 'Nytt objekt', exact: true });
      await object.getByLabel('Namn', { exact: true }).fill('Oskickat formulär');
      await object.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      await expect(
        page.getByRole('button', { name: 'Fortsätt redigera', exact: true }),
      ).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(object.getByLabel('Namn', { exact: true })).toHaveValue('Oskickat formulär');
      await object.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      await page
        .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
        .click();
      await expect(object).not.toBeVisible();
      await openNewObject(page);
      await expect(object.getByLabel('Namn', { exact: true })).toHaveValue('');
      await page.getByLabel('Namn', { exact: true }).fill('Lo Exempel');
      await page.getByRole('button', { name: 'Lägg i utkastet och stäng', exact: true }).click();
      const draft = await openDraftReview(page);
      await expect(draft).toContainText('Lo Exempel');
      await readVoiceProposal(page, 'Lo Exempel', 'Ej uppgivet');
      await expect(consentBox(page)).toHaveCount(0);
      expect(model.requests).toHaveLength(0);
      expect(live.requests).toHaveLength(0);
      await closeTextView(page);
      await (await utilityButton(page, 'Rapporter')).click();
      await expect(page.getByRole('tab', { name: 'Ändringshistorik', exact: true })).toBeVisible();
      await expect(page.getByText('Inga genomförda sparanden.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
      await openMap(page);
      await shortcut(page);
      await expect(consentBox(page)).toContainText('Släpp stänger av ny inspelning direkt.');
      await giveConversationConsent(page, { remember: true });
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
      await expect(voiceBox(page)).toContainText('Lyssnar');
      await shortcut(page);
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      await shortcut(page, true);
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      expect(
        (await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).every(
          (track) => !track.enabled,
        ),
      ).toBe(true);
      await chooseConversationText(page);
      await expect(field(page)).toBeVisible();
      await expect(consentBox(page)).toHaveCount(0);
      await field(page).fill('Vad finns i utkastet?');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
        'Lo-förslaget ligger kvar i utkastet.',
      );
      expect(model.requests.length).toBeGreaterThan(0);
      expect(live.requests.length).toBeGreaterThan(0);
      expect(model.requests.every((request) => request.store === false)).toBe(true);
      expect(live.requests.every((request) => request.session.store === false)).toBe(true);
      await field(page).fill('Oskickat medan hjälpen läses');
      await openHelp(page);
      await page.keyboard.press('Escape');
      await closeTextView(page);
      await openTable(page);
      await openNewObject(page);
      await object.getByLabel('Namn', { exact: true }).fill('Kastas utan att röra samtalet');
      await object.getByRole('button', { name: 'Stäng objektdialogen', exact: true }).click();
      await page
        .getByRole('button', { name: 'Kasta ändringarna och fortsätt', exact: true })
        .click();
      await openMap(page);
      await chooseConversationText(page);
      await expect(consentBox(page)).toHaveCount(0);
      await expect(page.getByRole('log', { name: 'Samtalstext', exact: true })).toContainText(
        'Lo-förslaget ligger kvar i utkastet.',
      );
      await expect(field(page)).toHaveValue('Oskickat medan hjälpen läses');
      await expect(await openDraftReview(page)).toContainText('Lo Exempel');
      await readVoiceProposal(page, 'Lo Exempel', 'Ej uppgivet');
      expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests)).toBe(
        1,
      );

      await openSettings(page);
      await page
        .locator('.settings-cards')
        .getByRole('link', { name: /^Samtal med Skyttel/ })
        .click();
      await page.getByRole('button', { name: 'Återkalla medgivandet', exact: true }).click();
      const confirmation = page.getByRole('dialog', {
        name: 'Återkalla medgivandet',
        exact: true,
      });
      await expect(confirmation).toContainText('Utkastet med 1');
      await confirmation
        .getByRole('button', { name: 'Återkalla och avsluta samtalet', exact: true })
        .click();
      await expect(
        page.getByRole('region', { name: 'Medgivande', exact: true }).getByRole('status'),
      ).toHaveText('Medgivandet är återkallat');
      const path = `${app.origin}/api/households/${household.id}`;
      expect(
        (await (await page.request.get(`${path}/conversation-consent`)).json()).saved,
      ).toBeNull();
      expect((await (await page.request.get(`${path}/map`)).json()).draft.changes).toEqual([
        expect.objectContaining({ after: expect.objectContaining({ name: 'Lo Exempel' }) }),
      ]);
      await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
      await expect(voiceBox(page)).toHaveCount(0);
      await chooseConversationText(page);
      await expect(consentBox(page)).toHaveCount(0);
      await page
        .getByRole('region', { name: 'Skriv till Skyttel', exact: true })
        .getByRole('button', { name: 'Nytt samtal', exact: true })
        .click();
      await expect(consentBox(page)).toBeVisible();
    } finally {
      await app.close();
    }
  });
});

test('YTA-08: hjälpens långa text går att läsa och stänga på smal skärm', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const { app } = await arrange(page);
  try {
    await expect(
      page.getByRole('button', { name: 'Information och hjälp', exact: true }),
    ).toBeVisible();
    const button = await openHelp(page);
    await expect(
      page.getByRole('button', { name: 'Visa verktygens namn', exact: true }),
    ).toBeVisible();
    await expect(
      help(page).getByRole('heading', { name: 'Håll in för att tala', exact: true }),
    ).toHaveCount(1);
    await page.keyboard.press('End');
    await expect(
      help(page).getByText(/Kasta ändringarna och fortsätt kastar bara/),
    ).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    const panel = await help(page).boundingBox();
    expect((panel?.x ?? 0) + (panel?.width ?? 0)).toBeLessThanOrEqual(320);
    expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(568);
    await page.keyboard.press('Tab');
    const policy = help(page).getByRole('link', {
      name: 'Läs OpenAI:s datavillkor',
      exact: true,
    });
    await expect(policy).toBeFocused();
    await expect(policy).toBeInViewport();
    expect((await policy.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Shift+Tab');
    await expect(
      help(page).getByRole('button', { name: 'Stäng verktyget', exact: true }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Visa verktygens namn', exact: true }).click();
    await expect(help(page)).toBeVisible();
    await page.getByRole('button', { name: 'Dölj verktygens namn', exact: true }).click();
    await expect(help(page)).toBeVisible();
    await help(page).getByRole('button', { name: 'Stäng verktyget', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(help(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    await openHelp(page);
    await page.keyboard.press('End');
    await expect(
      help(page).getByText(/Kasta ändringarna och fortsätt kastar bara/),
    ).toBeInViewport();
    await help(page).getByRole('button', { name: 'Stäng verktyget', exact: true }).click();
    await expect(help(page)).toHaveCount(0);
    await expect(button).toBeFocused();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests)).toBe(
      0,
    );
  } finally {
    await app.close();
  }
});
