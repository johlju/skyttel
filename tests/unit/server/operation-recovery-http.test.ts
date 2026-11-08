import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { authorizeAssistant, callAssistant, callAssistantTool } from '../../support/assistant.js';
import { controlledBatchDelivery } from '../../support/batch-response-delivery.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import {
  lastToolResult,
  type ModelRequest,
  modelMessage,
  modelTool,
  pendingUpdate,
  textModel,
} from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let householdId: string;
let dropNextBatch = false;
const mapPath = () => `${app.origin}/api/households/${householdId}/map`;
const read = async (): Promise<MapState> => (await browser.get(mapPath())).json();
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

const connect = () => authorizeAssistant(browser, app.origin, householdId);
const tool = (token: string, name: string, args: Record<string, unknown>) =>
  callAssistantTool(app.origin, token, name, args);

async function setUpHousehold() {
  browser = await request.newContext();
  await signIn(browser, app.origin);
  ({
    household: { id: householdId },
  } = await (await createHousehold(browser, app.origin)).json());
}

async function startConversation() {
  const base = `${app.origin}/api/households/${householdId}/text-assistant`;
  const post = (path: string, data: unknown) =>
    browser.post(path, { headers: { origin: app.origin }, data });
  const started = await post(base, approvedForVisit);
  expect(started.status()).toBe(201);
  const session: TextAssistantView = await started.json();
  return { session, endpoint: `${base}/${session.id}`, post };
}

function submitLo(typeId: string, body: ModelRequest) {
  const { draft } = JSON.parse(
    String(body.input.findLast((item) => item.role === 'user')?.content),
  );
  return [
    modelTool('submit_changes', {
      version: draft.version,
      contentVersion: draft.contentVersion,
      completion: 'draft',
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
}

test('a committed batch and its evidence survive lost HTTP delivery and restart, and replay cannot change the draft twice', {
  tags: ['technical'],
}, async () => {
  app = await createInstallation(undefined, {
    deliverResponse: async (incoming, response) => {
      if (new URL(incoming.url).pathname !== '/mcp' || incoming.method !== 'POST') return response;
      if (!dropNextBatch) return response;
      dropNextBatch = false;
      // This runs after the real HTTP/MCP handler has returned its committed
      // result. Break the actual response stream before any body is delivered.
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('Dropped committed batch response'));
          },
        }),
        { headers: response.headers },
      );
    },
  });
  await setUpHousehold();
  let token = await connect();
  const initial = await read();
  const batch = {
    operationId: 'lost-batch',
    version: initial.draft.version,
    contentVersion: initial.contentVersion,
    operations: [
      {
        name: 'propose_object',
        arguments: {
          id: 'lo',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Lo' },
        },
      },
    ],
  };
  dropNextBatch = true;
  await callAssistant(app.origin, token, 'apply_draft_batch', batch)
    .then((response) => response.text())
    .catch(() => undefined);
  const committed = await read();
  expect(committed.draft.changes).toMatchObject([{ id: 'lo', after: { name: 'Lo' } }]);
  expect(committed.draft.version).toBe(1);
  browser = await restartWithSession(browser, () => app.restart());
  token = await connect();
  const recovered = await tool(token, 'read_draft_batch', {
    operationId: batch.operationId,
    contentVersion: initial.contentVersion,
  });
  expect(recovered.error).toBe(false);
  expect(recovered.value.batch).toMatchObject({ operationId: 'lost-batch', version: 1 });
  const replay = await tool(token, 'apply_draft_batch', batch);
  expect(replay.error).toBe(false);
  expect(replay.value).toEqual(recovered.value.batch);
  expect(await read()).toEqual(committed);
  expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([]);
  expect((await (await browser.get(`${mapPath()}/operations`)).json()).operations).toEqual([]);
});

test.each(['text', 'voice'] as const)(
  'a %s request recovers its committed batch after lost MCP delivery without another model call',
  {
    tags: ['technical'],
  },
  async (mode) => {
    let typeId: string;
    const delivery = controlledBatchDelivery();
    delivery.arm();
    let statusWaiting = false;
    let releaseStatus!: () => void;
    const statusHeld = new Promise<void>((resolve) => {
      releaseStatus = resolve;
    });
    const model = textModel((body) => submitLo(typeId, body));
    const live = liveProvider();
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
      assistantDispatch: async (incoming, dispatch) => {
        const rpc =
          incoming.method === 'POST'
            ? await incoming
                .clone()
                .json()
                .catch(() => null)
            : null;
        if (mode === 'text' && rpc?.params?.name === 'read_draft_batch' && !statusWaiting) {
          statusWaiting = true;
          await statusHeld;
        }
        return delivery.dispatch(incoming, dispatch);
      },
    });
    await setUpHousehold();
    typeId = (await read()).types[0].id;
    browser = await restartWithSession(browser, () => app.restart());
    const { session, endpoint, post } = await startConversation();
    if (mode === 'text') {
      expect(
        (
          await post(`${endpoint}/messages`, {
            requestId: 'recover-batch',
            revision: session.revision,
            draftVersion: session.review.version,
            contentVersion: session.review.contentVersion,
            text: 'Lägg till Lo utan att spara.',
          })
        ).status(),
      ).toBe(202);
    } else {
      expect(
        (
          await post(`${endpoint}/voice`, {
            sdp: 'synthetic-offer',
            revision: session.revision,
            draftVersion: session.review.version,
            contentVersion: session.review.contentVersion,
          })
        ).status(),
      ).toBe(201);
      const providerId = [...live.channels.keys()][0];
      live.emit(providerId, {
        type: 'session.input_transcript.delta',
        event_id: 'lo-input',
        delta: 'Lägg till Lo utan att spara.',
        start_ms: 0,
        end_ms: 100,
      });
      live.emit(providerId, {
        type: 'session.delegation.created',
        event_id: 'lo-delegation',
        offset_ms: 100,
        delegation: { id: 'lo-work', target: 'client' },
      });
    }
    if (mode === 'text') {
      try {
        await expect.poll(() => statusWaiting).toBe(true);
        // Pause while the original executor still owns the complete batch.
        // Its retained active identity must not become fresh model work when
        // resume verifies that the whole original request already finished.
        expect((await post(`${endpoint}/pause`, {})).status()).toBe(200);
      } finally {
        releaseStatus();
      }
      const paused = await browser.get(endpoint);
      expect(paused.status(), await paused.text()).toBe(200);
      expect(await paused.json()).toMatchObject({ paused: true, phase: 'recovery' });
      const resumed = await post(`${endpoint}/resume`, approvedForVisit);
      expect(resumed.status(), await resumed.text()).toBe(200);
      await expect.poll(() => model.requests.length).toBe(1);
    } else releaseStatus();
    await expect
      .poll(
        async () => {
          const current: TextAssistantView = await (await browser.get(endpoint)).json();
          return delivery.status().phase === 'dropped-after-commit' && current.phase !== 'working'
            ? current.phase
            : undefined;
        },
        { timeout: 3500 },
      )
      .not.toBeUndefined();
    const completed: TextAssistantView = await (await browser.get(endpoint)).json();
    expect(delivery.status().phase).toBe('dropped-after-commit');
    expect((await read()).draft).toMatchObject({
      version: 1,
      changes: [{ id: 'lo', after: { name: 'Lo' } }],
    });
    expect(model.requests).toHaveLength(1);
    expect(completed.phase).toBe('ready');
    const batchId = delivery.status().operationId;
    expect(batchId).toMatch(/^[\w-]+$/);
    expect(completed.result).toMatchObject({
      kind: 'draft',
      changes: [{ subject: 'Lo', action: 'lades till' }],
    });
    expect(completed.error).toBeUndefined();
    expect(completed.unfinishedRequests).toEqual([]);
    expect(model.requests).toHaveLength(1);
    expect((await read()).draft).toMatchObject({ version: 1, changes: [{ id: 'lo' }] });
    browser = await restartWithSession(browser, () => app.restart());
    expect((await read()).draft).toMatchObject({ version: 1, changes: [{ id: 'lo' }] });
    const recovered = await tool(await connect(), 'read_draft_batch', {
      operationId: batchId,
      contentVersion: 1,
    });
    expect(recovered.value.batch).toMatchObject({
      operationId: batchId,
      status: 'committed',
      version: 1,
      currentDraft: true,
    });
    expect(recovered.value.batch.changes).toBeUndefined();
    expect(model.requests).toHaveLength(1);
  },
);

test.each([
  { remaining: true, suffix: 'with another ready change' },
  { remaining: false, suffix: 'with all ready changes resolved' },
])(
  'status-only recovery checks pending changes after batch resolution $suffix',
  { tags: ['technical'] },
  async ({ remaining }) => {
    let typeId: string;
    const questions = remaining
      ? ['Vad heter första kollegan?', 'Vad heter andra kollegan?']
      : ['Vad heter första kollegan?'];
    const delivery = controlledBatchDelivery();
    const model = textModel(
      (body) => {
        if (model.requests.length === 1)
          return [
            modelTool('ask_questions', {
              questions: questions.map((question) => ({
                kind: 'change',
                request: 'Lägg till kollegan som person.',
                question,
                dependsOnDraft: false,
              })),
            }),
          ];
        if (model.requests.length === 2)
          return [
            modelTool('ask_questions', {
              questions: [],
              updates: questions.map((question) => pendingUpdate(body, question)),
            }),
          ];
        const [proposal] = submitLo(typeId, body);
        const input = JSON.parse(
          String(body.input.findLast((item) => item.role === 'user')?.content),
        );
        const part = input.pendingParts.find(
          (part: { question: string }) => part.question === questions[0],
        );
        return [
          {
            ...proposal,
            arguments: JSON.stringify({
              ...JSON.parse(proposal.arguments),
              resolves: [{ id: part.id, revision: part.revision }],
            }),
          },
        ];
      },
      (body) => [
        modelMessage(
          JSON.stringify(
            body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
              ? {
                  mode: 'work',
                  request: JSON.parse(String(body.input[0].content)).current,
                  responseRequired: false,
                }
              : { decision: 'allow', complete: true, fulfillsRequest: true },
          ),
        ),
      ],
    );
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      assistantDispatch: delivery.dispatch,
    });
    await setUpHousehold();
    typeId = (await read()).types[0].id;
    const { session, endpoint, post } = await startConversation();
    let current = session;
    for (const [index, instruction] of [
      'Lägg till kollegorna som personer utan att spara.',
      'Första kollegan heter Lo och andra kollegan heter Kim.',
    ].entries()) {
      expect(
        (
          await post(`${endpoint}/messages`, {
            requestId: `prepare-parts-${index}`,
            revision: current.revision,
            draftVersion: current.review.version,
            contentVersion: current.review.contentVersion,
            text: instruction,
          })
        ).status(),
      ).toBe(202);
      await expect
        .poll(async () => {
          current = await (await browser.get(endpoint)).json();
          return current.phase;
        })
        .toBe('ready');
    }
    expect(current.pendingParts?.map((part) => part.status)).toEqual(questions.map(() => 'ready'));
    delivery.arm();
    delivery.blockStatus(true);
    expect(
      (
        await post(`${endpoint}/messages`, {
          requestId: 'resolve-committed-part',
          revision: current.revision,
          draftVersion: current.review.version,
          contentVersion: current.review.contentVersion,
          text: 'Gör klart kollegorna utan att spara.',
        })
      ).status(),
    ).toBe(202);
    await expect
      .poll(async () => {
        current = await (await browser.get(endpoint)).json();
        return delivery.status().phase === 'dropped-after-commit' && current.phase === 'recovery';
      })
      .toBe(true);
    const authorizations = model.authorizationRequests.length;
    delivery.blockStatus(false);
    const recovered: TextAssistantView = await (await post(`${endpoint}/recover`, {})).json();
    expect(recovered.pendingParts?.map((part) => part.status)).toEqual(
      remaining ? ['completed', 'ready'] : ['completed'],
    );
    expect(recovered.result?.changes).toEqual([{ subject: 'Lo', action: 'lades till' }]);
    expect(recovered.phase).toBe(remaining ? 'error' : 'ready');
    expect(recovered.error).toBe(remaining ? 'assistant_request_unfinished' : undefined);
    expect(recovered.completedReplies?.filter((reply) => reply.id.startsWith('batch-'))).toEqual([
      expect.objectContaining({
        failed: remaining,
        request: 'Gör klart kollegorna utan att spara.',
      }),
    ]);
    expect(model.requests).toHaveLength(3);
    expect(model.authorizationRequests).toHaveLength(authorizations);
    expect((await read()).draft).toMatchObject({
      version: 1,
      changes: [{ id: 'lo', after: { name: 'Lo' } }],
    });
    expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([]);
    expect((await (await browser.get(`${mapPath()}/operations`)).json()).operations).toEqual([]);
  },
);

test.each([
  {
    mode: 'text',
    remaining: 'requested explanation',
    responseRequired: true,
    fulfillsRequest: true,
    completion: 'draft',
  },
  {
    mode: 'voice',
    remaining: 'requested explanation',
    responseRequired: true,
    fulfillsRequest: true,
    completion: 'draft',
  },
  {
    mode: 'text',
    remaining: 'independent change',
    responseRequired: false,
    fulfillsRequest: false,
    completion: 'draft',
  },
  {
    mode: 'text',
    remaining: 'requested save',
    responseRequired: false,
    fulfillsRequest: true,
    completion: 'save',
  },
] as const)(
  'status-only recovery preserves unfinished $remaining in $mode',
  { tags: ['technical'] },
  async ({ mode, remaining, responseRequired, fulfillsRequest, completion }) => {
    const question = mode === 'voice' ? 'Vilket år gäller beskrivningen?' : undefined;
    const instruction =
      remaining === 'independent change'
        ? 'Lägg till Lo och Kim utan att spara.'
        : remaining === 'requested save'
          ? 'Lägg till Lo och spara hela utkastet.'
          : 'Lägg till Lo utan att spara och förklara vad ett utkast betyder.' +
            (question ? ' Beskriv också vilket år uppgifterna gäller.' : '');
    let typeId: string;
    const delivery = controlledBatchDelivery();
    delivery.blockStatus(true);
    const model = textModel(
      (body) => {
        if (model.requests.length > 1)
          return [modelTool('ask_questions', { questions: ['Vilken sak vill du läsa om?'] })];
        const [proposal] = submitLo(typeId, body);
        return [
          {
            ...proposal,
            arguments: JSON.stringify({
              ...JSON.parse(proposal.arguments),
              completion,
              questions: question
                ? [
                    {
                      kind: 'information',
                      request: 'Beskriv vilket år uppgifterna gäller.',
                      question,
                      dependsOnDraft: false,
                    },
                  ]
                : [],
            }),
          },
        ];
      },
      (body) => [
        modelMessage(
          JSON.stringify(
            body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
              ? { mode: 'work', request: instruction, responseRequired }
              : { decision: 'allow', complete: true, fulfillsRequest },
          ),
        ),
      ],
    );
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      assistantDispatch: delivery.dispatch,
    });
    await setUpHousehold();
    typeId = (await read()).types[0].id;
    const { session, endpoint, post } = await startConversation();
    delivery.arm();
    expect(
      (
        await post(`${endpoint}/messages`, {
          requestId: 'unfinished-explanation',
          revision: session.revision,
          draftVersion: session.review.version,
          contentVersion: session.review.contentVersion,
          text: instruction,
          ...(mode === 'voice' ? { voiceContext: '[]' } : {}),
        })
      ).status(),
    ).toBe(202);
    await expect
      .poll(async () => {
        const current: TextAssistantView = await (await browser.get(endpoint)).json();
        return delivery.status().phase === 'dropped-after-commit' && current.phase === 'recovery';
      })
      .toBe(true);
    const committed = await read();
    expect(committed.draft).toMatchObject({
      version: 1,
      changes: [{ id: 'lo', after: { name: 'Lo' } }],
    });
    expect(model.requests).toHaveLength(1);
    const authorizations = model.authorizationRequests.length;
    delivery.blockStatus(false);
    const checkId = '11111111-1111-4111-8111-111111111111';
    const recovered: TextAssistantView = await (
      await post(`${endpoint}/recover`, { checkId })
    ).json();
    expect(recovered.result).toMatchObject({
      kind: 'draft',
      changes: [{ subject: 'Lo', action: 'lades till' }],
    });
    expect(recovered.phase).toBe('error');
    expect(recovered.error).toBe('assistant_request_unfinished');
    expect(recovered.requiredNotice).toContain('Uppdraget är inte slutfört');
    expect(recovered.reply).toContain('Ändringarna genomfördes i utkastet.');
    expect(recovered.reply).toContain(recovered.requiredNotice);
    const recoveryReplies = recovered.completedReplies?.filter((reply) =>
      reply.id.startsWith('batch-'),
    );
    expect(recoveryReplies).toEqual([
      expect.objectContaining({
        request: instruction,
        failed: true,
        requiredNotice: recovered.requiredNotice,
        source: 'text',
      }),
    ]);
    if (question)
      expect(recoveryReplies).toMatchObject([
        {
          questionPending: true,
          questions: [question],
          newQuestions: [question],
        },
      ]);
    const polled: TextAssistantView = await (
      await browser.get(`${endpoint}/messages/unfinished-explanation`)
    ).json();
    expect(polled.phase).toBe('error');
    expect(polled.requiredNotice).toBe(recovered.requiredNotice);
    expect(polled.result).toEqual(recovered.result);
    if (question) expect(polled.questions).toEqual([question]);
    const repeated: TextAssistantView = await (
      await post(`${endpoint}/recover`, { checkId })
    ).json();
    expect(repeated.completedReplies).toEqual(recovered.completedReplies);
    const checkedAgain: TextAssistantView = await (
      await post(`${endpoint}/recover`, { checkId: '22222222-2222-4222-8222-222222222222' })
    ).json();
    expect(checkedAgain).toEqual(repeated);
    expect(model.requests).toHaveLength(1);
    expect(model.authorizationRequests).toHaveLength(authorizations);
    expect(await read()).toEqual(committed);
    expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([]);
    expect((await (await browser.get(`${mapPath()}/operations`)).json()).operations).toEqual([]);
    if (remaining === 'requested save') {
      // Another client explicitly registers a save after batch recovery. The
      // retained batch result must not conceal that independent durable attempt.
      const save = {
        operationId: 'registered-after-batch-recovery',
        version: committed.draft.version,
        contentVersion: committed.contentVersion,
      };
      expect((await post(`${mapPath()}/operations`, save)).status()).toBe(200);
      expect(
        (await (await browser.get(`${mapPath()}/operations`)).json()).operations,
      ).toMatchObject([{ operationId: save.operationId, status: 'pending' }]);
      const saved: TextAssistantView = await (
        await post(`${endpoint}/recover`, {
          checkId: '33333333-3333-4333-8333-333333333333',
        })
      ).json();
      expect(saved.receipt).toMatchObject({ operationId: save.operationId, draftVersion: 1 });
      expect((await read()).draft.changes).toEqual([]);
      expect((await read()).objects).toMatchObject([{ id: 'lo', name: 'Lo' }]);
      expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([
        saved.receipt,
      ]);
      expect(
        (await (await browser.get(`${mapPath()}/operations`)).json()).operations,
      ).toMatchObject([{ operationId: save.operationId, status: 'succeeded' }]);
      const original: TextAssistantView = await (
        await browser.get(`${endpoint}/messages/unfinished-explanation`)
      ).json();
      expect(original.phase).toBe('error');
      expect(original.requiredNotice).toBe(recovered.requiredNotice);
      expect(model.requests).toHaveLength(1);
      expect(model.authorizationRequests).toHaveLength(authorizations);
      return;
    }
    expect(
      (
        await post(`${endpoint}/messages`, {
          requestId: 'later-question',
          revision: repeated.revision,
          draftVersion: repeated.review.version,
          contentVersion: repeated.review.contentVersion,
          text: 'Ställ en fråga om vilken sak jag vill läsa om.',
        })
      ).status(),
    ).toBe(202);
    const waiting: TextAssistantView = await (await browser.get(endpoint)).json();
    expect(waiting.queuedMessages).toBe(1);
    expect(model.requests).toHaveLength(1);
    expect(
      (
        await post(`${endpoint}/abandon-work`, {
          revision: waiting.revision,
          requestId: 'unfinished-explanation',
        })
      ).status(),
    ).toBe(202);
    await expect
      .poll(async () => {
        const later: TextAssistantView = await (await browser.get(endpoint)).json();
        return later.phase === 'ready' && later.questions;
      })
      .toEqual(['Vilken sak vill du läsa om?']);
    const original: TextAssistantView = await (
      await browser.get(`${endpoint}/messages/unfinished-explanation`)
    ).json();
    expect(original.phase).toBe('error');
    expect(original.requiredNotice).toBe(recovered.requiredNotice);
    expect(original.result).toEqual(recovered.result);
    if (question) {
      expect(original.questions).toEqual([question]);
      expect(original.newQuestions).toEqual([question]);
      expect(
        original.completedReplies?.filter((reply) => reply.id.startsWith('batch-')),
      ).toMatchObject([
        {
          questionPending: true,
          questions: [question],
          newQuestions: [question],
        },
      ]);
    }
    const later: TextAssistantView = await (
      await browser.get(`${endpoint}/messages/later-question`)
    ).json();
    expect(later.questions).toEqual(['Vilken sak vill du läsa om?']);
    expect(later.newQuestions).toEqual(['Vilken sak vill du läsa om?']);
    expect(later.error).toBeUndefined();
    expect(later.requiredNotice).toBeUndefined();
    expect(model.requests).toHaveLength(2);
    expect(await read()).toEqual(committed);
  },
);

test.each([
  { suffix: '', boundary: 'unchanged' },
  { suffix: ' after Stop', boundary: 'stop' },
  { suffix: ' after a conversation reset', boundary: 'reset' },
  { suffix: ' with a manual correction during recovery', boundary: 'edit' },
  { suffix: ' with revoked access during recovery', boundary: 'revoke' },
] as const)(
  'an unresolved batch retains its identity through failed status reads and recovers without new work$suffix',
  {
    tags: ['technical'],
  },
  async ({ boundary }) => {
    let typeId: string;
    const delivery = controlledBatchDelivery();
    delivery.blockStatus(true);
    let holdStatus = false;
    const heldStatus: (() => void)[] = [];
    const model = textModel((body) => submitLo(typeId, body));
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      assistantDispatch: async (incoming, dispatch) => {
        const rpc = await incoming
          .clone()
          .json()
          .catch(() => null);
        const response = await delivery.dispatch(incoming, dispatch);
        if (holdStatus && rpc?.params?.name === 'read_draft_batch')
          await new Promise<void>((resolve) => heldStatus.push(resolve));
        return response;
      },
    });
    await setUpHousehold();
    typeId = (await read()).types[0].id;
    const { session, endpoint, post } = await startConversation();
    delivery.arm();
    const checkId = '11111111-1111-4111-8111-111111111111';
    expect(
      (
        await post(`${endpoint}/messages`, {
          requestId: 'unresolved-batch',
          revision: session.revision,
          draftVersion: 0,
          contentVersion: 1,
          text: 'Lägg till Lo utan att spara.',
        })
      ).status(),
    ).toBe(202);
    await expect
      .poll(async () => {
        const current: TextAssistantView = await (await browser.get(endpoint)).json();
        return delivery.status().phase === 'dropped-after-commit' && current.phase !== 'working';
      })
      .toBe(true);
    const committed = await read();
    expect(committed.draft).toMatchObject({
      version: 1,
      changes: [{ id: 'lo', after: { name: 'Lo' } }],
    });
    expect(model.requests).toHaveLength(1);
    let current: TextAssistantView = await (await browser.get(endpoint)).json();
    expect(current.phase).toBe('recovery');
    expect(current.error).toBe('assistant_batch_unknown');
    if (boundary === 'stop' || boundary === 'reset') {
      const response = await post(`${endpoint}/${boundary === 'stop' ? 'cancel' : 'new'}`, {
        revision: current.revision,
      });
      expect(response.status()).toBe(200);
      current = await response.json();
      expect(current.phase).toBe('recovery');
      expect(current.batchPending).toBe(true);
    }
    expect(
      (
        await post(`${endpoint}/messages`, {
          requestId: 'blocked-replacement',
          revision: current.revision,
          draftVersion: 1,
          contentVersion: 1,
          text: 'Lägg till Lo utan att spara.',
        })
      ).status(),
    ).toBe(409);
    current = await (await post(`${endpoint}/recover`, { checkId })).json();
    expect(current.phase).toBe('recovery');
    expect(current.error).toBe('assistant_batch_unknown');
    expect(model.requests).toHaveLength(1);
    expect(await read()).toEqual(committed);
    delivery.blockStatus(false);
    holdStatus = true;
    const checks = [post(`${endpoint}/recover`, { checkId })];
    try {
      await expect.poll(() => heldStatus.length).toBe(1);
      checks.push(post(`${endpoint}/recover`, { checkId }));
      await expect.poll(() => heldStatus.length).toBe(2);
      if (boundary === 'edit') {
        expect(
          (
            await post(`${mapPath()}/draft`, {
              version: 1,
              contentVersion: 1,
              id: 'lo',
              baseRevision: null,
              value: { typeId, name: 'Manuellt rättad Lo' },
            })
          ).status(),
        ).toBe(200);
      } else if (boundary === 'revoke') {
        const { connections } = await (
          await browser.get(`${app.origin}/api/assistants/context`)
        ).json();
        expect(connections).toHaveLength(1);
        expect(
          (await post(`${app.origin}/api/assistants/${connections[0].id}/revoke`, {})).status(),
        ).toBe(200);
      }
    } finally {
      holdStatus = false;
      for (const release of heldStatus) release();
    }
    const responses = await Promise.all(checks);
    if (boundary === 'revoke') {
      for (const response of responses) {
        expect([403, 404]).toContain(response.status());
        expect((await response.json()).result).toBeUndefined();
      }
      expect(await read()).toEqual(committed);
      expect(model.requests).toHaveLength(1);
      return;
    }
    current = await (await browser.get(endpoint)).json();
    if (boundary === 'edit') {
      expect(current.phase).toBe('error');
      expect(current.error).toBe('assistant_batch_committed_changed');
      expect(current.review).toMatchObject({
        version: 2,
        changes: [{ id: 'lo', after: { name: 'Manuellt rättad Lo' } }],
      });
      expect(current.result?.changes).toBeUndefined();
      expect(model.requests).toHaveLength(1);
      expect(current.review).toMatchObject((await read()).draft);
      return;
    }
    expect(current.phase).toBe('ready');
    expect(current.error).toBeUndefined();
    expect(current.review).toMatchObject(committed.draft);
    expect(current.result).toEqual({
      kind: 'draft',
      message: 'Ändringarna genomfördes i utkastet.',
      changes: [{ subject: 'Lo', action: 'lades till' }],
    });
    expect(current.completedReplies?.filter((reply) => reply.id.startsWith('batch-'))).toHaveLength(
      1,
    );
    const repeated: TextAssistantView = await (
      await post(`${endpoint}/recover`, { checkId })
    ).json();
    expect(repeated.result).toEqual(current.result);
    expect(model.requests).toHaveLength(1);
    expect(await read()).toEqual(committed);
    expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([]);
    expect((await (await browser.get(`${mapPath()}/operations`)).json()).operations).toEqual([]);
  },
);

test.each(['new', 'previously opened'] as const)(
  'an unresolved batch blocks direct admission in a %s conversation on another browser',
  { tags: ['technical'] },
  async (timing) => {
    let typeId: string;
    const delivery = controlledBatchDelivery();
    delivery.blockStatus(true);
    const model = textModel((body) => {
      if (model.requests.length > 1) return [modelMessage('Lo finns i ditt utkast.')];
      return submitLo(typeId, body);
    });
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      assistantDispatch: delivery.dispatch,
    });
    await setUpHousehold();
    typeId = (await read()).types[0].id;
    const otherBrowser = await request.newContext();
    try {
      await signIn(otherBrowser, app.origin);
      const base = `${app.origin}/api/households/${householdId}/text-assistant`;
      const post = (client: APIRequestContext, path: string, data: unknown) =>
        client.post(path, { headers: { origin: app.origin }, data });
      const first: TextAssistantView = await (await post(browser, base, approvedForVisit)).json();
      const firstPath = `${base}/${first.id}`;
      let second: TextAssistantView | undefined;
      if (timing === 'previously opened')
        second = await (await post(otherBrowser, base, approvedForVisit)).json();
      delivery.arm();
      expect(
        (
          await post(browser, `${firstPath}/messages`, {
            requestId: 'unknown-first',
            revision: first.revision,
            draftVersion: 0,
            contentVersion: 1,
            text: 'Lägg till Lo utan att spara.',
          })
        ).status(),
      ).toBe(202);
      await expect
        .poll(async () => {
          const current: TextAssistantView = await (await browser.get(firstPath)).json();
          return delivery.status().phase === 'dropped-after-commit' && current.phase === 'recovery';
        })
        .toBe(true);
      const committed = await read();
      expect(committed.draft).toMatchObject({
        version: 1,
        changes: [{ id: 'lo', after: { name: 'Lo' } }],
      });
      expect(model.requests).toHaveLength(1);
      const secondSession: TextAssistantView =
        second ?? (await (await post(otherBrowser, base, approvedForVisit)).json());
      const secondPath = `${base}/${secondSession.id}`;
      const current: TextAssistantView = await (await otherBrowser.get(secondPath)).json();
      expect(current.review).toMatchObject({ version: 1, pendingOperations: [] });
      const admitted = await post(otherBrowser, `${secondPath}/messages`, {
        requestId: 'waiting-second',
        revision: current.revision,
        draftVersion: 1,
        contentVersion: 1,
        text: 'Berätta om Lo utan att ändra något.',
      });
      expect(admitted.status()).toBe(202);
      expect((await admitted.json()).taskStatus).toBe('queued');
      expect(model.requests).toHaveLength(1);
      expect(await read()).toEqual(committed);
      delivery.blockStatus(false);
      const recovered: TextAssistantView = await (
        await post(browser, `${firstPath}/recover`, {})
      ).json();
      expect(recovered.phase).toBe('ready');
      expect(recovered.result).toMatchObject({
        kind: 'draft',
        changes: [{ subject: 'Lo', action: 'lades till' }],
      });
      await expect
        .poll(async () => {
          const current: TextAssistantView = await (await otherBrowser.get(secondPath)).json();
          return current.phase;
        })
        .toBe('ready');
      expect(model.requests).toHaveLength(2);
      const nextInput = JSON.parse(
        String(model.requests[1].input.findLast((item) => item.role === 'user')?.content),
      );
      expect(nextInput.message).toBe('Berätta om Lo utan att ändra något.');
      expect(nextInput.draft).toMatchObject({
        version: 1,
        changes: [{ id: 'lo', after: { name: 'Lo' } }],
      });
      expect(await read()).toEqual(committed);
      expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([]);
      expect((await (await browser.get(`${mapPath()}/operations`)).json()).operations).toEqual([]);
    } finally {
      await otherBrowser.dispose();
    }
  },
);

test.each(['save', 'discard', 'edit', 'remove', 'independent batch'] as const)(
  'a later %s retains committed batch evidence without retaining obsolete private values',
  { tags: ['technical'] },
  async (transition) => {
    app = await createInstallation();
    await setUpHousehold();
    let token = await connect();
    const initial = await read();
    const batch = {
      operationId: 'earlier-independent-batch',
      version: 0,
      contentVersion: 1,
      operations: [
        {
          name: 'propose_object',
          arguments: {
            id: 'lo',
            baseRevision: null,
            value: { typeId: initial.types[0].id, name: 'HEMLIGT TIDIGARE UTKASTVÄRDE' },
          },
        },
      ],
    };
    const applied = await tool(token, 'apply_draft_batch', batch);
    expect(applied.error).toBe(false);
    expect(applied.value.currentDraft).toBe(true);
    const state = await read();
    if (transition === 'independent batch') {
      const later = await tool(token, 'apply_draft_batch', {
        operationId: 'later-independent-batch',
        version: state.draft.version,
        contentVersion: 1,
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'kim',
              baseRevision: null,
              value: { typeId: initial.types[0].id, name: 'Kim' },
            },
          },
        ],
      });
      expect(later.error).toBe(false);
    } else {
      const route =
        transition === 'edit' ? 'draft' : transition === 'remove' ? 'discard-change' : transition;
      const response = await browser.post(`${mapPath()}/${route}`, {
        headers: { origin: app.origin },
        data: {
          version: state.draft.version,
          contentVersion: 1,
          ...(transition === 'save' ? { operationId: 'save-original' } : {}),
          ...(transition === 'remove' ? { kind: 'object', id: 'lo' } : {}),
          ...(transition === 'edit'
            ? {
                id: 'lo',
                baseRevision: null,
                value: { typeId: initial.types[0].id, name: 'Aktuellt rättat namn' },
              }
            : {}),
        },
      });
      expect(response.status(), await response.text()).toBe(200);
    }
    const current = await read();
    const history = await (await browser.get(`${mapPath()}/history`)).json();
    browser = await restartWithSession(browser, () => app.restart());
    token = await connect();
    const recovered = await tool(token, 'read_draft_batch', {
      operationId: batch.operationId,
      contentVersion: 1,
    });
    expect(recovered.error).toBe(false);
    expect(recovered.value.batch).toEqual({
      operationId: batch.operationId,
      status: 'committed',
      contentVersion: 1,
      fromVersion: 0,
      version: 1,
      appliedCount: 1,
      currentDraft: false,
    });
    expect(JSON.stringify(recovered.value)).not.toContain('HEMLIGT TIDIGARE UTKASTVÄRDE');
    const replay = await tool(token, 'apply_draft_batch', batch);
    expect(replay).toEqual({ error: false, value: recovered.value.batch });
    expect(await read()).toEqual(current);
    expect(await (await browser.get(`${mapPath()}/history`)).json()).toEqual(history);
  },
);

test('a batch that discards private work retains only committed metadata from its first commit', {
  tags: ['technical'],
}, async () => {
  app = await createInstallation();
  await setUpHousehold();
  const initial = await read();
  expect(
    (
      await browser.post(`${mapPath()}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: 0,
          contentVersion: 1,
          id: 'private',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'HEMLIGT KASTAT UTKASTVÄRDE' },
        },
      })
    ).status(),
  ).toBe(200);
  const token = await connect();
  const batch = {
    operationId: 'discarding-batch',
    version: 1,
    contentVersion: 1,
    operations: [{ name: 'discard_draft', arguments: {} }],
  };
  expect((await tool(token, 'apply_draft_batch', batch)).error).toBe(false);
  expect((await read()).draft).toEqual({ version: 2, changes: [] });
  const recovered = await tool(token, 'read_draft_batch', {
    operationId: batch.operationId,
    contentVersion: 1,
  });
  expect(recovered.error).toBe(false);
  expect(JSON.stringify(recovered.value)).not.toContain('HEMLIGT KASTAT UTKASTVÄRDE');
  expect(recovered.value.batch).toEqual({
    operationId: batch.operationId,
    status: 'committed',
    contentVersion: 1,
    fromVersion: 1,
    version: 2,
    appliedCount: 1,
    currentDraft: true,
  });
  expect(await tool(token, 'apply_draft_batch', batch)).toEqual({
    error: false,
    value: recovered.value.batch,
  });
  expect((await read()).draft).toEqual({ version: 2, changes: [] });
});

test.each([
  { boundary: 'batch', suffix: '' },
  { boundary: 'draft read', suffix: ' during a draft response race' },
] as const)(
  'a committed batch changed during withheld delivery pauses with its verified outcome and the actual current draft$suffix',
  {
    tags: ['technical'],
  },
  async ({ boundary }) => {
    let typeId: string;
    let dropped = false;
    let intercepted = false;
    let checkedBatch = false;
    const delivery = controlledBatchDelivery();
    if (boundary === 'draft read') delivery.arm();
    const model = textModel((body) => submitLo(typeId, body));
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      assistantDispatch: async (incoming, dispatch) => {
        const rpc = await incoming
          .clone()
          .json()
          .catch(() => null);
        const response = await (boundary === 'draft read'
          ? delivery.dispatch(incoming, dispatch)
          : dispatch(incoming));
        if (boundary === 'draft read' && rpc?.params?.name === 'read_draft_batch') {
          const envelope = await response.clone().json();
          expect(JSON.parse(envelope.result.content[0].text).batch).toMatchObject({
            operationId: delivery.status().operationId,
            status: 'committed',
            version: 1,
            currentDraft: true,
          });
          checkedBatch = true;
        }
        const withheld =
          boundary === 'batch'
            ? rpc?.params?.name === 'apply_draft_batch'
            : rpc?.params?.name === 'read_my_draft' &&
              delivery.status().phase === 'dropped-after-commit';
        if (withheld && !intercepted) {
          intercepted = true;
          const envelope = await response.clone().json();
          const value = JSON.parse(envelope.result.content[0].text);
          if (boundary === 'draft read') {
            expect(checkedBatch).toBe(true);
            expect(value).toMatchObject({
              version: 1,
              changes: [{ id: 'lo', after: { name: 'Lo' } }],
            });
          } else expect(value).toMatchObject({ status: 'committed', version: 1 });
          const committed = await read();
          expect(committed.draft).toMatchObject({
            version: 1,
            changes: [{ id: 'lo', after: { name: 'Lo' } }],
          });
          expect(
            (
              await browser.post(`${mapPath()}/draft`, {
                headers: { origin: app.origin },
                data: {
                  version: 1,
                  contentVersion: 1,
                  id: 'lo',
                  baseRevision: null,
                  value: { typeId, name: 'Manuellt rättad Lo' },
                },
              })
            ).status(),
          ).toBe(200);
          dropped = true;
          if (boundary === 'batch') throw new Error('Lost batch response after manual correction');
        }
        return response;
      },
    });
    await setUpHousehold();
    typeId = (await read()).types[0].id;
    const { session, endpoint } = await startConversation();
    expect(
      (
        await browser.post(`${endpoint}/messages`, {
          headers: { origin: app.origin },
          data: {
            requestId: 'committed-then-edited',
            revision: session.revision,
            draftVersion: 0,
            contentVersion: 1,
            text: 'Lägg till Lo utan att spara.',
          },
        })
      ).status(),
    ).toBe(202);
    await expect.poll(() => dropped).toBe(true);
    await expect
      .poll(async () => {
        const current: TextAssistantView = await (await browser.get(endpoint)).json();
        return dropped && current.phase !== 'working';
      })
      .toBe(true);
    const completed: TextAssistantView = await (await browser.get(endpoint)).json();
    expect(dropped).toBe(true);
    expect((await read()).draft).toMatchObject({
      version: 2,
      changes: [{ id: 'lo', after: { name: 'Manuellt rättad Lo' } }],
    });
    expect(model.requests).toHaveLength(1);
    expect(completed.phase).toBe('error');
    expect(completed.error).toBe('assistant_batch_committed_changed');
    expect(completed.reply).toContain('genomfördes');
    expect(completed.result?.changes).toBeUndefined();
    expect(completed.review).toMatchObject({
      version: 2,
      changes: [{ id: 'lo', after: { name: 'Manuellt rättad Lo' } }],
    });
    expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([]);
    expect((await (await browser.get(`${mapPath()}/operations`)).json()).operations).toEqual([]);
  },
);

test('a direct one-operation change recovers its lost committed response through the durable batch contract', {
  tags: ['technical'],
}, async () => {
  let typeId: string;
  const delivery = controlledBatchDelivery();
  delivery.arm();
  const model = textModel((body) => {
    if (lastToolResult(body)) return [modelMessage('Lo finns i ditt utkast.')];
    const { draft } = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('propose_object', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        id: 'lo',
        baseRevision: null,
        value: { typeId, name: 'Lo' },
      }),
    ];
  });
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    assistantDispatch: delivery.dispatch,
  });
  await setUpHousehold();
  typeId = (await read()).types[0].id;
  const { session, endpoint } = await startConversation();
  expect(
    (
      await browser.post(`${endpoint}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId: 'direct-recovery',
          revision: session.revision,
          draftVersion: 0,
          contentVersion: 1,
          text: 'Lägg till Lo utan att spara.',
        },
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(
      async () =>
        delivery.status().phase === 'dropped-after-commit' &&
        (await (await browser.get(endpoint)).json()).phase !== 'working',
    )
    .toBe(true);
  const completed: TextAssistantView = await (await browser.get(endpoint)).json();
  expect(delivery.status().phase).toBe('dropped-after-commit');
  expect((await read()).draft).toMatchObject({
    version: 1,
    changes: [{ id: 'lo', after: { name: 'Lo' } }],
  });
  // The normal direct flow may need its ordinary final model response. Recovery
  // itself must not repeat the instruction or add another work round.
  expect(model.requests.length).toBeGreaterThanOrEqual(1);
  expect(model.requests.length).toBeLessThanOrEqual(2);
  expect(completed.phase).toBe('ready');
  expect(completed.error).toBeUndefined();
  if (model.requests[1]) {
    const result = lastToolResult(model.requests[1]);
    expect(result).toMatchObject({ version: 1, changes: [{ id: 'lo' }] });
    expect(result.applied).toBeUndefined();
    expect(result.operationId).toBeUndefined();
  }
  expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([]);
});

test('an explicit whole-draft discard recovers lost committed delivery without model work', {
  tags: ['technical'],
}, async () => {
  const delivery = controlledBatchDelivery();
  delivery.arm();
  const model = textModel(() => {
    throw new Error('Explicit discard must not start model work');
  });
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    assistantDispatch: delivery.dispatch,
  });
  await setUpHousehold();
  const initial = await read();
  expect(
    (
      await browser.post(`${mapPath()}/draft`, {
        headers: { origin: app.origin },
        data: {
          version: 0,
          contentVersion: 1,
          id: 'private',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Kastat förslag' },
        },
      })
    ).status(),
  ).toBe(200);
  const { session, endpoint } = await startConversation();
  const body = {
    requestId: 'explicit-discard-recovery',
    revision: session.revision,
    draftVersion: 1,
    contentVersion: 1,
    text: 'Kasta utkastet.',
  };
  expect(
    (
      await browser.post(`${endpoint}/messages`, { headers: { origin: app.origin }, data: body })
    ).status(),
  ).toBe(202);
  await expect
    .poll(
      async () =>
        delivery.status().phase === 'dropped-after-commit' &&
        (await (await browser.get(endpoint)).json()).phase !== 'working',
    )
    .toBe(true);
  expect(delivery.status().phase).toBe('dropped-after-commit');
  expect((await read()).draft).toEqual({ version: 2, changes: [] });
  expect(model.requests).toEqual([]);
  const completed: TextAssistantView = await (await browser.get(endpoint)).json();
  expect(completed.phase).toBe('ready');
  expect(completed.discarded).toBe(true);
  expect(completed.reply).toBe('Utkastet är kastat.');
  expect(
    (
      await browser.post(`${endpoint}/messages`, { headers: { origin: app.origin }, data: body })
    ).status(),
  ).toBe(202);
  expect((await read()).draft).toEqual({ version: 2, changes: [] });
  browser = await restartWithSession(browser, () => app.restart());
  expect((await read()).draft).toEqual({ version: 2, changes: [] });
  expect((await (await browser.get(`${mapPath()}/operations`)).json()).operations).toEqual([]);
  expect(model.requests).toEqual([]);
});

test('a recovered direct duplicate relationship preserves existingId and leaves the saved edge unchanged', {
  tags: ['technical'],
}, async () => {
  let edgeType: string;
  const delivery = controlledBatchDelivery();
  let delivered: Record<string, unknown> | undefined;
  const model = textModel((body) => {
    const result = lastToolResult(body);
    if (result) {
      delivered = result;
      return [modelMessage('Sambandet finns redan.')];
    }
    const { draft } = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('propose_relationship', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        id: 'duplicate',
        baseRevision: null,
        value: { typeId: edgeType, sourceId: 'source', targetId: 'target' },
      }),
    ];
  });
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    assistantDispatch: delivery.dispatch,
  });
  await setUpHousehold();
  const initial = await read();
  edgeType = initial.relationshipTypes[0].id;
  const seeded = await tool(await connect(), 'apply_draft_batch', {
    operationId: 'seed-endpoints',
    version: 0,
    contentVersion: 1,
    operations: [
      ...['source', 'target'].map((id) => ({
        name: 'propose_object',
        arguments: { id, baseRevision: null, value: { typeId: initial.types[0].id, name: id } },
      })),
      {
        name: 'propose_relationship',
        arguments: {
          id: 'existing-edge',
          baseRevision: null,
          value: { typeId: edgeType, sourceId: 'source', targetId: 'target' },
        },
      },
    ],
  });
  expect(seeded.error).toBe(false);
  expect(
    (
      await browser.post(`${mapPath()}/save`, {
        headers: { origin: app.origin },
        data: {
          operationId: 'save-endpoints',
          version: 3,
          contentVersion: 1,
        },
      })
    ).status(),
  ).toBe(200);
  const before = await read();
  const { session, endpoint } = await startConversation();
  delivery.arm();
  expect(
    (
      await browser.post(`${endpoint}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId: 'duplicate-edge-recovery',
          revision: session.revision,
          draftVersion: before.draft.version,
          contentVersion: 1,
          text: 'Ange om sambandet redan finns, utan att skapa en kopia.',
        },
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(
      async () =>
        delivery.status().phase === 'dropped-after-commit' &&
        (await (await browser.get(endpoint)).json()).phase !== 'working',
    )
    .toBe(true);
  expect(delivery.status().phase).toBe('dropped-after-commit');
  expect(delivered).toMatchObject({ version: 4, existingId: 'existing-edge', changes: [] });
  expect(delivered?.operationId).toBeUndefined();
  expect(delivered?.applied).toBeUndefined();
  expect(await read()).toEqual(before);
  expect(model.requests).toHaveLength(2);
});

test('a verified failed later draft batch reports its failure without inventing a save attempt or losing earlier committed work', {
  tags: ['technical'],
}, async () => {
  let typeId: string;
  let round = 0;
  const ids: string[] = [];
  const model = textModel((body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    const draft = lastToolResult(body)?.review ?? input.draft;
    const first = round++ === 0;
    return [
      modelTool('submit_changes', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        completion: 'draft',
        continueResponse: first,
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: first ? 'lo' : 'kim',
              baseRevision: null,
              value: { typeId, name: first ? 'Lo' : 'Kim' },
            },
          },
        ],
      }),
    ];
  });
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    assistantDispatch: async (incoming, dispatch) => {
      const rpc = await incoming
        .clone()
        .json()
        .catch(() => null);
      if (rpc?.params?.name === 'apply_draft_batch') ids.push(rpc.params.arguments.operationId);
      return dispatch(incoming);
    },
  });
  await setUpHousehold();
  typeId = (await read()).types[0].id;
  const storage = new Database(join(app.directory, 'skyttel.db'));
  storage.exec(
    "CREATE TRIGGER later_evidence_unavailable BEFORE INSERT ON draft_batch_outcome WHEN NEW.fromVersion = 1 BEGIN SELECT RAISE(ABORT, 'controlled later evidence outage'); END",
  );
  storage.close();
  const { session, endpoint } = await startConversation();
  expect(
    (
      await browser.post(`${endpoint}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId: 'independent-then-failed',
          revision: session.revision,
          draftVersion: 0,
          contentVersion: 1,
          text: 'Lägg till Lo och Kim som självständiga förslag utan att spara.',
        },
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(async () => (await (await browser.get(endpoint)).json()).phase)
    .not.toBe('working');
  const completed: TextAssistantView = await (await browser.get(endpoint)).json();
  expect(ids).toHaveLength(2);
  expect(model.requests).toHaveLength(2);
  expect((await read()).draft).toMatchObject({
    version: 1,
    changes: [{ id: 'lo', after: { name: 'Lo' } }],
  });
  expect(completed.result?.changes).toEqual([{ subject: 'Lo', action: 'lades till' }]);
  const grant = await connect();
  expect(
    (await tool(grant, 'read_draft_batch', { operationId: ids[0], contentVersion: 1 })).value.batch,
  ).toMatchObject({ status: 'committed', version: 1, currentDraft: true });
  expect(
    (await tool(grant, 'read_draft_batch', { operationId: ids[1], contentVersion: 1 })).value,
  ).toEqual({ batch: null });
  expect((await (await browser.get(`${mapPath()}/operations`)).json()).operations).toEqual([]);
  expect((await (await browser.get(`${mapPath()}/history`)).json()).history).toEqual([]);
  expect(completed.receipt).toBeUndefined();
  expect(completed.reply).not.toContain('Sparresultatet');
  expect(completed.error).toBe('assistant_batch_not_committed');
  expect(completed.reply).toContain('genomfördes inte');
});

test('a terminal immutable-request conflict cannot use an earlier committed row as proof that different requested work succeeded', {
  tags: ['technical'],
}, async () => {
  let typeId: string;
  let seeded = false;
  let rejected = false;
  const model = textModel((body) => {
    const { draft } = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('submit_changes', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        completion: 'draft',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'requested',
              baseRevision: null,
              value: { typeId, name: 'Begärt förslag' },
            },
          },
        ],
      }),
    ];
  });
  app = await createInstallation(undefined, {
    modelFetch: model.provider,
    assistantDispatch: async (incoming, dispatch) => {
      const rpc = await incoming
        .clone()
        .json()
        .catch(() => null);
      if (rpc?.params?.name === 'apply_draft_batch' && !seeded) {
        seeded = true;
        // Arrange the collision through the real authorized MCP handler:
        // another immutable request already uses this very operation ID.
        const previous = structuredClone(rpc);
        previous.params.arguments.operations[0].arguments.id = 'earlier';
        previous.params.arguments.operations[0].arguments.value.name = 'Tidigare förslag';
        const first = await dispatch(new Request(incoming, { body: JSON.stringify(previous) }));
        const firstEnvelope = await first.json();
        expect(firstEnvelope.result.isError).not.toBe(true);
        const response = await dispatch(incoming);
        const envelope = await response.clone().json();
        rejected =
          envelope.result.isError === true &&
          JSON.parse(envelope.result.content[0].text).error === 'operation_conflict';
        return response;
      }
      return dispatch(incoming);
    },
  });
  await setUpHousehold();
  typeId = (await read()).types[0].id;
  const { session, endpoint } = await startConversation();
  expect(
    (
      await browser.post(`${endpoint}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId: 'immutable-conflict',
          revision: session.revision,
          draftVersion: 0,
          contentVersion: 1,
          text: 'Lägg till det begärda förslaget utan att spara.',
        },
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(async () => (await (await browser.get(endpoint)).json()).phase)
    .not.toBe('working');
  expect(rejected).toBe(true);
  expect((await read()).draft).toMatchObject({
    version: 1,
    changes: [{ id: 'earlier', after: { name: 'Tidigare förslag' } }],
  });
  expect(model.requests).toHaveLength(1);
  const completed: TextAssistantView = await (await browser.get(endpoint)).json();
  expect(completed.phase).toBe('error');
  expect(completed.error).toBe('operation_conflict');
  expect(completed.reply).not.toContain('Sparförsöket');
  expect(completed.result).toBeUndefined();
});
