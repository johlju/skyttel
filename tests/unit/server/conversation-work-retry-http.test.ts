import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { controlledBatchDelivery } from '../../support/batch-response-delivery.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, modelTool, readOnlyScope, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let release = () => {};
let crashDirectory: string | undefined;
afterEach(async () => {
  release();
  await browser?.dispose();
  await app?.close();
  if (crashDirectory) rmSync(crashDirectory, { recursive: true, force: true });
  crashDirectory = undefined;
});

test.each([
  { boundary: 'interpretation', reply: 'incomplete', action: 'retry' },
  { boundary: 'interpretation', reply: 'invalid', action: 'abandon' },
  { boundary: 'checking', reply: 'incomplete', action: 'abandon' },
  { boundary: 'checking', reply: 'invalid', action: 'retry' },
] as const)(
  'an $reply $boundary reply pauses the original request and queue until explicit $action',
  async ({ boundary, reply, action }) => {
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let typeId: string;
    let failed = false;
    let checks = 0;
    let calls = 0;
    const original = 'Lägg till Lo och Mira. Spara hela utkastet.';
    const queued = ['Beskriv kartan.', 'Beskriv hushållets typer.'];
    const model = textModel(
      (body) => {
        const current = JSON.parse(
          String(body.input.findLast((item) => item.role === 'user')?.content),
        );
        if (current.message !== original) return [modelMessage(`Svar: ${current.message}`)];
        const first = !current.draft.changes.length;
        return [
          modelTool('submit_changes', {
            version: current.draft.version,
            contentVersion: current.draft.contentVersion,
            completion: first ? 'draft' : 'save',
            continueResponse: first,
            operations: (first ? ['lo'] : ['lo', 'mira']).map((id) => ({
              name: 'propose_object',
              arguments: {
                id,
                baseRevision: null,
                value: { typeId, name: id === 'lo' ? 'Lo' : 'Mira' },
              },
            })),
          }),
        ];
      },
      (body) => {
        const current = JSON.parse(String(body.input[0].content)).current;
        return [
          modelMessage(
            JSON.stringify(
              body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
                ? {
                    mode: current === original ? 'work' : 'read',
                    request: current,
                    responseRequired: false,
                  }
                : { decision: 'allow', complete: true, fulfillsRequest: checks > 1 },
            ),
          ),
        ];
      },
    );
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        const interpretation = body.instructions.startsWith('SKYTTEL_TURN_SCOPE');
        const checking = body.instructions.startsWith('SKYTTEL_TURN_ACTIONS');
        if (checking) checks++;
        if (
          !failed &&
          (boundary === 'interpretation' ? interpretation : checking && checks === 2)
        ) {
          failed = true;
          entered();
          await held;
          return Response.json({
            id: `resp_${crypto.randomUUID()}`,
            object: 'response',
            model: body.model,
            status: reply === 'incomplete' ? 'incomplete' : 'completed',
            output: [
              modelMessage(
                reply === 'invalid'
                  ? '{"unrecognized":"structured reply"}'
                  : JSON.stringify(
                      interpretation
                        ? { mode: 'work', request: original, responseRequired: false }
                        : { decision: 'allow', complete: true, fulfillsRequest: true },
                    ),
              ),
            ],
          });
        }
        return model.provider(input, init);
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const map = `${app.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await browser.get(map)).json();
    typeId = (await read()).types[0].id;
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (url: string, data: object) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    const endpoint = `${base}/${view.id}`;
    const requestId = crypto.randomUUID();
    const send = (text: string, id = crypto.randomUUID()) =>
      post(`${endpoint}/messages`, {
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
        requestId: id,
        text,
      });
    view = await (await send(original, requestId)).json();
    await started;
    for (const text of queued) expect((await send(text)).status()).toBe(202);
    const before = await read();
    expect(before.draft).toMatchObject(
      boundary === 'checking'
        ? { version: 1, changes: [{ id: 'lo', after: { name: 'Lo' } }] }
        : { version: 0, changes: [] },
    );
    release();
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return [view.phase, view.error, view.queuedMessages];
      })
      .toEqual(['error', 'assistant_scope_unavailable', 2]);
    expect(view.workFailure).toMatchObject({
      requestId,
      request: original,
      code: 'assistant_scope_unavailable',
      retry: 'Försök igen',
    });
    expect(await read()).toEqual(before);
    const failedCalls = calls;
    expect(
      (await post(`${endpoint}/model-choice`, { model: 'gpt-6.1-sol', effort: 'medium' })).status(),
    ).toBe(200);
    view = await (await browser.get(endpoint)).json();
    expect(view.queuedMessages).toBe(2);
    expect(calls).toBe(failedCalls);
    const workBeforeAction = model.requests.length;
    expect(
      (await post(`${endpoint}/${action}-work`, { revision: view.revision, requestId })).status(),
    ).toBe(202);
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return [view.phase, view.queuedMessages];
      })
      .toEqual(['ready', 0]);
    const resumed = model.requests.slice(workBeforeAction);
    const resumedInputs = resumed.map((body) =>
      JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content)),
    );
    expect(resumedInputs.map((current) => current.message)).toEqual(
      action === 'retry'
        ? [...(boundary === 'interpretation' ? [original, original] : [original]), ...queued]
        : queued,
    );
    if (action === 'retry') expect(resumedInputs[0].messageId).toBe(requestId);
    expect(
      resumed.every((body) => body.model === 'gpt-6.1-sol' && body.reasoning.effort === 'medium'),
    ).toBe(true);
    expect(view.workFailure).toBeUndefined();
    expect((await read()).draft).toMatchObject(
      action === 'retry' ? { version: 2, changes: [{ id: 'lo' }, { id: 'mira' }] } : before.draft,
    );
    expect((await read()).objects).toEqual([]);
    expect((await (await browser.get(`${map}/operations`)).json()).operations).toEqual([]);
    expect((await (await browser.get(`${map}/history`)).json()).history).toEqual([]);
  },
);

test.each(['provider failure', 'lost batch status', 'manually discarded question'] as const)(
  'a spoken clarification retries only unfinished work after its own verified question and draft transitions: %s',
  async (boundary) => {
    let typeId: string;
    let fail = true;
    const delivery = controlledBatchDelivery();
    if (boundary === 'lost batch status') {
      delivery.arm();
      delivery.blockStatus(true);
    }
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
      return [
        modelTool('submit_changes', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          resolves:
            model.requests.length === 3 && boundary !== 'manually discarded question'
              ? [{ id: part.id, revision: part.revision }]
              : [],
          completion: 'draft',
          continueResponse: model.requests.length === 3,
          operations: (model.requests.length === 3 ? ['lo'] : ['lo', 'mira']).map((id) => ({
            name: 'propose_object',
            arguments: {
              id,
              baseRevision: null,
              value: { typeId, name: id === 'lo' ? 'Lo' : 'Mira' },
            },
          })),
        }),
      ];
    });
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        const body = JSON.parse(String(init?.body));
        if (
          boundary !== 'lost batch status' &&
          !body.instructions.startsWith('SKYTTEL_TURN_') &&
          model.requests.length === 3 &&
          fail
        ) {
          fail = false;
          return Response.json(
            { error: { message: 'Controlled outage after clarification' } },
            { status: 503 },
          );
        }
        return model.provider(input, init);
      },
      assistantDispatch: delivery.dispatch,
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const map = `${app.origin}/api/households/${household.id}/map`;
    typeId = (await (await browser.get(map)).json()).types[0].id;
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (url: string, data: object) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    const endpoint = `${base}/${view.id}`;
    const send = (data: object) =>
      post(`${endpoint}/messages`, {
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
        ...data,
      });
    await send({ requestId: crypto.randomUUID(), text: 'Lägg till personen.' });
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return view.phase;
      })
      .toBe('ready');
    const question = view.pendingParts?.[0];
    expect(question).toMatchObject({ status: 'waiting', revision: 0 });
    const requestId = crypto.randomUUID();
    const original = {
      requestId,
      text: 'Personen heter Lo. Lägg också till Mira utan att spara.',
      voiceContext: '[]',
      answerTo: [{ id: question?.id, revision: question?.revision }],
    };
    expect((await send(original)).status()).toBe(202);
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return boundary !== 'lost batch status' ? view.workFailure?.code : view.phase;
      })
      .toBe(boundary !== 'lost batch status' ? 'assistant_model_temporary' : 'recovery');
    if (boundary === 'lost batch status') {
      expect(view.pendingParts?.[0]).toMatchObject({
        id: question?.id,
        revision: 1,
        status: 'ready',
      });
      expect(view.workFailure).toBeUndefined();
      expect(
        (await post(`${endpoint}/retry-work`, { revision: view.revision, requestId })).status(),
      ).toBe(409);
      expect(model.requests).toHaveLength(3);
      delivery.blockStatus(false);
      view = await (await post(`${endpoint}/recover`, {})).json();
      expect(view.workFailure).toMatchObject({ requestId, code: 'assistant_request_unfinished' });
    }
    expect(view.pendingParts?.[0]).toMatchObject({
      id: question?.id,
      revision: boundary === 'manually discarded question' ? 1 : 2,
      status: boundary === 'manually discarded question' ? 'ready' : 'completed',
    });
    expect((await (await browser.get(map)).json()).draft).toMatchObject({
      version: 1,
      changes: [{ id: 'lo' }],
    });
    expect(model.requests).toHaveLength(3);
    if (boundary === 'manually discarded question') {
      expect(
        (
          await post(`${map}/discard`, { version: 1, contentVersion: view.review.contentVersion })
        ).status(),
      ).toBe(200);
      expect(
        (await post(`${endpoint}/retry-work`, { revision: view.revision, requestId })).status(),
      ).toBe(202);
      await expect
        .poll(async () => {
          view = await (await browser.get(endpoint)).json();
          return [view.phase, view.error];
        })
        .toEqual(['error', 'assistant_pending_part_changed']);
      expect(view.pendingParts?.[0]).toMatchObject({
        id: question?.id,
        revision: 2,
        status: 'discarded',
      });
      expect(view.workFailure?.retry).toBeUndefined();
      expect(model.requests).toHaveLength(3);
      expect((await (await browser.get(map)).json()).draft.changes).toEqual([]);
      return;
    }
    expect(
      (await post(`${endpoint}/retry-work`, { revision: view.revision, requestId })).status(),
    ).toBe(202);
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return [view.phase, view.error];
      })
      .toEqual(['ready', undefined]);
    expect(view.workFailure).toBeUndefined();
    expect(view.tasks?.filter((task) => task.id === requestId)).toHaveLength(1);
    expect(view.pendingParts?.[0]).toMatchObject({
      id: question?.id,
      revision: 2,
      status: 'completed',
    });
    expect((await (await browser.get(map)).json()).draft).toMatchObject({
      version: 2,
      changes: [
        { id: 'lo', after: { name: 'Lo' } },
        { id: 'mira', after: { name: 'Mira' } },
      ],
    });
    expect(model.requests).toHaveLength(4);
    expect((await (await browser.get(`${map}/operations`)).json()).operations).toEqual([]);
    expect((await (await browser.get(`${map}/history`)).json()).history).toEqual([]);
  },
);

test.each(['retry', 'abandon'] as const)(
  'a definitive absent batch status offers explicit %s without starting model work automatically',
  async (action) => {
    let typeId: string;
    let blockStatus = true;
    let rejectBatch = true;
    const model = textModel((body) => {
      const current = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return [
        modelTool('submit_changes', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: { id: 'lo', baseRevision: null, value: { typeId, name: 'Lo' } },
            },
          ],
        }),
      ];
    });
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
        if (rpc?.params?.name === 'apply_draft_batch' && rejectBatch) {
          rejectBatch = false;
          throw new Error('Controlled transport loss before batch submission');
        }
        if (rpc?.params?.name === 'read_draft_batch' && blockStatus)
          throw new Error('Controlled unavailable batch status');
        return dispatch(incoming);
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const map = `${app.origin}/api/households/${household.id}/map`;
    typeId = (await (await browser.get(map)).json()).types[0].id;
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (url: string, data: object) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    const endpoint = `${base}/${view.id}`;
    const requestId = crypto.randomUUID();
    await post(`${endpoint}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      requestId,
      text: 'Lägg till Lo utan att spara.',
    });
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return view.phase;
      })
      .toBe('recovery');
    expect(view.batchPending).toBe(true);
    expect(view.workFailure).toBeUndefined();
    for (const next of ['retry', 'abandon'])
      expect(
        (await post(`${endpoint}/${next}-work`, { revision: view.revision, requestId })).status(),
      ).toBe(409);
    view = await (await post(`${endpoint}/recover`, {})).json();
    expect(view).toMatchObject({
      phase: 'recovery',
      error: 'assistant_batch_unknown',
      batchPending: true,
    });
    expect(model.requests).toHaveLength(1);
    blockStatus = false;
    const recovered = await post(`${endpoint}/recover`, {});
    expect(recovered.status(), await recovered.text()).toBe(200);
    view = await recovered.json();
    expect(view).toMatchObject({
      phase: 'error',
      error: 'assistant_batch_not_committed',
      workFailure: { requestId, code: 'assistant_batch_not_committed', retry: 'Försök igen' },
    });
    expect(view.batchPending).not.toBe(true);
    expect(view.workFailure?.message).toContain('genomfördes inte');
    expect((await (await browser.get(map)).json()).draft).toMatchObject({
      version: 0,
      changes: [],
    });
    expect(model.requests).toHaveLength(1);
    expect(
      (await post(`${endpoint}/${action}-work`, { revision: view.revision, requestId })).status(),
    ).toBe(202);
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return view.phase;
      })
      .toBe('ready');
    expect(view.workFailure).toBeUndefined();
    expect(view.unfinishedRequests).toEqual([]);
    expect(model.requests).toHaveLength(action === 'retry' ? 2 : 1);
    expect((await (await browser.get(map)).json()).draft).toMatchObject(
      action === 'retry'
        ? { version: 1, changes: [{ id: 'lo', after: { name: 'Lo' } }] }
        : { version: 0, changes: [] },
    );
    expect((await (await browser.get(`${map}/operations`)).json()).operations).toEqual([]);
    expect((await (await browser.get(`${map}/history`)).json()).history).toEqual([]);
  },
);

test.each([true, false])(
  'a lost registered save response keeps only its unfinished explanation behind an explicit continuation action: explanation=%s',
  async (explanation) => {
    let dropped = false;
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
        if (rpc?.params?.name === 'save_draft' && !dropped) {
          const envelope = await response.clone().json();
          expect(envelope.result.isError).not.toBe(true);
          dropped = true;
          throw new Error('Controlled committed save response loss');
        }
        return response;
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const map = `${app.origin}/api/households/${household.id}/map`;
    const initial: MapState = await (await browser.get(map)).json();
    const post = (url: string, data: object) =>
      browser.post(url, { headers: { origin: app.origin }, data });
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
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    const endpoint = `${base}/${view.id}`;
    const requestId = crypto.randomUUID();
    await post(`${endpoint}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      requestId,
      text: explanation
        ? 'Beskriv vad ett utkast är. Spara hela utkastet.'
        : 'Spara hela utkastet.',
    });
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return [dropped, view.phase];
      })
      .toEqual([true, 'recovery']);
    expect(view.workFailure).toBeUndefined();
    expect(
      (await post(`${endpoint}/retry-work`, { revision: view.revision, requestId })).status(),
    ).toBe(409);
    expect(model.requests).toHaveLength(1);
    const operation = (await (await browser.get(`${map}/operations`)).json()).operations[0];
    expect(operation.status).toBe('succeeded');
    const check = await post(`${endpoint}/recover`, { operationIds: [operation.operationId] });
    expect(check.status(), await check.text()).toBe(200);
    view = await check.json();
    if (!explanation) {
      expect(view.workFailure).toBeUndefined();
      expect(view.phase).toBe('ready');
      expect(view.unfinishedRequests).toEqual([]);
      expect(model.requests).toHaveLength(1);
      return;
    }
    expect(view.workFailure).toMatchObject({
      requestId,
      code: 'assistant_request_unfinished',
      retry: 'Fortsätt det oavslutade arbetet',
    });
    expect(model.requests).toHaveLength(1);
    expect(
      (await post(`${endpoint}/retry-work`, { revision: view.revision, requestId })).status(),
    ).toBe(202);
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return view.phase;
      })
      .toBe('ready');
    expect(view.modelReply).toBe('Ett utkast innehåller dina osparade ändringar.');
    expect(view.unfinishedRequests).toEqual([]);
    expect(view.receipt).toBeUndefined();
    expect(model.requests).toHaveLength(2);
    expect((await (await browser.get(`${map}/operations`)).json()).operations).toHaveLength(1);
    expect((await (await browser.get(`${map}/history`)).json()).history).toHaveLength(1);
    expect(await (await browser.get(map)).json()).toMatchObject({
      objects: [{ id: 'lo', name: 'Lo' }],
      draft: { changes: [] },
    });
  },
);

test('durable failed work blocks a new device before the old conversation is loaded after a crash image restart', async () => {
  let calls = 0;
  app = await createInstallation(undefined, {
    modelFetch: async () => {
      calls++;
      return Response.json({ error: { message: 'Controlled unavailable model' } }, { status: 503 });
    },
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let original: TextAssistantView = await (
    await post(`${app.origin}${path}`, approvedForVisit)
  ).json();
  await post(`${app.origin}${path}/${original.id}/messages`, {
    revision: original.revision,
    draftVersion: original.review.version,
    contentVersion: original.review.contentVersion,
    requestId: crypto.randomUUID(),
    text: 'Beskriv kartan utan att ändra den.',
  });
  await expect
    .poll(async () => {
      original = await (await browser.get(`${app.origin}${path}/${original.id}`)).json();
      return original.workFailure?.code;
    })
    .toBe('assistant_model_temporary');
  const previousCalls = calls;
  crashDirectory = mkdtempSync(join(tmpdir(), 'skyttel-failed-work-crash-'));
  const snapshot = join(crashDirectory, 'skyttel.db');
  // Copy the running database before close can turn failed work into paused work.
  await app.saveDatabase(snapshot);
  await browser.dispose();
  await app.close();
  app = await createInstallation(undefined, {
    databasePath: snapshot,
    modelFetch: async () => {
      calls++;
      return Response.json({ error: { message: 'Must not start automatically' } }, { status: 503 });
    },
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const fresh: TextAssistantView = await (
    await post(`${app.origin}${path}`, approvedForVisit)
  ).json();
  const response = await post(`${app.origin}${path}/${fresh.id}/messages`, {
    revision: fresh.revision,
    draftVersion: fresh.review.version,
    contentVersion: fresh.review.contentVersion,
    requestId: crypto.randomUUID(),
    text: 'Beskriv typerna utan ändringar.',
  });
  expect(response.status()).toBe(202);
  const later: TextAssistantView = await response.json();
  expect(later.tasks?.at(-1)?.status).toBe('queued');
  expect(later.queuedMessages).toBe(1);
  expect(calls).toBe(previousCalls);
});

test('retry continues an unfinished explanation after a verified save without treating consumed draft effects as manual drift', async () => {
  let typeId: string;
  let workCalls = 0;
  const model = textModel((body) => {
    if (model.requests.length > 1)
      return [modelMessage('Ett utkast innehåller dina osparade ändringar.')];
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('submit_changes', {
        version: current.draft.version,
        contentVersion: current.draft.contentVersion,
        completion: 'save',
        continueResponse: true,
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'lo',
              baseRevision: null,
              value: { typeId, name: 'Lo' },
            },
          },
        ],
      }),
    ];
  });
  app = await createInstallation(undefined, {
    modelFetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (!body.instructions.startsWith('SKYTTEL_TURN_') && ++workCalls === 2)
        return Response.json(
          { error: { message: 'Synthetic unavailable explanation' } },
          { status: 503 },
        );
      return model.provider(input, init);
    },
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const map = `${app.origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await browser.get(map)).json();
  typeId = (await read()).types[0].id;
  const base = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (path: string, data: object) =>
    browser.post(path, { headers: { origin: app.origin }, data });
  let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
  const endpoint = `${base}/${view.id}`;
  const requestId = crypto.randomUUID();
  await post(`${endpoint}/messages`, {
    revision: view.revision,
    draftVersion: view.review.version,
    contentVersion: view.review.contentVersion,
    requestId,
    text: 'Lägg till Lo. Beskriv vad ett utkast är. Spara hela utkastet.',
  });
  await expect
    .poll(async () => {
      view = await (await browser.get(endpoint)).json();
      return [view.phase, view.error];
    })
    .toEqual(['error', 'assistant_model_temporary']);
  const before = await read();
  expect(before.objects).toMatchObject([{ id: 'lo', name: 'Lo' }]);
  expect(before.draft.changes).toEqual([]);
  const history = await (await browser.get(`${map}/history`)).json();
  const operations = await (await browser.get(`${map}/operations`)).json();
  expect(history.history).toHaveLength(1);
  expect(operations.operations).toHaveLength(1);
  expect(
    (await post(`${endpoint}/retry-work`, { revision: view.revision, requestId })).status(),
  ).toBe(202);
  await expect
    .poll(async () => {
      view = await (await browser.get(endpoint)).json();
      return view.phase;
    })
    .toBe('ready');
  expect(view.modelReply).toBe('Ett utkast innehåller dina osparade ändringar.');
  expect(view.unfinishedRequests).toEqual([]);
  expect(view.receipt).toBeUndefined();
  expect(view.requiredNotice).toBeUndefined();
  expect(await read()).toEqual(before);
  expect(await (await browser.get(`${map}/history`)).json()).toEqual(history);
  expect(await (await browser.get(`${map}/operations`)).json()).toEqual(operations);
  expect(workCalls).toBe(3);
});

test('status-only recovery of a committed batch retains its unfinished request and paused queue for explicit retry', async () => {
  const delivery = controlledBatchDelivery();
  delivery.arm();
  delivery.blockStatus(true);
  let typeId: string;
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async (body) => {
    const current = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    if (current.message.startsWith('Beskriv'))
      return [modelMessage('Kartan har inga sparade objekt.')];
    if (model.requests.length === 1) {
      entered();
      await held;
    }
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
            value: { typeId, name: id === 'lo' ? 'Lo' : 'Mira' },
          },
        })),
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
  const map = `${app.origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await browser.get(map)).json();
  typeId = (await read()).types[0].id;
  const base = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (path: string, data: object) =>
    browser.post(path, { headers: { origin: app.origin }, data });
  let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
  const endpoint = `${base}/${view.id}`;
  const requestId = crypto.randomUUID();
  view = await (
    await post(`${endpoint}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      requestId,
      text: 'Lägg till Lo och Mira utan att spara.',
    })
  ).json();
  await started;
  expect(
    (
      await post(`${endpoint}/messages`, {
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
        requestId: crypto.randomUUID(),
        text: 'Beskriv kartan.',
      })
    ).status(),
  ).toBe(202);
  release();
  await expect
    .poll(async () => {
      view = await (await browser.get(endpoint)).json();
      return [delivery.status().phase, view.phase];
    })
    .toEqual(['dropped-after-commit', 'recovery']);
  expect(view.workFailure).toBeUndefined();
  expect(
    (await post(`${endpoint}/retry-work`, { revision: view.revision, requestId })).status(),
  ).toBe(409);
  expect(model.requests).toHaveLength(1);
  delivery.blockStatus(false);
  const recovered: TextAssistantView = await (await post(`${endpoint}/recover`, {})).json();
  expect(recovered).toMatchObject({
    phase: 'error',
    queuedMessages: 1,
    workFailure: { requestId, retry: 'Fortsätt det oavslutade arbetet' },
  });
  expect(model.requests).toHaveLength(1);
  expect((await read()).draft.version).toBe(1);
  expect(
    (await post(`${endpoint}/retry-work`, { revision: recovered.revision, requestId })).status(),
  ).toBe(202);
  await expect
    .poll(async () => {
      view = await (await browser.get(endpoint)).json();
      return [view.phase, view.queuedMessages];
    })
    .toEqual(['ready', 0]);
  expect((await read()).draft).toMatchObject({
    version: 2,
    changes: [{ id: 'lo' }, { id: 'mira' }],
  });
  expect(model.requests).toHaveLength(3);
  expect((await (await browser.get(`${map}/operations`)).json()).operations).toEqual([]);
});

test.each(['unchanged', 'equivalent-payload', 'discard', 'discard-change'] as const)(
  'retry with %s draft preserves completed plain work and revoked saving',
  async (change) => {
    let workCalls = 0;
    let typeId: string;
    const model = textModel((body) => {
      const current = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      const fresh = current.message === 'Lägg bara till Mira. Spara hela utkastet.';
      return [
        modelTool('submit_changes', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          completion: fresh ? 'save' : 'draft',
          continueResponse: !fresh && model.requests.length === 1,
          operations: (fresh
            ? ['mira']
            : model.requests.length === 1
              ? ['lo']
              : ['lo', 'mira']
          ).map((id) => ({
            name: 'propose_object',
            arguments: {
              id,
              baseRevision: null,
              value: {
                typeId,
                name: id === 'lo' ? 'Lo' : 'Mira',
                ...(model.requests.length > 1 &&
                ['equivalent-payload', 'discard-change'].includes(change)
                  ? { properties: [] }
                  : {}),
              },
            },
          })),
        }),
      ];
    });
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        const body = JSON.parse(String(init?.body));
        if (!body.instructions.startsWith('SKYTTEL_TURN_') && ++workCalls === 2)
          return Response.json(
            { error: { message: 'Synthetic outage after committed batch' } },
            { status: 503 },
          );
        return model.provider(input, init);
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const map = `${app.origin}/api/households/${household.id}/map`;
    const read = async (): Promise<MapState> => (await browser.get(map)).json();
    typeId = (await read()).types[0].id;
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (path: string, data: object) =>
      browser.post(path, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    const endpoint = `${base}/${view.id}`;
    const requestId = crypto.randomUUID();
    await post(`${endpoint}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      requestId,
      text: 'Lägg till Lo och Mira. Spara hela utkastet.',
    });
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return view.error;
      })
      .toBe('assistant_model_temporary');
    expect((await read()).draft).toMatchObject({
      version: 1,
      changes: [{ id: 'lo', after: { name: 'Lo' } }],
    });
    const manuallyDiscarded = change === 'discard' || change === 'discard-change';
    if (manuallyDiscarded) {
      const current = await read();
      const discarded = await post(`${map}/${change}`, {
        version: current.draft.version,
        contentVersion: current.contentVersion,
        ...(change === 'discard-change' ? { kind: 'object', id: 'lo' } : {}),
      });
      expect(discarded.status(), await discarded.text()).toBe(200);
    }
    const retried = await post(`${endpoint}/retry-work`, { revision: view.revision, requestId });
    expect(retried.status(), await retried.text()).toBe(202);
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return view.phase;
      })
      .toBe(manuallyDiscarded ? 'error' : 'ready');
    const result = await read();
    expect(result.draft.version).toBe(2);
    if (manuallyDiscarded) {
      expect(result.draft.changes).toEqual([]);
      expect(view.error).toBe('assistant_draft_changed');
      expect(result.objects).toEqual([]);
      expect((await (await browser.get(`${map}/operations`)).json()).operations).toEqual([]);
      expect(view.workFailure?.message).toContain('Hur vill du fortsätta');
      expect(view.workFailure?.retry).toBeUndefined();
      if (change === 'discard-change') {
        expect(
          (await post(`${endpoint}/abandon-work`, { revision: view.revision, requestId })).status(),
        ).toBe(202);
        view = await (await browser.get(endpoint)).json();
        expect(view.workFailure).toBeUndefined();
        expect(
          (
            await post(`${endpoint}/messages`, {
              revision: view.revision,
              draftVersion: view.review.version,
              contentVersion: view.review.contentVersion,
              requestId: crypto.randomUUID(),
              text: 'Lägg bara till Mira. Spara hela utkastet.',
            })
          ).status(),
        ).toBe(202);
        await expect
          .poll(async () => {
            view = await (await browser.get(endpoint)).json();
            return view.receipt?.operationId;
          })
          .toBeTruthy();
        expect((await read()).objects).toMatchObject([{ id: 'mira', name: 'Mira' }]);
        expect((await read()).objects.some(({ id }) => id === 'lo')).toBe(false);
        expect((await read()).draft.changes).toEqual([]);
        expect((await (await browser.get(`${map}/history`)).json()).history).toHaveLength(1);
      }
      return;
    }
    expect(result.draft.changes).toMatchObject([
      { id: 'lo', after: { name: 'Lo' } },
      { id: 'mira', after: { name: 'Mira' } },
    ]);
    expect(result.objects).toEqual([]);
    expect((await (await browser.get(`${map}/operations`)).json()).operations).toEqual([]);
    expect(view.receipt).toBeUndefined();
    expect(view.requiredNotice).toContain('upphävt sparbegäran');
  },
);

test('abandoning failed work preserves an independent earlier information question while the later queue continues', async () => {
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(
    (body) => {
      const current = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return current.message === 'Fråga om färgen.'
        ? [
            modelTool('ask_questions', {
              questions: [
                {
                  kind: 'information',
                  request: 'Fråga om färgen.',
                  question: 'Vilken färg?',
                  dependsOnDraft: false,
                },
              ],
            }),
          ]
        : [modelMessage('Person är en av hushållets typer.')];
    },
    (body) => [
      modelMessage(
        JSON.stringify(
          body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
            ? {
                mode:
                  JSON.parse(String(body.input[0].content)).current === 'Fråga om färgen.'
                    ? 'work'
                    : 'read',
                request: JSON.parse(String(body.input[0].content)).current,
                responseRequired: false,
              }
            : { decision: 'allow', complete: true, fulfillsRequest: true },
        ),
      ),
    ],
  );
  app = await createInstallation(undefined, {
    modelFetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      const current = body.input.findLast((item: { role: string }) => item.role === 'user');
      if (
        !body.instructions.startsWith('SKYTTEL_TURN_') &&
        JSON.parse(String(current?.content)).message === 'Beskriv kartan.'
      ) {
        entered();
        await held;
        return Response.json(
          { error: { message: 'Controlled temporary failure' } },
          { status: 503 },
        );
      }
      return model.provider(input, init);
    },
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const base = `${app.origin}/api/households/${household.id}/text-assistant`;
  const post = (url: string, data: object) =>
    browser.post(url, { headers: { origin: app.origin }, data });
  let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
  const endpoint = `${base}/${view.id}`;
  const send = (text: string, requestId = crypto.randomUUID()) =>
    post(`${endpoint}/messages`, {
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
      text,
      requestId,
    });
  await send('Fråga om färgen.');
  await expect
    .poll(async () => {
      view = await (await browser.get(endpoint)).json();
      return [view.phase, view.pendingParts?.length];
    })
    .toEqual(['ready', 1]);
  const independent = view.pendingParts?.[0];
  const failedId = crypto.randomUUID();
  view = await (await send('Beskriv kartan.', failedId)).json();
  await started;
  view = await (await browser.get(endpoint)).json();
  expect((await send('Beskriv typerna.')).status()).toBe(202);
  release();
  await expect
    .poll(async () => {
      view = await (await browser.get(endpoint)).json();
      return view.workFailure?.requestId;
    })
    .toBe(failedId);
  expect(view.queuedMessages).toBe(1);
  expect(
    (
      await post(`${endpoint}/abandon-work`, { revision: view.revision, requestId: failedId })
    ).status(),
  ).toBe(202);
  await expect
    .poll(async () => {
      view = await (await browser.get(endpoint)).json();
      return [view.phase, view.queuedMessages];
    })
    .toEqual(['ready', 0]);
  expect(view.pendingParts).toEqual([independent]);
  expect(view.questions).toContain('Vilken färg?');
  expect(view.modelReply).toBe('Person är en av hushållets typer.');
  expect(view.workFailure).toBeUndefined();
});

test.each(['retry', 'abandon', 'stop'] as const)(
  'a temporary model failure pauses later queued work until explicit %s',
  async (action) => {
    let entered = () => {};
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let workCalls = 0;
    const model = textModel(() => [modelMessage('Det senare svaret.')], readOnlyScope);
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        const body = JSON.parse(String(init?.body));
        if (!body.instructions.startsWith('SKYTTEL_TURN_') && ++workCalls === 1) {
          entered();
          await held;
          return Response.json(
            { error: { message: 'Synthetic temporary outage' } },
            { status: 503 },
          );
        }
        return model.provider(input, init);
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const base = `${app.origin}/api/households/${household.id}/text-assistant`;
    const post = (path: string, data: object) =>
      browser.post(path, { headers: { origin: app.origin }, data });
    let view: TextAssistantView = await (await post(base, approvedForVisit)).json();
    const endpoint = `${base}/${view.id}`;
    const originalRequest = crypto.randomUUID();
    const send = (text: string, requestId = crypto.randomUUID()) =>
      post(`${endpoint}/messages`, {
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
        requestId,
        text,
      });
    view = await (await send('Beskriv kartan.', originalRequest)).json();
    await started;
    expect((await send('Beskriv den en gång till.')).status()).toBe(202);
    release();
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return [view.phase, view.error, view.queuedMessages];
      })
      .toEqual(['error', 'assistant_model_temporary', 1]);
    if (action === 'retry')
      expect(view).toMatchObject({
        workFailure: {
          requestId: originalRequest,
          code: 'assistant_model_temporary',
          message: expect.stringContaining('Modellen är tillfälligt otillgänglig.'),
          retry: 'Försök igen',
        },
      });
    expect(workCalls).toBe(1);
    expect(
      (await post(`${endpoint}/model-choice`, { model: 'gpt-6.1-sol', effort: 'medium' })).status(),
    ).toBe(200);
    await browser.get(endpoint);
    expect(workCalls).toBe(1);
    expect((await (await browser.get(endpoint)).json()).queuedMessages).toBe(1);
    if (action !== 'stop') {
      expect(
        (
          await post(`${endpoint}/${action}-work`, {
            revision: view.revision - 1,
            requestId: originalRequest,
          })
        ).status(),
      ).toBe(409);
      expect(workCalls).toBe(1);
    }
    const retry = await post(`${endpoint}/${action === 'stop' ? 'cancel' : `${action}-work`}`, {
      revision: view.revision,
      requestId: originalRequest,
      ...(action === 'stop' ? { all: true, contextRevision: view.contextRevision ?? 0 } : {}),
    });
    expect(retry.status(), await retry.text()).toBe(action === 'stop' ? 200 : 202);
    if (action !== 'stop')
      expect(
        (
          await post(`${endpoint}/${action}-work`, {
            revision: view.revision,
            requestId: originalRequest,
          })
        ).status(),
      ).toBe(409);
    if (action === 'stop') {
      view = await retry.json();
      expect(view.queuedMessages).toBe(0);
      expect(workCalls).toBe(1);
      const nextRequest = crypto.randomUUID();
      view = await (await send('Beskriv bara hushållets typer.', nextRequest)).json();
      await expect
        .poll(async () => {
          view = await (await browser.get(endpoint)).json();
          return view.phase;
        })
        .toBe('ready');
      const nextInput = JSON.parse(
        String(model.requests[0].input.findLast((item) => item.role === 'user')?.content),
      );
      expect(nextInput.unfinishedRequests).toEqual([
        { id: nextRequest, text: 'Beskriv bara hushållets typer.' },
      ]);
      expect(view.unfinishedRequests).toEqual([
        { id: originalRequest, text: 'Beskriv kartan.', paused: true },
      ]);
      expect(workCalls).toBe(2);
      return;
    }
    await expect
      .poll(async () => {
        view = await (await browser.get(endpoint)).json();
        return [view.phase, view.queuedMessages];
      })
      .toEqual(['ready', 0]);
    expect(workCalls).toBe(action === 'retry' ? 3 : 2);
    expect(model.requests.map((body) => [body.model, body.reasoning.effort])).toEqual(
      Array.from({ length: action === 'retry' ? 2 : 1 }, () => ['gpt-6.1-sol', 'medium']),
    );
    expect(
      view.conversation?.filter(
        (entry) => entry.role === 'user' && entry.text === 'Beskriv kartan.',
      ),
    ).toHaveLength(1);
    expect(view.unfinishedRequests).toEqual([]);
    expect(
      (await (await browser.get(`${endpoint}/messages/${originalRequest}`)).json()).workFailure,
    ).toBeUndefined();
  },
);
