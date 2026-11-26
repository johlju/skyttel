import type { APIRequestContext, Page } from '@playwright/test';
import type { SaveOperation } from '../../src/shared/map.js';
import {
  bike,
  bikeDraftReply,
  brandQuestion,
  chooseBike,
  colorQuestion,
  proposeBike,
} from '../support/bike-draft-model.js';
import {
  closeSupportDialog,
  createHousehold,
  openDraftReview,
  signIn,
  utilityButton,
} from '../support/client.js';
import {
  closeConversationText,
  microphoneButton,
  openConversationDraft,
  openConversationText,
  openSavedHistory,
  readCommittedHistoryCard,
  startConversationWithText,
  turnMicrophoneOff,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import {
  isVoiceAnswerRelease,
  liveProvider,
  speak,
  voiceAnswerParts,
} from '../support/live-provider.js';
import { expect, test } from '../support/test.js';
import {
  lastToolResult,
  type ModelRequest,
  modelMessage,
  modelTool,
  textModel,
} from '../support/text-model.js';

const region = (page: Page) =>
  page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const field = (page: Page) =>
  region(page).getByRole('textbox', { name: 'Meddelande till Skyttel' });
const log = (page: Page) => region(page).getByRole('log', { name: 'Samtalstext' });
const announcement = (page: Page) => region(page).locator('.conversation-announcement');
async function arrange(page: Page, reply?: (request: ModelRequest) => unknown[] | undefined) {
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(
    (request) => reply?.(request) ?? new Promise<unknown[]>((resolve) => held.push(resolve)),
  );
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
    live.sent.map(({ event }) => event).filter((event) => isVoiceAnswerRelease(event));
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

async function expectVoiceRelease(live: ReturnType<typeof liveProvider>, text: string) {
  await expect
    .poll(() => {
      const answers = new Map<string, string>();
      for (const { event } of live.sent) {
        if (event.type === 'session.thinking.append') {
          const { answerId, text: part } = JSON.parse(event.content);
          if (answerId && typeof part === 'string')
            answers.set(answerId, (answers.get(answerId) ?? '') + part);
        } else if (isVoiceAnswerRelease(event)) {
          if (event.type === 'session.commentary.append' && event.content.includes(text))
            return true;
          for (const [id, answer] of answers)
            if (answer.includes(text) && event.content.includes(id)) return true;
        }
      }
      return false;
    })
    .toBe(true);
}

async function readSingleCommittedReceipt(request: APIRequestContext, mapPath: string) {
  const { operations }: { operations: SaveOperation[] } = await (
    await request.get(`${mapPath}/operations`)
  ).json();
  const completed = operations.filter((operation) => operation.status === 'succeeded');
  expect(completed).toHaveLength(1);
  return completed[0].receipt;
}

test('RÖSTTEXT-01: samma cykel och väntande delar följer med mellan röst och text efter ljudavbrott', async ({
  page,
}) => {
  const { app, held, live, commentary } = await arrange(page, bikeDraftReply);
  try {
    await turnMicrophoneOn(page);
    await send(page, 'Berätta om ordningen.');
    await expect.poll(() => held.length).toBe(1);
    await expect(voiceBox(page)).toHaveText('Arbetar');
    await expect(log(page)).toContainText('Skyttel arbetar…');
    await expect(announcement(page)).toBeEmpty();
    await closeConversationText(page);
    held[0]([modelMessage('Vi tar ett förslag i taget.')]);
    await expect
      .poll(() => voiceAnswerParts(live.sent).join(''))
      .toContain('Vi tar ett förslag i taget.');
    await expect.poll(() => commentary().length).toBe(1);
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
    await expect(log(page)).toHaveText('Här visas det du och Skyttel säger och skriver.');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(announcement(page)).toBeEmpty();

    await closeConversationText(page);
    speak(live, proposeBike, 1000);
    await expectVoiceRelease(live, bike);
    await expect(region(page)).toHaveCount(0);
    const draft = await openConversationDraft(page);
    const proposal = draft.getByRole('button', { name: `Visa förslaget: ${bike}`, exact: true });
    await expect(proposal).toBeVisible();
    await turnMicrophoneOff(page);
    await send(page, chooseBike);
    await expect(log(page)).toContainText(colorQuestion);
    await expect(log(page)).toContainText(brandQuestion);

    await turnMicrophoneOn(page);
    await closeConversationText(page);
    speak(live, 'Vilken cykel väljer jag till utflykten?', 2000);
    const answer = 'Till utflykten väljer du Alex blå cykel.';
    await expectVoiceRelease(live, answer);
    await output(page, answer);
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    await openConversationText(page);
    await expect(log(page)).toContainText(answer);
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));

    speak(live, 'Den har ett grönt lås.', 3000);
    await expect(log(page)).toContainText('Låsfärg för Alex blå cykel sattes till Grönt.');
    await page.evaluate(() => window.skyttelVoiceFixture.fail());
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('region', { name: 'Samtalsnotis' })).toContainText(
      'Rösten avbröts',
    );
    await send(page, 'Vad ändrades i förslaget och vilken fråga återstår?');
    const summary = 'Alex blå cykel har nu låsfärgen grönt. Kvar: Vilket märke har cykeln?';
    await expect(log(page).getByRole('listitem').filter({ hasText: summary })).toBeVisible();
    await expect(announcement(page)).toHaveText(`Skyttel: ${summary}`);
    await openConversationDraft(page);
    await expect(draft.getByRole('rowheader')).toHaveCount(1);
    await proposal.click();
    const dialog = page.getByRole('dialog', { name: bike, exact: true });
    await expect(dialog.getByText('Grönt (Text)', { exact: true })).toBeVisible();
    await closeSupportDialog(page, bike);
    const save = draft.getByRole('button', { name: 'Spara hela utkastet', exact: true });
    await expect(save).toBeDisabled();
    await send(page, 'Strunta i märket.');
    await expect(save).toBeEnabled();
    await expect(await openSavedHistory(page)).toContainText('Inga genomförda sparanden.');
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await openConversationDraft(page);
    await expect(proposal).toBeVisible();
    await save.click();
    await expect(page.getByRole('status', { name: 'Sparbekräftelse' })).toContainText(
      'Utkastet är sparat',
    );
    await expect(await openSavedHistory(page)).toContainText(bike);
  } finally {
    for (const release of held) release([]);
    await app.close();
  }
});

test('RÖSTTEXT-04: bara en aktuell sparbegäran ger kvitto och visar cykeln i kartan', async ({
  page,
}) => {
  const vehicleQuestion = 'Vilket fordon finns i mitt utkast?';
  const { app, held, live, commentary, mapPath } = await arrange(page, (request) => {
    const { message } = JSON.parse(
      String(request.input.findLast((item) => item.role === 'user')?.content),
    );
    if (message === vehicleQuestion) {
      const review = lastToolResult(request);
      if (!review?.changes) return [modelTool('read_my_draft', {})];
      return [modelMessage(`I utkastet finns ${review.changes[0]?.after?.name}.`)];
    }
    return bikeDraftReply(request);
  });
  const nextReply = async () => {
    await expect.poll(() => held.length).toBeGreaterThan(0);
    const pending = held.shift();
    if (!pending) throw new Error('Missing held model response');
    return pending;
  };
  try {
    await turnMicrophoneOn(page);
    await send(page, 'Berätta om utkastet.');
    (await nextReply())([modelMessage('Sparat.')]);
    await expect
      .poll(() => voiceAnswerParts(live.sent).join(''))
      .toContain('Samtal (obekräftat): "Sparat."');
    await expect.poll(() => commentary().length).toBe(1);
    await expect(log(page)).toContainText('Sparat.');
    await output(page, 'Sparat.');
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await expect(voiceBox(page).locator('.voice-saved')).toHaveCount(0);
    expect((await (await page.request.get(`${mapPath}/operations`)).json()).operations).toEqual([]);
    expect((await (await page.request.get(mapPath)).json()).objects).toEqual([]);
    await expect(
      (await openDraftReview(page)).getByText('Utkastet är tomt.', { exact: true }),
    ).toBeVisible();
    await (await utilityButton(page, 'Rapporter')).click();
    await expect(
      page
        .getByRole('region', { name: 'Ändringshistorik', exact: true })
        .getByText('Inga genomförda sparanden.', { exact: true }),
    ).toBeVisible();
    const back = page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true });
    await back.focus();
    await expect(back).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(voiceBox(page)).toHaveText('Lyssnar');

    speak(live, proposeBike, 1000);
    await expectVoiceRelease(live, bike);
    const draft = await openConversationDraft(page);
    const proposal = draft.getByRole('button', { name: `Visa förslaget: ${bike}`, exact: true });
    const reviewBike = async () => {
      await proposal.click();
      await expect(page.getByRole('dialog', { name: bike, exact: true })).toContainText('Fordon');
      await closeSupportDialog(page, bike);
    };
    const mapBike = page.getByRole('button', { name: `Välj objekt: ${bike}`, exact: true });
    await reviewBike();
    await turnMicrophoneOff(page);
    await send(page, vehicleQuestion);
    await expect(log(page)).toContainText(`I utkastet finns ${bike}.`);
    await expect(proposal).toBeVisible();

    await send(page, 'Spara hela utkastet.');
    const canceledReply = await nextReply();
    await field(page).press('Escape');
    await expect(region(page)).toContainText(
      'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.',
    );
    canceledReply([modelMessage('Sparat.')]);
    await send(page, 'Jag menade den blå cykeln.');
    (await nextReply())([modelMessage('Jag förstår vilken cykel du menar.')]);
    await expect(log(page)).toContainText('Jag förstår vilken cykel du menar.');
    const confirmation = page.getByRole('status', { name: 'Sparbekräftelse' });
    const toast = page.locator('.draft-save-toast');
    await expect(confirmation.filter({ hasText: 'Utkastet är sparat' })).toHaveCount(0);
    await expect(toast).not.toBeVisible();
    await expect(proposal).toBeVisible();
    await expect(mapBike).toHaveClass(/\badded\b/);
    await expect(await openSavedHistory(page)).toContainText('Inga genomförda sparanden.');
    await back.click();

    await openConversationDraft(page);
    await reviewBike();
    await send(page, 'Spara hela utkastet.');
    (await nextReply())([modelMessage('Jag har granskat förslaget.')]);
    await expect(toast).toBeVisible();
    await expect(toast).toHaveText('Utkastet är sparat');
    await expect(confirmation).toContainText('Utkastet är sparat');
    await expect(draft).toContainText('Utkastet är tomt.');
    await expect(mapBike).toBeVisible();
    await expect(mapBike).toHaveClass(/\bexisting\b/);
    const committedReceipt = await readSingleCommittedReceipt(page.request, mapPath);
    expect(committedReceipt.actorName).toBe('Alex Exempel');
    const history = await openSavedHistory(page);
    await expect(history.getByRole('article')).toHaveCount(1);
    const receipt = await readCommittedHistoryCard(history, committedReceipt);
    await expect(receipt.locator('time')).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    await expect(receipt.getByText('1 objekt', { exact: true })).toBeVisible();
    await receipt.getByText('Visa ändringarna', { exact: true }).click();
    await expect(receipt.getByText('Fanns inte i kartan', { exact: true })).toBeVisible();
    await expect(receipt.getByText(`Namn: ${bike}.`, { exact: true })).toBeVisible();
    await expect(receipt.getByText('Objekttyp: Fordon.', { exact: true })).toBeVisible();
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
    await expect(log(page)).toHaveText('Här visas det du och Skyttel säger och skriver.');
    await expect(announcement(page)).toBeEmpty();
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
  const { app, held, live, commentary } = await arrange(page);
  try {
    await turnMicrophoneOn(page);
    await send(page, 'Första frågan.');
    await send(page, 'Andra frågan.');
    await expect(log(page)).toContainText('Skyttel arbetar…');
    const first = 'Första svaret med åäö. '.repeat(30).trim();
    held[0]([modelMessage(first)]);
    await expect.poll(() => held.length).toBe(2);
    await expectVoiceRelease(live, first);
    held[1]([modelMessage('Andra svaret.')]);
    await expect.poll(() => voiceAnswerParts(live.sent).join('')).toContain('Andra svaret.');
    expect(commentary()).toHaveLength(1);
    // The voice box updates before the server's next poll can observe playback.
    const speakingReported = page.waitForResponse(
      (response) =>
        response.url().endsWith('/poll') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON()?.speakerActive === true &&
        response.ok(),
    );
    await output(page, first);
    await expect(voiceBox(page)).toHaveText('Skyttel talar');
    await speakingReported;
    expect(commentary()).toHaveLength(1);
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
    // Long replies arrive as silent parts followed by one command to speak.
    const content = voiceAnswerParts(live.sent).join('');
    await expect.poll(() => commentary().length).toBe(2);
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
    await field(page).focus();
    held[2]([modelMessage('Bara Skyttels nya text läses.')]);
    await expect(announcement(page)).toHaveText('Skyttel: Bara Skyttels nya text läses.');
    await expect(field(page)).toBeFocused();
    await closeConversationText(page);
    await openConversationText(page);
    await expect(announcement(page)).toBeEmpty();
    await expect(log(page)).toContainText('Ett talat tillägg.');
  } finally {
    for (const release of held) release([]);
    await app.close();
  }
});

async function observeInterruptedPlayback(page: Page) {
  await output(page, 'Det gamla svaret.');
  const levels = await page.evaluateHandle(() => window.skyttelVoiceFixture.observeSpeaker());
  await expect.poll(() => levels.evaluate((read) => read().speaker[440])).toBeGreaterThan(20);
  return {
    async expectOldAudioMuted() {
      await page.evaluate(() => {
        const fixture = window.skyttelVoiceFixture;
        fixture.setSound('remote', false);
        fixture.emit({
          type: 'session.input_transcript.delta',
          event_id: crypto.randomUUID(),
          delta: 'Tidigare ord.',
          start_ms: 0,
          end_ms: 5,
        });
        fixture.remoteTone(800, 0.4, 0.15);
      });
      await expect.poll(() => levels.evaluate((read) => read().incoming[800])).toBeGreaterThan(100);
      expect(await levels.evaluate((read) => read().speaker[800] ?? 0)).toBe(0);
    },
    async expectNewAudioFromStart() {
      await page.evaluate(() => window.skyttelVoiceFixture.remoteTone(1200, 0, 0.2));
      await expect
        .poll(() => levels.evaluate((read) => read().speaker[1200] ?? 0))
        .toBeGreaterThan(210);
      const { incoming, speaker } = await levels.evaluate((read) => read());
      expect(Math.abs(incoming[1200] - speaker[1200])).toBeLessThanOrEqual(2);
    },
  };
}

async function holdWrittenSubmissionResponse(page: Page) {
  let releaseSubmission!: () => void;
  const submissionHeld = new Promise<void>((resolve) => {
    releaseSubmission = resolve;
  });
  await page.route('**/messages', async (route) => {
    const response = await route.fetch();
    await submissionHeld;
    await route.fulfill({ response });
  });
  return releaseSubmission;
}

async function expectSameVoiceConnection(page: Page, live: ReturnType<typeof liveProvider>) {
  expect(live.requests).toHaveLength(1);
  expect(await page.evaluate(() => window.skyttelVoiceFixture.stats())).toMatchObject({
    peers: 1,
    openPeers: 1,
    microphoneRequests: 1,
  });
}

test('RÖSTTEXT-07: ett skrivet förtydligande hörs efter Avbryt i samma röstanslutning', async ({
  page,
}) => {
  const { app, held, live } = await arrange(page);
  const releaseSubmission = await holdWrittenSubmissionResponse(page);
  try {
    await turnMicrophoneOn(page);
    const audio = await observeInterruptedPlayback(page);
    const box = voiceBox(page);
    await expect(box).toHaveText('Skyttel talar');
    await box.getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(box).toHaveText('Lyssnar');
    await audio.expectOldAudioMuted();
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await field(page).fill('Jag menar cykeln.');
    await region(page).getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => held.length).toBe(1);
    const reply = 'Jag förstår att du menar cykeln.';
    held[0]([modelMessage(reply)]);
    await expectVoiceRelease(live, reply);
    await audio.expectNewAudioFromStart();
    releaseSubmission();
    await expect(field(page)).toHaveValue('');
    await expect(log(page)).toContainText('Jag menar cykeln.');
    await expect(log(page)).toContainText(reply);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expectSameVoiceConnection(page, live);
  } finally {
    releaseSubmission();
    for (const release of held) release([]);
    await app.close();
  }
});
