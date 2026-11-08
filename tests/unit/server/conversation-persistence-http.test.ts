import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { AssistantObservation } from '../../../src/server/assistant-observation.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { authorizeAssistant, callAssistantTool } from '../../support/assistant.js';
import { controlledBatchDelivery } from '../../support/batch-response-delivery.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation, robin } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

async function restart() {
  // Reopen the HTTP transport after the real server closes its sockets. Retain
  // only the browser's ordinary authentication cookies, never conversation data.
  browser = await restartWithSession(browser, () => app.restart());
}

test('logout pauses exact unfinished work, queued work and pending-part identities across restart', async () => {
  let release!: (value: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  let turn = 0;
  const model = textModel(() =>
    turn++ === 0
      ? [
          modelTool('ask_questions', {
            questions: [
              {
                kind: 'change',
                request: 'Byt cykelns namn till Blå, men ändra inte ägaren.',
                question: 'Vilken cykel?',
                dependsOnDraft: true,
              },
            ],
          }),
        ]
      : held,
  );
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
  const send = async (text: string) => {
    const response = await post(`${path}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text,
      queue: true,
    });
    expect(response.status(), await response.text()).toBe(202);
    state = await response.json();
  };
  try {
    await send('Byt cykelns namn till Blå, men ändra inte ägaren.');
    await expect
      .poll(async () => {
        state = await (await browser.get(`${path}/${state.id}`)).json();
        return state.phase;
      })
      .toBe('ready');
    const parts = state.pendingParts;
    expect(parts).toHaveLength(1);
    await send('Beskriv de andra cyklarna utan att ändra dem.');
    await expect.poll(() => model.requests.length).toBe(2);
    await send('Vilken färg har garaget?');
    expect(state.queuedMessages).toBe(1);
    const tasks = state.tasks?.map(({ id, status, receivedAt, deadline }) => ({
      id,
      status,
      receivedAt,
      deadline,
    }));
    const signedOut = await post(`${app.origin}/api/auth/sign-out`);
    expect(signedOut.status(), await signedOut.text()).toBe(200);
    release([modelMessage('Ett sent svar får inte fortsätta kön.')]);
    await restart();
    await signIn(browser, app.origin);
    const restored = await browser.get(`${path}/${state.id}`);
    expect(restored.status(), await restored.text()).toBe(200);
    expect(await restored.json()).toMatchObject({
      id: state.id,
      paused: true,
      queuedMessages: 1,
      pendingParts: parts,
      saveBlocked: true,
      tasks,
    });
    expect(model.requests).toHaveLength(2);
  } finally {
    release([modelMessage('Släpp provet.')]);
  }
});

test('actual restart restores the exact conversation and choice without starting model work', async () => {
  const model = textModel(() => [
    {
      ...modelMessage('Jag behöver veta vilken cykel du menar.'),
      extensions: { $map: 'ordinary-provider-extension', $set: 'ordinary-provider-extension' },
    },
  ]);
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  const started = await post(path, approvedForVisit);
  expect(started.status(), await started.text()).toBe(201);
  let state: TextAssistantView = await started.json();
  const choice = await post(`${path}/${state.id}/model-choice`, {
    model: 'gpt-6.1-sol',
    effort: 'low',
  });
  expect(choice.status(), await choice.text()).toBe(200);
  state = await choice.json();
  const sent = await post(`${path}/${state.id}/messages`, {
    requestId: crypto.randomUUID(),
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
    text: 'Byt cykelns namn till Blå, men ändra inte ägaren.',
  });
  expect(sent.status(), await sent.text()).toBe(202);
  await expect
    .poll(async () => {
      state = await (await browser.get(`${path}/${state.id}`)).json();
      return state.phase;
    })
    .not.toBe('working');
  const before = model.requests.length;
  await restart();
  const restored = await browser.get(`${path}/${state.id}`);
  expect(restored.status(), await restored.text()).toBe(200);
  expect(await restored.json()).toMatchObject({
    id: state.id,
    modelChoice: { model: 'gpt-6.1-sol', effort: 'low' },
    paused: true,
    conversation: [
      { role: 'user', text: 'Byt cykelns namn till Blå, men ändra inte ägaren.' },
      { role: 'assistant', text: 'Jag behöver veta vilken cykel du menar.' },
    ],
  });
  expect(model.requests).toHaveLength(before);
  const task = state.tasks?.find((item) => item.status === 'completed');
  expect(task).toBeDefined();
  const taskStatus = await browser.get(`${path}/${state.id}/messages/${task?.id}`);
  expect(taskStatus.status(), await taskStatus.text()).toBe(200);
  expect(await taskStatus.json()).toMatchObject({ paused: true, phase: 'ready' });
});

test('a model response after shutdown leaves restored work paused and never starts its queue', async () => {
  let release!: (output: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  const observations: AssistantObservation[] = [];
  const model = textModel(() => held);
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    observe: (event) => observations.push(event),
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  let state: TextAssistantView = await (
    await browser.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
  ).json();
  const send = async (requestId: string, text: string) => {
    const sent = await browser.post(`${path}/${state.id}/messages`, {
      headers: { origin: app.origin },
      data: {
        requestId,
        revision: state.revision,
        draftVersion: state.review.version,
        contentVersion: state.review.contentVersion,
        text,
      },
    });
    expect(sent.status(), await sent.text()).toBe(202);
    state = await sent.json();
  };
  try {
    await send('held-before-shutdown', 'Beskriv hushållets cyklar.');
    await expect.poll(() => model.requests.length).toBe(1);
    await send('queued-before-shutdown', 'Beskriv sedan garaget.');
    expect(state.queuedMessages).toBe(1);
    expect(state.tasks).toHaveLength(2);
    const tasks = state.tasks?.map(({ id, status, receivedAt, deadline }) => ({
      id,
      status,
      receivedAt,
      deadline,
    }));

    await restart();
    // The old provider deliberately ignores cancellation until the old
    // installation and its database have completely closed.
    release([modelMessage('Ett sent svar får inte återuppta samtalet.')]);
    await expect
      .poll(() => observations.some((event) => event.kind === 'task_completed'))
      .toBe(true);
    const restored = await browser.get(`${path}/${state.id}`);
    expect(restored.status(), await restored.text()).toBe(200);
    expect(await restored.json()).toMatchObject({
      paused: true,
      queuedMessages: 1,
      tasks,
      conversation: [{ role: 'user', text: 'Beskriv hushållets cyklar.' }],
      queuedRequests: [
        { id: 'queued-before-shutdown', text: 'Beskriv sedan garaget.', source: 'text' },
      ],
    });
    expect(model.requests).toHaveLength(1);
  } finally {
    release([modelMessage('Släpp provet.')]);
  }
});

test('seven-day expiry survives restart and ignores model completion, polling and restoration', async () => {
  let time = Date.now();
  let release!: (value: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  const model = textModel(() => held);
  app = await createInstallation(undefined, { modelFetch: model.provider, now: () => time });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
  time += 60_000;
  const deadline = time + 604_800_000;
  try {
    const sent = await post(`${path}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text: 'Byt cykelns namn till Blå, men ändra inte ägaren.',
    });
    expect(sent.status(), await sent.text()).toBe(202);
    await expect.poll(() => model.requests.length).toBe(1);
    time += 300_000;
    release([modelTool('ask_questions', { questions: ['Vilken cykel?'] })]);
    await expect
      .poll(async () => {
        state = await (await browser.get(`${path}/${state.id}`)).json();
        return state.phase;
      })
      .toBe('ready');
    expect(state.expiresAt).toBe(deadline);
    expect(state.saveBlocked).toBe(true);
    await restart();
    time = deadline - 1;
    await signIn(browser, app.origin);
    const discovered = await browser.get(`${path}/restore`);
    expect(discovered.status(), await discovered.text()).toBe(200);
    expect((await discovered.json()).conversation).toMatchObject({
      id: state.id,
      paused: true,
      expiresAt: deadline,
    });
    const restored = await browser.get(`${path}/${state.id}`);
    expect(restored.status(), await restored.text()).toBe(200);
    expect(await restored.json()).toMatchObject({
      paused: true,
      expiresAt: deadline,
      saveBlocked: true,
    });
    for (let count = 0; count < 3; count++) {
      const checked = await browser.get(`${path}/restore`);
      expect((await checked.json()).conversation.expiresAt).toBe(deadline);
    }
    time = deadline;
    const expired = await browser.get(`${path}/${state.id}`);
    expect(expired.status(), await expired.text()).toBe(404);
    await restart();
    expect((await browser.get(`${path}/${state.id}`)).status()).toBe(404);
    const fresh = await post(path, approvedForVisit);
    expect(fresh.status(), await fresh.text()).toBe(201);
    expect(await fresh.json()).toMatchObject({
      saveBlocked: false,
      pendingParts: [],
      queuedMessages: 0,
    });
    expect(model.requests).toHaveLength(1);
  } finally {
    release([modelMessage('Släpp provet.')]);
  }
});

test('non-delegated speech renews the seven-day lifetime across restart without renewal by other voice activity', async () => {
  let time = Date.now();
  const live = liveProvider();
  const model = textModel(() => [modelMessage('Inget uppdrag behövs.')]);
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
    now: () => time,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  const state: TextAssistantView = await (await post(path, approvedForVisit)).json();
  const voice = await post(`${path}/${state.id}/voice`, {
    sdp: 'synthetic-offer',
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
    microphoneOn: true,
  });
  expect(voice.status(), await voice.text()).toBe(201);
  const connected = await voice.json();
  const providerId = [...live.channels.keys()][0];
  const transcript = (role: 'input' | 'output', delta: string) =>
    live.emit(providerId, {
      type: `session.${role}_transcript.delta`,
      event_id: crypto.randomUUID(),
      delta,
      start_ms: 0,
      end_ms: 100,
    });
  time += 60_000;
  const deadline = time + 604_800_000;
  transcript('input', 'Tack för hjälpen.');
  const spoken = await browser.get(`${path}/${state.id}`);
  expect(spoken.status(), await spoken.text()).toBe(200);
  expect(await spoken.json()).toMatchObject({
    expiresAt: deadline,
    conversation: [{ role: 'user', text: 'Tack för hjälpen.' }],
  });

  time += 300_000;
  transcript('output', 'Varsågod!');
  transcript('input', '   ');
  const polled = await post(`${path}/${state.id}/voice/${connected.voice.id}/poll`, {
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
    microphoneOn: true,
    microphoneActive: true,
    speakerActive: true,
  });
  expect(polled.status(), await polled.text()).toBe(200);
  expect((await (await browser.get(`${path}/${state.id}`)).json()).expiresAt).toBe(deadline);
  expect(model.requests).toHaveLength(0);
  await restart();
  time = deadline - 1;
  await signIn(browser, app.origin);
  const restored = await browser.get(`${path}/restore`);
  expect(restored.status(), await restored.text()).toBe(200);
  expect((await restored.json()).conversation).toMatchObject({
    id: state.id,
    paused: true,
    expiresAt: deadline,
    conversation: expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: 'Tack för hjälpen.' }),
    ]),
  });
  time = deadline;
  expect((await browser.get(`${path}/${state.id}`)).status()).toBe(404);
  await restart();
  expect((await browser.get(`${path}/${state.id}`)).status()).toBe(404);
  expect(model.requests).toHaveLength(0);
  expect(live.requests).toHaveLength(1);
});

test.each([false, true])(
  'updated consent gates new work and durable old text (approved=%s)',
  async (approved) => {
    let release!: (value: unknown[]) => void;
    const held = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    const model = textModel(() => held);
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      consentTextVersion: 3,
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const root = `${app.origin}/api/households/${household.id}`;
    const path = `${root}/text-assistant`;
    const post = (url: string, data: object = {}) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    let state: TextAssistantView = await (await post(path, { consent: { textVersion: 3 } })).json();
    const instruction = 'Förklara cykeln utan att ändra ägaren.';
    const body = (text: string) => ({
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text,
      queue: true,
    });
    try {
      expect((await post(`${path}/${state.id}/messages`, body(instruction))).status()).toBe(202);
      await expect.poll(() => model.requests.length).toBe(1);
      app.setConversationConsentTextVersion(4);
      const refused = await post(`${path}/${state.id}/messages`, body('Ett nytt uppdrag.'));
      expect(refused.status(), await refused.text()).toBe(403);
      expect(await refused.json()).toEqual({ error: 'conversation_consent_required' });
      release([modelMessage('Det gamla arbetet är klart under sina ursprungliga villkor.')]);
      await expect
        .poll(async () => {
          state = await (await browser.get(`${path}/${state.id}`)).json();
          return state.phase;
        })
        .toBe('ready');
      expect(state.consentTextVersion).toBe(3);
      expect(state.conversation).toEqual([
        { role: 'user', text: instruction },
        { role: 'assistant', text: 'Det gamla arbetet är klart under sina ursprungliga villkor.' },
      ]);
      if (approved) {
        const acceptance = await post(`${root}/conversation-consent`, { textVersion: 4 });
        expect(acceptance.status(), await acceptance.text()).toBe(200);
      } else {
        // Declining new conversation terms does not gate ordinary map forms.
        const map = await (await browser.get(`${root}/map`)).json();
        const manual = await post(`${root}/map/draft`, {
          version: map.draft.version,
          contentVersion: map.contentVersion,
          id: 'lo',
          baseRevision: null,
          value: { typeId: map.types[0].id, name: 'Lo Exempel' },
        });
        expect(manual.status(), await manual.text()).toBe(200);
      }
      await restart();
      const restored = await browser.get(`${path}/${state.id}`);
      expect(restored.status(), await restored.text()).toBe(approved ? 200 : 404);
      if (approved)
        expect(await restored.json()).toMatchObject({
          paused: true,
          consentTextVersion: 3,
          conversation: state.conversation,
        });
      expect(model.requests).toHaveLength(1);
      expect(model.requests.every((entry) => entry.store === false)).toBe(true);
    } finally {
      release([modelMessage('Släpp provet.')]);
    }
  },
);

test('visit-only updated approval covers later requests without rewriting running task terms', async () => {
  let release!: (value: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  const events: AssistantObservation[] = [];
  const live = liveProvider();
  let turn = 0;
  const model = textModel(() =>
    turn++ === 0 ? held : [modelMessage('Det nya arbetet är klart.')],
  );
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    consentTextVersion: 3,
    observe: (event) => events.push(event),
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(path, { consent: { textVersion: 3 } })).json();
  const send = (requestId: string, consent?: { textVersion: number }) =>
    post(`${path}/${state.id}/messages`, {
      requestId,
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text: `Beskriv cykeln för ${requestId}, utan att ändra något.`,
      queue: true,
      ...(consent ? { consent } : {}),
    });
  try {
    expect((await send('original-terms')).status()).toBe(202);
    await expect.poll(() => model.requests.length).toBe(1);
    app.setConversationConsentTextVersion(4);
    state = await (await browser.get(`${path}/${state.id}`)).json();
    const approved = await send('updated-terms', { textVersion: 4 });
    expect(approved.status(), await approved.text()).toBe(202);
    release([modelMessage('Det gamla arbetet slutar med sina ursprungliga villkor.')]);
    await expect
      .poll(async () => {
        state = await (await browser.get(`${path}/${state.id}`)).json();
        return state.phase;
      })
      .toBe('ready');
    const original = events.filter((event) => event.taskId === 'original-terms');
    expect(original.some((event) => event.kind === 'task_completed')).toBe(true);
    expect(original.every((event) => event.consentTextVersion === 3)).toBe(true);
    expect(original.every((event) => event.conversationConsentTextVersion === 3)).toBe(true);
    const updated = events.filter((event) => event.taskId === 'updated-terms');
    expect.soft(updated.some((event) => event.kind === 'task_completed')).toBe(true);
    expect.soft(updated.every((event) => event.consentTextVersion === 4)).toBe(true);
    expect(updated.some((event) => event.kind === 'work_result')).toBe(true);
    expect(updated.every((event) => event.conversationConsentTextVersion === 3)).toBe(true);
    expect(state.consentTextVersion).toBe(3);
    const later = await send('same-visit');
    expect(later.status(), await later.text()).toBe(202);
    await expect.poll(() => model.requests.length).toBe(3);
    await expect
      .poll(async () => {
        state = await (await browser.get(`${path}/${state.id}`)).json();
        return state.phase;
      })
      .toBe('ready');
    const sameVisit = events.filter((event) => event.taskId === 'same-visit');
    expect(sameVisit.some((event) => event.kind === 'work_result')).toBe(true);
    expect(sameVisit.every((event) => event.consentTextVersion === 4)).toBe(true);
    expect(sameVisit.every((event) => event.conversationConsentTextVersion === 3)).toBe(true);
    const voice = await post(`${path}/${state.id}/voice`, {
      sdp: 'synthetic-offer',
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
    });
    expect(voice.status(), await voice.text()).toBe(201);
    const voiceEvents = events.filter((event) => event.context?.owner === 'voice');
    expect(voiceEvents.length).toBeGreaterThan(0);
    expect(voiceEvents.every((event) => event.consentTextVersion === 4)).toBe(true);
  } finally {
    release([modelMessage('Släpp provet.')]);
  }
});

test.each(['explicit end', 'expiry'] as const)(
  '%s erases held conversation work while an unknown registered save keeps its barrier',
  async (ending) => {
    let time = Date.now();
    let release!: (value: unknown[]) => void;
    const held = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    const model = textModel(() => held);
    app = await createInstallation(undefined, { modelFetch: model.provider, now: () => time });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const root = `${app.origin}/api/households/${household.id}`;
    const path = `${root}/text-assistant`;
    const post = (url: string, data: object = {}) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    const initial = await (await browser.get(`${root}/map`)).json();
    const proposal = {
      id: 'lo',
      baseRevision: null,
      value: { typeId: initial.types[0].id, name: 'Lo Exempel' },
    };
    expect(
      (
        await post(`${root}/map/draft`, {
          ...proposal,
          version: initial.draft.version,
          contentVersion: initial.contentVersion,
        })
      ).status(),
    ).toBe(200);
    const state: TextAssistantView = await (await post(path, approvedForVisit)).json();
    try {
      expect(
        (
          await post(`${path}/${state.id}/messages`, {
            requestId: crypto.randomUUID(),
            revision: state.revision,
            draftVersion: state.review.version,
            contentVersion: state.review.contentVersion,
            text: 'Beskriv mitt utkast utan att ändra eller spara.',
          })
        ).status(),
      ).toBe(202);
      await expect.poll(() => model.requests.length).toBe(1);
      const operationId = 'registered-independent-save';
      const registered = await post(`${root}/map/operations`, {
        operationId,
        version: state.review.version,
        contentVersion: state.review.contentVersion,
      });
      expect(registered.status(), await registered.text()).toBe(200);
      if (ending === 'explicit end') {
        const ended = await post(`${path}/${state.id}/stop`);
        expect(ended.status(), await ended.text()).toBe(200);
      } else {
        expect(state.expiresAt).toBeTypeOf('number');
        time = state.expiresAt as number;
        await signIn(browser, app.origin);
        const expired = await browser.get(`${path}/${state.id}`);
        expect(expired.status(), await expired.text()).toBe(404);
      }
      release([
        modelTool('propose_object', {
          ...proposal,
          version: state.review.version,
          contentVersion: state.review.contentVersion,
          value: { ...proposal.value, name: 'För sent' },
        }),
      ]);
      await restart();
      expect((await browser.get(`${path}/${state.id}`)).status()).toBe(404);
      const current = await (await browser.get(`${root}/map`)).json();
      expect(current.draft.changes).toMatchObject([{ id: 'lo', after: { name: 'Lo Exempel' } }]);
      expect(current.objects).toEqual([]);
      const denied = await post(`${root}/map/draft`, {
        ...proposal,
        version: current.draft.version,
        contentVersion: current.contentVersion,
      });
      expect(denied.status(), await denied.text()).toBe(409);
      const fresh = await post(path, approvedForVisit);
      expect(fresh.status(), await fresh.text()).toBe(201);
      expect(await fresh.json()).toMatchObject({
        phase: 'recovery',
        pendingParts: [],
        operations: [{ operationId, status: 'pending' }],
        queuedMessages: 0,
      });
      expect(model.requests).toHaveLength(1);
    } finally {
      release([modelMessage('Släpp provet.')]);
    }
  },
);

test('unloaded retained change parts block fresh manual and MCP saves after restart until explicit end', async () => {
  const model = textModel(() => [modelTool('ask_questions', { questions: ['Vilken cykel?'] })]);
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const root = `${app.origin}/api/households/${household.id}`;
  const path = `${root}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  const initial = await (await browser.get(`${root}/map`)).json();
  expect(
    (
      await post(`${root}/map/draft`, {
        version: initial.draft.version,
        contentVersion: initial.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { typeId: initial.types[0].id, name: 'Lo Exempel' },
      })
    ).status(),
  ).toBe(200);
  let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
  await post(`${path}/${state.id}/messages`, {
    requestId: crypto.randomUUID(),
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
    text: 'Byt cykelns namn, men ändra inte ägaren.',
  });
  await expect
    .poll(async () => {
      state = await (await browser.get(`${path}/${state.id}`)).json();
      return state.phase;
    })
    .toBe('ready');
  expect(state.saveBlocked).toBe(true);
  const token = await authorizeAssistant(browser, app.origin, household.id);
  await restart();
  // Neither the old conversation nor its questions are loaded by these calls.
  const operation = {
    operationId: 'fresh-manual-save',
    version: state.review.version,
    contentVersion: state.review.contentVersion,
  };
  const manual = await post(`${root}/map/operations`, operation);
  expect(manual.status(), await manual.text()).toBe(409);
  expect(await manual.json()).toEqual({ error: 'assistant_questions_pending' });
  const mcp = await callAssistantTool(app.origin, token, 'save_draft', {
    ...operation,
    operationId: 'fresh-mcp-save',
  });
  expect(mcp.error).toBe(true);
  expect(mcp.value).toMatchObject({ error: 'assistant_questions_pending' });
  const other = await post(path, approvedForVisit);
  expect(other.status(), await other.text()).toBe(201);
  const otherView = await other.json();
  expect(otherView).toMatchObject({
    saveBlocked: true,
    pendingParts: [],
  });
  expect(otherView.questions).toBeUndefined();
  await post(`${path}/${state.id}/stop`);
  const saved = await post(`${root}/map/save`, { ...operation, operationId: 'after-explicit-end' });
  expect(saved.status(), await saved.text()).toBe(200);
  expect((await saved.json()).receipt.operationId).toBe('after-explicit-end');
  expect(model.requests).toHaveLength(1);
});

test.each([
  ['pause', 'discard'],
  ['restart', 'discard-review'],
] as const)(
  'an unloaded %s conversation records whole-draft %s before a new draft is saved',
  async (unload, discard) => {
    const model = textModel(() => [
      modelTool('ask_questions', {
        questions: [
          {
            kind: 'change',
            request: 'Ange cykelns användare.',
            question: 'Vem använder cykeln?',
            dependsOnDraft: true,
          },
          {
            kind: 'information',
            request: 'Beskriv utkastet.',
            question: 'Vilket förslag?',
            dependsOnDraft: true,
          },
          {
            kind: 'information',
            request: 'Hitta hjälmen.',
            question: 'Vilken hjälm?',
            dependsOnDraft: false,
          },
        ],
      }),
    ]);
    app = await createInstallation(undefined, { modelFetch: model.provider });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const root = `${app.origin}/api/households/${household.id}`;
    const path = `${root}/text-assistant`;
    const post = (url: string, data: object = {}) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    const initial = await (await browser.get(`${root}/map`)).json();
    const proposal = {
      id: 'lo',
      baseRevision: null,
      value: { typeId: initial.types[0].id, name: 'Lo Exempel' },
    };
    const proposed = await post(`${root}/map/draft`, {
      ...proposal,
      version: initial.draft.version,
      contentVersion: initial.contentVersion,
    });
    expect(proposed.status(), await proposed.text()).toBe(200);
    let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
    const sent = await post(`${path}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text: 'Ange cykelns användare, beskriv utkastet och hitta hjälmen.',
    });
    expect(sent.status(), await sent.text()).toBe(202);
    await expect
      .poll(async () => {
        state = await (await browser.get(`${path}/${state.id}`)).json();
        return state.phase;
      })
      .toBe('ready');
    expect(state.saveBlocked).toBe(true);
    expect(state.pendingParts).toHaveLength(3);
    const parts = state.pendingParts ?? [];
    if (unload === 'restart') await restart();
    else {
      const paused = await post(`${path}/${state.id}/pause`);
      expect(paused.status(), await paused.text()).toBe(200);
    }
    const command = {
      version: state.review.version,
      contentVersion: state.review.contentVersion,
      ...(discard === 'discard-review' ? { kind: 'all' } : {}),
    };
    let discarded = await post(`${root}/map/${discard}`, command);
    if (discard === 'discard-review') {
      expect(discarded.status(), await discarded.text()).toBe(200);
      discarded = await post(`${root}/map/${discard}`, {
        ...command,
        confirmation: (await discarded.json()).plan,
      });
    }
    expect(discarded.status(), await discarded.text()).toBe(200);
    const empty = await (await browser.get(`${root}/map`)).json();
    expect(empty.draft.changes).toEqual([]);
    const fresh = await post(`${root}/map/draft`, {
      ...proposal,
      value: { ...proposal.value, name: 'Nytt förslag' },
      version: empty.draft.version,
      contentVersion: empty.contentVersion,
    });
    expect(fresh.status(), await fresh.text()).toBe(200);
    const current = await (await browser.get(`${root}/map`)).json();
    // No conversation is loaded by discard, the new manual proposal or saving.
    const saved = await post(`${root}/map/save`, {
      operationId: 'after-unloaded-discard',
      version: current.draft.version,
      contentVersion: current.contentVersion,
    });
    expect(saved.status(), await saved.text()).toBe(200);
    expect((await saved.json()).receipt.operationId).toBe('after-unloaded-discard');
    await restart();
    const restored = await browser.get(`${path}/${state.id}`);
    expect(restored.status(), await restored.text()).toBe(200);
    expect(await restored.json()).toMatchObject({
      id: state.id,
      paused: true,
      phase: 'ready',
      saveBlocked: false,
      questions: ['Vilken hjälm?'],
      pendingParts: [
        { ...parts[0], status: 'discarded', revision: 1 },
        { ...parts[1], status: 'discarded', revision: 1 },
        parts[2],
      ],
    });
    expect(model.requests).toHaveLength(1);
  },
);

test('an unloaded unknown batch blocks fresh draft work after restart and status recovery keeps the exact unfinished request', async () => {
  const delivery = controlledBatchDelivery();
  delivery.arm();
  delivery.blockStatus(true);
  let typeId = '';
  const instruction = 'Lägg till Lo och förklara sedan vem som betalar cykeln utan att spara.';
  const model = textModel((input) => {
    const { draft } = JSON.parse(
      String(input.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('submit_changes', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        completion: 'draft',
        continueResponse: true,
        operations: [
          {
            name: 'propose_object',
            arguments: { id: 'lo', baseRevision: null, value: { typeId, name: 'Lo Exempel' } },
          },
        ],
      }),
    ];
  });
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    assistantDispatch: delivery.dispatch,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const root = `${app.origin}/api/households/${household.id}`;
  const path = `${root}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  typeId = (await (await browser.get(`${root}/map`)).json()).types[0].id;
  let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
  await post(`${path}/${state.id}/messages`, {
    requestId: crypto.randomUUID(),
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
    text: instruction,
  });
  await expect
    .poll(async () => {
      state = await (await browser.get(`${path}/${state.id}`)).json();
      return state.phase;
    })
    .toBe('recovery');
  expect(delivery.status().phase).toBe('dropped-after-commit');
  expect(state.pendingParts).toEqual([]);
  const operationId = delivery.status().operationId;
  await restart();
  const map = await (await browser.get(`${root}/map`)).json();
  const other = await post(path, approvedForVisit);
  expect(other.status(), await other.text()).toBe(201);
  const otherView = await other.json();
  expect(otherView.pendingParts).toEqual([]);
  expect(otherView.questions).toBeUndefined();
  const requestId = crypto.randomUUID();
  const text = 'Beskriv utkastet utan att ändra.';
  const blocked = await post(`${path}/${otherView.id}/messages`, {
    requestId,
    revision: otherView.revision,
    draftVersion: map.draft.version,
    contentVersion: map.contentVersion,
    text,
  });
  expect(blocked.status(), await blocked.text()).toBe(202);
  expect(await blocked.json()).toMatchObject({
    taskStatus: 'queued',
    queuedRequests: [{ id: requestId, text, source: 'text' }],
    tasks: [{ id: requestId, status: 'queued' }],
  });
  const waiting = await browser.get(`${path}/${otherView.id}/messages/${requestId}`);
  expect(waiting.status(), await waiting.text()).toBe(200);
  expect(await waiting.json()).toMatchObject({ taskStatus: 'queued' });
  expect(model.requests).toHaveLength(1);
  delivery.blockStatus(false);
  const restored = await browser.get(`${path}/${state.id}`);
  expect(restored.status(), await restored.text()).toBe(200);
  expect(await restored.json()).toMatchObject({ paused: true, batchPending: true });
  const checked = await post(`${path}/${state.id}/recover`, { checkId: crypto.randomUUID() });
  expect(checked.status(), await checked.text()).toBe(200);
  const recovered = await checked.json();
  expect(recovered).toMatchObject({
    paused: true,
    batchPending: false,
    error: 'assistant_request_unfinished',
    completedReplies: expect.arrayContaining([
      expect.objectContaining({
        id: `batch-${operationId}`,
        request: instruction,
        requiredNotice: expect.stringContaining('inte slutfört'),
      }),
      expect.objectContaining({
        request: instruction,
        failed: true,
        reply: expect.stringContaining('inte bekräftat'),
      }),
    ]),
  });
  const after = await (await browser.get(`${root}/map`)).json();
  expect(after.draft.version).toBe(map.draft.version);
  expect(after.draft.changes).toMatchObject([{ id: 'lo', after: { name: 'Lo Exempel' } }]);
  expect(model.requests).toHaveLength(1);
  expect((await (await browser.get(`${root}/map/operations`)).json()).operations).toEqual([]);
});

test('restoration isolates actors and households and removed membership cannot recover old text after reinvitation', async () => {
  const model = textModel(() => [modelMessage('Enskilt provsvar.')]);
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { user: alex } = await (await browser.get(`${app.origin}/api/bootstrap`)).json();
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const root = `${app.origin}/api/households/${household.id}`;
  const path = `${root}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
  await post(`${path}/${state.id}/messages`, {
    requestId: crypto.randomUUID(),
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
    text: 'Enskild provfråga.',
  });
  await expect
    .poll(async () => {
      state = await (await browser.get(`${path}/${state.id}`)).json();
      return state.phase;
    })
    .toBe('ready');
  app.setIdentity(robin);
  let other = await request.newContext();
  try {
    await signIn(other, app.origin, 'microsoft');
    const { user: member } = await (await other.get(`${app.origin}/api/bootstrap`)).json();
    // Only the first household can be initialized through the product. The
    // established access fixture arranges the independent second household.
    const anotherId = crypto.randomUUID();
    app.seedMembership(alex.id, anotherId, 'Annat hushåll');
    expect(
      (
        await browser.get(`${app.origin}/api/households/${anotherId}/text-assistant/${state.id}`)
      ).status(),
    ).toBe(404);
    const invitation = await (await post(`${root}/invitations`, { userId: member.id })).json();
    expect(
      (
        await other.post(`${app.origin}/api/invitations/accept`, {
          headers: { origin: app.origin },
          data: { code: invitation.code },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await post(`${root}/members/${member.id}/role`, { role: 'administrator' })).status(),
    ).toBe(200);
    const cookies = await other.storageState();
    await other.dispose();
    await restart();
    other = await request.newContext({ storageState: cookies });
    expect((await other.get(`${path}/${state.id}`)).status()).toBe(404);
    expect((await (await other.get(`${path}/restore`)).json()).conversation).toBeUndefined();
    expect((await browser.get(`${path}/${state.id}`)).status()).toBe(200);
    const revoked = await other.post(`${root}/members/${alex.id}/revoke`, {
      headers: { origin: app.origin },
      data: {},
    });
    expect(revoked.status(), await revoked.text()).toBe(200);
    expect((await browser.get(`${path}/${state.id}`)).status()).toBe(403);
    const invited = await (
      await other.post(`${root}/invitations`, {
        headers: { origin: app.origin },
        data: { userId: alex.id },
      })
    ).json();
    expect(
      (await post(`${app.origin}/api/invitations/accept`, { code: invited.code })).status(),
    ).toBe(200);
    expect((await browser.get(`${path}/${state.id}`)).status()).toBe(404);
    expect((await (await browser.get(`${path}/restore`)).json()).conversation).toBeUndefined();
    expect(model.requests).toHaveLength(1);
  } finally {
    await other.dispose();
  }
});

test('public ownership reassignment and content replacement invalidate retained conversations before restoration', async () => {
  const model = textModel(() => [modelMessage('Ett svar om det tidigare innehållet.')]);
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const root = `${app.origin}/api/households/${household.id}`;
  const path = `${root}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
  await post(`${path}/${state.id}/messages`, {
    requestId: crypto.randomUUID(),
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
    text: 'Beskriv det tidigare hushållet.',
  });
  await expect
    .poll(async () => {
      state = await (await browser.get(`${path}/${state.id}`)).json();
      return state.phase;
    })
    .toBe('ready');
  const { user } = await (await browser.get(`${app.origin}/api/bootstrap`)).json();
  const ownership = await (await browser.get(`${root}/content-owners`)).json();
  const identity = ownership.identities.find(
    (value: { userId: string }) => value.userId === user.id,
  );
  const changed = await post(`${root}/content-owners/assign`, {
    identityId: identity.id,
    userId: null,
    confirmed: true,
    contentVersion: 1,
  });
  expect(changed.status(), await changed.text()).toBe(200);
  expect((await browser.get(`${path}/${state.id}`)).status()).toBe(404);
  const next: TextAssistantView = await (await post(path, approvedForVisit)).json();
  await post(`${path}/${next.id}/messages`, {
    requestId: crypto.randomUUID(),
    revision: next.revision,
    draftVersion: next.review.version,
    contentVersion: next.review.contentVersion,
    text: 'Beskriv det nya ägarskapet utan att ändra.',
  });
  await expect
    .poll(async () => (await (await browser.get(`${path}/${next.id}`)).json()).phase)
    .toBe('ready');
  const prepared = await (await post(`${root}/exports`)).json();
  const archive = await (await browser.get(`${root}/exports/${prepared.id}`)).body();
  const uploaded = await browser.post(`${root}/imports`, {
    headers: {
      origin: app.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '2',
    },
    data: archive,
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const ready = await uploaded.json();
  const confirmed = await post(`${root}/imports/${ready.id}/confirm`, {
    confirmed: true,
    contentVersion: 2,
  });
  expect(confirmed.status(), await confirmed.text()).toBe(200);
  expect(await confirmed.json()).toMatchObject({ status: 'completed' });
  await restart();
  expect((await browser.get(`${path}/${state.id}`)).status()).toBe(404);
  expect((await browser.get(`${path}/${next.id}`)).status()).toBe(404);
  expect((await (await browser.get(`${path}/restore`)).json()).conversation).toBeUndefined();
  const fresh = await post(path, approvedForVisit);
  expect(fresh.status(), await fresh.text()).toBe(201);
  expect(await fresh.json()).toMatchObject({ review: { contentVersion: 3 }, pendingParts: [] });
  expect(model.requests).toHaveLength(2);
});

test('queued work waits for updated consent and retains its exact wording through approval and restart', async () => {
  let release!: (value: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  const model = textModel(() => held);
  app = await createInstallation(undefined, { modelFetch: model.provider, consentTextVersion: 3 });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const root = `${app.origin}/api/households/${household.id}`;
  const path = `${root}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(path, { consent: { textVersion: 3 } })).json();
  const send = async (text: string) => {
    const response = await post(`${path}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text,
      queue: true,
    });
    expect(response.status(), await response.text()).toBe(202);
    state = await response.json();
  };
  const queued = 'Förklara vem som använder cykeln, men ändra eller spara ingenting.';
  try {
    await send('Beskriv cykeln.');
    await expect.poll(() => model.requests.length).toBe(1);
    await send(queued);
    app.setConversationConsentTextVersion(4);
    release([modelMessage('Det tidigare arbetet är klart.')]);
    await expect
      .poll(async () => {
        state = await (await browser.get(`${path}/${state.id}`)).json();
        return state.paused;
      })
      .toBe(true);
    expect(state.queuedMessages).toBe(1);
    expect(model.requests).toHaveLength(1);
    expect((await post(`${root}/conversation-consent`, { textVersion: 4 })).status()).toBe(200);
    await restart();
    const restored = await browser.get(`${path}/${state.id}`);
    expect(restored.status(), await restored.text()).toBe(200);
    const result = await restored.json();
    expect(result).toMatchObject({
      paused: true,
      queuedMessages: 1,
      queuedRequests: [
        { id: state.tasks?.find((item) => item.status === 'queued')?.id, text: queued },
      ],
    });
    expect(model.requests).toHaveLength(1);
  } finally {
    release([modelMessage('Släpp provet.')]);
  }
});

test('spoken instructions and pending parts survive actual restart with voice paused and no provider reconnect', async () => {
  let time = Date.now();
  const live = liveProvider();
  const model = textModel(() => [modelTool('ask_questions', { questions: ['Vilken cykel?'] })]);
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
    now: () => time,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
  const voice = await post(`${path}/${state.id}/voice`, {
    sdp: 'synthetic-offer',
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
    microphoneOn: true,
  });
  expect(voice.status(), await voice.text()).toBe(201);
  const providerId = [...live.channels.keys()][0];
  const instruction = 'Byt cykelns namn till Blå men behåll ägaren.';
  time += 60_000;
  const deadline = time + 604_800_000;
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: instruction,
    start_ms: 0,
    end_ms: 100,
  });
  // Live can delegate after the utterance has already been received.
  time += 3000;
  live.emit(providerId, {
    type: 'session.delegation.created',
    event_id: crypto.randomUUID(),
    offset_ms: 100,
    delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
  });
  await expect.poll(() => model.requests.length, { timeout: 6000 }).toBe(1);
  await expect
    .poll(async () => {
      state = await (await browser.get(`${path}/${state.id}`)).json();
      return state.phase;
    })
    .toBe('ready');
  const parts = state.pendingParts;
  expect(parts).toHaveLength(1);
  expect(state.expiresAt).toBe(deadline);
  await restart();
  const response = await browser.get(`${path}/${state.id}`);
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toMatchObject({
    paused: true,
    pendingParts: parts,
    expiresAt: deadline,
    saveBlocked: true,
    conversation: expect.arrayContaining([
      expect.objectContaining({ role: 'user', text: instruction }),
    ]),
  });
  const refused = await post(`${path}/${state.id}/voice`, {
    sdp: 'synthetic-offer',
    revision: state.revision,
    draftVersion: state.review.version,
    contentVersion: state.review.contentVersion,
  });
  expect(refused.status(), await refused.text()).toBe(409);
  expect(model.requests).toHaveLength(1);
  expect(live.requests).toHaveLength(1);
});

test.each(['replace', 'end', 'withdraw'] as const)(
  'restoration cannot return or recreate a snapshot retired during connection: %s',
  async (action) => {
    let restoring = false;
    let held = false;
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const connected = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const model = textModel(() => [modelMessage('Ett svar som hör till det gamla samtalet.')]);
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      assistantDispatch: async (incoming, dispatch) => {
        const rpc =
          incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
            ? await incoming
                .clone()
                .json()
                .catch(() => null)
            : null;
        const response = await dispatch(incoming);
        if (restoring && !held && rpc?.method === 'tools/list') {
          held = true;
          entered();
          await waiting;
        }
        return response;
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const root = `${app.origin}/api/households/${household.id}`;
    const path = `${root}/text-assistant`;
    const post = (url: string, data: object = {}) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    let state: TextAssistantView = await (await post(path, approvedForVisit)).json();
    await post(`${path}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text: 'Den tidigare samtalstexten ska inte återuppstå.',
    });
    await expect
      .poll(async () => {
        state = await (await browser.get(`${path}/${state.id}`)).json();
        return state.phase;
      })
      .toBe('ready');
    await restart();
    let importId: string | undefined;
    if (action === 'replace') {
      const prepared = await (await post(`${root}/exports`)).json();
      const archive = await (await browser.get(`${root}/exports/${prepared.id}`)).body();
      const uploaded = await browser.post(`${root}/imports`, {
        headers: {
          origin: app.origin,
          'content-type': 'application/zip',
          'X-Skyttel-Content-Version': '1',
        },
        data: archive,
      });
      expect(uploaded.status(), await uploaded.text()).toBe(201);
      importId = (await uploaded.json()).id;
    }
    restoring = true;
    const returning = browser.get(`${path}/restore`);
    try {
      await connected;
      const retired =
        action === 'replace'
          ? await post(`${root}/imports/${importId}/confirm`, {
              confirmed: true,
              contentVersion: 1,
            })
          : action === 'end'
            ? await post(`${path}/${state.id}/stop`)
            : await post(`${root}/conversation-consent/revoke`);
      expect(retired.status(), await retired.text()).toBe(200);
      release();
      const response = await returning;
      expect(response.status(), await response.text()).toBe(200);
      expect((await response.json()).conversation).toBeUndefined();
      await restart();
      expect([403, 404]).toContain((await browser.get(`${path}/${state.id}`)).status());
      expect(model.requests).toHaveLength(1);
    } finally {
      release();
      await returning.catch(() => undefined);
    }
  },
);
