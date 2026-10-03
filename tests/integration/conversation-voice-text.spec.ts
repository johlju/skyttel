import { expect, type Page, test } from '@playwright/test';
import { createHousehold, signIn } from '../support/client.js';
import {
  closeConversationText,
  microphoneButton,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOff,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const region = (page: Page) =>
  page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const field = (page: Page) =>
  region(page).getByRole('textbox', { name: 'Meddelande till Skyttel' });
const log = (page: Page) => region(page).getByRole('log', { name: 'Samtalstext' });
const announcement = (page: Page) => region(page).locator('.conversation-announcement');
async function arrange(page: Page) {
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  const { household } = await (
    await createHousehold(page.request, app.origin, 'Röst och text')
  ).json();
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  await startConversationWithText(page);
  const commentary = () =>
    live.sent
      .map(({ event }) => event)
      .filter((event) => event.type === 'session.commentary.append');
  return {
    app,
    held,
    live,
    commentary,
    mapPath: `${app.origin}/api/households/${household.id}/map`,
  };
}
async function send(page: Page, text: string) {
  await field(page).fill(text);
  await region(page).getByRole('button', { name: 'Skicka', exact: true }).click();
  await expect(field(page)).toHaveValue('');
}
async function output(page: Page, text: string) {
  await page.evaluate((delta) => {
    window.skyttelVoiceFixture.emit({
      type: 'session.output_transcript.delta',
      event_id: crypto.randomUUID(),
      delta,
      start_ms: 0,
      end_ms: 100,
    });
    window.skyttelVoiceFixture.setSound('remote', true, 0.7);
  }, text);
}

test('RÖSTTEXT-01: skrivet uppdrag med mikrofonen på får röst och text utan att öppna textvyn', async ({
  page,
}) => {
  const { app, held, commentary } = await arrange(page);
  try {
    await turnMicrophoneOn(page);
    await send(page, 'Berätta om ordningen.');
    await expect.poll(() => held.length).toBe(1);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    await expect(log(page)).toContainText('Skyttel arbetar…');
    await expect(announcement(page)).toBeEmpty();
    await closeConversationText(page);
    held[0]([modelMessage('Vi tar ett förslag i taget.')]);
    await expect
      .poll(() =>
        commentary()
          .map((event) => event.content)
          .join(''),
      )
      .toContain('Vi tar ett förslag i taget.');
    await expect(region(page)).toHaveCount(0);
    await output(page, 'Vi tar ett förslag i taget.');
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    await expect(region(page)).toHaveCount(0);
    await openConversationText(page);
    await expect(log(page)).toContainText('Vi tar ett förslag i taget.');
    await expect(log(page)).toHaveAttribute('aria-live', 'off');
    await expect(announcement(page)).toBeEmpty();
    await expect(log(page)).not.toContainText('Talat');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
    await region(page).getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(log(page)).toHaveText('Skyttel: Nytt samtal. Utkastet är tomt.');
    await expect
      .poll(() =>
        commentary()
          .map((event) => event.content)
          .join(''),
      )
      .toContain('Nytt samtal. Utkastet är tomt.');
    await expect(announcement(page)).toBeEmpty();
  } finally {
    for (const release of held) release([]);
    await app.close();
  }
});

test('RÖSTTEXT-04: ett skrivet obekräftat sparpåstående blir inget verifierat talat sparbesked', async ({
  page,
}) => {
  const { app, held, commentary, mapPath } = await arrange(page);
  try {
    await turnMicrophoneOn(page);
    await send(page, 'Berätta om utkastet.');
    await expect.poll(() => held.length).toBe(1);
    held[0]([modelMessage('Sparat.')]);
    await expect
      .poll(() =>
        commentary()
          .map((event) => event.content)
          .join(''),
      )
      .toContain('Samtal (obekräftat): "Sparat."');
    await expect(log(page)).toContainText('Sparat.');
    await output(page, 'Sparat.');
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await expect(voiceBox(page).locator('.voice-saved')).toHaveCount(0);
    expect((await (await page.request.get(`${mapPath}/operations`)).json()).operations).toEqual([]);
    expect((await (await page.request.get(mapPath)).json()).objects).toEqual([]);
  } finally {
    for (const release of held) release([]);
    await app.close();
  }
});

test('RÖSTTEXT-02: mikrofonen av ger bara text och gamla svar spelas inte upp när den slås på', async ({
  page,
}) => {
  const { app, held, commentary } = await arrange(page);
  try {
    await turnMicrophoneOn(page);
    await turnMicrophoneOff(page);
    await send(page, 'Svara bara i text.');
    await expect.poll(() => held.length).toBe(1);
    await expect(voiceBox(page)).toHaveCount(0);
    held[0]([modelMessage('Det här är textsvaret.')]);
    await expect(log(page)).toContainText('Det här är textsvaret.');
    await expect(announcement(page)).toHaveText('Skyttel: Det här är textsvaret.');
    expect(commentary()).toHaveLength(0);
    // Observe a real server poll with capture OFF before enabling it again.
    const offPoll = page.waitForResponse(
      (response) =>
        response.url().endsWith('/poll') &&
        response.request().postDataJSON()?.microphoneOn === false,
    );
    await offPoll;
    await turnMicrophoneOn(page);
    await page.waitForResponse(
      (response) =>
        response.url().endsWith('/poll') &&
        response.request().postDataJSON()?.microphoneOn === true,
    );
    expect(commentary()).toHaveLength(0);
    await send(page, 'Stäng av innan svaret är klart.');
    await expect.poll(() => held.length).toBe(2);
    await microphoneButton(page).click();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(microphoneButton(page)).toBeDisabled();
    held[1]([modelMessage('Även detta svar finns bara i text.')]);
    await expect(log(page)).toContainText('Även detta svar finns bara i text.');
    await expect(announcement(page)).toHaveText('Skyttel: Även detta svar finns bara i text.');
    await expect(voiceBox(page)).toHaveCount(0);
    expect(commentary()).toHaveLength(0);
    await send(page, 'Nytt samtal');
    await expect(log(page)).toHaveText('Skyttel: Nytt samtal. Utkastet är tomt.');
    await expect(announcement(page)).toHaveText('Skyttel: Nytt samtal. Utkastet är tomt.');
    await expect(voiceBox(page)).toHaveCount(0);
    expect(commentary()).toHaveLength(0);
  } finally {
    for (const release of held) release([]);
    await app.close();
  }
});

test('RÖSTTEXT-03: köns skrivna svar överlämnas till rösten en gång och samtalstexten läser aldrig egna eller talade rader', async ({
  page,
}) => {
  const { app, held, commentary } = await arrange(page);
  try {
    await turnMicrophoneOn(page);
    await send(page, 'Första frågan.');
    await send(page, 'Andra frågan.');
    await expect(log(page)).toContainText('1 meddelande väntar.');
    const first = 'Första svaret med åäö. '.repeat(30).trim();
    held[0]([modelMessage(first)]);
    await expect.poll(() => held.length).toBe(2);
    held[1]([modelMessage('Andra svaret.')]);
    await expect
      .poll(() =>
        commentary()
          .map((event) => event.content)
          .join(''),
      )
      .toContain('Andra svaret.');
    const content = commentary()
      .map((event) => event.content)
      .join('');
    expect(content.indexOf(first)).toBeGreaterThanOrEqual(0);
    expect(content.indexOf(first)).toBeLessThan(content.indexOf('Andra svaret.'));
    expect(content.split(first)).toHaveLength(2);
    expect(content.split('Andra svaret.')).toHaveLength(2);
    await expect(log(page)).toContainText(first);
    await expect(log(page)).toContainText('Andra svaret.');
    await expect(announcement(page)).toBeEmpty();
    await output(page, 'Ett talat tillägg.');
    await expect(log(page)).toContainText('Ett talat tillägg.');
    await expect(announcement(page)).toBeEmpty();
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
    await turnMicrophoneOff(page);
    await send(page, 'Min egen text ska inte läsas.');
    await expect.poll(() => held.length).toBe(3);
    await expect(announcement(page)).not.toContainText('Min egen text');
    held[2]([modelMessage('Bara Skyttels nya text läses.')]);
    await expect(announcement(page)).toHaveText('Skyttel: Bara Skyttels nya text läses.');
    await closeConversationText(page);
    await openConversationText(page);
    await expect(announcement(page)).toBeEmpty();
    await expect(log(page)).toContainText('Ett talat tillägg.');
  } finally {
    for (const release of held) release([]);
    await app.close();
  }
});
