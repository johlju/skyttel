import { expect, test } from 'vitest';
import {
  contextLimitFixture,
  runApplicationContextLimit,
  runContextLimit,
} from '../../../scripts/model-evaluation/context-limit.js';
import type { ProviderCall } from '../../../scripts/model-evaluation/provider.js';
import type { AssistantObservation } from '../../../src/server/assistant-observation.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import {
  lastToolResult,
  modelMessage,
  modelTool,
  pricedProvider,
  textModel,
} from '../../support/text-model.js';

const postAsClient = (request: Request, url: string, data: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: {
      cookie: request.headers.get('cookie') ?? '',
      origin: new URL(request.url).origin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(data),
  });

test.each(['canceled', 'expired', 'http-error'] as const)(
  'context growth retains %s terminal evidence after a committed draft batch',
  { tags: ['technical'], timeout: 30_000 },
  async (terminal) => {
    let clock = Date.now();
    let committed!: () => void;
    const batchCommitted = new Promise<void>((resolve) => {
      committed = resolve;
    });
    let releaseBatch!: () => void;
    const heldBatch = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    let work = 0;
    const model = textModel((body) => {
      if (work++ === 0) return [modelTool('read_my_draft', {})];
      if (work > 2) return [modelMessage('Ett senare svar.')];
      const draft = lastToolResult(body);
      const change = draft.changes.find((item: { id: string }) => item.id === 'lo');
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
                baseRevision: change.before?.revision ?? null,
                value: { ...change.after, name: 'Lo med nytt namn' },
              },
            },
          ],
        }),
      ];
    });
    const records: ProviderCall[] = [];
    const provider = pricedProvider(model.provider);
    const privateEvents: AssistantObservation[] = [];
    const installationEvents: AssistantObservation[] = [];
    let terminalPolls = 0;
    let arranged = false;
    const result = await runApplicationContextLimit(
      {
        now: () => clock,
        modelFetch: async (url, init) => {
          const body = JSON.parse(String(init?.body));
          const record: ProviderCall = {
            id: `controlled-${records.length}`,
            startedAt: Date.now(),
            kind: 'backend',
            profile: 'controlled',
            model: body.model,
            request: body,
            costUsd: 0,
            reservationUsd: 0,
            outcome: 'started',
          };
          records.push(record);
          const response = await provider(url, init);
          record.response = await response.clone().json();
          record.endedAt = Date.now();
          record.outcome = 'completed';
          return response;
        },
        observe: (event) => {
          installationEvents.push(event);
          if (event.kind === 'task_completed') committed();
        },
        assistantDispatch: async (request, dispatch) => {
          const rpc = await request
            .clone()
            .json()
            .catch(() => null);
          const response = await dispatch(request);
          if (rpc?.params?.name === 'apply_draft_batch') {
            committed();
            await heldBatch;
          }
          return response;
        },
        deliverResponse: async (request, response) => {
          const path = new URL(request.url).pathname;
          if (request.method === 'POST' && path.endsWith('/messages') && !arranged) {
            arranged = true;
            await batchCommitted;
            if (terminal === 'expired') {
              const view = (await response.clone().json()) as TextAssistantView;
              // Keep the original terminal result accessible after its own deadline.
              clock += 60_000;
              const later = await postAsClient(request, request.url, {
                requestId: 'later-accepted-request',
                revision: view.revision,
                draftVersion: view.review.version,
                contentVersion: view.review.contentVersion,
                text: 'Beskriv sedan mitt utkast.',
              });
              expect(later.status).toBe(202);
              await later.arrayBuffer();
              clock += 29 * 60_000;
            } else {
              const canceled = await postAsClient(
                request,
                request.url.replace(/\/messages$/, '/cancel'),
                { all: true },
              );
              expect(canceled.status).toBe(200);
              await canceled.arrayBuffer();
            }
            releaseBatch();
          }
          if (request.method === 'GET' && /\/messages\/[^/]+$/.test(path)) {
            terminalPolls++;
            if (terminal === 'http-error')
              return Response.json({ error: 'controlled_reply_lost' }, { status: 503 });
          }
          return response;
        },
      },
      {
        origin: 'controlled',
        contextTokens: 1_050_000,
        maximumTurns: 2,
        profile: 'controlled',
        repetition: 1,
        providerRecords: () => records,
        recordObservation: (event) => privateEvents.push(event),
      },
    );
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]).toMatchObject({
      outcome: terminal === 'canceled' ? 'aborted' : 'error',
      reason:
        terminal === 'http-error' ? 'evaluation_http_503' : `evaluation_application_${terminal}`,
      ...(terminal === 'http-error' ? {} : { taskStatus: terminal }),
      inputTokens: 120,
      summary: false,
      callIds: expect.arrayContaining(['controlled-0', 'controlled-1']),
      fixed: expect.arrayContaining(['effective_objects']),
      observedEndMs: expect.any(Number),
      successfulCompletionMs: null,
      state: {
        draft: {
          changes: expect.arrayContaining([
            expect.objectContaining({
              id: 'lo',
              after: expect.objectContaining({ name: 'Lo med nytt namn' }),
            }),
          ]),
        },
        saved: {
          objects: expect.arrayContaining([expect.objectContaining({ id: 'lo', name: 'Lo Berg' })]),
        },
        historyChanges: 0,
        saveOperations: [],
      },
    });
    expect(terminalPolls).toBe(1);
    expect(result.boundary).toBe('inconclusive');
    expect(result.physicalProviderMaximum).toBe('unverified');
    expect(result.successfulCompletionMs).toBeNull();
    const batchEvent = privateEvents.find(
      (event) =>
        event.kind === 'mcp_started' &&
        (event.data as { name: string }).name === 'apply_draft_batch',
    );
    expect(batchEvent?.data).toMatchObject({ args: { operations: expect.any(Array) } });
    expect(installationEvents).toContainEqual(batchEvent);
  },
);

test.each(['pass', 'fail', 'error', 'aborted', 'inconclusive', 'not_run'] as const)(
  'ordinary growth stops at its first low-usage transition after one %s recall',
  {
    tags: ['technical'],
  },
  async (recallOutcome) => {
    const fixture = contextLimitFixture(3);
    const submitted: string[] = [];
    const result = await runContextLimit(fixture, {
      origin: 'provider',
      contextTokens: 1_050_000,
      submit: async (text, stage) => {
        submitted.push(text);
        return {
          outcome: stage === 'recall' ? recallOutcome : 'pass',
          generation: stage === 'seed' ? 0 : 1,
          inputTokens: stage === 'seed' ? 120 : stage === 'growth' ? 140 : 160,
          summary: stage === 'growth',
          callIds: stage === 'growth' ? ['summary', 'growth'] : [stage],
        };
      },
    });
    expect(submitted).toEqual([fixture.seed, fixture.growth[0], fixture.recall]);
    expect(result.boundary).toBe(
      recallOutcome === 'pass' ? 'configuration_limited' : 'inconclusive',
    );
    expect(result.reason).toBe(
      recallOutcome === 'pass'
        ? 'natural_application_transition_before_measured_capacity'
        : 'recall_not_verified_after_application_transition',
    );
    expect(result.physicalProviderMaximum).toBe('unverified');
    expect(result.turns).toEqual([
      {
        stage: 'seed',
        outcome: 'pass',
        generation: 0,
        inputTokens: 120,
        summary: false,
        callIds: ['seed'],
      },
      {
        stage: 'growth',
        outcome: 'pass',
        generation: 1,
        inputTokens: 140,
        summary: true,
        callIds: ['summary', 'growth'],
      },
      {
        stage: 'recall',
        outcome: recallOutcome,
        generation: 1,
        inputTokens: 160,
        summary: false,
        callIds: ['recall'],
      },
    ]);
    expect(result.successfulCompletionMs).toBeNull();
    expect(fixture.growth.every((text) => text.length <= 4000)).toBe(true);
  },
);

test.each(['seed-summary', 'generation-only'] as const)(
  'an observed %s transition stops growth even without both transition signals',
  { tags: ['technical'] },
  async (signal) => {
    const stages: string[] = [];
    const result = await runContextLimit(contextLimitFixture(4), {
      origin: 'provider',
      contextTokens: 1_050_000,
      submit: async (_text, stage) => {
        stages.push(stage);
        return {
          outcome: 'pass',
          generation: signal === 'generation-only' && stage !== 'seed' ? 1 : 0,
          inputTokens: null,
          summary: signal === 'seed-summary' && stage === 'seed',
        };
      },
    });
    expect(stages).toEqual(
      signal === 'seed-summary' ? ['seed', 'recall'] : ['seed', 'growth', 'recall'],
    );
    expect(result.boundary).toBe('configuration_limited');
    expect(result.physicalProviderMaximum).toBe('unverified');
  },
);

test('bounded growth uses ordinary authenticated application messages and real state checks without a summary hook', {
  tags: ['technical'],
  timeout: 30_000,
}, async () => {
  const model = textModel(
    () => [modelMessage('Diskussionsunderlaget är mottaget.')],
    () => [
      modelMessage(
        JSON.stringify({ mode: 'read', request: 'Diskutera utan ändringar eller sparande.' }),
      ),
    ],
  );
  const result = await runApplicationContextLimit(
    { modelFetch: pricedProvider(model.provider) },
    {
      origin: 'controlled',
      contextTokens: 1_050_000,
      maximumTurns: 2,
      profile: 'controlled',
      repetition: 1,
    },
  );
  expect(result.boundary).toBe('inconclusive');
  expect(result.physicalProviderMaximum).toBe('unverified');
  expect(result.turns).toHaveLength(3);
  expect(result.turns.every((turn) => turn.outcome === 'pass' && turn.fixed?.length === 0)).toBe(
    true,
  );
  expect(model.requests).toHaveLength(3);
  expect(
    model.requests[1].input.some((item) => JSON.stringify(item).includes('björklöv 731')),
  ).toBe(true);
  expect(
    model.requests.every((request) => !request.instructions.startsWith('Sammanfatta avslutad')),
  ).toBe(true);
});

test.each(['fail', 'error', 'aborted', 'inconclusive', 'not_run'] as const)(
  'a terminal %s growth turn prevents recall even when it observes a transition',
  {
    tags: ['technical'],
  },
  async (outcome) => {
    const stages: string[] = [];
    const result = await runContextLimit(contextLimitFixture(4), {
      origin: 'controlled',
      contextTokens: 1_050_000,
      submit: async (_text, stage) => {
        stages.push(stage);
        return {
          outcome: stage === 'seed' ? 'pass' : outcome,
          generation: stage === 'seed' ? 0 : 1,
          inputTokens: 120,
          summary: stage === 'growth',
          callIds: [stage],
        };
      },
    });
    expect(stages).toEqual(['seed', 'growth']);
    expect(result.turns).toHaveLength(2);
    expect(result.turns[1]).toEqual({
      stage: 'growth',
      outcome,
      generation: 1,
      inputTokens: 120,
      summary: true,
      callIds: ['growth'],
    });
    expect(result.reason).toBe(`terminal_turn_${outcome}`);
    expect(result.boundary).toBe('inconclusive');
    expect(result.physicalProviderMaximum).toBe('unverified');
    expect(result.successfulCompletionMs).toBeNull();
  },
);

test.each(['seed', 'growth'] as const)(
  'measured %s usage can establish only an application boundary after verified recall',
  {
    tags: ['technical'],
  },
  async (measuredStage) => {
    const stages: string[] = [];
    const result = await runContextLimit(contextLimitFixture(4), {
      origin: 'provider',
      contextTokens: 1_050_000,
      submit: async (_text, stage) => {
        stages.push(stage);
        return {
          outcome: 'pass',
          generation: stage === 'seed' ? 0 : 1,
          inputTokens: stage === measuredStage ? 1_000_000 : 500,
          summary: stage === 'growth',
        };
      },
    });
    expect(stages).toEqual(['seed', 'growth', 'recall']);
    expect(result.boundary).toBe('application_boundary');
    expect(result.physicalProviderMaximum).toBe('unverified');
    expect(result.reason).toBe('natural_application_transition_after_measured_growth');
  },
);
