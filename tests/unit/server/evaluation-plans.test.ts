import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import { type EvaluationPlan, evaluateModels } from '../../../scripts/model-evaluation/evaluate.js';
import * as judgeModule from '../../../scripts/model-evaluation/judge.js';
import controls from '../../../scripts/model-evaluation/judge-controls.json' with { type: 'json' };
import type { LiveEvaluationProfile } from '../../../scripts/model-evaluation/live.js';
import profiles from '../../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../../scripts/model-evaluation/provider.js';
import * as speech from '../../../scripts/model-evaluation/speech.js';
import type { Catalog } from '../../../scripts/model-evaluation/types.js';
import * as voiceRunner from '../../../scripts/model-evaluation/voice-runner.js';
import * as modelClient from '../../../src/server/model-client.js';

test('voice plans validate optional audio and enable clarification in the runner', {
  tags: ['technical'],
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-evaluation-followups-'));
  const audio = vi.spyOn(speech, 'referenceSpeech').mockResolvedValue({
    clip: { frames: 24000, sampleRate: 24000 },
    pcm: '',
  } as Awaited<ReturnType<typeof speech.referenceSpeech>>);
  const calibration = vi.spyOn(judgeModule, 'verifyJudge').mockResolvedValue(true);
  const runner = vi
    .spyOn(voiceRunner, 'runVoiceScenario')
    .mockRejectedValue(new Error('stop_before_voice_session'));
  const network = vi.spyOn(modelClient, 'modelTransport').mockRejectedValue(new Error('network'));
  try {
    await expect(
      evaluateModels({
        issue: 341,
        directory,
        apiKey: 'not-a-real-key',
        authorized: true,
        priorUsd: 0,
        priorSource: 'Isolated non-billable clarification plan.',
        commit: 'test',
        textProfiles: [],
        voice: true,
        followUps: true,
        referenceVoice: 'cedar',
        voiceProfile: profiles.profiles.find(
          (item) => item.role === 'voice',
        ) as LiveEvaluationProfile,
        judgeProfile: verifiedProfile('judge-sol-high'),
        baselineProfiles: { voice: 'live' },
        localVerification: {
          passed: true,
          commands: ['npm run test:unit'],
          evidence: 'Local test.',
        },
      }),
    ).resolves.toMatchObject({
      budget: { stopped: true, reason: 'stop_before_voice_session', spentUsd: 0 },
    });
    expect(audio).toHaveBeenCalledWith(
      'oklarheter-pris-foljdsvar',
      'Jag menar abonnemanget Molnlagring Plus.',
      'cedar',
    );
    expect(runner).toHaveBeenCalledOnce();
    expect(runner.mock.calls[0][2]).toMatchObject({ followUps: true, referenceVoice: 'cedar' });
    expect(network).not.toHaveBeenCalled();
  } finally {
    audio.mockRestore();
    calibration.mockRestore();
    runner.mockRestore();
    network.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

test('an explicitly selected high-effort model is accounted for without adding prior models', {
  tags: ['technical'],
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-evaluation-plan-'));
  const network = vi
    .spyOn(modelClient, 'modelTransport')
    .mockRejectedValue(new Error('unexpected_network'));
  const audio = vi.spyOn(speech, 'referenceSpeech').mockRejectedValue(new Error('bad_audio'));
  try {
    const plan: EvaluationPlan = {
      issue: 341,
      directory,
      apiKey: 'not-a-real-key',
      authorized: true,
      // This ceiling cannot cover the first conservative judge reservation.
      limitUsd: 0.001,
      priorUsd: 0,
      priorSource: 'Isolated test with no previous spending.',
      commit: 'test',
      textProfiles: ['sol-high'],
      judgeProfile: verifiedProfile('judge-sol-high'),
      baselineProfiles: { text: 'terra-low' },
      localVerification: {
        passed: true,
        commands: ['npm run test:unit'],
        evidence: 'Isolated non-billable plan regression.',
      },
    };
    const run = await evaluateModels(plan);
    expect(audio).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
    expect(run.budget.stopped).toBe(true);
    expect(run.attempts).toHaveLength(
      catalog.scenarios.reduce((sum, item) => sum + item.steps.length, 0),
    );
    expect(
      run.attempts.every((item) => item.profile === 'sol-high' && item.outcome === 'not_run'),
    ).toBe(true);
    expect(run.attempts.every((item) => item.repetition === 1)).toBe(true);
    for (const repetitions of [[], [0], [1, 1], [1.5]])
      await expect(evaluateModels({ ...plan, repetitions })).rejects.toThrow(
        'evaluation_invalid_repetitions',
      );
    await expect(
      evaluateModels({ ...plan, textProfiles: ['sol-high', 'sol-high'] }),
    ).rejects.toThrow('evaluation_duplicate_profiles');
    await expect(
      evaluateModels({ ...plan, textProfiles: ['sol-high', 'luna-low'] }),
    ).rejects.toThrow('evaluation_one_model_per_issue');
    await expect(
      evaluateModels({ ...plan, textProfiles: ['sol-high'], voice: true }),
    ).rejects.toThrow('evaluation_one_model_per_issue');
    await expect(evaluateModels({ ...plan, apiKey: '' })).rejects.toThrow(
      'evaluation_prerequisites_missing',
    );
    await expect(
      evaluateModels({ ...plan, textProfiles: ['unavailable-profile'] }),
    ).rejects.toThrow('evaluation_invalid_profile');
    const voiceProfile = profiles.profiles.find(
      (item) => item.role === 'voice',
    ) as LiveEvaluationProfile;
    await expect(
      evaluateModels({
        ...plan,
        textProfiles: [],
        voice: true,
        voiceProfile: { ...voiceProfile, backend: 'judge-sol-high' },
      }),
    ).rejects.toThrow('evaluation_backend_profile_required');
    await expect(
      evaluateModels({
        ...plan,
        textProfiles: [],
        voice: true,
        voiceProfile: {
          ...voiceProfile,
          provider: 'unavailable',
        } as unknown as LiveEvaluationProfile,
      }),
    ).rejects.toThrow('evaluation_provider_unsupported');
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
    audio.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

test.each(['marin', 'cedar'] as const)(
  'voice preflight validates only scenario utterances for %s',
  { tags: ['technical'] },
  async (referenceVoice) => {
    const directory = await mkdtemp(join(tmpdir(), 'skyttel-evaluation-audio-'));
    const audio = vi
      .spyOn(speech, 'referenceSpeech')
      .mockImplementation(async (_id, text, voice) => {
        if (voice !== referenceVoice || text === undefined) throw new Error('unselected_audio');
        return { clip: { frames: 24000, sampleRate: 24000 }, pcm: '' } as Awaited<
          ReturnType<typeof speech.referenceSpeech>
        >;
      });
    const network = vi.spyOn(modelClient, 'modelTransport').mockRejectedValue(new Error('network'));
    try {
      await evaluateModels({
        issue: 341,
        directory,
        apiKey: 'not-a-real-key',
        authorized: true,
        limitUsd: 0.001,
        priorUsd: 0,
        priorSource: 'Isolated non-billable audio selection.',
        commit: 'test',
        textProfiles: [],
        voice: true,
        referenceVoice,
        voiceProfile: profiles.profiles.find(
          (item) => item.role === 'voice',
        ) as LiveEvaluationProfile,
        judgeProfile: verifiedProfile('judge-sol-high'),
        baselineProfiles: { voice: 'live' },
        localVerification: {
          passed: true,
          commands: ['npm run test:unit'],
          evidence: 'Local test.',
        },
      });
      expect(audio.mock.calls).toEqual(
        (catalog as Catalog).scenarios
          .filter((scenario) => scenario.voice)
          .flatMap((scenario) => scenario.steps)
          .filter((step) => !('transition' in step))
          .map((step) => [step.id, 'text' in step ? step.text : undefined, referenceVoice]),
      );
      expect(network).not.toHaveBeenCalled();
    } finally {
      audio.mockRestore();
      network.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test.each([false, true])(
  'budget refusal preserves paid counting=%s without a behavior verdict',
  {
    tags: ['technical'],
  },
  async (counting) => {
    const directory = await mkdtemp(join(tmpdir(), 'skyttel-evaluation-refusal-'));
    const judge = verifiedProfile('judge-sol-high');
    let controlIndex = 0;
    const network = vi
      .spyOn(modelClient, 'modelTransport')
      .mockImplementation(async (url, init) => {
        const address = new URL(url instanceof Request ? url.url : String(url));
        expect(address.origin).toBe('https://api.openai.com');
        const payload = JSON.parse(String(init?.body));
        expect(payload.model).toBe(judge.model);
        const control = controls.cases[controlIndex++];
        expect(control).toBeDefined();
        const text = JSON.stringify({
          verdicts: Object.entries(control.expected).map(([id, outcome]) => ({
            id,
            outcome,
            reason: 'Verifierat kontrollutfall.',
          })),
        });
        return Response.json({
          model: judge.model,
          service_tier: 'default',
          status: 'completed',
          output_text: text,
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text, annotations: [] }],
            },
          ],
          usage: {
            input_tokens: 20,
            output_tokens: 10,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 5 },
          },
        });
      });
    try {
      const run = await evaluateModels({
        issue: 341,
        directory,
        apiKey: 'not-a-real-key',
        authorized: true,
        limitUsd: 10,
        priorUsd: 0,
        priorSource: 'Isolated non-billable run.',
        commit: 'test',
        textProfiles: ['astra-low'],
        judgeProfile: judge,
        baselineProfiles: { text: 'terra-low' },
        repetitions: [1],
        counting: counting
          ? {
              source: 'Isolated synthetic counting transport, with a known test fee.',
              feeUsd: 0.01,
              count: async (payload) =>
                payload.model === judge.model ? 20 : verifiedProfile('astra-low').maxInputTokens,
            }
          : undefined,
        localVerification: {
          passed: true,
          commands: ['npm run test:unit'],
          evidence: 'Isolated real application with fake provider transport.',
        },
      });
      expect(controlIndex).toBe(controls.cases.length);
      expect(run.budget).toMatchObject({
        stopped: true,
        reason: 'evaluation_budget_exceeded',
        reservedUsd: 0,
      });
      expect(run.attempts).toHaveLength(20);
      for (const [index, attempt] of run.attempts.entries()) {
        const paid = counting && index === 0;
        expect(attempt).toMatchObject({
          outcome: paid ? 'aborted' : 'not_run',
          fixed: [],
          elapsedMs: null,
          backendCostUsd: 0,
        });
        expect(attempt.content).toBeUndefined();
        if (paid) expect(attempt.observedEndMs).toEqual(expect.any(Number));
        else expect(attempt.observedEndMs).toBeUndefined();
      }
      expect(controlIndex).toBe(controls.cases.length);
    } finally {
      network.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
