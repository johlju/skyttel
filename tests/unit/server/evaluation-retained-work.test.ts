import { expect, test } from 'vitest';
import { evaluationEnvironment } from '../../../scripts/model-evaluation/environment.js';
import { runTextScenario } from '../../../scripts/model-evaluation/runner.js';
import type { JudgeInput, Scenario } from '../../../scripts/model-evaluation/types.js';
import { modelTool, textModel } from '../../support/text-model.js';

const uncertainWork =
  'Ange att Nils möjligen använder Proton Drive, med osäkerheten kvar och utan sparande.';
const cases = [
  { name: 'paraphrased remaining work', parts: [uncertainWork], verdict: 'pass' },
  {
    name: 'several active parts',
    parts: ['Nils kan använda Proton Drive, men uppgiften är osäker.', 'Spara inte uppgifterna.'],
    verdict: 'pass',
  },
  {
    name: 'missing uncertainty',
    parts: ['Ange att Nils använder Proton Drive. Spara inte.'],
    verdict: 'fail',
  },
  {
    name: 'wrong target',
    parts: ['Ange att Nils kanske använder Nextcloud. Spara inte.'],
    verdict: 'fail',
  },
  {
    name: 'lost save prohibition',
    parts: ['Ange att Nils kanske använder Proton Drive.'],
    verdict: 'fail',
  },
  { name: 'missing judgment', parts: [uncertainWork], verdict: 'missing' },
  { name: 'duplicated judgment', parts: [uncertainWork], verdict: 'duplicate' },
  { name: 'inconclusive judgment', parts: [uncertainWork], verdict: 'inconclusive' },
] as const;

test.each(cases)(
  'retention assesses $name through active work and independent semantic evidence',
  {
    tags: ['technical'],
  },
  async ({ parts, verdict }) => {
    const original =
      'Behåll Fatimas beskrivning Spelar cello. Jag tror att Nils använder Proton Drive, men är inte säker. Spara inte.';
    const scenario: Scenario = {
      id: 'paraphrased-remaining-work',
      title: 'Retain the unfinished meaning after independent work is already satisfied',
      voice: false,
      fixture: {
        objects: [
          {
            id: 'fatima',
            type: 'Person',
            name: 'Fatima',
            properties: [
              { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Spelar cello' },
            ],
          },
          { id: 'nils-ek', type: 'Person', name: 'Nils Ek' },
          { id: 'nils-sjo', type: 'Person', name: 'Nils Sjö' },
          { id: 'drive', type: 'Tjänst', name: 'Proton Drive' },
        ],
        relationships: [],
        relationshipTypes: [],
        draft: { objects: {} },
      },
      steps: [
        {
          id: 'request',
          text: original,
          expected: { requirements: ['Den osäkra användningen ska vara registrerad.'] },
          clarification: {
            preservedRequests: [original],
            requirements: ['Fråga vilken Nils som avses utan ändringar eller sparande.'],
          },
        },
      ],
    };
    const inputs: JudgeInput[] = [];
    const model = textModel(() => [
      modelTool('ask_questions', {
        questions: parts.map((request) => ({
          kind: 'change',
          request,
          question: 'Menar du Nils Ek eller Nils Sjö?',
          dependsOnDraft: true,
        })),
      }),
    ]);
    const run = await runTextScenario(
      scenario,
      { modelFetch: model.provider },
      {
        profile: 'controlled',
        repetition: 1,
        judge: async (input) => {
          inputs.push(input);
          const result = input.requirements.map(({ id }) => ({
            id,
            outcome:
              id === 'backend-0'
                ? ('fail' as const)
                : id.endsWith('-retention') && (verdict === 'fail' || verdict === 'inconclusive')
                  ? verdict
                  : ('pass' as const),
            reason:
              id === 'backend-0'
                ? 'No usage recorded yet.'
                : 'Worked independent retention fixture.',
          }));
          const retained = result.filter(({ id }) => id.endsWith('-retention'));
          return verdict === 'missing'
            ? result.filter(({ id }) => !id.endsWith('-retention'))
            : verdict === 'duplicate'
              ? [...result, ...retained]
              : result;
        },
      },
    );
    expect(run.attempts[0]).toMatchObject({ outcome: 'fail', elapsedMs: null });
    if (verdict === 'pass' || verdict === 'fail')
      expect(run.attempts[0].assessment).toMatchObject({
        kind: verdict === 'pass' ? 'necessary_clarification' : 'correctness_failure',
        stateFailures: verdict === 'pass' ? [] : ['unfinished_instructions'],
      });
    else expect(run.attempts[0].assessment?.kind).not.toBe('necessary_clarification');
    const assessment = inputs.find((input) =>
      input.requirements.some(({ id }) => id.endsWith('-retention')),
    );
    expect(assessment).toBeDefined();
    expect(assessment?.context).toContain(original);
    for (const request of parts) expect(assessment?.context).toContain(request);
    expect(run.attempts[0].followUpSelection?.selected).toBeUndefined();
  },
);

test('historical wording cannot replace an absent active pending request', {
  tags: ['technical'],
}, async () => {
  const text = 'Ändra avgiften till 325 SEK per år. Behåll betalaren och spara inte.';
  const scenario: Scenario = {
    id: 'missing-active-work',
    title: 'Unfinished work must have an active carrier',
    voice: false,
    fixture: { objects: [], relationships: [], relationshipTypes: [], draft: { objects: {} } },
    steps: [{ id: 'request', text, expected: { requirements: [] } }],
  };
  const model = textModel(() => {
    throw new Error('No provider call is needed for state evidence.');
  });
  const environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
  try {
    expect(
      await environment.check(scenario.steps[0], environment.assistant, [], {
        preservedRequests: [text],
        requirements: ['Bevara alla återstående uppgifter.'],
      }),
    ).toContain('unfinished_instructions');
    const context = JSON.parse(
      environment.judgeContext(scenario.steps[0], ['unfinished_instructions'], text),
    );
    expect(context.historicalSummary).toBe(text);
    expect(context.observedState.pendingParts).toEqual([]);
    expect(context.observedState.expected.preservedRequests).toEqual([text]);
  } finally {
    await environment.close();
  }
});
