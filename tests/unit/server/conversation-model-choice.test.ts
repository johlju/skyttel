import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation, robin } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let other: APIRequestContext;
let release = () => {};
afterEach(async () => {
  release();
  await browser?.dispose();
  await other?.dispose();
  await app?.close();
});

test.each([
  [403, 'assistant_model_access', 'Installationens konto saknar åtkomst'],
  [400, 'assistant_model_unsupported', 'Modellen och resonemangsnivån stöds inte'],
  [503, 'assistant_model_temporary', 'Modellen är tillfälligt otillgänglig.'],
])(
  'summary provider HTTP %s preserves its classified failure and the completed work',
  async (status, code, explanation) => {
    let summaryCalls = 0;
    const model = textModel(() => [modelMessage('Det färdiga svaret.')]);
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        const body = JSON.parse(String(init?.body));
        if (!body.tools.length && !body.instructions.startsWith('SKYTTEL_TURN_')) {
          summaryCalls++;
          return Response.json(
            { error: { message: 'Synthetic summary failure' } },
            { status: Number(status) },
          );
        }
        const response = await model.provider(input, init);
        if (!body.tools.length) return response;
        const completed = await response.json();
        completed.usage.input_tokens = 1_040_000;
        return Response.json(completed, { headers: response.headers });
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (path: string, data: object) =>
      browser.post(path, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    await post(`${base}/${view.id}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      requestId: crypto.randomUUID(),
      text: 'Beskriv kartan.',
    });
    await expect
      .poll(async () => {
        view = await (await browser.get(`${base}/${view.id}`)).json();
        return view.contextSummaryState;
      })
      .toBe('failed');
    expect(view).toMatchObject({
      contextSummaryFailure: { code, message: expect.stringContaining(explanation) },
      modelChoice: { model: 'gpt-6.1-terra', effort: 'high' },
      modelReply: 'Det färdiga svaret.',
      review: { version: 0, changes: [] },
    });
    expect(summaryCalls).toBe(1);
    expect(model.requests).toHaveLength(1);
  },
);

test.each([
  ['gpt-6.1-terra', 'low'],
  ['gpt-6.1-terra', 'medium'],
  ['gpt-6.1-terra', 'high'],
  ['gpt-6.1-sol', 'low'],
  ['gpt-6.1-sol', 'medium'],
  ['gpt-6.1-sol', 'high'],
])(
  'spoken requests use %s/%s while Live keeps its listening and speaking model',
  async (selectedModel, effort) => {
    const live = liveProvider();
    const model = textModel(() => [modelMessage('Ett svar.')]);
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (path: string, data: object) =>
      browser.post(path, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    const voice = await post(`${base}/${view.id}/voice`, {
      sdp: 'synthetic-offer',
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
    });
    expect(voice.status(), await voice.text()).toBe(201);
    const provider = [...live.channels.keys()][0];
    expect(
      (await post(`${base}/${view.id}/model-choice`, { model: selectedModel, effort })).status(),
    ).toBe(200);
    const offset = 0;
    live.emit(provider, {
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta: 'Beskriv kartan.',
      start_ms: offset,
      end_ms: offset + 100,
    });
    live.emit(provider, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: offset + 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
    await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(1);
    await expect
      .poll(async () => {
        view = await (await browser.get(`${base}/${view.id}`)).json();
        return view.phase;
      })
      .toBe('ready');
    expect(view.completedReplies?.at(-1)?.source).toBe('voice');
    expect(model.requests[0]).toMatchObject({
      model: selectedModel,
      reasoning: { effort },
    });
    expect(model.authorizationRequests[0]).toMatchObject({
      model: selectedModel,
      reasoning: { effort },
    });
    expect(live.requests).toHaveLength(1);
    expect(live.requests[0]).toMatchObject({ session: { model: 'gpt-live-1' } });
  },
);

test.each(['handoff', 'queue', 'cancel', 'new'] as const)(
  'a deferred spoken summary uses the correct request choice through %s',
  async (action) => {
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const live = liveProvider();
    const model = textModel(async (body) => {
      if (model.requests.length === 1) {
        entered();
        await waiting;
      }
      return [modelMessage(body.tools.length ? 'Ett färdigt svar.' : 'Historisk sammanfattning.')];
    });
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        const response = await model.provider(input, init);
        if (!JSON.parse(String(init?.body)).tools.length) return response;
        const completed = await response.json();
        completed.usage.input_tokens = 1_040_000;
        return Response.json(completed, { headers: response.headers });
      },
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (path: string, data: object = {}) =>
      browser.post(path, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    expect(
      (
        await post(`${base}/${view.id}/voice`, {
          sdp: 'synthetic-offer',
          revision: view.revision,
          draftVersion: view.review.version,
          contentVersion: view.review.contentVersion,
        })
      ).status(),
    ).toBe(201);
    const provider = [...live.channels.keys()][0];
    live.emit(provider, {
      type: 'session.input_transcript.delta',
      event_id: crypto.randomUUID(),
      delta: 'Beskriv kartan.',
      start_ms: 0,
      end_ms: 100,
    });
    live.emit(provider, {
      type: 'session.delegation.created',
      event_id: crypto.randomUUID(),
      offset_ms: 100,
      delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
    });
    await started;
    const choice = { model: 'gpt-6.1-sol', effort: 'low' };
    expect((await post(`${base}/${view.id}/model-choice`, choice)).status()).toBe(200);
    const send = () =>
      post(`${base}/${view.id}/messages`, {
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
        requestId: crypto.randomUUID(),
        text: 'Beskriv kartan igen.',
      });
    if (action === 'queue') expect((await send()).status()).toBe(202);
    release();
    if (action !== 'queue') {
      await expect
        .poll(async () => {
          view = await (await browser.get(`${base}/${view.id}`)).json();
          return [view.phase, view.contextSummaryState];
        })
        .toEqual(['ready', 'needed']);
      const next = await post(
        `${base}/${view.id}/${action === 'handoff' ? 'summarize' : action}`,
        action === 'cancel' ? { all: true } : {},
      );
      expect(next.status()).toBe(200);
      view = await next.json();
      expect((await send()).status()).toBe(202);
    }
    await expect
      .poll(async () => {
        view = await (await browser.get(`${base}/${view.id}`)).json();
        return [view.phase, view.contextSummaries?.length];
      })
      .toEqual(['ready', action === 'new' ? 1 : 2]);
    expect(view.modelChoice).toEqual(choice);
    const retired = action === 'cancel' || action === 'new';
    const original = retired ? model.requests.slice(0, 1) : model.requests.slice(0, 2);
    for (const entry of [...original, model.authorizationRequests[0]])
      expect(entry).toMatchObject({
        model: 'gpt-6.1-terra',
        reasoning: { effort: 'high' },
      });
    for (const entry of model.requests.slice(retired ? 1 : 2))
      expect(entry).toMatchObject({ model: 'gpt-6.1-sol', reasoning: { effort: 'low' } });
    expect(model.authorizationRequests.at(-1)).toMatchObject({
      model: 'gpt-6.1-sol',
      reasoning: { effort: 'low' },
    });
    expect(model.requests).toHaveLength(action === 'new' ? 3 : 4);
  },
);

test.each([
  ['gpt-6.1-terra', 'low'],
  ['gpt-6.1-terra', 'medium'],
  ['gpt-6.1-terra', 'high'],
  ['gpt-6.1-sol', 'low'],
  ['gpt-6.1-sol', 'medium'],
  ['gpt-6.1-sol', 'high'],
])(
  '%s/%s is used by interpretation, draft work, independent checking and summary',
  async (selectedModel, effort) => {
    let typeId = '';
    const model = textModel(() =>
      model.requests.length === 1
        ? [
            modelTool('propose_object', {
              version: 0,
              contentVersion: 1,
              id: 'choice-chair',
              baseRevision: null,
              value: { typeId, name: 'En stol' },
            }),
          ]
        : [modelMessage('Stolen finns i utkastet.')],
    );
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        const response = await model.provider(input, init);
        const body = JSON.parse(String(init?.body));
        if (body.tools.length && model.requests.length === 2) {
          const completed = await response.json();
          completed.usage.input_tokens = 1_040_000;
          return Response.json(completed, { headers: response.headers });
        }
        return response;
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const householdPath = `${app.origin}/api/households/${household.id}`;
    typeId = (await (await browser.get(`${householdPath}/map`)).json()).types[0].id;
    const base = `${householdPath}/text-assistant`;
    const post = (path: string, data: object) =>
      browser.post(path, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    await post(`${base}/${view.id}/model-choice`, { model: selectedModel, effort });
    await post(`${base}/${view.id}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      requestId: crypto.randomUUID(),
      text: 'Lägg till En stol, utan att spara.',
    });
    await expect
      .poll(async () => {
        view = await (await browser.get(`${base}/${view.id}`)).json();
        return view.phase;
      })
      .toBe('ready');
    expect(view.review.changes).toMatchObject([{ id: 'choice-chair', after: { name: 'En stol' } }]);
    await expect
      .poll(async () => {
        view = await (await browser.get(`${base}/${view.id}`)).json();
        return view.contextSummaries?.length;
      })
      .toBe(1);
    expect(model.requests).toHaveLength(3);
    expect(model.authorizationRequests).toHaveLength(2);
    for (const entry of [...model.requests, ...model.authorizationRequests])
      expect(entry).toMatchObject({
        model: selectedModel,
        reasoning: { effort },
        store: false,
        max_output_tokens: 128_000,
      });
  },
);

test('an active request retains its model and a queued request binds the later choice when it starts', async () => {
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async () => {
    if (model.requests.length === 1) {
      entered();
      await waiting;
    }
    return [modelMessage('Ett svar.')];
  });
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const base = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (path: string, data: object) =>
    browser.post(path, { headers: { origin: app.origin }, data });
  let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
  const send = (text: string) =>
    post(`${base}/${view.id}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      requestId: crypto.randomUUID(),
      text,
    });
  const first = await send('Beskriv kartan.');
  expect(first.status()).toBe(202);
  view = await first.json();
  await started;
  expect((await send('Beskriv den igen.')).status()).toBe(202);
  const choice = { model: 'gpt-6.1-sol', effort: 'medium' };
  expect((await post(`${base}/${view.id}/model-choice`, choice)).status()).toBe(200);
  release();
  await expect
    .poll(async () => {
      view = await (await browser.get(`${base}/${view.id}`)).json();
      return [view.phase, view.queuedMessages];
    })
    .toEqual(['ready', 0]);
  expect(
    model.requests.map((entry) => ({ model: entry.model, effort: entry.reasoning.effort })),
  ).toEqual([{ model: 'gpt-6.1-terra', effort: 'high' }, choice]);
  expect(
    model.authorizationRequests.map((entry) => ({
      model: entry.model,
      effort: entry.reasoning.effort,
    })),
  ).toEqual([{ model: 'gpt-6.1-terra', effort: 'high' }, choice]);
  expect(model.requests.every((entry) => entry.store === false)).toBe(true);
});

test('a disabled default is preserved and no provider call probes it or silently changes it', async () => {
  const model = textModel(() => [modelMessage('Ett svar.')]);
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    conversationModels: [{ model: 'gpt-6.1-sol', effort: 'high' }],
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const base = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (path: string, data: object) =>
    browser.post(path, { headers: { origin: app.origin }, data });
  let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
  expect(view).toMatchObject({
    modelChoice: { model: 'gpt-6.1-terra', effort: 'high' },
    modelChoiceUnavailable: true,
  });
  await post(`${base}/${view.id}/messages`, {
    revision: view.revision,
    draftVersion: view.review.version,
    contentVersion: view.review.contentVersion,
    requestId: crypto.randomUUID(),
    text: 'Beskriv kartan.',
  });
  await expect
    .poll(async () => {
      view = await (await browser.get(`${base}/${view.id}`)).json();
      return view.phase;
    })
    .toBe('error');
  expect(view).toMatchObject({
    error: 'assistant_model_unsupported',
    modelChoice: { model: 'gpt-6.1-terra', effort: 'high' },
  });
  expect(model.requests).toHaveLength(0);
  expect(model.authorizationRequests).toHaveLength(0);
  expect(
    (
      await post(`${base}/${view.id}/model-choice`, { model: 'gpt-6.1-sol', effort: 'low' })
    ).status(),
  ).toBe(409);
  expect(
    (
      await post(`${base}/${view.id}/model-choice`, { model: 'gpt-6.1-sol', effort: 'high' })
    ).status(),
  ).toBe(200);
});

test('new conversations use Terra/high and an explicit choice is personal while existing conversations retain theirs', async () => {
  const model = textModel(() => [modelMessage('Ett svar.')]);
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const base = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (path: string, data: object) =>
    browser.post(path, { headers: { origin: app.origin }, data });
  const first: TextAssistantView = await (await post(base, approvedForVisit)).json();
  expect(first).toMatchObject({ modelChoice: { model: 'gpt-6.1-terra', effort: 'high' } });
  other = await request.newContext();
  await signIn(other, app.origin);
  const second: TextAssistantView = await (
    await other.post(base, { headers: { origin: app.origin }, data: approvedForVisit })
  ).json();
  const choice = { model: 'gpt-6.1-sol', effort: 'low' };
  const changed = await post(`${base}/${first.id}/model-choice`, choice);
  expect(changed.status(), await changed.text()).toBe(200);
  expect(await changed.json()).toMatchObject({ modelChoice: choice });
  expect(await (await other.get(`${base}/${second.id}`)).json()).toMatchObject({
    modelChoice: { model: 'gpt-6.1-terra', effort: 'high' },
  });
  expect(model.requests).toHaveLength(0);
  expect(model.authorizationRequests).toHaveLength(0);
  await other.post(`${base}/${second.id}/messages`, {
    headers: { origin: app.origin },
    data: {
      revision: second.revision,
      draftVersion: second.review.version,
      contentVersion: second.review.contentVersion,
      requestId: crypto.randomUUID(),
      text: 'Beskriv kartan.',
    },
  });
  await expect
    .poll(async () => (await (await other.get(`${base}/${second.id}`)).json()).phase)
    .toBe('ready');
  expect(model.requests[0]).toMatchObject({
    model: 'gpt-6.1-terra',
    reasoning: { effort: 'high' },
  });
  const next = await (await post(base, approvedForVisit)).json();
  expect(next).toMatchObject({ modelChoice: choice });
  const { user } = await (await browser.get(`${app.origin}/api/bootstrap`)).json();
  const anotherHousehold = crypto.randomUUID();
  app.seedMembership(user.id, anotherHousehold, 'Ett annat hushåll');
  const anotherBase = `${app.origin}/api/households/${anotherHousehold}/text-assistant`;
  expect(await (await post(anotherBase, approvedForVisit)).json()).toMatchObject({
    modelChoice: choice,
  });
  browser = await restartWithSession(browser, () => app.restart());
  const restartedBase = `${app.origin}/api/households/${household.id}/text-assistant`;
  expect(
    await (
      await browser.post(restartedBase, { headers: { origin: app.origin }, data: approvedForVisit })
    ).json(),
  ).toMatchObject({ modelChoice: choice });
  await other.dispose();
  other = await request.newContext();
  app.setIdentity(robin);
  await signIn(other, app.origin, 'microsoft');
  const { user: otherUser } = await (await other.get(`${app.origin}/api/bootstrap`)).json();
  const privateHousehold = crypto.randomUUID();
  app.seedMembership(otherUser.id, privateHousehold, 'Robins hushåll', 'administrator');
  const privateBase = `${app.origin}/api/households/${privateHousehold}/text-assistant`;
  expect(
    await (
      await other.post(privateBase, { headers: { origin: app.origin }, data: approvedForVisit })
    ).json(),
  ).toMatchObject({ modelChoice: { model: 'gpt-6.1-terra', effort: 'high' } });
  expect(model.requests).toHaveLength(1);
  expect(model.authorizationRequests).toHaveLength(1);
});

test.each([
  [403, 'assistant_model_access'],
  [400, 'assistant_model_unsupported'],
  [503, 'assistant_model_temporary'],
])(
  'provider HTTP %s has a distinct outcome without retries or choice changes',
  async (status, error) => {
    let calls = 0;
    app = await createInstallation(undefined, {
      modelFetch: async () => {
        calls++;
        return Response.json(
          { error: { message: 'Synthetic provider failure', type: 'provider_error' } },
          { status: Number(status) },
        );
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (path: string, data: object) =>
      browser.post(path, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    expect(calls).toBe(0);
    await post(`${base}/${view.id}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      requestId: crypto.randomUUID(),
      text: 'Beskriv kartan.',
    });
    await expect
      .poll(async () => {
        view = await (await browser.get(`${base}/${view.id}`)).json();
        return view.phase;
      })
      .toBe('error');
    expect(view).toMatchObject({ error, modelChoice: { model: 'gpt-6.1-terra', effort: 'high' } });
    expect(calls).toBe(1);
  },
);
