import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { EvaluationBudget } from '../../../scripts/model-evaluation/budget.js';
import {
  budgetedProvider,
  modelCost,
  requestMaximum,
  verifiedProfile,
} from '../../../scripts/model-evaluation/provider.js';

test('complete payload reservations enforce output and round caps without retries', {
  tags: ['technical'],
}, async () => {
  const db = new Database(':memory:');
  const budget = new EvaluationBudget(db, {
    authorized: true,
    limitUsd: 10,
    priorUsd: 1,
    priorSource: 'verified prior ledger',
  });
  const profile = verifiedProfile('luna-low', {
    ...verifiedProfile('luna-low'),
    maxOutputTokens: 32768,
  });
  const requests: unknown[] = [];
  const calls: unknown[] = [];
  const provider = budgetedProvider(profile, budget, {
    record: (call) => calls.push(call),
    transport: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        model: profile.model,
        service_tier: 'default',
        status: 'completed',
        usage: {
          input_tokens: 20,
          output_tokens: 10,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 5 },
        },
      });
    },
  });
  provider.beginStep();
  const payload = {
    model: profile.model,
    service_tier: 'default',
    reasoning: { effort: 'low' },
    max_output_tokens: profile.maxOutputTokens,
    instructions: 'Full system instructions',
    tools: [{ name: 'real-tool' }],
    input: [{ role: 'user', content: 'Complete context' }],
  };
  const send = (body = payload) =>
    provider.fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  for (const limit of [0, -1, 1.5, profile.maxOutputTokens + 1])
    await expect(send({ ...payload, max_output_tokens: limit })).rejects.toThrow(
      'profile_mismatch',
    );
  expect(requests).toHaveLength(0);
  for (let index = 0; index < 48; index++) await send();
  await expect(send()).rejects.toThrow('call_limit');
  expect(requests).toHaveLength(48);
  expect(requests[0]).toEqual(payload);
  expect(calls).toHaveLength(96);
  expect(budget.snapshot()).toMatchObject({ stopped: false, reservedUsd: 0 });
  provider.beginStep();
  await send({ ...payload, max_output_tokens: 4096 });
  expect(requests).toHaveLength(49);
  expect(budget.snapshot()).toMatchObject({ stopped: false, reservedUsd: 0 });
  db.close();
});

test('an authorized uncapped Astra run admits backend and summary requests without counting', {
  tags: ['technical'],
}, async () => {
  const db = new Database(':memory:');
  try {
    const budget = new EvaluationBudget(db, {
      authorized: true,
      priorUsd: 0,
      priorSource: 'User authorizes the selected run without a budget.',
    });
    const profile = verifiedProfile('astra-low');
    const requests: Record<string, unknown>[] = [];
    const provider = budgetedProvider(profile, budget, {
      record: () => {},
      transport: async (_url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({
          model: profile.model,
          service_tier: 'default',
          status: 'completed',
          usage: {
            input_tokens: 20,
            output_tokens: 10,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 5 },
          },
        });
      },
    });
    for (const limit of [profile.maxOutputTokens, 4096]) {
      provider.beginStep();
      await provider.fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        body: JSON.stringify({
          model: profile.model,
          service_tier: 'default',
          reasoning: { effort: profile.effort },
          max_output_tokens: limit,
          input: [{ role: 'user', content: 'The complete selected context' }],
        }),
      });
    }
    expect(requests.map((request) => request.max_output_tokens)).toEqual([
      profile.maxOutputTokens,
      4096,
    ]);
    expect(budget.callsStarted).toBe(2);
    expect(budget.snapshot()).toMatchObject({
      limitUsd: null,
      availableUsd: null,
      reservedUsd: 0,
      stopped: false,
    });
    expect(budget.snapshot().spentUsd).toBeGreaterThan(0);
  } finally {
    db.close();
  }
});

test('missing usage retains the whole-context hold and blocks further paid calls', {
  tags: ['technical'],
}, async () => {
  const db = new Database(':memory:');
  const budget = new EvaluationBudget(db, {
    authorized: true,
    limitUsd: 10,
    priorUsd: 1,
    priorSource: 'verified prior ledger',
  });
  const profile = verifiedProfile('terra-low');
  let requests = 0;
  const provider = budgetedProvider(profile, budget, {
    record: () => {},
    transport: async () => {
      requests++;
      return Response.json({ model: profile.model, service_tier: 'default', status: 'completed' });
    },
  });
  provider.beginStep();
  const send = () =>
    provider.fetch('https://api.openai.com/v1/responses', {
      body: JSON.stringify({
        model: profile.model,
        service_tier: 'default',
        reasoning: { effort: 'low' },
        max_output_tokens: 8192,
      }),
    });
  await send();
  expect(budget.snapshot()).toMatchObject({ stopped: true, reason: 'evaluation_usage_unknown' });
  expect(budget.snapshot().reservedUsd).toBeCloseTo(requestMaximum(profile, 8192), 5);
  await expect(send()).rejects.toThrow('usage_unknown');
  expect(requests).toBe(1);
  expect(modelCost(profile, { usage: { input_tokens: 20, output_tokens: 10 } })).toBeNull();
  db.close();
});

test('voice audio with fractional milliseconds reaches the provider and settles usage', {
  tags: ['technical'],
}, async () => {
  const db = new Database(':memory:');
  try {
    const budget = new EvaluationBudget(db, {
      authorized: true,
      priorUsd: 0,
      priorSource: 'Authorized voice evaluation with fractional reference audio duration',
    });
    const profile = verifiedProfile('sol-high');
    let requests = 0;
    const provider = budgetedProvider(profile, budget, {
      record: () => {},
      transport: async () => {
        requests++;
        return Response.json({
          model: profile.model,
          service_tier: 'default',
          status: 'completed',
          usage: {
            input_tokens: 20,
            output_tokens: 10,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 5 },
          },
        });
      },
    });
    provider.beginStep(1000.5);
    await provider.fetch('https://api.openai.com/v1/responses', {
      body: JSON.stringify({
        model: profile.model,
        service_tier: 'default',
        reasoning: { effort: profile.effort },
        max_output_tokens: 8192,
      }),
    });
    expect(requests).toBe(1);
    expect(budget.callsStarted).toBe(1);
    expect(budget.snapshot()).toMatchObject({ reservedUsd: 0, stopped: false });
    expect(budget.snapshot().spentUsd).toBeGreaterThan(0);
  } finally {
    db.close();
  }
});
