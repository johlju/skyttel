import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, modelTool, pendingUpdate, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let base: string;
let release = () => {};
afterEach(async () => {
  release();
  await browser?.dispose();
  await app?.close();
});
async function setup(options: Parameters<typeof createInstallation>[1]) {
  app = await createInstallation(undefined, options);
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  base = `${app.origin}/api/households/${household.id}`;
  const map: MapState = await (await browser.get(`${base}/map`)).json();
  const proposed = await post(`${base}/map/draft`, {
    version: map.draft.version,
    contentVersion: map.contentVersion,
    id: 'private-chair',
    baseRevision: null,
    value: {
      typeId: map.types[0].id,
      name: 'Min stol',
      properties: [
        { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Privat förslag' },
      ],
    },
  });
  expect(proposed.status(), await proposed.text()).toBe(200);
  const started = await post(`${base}/text-assistant`, approvedForVisit);
  expect(started.status(), await started.text()).toBe(201);
  return (await started.json()) as TextAssistantView;
}
const post = (url: string, data: object) =>
  browser.post(url, { headers: { origin: app.origin }, data });
const readMap = async (): Promise<MapState> => (await browser.get(`${base}/map`)).json();
async function send(
  session: TextAssistantView,
  text = 'Beskriv mitt utkast.',
  extra: Record<string, unknown> = {},
) {
  const response = await post(`${base}/text-assistant/${session.id}/messages`, {
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    requestId: crypto.randomUUID(),
    text,
    ...extra,
  });
  expect(response.status(), await response.text()).toBe(202);
  return (await response.json()) as TextAssistantView;
}
async function settled(session: TextAssistantView) {
  let view = session;
  await expect
    .poll(async () => {
      view = await (await browser.get(`${base}/text-assistant/${session.id}`)).json();
      return view.phase;
    })
    .not.toBe('working');
  return view;
}

test('a new selected model reconstructs fresh draft context without stale read results or draft snapshots', async () => {
  const model = textModel((request) => {
    const payloads = request.input
      .filter((item) => item.role === 'user')
      .map((item) => JSON.parse(String(item.content)));
    const current = payloads.at(-1);
    if (current.message === 'Beskriv mitt utkast.') {
      if (!request.input.some((item) => item.type === 'function_call_output'))
        return [modelTool('read_my_draft', {})];
      return [modelMessage('Förslaget heter Min stol.')];
    }
    expect(request.model).toBe('gpt-6.1-sol');
    expect(payloads.filter((payload) => payload.draft)).toHaveLength(1);
    expect(current.draft.changes[0].after.name).toBe('Manuellt nytt namn');
    expect(request.input.some((item) => item.type === 'function_call_output')).toBe(false);
    expect(JSON.stringify(request.input)).toContain('Förslaget heter Min stol.');
    return [modelMessage('Nu heter förslaget Manuellt nytt namn.')];
  });
  const session = await setup({ modelFetch: model.provider });
  const first = await settled(await send(session));
  expect(first.phase).toBe('ready');
  const before = await readMap();
  const edited = await post(`${base}/map/draft`, {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    id: 'private-chair',
    baseRevision: null,
    value: { ...before.draft.changes[0].after, name: 'Manuellt nytt namn' },
  });
  expect(edited.status(), await edited.text()).toBe(200);
  const selected = await post(`${base}/text-assistant/${session.id}/model-choice`, {
    model: 'gpt-6.1-sol',
    effort: 'high',
  });
  expect(selected.status()).toBe(200);
  const fresh = await (await browser.get(`${base}/text-assistant/${session.id}`)).json();
  const final = await settled(await send(fresh, 'Vad heter förslaget nu?'));
  expect(final).toMatchObject({
    phase: 'ready',
    modelReply: 'Nu heter förslaget Manuellt nytt namn.',
    review: { changes: [{ after: { name: 'Manuellt nytt namn' } }] },
  });
  expect((await readMap()).objects).toEqual([]);
});

test('repeated draft reads replace old snapshots while verified batch evidence remains available', async () => {
  const model = textModel((request) => {
    const current = JSON.parse(
      String(request.input.findLast((item) => item.role === 'user')?.content),
    );
    if (model.requests.length <= 2) {
      const read = modelTool('read_my_draft', {});
      if (model.requests.length === 2) read.arguments = ' \n { } ';
      return [read];
    }
    if (model.requests.length === 3) {
      expect(request.input.filter((item) => item.type === 'function_call_output')).toHaveLength(1);
      return [
        modelTool('submit_changes', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          completion: 'draft',
          continueResponse: true,
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'private-chair',
                baseRevision: null,
                value: { ...current.draft.changes[0].after, name: 'Aktuell stol' },
              },
            },
          ],
        }),
      ];
    }
    expect(current.draft.changes[0].after.name).toBe('Aktuell stol');
    const results = request.input
      .filter((item) => item.type === 'function_call_output')
      .map((item) => JSON.parse(String(item.output)));
    expect(results.some((result) => result.result?.kind === 'draft')).toBe(true);
    expect(results.filter((result) => result.changes)).toEqual([]);
    return [modelMessage('Den kontrollerade batchen är klar.')];
  });
  const session = await setup({ modelFetch: model.provider });
  const final = await settled(
    await send(session, 'Ändra namnet till Aktuell stol och beskriv resultatet.'),
  );
  expect(final).toMatchObject({ phase: 'ready', modelReply: 'Den kontrollerade batchen är klar.' });
  expect((await readMap()).draft.changes[0].after?.name).toBe('Aktuell stol');
  expect((await readMap()).objects).toEqual([]);
});

test('necessary exact instructions exceeding the selected profile pause without truncation or effects', async () => {
  const exact = `Ändra ingenting och spara inte. Behåll ordagrant: ${'blå; grön, '.repeat(300)}`;
  const model = textModel(() => [modelMessage('Ett svar som inte ska begäras.')]);
  const session = await setup({
    modelProfile: {
      provider: 'openai',
      model: 'gpt-6.1-sol',
      effort: 'high',
      tokens: 512,
      maxOutputTokens: 128,
    },
    modelFetch: async (input, init) => {
      const response = await model.provider(input, init);
      return Response.json({ ...(await response.json()), service_tier: 'default' });
    },
  });
  const before = await readMap();
  const final = await settled(await send(session, exact));
  expect(final).toMatchObject({
    phase: 'error',
    error: 'assistant_context_capacity',
    reply: expect.stringContaining('Avgränsa uppdraget'),
  });
  expect(final.completedReplies?.at(-1)?.request).toBe(exact);
  expect(final.review).toEqual(session.review);
  expect(await readMap()).toEqual(before);
  expect(model.requests).toEqual([]);
  expect(model.authorizationRequests).toEqual([]);
});

test('completed local discussion is summarized before the selected request budget rejects it', async () => {
  const completed = 'Avslutad diskussion. '.repeat(15_000);
  const model = textModel(
    (request) =>
      request.tools.length
        ? [modelMessage(completed)]
        : [modelMessage('Sammanfattad avslutad diskussion.')],
    (request) => {
      const { current } = JSON.parse(String(request.input[0].content));
      return [modelMessage(JSON.stringify({ mode: 'read', request: current }))];
    },
  );
  let view = await setup({ modelFetch: model.provider });
  for (let index = 0; index < 10; index++) {
    await send(view, `Avslutad omgång ${index}.`);
    await expect
      .poll(async () => {
        view = await (await browser.get(`${base}/text-assistant/${view.id}`)).json();
        return view.phase !== 'working' && view.contextSummaryState !== 'summarizing';
      })
      .toBe(true);
    expect(
      view.phase,
      JSON.stringify({ index, error: view.error, generation: view.contextGeneration }),
    ).toBe('ready');
    expect(view.capacityPaused).not.toBe(true);
  }
  expect(view.contextGeneration).toBeGreaterThan(0);
  expect(view.completedReplies).toHaveLength(10);
  expect(view.completedReplies?.[0].text).toBe(completed);
  expect((await readMap()).objects).toEqual([]);
}, 15_000);

test('summary source excludes unfinished discussion while its exact request and question stay available', async () => {
  const exact = 'Ändra stolen först när jag ger färgen. Spara inte.';
  const question = 'Vilken färg ska stolen ha?';
  const model = textModel((request) => {
    if (!request.tools.length) {
      const source = JSON.parse(String(request.input[0].content)).source;
      expect(source).not.toContain(exact);
      expect(source).not.toContain(question);
      return [modelMessage('Endast avslutad diskussion.')];
    }
    return [modelTool('ask_questions', { questions: [question] })];
  });
  let full = true;
  const session = await setup({
    modelFetch: async (input, init) => {
      const request = JSON.parse(String(init?.body));
      const response = await model.provider(input, init);
      if (!request.tools.length || !full) return response;
      full = false;
      const body = await response.json();
      body.usage.input_tokens = 1_040_000;
      return Response.json(body, { headers: response.headers });
    },
  });
  const working = await send(session, exact);
  let final = working;
  await expect
    .poll(async () => {
      final = await (await browser.get(`${base}/text-assistant/${session.id}`)).json();
      return final.phase !== 'working' && final.contextSummaryState !== 'summarizing';
    })
    .toBe(true);
  expect(final.contextGeneration).toBe(1);
  expect(final.questions).toEqual([question]);
  expect(final.completedReplies?.[0].request).toBe(exact);
  expect(final.pendingParts?.[0]).toMatchObject({ status: 'waiting', question });
});

test('identical completed and unfinished wording retains distinct causal summary provenance', async () => {
  const exact = 'Beskriv stolen.';
  const completed = 'Stolen heter Min stol.';
  const question = 'Vilken uppgift om stolen vill du ha?';
  let turn = 0;
  const model = textModel(
    (request) => {
      if (!request.tools.length) {
        const source = JSON.parse(String(request.input[0].content)).source;
        const discussion = JSON.parse(source).conversation;
        expect(discussion.filter((entry: { text: string }) => entry.text === exact)).toHaveLength(
          1,
        );
        expect(source).toContain(completed);
        expect(source).not.toContain(question);
        return [modelMessage('Avslutad beskrivning av stolen.')];
      }
      return turn === 1
        ? [modelMessage(completed)]
        : [modelTool('ask_questions', { questions: [question] })];
    },
    (request) => {
      if (!request.instructions.startsWith('SKYTTEL_TURN_SCOPE'))
        return [modelMessage('{"decision":"allow","complete":true}')];
      turn++;
      return [modelMessage(JSON.stringify({ mode: turn === 1 ? 'read' : 'work', request: exact }))];
    },
  );
  let session = await setup({
    modelFetch: async (input, init) => {
      const request = JSON.parse(String(init?.body));
      const response = await model.provider(input, init);
      if (turn !== 2 || !request.tools.length || request.instructions.startsWith('SKYTTEL_TURN_'))
        return response;
      const body = await response.json();
      body.usage.input_tokens = 1_040_000;
      return Response.json(body, { headers: response.headers });
    },
  });
  session = await settled(await send(session, exact));
  session = await send(session, exact);
  await expect
    .poll(async () => {
      session = await (await browser.get(`${base}/text-assistant/${session.id}`)).json();
      return session.phase !== 'working' && session.contextSummaryState !== 'summarizing';
    })
    .toBe(true);
  expect(session.contextGeneration).toBe(1);
  expect(session.questions).toEqual([question]);
  expect(session.completedReplies?.map((reply) => reply.request)).toEqual([exact, exact]);
});

test('an explicit complete restatement scopes capacity-paused work while retaining the original instruction and unrelated queue', async () => {
  const original =
    'Byt stolens namn, ordna alla efterfrågade detaljer och spara sedan hela utkastet.';
  const narrower = 'Byt namnet på Min stol till Avgränsad stol. Spara inte.';
  let entered = false;
  let overflow = true;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(
    (request) => {
      const current = JSON.parse(
        String(request.input.findLast((item) => item.role === 'user')?.content),
      );
      expect(current.message).toBe(narrower);
      expect(JSON.stringify(request.input)).not.toContain(original);
      expect(current.unfinishedRequests.map((item: { text: string }) => item.text)).toEqual([
        narrower,
      ]);
      return [
        modelTool('submit_changes', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'private-chair',
                baseRevision: null,
                value: { ...current.draft.changes[0].after, name: 'Avgränsad stol' },
              },
            },
          ],
        }),
      ];
    },
    (request) => {
      if (!request.instructions.startsWith('SKYTTEL_TURN_SCOPE'))
        return [modelMessage('{"decision":"allow","complete":true}')];
      const { current, earlier } = JSON.parse(String(request.input[0].content));
      if (current !== original) {
        expect(earlier).toEqual([]);
        expect(request.instructions).toContain('SKYTTEL_SCOPE_RESTATEMENT');
      }
      return [
        modelMessage(
          JSON.stringify(
            current === 'Gör första delen.'
              ? {
                  mode: 'clarify',
                  request: 'Skriv hela det avgränsade uppdraget med mål och begränsningar.',
                }
              : { mode: 'work', request: current },
          ),
        ),
      ];
    },
  );
  const session = await setup({
    modelFetch: async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.tools.length && overflow) {
        overflow = false;
        entered = true;
        await waiting;
        return Response.json(
          { error: { code: 'context_length_exceeded', message: 'Controlled capacity stop.' } },
          { status: 400 },
        );
      }
      return model.provider(input, init);
    },
  });
  const premature = await post(`${base}/text-assistant/${session.id}/messages`, {
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    requestId: 'premature-restatement',
    text: narrower,
    restate: true,
  });
  expect(premature.status()).toBe(409);
  const working = await send(session, original);
  await expect.poll(() => entered).toBe(true);
  await send(working, 'Ett annat köat uppdrag.');
  release();
  const stopped = await settled(working);
  expect(stopped).toMatchObject({
    phase: 'error',
    error: 'assistant_context_capacity',
    capacityPaused: true,
    queuedMessages: 1,
  });
  const missingFlag = await post(`${base}/text-assistant/${session.id}/messages`, {
    revision: stopped.revision,
    draftVersion: stopped.review.version,
    contentVersion: stopped.review.contentVersion,
    requestId: 'missing-restatement',
    text: narrower,
  });
  expect(missingFlag.status()).toBe(409);
  expect(await missingFlag.json()).toMatchObject({
    error: 'assistant_context_restatement_required',
  });
  const changedReplay = await post(`${base}/text-assistant/${session.id}/messages`, {
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    requestId: working.taskId,
    text: original,
    restate: true,
  });
  expect(changedReplay.status()).toBe(409);
  expect(await changedReplay.json()).toMatchObject({ error: 'assistant_turn_changed' });
  const unclear = await settled(await send(stopped, 'Gör första delen.', { restate: true }));
  expect(unclear.reply).toContain('Skriv hela det avgränsade uppdraget');
  expect(unclear.queuedMessages).toBe(1);
  const final = await settled(await send(unclear, narrower, { restate: true }));
  expect(final).toMatchObject({ phase: 'ready', capacityPaused: true, queuedMessages: 1 });
  expect(final.completedReplies?.some((reply) => reply.request === original)).toBe(true);
  expect((await readMap()).draft.changes[0].after?.name).toBe('Avgränsad stol');
  expect((await readMap()).objects).toEqual([]);
  expect(model.requests).toHaveLength(1);
});

test.each([
  'unrelated',
  'renamed',
  'retargeted',
  'ambiguous',
  'overbudget',
  'save-scope',
  'verified-save-scope',
  'discard-scope',
] as const)(
  'queued actions use fresh facts but preserve the admitted target when facts are %s',
  async (change) => {
    let verifiedReceipt: SaveReceipt | undefined;
    let workEntered = false;
    let summaryEntered = false;
    let releaseWork = () => {};
    let releaseSummary = () => {};
    const workWait = new Promise<void>((resolve) => {
      releaseWork = resolve;
    });
    const summaryWait = new Promise<void>((resolve) => {
      releaseSummary = resolve;
    });
    release = () => {
      releaseWork();
      releaseSummary();
    };
    const model = textModel(
      async (request) => {
        if (!request.tools.length) {
          summaryEntered = true;
          await summaryWait;
          return [modelMessage('Avslutad historisk läsning.')];
        }
        const current = JSON.parse(
          String(request.input.findLast((item) => item.role === 'user')?.content),
        );
        if (current.message === 'Läs färdigt först.') {
          workEntered = true;
          await workWait;
          return [modelMessage('Läsningen är klar.')];
        }
        if (current.message === 'Kontrollera det senaste verifierade sparandet.') {
          expect(request.model).toBe('gpt-6.1-sol');
          expect(JSON.stringify(request.input)).toContain(verifiedReceipt?.savedAt);
          expect(current.saveOperations).toContainEqual(
            expect.objectContaining({
              operationId: verifiedReceipt?.operationId,
              status: 'succeeded',
            }),
          );
          return [modelTool('report_result', { source: 'latest_save' })];
        }
        if (current.message === 'Spara hela utkastet.')
          return [
            modelTool('save_draft', {
              version: current.draft.version,
              contentVersion: current.draft.contentVersion,
              operationId: 'queued-scope-save',
            }),
          ];
        const target =
          current.draft.changes.find(
            (item: { after?: { name: string } }) => item.after?.name === 'Min stol',
          ) ?? current.draft.changes[0];
        return [
          modelTool('submit_changes', {
            version: current.draft.version,
            contentVersion: current.draft.contentVersion,
            completion: 'draft',
            operations: [
              {
                name: 'propose_object',
                arguments: {
                  id: target.id,
                  baseRevision: null,
                  value: { ...target.after, name: 'Klar stol' },
                },
              },
            ],
          }),
        ];
      },
      (request) => {
        if (request.instructions.startsWith('SKYTTEL_TURN_SCOPE')) {
          const { current } = JSON.parse(String(request.input[0].content));
          return [
            modelMessage(
              JSON.stringify({
                mode: [
                  'Läs färdigt först.',
                  'Kontrollera det senaste verifierade sparandet.',
                ].includes(current)
                  ? 'read'
                  : 'work',
                request: current,
              }),
            ),
          ];
        }
        const { operations, data } = JSON.parse(String(request.input[0].content)).untrusted;
        const bound = data.queuedReference;
        // A missing server reference deliberately tempts the old implementation.
        if (!bound) return [modelMessage('{"decision":"allow","complete":true}')];
        const previous = bound.draft.changes.find(
          (item: { id: string }) => item.id === operations[0].arguments.id,
        );
        const matches = data.draft.changes.filter(
          (item: { after?: { name: string } }) => item.after?.name === 'Min stol',
        );
        return [
          modelMessage(
            JSON.stringify(
              previous?.after?.name === 'Min stol' &&
                matches.length === 1 &&
                matches[0].id === previous.id
                ? { decision: 'allow', complete: true }
                : { decision: 'clarify' },
            ),
          ),
        ];
      },
    );
    let full = true;
    const session = await setup({
      modelFetch: async (input, init) => {
        const request = JSON.parse(String(init?.body));
        const response = await model.provider(input, init);
        if (!request.tools.length || !full) return response;
        full = false;
        const body = await response.json();
        body.usage.input_tokens = 1_040_000;
        return Response.json(body, { headers: response.headers });
      },
    });
    let state = await readMap();
    expect(
      (
        await post(`${base}/map/draft`, {
          version: state.draft.version,
          contentVersion: state.contentVersion,
          id: 'other-chair',
          baseRevision: null,
          value: { typeId: state.types[0].id, name: 'Annan stol' },
        })
      ).status(),
    ).toBe(200);
    if (change === 'overbudget') {
      state = await readMap();
      const initial = state.draft.changes.find((item) => item.id === 'private-chair');
      expect(
        (
          await post(`${base}/map/draft`, {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            id: 'private-chair',
            baseRevision: null,
            value: {
              ...initial?.after,
              properties: Array.from({ length: 4 }, (_, index) => ({
                id: `large-${index}`,
                label: `Stor uppgift ${index}`,
                kind: 'text',
                value: 'x'.repeat(9000),
              })),
            },
          })
        ).status(),
      ).toBe(200);
    }
    const current = await (await browser.get(`${base}/text-assistant/${session.id}`)).json();
    const working = await send(current, 'Läs färdigt först.');
    await expect.poll(() => workEntered).toBe(true);
    await send(
      working,
      change === 'discard-scope'
        ? 'Kasta utkastet'
        : 'Byt namnet på Min stol till Klar stol. Spara inte.',
    );
    if (change === 'save-scope' || change === 'verified-save-scope')
      await send(working, 'Spara hela utkastet.');
    releaseWork();
    await expect.poll(() => summaryEntered).toBe(true);
    state = await readMap();
    const first = state.draft.changes.find((item) => item.id === 'private-chair');
    if (change !== 'verified-save-scope')
      expect(
        (
          await post(`${base}/map/draft`, {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            id: 'private-chair',
            baseRevision: null,
            value: {
              ...first?.after,
              ...(change === 'unrelated' ||
              change === 'ambiguous' ||
              change === 'overbudget' ||
              change === 'save-scope' ||
              change === 'discard-scope'
                ? {
                    properties: [
                      {
                        id: 'description',
                        label: 'Beskrivning',
                        kind: 'text',
                        value: 'Manuell aktuell uppgift',
                      },
                    ],
                  }
                : { name: 'Manuellt nytt namn' }),
            },
          })
        ).status(),
      ).toBe(200);
    if (change === 'retargeted' || change === 'ambiguous') {
      state = await readMap();
      const other = state.draft.changes.find((item) => item.id === 'other-chair');
      expect(
        (
          await post(`${base}/map/draft`, {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            id: 'other-chair',
            baseRevision: null,
            value: { ...other?.after, name: 'Min stol' },
          })
        ).status(),
      ).toBe(200);
    }
    const before = await readMap();
    releaseSummary();
    let final = current;
    await expect
      .poll(async () => {
        final = await (await browser.get(`${base}/text-assistant/${session.id}`)).json();
        return (
          final.queuedMessages === 0 &&
          final.phase !== 'working' &&
          final.contextSummaryState !== 'summarizing'
        );
      })
      .toBe(true);
    if (change === 'verified-save-scope') {
      expect(final.phase).toBe('ready');
      expect(final.receipt?.operationId).toEqual(expect.any(String));
      verifiedReceipt = structuredClone(final.receipt);
      const operations = (await (await browser.get(`${base}/map/operations`)).json()).operations;
      expect(operations).toContainEqual(
        expect.objectContaining({
          operationId: final.receipt.operationId,
          status: 'succeeded',
        }),
      );
      expect((await readMap()).objects.some((item) => item.name === 'Klar stol')).toBe(true);
      expect((await readMap()).draft.changes).toEqual([]);
      const receiptPath = `${base}/map/operations/${verifiedReceipt?.operationId}`;
      expect((await (await browser.get(receiptPath)).json()).operation.receipt).toEqual(
        verifiedReceipt,
      );
      const savedHistory = await (await browser.get(`${base}/map/history`)).json();
      expect(savedHistory.history[0].operationId).toBe(verifiedReceipt?.operationId);
      expect(
        (
          await post(`${base}/text-assistant/${session.id}/model-choice`, {
            model: 'gpt-6.1-sol',
            effort: 'high',
          })
        ).status(),
      ).toBe(200);
      const reconstructed = await settled(
        await send(final, 'Kontrollera det senaste verifierade sparandet.'),
      );
      expect(reconstructed).toMatchObject({ phase: 'ready', result: { kind: 'history' } });
      expect(reconstructed.completedReplies?.find((reply) => reply.receipt)?.receipt).toEqual(
        verifiedReceipt,
      );
      expect((await (await browser.get(receiptPath)).json()).operation.receipt).toEqual(
        verifiedReceipt,
      );
      expect(await (await browser.get(`${base}/map/history`)).json()).toEqual(savedHistory);
    } else if (change === 'unrelated' || change === 'save-scope') {
      expect(final.phase).toBe(change === 'save-scope' ? 'error' : 'ready');
      if (change === 'save-scope') expect(final.error).toBe('assistant_save_not_requested');
      expect(
        (await readMap()).draft.changes.find((item) => item.id === 'private-chair')?.after,
      ).toMatchObject({
        name: 'Klar stol',
        properties: [{ value: 'Manuell aktuell uppgift' }],
      });
      expect((await readMap()).objects).toEqual([]);
    } else if (change === 'discard-scope') {
      expect(final).toMatchObject({ phase: 'error', error: 'assistant_draft_changed' });
      expect(await readMap()).toEqual(before);
    } else {
      expect(final).toMatchObject({ phase: 'error', error: 'assistant_scope_unclear' });
      expect(await readMap()).toEqual(before);
    }
  },
);

test.each(['submit_changes', 'ask_questions', 'report_result'])(
  'a provider cannot combine %s with a second action to change the private draft',
  async (action) => {
    let typeId = '';
    const operation = () => ({
      id: 'provider-chair',
      baseRevision: null,
      value: { typeId, name: 'En annan stol' },
    });
    const model = textModel(() => [
      modelTool(
        action,
        action === 'submit_changes'
          ? {
              version: 1,
              contentVersion: 1,
              completion: 'draft',
              operations: [{ name: 'propose_object', arguments: operation() }],
            }
          : action === 'ask_questions'
            ? { questions: ['Vilken stol menar du?'] }
            : { source: 'draft' },
      ),
      modelTool('propose_object', { version: 1, contentVersion: 1, ...operation() }),
    ]);
    const session = await setup({ modelFetch: model.provider });
    const before = await readMap();
    typeId = before.types[0].id;
    const result = await settled(await send(session));
    expect(result).toMatchObject({ phase: 'error', error: 'invalid_request', operations: [] });
    expect(result.receipt).toBeUndefined();
    expect(result.questions).toBeUndefined();
    expect(await readMap()).toEqual(before);
    expect(model.requests).toHaveLength(1);
  },
);

test('necessary questions await the answer without granting authority or touching the draft', async () => {
  const question = 'Vilken stol menar du?';
  const model = textModel((request) =>
    model.requests.length === 1
      ? [modelTool('ask_questions', { questions: [`  ${question}  `] })]
      : model.requests.length === 2
        ? [
            modelTool('ask_questions', {
              questions: [],
              updates: [pendingUpdate(request, question)],
              continueResponse: true,
            }),
          ]
        : [modelMessage('Tack för förtydligandet.')],
  );
  const session = await setup({ modelFetch: model.provider });
  const before = await readMap();
  const asked = await settled(await send(session, 'Beskriv stolen.'));
  expect(asked).toMatchObject({
    phase: 'ready',
    questions: [question],
    questionPending: true,
    modelReply: question,
    operations: [],
  });
  expect(asked.receipt).toBeUndefined();
  expect(await readMap()).toEqual(before);
  const answered = await settled(await send(asked, 'Den som heter Min stol.'));
  expect(answered).toMatchObject({ phase: 'ready', questionPending: false });
  expect(answered.questions).toBeUndefined();
  expect(JSON.stringify(model.requests[1].input)).toContain('questionPending');
  expect(JSON.stringify(model.requests[1].input)).toContain(question);
  expect(await readMap()).toEqual(before);
});

test.each(['partial', 'unknown', 'empty'])(
  'question resolution keeps other pending questions for a %s answer',
  async (answer) => {
    const questions = ['Vilken stol menar du?', 'Vem använder cykeln?'];
    const model = textModel((request) => [
      modelTool(
        'ask_questions',
        model.requests.length === 1
          ? { questions }
          : {
              questions: [],
              updates: (answer === 'partial'
                ? [questions[0]]
                : answer === 'unknown'
                  ? [questions[0], 'Vilken båt?']
                  : []
              ).map((question) => pendingUpdate(request, question)),
            },
      ),
    ]);
    const session = await setup({ modelFetch: model.provider });
    const asked = await settled(await send(session, 'Beskriv stolen och cykelns användare.'));
    const before = await readMap();
    const answered = await settled(await send(asked, 'Stolen heter Min stol.'));
    expect(answered).toMatchObject({
      phase: answer === 'partial' ? 'ready' : 'error',
      questionPending: true,
      questions: answer === 'partial' ? [questions[1]] : questions,
    });
    expect(answered.receipt).toBeUndefined();
    expect(await readMap()).toEqual(before);
  },
);

test('a provider cannot resolve a question it just asked before the user has another turn', async () => {
  const question = 'Vilken stol menar du?';
  const model = textModel((request) => [
    modelTool(
      'ask_questions',
      model.requests.length === 1
        ? { questions: [question], continueResponse: true }
        : { questions: [], updates: [pendingUpdate(request, question)] },
    ),
  ]);
  const session = await setup({ modelFetch: model.provider });
  const before = await readMap();
  const result = await settled(await send(session, 'Rätta stolen och spara.'));
  expect(result).toMatchObject({
    phase: 'error',
    questions: [question],
    questionPending: true,
  });
  expect(result.receipt).toBeUndefined();
  expect(result.operations).toEqual([]);
  expect(await readMap()).toEqual(before);
});

test.each(['latest_save', 'save'])(
  'a %s report without a durable receipt cannot invent a saved result',
  async (source) => {
    const model = textModel(() => [
      modelTool('report_result', {
        source,
        ...(source === 'save' ? { operationId: 'never-saved', userId: 'unknown-owner' } : {}),
      }),
    ]);
    const session = await setup({ modelFetch: model.provider });
    const before = await readMap();
    const result = await settled(await send(session, 'Vad sparades tidigare?'));
    expect(result.receipt).toBeUndefined();
    expect(result.operations).toEqual([]);
    if (source === 'save')
      expect(result).toMatchObject({ phase: 'error', error: 'history_unavailable' });
    else {
      expect(result.phase).toBe('ready');
      expect(result.reply).toBe('Det finns inget tidigare sparande i hushållets historik.');
    }
    expect(await readMap()).toEqual(before);
    expect((await (await browser.get(`${base}/map/history`)).json()).history).toEqual([]);
  },
);

test.each([
  { label: 'missing content', result: { isError: false } },
  { label: 'non-text content', result: { content: [{ type: 'image', data: 'private-result' }] } },
  {
    label: 'unclassified error',
    result: { isError: true, content: [{ type: 'text', text: '{}' }] },
  },
])(
  'a malformed checked-tool response with $label fails privately and preserves work',
  async ({ result }) => {
    const model = textModel(() =>
      model.requests.length === 1
        ? [modelTool('read_type_catalog', {})]
        : [modelTool('report_result', { source: 'last_failure' })],
    );
    const session = await setup({
      modelFetch: model.provider,
      assistantDispatch: async (incoming, dispatch) => {
        const rpc =
          incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
            ? await incoming.clone().json()
            : null;
        if (rpc?.params?.name === 'read_type_catalog')
          return Response.json({ jsonrpc: '2.0', id: rpc.id, result });
        return dispatch(incoming);
      },
    });
    const before = await readMap();
    const failed = await settled(await send(session, 'Läs vilka typer som finns.'));
    expect(failed.phase).toBe('error');
    expect(failed.receipt).toBeUndefined();
    expect(failed.operations).toEqual([]);
    const report = await settled(await send(failed, 'Vad var felet?'));
    expect(report).toMatchObject({ phase: 'ready', result: { kind: 'failure' } });
    expect(report.reply).toContain('Det senaste registrerade felbeskedet var:');
    expect(JSON.stringify([report, model.requests])).not.toContain('private-result');
    expect(await readMap()).toEqual(before);
  },
);

test('a summary request waits for admitted work and leaves its task and draft intact', async () => {
  let held = false;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        held = true;
        release = () => resolve([modelMessage('Klart med beskrivningen.')]);
      }),
  );
  const session = await setup({ modelFetch: model.provider });
  const before = await readMap();
  const working = await send(session);
  await expect.poll(() => held).toBe(true);
  const response = await post(`${base}/text-assistant/${session.id}/summarize`, {});
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    phase: 'working',
    taskId: working.taskId,
    review: working.review,
  });
  expect(model.requests).toHaveLength(1);
  expect(await readMap()).toEqual(before);
  release();
  const finished = await settled(working);
  expect(finished.phase).toBe('ready');
  expect(finished.contextGeneration).toBe(session.contextGeneration);
  expect(model.requests).toHaveLength(1);
  expect(await readMap()).toEqual(before);
});
