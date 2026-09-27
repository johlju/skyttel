import { expect, type Page, test } from '@playwright/test';
import type { TextAssistantReview } from '../../src/shared/text-assistant.js';
import {
  createHousehold,
  openConversation,
  openMap,
  openSettings,
  openWorkspace,
  signIn,
} from '../support/client.js';
import { createInstallation } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider } from '../support/live-provider.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../support/text-model.js';

const assistant = (page: Page) =>
  page.getByRole('region', { name: 'Skyttels textassistent', exact: true });
async function consent(page: Page) {
  await openConversation(page);
  const panel = assistant(page);
  await panel.getByLabel(/Jag tillåter att OpenAI/).check();
  await panel.getByLabel(/Jag tillåter förslag och sparande/).check();
  await panel.getByRole('button', { name: 'Starta textassistenten' }).click();
  await expect(panel.getByRole('button', { name: 'Starta röst' })).toBeVisible();
}
async function startVoice(
  page: Page,
  expected = 'Lyssnar. Du kan tala, rätta eller be att spara hela utkastet.',
) {
  await openConversation(page);
  await assistant(page).getByRole('button', { name: 'Starta röst' }).click();
  await expect(assistant(page).getByText(expected)).toBeVisible();
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
    await assistant(page).getByLabel('Meddelande till textassistenten').fill('Osänd rättelse');
    speak(live, 'Rätta Lo.');
    await expect.poll(() => held).toBe(true);
    await openMap(page);
    await expect(assistant(page).getByRole('status')).toContainText('Assistenten arbetar');
    await assistant(page).getByRole('button', { name: 'Avbryt uppdrag', exact: true }).click();
    release([
      modelTool('propose_object', {
        version: before.draft.version,
        contentVersion: before.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { ...value, name: 'För sent' },
      }),
    ]);
    await expect(assistant(page)).toContainText('Uppdraget är avbrutet');
    await expect
      .poll(async () => (await (await page.request.get(path)).json()).draft)
      .toEqual(before.draft);
    await assistant(page).getByRole('button', { name: 'Stäng av rösten', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().openPeers))
      .toBe(0);
    await assistant(page).getByRole('button', { name: 'Öppna samtalet', exact: true }).click();
    await expect(assistant(page).getByLabel('Meddelande till textassistenten')).toHaveValue(
      'Osänd rättelse',
    );
    await assistant(page).getByRole('button', { name: 'Avsluta samtalet', exact: true }).click();
    await expect(
      assistant(page).getByRole('button', { name: 'Starta textassistenten' }),
    ).toBeVisible();
    expect((await (await page.request.get(path)).json()).draft).toEqual(before.draft);
  } finally {
    await app.close();
  }
});

test('TAL-07: uppmätt ljudaktivitet skiljs från mikrofonpaus och består i Inställningar', async ({
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
    const voice = assistant(page).getByRole('region', { name: 'Skyttels röst', exact: true });
    const waveform = voice.locator('.voice-waveform');
    await expect(waveform).toBeVisible();
    await expect(waveform.locator('i').first()).toHaveCSS('animation-name', 'none');
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('microphone', true));
    await expect(voice.getByText('Du talar', { exact: true })).toBeVisible();
    await expect(waveform.locator('i').first()).not.toHaveCSS('animation-name', 'none');
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('microphone', false));
    await expect(voice.getByText('Du talar', { exact: true })).toHaveCount(0);
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', true));
    await expect(voice.getByText('Skyttel talar', { exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(waveform).toBeVisible();
    await expect(waveform.locator('i').first()).toHaveCSS('animation-name', 'none');
    const tools = page.getByRole('navigation', { name: 'Kartans verktyg' });
    const pause = tools.getByRole('button', { name: 'Pausa mikrofon', exact: true });
    await expect(pause.locator('svg circle')).toHaveCount(1);
    await pause.click();
    await expect(voice.getByText('Mikrofonen är pausad', { exact: true })).toBeVisible();
    await expect(voice.getByText('Skyttel talar', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats())).toMatchObject({
      peers: 1,
      openPeers: 1,
      audioElements: 1,
      microphoneTracks: [{ enabled: false, state: 'live' }],
      remoteTracks: [{ enabled: true, state: 'live' }],
    });
    await assistant(page).getByLabel('Meddelande till textassistenten').fill('Kvar i samtalet');
    await openSettings(page);
    await expect(voice.getByText('Mikrofonen är pausad', { exact: true })).toBeVisible();
    await voice.getByRole('button', { name: 'Återuppta mikrofon' }).click();
    const open = assistant(page).getByRole('button', { name: 'Öppna samtalet', exact: true });
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(assistant(page).getByLabel('Meddelande till textassistenten')).toHaveValue(
      'Kvar i samtalet',
    );
    await expect(page.getByRole('heading', { name: 'Samtal och text', exact: true })).toBeFocused();
    await page.evaluate(() => window.skyttelVoiceFixture.setSound('remote', false));
    await expect(voice.getByText('Skyttel talar', { exact: true })).toHaveCount(0);
    await voice.getByRole('button', { name: 'Stäng av rösten' }).click();
    await expect(waveform).toHaveCount(0);
    expect(live.requests).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('TAL-08: nödvändiga frågor och fel nås med stängd samtalstext', async ({ page }) => {
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
    await panel.getByRole('button', { name: 'Stäng av rösten' }).click();
    await panel.getByLabel('Meddelande till textassistenten').fill('Lägg till uppgiften.');
    await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
    await openMap(page);
    await expect(panel.getByRole('status')).toContainText('Skyttel behöver ett svar');
    await expect(
      panel
        .getByRole('region', { name: 'Nödvändigt svar' })
        .getByText('Vem använder tjänsten?', { exact: true }),
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Svara i samtalet' }).click();
    await panel.getByLabel('Meddelande till textassistenten').fill('Lo använder tjänsten.');
    await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect.poll(() => stage).toBe(2);
    await openMap(page);
    await expect(panel.getByRole('status')).toContainText('Assistenten arbetar');
    await expect(panel.getByRole('button', { name: 'Svara i samtalet' })).toHaveCount(0);
    release([modelMessage('Vill du läsa vidare?')]);
    await expect(panel.getByRole('status')).toContainText('Nya förslag är osparade');
    await panel.getByRole('button', { name: 'Öppna samtalet' }).click();
    await panel.getByLabel('Meddelande till textassistenten').fill('Berätta mer.');
    await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
    await openMap(page);
    await expect(panel.getByRole('alert')).toContainText(
      'Assistenten kunde inte slutföra uppdraget',
    );
    await panel.getByText('Samtalskontroller', { exact: true }).click();
    await panel.getByRole('button', { name: 'Avsluta samtalet' }).click();
    expect(
      (await (await page.request.get(map.path)).json()).draft.changes[0].after.description,
    ).toBe('Förslag väntar på svar');
  } finally {
    await app.close();
  }
});

test('TAL-09: gemensam start kräver separata medgivanden och återhämtar mikrofonavbrott', async ({
  page,
}) => {
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
    await page.getByRole('button', { name: 'Prata med Skyttel', exact: true }).click();
    const panel = assistant(page);
    const startText = panel.getByRole('button', { name: 'Starta textassistenten' });
    const startVoice = panel.getByRole('button', { name: 'Starta talsamtal' });
    const external = panel.getByLabel(/Jag tillåter att OpenAI/);
    const work = panel.getByLabel(/Jag tillåter förslag och sparande/);
    await external.check();
    await expect(startText).toBeDisabled();
    await expect(startVoice).toBeDisabled();
    await external.uncheck();
    await work.check();
    await expect(startText).toBeDisabled();
    await expect(startVoice).toBeDisabled();
    await external.check();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual(
      [],
    );
    await startText.click();
    await panel.getByLabel('Meddelande till textassistenten').fill('Text utan mikrofon');
    await panel.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(panel.getByRole('log')).toContainText('Texten fungerar.');
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual(
      [],
    );
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('hold'));
    await panel.getByRole('button', { name: 'Starta röst' }).click();
    await expect(panel.getByText(/Väntar på mikrofonåtkomst/)).toBeVisible();
    await panel.getByRole('button', { name: 'Avbryt talstart' }).click();
    await page.evaluate(() => window.skyttelVoiceFixture.releaseMicrophone());
    await expect
      .poll(() => page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks))
      .toEqual([{ enabled: false, state: 'ended' }]);
    expect(live.requests).toHaveLength(0);
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('deny'));
    await panel.getByRole('button', { name: 'Starta röst' }).click();
    await expect(panel.getByRole('alert')).toContainText('mikrofon');
    await expect(panel.getByLabel('Meddelande till textassistenten')).toBeEditable();
    await expect(panel.getByRole('log')).toContainText('Texten fungerar.');
    await page.evaluate(() => {
      window.skyttelVoiceFixture.setMicrophone('allow');
      window.skyttelVoiceFixture.setAutoStart(false);
    });
    await panel.getByRole('button', { name: 'Starta röst' }).click();
    await expect(panel.getByText(/Ansluter rösten/)).toBeVisible();
    await expect.poll(() => live.requests.length).toBe(1);
    expect(
      await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks.at(-1)),
    ).toEqual({ enabled: false, state: 'live' });
    await page.evaluate(() => window.skyttelVoiceFixture.started());
    await expect(panel.getByText('Mikrofonen är på', { exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('TAL-05: dialog, mikrofonpaus och arbetstid finns kvar under samtalet', async ({ page }) => {
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
    const log = assistant(page).getByRole('log', { name: 'Samtalets dialog' });
    await expect(log.getByRole('listitem')).toHaveCount(3);
    await expect(log.getByRole('listitem').nth(0)).toHaveText('DuKim betalar för musiken.');
    await expect(log.getByRole('listitem').nth(1)).toHaveText('SkyttelJag lyssnar. Berätta mer.');
    await assistant(page).getByRole('button', { name: 'Pausa mikrofon' }).click();
    await expect(assistant(page).getByText('Mikrofonen är pausad', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.skyttelVoiceFixture.disconnect();
      window.skyttelVoiceFixture.reconnect();
    });
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: false, state: 'live' },
    ]);
    await assistant(page).getByRole('button', { name: 'Återuppta mikrofon' }).click();
    expect(await page.evaluate(() => window.skyttelVoiceFixture.stats().microphoneTracks)).toEqual([
      { enabled: true, state: 'live' },
    ]);
    expect(live.requests).toHaveLength(1);
    speak(live, 'Kontrollera utkastet.');
    await expect.poll(() => held).toBe(true);
    await expect(assistant(page).getByRole('status')).toContainText('Assistenten arbetar');
    const elapsed = assistant(page).getByLabel('Tid för pågående arbete');
    await expect(elapsed).toBeVisible();
    await expect(elapsed).not.toHaveText('0 s');
    release([modelMessage('Vem använder musiken?')]);
    await expect(log).toContainText('Vem använder musiken?');
    await expect(elapsed).toHaveCount(0);
    await assistant(page).getByRole('button', { name: 'Stäng av rösten' }).click();
    await expect(log).toContainText('Kim betalar för musiken.');
    await assistant(page).getByRole('button', { name: 'Avsluta samtalet' }).click();
    await expect(log).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Hela mitt utkast' })).toContainText(
      'Lo Exempel',
    );
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
    await expect(assistant(page)).toContainText('AI-rösten kan innehålla fel.');
    for (const [index, reply] of replies.entries()) {
      speak(live, 'Beskriv mitt utkast.');
      const conversation = assistant(page).getByRole('region', {
        name: 'Assistentens samtalstext',
        exact: true,
      });
      await expect(conversation).toContainText(reply);
      await expect(conversation.getByRole('heading')).toHaveText(
        'Assistentens samtalstext – inte en bekräftelse',
      );
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
    await openConversation(page);
    await expect(assistant(page).getByRole('status')).toHaveText('Markerat i kartan.');
    await expect(object).toHaveAttribute('aria-pressed', 'true');
    await expect(
      assistant(page).getByRole('region', { name: 'Assistentens samtalstext', exact: true }),
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
    await expect(assistant(page).getByRole('status')).toHaveText(
      'Sparat. Hela utkastet finns i hushållets karta.',
    );
    await expect
      .poll(
        () => live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
      )
      .toBe(6);
    expect(JSON.stringify(live.sent.at(-1))).toContain('Skyttels resultat (verifierat): Sparat.');
    await assistant(page).getByText('Visa kvittot', { exact: true }).click();
    await expect(assistant(page)).toContainText('Sparat: Lo Exempel. Kvitto:');
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
      .getByRole('button', { name: 'Kim Exempel', exact: true })
      .click();
    await page.getByRole('button', { name: 'Redigera valt objekt', exact: true }).click();
    await page.getByLabel('Beskrivning', { exact: true }).fill('Osänd text som ska finnas kvar');
    await consent(page);
    await expect(
      assistant(page).getByRole('region', { name: 'Assistentens hela utkast' }),
    ).toContainText('Lo Lind');
    await startVoice(page);
    speak(live, 'Behåll Lo-förslaget, rätta priset till 189 kr och spara.');
    await expect(assistant(page).getByRole('status')).toHaveText(
      'Sparat. Hela utkastet finns i hushållets karta.',
    );
    await expect(page.getByLabel('Beskrivning', { exact: true })).toHaveValue(
      'Osänd text som ska finnas kvar',
    );
    await expect(
      assistant(page).getByRole('region', { name: 'Assistentens hela utkast' }),
    ).toContainText('Inga förslag.');
    await assistant(page).getByText('Visa kvittot', { exact: true }).click();
    await expect(assistant(page)).toContainText('Familjens Molnmusik');
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
    await assistant(page).getByRole('button', { name: 'Stäng av rösten' }).click();
    await expect(assistant(page).getByText('Rösten är avstängd.')).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture
          .stats()
          .microphoneTracks.every((track) => track.state === 'ended'),
      ),
    ).toBe(true);
    await assistant(page).getByRole('button', { name: 'Avsluta samtalet' }).click();
    await consent(page);
    await assistant(page).getByText('Tidigare sparförsök', { exact: true }).click();
    await expect(
      assistant(page).locator('details').filter({ hasText: 'Tidigare sparförsök' }),
    ).toContainText('Familjens Molnmusik');
    expect(
      await (await page.request.get(`${app.origin}/api/households/${household.id}/map`)).json(),
    ).toEqual(map);
    expect(model.requests).toHaveLength(4);
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
      await expect(
        assistant(page).getByText('Lyssnar. Du kan tala, rätta eller be att spara hela utkastet.'),
      ).toBeVisible();
    }
    speak(live, 'Rätta namnet.');
    await expect.poll(() => held).toBe(true);
    await page.evaluate(() => window.skyttelVoiceFixture.disconnect());
    await expect(assistant(page).getByText(/Anslutningen är tillfälligt bruten/)).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.skyttelVoiceFixture.stats().microphoneTracks.every((track) => !track.enabled),
      ),
    ).toBe(true);
    await expect(assistant(page).getByText('Rösten är avstängd.')).toBeVisible();
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
    await expect(assistant(page).getByLabel('Meddelande till textassistenten')).toBeEditable();
    const voicePanel = page.getByRole('region', { name: 'Skyttels röst', exact: true });
    await page.evaluate(() => window.skyttelVoiceFixture.setMicrophone('deny'));
    await voicePanel.getByRole('button', { name: 'Starta röst' }).click();
    await expect(voicePanel.getByRole('alert')).toContainText('Mikrofonen tilläts inte');
    await expect(assistant(page).getByLabel('Meddelande till textassistenten')).toBeEditable();
    await page.evaluate(() => {
      window.skyttelVoiceFixture.setMicrophone('allow');
      window.skyttelVoiceFixture.setPlayback('blocked');
    });
    await startVoice(page);
    await expect(voicePanel.getByRole('alert')).toContainText('stoppade ljuduppspelningen');
    await page.evaluate(() => window.skyttelVoiceFixture.setPlayback('allow'));
    await voicePanel.getByRole('button', { name: 'Spela upp ljud' }).click();
    await expect(voicePanel.getByRole('button', { name: 'Spela upp ljud' })).toHaveCount(0);
    await voicePanel.getByRole('button', { name: 'Stäng av rösten' }).click();
    await expect(voicePanel.getByText('Rösten är avstängd.')).toBeVisible();
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
    await openConversation(page);
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
    await assistant(page).getByRole('button', { name: 'Stäng av rösten' }).click();
    await expect(assistant(page).getByText('Rösten är avstängd.')).toBeVisible();
    await app.restart();
    await page.reload();
    await openWorkspace(page);
    await consent(page);
    await startVoice(page, 'Kontrollera det tidigare sparförsöket innan nya ändringar.');
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
    await expect(assistant(page).getByText('Rösten är avstängd.')).toBeVisible();
    const afterDrop = (await (await page.request.get(`${path}/operations`)).json()).operations;
    expect(afterDrop).toEqual(operations);
    await page.reload();
    await openWorkspace(page);
    await consent(page);
    await assistant(page).getByText('Tidigare sparförsök', { exact: true }).click();
    await expect(assistant(page)).toContainText(operation.operationId);
    await startVoice(page);
    const usageSession = [...live.channels.keys()].at(-1);
    if (!usageSession) throw new Error('Missing new voice for provisional usage');
    for (const seconds of [12, 15])
      live.emit(usageSession, {
        type: 'session.usage.updated',
        event_id: crypto.randomUUID(),
        usage: { seconds },
      });
    live.configure({ finalize: false });
    const stopResponse = page.waitForResponse(
      (response) => response.url().includes('/voice/') && response.url().endsWith('/stop'),
    );
    await assistant(page).getByRole('button', { name: 'Stäng av rösten' }).click();
    expect(await (await stopResponse).json()).toMatchObject({
      voice: { phase: 'closed', seconds: 15, usageFinal: false },
    });
    await expect(assistant(page).getByText('Rösten är avstängd.')).toBeVisible();
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual(
      operations,
    );
    live.configure({ finalize: true });
  } finally {
    await app.close();
  }
});
