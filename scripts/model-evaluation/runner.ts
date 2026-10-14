import { randomUUID } from 'node:crypto';
import type { AssistantObservation } from '../../src/server/assistant-observation.js';
import type { TextAssistantView } from '../../src/shared/text-assistant.js';
import type { createInstallation } from '../../tests/support/installation.js';
import rawCatalog from './catalog.json' with { type: 'json' };
import { evaluationEnvironment } from './environment.js';
import { scenarioUtterances, selectFollowUp } from './follow-ups.js';
import {
  concludeAttempt,
  failAttempt,
  modelActions,
  observationDiagnostics,
  retainedObservation,
} from './observations.js';
import type { ProviderCall } from './provider.js';
import type { Attempt, Catalog, JudgeInput, JudgeResult, Scenario, ScenarioStep } from './types.js';

const catalog = rawCatalog as Catalog;
export type RunOptions = {
  profile: string;
  repetition: number;
  followUps?: boolean;
  judge?: (input: JudgeInput) => Promise<JudgeResult>;
  record?: (attempt: Attempt) => Promise<void>;
  beginStep?: (audioMs?: number, context?: ProviderCall['context']) => void;
  costs?: () => number | null;
  judgeCosts?: () => number | null;
  stopped?: () => boolean;
  stopReason?: () => string | null;
  providerCalls?: () => number;
  recordObservation?: (event: AssistantObservation) => void;
};

export async function runTextScenario(
  scenario: Scenario,
  installationOptions: Parameters<typeof createInstallation>[1],
  options: RunOptions,
) {
  scenarioUtterances(scenario, options.followUps);
  const events: AssistantObservation[] = [];
  const environment = await evaluationEnvironment(scenario, {
    ...installationOptions,
    observe: (event) => {
      events.push(retainedObservation(event, options.recordObservation));
      installationOptions?.observe?.(event);
    },
  });
  const attempts: Attempt[] = [];
  let blocked: string | undefined;
  let summaryText = '';
  const attempt = (step: string): Attempt => ({
    scenario: scenario.id,
    step,
    profile: options.profile,
    repetition: options.repetition,
    modality: 'text',
    outcome: 'not_run',
    fixed: [],
    elapsedMs: null,
    backendCostUsd: 0,
  });
  const queue: {
    step: ScenarioStep;
    parent?: string;
    target?: ScenarioStep;
    startedAt?: number;
  }[] = scenario.steps.map((step) => ({ step }));
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
        });
        const offset = events.length;
        const startedAt = Date.now();
        const costBefore = options.costs?.() ?? 0;
        const judgeBefore = options.judgeCosts?.() ?? 0;
        const callsBefore = options.providerCalls?.() ?? 0;
        try {
          let view: TextAssistantView;
          let responseText: string;
          if (step.transition === 'summary') {
            const summarized = await environment.installation.summarizeForEvaluation(
              environment.assistant.id,
              catalog.summaryHistory,
            );
            if (!summarized.installed || !summarized.summary)
              throw new Error('evaluation_summary_installation_failed');
            if (
              summarized.retained.length !== 8 ||
              summarized.retained.some(
                (row) => !catalog.summaryHistory.some((fixture) => fixture.text === row.text),
              )
            )
              throw new Error('evaluation_summary_tail_invalid');
            summaryText = summarized.summary;
            view = summarized.view;
            responseText = summaryText;
          } else {
            view = await environment.get<TextAssistantView>(environment.path);
            const requestId = randomUUID();
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
              if (view.taskStatus === 'completed' || view.taskStatus === 'canceled') break;
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
          if (step.expected.requirements.length) {
            result.content = options.judge
              ? await options.judge({
                  context: environment.judgeContext(step, result.fixed, summaryText),
                  sources: {
                    backend: {
                      text: responseText,
                      complete: !view.error && view.taskStatus !== 'canceled',
                    },
                  },
                  requirements: step.expected.requirements.map((text, index) => ({
                    id: `backend-${index}`,
                    source: 'backend',
                    text,
                  })),
                })
              : step.expected.requirements.map((_text, index) => ({
                  id: `backend-${index}`,
                  outcome: 'inconclusive',
                  reason: 'No content judge supplied.',
                }));
          }
          if (options.stopped?.()) throw new Error(options.stopReason?.() ?? 'evaluation_stopped');
          concludeAttempt(result, finishedAt - startedAt);
          result.observedEndMs = finishedAt - startedAt;
          if (entry.startedAt !== undefined)
            result.assistedElapsedMs =
              result.outcome === 'pass' ? finishedAt - entry.startedAt : null;
          if (options.followUps && !options.stopped?.()) {
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
            });
            if (followUp && !options.stopped?.()) {
              queue.splice(index + 1, 0, {
                step: {
                  id: followUp.id,
                  text: followUp.text,
                  expected: { requirements: followUp.requirements },
                },
                parent: step.id,
                target: step,
                startedAt,
              });
              continuing = true;
            }
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
          failAttempt(result, error, Date.now() - startedAt, {
            stopped: options.stopped?.() ?? false,
            reason: options.stopReason?.() ?? null,
            attempted: (options.providerCalls?.() ?? 0) > callsBefore,
          });
          const costAfter = options.costs?.();
          result.backendCostUsd = costAfter == null ? null : costAfter - costBefore;
          const judgeAfter = options.judgeCosts?.();
          result.judgeCostUsd = judgeAfter == null ? null : judgeAfter - judgeBefore;
        }
        if (result.outcome !== 'pass' && !continuing) blocked = `${step.id}: ${result.outcome}`;
      }
      attempts.push(result);
      await options.record?.(result);
    }
    return { attempts, events, finalMap: await environment.read() };
  } finally {
    await environment.close();
  }
}
