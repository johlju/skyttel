import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  startConversationWithText,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

for (const scenario of [
  { id: 'LEV-01', audio: false, width: 1280 },
  { id: 'LEV-02', audio: true, width: 390 },
]) {
  test(`${scenario.id}: hela svaret kommer vid utgång och rensas vid ny inloggning${scenario.audio ? ' med ljudnotis' : ' utan ljudnotis'}`, async ({
    page,
  }) => {
    let clock = Date.now();
    let release: (output: unknown[]) => void = () => {};
    const model = textModel(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = resolve;
        }),
    );
    const live = liveProvider();
    const app = await createInstallation(undefined, {
      now: () => clock,
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    const frames: Record<string, unknown>[] = [];
    const receipts: Record<string, unknown>[] = [];
    page.on('websocket', (socket) => {
      if (!socket.url().endsWith('/delivery')) return;
      socket.on('framereceived', ({ payload }) => frames.push(JSON.parse(String(payload))));
      socket.on('framesent', ({ payload }) => receipts.push(JSON.parse(String(payload))));
    });
    try {
      await page.setViewportSize({ width: scenario.width, height: 800 });
      await page.addInitScript({ content: liveBrowserFixtureSource });
      await signIn(page.request, app.origin);
      await createHousehold(page.request, app.origin, 'Leveransprov');
      clock += 8 * 60 * 60_000 - 60_000;
      await page.goto(app.origin);
      await startConversationWithText(page);
      if (scenario.audio) {
        await turnMicrophoneOn(page);
        await expect(voiceBox(page)).toHaveText('Lyssnar');
      }
      const textView = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
      await textView
        .getByRole('textbox', { name: 'Meddelande till Skyttel' })
        .fill('Beskriv hela svaret.');
      await textView.getByRole('button', { name: 'Skicka', exact: true }).click();
      await expect.poll(() => model.requests.length).toBe(1);
      await expect.poll(() => frames.some((frame) => frame.state === 'waiting')).toBe(true);
      clock += 60_000;
      await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
      const login = page.getByRole('button', { name: 'Fortsätt med Google' });
      await login.focus();
      const announcement = page.locator('.task-delivery-announcement');
      await expect(announcement).toHaveAttribute('role', 'status');
      await expect(announcement).toHaveAttribute('aria-live', 'polite');
      await expect(announcement).toHaveText('');
      await announcement.evaluate((element) => {
        const records: string[] = [];
        new MutationObserver(() => records.push(element.textContent ?? '')).observe(element, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        Object.assign(window, { deliveryAnnouncements: records });
      });
      const full = `${'Alla delar i ett långt svar med åäö och 🚲. '.repeat(60)}Sista frågan: vem använder cykeln?`;
      release([modelMessage(full)]);
      const panel = page.getByRole('region', { name: 'Hela svaret som text', exact: true });
      await expect(panel).toContainText(full);
      await expect(panel).toContainText('Inget nytt sparande är bekräftat.');
      await expect.poll(() => frames.some((frame) => frame.state === 'received')).toBe(true);
      expect(receipts).toHaveLength(1);
      expect(receipts[0].text).toBe(
        frames.find((frame) => frame.state === 'awaiting-receipt')?.text,
      );
      expect(frames.find((frame) => frame.state === 'awaiting-receipt')?.saveState).toBe(
        'unconfirmed',
      );
      await expect(announcement).toHaveText(
        `Hela svaret finns här som text. Inget nytt sparande är bekräftat.${scenario.audio ? ' Ljudleveransen kan inte bekräftas.' : ''}`,
      );
      await expect(login).toBeFocused();
      expect(
        await page.evaluate(
          () => (window as Window & { deliveryAnnouncements?: string[] }).deliveryAnnouncements,
        ),
      ).toHaveLength(1);
      if (scenario.audio) await expect(panel).toContainText('Ljudleveransen kan inte bekräftas.');
      else await expect(panel).not.toContainText('Ljudleveransen kan inte bekräftas.');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      expect(model.requests).toHaveLength(1);
      // Same-user replacement must clear even an already closed delivery's
      // transient text. Bootstrap provides correlation, never new authority.
      await signIn(page.request, app.origin);
      await expect(panel).toHaveCount(0, { timeout: 8000 });
      expect(model.requests).toHaveLength(1);
    } finally {
      release([modelMessage('Avslutat prov.')]);
      await page.close();
      await app.close();
    }
  });
}
