import { expect, test } from 'vitest';
import rawCatalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import { evaluationEnvironment } from '../../../scripts/model-evaluation/environment.js';
import { runTextScenario } from '../../../scripts/model-evaluation/runner.js';
import type { Catalog } from '../../../scripts/model-evaluation/types.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../../support/text-model.js';

test('the scenario runner executes an ordinary summary without a counting adapter', {
  tags: ['technical'],
}, async () => {
  const model = textModel(() => [modelMessage('Ett osparat utkast finns kvar.')]);
  const result = await runTextScenario(
    {
      id: 'summary-without-counting',
      title: 'Summary admission uses conservative reservations',
      voice: false,
      steps: [
        { id: 'context', text: 'Beskriv utkastet.', expected: { requirements: [] } },
        { id: 'summary', transition: 'summary', expected: { requirements: [] } },
      ],
    },
    { modelFetch: model.provider },
    { profile: 'local', repetition: 1 },
  );
  expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['pass', 'pass']);
  expect(model.requests.filter((body) => !body.tools.length)).toHaveLength(1);
});

test('the evaluation summary uses real price turns and atomically installs ordinary generated context', {
  tags: ['technical'],
}, async () => {
  const catalog = rawCatalog as Catalog;
  const scenario = catalog.scenarios.find((item) => item.id === 'summary-last-price');
  if (!scenario) throw new Error('Missing summary scenario');
  let environment: Awaited<ReturnType<typeof evaluationEnvironment>>;
  let source = '';
  const model = textModel(async (body) => {
    if (!body.tools.length) {
      source = JSON.parse(String(body.input[0].content)).source;
      return [
        modelMessage(
          'En äldre sparoperation för startkartan är verifierad. Spotify ändrades först till 189 kronor per månad. Den senaste ändringen är Molnlagring Plus till 229 kronor per månad. Dessa ändringar är osparade.',
        ),
      ];
    }
    if (body.input.findLast((item) => item.role !== 'developer')?.type !== 'function_call_output')
      return [modelTool('read_my_save_operations', {})];
    if (!lastToolResult(body)?.operations) return [modelMessage('Utkastet är uppdaterat.')];
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    const first = turn.message.includes('Spotify');
    const id = first ? 'spotify-sub' : 'cloud-sub';
    const state = await environment.read();
    const original = state.objects.find((item) => item.id === id);
    if (!original) throw new Error('Missing price object');
    const { id: _id, householdId: _household, revision, ...value } = original;
    return [
      modelTool('propose_object', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        id,
        baseRevision: revision,
        value: {
          ...value,
          properties: value.properties?.map((property) =>
            property.id === 'price'
              ? { ...property, value: turn.message.includes('239') ? 239 : first ? 189 : 229 }
              : property,
          ),
        },
      }),
    ];
  });
  environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
  try {
    for (const step of scenario.steps.slice(0, 2)) {
      const view = await environment.get<TextAssistantView>(environment.path);
      await environment.post(`${environment.path}/messages`, {
        requestId: step.id,
        text: step.text,
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
      });
      await expect
        .poll(
          async () =>
            (await environment.get<TextAssistantView>(`${environment.path}/messages/${step.id}`))
              .taskStatus,
        )
        .toBe('completed');
      const finished = await environment.get<TextAssistantView>(environment.path);
      expect(await environment.check(step, finished, [])).toEqual([]);
    }
    const before = await environment.read();
    const summary = await environment.installation.summarizeForEvaluation(
      environment.assistant.id,
      catalog.summaryHistory,
    );
    expect(summary.installed).toBe(true);
    expect(summary.retained).toEqual(catalog.summaryHistory);
    expect(summary.source).toBe(source);
    expect(source).toContain('Spotify Premium Family till 189');
    expect(source).toContain('Molnlagring Plus till 229');
    expect(source).toContain('evaluation-start');
    expect(source).toContain('savedAt');
    expect(source.length).toBeLessThanOrEqual(240_000);
    expect(model.requests.filter((body) => !body.tools.length)).toHaveLength(1);
    expect(summary.view.contextGeneration).toBe(1);
    expect(await environment.read()).toEqual(before);
    const correction = scenario.steps[3];
    await environment.post(`${environment.path}/messages`, {
      requestId: correction.id,
      text: correction.text,
      revision: summary.view.revision,
      draftVersion: summary.view.review.version,
      contentVersion: summary.view.review.contentVersion,
    });
    await expect
      .poll(
        async () =>
          (
            await environment.get<TextAssistantView>(
              `${environment.path}/messages/${correction.id}`,
            )
          ).taskStatus,
      )
      .toBe('completed');
    const corrected = await environment.get<TextAssistantView>(environment.path);
    const failures = await environment.check(correction, corrected, []);
    expect(failures).toEqual([]);
    const context = JSON.parse(environment.judgeContext(correction, failures, summary.summary));
    expect(context.historicalSummary).toContain('229');
    expect(context.fixedChecks).toEqual({ checked: true, passed: true, failures: [] });
    expect(
      context.observedState.effective.objects
        .find((object: { id: string }) => object.id === 'cloud-sub')
        .properties.find((property: { id: string }) => property.id === 'price').value,
    ).toBe(239);
    expect(context.observedState.saveReceipt).toBeNull();
    expect(context.observedState.saveOperations).toEqual([]);
    expect(context.observedState.historicalSaveOperations).toEqual([
      expect.objectContaining({
        operationId: 'evaluation-start',
        status: 'succeeded',
        receipt: expect.objectContaining({ savedAt: expect.any(String) }),
      }),
    ]);
    expect(context.observedState.historyChanges).toBe(0);
  } finally {
    await environment.close();
  }
});
