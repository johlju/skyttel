import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import catalog from '../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import type { LiveEvaluationProfile } from '../../scripts/model-evaluation/live.js';
import type { PlaybackRecording } from '../../scripts/model-evaluation/playback.js';
import profiles from '../../scripts/model-evaluation/profiles.json' with { type: 'json' };
import { verifiedProfile } from '../../scripts/model-evaluation/provider.js';
import { summarizeProfile } from '../../scripts/model-evaluation/report.js';
import type { Catalog } from '../../scripts/model-evaluation/types.js';
import { runVoiceScenario } from '../../scripts/model-evaluation/voice-runner.js';
import type { MapState } from '../../src/shared/map.js';
import { renderedToneBoundary, renderedToneWindows } from '../support/evaluation-rendered-tone.js';
import { evaluationVoiceProvider } from '../support/evaluation-voice-provider.js';
import { modelMessage, modelTool, textModel } from '../support/text-model.js';

for (const mode of [
  'late-state',
  'invalidated',
  'restored',
  'final-poll',
  'final-judge-invalidated',
  'final-judge-selection',
] as const) {
  test(`voice completion retains current checked state during offline assessment (${mode})`, {
    tag: '@technical',
  }, async () => {
    const step = (catalog as Catalog).scenarios
      .flatMap((scenario) => scenario.steps)
      .find((step) => step.id === 'kontext-forsta-andring');
    assert(step?.text);
    const text = step.text;
    const expectedObject = step.expected.objects?.['spotify-sub'];
    assert(expectedObject);
    const late = ['late-state', 'invalidated', 'restored'].includes(mode);
    const live = await evaluationVoiceProvider(late ? 6 : 0.5, {
      initialText: late ? 'Ändra priset ' : text,
      initialEndMs: late ? 700 : 5000,
    });
    let pollRequest: Request | undefined;
    let requests = 0;
    let recognitions = 0;
    const recordings: PlaybackRecording[] = [];
    let inputs = 0;
    let selectionRequested = false;
    let heldUntil = 0;
    let observedAt = async (): Promise<number> => {
      throw new Error('Browser clock is not ready');
    };
    const polls: { at: number; price?: number; phase: string; selection?: string }[] = [];
    const mutations: { price: number; before: number; after: number }[] = [];
    async function readMap() {
      if (!pollRequest) throw new Error('Missing authenticated public app request');
      const base = pollRequest.url.split('/text-assistant/')[0];
      const headers = {
        cookie: pollRequest.headers.get('cookie') ?? '',
        origin: new URL(base).origin,
        'content-type': 'application/json',
      };
      const response = await fetch(`${base}/map`, { headers });
      expect(response.ok).toBe(true);
      return { map: (await response.json()) as MapState, base, headers };
    }
    async function proposePrice(price: number) {
      const before = await observedAt();
      const { map, base, headers } = await readMap();
      const original = map.objects.find((object) => object.id === 'spotify-sub');
      assert(original);
      const { id, householdId: _household, revision, ...value } = original;
      const response = await fetch(`${base}/map/draft`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          version: map.draft.version,
          contentVersion: map.contentVersion,
          id,
          baseRevision: revision,
          value: {
            ...value,
            properties: value.properties?.map((property) =>
              property.id === 'price' ? { ...property, value: price } : property,
            ),
          },
        }),
      });
      expect(response.ok).toBe(true);
      mutations.push({ price, before, after: await observedAt() });
    }
    try {
      const model = textModel(async (body) => {
        if (
          body.input.findLast((item) => item.role !== 'developer')?.type === 'function_call_output'
        )
          return [modelMessage('Utkastet är uppdaterat.')];
        if (
          ++requests === 1 &&
          mode !== 'final-judge-invalidated' &&
          mode !== 'final-judge-selection'
        )
          return [modelMessage('Jag arbetar.')];
        if (mode === 'final-judge-selection' && requests === 2)
          return [modelTool('show_map_object', { objectId: 'lo' })];
        const { map } = await readMap();
        const original = map.objects.find((object) => object.id === 'spotify-sub');
        assert(original);
        const { id, householdId: _household, revision, ...value } = original;
        return [
          modelTool('propose_object', {
            version: map.draft.version,
            contentVersion: map.contentVersion,
            id,
            baseRevision: revision,
            value: { ...value, ...expectedObject },
          }),
        ];
      });
      const liveProfile = {
        ...profiles.profiles.find((profile) => profile.role === 'voice'),
        id: 'controlled-later-state',
        backend: 'sol-high',
      } as LiveEvaluationProfile;
      const scenario = {
        id: `checked-state-${mode}`,
        title: 'One recorded request with independently checked state and rendered final output',
        voice: true,
        steps: [step],
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
          deliverResponse: async (request, response) => {
            if (new URL(request.url).pathname.endsWith('/poll') && response.ok) {
              pollRequest = request;
              const status = await response.clone().json();
              polls.push({
                at: Date.now(),
                price: status.assistant.review.changes
                  .find((change: { id: string }) => change.id === 'spotify-sub')
                  ?.after?.properties.find((property: { id: string }) => property.id === 'price')
                  ?.value,
                phase: status.assistant.phase,
                selection: status.assistant.selection?.id,
              });
            }
            return response;
          },
        },
        {
          profile: liveProfile.id,
          repetition: 1,
          maximumSeconds: 34,
          recordPlayback: (recording) => {
            recordings.push(recording);
          },
          recordInput: () => {
            inputs++;
          },
          playbackReady: (connection) => {
            observedAt = connection.observedAt;
          },
          assessPlayback: async (recording) => {
            if (++recognitions === 1 && late) {
              expect(renderedToneWindows(recording, 880)).toBe(0);
              expect(polls.at(-1)?.price).toBeUndefined();
              // Late remaining words belong to the SAME recorded utterance. No
              // second source input plays; transcript spans partition that input.
              live.delegate(text.slice('Ändra priset '.length), 700, 5000);
              if (mode === 'invalidated' || mode === 'restored') {
                await expect
                  .poll(
                    () => polls.some((poll) => poll.price === 189 && poll.phase !== 'working'),
                    { timeout: 7000, intervals: [50] },
                  )
                  .toBe(true);
                await proposePrice(199);
                await expect
                  .poll(() => polls.at(-1)?.price, { timeout: 2000, intervals: [50] })
                  .toBe(199);
                await expect
                  .poll(() => live.finalAudioSentAt, { timeout: 6000, intervals: [50] })
                  .toBeDefined();
                if (mode === 'restored') {
                  // Restore after audio is fully delivered, so checked state,
                  // rather than the audio tail, determines this boundary.
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  await proposePrice(189);
                }
                await new Promise((resolve) => setTimeout(resolve, 2500));
              } else await new Promise((resolve) => setTimeout(resolve, 8500));
              heldUntil = await observedAt();
              expect(live.finalAudioSentAt).toBeDefined();
              expect(
                polls.some(
                  (poll) =>
                    poll.price === 189 && poll.phase !== 'working' && poll.at < heldUntil - 2000,
                ),
              ).toBe(true);
            }
            return {
              outcome: 'recognized',
              text:
                renderedToneWindows(recording, 880) > 0
                  ? 'Utkastet är uppdaterat.'
                  : 'Jag arbetar.',
              lastWordEndSeconds:
                recording.lastActiveFrame === null
                  ? null
                  : (recording.lastActiveFrame + 1 - recording.firstFrame) / recording.sampleRate,
              alignmentMarginMs: 100,
              profile: 'controlled-state-assessor',
              callId: `candidate-${recognitions}`,
              costUsd: 0,
            };
          },
          judge: async (input) => {
            if (mode === 'final-judge-selection' && input.sources.backend && !selectionRequested) {
              selectionRequested = true;
              assert(pollRequest);
              const assistantUrl = pollRequest.url.split('/voice/')[0];
              const { headers } = await readMap();
              const view = await (await fetch(assistantUrl, { headers })).json();
              const response = await fetch(`${assistantUrl}/messages`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  text: 'Visa Lo Berg.',
                  requestId: 'concurrent-selection',
                  revision: view.revision,
                  draftVersion: view.review.version,
                  contentVersion: view.review.contentVersion,
                }),
              });
              expect(response.status).toBe(202);
              await expect
                .poll(() => polls.some((poll) => poll.selection === 'lo'), {
                  timeout: 4000,
                  intervals: [50],
                })
                .toBe(true);
              await expect
                .poll(() => polls.at(-1)?.phase, { timeout: 4000, intervals: [50] })
                .not.toBe('working');
            }
            if (mode === 'final-poll' && !input.sources.backend && !mutations.length)
              await proposePrice(189);
            if (mode === 'final-judge-invalidated' && input.sources.backend && !mutations.length)
              await proposePrice(199);
            return input.requirements.map(({ id }) => ({
              id,
              outcome:
                input.sources.voice?.text === 'Utkastet är uppdaterat.' || input.sources.backend
                  ? 'pass'
                  : 'fail',
              reason: 'Controlled interpretation of actual rendered tones.',
            }));
          },
        },
      );
      const attempt = result.attempts[0];
      const summary = summarizeProfile(result.attempts, [scenario], liveProfile.id, 'voice', [1]);
      const evidence = test.info().outputPath('later-state.json');
      await writeFile(
        evidence,
        JSON.stringify(
          {
            attempt,
            summary,
            mutations,
            polls,
            heldUntil,
            finalAudioSentAt: live.finalAudioSentAt,
            requests,
            recognitions,
            inputs,
            selectionRequested,
          },
          null,
          2,
        ),
      );
      await test.info().attach('later-state', { path: evidence, contentType: 'application/json' });
      const failed =
        mode === 'invalidated' ||
        mode === 'final-judge-invalidated' ||
        mode === 'final-judge-selection';
      expect(attempt.outcome, JSON.stringify(attempt)).toBe(failed ? 'fail' : 'pass');
      expect(recognitions).toBe(late ? 2 : 1);
      expect(requests).toBe(late || mode === 'final-judge-selection' ? 2 : 1);
      expect(inputs).toBe(1);
      expect(attempt.playback?.candidates[0].requiredResponse?.[0].outcome).toBe(
        late ? 'fail' : 'pass',
      );
      const timing = attempt.timing;
      assert(timing);
      const submitted = timing.submittedAt;
      const finalAudioSentAt = live.finalAudioSentAt;
      assert(finalAudioSentAt !== undefined);
      if (failed) {
        expect(attempt.fixed).toContain(
          mode === 'final-judge-selection' ? 'unexpected_selection' : 'effective_objects',
        );
        if (mode === 'final-judge-selection') {
          expect(selectionRequested).toBe(true);
          expect(polls.some((poll) => poll.selection === 'lo')).toBe(true);
        }
        expect(attempt.elapsedMs).toBeNull();
        expect(attempt.timing?.successfulCompletionMs).toBeNull();
        expect(summary.qualified).toBe(false);
        expect(summary.finalQualified).toBe(false);
      } else {
        expect(attempt.elapsedMs).toBeGreaterThanOrEqual(
          renderedToneBoundary(recordings, 880) - submitted,
        );
        if (late) {
          expect(attempt.elapsedMs).toBeLessThan(heldUntil - submitted - 2000);
          expect(attempt.observedEndMs).toBeGreaterThanOrEqual(heldUntil - submitted);
        }
        const lastMutation = mutations.at(-1);
        if (lastMutation)
          expect(attempt.elapsedMs).toBeGreaterThanOrEqual(lastMutation.before - submitted);
        if (mode === 'restored') {
          assert(lastMutation);
          expect(attempt.elapsedMs).toBeLessThan(lastMutation.after - submitted + 300);
        }
      }
      expect(
        result.finalMap.draft.changes.find((change) => change.id === 'spotify-sub')?.after
          ?.properties,
      ).toContainEqual({
        id: 'price',
        label: 'Pris',
        kind: 'number',
        value: mode === 'invalidated' || mode === 'final-judge-invalidated' ? 199 : 189,
      });
      const transcript = result.events
        .filter(
          (event) =>
            event.kind === 'voice_event' && (event.data as { role?: string }).role === 'user',
        )
        .map((event) => (event.data as { delta: string }).delta)
        .join('');
      expect(transcript).toBe(text);
    } finally {
      await live.close();
    }
  });
}
