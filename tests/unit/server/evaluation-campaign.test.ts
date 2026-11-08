import { expect, test } from 'vitest';
import {
  optimizationBackend,
  optimizationEvaluationPlan,
  prepareOptimizationCampaign,
} from '../../../scripts/model-evaluation/campaign.js';
import controls from '../../../scripts/model-evaluation/judge-controls.json' with { type: 'json' };
import { verifiedProfile } from '../../../scripts/model-evaluation/provider.js';

test('optimization preparation preserves exact models and high effort without granting payment or an invented ceiling', {
  tags: ['technical'],
}, async () => {
  const campaign = await prepareOptimizationCampaign({
    evaluatorCommit: 'a'.repeat(40),
    baselineDirectory: '/controlled/original',
    candidateDirectory: '/controlled/proposed',
  });
  const plan = optimizationEvaluationPlan({
    campaign,
    profile: 'terra-6.1-high-668',
    modality: 'text',
    issue: 1,
    directory: '/controlled/results',
    apiKey: '',
    authorized: false,
    priorUsd: 0,
    priorSource: 'No paid controlled execution.',
    localVerification: { passed: false, commands: [], evidence: '' },
  });
  expect(plan.authorized).toBe(false);
  expect(plan).not.toHaveProperty('limitUsd');
  expect(plan.backendProfiles?.[0]).toMatchObject({
    model: 'gpt-6.1-terra',
    effort: 'high',
    maxOutputTokens: 128000,
  });
  expect(optimizationBackend('sol-6.1-high-668')).toMatchObject({
    model: 'gpt-6.1-sol',
    effort: 'high',
  });
  expect(verifiedProfile('terra-high').model).toBe('gpt-5.6-terra');
  expect(plan.judgeProfile.maxOutputTokens).toBe(4096);
  expect(plan.followUps).toBe(true);
  expect(campaign.runs).toHaveLength(4);
  expect(
    campaign.runs.every(
      (run) => run.status === 'not_run' && run.calibrationCalls === controls.cases.length,
    ),
  ).toBe(true);
  expect(() =>
    optimizationEvaluationPlan({
      campaign,
      profile: 'sol-6.1-high-668',
      modality: 'voice',
      issue: 1,
      directory: '/controlled/results',
      apiKey: '',
      authorized: true,
      priorUsd: 0,
      priorSource: 'Controlled profile gate only.',
      localVerification: { passed: true, commands: ['controlled'], evidence: 'controlled' },
    }),
  ).toThrow('evaluation_campaign_voice_billing_unresolved');
});
