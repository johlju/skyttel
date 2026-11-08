import { expect, test } from '@playwright/test';
import type { LiveEvaluationProfile } from '../../scripts/model-evaluation/live.js';
import { overlapScenarios } from '../../scripts/model-evaluation/overlap.js';
import profiles from '../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../scripts/model-evaluation/provider.js';
import { runVoiceScenario } from '../../scripts/model-evaluation/voice-runner.js';
import { waitForAbortOrTimeout } from '../support/abort-wait.js';
import { evaluationVoiceProvider } from '../support/evaluation-voice-provider.js';
import { modelMessage, textModel } from '../support/text-model.js';

const stopCases: {
  conversationWorkMode: 'sequential' | 'overlap';
  fault?: 'pause' | 'error' | 'missing-capture';
}[] = [
  { conversationWorkMode: 'sequential' },
  { conversationWorkMode: 'overlap' },
  { conversationWorkMode: 'overlap', fault: 'pause' },
  { conversationWorkMode: 'overlap', fault: 'error' },
  { conversationWorkMode: 'overlap', fault: 'missing-capture' },
];
for (const { conversationWorkMode, fault } of stopCases) {
  test(fault
    ? `voice scripted Stop retains cancellation but cannot qualify ${fault} capture`
    : `voice scripted Stop closes the actual renderer after full approved input (${conversationWorkMode})`, {
    tag: '@technical',
  }, async () => {
    const scenario = overlapScenarios().find((item) => item.id === 'overlap-early-stop');
    if (!scenario) throw new Error('Missing versioned Stop scenario');
    const live = await evaluationVoiceProvider(0.5, {
      initialText: scenario.steps[0].text,
      initialEndMs: 5000,
    });
    let inputDrained = false;
    let rendererClosed = false;
    let aborted = false;
    const model = textModel(async (_body, signal) => {
      await waitForAbortOrTimeout(30000, signal, () => {
        aborted = true;
      });
      return [modelMessage('Ett för sent svar.')];
    });
    const liveProfile = {
      ...profiles.profiles.find((profile) => profile.role === 'voice'),
      id: 'controlled-stop-live',
      backend: 'sol-high',
    } as LiveEvaluationProfile;
    try {
      const run = await runVoiceScenario(
        scenario,
        {
          modelFetch: async (url, init) => {
            const response = await model.provider(url, init);
            return Response.json(
              { ...(await response.json()), service_tier: 'default' },
              {
                headers: response.headers,
              },
            );
          },
          modelProfile: verifiedProfile('sol-high'),
          conversationWorkMode,
          liveFetch: live.provider,
          liveProfile,
          liveSideband: live.attach,
        },
        {
          profile: liveProfile.id,
          repetition: 1,
          maximumSeconds: 45,
          recordInput: () => {
            inputDrained = true;
          },
          playbackReady: (connection) => {
            const capture = connection.recording.bind(connection);
            if (fault)
              connection.recording = async () => {
                if (fault === 'missing-capture') throw new Error('controlled_capture_unavailable');
                await capture();
                await connection.control(fault);
                return capture();
              };
            const retire = connection.retire.bind(connection);
            connection.retire = async () => {
              await retire();
              rendererClosed = true;
            };
          },
        },
      );
      const attempt = run.attempts[0];
      expect(attempt, JSON.stringify(attempt)).toMatchObject({
        outcome: 'aborted',
        elapsedMs: null,
        backendCostUsd: null,
        playbackAssessmentCostUsd: 0,
        reason: 'evaluation_scripted_user_stop',
        scriptedStop: {
          verdict: fault ? 'inconclusive' : 'pass',
          terminalStatus: 'canceled',
          matchedState: 0,
        },
      });
      expect(inputDrained).toBe(true);
      expect(rendererClosed).toBe(true);
      expect(aborted).toBe(true);
      expect(attempt.scriptedStop?.audioQuiescedAt).toEqual(expect.any(Number));
      if (fault) {
        expect(attempt.scriptedStop?.endpointMs).toBeNull();
        expect(attempt.scriptedStop?.reason).toBe('voice_stop_capture_incomplete');
        expect(attempt.playback?.interruption ?? attempt.playback?.error).toBe(
          fault === 'pause'
            ? 'evaluation_output_paused'
            : fault === 'error'
              ? 'evaluation_output_error'
              : 'controlled_capture_unavailable',
        );
      } else {
        expect(attempt.scriptedStop?.endpointMs).toEqual(expect.any(Number));
        const bounds = attempt.scriptedStop?.endpointBounds;
        expect(bounds?.upper).toBe(attempt.scriptedStop?.endpointMs);
        expect((bounds?.upper ?? 0) - (bounds?.lower ?? 0)).toBeCloseTo(
          (attempt.playback?.input?.ended.upper ?? 0) - (attempt.playback?.input?.ended.lower ?? 0),
          3,
        );
      }
      expect(attempt.playback?.input?.drainedAt).toBeLessThanOrEqual(
        attempt.scriptedStop?.requestedAt ?? 0,
      );
      if (fault !== 'missing-capture')
        expect(attempt.playback?.recordingSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(attempt.playback?.input?.started?.upper).toBeLessThanOrEqual(
        attempt.playback?.input?.ended.upper ?? 0,
      );
      expect(attempt.timing?.successfulCompletionMs).toBeNull();
    } finally {
      await live.close();
    }
  });
}
