import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
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

async function setup(page: Page, respond: Parameters<typeof textModel>[0] = () => []) {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(respond).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  const { household } = await (
    await createHousehold(page.request, app.origin, 'Familjen Berg')
  ).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const current = await (await page.request.get(path)).json();
  const proposed = await page.request.post(`${path}/draft`, {
    headers: { origin: app.origin },
    data: {
      version: current.draft.version,
      contentVersion: current.contentVersion,
      id: 'lo',
      baseRevision: null,
      value: { typeId: current.types[0].id, name: 'Lo Exempel', description: '' },
    },
  });
  expect(proposed.ok()).toBe(true);
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  const guide = page.getByRole('button', { name: 'Stäng vägledningen', exact: true });
  if (await guide.isVisible()) await guide.click();
  return { app, live, path };
}

async function capture(page: Page, name: string) {
  const directory = process.env.SKYTTEL_AUDIT_SCREENSHOTS;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${name}.png`), animations: 'disabled' });
}

async function appearance(card: Locator) {
  return card.evaluate((element) => {
    const luminance = (color: string) => {
      const values = color.match(/[\d.]+/g)?.map(Number);
      if (!values || values.length < 3 || (values.length === 4 && values[3] !== 1))
        throw new Error(`Expected opaque color: ${color}`);
      const [r, g, b] = values.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return r * 0.2126 + g * 0.7152 + b * 0.0722;
    };
    const ratio = (first: string, second: string) => {
      const a = luminance(first);
      const b = luminance(second);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const icon = element.querySelector('svg');
    const text = element.querySelector('p');
    if (!icon || !text) throw new Error('Missing visible notice content');
    const surface = getComputedStyle(element).backgroundColor;
    const iconColor = getComputedStyle(icon).color;
    const textColor = getComputedStyle(text).color;
    const iconBox = icon.getBoundingClientRect();
    const textBox = text.getBoundingClientRect();
    return {
      iconColor,
      iconContrast: ratio(iconColor, surface),
      textContrast: ratio(textColor, surface),
      iconLeftOfText: iconBox.right <= textBox.left,
    };
  });
}

for (const theme of ['light', 'dark'] as const)
  test(`NOT-09: symbolfärg och läsbarhet skiljer hinder från händelse i ${theme} tema`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const { app } = await setup(page);
    try {
      await startConversationWithText(page);
      await view(page).getByRole('button', { name: 'Stäng textvyn' }).click();
      app.setConversationAvailable(false);
      await expect(microphoneButton(page)).toHaveAccessibleDescription(
        /Inte tillgängligt just nu\./,
      );
      await microphoneButton(page).click();
      await expect(notice(page)).toContainText('Samtal med Skyttel är inte tillgängligt just nu.');
      await expect(notice(page).getByRole('button', { name: 'Stäng notisen' })).toBeVisible();
      await expect(notice(page).locator('svg')).toHaveAttribute('aria-hidden', 'true');
      const blocker = await appearance(notice(page));
      expect(blocker.iconContrast).toBeGreaterThanOrEqual(3);
      expect(blocker.textContrast).toBeGreaterThanOrEqual(4.5);
      expect(blocker.iconLeftOfText).toBe(true);
      await capture(page, `notice-unavailable-${theme}`);

      app.setConversationAvailable(true);
      await expect(notice(page)).toHaveCount(0);
      await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('deny'));
      await microphoneButton(page).click();
      await expect(notice(page)).toContainText('Webbläsaren tillåter inte mikrofonen.');
      await expect(notice(page).getByRole('button', { name: 'Stäng notisen' })).toBeVisible();
      const event = await appearance(notice(page));
      expect(event.iconColor).not.toBe(blocker.iconColor);
      expect(event.iconContrast).toBeGreaterThanOrEqual(3);
      expect(event.textContrast).toBeGreaterThanOrEqual(4.5);
      expect(event.iconLeftOfText).toBe(true);
      await capture(page, `notice-microphone-${theme}`);
    } finally {
      await app.close();
    }
  });

test('NOT-10: ett verkligt väntande sparförsök visar frågesymbol och kontrollknapp under texten', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const { app, path } = await setup(page);
  try {
    const current = await (await page.request.get(path)).json();
    expect(
      (
        await page.request.post(`${path}/operations`, {
          headers: { origin: app.origin },
          data: {
            operationId: 'audit-original-save',
            version: current.draft.version,
            contentVersion: current.contentVersion,
          },
        })
      ).ok(),
    ).toBe(true);
    // A real registered operation, with only the browser's check transport lost.
    await page.route('**/text-assistant/recover', (route) => route.abort());
    await page.reload();
    await expect(notice(page)).toContainText(
      'Skyttel kunde inte kontrollera om utkastet sparades.',
    );
    const guide = page.getByRole('button', { name: 'Stäng vägledningen', exact: true });
    if (await guide.isVisible()) await guide.click();
    await expect(guide).toHaveCount(0);
    const action = notice(page).getByRole('button', {
      name: 'Kontrollera om utkastet sparades',
      exact: true,
    });
    const paragraph = await notice(page).locator('p').boundingBox();
    const button = await action.boundingBox();
    expect(paragraph).not.toBeNull();
    expect(button).not.toBeNull();
    expect(button?.y).toBeGreaterThanOrEqual((paragraph?.y ?? 0) + (paragraph?.height ?? 0));
    expect(button?.height).toBeGreaterThanOrEqual(44);
    await expect(notice(page).getByRole('button', { name: 'Stäng notisen' })).toHaveCount(0);
    expect((await appearance(notice(page))).iconLeftOfText).toBe(true);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await capture(page, 'selected-notice-equivalent');
    expect((await (await page.request.get(path)).json()).draft).toEqual(current.draft);
  } finally {
    await app.close();
  }
});

test.describe('valt mobilt samtalsflöde', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('TEXTMOBIL-05: vald röstruta och kompakt textvy använder det riktiga samtalet', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    let release: ((output: unknown[]) => void) | undefined;
    const { app, live } = await setup(
      page,
      () => new Promise<unknown[]>((resolve) => (release = resolve)),
    );
    try {
      await startConversationWithVoice(page);
      await expect(voiceBox(page)).toHaveText('Lyssnar');
      const id = [...live.channels.keys()].at(-1);
      if (!id) throw new Error('Missing actual provider session');
      live.emit(id, {
        type: 'session.input_transcript.delta',
        event_id: 'audit-utterance',
        delta: 'Beskriv utkastet.',
        start_ms: 0,
        end_ms: 100,
      });
      live.emit(id, {
        type: 'session.delegation.created',
        event_id: 'audit-delegation',
        offset_ms: 100,
        delegation: { id: 'audit-task', type: 'delegation', target: 'client' },
      });
      await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
      await expect(voiceBox(page).getByRole('button', { name: 'Avbryt' })).toBeVisible();
      await expect(view(page)).toHaveCount(0);
      const voice = await voiceBox(page).boundingBox();
      const row = await page.locator('.spatial-bottom-bar').boundingBox();
      const feedback = await page.locator('.workspace-voice-controls').boundingBox();
      expect(voice).not.toBeNull();
      expect(row).not.toBeNull();
      expect(feedback).not.toBeNull();
      // Both protected map surfaces belong at the lower edge, with voice above them.
      expect(row?.y).toBeGreaterThan(844 / 2);
      expect(voice?.y).toBeGreaterThan(844 / 2);
      expect((voice?.y ?? 0) + (voice?.height ?? 0)).toBeLessThanOrEqual(row?.y ?? 0);
      expect((row?.y ?? 0) + (row?.height ?? 0)).toBeLessThanOrEqual(feedback?.y ?? 0);
      await capture(page, 'selected-voice-equivalent');
      await expect.poll(() => Boolean(release)).toBe(true);
      release?.([modelMessage('Lo-förslaget ligger kvar i utkastet.')]);
      await expect(voiceBox(page)).toHaveText('Lyssnar');
      await openConversationText(page);
      const field = page.getByRole('textbox', { name: 'Meddelande till Skyttel' });
      await expect(field).not.toBeFocused();
      await field.fill('Beskriv den senaste ändringen.');
      await view(page).getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
      // Resize exercises the real visible-viewport layout; it is not an iOS keyboard.
      await page.setViewportSize({ width: 390, height: 508 });
      await expect(view(page)).toHaveAttribute('data-short', 'true');
      await expect(field).toBeFocused();
      await expect(field).toHaveAttribute('rows', '1');
      const fieldBounds = await field.boundingBox();
      const sendBounds = await view(page)
        .getByRole('button', { name: 'Avbryt', exact: true })
        .boundingBox();
      expect(fieldBounds).not.toBeNull();
      expect(sendBounds).not.toBeNull();
      expect(
        Math.abs(
          (fieldBounds?.y ?? 0) +
            (fieldBounds?.height ?? 0) / 2 -
            ((sendBounds?.y ?? 0) + (sendBounds?.height ?? 0) / 2),
        ),
      ).toBeLessThanOrEqual(1);
      await expect(view(page).getByRole('log')).toContainText('Lo-förslaget ligger kvar');
      await expect(view(page).getByRole('button', { name: 'Avbryt', exact: true })).toBeVisible();
      await expect(voiceBox(page).getByRole('button', { name: 'Avbryt' })).toHaveCount(0);
      await capture(page, 'selected-text-keyboard-equivalent');
      await page.setViewportSize({ width: 844, height: 190 });
      await expect(view(page)).toHaveAttribute('data-short', 'true');
      await expect(field).toBeFocused();
      await capture(page, 'landscape-190');
      await page.setViewportSize({ width: 820, height: 1180 });
      await expect(view(page)).toHaveAttribute('data-short', 'false');
      expect((await view(page).boundingBox())?.width).toBe(400);
      await capture(page, 'ipad-portrait');
    } finally {
      release?.([]);
      await app.close();
    }
  });
});
