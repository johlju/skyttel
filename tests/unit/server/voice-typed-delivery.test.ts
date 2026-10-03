import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
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
    const spoken = () =>
      live.sent
        .filter(({ event }) => event.type === 'session.commentary.append')
        .map(({ event }) => (event.type === 'session.commentary.append' ? event.content : ''))
        .join('');
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

test('a long typed answer reaches the voice intact in bounded UTF-8 commentary without truncating multibyte words', async () => {
  const answer = `Ett långt svar: ${'Åäö och cykeln 🚲. '.repeat(100)}`;
  const { live, send, poll } = await arrange(textModel(() => [modelMessage(answer)]).provider);
  await send('Beskriv allt.', 'long-reply');
  const result = await poll(true);
  const parts = live.sent.flatMap(({ event }) =>
    event.type === 'session.commentary.append' ? [event.content] : [],
  );
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
  expect(
    live.sent
      .filter(({ event }) => event.type === 'session.commentary.append')
      .map(({ event }) => (event.type === 'session.commentary.append' ? event.content : '')),
  ).toEqual([`Nödvändig fråga (samtalsdata): ${JSON.stringify(question)}`]);
  expect(await (await browser.get(`${householdPath}/map`)).json()).toEqual(before);
  expect((await (await browser.get(`${householdPath}/map/history`)).json()).history).toEqual([]);
});
