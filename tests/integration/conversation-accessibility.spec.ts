import type { Page } from '@playwright/test';
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
import { expect, test } from '../support/test.js';
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

test('HJALP-01: en blockerad mikrofon i ett pågående samtal går att aktivera med hjälpmedel på dator', async ({
  page,
}) => {
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
  test(`${width === 1280 ? 'HJALP-02' : 'HJALP-08'}: röstruta och notis behåller läs- och tabbordning när textvyn öppnas vid ${width}px`, async ({
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
            '.workspace-tools [aria-label="Navigera"]',
            '.workspace-talk',
            '.workspace-text',
            '.voice-stop',
            '.conversation-notice-close',
            '.workspace-tools-footer button',
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
          page.getByRole('button', {
            name: width > 700 ? 'Rapporter' : 'Information och hjälp',
            exact: true,
          }),
        ).toBeFocused();
      };
      await checkOrder();
      const card = await notice(page).boundingBox();
      const composer = await page.locator('.text-view-message').boundingBox();
      expect(card).not.toBeNull();
      expect(composer).not.toBeNull();
      expect((card?.y ?? 0) + (card?.height ?? 0)).toBeLessThanOrEqual((composer?.y ?? 0) + 1);
      await view(page).getByRole('button', { name: 'Stäng textvyn' }).click();
      await expect(view(page)).toHaveCount(0);
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
      // Stay below the 89% summary threshold while checking that a higher value
      // updates the accessible name without repeating the threshold notice.
      context_window: { usage_ratio: 0.88 },
    });
    await expect(voiceBox(page).getByRole('img')).toHaveAccessibleName(
      'Kontexten är 88 procent full',
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

for (const width of [1280, 390])
  test(`${width === 1280 ? 'HJALP-05' : 'HJALP-09'}: notisens ljudknapp följer samtalsknapparna och återför fokus utan extra uppläsning vid ${width}px`, async ({
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
