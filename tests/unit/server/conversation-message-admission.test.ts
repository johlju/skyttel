import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let path: string;
let release = () => {};
afterEach(async () => {
  release();
  await browser?.dispose();
  await app?.close();
});
async function setup(modelFetch: typeof fetch): Promise<TextAssistantView> {
  app = await createInstallation(undefined, { modelFetch });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const response = await post(path, approvedForVisit);
  expect(response.status()).toBe(201);
  const session = await response.json();
  path = `${path}/${session.id}`;
  return session;
}
const post = (url: string, data: object = {}) =>
  browser.post(url, { headers: { origin: app.origin }, data });
function message(session: TextAssistantView, requestId: string) {
  return {
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    requestId,
    text: `Förklara uppgift ${requestId}.`,
  };
}
async function completed(requestId: string): Promise<TextAssistantView> {
  let result!: TextAssistantView;
  await expect
    .poll(
      async () => {
        result = await (await browser.get(`${path}/messages/${requestId}`)).json();
        return result.taskStatus;
      },
      { interval: 10 },
    )
    .toBe('completed');
  return result;
}

test.each([false, true])(
  'a conversation continues beyond 200 completed messages and retains request idempotency, summarized=%s',
  async (summarized) => {
    let turns = 0;
    const model = textModel((body) => {
      if (!body.tools.length) return [modelMessage('Tidigare uppgifter har diskuterats.')];
      turns++;
      return [modelMessage(`Förklaring ${turns}.`)];
    });
    let session = await setup(async (input, init) => {
      const response = await model.provider(input, init);
      if (!summarized || turns !== 100 || !JSON.parse(String(init?.body)).tools.length)
        return response;
      const body = await response.json();
      return Response.json({ ...body, usage: { ...body.usage, input_tokens: 1_040_000 } });
    });
    const first = message(session, 'first');
    const originalReview = session.review;
    for (let index = 0; index < 205; index++) {
      const body = index === 0 ? first : message(session, `turn-${index}`);
      const response = await post(`${path}/messages`, body);
      expect(response.status(), await response.text()).toBe(202);
      session = await completed(body.requestId);
      expect(session.modelReply).toBe(`Förklaring ${index + 1}.`);
    }
    expect(session.completedReplies).toHaveLength(205);
    expect(session.contextGeneration ?? 0).toBe(summarized ? 1 : 0);
    expect(session.review).toEqual(originalReview);
    expect((await post(`${path}/messages`, first)).status()).toBe(202);
    expect(
      (await post(`${path}/messages`, { ...first, text: 'Ett annat uppdrag.' })).status(),
    ).toBe(409);
    expect((await post(`${path}/messages`, message(session, 'first'))).status()).toBe(409);
    expect((await completed('first')).modelReply).toBe('Förklaring 1.');
    expect(turns).toBe(205);
  },
  30_000,
);

test('pending work stays bounded, duplicates keep one queue entry and cancellation releases capacity', async () => {
  let held = true;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async () => {
    if (held) await waiting;
    return [modelMessage('Uppgiften är förklarad.')];
  });
  const session = await setup(model.provider);
  const first = message(session, 'held');
  expect((await post(`${path}/messages`, first)).status()).toBe(202);
  await expect.poll(() => model.requests.length).toBe(1);
  const working = await (await browser.get(path)).json();
  const queued = message(working, 'queued');
  expect((await post(`${path}/messages`, queued)).status()).toBe(202);
  expect((await post(`${path}/messages`, queued)).status()).toBe(202);
  expect((await post(`${path}/messages`, { ...queued, text: 'Ett annat uppdrag.' })).status()).toBe(
    409,
  );
  expect((await (await browser.get(path)).json()).queuedMessages).toBe(1);
  for (let index = 0; index < 198; index++)
    expect((await post(`${path}/messages`, message(working, `pending-${index}`))).status()).toBe(
      202,
    );
  const overflow = await post(`${path}/messages`, message(working, 'overflow'));
  expect(overflow.status()).toBe(409);
  expect(await overflow.json()).toEqual({ error: 'assistant_busy' });
  expect((await (await browser.get(path)).json()).queuedMessages).toBe(199);
  expect((await post(`${path}/messages`, first)).status()).toBe(202);
  expect((await post(`${path}/messages`, queued)).status()).toBe(202);
  const canceled = await (await post(`${path}/cancel`, { all: true })).json();
  expect(canceled.queuedMessages).toBe(0);
  expect((await (await browser.get(`${path}/messages/queued`)).json()).taskStatus).toBe('canceled');
  expect((await post(`${path}/messages`, queued)).status()).toBe(202);
  held = false;
  release();
  expect((await post(`${path}/messages`, message(canceled, 'after-cancel'))).status()).toBe(202);
  expect((await completed('after-cancel')).modelReply).toBe('Uppgiften är förklarad.');
  expect(model.requests).toHaveLength(2);
}, 30_000);
