import { expect, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  consentBox,
  startConversationWithVoice,
  turnMicrophoneOff,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const microphone = (page: Page) =>
  page.getByRole('navigation', { name: 'Kartans verktyg' }).locator('.workspace-talk');
const tracks = (page: Page) =>
  page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks);
async function installation(page: Page, mac = false) {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Ett provsvar.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  await createHousehold(page.request, app.origin);
  await page.addInitScript({ content: liveBrowserFixtureSource });
  if (mac)
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' }),
    );
  await page.goto(app.origin);
  return { app, live };
}
async function down(page: Page) {
  const box = await microphone(page).boundingBox();
  if (!box) throw Error('Missing microphone');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

test('MIKROFONTRYCK-01: kort och långt tryck styr samma mikrofon och släpp behåller svaret', async ({
  page,
}) => {
  const { app } = await installation(page);
  try {
    await startConversationWithVoice(page);
    await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true');
    await turnMicrophoneOff(page);
    await down(page);
    await expect(microphone(page)).toHaveAttribute('data-held', 'true');
    await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await tracks(page))[0].enabled).toBe(true);
    await page.mouse.move(700, 500);
    await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.up();
    await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(microphone(page)).not.toHaveAttribute('data-held', 'true');
    expect((await tracks(page))[0]).toEqual({ enabled: false, state: 'live' });
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true));
    await expect(page.locator('.voice-box')).toContainText('Skyttel talar');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().openPeers)).toBe(1);
    await microphone(page).click();
    await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true');
    await microphone(page).click();
    await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await app.close();
  }
});

test('MIKROFONTRYCK-02: ett långt tryck utan medgivande gör som ett kort och startar inget i förväg', async ({
  page,
}) => {
  const { app } = await installation(page);
  try {
    await down(page);
    await expect(microphone(page)).toHaveAttribute('data-held', 'true');
    await page.waitForTimeout(550);
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests)).toBe(
      0,
    );
    await expect(consentBox(page)).toHaveCount(0);
    await page.mouse.up();
    await expect(consentBox(page)).toBeVisible();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests)).toBe(
      0,
    );
    await consentBox(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(microphone(page)).toBeFocused();
  } finally {
    await app.close();
  }
});

for (const mac of [false, true])
  test.describe(mac ? 'macOS' : 'Windows och Linux', () => {
    test('MIKROFONTRYCK-03: tangentkombinationen har samma korta och långa tryck', async ({
      page,
    }) => {
      const { app } = await installation(page, mac);
      const shortcut = mac ? 'Control+Shift+Space' : 'Control+Space';
      try {
        await startConversationWithVoice(page);
        await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true');
        await turnMicrophoneOff(page);
        await expect(microphone(page)).toHaveAttribute(
          'title',
          `Prata med Skyttel (${mac ? 'Ctrl+Skift+Mellanslag' : 'Ctrl+Mellanslag'}). Håll in för att tala tills du släpper.`,
        );
        await page.keyboard.press(shortcut);
        await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press(shortcut);
        await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false');
        await page.keyboard.down('Control');
        if (mac) await page.keyboard.down('Shift');
        await page.keyboard.down('Space');
        await expect.poll(async () => (await tracks(page))[0].enabled).toBe(true);
        await page.keyboard.down('Space'); // key repeat must not toggle again
        await page.keyboard.up('Control');
        if (mac) await page.keyboard.up('Shift');
        await page.keyboard.up('Space');
        await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false');
        expect(
          await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneRequests),
        ).toBe(1);
      } finally {
        await app.close();
      }
    });
  });

test.describe('bred pekskärm med minskad rörelse', () => {
  test.use({
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  test('MIKROFONTRYCK-04: pektryck har ring utan meny och systemavbrott släpper mikrofonen', async ({
    page,
  }) => {
    const { app } = await installation(page);
    try {
      await startConversationWithVoice(page);
      await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true');
      await turnMicrophoneOff(page);
      await expect(microphone(page)).not.toHaveAttribute('title');
      const touch = await page.context().newCDPSession(page);
      const box = await microphone(page).boundingBox();
      if (!box) throw Error('Missing microphone');
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 7 }],
      });
      const style = await microphone(page).evaluate((element) => ({
        ring: getComputedStyle(element).outlineWidth,
        select: getComputedStyle(element).userSelect,
        touch: getComputedStyle(element).touchAction,
        animation: getComputedStyle(element).animationName,
      }));
      expect(style).toEqual({ ring: '3px', select: 'none', touch: 'none', animation: 'none' });
      await expect.poll(async () => (await tracks(page))[0].enabled).toBe(true);
      expect(
        await microphone(page).evaluate(
          (element) =>
            !element.dispatchEvent(
              new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
            ),
        ),
      ).toBe(true);
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 700, y: 500, id: 7 }],
      });
      await expect(microphone(page)).toHaveAttribute('aria-pressed', 'true');
      await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false');
      await touch.detach();
      await expect(microphone(page)).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await app.close();
    }
  });
});
