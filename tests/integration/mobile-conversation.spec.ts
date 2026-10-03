import { expect, type Locator, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  closeConversationText,
  microphoneButton,
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const view = (page: Page) => page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const field = (page: Page) => view(page).getByRole('textbox', { name: 'Meddelande till Skyttel' });
async function bounds(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error('Missing public UI element');
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
}
async function setup(
  page: Page,
  respond: Parameters<typeof textModel>[0] = () => [modelMessage('Ett synligt provsvar.')],
) {
  const live = liveProvider();
  const model = textModel(respond);
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin)).json();
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
          value: { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Påhittad uppgift' },
        },
      })
    ).status(),
  ).toBe(200);
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  return { app, live, model };
}

for (const size of [
  { width: 390, height: 844, mobile: true },
  { width: 375, height: 667, mobile: true },
  { width: 844, height: 390, mobile: true },
  { width: 820, height: 1180, mobile: true },
  { width: 1180, height: 820, mobile: true },
  { width: 320, height: 250, mobile: false },
  { width: 700, height: 500, mobile: false },
  { width: 1280, height: 900, mobile: false },
])
  test.describe(`${size.width}×${size.height} ${size.mobile ? 'pekare finger' : 'pekare mus'}`, () => {
    test.use({ viewport: size, isMobile: size.mobile, hasTouch: size.mobile });
    test('TEXTMOBIL-01: samma lägesregel ger rätt bredd och kompakt rad', async ({ page }) => {
      const { app } = await setup(page);
      try {
        await startConversationWithText(page);
        const narrow = size.width <= 700;
        const short = (size.mobile || narrow) && size.height < 520;
        await expect(view(page)).toHaveAttribute('data-short', String(short));
        await expect(page.locator('.household-map')).toHaveAttribute(
          'data-mobile',
          String(size.mobile),
        );
        expect((await bounds(view(page))).width).toBe(narrow ? size.width : 400);
        expect((await bounds(view(page))).bottom).toBe(size.height);
        if (!narrow)
          expect((await bounds(page.locator('.map-space'))).right).toBe(size.width - 400);
        if (size.mobile || narrow) await expect(field(page)).not.toBeFocused();
        else await expect(field(page)).toBeFocused();
        const draft = view(page).getByRole('button', { name: 'Visa utkastet (1)', exact: true });
        if (short) {
          await expect(draft).toHaveText('Utkast (1)', { useInnerText: true });
          const controls = [
            view(page).getByRole('meter', { name: 'Kontext' }),
            draft,
            view(page).getByRole('button', { name: 'Nytt samtal', exact: true }),
            view(page).getByRole('button', { name: 'Stäng textvyn', exact: true }),
          ];
          const centers = await Promise.all(
            controls.map(async (control) => {
              const box = await bounds(control);
              return box.y + box.height / 2;
            }),
          );
          expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2);
          for (const element of [
            view(page).getByRole('heading', { name: 'Skriv till Skyttel' }),
            view(page).locator('.conversation-context-meter label'),
            view(page).locator('form label'),
          ])
            expect(await element.evaluate((node) => getComputedStyle(node).clipPath)).toBe(
              'inset(50%)',
            );
          await expect(field(page)).toHaveAttribute('rows', '1');
        } else await expect(field(page)).toHaveAttribute('rows', '2');
        await field(page).fill('Ett vanligt uppdrag.');
        await view(page).getByRole('button', { name: 'Skicka', exact: true }).click();
        await expect(field(page)).toBeFocused();
        await expect(view(page).getByRole('log')).toContainText('Ett synligt provsvar.');
        await draft.click();
        await expect(
          view(page).getByRole('button', { name: 'Dölj utkastet (1)', exact: true }),
        ).toHaveAttribute('aria-expanded', 'true');
        await expect(
          view(page).getByRole('region', { name: 'Utkastet', exact: true }),
        ).toContainText('Lo Exempel');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      } finally {
        await app.close();
      }
    });
  });

for (const size of [
  { width: 390, height: 844, visible: 508 },
  { width: 375, height: 667, visible: 407 },
  { width: 1180, height: 820, visible: 420 },
  { width: 844, height: 390, visible: 190 },
])
  test.describe(`synlig höjd ${size.visible}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });
    test('TEXTMOBIL-02: synlig höjd följs utan att fält eller fokus byts', async ({ page }) => {
      const { app } = await setup(page);
      try {
        await startConversationWithText(page);
        await expect(field(page)).not.toBeFocused();
        await turnMicrophoneOn(page);
        await field(page).fill('Ett vanligt uppdrag.');
        const original = await field(page).elementHandle();
        // Actual browser viewport resize exercises visualViewport's resize event.
        // This is not a claim that a physical iPhone keyboard has been exercised.
        await page.setViewportSize({ width: size.width, height: size.visible });
        await expect(view(page)).toHaveAttribute('data-short', 'true');
        await expect(field(page)).toBeFocused();
        expect(await original?.evaluate((element) => element === document.activeElement)).toBe(
          true,
        );
        await expect(field(page)).toHaveValue('Ett vanligt uppdrag.');
        const surface = await bounds(view(page));
        expect(surface.bottom).toBe(size.visible);
        if (size.visible === 190) expect(surface.height).toBe(134);
        const input = await bounds(field(page));
        const send = await bounds(view(page).getByRole('button', { name: 'Skicka', exact: true }));
        expect(input.bottom).toBeLessThanOrEqual(size.visible);
        expect(send.bottom).toBeLessThanOrEqual(size.visible);
        const body = await bounds(view(page).locator('.text-view-body'));
        expect(body.height).toBeGreaterThanOrEqual(18);
        expect((await bounds(voiceBox(page))).height).toBe(36);
        if (size.width > 700)
          expect((await bounds(voiceBox(page))).bottom).toBeLessThanOrEqual(surface.y);
        else
          expect((await bounds(voiceBox(page))).bottom).toBeLessThanOrEqual(
            (await bounds(view(page).locator('form'))).y,
          );
        await view(page).getByRole('button', { name: 'Skicka', exact: true }).click();
        await expect(field(page)).toBeFocused();
        await expect(view(page).getByRole('log')).toContainText('Ett synligt provsvar.');
        const last = await bounds(view(page).locator('.conversation-row.assistant').last());
        const visibleBody = await bounds(view(page).locator('.text-view-body'));
        expect(last.y).toBeGreaterThanOrEqual(visibleBody.y);
        expect(last.bottom).toBeLessThanOrEqual(visibleBody.bottom);
        await page.setViewportSize({ width: size.width, height: size.height });
        await expect(field(page)).toBeFocused();
        await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
      } finally {
        await app.close();
      }
    });
  });

test.describe('smal mobil med återkoppling', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('TEXTMOBIL-03: röstrutan och notisen lämnar kartans nederkant fri', async ({ page }) => {
    const { app } = await setup(page, () => {
      throw new Error('Synthetic provider failure');
    });
    try {
      await startConversationWithText(page);
      await turnMicrophoneOn(page);
      await closeConversationText(page);
      await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true));
      const stop = voiceBox(page).getByRole('button', { name: 'Avbryt', exact: true });
      await expect(stop).toBeVisible();
      const target = await stop.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const hit = getComputedStyle(element, '::after');
        return {
          width: box.width - Number.parseFloat(hit.left) - Number.parseFloat(hit.right),
          height: box.height - Number.parseFloat(hit.top) - Number.parseFloat(hit.bottom),
        };
      });
      expect(target).toEqual({ width: 44, height: 44 });
      const stopBox = await bounds(stop);
      // Hit the extended area outside the unchanged 26px visible circle.
      await page.mouse.click(stopBox.x + stopBox.width / 2, stopBox.y - 7);
      await expect(stop).toHaveCount(0);
      const voice = await bounds(voiceBox(page));
      for (const selector of [
        '.spatial-bottom-bar',
        '.workspace-feedback',
        '.workspace-voice-controls',
      ]) {
        const feedback = page.locator(selector);
        if ((await feedback.isVisible()) && (await bounds(feedback)).height > 0)
          expect(voice.bottom).toBeLessThanOrEqual((await bounds(feedback)).y);
      }
      await page
        .getByRole('navigation', { name: 'Kartans verktyg' })
        .getByRole('button', { name: 'Skriv till Skyttel', exact: true })
        .click();
      await field(page).fill('Ett kontrollerat fel.');
      await view(page).getByRole('button', { name: 'Skicka', exact: true }).click();
      const close = view(page).getByRole('button', { name: 'Stäng notisen', exact: true });
      await expect(close).toBeVisible();
      const closeBox = await bounds(close);
      expect(closeBox.width).toBe(44);
      expect(closeBox.height).toBe(44);
      await close.click();
      await expect(close).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});

test.describe('kort mobil med lång notis', () => {
  test.use({ viewport: { width: 844, height: 190 }, isMobile: true, hasTouch: true });
  test('TEXTMOBIL-04: en lång notis rullar och kan stängas i kort fönster', async ({ page }) => {
    const { app } = await setup(page, () => {
      throw new Error('Synthetic provider failure');
    });
    try {
      await startConversationWithText(page);
      await field(page).fill('Ett kontrollerat fel.');
      await view(page).getByRole('button', { name: 'Skicka', exact: true }).click();
      const notice = view(page).locator('.conversation-notice');
      await expect(notice).toContainText('Skyttel kunde inte slutföra uppdraget. Försök igen.');
      const close = notice.getByRole('button', { name: 'Stäng notisen', exact: true });
      const closeBox = await bounds(close);
      expect(closeBox.height).toBe(44);
      expect(closeBox.width).toBe(44);
      expect(closeBox.bottom).toBeLessThanOrEqual(190);
      expect(await notice.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      await notice.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(notice).toHaveCount(0);
      await field(page).fill('Fortsätt med text.');
      await view(page).getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect(field(page)).toBeFocused();
    } finally {
      await app.close();
    }
  });
});
