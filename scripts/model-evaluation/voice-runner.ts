import type { AssistantObservation } from '../../src/server/assistant-observation.js';
import type { VoiceAssistantResponse } from '../../src/shared/voice-assistant.js';
import type { createInstallation } from '../../tests/support/installation.js';
import { assessInability } from './assessment.js';
import { scenarioHistory } from './catalog.js';
import { evaluationEnvironment } from './environment.js';
import {
  assistedExchangeTiming,
  followUpStep,
  type ScenarioExchange,
  scenarioUtterances,
  selectFollowUp,
} from './follow-ups.js';
import { evaluationMetrics } from './metrics.js';
import {
  concludeAttempt,
  failAttempt,
  lastVoiceActivityAt,
  modelActions,
  observationDiagnostics,
  retainedObservation,
} from './observations.js';
import {
  outputRecordingWorklet,
  type PlaybackRecognition,
  type PlaybackRecording,
  renderedResponseEnd,
  renderedResponseRequirement,
  renderedUsefulRequirement,
  voicePlaybackInstrumentation,
} from './playback.js';
import {
  checkedContentVerdicts,
  contentRequirements,
  retainWaitingTiming,
} from './retained-work.js';
import type { RunOptions } from './runner.js';
import {
  type ReferenceVoice,
  referenceSpeech,
  type SourcePlayback,
  speechConnection,
} from './speech.js';
import type { Attempt, JudgeInput, JudgeResult, Scenario } from './types.js';
import {
  concludeUserStop,
  executeUserStop,
  missedUserStop,
  validateUserStop,
  validVoiceStopEvidence,
} from './user-stop.js';

type PlaybackEvidence = NonNullable<Attempt['playback']>;
type StateObserver = (status: VoiceAssistantResponse) => Promise<void>;

function inputEvidence(audio: SourcePlayback): NonNullable<PlaybackEvidence['input']> {
  return {
    sha256: audio.sha256,
    frames: audio.frames,
    speechFrames: audio.speechFrames,
    drainedAt: audio.drainedAt,
    sampleRate: audio.sampleRate,
    sourceStartPosition: audio.sourceStartPosition,
    speechPosition: audio.speechPosition,
    ended: audio.ended,
    started: audio.started,
  };
}

function recordingEvidence(
  recording: PlaybackRecording,
): Pick<
  PlaybackEvidence,
  | 'recordingSha256'
  | 'sampleRate'
  | 'frames'
  | 'firstFrame'
  | 'lastActiveFrame'
  | 'interruption'
  | 'error'
> {
  return {
    recordingSha256: recording.sha256,
    sampleRate: recording.sampleRate,
    frames: recording.frames,
    firstFrame: recording.firstFrame,
    lastActiveFrame: recording.lastActiveFrame,
    interruption: recording.interruption,
    error: recording.error,
  };
}

const firstUsefulLimitation =
  'Conservative rendered end of the first sampled independently useful candidate, not word onset. Earlier inconclusive candidates leave firstUsefulMs unknown. Status and receipt timestamps are excluded; usefulness does not imply whole-task success.';

/** Keeps ordinary multi-step dialogs connected, closes before the final judge,
 * and starts a second session only after the ordinary summary installation. */
export async function runVoiceScenario(
  scenario: Scenario,
  installationOptions: Parameters<typeof createInstallation>[1],
  options: RunOptions & {
    referenceVoice?: ReferenceVoice;
    maximumSeconds?: number;
    sessionTimeLimit?: () => void;
    assessPlayback?: (recording: PlaybackRecording) => Promise<PlaybackRecognition>;
    maximumPlaybackCandidates?: number;
    recordPlayback?: (recording: PlaybackRecording) => void;
    recordInput?: (input: SourcePlayback) => void;
    playbackReady?: (connection: Awaited<ReturnType<typeof speechConnection>>) => void;
  },
) {
  scenario.steps.forEach(validateUserStop);
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
  const environment = await evaluationEnvironment(
    scenario,
    {
      ...installationOptions,
      deliverResponse: (request, response) =>
        new URL(request.url).pathname === '/__evaluation_output.js'
          ? new Response(outputRecordingWorklet, {
              headers: { 'Content-Type': 'application/javascript' },
            })
          : (installationOptions?.deliverResponse?.(request, response) ?? response),
      observe: (event) => {
        events.push(retainedObservation(event, options.recordObservation));
        installationOptions?.observe?.(event);
      },
    },
    options.application,
  );
  let connection: Awaited<ReturnType<typeof speechConnection>> | undefined;
  let voiceId: string | undefined;
  let blocked: string | undefined;
  const attempts: Attempt[] = [];
  let sessionTimer: ReturnType<typeof setTimeout> | undefined;
  let closing: Promise<void> | undefined;
  let sessionExpired = false;
  const queue: ScenarioExchange[] = scenario.steps.map((step) => ({ step }));
  async function judgeWithHeartbeat(
    input: JudgeInput,
    retain?: (result: JudgeResult) => void,
    observeState?: StateObserver,
  ) {
    const judge = options.judge;
    if (!judge) throw new Error('evaluation_judge_missing');
    return withHeartbeat(async () => {
      const result = await judge(input);
      // Completed evidence survives a pending heartbeat failure; that failure
      // still propagates before any task-success or follow-up decision.
      retain?.(result);
      return result;
    }, observeState);
  }
  async function withHeartbeat<T>(
    work: () => Promise<T>,
    observeState?: StateObserver,
  ): Promise<T> {
    const id = voiceId;
    if (!id) return work();
    let pending = Promise.resolve();
    let polling = false;
    let failure: unknown;
    // The browser remains present while scoring; this is liveness, not a
    // processing deadline. Finish each poll before playing the next input.
    const timer = setInterval(
      () => {
        if (polling || failure || id !== voiceId) return;
        polling = true;
        pending = (async () => {
          const view = await environment.get<VoiceAssistantResponse['assistant']>(environment.path);
          if (id !== voiceId) return;
          const status = await environment.post<VoiceAssistantResponse>(
            `${environment.path}/voice/${id}/poll`,
            {
              revision: view.revision,
              draftVersion: view.review.version,
              contentVersion: view.review.contentVersion,
              microphoneOn: true,
              microphoneActive: false,
            },
          );
          if (status.voice.error) throw new Error(status.voice.error);
          await observeState?.(status);
        })()
          .catch((error) => {
            failure = error;
          })
          .finally(() => {
            polling = false;
          });
      },
      observeState ? voicePlaybackInstrumentation.stateObservation.cadenceMs : 1000,
    );
    try {
      const result = await work();
      await pending;
      if (failure) throw failure;
      return result;
    } finally {
      clearInterval(timer);
      await pending;
    }
  }
  async function closeVoice(force = false) {
    clearTimeout(sessionTimer);
    sessionTimer = undefined;
    if (!connection) return closing;
    const active = connection;
    const id = voiceId;
    connection = undefined;
    voiceId = undefined;
    closing = (async () => {
      // Normal shutdown keeps the primary connection alive while the server
      // drains session.closed and final usage. Cancellation retires it first.
      try {
        try {
          if (force) await active.retire();
        } finally {
          if (id) await environment.post(`${environment.path}/voice/${id}/stop`, {});
        }
      } finally {
        try {
          if (!force) await active.retire();
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
        group: scenario.group ?? 'everyday',
        step: step.id,
        profile: options.profile,
        repetition: options.repetition,
        modality: 'voice',
        outcome: 'not_run',
        fixed: [],
        elapsedMs: null,
        backendCostUsd: 0,
        comparisonContract: options.comparisonContract,
        ...(environment.application
          ? {
              applicationVersion: environment.application.id,
              applicationCommit: environment.application.commit,
            }
          : {}),
        ...(entry.parent ? { followUpFor: entry.parent } : {}),
      };
      const before = options.costs?.() ?? 0;
      const judgeBefore = options.judgeCosts?.() ?? 0;
      const callsBefore = options.providerCalls?.() ?? 0;
      const recordIds = new Set(options.providerRecords?.().map((call) => call.id) ?? []);
      const eventOffset = events.length;
      let voiceAttempted = Boolean(voiceId);
      let startedAt = Date.now();
      let recognizedRequest: string | undefined;
      let partialChecks: string[] = [];
      let playbackAssessmentElapsedMs: number | undefined;
      const playbackRecognitionCosts: (number | null)[] = [];
      const playbackRecognitionEstimates: (number | null)[] = [];
      let observeState: StateObserver | undefined;
      async function measurePlaybackAssessment<T>(work: () => Promise<T>): Promise<T> {
        const began = Date.now();
        try {
          return await work();
        } finally {
          playbackAssessmentElapsedMs = (playbackAssessmentElapsedMs ?? 0) + Date.now() - began;
        }
      }
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
          const history = scenarioHistory(scenario);
          const summary = await environment.installation.summarizeForEvaluation(
            environment.assistant.id,
            history,
          );
          if (!summary.installed || !summary.summary)
            throw new Error('evaluation_summary_installation_failed');
          if (
            summary.retained.length !== 8 ||
            summary.retained.some(
              (row, index) =>
                row.text !== history.at(index - 8)?.text ||
                row.role !== history.at(index - 8)?.role,
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
          result.timing = {
            contract: 'summary-execution-v1',
            submittedAt: startedAt,
            queueMs: null,
            firstResponseMs: null,
            firstUsefulMs: null,
            observedResponseEndMs: result.observedEndMs,
            successfulCompletionMs: result.elapsedMs,
          };
          // This times the summary operation, which submits no user request.
          // Retention above does not certify completion of earlier pending work.
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
                  void closeVoice(true).catch(() => {
                    // Final cleanup awaits this same closure and reports its failure.
                  });
                },
                (options.maximumSeconds - 2) * 1000,
              );
            }
            voiceId = await connection.start();
            options.playbackReady?.(connection);
          }
          voiceAttempted = true;
          const offset = events.length;
          options.beginStep?.((reference.clip.frames * 1000) / reference.clip.sampleRate, {
            scenario: scenario.id,
            step: step.id,
            modality: 'voice',
            repetition: options.repetition,
            applicationVersion: environment.application?.id,
          });
          const playback = connection.play(step.id);
          let playbackError: unknown;
          let audioEnd: number | undefined;
          void playback
            .then((audio) => {
              options.recordInput?.(audio);
              startedAt = audio.endedAt;
              audioEnd = audio.endedAt;
              result.timing = {
                contract: 'voice-rendered-v1',
                submittedAt: audio.endedAt,
                queueMs: null,
                firstResponseMs: null,
                firstUsefulMs: null,
                firstUsefulLimitation,
                observedResponseEndMs: null,
                successfulCompletionMs: null,
              };
              if (result.playback) result.playback.input = inputEvidence(audio);
            })
            .catch((error) => {
              playbackError = error;
            });
          let view = await environment.get<VoiceAssistantResponse['assistant']>(environment.path);
          let stateAt: number | undefined;
          let complete = false;
          let output = '';
          let latestEvent = startedAt;
          let fixed: string[] = [];
          let stateFailures: string[] = [];
          let renderedEnd: ReturnType<typeof renderedResponseEnd> = null;
          let assessedOutput = '';
          let lastAssessedFrame: number | null = null;
          let candidateCount = 0;
          let nextRecordingAt = 0;
          let usefulnessUncertain = false;
          result.playback = {
            contract: 'voice-rendered-v1',
            candidates: [],
            limitation:
              'Single negotiated WebRTC stream through one common WebAudio output graph. Device timestamps bracket rendered frames; ASR/semantic assessment is uncertain, not sample-exact or a physical audibility guarantee. Exact digital input trailing zeros are excluded. Useful time is a sampled conservative upper bound, not word onset.',
          };
          const active = connection;
          observeState = async (status) => {
            view = status.assistant;
            if (status.voice.error) throw new Error(status.voice.error);
            if (view.taskStatus === 'canceled' || view.taskStatus === 'expired')
              throw new Error(`evaluation_application_${view.taskStatus}`);
            if (view.selection) {
              const displayed =
                view.selection.kind === 'object' && view.selection.id === scenario.selection;
              await environment.post(`${environment.path}/selection`, {
                ...view.selection,
                displayed,
              });
              if (!displayed) result.fixed.push('unexpected_selection');
            }
            stateFailures = await environment.check(
              entry.target ?? step,
              view,
              modelActions(events.slice(offset)),
            );
            fixed = [...stateFailures];
            if (scenario.selection && view.displayedSelection !== scenario.selection)
              fixed.push('selection_unconfirmed');
            partialChecks = fixed;
            // Keep the first still-valid observation on the same browser clock
            // as rendered audio, including while offline assessment is pending.
            if (!fixed.length && view.phase !== 'working' && !view.queuedMessages)
              stateAt ??= await active.observedAt();
            else stateAt = undefined;
          };
          async function verifyState() {
            const status = await environment.post<VoiceAssistantResponse>(
              `${environment.path}/voice/${voiceId}/poll`,
              {
                revision: view.revision,
                draftVersion: view.review.version,
                contentVersion: view.review.contentVersion,
                microphoneOn: true,
                microphoneActive: false,
              },
            );
            await observeState?.(status);
            return status;
          }
          async function judgeCurrentContent(voiceText: string, completed: boolean) {
            const fixedBeforeJudge = new Set(fixed);
            result.fixed.push(...fixed);
            result.content = await judge(
              {
                backend: {
                  text: [view.reply, view.modelReply].filter(Boolean).join('\n'),
                  complete: completed,
                },
                voice: { text: voiceText, complete: completed },
              },
              step.expected.requirements,
            );
            if (completed) {
              const verified = await verifyState();
              if (verified.voice.phase !== 'listening') stateAt = undefined;
            }
            // Refresh current state without dropping independent failures
            // observed during judgment, such as an unexpected selection.
            result.fixed = [
              ...result.fixed.filter((failure) => !fixedBeforeJudge.has(failure)),
              ...fixed,
            ];
          }
          // Quiet finds candidates. Only independently assessed recording and
          // device-render evidence can certify the required response.
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
            await observeState(status);
            if (step.userStop && audioEnd !== undefined) {
              const request = events
                .slice(offset)
                .findLast((event) => event.kind === 'backend_request');
              const correlatedRequest = (request?.data as { requestId?: string } | undefined)
                ?.requestId;
              const task = view.tasks?.find((entry) => entry.id === correlatedRequest);
              if (
                task?.status === 'working' &&
                view.taskSource === 'voice' &&
                view.taskId === correlatedRequest &&
                correlatedRequest
              ) {
                const stoppedRequest = correlatedRequest;
                try {
                  const recording = await connection.recording();
                  options.recordPlayback?.(recording);
                  Object.assign(result.playback, recordingEvidence(recording));
                } catch (error) {
                  result.playback.error = error instanceof Error ? error.message : String(error);
                }
                const stopped = await executeUserStop({
                  step,
                  view,
                  origin: result.playback.input?.ended ?? startedAt,
                  environment,
                  requestId: stoppedRequest,
                  events: () => events.slice(offset),
                  quiesceAudio: () => closeVoice(true),
                });
                result.scriptedStop = stopped.proof;
                if (stopped.proof.verdict === 'pass' && !validVoiceStopEvidence(result)) {
                  stopped.proof.verdict = 'inconclusive';
                  stopped.proof.reason = 'voice_stop_capture_incomplete';
                  stopped.proof.endpointMs = null;
                  delete stopped.proof.endpointBounds;
                }
                throw new Error('evaluation_scripted_user_stop');
              }
              if (task?.status === 'completed') {
                result.scriptedStop = missedUserStop();
                throw new Error('evaluation_scripted_user_stop');
              }
            }
            const observed = events.slice(offset);
            recognizedRequest =
              observed
                .filter((event) => event.kind === 'voice_event')
                .map((event) => {
                  const data = event.data as {
                    event?: { role?: string; delta?: string };
                    role?: string;
                    delta?: string;
                  };
                  return data.event ?? data;
                })
                .filter((data) => data.role === 'user')
                .map((data) => data.delta ?? '')
                .join('') || undefined;
            const outputs = observed.filter(
              (event) =>
                event.kind === 'voice_event' &&
                (event.data as { role?: string }).role === 'assistant',
            );
            output = outputs.map((event) => (event.data as { delta: string }).delta).join('');
            latestEvent = lastVoiceActivityAt(observed, startedAt);
            const idle =
              view.phase !== 'working' &&
              !view.queuedMessages &&
              status.voice.phase === 'listening';
            const quiet =
              audioEnd !== undefined && Date.now() - Math.max(latestEvent, audioEnd) >= 2000;
            if (
              quiet &&
              idle &&
              output &&
              observed.some((event) => event.kind === 'voice_commentary') &&
              Date.now() >= nextRecordingAt
            ) {
              nextRecordingAt = Date.now() + 500;
              const assessPlayback = options.assessPlayback;
              if (!assessPlayback) {
                result.reason = 'Independent rendered-recording assessor not supplied.';
                break;
              }
              const recording = await connection.recording();
              options.recordPlayback?.(recording);
              Object.assign(result.playback, recordingEvidence(recording));
              if (recording.interruption || recording.error) {
                result.reason = recording.interruption ?? recording.error;
                break;
              }
              const lastActivity = recording.lastActiveFrame;
              const device = recording.clocks.at(-1);
              if (
                lastActivity !== null &&
                lastActivity !== lastAssessedFrame &&
                device &&
                device.position - lastActivity / recording.sampleRate >= 0.5
              ) {
                if (++candidateCount > (options.maximumPlaybackCandidates ?? 8)) {
                  result.reason = 'Rendered-recording candidate limit reached.';
                  break;
                }
                lastAssessedFrame = lastActivity;
                const candidates = result.playback.candidates;
                // A started recognition has unknown cost until it returns,
                // independently of heartbeat and semantic completion.
                const costIndex = playbackRecognitionCosts.push(null) - 1;
                playbackRecognitionEstimates.push(null);
                const { recognition, candidate } = await measurePlaybackAssessment(() =>
                  withHeartbeat(async () => {
                    const recognition = await assessPlayback(recording);
                    playbackRecognitionCosts[costIndex] = recognition.costUsd;
                    playbackRecognitionEstimates[costIndex] = recognition.estimatedCostUsd ?? null;
                    const candidate: PlaybackEvidence['candidates'][number] = {
                      callId: recognition.callId,
                      profile: recognition.profile,
                      outcome: recognition.outcome,
                      costUsd: recognition.costUsd,
                      ...(recognition.estimatedCostUsd !== undefined
                        ? { estimatedCostUsd: recognition.estimatedCostUsd }
                        : {}),
                      recordingSha256: recording.sha256,
                      alignmentMarginMs: recognition.alignmentMarginMs,
                      lastWordEndSeconds: recognition.lastWordEndSeconds,
                    };
                    // Completed recognition is evidence even if the pending
                    // heartbeat fails before semantic assessment can begin.
                    candidates.push(candidate);
                    return { recognition, candidate };
                  }, observeState),
                );
                const end = renderedResponseEnd(recording, recognition);
                if (!end) {
                  result.reason = recognition.reason ?? 'Rendered response boundary is unverified.';
                  break;
                }
                candidate.renderedEnd = end;
                const retainAssessment = (assessments: JudgeResult) => {
                  candidate.requiredResponse = assessments.filter(
                    (item) => item.id === 'voice-rendered-response',
                  );
                  const useful = assessments.filter((item) => item.id === 'voice-rendered-useful');
                  candidate.usefulContent = useful;
                  if (result.timing && result.timing.firstVerifiedUsefulMs == null) {
                    if (useful.length === 1 && useful[0].outcome === 'pass') {
                      result.timing.firstVerifiedUsefulMs = Math.max(0, end.upper - startedAt);
                      if (!usefulnessUncertain)
                        result.timing.firstUsefulMs = result.timing.firstVerifiedUsefulMs;
                    } else if (useful.length !== 1 || useful[0].outcome === 'inconclusive')
                      usefulnessUncertain = true;
                  }
                };
                if (options.judge)
                  await measurePlaybackAssessment(() =>
                    judgeWithHeartbeat(
                      {
                        context: environment.judgeContext(step, fixed, '', recognizedRequest),
                        sources: { voice: { text: recognition.text, complete: false } },
                        requirements: [
                          {
                            id: 'voice-rendered-response',
                            source: 'voice',
                            text: renderedResponseRequirement,
                          },
                          {
                            id: 'voice-rendered-useful',
                            source: 'voice',
                            text: renderedUsefulRequirement,
                          },
                        ],
                      },
                      retainAssessment,
                      observeState,
                    ),
                  );
                else retainAssessment([]);
                const requiredResponse = candidate.requiredResponse ?? [];
                const current = await connection.recording();
                options.recordPlayback?.(current);
                // Offline assessment cannot hide a tail that arrived while it
                // ran. Its wall time is never the measured user completion.
                if (current.lastActiveFrame !== lastActivity) continue;
                if (current.interruption || current.error) {
                  result.playback.interruption = current.interruption;
                  result.playback.error = current.error;
                  result.reason = current.interruption ?? current.error;
                  break;
                }
                if (
                  requiredResponse.length === 1 &&
                  requiredResponse[0].id === 'voice-rendered-response' &&
                  requiredResponse[0].outcome === 'pass'
                ) {
                  const verified = await verifyState();
                  if (
                    view.phase === 'working' ||
                    view.queuedMessages ||
                    verified.voice.phase !== 'listening'
                  ) {
                    result.reason =
                      'Application changed while the recording was assessed; final response remains unverified.';
                    break;
                  }
                  await judgeCurrentContent(recognition.text, true);
                  const finalRecording = await active.recording();
                  options.recordPlayback?.(finalRecording);
                  if (finalRecording.interruption || finalRecording.error) {
                    Object.assign(result.playback, recordingEvidence(finalRecording));
                    throw new Error(finalRecording.interruption ?? finalRecording.error);
                  }
                  // Content judgment is offline work too. New rendered audio
                  // must pass recognition and both semantic checks before its
                  // recording, response boundary or final content can qualify.
                  if (finalRecording.lastActiveFrame !== lastActivity) continue;
                  renderedEnd = end;
                  assessedOutput = recognition.text;
                  result.playback.renderedEnd = end;
                  complete = true;
                  break;
                }
              }
            }
            await new Promise((resolve) =>
              setTimeout(resolve, voicePlaybackInstrumentation.stateObservation.cadenceMs),
            );
          }
          const audio = await playback;
          startedAt = audio.endedAt;
          result.playback.input = inputEvidence(audio);
          output = assessedOutput;
          if (!complete) await judgeCurrentContent(output, false);
          result.observedEndMs = (await connection.observedAt()) - startedAt;
          result.diagnostics = observationDiagnostics(events.slice(offset), startedAt);
          const completionMs =
            stateAt === undefined || !renderedEnd
              ? null
              : Math.max(0, Math.max(stateAt, renderedEnd.upper) - startedAt);
          observeState = undefined;
          concludeAttempt(result, completionMs);
          result.timing = {
            contract: 'voice-rendered-v1',
            submittedAt: startedAt,
            queueMs: null,
            firstResponseMs: null,
            firstUsefulMs: result.timing?.firstUsefulMs ?? null,
            firstVerifiedUsefulMs: result.timing?.firstVerifiedUsefulMs ?? null,
            firstUsefulLimitation,
            observedResponseEndMs: renderedEnd ? renderedEnd.upper - startedAt : null,
            successfulCompletionMs: result.elapsedMs,
          };
          Object.assign(
            result,
            assistedExchangeTiming(entry, {
              submittedAt: audio.startedAt,
              completedAt: completionMs === null ? renderedEnd?.upper : startedAt + completionMs,
              outcome: result.outcome,
            }),
          );
          // A completed voice handoff can clear view.taskId before final polling.
          // Keep the authenticated delegations accepted during this utterance.
          const requestIds = [
            ...(entry.requestIds ?? []),
            ...events
              .slice(offset)
              .filter((event) => event.kind === 'backend_request')
              .map((event) => (event.data as { requestId: string }).requestId),
          ];
          retainWaitingTiming(
            result,
            (entry.target ?? step).expected,
            view.pendingParts,
            requestIds,
          );
          if (!options.stopped?.()) {
            const followUp = await selectFollowUp({
              step,
              attempt: result,
              stateFailures,
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
              waitingContext: () => environment.judgeContext(step, [], '', recognizedRequest),
              judge: options.judge ? judgeWithHeartbeat : undefined,
              repliesEnabled: options.followUps ?? false,
            });
            if (followUp && !options.stopped?.()) {
              queue.splice(index + 1, 0, {
                step: followUpStep(step, followUp),
                parent: step.id,
                target: step,
                requestIds,
                startedAt: entry.startedAt ?? startedAt,
                previousResponseEndAt: renderedEnd?.upper,
                evaluationOverheadMs: result.assistedEvaluationOverheadMs ?? 0,
              });
              continuing = true;
            }
          }
          await assessInability({
            scenario,
            step,
            attempt: result,
            sources: {
              backend: { text: [view.reply, view.modelReply].filter(Boolean).join('\n'), complete },
              voice: { text: output, complete },
            },
            check: (expected) =>
              environment.check(
                entry.target ?? step,
                view,
                modelActions(events.slice(offset)),
                expected,
              ),
            context: () =>
              environment.judgeContext(entry.target ?? step, result.fixed, '', recognizedRequest) +
              (entry.parent ? `\nCurrent clarification: ${JSON.stringify(step.text)}` : ''),
            judge: options.judge ? judgeWithHeartbeat : undefined,
          });
          if (index === queue.length - 1) await closeVoice();
        }
        if (sessionExpired) throw new Error('evaluation_live_time_limit');
        // Optional judgments cannot erase the application's completed verdict.
        // The stopped state still prevents every later step from starting.
        if (
          options.stopped?.() &&
          !(
            ['pass', 'fail'].includes(result.outcome) &&
            (result.followUpSelection || result.assessment)
          )
        )
          throw new Error(options.stopReason?.() ?? 'evaluation_stopped');
      } catch (error) {
        if (connection && result.playback) {
          try {
            const recording = await connection.recording();
            options.recordPlayback?.(recording);
            Object.assign(result.playback, recordingEvidence(recording));
          } catch {
            result.playback.error ??= 'Partial rendered recording unavailable after failure.';
          }
        }
        const partial = [...new Set([...result.fixed, ...partialChecks])];
        if (result.scriptedStop) {
          concludeUserStop(result, result.scriptedStop, Date.now() - startedAt);
        } else if (
          error instanceof Error &&
          ['evaluation_application_canceled', 'evaluation_application_expired'].includes(
            error.message,
          )
        ) {
          result.outcome =
            error.message === 'evaluation_application_canceled' ? 'aborted' : 'error';
          result.reason = error.message;
          result.observedEndMs = Date.now() - startedAt;
        } else
          failAttempt(result, error, Date.now() - startedAt, {
            stopped: options.stopped?.() ?? false,
            reason: options.stopReason?.() ?? null,
            attempted: voiceAttempted || (options.providerCalls?.() ?? 0) > callsBefore,
          });
        if (!result.scriptedStop) result.fixed = partial;
        result.elapsedMs = null;
        if (result.timing) result.timing.successfulCompletionMs = null;
      }
      const after = options.costs?.();
      result.backendCostUsd = after == null ? null : after - before;
      const judgeAfter = options.judgeCosts?.();
      result.judgeCostUsd = judgeAfter == null ? null : judgeAfter - judgeBefore;
      result.providerCalls = options.providerCalls
        ? options.providerCalls() - callsBefore
        : undefined;
      const observed = events.slice(eventOffset);
      result.diagnostics ??= observationDiagnostics(observed, startedAt);
      result.metrics = evaluationMetrics(
        options.providerRecords?.().filter((call) => !recordIds.has(call.id)),
        observed,
      );
      result.playbackAssessmentCostUsd = result.playback
        ? playbackRecognitionCosts.some((cost) => cost === null)
          ? null
          : playbackRecognitionCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0)
        : 0;
      result.playbackAssessmentElapsedMs = playbackAssessmentElapsedMs;
      if (!playbackRecognitionEstimates.length) result.estimatedPlaybackAssessmentCostUsd = 0;
      else if (playbackRecognitionEstimates.some((cost) => cost !== null))
        result.estimatedPlaybackAssessmentCostUsd = playbackRecognitionEstimates.some(
          (cost) => cost === null,
        )
          ? null
          : playbackRecognitionEstimates.reduce<number>((sum, cost) => sum + (cost ?? 0), 0);
      if (result.timing) {
        const request = observed.find((event) => event.kind === 'backend_request');
        const requestId = (request?.data as { requestId?: string } | undefined)?.requestId;
        const task = observed.find(
          (event) => event.kind === 'task_started' && event.taskId === requestId,
        );
        result.timing.queueMs = request && task ? Math.max(0, task.at - request.at) : null;
      }
      attempts.push(result);
      await options.record?.(result);
      if ((result.outcome !== 'pass' || result.elapsedMs === null) && !continuing) {
        blocked = `${step.id}: ${result.outcome === 'pass' ? 'unfinished' : result.outcome}`;
        await closeVoice(result.outcome === 'error' || result.outcome === 'aborted');
      }
      async function judge(sources: JudgeInput['sources'], requirements: string[]) {
        if (options.stopped?.()) throw new Error(options.stopReason?.() ?? 'evaluation_stopped');
        const declared = contentRequirements(
          sources,
          requirements,
          (entry.target ?? step).expected,
          environment.stateEvidence(),
        );
        if (!declared.length) return [];
        const input: JudgeInput = {
          context: environment.judgeContext(step, result.fixed, '', recognizedRequest),
          sources,
          requirements: declared,
        };
        const verdicts = options.judge
          ? await judgeWithHeartbeat(input, undefined, observeState)
          : input.requirements.map((item) => ({
              id: item.id,
              outcome: 'inconclusive' as const,
              reason: 'No content judge supplied.',
            }));
        return checkedContentVerdicts(declared, verdicts);
      }
    }
    return { attempts, events, finalMap: await environment.read() };
  } finally {
    try {
      await closeVoice(true);
    } finally {
      await environment.close();
    }
  }
}
