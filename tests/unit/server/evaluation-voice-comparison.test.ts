import { expect, test } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import {
  compareApplicationVersions,
  prepareComparison,
} from '../../../scripts/model-evaluation/comparison.js';
import type { LiveEvaluationProfile } from '../../../scripts/model-evaluation/live.js';
import { verifiedProfile } from '../../../scripts/model-evaluation/provider.js';
import type { Attempt, Scenario } from '../../../scripts/model-evaluation/types.js';

const voice: LiveEvaluationProfile = {
  id: 'live-sol-high',
  provider: 'openai',
  model: 'gpt-live-1',
  tokens: 32000,
  usdPerMinute: 0.01,
  checkedAt: 'controlled-fixture',
  sources: ['https://example.test/controlled-profile'],
  backend: 'sol-high',
};

test('voice comparison prepares its own five-round plan using approved voice scenarios', {
  tags: ['technical'],
}, () => {
  const run = prepareComparison(
    {
      baseline: { id: 'baseline', directory: '/baseline', commit: '1'.repeat(40) },
      candidate: { id: 'candidate', directory: '/candidate', commit: '2'.repeat(40) },
    },
    catalog.scenarios.filter((scenario) => scenario.voice) as Scenario[],
    verifiedProfile('sol-high'),
    {
      catalog,
      audio: 'approved Marin recordings',
      judge: 'same calibrated judge',
      followUps: true,
      voice,
    },
  );
  expect(run.plan).toMatchObject({
    modality: 'voice',
    repetitions: [1, 2, 3, 4, 5],
    targetScenarios: ['change-price-payment', 'relationship-direction'],
    targetMaximumRatio: 0.8,
    otherMaximumRatio: 1.1,
  });
  expect(run.order.map(({ application }) => application.id)).toEqual([
    'baseline',
    'candidate',
    'candidate',
    'baseline',
    'baseline',
    'candidate',
    'candidate',
    'baseline',
    'baseline',
    'candidate',
  ]);
});

test('voice version comparison requires actual rendered evidence and uses the Live profile identity', {
  tags: ['technical'],
}, () => {
  const scenarios: Scenario[] = [
    {
      id: 'target',
      title: 'Voice target',
      voice: true,
      steps: [{ id: 'request', expected: { requirements: [] } }],
    },
  ];
  const run = prepareComparison(
    {
      baseline: { id: 'baseline', directory: '/baseline', commit: '1'.repeat(40) },
      candidate: { id: 'candidate', directory: '/candidate', commit: '2'.repeat(40) },
      plan: {
        id: 'voice-control',
        modality: 'voice',
        models: ['gpt-6.1-sol'],
        effort: 'high',
        repetitions: [1],
        targetScenarios: ['target'],
        targetMaximumRatio: 0.8,
        otherMaximumRatio: 1.1,
        maximumRelativeRange: 0.5,
      },
    },
    scenarios,
    verifiedProfile('sol-high'),
    {
      catalog: scenarios,
      audio: 'same fixture',
      judge: 'same judge',
      followUps: false,
      voice,
    },
  );
  const attempts: Attempt[] = run.versions.map((version, index) => {
    const elapsedMs = index ? 700 : 1000;
    return {
      scenario: 'target',
      step: 'request',
      profile: voice.id,
      repetition: 1,
      applicationVersion: version.id,
      applicationCommit: version.commit,
      comparisonContract: run.contractId,
      modality: 'voice',
      outcome: 'pass',
      fixed: [],
      elapsedMs,
      backendCostUsd: 0,
      timing: {
        contract: 'voice-rendered-v1',
        submittedAt: 1000,
        queueMs: 0,
        firstResponseMs: null,
        firstUsefulMs: null,
        observedResponseEndMs: elapsedMs,
        successfulCompletionMs: elapsedMs,
      },
      playback: {
        contract: 'voice-rendered-v1',
        input: {
          sha256: 'a'.repeat(64),
          frames: 24000,
          speechFrames: 23000,
          drainedAt: 1020,
          ended: { lower: 980, upper: 1000 },
        },
        recordingSha256: 'b'.repeat(64),
        firstFrame: 0,
        frames: 96000,
        sampleRate: 48000,
        lastActiveFrame: 50000,
        renderedEnd: { lower: 1000 + elapsedMs - 20, upper: 1000 + elapsedMs },
        candidates: [
          {
            callId: 'recording-assessment',
            profile: 'verified-asr',
            outcome: 'recognized',
            costUsd: 0,
            recordingSha256: 'b'.repeat(64),
            alignmentMarginMs: 100,
            lastWordEndSeconds: 1,
            requiredResponse: [
              {
                id: 'voice-rendered-response',
                outcome: 'pass',
                reason: 'Independent recording assessment.',
              },
            ],
          },
        ],
        limitation: 'Controlled rendered boundary',
      },
    };
  });
  expect(compareApplicationVersions(attempts, scenarios, run).status).toBe('accepted');
  const assisted = attempts.flatMap((attempt, index): Attempt[] => {
    const timing = attempt.timing;
    if (!timing) throw new Error('Missing controlled timing.');
    return [
      {
        ...attempt,
        outcome: 'fail',
        elapsedMs: null,
        fixed: ['effective_objects'],
        content: [
          { id: 'voice-question', outcome: 'pass', reason: 'A complete necessary question.' },
        ],
        timing: { ...timing, successfulCompletionMs: null },
        assessment: {
          kind: 'necessary_clarification',
          reason: 'Required disambiguation.',
          stateFailures: [],
          evidence: [{ id: 'necessary', outcome: 'pass', reason: 'The request is ambiguous.' }],
        },
        followUpSelection: {
          selected: 'clarify-request',
          candidates: [],
          reason: 'Unique approved reply.',
        },
      },
      {
        ...attempt,
        step: 'clarify-request',
        followUpFor: 'request',
        assistedElapsedMs: index ? 1000 : 1500,
      },
    ];
  });
  expect(compareApplicationVersions(assisted, scenarios, run).status).toBe('accepted');
  delete assisted[0].playback;
  expect(compareApplicationVersions(assisted, scenarios, run).status).toBe('inconclusive');
  delete attempts[1].playback;
  expect(compareApplicationVersions(attempts, scenarios, run)).toMatchObject({
    status: 'inconclusive',
    reasons: ['comparison_contract_or_delivery_evidence_mismatch'],
  });
});
