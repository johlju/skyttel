import { expect, test } from 'vitest';
import { prepareComparison } from '../../../scripts/model-evaluation/comparison.js';
import type { LiveEvaluationProfile } from '../../../scripts/model-evaluation/live.js';
import {
  compareOverlap,
  overlapComparison,
  overlapScenarios,
} from '../../../scripts/model-evaluation/overlap.js';
import profiles from '../../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../../scripts/model-evaluation/provider.js';
import type { Attempt } from '../../../scripts/model-evaluation/types.js';

function dialog(uncertainty = 0) {
  const voice = {
    ...profiles.profiles.find((profile) => profile.role === 'voice'),
    backend: 'sol-high',
  } as LiveEvaluationProfile;
  const comparison = prepareComparison(
    overlapComparison({ directory: '/controlled/app', modality: 'voice' }),
    overlapScenarios(),
    verifiedProfile('sol-high'),
    {
      catalog: 'controlled',
      audio: 'controlled',
      judge: 'controlled',
      followUps: true,
      voice,
    },
  );
  const interval = (point: number) => ({ lower: point - uncertainty, upper: point + uncertainty });
  const steps = overlapScenarios()[1].steps;
  const clocks = [
    [0, 100, 200],
    [500, 900, 1000],
    [1300, 1700, 1800],
  ];
  const attempts: Attempt[] = steps.map((step, index) => {
    const [start, end, completed] = clocks[index];
    return {
      scenario: 'overlap-clarification',
      step: step.id,
      profile: voice.id,
      applicationVersion: 'sequential',
      applicationCommit: comparison.versions[0].commit,
      comparisonContract: comparison.contractId,
      modality: 'voice',
      repetition: 1,
      outcome: 'pass',
      fixed: [],
      elapsedMs: 100,
      backendCostUsd: 0,
      judgeCostUsd: 0,
      playbackAssessmentCostUsd: 0,
      timing: {
        contract: 'voice-rendered-v1',
        submittedAt: end + uncertainty,
        queueMs: 0,
        firstResponseMs: null,
        firstUsefulMs: null,
        observedResponseEndMs: 100,
        successfulCompletionMs: 100,
      },
      playback: {
        contract: 'voice-rendered-v1',
        input: {
          sha256: 'a'.repeat(64),
          frames: (end - start) * 48,
          speechFrames: (end - start) * 48,
          sampleRate: 48000,
          drainedAt: end + uncertainty,
          started: interval(start),
          ended: interval(end),
        },
        recordingSha256: 'b'.repeat(64),
        frames: 48000,
        firstFrame: 0,
        sampleRate: 48000,
        lastActiveFrame: 4800,
        renderedEnd: interval(completed),
        candidates: [
          {
            callId: `candidate-${index}`,
            profile: 'controlled',
            outcome: 'recognized',
            costUsd: 0,
            recordingSha256: 'b'.repeat(64),
            alignmentMarginMs: 0,
            lastWordEndSeconds: 0.1,
            requiredResponse: [
              { id: 'voice-rendered-response', outcome: 'pass', reason: 'Worked fixture.' },
            ],
          },
        ],
        limitation: 'Independent worked device-clock fixture.',
      },
    };
  });
  return {
    comparison,
    attempts,
    row: () => compareOverlap(attempts, comparison).rows[1].versions[0].repetitions[0],
  };
}

function assistedDialog(modality: 'text' | 'voice', uncertainty = 0) {
  const fixture = dialog(uncertainty);
  if (modality === 'text') {
    fixture.comparison = prepareComparison(
      overlapComparison({ directory: '/controlled/app', modality }),
      overlapScenarios(),
      verifiedProfile('sol-high'),
      { catalog: 'controlled', audio: 'controlled', judge: 'controlled', followUps: true },
    );
  }
  const parent = fixture.attempts[0];
  const replyId = overlapScenarios()[1].steps[0].followUps![0].id;
  const reply = structuredClone(parent);
  reply.step = replyId;
  reply.followUpFor = parent.step;
  reply.assistedElapsedMs = modality === 'voice' ? 300 : 200;
  reply.assistedWallElapsedMs = 350;
  reply.assistedEvaluationOverheadMs = modality === 'voice' ? 50 : 150;
  reply.timing!.submittedAt = 350 + uncertainty;
  reply.playback!.input!.started = { lower: 250 - uncertainty, upper: 250 + uncertainty };
  reply.playback!.input!.ended = { lower: 350 - uncertainty, upper: 350 + uncertainty };
  reply.playback!.renderedEnd = { lower: 450 - uncertainty, upper: 450 + uncertainty };
  parent.outcome = 'fail';
  parent.elapsedMs = null;
  parent.fixed = ['unfinished_instructions'];
  parent.content = [{ id: 'backend-0', outcome: 'fail', reason: 'Awaiting required price.' }];
  parent.timing!.successfulCompletionMs = null;
  parent.assessment = {
    kind: 'necessary_clarification',
    reason: 'The requested price is unknown.',
    stateFailures: [],
    evidence: (modality === 'voice' ? ['backend', 'voice'] : ['backend']).flatMap((source) => [
      { id: `${source}-follow-up`, outcome: 'pass' as const, reason: 'Approved price question.' },
      { id: `${source}-necessary`, outcome: 'pass' as const, reason: 'Price is missing.' },
      {
        id: `${source}-retention`,
        outcome: 'pass' as const,
        reason: 'The original price request remains available while waiting.',
      },
    ]),
  };
  parent.followUpSelection = {
    selected: replyId,
    candidates: [{ id: replyId, fixed: [], content: parent.assessment.evidence }],
    reason: 'One independently verified necessary question.',
  };
  fixture.attempts.splice(1, 0, reply);
  for (const attempt of fixture.attempts) {
    attempt.backendCostUsd = 1;
    attempt.comparisonContract = fixture.comparison.contractId;
    if (modality === 'text') {
      attempt.modality = 'text';
      attempt.profile = fixture.comparison.profile.id;
      attempt.timing!.contract = 'text-delivery-v2';
      delete attempt.playback;
    }
  }
  return {
    ...fixture,
    parent,
    reply,
    report: () => compareOverlap(fixture.attempts, fixture.comparison),
  };
}

test.each(['text', 'voice'] as const)(
  '%s reports verified necessary assistance through final completion while retaining every raw verdict and cost',
  { tags: ['technical'] },
  (modality) => {
    const fixture = assistedDialog(modality);
    const report = fixture.report();
    expect(report.status).toBe('inconclusive'); // Other planned runs are intentionally absent.
    expect(report.rows[1].versions[0].costs.backend).toBe(4);
    expect(report.rows[1].versions[0].repetitions[0]).toMatchObject({
      valid: true,
      completion: 'assisted',
      directSteps: 2,
      assistedSteps: 1,
      endpointMs: modality === 'voice' ? 1300 : 400,
      dialogTiming: { status: 'complete', cumulativeResponseWaitMs: 400 },
    });
    expect(report.rows[1].versions[0].repetitions[0].attempts[0]).toEqual(fixture.parent);
    expect(fixture.parent).toMatchObject({
      outcome: 'fail',
      elapsedMs: null,
      fixed: ['unfinished_instructions'],
      timing: { successfulCompletionMs: null },
      content: [{ outcome: 'fail' }],
    });
  },
);

test.each(['text', 'voice'] as const)(
  '%s can collect the complete campaign with separate direct and assisted results',
  { tags: ['technical'] },
  (modality) => {
    const fixture = assistedDialog(modality);
    const attempts = fixture.comparison.versions.flatMap((version) =>
      fixture.comparison.plan.repetitions.flatMap((repetition) => {
        const direct = structuredClone(fixture.attempts[3]);
        direct.scenario = 'overlap-success';
        direct.step = overlapScenarios()[0].steps[0].id;
        const stopped = structuredClone(direct);
        stopped.scenario = 'overlap-early-stop';
        stopped.outcome = 'aborted';
        stopped.elapsedMs = null;
        stopped.timing!.successfulCompletionMs = null;
        stopped.scriptedStop = {
          contract: 'public-user-stop-v1',
          verdict: 'pass',
          trigger: 'first-working-after-input',
          requestedAt: 1750,
          acknowledgedAt: 1760,
          terminalAt: 1770,
          audioQuiescedAt: 1780,
          settledAt: 2000,
          endpointMs: 300,
          endpointBounds: { lower: 300, upper: 300 },
          stateFailures: [],
          limitation: 'Controlled complete Stop proof.',
        };
        return [...structuredClone(fixture.attempts), direct, stopped].map((attempt) => ({
          ...attempt,
          applicationVersion: version.id,
          applicationCommit: version.commit,
          repetition,
        }));
      }),
    );
    const voiceUsage = fixture.comparison.versions.flatMap((version) =>
      fixture.comparison.plan.repetitions.flatMap((repetition) =>
        overlapScenarios().map((scenario) => ({
          scenario: scenario.id,
          applicationVersion: version.id,
          repetition,
          sessions: [],
          costUsd: 0,
        })),
      ),
    );
    const report = compareOverlap(attempts, fixture.comparison, voiceUsage);
    expect(report.status).toBe('collected');
    expect(report.rows[0].versions[0].repetitions[0]).toMatchObject({
      completion: 'direct',
      directSteps: 1,
      assistedSteps: 0,
      endpointMs: 100,
    });
    expect(report.rows[1].versions[0].repetitions[0]).toMatchObject({
      completion: 'assisted',
      directSteps: 2,
      assistedSteps: 1,
      endpointMs: modality === 'voice' ? 1300 : 400,
    });
    expect(report.rows[1].versions[0].costs.backend).toBe(20);
    expect(report.rows[0].versions[0].completionTiming).toMatchObject({
      direct: { median: 100 },
      assisted: null,
    });
    expect(report.rows[1].versions[0].completionTiming).toMatchObject({
      direct: null,
      assisted: { median: modality === 'voice' ? 1300 : 400 },
    });
  },
);

test.each(['text', 'voice'] as const)(
  '%s price assistance in the success scenario requires the complete approved waiting proof',
  { tags: ['technical'] },
  (modality) => {
    const fixture = assistedDialog(modality);
    const step = overlapScenarios()[0].steps[0];
    fixture.attempts.splice(2);
    fixture.parent.scenario = fixture.reply.scenario = 'overlap-success';
    fixture.parent.step = fixture.reply.followUpFor = step.id;
    fixture.reply.step = fixture.parent.followUpSelection!.selected = step.followUps![0].id;
    const candidate = fixture.parent.followUpSelection!.candidates[0];
    candidate.id = fixture.reply.step;
    for (const source of modality === 'voice' ? ['backend', 'voice'] : ['backend'])
      candidate.content!.push({
        id: `${source}-waiting-0`,
        outcome: 'pass',
        reason: 'Independent work and safe waiting verified.',
      });
    expect(fixture.report().rows[0].versions[0].repetitions[0]).toMatchObject({
      valid: true,
      completion: 'assisted',
      assistedSteps: 1,
      directSteps: 0,
      endpointMs: modality === 'voice' ? 300 : 200,
    });
    candidate.content!.pop();
    expect(fixture.report().status).toBe('rejected');
    expect(fixture.report().rows[0].versions[0].repetitions[0].endpointMs).toBeNull();
  },
);

test.each(['text', 'voice'] as const)(
  '%s assistance preserves independent failures and rejects unverified or ambiguous chains',
  { tags: ['technical'] },
  (modality) => {
    for (const fault of [
      'independent-state',
      'independent-content',
      'unnecessary',
      'missing-reply',
      'duplicate-reply',
      'unapproved-reply',
      'ambiguous-selection',
      'missing-required-proof',
      'failed-retention',
      'duplicated-retention',
      'failed-reply',
      'independent-reply-state',
    ]) {
      const fixture = assistedDialog(modality);
      if (fault === 'independent-state') fixture.parent.fixed.push('unrequested_save_attempt');
      else if (fault === 'independent-content')
        fixture.parent.assessment!.evidence[0].outcome = 'fail';
      else if (fault === 'unnecessary')
        fixture.parent.assessment!.kind = 'unnecessary_clarification';
      else if (fault === 'missing-reply') fixture.attempts.splice(1, 1);
      else if (fault === 'duplicate-reply') fixture.attempts.push(structuredClone(fixture.reply));
      else if (fault === 'unapproved-reply') {
        fixture.parent.followUpSelection!.selected = 'unapproved';
        fixture.reply.step = 'unapproved';
      } else if (fault === 'ambiguous-selection') {
        fixture.parent.followUpSelection!.candidates.push({
          ...structuredClone(fixture.parent.followUpSelection!.candidates[0]),
          id: 'other',
        });
      } else if (fault === 'missing-required-proof') {
        fixture.parent.followUpSelection!.candidates[0].content!.pop();
      } else if (fault === 'failed-retention' || fault === 'duplicated-retention') {
        const evidence = fixture.parent.followUpSelection?.candidates[0]?.content;
        const retention = evidence?.find((item) => item.id === 'backend-retention');
        if (!evidence || !retention) throw new Error('Missing retained-work proof fixture.');
        if (fault === 'failed-retention') retention.outcome = 'fail';
        else evidence.push(structuredClone(retention));
      } else if (fault === 'independent-reply-state') {
        fixture.reply.fixed.push('saved_map_changed');
      } else fixture.reply.outcome = 'fail';
      const report = fixture.report();
      expect(report.status, fault).toBe('rejected');
      expect(report.rows[1].versions[0].repetitions[0], fault).toMatchObject({
        valid: false,
        completion: null,
        endpointMs: null,
      });
      expect(fixture.parent.outcome, fault).toBe('fail');
    }
  },
);

test('an additional unsupported successful reply cannot disappear from assisted timing', {
  tags: ['technical'],
}, () => {
  const fixture = assistedDialog('voice');
  fixture.attempts.push({ ...structuredClone(fixture.reply), step: 'unsupported-reply' });
  expect(fixture.report().status).toBe('inconclusive');
  expect(fixture.report().rows[1].versions[0].repetitions[0]).toMatchObject({
    valid: false,
    completion: null,
    endpointMs: null,
  });
});

test('assisted voice timing retains source uncertainty across question, reply and later ordinary steps', {
  tags: ['technical'],
}, () => {
  const fixture = assistedDialog('voice', 5);
  expect(fixture.report().rows[1].versions[0].repetitions[0]).toMatchObject({
    valid: true,
    completion: 'assisted',
    endpointMs: 1340,
    endpointBounds: { lower: 1260, upper: 1340 },
    dialogTiming: {
      wallMs: { lower: 1690, upper: 1710 },
      harnessGapMs: { lower: 370, upper: 430 },
      replyInputMs: { lower: 870, upper: 930 },
      cumulativeResponseWaitMs: 400,
    },
  });
});

test.each([
  'missing-question-end',
  'missing-reply-completion',
  'damaged-question-capture',
  'missing-reply-source-start',
] as const)(
  'assisted voice with %s cannot substitute a scalar assisted duration for verified dialog boundaries',
  { tags: ['technical'] },
  (fault) => {
    const fixture = assistedDialog('voice');
    if (fault === 'missing-question-end') fixture.parent.timing!.observedResponseEndMs = null;
    else if (fault === 'missing-reply-completion')
      fixture.reply.timing!.successfulCompletionMs = null;
    else if (fault === 'damaged-question-capture')
      fixture.parent.playback!.error = 'capture_failed';
    else delete fixture.reply.playback!.input!.started;
    expect(fixture.report()).toMatchObject({ status: 'inconclusive' });
    expect(fixture.report().rows[1].versions[0].repetitions[0]).toMatchObject({
      valid: false,
      completion: null,
      endpointMs: null,
    });
  },
);

test('clarification reports whole scripted-dialog wait with required reply speech and measured harness gaps', {
  tags: ['technical'],
}, () => {
  const fixture = dialog();
  expect(fixture.row()).toMatchObject({
    valid: true,
    endpointMs: 1100,
    dialogTiming: {
      contract: 'scripted-dialog-wait-v1',
      status: 'complete',
      wallMs: { lower: 1700, upper: 1700 },
      harnessGapMs: { lower: 600, upper: 600 },
      replyInputMs: { lower: 800, upper: 800 },
      cumulativeResponseWaitMs: 300,
      applicationWaitMs: { lower: 1100, upper: 1100 },
    },
  });
});

test('valid nonzero device-clock intervals retain conservative dialog wait bounds', {
  tags: ['technical'],
}, () => {
  const fixture = dialog(5);
  expect(fixture.row()).toMatchObject({
    valid: true,
    endpointMs: 1130,
    dialogTiming: {
      wallMs: { lower: 1690, upper: 1710 },
      harnessGapMs: { lower: 580, upper: 620 },
      replyInputMs: { lower: 780, upper: 820 },
      applicationWaitMs: { lower: 1070, upper: 1130 },
    },
  });
});

test.each(['missing-start', 'incompatible-clock', 'out-of-order'] as const)(
  'clarification with %s is inconclusive rather than substituting cumulative turn waits',
  { tags: ['technical'] },
  (fault) => {
    const fixture = dialog();
    const input = fixture.attempts[1].playback?.input;
    if (!input) throw new Error('Missing worked input');
    if (fault === 'missing-start') delete input.started;
    else if (fault === 'incompatible-clock') fixture.attempts[1].timing!.submittedAt = 100000;
    else input.started = { lower: 10, upper: 10 };
    expect(fixture.row()).toMatchObject({
      valid: false,
      endpointMs: null,
      dialogTiming: { status: 'inconclusive', endpointMs: null },
    });
  },
);
