import { expect, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  microphoneButton,
  startConversationWithText,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const notice = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Samtalsnotis', exact: true });
const browserFailures = [
  [
    'deny',
    'Webbläsaren tillåter inte mikrofonen. Tillåt den i webbläsarens inställningar och tryck på mikrofonknappen igen.',
  ],
  ['error', 'Ingen mikrofon hittades. Anslut en mikrofon och tryck på mikrofonknappen igen.'],
  ['busy', 'Mikrofonen kunde inte öppnas. Kontrollera om en annan app använder den.'],
  ['unsupported', 'Webbläsaren har inte stöd för röst. Du kan skriva till Skyttel.'],
] as const;

async function setup(page: import('@playwright/test').Page, liveFetch?: typeof fetch) {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Hej.')]).provider,
    liveFetch: liveFetch ?? live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  await createHousehold(page.request, app.origin);
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  await startConversationWithText(page);
  return { app, live };
}

for (const [failure, expected] of browserFailures)
  test(`ROSTFEL-01: ${failure} ger en stängbar mikrofonnotis och återförsöket tar bort den`, async ({
    page,
  }) => {
    const { app } = await setup(page);
    try {
      if (failure === 'unsupported')
        await page.evaluate(() => {
          Object.assign(window, { savedPeer: window.RTCPeerConnection });
          Object.assign(window, { RTCPeerConnection: undefined });
        });
      else
        await page.evaluate(
          (failure) => window.skyttelVoiceFixture.setMicrophone(failure),
          failure,
        );
      await microphoneButton(page).click();
      await expect(notice(page)).toContainText(expected);
      await expect(page.locator('.notice-announcement[aria-live="assertive"]')).toHaveText(
        expected,
      );
      await expect(notice(page).locator('svg')).toHaveAttribute('aria-hidden', 'true');
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      const close = notice(page).getByRole('button', { name: 'Stäng notisen', exact: true });
      await close.focus();
      await page.keyboard.press('Enter');
      await expect(notice(page)).toHaveCount(0);
      await expect(microphoneButton(page)).toBeFocused();
      await expect(page.getByText(expected, { exact: true }).filter({ visible: true })).toHaveCount(
        0,
      );
      // The same failure on a second attempt is a new event, not the dismissed one.
      await microphoneButton(page).click();
      await expect(notice(page)).toContainText(expected);
      if (failure === 'unsupported')
        await page.evaluate(() =>
          Object.assign(window, {
            RTCPeerConnection: (window as unknown as { savedPeer: typeof RTCPeerConnection })
              .savedPeer,
          }),
        );
      await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('hold'));
      await microphoneButton(page).click();
      await expect(notice(page)).toHaveCount(0);
      await expect(voiceBox(page)).toHaveText('Rösten startar');
      await page.evaluate(() => window.skyttelVoiceFixture.releaseMicrophone());
      await expect(voiceBox(page)).toHaveText('Lyssnar');
    } finally {
      await app.close();
    }
  });

for (const [status, group, expected] of [
  [503, 'startup', 'Rösten kunde inte starta just nu. Försök igen om en stund.'],
  [401, 'administration', 'Rösten fungerar inte. Kontakta administratören.'],
] as const)
  test(`ROSTFEL-02: serverns ${group} visar ett kort besked med felreferens`, async ({ page }) => {
    let fail = true;
    const live = liveProvider();
    const provider: typeof fetch = (url, init) =>
      fail
        ? Promise.resolve(
            Response.json(
              { error: { message: 'PRIVATE_PROVIDER_CONFIGURATION', type: 'provider_error' } },
              { status },
            ),
          )
        : live.provider(url, init);
    const { app } = await setup(page, provider);
    const responses: { voiceErrorGroup?: string; diagnosticId?: string; error?: string }[] = [];
    page.on('response', async (response) => {
      if (response.url().endsWith('/voice'))
        responses.push(await response.json().catch(() => ({})));
    });
    try {
      await microphoneButton(page).click();
      await expect(notice(page)).toContainText(expected);
      await expect(notice(page)).toContainText('Felreferens:');
      expect(responses.at(-1)?.voiceErrorGroup).toBe(group);
      expect(responses.at(-1)?.diagnosticId).toMatch(/^[a-f0-9-]{36}$/);
      await expect(notice(page)).toContainText(responses.at(-1)?.diagnosticId ?? 'missing');
      await expect(notice(page)).not.toContainText(
        /OpenAI|serverns|konfiguration|text och formulär|inte ångrat|PRIVATE_PROVIDER/,
      );
      fail = false;
      await microphoneButton(page).click();
      await expect(notice(page)).toHaveCount(0);
      await expect(voiceBox(page)).toHaveText('Lyssnar');
    } finally {
      await app.close();
    }
  });

test('ROSTFEL-03: serverns avbrott stoppar mikrofonen och visar samma diagnostiska referens', async ({
  page,
}) => {
  const { app, live } = await setup(page);
  const failedPoll = page.waitForResponse(
    async (response) =>
      response.url().endsWith('/poll') &&
      (await response.json().catch(() => ({}))).voice?.phase === 'error',
  );
  try {
    await microphoneButton(page).click();
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    const id = [...live.channels.keys()].at(-1);
    if (!id) throw new Error('Missing active voice');
    live.emit(id, {
      type: 'error',
      error: { code: 'server_error', message: 'PRIVATE_PROVIDER_DETAIL' },
    });
    await expect(notice(page)).toContainText(
      'Rösten avbröts. Tryck på mikrofonknappen för att fortsätta.',
    );
    const result = await (await failedPoll).json();
    expect(result.voice.errorGroup).toBe('interrupted');
    expect(result.voice.diagnosticId).toMatch(/^[a-f0-9-]{36}$/);
    await expect(notice(page)).toContainText(`Felreferens: ${result.voice.diagnosticId}.`);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture
          .stats()
          .microphoneTracks.every((track) => track.state === 'ended'),
      ),
    ).toBe(true);
    await expect(notice(page)).not.toContainText(
      /PRIVATE_PROVIDER|OpenAI|text och formulär|inte ångrat/,
    );
  } finally {
    await app.close();
  }
});

test('ROSTFEL-04: Starta ljudet återställer ljudet innan mikrofonen lyssnar och försvinner med logiskt fokus', async ({
  page,
}) => {
  const { app } = await setup(page);
  try {
    await page.evaluate(() => window.skyttelVoiceFixture.setPlayback('blocked'));
    await microphoneButton(page).click();
    await expect(notice(page)).toContainText('Webbläsaren stoppade ljudet.');
    await expect(page.locator('.notice-announcement[aria-live="polite"]')).toHaveText(
      'Webbläsaren stoppade ljudet. Starta ljudet.',
    );
    await expect(
      notice(page).getByRole('button', { name: 'Stäng notisen', exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture.stats().microphoneTracks.every((track) => !track.enabled),
      ),
    ).toBe(true);
    await expect(page.getByRole('button', { name: 'Spela upp ljud', exact: true })).toHaveCount(0);
    await page.evaluate(() => window.skyttelVoiceFixture.setPlayback('allow'));
    const start = notice(page).getByRole('button', { name: 'Starta ljudet', exact: true });
    await start.focus();
    await page.keyboard.press('Enter');
    await expect(notice(page)).toHaveCount(0);
    await expect(microphoneButton(page)).toBeFocused();
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture.stats().microphoneTracks.some((track) => track.enabled),
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }
});
