import { expect, type Locator, type Page, test } from '@playwright/test';
import { createHousehold, openSettings, signIn, utilityButton } from '../support/client.js';
import { specifiedConsentText } from '../support/conversation.js';
import {
  chooseConversationVoice,
  consentBox,
  consentBoxFor,
  giveConversationConsent,
  openConversationText,
  startConversationWithText,
  startConversationWithVoice,
} from '../support/conversation-page.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

async function installation() {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Ett provsvar.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  return app;
}
/** Opens the household's map with the controlled microphone, and records every start. */
async function openHousehold(page: Page, origin: string) {
  const starts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/text-assistant(\/[^/]+\/voice)?$/.test(request.url()))
      starts.push(request.url().endsWith('/voice') ? 'voice' : 'conversation');
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(origin);
  await expect(page.getByRole('navigation', { name: 'Kartans verktyg' })).toBeVisible();
  return starts;
}
const messageField = (page: Page) => page.getByLabel('Meddelande till textassistenten');
const microphones = (page: Page) =>
  page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks);
const endConversation = (page: Page) =>
  page.getByRole('button', { name: 'Avsluta samtalet', exact: true }).click();
const bounds = async (control: Locator) => {
  const box = await control.boundingBox();
  if (!box) throw new Error('The control has no place on the screen');
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
};
/** The contrast between a text and the surface behind it. */
const contrast = (text: Locator) =>
  text.evaluate((element) => {
    const luminance = (color: string) => {
      if (!/^rgb\(\d+, \d+, \d+\)$/.test(color))
        throw new Error(`Expected an opaque RGB color, received ${color}`);
      const [red, green, blue] = (color.match(/\d+/g) ?? []).map(Number).map((value) => {
        const unit = value / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };
    let surface: Element | null = element;
    while (surface && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)')
      surface = surface.parentElement;
    if (!surface) throw new Error('The text has no surface behind it');
    const foreground = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(surface).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });

test('MEDGIVANDE-01: samtalsknapparna visar medgivanderutan och Avbryt startar inget', async ({
  page,
}) => {
  const app = await installation();
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    const starts = await openHousehold(page, app.origin);
    const box = consentBox(page);
    const { remember, approve, decline } = consentBoxFor(page);
    const guidance = page.getByRole('complementary', { name: 'Kom igång med kartan' });
    const chosen: [string, () => Promise<Locator>][] = [
      ['verktygsradens röstknapp', () => utilityButton(page, 'Prata med Skyttel')],
      ['verktygsradens textknapp', () => utilityButton(page, 'Samtal och text')],
      ['välkomstguidens Tala', async () => guidance.getByRole('button', { name: 'Tala' })],
      ['välkomstguidens Skriv', async () => guidance.getByRole('button', { name: 'Skriv' })],
      [
        'snabblänken till samtalet',
        async () => page.getByRole('button', { name: 'Till samtal och text', exact: true }),
      ],
    ];
    for (const [index, [name, find]] of chosen.entries()) {
      const button = await find();
      // The quick link is shown only while it has the focus, so every button is used by keyboard.
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(box, name).toBeVisible();
      await expect(box).toHaveAccessibleName('Samtal med Skyttel');
      await expect(box).toHaveAccessibleDescription(specifiedConsentText.join(' '));
      await expect(
        box.getByRole('heading', { level: 2, name: 'Samtal med Skyttel' }),
      ).toBeFocused();
      await expect(box.getByRole('paragraph')).toHaveText([
        ...specifiedConsentText,
        'Du kan återkalla det i Inställningar.',
      ]);
      await expect(remember).not.toBeChecked();
      await expect(remember).toHaveAccessibleDescription('Du kan återkalla det i Inställningar.');
      await expect(box.getByRole('button')).toHaveText(['Godkänn och starta', 'Avbryt']);
      await expect(box.getByRole('link')).toHaveCount(0);
      await expect(box).not.toContainText('Information och hjälp');
      // The box is modal: the rest of the page cannot be used while it asks.
      expect(await box.evaluate((element) => element.matches('dialog:modal'))).toBe(true);

      // A marked choice to remember is not kept by a cancelled box.
      await remember.check();
      if (index % 2) await page.keyboard.press('Escape');
      else await decline.click();
      await expect(box, name).toBeHidden();
      await expect(button, name).toBeFocused();
      await expect(messageField(page)).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Samtal och text', exact: true })).toHaveCount(
        0,
      );
    }
    await expect(approve).toHaveCount(0);
    expect(starts).toEqual([]);
    expect(await microphones(page)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-02: vald knapp avgör röst eller text och medgivandet gäller besöket', async ({
  page,
}) => {
  const app = await installation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const consentPath = `${app.origin}/api/households/${household.id}/conversation-consent`;
    const starts = await openHousehold(page, app.origin);

    // The voice button: the conversation starts with the microphone.
    await startConversationWithVoice(page);
    await expect(consentBox(page)).toBeHidden();
    await expect(page.getByText('Mikrofonen är på', { exact: true })).toBeVisible();
    await expect(messageField(page)).toBeVisible();
    await expect.poll(() => microphones(page)).toEqual([{ enabled: true, state: 'live' }]);
    expect(starts).toEqual(['conversation', 'voice']);

    // A new conversation during the same visit does not ask again, here with the text button.
    await endConversation(page);
    await expect(messageField(page)).toHaveCount(0);
    await openConversationText(page);
    await expect(messageField(page)).toBeVisible();
    await expect(consentBox(page)).toBeHidden();
    await expect(page.getByText('Mikrofonen är av', { exact: true })).toBeVisible();
    expect(starts).toEqual(['conversation', 'voice', 'conversation']);

    // Settings keep the map loaded, so the consent for the visit still applies afterwards.
    await endConversation(page);
    await openSettings(page);
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openConversationText(page);
    await expect(messageField(page)).toBeVisible();
    await expect(consentBox(page)).toBeHidden();

    // Nothing was saved: a reloaded page asks again, and the text button starts with text.
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });
    await page.reload();
    const reloadedStarts = starts.length;
    await openConversationText(page);
    await expect(consentBox(page)).toBeVisible();
    await expect(consentBoxFor(page).remember).not.toBeChecked();
    expect(starts).toHaveLength(reloadedStarts);
    await giveConversationConsent(page);
    await expect(messageField(page)).toBeVisible();
    await expect(page.getByText('Mikrofonen är av', { exact: true })).toBeVisible();
    expect(starts.slice(reloadedStarts)).toEqual(['conversation']);
    expect(await microphones(page)).toEqual([]);
    expect(await (await page.request.get(consentPath)).json()).toEqual({ saved: null });
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-03: sparat medgivande följer användaren men inte andra medlemmar', async ({
  page,
  browser,
}) => {
  const app = await installation();
  try {
    await signIn(page.request, app.origin);
    const { household } = await (await createHousehold(page.request, app.origin)).json();
    const householdPath = `${app.origin}/api/households/${household.id}`;
    await openHousehold(page, app.origin);

    const before = Date.now();
    await startConversationWithText(page, { remember: true });
    await expect(messageField(page)).toBeVisible();
    const { saved } = await (
      await page.request.get(`${householdPath}/conversation-consent`)
    ).json();
    expect(saved).toEqual({ textVersion: 1, savedAt: expect.any(String) });
    expect(Date.parse(saved.savedAt)).toBeGreaterThanOrEqual(before);

    // A reloaded page starts directly, with the button that is chosen.
    await page.reload();
    await chooseConversationVoice(page);
    await expect(page.getByText('Mikrofonen är på', { exact: true })).toBeVisible();
    await expect(consentBox(page)).toBeHidden();

    // Another of the same user's devices starts directly too.
    const otherDevice = await browser.newContext();
    await signIn(otherDevice.request, app.origin);
    const otherPage = await otherDevice.newPage();
    await openHousehold(otherPage, app.origin);
    await openConversationText(otherPage);
    await expect(messageField(otherPage)).toBeVisible();
    await expect(consentBox(otherPage)).toBeHidden();

    // Another member of the same household has not consented.
    app.setIdentity(robin);
    const member = await browser.newContext();
    await signIn(member.request, app.origin, 'microsoft');
    const { user } = await (await member.request.get(`${app.origin}/api/bootstrap`)).json();
    const invitation = await page.request.post(`${householdPath}/invitations`, {
      headers: { origin: app.origin },
      data: { userId: user.id },
    });
    const { code } = await invitation.json();
    await member.request.post(`${app.origin}/api/invitations/accept`, {
      headers: { origin: app.origin },
      data: { code },
    });
    const memberPage = await member.newPage();
    const memberStarts = await openHousehold(memberPage, app.origin);
    await openConversationText(memberPage);
    await expect(consentBox(memberPage)).toBeVisible();
    await expect(consentBoxFor(memberPage).remember).not.toBeChecked();
    await consentBoxFor(memberPage).decline.click();
    await expect(messageField(memberPage)).toHaveCount(0);
    expect(memberStarts).toEqual([]);
    expect(
      await (await member.request.get(`${householdPath}/conversation-consent`)).json(),
    ).toEqual({ saved: null });
    expect(
      (await (await page.request.get(`${householdPath}/conversation-consent`)).json()).saved,
    ).toEqual(saved);
    await otherDevice.close();
    await member.close();
  } finally {
    await app.close();
  }
});

test('MEDGIVANDE-04: medgivanderutan fungerar med tangentbord och pekskärm', async ({
  page,
  browser,
}) => {
  const app = await installation();
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await openHousehold(page, app.origin);
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
    const box = consentBox(page);

    // Every text in the box is readable against its surface in both themes.
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(
        page.getByRole('region', { name: 'Hushållskarta', exact: true }),
      ).toHaveAttribute('data-theme', colorScheme);
      await tools.getByRole('button', { name: 'Samtal och text', exact: true }).click();
      await expect(box).toBeVisible();
      for (const text of [
        box.getByRole('heading'),
        ...(await box.getByRole('paragraph').all()),
        box.locator('label'),
        ...(await box.getByRole('button').all()),
      ])
        expect(
          await contrast(text),
          `${colorScheme}: ${await text.textContent()}`,
        ).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Escape');
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // The toolbar stands to the left: the box opens next to the chosen button.
    for (const name of ['Prata med Skyttel', 'Samtal och text']) {
      const button = tools.getByRole('button', { name, exact: true });
      const chosen = await bounds(button);
      await button.click();
      await expect(box).toBeVisible();
      const place = await bounds(box);
      expect(place.x, name).toBeGreaterThanOrEqual((await bounds(tools)).right);
      expect(place.x - chosen.right, name).toBeLessThanOrEqual(32);
      expect(Math.abs(place.y - chosen.y), name).toBeLessThanOrEqual(1);
      await page.keyboard.press('Escape');
      await expect(button).toBeFocused();
    }

    // A welcome guide button far from the toolbar gets the box next to itself, kept on the screen.
    const guide = page
      .getByRole('complementary', { name: 'Kom igång med kartan' })
      .getByRole('button', { name: 'Skriv' });
    const guideButton = await bounds(guide);
    await guide.click();
    await expect(box).toBeVisible();
    const besideGuide = await bounds(box);
    expect(besideGuide.x - guideButton.right).toBeLessThanOrEqual(32);
    expect(besideGuide.x).toBeGreaterThanOrEqual(guideButton.right);
    expect(besideGuide.bottom).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);
    await page.keyboard.press('Escape');

    // A window that is too low still reaches every control, by scrolling inside the box.
    await page.setViewportSize({ width: 1024, height: 320 });
    await tools.getByRole('button', { name: 'Samtal och text', exact: true }).click();
    await expect(box).toBeVisible();
    const low = await bounds(box);
    expect(low.y).toBeGreaterThanOrEqual(0);
    expect(low.bottom).toBeLessThanOrEqual(320);
    await consentBoxFor(page).decline.scrollIntoViewIfNeeded();
    await expect(consentBoxFor(page).decline).toBeInViewport();
    await consentBoxFor(page).decline.click();

    // The toolbar lies at the top of a narrow screen: the box opens under it.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const button = await utilityButton(page, 'Samtal och text');
      await button.click();
      await expect(box).toBeVisible();
      const place = await bounds(box);
      expect(place.y, `${width}`).toBeGreaterThanOrEqual((await bounds(tools)).bottom);
      expect(place.x, `${width}`).toBeGreaterThanOrEqual(0);
      expect(place.right, `${width}`).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}`,
      ).toBe(true);
      const { remember, approve, decline } = consentBoxFor(page);
      // Touch targets: the whole label of the checkbox, and each button.
      for (const target of [box.locator('label'), approve, decline]) {
        const size = await bounds(target);
        expect(size.height, `${width}`).toBeGreaterThanOrEqual(44);
        expect(size.width, `${width}`).toBeGreaterThanOrEqual(44);
      }
      await expect(remember).not.toBeChecked();
      await decline.click();
      await expect(button).toBeFocused();
    }

    // Keyboard alone: open, remember, approve.
    await page.setViewportSize({ width: 1280, height: 800 });
    await tools.getByRole('button', { name: 'Samtal och text', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(box.getByRole('heading', { name: 'Samtal med Skyttel' })).toBeFocused();
    const { remember, approve, decline } = consentBoxFor(page);
    await page.keyboard.press('Tab');
    await expect(remember).toBeFocused();
    await page.keyboard.press('Space');
    await expect(remember).toBeChecked();
    await page.keyboard.press('Tab');
    await expect(approve).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(decline).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(approve).toBeFocused();
    // The focus is shown on the control that has it.
    expect(await approve.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    );
    await page.keyboard.press('Enter');
    await expect(box).toBeHidden();
    await expect(messageField(page)).toBeVisible();

    // A touch screen: the same box is approved with taps.
    const touch = await browser.newContext({
      hasTouch: true,
      viewport: { width: 390, height: 844 },
    });
    app.setIdentity(robin);
    await signIn(touch.request, app.origin, 'microsoft');
    const { user } = await (await touch.request.get(`${app.origin}/api/bootstrap`)).json();
    const { household } = await (await page.request.get(`${app.origin}/api/bootstrap`)).json();
    const invitation = await page.request.post(
      `${app.origin}/api/households/${household.id}/invitations`,
      { headers: { origin: app.origin }, data: { userId: user.id } },
    );
    await touch.request.post(`${app.origin}/api/invitations/accept`, {
      headers: { origin: app.origin },
      data: { code: (await invitation.json()).code },
    });
    const touchPage = await touch.newPage();
    await openHousehold(touchPage, app.origin);
    await (await utilityButton(touchPage, 'Samtal och text')).tap();
    await expect(consentBox(touchPage)).toBeVisible();
    await consentBoxFor(touchPage).approve.tap();
    await expect(messageField(touchPage)).toBeVisible();
    await touch.close();
  } finally {
    await app.close();
  }
});
