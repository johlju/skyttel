import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider, voiceAnswerParts } from '../../support/live-provider.js';
import {
  failExplanation,
  modelMessage,
  modelTool,
  pendingUpdate,
  textModel,
} from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});
async function arrange(
  modelFetch: typeof fetch,
  assistantDispatch?: NonNullable<Parameters<typeof createInstallation>[1]>['assistantDispatch'],
) {
  const live = liveProvider();
  app = await createInstallation(undefined, {
    modelFetch,
    liveFetch: live.provider,
    liveSideband: live.attach,
    assistantDispatch,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const householdPath = `${app.origin}/api/households/${household.id}`;
  const base = `${householdPath}/text-assistant`;
  const post = (url: string, data: unknown = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  const start = await post(base, approvedForVisit);
  expect(start.status()).toBe(201);
  let current: TextAssistantView = await start.json();
  const path = `${base}/${current.id}`;
  const voice = await post(`${path}/voice`, {
    sdp: 'synthetic-offer',
    revision: 0,
    draftVersion: current.review.version,
    contentVersion: current.review.contentVersion,
  });
  expect(voice.status(), await voice.text()).toBe(201);
  const voiceId = (await voice.json()).voice.id;
  return {
    live,
    path,
    householdPath,
    post,
    async send(text: string, requestId: string) {
      const response = await post(`${path}/messages`, {
        revision: current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
        text,
        requestId,
      });
      expect(response.status(), await response.text()).toBe(202);
      await expect
        .poll(
          async () => {
            current = await (await browser.get(path)).json();
            return current.phase;
          },
          { timeout: 10000 },
        )
        .not.toBe('working');
      return current;
    },
    async poll(microphoneOn: boolean, microphoneActive = false, speakerActive = false) {
      current = await (await browser.get(path)).json();
      const response = await post(`${path}/voice/${voiceId}/poll`, {
        revision: current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
        microphoneOn,
        microphoneActive,
        speakerActive,
      });
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    },
  };
}

test.each([true, false])(
  'typed replies are consumed once with microphone ON=%s, and turning it on never replays OFF replies',
  async (on) => {
    let turn = 0;
    const model = textModel(() => [
      modelMessage(++turn === 1 ? 'Första svaret.' : 'Nästa svaret.'),
    ]);
    const { live, send, poll } = await arrange(model.provider);
    await send('Vad vet vi?', 'first');
    await expect
      .poll(async () => (await poll(on)).voice.replyDelivery)
      .toContainEqual({ id: 'first', voiced: on });
    const spoken = () => voiceAnswerParts(live.sent).join('');
    expect(spoken()).toBe(on ? 'Samtal (obekräftat): "Första svaret."' : '');
    await poll(true);
    expect(spoken()).toBe(on ? 'Samtal (obekräftat): "Första svaret."' : '');
    await send('Fortsätt.', 'next');
    const next = await poll(true);
    await expect
      .poll(async () => (await poll(true)).voice.replyDelivery)
      .toContainEqual({ id: 'next', voiced: true });
    expect(next.voice.response).toMatchObject({ text: 'Nästa svaret.', questionPending: false });
    expect(spoken()).toContain('Samtal (obekräftat): "Nästa svaret."');
    expect(spoken().split('Nästa svaret.')).toHaveLength(2);
  },
);

test('a long typed answer reaches the voice intact in bounded silent parts without truncating multibyte words', async () => {
  const answer = `Ett långt svar: ${'Åäö och cykeln 🚲. '.repeat(100)}`;
  const { live, send, poll } = await arrange(textModel(() => [modelMessage(answer)]).provider);
  await send('Beskriv allt.', 'long-reply');
  const result = await poll(true);
  const parts = voiceAnswerParts(live.sent);
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.join('')).toBe(`Samtal (obekräftat): ${JSON.stringify(answer)}`);
  for (const part of parts) {
    expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(480);
    expect(part).not.toContain('�');
  }
  expect(result.voice.response.text).toBe(answer);
  expect(result.assistant.completedReplies).toContainEqual(
    expect.objectContaining({ id: 'long-reply', text: answer, source: 'text' }),
  );
});

test('speaker activity holds an acknowledged typed reply until the preceding answer finishes', {
  tags: ['technical'],
}, async () => {
  const { live, send, poll } = await arrange(
    textModel(() => [modelMessage('Nästa svar.')]).provider,
  );
  await send('Fortsätt.', 'queued');
  const pending = await poll(true, false, true);
  expect(pending.assistant.completedReplies).toContainEqual(
    expect.objectContaining({ id: 'queued', text: 'Nästa svar.' }),
  );
  expect(pending.voice.replyDelivery).toBeUndefined();
  // A second poll observes the asynchronous thinking acknowledgements.
  expect((await poll(true, false, true)).voice.replyDelivery).toBeUndefined();
  expect(live.sent.some(({ event }) => event.type === 'session.instructions.append')).toBe(false);
  const released = await poll(true, false, false);
  expect(released.voice.replyDelivery).toEqual([{ id: 'queued', voiced: true }]);
  expect(
    live.sent.filter(({ event }) => event.type === 'session.instructions.append'),
  ).toHaveLength(1);
  await poll(true);
  expect(
    live.sent.filter(({ event }) => event.type === 'session.instructions.append'),
  ).toHaveLength(1);
});

test('necessary typed questions are explicit, unchanged conversation data and do not mutate or save the map', async () => {
  const question = 'Vilken av Alex två cyklar menar du?';
  const { live, householdPath, send, poll } = await arrange(
    textModel(() => [modelTool('ask_questions', { questions: [question] })]).provider,
  );
  const before = await (await browser.get(`${householdPath}/map`)).json();
  const current = await send('Rätta cykeln.', 'question');
  expect(current).toMatchObject({
    questionPending: true,
    questions: [question],
    modelReply: question,
    completedReplies: [
      expect.objectContaining({ id: 'question', source: 'text', questionPending: true }),
    ],
  });
  expect(current.receipt).toBeUndefined();
  const result = await poll(true);
  expect(result.voice.response).toMatchObject({ text: question, questionPending: true });
  expect(voiceAnswerParts(live.sent).join('')).toBe(
    `Nödvändig fråga (samtalsdata): ${JSON.stringify(question)}`,
  );
  expect(await (await browser.get(`${householdPath}/map`)).json()).toEqual(before);
  expect((await (await browser.get(`${householdPath}/map/history`)).json()).history).toEqual([]);
});

test('a spoken clarification reaches a typed pending question without a Live delegation', {
  tags: ['technical'],
}, async () => {
  const model = textModel((request) =>
    model.requests.length === 1
      ? [modelTool('ask_questions', { questions: ['Vilken cykel menar du?'] })]
      : model.requests.length === 2
        ? [
            modelTool('ask_questions', {
              questions: [],
              updates: [pendingUpdate(request, 'Vilken cykel menar du?')],
              continueResponse: true,
            }),
          ]
        : [modelMessage('Jag menar nu den gröna cykeln.')],
  );
  const { live, path, householdPath, send, poll } = await arrange(model.provider);
  const before = await (await browser.get(`${householdPath}/map`)).json();
  await send('Vilken cykel talar vi om?', 'question');
  await poll(true);
  const providerId = [...live.channels.keys()][0];
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'clarification',
    delta: 'Den gröna cykeln.',
    start_ms: 1000,
    end_ms: 2000,
  });
  await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(3);
  await expect.poll(async () => (await (await browser.get(path)).json()).phase).toBe('ready');
  expect(JSON.stringify(model.requests[1])).toContain('Den gröna cykeln.');
  const completed: TextAssistantView = await (await browser.get(path)).json();
  expect(completed.questionPending).toBe(false);
  expect(completed.completedReplies).toContainEqual(expect.objectContaining({ source: 'voice' }));
  live.emit(providerId, {
    type: 'session.delegation.created',
    event_id: 'late-delegation',
    offset_ms: 2500,
    delegation: { id: 'late-task', type: 'delegation', target: 'client' },
  });
  await poll(true);
  expect(model.requests).toHaveLength(3);
  expect(await (await browser.get(`${householdPath}/map`)).json()).toEqual(before);
  expect((await (await browser.get(`${householdPath}/map/history`)).json()).history).toEqual([]);
});

test('an automatic voice answer survives an independent typed turn with the same question', {
  tags: ['technical'],
  timeout: 10000,
}, async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async (request) => {
    if (model.requests.length === 1)
      return [modelTool('ask_questions', { questions: ['Vilken cykel menar du?'] })];
    if (model.requests.length === 2) {
      await held;
      return [modelMessage('Utkastet är tomt.')];
    }
    if (model.requests.length === 3)
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [pendingUpdate(request, 'Vilken cykel menar du?')],
          continueResponse: true,
        }),
      ];
    return [modelMessage('Jag menar nu den gröna cykeln.')];
  });
  const { live, path, send, poll } = await arrange(model.provider);
  await send('Vilken cykel talar vi om?', 'question');
  await poll(true);
  const independent = send('Vad finns i utkastet?', 'independent');
  try {
    await expect.poll(() => model.requests.length).toBe(2);
    live.emit([...live.channels.keys()][0], {
      type: 'session.input_transcript.delta',
      event_id: 'overlapping-answer',
      delta: 'Den gröna cykeln.',
      start_ms: 1000,
      end_ms: 2000,
    });
    release();
    await independent;
    await poll(true);
    await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(4);
    await expect
      .poll(async () => (await (await browser.get(path)).json()).questionPending)
      .toBe(false);
  } finally {
    release();
    await independent;
  }
});

test('rejecting a stale spoken answer before admission leaves a newer typed task running', {
  tags: ['technical'],
  timeout: 10000,
}, async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async (request) => {
    if (model.requests.length === 1)
      return [modelTool('ask_questions', { questions: ['Vilken cykel?'] })];
    if (model.requests.length === 2)
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [
            pendingUpdate(request, 'Vilken cykel?', {
              action: 'rephrase',
              question: 'Vilken färg har cykeln?',
            }),
          ],
        }),
      ];
    await held;
    return [modelMessage('Det nyare uppdraget är klart.')];
  });
  let reads = 0;
  let watching = false;
  const { live, path, send, poll } = await arrange(model.provider, async (request, dispatch) => {
    if (
      watching &&
      request.method === 'GET' &&
      /\/text-assistant\/[^/]+$/.test(new URL(request.url).pathname)
    )
      reads++;
    return dispatch(request);
  });
  await send('Ändra cykeln.', 'question');
  await poll(true);
  live.emit([...live.channels.keys()][0], {
    type: 'session.input_transcript.delta',
    event_id: 'stale-local-answer',
    delta: 'Den gröna.',
    start_ms: 1000,
    end_ms: 2000,
  });
  await send('Förtydliga frågan.', 'rephrase');
  const newer = send('Beskriv också utkastet.', 'newer');
  try {
    await expect.poll(() => model.requests.length).toBe(3);
    watching = true;
    await expect.poll(() => reads, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => voiceAnswerParts(live.sent).join(''))
      .toContain('Den väntande delen har ändrats.');
    const current = await (await browser.get(path)).json();
    expect(current.phase).toBe('working');
    expect(current.questions).toEqual(['Vilken färg har cykeln?']);
    expect(current.tasks.find((task: { id: string }) => task.id === 'newer').status).toBe(
      'working',
    );
    release();
    expect((await newer).modelReply).toBe('Det nyare uppdraget är klart.');
    expect(model.requests).toHaveLength(3);
  } finally {
    release();
    await newer;
  }
});

test('speech spanning different question revisions reports rejection without reaching the model', {
  tags: ['technical'],
  timeout: 10000,
}, async () => {
  const model = textModel((request) =>
    model.requests.length === 1
      ? [modelTool('ask_questions', { questions: ['Vilken cykel?'] })]
      : [
          modelTool('ask_questions', {
            questions: [],
            updates: [
              pendingUpdate(request, 'Vilken cykel?', {
                action: 'rephrase',
                question: 'Vilken färg har cykeln?',
              }),
            ],
          }),
        ],
  );
  const { live, path, send, poll } = await arrange(model.provider);
  await send('Ändra cykeln.', 'question');
  await poll(true, true);
  const providerId = [...live.channels.keys()][0];
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'before-rephrase',
    delta: 'Den gröna',
    start_ms: 1000,
    end_ms: 1500,
  });
  const rephrased = await send('Förtydliga frågan.', 'rephrase');
  await poll(true, true);
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'after-rephrase',
    delta: ' cykeln.',
    start_ms: 1500,
    end_ms: 2000,
  });
  live.emit(providerId, {
    type: 'session.delegation.created',
    event_id: 'mixed-delegation',
    offset_ms: 2000,
    delegation: { id: 'mixed-task', type: 'delegation', target: 'client' },
  });
  await poll(true);
  await expect
    .poll(() => voiceAnswerParts(live.sent).join(''), { timeout: 5000 })
    .toContain('Den väntande delen har ändrats.');
  const current = await (await browser.get(path)).json();
  expect(current.pendingParts).toEqual(rephrased.pendingParts);
  expect(current.phase).toBe('ready');
  expect(model.requests).toHaveLength(2);
});

test('delegated old-question speech cannot resolve a replacement queued ahead of it', {
  tags: ['technical'],
  timeout: 10000,
}, async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async (request) => {
    const input = JSON.parse(
      String(request.input.findLast((item) => item.role === 'user')?.content),
    );
    if (model.requests.length === 1)
      return [modelTool('ask_questions', { questions: ['Vilken cykel?'] })];
    if (model.requests.length === 2) {
      await held;
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [
            pendingUpdate(request, 'Vilken cykel?', {
              action: 'replace',
              replacement: {
                kind: 'change',
                request: 'Ändra hjälmen',
                question: 'Vilken hjälm?',
                dependsOnDraft: true,
              },
            }),
          ],
        }),
      ];
    }
    const part = input.pendingParts.find((part: { status: string }) => part.status === 'waiting');
    return [
      modelTool('ask_questions', {
        questions: [],
        updates: [
          {
            id: part.id,
            revision: part.revision,
            action: 'clarify',
            messageId: input.messageId,
            evidence: input.message,
          },
        ],
      }),
    ];
  });
  const { live, path, send, poll } = await arrange(model.provider);
  await send('Ändra cykeln.', 'question');
  await poll(true);
  const replacement = send('Ändra hjälmen i stället.', 'replacement');
  try {
    await expect.poll(() => model.requests.length).toBe(2);
    const providerId = [...live.channels.keys()][0];
    live.emit(providerId, {
      type: 'session.input_transcript.delta',
      event_id: 'old-answer',
      delta: 'Den gröna.',
      start_ms: 1000,
      end_ms: 2000,
    });
    live.emit(providerId, {
      type: 'session.delegation.created',
      event_id: 'old-answer-delegation',
      offset_ms: 2000,
      delegation: { id: 'old-answer-task', type: 'delegation', target: 'client' },
    });
    await expect
      .poll(async () => (await (await browser.get(path)).json()).queuedMessages, { timeout: 5000 })
      .toBe(1);
    release();
    await replacement;
    await expect
      .poll(async () => (await (await browser.get(path)).json()).phase)
      .not.toBe('working');
    expect(model.requests).toHaveLength(2);
    const current = await (await browser.get(path)).json();
    expect(current.questions).toEqual(['Vilken hjälm?']);
  } finally {
    release();
    await replacement;
  }
});

const sharesTypeProposal = {
  name: 'propose_relationship_type',
  arguments: {
    id: 'shares',
    baseRevision: null,
    value: {
      name: 'Delar',
      description: '',
    },
  },
};

test('a typed partial change delivers its verified result and full follow-up to voice once', {
  tags: ['technical'],
}, async () => {
  const question = 'Vilken cykel menar du?';
  const { live, householdPath, send, poll } = await arrange(
    textModel(() => [
      modelTool('submit_changes', {
        version: 0,
        contentVersion: 1,
        completion: 'draft',
        questions: [question],
        operations: [sharesTypeProposal],
      }),
    ]).provider,
  );
  const current = await send('Lägg till sambandstypen Delar och rätta cykeln. Spara.', 'partial');
  expect(current.result).toEqual({
    kind: 'draft',
    message: 'Utkastet är uppdaterat.',
    changes: [{ subject: 'Sambandstypen Delar', action: 'lades till' }],
  });
  expect(current.questionPending).toBe(true);
  expect(current.modelReply).toContain(question);
  expect(current.modelReply).toBe(question);
  expect(current.requiredNotice).toBe(
    'Din tidigare sparbegäran gäller inte längre. Be om sparande igen när frågorna är lösta.',
  );
  expect(current.reply).toContain(current.requiredNotice);
  expect(current.receipt).toBeUndefined();
  const result = await poll(true);
  const parts = () => voiceAnswerParts(live.sent);
  const content = parts().join('');
  expect(content).toBe(
    `Obligatoriskt besked från Skyttel: ${current.requiredNotice}\nSkyttels resultat (verifierat): Utkastet är uppdaterat.\nSambandstypen Delar lades till.\nNödvändig fråga (samtalsdata): ${JSON.stringify(current.modelReply)}`,
  );
  expect(result.voice.response).toMatchObject({
    text: `${current.requiredNotice}\nUtkastet är uppdaterat.\nSambandstypen Delar lades till.\n${current.modelReply}`,
    questionPending: true,
  });
  await poll(true);
  expect(parts().join('')).toBe(content);
  expect((await (await browser.get(`${householdPath}/map/history`)).json()).history).toEqual([]);
});

test('a failed typed completion delivers its own question before a later task question', {
  tags: ['technical'],
}, async () => {
  const question = 'Vilken cykel menar du?';
  const laterQuestion = 'Vilken hjälm menar du?';
  const firstRequest =
    'Lägg till sambandstypen Delar, rätta cykeln och förklara typen. Spara inte.';
  const model = textModel(() =>
    model.requests.length === 1
      ? [
          modelTool('submit_changes', {
            version: 0,
            contentVersion: 1,
            completion: 'draft',
            continueResponse: true,
            questions: [
              { kind: 'change', request: 'Rätta cykeln.', question, dependsOnDraft: false },
            ],
            operations: [sharesTypeProposal],
          }),
        ]
      : [
          modelTool('ask_questions', {
            questions: [
              {
                kind: 'change',
                request: 'Lägg till hjälmen.',
                question: laterQuestion,
                dependsOnDraft: false,
              },
            ],
          }),
        ],
  );
  const provider = failExplanation(
    model,
    () => Response.json({ error: { message: 'Controlled explanation outage.' } }, { status: 503 }),
    (body) =>
      model.requests.length === 1 &&
      JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content)).message ===
        firstRequest,
  );
  let providerCalls = 0;
  const { live, path, householdPath, post, send, poll } = await arrange(async (input, init) => {
    providerCalls++;
    return provider(input, init);
  });
  const failed = await send(firstRequest, 'failed-partial');
  expect(failed).toMatchObject({
    phase: 'error',
    error: 'assistant_model_temporary',
    questionPending: true,
    newQuestions: [question],
    result: { kind: 'draft', changes: [{ subject: 'Sambandstypen Delar', action: 'lades till' }] },
  });
  expect(failed.modelReply).toBeUndefined();
  expect(failed.receipt).toBeUndefined();
  const failedCalls = providerCalls;
  const queued = await send('Lägg till hjälmen utan att spara.', 'later-question');
  expect(queued).toMatchObject({
    phase: 'error',
    workFailure: { requestId: 'failed-partial', code: 'assistant_model_temporary' },
    queuedMessages: 1,
    queuedRequests: [{ id: 'later-question', text: 'Lägg till hjälmen utan att spara.' }],
    newQuestions: [question],
  });
  expect(queued.completedReplies).toContainEqual(
    expect.objectContaining({ id: 'failed-partial', failed: true, newQuestions: [question] }),
  );
  await expect
    .poll(async () => (await poll(true)).voice.replyDelivery)
    .toContainEqual({ id: 'failed-partial', voiced: true });
  const firstSpoken = voiceAnswerParts(live.sent).join('');
  expect(firstSpoken).toContain('Sambandstypen Delar lades till.');
  expect(firstSpoken).toContain(`Obligatoriskt besked från Skyttel: ${failed.reply}`);
  expect(firstSpoken).toContain(`Nödvändig fråga (samtalsdata): ${JSON.stringify(question)}`);
  expect(firstSpoken).not.toContain(laterQuestion);
  await poll(true);
  expect(voiceAnswerParts(live.sent).join('')).toBe(firstSpoken);
  expect(providerCalls).toBe(failedCalls);

  const current: TextAssistantView = await (await browser.get(path)).json();
  const abandoned = await post(`${path}/abandon-work`, {
    revision: current.revision,
    requestId: 'failed-partial',
  });
  expect(abandoned.status(), await abandoned.text()).toBe(202);
  await expect
    .poll(async () => {
      const view: TextAssistantView = await (await browser.get(path)).json();
      return [view.phase, view.queuedMessages];
    })
    .toEqual(['ready', 0]);
  const later: TextAssistantView = await (await browser.get(path)).json();
  expect(later.workFailure).toBeUndefined();
  expect(later.questions).toEqual([laterQuestion]);
  expect(later.newQuestions).toEqual([laterQuestion]);
  expect(later.review).toEqual(failed.review);
  expect(later.receipt).toBeUndefined();
  expect(model.requests).toHaveLength(2);
  await expect
    .poll(async () => (await poll(true)).voice.replyDelivery)
    .toContainEqual({ id: 'later-question', voiced: true });
  const spoken = voiceAnswerParts(live.sent).join('');
  expect(spoken.startsWith(firstSpoken)).toBe(true);
  expect(spoken).toContain(`Nödvändig fråga (samtalsdata): ${JSON.stringify(laterQuestion)}`);
  expect(spoken.split('Sambandstypen Delar lades till.')).toHaveLength(2);
  expect(spoken.split(`Obligatoriskt besked från Skyttel: ${failed.reply}`)).toHaveLength(2);
  expect(spoken.split(JSON.stringify(question))).toHaveLength(2);
  expect(spoken.split(JSON.stringify(laterQuestion))).toHaveLength(2);
  await poll(true);
  expect(voiceAnswerParts(live.sent).join('')).toBe(spoken);
  expect((await (await browser.get(`${householdPath}/map/history`)).json()).history).toEqual([]);
});
