import Database from 'better-sqlite3';
import { afterEach, expect, test, vi } from 'vitest';
import { EvaluationBudget } from '../../../scripts/model-evaluation/budget.js';
import { contentJudge } from '../../../scripts/model-evaluation/judge.js';
import { budgetedProvider, verifiedProfile } from '../../../scripts/model-evaluation/provider.js';

afterEach(() => vi.useRealTimers());

test('the selected judge model and effort govern calibration requests', {
  tags: ['technical'],
}, async () => {
  vi.useFakeTimers();
  const db = new Database(':memory:');
  try {
    const profile = verifiedProfile('judge-luna-medium', {
      ...verifiedProfile('luna-medium'),
      id: 'judge-luna-medium',
      role: 'judge',
      maxOutputTokens: 32768,
    });
    const budget = new EvaluationBudget(db, {
      authorized: true,
      limitUsd: 10,
      priorUsd: 0,
      priorSource: 'Isolated non-billable test.',
    });
    const requests: Record<string, unknown>[] = [];
    const provider = budgetedProvider(profile, budget, {
      record: () => {},
      transport: async (_url, init) => {
        await vi.advanceTimersByTimeAsync(11 * 60_000);
        expect(init?.signal?.aborted).not.toBe(true);
        requests.push(JSON.parse(String(init?.body)));
        return Response.json({
          model: profile.model,
          service_tier: 'default',
          status: 'completed',
          output_text: JSON.stringify({
            verdicts: [{ id: 'content', outcome: 'pass', reason: 'Verifierat.' }],
          }),
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    verdicts: [{ id: 'content', outcome: 'pass', reason: 'Verifierat.' }],
                  }),
                  annotations: [],
                },
              ],
            },
          ],
          usage: {
            input_tokens: 20,
            output_tokens: 10,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 5 },
          },
        });
      },
    });
    const verdict = await contentJudge(
      'not-a-real-key',
      provider,
    )({
      context: 'Known result.',
      sources: { backend: { text: 'Verifierat.', complete: true } },
      requirements: [{ id: 'content', source: 'backend', text: 'Bekräfta resultatet.' }],
    });
    expect(verdict).toEqual([{ id: 'content', outcome: 'pass', reason: 'Verifierat.' }]);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      model: 'gpt-6-luna',
      reasoning: { effort: 'medium' },
      max_output_tokens: 32768,
      tools: [],
    });
    expect(budget.snapshot()).toMatchObject({ stopped: false, reservedUsd: 0 });
  } finally {
    db.close();
  }
});
