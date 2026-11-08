import { expect, test } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import {
  compareApplicationVersions,
  prepareComparison,
} from '../../../scripts/model-evaluation/comparison.js';
import { evaluationMetrics } from '../../../scripts/model-evaluation/metrics.js';
import type { ProviderCall } from '../../../scripts/model-evaluation/provider.js';
import { verifiedProfile } from '../../../scripts/model-evaluation/provider.js';
import type { Attempt, Scenario } from '../../../scripts/model-evaluation/types.js';

const scenarios: Scenario[] = [
  {
    id: 'target',
    title: 'Target',
    voice: false,
    group: 'everyday',
    steps: [{ id: 'a', text: 'Fråga.', expected: { requirements: [] } }],
  },
  {
    id: 'other',
    title: 'Other',
    voice: false,
    group: 'everyday',
    steps: [{ id: 'b', text: 'Fråga också.', expected: { requirements: [] } }],
  },
];

function plan() {
  return prepareComparison(
    {
      baseline: { id: 'baseline', directory: '/baseline', commit: '1'.repeat(40) },
      candidate: { id: 'candidate', directory: '/candidate', commit: '2'.repeat(40) },
      plan: {
        id: 'controlled-plan',
        modality: 'text',
        models: ['gpt-6.1-sol'],
        effort: 'high',
        repetitions: [1, 2, 3, 4, 5],
        targetScenarios: ['target'],
        targetMaximumRatio: 0.8,
        otherMaximumRatio: 1.1,
        maximumRelativeRange: 0.2,
      },
    },
    scenarios,
    verifiedProfile('sol-high'),
    {
      catalog: { scenarios, base: 'same initial data' },
      audio: 'same approved audio',
      judge: 'same calibrated judge',
      followUps: true,
    },
  );
}

function observations(run: ReturnType<typeof plan>): Attempt[] {
  return run.order.flatMap(({ repetition, application }) =>
    scenarios.map((scenario) => {
      const elapsedMs = application.id === 'baseline' ? 100 : scenario.id === 'target' ? 80 : 110;
      return {
        applicationVersion: application.id,
        applicationCommit: application.commit,
        comparisonContract: run.contractId,
        scenario: scenario.id,
        step: scenario.steps[0].id,
        profile: 'sol-high',
        repetition,
        modality: 'text',
        outcome: 'pass',
        fixed: [],
        elapsedMs,
        timing: {
          contract: 'text-delivery-v2',
          submittedAt: 0,
          queueMs: 10,
          firstResponseMs: elapsedMs,
          firstUsefulMs: elapsedMs,
          observedResponseEndMs: elapsedMs,
          successfulCompletionMs: elapsedMs,
        },
        backendCostUsd: 0.01,
      };
    }),
  );
}

test('application comparison alternates versions and accepts predeclared everyday thresholds', {
  tags: ['technical'],
}, () => {
  const run = plan();
  expect(run.order.map(({ repetition, application }) => `${repetition}:${application.id}`)).toEqual(
    [
      '1:baseline',
      '1:candidate',
      '2:candidate',
      '2:baseline',
      '3:baseline',
      '3:candidate',
      '4:candidate',
      '4:baseline',
      '5:baseline',
      '5:candidate',
    ],
  );
  const result = compareApplicationVersions(observations(run), scenarios, run);
  expect(result).toMatchObject({
    status: 'accepted',
    model: 'gpt-6.1-sol',
    effort: 'high',
    contractId: run.contractId,
    scenarios: [
      {
        scenario: 'target',
        target: true,
        ratio: 0.8,
        baseline: { medianMs: 100, minMs: 100, maxMs: 100 },
        candidate: { medianMs: 80 },
      },
      { scenario: 'other', target: false, ratio: 1.1, candidate: { medianMs: 110 } },
    ],
  });
  expect(result.versions[0].attempts).toHaveLength(10);
  expect(result.versions[1].attempts).toHaveLength(10);
});

test('a separately reported continuation segment cannot establish comparison acceptance', () => {
  const run = plan();
  const result = compareApplicationVersions(observations(run), scenarios, run, true);
  expect(result).toMatchObject({
    status: 'inconclusive',
    reasons: ['continuation_segment_requires_aggregation'],
  });
});

test('comparison contracts bind the declared execution order and reject unsupported schedules', {
  tags: ['technical'],
}, () => {
  const run = plan();
  const selection = { baseline: run.versions[0], candidate: run.versions[1], plan: run.plan };
  const conditions = {
    catalog: { scenarios, base: 'same initial data' },
    audio: 'same approved audio',
    judge: 'same calibrated judge',
    followUps: true,
  };
  const deferred = prepareComparison(
    {
      ...selection,
      plan: { ...run.plan, executionOrder: 'ordinary-before-stop-v1' },
    },
    scenarios,
    verifiedProfile('sol-high'),
    conditions,
  );
  expect(deferred.contractId).not.toBe(run.contractId);
  expect(deferred.plan.executionOrder).toBe('ordinary-before-stop-v1');
  expect(() =>
    prepareComparison(
      {
        ...selection,
        plan: { ...run.plan, executionOrder: 'unsupported' } as unknown as typeof run.plan,
      },
      scenarios,
      verifiedProfile('sol-high'),
      conditions,
    ),
  ).toThrow('evaluation_comparison_plan_invalid');
});

test.each([
  ['old-contract', 'inconclusive'],
  ['missing', 'inconclusive'],
  ['aborted', 'inconclusive'],
  ['incomplete', 'inconclusive'],
  ['not-run', 'inconclusive'],
  ['variable', 'inconclusive'],
  ['target-regression', 'rejected'],
  ['other-regression', 'rejected'],
  ['incorrect-state', 'rejected'],
] as const)(
  'application comparison preserves %s evidence instead of a speed win',
  { tags: ['technical'] },
  (kind, expectedStatus) => {
    const run = plan();
    const attempts = observations(run);
    const candidate = attempts.filter((attempt) => attempt.applicationVersion === 'candidate');
    const changeTime = (attempt: Attempt, value: number) => {
      attempt.elapsedMs = value;
      if (attempt.timing) {
        attempt.timing.successfulCompletionMs = value;
        attempt.timing.observedResponseEndMs = value;
        attempt.timing.firstUsefulMs = value;
      }
    };
    if (kind === 'old-contract') candidate[0].comparisonContract = undefined;
    if (kind === 'missing') attempts.splice(attempts.indexOf(candidate[0]), 1);
    if (['aborted', 'incomplete', 'not-run', 'incorrect-state'].includes(kind)) {
      candidate[0].outcome =
        kind === 'aborted'
          ? 'aborted'
          : kind === 'not-run'
            ? 'not_run'
            : kind === 'incomplete'
              ? 'inconclusive'
              : 'fail';
      candidate[0].elapsedMs = null;
      if (candidate[0].timing) {
        candidate[0].timing.successfulCompletionMs = null;
        candidate[0].timing.firstUsefulMs = null;
      }
      if (kind === 'incorrect-state') candidate[0].fixed = ['effective_objects'];
    }
    if (kind === 'variable')
      candidate
        .filter((attempt) => attempt.scenario === 'target')
        .forEach((attempt, index) => {
          changeTime(attempt, [50, 60, 80, 90, 100][index]);
        });
    if (kind === 'target-regression')
      candidate
        .filter((attempt) => attempt.scenario === 'target')
        .forEach((attempt) => {
          changeTime(attempt, 81);
        });
    if (kind === 'other-regression')
      candidate
        .filter((attempt) => attempt.scenario === 'other')
        .forEach((attempt) => {
          changeTime(attempt, 111);
        });
    const result = compareApplicationVersions(attempts, scenarios, run);
    expect(result.status).toBe(expectedStatus);
    expect(result.versions.flatMap((version) => version.attempts)).toHaveLength(attempts.length);
    if (kind !== 'missing') expect(result.versions[1].attempts[0]).toEqual(candidate[0]);
  },
);

test('comparison contract identifies shared conditions and rejects an old Terra or another effort', {
  tags: ['technical'],
}, () => {
  const run = plan();
  const selection = { baseline: run.versions[0], candidate: run.versions[1], plan: run.plan };
  const reordered = prepareComparison(selection, scenarios, verifiedProfile('sol-high'), {
    followUps: true,
    judge: 'same calibrated judge',
    audio: 'same approved audio',
    catalog: { base: 'same initial data', scenarios },
  });
  expect(reordered.contractId).toBe(run.contractId);
  const changed = prepareComparison(selection, scenarios, verifiedProfile('sol-high'), {
    followUps: false,
    judge: 'same calibrated judge',
    audio: 'same approved audio',
    catalog: { base: 'same initial data', scenarios },
  });
  expect(changed.contractId).not.toBe(run.contractId);
  expect(() =>
    prepareComparison(selection, scenarios, verifiedProfile('sol-low'), {
      catalog,
      audio: {},
      judge: {},
      followUps: true,
    }),
  ).toThrow('evaluation_comparison_profile_mismatch');
  expect(() =>
    prepareComparison(
      { baseline: selection.baseline, candidate: selection.candidate },
      catalog.scenarios as Scenario[],
      verifiedProfile('terra-high'),
      { catalog, audio: {}, judge: {}, followUps: true },
    ),
  ).toThrow('evaluation_comparison_profile_mismatch');
});

test.each(['unsafe', 'safe-limit'] as const)(
  'advanced %s evidence stays visible beside an everyday speed improvement',
  { tags: ['technical'] },
  (mode) => {
    const run = plan();
    const advanced: Scenario = {
      id: 'advanced',
      group: 'complex',
      title: 'Advanced work',
      voice: false,
      steps: [{ id: 'complex-work', text: 'Utför arbetet.', expected: { requirements: [] } }],
    };
    const attempts = observations(run);
    for (const { repetition, application } of run.order) {
      const base = attempts.find(
        (attempt) =>
          attempt.applicationVersion === application.id && attempt.repetition === repetition,
      );
      if (!base) throw new Error('Missing controlled attempt');
      const value: Attempt = {
        ...structuredClone(base),
        scenario: advanced.id,
        group: 'complex',
        step: 'complex-work',
      };
      if (application.id === 'candidate') {
        value.outcome = 'fail';
        value.elapsedMs = null;
        if (value.timing)
          value.timing = { ...value.timing, successfulCompletionMs: null, firstUsefulMs: null };
        value.fixed = mode === 'unsafe' ? ['unrequested_save_attempt'] : ['effective_objects'];
        if (mode === 'safe-limit')
          value.assessment = {
            kind: 'safe_inability',
            reason: 'Explicit limit with verified preserved work.',
            stateFailures: [],
            evidence: [
              { id: 'retention', outcome: 'pass', reason: 'Safe state and intent verified.' },
            ],
          };
      }
      attempts.push(value);
    }
    const result = compareApplicationVersions(attempts, [...scenarios, advanced], run);
    expect(result.status).toBe(mode === 'unsafe' ? 'rejected' : 'accepted');
    expect(result.advanced.find((group) => group.group === 'complex')).toMatchObject({
      capabilityRegression: true,
      candidate: { safeInabilities: mode === 'safe-limit' ? 5 : 0 },
    });
    expect(
      result.versions[1].attempts
        .filter((attempt) => attempt.scenario === advanced.id)
        .every((attempt) => attempt.elapsedMs === null),
    ).toBe(true);
  },
);

test('missing provider usage and transport observations remain unknown in comparison metrics', {
  tags: ['technical'],
}, () => {
  const run = plan();
  const attempts = observations(run);
  const call: ProviderCall = {
    id: 'incomplete-call',
    startedAt: 10,
    endedAt: 20,
    kind: 'backend',
    model: run.profile.model,
    profile: run.profile.id,
    request: {},
    response: { usage: { input_tokens: 7 } },
    costUsd: null,
    reservationUsd: 1,
    outcome: 'incomplete',
  };
  for (const attempt of attempts) attempt.metrics = evaluationMetrics([call], []);
  expect(compareApplicationVersions(attempts, scenarios, run).versions[1].metrics).toMatchObject({
    model: {
      backend: {
        count: 10,
        elapsedMs: 100,
        inputTokens: 70,
        outputTokens: null,
        reasoningTokens: null,
        providerCachedTokens: null,
        providerCacheWriteTokens: null,
        contextBytes: null,
        costUsd: null,
      },
      judge: { count: 0 },
      summary: { count: 0 },
    },
    mcp: { count: null, elapsedMs: null, complete: false },
    readCache: { hits: null },
  });
});
