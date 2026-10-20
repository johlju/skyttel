import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
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

test('saving waits two seconds after ongoing microphone activity ends', {
  tags: ['technical'],
  timeout: 15_000,
}, async () => {
  const model = textModel((body) => {
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    return [
      modelTool('save_draft', {
        version: turn.draft.version,
        contentVersion: turn.draft.contentVersion,
      }),
    ];
  });
  const live = liveProvider();
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const base = `${app.origin}/api/households/${household.id}`;
  const post = (path: string, data: unknown) =>
    browser.post(`${base}/${path}`, { headers: { origin: app.origin }, data });
  const map = await (await browser.get(`${base}/map`)).json();
  expect(
    (
      await post('map/draft', {
        version: 0,
        contentVersion: 1,
        id: 'retained',
        baseRevision: null,
        value: { typeId: map.types[0].id, name: 'Bevarat förslag' },
      })
    ).status(),
  ).toBe(200);
  const session = await (await post('text-assistant', approvedForVisit)).json();
  const path = `text-assistant/${session.id}`;
  const start = await (
    await post(`${path}/voice`, {
      sdp: 'synthetic-offer',
      revision: 0,
      draftVersion: 1,
      contentVersion: 1,
    })
  ).json();
  const providerId = [...live.channels.keys()][0];
  const poll = async (active: boolean) => {
    const view = await (await browser.get(`${base}/${path}`)).json();
    return (
      await post(`${path}/voice/${start.voice.id}/poll`, {
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
        microphoneOn: true,
        microphoneActive: active,
      })
    ).json();
  };
  await poll(true);
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'save-fragment',
    delta: 'Spara hela utkastet.',
    start_ms: 0,
    end_ms: 1000,
  });
  live.emit(providerId, {
    type: 'session.delegation.created',
    offset_ms: 1000,
    delegation: { id: 'save-task', target: 'client' },
  });
  await new Promise((resolve) => setTimeout(resolve, 2100));
  expect(model.requests).toHaveLength(0);
  expect((await poll(true)).assistant.operations).toEqual([]);
  const endedAt = Date.now();
  await poll(false);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect((await poll(false)).assistant.operations).toEqual([]);
  await expect
    .poll(async () => (await poll(false)).assistant.receipt, { timeout: 5000 })
    .toBeTruthy();
  expect(Date.now() - endedAt).toBeGreaterThanOrEqual(2000);
  const saved = await (await browser.get(`${base}/map`)).json();
  expect(saved.objects).toMatchObject([{ id: 'retained', name: 'Bevarat förslag' }]);
  expect((await (await browser.get(`${base}/map/history`)).json()).history).toHaveLength(1);
});

test.each(['overlapping', 'late'])(
  '%s final speech preserves the whole task and its full requested answer',
  {
    tags: ['technical'],
  },
  async (delivery) => {
    const answer = 'Alex arbete har en inloggningsadress och en separat kontaktadress. '.repeat(20);
    const model = textModel(() => [modelMessage(answer)]);
    const live = liveProvider();
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const base = `${app.origin}/api/households/${household.id}`;
    const initial = await (
      await browser.post(`${base}/text-assistant`, {
        headers: { origin: app.origin },
        data: approvedForVisit,
      })
    ).json();
    const path = `${base}/text-assistant/${initial.id}`;
    const before = await (await browser.get(`${base}/map`)).json();
    const started = await browser.post(`${path}/voice`, {
      headers: { origin: app.origin },
      data: { sdp: 'synthetic-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
    });
    expect(started.status()).toBe(201);
    const providerId = [...live.channels.keys()][0];
    live.emit(providerId, {
      type: 'session.input_transcript.delta',
      event_id: 'overlap',
      delta:
        delivery === 'late'
          ? 'Beskriv alla adressroller för Alex arb'
          : 'Beskriv alla adressroller för Alex arbete.',
      start_ms: 0,
      end_ms: 2000,
    });
    live.emit(providerId, {
      type: 'session.delegation.created',
      offset_ms: 1000,
      delegation: { id: 'overlap-task', target: 'client' },
    });
    if (delivery === 'late') {
      await new Promise((resolve) => setTimeout(resolve, 323));
      expect(model.requests).toHaveLength(0);
      live.emit(providerId, {
        type: 'session.input_transcript.delta',
        event_id: 'late-suffix',
        delta: 'ete.',
        start_ms: 2000,
        end_ms: 2200,
      });
    }
    await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(1);
    const turn = JSON.parse(
      String(model.requests[0].input.findLast((item) => item.role === 'user')?.content),
    );
    expect(turn.message).toBe('Beskriv alla adressroller för Alex arbete.');
    await expect
      .poll(() => voiceAnswerParts(live.sent).join(''), { timeout: 5000 })
      .toContain(JSON.stringify(answer));
    expect(
      live.sent.filter(({ event }) => event.type === 'session.commentary.append'),
    ).toHaveLength(1);
    expect(await (await browser.get(`${base}/map`)).json()).toEqual(before);
    expect(await (await browser.get(`${base}/map/history`)).json()).toEqual({ history: [] });
  },
);
