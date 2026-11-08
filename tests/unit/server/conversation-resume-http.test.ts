import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, modelTool, pendingUpdate, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let crashDirectory: string | undefined;
const browsers: APIRequestContext[] = [];
afterEach(async () => {
  for (const browser of browsers.splice(0)) await browser.dispose();
  await app?.close();
  if (crashDirectory) rmSync(crashDirectory, { recursive: true, force: true });
  crashDirectory = undefined;
});

async function browser() {
  const client = await request.newContext();
  browsers.push(client);
  await signIn(client, app.origin);
  return client;
}

test.each([false, true])(
  'explicit resume checks a registered save before continuing only its unfinished explanation: explanation=%s',
  async (explanation) => {
    let saved = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const model = textModel(
      (body) => {
        if (model.requests.length > 1)
          return [modelMessage('Ett utkast innehåller dina osparade ändringar.')];
        const current = JSON.parse(
          String(body.input.findLast((item) => item.role === 'user')?.content),
        );
        return [
          modelTool('save_draft', {
            version: current.draft.version,
            contentVersion: current.draft.contentVersion,
          }),
        ];
      },
      (body) => [
        modelMessage(
          JSON.stringify(
            body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
              ? {
                  mode: 'work',
                  request: JSON.parse(String(body.input[0].content)).current,
                  responseRequired: explanation,
                }
              : { decision: 'allow', complete: true, fulfillsRequest: true },
          ),
        ),
      ],
    );
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
        if (rpc?.params?.name === 'save_draft' && !saved) {
          const envelope = await response.clone().json();
          expect(envelope.result.isError).not.toBe(true);
          saved = true;
          await held;
          throw new Error('Controlled committed save response loss during pause');
        }
        return response;
      },
    });
    try {
      const client = await browser();
      const { household } = await (await createHousehold(client, app.origin)).json();
      const root = `${app.origin}/api/households/${household.id}`;
      const post = (url: string, data: object = {}) =>
        client.post(url, { headers: { origin: app.origin }, data });
      const map = `${root}/map`;
      const initial = await (await client.get(map)).json();
      expect(
        (
          await post(`${map}/draft`, {
            version: initial.draft.version,
            contentVersion: initial.contentVersion,
            id: 'lo',
            baseRevision: null,
            value: { typeId: initial.types[0].id, name: 'Lo' },
          })
        ).status(),
      ).toBe(200);
      const base = `${root}/text-assistant`;
      const view: TextAssistantView = await (await post(base, approvedForVisit)).json();
      const endpoint = `${base}/${view.id}`;
      const requestId = crypto.randomUUID();
      expect(
        (
          await post(`${endpoint}/messages`, {
            revision: view.revision,
            draftVersion: view.review.version,
            contentVersion: view.review.contentVersion,
            requestId,
            text: explanation
              ? 'Beskriv vad ett utkast är. Spara hela utkastet.'
              : 'Spara hela utkastet.',
          })
        ).status(),
      ).toBe(202);
      await expect.poll(() => saved).toBe(true);
      const operations = (await (await client.get(`${map}/operations`)).json()).operations;
      expect(operations).toHaveLength(1);
      expect((await post(`${endpoint}/pause`)).status()).toBe(200);
      release();
      const paused = await client.get(endpoint);
      expect(paused.status(), await paused.text()).toBe(200);
      expect(await paused.json()).toMatchObject({ paused: true, phase: 'recovery' });
      expect(model.requests).toHaveLength(1);
      const resumed = await post(`${endpoint}/resume`, approvedForVisit);
      expect(resumed.status(), await resumed.text()).toBe(200);
      let completed!: TextAssistantView;
      await expect
        .poll(async () => {
          completed = await (await client.get(endpoint)).json();
          return completed.phase;
        })
        .toBe('ready');
      expect(model.requests).toHaveLength(explanation ? 2 : 1);
      expect(completed).toMatchObject({
        paused: false,
        unfinishedRequests: [],
      });
      if (!explanation)
        expect(completed.receipt).toMatchObject({ operationId: operations[0].operationId });
      if (explanation) {
        expect(completed.modelReply).toBe('Ett utkast innehåller dina osparade ändringar.');
        expect(completed.requiredNotice).toBeUndefined();
        expect(completed.receipt).toBeUndefined();
      }
      expect((await (await client.get(`${map}/operations`)).json()).operations).toHaveLength(1);
      expect((await (await client.get(`${map}/history`)).json()).history).toEqual([
        expect.objectContaining({ operationId: operations[0].operationId }),
      ]);
      expect(await (await client.get(map)).json()).toMatchObject({
        objects: [{ id: 'lo', name: 'Lo' }],
        draft: { changes: [] },
      });
    } finally {
      release();
    }
  },
);

test('another device discovers separate retained conversations and opens the selected one paused without model work', async () => {
  const model = textModel(() => [modelMessage('Jag väntar på ditt nästa uppdrag.')]);
  app = await createInstallation(undefined, { modelFetch: model.provider });
  const first = await browser();
  const { household } = await (await createHousehold(first, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (client: APIRequestContext, url: string, data: object = {}) =>
    client.post(url, { headers: { origin: app.origin }, data });
  const start = async () => {
    const response = await post(first, path, approvedForVisit);
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()) as TextAssistantView;
  };
  const original = await start();
  const chosen = await post(first, `${path}/${original.id}/model-choice`, {
    model: 'gpt-6.1-sol',
    effort: 'low',
  });
  expect(chosen.status(), await chosen.text()).toBe(200);
  const sent = await post(first, `${path}/${original.id}/messages`, {
    requestId: crypto.randomUUID(),
    revision: original.revision,
    draftVersion: original.review.version,
    contentVersion: original.review.contentVersion,
    text: 'Beskriv mitt garage utan att ändra något.',
  });
  expect(sent.status(), await sent.text()).toBe(202);
  let completed!: TextAssistantView;
  await expect
    .poll(async () => {
      completed = await (await first.get(`${path}/${original.id}`)).json();
      return completed.phase;
    })
    .toBe('ready');
  expect((await post(first, `${path}/${original.id}/pause`)).status()).toBe(200);
  const second = await start();
  expect(
    (
      await post(first, `${path}/${second.id}/model-choice`, {
        model: 'gpt-6.1-terra',
        effort: 'medium',
      })
    ).status(),
  ).toBe(200);
  const activeList = await first.get(`${path}/retained`);
  expect(
    (await activeList.json()).conversations.find((item: { id: string }) => item.id === second.id),
  ).toMatchObject({ paused: false });
  expect((await post(first, `${path}/${second.id}/pause`)).status()).toBe(200);
  const other = await browser();
  const listed = await other.get(`${path}/retained`);
  expect(listed.status(), await listed.text()).toBe(200);
  expect((await listed.json()).conversations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: original.id, expiresAt: completed.expiresAt }),
      expect.objectContaining({ id: second.id }),
    ]),
  );
  const calls = model.requests.length;
  const opened = await post(other, `${path}/retained/${original.id}/open`);
  expect(opened.status(), await opened.text()).toBe(200);
  expect(await opened.json()).toMatchObject({
    id: original.id,
    paused: true,
    expiresAt: completed.expiresAt,
    modelChoice: { model: 'gpt-6.1-sol', effort: 'low' },
    conversation: [
      { role: 'user', text: 'Beskriv mitt garage utan att ändra något.' },
      { role: 'assistant', text: 'Jag väntar på ditt nästa uppdrag.' },
    ],
  });
  expect(model.requests).toHaveLength(calls);
  const fresh = await post(other, path, approvedForVisit);
  expect(fresh.status(), await fresh.text()).toBe(201);
  expect(await fresh.json()).toMatchObject({
    modelChoice: { model: 'gpt-6.1-terra', effort: 'medium' },
  });
});

test('only explicit approved resume renews the retained lifetime and enables the same conversation', async () => {
  let time = Date.now();
  const model = textModel(() => [modelMessage('Du kan fortsätta i samma samtal.')]);
  app = await createInstallation(undefined, { modelFetch: model.provider, now: () => time });
  const client = await browser();
  const { household } = await (await createHousehold(client, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object = {}) =>
    client.post(url, { headers: { origin: app.origin }, data });
  const started = await post(path, approvedForVisit);
  expect(started.status(), await started.text()).toBe(201);
  const original: TextAssistantView = await started.json();
  expect((await post(`${path}/${original.id}/pause`)).status()).toBe(200);
  time += 60_000;
  const restored = await client.get(`${path}/restore`);
  expect((await restored.json()).conversation).toMatchObject({
    id: original.id,
    paused: true,
    expiresAt: original.expiresAt,
  });
  const refused = await post(`${path}/${original.id}/resume`);
  expect(refused.status(), await refused.text()).toBe(403);
  expect(await refused.json()).toEqual({ error: 'conversation_consent_required' });
  const resumed = await post(`${path}/${original.id}/resume`, approvedForVisit);
  expect(resumed.status(), await resumed.text()).toBe(200);
  expect(await resumed.json()).toMatchObject({
    id: original.id,
    paused: false,
    expiresAt: time + 604_800_000,
  });
  expect(model.requests).toHaveLength(0);
  const sent = await post(`${path}/${original.id}/messages`, {
    requestId: crypto.randomUUID(),
    revision: original.revision,
    draftVersion: original.review.version,
    contentVersion: original.review.contentVersion,
    text: 'Fortsätt förklara utan att ändra något.',
  });
  expect(sent.status(), await sent.text()).toBe(202);
  await expect.poll(() => model.requests.length).toBe(1);
});

test('explicit resume after actual restart continues the interrupted identity before its queue without duplicating conversation turns', async () => {
  let time = Date.now();
  let release!: (value: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const model = textModel(() => {
    const call = calls++;
    return call === 0
      ? held
      : [modelMessage(call === 1 ? 'Första svaret är klart.' : 'Andra svaret är klart.')];
  });
  app = await createInstallation(undefined, { modelFetch: model.provider, now: () => time });
  const first = await browser();
  const { household } = await (await createHousehold(first, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (client: APIRequestContext, url: string, data: object = {}) =>
    client.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(first, path, approvedForVisit)).json();
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  try {
    const send = async (requestId: string, text: string) => {
      const response = await post(first, `${path}/${state.id}/messages`, {
        requestId,
        text,
        revision: state.revision,
        draftVersion: state.review.version,
        contentVersion: state.review.contentVersion,
        queue: true,
      });
      expect(response.status(), await response.text()).toBe(202);
      state = await response.json();
    };
    await send(firstId, 'Förklara garaget utan att ändra något.');
    await expect.poll(() => model.requests.length).toBe(1);
    await send(secondId, 'Förklara sedan cykeln utan att ändra något.');
    expect(state.queuedMessages).toBe(1);
    await app.restart();
    time += 60 * 60_000;
    const other = await browser();
    const opened = await post(other, `${path}/retained/${state.id}/open`);
    expect(opened.status(), await opened.text()).toBe(200);
    expect(await opened.json()).toMatchObject({ paused: true, queuedMessages: 1 });
    expect(model.requests).toHaveLength(1);
    const resumed = await post(other, `${path}/${state.id}/resume`, approvedForVisit);
    expect(resumed.status(), await resumed.text()).toBe(200);
    await expect
      .poll(async () => {
        state = await (await other.get(`${path}/${state.id}`)).json();
        return state.tasks?.filter((task) => task.status === 'completed').map((task) => task.id);
      })
      .toEqual([firstId, secondId]);
    expect(state.conversation?.filter((row) => row.role === 'user').map((row) => row.text)).toEqual(
      ['Förklara garaget utan att ändra något.', 'Förklara sedan cykeln utan att ändra något.'],
    );
    expect(
      state.conversation?.filter((row) => row.role === 'assistant').map((row) => row.text),
    ).toEqual(['Första svaret är klart.', 'Andra svaret är klart.']);
    expect(model.requests).toHaveLength(3);
  } finally {
    release([modelMessage('Det sena gamla svaret får inte användas.')]);
  }
});

test('after actual restart the oldest retained conversation resumes while its younger conversation stays paused until explicitly resumed', async () => {
  let release!: (value: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  const started: string[] = [];
  let calls = 0;
  const model = textModel((body) => {
    if (calls++ === 0) return held;
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    started.push(input.message);
    return [modelMessage(`Klart: ${input.message}`)];
  });
  app = await createInstallation(undefined, { modelFetch: model.provider });
  const first = await browser();
  const { household } = await (await createHousehold(first, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (client: APIRequestContext, url: string, data: object = {}) =>
    client.post(url, { headers: { origin: app.origin }, data });
  const send = async (client: APIRequestContext, state: TextAssistantView, text: string) => {
    const response = await post(client, `${path}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text,
      queue: true,
    });
    expect(response.status(), await response.text()).toBe(202);
    return (await response.json()) as TextAssistantView;
  };
  try {
    const older = await send(
      first,
      await (await post(first, path, approvedForVisit)).json(),
      'Först garaget, utan ändringar.',
    );
    await expect.poll(() => model.requests.length).toBe(1);
    const second = await browser();
    const younger = await send(
      second,
      await (await post(second, path, approvedForVisit)).json(),
      'Sedan cykeln, utan ändringar.',
    );
    expect(younger.queuedMessages).toBe(1);
    await app.restart();
    const other = await browser();
    const opened = await post(other, `${path}/retained/${older.id}/open`);
    expect(opened.status(), await opened.text()).toBe(200);
    expect(await opened.json()).toMatchObject({ paused: true });
    const resumed = await post(other, `${path}/${older.id}/resume`, approvedForVisit);
    expect(resumed.status(), await resumed.text()).toBe(200);
    await expect
      .poll(async () => (await (await other.get(`${path}/${older.id}`)).json()).phase)
      .toBe('ready');
    expect(started).toEqual(['Först garaget, utan ändringar.']);
    const retained = await (await other.get(`${path}/retained`)).json();
    expect(retained.conversations).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: younger.id, paused: true })]),
    );
    const youngerOpened = await post(other, `${path}/retained/${younger.id}/open`);
    expect(youngerOpened.status(), await youngerOpened.text()).toBe(200);
    expect(await youngerOpened.json()).toMatchObject({ paused: true, queuedMessages: 1 });
    expect(started).toEqual(['Först garaget, utan ändringar.']);
    expect((await post(other, `${path}/${younger.id}/resume`, approvedForVisit)).status()).toBe(
      200,
    );
    await expect
      .poll(async () => (await (await other.get(`${path}/${younger.id}`)).json()).phase)
      .toBe('ready');
    expect(started).toEqual(['Först garaget, utan ändringar.', 'Sedan cykeln, utan ändringar.']);
    expect(model.requests).toHaveLength(3);
  } finally {
    release([modelMessage('Det gamla svaret får inte användas.')]);
  }
});

test('after actual restart an older retained question can be answered while a younger question stays paused and blocks saving', async () => {
  const model = textModel((body) => {
    const call = model.requests.length;
    if (call <= 2)
      return [
        modelTool('ask_questions', {
          questions: [
            {
              kind: call === 1 ? 'information' : 'change',
              request: call === 1 ? 'Beskriv garaget.' : 'Byt cykelns namn till Blå.',
              question: call === 1 ? 'Vilket garage?' : 'Vilken cykel?',
              dependsOnDraft: call !== 1,
            },
          ],
        }),
      ];
    if (call === 3)
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [pendingUpdate(body, 'Vilket garage?', { answer: 'Garaget heter Västra.' })],
          continueResponse: true,
        }),
      ];
    return [modelMessage('Garaget heter Västra.')];
  });
  app = await createInstallation(undefined, { modelFetch: model.provider });
  const first = await browser();
  const { household } = await (await createHousehold(first, app.origin)).json();
  const root = `${app.origin}/api/households/${household.id}`;
  const path = `${root}/text-assistant`;
  const post = (client: APIRequestContext, url: string, data: object = {}) =>
    client.post(url, { headers: { origin: app.origin }, data });
  const send = async (client: APIRequestContext, state: TextAssistantView, text: string) => {
    const response = await post(client, `${path}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text,
    });
    expect(response.status(), await response.text()).toBe(202);
  };
  const question = async (client: APIRequestContext, text: string) => {
    let state: TextAssistantView = await (await post(client, path, approvedForVisit)).json();
    await send(client, state, text);
    await expect
      .poll(async () => {
        state = await (await client.get(`${path}/${state.id}`)).json();
        return state.tasks?.at(-1)?.status;
      })
      .toBe('completed');
    expect(state).toMatchObject({ phase: 'ready', questionPending: true, queuedMessages: 0 });
    expect(state.unfinishedRequests).toHaveLength(1);
    return state;
  };
  const older = await question(first, 'Beskriv garaget.');
  const second = await browser();
  const younger = await question(second, 'Byt cykelns namn till Blå.');
  expect(younger.saveBlocked).toBe(true);
  await app.restart();
  const other = await browser();
  const opened = await post(other, `${path}/retained/${older.id}/open`);
  expect(opened.status(), await opened.text()).toBe(200);
  expect(await opened.json()).toMatchObject({ paused: true, questions: ['Vilket garage?'] });
  const resumed = await post(other, `${path}/${older.id}/resume`, approvedForVisit);
  expect(resumed.status(), await resumed.text()).toBe(200);
  expect(model.requests).toHaveLength(2);
  await send(other, await resumed.json(), 'Det västra garaget.');
  await expect
    .poll(async () => (await (await other.get(`${path}/${older.id}`)).json()).modelReply)
    .toBe('Garaget heter Västra.');
  expect(model.requests).toHaveLength(4);
  const retained = await (await other.get(`${path}/retained`)).json();
  expect(retained.conversations).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: younger.id, paused: true })]),
  );
  const manualSave = await post(other, `${root}/map/operations`, {
    operationId: 'younger-question-still-blocks-saving',
    version: older.review.version,
    contentVersion: older.review.contentVersion,
  });
  expect(manualSave.status(), await manualSave.text()).toBe(409);
  expect(await manualSave.json()).toEqual({ error: 'assistant_questions_pending' });
});

test('a new request after reopening an active crash image waits for earlier retained work before that conversation is loaded', async () => {
  let release!: (value: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
  });
  const started: string[] = [];
  let calls = 0;
  const model = textModel((body) => {
    if (calls++ === 0) return held;
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    started.push(input.message);
    return [modelMessage(`Klart: ${input.message}`)];
  });
  crashDirectory = mkdtempSync(join(tmpdir(), 'skyttel-conversation-order-crash-'));
  const oldMigrations = join(crashDirectory, 'migrations');
  mkdirSync(oldMigrations);
  for (const file of readdirSync('migrations').filter((file) => Number(file.slice(0, 3)) <= 46))
    copyFileSync(join('migrations', file), join(oldMigrations, file));
  app = await createInstallation(undefined, {
    migrationsDirectory: oldMigrations,
    modelFetch: model.provider,
  });
  const first = await browser();
  const { household } = await (await createHousehold(first, app.origin)).json();
  const rootPath = `/api/households/${household.id}/text-assistant`;
  const post = (client: APIRequestContext, url: string, data: object = {}) =>
    client.post(url, { headers: { origin: app.origin }, data });
  let original: TextAssistantView = await (
    await post(first, `${app.origin}${rootPath}`, approvedForVisit)
  ).json();
  const send = async (client: APIRequestContext, state: TextAssistantView, text: string) => {
    const response = await post(client, `${app.origin}${rootPath}/${state.id}/messages`, {
      requestId: crypto.randomUUID(),
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text,
      queue: true,
    });
    expect(response.status(), await response.text()).toBe(202);
    return (await response.json()) as TextAssistantView;
  };
  try {
    original = await send(first, original, 'Först garaget, utan ändringar.');
    await expect.poll(() => model.requests.length).toBe(1);
    original = await send(first, original, 'Sedan cykeln, utan ändringar.');
    const snapshot = join(crashDirectory, 'skyttel.db');
    // Capture the exact durable image while work is active. The reopened copy
    // receives none of the graceful close's pause writes.
    await app.saveDatabase(snapshot);
    await app.close();
    app = await createInstallation(undefined, {
      databasePath: snapshot,
      modelFetch: model.provider,
    });
    const newerDevice = await browser();
    const fresh: TextAssistantView = await (
      await post(newerDevice, `${app.origin}${rootPath}`, approvedForVisit)
    ).json();
    const later = await send(newerDevice, fresh, 'Till sist förrådet, utan ändringar.');
    expect(later.tasks?.at(-1)?.status).toBe('queued');
    expect(model.requests).toHaveLength(1);
    const returningDevice = await browser();
    const opened = await post(
      returningDevice,
      `${app.origin}${rootPath}/retained/${original.id}/open`,
    );
    expect(opened.status(), await opened.text()).toBe(200);
    const resumed = await post(
      returningDevice,
      `${app.origin}${rootPath}/${original.id}/resume`,
      approvedForVisit,
    );
    expect(resumed.status(), await resumed.text()).toBe(200);
    await expect.poll(() => started).toHaveLength(3);
    expect(started).toEqual([
      'Först garaget, utan ändringar.',
      'Sedan cykeln, utan ändringar.',
      'Till sist förrådet, utan ändringar.',
    ]);
  } finally {
    release([modelMessage('Det gamla svaret får inte användas.')]);
  }
});

test.each([false, true])(
  'a spoken clarification resumes only unfinished work after actual restart without renewing its old save request: lostBatchReply=%s',
  async (lostBatchReply) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let interrupted = false;
    let typeId = '';
    const model = textModel((body) => {
      const current = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (model.requests.length === 1)
        return [
          modelTool('ask_questions', {
            questions: [
              {
                kind: 'change',
                request: 'Lägg till personen.',
                question: 'Vad heter personen?',
                dependsOnDraft: true,
              },
            ],
          }),
        ];
      const part = current.pendingParts[0];
      if (model.requests.length === 2)
        return [
          modelTool('ask_questions', {
            questions: [],
            updates: [
              {
                id: part.id,
                revision: part.revision,
                action: 'clarify',
                messageId: current.messageId,
                evidence: current.message,
              },
            ],
            continueResponse: true,
          }),
        ];
      const partial = model.requests.length === 3;
      return [
        modelTool('submit_changes', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          resolves: partial ? [{ id: part.id, revision: part.revision }] : [],
          completion: 'draft',
          continueResponse: partial,
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: partial ? 'lo' : 'mira',
                baseRevision: null,
                value: { typeId, name: partial ? 'Lo' : 'Mira' },
              },
            },
          ],
        }),
      ];
    });
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        const body = JSON.parse(String(init?.body));
        if (
          !lostBatchReply &&
          !body.instructions.startsWith('SKYTTEL_TURN_') &&
          model.requests.length === 3 &&
          !interrupted
        ) {
          interrupted = true;
          await held;
          return Response.json(
            { error: { message: 'Retired provider response' } },
            { status: 503 },
          );
        }
        return model.provider(input, init);
      },
      assistantDispatch: async (incoming, dispatch) => {
        const rpc =
          incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
            ? await incoming
                .clone()
                .json()
                .catch(() => null)
            : null;
        const response = await dispatch(incoming);
        if (!lostBatchReply || interrupted || rpc?.params?.name !== 'apply_draft_batch')
          return response;
        const envelope = await response.clone().json();
        expect(envelope.result.isError).not.toBe(true);
        const result = JSON.parse(
          envelope.result.content.find((item: { type: string }) => item.type === 'text').text,
        );
        expect(result.status).toBe('committed');
        interrupted = true;
        await held;
        throw new Error('Controlled committed batch response loss during restart');
      },
    });
    const first = await browser();
    const { household } = await (await createHousehold(first, app.origin)).json();
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const map = `${app.origin}/api/households/${household.id}/map`;
    typeId = (await (await first.get(map)).json()).types[0].id;
    const post = (client: APIRequestContext, url: string, data: object = {}) =>
      client.post(url, { headers: { origin: app.origin }, data });
    let state: TextAssistantView = await (await post(first, path, approvedForVisit)).json();
    const endpoint = `${path}/${state.id}`;
    const send = (data: object) =>
      post(first, `${endpoint}/messages`, {
        revision: state.revision,
        draftVersion: state.review.version,
        contentVersion: state.review.contentVersion,
        ...data,
      });
    try {
      expect(
        (await send({ requestId: crypto.randomUUID(), text: 'Lägg till personen.' })).status(),
      ).toBe(202);
      await expect
        .poll(async () => {
          state = await (await first.get(endpoint)).json();
          return state.phase;
        })
        .toBe('ready');
      const question = state.pendingParts?.[0];
      expect(question).toMatchObject({ status: 'waiting', revision: 0 });
      if (!question) throw new Error('Missing waiting question');
      const requestId = crypto.randomUUID();
      const text = 'Personen heter Lo. Lägg också till Mira. Spara hela utkastet.';
      expect(
        (
          await send({
            requestId,
            text,
            voiceContext: '[]',
            answerTo: [{ id: question.id, revision: question.revision }],
          })
        ).status(),
      ).toBe(202);
      await expect.poll(() => interrupted).toBe(true);
      state = await (await first.get(endpoint)).json();
      expect(state.pendingParts?.[0]).toMatchObject({
        id: question.id,
        status: lostBatchReply ? 'ready' : 'completed',
        revision: lostBatchReply ? 1 : 2,
      });
      expect((await (await first.get(map)).json()).draft).toMatchObject({
        version: 1,
        changes: [{ id: 'lo', after: { name: 'Lo' } }],
      });
      await app.restart();
      const other = await browser();
      const opened = await post(other, `${path}/retained/${state.id}/open`);
      expect(opened.status(), await opened.text()).toBe(200);
      expect(await opened.json()).toMatchObject({ paused: true, review: { version: 1 } });
      expect(model.requests).toHaveLength(3);
      const resumed = await post(other, `${endpoint}/resume`, approvedForVisit);
      expect(resumed.status(), await resumed.text()).toBe(200);
      await expect
        .poll(async () => {
          state = await (await other.get(endpoint)).json();
          return [state.phase, state.error];
        })
        .toEqual(['ready', undefined]);
      expect(state.pendingParts?.[0]).toMatchObject({
        id: question.id,
        status: 'completed',
        revision: 2,
      });
      expect(state.tasks?.filter((task) => task.id === requestId)).toEqual([
        expect.objectContaining({ status: 'completed' }),
      ]);
      expect(
        state.conversation?.filter((row) => row.role === 'user').map((row) => row.text),
      ).toEqual(['Lägg till personen.']);
      expect((await (await other.get(map)).json()).draft).toMatchObject({
        version: 2,
        changes: [
          { id: 'lo', after: { name: 'Lo' } },
          { id: 'mira', after: { name: 'Mira' } },
        ],
      });
      expect(model.requests).toHaveLength(4);
      expect(
        JSON.parse(
          String(model.requests[3].input.findLast((item) => item.role === 'user')?.content),
        ),
      ).toMatchObject({ messageId: requestId });
      expect((await (await other.get(`${map}/operations`)).json()).operations).toEqual([]);
      expect((await (await other.get(`${map}/history`)).json()).history).toEqual([]);
      expect(state.receipt).toBeUndefined();
      expect(state.requiredNotice).toContain('upphävt sparbegäran');
    } finally {
      release();
    }
  },
);

test('resume after actual restart preserves a verified partial batch and never renews its old save request', async () => {
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const secondWork = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let calls = 0;
  let typeId = '';
  const model = textModel((body) => {
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('submit_changes', {
        version: current.draft.version,
        contentVersion: current.draft.contentVersion,
        completion: 'draft',
        continueResponse: model.requests.length === 1,
        operations: (model.requests.length === 1 ? ['lo'] : ['lo', 'mira']).map((id) => ({
          name: 'propose_object',
          arguments: {
            id,
            baseRevision: null,
            value: {
              typeId,
              name: id === 'lo' ? 'Lo' : 'Mira',
              ...(model.requests.length > 1 ? { properties: [] } : {}),
            },
          },
        })),
      }),
    ];
  });
  app = await createInstallation(undefined, {
    modelFetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (!body.instructions.startsWith('SKYTTEL_TURN_') && ++calls === 2) {
        entered();
        await held;
        return Response.json({ error: { message: 'Retired provider response' } }, { status: 503 });
      }
      return model.provider(input, init);
    },
  });
  const first = await browser();
  const { household } = await (await createHousehold(first, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const map = `${app.origin}/api/households/${household.id}/map`;
  typeId = (await (await first.get(map)).json()).types[0].id;
  const post = (client: APIRequestContext, url: string, data: object = {}) =>
    client.post(url, { headers: { origin: app.origin }, data });
  let state: TextAssistantView = await (await post(first, path, approvedForVisit)).json();
  const requestId = crypto.randomUUID();
  try {
    const sent = await post(first, `${path}/${state.id}/messages`, {
      requestId,
      revision: state.revision,
      draftVersion: state.review.version,
      contentVersion: state.review.contentVersion,
      text: 'Lägg till Lo och Mira. Spara hela utkastet.',
    });
    expect(sent.status(), await sent.text()).toBe(202);
    await secondWork;
    expect((await (await first.get(map)).json()).draft).toMatchObject({
      version: 1,
      changes: [{ id: 'lo', after: { name: 'Lo' } }],
    });
    await app.restart();
    const other = await browser();
    const opened = await post(other, `${path}/retained/${state.id}/open`);
    expect(opened.status(), await opened.text()).toBe(200);
    expect(await opened.json()).toMatchObject({ paused: true, review: { version: 1 } });
    const resumed = await post(other, `${path}/${state.id}/resume`, approvedForVisit);
    expect(resumed.status(), await resumed.text()).toBe(200);
    await expect
      .poll(async () => {
        state = await (await other.get(`${path}/${state.id}`)).json();
        return state.phase;
      })
      .toBe('ready');
    const current = await (await other.get(map)).json();
    expect(current.draft).toMatchObject({
      version: 2,
      changes: [
        { id: 'lo', after: { name: 'Lo' } },
        { id: 'mira', after: { name: 'Mira' } },
      ],
    });
    expect(current.objects).toEqual([]);
    expect((await (await other.get(`${map}/operations`)).json()).operations).toEqual([]);
    expect(state.receipt).toBeUndefined();
    expect(state.requiredNotice).toContain('upphävt sparbegäran');
    expect(state.tasks?.find((task) => task.id === requestId)?.status).toBe('completed');
    expect(state.conversation?.filter((row) => row.role === 'user')).toHaveLength(1);
  } finally {
    release();
  }
});
