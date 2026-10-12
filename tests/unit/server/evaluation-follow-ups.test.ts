import { afterEach, expect, test, vi } from 'vitest';
import * as environments from '../../../scripts/model-evaluation/environment.js';
import {
  scenarioUtterances,
  selectFollowUp,
} from '../../../scripts/model-evaluation/follow-ups.js';
import { summarizeProfile } from '../../../scripts/model-evaluation/report.js';
import { runTextScenario } from '../../../scripts/model-evaluation/runner.js';
import * as speech from '../../../scripts/model-evaluation/speech.js';
import type { Attempt, JudgeInput, Scenario } from '../../../scripts/model-evaluation/types.js';
import { runVoiceScenario } from '../../../scripts/model-evaluation/voice-runner.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

afterEach(() => vi.restoreAllMocks());
const scenario: Scenario = {
  id: 'conditional-price',
  title: 'Conditional price clarification',
  voice: true,
  steps: [
    {
      id: 'price',
      text: 'Ändra priset för Molnlagring Plus till 229 kronor per månad.',
      expected: {
        objects: {
          'cloud-sub': {
            financialFacts: {
              price: { knowledge: 'known', value: '229' },
              currency: { knowledge: 'known', value: 'SEK' },
              paymentInterval: { knowledge: 'known', value: 'månad' },
            },
          },
        },
        requirements: ['Bekräfta ändringen eller ställ en riktad fråga.'],
      },
      followUps: [
        {
          id: 'clarify-price',
          text: 'Jag menar abonnemanget Molnlagring Plus.',
          when: 'Svaret frågar om priset avser tjänsten eller abonnemanget.',
          waiting: { requirements: [] },
          requirements: [],
        },
      ],
    },
    { id: 'next', text: 'Tack.', expected: { requirements: [] } },
  ],
};
const passingJudge = async (input: JudgeInput) =>
  input.requirements.map(({ id }) => ({
    id,
    outcome: 'pass' as const,
    reason: 'Verified by local fixture.',
  }));

test('waiting checks retain the original target and reject unrelated draft damage', {
  tags: ['technical'],
}, async () => {
  const environment = await environments.evaluationEnvironment(scenario, {
    modelFetch: textModel(() => [modelMessage('Svar.')]).provider,
  });
  try {
    const step = scenario.steps[0];
    const view = await environment.get<TextAssistantView>(environment.path);
    expect(await environment.check(step, view, [])).toEqual(['effective_objects']);
    expect(await environment.check(step, view, [], { requirements: [] })).toEqual([]);
    expect(await environment.check(step, view, [])).toEqual(['effective_objects']);
    const state = await environment.read();
    const lo = state.objects.find((object) => object.id === 'lo');
    if (!lo) throw new Error('Missing person fixture');
    await environment.post('map/draft', {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: lo.id,
      baseRevision: lo.revision,
      value: { typeId: lo.typeId, name: lo.name, description: 'Orelaterad ändring.' },
    });
    expect(await environment.check(step, view, [], { requirements: [] })).toContain(
      'effective_objects',
    );
  } finally {
    await environment.close();
  }
});

test.each([false, true])(
  'text keeps original outcomes and sends assistance only when needed: %s',
  {
    tags: ['technical'],
  },
  async (needsHelp) => {
    let environment: Awaited<ReturnType<typeof environments.evaluationEnvironment>>;
    let turn = 0;
    const model = textModel(async (body) => {
      if (body.input.at(-1)?.type === 'function_call_output')
        return [modelMessage('Utkastet är uppdaterat.')];
      if (turn++ === 0 && needsHelp)
        return [
          modelTool('ask_questions', { questions: ['Menar du tjänsten eller abonnemanget?'] }),
        ];
      const state = await environment.read();
      if (state.draft.changes.some((change) => change.id === 'cloud-sub'))
        return [modelMessage('Varsågod.')];
      const object = state.objects.find((item) => item.id === 'cloud-sub');
      if (!object) throw new Error('Missing subscription fixture');
      const { id: _id, householdId: _household, revision, ...value } = object;
      return [
        modelTool('propose_object', {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id: object.id,
          baseRevision: revision,
          value: { ...value, ...scenario.steps[0].expected.objects?.['cloud-sub'] },
        }),
      ];
    });
    environment = await environments.evaluationEnvironment(scenario, {
      modelFetch: model.provider,
    });
    vi.spyOn(environments, 'evaluationEnvironment').mockResolvedValue(environment);
    const result = await runTextScenario(
      scenario,
      {},
      {
        profile: 'local',
        repetition: 1,
        followUps: true,
        judge: passingJudge,
      },
    );
    expect(result.attempts.map((attempt) => [attempt.step, attempt.outcome])).toEqual(
      needsHelp
        ? [
            ['price', 'fail'],
            ['clarify-price', 'pass'],
            ['next', 'pass'],
          ]
        : [
            ['price', 'pass'],
            ['next', 'pass'],
          ],
    );
    expect(result.attempts.filter((attempt) => attempt.followUpFor)).toHaveLength(
      needsHelp ? 1 : 0,
    );
    const summary = summarizeProfile(result.attempts, [scenario], 'local', 'text', [1]);
    expect(summary.qualified).toBe(!needsHelp);
    expect(summary.assistance.replies).toBe(needsHelp ? 1 : 0);
    expect(summary.assistance.completedSteps).toHaveLength(needsHelp ? 1 : 0);
    if (needsHelp) {
      expect(result.attempts[0].fixed).toEqual(['effective_objects']);
      expect(result.attempts[1].assistedElapsedMs).toBeGreaterThan(0);
      expect(summary.outcomes).toMatchObject({ fail: 1, pass: 1 });
    }
  },
);

test.each([
  'unrelated',
  'inconclusive',
  'missing',
  'duplicate',
  'unsafe-state',
  'content-failure',
  'no-question',
  'two-matches',
  'voice-omission',
  'judge-error',
])('a follow-up never bypasses an unresolved gate: %s', { tags: ['technical'] }, async (mode) => {
  const step = structuredClone(scenario.steps[0]);
  if (mode === 'two-matches' && step.followUps)
    step.followUps.push({ ...step.followUps[0], id: 'other' });
  const attempt: Attempt = {
    scenario: scenario.id,
    step: step.id,
    profile: 'local',
    repetition: 1,
    modality: 'text',
    outcome: 'fail',
    fixed: ['effective_objects'],
    elapsedMs: null,
    backendCostUsd: 0,
    content: [
      { id: 'backend-0', outcome: mode === 'content-failure' ? 'fail' : 'pass', reason: 'Fixture' },
    ],
  };
  const judge = vi.fn(async (input: JudgeInput) => {
    if (mode === 'judge-error') throw new Error('Provider rejected selection request');
    const pass = await passingJudge(input);
    if (mode === 'missing') return [];
    if (mode === 'duplicate') return [...pass, ...pass];
    if (mode === 'voice-omission')
      return pass.map((item) => ({
        ...item,
        outcome: item.id.startsWith('voice-') ? ('fail' as const) : ('pass' as const),
      }));
    if (mode === 'unrelated' || mode === 'inconclusive')
      return pass.map((item) => ({
        ...item,
        outcome: mode === 'unrelated' ? ('fail' as const) : ('inconclusive' as const),
      }));
    return pass;
  });
  const selected = await selectFollowUp({
    step,
    attempt,
    questionPending: mode !== 'no-question',
    sources: {
      backend: { text: 'A question.', complete: true },
      ...(mode === 'voice-omission' ? { voice: { text: 'No question.', complete: true } } : {}),
    },
    checkWaiting: async () => (mode === 'unsafe-state' ? ['unrequested_save_attempt'] : []),
    judge,
  });
  expect(selected).toBeUndefined();
  expect(attempt.outcome).toBe('fail');
  if (mode === 'judge-error')
    expect(attempt.followUpSelection?.reason).toContain('selection failed');
  if (['unsafe-state', 'content-failure', 'no-question'].includes(mode))
    expect(judge).not.toHaveBeenCalled();
});

test('conditional reply identities cannot collide with ordinary steps', {
  tags: ['technical'],
}, () => {
  const invalid = structuredClone(scenario);
  const reply = invalid.steps[0].followUps?.[0];
  if (!reply) throw new Error('Missing reply fixture');
  reply.id = 'next';
  expect(() => scenarioUtterances(invalid, true)).toThrow('evaluation_duplicate_step_ids');
});

test('voice plays a selected reply in the same connection and retains the failed base attempt', {
  tags: ['technical'],
}, async () => {
  let current = 'price';
  let observe: NonNullable<Parameters<typeof environments.evaluationEnvironment>[1]>['observe'];
  const view = () => ({
    revision: 1,
    review: { version: 1, contentVersion: 1 },
    phase: 'ready',
    queuedMessages: 0,
    reply: 'Svar.',
    modelReply: 'Menar du abonnemanget?',
    questionPending: current === 'price',
  });
  const environment = {
    path: 'assistant',
    assistant: { id: 'assistant' },
    get: async () => view(),
    post: async (path: string) => {
      if (path.endsWith('/poll')) {
        observe?.({
          at: Date.now() - 3000,
          sessionId: 'test',
          kind: 'voice_event',
          data: { role: 'assistant', delta: 'Menar du abonnemanget?' },
        });
        observe?.({ at: Date.now() - 3000, sessionId: 'test', kind: 'voice_commentary', data: {} });
      }
      return { assistant: view(), voice: { phase: 'listening' } };
    },
    check: async (_step: unknown, _view: unknown, _actions: unknown, waiting?: unknown) =>
      current === 'price' && !waiting ? ['effective_objects'] : [],
    judgeContext: () => 'Fixture',
    read: async () => ({}),
    close: vi.fn(async () => {}),
  };
  vi.spyOn(environments, 'evaluationEnvironment').mockImplementation(async (_scenario, options) => {
    observe = options?.observe;
    return environment as unknown as Awaited<ReturnType<typeof environments.evaluationEnvironment>>;
  });
  const connection = {
    start: vi.fn(async () => 'voice'),
    play: vi.fn(async (id: string) => {
      current = id;
      return { startedAt: Date.now() - 4000, endedAt: Date.now() - 3000 };
    }),
    retire: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  vi.spyOn(speech, 'speechConnection').mockResolvedValue(
    connection as unknown as Awaited<ReturnType<typeof speech.speechConnection>>,
  );
  vi.spyOn(speech, 'referenceSpeech').mockResolvedValue({
    clip: { frames: 24000, sampleRate: 24000 },
    pcm: '',
  } as Awaited<ReturnType<typeof speech.referenceSpeech>>);
  const result = await runVoiceScenario(
    scenario,
    {},
    { profile: 'local', repetition: 1, followUps: true, judge: passingJudge },
  );
  expect(connection.play.mock.calls.map(([id]) => id)).toEqual(['price', 'clarify-price', 'next']);
  expect(connection.start).toHaveBeenCalledOnce();
  expect(connection.close).toHaveBeenCalledOnce();
  expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['fail', 'pass', 'pass']);
  expect(result.attempts[1].followUpFor).toBe('price');
});

test('missing optional audio stops voice before creating the application or session', {
  tags: ['technical'],
}, async () => {
  const environment = vi.spyOn(environments, 'evaluationEnvironment');
  vi.spyOn(speech, 'referenceSpeech').mockImplementation(async (id) => {
    if (id === 'clarify-price') throw new Error('evaluation_audio_missing');
    return { clip: { frames: 24000, sampleRate: 24000 }, pcm: '' } as Awaited<
      ReturnType<typeof speech.referenceSpeech>
    >;
  });
  await expect(
    runVoiceScenario(scenario, {}, { profile: 'local', repetition: 1, followUps: true }),
  ).rejects.toThrow('evaluation_audio_missing');
  expect(environment).not.toHaveBeenCalled();
});
