import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../support/client.js';
import {
  openConversationText,
  selectConversation,
  startConversationWithText,
  turnMicrophoneOff,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { expect, test } from '../support/test.js';
import { modelMessage, textModel } from '../support/text-model.js';

test('speech fragments form the same transcript rows during voice and after restoration', {
  tag: '@technical',
}, async ({ page }) => {
  const live = liveProvider();
  let answer = 'Lampan finns i garaget.';
  const model = textModel(() => [modelMessage(answer)]);
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin, 'Samtalstextprov');
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    const text = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const rows = text.getByRole('log', { name: 'Samtalstext' }).getByRole('listitem');
    await text.getByRole('textbox', { name: 'Meddelande till Skyttel' }).fill('Var finns lampan?');
    await text.getByRole('button', { name: 'Skicka', exact: true }).click();
    const typed = ['Du: Var finns lampan?', 'Skyttel: Lampan finns i garaget.'];
    await expect(rows).toHaveText(typed);
    await turnMicrophoneOn(page);
    const providerId = [...live.channels.keys()][0];
    const emit = async (role: 'input' | 'output', firstMs: number, parts: string[]) => {
      const events = parts.map((delta, index) => ({
        type: `session.${role}_transcript.delta`,
        event_id: crypto.randomUUID(),
        delta,
        start_ms: firstMs + index * 100,
        end_ms: firstMs + (index + 1) * 100,
      }));
      for (const event of events) live.emit(providerId, event);
      await page.evaluate((fragments) => {
        for (const fragment of fragments) window.skyttelVoiceFixture.emit(fragment);
      }, events);
    };
    await emit('output', 0, ['Berätta ', 'gärna.']);
    await emit('input', 200, ['Jag vill kop']);
    await emit('output', 400, ['Vil', 'ken ']);
    await emit('input', 650, ['pla', ' ', 'lampan.']);
    await emit('output', 1100, ['lampa?']);
    await emit('output', 3300, ['Den i ', 'hallen.']);
    await emit('input', 3600, ['Ja, den.']);
    await emit('output', 3900, ['Den passar där.']);
    await emit('output', 6100, [' ']);
    await emit('output', 8400, ['Det gamla svaret.']);
    const active = [
      ...typed,
      'Skyttel: Berätta gärna.',
      'Du: Jag vill koppla lampan.',
      'Skyttel: Vilken lampa?',
      'Skyttel: Den i hallen.',
      'Du: Ja, den.',
      'Skyttel: Den passar där.',
      'Skyttel: Det gamla svaret.',
    ];
    await expect(rows).toHaveText(active);
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true));
    const box = voiceBox(page);
    await expect(box).toHaveText('Skyttel talar');
    await box.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
    await expect(box).toHaveText('Lyssnar');

    answer = 'Jag förstår att du menar hallen.';
    const correction = 'Jag menar lampan i hallen.';
    await text.getByRole('textbox', { name: 'Meddelande till Skyttel' }).fill(correction);
    await text.getByRole('button', { name: 'Skicka', exact: true }).click();
    const corrected = [...active, `Du: ${correction}`, `Skyttel: ${answer}`];
    await expect(rows).toHaveText(corrected);
    await emit('output', 8800, ['Nu förstår jag.']);
    corrected.push('Skyttel: Nu förstår jag.');
    await expect(rows).toHaveText(corrected);
    await turnMicrophoneOff(page);
    await expect(rows).toHaveText(corrected);
    await app.restart();
    // Older saved fragments have the same text without a turn marker.
    await page.route('**/text-assistant/retained/*/open', async (route) => {
      const response = await route.fetch();
      const body: TextAssistantView = await response.json();
      for (const row of body.conversation ?? [])
        if (row.text === 'Berätta ' || row.text === 'gärna.') delete row.utteranceStart;
      await route.fulfill({ response, json: body });
    });
    await page.reload();
    await openConversationText(page);
    await selectConversation(page, 'Var finns lampan?');
    await expect(rows).toHaveText([
      ...active,
      'Skyttel: Avbrutet. Föreslagna ändringar ligger kvar i utkastet.',
      ...corrected.slice(active.length),
    ]);
  } finally {
    await app.close();
  }
});

test('a spoken correction received before the interruption restores as a separate row', {
  tag: '@technical',
}, async ({ page }) => {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Jag lyssnar.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin, 'Samtalstextprov');
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await startConversationWithText(page);
    await turnMicrophoneOn(page);
    const providerId = [...live.channels.keys()][0];
    const inputFragment = (delta: string, start_ms: number, end_ms: number) => ({
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta,
      start_ms,
      end_ms,
    });
    const previous = inputFragment('Före avbrottet.', 0, 10);
    const early = inputFragment('Jag menar ', 0, 0);
    await page.evaluate((event) => {
      window.skyttelVoiceFixture.emit(event);
      window.skyttelVoiceFixture.setSound('remote', true);
    }, previous);
    await page.route('**/interrupt', async (route) => {
      const { interruptedThroughMs } = route.request().postDataJSON() as {
        interruptedThroughMs: number;
      };
      // Deliver both fragments to the server before its cutoff arrives. Only
      // the correction follows that cutoff, and the two fragments are close.
      live.emit(providerId, {
        ...previous,
        start_ms: Math.max(0, interruptedThroughMs - 10),
        end_ms: interruptedThroughMs,
      });
      early.start_ms = interruptedThroughMs + 10;
      early.end_ms = early.start_ms + 100;
      live.emit(providerId, early);
      await route.continue();
    });

    const box = voiceBox(page);
    await expect(box).toHaveText('Skyttel talar');
    const interrupted = page.waitForResponse((response) => response.url().endsWith('/interrupt'));
    await box.getByRole('button', { name: 'Avbryt', exact: true }).click();
    expect((await interrupted).ok()).toBe(true);
    const suffix = inputFragment('cykeln.', early.end_ms, early.end_ms + 100);
    live.emit(providerId, suffix);
    await page.evaluate(
      (events) => {
        window.skyttelVoiceFixture.setSound('remote', false);
        for (const event of events) window.skyttelVoiceFixture.emit(event);
      },
      [early, suffix],
    );

    const text = page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
    const speech = text
      .getByRole('log', { name: 'Samtalstext' })
      .getByRole('listitem')
      .filter({ hasText: /^Du:/u });
    const expected = ['Du: Före avbrottet.', 'Du: Jag menar cykeln.'];
    await expect(speech).toHaveText(expected);
    await turnMicrophoneOff(page);
    await app.restart();
    await page.reload();
    await openConversationText(page);
    await selectConversation(page, /^Före avbrottet/);
    await expect(speech).toHaveText(expected);
  } finally {
    await app.close();
  }
});
