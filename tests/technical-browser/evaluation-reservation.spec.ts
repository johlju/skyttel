import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { expect, test } from '@playwright/test';
import { evaluateModels } from '../../scripts/model-evaluation/evaluate.js';
import controls from '../../scripts/model-evaluation/judge-controls.json' with { type: 'json' };
import type { LiveEvaluationProfile } from '../../scripts/model-evaluation/live.js';
import type { PlaybackRecording } from '../../scripts/model-evaluation/playback.js';
import type { PlaybackAssessorProfile } from '../../scripts/model-evaluation/playback-assessor.js';
import profiles from '../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../scripts/model-evaluation/provider.js';
import type { JudgeInput, Scenario } from '../../scripts/model-evaluation/types.js';
import type { LiveSidebandFactory } from '../../src/server/live-provider.js';
import { renderedToneWindows } from '../support/evaluation-rendered-tone.js';
import { evaluationVoiceProvider } from '../support/evaluation-voice-provider.js';
import {
  lastToolResult,
  modelMessage,
  modelTool,
  pricedProvider,
  textModel,
} from '../support/text-model.js';

test('an uncapped evaluation finishes speech beyond its reservation and runs the next scenario', {
  tag: '@technical',
}, async () => {
  test.setTimeout(360_000);
  // The approved input is about 2.4 s. The old evaluator timer expired at
  // about 213 s; the first final tone starts 220 s after output begins.
  // Real elapsed time and WebRTC playout keep this below the capture limit.
  const finalToneDelays = [220, 0.5];
  const providers: Awaited<ReturnType<typeof evaluationVoiceProvider>>[] = [];
  const sessions: { startedAt: number; finalSeconds: number | null }[] = [];
  const recognitions: { session: number; seconds: number; finalTone: boolean }[] = [];
  const calibrated = new Set<string>();
  let calibrationCalls = 0;
  const liveProfile = profiles.profiles.find(
    (profile) => profile.role === 'voice',
  ) as LiveEvaluationProfile;
  const backendProfile = verifiedProfile(liveProfile.backend);
  const judgeProfile = verifiedProfile('judge-sol-high');
  const assessor: PlaybackAssessorProfile = {
    id: 'controlled-reservation-transcriber',
    model: 'whisper-1',
    language: 'sv',
    usdPerMinute: 0.01,
    billingQuantumSeconds: 1,
    alignmentMarginMs: 100,
    minimumAverageLogProbability: -1,
    maximumNoSpeechProbability: 0.5,
    maximumCandidates: 8,
    checkedAt: 'controlled-provider-fixture',
    sources: ['https://example.test/controlled-transcription'],
  };
  const scenarioSet: Scenario[] = ['late-final-response', 'independent-next-response'].map(
    (id) => ({
      id,
      title: id,
      voice: true,
      steps: [
        {
          id: 'spara-hela-utkastet',
          text: 'Spara hela utkastet.',
          expected: {
            saves: 1,
            saveAttempts: 1,
            requirements: ['Bekräfta att utkastet sparats.'],
          },
        },
      ],
    }),
  );
  const backend = textModel((request) => {
    if (lastToolResult(request)) return [modelMessage('Sparat.')];
    const input = JSON.parse(
      String(request.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('save_draft', {
        version: input.draft.version,
        contentVersion: input.draft.contentVersion,
      }),
    ];
  });
  const judge = textModel((request) => {
    const input = JSON.parse(String(request.input[0].content)) as JudgeInput;
    // Calibration requirements share IDs with ordinary playback judgments.
    // Match the complete public provider payload, never its call position.
    const control = controls.cases.find(
      (item) =>
        item.context === input.context &&
        isDeepStrictEqual(item.sources, input.sources) &&
        isDeepStrictEqual(item.requirements, input.requirements),
    );
    if (control) {
      calibrated.add(control.id);
      calibrationCalls++;
      return [
        modelMessage(
          JSON.stringify({
            verdicts: Object.entries(control.expected)
              .filter(([, outcome]) => typeof outcome === 'string')
              .map(([id, outcome]) => ({ id, outcome, reason: 'Controlled calibration answer.' })),
          }),
        ),
      ];
    }
    return [
      modelMessage(
        JSON.stringify({
          verdicts: input.requirements.map(({ id, source }) => ({
            id,
            outcome: input.sources[source]?.text.includes('Sparat.') ? 'pass' : 'fail',
            reason: 'Only the final recognized tone confirms saving; the earlier tone is status.',
          })),
        }),
      ),
    ];
  });
  const backendTransport = pricedProvider(backend.provider);
  const judgeTransport = pricedProvider(judge.provider);
  const liveSideband: LiveSidebandFactory = (...args) => {
    const provider = providers.at(-1);
    const session = sessions.at(-1);
    if (!provider || !session) throw new Error('controlled_live_session_missing');
    const sideband = provider.attach(...args);
    // This external provider reports measured local session usage instead of
    // the shared fixture's default zero. Register before the app's listener.
    sideband.on('session.closed', (event) => {
      session.finalSeconds = (Date.now() - session.startedAt) / 1000;
      event.usage.seconds = session.finalSeconds;
    });
    return sideband;
  };
  const transport: typeof fetch = async (url, init) => {
    const endpoint = new URL(
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url,
    );
    // The SDK checks local multipart support with a non-network data URL.
    if (endpoint.href === 'data:,') return new Response('');
    if (endpoint.origin !== 'https://api.openai.com')
      throw new Error(`unexpected_controlled_provider_origin:${endpoint.origin}`);
    if (endpoint.pathname === '/v1/live/sessions') {
      const delay = finalToneDelays[providers.length];
      if (delay === undefined) throw new Error('unexpected_extra_live_session');
      const provider = await evaluationVoiceProvider(delay);
      providers.push(provider);
      sessions.push({ startedAt: Date.now(), finalSeconds: null });
      return provider.provider(url, init);
    }
    if (endpoint.pathname === '/v1/responses') {
      const request = JSON.parse(String(init?.body));
      if (request.model === judgeProfile.model) return judgeTransport(url, init);
      if (request.model === backendProfile.model) return backendTransport(url, init);
      throw new Error(`unexpected_controlled_model:${request.model}`);
    }
    if (endpoint.pathname !== '/v1/audio/transcriptions')
      throw new Error(`unexpected_controlled_endpoint:${endpoint.pathname}`);
    const body = init?.body as FormData;
    expect(body.get('model')).toBe(assessor.model);
    expect(body.get('language')).toBe('sv');
    expect(body.get('prompt')).toBeNull();
    const wav = Buffer.from(await (body.get('file') as Blob).arrayBuffer());
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
    const sampleRate = wav.readUInt32LE(24);
    const frames = wav.readUInt32LE(40) / 2;
    expect(wav.length).toBe(44 + frames * 2);
    let lastActiveFrame = frames - 1;
    while (lastActiveFrame >= 0 && Math.abs(wav.readInt16LE(44 + lastActiveFrame * 2)) < 32)
      lastActiveFrame--;
    if (lastActiveFrame < 0) throw new Error('controlled_recognition_received_silence');
    const recording: PlaybackRecording = {
      wav,
      sampleRate,
      frames,
      firstFrame: 0,
      lastActiveFrame,
      observedAt: Date.now(),
      clocks: [],
      sha256: createHash('sha256').update(wav).digest('hex'),
    };
    const finalTone = renderedToneWindows(recording, 880) > 0;
    if (!finalTone && renderedToneWindows(recording, 400) === 0)
      throw new Error('controlled_recognition_received_no_known_tone');
    const seconds = frames / sampleRate;
    const end = (lastActiveFrame + 1) / sampleRate;
    const start = Math.max(0, end - 0.3);
    const text = finalTone ? 'Sparat.' : 'Arbetar.';
    recognitions.push({ session: providers.length - 1, seconds, finalTone });
    return Response.json({
      language: 'swedish',
      duration: seconds,
      text,
      words: [{ word: text, start, end }],
      segments: [{ start, end, text, avg_logprob: -0.1, no_speech_prob: 0.01 }],
      usage: { type: 'duration', seconds },
    });
  };
  try {
    const run = await evaluateModels(
      {
        issue: 712,
        directory: test.info().outputPath('evaluation'),
        apiKey: 'controlled-no-paid-calls',
        authorized: true,
        priorUsd: 0,
        priorSource: 'Isolated browser regression with exclusively local external providers.',
        commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        textProfiles: [],
        voice: true,
        voiceProfile: liveProfile,
        playbackAssessorProfile: assessor,
        referenceVoice: 'marin',
        judgeProfile,
        baselineProfiles: { voice: liveProfile.id },
        repetitions: [1],
        scenarioSet,
        localVerification: {
          passed: true,
          commands: ['controlled-browser-regression'],
          evidence: 'Real application and Chromium; all provider endpoints are local fakes.',
        },
      },
      { transport, liveSideband },
    );
    await test.info().attach('reservation-regression', {
      body: JSON.stringify({ run, sessions, recognitions, calibrationCalls }, null, 2),
      contentType: 'application/json',
    });
    expect(calibrationCalls).toBe(controls.cases.length);
    expect(calibrated).toEqual(new Set(controls.cases.map((control) => control.id)));
    expect(
      run.attempts.map(({ scenario, outcome, fixed }) => ({ scenario, outcome, fixed })),
    ).toEqual(scenarioSet.map(({ id }) => ({ scenario: id, outcome: 'pass', fixed: [] })));
    expect(providers).toHaveLength(2);
    expect(providers[0].finalAudioSentAt).toBeDefined();
    expect(providers[1].finalAudioSentAt).toBeDefined();
    expect((providers[0].finalAudioSentAt ?? 0) - sessions[0].startedAt).toBeGreaterThan(220_000);
    expect(run.attempts[0].timing?.successfulCompletionMs).toBeGreaterThan(215_000);
    for (const [index, attempt] of run.attempts.entries()) {
      expect(recognitions.some((item) => item.session === index && item.finalTone)).toBe(true);
      expect(sessions[index].finalSeconds).toBeGreaterThan(0);
      expect(attempt.playbackAssessmentCostUsd).toBeGreaterThan(0);
      expect(attempt.backendCostUsd).toBeGreaterThan(0);
      expect(attempt.judgeCostUsd).toBeGreaterThan(0);
      expect(attempt.playback?.candidates.at(-1)?.requiredResponse).toEqual([
        expect.objectContaining({ id: 'voice-rendered-response', outcome: 'pass' }),
      ]);
    }
    expect(run.budget).toMatchObject({
      limitUsd: null,
      availableUsd: null,
      stopped: false,
      reason: null,
      reservedUsd: 0,
      estimatedUsd: 0,
    });
    expect(run.budget.spentUsd).toBeGreaterThan(0);
  } finally {
    await Promise.all(providers.map((provider) => provider.close()));
  }
});
