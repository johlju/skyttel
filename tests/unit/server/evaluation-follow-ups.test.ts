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
import { liveProvider, voiceAnswerParts } from '../../support/live-provider.js';
import {
  modelMessage,
  modelTool,
  pendingUpdate,
  textModel,
  verifiedAnswers,
} from '../../support/text-model.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
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
            properties: [
              {
                id: 'description',
                label: 'Beskrivning',
                kind: 'text',
                value: 'Påhittat katalogobjekt.',
              },
              { id: 'price', label: 'Pris', kind: 'number', value: 229 },
              { id: 'currency', label: 'Valuta', kind: 'text', value: 'SEK' },
              { id: 'paymentInterval', label: 'Betalningsintervall', kind: 'text', value: 'månad' },
            ],
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

test.each([
  { modality: 'text', evidence: 'preserved' },
  { modality: 'voice', evidence: 'preserved' },
  { modality: 'voice', evidence: 'assessment-stop' },
  { modality: 'text', evidence: 'missing-retention' },
  { modality: 'text', evidence: 'lost-constraints' },
  { modality: 'voice', evidence: 'lost-constraints' },
  { modality: 'text', evidence: 'wrong-state' },
] as const)(
  '$modality assesses an explicit safe limit after clarification without claiming completion ($evidence)',
  {
    tags: ['technical'],
    timeout: 15_000,
  },
  async ({ modality, evidence }) => {
    const request = 'Ändra beskrivningen till Läser poesi. Bevara övriga uppgifter och spara inte.';
    const answer = 'Jag menar Lo Berg.';
    const continued = `${request}\nFörtydligande: ${answer}`;
    const question = 'Vilken person menar du?';
    const reply = {
      id: 'identify-person',
      text: answer,
      when: 'The response asks which person to change.',
      waiting: { requirements: ['Ask which person the user means and keep all existing work.'] },
      requirements: ['Confirm the completed description change.'],
      safeInability: {
        preservedRequests: evidence === 'missing-retention' ? [] : [request, continued],
        requirements: ['Explain the limit and retain the original restrictions and clarification.'],
      },
    };
    const advanced: Scenario = {
      id: 'continued-limit',
      title: 'Verified inability after a necessary clarification',
      voice: modality === 'voice',
      group: 'complex',
      steps: [
        {
          id: 'description',
          text: request,
          expected: {
            objects: {
              lo: {
                properties: [
                  { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Läser poesi' },
                ],
              },
            },
            requirements: ['Confirm the completed description change.'],
          },
          followUps: [reply],
          safeInability: {
            objectTypes: [{ name: 'Parent-only safe state' }],
            preservedRequests: [request],
            requirements: ['This alternate state belongs only to the original request.'],
          },
        },
        ...(evidence === 'assessment-stop'
          ? [
              {
                id: 'unstarted',
                text: 'Vad återstår?',
                expected: { requirements: [] },
              },
            ]
          : []),
      ],
    };
    let turn = 0;
    const model = textModel((body) => {
      const first = turn++ === 0;
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (evidence === 'wrong-state' && turn === 2)
        return [
          modelTool('propose_object_type', {
            id: 'unexpected-type',
            baseRevision: null,
            version: input.draft.version,
            contentVersion: input.draft.contentVersion,
            value: { name: 'Orelaterad typ', description: '' },
          }),
        ];
      return [
        modelTool('ask_questions', {
          questions: [
            {
              kind: 'change',
              request: first
                ? request
                : evidence === 'lost-constraints'
                  ? 'Ändra beskrivningen.'
                  : continued,
              question: first ? question : 'Uppdraget ryms inte. Kan du avgränsa det?',
              dependsOnDraft: true,
            },
          ],
          ...(first ? {} : { updates: [pendingUpdate(body, question)] }),
        }),
      ];
    });
    const live = liveProvider();
    let offset = 0;
    if (modality === 'voice') {
      vi.spyOn(speech, 'referenceSpeech').mockResolvedValue({
        clip: { frames: 24000, sampleRate: 24000 },
        pcm: '',
      } as Awaited<ReturnType<typeof speech.referenceSpeech>>);
      // The controlled media adapter drives actual authenticated voice routes
      // and provider events; the server, draft and pending work remain real.
      vi.spyOn(speech, 'speechConnection').mockImplementation(
        async (environment) =>
          ({
            async start() {
              const view = await environment.get<TextAssistantView>(environment.path);
              const result = await environment.post<{ voice: { id: string } }>(
                `${environment.path}/voice`,
                {
                  sdp: 'synthetic-offer',
                  revision: view.revision,
                  draftVersion: view.review.version,
                  contentVersion: view.review.contentVersion,
                },
              );
              return result.voice.id;
            },
            async play(id: string) {
              const text = id === 'description' ? request : answer;
              const providerId = [...live.channels.keys()][0];
              const startedAt = Date.now();
              live.emit(providerId, {
                type: 'session.input_transcript.delta',
                event_id: crypto.randomUUID(),
                delta: text,
                start_ms: offset,
                end_ms: ++offset,
              });
              live.emit(providerId, {
                type: 'session.delegation.created',
                event_id: crypto.randomUUID(),
                offset_ms: offset,
                delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
              });
              return { startedAt, endedAt: Date.now(), frames: 24000, sha256: 'controlled-audio' };
            },
            retire: async () => {},
            close: async () => {},
          }) as Awaited<ReturnType<typeof speech.speechConnection>>,
      );
    }
    let stopped = false;
    let judgeCalls = 0;
    const run = await (modality === 'voice' ? runVoiceScenario : runTextScenario)(
      advanced,
      {
        modelFetch: model.provider,
        ...(modality === 'voice'
          ? {
              liveFetch: live.provider,
              liveSideband: (...args: Parameters<typeof live.attach>) => {
                const sideband = live.attach(...args);
                const send = sideband.send.bind(sideband);
                sideband.send = (event) => {
                  send(event);
                  for (const text of voiceAnswerParts(live.sent.slice(-1))) {
                    queueMicrotask(() =>
                      live.emit(args[1], {
                        type: 'session.output_transcript.delta',
                        event_id: crypto.randomUUID(),
                        delta: text,
                        start_ms: offset,
                        end_ms: ++offset,
                      }),
                    );
                  }
                };
                return sideband;
              },
            }
          : {}),
      },
      {
        profile: 'local',
        repetition: 1,
        followUps: true,
        stopped: () => stopped,
        stopReason: () => (stopped ? 'evaluation_unknown_charge' : null),
        judgeCosts: () => (stopped ? null : judgeCalls * 0.001),
        judge: async (input) => {
          judgeCalls++;
          if (input.requirements.some(({ id }) => id.includes('-inability-'))) {
            expect(JSON.parse(input.context.split('\n')[0]).request).toBe(request);
            expect(input.context).toContain(JSON.stringify(answer));
          }
          if (
            evidence === 'assessment-stop' &&
            input.requirements.some(({ id }) => id.includes('-inability-'))
          ) {
            stopped = true;
            throw new Error('evaluation_unknown_charge');
          }
          return input.requirements.map(({ id }) => ({
            id,
            outcome:
              id.includes('-inability-') ||
              id.includes('-follow-up') ||
              id.includes('-necessary') ||
              id.includes('-waiting-')
                ? 'pass'
                : 'fail',
            reason: 'Controlled observation of incomplete work and retained intent.',
          }));
        },
      },
    );
    expect(run.attempts).toHaveLength(evidence === 'assessment-stop' ? 3 : 2);
    expect(run.attempts[0]).toMatchObject({
      outcome: 'fail',
      assessment: { kind: 'necessary_clarification' },
    });
    expect(run.attempts[1], JSON.stringify(run.attempts[1])).toMatchObject({
      outcome: 'fail',
      fixed: expect.arrayContaining(['effective_objects']),
      elapsedMs: null,
      assistedElapsedMs: null,
      assessment: { kind: evidence === 'preserved' ? 'safe_inability' : 'inconclusive' },
    });
    if (evidence === 'preserved' || evidence === 'assessment-stop')
      expect(run.attempts[1].assessment?.stateFailures).toEqual([]);
    if (evidence === 'missing-retention' || evidence === 'lost-constraints')
      expect(run.attempts[1].assessment?.stateFailures).toContain('unfinished_instructions');
    if (evidence === 'wrong-state') {
      expect(run.attempts[1].fixed).toContain('new_types');
      expect(run.attempts[1].assessment?.stateFailures).toContain('new_types');
      expect(
        run.finalMap.draft.objectTypes?.some((change) => change.after?.name === 'Orelaterad typ'),
      ).toBe(true);
    }
    if (evidence === 'assessment-stop') {
      expect(run.attempts[1].content?.every(({ outcome }) => outcome === 'fail')).toBe(true);
      expect(run.attempts[1].judgeCostUsd).toBeNull();
      expect(run.attempts[2].outcome).toBe('not_run');
      expect(model.requests).toHaveLength(2);
    }
  },
);

test('an unnecessary clarification cannot qualify merely because a catalog reply matches', {
  tags: ['technical'],
}, async () => {
  const attempt: Attempt = {
    scenario: scenario.id,
    step: 'price',
    profile: 'local',
    repetition: 1,
    modality: 'text',
    outcome: 'fail',
    fixed: ['effective_objects'],
    elapsedMs: null,
    backendCostUsd: 0,
    content: [{ id: 'backend-0', outcome: 'pass', reason: 'Original observation.' }],
  };
  const reply = await selectFollowUp({
    step: scenario.steps[0],
    attempt,
    stateFailures: ['effective_objects'],
    questionPending: true,
    sources: { backend: { text: 'Menar du det entydigt namngivna abonnemanget?', complete: true } },
    checkWaiting: async () => [],
    waitingContext: () => 'The exact subscription name unambiguously identifies one subscription.',
    judge: async (input) =>
      input.requirements.map(({ id }) => ({
        id,
        outcome: id.endsWith('-necessary') ? 'fail' : 'pass',
        reason: id.endsWith('-necessary')
          ? 'The request and available facts already identify the target.'
          : 'The reply matches.',
      })),
  });
  expect(reply).toBeUndefined();
  expect(attempt).toMatchObject({
    outcome: 'fail',
    elapsedMs: null,
    fixed: ['effective_objects'],
    content: [{ id: 'backend-0', outcome: 'pass', reason: 'Original observation.' }],
    assessment: {
      kind: 'unnecessary_clarification',
      stateFailures: [],
      reason: expect.stringContaining('already identify'),
    },
  });
});

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
      value: {
        typeId: lo.typeId,
        name: lo.name,
        properties: [
          { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Orelaterad ändring.' },
        ],
      },
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
  'unexpected_selection',
  'selection_unconfirmed',
  'no-state-failure',
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
  if (mode === 'unexpected_selection' || mode === 'selection_unconfirmed') attempt.fixed.push(mode);
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
    stateFailures: mode === 'no-state-failure' ? [] : ['effective_objects'],
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
  if (
    [
      'unsafe-state',
      'content-failure',
      'no-question',
      'unexpected_selection',
      'selection_unconfirmed',
      'no-state-failure',
    ].includes(mode)
  )
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

test.each(['pass', 'missing-fact', 'unsafe-save', 'missing-context'])(
  'a separate waiting contract preserves independent obligations: %s',
  { tags: ['technical'] },
  async (mode) => {
    const step = structuredClone(scenario.steps[0]);
    const reply = step.followUps?.[0];
    if (!reply) throw new Error('Missing reply fixture');
    reply.waiting.requirements = ['Answer the independent price question.'];
    const attempt: Attempt = {
      scenario: scenario.id,
      step: step.id,
      profile: 'local',
      repetition: 1,
      modality: 'voice',
      outcome: 'fail',
      fixed: ['effective_objects'],
      content: [{ id: 'backend-0', outcome: 'fail', reason: 'Work awaits clarification.' }],
      elapsedMs: null,
      backendCostUsd: 0,
    };
    const originalContent = structuredClone(attempt.content);
    const selected = await selectFollowUp({
      step,
      attempt,
      stateFailures: ['effective_objects'],
      questionPending: true,
      sources: {
        backend: { text: 'Price and question.', complete: true },
        voice: { text: 'Spoken price and question.', complete: true },
      },
      checkWaiting: async () => (mode === 'unsafe-save' ? ['unrequested_save_attempt'] : []),
      waitingContext: mode === 'missing-context' ? undefined : () => 'Verified waiting state.',
      judge: async (input) => {
        expect(input.context).toContain('Verified waiting state.');
        expect(input.requirements.filter((item) => item.id.includes('-waiting-'))).toHaveLength(2);
        return (await passingJudge(input)).map((item) => ({
          ...item,
          outcome: mode === 'missing-fact' && item.id === 'voice-waiting-0' ? 'fail' : item.outcome,
        }));
      },
    });
    expect(selected?.id).toBe(mode === 'pass' ? reply.id : undefined);
    expect(attempt.outcome).toBe('fail');
    expect(attempt.content).toEqual(originalContent);
  },
);

test('a renewed save after clarification completes the original target exactly once', {
  tags: ['technical'],
}, async () => {
  const saveScenario: Scenario = {
    id: 'clarified-save',
    title: 'Save after clarification',
    voice: false,
    steps: [
      {
        id: 'save',
        text: 'Spara hela utkastet.',
        expected: { saves: 1, requirements: ['Report the verified save.'] },
        followUps: [
          {
            id: 'renew-save',
            text: 'Jag menar hela utkastet. Spara hela utkastet nu.',
            when: 'The response asks which draft to save.',
            waiting: { saves: 0, requirements: ['Ask for a renewed save request.'] },
            requirements: ['Report the verified save.'],
          },
        ],
      },
    ],
  };
  let environment: Awaited<ReturnType<typeof environments.evaluationEnvironment>>;
  let turn = 0;
  const model = textModel(async (request) => {
    if (turn++ === 0)
      return [modelTool('ask_questions', { questions: ['Vilket utkast menar du?'] })];
    if (turn === 2)
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: verifiedAnswers(request, ['Vilket utkast menar du?']),
          continueResponse: true,
        }),
      ];
    const state = await environment.read();
    return [
      modelTool('save_draft', {
        version: state.draft.version,
        contentVersion: state.contentVersion,
      }),
    ];
  });
  environment = await environments.evaluationEnvironment(saveScenario, {
    modelFetch: model.provider,
  });
  vi.spyOn(environments, 'evaluationEnvironment').mockResolvedValue(environment);
  const result = await runTextScenario(
    saveScenario,
    {},
    {
      profile: 'local',
      repetition: 1,
      followUps: true,
      judge: async (input) => {
        const context = input.context.startsWith('{') ? JSON.parse(input.context) : undefined;
        if (context?.observedState.saveOperations.length) {
          expect(context.observedState.saveOperations).toHaveLength(1);
          expect(context.observedState.historyChanges).toBe(1);
        }
        return (await passingJudge(input)).map((item) => ({
          ...item,
          outcome: context?.request === saveScenario.steps[0].text ? 'fail' : item.outcome,
        }));
      },
    },
  );
  expect(result.attempts.map((item) => [item.step, item.outcome, item.fixed])).toEqual([
    ['save', 'fail', ['save_receipts_history', 'save_incomplete']],
    ['renew-save', 'pass', []],
  ]);
  expect(result.attempts[1].followUpFor).toBe('save');
  expect(result.finalMap.draft.changes).toEqual([]);
});

test.each([0, 12000])(
  'voice retains the base verdict and connection during %i ms judge calls',
  {
    tags: ['technical'],
  },
  async (judgeDelay) => {
    vi.useFakeTimers();
    let lastPoll = Date.now();
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
          if (Date.now() - lastPoll > 10000) throw new Error('voice_connection_lost');
          lastPoll = Date.now();
          observe?.({
            at: Date.now() - 3000,
            sessionId: 'test',
            kind: 'voice_event',
            data: { role: 'assistant', delta: 'Menar du abonnemanget?' },
          });
          observe?.({
            at: Date.now() - 3000,
            sessionId: 'test',
            kind: 'voice_commentary',
            data: {},
          });
        }
        return { assistant: view(), voice: { phase: 'listening' } };
      },
      check: async (
        step: Scenario['steps'][number],
        _view: unknown,
        _actions: unknown,
        waiting?: unknown,
      ) => {
        if (current === 'clarify-price') expect(step.id).toBe('price');
        return current === 'price' && !waiting ? ['effective_objects'] : [];
      },
      judgeContext: () => 'Fixture',
      read: async () => ({}),
      close: vi.fn(async () => {}),
    };
    vi.spyOn(environments, 'evaluationEnvironment').mockImplementation(
      async (_scenario, options) => {
        observe = options?.observe;
        return environment as unknown as Awaited<
          ReturnType<typeof environments.evaluationEnvironment>
        >;
      },
    );
    const connection = {
      start: vi.fn(async () => 'voice'),
      play: vi.fn(async (id: string) => {
        if (Date.now() - lastPoll > 10000) throw new Error('voice_connection_lost');
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
    const run = runVoiceScenario(
      scenario,
      {},
      {
        profile: 'local',
        repetition: 1,
        followUps: true,
        judge: async (input) => {
          if (judgeDelay) await new Promise((resolve) => setTimeout(resolve, judgeDelay));
          return passingJudge(input);
        },
      },
    );
    await vi.advanceTimersByTimeAsync(judgeDelay * 4);
    const result = await run;
    expect(connection.play.mock.calls.map(([id]) => id)).toEqual([
      'price',
      'clarify-price',
      'next',
    ]);
    expect(connection.start).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['fail', 'pass', 'pass']);
    expect(result.attempts[1].followUpFor).toBe('price');
    expect(vi.getTimerCount()).toBe(0);
  },
);

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
