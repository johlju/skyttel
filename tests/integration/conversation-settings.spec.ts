import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { bounds, contrast } from '../support/accessibility.js';
import { createHousehold, openSettings, signIn } from '../support/client.js';
import { specifiedConsentText } from '../support/conversation.js';
import {
  chooseConversationVoice,
  consentBox,
  consentBoxFor,
  giveConversationConsent,
  openConversationText,
  startConversationWithVoice,
} from '../support/conversation-page.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const householdName = 'Familjen Berg';
const refusal = { error: 'conversation_consent_required' };

type InstallationOptions = Parameters<typeof createInstallation>[1];
/** An installation that offers the conversation, with controlled answers and a silent voice. */
function installation(options: InstallationOptions = {}) {
  const live = liveProvider();
  return createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Ett provsvar.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
    ...options,
  });
}
/** Signs in the installation's current identity and creates its household. */
async function household(client: APIRequestContext, origin: string) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin, householdName)).json();
  const path = `${origin}/api/households/${household.id}`;
  return {
    path,
    consentPath: `${path}/conversation-consent`,
    startPath: `${path}/text-assistant`,
  };
}
/** Opens the household's map with the controlled microphone, and records what the conversation sends. */
async function openHousehold(page: Page, origin: string) {
  const sent: string[] = [];
  page.on('request', (request) => {
    const work = /\/text-assistant(?:\/[^/]+\/(.+))?$/.exec(request.url());
    if (request.method() === 'POST' && work) sent.push(work[1] ?? 'start');
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(origin);
  await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).toBeVisible();
  return sent;
}
const pageHeading = (page: Page) =>
  page.getByRole('heading', { name: 'Samtal med Skyttel', level: 1, exact: true });
/** Opens the page Samtal med Skyttel from the map, through the overview of Settings. */
async function openConversationSettings(page: Page) {
  await openSettings(page);
  await page
    .locator('.settings-cards')
    .getByRole('link', { name: /^Samtal med Skyttel/ })
    .click();
  await expect(pageHeading(page)).toBeFocused();
}
const returnToMap = async (page: Page) => {
  await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).toBeVisible();
};
/** The part Medgivande of the page, and what it shows and offers. */
function consentPart(page: Page) {
  const part = page.getByRole('region', { name: 'Medgivande', exact: true });
  return {
    part,
    texts: part.getByRole('paragraph'),
    buttons: part.getByRole('button'),
    save: part.getByRole('button', { name: 'Spara medgivandet', exact: true }),
    revoke: part.getByRole('button', { name: 'Återkalla medgivandet', exact: true }),
    feedback: part.getByRole('status'),
    status: (text: string) => part.getByText(text, { exact: true }),
  };
}
const months =
  'januari februari mars april maj juni juli augusti september oktober november december'.split(
    ' ',
  );
/** The status row for a consent that is saved, as the page of this browser writes its date. */
async function savedStatus(client: APIRequestContext, consentPath: string) {
  const { saved } = await (await client.get(consentPath)).json();
  const date = new Date(saved.savedAt);
  return `Sparat den ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}.`;
}
const saveConsent = (client: APIRequestContext, origin: string, consentPath: string) =>
  client.post(consentPath, { headers: { origin }, data: { textVersion: 1 } });
const microphones = (page: Page) =>
  page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks);
const liveMicrophones = async (page: Page) =>
  (await microphones(page)).filter((track) => track.state === 'live').length;

test('MEDGIVANDE-05: sidan Samtal med Skyttel visar medgivandet för alla medlemmar', async ({
  page,
  browser,
}) => {
  const app = await installation();
  try {
    const { path } = await household(page.request, app.origin);
    app.setIdentity(robin);
    const member = await browser.newContext();
    await signIn(member.request, app.origin, 'microsoft');
    const { user } = await (await member.request.get(`${app.origin}/api/bootstrap`)).json();
    const invitation = await page.request.post(`${path}/invitations`, {
      headers: { origin: app.origin },
      data: { userId: user.id },
    });
    await member.request.post(`${app.origin}/api/invitations/accept`, {
      headers: { origin: app.origin },
      data: { code: (await invitation.json()).code },
    });
    const memberPage = await member.newPage();

    for (const [role, visitor] of [
      ['administratör', page],
      ['medlem', memberPage],
    ] as const) {
      const sent = await openHousehold(visitor, app.origin);
      await openSettings(visitor);
      // The overview and the menu list the page after Rymdkartan in the group Hushållets karta.
      const group = (name: string) =>
        visitor
          .locator('section')
          .filter({ has: visitor.getByRole('heading', { name, level: 2, exact: true }) });
      const overview = visitor.locator('.settings-overview');
      await expect(overview.locator(group('Hushållets karta')).getByRole('link'), role).toHaveText([
        /^Rymdkartan/,
        /^Samtal med Skyttel→?Ditt medgivande, utkastet och textvyns bredd\.$/,
        /^Typer och egna fält/,
      ]);
      const menu = visitor.getByRole('navigation', { name: 'Inställningarnas sidor' });
      await expect(menu.locator(group('Hushållets karta')).getByRole('link'), role).toHaveText([
        'Rymdkartan',
        'Samtal med Skyttel',
        'Typer och egna fält',
      ]);
      await expect(menu.locator(group('Administration')), role).toHaveCount(
        role === 'administratör' ? 1 : 0,
      );

      await overview.getByRole('link', { name: /^Samtal med Skyttel/ }).click();
      await expect(pageHeading(visitor), role).toBeFocused();
      await expect(visitor).toHaveURL(/\/settings\/conversation$/);
      await expect(
        menu.getByRole('link', { name: 'Samtal med Skyttel', exact: true }),
      ).toHaveAttribute('aria-current', 'page');

      const consent = consentPart(visitor);
      await expect(consent.part.getByRole('heading', { level: 2 })).toHaveText('Medgivande');
      await expect(consent.texts, role).toHaveText([
        `Gäller dig i hushållet ${householdName}.`,
        ...specifiedConsentText,
        `Ett sparat medgivande gäller alla dina samtal i hushållet ${householdName} tills du återkallar det.`,
        'Inget medgivande är sparat.',
      ]);
      await expect(consent.buttons, role).toHaveText(['Spara medgivandet']);
      await expect(consent.feedback).toHaveText('');
      // Every control saves at once: the page has no button that saves the page.
      await expect(
        visitor.locator('.settings-content').getByRole('button', { name: 'Spara', exact: true }),
      ).toHaveCount(0);
      await expect(
        visitor.getByText('Samtal med Skyttel är inte tillgängligt just nu.', { exact: true }),
      ).toHaveCount(0);
      expect(sent, role).toEqual([]);
    }
    await member.close();
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-06: Spara medgivandet sparar direkt utan att starta ett samtal', async ({
  page,
  browser,
}) => {
  const app = await installation();
  try {
    const { consentPath } = await household(page.request, app.origin);
    const sent = await openHousehold(page, app.origin);
    await openConversationSettings(page);
    const consent = consentPart(page);
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();

    const before = Date.now();
    await consent.save.click();
    await expect(consent.feedback).toHaveText('Medgivandet är sparat');
    const status = await savedStatus(page.request, consentPath);
    await expect(consent.status(status)).toBeVisible();
    await expect(consent.status('Inget medgivande är sparat.')).toHaveCount(0);
    // The focus stays on the button, which now revokes.
    await expect(consent.buttons).toHaveText(['Återkalla medgivandet']);
    await expect(consent.revoke).toBeFocused();
    const { saved } = await (await page.request.get(consentPath)).json();
    expect(saved).toEqual({ textVersion: 1, savedAt: expect.any(String) });
    expect(Date.parse(saved.savedAt)).toBeGreaterThanOrEqual(before);
    // Saving started no conversation.
    expect(sent).toEqual([]);

    // The next press on a conversation button starts the conversation directly.
    await returnToMap(page);
    await chooseConversationVoice(page);
    await expect.poll(() => liveMicrophones(page)).toBe(1);
    await expect(consentBox(page)).toBeHidden();
    expect(sent[0]).toBe('start');

    // The saved consent follows the user to another device.
    const otherDevice = await browser.newContext();
    await signIn(otherDevice.request, app.origin);
    const otherPage = await otherDevice.newPage();
    await openHousehold(otherPage, app.origin);
    await openConversationSettings(otherPage);
    await expect(consentPart(otherPage).status(status)).toBeVisible();
    await expect(consentPart(otherPage).buttons).toHaveText(['Återkalla medgivandet']);
    await otherDevice.close();
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-07: Återkalla medgivandet gäller genast och Skyttel frågar igen', async ({
  page,
}) => {
  const app = await installation();
  try {
    const { consentPath, startPath } = await household(page.request, app.origin);
    await saveConsent(page.request, app.origin, consentPath);
    const status = await savedStatus(page.request, consentPath);
    const sent = await openHousehold(page, app.origin);
    await openConversationSettings(page);
    const consent = consentPart(page);
    await expect(consent.status(status)).toBeVisible();
    await expect(consent.buttons).toHaveText(['Återkalla medgivandet']);

    await consent.revoke.click();
    await expect(consent.feedback).toHaveText('Medgivandet är återkallat');
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
    await expect(consent.status(status)).toHaveCount(0);
    await expect(consent.buttons).toHaveText(['Spara medgivandet']);
    await expect(consent.save).toBeFocused();
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });
    // The server refuses a conversation for the user in the household, and says why.
    const refused = await page.request.post(startPath, {
      headers: { origin: app.origin },
      data: {},
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toEqual(refusal);

    // The revocation stays after a reload, and both conversation buttons ask again.
    await page.reload();
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
    await returnToMap(page);
    for (const choose of [chooseConversationVoice, openConversationText]) {
      await choose(page);
      await expect(consentBox(page)).toBeVisible();
      await consentBoxFor(page).decline.click();
      await expect(consentBox(page)).toBeHidden();
    }
    expect(sent).toEqual([]);
    expect(await microphones(page)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-08: medgivande för besöket går att återkalla och att spara', async ({ page }) => {
  const app = await installation();
  try {
    const { consentPath, startPath } = await household(page.request, app.origin);
    const sent = await openHousehold(page, app.origin);
    const consent = consentPart(page);
    const visit = 'Du har godkänt för det här besöket. Inget medgivande är sparat.';

    // Approved in the consent box without being saved: the page offers both to save and to revoke.
    await startConversationWithVoice(page);
    await expect.poll(() => liveMicrophones(page)).toBe(1);
    await openConversationSettings(page);
    await expect(consent.status(visit)).toBeVisible();
    await expect(consent.buttons).toHaveText(['Spara medgivandet', 'Återkalla medgivandet']);
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });

    // Revoking ends the consent for the visit. The pressed button is gone, and the focus goes to the other.
    await consent.revoke.click();
    await expect(consent.feedback).toHaveText('Medgivandet är återkallat');
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
    await expect(consent.buttons).toHaveText(['Spara medgivandet']);
    await expect(consent.save).toBeFocused();
    // The microphone is off, and the server refuses a conversation for the user.
    await expect.poll(() => liveMicrophones(page)).toBe(0);
    const refused = await page.request.post(startPath, {
      headers: { origin: app.origin },
      data: {},
    });
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toEqual(refusal);

    // The next press asks again. A new consent for the visit can be saved while the conversation goes on.
    await returnToMap(page);
    await chooseConversationVoice(page);
    await expect(consentBox(page)).toBeVisible();
    await expect(consentBoxFor(page).remember).not.toBeChecked();
    await giveConversationConsent(page);
    await expect.poll(() => liveMicrophones(page)).toBe(1);
    await openConversationSettings(page);
    await expect(consent.status(visit)).toBeVisible();
    const before = sent.length;
    await consent.save.click();
    await expect(consent.feedback).toHaveText('Medgivandet är sparat');
    await expect(consent.status(await savedStatus(page.request, consentPath))).toBeVisible();
    await expect(consent.buttons).toHaveText(['Återkalla medgivandet']);
    await expect(consent.revoke).toBeFocused();
    // The conversation is as it was: the microphone is on, and nothing was started or stopped.
    expect(await liveMicrophones(page)).toBe(1);
    expect(sent.slice(before).filter((work) => /start|stop/.test(work))).toEqual([]);
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-09: sidan visas och återkallar när samtalet inte är tillgängligt', async ({
  page,
}) => {
  // Without a model key the server does not offer the conversation.
  const app = await createInstallation();
  try {
    const { consentPath } = await household(page.request, app.origin);
    await saveConsent(page.request, app.origin, consentPath);
    const status = await savedStatus(page.request, consentPath);
    await openHousehold(page, app.origin);
    await openConversationSettings(page);
    const consent = consentPart(page);
    const unavailable = page
      .locator('.settings-content')
      .getByText('Samtal med Skyttel är inte tillgängligt just nu.', { exact: true });
    await expect(unavailable).toBeVisible();
    await expect(consent.status(status)).toBeVisible();
    await expect(consent.texts).toContainText(specifiedConsentText);
    await expect(consent.buttons).toHaveText(['Återkalla medgivandet']);

    await consent.revoke.click();
    await expect(consent.feedback).toHaveText('Medgivandet är återkallat');
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
    // A consent cannot be saved while the conversation is not available.
    await expect(consent.buttons).toHaveCount(0);
    await expect(unavailable).toBeVisible();
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-10: ett misslyckat sparande sägs och knappen behåller sitt läge', async ({
  page,
}) => {
  const app = await installation();
  try {
    const { consentPath } = await household(page.request, app.origin);
    await openHousehold(page, app.origin);
    await openConversationSettings(page);
    const consent = consentPart(page);
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();

    // The connection is lost for what the page sends about the consent.
    const lost = /\/conversation-consent(\/revoke)?$/;
    await page.route(lost, (route) =>
      route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue(),
    );
    await consent.save.click();
    await expect(consent.feedback).toHaveText('Medgivandet kunde inte sparas. Försök igen.');
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
    await expect(consent.buttons).toHaveText(['Spara medgivandet']);
    await expect(consent.save).toBeFocused();
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });

    await page.unroute(lost);
    await consent.save.click();
    await expect(consent.feedback).toHaveText('Medgivandet är sparat');
    const status = await savedStatus(page.request, consentPath);
    await expect(consent.status(status)).toBeVisible();

    await page.route(lost, (route) =>
      route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue(),
    );
    await consent.revoke.click();
    await expect(consent.feedback).toHaveText('Medgivandet kunde inte återkallas. Försök igen.');
    await expect(consent.status(status)).toBeVisible();
    await expect(consent.buttons).toHaveText(['Återkalla medgivandet']);
    await expect(consent.revoke).toBeFocused();
    expect((await (await page.request.get(consentPath)).json()).saved).not.toBeNull();

    await page.unroute(lost);
    await consent.revoke.click();
    await expect(consent.feedback).toHaveText('Medgivandet är återkallat');
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-11: sidan sköts med tangentbord och pekskärm i båda teman', async ({
  page,
  browser,
}) => {
  const app = await installation();
  try {
    const { path, consentPath } = await household(page.request, app.origin);
    await openHousehold(page, app.origin);
    await openConversationSettings(page);
    const consent = consentPart(page);
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();

    // Keyboard alone: from the page's heading to the button, which saves and then revokes.
    await page.keyboard.press('Tab');
    await expect(consent.save).toBeFocused();
    expect(
      await consent.save.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe('none');
    // The text that says the result is there before anything happens, so that it is read when it changes.
    await expect(consent.feedback).toHaveText('');
    await page.keyboard.press('Enter');
    await expect(consent.feedback).toHaveText('Medgivandet är sparat');
    await expect(consent.revoke).toBeFocused();
    await page.keyboard.press('Space');
    await expect(consent.feedback).toHaveText('Medgivandet är återkallat');
    await expect(consent.save).toBeFocused();
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });

    // Every text of the part is readable against its surface in both themes.
    await page.keyboard.press('Enter');
    await expect(consent.feedback).toHaveText('Medgivandet är sparat');
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', colorScheme);
      for (const text of [
        consent.part.getByRole('heading'),
        ...(await consent.texts.all()),
        consent.feedback,
        ...(await consent.buttons.all()),
      ])
        expect(
          await contrast(text),
          `${colorScheme}: ${await text.textContent()}`,
        ).toBeGreaterThanOrEqual(4.5);
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // A narrow touch screen: the part fits without scrolling sideways, and the buttons are large enough to hit.
    app.setIdentity(robin);
    const touch = await browser.newContext({ hasTouch: true });
    await signIn(touch.request, app.origin, 'microsoft');
    const { user } = await (await touch.request.get(`${app.origin}/api/bootstrap`)).json();
    const invitation = await page.request.post(`${path}/invitations`, {
      headers: { origin: app.origin },
      data: { userId: user.id },
    });
    await touch.request.post(`${app.origin}/api/invitations/accept`, {
      headers: { origin: app.origin },
      data: { code: (await invitation.json()).code },
    });
    const touchPage = await touch.newPage();
    const touched = consentPart(touchPage);
    for (const width of [390, 320]) {
      await touchPage.setViewportSize({ width, height: 844 });
      await openHousehold(touchPage, app.origin);
      const sent = touchPage.waitForResponse(
        (response) => response.request().method() === 'POST' && /consent/.test(response.url()),
      );
      await openConversationSettings(touchPage);
      await expect(touched.buttons, `${width}`).toHaveCount(1);
      const button = touched.buttons.first();
      const size = await bounds(button);
      expect(size.height, `${width}`).toBeGreaterThanOrEqual(44);
      expect(size.width, `${width}`).toBeGreaterThanOrEqual(44);
      expect(size.x, `${width}`).toBeGreaterThanOrEqual(0);
      expect(size.right, `${width}`).toBeLessThanOrEqual(width);
      expect(
        await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}`,
      ).toBe(true);
      // The first width saves, and the second revokes what the first saved.
      await button.tap();
      await sent;
      await expect(touched.feedback, `${width}`).toHaveText(
        width === 390 ? 'Medgivandet är sparat' : 'Medgivandet är återkallat',
      );
      await expect(touched.feedback).toBeInViewport();
    }
    await touch.close();
  } finally {
    await app.close();
  }
});

test('a consent that is saved for another version of the consent text is told as changed and saved anew', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-consent-page-'));
  const databasePath = join(directory, 'skyttel.db');
  let app = await installation({ databasePath, consentTextVersion: 2 });
  try {
    // A release with another version of the consent text saves the user's consent to it.
    const first = await household(page.request, app.origin);
    const other = await page.request.post(first.consentPath, {
      headers: { origin: app.origin },
      data: { textVersion: 2 },
    });
    expect((await other.json()).saved.textVersion).toBe(2);
    const householdId = first.path.split('/').at(-1);
    await app.close();

    // The release that the page belongs to has version 1. The saved consent does not apply to it.
    app = await installation({ databasePath });
    await signIn(page.request, app.origin);
    const consentPath = `${app.origin}/api/households/${householdId}/conversation-consent`;
    expect((await (await page.request.get(consentPath)).json()).saved.textVersion).toBe(2);
    await openHousehold(page, app.origin);
    await openConversationSettings(page);
    const consent = consentPart(page);
    await expect(
      consent.status('Medgivandetexten har ändrats. Inget medgivande är sparat.'),
    ).toBeVisible();
    await expect(consent.buttons).toHaveText(['Spara medgivandet']);

    await consent.save.click();
    await expect(consent.feedback).toHaveText('Medgivandet är sparat');
    await expect(consent.status(await savedStatus(page.request, consentPath))).toBeVisible();
    await expect(consent.buttons).toHaveText(['Återkalla medgivandet']);
    expect((await (await page.request.get(consentPath)).json()).saved.textVersion).toBe(1);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('a revocation that reaches a spoken conversation from elsewhere ends it without loss of access, and the next start asks', async ({
  page,
}) => {
  const app = await installation();
  try {
    const { consentPath } = await household(page.request, app.origin);
    await saveConsent(page.request, app.origin, consentPath);
    await openHousehold(page, app.origin);
    // The voice is connected before the consent is revoked, so that the refusal reaches the voice.
    const connected = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && /\/voice$/.test(response.url()) && response.ok(),
    );
    await chooseConversationVoice(page);
    await connected;
    await expect.poll(() => liveMicrophones(page)).toBe(1);

    // The same user revokes from elsewhere, here without the page.
    const revoked = await page.request.post(`${consentPath}/revoke`, {
      headers: { origin: app.origin },
      data: {},
    });
    expect(revoked.status()).toBe(200);
    await expect.poll(() => liveMicrophones(page)).toBe(0);
    // The household's map is still there, and the conversation buttons ask for the consent.
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
    await expect(page.getByText('Åtkomsten har upphört.', { exact: true })).toHaveCount(0);
    await chooseConversationVoice(page);
    await expect(consentBox(page)).toBeVisible();
    await consentBoxFor(page).decline.click();
    await openConversationSettings(page);
    await expect(consentPart(page).status('Inget medgivande är sparat.')).toBeVisible();
  } finally {
    await app.close();
  }
});
