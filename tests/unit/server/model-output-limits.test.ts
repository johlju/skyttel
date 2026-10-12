import { once } from 'node:events';
import { createServer } from 'node:http';
import Database from 'better-sqlite3';
import { afterEach, expect, test, vi } from 'vitest';
import { EvaluationBudget } from '../../../scripts/model-evaluation/budget.js';
import {
  budgetedProvider,
  type ProviderCall,
  requestMaximum,
  verifiedProfile,
} from '../../../scripts/model-evaluation/provider.js';
import { summarizeConversation } from '../../../src/server/conversation-summary.js';
import { modelTransport } from '../../../src/server/model-client.js';
import { textModel } from '../../../src/server/text-assistant-model.js';

afterEach(() => vi.useRealTimers());

test.each(['headers', 'body'])(
  'model transport honors cancellation while waiting for response %s',
  { tags: ['technical'] },
  async (phase) => {
    const server = createServer((_request, reply) => {
      if (phase === 'body') {
        reply.writeHead(200, { 'Content-Type': 'application/json' });
        reply.write('{');
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing_test_port');
      const controller = new AbortController();
      const accepted = once(server, 'request');
      const response = modelTransport(`http://127.0.0.1:${address.port}`, {
        signal: controller.signal,
      });
      await accepted;
      const result = phase === 'body' ? (await response).json() : response;
      const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await rejected;
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

test.each(['luna-high', 'luna-xhigh', 'luna-max'])(
  '%s backend and historical summary preserve effort, model limit and separate costs',
  { tags: ['technical'] },
  async (profileId) => {
    vi.useFakeTimers();
    const db = new Database(':memory:');
    try {
      const profile = verifiedProfile(profileId);
      const budget = new EvaluationBudget(db, {
        authorized: true,
        priorUsd: 0,
        priorSource: 'Non-billable output-limit regression.',
      });
      const calls: ProviderCall[] = [];
      const provider = budgetedProvider(profile, budget, {
        record: (call) => calls.push({ ...call }),
        transport: async (_url, init) => {
          await vi.advanceTimersByTimeAsync(11 * 60_000);
          expect(init?.signal?.aborted).toBe(false);
          const request = JSON.parse(String(init?.body));
          expect(request.max_output_tokens).toBe(profile.modelMaxOutputTokens);
          expect(request.model).toBe(profile.model);
          expect(request.reasoning.effort).toBe(profile.effort);
          return Response.json({
            model: profile.model,
            service_tier: 'default',
            status: 'completed',
            output: [
              {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: 'Historiska uppgifter med osäkerhet.' }],
              },
            ],
            usage: {
              input_tokens: 20,
              output_tokens: 9000,
              input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
              output_tokens_details: { reasoning_tokens: 8900 },
            },
          });
        },
      });
      const model = textModel('synthetic-key', provider.fetch, undefined, profile);
      const signal = new AbortController().signal;
      provider.beginStep(0, {
        scenario: 'limits',
        step: 'change',
        modality: 'text',
        repetition: 1,
      });
      await model('Utför uppdraget.', [], [], signal);
      provider.beginStep(0, {
        scenario: 'limits',
        step: 'summary',
        modality: 'text',
        repetition: 1,
      });
      expect(await summarizeConversation(model, 'Historisk källa.', signal, () => {})).toBe(
        'Historiska uppgifter med osäkerhet.',
      );
      const settled = calls.filter((call) => call.endedAt);
      expect(settled.map((call) => call.kind)).toEqual(['backend', 'summary']);
      expect(settled.every((call) => call.reservationUsd === requestMaximum(profile, 128000))).toBe(
        true,
      );
      expect(settled.every((call) => call.costUsd !== null)).toBe(true);
      expect(settled.map((call) => (call.endedAt ?? 0) - call.startedAt)).toEqual([
        11 * 60_000,
        11 * 60_000,
      ]);
      expect(budget.snapshot()).toMatchObject({ stopped: false, reservedUsd: 0 });
      expect(budget.callsStarted).toBe(2);
    } finally {
      db.close();
    }
  },
);

test('caller cancellation still stops a model and retains its unknown-charge hold', {
  tags: ['technical'],
}, async () => {
  vi.useFakeTimers();
  const db = new Database(':memory:');
  try {
    const profile = verifiedProfile('luna-high');
    const budget = new EvaluationBudget(db, {
      authorized: true,
      priorUsd: 0,
      priorSource: 'Non-billable cancellation regression.',
    });
    const calls: ProviderCall[] = [];
    const controller = new AbortController();
    const provider = budgetedProvider(profile, budget, {
      record: (call) => calls.push(call),
      transport: async (_url, init) => {
        await vi.advanceTimersByTimeAsync(11 * 60_000);
        expect(init?.signal?.aborted).toBe(false);
        const canceled = new Promise<never>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('user_stopped')), {
            once: true,
          }),
        );
        controller.abort();
        return canceled;
      },
    });
    provider.beginStep();
    // Time between calls must not exhaust a hidden per-step allowance either.
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    const model = textModel('synthetic-key', provider.fetch, undefined, profile);
    await expect(model('Instruktion.', [], [], controller.signal)).rejects.toThrow();
    expect(calls.at(-1)).toMatchObject({ outcome: 'aborted', costUsd: null });
    expect(budget.snapshot()).toMatchObject({
      stopped: true,
      reservedUsd: requestMaximum(profile, 128000),
    });
    expect(budget.callsStarted).toBe(1);
  } finally {
    db.close();
  }
});

test('invalid profile and explicit request limits cannot reach the provider', {
  tags: ['technical'],
}, async () => {
  const profile = verifiedProfile('luna-low');
  const model = textModel(
    'synthetic-key',
    async () => {
      throw new Error('unexpected_network');
    },
    undefined,
    profile,
  );
  for (const limit of [0, -1, 1.5, profile.maxOutputTokens + 1]) {
    expect(() => verifiedProfile(profile.id, { ...profile, maxOutputTokens: limit })).toThrow(
      'evaluation_invalid_profile',
    );
    await expect(
      model('Instruktion.', [], [], new AbortController().signal, limit),
    ).rejects.toThrow('invalid_model_output_limit');
  }
});
