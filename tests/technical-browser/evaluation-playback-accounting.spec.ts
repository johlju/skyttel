import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { LiveEvaluationProfile } from '../../scripts/model-evaluation/live.js';
import profiles from '../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../scripts/model-evaluation/provider.js';
import { summarizeProfile } from '../../scripts/model-evaluation/report.js';
import { runVoiceScenario } from '../../scripts/model-evaluation/voice-runner.js';
import { renderedToneWindows } from '../support/evaluation-rendered-tone.js';
import { evaluationVoiceProvider } from '../support/evaluation-voice-provider.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../support/text-model.js';

for (const mode of [
  'heartbeat-known',
  'heartbeat-unknown',
  'recognition-exception',
  'known-then-heartbeat',
  'known-then-exception',
  'semantic-heartbeat',
  'semantic-heartbeat-inconclusive',
  'uncertain-then-semantic-heartbeat',
  'semantic-exception',
  'success',
] as const) {
  test(`recognition accounting preserves charges and terminal outcome (${mode})`, {
    tag: '@technical',
  }, async () => {
    const multiple = mode.startsWith('known-then-') || mode === 'uncertain-then-semantic-heartbeat';
    const recognitionException =
      mode === 'recognition-exception' || mode === 'known-then-exception';
    const semanticHeartbeat = mode.includes('semantic-heartbeat');
    const live = await evaluationVoiceProvider(multiple ? 6 : 0.5);
    let failPoll = false;
    let failedPolls = 0;
    let recognitions = 0;
    let judgeCostUsd = 0;
    try {
      const model = textModel((body) => {
        if (lastToolResult(body)) return [modelMessage('Sparat.')];
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
        id: 'controlled-accounting',
        backend: 'sol-high',
      } as LiveEvaluationProfile;
      const scenario = {
        id: 'recognition-accounting',
        title: 'Retain assessment charges independently of output assessment success',
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
      };
      const result = await runVoiceScenario(
        scenario,
        {
          modelFetch: async (url, init) => {
            const response = await model.provider(url, init);
            return Response.json(
              { ...(await response.json()), service_tier: 'default' },
              { headers: response.headers },
            );
          },
          modelProfile: verifiedProfile('sol-high'),
          liveFetch: live.provider,
          liveProfile,
          liveSideband: live.attach,
          deliverResponse: (request, response) => {
            if (failPoll && new URL(request.url).pathname.endsWith('/poll')) {
              failedPolls++;
              return new Response(null, { status: 503 });
            }
            return response;
          },
        },
        {
          profile: liveProfile.id,
          repetition: 1,
          maximumSeconds: 24,
          judgeCosts: () => judgeCostUsd,
          assessPlayback: async (recording) => {
            recognitions++;
            failPoll =
              mode === 'heartbeat-known' ||
              mode === 'heartbeat-unknown' ||
              (mode === 'known-then-heartbeat' && recognitions === 2);
            await new Promise((resolve) => setTimeout(resolve, failPoll ? 1200 : 20));
            if (
              mode === 'recognition-exception' ||
              (mode === 'known-then-exception' && recognitions === 2)
            )
              throw new Error('controlled_recognition_failed');
            return {
              outcome: mode === 'heartbeat-unknown' ? 'inconclusive' : 'recognized',
              text: renderedToneWindows(recording, 880) > 0 ? 'Sparat.' : 'Jag arbetar.',
              lastWordEndSeconds:
                recording.lastActiveFrame === null
                  ? null
                  : (recording.lastActiveFrame + 1 - recording.firstFrame) / recording.sampleRate,
              alignmentMarginMs: 100,
              profile: 'controlled-cost-assessor',
              callId: `recognition-${recognitions}`,
              costUsd: mode === 'heartbeat-unknown' ? null : recognitions === 1 ? 0.012 : 0.023,
            };
          },
          judge: async (input) => {
            judgeCostUsd += 0.007;
            if (mode === 'semantic-exception') throw new Error('controlled_judge_failed');
            if (semanticHeartbeat && (!multiple || recognitions === 2)) {
              failPoll = true;
              await new Promise((resolve) => setTimeout(resolve, 1200));
            }
            return input.requirements.map(({ id }) => ({
              id,
              outcome:
                id === 'voice-rendered-useful' &&
                (mode === 'semantic-heartbeat-inconclusive' ||
                  (mode === 'uncertain-then-semantic-heartbeat' && recognitions === 1))
                  ? 'inconclusive'
                  : input.sources.voice?.text === 'Sparat.'
                    ? 'pass'
                    : 'fail',
              reason: 'Controlled interpretation of the independently recognized rendered tones.',
            }));
          },
        },
      );
      const attempt = result.attempts[0];
      const summary = summarizeProfile(result.attempts, [scenario], liveProfile.id, 'voice', [1]);
      const evidence = test.info().outputPath('recognition-accounting.json');
      await writeFile(
        evidence,
        JSON.stringify({ attempt, summary, failedPolls, recognitions }, null, 2),
      );
      await test.info().attach('recognition-accounting', {
        path: evidence,
        contentType: 'application/json',
      });
      const exception = recognitionException || mode === 'semantic-exception';
      expect(failedPolls).toBe(mode === 'success' || exception ? 0 : 1);
      expect(recognitions).toBe(multiple ? 2 : 1);
      if (mode === 'success') {
        expect(attempt.outcome).toBe('pass');
        expect(attempt.elapsedMs).toBeGreaterThan(0);
        expect(attempt.timing?.successfulCompletionMs).toBe(attempt.elapsedMs);
      } else {
        expect(attempt).toMatchObject({
          outcome: 'error',
          reason:
            mode === 'semantic-exception'
              ? 'controlled_judge_failed'
              : recognitionException
                ? 'controlled_recognition_failed'
                : 'evaluation_http_503',
        });
        expect(attempt.elapsedMs).toBeNull();
        expect(attempt.timing?.successfulCompletionMs).toBeNull();
        expect(summary.qualified).toBe(false);
        expect(summary.finalQualified).toBe(false);
      }
      if (mode === 'heartbeat-unknown' || recognitionException) {
        expect(attempt.playbackAssessmentCostUsd).toBeNull();
        expect(summary.playbackAssessmentCostUsd).toBeNull();
      } else {
        const expectedCost = multiple ? 0.035 : 0.012;
        expect(attempt.playbackAssessmentCostUsd).toBeCloseTo(expectedCost);
        expect(summary.playbackAssessmentCostUsd).toBeCloseTo(expectedCost);
      }
      const candidates = attempt.playback?.candidates;
      if (mode === 'recognition-exception') expect(candidates).toEqual([]);
      else {
        expect(candidates?.[0]).toMatchObject({
          callId: 'recognition-1',
          costUsd: mode === 'heartbeat-unknown' ? null : 0.012,
        });
        if (multiple) {
          expect(candidates?.[0].requiredResponse?.[0].outcome).toBe('fail');
          if (!exception)
            expect(candidates?.[1]).toMatchObject({ callId: 'recognition-2', costUsd: 0.023 });
          else expect(candidates).toHaveLength(1);
        }
      }
      if (semanticHeartbeat) {
        expect(attempt.judgeCostUsd).toBe(multiple ? 0.014 : 0.007);
        expect(summary.judgeCostUsd).toBe(multiple ? 0.014 : 0.007);
        expect(candidates?.at(-1)).toMatchObject({
          requiredResponse: [{ id: 'voice-rendered-response', outcome: 'pass' }],
          usefulContent: [
            {
              id: 'voice-rendered-useful',
              outcome: mode === 'semantic-heartbeat-inconclusive' ? 'inconclusive' : 'pass',
            },
          ],
        });
        if (mode === 'semantic-heartbeat-inconclusive') {
          expect(attempt.timing?.firstUsefulMs).toBeNull();
          expect(attempt.timing?.firstVerifiedUsefulMs ?? null).toBeNull();
        } else {
          expect(attempt.timing?.firstVerifiedUsefulMs).toBeGreaterThan(0);
          if (multiple) {
            expect(candidates?.[0].usefulContent?.[0].outcome).toBe('inconclusive');
            expect(attempt.timing?.firstUsefulMs).toBeNull();
          } else expect(attempt.timing?.firstUsefulMs).toBe(attempt.timing?.firstVerifiedUsefulMs);
        }
        expect(result.attempts).toHaveLength(1);
      }
      if (mode === 'semantic-exception') {
        expect(candidates?.[0].requiredResponse).toBeUndefined();
        expect(candidates?.[0].usefulContent).toBeUndefined();
        expect(attempt.timing?.firstUsefulMs).toBeNull();
        expect(attempt.timing?.firstVerifiedUsefulMs ?? null).toBeNull();
        expect(attempt.judgeCostUsd).toBe(0.007);
        expect(summary.judgeCostUsd).toBe(0.007);
      }
      if (failedPolls) expect(attempt.playbackAssessmentElapsedMs).toBeGreaterThanOrEqual(1200);
    } finally {
      await live.close();
    }
  });
}
