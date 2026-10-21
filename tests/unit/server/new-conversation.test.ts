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
let map: string;
let path: string;
async function setup(options: Parameters<typeof createInstallation>[1]) {
  app = await createInstallation(undefined, options);
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  map = `${app.origin}/api/households/${household.id}/map`;
  path = `${app.origin}/api/households/${household.id}/text-assistant`;
}
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

const post = (url: string, data: object = {}) =>
  browser.post(url, { headers: { origin: app.origin }, data });
async function propose(id: string, name: string) {
  const state = await (await browser.get(map)).json();
  const response = await post(`${map}/draft`, {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    id,
    baseRevision: null,
    value: { typeId: state.types[0].id, name },
  });
  expect(response.status(), await response.text()).toBe(200);
}
async function start(): Promise<TextAssistantView> {
  const started = await post(path, approvedForVisit);
  expect(started.status(), await started.text()).toBe(201);
  return started.json();
}
async function send(session: TextAssistantView, text: string): Promise<TextAssistantView> {
  const response = await post(`${path}/${session.id}/messages`, {
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    requestId: crypto.randomUUID(),
    text,
  });
  expect(response.status(), await response.text()).toBe(202);
  return response.json();
}
async function settled(session: TextAssistantView): Promise<TextAssistantView> {
  let view = session;
  await expect
    .poll(async () => {
      view = await (await browser.get(`${path}/${session.id}`)).json();
      return view.phase;
    })
    .not.toBe('working');
  return view;
}
async function newConversation(session: TextAssistantView): Promise<TextAssistantView> {
  const response = await post(`${path}/${session.id}/new`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('a new conversation empties the context and says that the draft is empty', async () => {
  const model = textModel(() => [modelMessage('Ett provsvar.')]);
  await setup({ modelFetch: model.provider });
  let session = await settled(await send(await start(), 'Vem betalar musiken?'));
  session = await settled(await send(session, 'Och vem använder den?'));
  // The second turn carries the first one: the conversation has a context.
  expect(model.requests[1].input.length).toBeGreaterThan(1);

  const renewed = await newConversation(session);
  expect(renewed).toMatchObject({
    id: session.id,
    phase: 'ready',
    reply: 'Nytt samtal. Utkastet är tomt.',
  });
  expect(renewed.revision).toBeGreaterThan(session.revision);
  expect(renewed.modelReply).toBeUndefined();

  await settled(await send(renewed, 'Vad kostar den?'));
  expect(model.requests[2].input).toHaveLength(1);
  expect(JSON.stringify(model.requests[2].input)).not.toMatch(/Vem betalar|Ett provsvar/);
});

test('a new conversation stops held work, leaves the draft and counts its unsaved changes', async () => {
  let release!: (output: unknown[]) => void;
  let held = false;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        held = true;
        release = resolve;
      }),
  );
  await setup({ modelFetch: model.provider });
  await propose('lo', 'Lo Exempel');
  const working = await send(await start(), 'Rätta namnet.');
  expect(working.phase).toBe('working');
  await expect.poll(() => held).toBe(true);

  const renewed = await newConversation(working);
  expect(renewed).toMatchObject({
    phase: 'ready',
    reply: 'Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
  });
  const state = await (await browser.get(map)).json();
  release([
    modelTool('propose_object', {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: 'lo',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'För sent' },
    }),
  ]);
  // The late answer of the stopped work changes neither the draft nor the conversation.
  await expect
    .poll(async () => (await (await browser.get(`${path}/${renewed.id}`)).json()).revision)
    .toBe(renewed.revision);
  const draft = (await (await browser.get(map)).json()).draft;
  expect(draft.changes).toMatchObject([{ id: 'lo', after: { name: 'Lo Exempel' } }]);

  await propose('kim', 'Kim Exempel');
  expect((await newConversation(renewed)).reply).toBe(
    'Nytt samtal. 2 osparade ändringar ligger kvar i ditt utkast.',
  );
});

test.each(['ordinary', 'held-status', 'held-stop'] as const)(
  'a new conversation replaces the voice context and lets Skyttel say what remains: %s',
  { timeout: 12_000 },
  async (boundary) => {
    const heldStatus = boundary === 'held-status';
    const heldStop = boundary === 'held-stop';
    const live = liveProvider();
    const firstReply = deferred<unknown[]>();
    const model = textModel(() =>
      heldStop ? firstReply.promise : [modelMessage('Ett provsvar.')],
    );
    let resetting = false;
    let refreshHeld = false;
    const releaseRefresh = deferred();
    const releaseStatus = deferred();
    const statusDelivered = deferred<number>();
    const releaseCancel = deferred();
    const cancelDelivered = deferred();
    let statusHeld = false;
    let cancelHeld = false;
    let cancelStatus: number | undefined;
    let resettingRequest: Promise<TextAssistantView> | undefined;
    let stoppingRequest: ReturnType<typeof post> | undefined;
    await setup({
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
      assistantDispatch: async (incoming, dispatch) => {
        const pathname = new URL(incoming.url).pathname;
        if (
          heldStatus &&
          incoming.method === 'GET' &&
          /\/messages\/[^/]+$/.test(pathname) &&
          !statusHeld
        ) {
          statusHeld = true;
          await releaseStatus.promise;
          const response = await dispatch(incoming);
          statusDelivered.resolve(response.status);
          return response;
        }
        if ((heldStatus || heldStop) && pathname.endsWith('/cancel')) {
          cancelHeld = true;
          await releaseCancel.promise;
          const response = await dispatch(incoming);
          cancelStatus = response.status;
          cancelDelivered.resolve();
          return response;
        }
        const rpc =
          incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
            ? await incoming.clone().json()
            : null;
        const tool = rpc?.method === 'tools/call' ? rpc.params.name : undefined;
        if (resetting && tool === 'read_my_save_operations' && !refreshHeld) {
          refreshHeld = true;
          await releaseRefresh.promise;
        }
        return dispatch(incoming);
      },
    });
    try {
      await propose('lo', 'Lo Exempel');
      const before = await (await browser.get(map)).json();
      const session = await start();
      const started = await post(`${path}/${session.id}/voice`, {
        sdp: 'synthetic-offer',
        revision: session.revision,
        draftVersion: session.review.version,
        contentVersion: session.review.contentVersion,
      });
      expect(started.status(), await started.text()).toBe(201);
      const voiceId = (await started.json()).voice.id;
      let providerId = [...live.channels.keys()][0];
      let offset = 0;
      const say = (delta: string) =>
        live.emit(providerId, {
          type: 'session.input_transcript.delta',
          event_id: crypto.randomUUID(),
          delta,
          start_ms: offset,
          end_ms: ++offset,
        });
      const delegate = () =>
        live.emit(providerId, {
          type: 'session.delegation.created',
          event_id: crypto.randomUUID(),
          offset_ms: offset,
          delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
        });
      say('Vem betalar musiken?');
      delegate();
      // Dispatch follows the ordinary two-second quiet-input collection window.
      await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(1);
      const completed = heldStop
        ? ((await (await browser.get(`${path}/${session.id}`)).json()) as TextAssistantView)
        : await settled(session);
      if (heldStatus) await expect.poll(() => statusHeld).toBe(true);
      if (heldStop) {
        stoppingRequest = post(`${path}/${session.id}/voice/${voiceId}/stop`);
        await expect.poll(() => cancelHeld).toBe(true);
      }

      const resetEventOffset = live.sent.length;
      resetting = heldStatus;
      resettingRequest = newConversation(session);
      try {
        if (heldStatus) {
          await expect.poll(() => refreshHeld).toBe(true);
          // Deliver the real missing-task response while the new conversation
          // is still refreshing. Hold any resulting old cancellation until
          // after the authoritative reset response reaches the browser.
          releaseStatus.resolve();
          expect(await statusDelivered.promise).toBe(409);
        }
      } finally {
        releaseRefresh.resolve();
      }
      const renewed = await resettingRequest;
      firstReply.resolve([modelMessage('Ett provsvar.')]);
      releaseCancel.resolve();
      if (cancelHeld) await cancelDelivered.promise;
      if (stoppingRequest) expect((await stoppingRequest).status()).toBe(200);
      expect(renewed.reply).toBe('Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.');
      // A prompt to ignore old context does not clear the provider's history.
      // The old session closes; the browser establishes a fresh one.
      await expect.poll(() => live.channels.has(providerId)).toBe(false);
      const resetEvents = live.sent.slice(resetEventOffset).map(({ event }) => event.type);
      expect(live.sent.map(({ event }) => event.type)).toContain('session.close');
      expect(resetEvents).not.toContain('session.instructions.append');
      const replacement = await post(`${path}/${session.id}/voice`, {
        sdp: 'synthetic-replacement-offer',
        revision: renewed.revision,
        draftVersion: renewed.review.version,
        contentVersion: renewed.review.contentVersion,
        newConversation: true,
      });
      expect(replacement.status(), await replacement.text()).toBe(201);
      expect(cancelHeld).toBe(heldStop);
      expect(cancelStatus).toBe(heldStop ? 409 : undefined);
      expect(renewed).toMatchObject({ revision: completed.revision + 1, phase: 'ready' });
      expect((await settled(renewed)).revision).toBe(renewed.revision);
      expect(live.requests).toHaveLength(2);
      expect(live.requests[1].session.input).toBeUndefined();
      expect(live.sent.map(({ event }) => event)).toContainEqual({
        type: 'session.commentary.append',
        delegation_id: null,
        content: 'Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
      });
      providerId = [...live.channels.keys()][0];
      // What was said before the new conversation is not passed on with the next task.
      say('Vad kostar den?');
      delegate();
      await expect.poll(() => model.requests.length, { timeout: 5000 }).toBe(2);
      expect(model.requests[1].input).toHaveLength(1);
      const sentToModel = JSON.stringify(model.requests[1].input);
      expect(sentToModel).toContain('Vad kostar den?');
      expect(sentToModel).not.toContain('Vem betalar musiken?');
      await settled(renewed);
      expect(await (await browser.get(map)).json()).toEqual(before);
      expect(await (await browser.get(`${map}/history`)).json()).toEqual({ history: [] });
    } finally {
      releaseStatus.resolve();
      releaseRefresh.resolve();
      releaseCancel.resolve();
      firstReply.resolve([modelMessage('Ett provsvar.')]);
      await resettingRequest?.catch(() => undefined);
      await stoppingRequest?.catch(() => undefined);
    }
  },
);

test('a delayed cancellation refresh does not cancel work accepted in a new conversation', async () => {
  const reply = deferred<unknown[]>();
  const model = textModel(() => reply.promise);
  const releaseRefresh = deferred();
  let canceling = false;
  let held = false;
  let cancel: ReturnType<typeof post> | undefined;
  await setup({
    modelFetch: model.provider,
    assistantDispatch: async (incoming, dispatch) => {
      const rpc =
        incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
          ? await incoming.clone().json()
          : null;
      if (
        canceling &&
        !held &&
        rpc?.method === 'tools/call' &&
        rpc.params.name === 'read_my_save_operations'
      ) {
        held = true;
        await releaseRefresh.promise;
      }
      return dispatch(incoming);
    },
  });
  try {
    await propose('lo', 'Lo Exempel');
    const before = await (await browser.get(map)).json();
    const working = await send(await start(), 'Ett gammalt uppdrag.');
    await expect.poll(() => model.requests.length).toBe(1);
    // A changed operation requires an actual refresh even with conversation read reuse.
    await post(`${map}/operations`, {
      operationId: 'rejected-refresh',
      version: 999,
      contentVersion: 1,
    });
    canceling = true;
    cancel = post(`${path}/${working.id}/cancel`, { revision: working.revision, all: true });
    await expect.poll(() => held).toBe(true);
    const renewed = await newConversation(working);
    const fresh = await send(renewed, 'Ett nytt uppdrag.');
    await expect.poll(() => model.requests.length).toBe(2);
    releaseRefresh.resolve();
    const canceled = await cancel;
    const status = await (await browser.get(`${path}/${fresh.id}/messages/${fresh.taskId}`)).json();
    expect(status).toMatchObject({ revision: fresh.revision, taskStatus: 'working' });
    expect(canceled.status()).toBe(409);
    expect(await canceled.json()).toEqual({ error: 'assistant_turn_changed' });
    reply.resolve([modelMessage('Ett nytt svar.')]);
    const completed = await settled(fresh);
    expect(completed).toMatchObject({
      revision: fresh.revision,
      phase: 'ready',
      modelReply: 'Ett nytt svar.',
    });
    expect(await (await browser.get(map)).json()).toEqual(before);
    expect(await (await browser.get(`${map}/history`)).json()).toEqual({ history: [] });
  } finally {
    releaseRefresh.resolve();
    reply.resolve([modelMessage('Ett nytt svar.')]);
    await cancel?.catch(() => undefined);
  }
});

test('a late failed-task refresh does not close a new conversation', async () => {
  const releaseRefresh = deferred();
  let failed = false;
  let held = false;
  const model = textModel(async () => {
    // Another client edits the draft while this provider request is outstanding.
    await propose('lo', 'Lo Rättat');
    failed = true;
    throw new Error('Controlled provider failure');
  });
  await setup({
    modelFetch: model.provider,
    assistantDispatch: async (incoming, dispatch) => {
      const rpc =
        incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
          ? await incoming.clone().json()
          : null;
      if (failed && !held && rpc?.method === 'tools/call' && rpc.params.name === 'read_my_draft') {
        const response = await dispatch(incoming);
        held = true;
        await releaseRefresh.promise;
        return response;
      }
      return dispatch(incoming);
    },
  });
  try {
    await propose('lo', 'Lo Exempel');
    const working = await send(await start(), 'Ett gammalt uppdrag.');
    await expect.poll(() => held).toBe(true);
    const before = await (await browser.get(map)).json();
    const renewed = await newConversation(working);
    releaseRefresh.resolve();
    const response = await browser.get(`${path}/${renewed.id}`);
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toMatchObject({
      revision: renewed.revision,
      phase: 'ready',
      reply: 'Nytt samtal. 1 osparad ändring ligger kvar i ditt utkast.',
    });
    expect(await (await browser.get(map)).json()).toEqual(before);
    expect(await (await browser.get(`${map}/history`)).json()).toEqual({ history: [] });
  } finally {
    releaseRefresh.resolve();
  }
});

test('a new conversation still checks a save that has begun before new work', async () => {
  const live = liveProvider();
  const model = textModel(() => [modelMessage('Ett provsvar.')]);
  await setup({ modelFetch: model.provider, liveFetch: live.provider, liveSideband: live.attach });
  await propose('lo', 'Lo Exempel');
  const registered = await post(`${map}/operations`, {
    operationId: 'interrupted-save',
    version: 1,
    contentVersion: 1,
  });
  expect(registered.status(), await registered.text()).toBe(200);
  const session = await start();
  expect(session.phase).toBe('recovery');
  const startVoice = async (revision: number) => {
    const started = await post(`${path}/${session.id}/voice`, {
      sdp: 'synthetic-offer',
      revision,
      draftVersion: session.review.version,
      contentVersion: session.review.contentVersion,
    });
    expect(started.status(), await started.text()).toBe(201);
    return (await started.json()).voice as { id: string };
  };
  const first = await startVoice(session.revision);

  const renewed = await newConversation(session);
  expect(renewed).toMatchObject({
    phase: 'recovery',
    operations: [{ operationId: 'interrupted-save', status: 'pending' }],
  });
  const poll = async (id: string) =>
    (
      await post(`${path}/${session.id}/voice/${id}/poll`, {
        revision: renewed.revision,
        draftVersion: renewed.review.version,
        contentVersion: renewed.review.contentVersion,
      })
    ).json();
  expect(await poll(first.id)).toMatchObject({ voice: { phase: 'closed' } });
  const refused = await post(`${path}/${session.id}/messages`, {
    revision: renewed.revision,
    draftVersion: renewed.review.version,
    contentVersion: renewed.review.contentVersion,
    requestId: crypto.randomUUID(),
    text: 'Skapa en ny person.',
  });
  expect(refused.status()).toBe(409);
  expect(model.requests).toEqual([]);

  // A fresh voice connection also preserves the recovery barrier.
  const second = await startVoice(renewed.revision);
  expect(await poll(second.id)).toMatchObject({ voice: { phase: 'recovery' } });
  await newConversation(renewed);
  await expect.poll(async () => (await poll(second.id)).voice?.phase).toMatch(/closing|closed/);
});
