import type { TimeInterval } from './playback.js';
import type { Attempt } from './types.js';

const interval = (value: TimeInterval | undefined | null): value is TimeInterval =>
  Boolean(
    value &&
      Number.isFinite(value.lower) &&
      Number.isFinite(value.upper) &&
      value.lower <= value.upper,
  );
const sum = (values: TimeInterval[]): TimeInterval => ({
  lower: values.reduce((total, value) => total + value.lower, 0),
  upper: values.reduce((total, value) => total + value.upper, 0),
});

export type ScriptedDialogTiming = {
  contract: 'scripted-dialog-wait-v1';
  status: 'complete' | 'inconclusive';
  endpointMs: number | null;
  wallMs: TimeInterval | null;
  harnessGapMs: TimeInterval | null;
  replyInputMs: TimeInterval | null;
  applicationWaitMs: TimeInterval | null;
  cumulativeResponseWaitMs: number | null;
  harnessGaps: { from: string; to: string; bounds: TimeInterval }[];
  reason?: string;
  limitation: string;
};

/** The first input boundary through the final verified state/whole response.
 * Every excluded gap is measured between a completed response and the next
 * scripted input's start. Later spoken input therefore remains inside wait.
 * Interval arithmetic retains device uncertainty; the upper application-wait
 * bound is the conservative reported endpoint. No timing is reconstructed
 * from token counts, sample counts or a sum of response durations. */
export function scriptedDialogTiming(
  attempts: Attempt[],
  verifiedQuestions: readonly Attempt[] = [],
): ScriptedDialogTiming {
  const result: ScriptedDialogTiming = {
    contract: 'scripted-dialog-wait-v1',
    status: 'inconclusive',
    endpointMs: null,
    wallMs: null,
    harnessGapMs: null,
    replyInputMs: null,
    applicationWaitMs: null,
    cumulativeResponseWaitMs: null,
    harnessGaps: [],
    limitation:
      'Immediate scripted replies, with measured harness judging/routing/bookkeeping gaps excluded. Host delivery timestamps for text; bracketed source/output device-clock epoch intervals for voice. The conservative upper wait bound includes later required reply speech and clock uncertainty; it does not establish physical audibility.',
  };
  const incomplete = (reason: string) => ({ ...result, reason });
  if (!attempts.length || new Set(attempts.map((attempt) => attempt.modality)).size !== 1)
    return incomplete('dialog_scope_missing_or_mixed');
  const turns: { inputStart: TimeInterval; inputEnd: TimeInterval; completed: TimeInterval }[] = [];
  for (const attempt of attempts) {
    const timing = attempt.timing;
    // The caller certifies a necessary question and its completed approved
    // reply. This is a delivered question boundary, never a successful target
    // completion or a replacement for the parent's immutable raw verdict.
    const question = verifiedQuestions.includes(attempt);
    const responseMs = question ? timing?.observedResponseEndMs : attempt.elapsedMs;
    if (
      (question ? attempt.outcome !== 'fail' : attempt.outcome !== 'pass') ||
      !timing ||
      responseMs == null ||
      !Number.isFinite(responseMs) ||
      responseMs < 0 ||
      !Number.isFinite(timing.submittedAt) ||
      (question
        ? attempt.elapsedMs !== null || timing.successfulCompletionMs !== null
        : timing.successfulCompletionMs !== attempt.elapsedMs)
    )
      return incomplete('dialog_completion_boundary_missing');
    const completedAt = timing.submittedAt + responseMs;
    if (attempt.modality === 'text') {
      if (timing.contract !== 'text-delivery-v2')
        return incomplete('dialog_clock_contract_mismatch');
      turns.push({
        inputStart: { lower: timing.submittedAt, upper: timing.submittedAt },
        inputEnd: { lower: timing.submittedAt, upper: timing.submittedAt },
        completed: { lower: completedAt, upper: completedAt },
      });
      continue;
    }
    const input = attempt.playback?.input;
    const rendered = attempt.playback?.renderedEnd;
    if (
      timing.contract !== 'voice-rendered-v1' ||
      !input ||
      !interval(input.started) ||
      !interval(input.ended) ||
      !interval(rendered)
    )
      return incomplete('dialog_device_clock_boundary_missing');
    if (
      Math.abs(timing.submittedAt - input.ended.upper) > 0.001 ||
      timing.observedResponseEndMs === null ||
      !Number.isFinite(timing.observedResponseEndMs) ||
      Math.abs(timing.observedResponseEndMs - (rendered.upper - input.ended.upper)) > 0.001 ||
      completedAt + 0.001 < rendered.upper
    )
      return incomplete('dialog_device_clocks_incompatible');
    if (input.started.lower > input.ended.upper)
      return incomplete('dialog_input_boundaries_out_of_order');
    turns.push({
      inputStart: input.started,
      inputEnd: input.ended,
      completed: {
        lower: completedAt > rendered.upper + 0.001 ? completedAt : rendered.lower,
        upper: completedAt,
      },
    });
  }
  result.cumulativeResponseWaitMs = attempts.reduce(
    (total, attempt) =>
      total +
      (verifiedQuestions.includes(attempt)
        ? (attempt.timing?.observedResponseEndMs ?? 0)
        : (attempt.elapsedMs ?? 0)),
    0,
  );
  const replyInputs: TimeInterval[] = [];
  for (let index = 1; index < turns.length; index++) {
    const previous = turns[index - 1];
    const current = turns[index];
    if (current.inputStart.upper < previous.completed.lower)
      return incomplete('dialog_turn_boundaries_out_of_order');
    result.harnessGaps.push({
      from: attempts[index - 1].step,
      to: attempts[index].step,
      bounds: {
        lower: Math.max(0, current.inputStart.lower - previous.completed.upper),
        upper: Math.max(0, current.inputStart.upper - previous.completed.lower),
      },
    });
    replyInputs.push({
      lower: Math.max(0, current.inputEnd.lower - current.inputStart.upper),
      upper: Math.max(0, current.inputEnd.upper - current.inputStart.lower),
    });
  }
  const first = turns[0];
  const last = turns[turns.length - 1];
  result.wallMs = {
    lower: Math.max(0, last.completed.lower - first.inputEnd.upper),
    upper: Math.max(0, last.completed.upper - first.inputEnd.lower),
  };
  result.harnessGapMs = sum(result.harnessGaps.map((gap) => gap.bounds));
  result.replyInputMs = sum(replyInputs);
  result.applicationWaitMs = {
    lower: Math.max(0, result.wallMs.lower - result.harnessGapMs.upper),
    upper: Math.max(0, result.wallMs.upper - result.harnessGapMs.lower),
  };
  result.endpointMs = result.applicationWaitMs.upper;
  result.status = 'complete';
  return result;
}
