import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

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
    value: { typeId: map.types[0].id, name: 'Min stol', description: 'Privat förslag' },
  });
  expect(proposed.status(), await proposed.text()).toBe(200);
  const started = await post(`${base}/text-assistant`, approvedForVisit);
  expect(started.status(), await started.text()).toBe(201);
  return (await started.json()) as TextAssistantView;
}
const post = (url: string, data: object) =>
  browser.post(url, { headers: { origin: app.origin }, data });
const readMap = async (): Promise<MapState> => (await browser.get(`${base}/map`)).json();
async function send(session: TextAssistantView, text = 'Beskriv mitt utkast.') {
  const response = await post(`${base}/text-assistant/${session.id}/messages`, {
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    requestId: crypto.randomUUID(),
    text,
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

test.each(['submit_changes', 'ask_questions', 'report_result'])(
  'a provider cannot combine %s with a second action to change the private draft',
  async (action) => {
    let typeId = '';
    const operation = () => ({
      id: 'provider-chair',
      baseRevision: null,
      value: { typeId, name: 'En annan stol', description: '' },
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
  const model = textModel(() =>
    model.requests.length === 1
      ? [modelTool('ask_questions', { questions: [`  ${question}  `] })]
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
      expect(result).toMatchObject({ phase: 'error', error: 'undo_unavailable' });
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
