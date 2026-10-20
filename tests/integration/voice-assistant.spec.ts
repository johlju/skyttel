import type { Page } from '@playwright/test';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import {
  createHousehold,
  openMap,
  openProfile,
  openSettings,
  openTable,
  signIn,
} from '../support/client.js';
import {
  chooseConversationVoice,
  closeConversationText,
  consentBox,
  consentBoxFor,
  microphoneButton,
  openConversationDraft,
  openConversationText,
  openSavedHistory,
  startConversationWithText,
  turnMicrophoneOff,
  turnMicrophoneOn,
  voiceBox,
} from '../support/conversation-page.js';
import {
  editTableObject,
  openObjectRelationships,
  readTableObject,
} from '../support/domain-work.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider, voiceAnswerParts } from '../support/live-provider.js';
import { verifyObjectDepartureAndDiscard } from '../support/object-form-departure.js';
import { exposedTextLines } from '../support/object-property-reading.js';
import { expect, test } from '../support/test.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../support/text-model.js';
import { readVoiceProposal } from '../support/voice-work-reading.js';

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
    await readVoiceProposal(page);
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
                value: {
                  ...value,
                  properties: [
                    {
                      id: 'description',
                      label: 'Beskrivning',
                      kind: 'text',
                      value: 'Förslag väntar på svar',
                    },
                  ],
                },
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
          (await (await page.request.get(map.path)).json()).draft.changes[0].after.properties[0]
            .value,
      )
      .toBe('Förslag väntar på svar');
    await expect(panel.getByRole('log')).toHaveCount(0);
    await expect(voiceBox(page)).toHaveCount(0);
    await openConversationText(page);
    await expect(panel.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Vem använder tjänsten?',
    );
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
      (await (await page.request.get(map.path)).json()).draft.changes[0].after.properties[0].value,
    ).toBe('Förslag väntar på svar');
    await readVoiceProposal(page, 'Lo Exempel', 'Förslag väntar på svar');
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
    await expect(page.getByRole('region', { name: 'Samtalsnotis', exact: true })).toContainText(
      'Webbläsaren tillåter inte mikrofonen.',
    );
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
    // A spoken task shows the working row last in the conversation text.
    await expect(log.getByRole('listitem').last()).toHaveText(
      'Skyttel arbetar… 0 meddelanden väntar. Tryck på Escape för att avbryta.',
    );
    release([modelMessage('Vem använder musiken?')]);
    await expect(log).toContainText('Vem använder musiken?');
    await expect(log.getByText('Skyttel arbetar…')).toHaveCount(0);
    await turnMicrophoneOff(page);
    await expect(log).toContainText('Kim betalar för musiken.');
    await assistant(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(log).toHaveText(/^Skyttel: Nytt samtal\./);
    await expect(await openConversationDraft(page)).toContainText('Lo Exempel');
    await readVoiceProposal(page);
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
    await openMap(page);
    const object = page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true });
    const selected = await object.getAttribute('aria-pressed');
    for (const [index, reply] of replies.entries()) {
      const replyOffset = live.sent.length;
      speak(live, 'Beskriv mitt utkast.');
      const conversation = assistant(page).getByRole('log', { name: 'Samtalstext', exact: true });
      await expect(conversation).toContainText(reply);
      await expect(
        assistant(page).getByRole('button', { name: 'Visa utkastet (1)', exact: true }),
      ).toBeVisible();
      await expect(object).toHaveAttribute('aria-pressed', selected ?? 'false');
      await expect
        .poll(
          () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
        )
        .toBe(index + 1);
      const [result, modelText] = voiceAnswerParts(live.sent.slice(replyOffset))
        .join('')
        .split('\n');
      expect(result).toBe('Utkast: 1 osparat förslag.');
      expect(modelText).toBe(`Samtal (obekräftat): ${JSON.stringify(reply)}`);
      await readVoiceProposal(page);
      await assistant(page).getByRole('button', { name: 'Dölj utkastet (1)', exact: true }).click();
      await openMap(page);
      const current = await (await page.request.get(path)).json();
      expect(current.objects).toEqual(before.objects);
      expect(current.draft).toEqual(before.draft);
      expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    }
    const selectionOffset = live.sent.length;
    speak(live, 'Markera Lo Exempel.');
    await expect(object).toHaveAttribute('aria-pressed', 'true');
    await openConversationText(page);
    await expect(object).toHaveAttribute('aria-pressed', 'true');
    await expect(
      assistant(page).getByRole('log', { name: 'Samtalstext', exact: true }),
    ).toContainText('Vem betalar?');
    await expect
      .poll(
        () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
      )
      .toBe(5);
    expect(voiceAnswerParts(live.sent.slice(selectionOffset)).join('')).toContain(
      'Skyttels resultat (verifierat): Objektet är markerat',
    );
    const saveDelegation = crypto.randomUUID();
    speak(live, 'Spara hela utkastet nu.', saveDelegation);
    await expect(assistant(page).getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Sparat.',
    );
    // Save-check updates can also append commentary. Inspect the result of
    // this spoken instruction separately from those independent updates.
    const saveCommentary = () =>
      live.sent.flatMap(({ event }) =>
        event.type === 'session.commentary.append' && event.delegation_id === saveDelegation
          ? [event.content]
          : [],
      );
    await expect.poll(() => saveCommentary().length).toBe(1);
    expect(saveCommentary()[0]).toContain('Sparat.');
    const receipts = await openSavedHistory(page);
    await expect(receipts.getByRole('article')).toHaveCount(1);
    await expect(receipts).toContainText('Lo Exempel');
    await receipts
      .getByRole('article')
      .first()
      .getByText('Visa ändringarna', { exact: true })
      .click();
    await expect(receipts.locator('.history-changes')).toContainText('Påhittad uppgift');
    await expect(receipts.locator('.history-changes')).toContainText('Person');
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
            properties: value.properties.map((property: { label: string }) => {
              if (property.label === 'Beskrivning')
                return { ...property, kind: 'text', value: 'Familjeabonnemang 189 kr per månad.' };
              if (property.label === 'Pris') return { ...property, kind: 'number', value: 189 };
              return property;
            }),
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
    await consent(page);
    await expect(await openConversationDraft(page)).toContainText('Lo Lind');
    await readVoiceProposal(page, 'Lo Lind', 'Använder familjens musik.');
    await openMap(page);
    await page.getByRole('button', { name: '1 konflikt i ditt utkast', exact: true }).click();
    const conflict = page.getByRole('dialog', { name: 'Granska konflikter', exact: true });
    for (const [side, name, description] of [
      ['Sparat i kartan nu', 'Lo Berg', 'Spelar piano i musikföreningen.'],
      ['Ditt förslag', 'Lo Lind', 'Använder familjens musik.'],
    ]) {
      const values = conflict.getByRole('region', { name: side, exact: true });
      for (const [label, value] of [
        ['Namn', name],
        ['Objekttyp', 'Person'],
        ['Beskrivning · egenskap 1', `Beskrivning: ${description} (Text)`],
      ])
        await expect(
          values
            .locator('.cp-field-name')
            .filter({ hasText: new RegExp(`^${label}$`) })
            .locator('..')
            .locator('.cp-field-value'),
        ).toHaveText(value);
    }
    await expect(
      conflict.getByRole('region', { name: 'Sparat i kartan nu', exact: true }),
    ).toContainText('Lo Berg');
    await conflict.getByRole('button', { name: 'Stäng konfliktdialogen', exact: true }).click();
    await expect(conflict).not.toBeVisible();
    await expect(await openConversationDraft(page)).toContainText('musik@example.test');
    await startVoice(page);
    await closeConversationText(page);
    await editTableObject(page, 'Kim Exempel');
    await page.getByRole('button', { name: 'Fria egenskaper', exact: true }).click();
    await page
      .getByRole('group', { name: 'Egenskap 1', exact: true })
      .getByLabel('Värde', { exact: true })
      .fill('Osänd text som ska finnas kvar');
    const saved = page.waitForResponse(async (response) => {
      if (
        !response.ok() ||
        !response
          .url()
          .startsWith(`${app.origin}/api/households/${household.id}/text-assistant/`) ||
        !response.url().includes('/voice/') ||
        !response.url().endsWith('/poll')
      )
        return false;
      const result = await response.json().catch(() => null);
      return Boolean(result?.assistant?.receipt);
    });
    speak(live, 'Behåll Lo-förslaget, rätta priset till 189 kr och spara.');
    await saved;
    expect(
      (await (await page.request.get(`${app.origin}/api/households/${household.id}/map`)).json())
        .draft.changes,
    ).toEqual([]);
    await expect(
      page
        .getByRole('group', { name: 'Egenskap 1', exact: true })
        .getByLabel('Värde', { exact: true }),
    ).toHaveValue('Osänd text som ska finnas kvar');
    await verifyObjectDepartureAndDiscard(page, { Värde: 'Osänd text som ska finnas kvar' });
    await openConversationText(page);
    await expect(assistant(page).getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Sparat.',
    );
    await expect(await openConversationDraft(page)).toContainText('Utkastet är tomt.');
    const receipts = await openSavedHistory(page);
    await expect(receipts).toContainText('Familjens Molnmusik');
    const latest = receipts.getByRole('article').first();
    await latest.getByText('Visa ändringarna', { exact: true }).click();
    for (const value of ['Lo Lind', 'musik@example.test', '189', 'SEK', 'månad'])
      await expect(latest.locator('.history-changes')).toContainText(value);
    await expect(latest.locator('.history-changes')).not.toContainText(
      'Osänd text som ska finnas kvar',
    );
    const map = await (
      await page.request.get(`${app.origin}/api/households/${household.id}/map`)
    ).json();
    expect(
      map.objects
        .find((object: { name: string }) => object.name === 'Familjens Molnmusik')
        .properties.find((property: { label: string }) => property.label === 'Pris'),
    ).toMatchObject({ label: 'Pris', kind: 'number', value: 189 });
    expect(map.objects.some((object: { name: string }) => object.name === 'Lo Lind')).toBe(true);
    expect(map.draft.changes).toEqual([]);
    const objectIds = new Set(map.objects.map((object: { id: string }) => object.id));
    expect(
      map.relationships.every(
        (edge: { sourceId: string; targetId: string }) =>
          objectIds.has(edge.sourceId) && objectIds.has(edge.targetId),
      ),
    ).toBe(true);
    expect(model.requests).toHaveLength(4);
    await expect
      .poll(() => live.sent.some(({ event }) => event.type === 'session.commentary.append'))
      .toBe(true);
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    await readFamily(page);
    await turnMicrophoneOff(page);
    // Nytt samtal does not ask for the consent again.
    await openConversationText(page);
    await assistant(page).getByRole('button', { name: 'Nytt samtal' }).click();
    await expect(page.getByRole('dialog', { name: 'Samtal med Skyttel' })).toHaveCount(0);
    await expect.poll(() => openVoiceConnections(page)).toBe(1);
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'live' },
    ]);
    await expect(await openSavedHistory(page)).toContainText('Familjens Molnmusik');
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
  const value = {
    typeId: state.types[0].id,
    name: 'Lo Exempel',
    properties: [
      { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Påhittad uppgift' },
    ],
  };
  await page.request.post(`${path}/draft`, {
    headers: { origin: app.origin },
    data: {
      version: 0,
      contentVersion: 1,
      id: 'lo',
      baseRevision: null,
      value: { ...value },
    },
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  await openTable(page);
  await consent(page);
  await startVoice(page);
  return { path, value };
}

async function readFamily(page: Page) {
  for (const [name, type, description] of [
    ['Lo Lind', 'Person', 'Spelar piano i musikföreningen.'],
    ['Familjens Molnmusik', 'Abonnemang', 'Familjeabonnemang 189 kr per månad.'],
    ['Familjens musikkonto', 'Tjänstekonto', 'Samma konto även när e-postadressen ändras.'],
    ['musik@example.test', 'E-postadress', 'Föreslagen ny inloggningsadress.'],
    [
      'Kortets kontokoppling',
      'Bankkonto',
      'Ospecificerat bankkonto; ingen bank eller ägare antas.',
    ],
  ]) {
    const details = await readTableObject(page, name);
    await expect(details).toContainText(type);
    await expect(details).toContainText(description);
    await expect(
      details.getByText('Typ', { exact: true }).locator('..').getByRole('definition'),
    ).toHaveText(type);
    await expect(
      details
        .locator('dt')
        .filter({ hasText: /^Beskrivning$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveText(`${description} (Text)`);
    if (name === 'Familjens Molnmusik') {
      for (const value of ['189', 'SEK', 'månad']) await expect(details).toContainText(value);
      for (const [label, value] of [
        ['Pris', '189'],
        ['Valuta', 'SEK'],
        ['Betalningsintervall', 'månad'],
      ])
        await expect(
          details
            .locator('dt')
            .filter({ hasText: new RegExp(`^${label}$`) })
            .locator('..')
            .locator('dd'),
        ).toHaveText(`${value} (${label === 'Pris' ? 'Tal' : 'Text'})`);
    }
  }
  for (const [name, values] of [
    [
      'Familjens musikkonto',
      ['Inloggningsadress', 'musik@example.test', 'Kontaktadress', 'familjen@example.test'],
    ],
    [
      'Familjens Molnmusik',
      [
        'Står på avtalet',
        'Alex Exempel',
        'Betalar',
        'Kim Exempel',
        'Betalas med',
        'Familjens musikkort',
      ],
    ],
    ['Molnmusik', ['Lo Lind', 'Osäkert uppgivet']],
    [
      'Familjens musikkort',
      [
        'Kontokoppling',
        'Kortets kontokoppling',
        'Kortfakturan betalas från',
        'Hushållets betalkonto',
      ],
    ],
    [
      'Föreningens musikkonto',
      ['Tillhör tjänsten', 'Molnmusik', 'Kontaktadress', 'familjen@example.test'],
    ],
  ] as const) {
    const relationships = await openObjectRelationships(page, name);
    for (const value of values) await expect(relationships).toContainText(value);
    if (name === 'Föreningens musikkonto')
      await expect(relationships.locator('.household-read-relationships > li')).toHaveCount(2);
    const expected = {
      'Familjens musikkonto': [
        ['Inloggningsadress', 'Familjens musikkonto', 'musik@example.test'],
        ['Kontaktadress', 'Familjens musikkonto', 'familjen@example.test'],
      ],
      'Familjens Molnmusik': [
        ['Står på avtalet', 'Familjens Molnmusik', 'Alex Exempel'],
        ['Betalar', 'Kim Exempel', 'Familjens Molnmusik'],
        ['Betalas med', 'Familjens Molnmusik', 'Familjens musikkort'],
      ],
      Molnmusik: [
        ['Använder', 'Lo Lind', 'Molnmusik'],
        ['Används av', 'Molnmusik', 'Lo Lind'],
      ],
      'Familjens musikkort': [
        ['Kontokoppling', 'Familjens musikkort', 'Kortets kontokoppling'],
        ['Kortfakturan betalas från', 'Familjens musikkort', 'Hushållets betalkonto'],
      ],
      'Föreningens musikkonto': [
        ['Tillhör tjänsten', 'Föreningens musikkonto', 'Molnmusik'],
        ['Kontaktadress', 'Föreningens musikkonto', 'familjen@example.test'],
      ],
    }[name];
    for (const [direction, source, target] of expected ?? []) {
      const edge = relationships
        .locator('.household-read-relationships > li')
        .filter({
          has: page
            .locator('dt')
            .filter({ hasText: /^Riktning$/ })
            .locator('..')
            .locator('dd')
            .filter({ hasText: new RegExp(`^${direction}$`) }),
        })
        .filter({
          has: page
            .locator('dt')
            .filter({ hasText: /^Från objekt$/ })
            .locator('..')
            .locator('dd')
            .filter({ hasText: new RegExp(`^${source}$`) }),
        });
      await expect(edge).toHaveCount(1);
      for (const [label, value] of [
        ['Riktning', direction],
        ['Från objekt', source],
        ['Till objekt', target],
      ])
        await expect(
          edge
            .locator('dt')
            .filter({ hasText: new RegExp(`^${label}$`) })
            .locator('..')
            .locator('dd'),
        ).toHaveText(value);
    }
    await page.keyboard.press('Escape');
  }
  const standalone = await openObjectRelationships(page, 'Lindens musikförening');
  await expect(standalone.locator('.household-read-relationships > li')).toHaveCount(0);
  await page.keyboard.press('Escape');
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
      await expect(page.getByRole('region', { name: 'Samtalsnotis', exact: true })).toContainText(
        'Skyttel kunde inte slutföra uppdraget. Försök igen.',
      );
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
    await expect(page.getByRole('region', { name: 'Samtalsnotis', exact: true })).toContainText(
      'Rösten avbröts. Tryck på mikrofonknappen för att fortsätta.',
    );
    release([
      modelTool('propose_object', {
        version: 1,
        contentVersion: 1,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'För sent' },
      }),
    ]);
    await expect(voiceBox(page)).toHaveCount(0);
    const map = await (await page.request.get(path)).json();
    expect(map.objects).toEqual([]);
    expect(map.draft.changes).toMatchObject([{ id: 'lo', after: { name: 'Lo Exempel' } }]);
    await readVoiceProposal(page);
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture
          .stats()
          .microphoneTracks.every((track) => track.state === 'ended'),
      ),
    ).toBe(true);
    await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toBeEditable();
    const voiceNotice = page.getByRole('region', { name: 'Samtalsnotis', exact: true });
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('deny'));
    await chooseConversationVoice(page);
    await expect(voiceNotice).toContainText('Webbläsaren tillåter inte mikrofonen');
    await expect(assistant(page).getByLabel('Meddelande till Skyttel')).toBeEditable();
    await page.evaluate(() => {
      window.skyttelVoiceFixture.setMicrophone('allow');
      window.skyttelVoiceFixture.setPlayback('blocked');
    });
    await openConversationText(page);
    await chooseConversationVoice(page);
    await expect(voiceNotice).toContainText('Webbläsaren stoppade ljudet.');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture.stats().microphoneTracks.every((track) => !track.enabled),
      ),
    ).toBe(true);
    await page.evaluate(() => window.skyttelVoiceFixture.setPlayback('allow'));
    await voiceNotice.getByRole('button', { name: 'Starta ljudet' }).click();
    await expect(voiceNotice.getByRole('button', { name: 'Starta ljudet' })).toHaveCount(0);
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
    await expect(
      page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page
      .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
      .click({ trial: true });
    await expect(
      page
        .getByRole('region', { name: 'Lo Exempel', exact: true })
        .getByRole('definition')
        .filter({ hasText: 'Lo Exempel' }),
    ).toBeVisible();
    for (const [width, height] of [
      [640, 500],
      [320, 250],
    ]) {
      await page.setViewportSize({ width, height });
      // Reframe the retained selection around the reader after changing viewport.
      await page.getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true }).focus();
      await page.keyboard.press('Shift+F10');
      const focusSelection = page.getByRole('button', { name: 'Fokusera markering', exact: true });
      await focusSelection.focus();
      await focusSelection.click();
      await page
        .getByRole('button', { name: 'Välj objekt: Lo Exempel', exact: true })
        .click({ trial: true });
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
        page
          .getByRole('region', { name: 'Lo Exempel', exact: true })
          .getByRole('definition')
          .filter({ hasText: 'Lo Exempel' }),
      ).toBeVisible();
      const description = page
        .getByRole('region', { name: 'Lo Exempel', exact: true })
        .locator('dt')
        .filter({ hasText: /^Beskrivning$/ })
        .locator('..')
        .locator('dd');
      await expect(description).toHaveText('◇ Ditt förslag: Påhittad uppgift (Text)');
      await exposedTextLines(description, 'start');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await openConversationText(page);
    await expect
      .poll(
        () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
      )
      .toBe(1);
    expect(lastToolResult(model.requests[1])).toMatchObject({ displayed: true });
    // Lose the automatic check before it reaches the server, preserving the
    // registered original attempt across restart.
    await page.route('**/text-assistant/*/recover', (route) => route.abort());
    speak(live, 'Spara.');
    await expect(page.getByRole('region', { name: 'Samtalsnotis', exact: true })).toContainText(
      'Skyttel kunde inte kontrollera om utkastet sparades.',
    );
    const operation = (await (await page.request.get(`${path}/operations`)).json()).operations[0];
    expect(operation.status).toBe('pending');
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await app.restart();
    await page.unroute('**/text-assistant/*/recover');
    await page.reload();
    await openTable(page);
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`${path}/operations`)).json()).operations[0]?.status,
      )
      .toBe('succeeded');
    await expect(microphoneButton(page)).toBeEnabled();
    await consent(page);
    await startVoice(page);
    await expect(page.getByRole('log', { name: 'Samtalstext' })).toContainText(
      'Kontrollen visar att hela utkastet sparades. Ändringarna finns i hushållets karta.',
    );
    const operations = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      operationId: operation.operationId,
      status: 'succeeded',
    });
    expect((await (await page.request.get(path)).json()).objects).toMatchObject([{ id: 'lo' }]);
    const savedLo = await readTableObject(page, 'Lo Exempel');
    await expect(savedLo).toContainText('Person');
    await expect(savedLo).toContainText('Påhittad uppgift');
    expect(model.requests).toHaveLength(4);
    const providerId = [...live.channels.keys()].at(-1);
    if (!providerId) throw new Error('Missing active voice after saved receipt');
    live.channels.get(providerId)?.emit('close', 1006, '', []);
    await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => openVoiceConnections(page), { timeout: 15_000 }).toBe(0);
    const afterDrop = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(afterDrop).toEqual(operations);
    await page.reload();
    await openTable(page);
    await consent(page);
    const recoveredHistory = await openSavedHistory(page);
    await recoveredHistory
      .getByText('Identifiera sparandet och användaren', { exact: true })
      .click();
    await expect(recoveredHistory).toContainText(operation.operationId);
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
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
