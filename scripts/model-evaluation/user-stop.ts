import { isDeepStrictEqual } from 'node:util';
import type { AssistantObservation } from '../../src/server/assistant-observation.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import type { evaluationEnvironment } from './environment.js';
import { modelActions } from './observations.js';
import type { TimeInterval } from './playback.js';
import type { Attempt, Expected, ScenarioStep } from './types.js';

/** Stop may precede speech, so silence is valid. A damaged or absent capture
 * cannot prove renderer retirement or furnish performance evidence. */
export function validVoiceStopEvidence(attempt: Attempt) {
  const playback = attempt.playback;
  const input = playback?.input;
  const proof = attempt.scriptedStop;
  const bounds = proof?.endpointBounds;
  return Boolean(
    playback?.contract === 'voice-rendered-v1' &&
      !playback.error &&
      !playback.interruption &&
      /^[a-f0-9]{64}$/.test(playback.recordingSha256 ?? '') &&
      Number.isSafeInteger(playback.sampleRate) &&
      (playback.sampleRate ?? 0) > 0 &&
      Number.isSafeInteger(playback.frames) &&
      (playback.frames ?? 0) > 0 &&
      Number.isSafeInteger(playback.firstFrame) &&
      (playback.firstFrame ?? -1) >= 0 &&
      (playback.lastActiveFrame === null ||
        (Number.isSafeInteger(playback.lastActiveFrame) &&
          (playback.lastActiveFrame ?? -1) >= (playback.firstFrame ?? 0) &&
          (playback.lastActiveFrame ?? 0) < (playback.firstFrame ?? 0) + (playback.frames ?? 0))) &&
      input &&
      /^[a-f0-9]{64}$/.test(input.sha256) &&
      Number.isSafeInteger(input.frames) &&
      input.frames > 0 &&
      Number.isSafeInteger(input.speechFrames) &&
      input.speechFrames > 0 &&
      input.speechFrames <= input.frames &&
      Number.isFinite(input.ended.lower) &&
      Number.isFinite(input.ended.upper) &&
      input.ended.lower <= input.ended.upper &&
      Number.isFinite(input.drainedAt) &&
      input.drainedAt <= (proof?.requestedAt ?? -Infinity) &&
      Number.isFinite(proof?.audioQuiescedAt) &&
      bounds &&
      Number.isFinite(bounds.lower) &&
      Number.isFinite(bounds.upper) &&
      bounds.lower >= 0 &&
      bounds.lower <= bounds.upper &&
      bounds.upper === proof?.endpointMs &&
      Math.abs(bounds.upper - bounds.lower - (input.ended.upper - input.ended.lower)) < 0.001,
  );
}

export function validateUserStop(step: ScenarioStep) {
  if (!step.userStop) return;
  if (
    step.transition ||
    !step.text ||
    step.userStop.trigger !== 'first-working-after-input' ||
    !Number.isSafeInteger(step.userStop.maximumObservationMs) ||
    step.userStop.maximumObservationMs < 1 ||
    step.userStop.maximumObservationMs > 10000 ||
    !step.userStop.allowedStates.length ||
    step.userStop.allowedStates.some((state) => state.requirements.length > 0)
  )
    throw new Error('evaluation_user_stop_contract_invalid');
}

export function missedUserStop(): NonNullable<Attempt['scriptedStop']> {
  return {
    contract: 'public-user-stop-v1',
    verdict: 'inconclusive',
    trigger: 'first-working-after-input',
    stateFailures: [],
    endpointMs: null,
    reason: 'working_boundary_missed',
    limitation: 'A completed task cannot establish the declared early Stop boundary.',
  };
}

export function concludeUserStop(
  attempt: Attempt,
  proof: NonNullable<Attempt['scriptedStop']>,
  observedEndMs: number,
) {
  // Text cancellation follows the Stop verdict. Voice also retains observed
  // application cancellation when capture evidence is inconclusive.
  attempt.outcome =
    attempt.modality === 'text'
      ? proof.verdict === 'pass'
        ? 'aborted'
        : proof.verdict
      : proof.verdict === 'fail'
        ? 'fail'
        : proof.terminalStatus === 'canceled'
          ? 'aborted'
          : proof.verdict;
  attempt.fixed = proof.stateFailures;
  attempt.reason = 'evaluation_scripted_user_stop';
  attempt.observedEndMs = observedEndMs;
}

/** Only public conversation controls can stop the app. The finite bound applies
 * to this scripted control observation, never to ordinary model processing.
 * Providers may keep unknown usage after cancellation; this function neither
 * settles charges nor clears the shared ledger stop. */
export async function executeUserStop(input: {
  step: ScenarioStep;
  view: TextAssistantView;
  origin: number | TimeInterval;
  now?: () => number;
  environment: Pick<
    Awaited<ReturnType<typeof evaluationEnvironment>>,
    'post' | 'get' | 'path' | 'check' | 'read'
  >;
  requestId: string;
  events: () => AssistantObservation[];
  quiesceAudio?: () => Promise<void>;
}) {
  validateUserStop(input.step);
  const contract = input.step.userStop;
  if (!contract) throw new Error('evaluation_user_stop_contract_missing');
  const environment = input.environment;
  const status = () =>
    environment.get<TextAssistantView>(`${environment.path}/messages/${input.requestId}`);
  const check = (current: TextAssistantView, expected: Expected) =>
    environment.check(input.step, current, modelActions(input.events()), expected);
  const now = input.now ?? Date.now;
  const proof = missedUserStop();
  delete proof.reason;
  proof.requestedAt = now();
  proof.pendingAtStop = {
    batch: Boolean(input.view.batchPending),
    save: Boolean(input.view.saving),
    operationIds: input.view.operations.map((operation) => operation.operationId),
  };
  proof.limitation =
    'First observed working status after full input drain; polling can race with completed authorized batches. Only enumerated whole states are allowed. Provider settlement is observed, never inferred from cancellation; unknown billing retains its ledger hold. Renderer retirement establishes this instrumented output is closed, not physical audibility.';
  let view = await environment.post<TextAssistantView>(`${environment.path}/cancel`, {
    revision: input.view.revision,
    contextRevision: input.view.contextRevision,
    all: true,
  });
  proof.acknowledgedAt = now();
  const acknowledgedEvents = input.events();
  const acknowledgmentOffset = acknowledgedEvents.length;
  const isMutation = (event: AssistantObservation) =>
    event.kind === 'mcp_started' && !/^(read_|search_)/.test((event.data as { name: string }).name);
  const recordLateWork = () => {
    const lateWork = input
      .events()
      .slice(acknowledgmentOffset)
      .some(
        (event) =>
          Boolean(event.taskId) &&
          (isMutation(event) ||
            (event.kind === 'model_attempt' &&
              (event.data as { endedAt?: string | null }).endedAt == null)),
      );
    if (lateWork && !proof.stateFailures.includes('new_task_work_after_stop_acknowledgment'))
      proof.stateFailures.push('new_task_work_after_stop_acknowledgment');
  };
  proof.admittedMutationSpans = acknowledgedEvents.filter(isMutation).map((event) => ({
    spanId: event.context?.toolExecutionId ?? event.context?.spanId ?? null,
    tool: (event.data as { name: string }).name,
    endedBeforeAcknowledgment: acknowledgedEvents.some(
      (end) =>
        Boolean(event.context?.spanId) &&
        end.context?.spanId === event.context?.spanId &&
        ['mcp_completed', 'mcp_failed'].includes(end.kind),
    ),
  }));
  proof.pendingAtAcknowledgment = { batch: Boolean(view.batchPending), save: Boolean(view.saving) };
  const acknowledgedState = await environment.read();
  proof.stateCapturedAt = now();
  if (input.quiesceAudio) {
    await input.quiesceAudio();
    proof.audioQuiescedAt = now();
  }
  const deadline = proof.requestedAt + contract.maximumObservationMs;
  for (;;) {
    view = await status();
    proof.terminalStatus = view.taskStatus;
    if (view.taskStatus === 'canceled') proof.terminalAt ??= now();
    const attempts = new Map<string, boolean>();
    for (const event of input.events()) {
      if (event.kind !== 'model_attempt') continue;
      const data = event.data as { attemptId?: string; endedAt?: string | null };
      if (data.attemptId) attempts.set(data.attemptId, data.endedAt != null);
    }
    recordLateWork();
    if (
      proof.terminalAt &&
      !view.saving &&
      !view.batchPending &&
      [...attempts.values()].every(Boolean)
    ) {
      proof.settledAt = now();
      break;
    }
    if (now() >= deadline) {
      proof.reason = 'stop_endpoint_observation_incomplete';
      if (proof.stateFailures.length) proof.verdict = 'fail';
      return { proof, view };
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const checks = await Promise.all(contract.allowedStates.map((expected) => check(view, expected)));
  const matched = checks.findIndex((failures) => failures.length === 0);
  if (matched < 0) {
    proof.verdict = 'fail';
    proof.stateFailures = [...new Set([...proof.stateFailures, ...checks.flat()])];
    proof.reason = 'stop_state_outside_declared_atomic_outcomes';
  } else {
    proof.matchedState = matched;
    // A final independent public read after provider termination must preserve
    // that exact allowed endpoint; a late result cannot choose a different one.
    view = await status();
    proof.stateFailures.push(...(await check(view, contract.allowedStates[matched])));
    const finalState = await environment.read();
    recordLateWork();
    if (!isDeepStrictEqual(finalState, acknowledgedState)) {
      if (proof.pendingAtAcknowledgment.batch || proof.pendingAtAcknowledgment.save) {
        proof.reason = 'registered_outcome_attribution_incomplete';
      } else proof.stateFailures.push('state_changed_after_stop_acknowledgment');
    }
    if (!view.canceled || view.queuedMessages || view.taskStatus !== 'canceled')
      proof.stateFailures.push('stop_not_terminal_or_queue_not_empty');
    proof.verdict = proof.stateFailures.length ? 'fail' : proof.reason ? 'inconclusive' : 'pass';
    proof.settledAt = now();
    if (proof.verdict === 'pass') {
      const end = Math.max(
        proof.settledAt,
        proof.acknowledgedAt,
        proof.terminalAt ?? 0,
        proof.audioQuiescedAt ?? 0,
      );
      const origin =
        typeof input.origin === 'number'
          ? { lower: input.origin, upper: input.origin }
          : input.origin;
      proof.endpointBounds = {
        lower: Math.max(0, end - origin.upper),
        upper: Math.max(0, end - origin.lower),
      };
      proof.endpointMs = proof.endpointBounds.upper;
      proof.controlMs = Math.max(0, end - proof.requestedAt);
    }
  }
  return { proof, view };
}
