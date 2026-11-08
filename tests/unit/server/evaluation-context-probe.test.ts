import Database from 'better-sqlite3';
import { expect, test } from 'vitest';
import { EvaluationBudget } from '../../../scripts/model-evaluation/budget.js';
import { optimizationBackend } from '../../../scripts/model-evaluation/campaign.js';
import {
  probeProviderContextLimit,
  providerBoundaryPayload,
} from '../../../scripts/model-evaluation/context-probe.js';

test('provider capability probe reserves its counted oversized payload and retains unknown rejection charges', {
  tags: ['technical'],
}, async () => {
  const db = new Database(':memory:');
  const budget = new EvaluationBudget(db, {
    authorized: true,
    priorUsd: 0,
    priorSource: 'Controlled synthetic transport.',
  });
  const profile = optimizationBackend('terra-6.1-high-668');
  const payload = providerBoundaryPayload({
    model: profile.model,
    service_tier: 'default',
    reasoning: { effort: 'high' },
    max_output_tokens: 128000,
    instructions: 'Controlled original instructions',
    input: [{ role: 'user', content: 'Controlled original input' }],
    tools: [],
  });
  let counted = false;
  let dispatched = false;
  try {
    const result = await probeProviderContextLimit({
      profile,
      payload,
      budget,
      apiKey: 'controlled',
      origin: 'controlled',
      counting: {
        source: 'https://example.test/controlled-counting',
        feeUsd: 0.01,
        count: async (completePayload) => {
          expect(completePayload).toEqual(payload);
          counted = true;
          return 2_000_000;
        },
      },
      transport: async () => {
        dispatched = true;
        expect(counted).toBe(true);
        expect(budget.snapshot().reservedUsd).toBe(5.96);
        return Response.json(
          { error: { code: 'context_length_exceeded' } },
          { status: 400, headers: { 'x-request-id': 'controlled-boundary' } },
        );
      },
    });
    expect(dispatched).toBe(true);
    expect(result.boundary).toBe('controlled_context_rejection');
    expect(result.successfulCompletionMs).toBeNull();
    expect(budget.snapshot()).toMatchObject({
      spentUsd: 0.01,
      reservedUsd: 5.96,
      stopped: true,
      reason: 'evaluation_usage_unknown',
    });
  } finally {
    db.close();
  }
});
