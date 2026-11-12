import { expect, test } from 'vitest';
import audioManifest from '../../../scripts/model-evaluation/audio/manifest.json' with {
  type: 'json',
};
import { judgeCalibrationIdentity } from '../../../scripts/model-evaluation/judge-calibration.js';
import { prepareVoiceCampaign } from '../../../scripts/model-evaluation/voice-campaign.js';

test('explicit estimate preparation exposes uncertain billing without inventing a quantum or granting payment', {
  tags: ['technical'],
}, async () => {
  const campaign = await prepareVoiceCampaign({
    evaluatorCommit: 'a'.repeat(40),
    voiceCostAccounting: 'usage-estimate',
  });
  expect(campaign.authorized).toBe(false);
  expect(campaign.blockers).not.toContain('voice_billing_semantics_unresolved');
  expect(campaign.costs.accounting).toBe('usage-estimate');
  for (const run of campaign.runs) {
    expect(run.plan).toMatchObject({
      authorized: false,
      voiceCostAccounting: 'usage-estimate',
      playbackAssessorProfile: { billingMode: 'usage-estimate', billingQuantumSeconds: null },
      voiceProfile: { billingMode: 'usage-estimate' },
    });
    expect(
      run.overlap.variants.every(
        (variant) => variant.plan.voiceCostAccounting === 'usage-estimate',
      ),
    ).toBe(true);
  }
});

test('local preparation evidence cannot grant payment or clear provider billing blockers', {
  tags: ['technical'],
}, async () => {
  const localVerification = {
    passed: true,
    commands: ['npm run test:unit -- tests/unit/server/evaluation-voice-campaign.test.ts'],
    evidence: 'Controlled local verification for this test.',
  };
  const campaign = await prepareVoiceCampaign({
    evaluatorCommit: 'a'.repeat(40),
    localVerification,
  });
  expect(campaign.localVerification).toEqual(localVerification);
  expect(campaign.blockers).not.toContain('local_verification_not_bound');
  expect(campaign.blockers).toContain('voice_billing_semantics_unresolved');
  expect(campaign.authorized).toBe(false);
});

test('voice preparation reports a current-app single repetition for each exact backend without granting payment', {
  tags: ['technical'],
}, async () => {
  const campaign = await prepareVoiceCampaign({ evaluatorCommit: 'a'.repeat(40) });
  expect(campaign.authorized).toBe(false);
  expect(campaign.status).toBe('blocked');
  expect(campaign).not.toHaveProperty('limitUsd');
  expect(campaign.applicationCommit).toBe('a'.repeat(40));
  expect(campaign.runs).toHaveLength(2);
  expect(campaign.runs.map((run) => run.backendProfile.model)).toEqual([
    'gpt-6.1-terra',
    'gpt-6.1-sol',
  ]);
  for (const run of campaign.runs) {
    expect(run.backendProfile.effort).toBe('high');
    expect(run.plan).toMatchObject({
      commit: 'a'.repeat(40),
      authorized: false,
      voice: true,
      textProfiles: [],
      repetitions: [1],
      followUps: true,
      referenceVoice: 'marin',
      voiceProfile: { model: 'gpt-live-1', backend: run.backendProfile.id },
      playbackAssessorProfile: { model: 'whisper-1', billingQuantumSeconds: null },
    });
    expect(run.plan).not.toHaveProperty('applicationComparison');
    expect(run.plan.scenarioSet.filter((scenario) => scenario.group === 'everyday')).toHaveLength(
      8,
    );
    expect(run.plan.scenarioSet.filter((scenario) => scenario.group === 'complex')).toHaveLength(4);
    expect(
      run.plan.scenarioSet.filter((scenario) => scenario.group === 'long_conversation'),
    ).toHaveLength(1);
  }
  expect(campaign.costs.estimatedTotalUsd).toBeNull();
  expect(campaign.costs.calibrationCallsPerRun).toBe(68);
  expect(campaign.costs.calibrationReservationPerRunUsd).toBeCloseTo(317.65792);
});

test('voice preparation separates observational overlap runs on the same current revision', {
  tags: ['technical'],
}, async () => {
  const campaign = await prepareVoiceCampaign({ evaluatorCommit: 'b'.repeat(40) });
  for (const run of campaign.runs) {
    expect(run.overlap.interpretation).toBe('observations-only');
    expect(run.overlap.defaultDecision).toBe('retain sequential');
    expect(run.overlap.variants.map((variant) => variant.conversationWorkMode)).toEqual([
      'sequential',
      'overlap',
    ]);
    for (const variant of run.overlap.variants) {
      expect(variant.applicationCommit).toBe('b'.repeat(40));
      expect(variant.plan).toMatchObject({
        authorized: false,
        voice: true,
        repetitions: [1],
        voiceProfile: { backend: run.backendProfile.id },
        playbackAssessorProfile: { model: 'whisper-1', billingQuantumSeconds: null },
      });
      expect(variant.plan.scenarioSet.map((scenario) => scenario.id)).toEqual([
        'overlap-success',
        'overlap-clarification',
        'overlap-early-stop',
      ]);
      expect(variant.plan.scenarioSet[2].steps[0].userStop?.trigger).toBe(
        'first-working-after-input',
      );
      expect(variant.plan).not.toHaveProperty('applicationComparison');
    }
  }
});

test('voice preparation verifies installed recordings and every declared reply without clearing unknown billing', {
  tags: ['technical'],
}, async () => {
  const campaign = await prepareVoiceCampaign({ evaluatorCommit: 'a'.repeat(40) });
  expect(campaign.audio).toHaveLength(33);
  expect(campaign.audio.filter((item) => item.status === 'blocked')).toEqual([]);
  expect(campaign.audio.filter((item) => item.status === 'verified')).toHaveLength(33);
  expect(campaign.blockers).toEqual(
    expect.arrayContaining([
      'voice_billing_semantics_unresolved',
      'live_context_capacity_unverified',
      'explicit_payment_authorization_missing',
    ]),
  );
  expect(campaign.sources['catalog.json']).toMatch(/^[a-f0-9]{64}$/);
  expect(campaign.fixtureSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(campaign.judgeSha256).toBe(judgeCalibrationIdentity(campaign.runs[0].plan.judgeProfile));
});

test('voice preparation retains a selected recording with missing listening approval as a blocker', {
  tags: ['technical'],
}, async () => {
  const review = audioManifest.voices.marin.clips['everyday-01-request'].review;
  const status = review.status;
  try {
    review.status = 'pending';
    const campaign = await prepareVoiceCampaign({ evaluatorCommit: 'a'.repeat(40) });
    expect(campaign.blockers).toContain('audio:everyday-01-request:evaluation_audio_unreviewed');
    expect(campaign.audio.find((item) => item.id === 'everyday-01-request')).toMatchObject({
      status: 'blocked',
      reason: 'evaluation_audio_unreviewed',
    });
  } finally {
    review.status = status;
  }
});
