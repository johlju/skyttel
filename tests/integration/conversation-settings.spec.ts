import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { conversationConsentTextVersion } from '../../src/shared/conversation-consent.js';
import { bounds, contrast } from '../support/accessibility.js';
import { createHousehold, openSettings, signIn } from '../support/client.js';
import { specifiedConsentText } from '../support/conversation.js';
import {
  chooseConversationText,
  chooseConversationVoice,
  consentBox,
  consentBoxFor,
  giveConversationConsent,
  openConversationText,
  startConversationWithText,
  startConversationWithVoice,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

const householdName = 'Familjen Berg';
const refusal = { error: 'conversation_consent_revoked' };

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
/** Signs in the installation's current identity, creates its household and gives its paths. */
async function signInWithHousehold(client: APIRequestContext, origin: string) {
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
/** Signs in Robin, who is invited to the household by its administrator and accepts. */
async function joinAsRobin(
  app: { origin: string; setIdentity: (identity: typeof robin) => void },
  administrator: APIRequestContext,
  path: string,
  member: APIRequestContext,
) {
  app.setIdentity(robin);
  await signIn(member, app.origin, 'microsoft');
  const { user } = await (await member.get(`${app.origin}/api/bootstrap`)).json();
  const join = async () => {
    const invitation = await administrator.post(`${path}/invitations`, {
      headers: { origin: app.origin },
      data: { userId: user.id },
    });
    const accepted = await member.post(`${app.origin}/api/invitations/accept`, {
      headers: { origin: app.origin },
      data: { code: (await invitation.json()).code },
    });
    expect(accepted.status()).toBe(200);
  };
  await join();
  return { userId: user.id as string, joinAgain: join };
}
/** Expects the server to refuse a request for conversation work, and to say why. */
async function expectRefused(request: Promise<APIResponse>, reason = refusal) {
  const refused = await request;
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toEqual(reason);
}
/** Lets every request that the page sends to save or revoke the consent fail. */
const loseConnection = (page: Page) =>
  page.route(/\/conversation-consent(\/revoke)?$/, (route) =>
    route.request().method() === 'POST' ? route.abort('connectionfailed') : route.continue(),
  );
const saveConsent = (client: APIRequestContext, origin: string, consentPath: string) =>
  client.post(consentPath, {
    headers: { origin },
    data: { textVersion: conversationConsentTextVersion },
  });
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
    const { path } = await signInWithHousehold(page.request, app.origin);
    const member = await browser.newContext();
    await joinAsRobin(app, page.request, path, member.request);
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
    const { consentPath } = await signInWithHousehold(page.request, app.origin);
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
    expect(saved).toEqual({ textVersion: 2, savedAt: expect.any(String) });
    expect(Date.parse(saved.savedAt)).toBeGreaterThanOrEqual(before);
    // Saving started neither a conversation nor the microphone.
    expect(sent).toEqual([]);
    expect(await microphones(page)).toEqual([]);

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
    const { consentPath, startPath } = await signInWithHousehold(page.request, app.origin);
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
    await expectRefused(
      page.request.post(startPath, { headers: { origin: app.origin }, data: {} }),
      { error: 'conversation_consent_required' },
    );

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
    const { consentPath, startPath } = await signInWithHousehold(page.request, app.origin);
    const sent = await openHousehold(page, app.origin);
    const consent = consentPart(page);
    const visit = 'Du har godkänt för det här besöket. Inget medgivande är sparat.';

    // Approved in the consent box without being saved: the page offers both to save and to revoke.
    const started = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && response.url() === startPath && response.ok(),
    );
    await startConversationWithVoice(page);
    const conversation = `${startPath}/${(await (await started).json()).id}`;
    await expect.poll(() => liveMicrophones(page)).toBe(1);
    await openConversationSettings(page);
    await expect(consent.status(visit)).toBeVisible();
    await expect(consent.buttons).toHaveText(['Spara medgivandet', 'Återkalla medgivandet']);
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });

    // Revoking ends the consent for the visit. The pressed button is gone, and the focus goes to the other.
    await consent.revoke.click();
    await page.getByRole('button', { name: 'Återkalla och avsluta samtalet' }).click();
    await expect(consent.feedback).toHaveText('Medgivandet är återkallat');
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
    await expect(consent.buttons).toHaveText(['Spara medgivandet']);
    await expect(consent.save).toBeFocused();
    // The microphone is off, and the server refuses work with the conversation and says why.
    await expect.poll(() => liveMicrophones(page)).toBe(0);
    await expectRefused(page.request.get(conversation));

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
    const { consentPath } = await signInWithHousehold(page.request, app.origin);
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
    // A consent cannot be saved while the conversation is not available. No
    // button is left, so the focus goes to the heading of the part.
    await expect(consent.buttons).toHaveCount(0);
    await expect(consent.part.getByRole('heading', { name: 'Medgivande' })).toBeFocused();
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
    const { consentPath } = await signInWithHousehold(page.request, app.origin);
    await openHousehold(page, app.origin);
    await openConversationSettings(page);
    const consent = consentPart(page);
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();

    // The connection is lost for what the page sends about the consent.
    await loseConnection(page);
    await consent.save.click();
    await expect(consent.feedback).toHaveText('Medgivandet kunde inte sparas. Försök igen.');
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
    await expect(consent.buttons).toHaveText(['Spara medgivandet']);
    await expect(consent.save).toBeFocused();
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });

    await page.unrouteAll();
    await consent.save.click();
    await expect(consent.feedback).toHaveText('Medgivandet är sparat');
    const status = await savedStatus(page.request, consentPath);
    await expect(consent.status(status)).toBeVisible();

    await loseConnection(page);
    await consent.revoke.click();
    await expect(consent.feedback).toHaveText('Medgivandet kunde inte återkallas. Försök igen.');
    await expect(consent.status(status)).toBeVisible();
    await expect(consent.buttons).toHaveText(['Återkalla medgivandet']);
    await expect(consent.revoke).toBeFocused();
    expect((await (await page.request.get(consentPath)).json()).saved).not.toBeNull();

    await page.unrouteAll();
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
    const { path, consentPath } = await signInWithHousehold(page.request, app.origin);
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
    const touch = await browser.newContext({ hasTouch: true });
    await joinAsRobin(app, page.request, path, touch.request);
    const touchPage = await touch.newPage();
    const touched = consentPart(touchPage);
    for (const width of [390, 320]) {
      await touchPage.setViewportSize({ width, height: 844 });
      await openHousehold(touchPage, app.origin);
      const answered = touchPage.waitForResponse(
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
      await answered;
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

test('MEDGIVANDE-12: en medlem som bjuds in igen har inget sparat medgivande', async ({
  page,
  browser,
}) => {
  const app = await installation();
  try {
    const { path, consentPath } = await signInWithHousehold(page.request, app.origin);
    const member = await browser.newContext();
    const { userId, joinAgain } = await joinAsRobin(app, page.request, path, member.request);
    const memberPage = await member.newPage();
    const consent = consentPart(memberPage);
    await openHousehold(memberPage, app.origin);
    await openConversationSettings(memberPage);
    await consent.save.click();
    await expect(consent.feedback).toHaveText('Medgivandet är sparat');
    expect((await (await member.request.get(consentPath)).json()).saved).not.toBeNull();

    // The administrator revokes the member's access and invites the same user again.
    const removed = await page.request.post(`${path}/members/${userId}/revoke`, {
      headers: { origin: app.origin },
      data: {},
    });
    expect(removed.status()).toBe(200);
    expect((await member.request.get(consentPath)).status()).toBe(403);
    await joinAgain();

    const sent = await openHousehold(memberPage, app.origin);
    await openConversationSettings(memberPage);
    await expect(consent.status('Inget medgivande är sparat.')).toBeVisible();
    await expect(consent.buttons).toHaveText(['Spara medgivandet']);
    await returnToMap(memberPage);
    await chooseConversationVoice(memberPage);
    await expect(consentBox(memberPage)).toBeVisible();
    await expect(consentBoxFor(memberPage).remember).not.toBeChecked();
    expect(sent).toEqual([]);
    expect(await microphones(memberPage)).toEqual([]);
    await member.close();
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-14: ändrad medgivandetext kräver ett nytt sparat medgivande', async ({ page }) => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-consent-page-'));
  const databasePath = join(directory, 'skyttel.db');
  let app = await installation({ databasePath, consentTextVersion: 1 });
  try {
    // A release with another version of the consent text saves the user's consent to it.
    const first = await signInWithHousehold(page.request, app.origin);
    const other = await page.request.post(first.consentPath, {
      headers: { origin: app.origin },
      data: { textVersion: 1 },
    });
    expect((await other.json()).saved.textVersion).toBe(1);
    const householdId = first.path.split('/').at(-1);
    await app.close();

    // The release that the page belongs to has version 2. The saved consent does not apply to it.
    app = await installation({ databasePath });
    await signIn(page.request, app.origin);
    const consentPath = `${app.origin}/api/households/${householdId}/conversation-consent`;
    expect((await (await page.request.get(consentPath)).json()).saved.textVersion).toBe(1);
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
    expect((await (await page.request.get(consentPath)).json()).saved.textVersion).toBe(2);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('MEDGIVANDE-13: ett återkallande på en annan enhet avslutar samtalet', async ({
  page,
  browser,
}) => {
  const app = await installation();
  try {
    const { consentPath } = await signInWithHousehold(page.request, app.origin);
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

    // The same user revokes on another device.
    const otherDevice = await browser.newContext();
    await signIn(otherDevice.request, app.origin);
    const otherPage = await otherDevice.newPage();
    await openHousehold(otherPage, app.origin);
    await openConversationSettings(otherPage);
    await consentPart(otherPage).revoke.click();
    await expect(consentPart(otherPage).feedback).toHaveText('Medgivandet är återkallat');

    // The conversation on the first device ends. The map stays, and the next start asks.
    await expect.poll(() => liveMicrophones(page)).toBe(0);
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
    await expect(page.getByText('Åtkomsten har upphört.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Samtalsnotis' })).toHaveText(
      /Medgivandet är återkallat. Samtalet är avslutat. Utkastet ligger kvar./,
    );
    await chooseConversationVoice(page);
    await expect(consentBox(page)).toBeVisible();
    await expect(consentBoxFor(page).remember).not.toBeChecked();
    await consentBoxFor(page).decline.click();
    await openConversationSettings(page);
    await expect(consentPart(page).status('Inget medgivande är sparat.')).toBeVisible();
    await otherDevice.close();
  } finally {
    await app.close();
  }
});

const textView = (page: Page) =>
  page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const message = (page: Page) =>
  textView(page).getByRole('textbox', { name: 'Meddelande till Skyttel' });
const revocation = (page: Page) =>
  page.getByRole('dialog', { name: 'Återkalla medgivandet', exact: true });
const confirmRevocation = (page: Page) =>
  revocation(page).getByRole('button', { name: 'Återkalla och avsluta samtalet' });
async function arrangeDraft(page: Page, path: string, origin: string) {
  const state = await (await page.request.get(`${path}/map`)).json();
  const proposed = await page.request.post(`${path}/map/draft`, {
    headers: { origin },
    data: {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: 'lo',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Påhittad uppgift' },
    },
  });
  expect(proposed.ok(), await proposed.text()).toBe(true);
  return (await (await page.request.get(`${path}/map`)).json()).draft;
}

test('MEDGIVANDE-15: återkallandet behåller utkast och oskickad text', async ({ page }) => {
  let release!: (reply: unknown[]) => void;
  const model = textModel((request) => {
    const current = JSON.parse(
      String(request.input.findLast((part) => part.role === 'user')?.content),
    );
    if (current.message === 'Tillfälligt provord för återkallandet.')
      return new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
    expect(JSON.stringify(request.input)).not.toContain('Tillfälligt provord för återkallandet.');
    return [modelMessage('Ett nytt samtal.')];
  });
  const app = await installation({ modelFetch: model.provider });
  try {
    const { path, startPath } = await signInWithHousehold(page.request, app.origin);
    const draft = await arrangeDraft(page, path, app.origin);
    await openHousehold(page, app.origin);
    const started = page.waitForResponse(
      (response) =>
        response.url() === startPath && response.request().method() === 'POST' && response.ok(),
    );
    await startConversationWithText(page);
    await expect(message(page)).toBeVisible();
    const old = `${startPath}/${(await (await started).json()).id}`;
    await turnMicrophoneOn(page);
    await message(page).fill('Tillfälligt provord för återkallandet.');
    await textView(page).getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => Boolean(release)).toBe(true);
    await message(page).fill('Min oskickade text.');
    await openConversationSettings(page);
    await consentPart(page).revoke.click();
    await expect(revocation(page)).toContainText(
      'Samtalet avslutas och samtalstexten töms. Utkastet med 1 osparade ändringar ligger kvar.',
    );
    await expect(revocation(page).getByRole('heading')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(revocation(page)).toHaveCount(0);
    await expect(consentPart(page).revoke).toBeFocused();
    expect(await liveMicrophones(page)).toBe(1);
    await consentPart(page).revoke.click();
    await revocation(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(consentPart(page).revoke).toBeFocused();
    await consentPart(page).revoke.click();
    await confirmRevocation(page).click();
    await expect(consentPart(page).feedback).toHaveText('Medgivandet är återkallat');
    await expect(consentPart(page).save).toBeFocused();
    await expect.poll(() => liveMicrophones(page)).toBe(0);
    release([modelMessage('För sent efter återkallandet.')]);
    await expectRefused(page.request.get(old));
    expect((await (await page.request.get(`${path}/map`)).json()).draft).toEqual(draft);
    expect((await (await page.request.get(`${path}/map/operations`)).json()).operations).toEqual(
      [],
    );
    await returnToMap(page);
    await expect(textView(page)).toHaveCount(0);
    await expect(voiceBox(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Samtalsnotis' })).toHaveCount(0);
    await startConversationWithText(page);
    await expect(message(page)).toHaveValue('Min oskickade text.');
    await expect(textView(page).getByRole('log')).not.toContainText('Tillfälligt provord');
    await message(page).fill('Börja om.');
    await textView(page).getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(textView(page).getByRole('log')).toContainText('Ett nytt samtal.');
  } finally {
    release?.([]);
    await app.close();
  }
});

test('MEDGIVANDE-16: registrerat sparande slutförs vid återkallandet', async ({ page }) => {
  let release!: () => void;
  let registered = false;
  const model = textModel((request) => {
    const current = JSON.parse(
      String(request.input.findLast((part) => part.role === 'user')?.content),
    );
    return [
      modelTool('save_draft', {
        version: current.draft.version,
        contentVersion: current.draft.contentVersion,
        operationId: 'provider-id',
      }),
    ];
  });
  const app = await installation({
    modelFetch: model.provider,
    assistantDispatch: async (request, dispatch) => {
      const body =
        request.method === 'POST'
          ? await request
              .clone()
              .json()
              .catch(() => null)
          : null;
      const response = await dispatch(request);
      if (body?.method === 'tools/call' && body.params?.name === 'prepare_save') {
        registered = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      return response;
    },
  });
  try {
    const { path } = await signInWithHousehold(page.request, app.origin);
    await arrangeDraft(page, path, app.origin);
    await openHousehold(page, app.origin);
    await startConversationWithText(page);
    await expect(message(page)).toBeVisible();
    await turnMicrophoneOn(page);
    await message(page).fill('Spara hela utkastet nu.');
    await textView(page).getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => registered).toBe(true);
    await openConversationSettings(page);
    await consentPart(page).revoke.click();
    await expect(revocation(page)).toContainText('Skyttel sparar ditt utkast. Sparandet slutförs.');
    await expect(revocation(page)).not.toContainText('osparade ändringar');
    const before = (await (await page.request.get(`${path}/map/operations`)).json()).operations[0];
    expect(before.status).toBe('pending');
    await confirmRevocation(page).click();
    await expect.poll(() => liveMicrophones(page)).toBe(0);
    await expect(consentPart(page).feedback).toHaveText('Medgivandet är återkallat');
    const operations = (await (await page.request.get(`${path}/map/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ status: 'succeeded', operationId: before.operationId });
    const state = await (await page.request.get(`${path}/map`)).json();
    expect(state.draft.changes).toHaveLength(0);
    expect(state.objects).toEqual([expect.objectContaining({ name: 'Lo Exempel' })]);
    release();
    await returnToMap(page);
    await expect(
      page.getByRole('status').filter({ hasText: `Kvitto: ${before.operationId}` }),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Samtalsnotis' })).toHaveCount(0);
    await expect(textView(page)).toHaveCount(0);
  } finally {
    release?.();
    await app.close();
  }
});

test('MEDGIVANDE-17: återkallanderutan med tangentbord och pekskärm', async ({ browser }) => {
  const app = await installation();
  const device = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const page = await device.newPage();
    await signInWithHousehold(page.request, app.origin);
    await openHousehold(page, app.origin);
    await startConversationWithText(page);
    await expect(message(page)).toBeVisible();
    await openConversationSettings(page);
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
      await consentPart(page).revoke.tap();
      const dialog = revocation(page);
      await expect(dialog.getByRole('heading')).toBeFocused();
      await expect(dialog).toHaveAttribute('aria-describedby', /.+/);
      await page.keyboard.press('Tab');
      await expect(confirmRevocation(page)).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: 'Avbryt', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(confirmRevocation(page)).toBeFocused();
      expect(await contrast(dialog.getByRole('paragraph'))).toBeGreaterThanOrEqual(4.5);
      const area = await bounds(dialog);
      expect(area.x).toBeGreaterThanOrEqual(0);
      expect(area.right).toBeLessThanOrEqual(390);
      for (const control of await dialog.getByRole('button').all()) {
        const box = await bounds(control);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      await dialog.getByRole('button', { name: 'Avbryt', exact: true }).tap();
      await expect(consentPart(page).revoke).toBeFocused();
    }
    await consentPart(page).revoke.tap();
    await confirmRevocation(page).tap();
    await expect(consentPart(page).save).toBeFocused();
  } finally {
    await device.close();
    await app.close();
  }
});

test('MEDGIVANDE-18: nästa textförsök visar återkallandet på en annan enhet', async ({
  page,
  browser,
}) => {
  const app = await installation();
  const other = await browser.newContext();
  try {
    const { path, consentPath } = await signInWithHousehold(page.request, app.origin);
    await arrangeDraft(page, path, app.origin);
    await saveConsent(page.request, app.origin, consentPath);
    await openHousehold(page, app.origin);
    await signIn(other.request, app.origin);
    const second = await other.newPage();
    await openHousehold(second, app.origin);
    await chooseConversationText(page);
    await expect(message(page)).toBeVisible();
    await message(page).fill('Text som inte hunnit skickas.');
    await openConversationSettings(second);
    await consentPart(second).revoke.click();
    await expect(consentPart(second).feedback).toHaveText('Medgivandet är återkallat');
    const refusal = page.waitForResponse(
      (response) =>
        /\/text-assistant\/[^/]+\/messages$/.test(response.url()) && response.status() === 403,
    );
    await textView(page).getByRole('button', { name: 'Skicka', exact: true }).click();
    expect(await (await refusal).json()).toEqual({ error: 'conversation_consent_revoked' });
    await expect(page.getByRole('region', { name: 'Samtalsnotis' })).toContainText(
      'Medgivandet är återkallat. Samtalet är avslutat. Utkastet ligger kvar.',
    );
    await expect(textView(page)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Rymdkarta', exact: true })).toBeVisible();
    expect((await (await page.request.get(`${path}/map`)).json()).draft.changes).toHaveLength(1);
    await startConversationWithText(page);
    await expect(message(page)).toHaveValue('Text som inte hunnit skickas.');
    await expect(textView(page).getByRole('log')).not.toContainText(
      'Text som inte hunnit skickas.',
    );
  } finally {
    await other.close();
    await app.close();
  }
});
