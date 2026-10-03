import { expect, type Page, test } from '@playwright/test';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import {
  createHousehold,
  openMap,
  openProfile,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import {
  chooseConversationVoice,
  closeConversationText,
  consentBox,
  consentBoxFor,
  microphoneButton,
  openConversationDraft,
  openConversationReceipts,
  openConversationText,
  startConversationWithText,
  turnMicrophoneOff,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../support/text-model.js';

const openVoiceConnections = (page: Page) =>
  page.evaluate(() => window.skyttelVoiceFixture.stats().openPeers);
const assistant = (page: Page) => page.getByRole('region', { name: 'Arbetsyta', exact: true });
async function signOut(page: Page) {
  await openProfile(page);
  await page.getByRole('link', { name: 'Inloggningssätt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inloggningssätt', exact: true })).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) <= 800)
    await page.getByText('Välj inställning', { exact: true }).click();
  await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Välkommen till Skyttel' })).toBeVisible();
}
async function consent(page: Page) {
  await startConversationWithText(page);
  await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toBeVisible();
}
// The conversation text stays open beside the voice, for what the cases read there.
async function startVoice(page: Page) {
  await openConversationText(page);
  await turnMicrophoneOn(page);
  await expect(voiceBox(page)).toHaveText('Lyssnar');
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.skyttelVoiceFixture.stats().microphoneTracks.some((track) => track.enabled),
      ),
    )
    .toBe(true);
}
function speak(live: ReturnType<typeof liveProvider>, text: string, id = crypto.randomUUID()) {
  const session = [...live.channels.keys()].at(-1);
  if (!session) throw new Error('Missing live session');
  live.emit(session, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: text,
    start_ms: 0,
    end_ms: 100,
  });
  live.emit(session, {
    type: 'session.delegation.created',
    event_id: crypto.randomUUID(),
    offset_ms: 100,
    delegation: { id, type: 'delegation', target: 'client' },
  });
}

test('TAL-06: avbryt uppdrag från kartan och behåll samtalet och tidigare förslag', async ({
  page,
}) => {
  let release!: (output: unknown[]) => void;
  let held = false;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        held = true;
        release = resolve;
      }),
  );
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const { path, value } = await simpleMap(page, app);
    const before = await (await page.request.get(path)).json();
    await assistant(page).getByLabel('Meddelande till Skyttel').fill('Osänd rättelse');
    speak(live, 'Rätta Lo.');
    await expect.poll(() => held).toBe(true);
    await closeConversationText(page);
    await openMap(page);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    await voiceBox(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    release([
      modelTool('propose_object', {
        version: before.draft.version,
        contentVersion: before.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'För sent' },
      }),
    ]);
    await openConversationText(page);
    await expect(assistant(page)).toContainText(
      'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.',
    );
    await expect
      .poll(async () => (await (await page.request.get(path)).json()).draft)
      .toEqual(before.draft);
    await turnMicrophoneOff(page);
    await openConversationText(page);
    await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toHaveValue(
      'Osänd rättelse',
    );
    // Nytt samtal empties the conversation text. The unsent text and the draft stay.
    await assistant(page).getByRole('button', { name: 'Nytt samtal', exact: true }).click();
    await expect(assistant(page).getByRole('log', { name: 'Samtalstext' })).toHaveText(
      'Skyttel: Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
    );
    await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toHaveValue(
      'Osänd rättelse',
    );
    expect((await (await page.request.get(path)).json()).draft).toEqual(before.draft);
  } finally {
    await app.close();
  }
});

test('TAL-07: uppmätt ljudaktivitet skiljs från avstängd mikrofon och består i Inställningar', async ({
  page,
}) => {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Samtalet finns kvar.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await simpleMap(page, app);
    const box = voiceBox(page);
    const waveform = box.locator('[aria-hidden="true"]').first();
    await expect(waveform.locator('i')).toHaveCount(7);
    await expect(waveform.locator('i').first()).toHaveCSS('animation-name', 'none');
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('microphone', true));
    await expect(box).toHaveText('Du talar');
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('microphone', false));
    await expect(box).toHaveText('Lyssnar');
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true));
    await expect(box).toHaveText('Skyttel talar');
    await expect(waveform.locator('i').first()).not.toHaveCSS('animation-name', 'none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(waveform).toBeVisible();
    await expect(waveform.locator('i').first()).toHaveCSS('animation-name', 'none');
    // The button shows the microphone symbol in both states.
    const microphone = microphoneButton(page);
    const symbol = () => microphone.locator('svg').evaluate((icon) => icon.innerHTML);
    const on = await symbol();
    await microphone.click();
    await expect(microphone).toHaveAttribute('aria-pressed', 'false');
    expect(await symbol()).toBe(on);
    // Skyttel is heard to the end with the microphone off.
    await expect(box).toHaveText('Skyttel talar');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats())).toMatchObject({
      peers: 1,
      openPeers: 1,
      audioElements: 1,
      microphoneTracks: [{ enabled: false, state: 'live' }],
      remoteTracks: [{ enabled: true, state: 'live' }],
    });
    await assistant(page).getByLabel('Meddelande till Skyttel').fill('Kvar i samtalet');
    await openSettings(page);
    await expect(
      page.getByRole('heading', { name: 'Inställningar', level: 1, exact: true }),
    ).toBeFocused();
    await expect(box).toHaveText('Skyttel talar');
    await page.getByRole('link', { name: 'Tillbaka till kartan', exact: true }).click();
    await openConversationText(page);
    await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toHaveValue(
      'Kvar i samtalet',
    );
    await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toBeFocused();
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
    await expect(box).toHaveCount(0);
    await page.waitForTimeout(3500);
    expect(await openVoiceConnections(page)).toBe(1);
    expect(live.requests).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('TAL-08: nödvändiga frågor finns i samtalet och fel visas i en samtalsnotis', async ({
  page,
}) => {
  let stage = 0;
  let value: Record<string, unknown> = {};
  let release!: (output: unknown[]) => void;
  const model = textModel(() => {
    if (stage++ === 0)
      return [
        modelTool('submit_changes', {
          version: 1,
          contentVersion: 1,
          completion: 'draft',
          questions: ['Vem använder tjänsten?'],
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'lo',
                baseRevision: null,
                value: { ...value, description: 'Förslag väntar på svar' },
              },
            },
          ],
        }),
      ];
    if (stage === 2)
      return new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
    throw new Error('Synthetic provider failure');
  });
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const map = await simpleMap(page, app);
    value = map.value;
    const panel = assistant(page);
    await turnMicrophoneOff(page);
    await panel.getByLabel('Meddelande till Skyttel').fill('Lägg till uppgiften.');
    await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
    await closeConversationText(page);
    await expect
      .poll(
        async () =>
          (await (await page.request.get(map.path)).json()).draft.changes[0].after.description,
      )
      .toBe('Förslag väntar på svar');
    await expect(panel.getByRole('log')).toHaveCount(0);
    await expect(voiceBox(page)).toHaveCount(0);
    await openConversationText(page);
    await expect(panel.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Vem använder tjänsten?',
    );
    await expect(panel.getByRole('region', { name: 'Nödvändigt svar' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Svara i samtalet' })).toHaveCount(0);
    await panel.getByLabel('Meddelande till Skyttel').fill('Lo använder tjänsten.');
    await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => stage).toBe(2);
    await expect(panel.getByRole('log').getByRole('listitem').last()).toContainText(
      'Skyttel arbetar…',
    );
    release([modelMessage('Vill du läsa vidare?')]);
    await expect(panel.getByRole('log')).toContainText('Vill du läsa vidare?');
    await panel.getByLabel('Meddelande till Skyttel').fill('Berätta mer.');
    await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
    await closeConversationText(page);
    await expect(page.getByRole('region', { name: 'Samtalsnotis' })).toContainText(
      'Skyttel kunde inte slutföra uppdraget',
    );
    await openConversationText(page);
    await panel.getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(panel.getByRole('log', { name: 'Samtalstext' })).toHaveText(
      /^Skyttel: Nytt samtal\./,
    );
    expect(
      (await (await page.request.get(map.path)).json()).draft.changes[0].after.description,
    ).toBe('Förslag väntar på svar');
  } finally {
    await app.close();
  }
});

test('TAL-09: starten kräver medgivande och återhämtar mikrofonavbrott', async ({ page }) => {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: textModel(() => [modelMessage('Texten fungerar.')]).provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await signIn(page.request, app.origin);
    await createHousehold(page.request, app.origin);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await chooseConversationVoice(page);
    await expect(consentBox(page)).toBeVisible();
    await consentBoxFor(page).decline.click();
    const panel = assistant(page);
    await expect(panel.getByLabel('Meddelande till Skyttel')).toHaveCount(0);
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual(
      [],
    );
    expect(live.requests).toHaveLength(0);
    await startConversationWithText(page);
    await panel.getByLabel('Meddelande till Skyttel').fill('Text utan mikrofon');
    await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(panel.getByRole('log')).toContainText('Texten fungerar.');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual(
      [],
    );
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('hold'));
    await chooseConversationVoice(page);
    await expect(voiceBox(page)).toHaveText('Rösten startar');
    await expect(microphoneButton(page)).toHaveAccessibleDescription('Avbryt starten av rösten');
    await chooseConversationVoice(page);
    await expect(voiceBox(page)).toHaveCount(0);
    await page.evaluate(() => window.skyttelVoiceFixture.releaseMicrophone());
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks))
      .toEqual([{ enabled: false, state: 'ended' }]);
    expect(live.requests).toHaveLength(0);
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('deny'));
    await chooseConversationVoice(page);
    await expect(panel.getByRole('alert')).toContainText('mikrofon');
    await expect(voiceBox(page)).toHaveCount(0);
    await expect(panel.getByLabel('Meddelande till Skyttel')).toBeEditable();
    await expect(panel.getByRole('log')).toContainText('Texten fungerar.');
    await page.evaluate(() => {
      window.skyttelVoiceFixture.setMicrophone('allow');
      window.skyttelVoiceFixture.setAutoStart(false);
    });
    await chooseConversationVoice(page);
    await expect(voiceBox(page)).toHaveText('Rösten startar');
    await expect.poll(() => live.requests.length).toBe(1);
    // The provider request precedes the browser's answer, and the fixture drops
    // events until its channel opens; the remote track marks that point.
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().remoteTracks))
      .toEqual([{ enabled: true, state: 'live' }]);
    await expect(voiceBox(page)).toHaveText('Rösten startar');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks.at(-1)),
    ).toEqual({ enabled: false, state: 'live' });
    await page.evaluate(() => window.skyttelVoiceFixture.started());
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await app.close();
  }
});

test('TAL-05: dialog, avstängd mikrofon och arbetsraden finns kvar under samtalet', async ({
  page,
}) => {
  let release!: (output: unknown[]) => void;
  let held = false;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        held = true;
        release = resolve;
      }),
  );
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    await simpleMap(page, app);
    const events = [
      { type: 'session.input_transcript.delta', delta: 'Kim betalar', start_ms: 0, end_ms: 1000 },
      {
        type: 'session.output_transcript.delta',
        delta: 'Jag lyssnar.',
        start_ms: 1100,
        end_ms: 1300,
      },
      {
        type: 'session.input_transcript.delta',
        delta: ' för musiken.',
        start_ms: 1500,
        end_ms: 1900,
      },
      {
        type: 'session.output_transcript.delta',
        delta: ' Berätta mer.',
        start_ms: 2000,
        end_ms: 2600,
      },
      {
        type: 'session.input_transcript.delta',
        delta: 'Rätta till Lo.',
        start_ms: 5000,
        end_ms: 6000,
      },
    ];
    for (const event of events) {
      expect(live.requests[0].session.client?.data_channel?.allowed_server_events).toContainEqual({
        type: event.type,
      });
      await page.evaluate(
        (event) => window.skyttelVoiceFixture.emit({ ...event, event_id: crypto.randomUUID() }),
        event,
      );
    }
    const log = assistant(page).getByRole('log', { name: 'Samtalstext' });
    await expect(log.getByRole('listitem')).toHaveCount(3);
    await expect(log.getByRole('listitem').nth(0)).toHaveText('Du: Kim betalar för musiken.');
    await expect(log.getByRole('listitem').nth(1)).toHaveText('Skyttel: Jag lyssnar. Berätta mer.');
    // The microphone is turned off and on again while the voice connection stays.
    await chooseConversationVoice(page);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => {
      window.skyttelVoiceFixture.disconnect();
      window.skyttelVoiceFixture.reconnect();
    });
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'live' },
    ]);
    await chooseConversationVoice(page);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: true, state: 'live' },
    ]);
    expect(live.requests).toHaveLength(1);
    speak(live, 'Kontrollera utkastet.');
    await expect.poll(() => held).toBe(true);
    await expect(voiceBox(page)).toHaveText('Skyttel arbetar');
    // A spoken task shows the working row last in the conversation text, without a timer.
    await expect(log.getByRole('listitem').last()).toHaveText(
      'Skyttel arbetar… 0 meddelanden väntar. Tryck på Escape för att avbryta.',
    );
    await expect(assistant(page).getByRole('timer')).toHaveCount(0);
    release([modelMessage('Vem använder musiken?')]);
    await expect(log).toContainText('Vem använder musiken?');
    await expect(log.getByText('Skyttel arbetar…')).toHaveCount(0);
    await turnMicrophoneOff(page);
    await expect(log).toContainText('Kim betalar för musiken.');
    await assistant(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(log).toHaveText(/^Skyttel: Nytt samtal\./);
    await expect(await openConversationDraft(page)).toContainText('Lo Exempel');
  } finally {
    await app.close();
  }
});

test('TAL-04: samtalstext hålls isär från verifierade röstresultat', async ({ page }) => {
  const replies = [
    'Klart. Ändringarna är nu lagrade i hushållets karta.',
    'Saved successfully.',
    'Lo är nu vald och visas i kartan.',
    'Har du sparat tidigare, och vem betalar?',
  ];
  let step = 0;
  const model = textModel(() => {
    if (step < replies.length) return [modelMessage(replies[step++])];
    if (step++ === replies.length) return [modelTool('show_map_object', { objectId: 'lo' })];
    if (step === replies.length + 2) return [modelMessage('Vem betalar?')];
    return [
      modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'provider-choice' }),
    ];
  });
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const { path } = await simpleMap(page, app);
    const before = await (await page.request.get(path)).json();
    const object = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    const selected = await object.getAttribute('aria-pressed');
    for (const [index, reply] of replies.entries()) {
      speak(live, 'Beskriv mitt utkast.');
      const conversation = assistant(page).getByRole('log', { name: 'Samtalstext', exact: true });
      await expect(conversation).toContainText(reply);
      await expect(assistant(page).getByRole('status')).toContainText('Nya förslag är osparade');
      await expect(object).toHaveAttribute('aria-pressed', selected ?? 'false');
      await expect
        .poll(
          () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
        )
        .toBe(index + 1);
      const commentary = live.sent.at(-1)?.event as { content: string };
      const [result, modelText] = commentary.content.split('\n');
      expect(result).toBe('Utkast: 1 osparat förslag.');
      expect(modelText).toBe(`Samtal (obekräftat): ${JSON.stringify(reply)}`);
      const current = await (await page.request.get(path)).json();
      expect(current.objects).toEqual(before.objects);
      expect(current.draft).toEqual(before.draft);
      expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    }
    speak(live, 'Markera Lo Exempel.');
    await expect(assistant(page).getByRole('status', { includeHidden: true })).toHaveText(
      'Markerat i kartan.',
    );
    await openConversationText(page);
    await expect(assistant(page).getByRole('status')).toHaveText('Markerat i kartan.');
    await expect(object).toHaveAttribute('aria-pressed', 'true');
    await expect(
      assistant(page).getByRole('log', { name: 'Samtalstext', exact: true }),
    ).toContainText('Vem betalar?');
    await expect
      .poll(
        () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
      )
      .toBe(5);
    expect(JSON.stringify(live.sent.at(-1))).toContain(
      'Skyttels resultat (verifierat): Objektet är markerat',
    );
    speak(live, 'Spara hela utkastet nu.');
    await expect(assistant(page).getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Sparat.',
    );
    await expect
      .poll(
        () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
      )
      .toBe(6);
    expect(JSON.stringify(live.sent.at(-1))).toContain('Sparat.');
    const receipts = await openConversationReceipts(page);
    await receipts.getByText('Visa kvittot', { exact: true }).first().click();
    await expect(receipts).toContainText('Sparat: Lo Exempel. Kvitto:');
    expect((await (await page.request.get(path)).json()).objects).toMatchObject([{ id: 'lo' }]);
  } finally {
    await app.close();
  }
});

test('TAL-01: familjeärendet sparas med röst och bevarad oskickad formulärtext', async ({
  page,
}) => {
  let step = 0;
  let version = 0;
  const model = textModel((body) => {
    const current = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content))
      .draft as TextAssistantReview;
    if (step++ === 0)
      return [
        modelTool('resolve_conflict', {
          version: current.version,
          contentVersion: current.contentVersion,
          conflict: current.conflicts[0],
          choice: 'proposed',
        }),
      ];
    if (step === 2) {
      version = lastToolResult(body).version;
      return [modelTool('read_map', { query: 'Familjens Molnmusik' })];
    }
    if (step === 3) {
      const { id, householdId: _household, revision, ...value } = lastToolResult(body).objects[0];
      return [
        modelTool('propose_object', {
          version,
          contentVersion: 1,
          id,
          baseRevision: revision,
          value: {
            ...value,
            description: 'Familjeabonnemang 189 kr per månad.',
            financialFacts: {
              price: { knowledge: 'known', value: '189' },
              currency: { knowledge: 'known', value: 'SEK' },
              paymentInterval: { knowledge: 'known', value: 'månad' },
            },
          },
        }),
      ];
    }
    return [
      modelTool('save_draft', {
        version: lastToolResult(body).version,
        contentVersion: 1,
        operationId: 'family-request',
      }),
    ];
  });
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const household = app.seedDemo();
    await signIn(page.request, app.origin);
    await page.addInitScript({ content: liveBrowserFixtureSource });
    await page.goto(app.origin);
    await openWorkspace(page);
    await page
      .getByRole('list', { name: 'Objekt', exact: true })
      .getByRole('button', { name: 'Uppgifter för Kim Exempel', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByLabel('Beskrivning', { exact: true }).fill('Osänd text som ska finnas kvar');
    await consent(page);
    await expect(await openConversationDraft(page)).toContainText('Lo Lind');
    await startVoice(page);
    speak(live, 'Behåll Lo-förslaget, rätta priset till 189 kr och spara.');
    await expect(assistant(page).getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Sparat.',
    );
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Osänd text som ska finnas kvar',
    );
    await expect(await openConversationDraft(page)).toContainText('Utkastet är tomt.');
    const receipts = await openConversationReceipts(page);
    await receipts.getByText('Visa kvittot', { exact: true }).first().click();
    await expect(receipts).toContainText('Familjens Molnmusik');
    const map = await (
      await page.request.get(`${app.origin}/api/households/${household.id}/map`)
    ).json();
    expect(
      map.objects.find((object: { name: string }) => object.name === 'Familjens Molnmusik')
        .financialFacts.price,
    ).toEqual({ knowledge: 'known', value: '189' });
    expect(map.objects.some((object: { name: string }) => object.name === 'Lo Lind')).toBe(true);
    expect(map.draft.changes).toEqual([]);
    expect(map.relationships.map((edge: { knowledge: string }) => edge.knowledge)).toEqual(
      expect.arrayContaining(['unknown', 'none', 'uncertain']),
    );
    expect(model.requests).toHaveLength(4);
    await expect
      .poll(() => live.sent.some(({ event }) => event.type === 'session.commentary.append'))
      .toBe(true);
    await turnMicrophoneOff(page);
    // Nytt samtal does not ask for the consent again.
    await openConversationText(page);
    await assistant(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(page.getByRole('dialog', { name: 'Samtal med Skyttel' })).toHaveCount(0);
    await expect.poll(() => openVoiceConnections(page)).toBe(1);
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'live' },
    ]);
    await openConversationReceipts(page);
    await expect(
      assistant(page).locator('details').filter({ hasText: 'Tidigare sparförsök' }),
    ).toContainText('Familjens Molnmusik');
    expect(
      await (await page.request.get(`${app.origin}/api/households/${household.id}/map`)).json(),
    ).toEqual(map);
    expect(model.requests).toHaveLength(4);
    await signOut(page);
    await expect.poll(() => openVoiceConnections(page)).toBe(0);
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture
          .stats()
          .microphoneTracks.every((track) => track.state === 'ended'),
      ),
    ).toBe(true);
  } finally {
    await app.close();
  }
});

async function simpleMap(page: Page, app: Awaited<ReturnType<typeof createInstallation>>) {
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const state = await (await page.request.get(path)).json();
  const value = { typeId: state.types[0].id, name: 'Lo Exempel', description: 'Påhittad uppgift' };
  await page.request.post(`${path}/draft`, {
    headers: { origin: app.origin },
    data: { version: 0, contentVersion: 1, id: 'lo', baseRevision: null, value },
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  await openWorkspace(page);
  await consent(page);
  await startVoice(page);
  return { path, value };
}

test('TAL-02: negativa besked och förlorad anslutning stoppar sena röständringar', async ({
  page,
}) => {
  let release!: (output: unknown[]) => void;
  let held = false;
  const model = textModel((body) => {
    const message = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    ).message;
    if (message !== 'Rätta namnet.')
      return [modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'bad-save' })];
    held = true;
    return new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
  });
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const { path, value } = await simpleMap(page, app);
    let completions = 0;
    for (const instruction of [
      'Spara inte.',
      'Spara senare.',
      'Om jag säger spara.',
      'Säg ”spara”.',
    ]) {
      speak(live, instruction);
      await expect
        .poll(
          () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
        )
        .toBe(++completions);
      await expect(assistant(page).getByRole('alert')).toContainText('Inget sparades');
      // The next utterance uses the review that the actual browser has received.
      await expect(voiceBox(page)).toHaveText('Lyssnar');
    }
    speak(live, 'Rätta namnet.');
    await expect.poll(() => held).toBe(true);
    await page.evaluate(() => window.skyttelVoiceFixture.disconnect());
    // The microphone stops listening when the connection is lost.
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture.stats().microphoneTracks.every((track) => !track.enabled),
      ),
    ).toBe(true);
    await expect.poll(() => openVoiceConnections(page), { timeout: 15_000 }).toBe(0);
    await expect(assistant(page).getByRole('alert')).toContainText('Röstanslutningen avbröts');
    release([
      modelTool('propose_object', {
        version: 1,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'För sent' },
      }),
    ]);
    await expect(assistant(page).getByRole('status')).not.toContainText('arbetar');
    const map = await (await page.request.get(path)).json();
    expect(map.objects).toEqual([]);
    expect(map.draft.changes).toMatchObject([{ id: 'lo', after: { name: 'Lo Exempel' } }]);
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture
          .stats()
          .microphoneTracks.every((track) => track.state === 'ended'),
      ),
    ).toBe(true);
    await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toBeEditable();
    const voicePanel = page.getByRole('region', { name: 'Skyttels röst', exact: true });
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('deny'));
    await chooseConversationVoice(page);
    await expect(voicePanel.getByRole('alert')).toContainText('Mikrofonen tilläts inte');
    await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toBeEditable();
    await page.evaluate(() => {
      window.skyttelVoiceFixture.setMicrophone('allow');
      window.skyttelVoiceFixture.setPlayback('blocked');
    });
    await openConversationText(page);
    await chooseConversationVoice(page);
    await expect(voicePanel.getByRole('alert')).toContainText('stoppade ljuduppspelningen');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture.stats().microphoneTracks.every((track) => !track.enabled),
      ),
    ).toBe(true);
    await page.evaluate(() => window.skyttelVoiceFixture.setPlayback('allow'));
    await voicePanel.getByRole('button', { name: 'Spela upp ljud' }).click();
    await expect(voicePanel.getByRole('button', { name: 'Spela upp ljud' })).toHaveCount(0);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await turnMicrophoneOff(page);
    await signOut(page);
    await expect.poll(() => openVoiceConnections(page)).toBe(0);
    const media = await page.evaluate(() => window.skyttelVoiceFixture.stats());
    expect(media.openPeers).toBe(0);
    expect(media.audioElements).toBe(0);
    expect(
      [...media.microphoneTracks, ...media.remoteTracks].every((track) => track.state === 'ended'),
    ).toBe(true);
  } finally {
    await app.close();
  }
});

test('TAL-03: synlig markering och exakt sparåterhämtning fungerar efter röstomstart', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  let step = 0;
  const model = textModel(() => {
    step++;
    if (step === 1) return [modelTool('show_map_object', { objectId: 'lo' })];
    if (step === 2) return [modelMessage('Objektet visas.')];
    if (step === 3)
      return [
        modelTool('prepare_save', { version: 1, contentVersion: 1, operationId: 'provider-id' }),
      ];
    return [modelMessage('Försöket är förberett.')];
  });
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  try {
    const { path } = await simpleMap(page, app);
    speak(live, 'Markera Lo Exempel.');
    await expect(assistant(page).getByRole('status', { includeHidden: true })).toHaveText(
      'Markerat i kartan.',
    );
    await expect(
      page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
      .click({ trial: true });
    await expect(
      page.getByRole('region', { name: 'Lo Exempel', exact: true }).getByText('Namn: Lo Exempel'),
    ).toBeVisible();
    for (const [width, height] of [
      [640, 500],
      [320, 250],
    ]) {
      await page.setViewportSize({ width, height });
      await page.getByRole('button', { name: 'Navigera', exact: true }).click();
      const navigation = page.getByRole('region', { name: 'Navigation', exact: true });
      await navigation.getByRole('button', { name: 'Panorera vänster', exact: true }).click();
      await navigation.getByRole('button', { name: 'Stäng navigering', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Navigera', exact: true })).toBeFocused();
      await page
        .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
        .click({ trial: true });
      await expect(
        page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('region', { name: 'Lo Exempel', exact: true }).getByText('Namn: Lo Exempel'),
      ).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await openConversationText(page);
    await expect(assistant(page).getByRole('status')).toHaveText('Markerat i kartan.');
    await expect
      .poll(
        () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
      )
      .toBe(1);
    speak(live, 'Spara.');
    await expect(assistant(page).getByRole('status')).toHaveText(
      'Kontrollera det tidigare sparförsöket innan du fortsätter.',
    );
    const operation = (await (await page.request.get(`${path}/operations`)).json()).operations[0];
    expect(operation.status).toBe('pending');
    await turnMicrophoneOff(page);
    await app.restart();
    await page.reload();
    await openWorkspace(page);
    await consent(page);
    await startVoice(page);
    await expect(assistant(page).getByRole('status')).toHaveText(
      'Kontrollera det tidigare sparförsöket innan du fortsätter.',
    );
    speak(live, 'Slutför samma sparförsök.');
    await expect(assistant(page).getByRole('status')).toHaveText(
      'Sparat. Hela utkastet finns i hushållets karta.',
    );
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      operationId: operation.operationId,
      status: 'succeeded',
    });
    expect((await (await page.request.get(path)).json()).objects).toMatchObject([{ id: 'lo' }]);
    expect(model.requests).toHaveLength(4);
    const providerId = [...live.channels.keys()].at(-1);
    if (!providerId) throw new Error('Missing active voice after saved receipt');
    live.channels.get(providerId)?.emit('close', 1006, '', []);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => openVoiceConnections(page), { timeout: 15_000 }).toBe(0);
    const afterDrop = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(afterDrop).toEqual(operations);
    await page.reload();
    await openWorkspace(page);
    await consent(page);
    await expect(await openConversationReceipts(page)).toContainText(operation.operationId);
    const voiceStarted = page.waitForResponse(
      (response) => response.url().endsWith('/voice') && response.request().method() === 'POST',
    );
    await startVoice(page);
    const started = await voiceStarted;
    const { voice } = await started.json();
    const usageSession = [...live.channels.keys()].at(-1);
    if (!usageSession) throw new Error('Missing new voice for provisional usage');
    for (const seconds of [12, 15])
      live.emit(usageSession, {
        type: 'session.usage.updated',
        event_id: crypto.randomUUID(),
        usage: { seconds },
      });
    live.configure({ finalize: false });
    // Nytt samtal retires the old provider session while retaining the microphone.
    const previousStarts = live.requests.length;
    await assistant(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect.poll(() => live.requests.length).toBe(previousStarts + 1);
    const closed = await page.request.post(`${started.url()}/${voice.id}/stop`, {
      headers: { origin: app.origin },
    });
    expect(await closed.json()).toMatchObject({
      voice: { phase: 'closed', seconds: 15, usageFinal: false },
    });
    await expect.poll(() => openVoiceConnections(page), { timeout: 15_000 }).toBe(1);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual(
      operations,
    );
    live.configure({ finalize: true });
    await signOut(page);
    await expect.poll(() => openVoiceConnections(page)).toBe(0);
  } finally {
    await app.close();
  }
});
