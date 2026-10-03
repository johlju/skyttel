import { expect, type Page, test } from '@playwright/test';
import { createHousehold, openSettings, signIn, utilityButton } from '../support/client.js';
import {
  microphoneButton,
  openConversationText,
  startConversationWithText,
  startConversationWithVoice,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const notice = (page: Page) => page.getByRole('region', { name: 'Samtalsnotis', exact: true });
const view = (page: Page) => page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const unavailable =
  'Samtal med Skyttel är inte tillgängligt just nu. Kontakta administratören om det fortsätter.';
async function setup(page: Page, model = textModel(() => [modelMessage('Hej.')]), voice = true) {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });

  await signIn(page.request, app.origin);
  await createHousehold(page.request, app.origin);
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  if (voice) {
    await startConversationWithVoice(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
  } else await startConversationWithText(page);
  return { app, live, model };
}

for (const touch of [false, true])
  test(`HJALP-01: en blockerad mikrofon i ett pågående samtal går att aktivera med hjälpmedel på ${touch ? 'pekskärm' : 'dator'}`, async ({
    page,
  }) => {
    if (touch)
      await page.addInitScript(() => {
        const original = window.matchMedia.bind(window);
        window.matchMedia = (query) => {
          const result = original(query);
          if (query === '(pointer: coarse)')
            Object.defineProperty(result, 'matches', { value: true });
          return result;
        };
      });
    const { app } = await setup(page);
    try {
      app.setConversationAvailable(false);
      await expect(notice(page)).toContainText(unavailable, { timeout: 7000 });
      const microphone = microphoneButton(page);
      await expect(microphone).toBeEnabled();
      await expect(microphone).not.toHaveAttribute('aria-disabled');
      await expect(microphone).toHaveAccessibleDescription(/Inte tillgängligt just nu\./);
      await microphone.focus();
      await page.keyboard.press('Enter');
      await expect(microphone).toBeFocused();
      await expect(notice(page)).toHaveCount(1);
      await expect(microphone).toHaveAttribute('aria-pressed', 'false');
      expect(
        await page.evaluate(() =>
          window.skyttelVoiceFixture.stats().microphoneTracks.every((track) => !track.enabled),
        ),
      ).toBe(true);
      app.setConversationAvailable(true);
      await expect(notice(page)).toHaveCount(0, { timeout: 7000 });
      await expect(page.locator('.notice-announcement[aria-live="polite"]')).toHaveText(
        'Samtal med Skyttel är tillgängligt igen.',
      );
      await expect(microphone).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await app.close();
    }
  });

for (const width of [1280, 390])
  test(`HJALP-02: röstruta och notis behåller läs- och tabbordning när textvyn öppnas vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { app } = await setup(
      page,
      textModel(() => Promise.reject(new Error('Synthetic provider failure'))),
    );
    try {
      await openConversationText(page);
      await page.getByLabel('Meddelande till Skyttel').fill('Ge ett förslag.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(notice(page)).toContainText('Skyttel kunde inte slutföra uppdraget.');
      await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true, 0.2));
      await expect(voiceBox(page)).toHaveText('Skyttel talar');
      const close = notice(page).getByRole('button', { name: 'Stäng notisen', exact: true });
      await page.locator('.notice-announcement[aria-live="polite"] span').evaluate((span) => {
        span.dataset.occurrence = 'first';
      });
      const checkOrder = async () => {
        const readingOrder = await page.evaluate(() => {
          const controls = [
            '.workspace-talk',
            '.workspace-text',
            '.voice-stop',
            '.conversation-notice-close',
            '.workspace-tools [aria-label="Sök i kartan"]',
          ].map((selector) => document.querySelector(selector));
          return controls.every(
            (node, index) =>
              Boolean(node) &&
              (!index ||
                Boolean(
                  (controls[index - 1]?.compareDocumentPosition(node as Node) ?? 0) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
                )),
          );
        });
        expect(readingOrder).toBe(true);
        await microphoneButton(page).focus();
        await page.keyboard.press('Tab');
        await expect(await utilityButton(page, 'Skriv till Skyttel')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(voiceBox(page).getByRole('button', { name: 'Avbryt' })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(close).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(
          await utilityButton(page, width <= 700 ? 'Lista' : 'Sök i kartan'),
        ).toBeFocused();
      };
      await checkOrder();
      const card = await notice(page).boundingBox();
      const composer = await page.locator('.text-view-message').boundingBox();
      expect(card).not.toBeNull();
      expect(composer).not.toBeNull();
      expect((card?.y ?? 0) + (card?.height ?? 0)).toBeLessThanOrEqual((composer?.y ?? 0) + 1);
      await view(page).getByRole('button', { name: 'Stäng textvyn' }).click();
      await checkOrder();
      await openConversationText(page);
      await checkOrder();
      await expect(page.locator('.notice-announcement[aria-live="polite"] span')).toHaveAttribute(
        'data-occurrence',
        'first',
      );
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(notice(page)).toHaveCount(0);
      await expect(microphoneButton(page)).toBeFocused();
    } finally {
      await app.close();
    }
  });

for (const width of [1280, 390])
  test(`HJALP-06: systemets minskade rörelse ger fasta former och omedelbara ytor vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let release: ((output: unknown[]) => void) | undefined;
    let fail = false;
    const model = textModel(() =>
      fail
        ? Promise.reject(new Error('Synthetic provider failure'))
        : new Promise<unknown[]>((resolve) => {
            release = resolve;
          }),
    );
    const { app } = await setup(page, model);
    try {
      const wave = voiceBox(page).locator('.voice-wave');
      const heights = () =>
        wave
          .locator('i')
          .evaluateAll((bars) => bars.map((bar) => bar.getBoundingClientRect().height));
      expect(await heights()).toEqual(Array(7).fill(4));
      await expect(wave).toHaveAttribute('aria-hidden', 'true');
      await page.evaluate(() => window.skyttelVoiceFixture.setSound('microphone', true, 0.1));
      await expect(voiceBox(page)).toHaveText('Du talar');
      const heard = await heights();
      expect(heard).toEqual([12, 20, 12, 20, 12, 20, 12]);
      await page.evaluate(() => window.skyttelVoiceFixture.setSound('microphone', true, 0.9));
      expect(await heights()).toEqual(heard);
      await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true, 0.2));
      await expect(voiceBox(page)).toHaveText('Skyttel talar');
      expect(await heights()).toEqual(heard);
      await expect(wave.locator('i').first()).toHaveCSS('animation-name', 'none');
      await page.evaluate(() => {
        window.skyttelVoiceFixture.setSound('microphone', false, 0);
        window.skyttelVoiceFixture.setSound('remote', false, 0);
      });
      await microphoneButton(page).click();
      await openConversationText(page);
      await page.getByLabel('Meddelande till Skyttel').fill('Beskriv kartan.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect.poll(() => Boolean(release)).toBe(true);
      await view(page).getByRole('button', { name: 'Stäng textvyn' }).click();
      const marker = page.locator('.text-button-marker[data-status="working"] svg');
      await expect(marker).toHaveCSS('animation-name', 'none');
      const still = await marker.evaluate((element) => getComputedStyle(element).transform);
      await page.waitForTimeout(120);
      expect(await marker.evaluate((element) => getComputedStyle(element).transform)).toBe(still);
      await openConversationText(page);
      release?.([modelMessage('Kartan är redo.')]);
      await expect(view(page).getByRole('log')).toContainText('Kartan är redo.');
      fail = true;
      await page.getByLabel('Meddelande till Skyttel').fill('Ett nytt försök.');
      await page.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(notice(page)).toContainText('Skyttel kunde inte slutföra uppdraget.');
      for (const surface of [notice(page), view(page), page.locator('.conversation-corner')]) {
        await expect(surface).toHaveCSS('animation-name', 'none');
        await expect(surface).toHaveCSS('transition-duration', '0s');
      }
      await expect(notice(page).getByRole('button', { name: 'Stäng notisen' })).toHaveCSS(
        'transition-duration',
        '0s',
      );
      await expect(microphoneButton(page)).toHaveCSS('transition-duration', '0s');
      await expect(page.getByRole('checkbox', { name: /rörelse/i })).toHaveCount(0);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await microphoneButton(page).click();
      await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true, 0.2));
      await expect(voiceBox(page).locator('.voice-wave i').first()).not.toHaveCSS(
        'animation-name',
        'none',
      );
    } finally {
      release?.([]);
      await app.close();
    }
  });

test('HJALP-03: samma arbete och kontexttröskel läses en gång över textvy, röstruta och inställningar', async ({
  page,
}) => {
  let release: ((output: unknown[]) => void) | undefined;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const { app, live } = await setup(page, model);
  try {
    const voiceLive = page.locator('.voice-announcement:not(.voice-context-announcement)');
    await expect(voiceLive).toHaveText('');
    await openConversationText(page);
    await page.getByLabel('Meddelande till Skyttel').fill('Beskriv kartan.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(view(page).getByRole('log')).toContainText('Skyttel arbetar…');
    await expect(voiceLive).toHaveText('Skyttel arbetar');
    await expect(page.locator('.conversation-announcement')).not.toContainText('Skyttel arbetar');
    await voiceLive.locator('span').evaluate((span) => {
      span.dataset.occurrence = 'first';
    });
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    await expect(voiceLive.locator('span')).toHaveAttribute('data-occurrence', 'first');
    const liveId = [...live.channels.keys()].at(-1);
    if (!liveId) throw new Error('Missing voice');
    live.emit(liveId, {
      type: 'session.usage.updated',
      event_id: crypto.randomUUID(),
      usage: { seconds: 1 },
      context_window: { usage_ratio: 0.85 },
    });
    const context = page.locator('.voice-context-announcement');
    await expect(context).toHaveText('Kontexten är 85 procent full');
    const identity = await voiceLive.evaluateHandle((element) => element);
    const contextIdentity = await context.evaluateHandle((element) => element);
    await openSettings(page);
    await expect(voiceLive).toHaveText('Skyttel arbetar');
    expect(await voiceLive.evaluate((element, first) => element === first, identity)).toBe(true);
    expect(await context.evaluate((element, first) => element === first, contextIdentity)).toBe(
      true,
    );
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await expect(voiceLive.locator('span')).toHaveAttribute('data-occurrence', 'first');
    live.emit(liveId, {
      type: 'session.usage.updated',
      event_id: crypto.randomUUID(),
      usage: { seconds: 1 },
      // Stay below automatic summarization while checking that a higher value
      // updates the accessible name without repeating the threshold notice.
      context_window: { usage_ratio: 0.9 },
    });
    await expect(voiceBox(page).getByRole('img')).toHaveAccessibleName(
      'Kontexten är 90 procent full',
    );
    await expect(context).toHaveText('Kontexten är 85 procent full');
    await microphoneButton(page).click();
    await expect(voiceBox(page)).toHaveCount(0);
    await expect(microphoneButton(page)).toBeDisabled();
    await expect(voiceLive.locator('span')).toHaveAttribute('data-occurrence', 'first');
    release?.([modelMessage('Kartan är redo.')]);
    await expect(view(page).getByRole('log')).toContainText('Kartan är redo.');
  } finally {
    release?.([]);
    await app.close();
  }
});

test('HJALP-04: kontakt-notisen avbryter en gång utan extra mikrofonstatus och flyttas med samma identitet', async ({
  page,
}) => {
  const { app } = await setup(page);
  try {
    await openConversationText(page);
    await page.getByLabel('Meddelande till Skyttel').focus();
    await page.context().setOffline(true);
    const expected =
      'Ingen kontakt med Skyttel. Mikrofonen är av. Slå på den igen när kontakten är tillbaka.';
    await expect(notice(page)).toContainText(expected);
    await expect(page.locator('.notice-announcement[aria-live="assertive"]')).toHaveText(expected);
    await expect(
      page.locator('.voice-announcement:not(.voice-context-announcement)'),
    ).not.toHaveText('Mikrofonen är av');
    await expect(page.getByLabel('Meddelande till Skyttel')).toBeFocused();
    const identity = await notice(page).evaluateHandle((element) => element);
    await view(page).getByRole('button', { name: 'Stäng textvyn' }).click();
    expect(await notice(page).evaluate((element, first) => element === first, identity)).toBe(true);
    await openConversationText(page);
    expect(await notice(page).evaluate((element, first) => element === first, identity)).toBe(true);
    await page.context().setOffline(false);
    await expect(notice(page)).toHaveCount(0);
    await expect(page.locator('.notice-announcement[aria-live="polite"]')).toHaveText(
      'Kontakten med Skyttel är tillbaka.',
    );
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await page.context().setOffline(false);
    await app.close();
  }
});

for (const width of [1280, 390])
  test(`HJALP-05: notisens ljudknapp följer samtalsknapparna och återför fokus utan extra uppläsning vid ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { app } = await setup(
      page,
      textModel(() => [modelMessage('Hej.')]),
      false,
    );
    try {
      await page.evaluate(() => window.skyttelVoiceFixture.setPlayback('blocked'));
      await microphoneButton(page).click();
      await expect(notice(page)).toContainText('Webbläsaren stoppade ljudet.');
      const action = notice(page).getByRole('button', { name: 'Starta ljudet', exact: true });
      await microphoneButton(page).focus();
      await page.keyboard.press('Tab');
      await expect(await utilityButton(page, 'Skriv till Skyttel')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(action).toBeFocused();
      await expect(page.locator('.notice-announcement[aria-live="polite"]')).toHaveText(
        'Webbläsaren stoppade ljudet. Starta ljudet.',
      );
      await expect(notice(page).getByRole('button', { name: 'Stäng notisen' })).toHaveCount(0);
      await page.evaluate(() => window.skyttelVoiceFixture.setPlayback('allow'));
      await page.keyboard.press('Enter');
      await expect(notice(page)).toHaveCount(0);
      await expect(microphoneButton(page)).toBeFocused();
      await expect(voiceBox(page)).toHaveText('Lyssnar');
      await expect(
        page.locator('.voice-announcement:not(.voice-context-announcement)'),
      ).not.toHaveText('Lyssnar');
    } finally {
      await app.close();
    }
  });
