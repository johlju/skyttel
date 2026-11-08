import { expect, test } from 'vitest';
import { runTextScenario } from '../../../scripts/model-evaluation/runner.js';
import type { Scenario } from '../../../scripts/model-evaluation/types.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import {
  lastToolResult,
  modelMessage,
  modelTool,
  pendingUpdate,
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

test('intermediate prose is a response observation but cannot establish the first useful answer', {
  tags: ['technical'],
}, async () => {
  let statusDelivered!: () => void;
  const status = new Promise<void>((resolve) => {
    statusDelivered = resolve;
  });
  const model = textModel(async () => {
    await status;
    await new Promise((resolve) => setTimeout(resolve, 120));
    return [modelMessage('Det verifierade fullständiga svaret.')];
  });
  const run = await runTextScenario(
    {
      id: 'status-before-answer',
      title: 'Status before useful answer',
      voice: false,
      steps: [
        {
          id: 'answer',
          text: 'Besvara frågan.',
          expected: { requirements: ['Ge det fullständiga svaret.'] },
        },
      ],
    },
    {
      modelFetch: model.provider,
      deliverResponse: async (request, response) => {
        if (request.method === 'GET' && /\/messages\/[^/]+$/.test(new URL(request.url).pathname)) {
          const view = (await response.clone().json()) as TextAssistantView;
          if (view.taskStatus === 'working') {
            statusDelivered();
            const headers = new Headers(response.headers);
            headers.delete('content-length');
            return Response.json({ ...view, modelReply: 'Jag undersöker frågan.' }, { headers });
          }
        }
        return response;
      },
    },
    {
      profile: 'local',
      repetition: 1,
      judge: async (input) => {
        expect(input.sources.backend?.text).toContain('Det verifierade fullständiga svaret.');
        return input.requirements.map(({ id }) => ({
          id,
          outcome: 'pass',
          reason: 'Complete required answer delivered.',
        }));
      },
    },
  );
  expect(run.attempts[0]).toMatchObject({ outcome: 'pass' });
  expect(run.attempts[0].timing?.firstResponseMs).not.toBeNull();
  expect(run.attempts[0].timing?.firstUsefulMs).toBeNull();
  expect(
    (run.attempts[0].timing?.firstVerifiedUsefulMs ?? 0) -
      (run.attempts[0].timing?.firstResponseMs ?? 0),
  ).toBeGreaterThanOrEqual(100);
  expect(run.attempts[0].timing?.firstUsefulLimitation).toContain(
    'earlier delivered prose is unverified',
  );
});

test.each(['completed', 'canceled'] as const)(
  'text %s retains the submitted request queue wait independently of successful completion',
  {
    tags: ['technical'],
  },
  async (terminal) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let canceled = false;
    let work = 0;
    const model = textModel(async (_body, signal) => {
      if (work++ === 0) {
        await Promise.race([
          held,
          new Promise<void>((resolve) =>
            signal?.addEventListener('abort', () => resolve(), { once: true }),
          ),
        ]);
        return [modelMessage('Det tidigare svaret.')];
      }
      if (terminal === 'canceled')
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve();
          else signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      return [modelMessage('Det nya fullständiga svaret.')];
    });
    try {
      const run = await runTextScenario(
        {
          id: 'queued',
          title: 'Queued text delivery',
          voice: false,
          steps: [{ id: 'read', text: 'En ny fråga.', expected: { requirements: [] } }],
        },
        {
          modelFetch: model.provider,
          deliverResponse: async (request, response) => {
            if (
              request.method === 'POST' &&
              /\/text-assistant$/.test(new URL(request.url).pathname)
            ) {
              const view = (await response.clone().json()) as TextAssistantView;
              const accepted = await postAsClient(request, `${request.url}/${view.id}/messages`, {
                requestId: 'earlier-request',
                revision: view.revision,
                draftVersion: view.review.version,
                contentVersion: view.review.contentVersion,
                text: 'Håll den tidigare frågan.',
              });
              if (!accepted.ok) throw new Error('controlled_queue_admission_failed');
            }
            if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/messages')) {
              const view = (await response.clone().json()) as TextAssistantView;
              if (view.queuedMessages) timer = setTimeout(release, 150);
            }
            if (
              terminal === 'canceled' &&
              !canceled &&
              request.method === 'GET' &&
              /\/messages\/[^/]+$/.test(new URL(request.url).pathname)
            ) {
              const view = (await response.clone().json()) as TextAssistantView;
              if (view.taskStatus === 'working' && work === 2) {
                const cancellation = await postAsClient(
                  request,
                  request.url.replace(/\/messages\/[^/]+$/, '/cancel'),
                  { all: true },
                );
                expect(cancellation.status).toBe(200);
                await cancellation.arrayBuffer();
                canceled = true;
              }
            }
            return response;
          },
        },
        { profile: 'local', repetition: 1 },
      );
      const result = run.attempts[0];
      expect(result.timing?.queueMs).toBeGreaterThanOrEqual(70);
      expect(result.observedEndMs).toBeGreaterThanOrEqual(result.timing?.queueMs ?? 0);
      if (terminal === 'completed') {
        expect(result).toMatchObject({ outcome: 'pass', timing: { contract: 'text-delivery-v2' } });
        expect(result.timing?.firstUsefulMs).toBeGreaterThanOrEqual(result.timing?.queueMs ?? 0);
        expect(result.elapsedMs).toBeGreaterThanOrEqual(result.timing?.queueMs ?? 0);
      } else {
        expect(canceled).toBe(true);
        expect(result).toMatchObject({
          outcome: 'aborted',
          reason: 'evaluation_application_canceled',
          elapsedMs: null,
          timing: { firstUsefulMs: null, successfulCompletionMs: null },
        });
      }
    } finally {
      release();
      clearTimeout(timer);
    }
  },
);

test.each(['incomplete', 'canceled'] as const)(
  'text %s preserves its observed outcome without successful completion time',
  { tags: ['technical'] },
  async (mode) => {
    let stopped = false;
    const model = textModel(async (_body, signal) => {
      if (mode === 'canceled') {
        stopped = true;
        await new Promise<void>((resolve) => {
          if (signal?.aborted) resolve();
          else signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      }
      return [modelMessage('Ett ofullständigt eller sent svar.')];
    });
    const run = await runTextScenario(
      {
        id: 'unfinished',
        title: 'Unfinished text',
        voice: false,
        steps: [
          { id: 'first', text: 'Svara på frågan.', expected: { requirements: [] } },
          { id: 'dependent', text: 'Fortsätt sedan.', expected: { requirements: [] } },
        ],
      },
      {
        modelFetch: async (url, init) => {
          const response = await model.provider(url, init);
          const body = JSON.parse(String(init?.body));
          if (mode === 'incomplete' && !body.instructions.startsWith('SKYTTEL_TURN_'))
            return Response.json(
              { ...(await response.json()), status: 'incomplete' },
              { headers: response.headers },
            );
          return response;
        },
      },
      {
        profile: 'local',
        repetition: 1,
        stopped: () => stopped,
        stopReason: () => 'controlled_cancel',
        providerCalls: () => model.requests.length + model.authorizationRequests.length,
      },
    );
    expect(run.attempts[0].outcome).toBe(mode === 'canceled' ? 'aborted' : 'fail');
    expect(run.attempts[0]).toMatchObject({
      elapsedMs: null,
      timing: { firstUsefulMs: null, successfulCompletionMs: null },
    });
    expect(run.attempts[0].observedEndMs).toBeGreaterThanOrEqual(0);
    expect(run.attempts[1]).toMatchObject({ outcome: 'not_run', elapsedMs: null });
    expect(model.requests).toHaveLength(1);
  },
);

test.each(['before work', 'after a committed batch'] as const)(
  'application cancellation %s ends text evaluation without successful completion time',
  { tags: ['technical'] },
  async (boundary) => {
    let committed!: () => void;
    const batchCommitted = new Promise<void>((resolve) => {
      committed = resolve;
    });
    let releaseBatch!: () => void;
    const heldBatch = new Promise<void>((resolve) => {
      releaseBatch = resolve;
    });
    const model = textModel(async (body, signal) => {
      if (boundary === 'after a committed batch') {
        const turn = JSON.parse(
          String(body.input.findLast((item) => item.role === 'user')?.content),
        );
        const change = turn.draft.changes.find((item: { id: string }) => item.id === 'lo');
        return [
          modelTool('submit_changes', {
            version: turn.draft.version,
            contentVersion: turn.draft.contentVersion,
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
      }
      await new Promise<void>((resolve) => {
        if (signal?.aborted) resolve();
        else signal?.addEventListener('abort', () => resolve(), { once: true });
      });
      return [modelMessage('Ett sent svar.')];
    });
    let cancellationStatus: number | undefined;
    const run = await runTextScenario(
      {
        id: 'application-canceled',
        title: 'Application cancellation',
        voice: false,
        steps: [
          {
            id: 'first',
            text:
              boundary === 'after a committed batch'
                ? 'Ändra namnet på Lo Berg till Lo med nytt namn. Spara inte.'
                : 'Svara på frågan.',
            expected: {
              ...(boundary === 'after a committed batch'
                ? { objects: { lo: { name: 'Lo med nytt namn' } } }
                : {}),
              requirements: [],
            },
          },
          { id: 'dependent', text: 'Fortsätt sedan.', expected: { requirements: [] } },
        ],
      },
      {
        modelFetch: model.provider,
        assistantDispatch: async (request, dispatch) => {
          const rpc = await request
            .clone()
            .json()
            .catch(() => null);
          const response = await dispatch(request);
          if (boundary === 'after a committed batch' && rpc?.params?.name === 'apply_draft_batch') {
            committed();
            await heldBatch;
          }
          return response;
        },
        deliverResponse: async (request, response) => {
          if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/messages')) {
            if (boundary === 'after a committed batch') await batchCommitted;
            const canceled = await postAsClient(
              request,
              request.url.replace(/\/messages$/, '/cancel'),
              { all: true },
            );
            cancellationStatus = canceled.status;
            await canceled.arrayBuffer();
            releaseBatch();
          }
          return response;
        },
      },
      { profile: 'local', repetition: 1 },
    );
    expect(cancellationStatus).toBe(200);
    expect(run.attempts[0]).toMatchObject({
      outcome: 'aborted',
      reason: 'evaluation_application_canceled',
      elapsedMs: null,
      timing: { firstUsefulMs: null, successfulCompletionMs: null },
    });
    expect(run.attempts[0].observedEndMs).toBeGreaterThanOrEqual(0);
    expect(run.attempts[1]).toMatchObject({ outcome: 'not_run', elapsedMs: null });
    if (boundary === 'after a committed batch') {
      expect(run.finalMap.draft.changes).toContainEqual(
        expect.objectContaining({
          id: 'lo',
          after: expect.objectContaining({ name: 'Lo med nytt namn' }),
        }),
      );
      expect(run.finalMap.objects.find((item) => item.id === 'lo')?.name).toBe('Lo Berg');
      expect(run.attempts[0].diagnostics?.mcp).not.toEqual([]);
    }
  },
);

test('application expiry ends text evaluation at its terminal response without another poll', {
  tags: ['technical'],
}, async () => {
  let clock = Date.now();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async () => {
    await held;
    return [modelMessage('Ett för sent svar.')];
  });
  let terminalPolls = 0;
  let expiryArranged = false;
  let laterStatus: number | undefined;
  const run = await runTextScenario(
    {
      id: 'application-expired',
      title: 'Application request expiry',
      voice: false,
      steps: [
        { id: 'first', text: 'Svara på frågan.', expected: { requirements: [] } },
        { id: 'dependent', text: 'Fortsätt sedan.', expected: { requirements: [] } },
      ],
    },
    {
      now: () => clock,
      modelFetch: model.provider,
      deliverResponse: async (request, response) => {
        const path = new URL(request.url).pathname;
        if (request.method === 'POST' && path.endsWith('/messages') && !expiryArranged) {
          expiryArranged = true;
          const view = (await response.clone().json()) as TextAssistantView;
          // A later accepted request keeps access to the original terminal
          // result valid after its own deadline, independently of session end.
          clock += 60_000;
          const later = await postAsClient(request, request.url, {
            requestId: 'later-accepted-request',
            revision: view.revision,
            draftVersion: view.review.version,
            contentVersion: view.review.contentVersion,
            text: 'Beskriv sedan mitt utkast.',
          });
          laterStatus = later.status;
          await later.arrayBuffer();
          clock += 29 * 60_000;
          release();
        }
        if (request.method === 'GET' && /\/messages\/[^/]+$/.test(path)) {
          const view = (await response.clone().json()) as TextAssistantView;
          if (view.taskStatus === 'expired') {
            terminalPolls++;
            // Bound the regression's old polling behavior at the actual HTTP
            // boundary; a fixed runner consumes the first terminal response.
            if (terminalPolls > 1)
              return Response.json({ error: 'terminal_request_polled_again' }, { status: 503 });
          }
        }
        return response;
      },
    },
    { profile: 'local', repetition: 1 },
  );
  expect(laterStatus).toBe(202);
  expect(run.attempts[0]).toMatchObject({
    outcome: 'error',
    reason: 'evaluation_application_expired',
    elapsedMs: null,
    timing: { firstUsefulMs: null, successfulCompletionMs: null },
  });
  expect(run.attempts[0].observedEndMs).toBeGreaterThanOrEqual(0);
  expect(run.attempts[0].timing?.queueMs).toBeGreaterThanOrEqual(0);
  expect(run.attempts[1]).toMatchObject({ outcome: 'not_run', elapsedMs: null });
  expect(terminalPolls).toBe(1);
});

test('assisted text retains the full exchange origin and treats a necessary question as useful but unfinished', {
  tags: ['technical'],
}, async () => {
  const question = 'Vilken person menar du?';
  const request = 'Ändra beskrivningen till Läser poesi. Spara inte.';
  const scenario: Scenario = {
    id: 'assisted-timing',
    title: 'Complete assisted text wait',
    voice: false,
    steps: [
      {
        id: 'description',
        text: request,
        expected: {
          objects: {
            lo: {
              properties: [
                { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Läser poesi' },
              ],
            },
          },
          requirements: ['Bekräfta den färdiga ändringen.'],
        },
        followUps: [
          {
            id: 'identify-person',
            text: 'Jag menar Lo Berg.',
            when: 'Skyttel frågar vilken person som avses.',
            waiting: { requirements: ['Ställ den riktade frågan och bevara utkastet.'] },
            requirements: ['Bekräfta den färdiga ändringen.'],
          },
        ],
      },
    ],
  };
  const model = textModel(async (body) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    const parts = lastToolResult(body)?.pendingParts ?? turn.pendingParts;
    if (!parts.length)
      return [
        modelTool('ask_questions', {
          questions: [{ kind: 'change', request, question, dependsOnDraft: true }],
        }),
      ];
    if (parts[0].status === 'waiting')
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [pendingUpdate(body, question)],
          continueResponse: true,
        }),
      ];
    const change = turn.draft.changes.find((item: { id: string }) => item.id === 'lo');
    return [
      modelTool('submit_changes', {
        version: turn.draft.version,
        contentVersion: turn.draft.contentVersion,
        completion: 'draft',
        questions: [],
        resolves: [{ id: parts[0].id, revision: parts[0].revision }],
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'lo',
              baseRevision: change.before?.revision ?? null,
              value: {
                ...change.after,
                properties: scenario.steps[0].expected.objects?.lo.properties,
              },
            },
          },
        ],
      }),
    ];
  });
  const run = await runTextScenario(
    scenario,
    {
      modelFetch: model.provider,
      deliverResponse: async (request, response) => {
        if (request.method === 'GET' && /\/messages\/[^/]+$/.test(new URL(request.url).pathname)) {
          const view = (await response.clone().json()) as TextAssistantView;
          if (view.taskStatus === 'completed' && view.result)
            await new Promise((resolve) => setTimeout(resolve, 70));
        }
        return response;
      },
    },
    {
      profile: 'local',
      repetition: 1,
      followUps: true,
      judge: async (input) => {
        const clarification = input.requirements.some(({ id }) => id.endsWith('-necessary'));
        if (clarification) await new Promise((resolve) => setTimeout(resolve, 70));
        return input.requirements.map(({ id }) => ({
          id,
          outcome:
            !clarification && input.sources.backend?.text.includes(question) ? 'fail' : 'pass',
          reason: 'Controlled ambiguity and completed-state evidence.',
        }));
      },
    },
  );
  expect(run.attempts).toHaveLength(2);
  expect(run.attempts[0]).toMatchObject({
    outcome: 'fail',
    elapsedMs: null,
    assessment: { kind: 'necessary_clarification' },
    timing: { successfulCompletionMs: null },
  });
  expect(run.attempts[0].timing?.firstUsefulMs).toBeGreaterThan(0);
  expect(run.attempts[1], JSON.stringify(run.attempts[1])).toMatchObject({
    outcome: 'pass',
    followUpFor: 'description',
  });
  expect(run.attempts[1].elapsedMs).toBeGreaterThanOrEqual(70);
  expect(run.attempts[1].assistedElapsedMs).toBeGreaterThanOrEqual(110);
  expect(run.attempts[1].assistedEvaluationOverheadMs).toBeGreaterThanOrEqual(70);
  expect(run.attempts[1].assistedWallElapsedMs).toBe(
    (run.attempts[1].assistedElapsedMs ?? 0) + (run.attempts[1].assistedEvaluationOverheadMs ?? 0),
  );
});
