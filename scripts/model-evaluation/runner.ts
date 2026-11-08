import { randomUUID } from 'node:crypto';
import type { AssistantObservation } from '../../src/server/assistant-observation.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import type { createInstallation } from '../../tests/support/installation.js';
import type { ApplicationVersion } from './application.js';
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
  modelActions,
  observationDiagnostics,
  retainedObservation,
} from './observations.js';
import type { ProviderCall } from './provider.js';
import {
  checkedContentVerdicts,
  contentRequirements,
  retainWaitingTiming,
} from './retained-work.js';
import type { Attempt, JudgeInput, JudgeResult, Scenario } from './types.js';
import {
  concludeUserStop,
  executeUserStop,
  missedUserStop,
  validateUserStop,
} from './user-stop.js';

export type RunOptions = {
  profile: string;
  repetition: number;
  application?: ApplicationVersion;
  comparisonContract?: string;
  followUps?: boolean;
  judge?: (input: JudgeInput) => Promise<JudgeResult>;
  record?: (attempt: Attempt) => Promise<void>;
  beginStep?: (audioMs?: number, context?: ProviderCall['context']) => void;
  costs?: () => number | null;
  judgeCosts?: () => number | null;
  stopped?: () => boolean;
  stopReason?: () => string | null;
  providerCalls?: () => number;
  providerRecords?: () => ProviderCall[];
  recordObservation?: (event: AssistantObservation) => void;
};

export async function runTextScenario(
  scenario: Scenario,
  installationOptions: Parameters<typeof createInstallation>[1],
  options: RunOptions,
) {
  scenarioUtterances(scenario, options.followUps);
  scenario.steps.forEach(validateUserStop);
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
  const attempts: Attempt[] = [];
  let blocked: string | undefined;
  let summaryText = '';
  const attempt = (step: string): Attempt => ({
    scenario: scenario.id,
    group: scenario.group ?? 'everyday',
    step,
    profile: options.profile,
    repetition: options.repetition,
    modality: 'text',
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
  });
  const queue: ScenarioExchange[] = scenario.steps.map((step) => ({ step }));
  try {
    for (const [index, entry] of queue.entries()) {
      const { step } = entry;
      const result = attempt(step.id);
      if (entry.parent) result.followUpFor = entry.parent;
      let continuing = false;
      if (blocked) {
        result.reason = `Dependent step not run: ${blocked}`;
      } else {
        options.beginStep?.(0, {
          scenario: scenario.id,
          step: step.id,
          modality: 'text',
          repetition: options.repetition,
          applicationVersion: environment.application?.id,
        });
        const offset = events.length;
        let startedAt = Date.now();
        let requestId: string | undefined;
        let submitted = step.transition === 'summary';
        let firstResponseMs: number | null = null;
        let completedResponseMs: number | null = null;
        let earlierResponseUnverified = false;
        let applicationTerminalStatus: 'canceled' | 'expired' | undefined;
        const costBefore = options.costs?.() ?? 0;
        const judgeBefore = options.judgeCosts?.() ?? 0;
        const callsBefore = options.providerCalls?.() ?? 0;
        const recordIds = new Set(options.providerRecords?.().map((call) => call.id) ?? []);
        try {
          let view: TextAssistantView;
          let responseText: string;
          if (step.transition === 'summary') {
            const history = scenarioHistory(scenario);
            const summarized = await environment.installation.summarizeForEvaluation(
              environment.assistant.id,
              history,
            );
            if (!summarized.installed || !summarized.summary)
              throw new Error('evaluation_summary_installation_failed');
            if (
              summarized.retained.length !== 8 ||
              summarized.retained.some(
                (row, index) =>
                  row.text !== history.at(index - 8)?.text ||
                  row.role !== history.at(index - 8)?.role,
              )
            )
              throw new Error('evaluation_summary_tail_invalid');
            summaryText = summarized.summary;
            view = summarized.view;
            responseText = summaryText;
          } else {
            view = await environment.get<TextAssistantView>(environment.path);
            requestId = randomUUID();
            startedAt = Date.now();
            submitted = true;
            await environment.post(`${environment.path}/messages`, {
              requestId,
              revision: view.revision,
              draftVersion: view.review.version,
              contentVersion: view.review.contentVersion,
              text: step.text,
            });
            for (;;) {
              view = await environment.get<TextAssistantView>(
                `${environment.path}/messages/${requestId}`,
              );
              if (step.userStop && !options.stopped?.()) {
                if (view.taskStatus === 'working') {
                  const stopped = await executeUserStop({
                    step,
                    view,
                    origin: startedAt,
                    environment,
                    requestId,
                    events: () => events.slice(offset),
                  });
                  result.scriptedStop = stopped.proof;
                  view = stopped.view;
                  throw new Error('evaluation_scripted_user_stop');
                }
                if (view.taskStatus === 'completed') {
                  result.scriptedStop = missedUserStop();
                  throw new Error('evaluation_scripted_user_stop');
                }
              }
              if (view.taskStatus === 'canceled' || view.taskStatus === 'expired') {
                applicationTerminalStatus = view.taskStatus;
                throw new Error(`evaluation_application_${view.taskStatus}`);
              }
              // Raw prose does not establish usefulness. Certification uses
              // the completed response and later state/content assessment.
              if (
                (view.taskId === requestId || view.taskStatus === 'completed') &&
                !view.error &&
                (view.modelReply ||
                  (view.reply && (view.result || view.receipt || view.questionPending)))
              ) {
                const deliveredAt = Date.now() - startedAt;
                firstResponseMs ??= deliveredAt;
                if (view.taskStatus === 'completed') completedResponseMs ??= deliveredAt;
                else earlierResponseUnverified = true;
              }
              if (view.selection) {
                const matches =
                  view.selection.kind === 'object' && view.selection.id === scenario.selection;
                await environment.post(`${environment.path}/selection`, {
                  revision: view.revision,
                  kind: view.selection.kind,
                  id: view.selection.id,
                  draftVersion: view.selection.draftVersion,
                  contentVersion: view.selection.contentVersion,
                  displayed: matches,
                });
                if (!matches) result.fixed.push('unexpected_selection');
              }
              if (view.taskStatus === 'completed') break;
              if (options.stopped?.()) {
                await environment.post(`${environment.path}/cancel`, {
                  revision: view.revision,
                  all: true,
                });
                throw new Error(options.stopReason?.() ?? 'evaluation_stopped');
              }
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
            responseText = [view.reply, view.modelReply].filter(Boolean).join('\n');
            if (scenario.selection && view.displayedSelection !== scenario.selection)
              result.fixed.push('selection_unconfirmed');
          }
          if (options.stopped?.()) throw new Error(options.stopReason?.() ?? 'evaluation_stopped');
          const finishedAt = Date.now();
          const observed = events.slice(offset);
          const actions = modelActions(observed);
          result.diagnostics = observationDiagnostics(observed, startedAt);
          const stateFailures = await environment.check(entry.target ?? step, view, actions);
          result.fixed.push(...stateFailures);
          const sources: JudgeInput['sources'] = {
            backend: {
              text: responseText,
              complete: !view.error && view.taskStatus !== 'canceled',
            },
          };
          const requirements = contentRequirements(
            sources,
            step.expected.requirements,
            (entry.target ?? step).expected,
          );
          if (requirements.length) {
            const verdicts: JudgeResult = options.judge
              ? await options.judge({
                  context: environment.judgeContext(step, result.fixed, summaryText),
                  sources,
                  requirements,
                })
              : requirements.map(({ id }) => ({
                  id,
                  outcome: 'inconclusive',
                  reason: 'No content judge supplied.',
                }));
            result.content = checkedContentVerdicts(requirements, verdicts);
          }
          if (options.stopped?.()) throw new Error(options.stopReason?.() ?? 'evaluation_stopped');
          concludeAttempt(result, finishedAt - startedAt);
          result.observedEndMs = finishedAt - startedAt;
          result.timing = {
            contract: step.transition === 'summary' ? 'summary-execution-v1' : 'text-delivery-v2',
            submittedAt: startedAt,
            queueMs: null,
            firstResponseMs,
            firstUsefulMs:
              result.outcome === 'pass' && !earlierResponseUnverified ? completedResponseMs : null,
            firstVerifiedUsefulMs: result.outcome === 'pass' ? completedResponseMs : null,
            firstUsefulLimitation: earlierResponseUnverified
              ? 'The usefulness of earlier delivered prose is unverified. First useful time is unknown; firstVerifiedUsefulMs identifies a verified completed response, not the earliest possibly useful fragment.'
              : undefined,
            observedResponseEndMs: finishedAt - startedAt,
            successfulCompletionMs: result.elapsedMs,
          };
          Object.assign(
            result,
            assistedExchangeTiming(entry, {
              submittedAt: startedAt,
              completedAt: finishedAt,
              outcome: result.outcome,
            }),
          );
          retainWaitingTiming(result, (entry.target ?? step).expected, view.pendingParts, [
            ...(entry.requestIds ?? []),
            ...(requestId ? [requestId] : []),
          ]);
          if (!options.stopped?.()) {
            const followUp = await selectFollowUp({
              step,
              attempt: result,
              stateFailures,
              questionPending: Boolean(view.questionPending),
              sources: {
                backend: {
                  text: responseText,
                  complete: !view.error && view.taskStatus !== 'canceled',
                },
              },
              checkWaiting: (waiting) => environment.check(step, view, actions, waiting),
              waitingContext: () => environment.judgeContext(step, [], summaryText),
              judge: options.judge,
              repliesEnabled: options.followUps ?? false,
            });
            if (followUp && !options.stopped?.()) {
              queue.splice(index + 1, 0, {
                step: followUpStep(step, followUp),
                parent: step.id,
                target: step,
                requestIds: [...(entry.requestIds ?? []), ...(requestId ? [requestId] : [])],
                startedAt: entry.startedAt ?? startedAt,
                previousResponseEndAt: finishedAt,
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
              backend: {
                text: responseText,
                complete: !view.error && view.taskStatus !== 'canceled',
              },
            },
            check: (expected) => environment.check(entry.target ?? step, view, actions, expected),
            context: () =>
              environment.judgeContext(entry.target ?? step, result.fixed, summaryText) +
              (entry.parent ? `\nCurrent clarification: ${JSON.stringify(step.text)}` : ''),
            judge: options.judge,
          });
          if (result.assessment?.kind === 'necessary_clarification' && result.timing) {
            result.timing.firstUsefulMs = earlierResponseUnverified ? null : completedResponseMs;
            result.timing.firstVerifiedUsefulMs = completedResponseMs;
          }
          result.backendCostUsd = options.costs
            ? options.costs() === null
              ? null
              : (options.costs() ?? 0) - costBefore
            : 0;
          result.judgeCostUsd = options.judgeCosts
            ? options.judgeCosts() === null
              ? null
              : (options.judgeCosts() ?? 0) - judgeBefore
            : 0;
        } catch (error) {
          if (result.scriptedStop) {
            concludeUserStop(result, result.scriptedStop, Date.now() - startedAt);
            result.diagnostics = observationDiagnostics(events.slice(offset), startedAt);
          } else if (applicationTerminalStatus) {
            result.outcome = applicationTerminalStatus === 'canceled' ? 'aborted' : 'error';
            result.reason = `evaluation_application_${applicationTerminalStatus}`;
            result.observedEndMs = Date.now() - startedAt;
            result.diagnostics = observationDiagnostics(events.slice(offset), startedAt);
          } else {
            failAttempt(result, error, Date.now() - startedAt, {
              stopped: options.stopped?.() ?? false,
              reason: options.stopReason?.() ?? null,
              attempted: (options.providerCalls?.() ?? 0) > callsBefore,
            });
          }
          result.elapsedMs = null;
          if (result.assistedElapsedMs !== undefined) result.assistedElapsedMs = null;
          const costAfter = options.costs?.();
          result.backendCostUsd = costAfter == null ? null : costAfter - costBefore;
          const judgeAfter = options.judgeCosts?.();
          result.judgeCostUsd = judgeAfter == null ? null : judgeAfter - judgeBefore;
          if (submitted) {
            result.timing ??= {
              contract: step.transition === 'summary' ? 'summary-execution-v1' : 'text-delivery-v2',
              submittedAt: startedAt,
              queueMs: null,
              firstResponseMs,
              firstUsefulMs: null,
              firstVerifiedUsefulMs: null,
              observedResponseEndMs: null,
              successfulCompletionMs: null,
            };
            result.timing.successfulCompletionMs = null;
            result.timing.firstUsefulMs = null;
            result.timing.firstVerifiedUsefulMs = null;
          }
        }
        if (result.timing && requestId) {
          const taskStarted = events
            .slice(offset)
            .find((event) => event.kind === 'task_started' && event.taskId === requestId);
          result.timing.queueMs = taskStarted ? Math.max(0, taskStarted.at - startedAt) : null;
        }
        if ((result.outcome !== 'pass' || result.elapsedMs === null) && !continuing)
          blocked = `${step.id}: ${result.outcome === 'pass' ? 'unfinished' : result.outcome}`;
        result.providerCalls = options.providerCalls
          ? options.providerCalls() - callsBefore
          : undefined;
        result.metrics = evaluationMetrics(
          options.providerRecords?.().filter((call) => !recordIds.has(call.id)),
          events.slice(offset),
        );
      }
      attempts.push(result);
      await options.record?.(result);
    }
    return { attempts, events, finalMap: await environment.read() };
  } finally {
    await environment.close();
  }
}
