import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel, verifiedAnswers } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let base: string;
let session: TextAssistantView;
let release = () => {};
const post = (path: string, data: unknown) =>
  client.post(`${base}/${path}`, { headers: { origin: app.origin }, data });
const map = async (): Promise<MapState> => (await client.get(`${base}/map`)).json();
const read = async (): Promise<TextAssistantView> =>
  (await client.get(`${base}/text-assistant/${session.id}`)).json();
afterEach(async () => {
  release();
  await client?.dispose();
  await app?.close();
});

test('a manual draft change during a plain save response requires a fresh explicit save request', {
  tags: ['technical'],
}, async () => {
  let entered = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async () => {
    entered = true;
    await held;
    return [modelMessage('Jag kontrollerar sparandet.')];
  });
  await setup(model);
  const finishing = send('Spara hela utkastet.');
  await expect.poll(() => entered).toBe(true);
  const before = await map();
  const edited = await post('map/draft', {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    id: 'untouched',
    baseRevision: null,
    value: {
      ...before.draft.changes.find((change) => change.id === 'untouched')?.after,
      name: 'Manuell rättelse',
    },
  });
  expect(edited.status(), await edited.text()).toBe(200);
  release();
  const final = await finishing;
  expect(final.error).toBe('assistant_draft_changed');
  expect(final.receipt).toBeUndefined();
  expect(final.operations).toEqual([]);
  expect(final.reply).toContain('sparbegäran gäller inte längre');
  expect((await map()).objects).toEqual([]);
  expect((await map()).draft.changes.find((change) => change.id === 'untouched')?.after?.name).toBe(
    'Manuell rättelse',
  );
  expect((await (await client.get(`${base}/map/history`)).json()).history).toEqual([]);
});

test('an old whole-draft approval cannot save newer proposals and a rejected attempt needs fresh authority', {
  tags: ['technical'],
}, async () => {
  let checking = false;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(
    (body) => {
      const { message, draft } = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return message === 'Vad finns i utkastet?'
        ? [modelMessage('Den manuella rättelsen finns kvar osparad.')]
        : [
            modelTool('save_draft', {
              version: draft.version,
              contentVersion: draft.contentVersion,
            }),
          ];
    },
    async (body) => {
      if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE')) {
        const { current } = JSON.parse(String(body.input[0].content));
        return [
          modelMessage(
            JSON.stringify({
              mode: current === 'Vad finns i utkastet?' ? 'read' : 'work',
              request: current,
            }),
          ),
        ];
      }
      checking = true;
      await held;
      return [modelMessage('{"decision":"allow","complete":true}')];
    },
  );
  await setup(model);
  const finishing = send('Spara hela utkastet.');
  await expect.poll(() => checking).toBe(true);
  await stage('draft', {
    id: 'untouched',
    baseRevision: null,
    value: {
      ...(await map()).draft.changes.find((change) => change.id === 'untouched')?.after,
      name: 'Manuell rättelse',
    },
  });
  release();
  const rejected = await finishing;
  expect(rejected.receipt).toBeUndefined();
  expect(rejected.operations).toEqual([
    expect.objectContaining({ status: 'rejected', error: 'draft_conflict' }),
  ]);
  expect((await map()).objects).toEqual([]);
  expect((await (await client.get(`${base}/map/history`)).json()).history).toEqual([]);
  const recovered = await post(`text-assistant/${session.id}/recover`, {});
  expect(recovered.status(), await recovered.text()).toBe(200);
  session = await recovered.json();
  expect(session.workFailure?.request).toBe('Spara hela utkastet.');
  const retainedDraft = (await map()).draft;
  const abandoned = await post(`text-assistant/${session.id}/abandon-work`, {
    revision: session.revision,
    requestId: session.workFailure?.requestId,
  });
  expect(abandoned.status(), await abandoned.text()).toBe(202);
  session = await abandoned.json();
  expect(session.workFailure).toBeUndefined();
  expect(session.receipt).toBeUndefined();
  expect((await map()).draft).toEqual(retainedDraft);
  expect((await map()).objects).toEqual([]);
  expect((await (await client.get(`${base}/map/operations`)).json()).operations).toEqual(
    rejected.operations,
  );
  expect((await (await client.get(`${base}/map/history`)).json()).history).toEqual([]);
  expect((await send('Vad finns i utkastet?')).receipt).toBeUndefined();
  expect((await map()).objects).toEqual([]);
  const saved = await send('Spara hela utkastet.');
  expect(saved.receipt).toBeDefined();
  expect((await map()).objects.find((object) => object.id === 'untouched')?.name).toBe(
    'Manuell rättelse',
  );
  expect((await (await client.get(`${base}/map/history`)).json()).history).toHaveLength(1);
});
async function setup(
  model: ReturnType<typeof textModel>,
  options: Parameters<typeof createInstallation>[1] = {},
) {
  app = await createInstallation(undefined, { ...options, modelFetch: model.provider });
  client = await request.newContext();
  await signIn(client, app.origin);
  const { household } = await (await createHousehold(client, app.origin)).json();
  base = `${app.origin}/api/households/${household.id}`;
  const state = await map();
  const response = await post('map/draft', {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    id: 'earlier',
    baseRevision: null,
    value: { typeId: state.types[0].id, name: 'Tidigare stol' },
  });
  expect(response.status(), await response.text()).toBe(200);
  const current = await map();
  expect(
    (
      await post('map/draft', {
        version: current.draft.version,
        contentVersion: current.contentVersion,
        id: 'untouched',
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Tidigare lampa' },
      })
    ).status(),
  ).toBe(200);
  session = await (await post('text-assistant', approvedForVisit)).json();
}
async function send(text: string, answerTo?: { id: string; revision: number }[]) {
  const requestId = crypto.randomUUID();
  const response = await post(`text-assistant/${session.id}/messages`, {
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    requestId,
    text,
    answerTo,
  });
  expect(response.status(), await response.text()).toBe(202);
  await expect
    .poll(async () => {
      session = await (
        await client.get(`${base}/text-assistant/${session.id}/messages/${requestId}`)
      ).json();
      return session.taskStatus;
    })
    .toBe('completed');
  return session;
}
async function stage(route: string, data: object) {
  const state = await map();
  const response = await post(`map/${route}`, {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    ...data,
  });
  expect(response.status(), await response.text()).toBe(200);
  session = await read();
}

test('checker clarification retains its request identity through a rephrased answer and requires fresh saving', async () => {
  const questions = ['Vilken stol menar du?', 'Menar du Tidigare stol?'];
  let checks = 0;
  let matches = 0;
  const model = textModel(
    (body) => {
      const { message, draft } = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (message === 'Ja, behåll Tidigare stol.')
        return [
          modelTool('ask_questions', {
            questions: [],
            updates: verifiedAnswers(body, [questions[1]]),
          }),
        ];
      if (message === 'Rätta stolen.')
        return [
          modelTool('propose_object', {
            version: draft.version,
            contentVersion: draft.contentVersion,
            id: 'earlier',
            baseRevision: null,
            value: {
              ...draft.changes.find((change: { id: string }) => change.id === 'earlier').after,
              name: 'Rättad stol',
            },
          }),
        ];
      return [
        modelTool('save_draft', { version: draft.version, contentVersion: draft.contentVersion }),
      ];
    },
    (body) => {
      const input = JSON.parse(String(body.input[0].content));
      if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE'))
        return [
          modelMessage(
            JSON.stringify({ mode: 'work', request: input.current, responseRequired: false }),
          ),
        ];
      if (body.instructions.startsWith('SKYTTEL_TURN_CLARIFICATION')) {
        matches++;
        expect(input.current).toBe('Rätta stolen.');
        expect(input.untrusted.parts).toHaveLength(1);
        expect(input.untrusted.parts[0].request).toBe('Spara hela utkastet.');
        expect(input.untrusted.checked).toMatchObject({
          operation: { name: 'propose_object', arguments: { id: 'earlier' } },
          question: questions[1],
        });
        const { id, revision } = input.untrusted.parts[0];
        return [modelMessage(JSON.stringify({ decision: 'rephrase', parts: [{ id, revision }] }))];
      }
      const question = questions[checks++];
      return [
        modelMessage(
          JSON.stringify(
            question
              ? { decision: 'clarify', operation: 0, question }
              : { decision: 'allow', complete: true, fulfillsRequest: true },
          ),
        ),
      ];
    },
  );
  await setup(model);
  const originalDraft = (await map()).draft;
  const first = await send('Spara hela utkastet.');
  const part = first.pendingParts?.[0];
  expect(part).toMatchObject({
    request: 'Spara hela utkastet.',
    status: 'waiting',
    question: questions[0],
  });
  if (!part) throw new Error('Missing pending checker question');
  const second = await send('Rätta stolen.', [{ id: part.id, revision: part.revision }]);
  expect(matches).toBe(1);
  expect(second.error).toBe('assistant_scope_unclear');
  expect(second.pendingParts).toHaveLength(1);
  expect(second.pendingParts?.[0]).toMatchObject({
    id: part.id,
    request: part.request,
    status: 'waiting',
    question: questions[1],
  });
  const answered = await send('Ja, behåll Tidigare stol.');
  expect(answered.error).toBeUndefined();
  expect(answered.pendingParts?.some((part) => part.status === 'waiting')).toBe(false);
  expect(answered.receipt).toBeUndefined();
  expect((await map()).draft).toEqual(originalDraft);
  expect((await map()).objects).toEqual([]);
  expect((await (await client.get(`${base}/map/history`)).json()).history).toEqual([]);
  const saved = await send('Spara hela utkastet.');
  expect(saved.receipt).toBeDefined();
  expect((await map()).objects).toHaveLength(2);
});

test('a rejected whole-draft check preserves both earlier proposals and the applied edit without registering a save', {
  tags: ['technical'],
}, async () => {
  const model = textModel(
    (body) => {
      const { draft } = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'save',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'earlier',
                baseRevision: null,
                value: { ...draft.changes[0].after, name: 'Rättad stol' },
              },
            },
          ],
        }),
      ];
    },
    (body) => {
      if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE'))
        return [modelMessage(JSON.stringify({ mode: 'work', request: 'Rätta och spara.' }))];
      const { untrusted } = JSON.parse(String(body.input[0].content));
      const saving = untrusted.operations.every(
        (operation: { name: string }) => operation.name === 'save_draft',
      );
      const names = untrusted.data.draft.changes.map(
        (change: { after: { name: string } }) => change.after.name,
      );
      if (saving) {
        expect(untrusted.data.initialDraft.changes).toMatchObject([
          { id: 'earlier', after: { name: 'Tidigare stol' } },
          { id: 'untouched', after: { name: 'Tidigare lampa' } },
        ]);
        expect(untrusted.data.initialDraft.version).toBeLessThan(untrusted.data.draft.version);
      }
      if (
        saving &&
        names.includes('Rättad stol') &&
        names.includes('Tidigare lampa') &&
        untrusted.data.draft.relationships.some(
          (change: { id: string }) => change.id === 'earlier-link',
        ) &&
        untrusted.data.draft.objectTypes.some(
          (change: { id: string }) => change.id === 'earlier-type',
        ) &&
        untrusted.data.draft.relationshipTypes.some(
          (change: { id: string }) => change.id === 'earlier-link-type',
        )
      )
        return [
          modelMessage(
            JSON.stringify({
              decision: 'clarify',
              operation: 0,
              question: 'Ska den tidigare lampan också ingå i sparandet?',
            }),
          ),
        ];
      return [modelMessage(JSON.stringify({ decision: 'allow', complete: true }))];
    },
  );
  await setup(model);
  await stage('object-type', {
    id: 'earlier-type',
    baseRevision: null,
    value: { name: 'Provtyp', description: 'Tidigare typförslag' },
  });
  await stage('relationship-type', {
    id: 'earlier-link-type',
    baseRevision: null,
    value: {
      name: 'Förvaras',
      description: '',
    },
  });
  await stage('relationship', {
    id: 'earlier-link',
    baseRevision: null,
    value: { typeId: 'earlier-link-type', sourceId: 'earlier', targetId: 'untouched' },
  });
  const final = await send('Ändra namnet till Rättad stol och spara.');
  expect(final.phase).toBe('error');
  expect(final.error).toBe('assistant_scope_unclear');
  expect(final.receipt).toBeUndefined();
  expect(final.operations).toEqual([]);
  expect(final.reply).toContain('utkast');
  expect(final.reply).toContain('Ska den tidigare lampan också ingå i sparandet?');
  expect(final.pendingParts).toMatchObject([
    {
      kind: 'change',
      status: 'waiting',
      request: 'Ändra namnet till Rättad stol och spara.',
      question: 'Ska den tidigare lampan också ingå i sparandet?',
    },
  ]);
  const state = await map();
  expect(state.objects).toEqual([]);
  expect(state.draft.changes).toHaveLength(2);
  expect(state.draft.relationships).toMatchObject([
    { id: 'earlier-link', after: { sourceId: 'earlier', targetId: 'untouched' } },
  ]);
  expect(state.draft.objectTypes).toMatchObject([
    { id: 'earlier-type', after: { name: 'Provtyp' } },
  ]);
  expect(state.draft.relationshipTypes).toMatchObject([
    { id: 'earlier-link-type', after: { name: 'Förvaras' } },
  ]);
  expect(state.draft.changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'earlier',
        after: expect.objectContaining({ name: 'Rättad stol' }),
      }),
      expect.objectContaining({
        id: 'untouched',
        after: expect.objectContaining({ name: 'Tidigare lampa' }),
      }),
    ]),
  );
  expect((await (await client.get(`${base}/map/history`)).json()).history).toEqual([]);
});

test('manual changes during the spoken save quiet period cannot enter the fallback save basis', {
  tags: ['technical'],
}, async () => {
  const live = liveProvider();
  let time = Date.now();
  const model = textModel(() => [modelMessage('Jag kontrollerar sparandet.')]);
  await setup(model, { liveFetch: live.provider, liveSideband: live.attach, now: () => time });
  const started = await post(`text-assistant/${session.id}/voice`, {
    sdp: 'synthetic-offer',
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
  });
  expect(started.status(), await started.text()).toBe(201);
  const channel = [...live.channels.keys()][0];
  live.emit(channel, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: 'Spara hela utkastet.',
    start_ms: 0,
    end_ms: 1,
  });
  live.emit(channel, {
    type: 'session.delegation.created',
    event_id: crypto.randomUUID(),
    offset_ms: 1,
    delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
  });
  time += 2100;
  await expect
    .poll(
      async () => {
        session = await read();
        return session.modelReply;
      },
      { timeout: 7000 },
    )
    .toBe('Jag kontrollerar sparandet.');
  const state = await map();
  const response = await post('map/draft', {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    id: 'untouched',
    baseRevision: null,
    value: {
      ...state.draft.changes.find((change) => change.id === 'untouched')?.after,
      name: 'Manuell rättelse',
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  time += 2100;
  await expect
    .poll(
      async () => {
        session = await read();
        return session.completedReplies?.some((reply) => reply.source === 'voice');
      },
      { timeout: 7000 },
    )
    .toBe(true);
  expect(session.receipt).toBeUndefined();
  expect(session.error).toBe('assistant_draft_changed');
  expect(session.reply).toContain('sparbegäran gäller inte längre');
  expect((await map()).objects).toEqual([]);
  expect((await map()).draft.changes.find((change) => change.id === 'untouched')?.after?.name).toBe(
    'Manuell rättelse',
  );
  expect((await (await client.get(`${base}/map/history`)).json()).history).toEqual([]);
});

test('rejected automatic saving describes the already applied draft edit as unsaved', {
  tags: ['technical'],
}, async () => {
  const model = textModel(
    (body) => {
      const current = body.input.slice(body.input.findLastIndex((item) => item.role === 'user'));
      if (current.some((item) => item.type === 'function_call_output'))
        return [modelMessage('Ändringen är klar för kontroll av sparandet.')];
      const { draft } = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'draft',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'earlier',
                baseRevision: null,
                value: {
                  ...draft.changes.find((change: { id: string }) => change.id === 'earlier').after,
                  name: 'Rättad stol',
                },
              },
            },
          ],
        }),
      ];
    },
    (body) => {
      if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE'))
        return [modelMessage('{"mode":"work","request":"Rätta namnet och spara."}')];
      const { untrusted } = JSON.parse(String(body.input[0].content));
      return [
        modelMessage(
          untrusted.operations.every((operation: { name: string }) =>
            ['prepare_save', 'save_draft'].includes(operation.name),
          )
            ? '{"decision":"clarify","operation":0,"question":"Ska den tidigare lampan också sparas?"}'
            : '{"decision":"allow","complete":true}',
        ),
      ];
    },
  );
  await setup(model);
  const final = await send('Ändra namnet till Rättad stol och spara.');
  expect(final.error).toBe('assistant_scope_unclear');
  expect(final.reply).toContain('Ska den tidigare lampan också sparas?');
  expect(final.pendingParts).toMatchObject([
    { status: 'waiting', request: 'Ändra namnet till Rättad stol och spara.' },
  ]);
  expect(final.reply).toContain('Ändringarna ligger kvar osparade i ditt utkast.');
  expect(final.receipt).toBeUndefined();
  expect(final.operations).toEqual([]);
  expect((await map()).draft.changes.find((change) => change.id === 'earlier')?.after?.name).toBe(
    'Rättad stol',
  );
  expect((await map()).objects).toEqual([]);
});

test('rejecting the separate save scope does not reject an otherwise approved edit batch', {
  tags: ['technical'],
}, async () => {
  const model = textModel(
    (body) => {
      const { draft } = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'save',
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: 'earlier',
                baseRevision: null,
                value: {
                  ...draft.changes.find((change: { id: string }) => change.id === 'earlier').after,
                  name: 'Rättad stol',
                },
              },
            },
          ],
        }),
      ];
    },
    (body) => {
      if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE'))
        return [modelMessage('{"mode":"work","request":"Rätta namnet och spara."}')];
      const { untrusted } = JSON.parse(String(body.input[0].content));
      const save = untrusted.operations.findIndex((operation: { name: string }) =>
        ['prepare_save', 'save_draft'].includes(operation.name),
      );
      return [
        modelMessage(
          JSON.stringify(
            save < 0
              ? { decision: 'allow', complete: true }
              : { decision: 'deny', operation: save },
          ),
        ),
      ];
    },
  );
  await setup(model);
  const final = await send('Ändra namnet till Rättad stol och spara.');
  expect(final.error).toBe('assistant_action_out_of_scope');
  expect(final.receipt).toBeUndefined();
  expect(final.operations).toEqual([]);
  expect((await map()).draft.changes.find((change) => change.id === 'earlier')?.after?.name).toBe(
    'Rättad stol',
  );
  expect(final.reply).toContain('Ändringarna ligger kvar osparade i ditt utkast.');
  expect((await map()).objects).toEqual([]);
});

test('a failed save request after removing the last proposals never claims unsaved changes remain', {
  tags: ['technical'],
}, async () => {
  const model = textModel((body) => {
    if (model.requests.length > 1) return [modelTool('report_result', { source: 'last_failure' })];
    const { draft } = JSON.parse(
      String(body.input.findLast((item) => item.role === 'user')?.content),
    );
    return [
      modelTool('submit_changes', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        completion: 'draft',
        continueResponse: true,
        operations: ['earlier', 'untouched'].map((id) => ({
          name: 'discard_proposal',
          arguments: { kind: 'object', id },
        })),
      }),
    ];
  });
  await setup(model);
  const final = await send('Ta bort båda förslagen och spara.');
  expect(final.error).toBe('invalid_request');
  expect(final.reply).not.toContain('Ändringarna ligger kvar osparade');
  expect(final.receipt).toBeUndefined();
  expect(final.operations).toEqual([]);
  expect((await map()).draft.changes).toEqual([]);
  expect((await map()).objects).toEqual([]);
});
