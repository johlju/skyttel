import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { expect, test } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

declare global {
  interface Window {
    skyttelRealPeers: RTCPeerConnection[];
  }
}

test('TAL-01: recorded Swedish speech changes the family map through real Live and Terra', async ({
  playwright,
}, testInfo) => {
  const apiKey = process.env.OPENAI_API_KEY;
  const speechFile = process.env.SKYTTEL_TEST_SPEECH_WAV;
  if (process.env.SKYTTEL_REAL_VOICE_TEST !== '1' || !apiKey || !speechFile)
    throw new Error(
      'Set SKYTTEL_REAL_VOICE_TEST=1, OPENAI_API_KEY and SKYTTEL_TEST_SPEECH_WAV; see docs/manual-tests/real-voice-tests.md.',
    );
  if (!isAbsolute(speechFile) || speechFile.includes('%'))
    throw new Error('The speech fixture must have an absolute path without a percent sign.');
  const audio = await readFile(speechFile);
  if (audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('The speech fixture must be a PCM WAV file.');

  const app = await createInstallation(undefined, { providerApiKey: apiKey });
  let browser: Awaited<ReturnType<typeof playwright.chromium.launch>> | undefined;
  try {
    const household = app.seedDemo();
    browser = await playwright.chromium.launch({
      args: [
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${speechFile}%noloop`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    // Observe actual peer connections without replacing media, SDP, events or providers.
    await page.addInitScript(() => {
      window.skyttelRealPeers = [];
      window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
        construct(Target, args: ConstructorParameters<typeof RTCPeerConnection>) {
          const peer = new Target(...args);
          window.skyttelRealPeers.push(peer);
          return peer;
        },
      });
    });
    await signIn(page.request, app.origin);
    const mapUrl = `${app.origin}/api/households/${household.id}/map`;
    const historyBefore = (await (await page.request.get(`${mapUrl}/history`)).json())
      .history as SaveReceipt[];
    await page.goto(app.origin);
    await page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Kim Exempel', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByLabel('Beskrivning', { exact: true }).fill('Osänd text från talprovet');
    const panel = page.getByRole('region', { name: 'Skyttels textassistent', exact: true });
    await panel.getByLabel(/Jag tillåter att OpenAI/).check();
    await panel.getByLabel(/Jag tillåter förslag och sparande/).check();
    await panel.getByRole('button', { name: 'Starta textassistenten' }).click();
    await panel.getByRole('button', { name: 'Starta röst' }).click();
    await expect(
      panel.getByText('Lyssnar. Du kan tala, rätta eller be att spara hela utkastet.'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(panel.getByRole('status')).toHaveText(
      'Sparat. Hela utkastet finns i hushållets karta.',
      { timeout: 180_000 },
    );
    await expect(panel.getByRole('log', { name: 'Samtalets dialog' })).toContainText(/Molnmusik/i);
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Osänd text från talprovet',
    );
    const state = (await (await page.request.get(mapUrl)).json()) as MapState;
    expect(
      state.objects.find((object) => object.name === 'Familjens Molnmusik')?.financialFacts?.price,
    ).toEqual({ knowledge: 'known', value: '189' });
    expect(state.objects.some((object) => object.name === 'Lo Lind')).toBe(true);
    expect(state.draft.changes).toEqual([]);
    expect(state.relationships.map((edge) => edge.knowledge)).toEqual(
      expect.arrayContaining(['unknown', 'none', 'uncertain']),
    );
    const history = (await (await page.request.get(`${mapUrl}/history`)).json())
      .history as SaveReceipt[];
    const added = history.filter(
      (receipt) => !historyBefore.some((before) => before.operationId === receipt.operationId),
    );
    expect(added).toHaveLength(1);
    expect(
      added[0].changes.some(
        (change) =>
          change.after?.name === 'Familjens Molnmusik' &&
          change.after.financialFacts?.price?.value === '189',
      ),
    ).toBe(true);
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            for (const peer of window.skyttelRealPeers) {
              const stats = await peer.getStats();
              for (const report of stats.values()) {
                if (
                  report.type === 'inbound-rtp' &&
                  report.kind === 'audio' &&
                  report.bytesReceived > 0 &&
                  report.totalAudioEnergy > 0
                )
                  return true;
              }
            }
            return false;
          }),
        { timeout: 30_000 },
      )
      .toBe(true);
    await panel.getByRole('button', { name: 'Stäng av rösten' }).click();
    await expect(panel.getByText('Rösten är avstängd.')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const peers = window.skyttelRealPeers;
          return (
            peers.length > 0 &&
            peers.every(
              (peer) =>
                peer.connectionState === 'closed' &&
                peer
                  .getSenders()
                  .every((sender) => !sender.track || sender.track.readyState === 'ended'),
            )
          );
        }),
      )
      .toBe(true);
    await panel.getByRole('button', { name: 'Avsluta textassistenten' }).click();
    await app.restart();
    const recovered = (await (await page.request.get(`${mapUrl}/history`)).json())
      .history as SaveReceipt[];
    expect(recovered.find((receipt) => receipt.operationId === added[0].operationId)).toEqual(
      added[0],
    );
    await testInfo.attach('real-voice-evidence', {
      contentType: 'application/json',
      body: JSON.stringify({
        executedAt: new Date().toISOString(),
        recordingSha256: createHash('sha256').update(audio).digest('hex'),
        chromium: browser.version(),
        models: ['gpt-live-1', 'gpt-5.6-terra'],
        receipt: added[0],
        receivedAudio: true,
        mediaClosed: true,
        receiptSurvivesRestart: true,
      }),
    });
  } finally {
    await browser?.close();
    await app.close();
  }
});
