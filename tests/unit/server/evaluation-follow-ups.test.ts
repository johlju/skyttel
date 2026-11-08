import { afterEach, expect, test, vi } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import * as environments from '../../../scripts/model-evaluation/environment.js';
import {
  scenarioUtterances,
  selectFollowUp,
} from '../../../scripts/model-evaluation/follow-ups.js';
import { recordedPlayback } from '../../../scripts/model-evaluation/playback.js';
import { summarizeProfile } from '../../../scripts/model-evaluation/report.js';
import { runTextScenario } from '../../../scripts/model-evaluation/runner.js';
import * as speech from '../../../scripts/model-evaluation/speech.js';
import type { Attempt, JudgeInput, Scenario } from '../../../scripts/model-evaluation/types.js';
import { scenarioGroups } from '../../../scripts/model-evaluation/types.js';
import { runVoiceScenario } from '../../../scripts/model-evaluation/voice-runner.js';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantReview, TextAssistantView } from '../../../src/shared/text-assistant.js';
import { liveProvider, voiceAnswerParts } from '../../support/live-provider.js';
import {
  lastToolResult,
  modelMessage,
  modelTool,
  pendingUpdate,
  textModel,
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

test('the catalog ordinary two-ambiguities exchange reaches its answer and requested save', {
  tags: ['technical'],
}, async () => {
  const ordinary = catalog.scenarios.find(({ id }) => id === 'two-ambiguities') as Scenario;
  const questions = ['Vilken Alex menar du?', 'Vilket bankkonto menar du?'];
  let stage = 0;
  let map: MapState;
  let types: MapState;
  const model = textModel((request) => {
    const turn = JSON.parse(
      String(request.input.findLast((item) => item.role === 'user')?.content),
    );
    switch (stage++) {
      case 0:
        return [modelTool('read_map', {})];
      case 1:
        map = lastToolResult(request);
        return [modelTool('read_type_catalog', {})];
      case 2: {
        types = lastToolResult(request);
        const cloud = map.objects.find(({ id }) => id === 'cloud-sub');
        const uses = types.relationshipTypes.find(({ name }) => name === 'Använder');
        if (!cloud || !uses) throw new Error('Missing catalog object or relationship type');
        const { id, revision, householdId: _household, ...value } = cloud;
        return [
          modelTool('submit_changes', {
            version: turn.draft.version,
            contentVersion: turn.draft.contentVersion,
            completion: 'draft',
            questions: questions.map((question) => ({
              kind: 'change',
              request: ordinary.steps[0].text,
              question,
              dependsOnDraft: true,
            })),
            operations: [
              {
                name: 'propose_object',
                arguments: {
                  id,
                  baseRevision: revision,
                  value: {
                    ...value,
                    properties: value.properties?.map((property) =>
                      property.id === 'price' ? { ...property, value: 229 } : property,
                    ),
                  },
                },
              },
              {
                name: 'propose_relationship',
                arguments: {
                  id: 'lo-spotify',
                  baseRevision: null,
                  value: { typeId: uses.id, sourceId: 'lo', targetId: 'spotify' },
                },
              },
            ],
          }),
        ];
      }
      case 3:
        expect(turn.message).toBe(ordinary.steps[1].text);
        return [
          modelTool('ask_questions', {
            questions: [],
            updates: questions.map((question) => pendingUpdate(request, question)),
            continueResponse: true,
          }),
        ];
      case 4: {
        const parts = lastToolResult(request).pendingParts;
        const uses = types.relationshipTypes.find(({ name }) => name === 'Använder');
        const pays = types.relationshipTypes.find(({ name }) => name === 'Betalas med');
        const card = map.relationships.find(
          (edge) => edge.sourceId === 'spotify-sub' && edge.targetId === 'card',
        );
        if (!uses || !pays || !card) throw new Error('Missing catalog relationships');
        return [
          modelTool('submit_changes', {
            version: turn.draft.version,
            contentVersion: turn.draft.contentVersion,
            completion: 'draft',
            resolves: parts
              .filter((part: { status: string }) => part.status === 'ready')
              .map(({ id, revision }: { id: string; revision: number }) => ({ id, revision })),
            operations: [
              {
                name: 'propose_relationship',
                arguments: {
                  id: 'alex-m365',
                  baseRevision: null,
                  value: { typeId: uses.id, sourceId: 'alex', targetId: 'm365' },
                },
              },
              {
                name: 'propose_relationship',
                arguments: {
                  id: card.id,
                  baseRevision: card.revision,
                  value: null,
                },
              },
              {
                name: 'propose_relationship',
                arguments: {
                  id: 'spotify-reserve',
                  baseRevision: null,
                  value: { typeId: pays.id, sourceId: 'spotify-sub', targetId: 'reserve' },
                },
              },
            ],
          }),
        ];
      }
      case 5:
        expect(turn.message).toBe(ordinary.steps[2].text);
        return [
          modelTool('save_draft', {
            version: turn.draft.version,
            contentVersion: turn.draft.contentVersion,
          }),
        ];
      default:
        throw new Error('Unexpected provider turn');
    }
  });
  const result = await runTextScenario(
    ordinary,
    { modelFetch: model.provider },
    {
      profile: 'local',
      repetition: 1,
      followUps: true,
      judge: passingJudge,
    },
  );
  expect(result.attempts.map(({ step, outcome, fixed }) => ({ step, outcome, fixed }))).toEqual([
    { step: 'oklarheter-med-sparbegaran', outcome: 'pass', fixed: [] },
    { step: 'oklarheter-foljdsvar', outcome: 'pass', fixed: [] },
    { step: 'spara-hela-utkastet', outcome: 'pass', fixed: [] },
  ]);
  expect(result.attempts[0].assessment).toBeUndefined();
  expect(result.finalMap.draft.changes).toEqual([]);
  expect(summarizeProfile(result.attempts, [ordinary], 'local', 'text', [1])).toMatchObject({
    fullCatalogQualified: true,
    correctnessFailures: [],
    unresolvedAssessments: [],
    groups: {
      everyday: {
        completedScenarios: 1,
        scenarioTimes: [{ scenario: 'two-ambiguities', medianMs: expect.any(Number) }],
      },
    },
  });
});

test.each(
  scenarioGroups.flatMap((group) =>
    ['disabled', 'unmatched', 'ambiguous'].flatMap((replyMode) =>
      [false, true].map((retained) => ({ group, replyMode, retained })),
    ),
  ),
)(
  'an unanswered conditional question requires retained meaning: $group, replies=$replyMode, retained=$retained',
  {
    tags: ['technical'],
  },
  async ({ group, replyMode, retained }) => {
    const request =
      'Lägg till ett separat Används av-samband från Norrsken Molnlagring som anger att ingen använder tjänsten. Behåll befintliga samband.';
    const conditional: Scenario = {
      id: 'conditional-alternative',
      title: 'A necessary alternative outside the supported scripted reply',
      group,
      voice: false,
      steps: [
        {
          id: 'no-user',
          text: request,
          expected: { requirements: ['Confirm the requested new relationship.'] },
          followUps: [
            {
              id: 'name-person',
              text: 'Jag menar Lo Berg.',
              when: 'The question asks which person uses the service.',
              waiting: {
                requirements: [
                  'Explain why the relationship needs a person and ask permission for an alternative representation without changing the map.',
                ],
              },
              requirements: ['Confirm the completed relationship.'],
            },
          ],
        },
      ],
    };
    const reply = conditional.steps[0].followUps?.[0];
    if (replyMode === 'ambiguous' && reply)
      conditional.steps[0].followUps?.push({ ...reply, id: 'another-person-reply' });
    const model = textModel(() => [
      modelTool('ask_questions', {
        questions: [
          {
            kind: 'change',
            request: retained ? request : 'Lägg till ett samband.',
            question:
              'Ett Används av-samband kräver en person. Vill du lägga Ingen använder tjänsten som en egenskap och behålla sambanden?',
            dependsOnDraft: true,
          },
        ],
      }),
    ]);
    const result = await runTextScenario(
      conditional,
      { modelFetch: model.provider },
      {
        profile: 'local',
        repetition: 1,
        followUps: replyMode !== 'disabled',
        judge: async (input) =>
          (await passingJudge(input)).map((item) => ({
            ...item,
            outcome:
              item.id === 'backend-0' ||
              (!retained && item.id.endsWith('-retention')) ||
              (replyMode === 'unmatched' && item.id.endsWith('-follow-up'))
                ? 'fail'
                : 'pass',
          })),
      },
    );
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ outcome: 'fail', fixed: [], elapsedMs: null });
    expect(result.attempts[0].followUpSelection?.selected).toBeUndefined();
    expect(result.attempts[0].assessment?.kind).toBe(
      retained ? 'necessary_clarification' : 'correctness_failure',
    );
    if (!retained)
      expect(result.attempts[0].followUpSelection?.candidates[0].fixed).toContain(
        'unfinished_instructions',
      );
    const summary = summarizeProfile(result.attempts, [conditional], 'local', 'text', [1]);
    expect(summary).toMatchObject({
      fullCatalogQualified: false,
      correctnessFailures: retained
        ? []
        : [{ scenario: conditional.id, step: 'no-user', repetition: 1 }],
      unresolvedAssessments: retained
        ? [{ scenario: conditional.id, step: 'no-user', repetition: 1 }]
        : [],
    });
    expect(summary.groups[group].scenarioTimes).toEqual([]);
  },
);

test.each(
  (
    [
      { rawOutcome: 'fail', evidence: 'necessary' },
      { rawOutcome: 'pass', evidence: 'necessary' },
      { rawOutcome: 'pass', evidence: 'missing-retention' },
      { rawOutcome: 'pass', evidence: 'missing-contract' },
      { rawOutcome: 'pass', evidence: 'inconclusive' },
      { rawOutcome: 'pass', evidence: 'unnecessary' },
      { rawOutcome: 'pass', evidence: 'completed-answer' },
    ] as const
  ).flatMap((entry) => scenarioGroups.map((group) => ({ ...entry, group }))),
)(
  'a declared clarification preserves raw $rawOutcome and separates completion ($evidence, $group)',
  {
    tags: ['technical'],
  },
  async ({ rawOutcome, evidence, group }) => {
    const completed = evidence === 'completed-answer';
    const request = completed
      ? 'Förklara varför Används av-samband kräver en person.'
      : 'Lägg till ett separat Används av-samband från Norrsken Molnlagring som anger att ingen använder tjänsten. Behåll befintliga samband.';
    const question =
      'Ett Används av-samband kräver en person. Vill du i stället lägga texten Ingen använder tjänsten som en egenskap och behålla sambanden?';
    const step = {
      id: 'no-user',
      text: request,
      expected: {
        requirements: [
          completed
            ? 'Explain why the relationship needs a person.'
            : 'Ask for the missing relationship endpoint.',
        ],
      },
      clarification: {
        preservedRequests: evidence === 'missing-contract' ? [] : [request],
        requirements: [
          'Explain that the relationship needs a person and ask a relevant safe clarification or permission for an alternative representation. Do not change the map or claim completion.',
        ],
      },
    };
    const clarificationScenario: Scenario = {
      id: 'no-user',
      title: 'A safe alternative that has no scripted reply',
      group,
      voice: false,
      steps: [step],
    };
    const model = textModel(() =>
      completed
        ? [modelMessage('Ett Används av-samband kopplar en tjänst till en person.')]
        : [
            modelTool('ask_questions', {
              questions: [
                {
                  kind: 'change',
                  request: evidence === 'missing-retention' ? 'Lägg till ett samband.' : request,
                  question,
                  dependsOnDraft: true,
                },
              ],
            }),
          ],
    );
    const result = await runTextScenario(
      clarificationScenario,
      { modelFetch: model.provider },
      {
        profile: 'local',
        repetition: 1,
        followUps: false,
        judge: async (input) =>
          (await passingJudge(input)).map((item) => ({
            ...item,
            outcome:
              item.id === 'backend-0'
                ? rawOutcome
                : evidence === 'missing-retention' && item.id.endsWith('-retention')
                  ? 'fail'
                  : evidence === 'unnecessary' && item.id.endsWith('-necessary')
                    ? 'fail'
                    : evidence === 'inconclusive' && item.id.endsWith('-necessary')
                      ? 'inconclusive'
                      : item.outcome,
          })),
      },
    );
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      outcome: rawOutcome,
      fixed: [],
      content: [{ id: 'backend-0', outcome: rawOutcome }],
      elapsedMs: completed ? expect.any(Number) : null,
      timing: { successfulCompletionMs: completed ? expect.any(Number) : null },
    });
    expect(result.attempts[0].observedEndMs).toEqual(expect.any(Number));
    expect(result.attempts[0].assessment?.kind).toBe(
      completed
        ? undefined
        : evidence === 'missing-retention'
          ? 'correctness_failure'
          : evidence === 'missing-contract' || evidence === 'inconclusive'
            ? 'inconclusive'
            : evidence === 'unnecessary'
              ? 'unnecessary_clarification'
              : 'necessary_clarification',
    );
    if (evidence === 'missing-retention') {
      expect(result.attempts[0].assessment?.stateFailures).toEqual(['unfinished_instructions']);
      expect(result.attempts[0].followUpSelection?.candidates[0].fixed).toContain(
        'unfinished_instructions',
      );
    }
    expect(result.attempts[0].followUpSelection?.selected).toBeUndefined();
    expect(
      summarizeProfile(result.attempts, [clarificationScenario], 'local', 'text', [1]),
    ).toMatchObject({
      finalQualified: completed && group === 'everyday',
      fullCatalogQualified: completed,
      correctnessFailures:
        evidence === 'unnecessary' || evidence === 'missing-retention'
          ? [{ scenario: 'no-user', step: 'no-user', repetition: 1 }]
          : [],
      unresolvedAssessments:
        completed || evidence === 'unnecessary' || evidence === 'missing-retention'
          ? []
          : [{ scenario: 'no-user', step: 'no-user', repetition: 1 }],
      groups: {
        [group]: { directSteps: completed ? 1 : 0, completedScenarios: completed ? 1 : 0 },
      },
      outcomes: { [rawOutcome]: 1 },
      scenarioTimes:
        completed && group === 'everyday'
          ? [
              {
                scenario: 'no-user',
                medianMs: expect.any(Number),
                minMs: expect.any(Number),
                maxMs: expect.any(Number),
              },
            ]
          : [],
    });
  },
);

test('an unanswered declared question does not submit the next dependent operation', {
  tags: ['technical'],
}, async () => {
  const request = 'Lägg till ett samband som anger att ingen använder tjänsten.';
  const waitingScenario: Scenario = {
    id: 'dependent-work',
    title: 'Dependent work waits for a real answer',
    voice: false,
    steps: [
      {
        id: 'question',
        text: request,
        expected: { requirements: ['Ask for a safe alternative.'] },
        clarification: {
          preservedRequests: [request],
          requirements: ['Ask permission for an alternative without changing the map.'],
        },
      },
      {
        id: 'dependent-save',
        text: 'Spara det färdiga sambandet.',
        expected: { requirements: [] },
      },
    ],
  };
  const model = textModel(() => [
    modelTool('ask_questions', {
      questions: [
        {
          kind: 'change',
          request,
          question: 'Vill du lägga uppgiften som en egenskap i stället?',
          dependsOnDraft: true,
        },
      ],
    }),
  ]);
  const result = await runTextScenario(
    waitingScenario,
    { modelFetch: model.provider },
    {
      profile: 'local',
      repetition: 1,
      followUps: false,
      judge: passingJudge,
    },
  );
  expect(result.attempts).toMatchObject([
    {
      step: 'question',
      outcome: 'pass',
      elapsedMs: null,
      assessment: { kind: 'necessary_clarification' },
    },
    { step: 'dependent-save', outcome: 'not_run', elapsedMs: null },
  ]);
  expect(model.requests).toHaveLength(1);
});

// These existing fixtures test state, clarification and connection lifecycle.
// Actual rendered-audio evidence is covered by evaluation-playback.spec.ts.
const lifecycleRecording = async () =>
  recordedPlayback(
    {
      sampleRate: 48000,
      firstFrame: 0,
      frames: 48000,
      lastActiveFrame: 4800,
      observedAt: Date.now(),
      clocks: [
        { position: 0, at: Date.now() - 3000 },
        { position: 1, at: Date.now() - 2000 },
      ],
    },
    Buffer.alloc(96000),
  );
const lifecycleRecognition = async () => ({
  outcome: 'recognized' as const,
  text: 'Complete controlled response.',
  lastWordEndSeconds: 0.1,
  alignmentMarginMs: 100,
  profile: 'controlled-state-only',
  callId: 'lifecycle',
  costUsd: 0,
});

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
          questions:
            !first && evidence === 'lost-constraints'
              ? []
              : [
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
          ...(first
            ? {}
            : {
                updates: [
                  pendingUpdate(
                    body,
                    question,
                    evidence === 'lost-constraints'
                      ? {
                          action: 'replace',
                          replacement: {
                            kind: 'change',
                            request: 'Ändra beskrivningen.',
                            question: 'Uppdraget ryms inte. Kan du avgränsa det?',
                            dependsOnDraft: true,
                          },
                        }
                      : {},
                  ),
                ],
              }),
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
            recording: lifecycleRecording,
            observedAt: async () => Date.now(),
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
        assessPlayback: lifecycleRecognition,
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
            outcome: id.endsWith('-retention')
              ? evidence === 'lost-constraints' &&
                input.requirements.some(({ id }) => id.includes('-inability-'))
                ? 'fail'
                : 'pass'
              : id === 'voice-rendered-response' ||
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

test.each(['necessary', 'unnecessary', 'unsafe-state', 'missing-answer', 'inconclusive'] as const)(
  'an unmatched scripted reply keeps question validity separate from completion: %s',
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
      modality: 'text',
      outcome: 'fail',
      fixed: ['effective_objects'],
      elapsedMs: null,
      backendCostUsd: 0,
      content: [{ id: 'backend-0', outcome: 'fail', reason: 'The change remains unfinished.' }],
    };
    const original = structuredClone(attempt);
    const selected = await selectFollowUp({
      step,
      attempt,
      stateFailures: ['effective_objects'],
      questionPending: true,
      sources: {
        backend: {
          text: 'The price is 179. Which other subscription do you mean?',
          complete: true,
        },
      },
      checkWaiting: async () => (mode === 'unsafe-state' ? ['effective_relationships'] : []),
      waitingContext: () => 'Complete safe waiting state and current request.',
      judge: async (input) =>
        input.requirements.map(({ id }) => ({
          id,
          outcome:
            id.endsWith('-follow-up') ||
            (mode === 'unnecessary' && id.endsWith('-necessary')) ||
            (mode === 'missing-answer' && id.includes('-waiting-'))
              ? 'fail'
              : mode === 'inconclusive'
                ? 'inconclusive'
                : 'pass',
          reason: id.endsWith('-follow-up')
            ? 'The catalog reply answers a different question.'
            : mode === 'unnecessary'
              ? 'The target is already unambiguous.'
              : 'Verified question and independent answer.',
        })),
    });
    expect(selected).toBeUndefined();
    expect(attempt).toMatchObject(original);
    expect(attempt.followUpSelection?.selected).toBeUndefined();
    expect(attempt.assessment?.kind).toBe(
      mode === 'necessary'
        ? 'necessary_clarification'
        : mode === 'unnecessary'
          ? 'unnecessary_clarification'
          : undefined,
    );
    const summary = summarizeProfile([attempt], [scenario], 'local', 'text', [1]);
    expect(summary.finalQualified).toBe(false);
    expect(summary.scenarioTimes).toEqual([]);
    expect(summary.correctnessFailures.some((failure) => failure.step === step.id)).toBe(
      mode !== 'necessary',
    );
  },
);

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
    waitingContext: () => 'Independently verified current state and active pending request.',
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
  let fullDraft: TextAssistantReview | undefined;
  const model = textModel(async (request) => {
    if (turn++ === 0)
      return [modelTool('ask_questions', { questions: ['Vilket utkast menar du?'] })];
    if (turn === 2) {
      const input = JSON.parse(
        String(request.input.findLast((item) => item.role === 'user')?.content),
      );
      expect(input.message).toBe(saveScenario.steps[0].followUps?.[0].text);
      expect(input.draft).toMatchObject({
        complete: false,
        totals: { changes: 2 },
        changes: [],
      });
      return [modelTool('read_my_draft', {})];
    }
    if (turn === 3) {
      fullDraft = lastToolResult(request);
      expect(fullDraft).toEqual(environment.assistant.review);
      expect(fullDraft?.changes).toHaveLength(2);
      if (!fullDraft) throw new Error('Missing full draft fixture');
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [
            pendingUpdate(request, 'Vilket utkast menar du?', {
              expected: fullDraft.changes.map((change) => ({
                kind: 'object',
                id: change.id,
                value: change.after,
              })),
            }),
          ],
          continueResponse: true,
        }),
      ];
    }
    const answer = lastToolResult(request);
    expect(answer.pendingParts).toEqual([
      expect.objectContaining({
        question: 'Vilket utkast menar du?',
        status: 'completed',
        revision: 1,
        evidence: expect.objectContaining({
          text: saveScenario.steps[0].followUps?.[0].text,
        }),
      }),
    ]);
    if (!fullDraft) throw new Error('Missing verified full draft fixture');
    return [
      modelTool('save_draft', {
        version: fullDraft.version,
        contentVersion: fullDraft.contentVersion,
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
          expect(context.observedState.saveReceipt).toMatchObject({
            operationId: context.observedState.saveOperations[0].operationId,
            draftVersion: fullDraft?.version,
            contentVersion: fullDraft?.contentVersion,
          });
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
  expect(turn).toBe(4);
  expect(result.finalMap.draft.changes).toEqual([]);
  expect(result.finalMap.draft.relationships ?? []).toEqual([]);
  expect(result.finalMap.draft.objectTypes ?? []).toEqual([]);
  expect(result.finalMap.draft.relationshipTypes ?? []).toEqual([]);
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
      recording: vi.fn(lifecycleRecording),
      observedAt: async () => Date.now(),
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
        assessPlayback: lifecycleRecognition,
        judge: async (input) => {
          if (judgeDelay) await new Promise((resolve) => setTimeout(resolve, judgeDelay));
          return passingJudge(input);
        },
      },
    );
    await vi.advanceTimersByTimeAsync(judgeDelay * 16);
    const result = await run;
    expect(
      connection.play.mock.calls.map(([id]) => id),
      JSON.stringify(result.attempts),
    ).toEqual(['price', 'clarify-price', 'next']);
    expect(connection.start).toHaveBeenCalledOnce();
    expect(connection.close).toHaveBeenCalledOnce();
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual(['fail', 'pass', 'pass']);
    expect(result.attempts[1].followUpFor).toBe('price');
    expect(result.attempts[1].assistedElapsedMs).toBeGreaterThanOrEqual(
      result.attempts[1].elapsedMs ?? Number.POSITIVE_INFINITY,
    );
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
