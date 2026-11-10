import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { AssistantObservation } from '../../src/server/assistant-observation.js';
import type { MapDraft } from '../../src/shared/map.js';
import type { PendingPart, TextAssistantView } from '../../src/shared/text-assistant.js';
import type { createInstallation } from '../../tests/support/installation.js';
import { evaluationEnvironment } from './environment.js';
import { modelActions, retainedObservation } from './observations.js';
import { checkPendingContext, pendingContext } from './pending-context.js';
import { contentRequirements } from './retained-work.js';
import type { RunOptions } from './runner.js';
import type { Expected, JudgeResult } from './types.js';

export type ContextTurn = {
  outcome: 'pass' | 'fail' | 'error' | 'aborted' | 'inconclusive' | 'not_run';
  generation: number;
  inputTokens: number | null;
  summary: boolean;
  callIds?: string[];
  fixed?: string[];
  taskStatus?: TextAssistantView['taskStatus'] | null;
  reason?: string;
  error?: string;
  observedEndMs?: number | null;
  successfulCompletionMs?: number | null;
  state?: Record<string, unknown>;
  stateUnavailable?: string;
  pendingWork?: 'preserved' | 'completed' | 'failed' | 'unverified';
  requestId?: string;
  requestSha256?: string;
  content?: JudgeResult;
};

/** Ordinary messages, each within the public 4,000-character input limit.
 * No injected history, output-limit reduction or forced summary is permitted.
 * Distinct numbered records prevent a repeated word from standing for realistic
 * context growth. The sentinel is deliberately outside the final short tail. */
export function contextLimitFixture(maximumTurns = 2048) {
  if (!Number.isSafeInteger(maximumTurns) || maximumTurns < 1 || maximumTurns > 4096)
    throw new Error('evaluation_context_growth_bound_invalid');
  const seed =
    'Vi diskuterar hushållets planering. Kodordet för denna diskussion är björklöv 731. ' +
    'Behåll kodordet i samtalet. Ändra inget och spara inget.';
  const growth = Array.from({ length: maximumTurns }, (_, index) => {
    const rows = Array.from(
      { length: 64 },
      (_, row) => `Planeringsrad ${index + 1}.${row + 1}: diskussion om vardag, tider och utrymme.`,
    ).join('\n');
    return `Detta är endast diskussionsunderlag. Ändra inget och spara inget.\n${rows}`.slice(
      0,
      3900,
    );
  });
  const recall =
    'Vilket kodord angav jag i början av diskussionen? Svara med hela kodordet. ' +
    'Ändra inget och spara inget.';
  const value = { format: 'skyttel-context-growth-v1', seed, growth, recall };
  return { ...value, sha256: createHash('sha256').update(JSON.stringify(value)).digest('hex') };
}

/** The concrete application adapter uses the normal authenticated message route,
 * real isolated SQLite/MCP and the selected committed application. It never
 * installs historical posts or invokes summarizeForEvaluation. Paid transports,
 * their shared ledger, calibration and private recording belong to the caller. */
export async function runApplicationContextLimit(
  installationOptions: Parameters<typeof createInstallation>[1],
  options: RunOptions & {
    origin: 'provider' | 'controlled';
    contextTokens: number;
    maximumTurns?: number;
    pendingWork?: boolean;
  },
) {
  if (options.pendingWork && (options.maximumTurns ?? 2048) > 2048)
    throw new Error('evaluation_context_growth_bound_invalid');
  const fixture = contextLimitFixture(options.maximumTurns);
  const scenario = {
    id: options.pendingWork ? 'pending-context-growth' : 'actual-context-growth',
    startVariant: options.pendingWork ? pendingContext.startVariant : undefined,
    title: 'Ordinary context growth',
    voice: false,
    group: 'long_conversation' as const,
    steps: [],
  };
  const events: AssistantObservation[] = [];
  const environment = await evaluationEnvironment(
    scenario,
    {
      ...installationOptions,
      observe: (event) => {
        events.push(retainedObservation(event, options.recordObservation));
        installationOptions?.observe?.(event);
      },
    },
    options.application,
  );
  let sequence = 0;
  let originalPart: PendingPart | undefined;
  try {
    return await runContextLimit(fixture, {
      origin: options.origin,
      contextTokens: options.contextTokens,
      pendingWork: options.pendingWork,
      submit: async (text, stage) => {
        if (options.stopped?.())
          return {
            outcome: 'not_run',
            reason: options.stopReason?.() ?? 'evaluation_stopped',
            generation: 0,
            inputTokens: null,
            summary: false,
            callIds: [],
            observedEndMs: null,
            successfulCompletionMs: null,
            stateUnavailable: 'evaluation_context_turn_not_submitted',
          };
        const before = new Set(options.providerRecords?.().map((call) => call.id) ?? []);
        const callsBefore = options.providerCalls?.() ?? 0;
        const offset = events.length;
        const expected: Expected = options.pendingWork
          ? stage === 'continuation'
            ? pendingContext.completed
            : {
                ...pendingContext.waiting,
                requirements:
                  stage === 'pending'
                    ? pendingContext.waiting.requirements
                    : stage === 'recall'
                      ? ['Svaret anger hela kodordet björklöv 731.']
                      : [],
              }
          : {
              requirements: stage === 'recall' ? ['Svaret anger hela kodordet björklöv 731.'] : [],
            };
        const step = {
          id: `context-${stage}-${sequence++}`,
          text,
          expected,
        };
        let startedAt = Date.now();
        let view: TextAssistantView | undefined;
        let requestId: string | undefined;
        let outcome: ContextTurn['outcome'] = 'pass';
        let reason: string | undefined;
        let error: string | undefined;
        let observedEndMs: number | null = null;
        let taskStatus: ContextTurn['taskStatus'] = null;
        let terminalView = false;
        try {
          options.beginStep?.(0, {
            scenario: scenario.id,
            step: step.id,
            modality: 'text',
            repetition: options.repetition,
            applicationVersion: options.application?.id,
          });
          view = await environment.get<TextAssistantView>(environment.path);
          requestId = randomUUID();
          startedAt = Date.now();
          await environment.post(`${environment.path}/messages`, {
            requestId,
            revision: view.revision,
            draftVersion: view.review.version,
            contentVersion: view.review.contentVersion,
            text,
          });
          for (;;) {
            view = await environment.get<TextAssistantView>(
              `${environment.path}/messages/${requestId}`,
            );
            taskStatus = view.taskStatus ?? null;
            if (taskStatus === 'canceled' || taskStatus === 'expired') {
              outcome = taskStatus === 'canceled' ? 'aborted' : 'error';
              reason = `evaluation_application_${taskStatus}`;
              error = view.error;
              terminalView = true;
              break;
            }
            if (view.taskStatus === 'completed' || view.error) {
              outcome = view.error ? 'fail' : 'pass';
              reason = view.error;
              error = view.error;
              terminalView = true;
              break;
            }
            if (options.stopped?.()) {
              outcome = 'aborted';
              reason = options.stopReason?.() ?? 'evaluation_stopped';
              observedEndMs = Date.now() - startedAt;
              view = await environment.post<TextAssistantView>(`${environment.path}/cancel`, {
                revision: view.revision,
                all: true,
              });
              taskStatus = view.tasks?.find((task) => task.id === requestId)?.status ?? null;
              terminalView = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          observedEndMs ??= Date.now() - startedAt;
        } catch (caught) {
          observedEndMs ??= Date.now() - startedAt;
          error = caught instanceof Error ? caught.message : String(caught);
          reason ??= options.stopped?.() ? (options.stopReason?.() ?? error) : error;
          outcome = options.stopped?.() ? 'aborted' : 'error';
        }

        // Collect state even after cancellation, expiry or a lost HTTP reply.
        // A failed read is an evidence gap, never an empty successful check.
        let fixed: string[] | undefined;
        let state: Record<string, unknown> | undefined;
        let stateUnavailable: string | undefined;
        let content: JudgeResult | undefined;
        let waitingAfterClarification = false;
        try {
          if (!terminalView) {
            view = await environment.get<TextAssistantView>(environment.path);
            taskStatus = view.tasks?.find((task) => task.id === requestId)?.status ?? taskStatus;
          }
          if (!view) throw new Error('evaluation_context_view_unavailable');
          waitingAfterClarification = Boolean(
            options.pendingWork &&
              stage === 'continuation' &&
              view.pendingParts?.some(
                (part) =>
                  part.id === originalPart?.id && ['waiting', 'ready'].includes(part.status),
              ),
          );
          if (waitingAfterClarification)
            step.expected = {
              ...pendingContext.waiting,
              preservedRequests: [pendingContext.request, pendingContext.continuation],
              requirements: [
                'Förklara en säker väntan utan att påstå slutförande. Bevara den förtydligade begäran om Lo Berg, befintliga samband och förbudet mot sparande i aktivt väntande arbete.',
              ],
            };
          fixed = await environment.check(step, view, modelActions(events.slice(offset)));
          state = environment.stateEvidence();
          if (!state) throw new Error('evaluation_state_evidence_missing');
          if (options.pendingWork) {
            const pending = checkPendingContext(
              view.pendingParts ?? [],
              originalPart,
              requestId,
              stage === 'continuation',
              waitingAfterClarification,
            );
            fixed.push(...pending.failures);
            const draft = state.draft as MapDraft;
            const initial = environment.initial.draft;
            if (
              !isDeepStrictEqual(draft.changes, initial.changes) ||
              !isDeepStrictEqual(draft.objectTypes, initial.objectTypes) ||
              !isDeepStrictEqual(draft.relationshipTypes, initial.relationshipTypes) ||
              (stage !== 'continuation' || waitingAfterClarification
                ? !isDeepStrictEqual(draft.relationships, initial.relationships)
                : draft.relationships?.length !== (initial.relationships?.length ?? 0) + 1 ||
                  draft.relationships.some((change) => change.before !== null))
            )
              fixed.push('context_draft_preservation');
            if (stage === 'pending' && !pending.failures.length)
              originalPart = structuredClone(pending.part);
          }
          if (outcome === 'pass' && fixed.length) outcome = 'fail';
          if (outcome === 'pass' && options.stopped?.()) {
            outcome = 'aborted';
            reason = options.stopReason?.() ?? 'evaluation_stopped';
            observedEndMs = Date.now() - startedAt;
          }
          if ((options.pendingWork || stage === 'recall') && outcome === 'pass') {
            const sources = {
              backend: {
                text: [view.reply, view.modelReply].filter(Boolean).join('\n'),
                complete: true,
              },
            };
            const requirements = options.pendingWork
              ? contentRequirements(sources, step.expected.requirements, step.expected, state)
              : [
                  {
                    id: 'context-recall',
                    source: 'backend' as const,
                    text: step.expected.requirements[0],
                  },
                ];
            content = await options.judge?.({
              context: environment.judgeContext(step, fixed),
              sources,
              requirements,
            });
            outcome =
              content?.length === requirements.length &&
              requirements.every(({ id }) => content?.filter((item) => item.id === id).length === 1)
                ? content.some((item) => item.outcome === 'fail')
                  ? 'fail'
                  : content.every((item) => item.outcome === 'pass')
                    ? 'pass'
                    : 'inconclusive'
                : 'inconclusive';
            if (options.stopped?.()) {
              outcome = 'aborted';
              reason = options.stopReason?.() ?? 'evaluation_stopped';
              observedEndMs = Date.now() - startedAt;
            }
          }
        } catch (caught) {
          const cause = caught instanceof Error ? caught.message : String(caught);
          if (!state) stateUnavailable = cause;
          if (outcome === 'pass') {
            outcome = options.stopped?.() ? 'aborted' : 'error';
            reason = cause;
            error = cause;
            observedEndMs = Date.now() - startedAt;
          }
        }
        const calls = options.providerRecords?.().filter((call) => !before.has(call.id)) ?? [];
        const attempted =
          calls.length > 0 ||
          (options.providerCalls?.() ?? 0) > callsBefore ||
          events.slice(offset).some((event) => event.kind === 'model_attempt');
        if (outcome === 'aborted' && options.stopped?.() && !attempted) {
          outcome = 'not_run';
          observedEndMs = null;
        }
        const inputs = calls.flatMap((call) => {
          const input = (call.response?.usage as { input_tokens?: number } | undefined)
            ?.input_tokens;
          return call.kind !== 'judge' && Number.isSafeInteger(input) && Number(input) >= 0
            ? [Number(input)]
            : [];
        });
        if (
          options.pendingWork &&
          outcome === 'pass' &&
          (!inputs.length ||
            calls.some((call) => !call.endedAt || call.costUsd === null || !call.response?.usage))
        ) {
          outcome = 'inconclusive';
          reason = 'evaluation_context_usage_unavailable';
        }
        return {
          outcome,
          reason,
          error,
          taskStatus,
          observedEndMs,
          successfulCompletionMs:
            outcome === 'pass' &&
            (!options.pendingWork || (stage === 'continuation' && !waitingAfterClarification))
              ? observedEndMs
              : null,
          requestId,
          requestSha256: createHash('sha256').update(text).digest('hex'),
          content,
          ...(options.pendingWork
            ? {
                pendingWork: (outcome === 'pass'
                  ? stage === 'continuation' && !waitingAfterClarification
                    ? 'completed'
                    : 'preserved'
                  : stage === 'recall' &&
                      outcome === 'fail' &&
                      !fixed?.length &&
                      content?.length === 2 &&
                      content.filter(
                        (item) => item.id === 'backend-retention' && item.outcome === 'pass',
                      ).length === 1
                    ? 'preserved'
                    : outcome === 'fail'
                      ? 'failed'
                      : 'unverified') as ContextTurn['pendingWork'],
              }
            : {}),
          generation: view?.contextGeneration ?? 0,
          inputTokens: inputs.length ? Math.max(...inputs) : null,
          summary: calls.some((call) => call.kind === 'summary'),
          callIds: calls.map((call) => call.id),
          fixed,
          state,
          stateUnavailable,
        };
      },
    });
  } finally {
    await environment.close();
  }
}

/** Bounded preparation seam. The adapter submits ordinary application input
 * and supplies observed completed-request usage and public context generation.
 * Growth stops at the first summary or generation increase, with at most one recall.
 * Low or missing usage identifies application configuration preemption only.
 * This detects the application's effective boundary; the physical provider
 * maximum remains a separate unverified claim. */
export async function runContextLimit(
  fixture: ReturnType<typeof contextLimitFixture>,
  options: {
    origin: 'provider' | 'controlled';
    contextTokens: number;
    pendingWork?: boolean;
    submit: (text: string, stage: ContextStage) => Promise<ContextTurn>;
  },
) {
  if (!Number.isSafeInteger(options.contextTokens) || options.contextTokens <= 0)
    throw new Error('evaluation_context_capacity_invalid');
  const startedAt = Date.now();
  if (options.pendingWork && fixture.growth.length > 2048)
    throw new Error('evaluation_context_growth_bound_invalid');
  const turns: (ContextTurn & { stage: ContextStage })[] = [];
  if (options.pendingWork) {
    const pending = await options.submit(pendingContext.request, 'pending');
    turns.push({ ...pending, stage: 'pending' });
  }
  let maximumInput = 0;
  let previousGeneration: number | undefined = turns[0]?.generation;
  let boundary = 'inconclusive';
  let reason = 'growth_bound_reached_without_measured_boundary';
  for (const [index, text] of [fixture.seed, ...fixture.growth].entries()) {
    if (options.pendingWork && index === 0 && (turns[0]?.summary || turns[0]?.generation > 0)) {
      reason = 'natural_transition_before_codeword_seed';
      break;
    }
    if (turns.some((turn) => turn.outcome !== 'pass')) {
      reason = `terminal_turn_${turns.at(-1)?.outcome}`;
      break;
    }
    const stage = index ? 'growth' : 'seed';
    const turn = await options.submit(text, stage);
    turns.push({ ...turn, stage });
    if (turn.outcome !== 'pass') {
      reason = `terminal_turn_${turn.outcome}`;
      break;
    }
    if (Number.isSafeInteger(turn.inputTokens) && Number(turn.inputTokens) >= 0)
      maximumInput = Math.max(maximumInput, Number(turn.inputTokens));
    const transitioned = previousGeneration !== undefined && turn.generation > previousGeneration;
    if (turn.summary || transitioned) {
      const recall = await options.submit(fixture.recall, 'recall');
      turns.push({ ...recall, stage: 'recall' });
      const measuredCapacity = maximumInput >= options.contextTokens * 0.95;
      boundary =
        recall.outcome === 'pass'
          ? measuredCapacity
            ? 'application_boundary'
            : 'configuration_limited'
          : 'inconclusive';
      reason =
        recall.outcome === 'pass'
          ? measuredCapacity
            ? 'natural_application_transition_after_measured_growth'
            : 'natural_application_transition_before_measured_capacity'
          : 'recall_not_verified_after_application_transition';
      if (
        options.pendingWork &&
        ['pass', 'fail'].includes(recall.outcome) &&
        !recall.error &&
        recall.pendingWork === 'preserved'
      ) {
        const continuation = await options.submit(pendingContext.continuation, 'continuation');
        turns.push({ ...continuation, stage: 'continuation' });
      }
      break;
    }
    previousGeneration = turn.generation;
  }
  return {
    fixtureSha256: fixture.sha256,
    origin: options.origin,
    boundary,
    physicalProviderMaximum: 'unverified',
    reason,
    turns,
    ...(options.pendingWork
      ? {
          recall: turns.find((turn) => turn.stage === 'recall')?.outcome ?? 'not_run',
          preservedWork: turns
            .filter((turn) => turn.stage !== 'continuation')
            .every((turn) => turn.pendingWork === 'preserved'),
          continuation:
            turns.find((turn) => turn.stage === 'continuation')?.pendingWork === 'completed'
              ? 'verified'
              : 'not_verified',
          safeWaiting: turns.at(-1)?.pendingWork === 'preserved',
          unrunDependentStages: (['recall', 'continuation'] as const).filter(
            (stage) => !turns.some((turn) => turn.stage === stage),
          ),
          observedDialogMs: Date.now() - startedAt,
          remainingGrowthMessages:
            fixture.growth.length - turns.filter((turn) => turn.stage === 'growth').length,
        }
      : {}),
    successfulCompletionMs:
      options.pendingWork && turns.at(-1)?.pendingWork === 'completed'
        ? (turns.at(-1)?.successfulCompletionMs ?? null)
        : (null as number | null),
  };
}

export type ContextStage = 'pending' | 'seed' | 'growth' | 'recall' | 'continuation';
