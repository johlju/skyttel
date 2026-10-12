import type { AssistantObservation } from '../../src/server/assistant-observation.js';
import type { VoiceAssistantResponse } from '../../src/shared/voice-assistant.js';
import type { createInstallation } from '../../tests/support/installation.js';
import catalog from './catalog.json' with { type: 'json' };
import { evaluationEnvironment } from './environment.js';
import { scenarioUtterances, selectFollowUp } from './follow-ups.js';
import {
  concludeAttempt,
  failAttempt,
  lastVoiceActivityAt,
  modelActions,
  observationDiagnostics,
  retainedObservation,
} from './observations.js';
import type { RunOptions } from './runner.js';
import { type ReferenceVoice, referenceSpeech, speechConnection } from './speech.js';
import type { Attempt, JudgeInput, Scenario, ScenarioStep } from './types.js';

/** Keeps ordinary multi-step dialogs connected, closes before the final judge,
 * and starts a second session only after the ordinary summary installation. */
export async function runVoiceScenario(
  scenario: Scenario,
  installationOptions: Parameters<typeof createInstallation>[1],
  options: RunOptions & {
    referenceVoice?: ReferenceVoice;
    maximumSeconds?: number;
    sessionTimeLimit?: () => void;
  },
) {
  // Optional branches must have reviewed, matching audio before opening a paid session.
  if (options.followUps)
    await Promise.all(
      scenarioUtterances(scenario, true).map((step) =>
        referenceSpeech(step.id, step.text, options.referenceVoice),
      ),
    );
  if (
    options.maximumSeconds !== undefined &&
    (!Number.isSafeInteger(options.maximumSeconds) ||
      options.maximumSeconds <= 2 ||
      options.maximumSeconds > 3420)
  )
    throw new Error('evaluation_live_time_limit');
  const events: AssistantObservation[] = [];
  const environment = await evaluationEnvironment(scenario, {
    ...installationOptions,
    observe: (event) => {
      events.push(retainedObservation(event, options.recordObservation));
      installationOptions?.observe?.(event);
    },
  });
  let connection: Awaited<ReturnType<typeof speechConnection>> | undefined;
  let voiceId: string | undefined;
  let blocked: string | undefined;
  const attempts: Attempt[] = [];
  let sessionTimer: ReturnType<typeof setTimeout> | undefined;
  let closing: Promise<void> | undefined;
  let sessionExpired = false;
  const queue: { step: ScenarioStep; parent?: string; startedAt?: number }[] = scenario.steps.map(
    (step) => ({ step }),
  );
  async function closeVoice() {
    clearTimeout(sessionTimer);
    sessionTimer = undefined;
    if (!connection) return closing;
    const active = connection;
    const id = voiceId;
    connection = undefined;
    voiceId = undefined;
    closing = (async () => {
      // Retire media before awaiting HTTP shutdown, including during startup.
      try {
        await active.retire();
      } finally {
        try {
          if (id) await environment.post(`${environment.path}/voice/${id}/stop`, {});
        } finally {
          await active.close();
        }
      }
    })();
    return closing;
  }
  try {
    for (const [index, entry] of queue.entries()) {
      const { step } = entry;
      let continuing = false;
      const result: Attempt = {
        scenario: scenario.id,
        step: step.id,
        profile: options.profile,
        repetition: options.repetition,
        modality: 'voice',
        outcome: 'not_run',
        fixed: [],
        elapsedMs: null,
        backendCostUsd: 0,
        ...(entry.parent ? { followUpFor: entry.parent } : {}),
      };
      const before = options.costs?.() ?? 0;
      const judgeBefore = options.judgeCosts?.() ?? 0;
      const callsBefore = options.providerCalls?.() ?? 0;
      let voiceAttempted = Boolean(voiceId);
      let startedAt = Date.now();
      try {
        if (sessionExpired) throw new Error('evaluation_live_time_limit');
        if (blocked || options.stopped?.()) {
          result.reason = blocked ?? 'Evaluation stopped.';
        } else if (step.transition === 'summary') {
          await closeVoice();
          options.beginStep?.(0, {
            scenario: scenario.id,
            step: step.id,
            modality: 'voice',
            repetition: options.repetition,
          });
          startedAt = Date.now();
          const summary = await environment.installation.summarizeForEvaluation(
            environment.assistant.id,
            catalog.summaryHistory as { role: 'user' | 'assistant'; text: string }[],
          );
          if (!summary.installed || !summary.summary)
            throw new Error('evaluation_summary_installation_failed');
          if (
            summary.retained.length !== 8 ||
            summary.retained.some(
              (row) => !catalog.summaryHistory.some((fixture) => fixture.text === row.text),
            )
          )
            throw new Error('evaluation_summary_tail_invalid');
          result.fixed = await environment.check(step, summary.view, []);
          result.observedEndMs = Date.now() - startedAt;
          result.content = await judge(
            { backend: { text: summary.summary, complete: true } },
            step.expected.requirements,
          );
          concludeAttempt(result, result.observedEndMs);
        } else {
          const reference = await referenceSpeech(step.id, step.text, options.referenceVoice);
          if (!connection) {
            connection = await speechConnection(environment, options.referenceVoice);
            if (options.maximumSeconds !== undefined) {
              // Start before paid dispatch and leave the server's two-second
              // close grace inside the reservation. This also covers judge waits.
              sessionTimer = setTimeout(
                () => {
                  sessionExpired = true;
                  options.sessionTimeLimit?.();
                  void closeVoice().catch(() => {
                    // Final cleanup awaits this same closure and reports its failure.
                  });
                },
                (options.maximumSeconds - 2) * 1000,
              );
            }
            voiceId = await connection.start();
          }
          voiceAttempted = true;
          const offset = events.length;
          options.beginStep?.((reference.clip.frames * 1000) / reference.clip.sampleRate, {
            scenario: scenario.id,
            step: step.id,
            modality: 'voice',
            repetition: options.repetition,
          });
          const playback = connection.play(step.id);
          let playbackError: unknown;
          let audioEnd: number | undefined;
          void playback
            .then((audio) => {
              startedAt = audio.startedAt;
              audioEnd = audio.endedAt;
            })
            .catch((error) => {
              playbackError = error;
            });
          let view = await environment.get<VoiceAssistantResponse['assistant']>(environment.path);
          let stateAt: number | undefined;
          let complete = false;
          let output = '';
          let latestOutput = startedAt;
          let latestEvent = startedAt;
          let fixed: string[] = [];
          // Measure from reference-audio end, including negative completion
          // times. Quiet observation is reported separately.
          for (;;) {
            if (sessionExpired) throw new Error('evaluation_live_time_limit');
            if (options.stopped?.()) throw new Error('evaluation_budget_stopped');
            if (playbackError) throw playbackError;
            const status = await environment.post<VoiceAssistantResponse>(
              `${environment.path}/voice/${voiceId}/poll`,
              {
                revision: view.revision,
                draftVersion: view.review.version,
                contentVersion: view.review.contentVersion,
                microphoneOn: true,
                microphoneActive: audioEnd === undefined,
              },
            );
            view = status.assistant;
            if (view.selection) {
              const displayed =
                view.selection.kind === 'object' && view.selection.id === scenario.selection;
              await environment.post(`${environment.path}/selection`, {
                ...view.selection,
                displayed,
              });
              if (!displayed) result.fixed.push('unexpected_selection');
            }
            const observed = events.slice(offset);
            const outputs = observed.filter(
              (event) =>
                event.kind === 'voice_event' &&
                (event.data as { role?: string }).role === 'assistant',
            );
            output = outputs.map((event) => (event.data as { delta: string }).delta).join('');
            latestOutput = outputs.at(-1)?.at ?? startedAt;
            latestEvent = lastVoiceActivityAt(observed, startedAt);
            const actions = modelActions(observed);
            fixed = await environment.check(step, view, actions);
            if (scenario.selection && view.displayedSelection !== scenario.selection)
              fixed.push('selection_unconfirmed');
            const idle =
              view.phase !== 'working' &&
              !view.queuedMessages &&
              status.voice.phase === 'listening';
            if (!fixed.length && view.phase !== 'working' && !view.queuedMessages)
              stateAt ??= Date.now();
            else stateAt = undefined;
            const quiet =
              audioEnd !== undefined && Date.now() - Math.max(latestEvent, audioEnd) >= 2000;
            if (
              quiet &&
              idle &&
              output &&
              observed.some((event) => event.kind === 'voice_commentary')
            ) {
              complete = true;
              break;
            }
            if (status.voice.error) throw new Error(status.voice.error);
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          const audio = await playback;
          startedAt = audio.endedAt;
          result.fixed.push(...fixed);
          result.observedEndMs = Date.now() - startedAt;
          result.diagnostics = observationDiagnostics(events.slice(offset), startedAt);
          const completionMs =
            stateAt === undefined ? null : Math.max(stateAt, latestOutput) - startedAt;
          if (index === queue.length - 1 && !(options.followUps && step.followUps?.length))
            await closeVoice();
          result.content = await judge(
            {
              backend: { text: [view.reply, view.modelReply].filter(Boolean).join('\n'), complete },
              voice: { text: output, complete },
            },
            step.expected.requirements,
          );
          concludeAttempt(result, completionMs);
          if (entry.startedAt !== undefined)
            result.assistedElapsedMs =
              result.outcome === 'pass' && completionMs !== null
                ? startedAt + completionMs - entry.startedAt
                : null;
          if (options.followUps && !options.stopped?.()) {
            const followUp = await selectFollowUp({
              step,
              attempt: result,
              questionPending: Boolean(view.questionPending),
              sources: {
                backend: {
                  text: [view.reply, view.modelReply].filter(Boolean).join('\n'),
                  complete,
                },
                voice: { text: output, complete },
              },
              checkWaiting: (waiting) =>
                environment.check(step, view, modelActions(events.slice(offset)), waiting),
              judge: options.judge,
            });
            if (followUp && !options.stopped?.()) {
              queue.splice(index + 1, 0, {
                step: {
                  id: followUp.id,
                  text: followUp.text,
                  expected: { requirements: followUp.requirements },
                },
                parent: step.id,
                startedAt,
              });
              continuing = true;
            }
          }
          if (index === queue.length - 1) await closeVoice();
        }
        if (sessionExpired) throw new Error('evaluation_live_time_limit');
        if (options.stopped?.() && !(result.outcome === 'fail' && result.followUpSelection))
          throw new Error(options.stopReason?.() ?? 'evaluation_stopped');
      } catch (error) {
        failAttempt(result, error, Date.now() - startedAt, {
          stopped: options.stopped?.() ?? false,
          reason: options.stopReason?.() ?? null,
          attempted: voiceAttempted || (options.providerCalls?.() ?? 0) > callsBefore,
        });
      }
      const after = options.costs?.();
      result.backendCostUsd = after == null ? null : after - before;
      const judgeAfter = options.judgeCosts?.();
      result.judgeCostUsd = judgeAfter == null ? null : judgeAfter - judgeBefore;
      attempts.push(result);
      await options.record?.(result);
      if (result.outcome !== 'pass' && !continuing) {
        blocked = `${step.id}: ${result.outcome}`;
        await closeVoice();
      }
      async function judge(sources: JudgeInput['sources'], requirements: string[]) {
        if (options.stopped?.()) throw new Error(options.stopReason?.() ?? 'evaluation_stopped');
        if (!requirements.length) return [];
        const input: JudgeInput = {
          context: environment.judgeContext(step, result.fixed),
          sources,
          requirements: Object.keys(sources).flatMap((source) =>
            requirements.map((text, i) => ({
              id: `${source}-${i}`,
              source: source as 'backend' | 'voice',
              text,
            })),
          ),
        };
        return options.judge
          ? options.judge(input)
          : input.requirements.map((item) => ({
              id: item.id,
              outcome: 'inconclusive' as const,
              reason: 'No content judge supplied.',
            }));
      }
    }
    return { attempts, events, finalMap: await environment.read() };
  } finally {
    try {
      await closeVoice();
    } finally {
      await environment.close();
    }
  }
}
