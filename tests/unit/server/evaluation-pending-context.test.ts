import { expect, test } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import {
  contextLimitFixture,
  runApplicationContextLimit,
  runContextLimit,
} from '../../../scripts/model-evaluation/context-limit.js';
import type { ProviderCall } from '../../../scripts/model-evaluation/provider.js';
import {
  lastToolResult,
  modelMessage,
  modelTool,
  pendingUpdate,
  textModel,
} from '../../support/text-model.js';

const original = catalog.scenarios.find((item) => item.id === 'unknown-user')?.steps[0].text;
if (!original) throw new Error('Missing catalog request');

test('the supplemental bound allows at most 2052 user messages and a single continuation', {
  tags: ['technical'],
}, async () => {
  let growth = 0;
  const result = await runContextLimit(contextLimitFixture(), {
    origin: 'controlled',
    contextTokens: 1_050_000,
    pendingWork: true,
    submit: async (_text, stage) => ({
      outcome: 'pass',
      generation: 0,
      inputTokens: 100,
      summary: stage === 'growth' && ++growth === 2048,
      pendingWork: stage === 'continuation' ? 'completed' : 'preserved',
    }),
  });
  expect(result.turns).toHaveLength(2052);
  expect(result.turns.filter(({ stage }) => stage === 'continuation')).toHaveLength(1);
  expect(result.remainingGrowthMessages).toBe(0);
});

test('supplemental context growth rejects a question without the exact actionable pending request', {
  tags: ['technical'],
}, async () => {
  const model = textModel(() => [modelMessage('Vem ska använda tjänsten?')]);
  const result = await runApplicationContextLimit(
    { modelFetch: model.provider },
    {
      origin: 'controlled',
      contextTokens: 1_050_000,
      maximumTurns: 2,
      profile: 'controlled',
      repetition: 1,
      pendingWork: true,
      judge: async ({ requirements }) =>
        requirements.map(({ id }) => ({
          id,
          outcome: 'pass',
          reason: 'Controlled relevant question.',
        })),
    },
  );
  expect(result.turns).toHaveLength(1);
  expect(result.turns[0]).toMatchObject({
    stage: 'pending',
    outcome: 'fail',
    fixed: expect.arrayContaining(['pending_request_identity']),
    successfulCompletionMs: null,
  });
  expect(JSON.stringify(model.requests[0])).toContain(original);
});

test.each([
  'success',
  'missing-usage',
  'wrong-endpoint',
  'unrelated-mutation',
  'unauthorized-save',
  'false-completion',
  'lost-work',
  'replaced-work',
  'lost-constraint',
  'no-transition',
  'recall-failure',
  'safe-waiting',
  'missing-state',
  'canceled',
] as const)(
  'supplemental dialog handles %s across the normal summary threshold',
  {
    tags: ['technical'],
    timeout: 30_000,
  },
  async (mode) => {
    const question = 'Vem ska det nya sambandet gå till?';
    let continuing = 0;
    const model = textModel((body) => {
      if (body.instructions.startsWith('Sammanfatta avslutad'))
        return [
          modelMessage(
            'Kodordet är björklöv 731. En separat användare för molnlagringen är ännu okänd.',
          ),
        ];
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (input.message === original)
        return [
          modelTool('ask_questions', {
            questions: [{ kind: 'change', request: original, question, dependsOnDraft: true }],
          }),
        ];
      if (input.message?.startsWith('Låt det nya sambandet')) {
        if (mode === 'safe-waiting')
          return [
            modelTool('ask_questions', {
              questions: [],
              updates: [
                pendingUpdate(body, question, {
                  question: 'Jag behöver pausa. Vill du fortsätta senare?',
                }),
              ],
            }),
          ];
        if (mode === 'false-completion') return [modelMessage('Allt är klart.')];
        if (continuing++ === 0)
          return [
            modelTool('ask_questions', {
              questions: [],
              updates: [pendingUpdate(body, question)],
              continueResponse: true,
            }),
          ];
        if (continuing === 2) return [modelTool('read_my_draft', {})];
        const draft = lastToolResult(body);
        const part = input.pendingParts.find(
          (part: { request: string }) => part.request === original,
        );
        const type = draft.current.relationshipTypes.find(
          (type: { name: string }) => type.name === 'Använder',
        );
        if (!part || !type)
          throw new Error(
            JSON.stringify({
              part,
              types: draft.current.relationshipTypes,
              parts: input.pendingParts,
            }),
          );
        return [
          modelTool('submit_changes', {
            version: draft.version,
            contentVersion: draft.contentVersion,
            completion: mode === 'unauthorized-save' ? 'save' : 'draft',
            resolves: [{ id: part.id, revision: part.revision }],
            operations: [
              {
                name: 'propose_relationship',
                arguments: {
                  id: 'new-cloud-user',
                  baseRevision: null,
                  value: {
                    sourceId: 'cloud',
                    targetId: mode === 'wrong-endpoint' ? 'alex' : 'lo',
                    typeId: type.id,
                    verb: 'används av',
                  },
                },
              },
              ...(mode === 'unrelated-mutation'
                ? [
                    {
                      name: 'propose_object',
                      arguments: {
                        id: 'lo',
                        baseRevision: draft.changes.find((item: { id: string }) => item.id === 'lo')
                          .before.revision,
                        value: {
                          ...draft.changes.find((item: { id: string }) => item.id === 'lo').after,
                          name: 'Fel namn',
                        },
                      },
                    },
                  ]
                : []),
            ],
          }),
        ];
      }
      return [modelMessage('Kodordet är björklöv 731.')];
    });
    let triggered = false;
    const records: ProviderCall[] = [];
    const transportErrors: string[] = [];
    const result = await runApplicationContextLimit(
      {
        deliverResponse: async (request, response) => {
          const path = new URL(request.url).pathname;
          if (
            mode === 'missing-state' &&
            request.method === 'GET' &&
            path.endsWith('/map/history') &&
            records.length
          )
            return Response.json({ error: 'controlled_state_unavailable' }, { status: 503 });
          if (request.method !== 'GET' || !/\/messages\/[^/]+$/.test(path)) return response;
          const view = await response.clone().json();
          if (view.taskStatus !== 'completed' || records.length < 4) return response;
          if (mode === 'lost-work') view.pendingParts = [];
          if (mode === 'replaced-work') view.pendingParts[0].id = 'replacement-identity';
          if (mode === 'lost-constraint')
            view.pendingParts[0].request = 'Lägg till ett samband från Norrsken Molnlagring.';
          if (mode === 'canceled') view.taskStatus = 'canceled';
          return Response.json(view);
        },
        modelFetch: async (url, init) => {
          const body = JSON.parse(String(init?.body));
          const response = await model.provider(url, init).catch((error) => {
            transportErrors.push(String(error));
            throw error;
          });
          const data = await response.json();
          if (
            mode !== 'no-transition' &&
            !triggered &&
            !body.instructions.startsWith('SKYTTEL_TURN_') &&
            JSON.stringify(body.input.at(-1)).includes('Planeringsrad 1.1')
          ) {
            triggered = true;
            data.usage.input_tokens = 1_000_000;
          }
          if (mode === 'missing-usage') delete data.usage;
          records.push({
            id: `controlled-${records.length}`,
            startedAt: Date.now(),
            endedAt: Date.now(),
            profile: 'controlled',
            model: body.model,
            request: body,
            response: data,
            costUsd: mode === 'missing-usage' ? null : 0,
            reservationUsd: 0,
            outcome: 'completed',
            kind: body.instructions.startsWith('Sammanfatta avslutad') ? 'summary' : 'backend',
          });
          return Response.json(data);
        },
      },
      {
        origin: 'controlled',
        contextTokens: 1_050_000,
        maximumTurns: 3,
        profile: 'controlled',
        repetition: 1,
        pendingWork: true,
        providerRecords: () => records,
        judge: async ({ requirements }) =>
          requirements.map(({ id, text }) => ({
            id,
            outcome: mode === 'recall-failure' && text.includes('hela kodordet') ? 'fail' : 'pass',
            reason: 'Controlled semantic result.',
          })),
      },
    );
    expect(transportErrors).toEqual([]);
    if (mode === 'missing-usage') {
      expect(result.turns).toHaveLength(1);
      expect(result.turns[0]).toMatchObject({
        outcome: 'inconclusive',
        reason: 'evaluation_context_usage_unavailable',
      });
      return;
    }
    if (
      ['lost-work', 'replaced-work', 'lost-constraint', 'missing-state', 'canceled'].includes(mode)
    ) {
      expect(result.turns.some((turn) => turn.stage === 'continuation')).toBe(false);
      expect(result.turns.at(-1)?.outcome).not.toBe('pass');
      expect(result.successfulCompletionMs).toBeNull();
      return;
    }
    if (mode === 'no-transition') {
      expect(result.turns.map(({ stage }) => stage)).toEqual([
        'pending',
        'seed',
        'growth',
        'growth',
        'growth',
      ]);
      expect(result).toMatchObject({
        boundary: 'inconclusive',
        safeWaiting: true,
        successfulCompletionMs: null,
      });
      return;
    }
    expect(result.turns.map(({ stage }) => stage)).toEqual([
      'pending',
      'seed',
      'growth',
      'recall',
      'continuation',
    ]);
    if (mode === 'safe-waiting') {
      expect(result.turns.at(-1)).toMatchObject({
        outcome: 'pass',
        pendingWork: 'preserved',
        successfulCompletionMs: null,
      });
      expect(result).toMatchObject({
        safeWaiting: true,
        continuation: 'not_verified',
        successfulCompletionMs: null,
      });
      return;
    }
    if (
      ['wrong-endpoint', 'unrelated-mutation', 'unauthorized-save', 'false-completion'].includes(
        mode,
      )
    ) {
      expect(result.turns.at(-1)?.outcome).toBe('fail');
      expect(result.turns.at(-1)?.fixed?.length).toBeGreaterThan(0);
      expect(result).toMatchObject({ continuation: 'not_verified', successfulCompletionMs: null });
      return;
    }
    if (mode === 'recall-failure') {
      expect(result).toMatchObject({
        recall: 'fail',
        preservedWork: true,
        continuation: 'verified',
      });
      expect(result.turns.find((turn) => turn.stage === 'recall')).toMatchObject({
        pendingWork: 'preserved',
      });
      return;
    }
    expect(result.turns.map(({ outcome, fixed }) => ({ outcome, fixed }))).toEqual(
      Array.from({ length: 5 }, () => ({ outcome: 'pass', fixed: [] })),
    );
    expect(result.turns.at(-1)).toMatchObject({
      pendingWork: 'completed',
      state: {
        historyChanges: 0,
        saveOperations: [],
        effective: {
          relationships: expect.arrayContaining([
            expect.objectContaining({ source: 'cloud', target: 'alex' }),
            expect.objectContaining({ source: 'cloud', target: 'lo', verb: 'används av' }),
          ]),
        },
      },
    });
  },
);
