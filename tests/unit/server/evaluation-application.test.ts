import { expect, test, vi } from 'vitest';
import catalog from '../../../scripts/model-evaluation/catalog.json' with { type: 'json' };
import { evaluationEnvironment } from '../../../scripts/model-evaluation/environment.js';
import { runTextScenario } from '../../../scripts/model-evaluation/runner.js';
import type { Scenario } from '../../../scripts/model-evaluation/types.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../../support/text-model.js';

test('text evaluation waits for a slow accepted task and records its full response time', {
  tags: ['technical'],
}, async () => {
  const began = Date.now();
  const model = textModel(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(began + 11 * 60_000);
    // Leave the application task working through several runner polls.
    await new Promise((resolve) => setTimeout(resolve, 100));
    return [modelMessage('Svar.')];
  });
  try {
    const run = await runTextScenario(
      {
        id: 'slow-text',
        title: 'Slow completed text response',
        voice: false,
        steps: [{ id: 'read', text: 'Vad vet du?', expected: { saves: 0, requirements: [] } }],
      },
      { modelFetch: model.provider },
      { profile: 'local', repetition: 1 },
    );
    expect(run.attempts[0]).toMatchObject({ outcome: 'pass', fixed: [] });
    expect(run.attempts[0].elapsedMs).toBeGreaterThan(10 * 60_000);
    expect(model.requests).toHaveLength(1);
  } finally {
    vi.restoreAllMocks();
  }
});

test('a mixed price and draft request keeps verified details and completes its factual answer', {
  tags: ['technical'],
}, async () => {
  const scenario = catalog.scenarios.find((item) => item.id === 'read-price-draft') as Scenario;
  const model = textModel((body) =>
    body.input.at(-1)?.type === 'function_call_output'
      ? [modelMessage('Spotify Premium Family kostar 179 kr per månad enligt kartan.')]
      : [
          modelMessage('En påhittad sammanfattning från leverantören.'),
          modelTool('report_result', { source: 'draft', continueResponse: true }),
        ],
  );
  const run = await runTextScenario(
    scenario,
    { modelFetch: model.provider },
    {
      profile: 'local',
      repetition: 1,
      judge: async (input) => {
        const text = input.sources.backend?.text ?? '';
        expect(text).toContain('179 kr per månad enligt kartan');
        expect(text).toContain('Övar cello på tisdagar.');
        expect(text).toContain('149');
        expect(text).not.toContain('påhittad sammanfattning');
        return input.requirements.map(({ id }) => ({ id, outcome: 'pass', reason: 'Verified.' }));
      },
    },
  );
  expect(run.attempts[0], JSON.stringify(run.attempts[0])).toMatchObject({
    outcome: 'pass',
    fixed: [],
  });
  expect(model.requests).toHaveLength(2);
});

test.each([
  { completion: 'draft', prefix: '' },
  { completion: 'save', prefix: '' },
  { completion: 'save', prefix: 'Jag vill ordna uppgifter om våra tillgångar- ' },
] as const)(
  'a mixed $completion request with heading "$prefix" continues to selection and factual answers',
  {
    tags: ['technical'],
  },
  async ({ completion, prefix }) => {
    const scenario: Scenario = {
      id: 'local-mixed-changes',
      title: 'Mixed changes and questions',
      voice: false,
      selection: 'alex-work',
      steps: [
        {
          id: 'mixed',
          text: `${prefix}Rätta Lo Bergs beskrivning till Läser poesi. Visa Alex arbete och berätta vad Spotify kostar. Läs upp ändringarna.${completion === 'save' ? ' Spara hela utkastet.' : ''}`,
          expected: {
            objects: {
              lo: {
                properties: [
                  { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Läser poesi.' },
                ],
              },
            },
            saves: completion === 'save' ? 1 : 0,
            saveAttempts: completion === 'save' ? 1 : 0,
            requirements: ['Besvara prisfrågan och redovisa utkastet.'],
          },
        },
      ],
    };
    let step = 0;
    const model = textModel((body) => {
      const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
      const proposal = turn.draft.changes.find((item: { id: string }) => item.id === 'lo');
      switch (step++) {
        case 0:
          return [
            modelTool('submit_changes', {
              version: turn.draft.version,
              contentVersion: turn.draft.contentVersion,
              completion,
              questions: [],
              continueResponse: true,
              operations: [
                {
                  name: 'propose_object',
                  arguments: {
                    id: 'lo',
                    baseRevision: proposal.before.revision,
                    value: {
                      ...proposal.after,
                      properties: [
                        {
                          id: 'description',
                          label: 'Beskrivning',
                          kind: 'text',
                          value: 'Läser poesi.',
                        },
                      ],
                    },
                  },
                },
              ],
            }),
          ];
        case 1:
          if (completion === 'save') {
            const result = lastToolResult(body);
            expect(result.receipt.changes).toHaveLength(2);
            expect(result.reply).toBe('Sparat. Hela utkastet finns i hushållets karta.');
            expect(result.review.changes).toEqual([]);
          }
          return [modelTool('show_map_object', { objectId: 'alex-work' })];
        case 2:
          if (completion === 'save')
            return [
              modelMessage(
                'Spotify kostar 179 kr per månad. Lo Bergs beskrivning är Läser poesi. Alex arbete är markerat.',
              ),
            ];
          return [
            modelTool('report_result', {
              source: 'draft',
              continueResponse: true,
            }),
          ];
        default:
          return [modelMessage('Spotify kostar 179 kr per månad. Alex arbete är markerat.')];
      }
    });
    const run = await runTextScenario(
      scenario,
      { modelFetch: model.provider },
      {
        profile: 'local',
        repetition: 1,
        judge: async (input) => {
          expect(input.sources.backend?.text).toContain('179 kr per månad');
          expect(input.sources.backend?.text).toContain('Läser poesi.');
          if (completion === 'save')
            expect(input.sources.backend?.text).toContain(
              'Sparat. Hela utkastet finns i hushållets karta.',
            );
          expect(JSON.parse(input.context).observedState.displayedSelection).toBe('alex-work');
          return input.requirements.map(({ id }) => ({ id, outcome: 'pass', reason: 'Verified.' }));
        },
      },
    );
    expect(run.attempts[0]).toMatchObject({ outcome: 'pass', fixed: [] });
    expect(model.requests).toHaveLength(completion === 'save' ? 3 : 4);
    const outputs =
      model.requests.at(-1)?.input.filter((item) => item.type === 'function_call_output') ?? [];
    expect(new Set(outputs.map((item) => item.call_id)).size).toBe(outputs.length);
  },
);

test.each([
  {
    text: catalog.scenarios.find((item) => item.id === 'save-last')?.steps[0].text,
    allowed: true,
  },
  { text: 'Jag vill ordna uppgifter om våra tjänster. Spara hela utkastet.', allowed: true },
  {
    text: catalog.scenarios
      .find((item) => item.id === 'save-last')
      ?.steps[0].text?.replace('tjänster. Alex', 'tjänste- Alex'),
    allowed: true,
  },
  {
    text: 'Jag vill ordna uppgifter om mina fordon – Lo använder bilen. Spara hela utkastet.',
    allowed: true,
  },
  {
    text: 'Jag vill ordna uppgifter om era avtal — hyran är ändrad. Spara hela utkastet.',
    allowed: true,
  },
  { text: 'Ändra beskrivningen till uppgifter om bilen - spara hela utkastet.', allowed: true },
  { text: 'Spara inte - spara hela utkastet.', allowed: false },
  { text: 'Spara - inte. Spara hela utkastet.', allowed: false },
  { text: 'Spara — inte — spara hela utkastet.', allowed: false },
  { text: 'Vänta med att spara — spara hela utkastet.', allowed: false },
  { text: 'Om Lo säger ja – spara hela utkastet.', allowed: false },
  { text: 'Vad händer om - spara hela utkastet?', allowed: false },
  { text: 'Exempel — spara hela utkastet.', allowed: false },
  { text: 'Läs citatet ”Spara — hela utkastet”.', allowed: false },
  {
    text: 'Jag vill ordna uppgifter om mina fordon – om bilen startar. Spara hela utkastet.',
    allowed: false,
  },
  {
    text: 'Jag vill ordna uppgifter om era avtal — spara inte ännu. Spara hela utkastet.',
    allowed: false,
  },
  { text: 'Ändra uppgifter om priset stämmer. Spara hela utkastet.', allowed: false },
  { text: 'Ändra uppgifter bara om Lo säger ja. Spara hela utkastet.', allowed: false },
  { text: 'Ändra uppgifter om Mira går med på det. Spara hela utkastet.', allowed: false },
  { text: 'Ändra uppgifter om möjligt. Spara hela utkastet.', allowed: false },
])(
  'save authority distinguishes nominal topics from conditions: $text',
  {
    tags: ['technical'],
  },
  async ({ text, allowed }) => {
    const scenario = catalog.scenarios.find((item) => item.id === 'save-last') as Scenario;
    const model = textModel((body) => {
      const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
      return [
        modelTool('save_draft', {
          version: turn.draft.version,
          contentVersion: turn.draft.contentVersion,
        }),
      ];
    });
    const environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
    try {
      const view = await environment.get<TextAssistantView>(environment.path);
      await environment.post(`${environment.path}/messages`, {
        requestId: 'save-authority',
        text,
        revision: view.revision,
        draftVersion: view.review.version,
        contentVersion: view.review.contentVersion,
      });
      await expect
        .poll(
          async () =>
            (
              await environment.get<TextAssistantView>(
                `${environment.path}/messages/save-authority`,
              )
            ).taskStatus,
        )
        .toBe('completed');
      const finished = await environment.get<TextAssistantView>(environment.path);
      if (allowed) {
        expect(finished.error).toBeUndefined();
        expect(finished.receipt?.changes).toHaveLength(2);
        expect(finished.review.changes).toEqual([]);
      } else {
        expect(finished.error).toBe('assistant_save_not_requested');
        expect(finished.receipt).toBeUndefined();
        expect(finished.review.changes).toHaveLength(2);
      }
    } finally {
      await environment.close();
    }
  },
);

test.each([
  { id: 'unknown-user', target: null },
  { id: 'no-user', target: null },
  { id: 'uncertain-user', target: 'mira' },
])(
  'the $id fixture preserves valid relationships and answers in context',
  {
    tags: ['technical'],
  },
  async ({ id, target }) => {
    const scenario = catalog.scenarios.find((item) => item.id === id) as Scenario;
    let environment: Awaited<ReturnType<typeof evaluationEnvironment>>;
    const model = textModel(async (body) => {
      if (body.input.findLast((item) => item.role !== 'developer')?.type === 'function_call_output')
        return [modelMessage('Utkastet är uppdaterat.')];
      if (target === null) return [modelMessage('Vilket objekt eller samband vill du rätta?')];
      const state = await environment.read();
      const type = state.relationshipTypes.find((item) => item.name === 'Används av');
      const edge = state.relationships.find(
        (item) => item.sourceId === 'cloud' && item.typeId === type?.id,
      );
      if (!edge || !type) throw new Error('Missing known-user fixture relationship');
      return [
        modelTool('propose_relationship', {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id: edge.id,
          baseRevision: edge.revision,
          value: {
            typeId: type.id,
            sourceId: 'cloud',
            targetId: target,
            properties: [{ label: 'Osäkert uppgivet', kind: 'boolean', value: true }],
          },
        }),
      ];
    });
    environment = await evaluationEnvironment(scenario, { modelFetch: model.provider });
    try {
      const step = scenario.steps[0];
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
      const failures = await environment.check(step, finished, []);
      expect(failures).toEqual([]);
      expect([finished.reply, finished.modelReply].join(' ')).toContain(
        target === null ? 'Vilket objekt eller samband vill du rätta?' : 'Utkastet är uppdaterat.',
      );
      const context = JSON.parse(environment.judgeContext(step, failures));
      expect(context.observedState.effective.relationships).toContainEqual({
        source: 'cloud',
        type: 'Används av',
        target: target ?? 'alex',
        ...(target === null
          ? {}
          : { properties: [{ label: 'Osäkert uppgivet', kind: 'boolean', value: true }] }),
      });
      if (target === null) {
        expect(finished.review.changes).toEqual(view.review.changes);
        expect(finished.review.relationships ?? []).toEqual(view.review.relationships ?? []);
      }
      expect(context.observedState.historyChanges).toBe(0);
    } finally {
      await environment.close();
    }
  },
);

test('evaluation uses real save gates, receipts and history and records rejected unsolicited saves', {
  tags: ['technical'],
}, async () => {
  const scenario = {
    id: 'local-save',
    title: 'Local application verification',
    voice: false,
    steps: [
      {
        id: 'save',
        text: 'Spara hela utkastet.',
        expected: { saves: 1, saveAttempts: 1, requirements: ['Bekräfta sparandet.'] },
      },
    ],
  };
  const allowed = textModel((body) => {
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    return [
      modelTool('save_draft', {
        version: turn.draft.version,
        contentVersion: turn.draft.contentVersion,
      }),
    ];
  });
  const success = await runTextScenario(
    scenario,
    { modelFetch: allowed.provider },
    {
      profile: 'local',
      repetition: 1,
      judge: async (input) => {
        const context = JSON.parse(input.context);
        expect(context.fixedChecks).toEqual({ checked: true, passed: true, failures: [] });
        expect(context.observedState.saveReceipt).toBeTruthy();
        expect(context.observedState.saveOperations).toHaveLength(1);
        expect(context.observedState.saveOperations[0].status).toBe('succeeded');
        expect(context.observedState.historyChanges).toBe(1);
        expect(context.observedState.draft.changes).toEqual([]);
        expect(context.observedState.saved.objects).toEqual(
          context.observedState.effective.objects,
        );
        expect(
          context.observedState.saved.objects
            .find((object: { id: string }) => object.id === 'lo')
            .properties.find((property: { id: string }) => property.id === 'description').value,
        ).toBe('Övar cello på tisdagar.');
        return [{ id: 'backend-0', outcome: 'pass', reason: 'Observed real receipt and history.' }];
      },
    },
  );
  expect(success.attempts[0]).toMatchObject({ outcome: 'pass', fixed: [] });
  expect(
    success.events.some(
      (event) => event.kind === 'mcp_completed' && JSON.stringify(event.data).includes('receipt'),
    ),
  ).toBe(true);
  const unwanted = await runTextScenario(
    {
      ...scenario,
      steps: [
        {
          id: 'withdrawn',
          text: 'Spara inte.',
          expected: { saves: 0, saveAttempts: 0, requirements: [] },
        },
      ],
    },
    {
      modelFetch: textModel(() => [modelTool('save_draft', { version: 24, contentVersion: 1 })])
        .provider,
    },
    { profile: 'local', repetition: 1 },
  );
  expect(unwanted.attempts[0].outcome).toBe('fail');
  expect(unwanted.attempts[0].fixed).toContain('unrequested_save_attempt');
  expect(
    unwanted.events.some(
      (event) => event.kind === 'model_action' && JSON.stringify(event.data).includes('save_draft'),
    ),
  ).toBe(true);
  expect(unwanted.finalMap.objects).toHaveLength(22);
  expect(unwanted.finalMap.draft.changes).toHaveLength(2);
});

test('a clarification after a real draft proposal expires save intent while preserving the clear change', {
  tags: ['technical'],
}, async () => {
  const model = textModel((body) => {
    if (body.input.findLast((item) => item.role !== 'developer')?.type === 'function_call_output')
      return [modelMessage('Vilken Alex menar du?')];
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    const change = turn.draft.changes.find((item: { id: string }) => item.id === 'lo');
    return [
      modelTool('propose_object', {
        version: turn.draft.version,
        contentVersion: turn.draft.contentVersion,
        id: 'lo',
        baseRevision: change.before.revision,
        value: {
          ...change.after,
          properties: [
            { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Klar ändring' },
          ],
        },
      }),
    ];
  });
  const run = await runTextScenario(
    {
      id: 'proposal-question',
      title: 'Clarification expires authority',
      voice: false,
      steps: [
        {
          id: 'clarify',
          text: 'Ändra Lo Bergs beskrivning till Klar ändring. Alex använder Microsoft 365. Spara hela utkastet.',
          expected: {
            objects: {
              lo: {
                properties: [
                  { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Klar ändring' },
                ],
              },
            },
            saves: 0,
            saveAttempts: 0,
            requirements: [],
          },
        },
      ],
    },
    { modelFetch: model.provider },
    { profile: 'local', repetition: 1 },
  );
  expect(run.attempts[0]).toMatchObject({ outcome: 'pass', fixed: [] });
  expect(
    run.events.some(
      (event) => event.kind === 'mcp_started' && JSON.stringify(event.data).includes('save_draft'),
    ),
  ).toBe(false);
  expect(
    run.finalMap.draft.changes
      .find((change) => change.id === 'lo')
      ?.after?.properties?.find((property) => property.id === 'description'),
  ).toMatchObject({ kind: 'text', value: 'Klar ändring' });
});
