import type { Page } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import type { VoiceAssistantView } from '../../src/shared/voice-assistant.js';
import { closeSupportDialog, createHousehold, openTable, signIn } from '../support/client.js';
import {
  closeConversationText,
  microphoneButton,
  openConversationDraft,
  openConversationText,
  openSavedHistory,
  startConversationWithText,
  startConversationWithVoice,
  voiceAnnouncement,
  voiceBox,
} from '../support/conversation-page.js';
import { readTableObject } from '../support/domain-work.js';
import { createInstallation, robin } from '../support/installation.js';
import { liveBrowserFixtureSource } from '../support/live-browser.js';
import { liveProvider, voiceAnswerParts } from '../support/live-provider.js';
import { createPreparedContext, expect, test } from '../support/test.js';
import {
  lastToolResult,
  modelMessage,
  modelTool,
  pendingUpdate,
  textModel,
  verifiedAnswers,
} from '../support/text-model.js';
import { readVoiceProposal } from '../support/voice-work-reading.js';

const field = (page: Page) => page.getByLabel('Meddelande till Skyttel');
const textView = (page: Page) =>
  page.getByRole('region', { name: 'Skriv till Skyttel', exact: true });
const question = 'Vilken person avses med Lo, och vilket namn ska objektet ha?';
async function send(page: Page, text: string) {
  await field(page).fill(text);
  await page.getByRole('button', { name: 'Skicka', exact: true }).click();
}
async function fixture(page: Page, model: ReturnType<typeof textModel>, unresolved = false) {
  const live = liveProvider();
  const app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  await signIn(page.request, app.origin);
  const { household } = await (await createHousehold(page.request, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/map`;
  const state: MapState = await (await page.request.get(path)).json();
  const value = {
    typeId: state.types[0].id,
    name: 'Lo Exempel',
    ...(unresolved ? { identity: 'unresolved' } : {}),
  };
  expect(
    (
      await page.request.post(`${path}/draft`, {
        headers: { origin: app.origin },
        data: { version: 0, contentVersion: 1, id: 'lo', baseRevision: null, value },
      })
    ).status(),
  ).toBe(200);
  const views: TextAssistantView[] = [];
  const responses: VoiceAssistantView[] = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/text-assistant')) return;
    const data = await response.json().catch(() => null);
    if (data?.assistant?.review) views.push(data.assistant);
    else if (data?.review) views.push(data);
    if (data?.voice) responses.push(data.voice);
  });
  await page.addInitScript({ content: liveBrowserFixtureSource });
  await page.goto(app.origin);
  return { app, live, path, value, views, responses };
}
function speak(live: ReturnType<typeof liveProvider>, text: string) {
  const id = [...live.channels.keys()].at(-1);
  if (!id) throw new Error('Voice has not started');
  live.emit(id, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: text,
    start_ms: 0,
    end_ms: 100,
  });
  live.emit(id, {
    type: 'session.delegation.created',
    event_id: crypto.randomUUID(),
    offset_ms: 100,
    delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
  });
}
const commentary = (live: ReturnType<typeof liveProvider>) =>
  live.sent.filter(({ event }) => event.type === 'session.commentary.append');
async function output(page: Page, text: string) {
  await page.evaluate(
    (delta) =>
      window.skyttelVoiceFixture.emit({
        type: 'session.output_transcript.delta',
        event_id: crypto.randomUUID(),
        delta,
        start_ms: 200,
        end_ms: 300,
      }),
    text,
  );
}
async function sound(page: Page, active: boolean) {
  await page.evaluate((active) => window.skyttelVoiceFixture.setSound('remote', active), active);
}
async function waitForResponse(live: ReturnType<typeof liveProvider>) {
  await expect.poll(() => commentary(live).length).toBeGreaterThan(0);
}

test('FRAGA-01: en nödvändig identitetsfråga finns i samtalstexten med serverns väntesignal', async ({
  page,
}) => {
  const model = textModel(() => [modelTool('ask_questions', { questions: [question] })]);
  const { app, path, views } = await fixture(page, model, true);
  try {
    await startConversationWithText(page);
    await send(page, 'Red ut vilken Lo som avses.');
    await expect(textView(page)).toContainText(question);
    await expect.poll(() => views.at(-1)?.questionPending).toBe(true);
    expect(
      JSON.parse(String(model.requests[0].input.findLast((row) => row.role === 'user')?.content))
        .draft.unresolvedIdentities,
    ).toHaveLength(1);
    await expect(voiceBox(page)).toHaveCount(0);
    const request = model.requests[0];
    expect(request.tools.some((tool) => tool.name === 'ask_questions')).toBe(true);
    expect((await (await page.request.get(path)).json()).objects).toEqual([]);
    await readVoiceProposal(page, 'Lo Exempel', null);
  } finally {
    await app.close();
  }
});

test('FRAGA-10: en väntande fråga bevarar oberoende svar och besked om nytt sparande', async ({
  page,
}) => {
  let call = 0;
  const answer = 'Lo Exempel är en person i ditt utkast.';
  const model = textModel(() =>
    call++ === 0
      ? [modelTool('ask_questions', { questions: [question], continueResponse: true })]
      : [modelMessage(answer)],
  );
  const { app, path, views } = await fixture(page, model, true);
  try {
    await startConversationWithText(page);
    await send(page, 'Red ut vilken Lo som avses och berätta förslagets objekttyp. Spara.');
    const transcript = page.getByRole('log', { name: 'Samtalstext' });
    await expect(transcript).toContainText(question);
    await expect(transcript).toContainText(answer);
    await expect(transcript).toContainText('Din tidigare sparbegäran gäller inte längre.');
    await expect(transcript).toContainText('Be om sparande igen när frågorna är lösta.');
    await expect.poll(() => views.at(-1)?.questionPending).toBe(true);
    await readVoiceProposal(page, 'Lo Exempel', null);
    expect((await (await page.request.get(path)).json()).objects).toEqual([]);
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual([]);
  } finally {
    await app.close();
  }
});

test('FRAGA-11: egenskapsfrågor och lika namn rättas med text i samma röstsamtal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const questions = [
    'Ska Kod 0012 vara text eller tal?',
    'Vilken Notering ska tömmas: Hem eller Arbete?',
    'Vilken Alex använder Molnmusik: personen i Lund eller personen i Umeå?',
  ];
  let call = 0;
  let usesType = '';
  const model = textModel((body) => {
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    const lo = turn.draft.changes.find((change: { id: string }) => change.id === 'lo');
    const value = lo?.after ?? {};
    const properties = value.properties;
    if (call++ === 0)
      return [
        modelTool('submit_changes', {
          version: turn.draft.version,
          contentVersion: turn.draft.contentVersion,
          completion: 'draft',
          questions,
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'lo',
                baseRevision: null,
                value: {
                  ...value,
                  properties: [
                    ...properties,
                    { label: 'Telefon', kind: 'text', value: '0700123456' },
                  ],
                },
              },
            },
          ],
        }),
      ];
    if (call === 2)
      return [
        modelTool('submit_changes', {
          version: turn.draft.version,
          contentVersion: turn.draft.contentVersion,
          completion: 'draft',
          questions: [],
          continueResponse: true,
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'lo',
                baseRevision: null,
                value: {
                  ...value,
                  properties: [
                    { ...properties[0], value: undefined },
                    properties[1],
                    properties[2],
                    { label: 'Kod', kind: 'text', value: '0012' },
                  ],
                },
              },
            },
            {
              name: 'propose_relationship',
              arguments: {
                id: 'uses',
                baseRevision: null,
                value: { typeId: usesType, sourceId: 'alex-umea', targetId: 'service' },
              },
            },
          ],
        }),
      ];
    if (call === 3)
      return [
        modelTool('ask_questions', { questions: [], updates: verifiedAnswers(body, questions) }),
      ];
    return [
      modelTool('save_draft', {
        version: turn.draft.version,
        contentVersion: turn.draft.contentVersion,
        operationId: 'clarified-conversation',
      }),
    ];
  });
  const { app, live, path } = await fixture(page, model);
  try {
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    let state = await read();
    usesType = state.relationshipTypes.find((type) => type.name === 'Använder')?.id ?? '';
    for (const [id, name, properties] of [
      [
        'lo',
        'Lo Exempel',
        [
          { id: 'home', label: 'Notering', kind: 'text', value: 'Hem' },
          { id: 'work', label: 'Notering', kind: 'text', value: 'Arbete' },
        ],
      ],
      ['alex-lund', 'Alex', [{ id: 'city', label: 'Ort', kind: 'text', value: 'Lund' }]],
      ['alex-umea', 'Alex', [{ id: 'city', label: 'Ort', kind: 'text', value: 'Umeå' }]],
      ['service', 'Molnmusik', []],
    ]) {
      expect(
        (
          await page.request.post(`${path}/draft`, {
            headers: { origin: app.origin },
            data: {
              version: state.draft.version,
              contentVersion: state.contentVersion,
              id,
              baseRevision: null,
              value: { typeId: state.types[0].id, name, properties },
            },
          })
        ).status(),
      ).toBe(200);
      state = await read();
    }
    await page.reload();
    await startConversationWithVoice(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    speak(
      live,
      'Lägg till telefon 0700123456 på Lo. Lägg till Kod 0012. Töm Notering. Alex använder Molnmusik. Spara hela utkastet.',
    );
    await expect
      .poll(
        () =>
          live.sent.filter(
            ({ event }) =>
              event.type === 'session.instructions.append' &&
              event.content.startsWith('Återge svar '),
          ).length,
      )
      .toBe(1);
    const voiceAnswer = voiceAnswerParts(live.sent).join('');
    for (const text of [
      ...questions,
      'Din tidigare sparbegäran gäller inte längre. Be om sparande igen när frågorna är lösta.',
    ])
      expect(voiceAnswer).toContain(text);
    await openConversationText(page);
    const transcript = page.getByRole('log', { name: 'Samtalstext' });
    for (const text of questions) await expect(transcript).toContainText(text);
    await expect(transcript).toContainText('Din tidigare sparbegäran gäller inte längre.');
    const waiting = await openConversationDraft(page);
    await expect(waiting).toContainText('Lo Exempel');
    await expect(waiting).toContainText('Molnmusik');
    await waiting.getByRole('button', { name: 'Visa förslaget: Lo Exempel', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Lo Exempel', exact: true });
    for (const text of ['Hem', 'Arbete', '0700123456']) await expect(details).toContainText(text);
    await expect(details.getByText('Kod', { exact: true })).toHaveCount(0);
    await closeSupportDialog(page, 'Lo Exempel');
    await page.getByRole('button', { name: 'Dölj utkastet (4)', exact: true }).click();
    await field(page).focus();
    await page.keyboard.type('Kod ska vara text. Töm Hem. Det är Alex i Umeå. Spara inte.');
    await page.getByRole('button', { name: 'Skicka', exact: true }).click();
    await expect(transcript.locator('.working')).toHaveCount(0);
    const corrected = await openConversationDraft(page);
    await corrected
      .getByRole('button', { name: 'Visa förslaget: Lo Exempel', exact: true })
      .click();
    for (const text of ['Notering', 'Tomt (Text)', 'Arbete', '0700123456', '0012'])
      await expect(details).toContainText(text);
    await expect(transcript).toContainText('Kod för Lo Exempel sattes till 0012.');
    await closeSupportDialog(page, 'Lo Exempel');
    await expect(corrected).toContainText('Alex');
    await expect(corrected).toContainText('Molnmusik');
    await page.getByRole('button', { name: 'Dölj utkastet (5)', exact: true }).click();
    await send(page, 'Spara hela utkastet nu.');
    await expect(transcript).toContainText('Sparat.');
    await expect(await openConversationDraft(page)).toContainText('Utkastet är tomt.');
    const saved = await readTableObject(page, 'Lo Exempel');
    for (const text of ['Tomt (Text)', 'Arbete', '0700123456', '0012'])
      await expect(saved).toContainText(text);
    await openTable(page);
    const table = page.getByRole('region', { name: 'Hushållets tabell', exact: true });
    for (const [city, count] of [
      ['Umeå', 1],
      ['Lund', 0],
    ] as const) {
      await table.getByRole('searchbox').fill(`Ort ${city}`);
      await expect(table.getByRole('rowheader')).toHaveCount(1);
      await table.getByRole('button', { name: 'Samband för Alex', exact: true }).click();
      const links = page.getByRole('dialog', { name: 'Samband för Alex', exact: true });
      await expect(links.locator('.household-read-relationships > li')).toHaveCount(count);
      if (count) await expect(links).toContainText('Molnmusik');
      await page.keyboard.press('Escape');
    }
  } finally {
    await app.close();
  }
});

test('FRAGA-12: mellantur, selektivt svar och återtagande bevarar en informationsfråga vid manuellt sparande', async ({
  page,
}) => {
  const nameQuestion = 'Vilket namn ska Lo ha?';
  const descriptionQuestion = 'Vilken beskrivning ska Lo ha?';
  const helmetQuestion = 'Vilken hjälm vill du hitta?';
  let step = 0;
  const model = textModel((request) => {
    const input = JSON.parse(
      String(request.input.findLast((item) => item.role === 'user')?.content),
    );
    if (step++ === 0)
      return [
        modelTool('ask_questions', {
          questions: [
            {
              kind: 'change',
              request: 'Ändra Los namn',
              question: nameQuestion,
              dependsOnDraft: true,
            },
            {
              kind: 'change',
              request: 'Ändra Los beskrivning',
              question: descriptionQuestion,
              dependsOnDraft: true,
            },
            {
              kind: 'information',
              request: 'Hitta hjälmen',
              question: helmetQuestion,
              dependsOnDraft: false,
            },
          ],
        }),
      ];
    if (step === 2) return [modelMessage('Lo är en person i ditt utkast.')];
    if (step === 3)
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [pendingUpdate(request, nameQuestion)],
          continueResponse: true,
        }),
      ];
    if (step === 4) {
      const part = lastToolResult(request).pendingParts[0];
      return [
        modelTool('submit_changes', {
          version: input.draft.version,
          contentVersion: input.draft.contentVersion,
          completion: 'draft',
          resolves: [{ id: part.id, revision: part.revision }],
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'lo',
                baseRevision: null,
                value: { ...input.draft.changes[0].after, name: 'Lo Lind' },
              },
            },
          ],
        }),
      ];
    }
    return [
      modelTool('ask_questions', {
        questions: [],
        updates: [pendingUpdate(request, descriptionQuestion, { action: 'withdraw' })],
      }),
    ];
  });
  const { app } = await fixture(page, model);
  try {
    await startConversationWithText(page);
    const transcript = page.getByRole('log', { name: 'Samtalstext' });
    await send(page, 'Ändra Los namn och beskrivning och hitta hjälmen. Spara.');
    for (const text of [nameQuestion, descriptionQuestion, helmetQuestion])
      await expect(transcript).toContainText(text);
    await send(page, 'Vilken objekttyp har Lo?');
    await expect(transcript).toContainText('Lo är en person i ditt utkast.');
    expect((await transcript.innerText()).split(nameQuestion)).toHaveLength(2);
    await send(page, 'Namnet ska vara Lo Lind.');
    await expect(transcript).toContainText('bytte namn till Lo Lind');
    await expect(transcript.locator('.working')).toHaveCount(0);
    const draft = await openConversationDraft(page);
    await expect(
      draft.getByRole('button', { name: 'Spara hela utkastet', exact: true }),
    ).toBeDisabled();
    await page.getByRole('button', { name: 'Dölj utkastet (1)', exact: true }).click();
    await send(page, 'Strunta i beskrivningen.');
    await expect(transcript).toContainText('återtagen');
    await openConversationDraft(page);
    await page.getByRole('button', { name: 'Spara hela utkastet', exact: true }).click();
    await expect(page.getByRole('status', { name: 'Sparbekräftelse', exact: true })).toContainText(
      'Utkastet är sparat',
    );
    await expect(transcript).toContainText(helmetQuestion);
    const saved = await readTableObject(page, 'Lo Lind');
    await expect(saved).not.toContainText('Beskrivning');
  } finally {
    await app.close();
  }
});

test('FRAGA-02: Skyttel frågar om en verklig konflikt i samtalet utan en genererad frågeruta', async ({
  page,
  browser,
}) => {
  const conflictQuestion =
    'Lo hette Lo Exempel. Vill du behålla ditt förslag Lo Lind eller det sparade namnet Lo Berg?';
  const model = textModel(() => [modelTool('ask_questions', { questions: [conflictQuestion] })]);
  const { app, path, value } = await fixture(page, model);
  const other = await createPreparedContext(browser);
  const post = (client: typeof page.request, action: string, data: unknown) =>
    client.post(`${path}/${action}`, { headers: { origin: app.origin }, data });
  try {
    expect(
      (await post(page.request, 'save', { version: 1, operationId: 'baseline' })).status(),
    ).toBe(200);
    app.setIdentity(robin);
    await signIn(other.request, app.origin);
    const { user } = await (await other.request.get(`${app.origin}/api/bootstrap`)).json();
    const { code } = await (
      await page.request.post(`${path.replace('/map', '')}/invitations`, {
        headers: { origin: app.origin },
        data: { userId: user.id },
      })
    ).json();
    expect(
      (
        await other.request.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code },
        })
      ).status(),
    ).toBe(200);
    for (const [client, name] of [
      [page.request, 'Lo Lind'],
      [other.request, 'Lo Berg'],
    ] as const) {
      const current: MapState = await (await client.get(path)).json();
      expect(
        (
          await post(client, 'draft', {
            version: current.draft.version,
            contentVersion: current.contentVersion,
            id: 'lo',
            baseRevision: current.objects[0].revision,
            value: { ...value, name },
          })
        ).status(),
      ).toBe(200);
    }
    const changed: MapState = await (await other.request.get(path)).json();
    expect(
      (
        await post(other.request, 'save', {
          version: changed.draft.version,
          operationId: 'other-choice',
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await startConversationWithText(page);
    await send(page, 'Hjälp mig välja vilket namn vi ska behålla.');
    await expect(textView(page)).toContainText(conflictQuestion);
    const current = JSON.parse(
      String(model.requests[0].input.findLast((row) => row.role === 'user')?.content),
    );
    expect(current.draft.conflicts).toHaveLength(1);
    await expect(page.getByText('Utkastet har konflikter', { exact: false })).toHaveCount(0);
    await expect(voiceBox(page)).toHaveCount(0);
    expect((await (await page.request.get(path)).json()).objects[0].name).toBe('Lo Berg');
    await readVoiceProposal(page, 'Lo Lind', null);
    const savedReader = await other.newPage();
    await savedReader.goto(app.origin);
    const savedLo = await readTableObject(savedReader, 'Lo Berg');
    await expect(
      savedLo
        .locator('dt')
        .filter({ hasText: /^Namn$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveText('Lo Berg');
    await expect(
      savedLo.locator('dt').filter({ hasText: /^Typ$/ }).locator('..').locator('dd'),
    ).toHaveText('Person');
    await expect(
      savedLo
        .locator('dt')
        .filter({ hasText: /^Beskrivning$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveCount(0);
  } finally {
    await other.close();
    await app.close();
  }
});

for (const mode of ['tal', 'text'] as const)
  test(`${mode === 'tal' ? 'FRAGA-03' : 'FRAGA-07'}: en fråga från ${mode} som sagts med rösten väntar kvar med mikrofonen av`, async ({
    page,
  }) => {
    let turn = 0;
    const model = textModel(() =>
      turn++ === 0
        ? [modelTool('ask_questions', { questions: [question] })]
        : [modelMessage('Tack, nu vet jag vilken Lo du menar.')],
    );
    const { app, live, responses, views } = await fixture(page, model, true);
    try {
      await startConversationWithVoice(page);
      await expect(voiceBox(page)).toHaveText('Lyssnar');
      if (mode === 'tal') speak(live, 'Vilken Lo avses?');
      else {
        await openConversationText(page);
        await send(page, 'Vilken Lo avses?');
        await closeConversationText(page);
      }
      await waitForResponse(live);
      await expect.poll(() => responses.at(-1)?.response?.questionPending).toBe(true);
      await expect.poll(() => views.at(-1)?.questionPending).toBe(true);
      await sound(page, true);
      await expect(voiceBox(page)).toContainText('Skyttel talar');
      await output(page, question);
      await sound(page, false);
      await expect(voiceBox(page)).toHaveText('Väntar på ditt svar');
      await expect(voiceAnnouncement(page)).not.toContainText('Väntar på ditt svar');
      await expect(textView(page)).toHaveCount(0);
      await microphoneButton(page).click();
      await expect(voiceBox(page)).toHaveText('Väntar på ditt svar');
      await expect(voiceBox(page).locator('.voice-wave')).toHaveAttribute('data-form', 'dimmed');
      await expect(microphoneButton(page)).toHaveAttribute('aria-pressed', 'false');
      await openConversationText(page);
      await expect(textView(page)).toContainText(question);
      await send(page, 'Det är Lo Exempel som avses.');
      await expect(textView(page)).toContainText('Tack, nu vet jag');
      await expect(voiceBox(page)).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

function saveModel() {
  return textModel((request) => {
    const draft = JSON.parse(
      String(request.input.findLast((row) => row.role === 'user')?.content),
    ).draft;
    return [
      modelTool('save_draft', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        operationId: 'model-save',
      }),
    ];
  });
}

test('FRAGA-04: ett verifierat Sparat väntar på hela ordet och ljudet innan fyra sekunder börjar', async ({
  page,
}) => {
  await page.clock.install();
  const { app, live, path, responses } = await fixture(page, saveModel());
  // Keep the original intermittent failure diagnosable across the independent
  // browser clock and real audio clock without recording conversation content.
  await page
    .evaluate(() => {
      const timeline: unknown[] = [];
      let droppedEvents = 0;
      const record = (event: string, characters?: number) => {
        if (timeline.length === 128) {
          timeline.shift();
          droppedEvents++;
        }
        timeline.push({
          event,
          characters,
          browserPerformanceMs: performance.now(),
          browserDateMs: Date.now(),
          audioContexts: window.skyttelVoiceFixture.diagnostics().contexts,
        });
      };
      const emit = window.skyttelVoiceFixture.emit;
      window.skyttelVoiceFixture.emit = (event) => {
        emit(event);
        if (event.type === 'session.output_transcript.delta')
          record('output-transcript-dispatched', String(event.delta ?? '').length);
      };
      let status = '';
      const observer = new MutationObserver(() => {
        const text = document.querySelector('[aria-label="Röstruta"]')?.textContent ?? '';
        const next =
          ['Skyttel arbetar', 'Skyttel talar', 'Sparat', 'Rösten startar', 'Lyssnar'].find((word) =>
            text.includes(word),
          ) ?? 'other';
        if (status !== next) {
          status = next;
          record(`voice-status:${status}`);
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      Object.assign(window, {
        finishSaveAcknowledgementTimeline: () => {
          observer.disconnect();
          window.skyttelVoiceFixture.emit = emit;
          return {
            timeSources: window.skyttelVoiceFixture.diagnostics().timeSources,
            timeline,
            droppedEvents,
          };
        },
      });
    })
    .catch(() => {});
  const advanceUntilStatus = async (status: string) => {
    // AudioContext uses real time; step the paused activity sampler until the
    // actual playback transition is observed, then measure its timeout exactly.
    await expect
      .poll(async () => {
        await page.clock.runFor(50);
        return (await voiceBox(page).innerText()).includes(status);
      })
      .toBe(true);
  };
  try {
    await startConversationWithVoice(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    speak(live, 'Spara hela utkastet.');
    await waitForResponse(live);
    await expect.poll(() => responses.at(-1)?.response?.receiptOperationId).toBeTruthy();
    await expect(page.locator('.draft-save-toast')).toHaveText('Utkastet är sparat');
    await expect(page.locator('.draft-save-toast')).toBeVisible();
    const announcement = page.getByRole('status', { name: 'Sparbekräftelse' });
    await expect(announcement).toHaveText('Utkastet är sparat');
    await expect(announcement).toHaveAttribute('aria-live', 'polite');
    const spokenEvent = commentary(live).at(-1)?.event;
    if (spokenEvent?.type !== 'session.commentary.append')
      throw new Error('Missing verified spoken save reply');
    const spokenReply = spokenEvent.content;
    // Recovery can verify the same committed save before voice work completes.
    // Replay the complete actual reply, including that explanation when present.
    expect([
      'Sparat.',
      'Kontrollen visar att hela utkastet sparades. Ändringarna finns i hushållets karta. Sparat.',
    ]).toContain(spokenReply);
    await expect.poll(() => responses.at(-1)?.response?.text).toBe(spokenReply);
    const operations = await (await page.request.get(`${path}/operations`)).json();
    expect(operations.operations[0]).toMatchObject({
      status: 'succeeded',
      receipt: { operationId: operations.operations[0].operationId },
    });
    // An early pause after the first part cannot complete the acknowledgement.
    await sound(page, true);
    await expect(voiceBox(page)).toContainText('Skyttel talar');
    await output(page, spokenReply.slice(0, -3));
    await sound(page, false);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    // The final transcript arrives before its audio starts. No four-second timeout yet.
    await output(page, 'at.');
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
    await page.clock.runFor(4500);
    await expect(voiceBox(page)).not.toContainText('Sparat');
    await sound(page, true);
    await advanceUntilStatus('Skyttel talar');
    await expect(voiceBox(page)).toContainText('Skyttel talar');
    await page.clock.runFor(4500);
    await expect(voiceBox(page)).toContainText('Skyttel talar');
    await sound(page, false);
    await advanceUntilStatus('Sparat');
    await expect(voiceBox(page)).toHaveText('Sparat');
    await expect(voiceAnnouncement(page)).not.toHaveText('Sparat');
    await expect(voiceBox(page).locator('.voice-saved')).toHaveAttribute('aria-hidden', 'true');
    await expect(textView(page)).toHaveCount(0);
    await page.clock.runFor(3000);
    await expect(voiceBox(page)).toHaveText('Sparat');
    await page.clock.runFor(1000);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await page.clock.resume();
    await openConversationText(page);
    await expect(textView(page)).toContainText('Sparat.');
    const history = await openSavedHistory(page);
    await expect(history.getByRole('article')).toHaveCount(1);
    await expect(history).toContainText('Lo Exempel');
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(
      history.locator('.history-changes').getByText('Objekttyp: Person.', { exact: true }),
    ).toBeVisible();
    await expect(
      history.locator('.history-changes').getByText('Inga egenskaper.', { exact: true }),
    ).toBeVisible();
    await expect(
      history.locator('.history-changes').getByText('Namn: Lo Exempel.', { exact: true }),
    ).toBeVisible();
    expect((await (await page.request.get(path)).json()).objects).toHaveLength(1);
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    const savedLo = await readTableObject(page, 'Lo Exempel');
    await expect(
      savedLo
        .locator('dt')
        .filter({ hasText: /^Namn$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveText('Lo Exempel');
    await expect(
      savedLo.locator('dt').filter({ hasText: /^Typ$/ }).locator('..').locator('dd'),
    ).toHaveText('Person');
    await expect(
      savedLo
        .locator('dt')
        .filter({ hasText: /^Beskrivning$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveCount(0);
  } finally {
    try {
      await test.info().attach('save-acknowledgement-timeline', {
        body: JSON.stringify(
          await page.evaluate(() =>
            (
              window as unknown as { finishSaveAcknowledgementTimeline(): unknown }
            ).finishSaveAcknowledgementTimeline(),
          ),
        ),
        contentType: 'application/json',
      });
    } catch {
      // An unavailable diagnostic must not replace the original test result.
    }
    await app.close();
  }
});

test('FRAGA-05: stopp under det verifierade sparbeskedet startar de fyra sekunderna från avbrottet', async ({
  page,
}) => {
  await page.clock.install();
  const { app, live, responses } = await fixture(page, saveModel());
  try {
    await startConversationWithVoice(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    speak(live, 'Spara hela utkastet.');
    await waitForResponse(live);
    await expect.poll(() => responses.at(-1)?.response?.receiptOperationId).toBeTruthy();
    await expect(page.getByRole('status', { name: 'Sparbekräftelse' })).toContainText(
      'Utkastet är sparat',
    );
    await sound(page, true);
    await expect(voiceBox(page)).toContainText('Skyttel talar');
    await output(page, 'Spar');
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
    await page.clock.runFor(700);
    await voiceBox(page).getByRole('button', { name: 'Avbryt', exact: true }).click();
    await expect(voiceBox(page)).toHaveText('Sparat');
    await expect(voiceAnnouncement(page)).not.toHaveText('Sparat');
    await expect(textView(page)).toHaveCount(0);
    await page.clock.runFor(3000);
    await expect(voiceBox(page)).toHaveText('Sparat');
    await page.clock.runFor(1000);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await page.clock.resume();
    const history = await openSavedHistory(page);
    await expect(history.getByRole('article')).toHaveCount(1);
    await history.getByText('Visa ändringarna', { exact: true }).click();
    await expect(
      history.locator('.history-changes').getByText('Namn: Lo Exempel.', { exact: true }),
    ).toBeVisible();
    await expect(
      history.locator('.history-changes').getByText('Objekttyp: Person.', { exact: true }),
    ).toBeVisible();
    await expect(
      history.locator('.history-changes').getByText('Inga egenskaper.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).click();
    const savedLo = await readTableObject(page, 'Lo Exempel');
    await expect(
      savedLo
        .locator('dt')
        .filter({ hasText: /^Namn$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveText('Lo Exempel');
    await expect(
      savedLo.locator('dt').filter({ hasText: /^Typ$/ }).locator('..').locator('dd'),
    ).toHaveText('Person');
    await expect(
      savedLo
        .locator('dt')
        .filter({ hasText: /^Beskrivning$/ })
        .locator('..')
        .locator('dd'),
    ).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('FRAGA-06: providertext som säger Sparat utan beständigt kvitto ger inget grönt sparbesked', async ({
  page,
}) => {
  const { app, live, path } = await fixture(
    page,
    textModel(() => [modelMessage('Sparat.')]),
  );
  try {
    await startConversationWithVoice(page);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    speak(live, 'Berätta om utkastet.');
    await waitForResponse(live);
    await sound(page, true);
    await expect(voiceBox(page)).toContainText('Skyttel talar');
    await output(page, 'Sparat.');
    await sound(page, false);
    await expect(voiceBox(page)).toHaveText('Lyssnar');
    await expect(voiceBox(page).locator('.voice-saved')).toHaveCount(0);
    expect((await (await page.request.get(`${path}/operations`)).json()).operations).toEqual([]);
    expect((await (await page.request.get(path)).json()).objects).toEqual([]);
    await readVoiceProposal(page, 'Lo Exempel', null);
    const history = await openSavedHistory(page);
    await expect(history.getByRole('article')).toHaveCount(0);
    await page.getByRole('button', { name: 'Tillbaka till arbetet', exact: true }).focus();
    await page.keyboard.press('Enter');
  } finally {
    await app.close();
  }
});
