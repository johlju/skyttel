import { join } from 'node:path';
import Database from 'better-sqlite3';
import { EvaluationBudget } from './budget.js';
import { runApplicationContextLimit } from './context-limit.js';
import { contentJudge, verifyJudge } from './judge.js';
import { modelMetrics } from './metrics.js';
import { privateEvaluationRecords } from './private-records.js';
import { budgetedProvider, type EvaluationProfile, type ProviderCall } from './provider.js';
import { evaluationReporter } from './report.js';

/** One isolated supplemental dialog and one phase/model ledger, including its
 * calibration. Raw provider payloads and observations remain private. */
export async function executeAdvancedContext(options: {
  directory: string;
  issue: number;
  apiKey: string;
  limitUsd: number;
  maximumGrowthMessages: number;
  authorizationSource: string;
  profile: EvaluationProfile;
  judgeProfile: EvaluationProfile;
  transport?: typeof fetch;
}) {
  const db = new Database(join(options.directory, 'budget.sqlite'));
  const budget = new EvaluationBudget(db, {
    authorized: true,
    priorUsd: 0,
    priorSource: options.authorizationSource,
    limitUsd: options.limitUsd,
  });
  const privateRecords = privateEvaluationRecords(options.directory);
  const report = evaluationReporter(options.directory, options.issue);
  const calls = new Map<string, ProviderCall>();
  const record = (call: ProviderCall) => {
    privateRecords.call(call);
    calls.set(call.id, {
      ...call,
      request: {},
      response: call.response
        ? {
            id: call.response.id,
            model: call.response.model,
            service_tier: call.response.service_tier,
            status: call.response.status,
            usage: call.response.usage,
          }
        : undefined,
    });
  };
  const provider = budgetedProvider(options.profile, budget, {
    transport: options.transport,
    record,
  });
  const judgeProvider = budgetedProvider(options.judgeProfile, budget, {
    transport: options.transport,
    record,
  });
  const judge = contentJudge(options.apiKey, judgeProvider);
  let context: Awaited<ReturnType<typeof runApplicationContextLimit>> | undefined;
  let calibrated = false;
  let snapshot = budget.snapshot();
  try {
    calibrated = await verifyJudge(judge, async (id, result, expected) => {
      await report('judge_control', id, { result, expected });
    });
    if (!calibrated) budget.stop('evaluation_judge_control_failed');
    if (!budget.snapshot().stopped)
      context = await runApplicationContextLimit(
        {
          providerApiKey: options.apiKey,
          modelProfile: options.profile,
          modelFetch: provider.fetch,
          conversationWorkMode: 'sequential',
        },
        {
          origin: options.transport ? 'controlled' : 'provider',
          contextTokens: options.profile.tokens,
          pendingWork: true,
          maximumTurns: options.maximumGrowthMessages,
          profile: options.profile.id,
          repetition: 1,
          judge,
          beginStep: provider.beginStep,
          providerCalls: () => budget.callsStarted,
          providerRecords: () => [...calls.values()],
          stopped: () => budget.snapshot().stopped,
          stopReason: () => budget.snapshot().reason,
          recordObservation: (event) => privateRecords.observation(event),
        },
      );
  } catch (error) {
    privateRecords.observation({ error: String(error) });
    budget.stop('evaluation_advanced_context_error');
  } finally {
    try {
      snapshot = budget.snapshot();
      await report('diagnostic', 'Supplemental context evidence', {
        origin: options.transport ? 'controlled' : 'provider',
        calibrated,
        context: context ?? { outcome: 'not_run', reason: budget.snapshot().reason },
        calls: [...calls.values()].map(({ request: _request, response, ...call }) => ({
          ...call,
          responseId: response?.id ?? null,
          actualServiceTier: response?.service_tier ?? null,
          ...modelMetrics([{ ...call, request: {}, response }]),
        })),
        budget: budget.snapshot(),
      });
    } finally {
      try {
        privateRecords.close();
      } finally {
        db.close();
      }
    }
  }
  return { calibrated, context, budget: snapshot };
}
