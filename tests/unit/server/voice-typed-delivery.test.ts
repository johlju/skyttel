import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider, voiceAnswerParts } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});
async function arrange(modelFetch: typeof fetch) {
  const live = liveProvider();
  app = await createInstallation(undefined, {
    modelFetch,
    liveFetch: live.provider,
    liveSideband: live.attach,
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
        .poll(async () => {
          current = await (await browser.get(path)).json();
          return current.phase;
        })
        .not.toBe('working');
      return current;
    },
    async poll(microphoneOn: boolean) {
      current = await (await browser.get(path)).json();
      const response = await post(`${path}/voice/${voiceId}/poll`, {
        revision: current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
        microphoneOn,
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
    const consumed = await poll(on);
    expect(consumed.voice.replyDelivery).toContainEqual({ id: 'first', voiced: on });
    const spoken = () => voiceAnswerParts(live.sent).join('');
    expect(spoken()).toBe(on ? 'Samtal (obekräftat): "Första svaret."' : '');
    await poll(true);
    expect(spoken()).toBe(on ? 'Samtal (obekräftat): "Första svaret."' : '');
    await send('Fortsätt.', 'next');
    const next = await poll(true);
    expect(next.voice.replyDelivery).toContainEqual({ id: 'next', voiced: true });
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
  const model = textModel(() =>
    model.requests.length === 1
      ? [modelTool('ask_questions', { questions: ['Vilken cykel menar du?'] })]
      : model.requests.length === 2
        ? [
            modelTool('ask_questions', {
              questions: [],
              answeredQuestions: ['Vilken cykel menar du?'],
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
        operations: [
          {
            name: 'propose_relationship_type',
            arguments: {
              id: 'shares',
              baseRevision: null,
              value: {
                name: 'Delar',
                description: '',
                forwardLabel: 'delar med',
                reverseLabel: 'delar med',
              },
            },
          },
        ],
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
    `Obligatoriskt besked från Skyttel: ${current.requiredNotice}\nSkyttels resultat (verifierat): Utkastet är uppdaterat.\nNödvändig fråga (samtalsdata): ${JSON.stringify(current.modelReply)}`,
  );
  expect(result.voice.response).toMatchObject({
    text: `${current.reply}\n${current.modelReply}`,
    questionPending: true,
  });
  await poll(true);
  expect(parts().join('')).toBe(content);
  expect((await (await browser.get(`${householdPath}/map/history`)).json()).history).toEqual([]);
});
