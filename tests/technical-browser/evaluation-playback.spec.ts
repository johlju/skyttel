import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  commonLiveSession,
  type LiveEvaluationProfile,
} from '../../scripts/model-evaluation/live.js';
import type { PlaybackRecording } from '../../scripts/model-evaluation/playback.js';
import profiles from '../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../scripts/model-evaluation/provider.js';
import { runVoiceScenario } from '../../scripts/model-evaluation/voice-runner.js';
import { renderedToneBoundary, renderedToneWindows } from '../support/evaluation-rendered-tone.js';
import { evaluationVoiceApplication } from '../support/evaluation-voice-application.js';
import { evaluationVoiceProvider } from '../support/evaluation-voice-provider.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../support/text-model.js';

for (const mode of [
  'full',
  'delayed',
  'assessment-tail',
  'useful-partial',
  'useful-interrupt',
  'useful-uncertain',
  'useful-irrelevant',
  'interrupt',
  'mute',
  'pause',
  'error',
  'uncertain',
  'final-judge-tail',
  'final-judge-interrupt',
  'final-judge-mute',
  'final-judge-pause',
  'final-judge-error',
] as const) {
  test(`voice completion requires rendered complete output (${mode})`, {
    tag: '@technical',
  }, async () => {
    const usefulMode = mode.startsWith('useful-');
    const finalJudge = mode.startsWith('final-judge-');
    const finalFault =
      mode === 'final-judge-interrupt'
        ? 'interrupt'
        : mode === 'final-judge-mute'
          ? 'mute'
          : mode === 'final-judge-pause'
            ? 'pause'
            : mode === 'final-judge-error'
              ? 'error'
              : undefined;
    const expectedFault =
      finalFault &&
      {
        interrupt: 'evaluation_output_interrupted',
        mute: 'evaluation_output_attenuated',
        pause: 'evaluation_output_paused',
        error: 'evaluation_output_error',
      }[finalFault];
    const live = await evaluationVoiceProvider(
      mode === 'full' || finalJudge ? 0.5 : usefulMode ? 6 : 3,
      {
        usefulPartial: usefulMode,
      },
    );
    const application =
      mode === 'full' || mode === 'delayed'
        ? await evaluationVoiceApplication(mode === 'full' ? 'Baseline' : 'Candidate')
        : undefined;
    let stopped = false;
    let control: Promise<void> | undefined;
    let controlTimer: ReturnType<typeof setTimeout> | undefined;
    const recordings: PlaybackRecording[] = [];
    let inputs = 0;
    let finalJudgePerturbed = false;
    let lateTail: { startedAt: number; endedAt: number } | undefined;
    let snapshotOutput: (() => Promise<PlaybackRecording>) | undefined;
    let controlOutput: ((action: NonNullable<typeof finalFault>) => Promise<void>) | undefined;
    const judgedVoiceTexts: (string | undefined)[] = [];
    try {
      const model = textModel((body) => {
        if (lastToolResult(body))
          return [modelMessage(usefulMode ? 'Hela utkastet är sparat.' : 'Sparat.')];
        const input = JSON.parse(
          String(body.input.findLast((item) => item.role === 'user')?.content),
        );
        return [
          modelTool('save_draft', {
            version: input.draft.version,
            contentVersion: input.draft.contentVersion,
          }),
        ];
      });
      const liveProfile = {
        ...profiles.profiles.find((profile) => profile.role === 'voice'),
        id: 'controlled-live-sol',
        backend: 'sol-high',
      } as LiveEvaluationProfile;
      const result = await runVoiceScenario(
        {
          id: 'rendered-output',
          title: 'Save with a delayed final spoken result',
          voice: true,
          steps: [
            {
              id: 'spara-hela-utkastet',
              text: 'Spara hela utkastet.',
              expected: {
                saves: 1,
                saveAttempts: 1,
                requirements: [
                  usefulMode
                    ? 'Bekräfta att hela utkastet sparats, inte bara en enskild ändring.'
                    : 'Bekräfta att utkastet sparats.',
                ],
              },
            },
          ],
        },
        {
          modelFetch: async (url, init) => {
            const response = await model.provider(url, init);
            return Response.json(
              { ...(await response.json()), service_tier: 'default' },
              { headers: response.headers },
            );
          },
          modelProfile: verifiedProfile('sol-high'),
          liveFetch: async (url, init) => {
            const { input: _history, ...session } = JSON.parse(String(init?.body)).session;
            expect(session).toEqual(commonLiveSession(liveProfile));
            return live.provider(url, init);
          },
          liveProfile,
          liveSideband: live.attach,
        },
        {
          profile: liveProfile.id,
          application,
          repetition: 1,
          maximumSeconds: mode === 'assessment-tail' || usefulMode ? 20 : 16,
          stopped: () => stopped,
          sessionTimeLimit: () => {
            stopped = true;
          },
          recordInput: () => {
            inputs++;
          },
          recordPlayback: (recording) => {
            recordings.push(recording);
          },
          playbackReady: (connection) => {
            snapshotOutput = connection.recording;
            controlOutput = connection.control;
            if (
              mode === 'interrupt' ||
              mode === 'mute' ||
              mode === 'pause' ||
              mode === 'error' ||
              mode === 'useful-interrupt'
            ) {
              control = live.outputStarted.then(
                () =>
                  new Promise<void>((resolve, reject) => {
                    controlTimer = setTimeout(
                      () => {
                        void connection
                          .control(mode === 'useful-interrupt' ? 'interrupt' : mode)
                          .then(resolve, reject);
                      },
                      mode === 'useful-interrupt' ? 4000 : 800,
                    );
                  }),
              );
            }
          },
          assessPlayback: async (recording) => {
            // This external controlled recognizer reads the REAL rendered WAV.
            // 400Hz is a status utterance; the required final result is 880Hz.
            const final = hasFinalTone(recording);
            await new Promise((resolve) =>
              setTimeout(resolve, mode === 'assessment-tail' ? 1500 : 300),
            );
            return {
              outcome: mode === 'uncertain' ? 'inconclusive' : 'recognized',
              // A misleading assessment must not override actual output faults.
              text: hasTone(recording, 1100)
                ? 'Hela utkastet är sparat.'
                : final || ['interrupt', 'mute', 'pause', 'error'].includes(mode)
                  ? usefulMode
                    ? 'Hela utkastet är sparat.'
                    : 'Sparat.'
                  : usefulMode && hasTone(recording, 660)
                    ? mode === 'useful-irrelevant'
                      ? 'Det är soligt.'
                      : 'Lo Bergs beskrivning är sparad.'
                    : 'Jag arbetar.',
              lastWordEndSeconds:
                recording.lastActiveFrame === null
                  ? null
                  : (recording.lastActiveFrame + 1 - recording.firstFrame) / recording.sampleRate,
              alignmentMarginMs: 100,
              profile: 'controlled-wave-assessor',
              callId: `candidate-${recording.frames}`,
              costUsd: mode === 'full' ? null : 0,
              ...(mode === 'full' ? { estimatedCostUsd: 0.001 } : {}),
            };
          },
          judge: async (input) => {
            if (input.sources.backend) judgedVoiceTexts.push(input.sources.voice?.text);
            if (finalJudge && input.sources.backend && !finalJudgePerturbed) {
              finalJudgePerturbed = true;
              if (!snapshotOutput) throw new Error('Missing negotiated output recorder.');
              if (finalFault) {
                if (!controlOutput) throw new Error('Missing negotiated output control.');
                await controlOutput(finalFault);
                await new Promise((resolve) => setTimeout(resolve, 100));
                const interrupted = await snapshotOutput();
                expect(interrupted.interruption ?? interrupted.error).toBe(expectedFault);
              } else {
                lateTail = await live.tone(1100, 0.5);
                // Let the negotiated receiver render the tail before judgment
                // returns. Its PCM, not this provider timestamp, certifies end.
                await new Promise((resolve) => setTimeout(resolve, 500));
                expect(hasTone(await snapshotOutput(), 1100)).toBe(true);
              }
            }
            if (application && input.sources.backend)
              expect(input.sources.backend.text).toContain(application.id);
            return input.requirements.map((requirement) => ({
              id: requirement.id,
              outcome:
                requirement.id === 'voice-rendered-useful'
                  ? input.sources.voice?.text === 'Jag arbetar.' ||
                    input.sources.voice?.text === 'Det är soligt.'
                    ? 'fail'
                    : mode === 'useful-uncertain' &&
                        !input.sources.voice?.text.includes('Hela utkastet')
                      ? 'inconclusive'
                      : 'pass'
                  : (mode === 'assessment-tail' && requirement.id === 'voice-rendered-response') ||
                      input.sources.voice?.text === 'Sparat.' ||
                      input.sources.voice?.text.includes('Hela utkastet')
                    ? 'pass'
                    : 'inconclusive',
              reason:
                'Controlled semantic interpretation of the independently recognized rendered tones.',
            }));
          },
        },
      );
      expect(live.outputStartedAt).toBeDefined();
      expect(inputs).toBe(1);
      if (control) await control;
      const evidence = test.info().outputPath('rendered-playback-evidence.json');
      await mkdir(dirname(evidence), { recursive: true });
      await writeFile(
        evidence,
        JSON.stringify(
          {
            ...result.attempts[0],
            control: { inputs, finalJudgePerturbed, lateTail, judgedVoiceTexts },
          },
          null,
          2,
        ),
      );
      await test
        .info()
        .attach('rendered-playback-evidence', { path: evidence, contentType: 'application/json' });
      if (finalFault) {
        const attempt = result.attempts[0];
        expect(finalJudgePerturbed).toBe(true);
        expect(attempt.outcome).toBe('error');
        expect(attempt.elapsedMs).toBeNull();
        expect(attempt.timing?.successfulCompletionMs).toBeNull();
        expect(attempt.timing?.firstUsefulMs).toBeGreaterThan(0);
        expect(attempt.playback?.candidates).toHaveLength(1);
        expect(attempt.playback?.candidates[0].requiredResponse?.[0].outcome).toBe('pass');
        expect(attempt.content?.every((assessment) => assessment.outcome === 'pass')).toBe(true);
        expect(attempt.reason).toBe(expectedFault);
        expect(attempt.playback?.interruption ?? attempt.playback?.error).toBe(expectedFault);
        return;
      }
      if (
        mode === 'interrupt' ||
        mode === 'mute' ||
        mode === 'pause' ||
        mode === 'error' ||
        mode === 'uncertain' ||
        mode === 'useful-interrupt'
      ) {
        expect(result.attempts[0].outcome).not.toBe('pass');
        expect(result.attempts[0].elapsedMs).toBeNull();
        expect(result.attempts[0].timing?.successfulCompletionMs).toBeNull();
        expect(recordings.length).toBeGreaterThan(0);
        if (mode === 'useful-interrupt') {
          expect(result.attempts[0].timing?.firstUsefulMs).toBeGreaterThan(0);
          expect(recordings.some((recording) => hasTone(recording, 660))).toBe(true);
        } else expect(result.attempts[0].timing?.firstUsefulMs).toBeNull();
        if (mode !== 'uncertain') {
          expect(recordings.some(hasFinalTone)).toBe(false);
          expect(
            result.attempts[0].playback?.interruption ?? result.attempts[0].playback?.error,
          ).toBeTruthy();
        }
        return;
      }
      expect(result.attempts[0].outcome, JSON.stringify(result.attempts[0])).toBe('pass');
      expect(live.finalAudioSentAt).toBeDefined();
      expect(result.attempts[0].elapsedMs).not.toBeNull();
      const attempt = result.attempts[0];
      if (mode === 'full') {
        expect(attempt.playback?.candidates).toEqual([
          expect.objectContaining({ costUsd: null, estimatedCostUsd: 0.001 }),
        ]);
        expect(attempt).toMatchObject({
          playbackAssessmentCostUsd: null,
          estimatedPlaybackAssessmentCostUsd: 0.001,
        });
      }
      const input = attempt.playback?.input;
      const elapsed = attempt.elapsedMs;
      const observed = attempt.observedEndMs;
      const renderedToneAt = renderedToneBoundary(recordings, 880);
      if (!input || elapsed === null || observed === undefined)
        throw new Error('Missing source/rendered completion evidence.');
      if (application)
        expect(result.attempts[0]).toMatchObject({
          applicationVersion: application.id,
          applicationCommit: application.commit,
        });
      if (mode === 'assessment-tail') {
        expect(result.attempts[0].playback?.candidates.length).toBeGreaterThanOrEqual(2);
        expect(elapsed).toBeGreaterThanOrEqual(renderedToneAt - input.ended.upper);
      }
      if (mode === 'final-judge-tail') {
        expect(finalJudgePerturbed).toBe(true);
        expect(lateTail).toBeDefined();
        expect(attempt.playback?.candidates.length).toBeGreaterThanOrEqual(2);
        expect(recordings.some((recording) => hasTone(recording, 1100))).toBe(true);
        expect(elapsed).toBeGreaterThanOrEqual(
          renderedToneBoundary(recordings, 1100) - input.ended.upper,
        );
        const finalCandidate = attempt.playback?.candidates.at(-1);
        expect(finalCandidate?.requiredResponse?.[0].outcome).toBe('pass');
        expect(finalCandidate?.recordingSha256).toBe(attempt.playback?.recordingSha256);
        expect(judgedVoiceTexts).toEqual(['Sparat.', 'Hela utkastet är sparat.']);
      }
      if (mode === 'useful-partial') {
        const useful = attempt.timing?.firstUsefulMs;
        expect(useful).not.toBeNull();
        expect(useful).toBeGreaterThan(0);
        expect(useful).toBeLessThan(renderedToneAt - input.ended.upper - 1000);
        expect(attempt.timing?.firstVerifiedUsefulMs).toBe(useful);
        expect(attempt.timing?.successfulCompletionMs).toBeGreaterThan(useful ?? Infinity);
        expect(attempt.playbackAssessmentElapsedMs).toBeGreaterThanOrEqual(600);
      }
      if (mode === 'useful-uncertain' || mode === 'useful-irrelevant') {
        expect(attempt.timing?.firstVerifiedUsefulMs).toBeGreaterThanOrEqual(
          renderedToneAt - input.ended.upper,
        );
        if (mode === 'useful-uncertain') expect(attempt.timing?.firstUsefulMs).toBeNull();
        else expect(attempt.timing?.firstUsefulMs).toBe(attempt.timing?.firstVerifiedUsefulMs);
      }
      if (mode === 'delayed') {
        expect(attempt.playback?.candidates[0].usefulContent?.[0].outcome).toBe('fail');
        expect(attempt.timing?.firstUsefulMs).toBeGreaterThanOrEqual(
          renderedToneAt - input.ended.upper,
        );
      }
      expect(
        model.requests.every(
          (request) => request.model === 'gpt-6.1-sol' && request.reasoning.effort === 'high',
        ),
      ).toBe(true);
      expect(recordings.some(hasFinalTone)).toBe(true);
      expect(result.attempts[0].playback?.renderedEnd).toBeDefined();
      expect(result.attempts[0].playback?.lastActiveFrame).toBeGreaterThan(0);
      expect(result.attempts[0].timing?.contract).toBe('voice-rendered-v1');
      expect(observed - elapsed).toBeGreaterThan(300);
    } finally {
      clearTimeout(controlTimer);
      await live.close();
      if (application) await rm(application.directory, { recursive: true, force: true });
    }
  });
}

function hasFinalTone(recording: PlaybackRecording) {
  return hasTone(recording, 880);
}

function hasTone(recording: PlaybackRecording, frequency: number) {
  return renderedToneWindows(recording, frequency) > 0;
}
