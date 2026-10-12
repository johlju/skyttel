import { type APIRequestContext, type APIResponse, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { assistantFailureMessage } from '../../../src/server/assistant-feedback.js';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../../support/text-model.js';

let fixture: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let path: string;
let session: TextAssistantView;
const post = (route: string, body: unknown) =>
  client.post(`${path}/${route}`, { headers: { origin: fixture.origin }, data: body });
const read = async (): Promise<TextAssistantView> =>
  (await client.get(`${path}/text-assistant/${session.id}`)).json();
const map = async (): Promise<MapState> => (await client.get(`${path}/map`)).json();
async function checked(response: APIResponse, status = 200) {
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(status);
  return body;
}
async function setup(provider: typeof fetch) {
  fixture = await createInstallation(undefined, { modelFetch: provider });
  client = await request.newContext();
  await signIn(client, fixture.origin);
  const { household } = await checked(await createHousehold(client, fixture.origin), 201);
  path = `${fixture.origin}/api/households/${household.id}`;
  session = await checked(await post('text-assistant', approvedForVisit), 201);
}
function messageBody(text = 'Beskriv mitt utkast.', overrides: Record<string, unknown> = {}) {
  return {
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    requestId: crypto.randomUUID(),
    text,
    ...overrides,
  };
}
async function message(text: string) {
  await checked(await post(`text-assistant/${session.id}/messages`, messageBody(text)), 202);
  await expect
    .poll(async () => {
      session = await read();
      return session.phase;
    })
    .not.toBe('working');
  return session;
}
async function object(id = 'lamp', value: Record<string, unknown> = {}) {
  const state = await map();
  const before = state.objects.find((object) => object.id === id);
  await checked(
    await post('map/draft', {
      id,
      version: state.draft.version,
      contentVersion: state.contentVersion,
      baseRevision: before?.revision ?? null,
      value: { typeId: state.types[0].id, name: 'Lampan', description: '', ...before, ...value },
    }),
  );
  session = await read();
}
afterEach(async () => {
  if (session?.id && client) await post(`text-assistant/${session.id}/stop`, {});
  await client?.dispose();
  await fixture?.close();
});

test('invalid conversation deliveries preserve all accepted work and never reach the provider', async () => {
  const model = textModel(() => [modelMessage('Läsning klar.')]);
  await setup(model.provider);
  await object();
  const before = await map();
  const conversationBefore = await read();
  for (const invalid of [
    { text: null },
    { text: '' },
    { text: ' ' },
    { text: 'x'.repeat(4001) },
    { queue: 'yes' },
    { voiceContext: 12 },
    { voiceContext: 'x'.repeat(8001) },
    { draftVersion: -1 },
    { draftVersion: 0.5 },
    { contentVersion: 0 },
    { contentVersion: '1' },
    { requestId: 12 },
    { requestId: 'not/a/request' },
  ]) {
    expect(
      await checked(
        await post(`text-assistant/${session.id}/messages`, messageBody('Läs.', invalid)),
        400,
      ),
    ).toEqual({ error: 'invalid_request' });
    expect(await map()).toEqual(before);
    expect(await read()).toEqual(conversationBefore);
  }
  expect(model.requests).toEqual([]);
  const body = messageBody('Beskriv lampan.');
  await checked(await post(`text-assistant/${session.id}/messages`, body), 202);
  await expect.poll(async () => (await read()).phase).toBe('ready');
  const completed = await read();
  expect(await checked(await post(`text-assistant/${session.id}/messages`, body), 202)).toEqual(
    completed,
  );
  expect(
    await checked(
      await post(`text-assistant/${session.id}/messages`, { ...body, text: 'Ändrad leverans' }),
      409,
    ),
  ).toEqual({ error: 'assistant_turn_changed' });
  expect(model.requests).toHaveLength(1);
  expect(await map()).toEqual(before);
  expect(
    await checked(await client.get(`${path}/text-assistant/${session.id}/messages/missing`), 409),
  ).toEqual({
    error: 'assistant_turn_changed',
  });
});

test('recovery validates its durable request even without a conversation or AI and rejects stale retry identities', async () => {
  const model = textModel(() => [modelMessage('Läsning klar.')]);
  await setup(model.provider);
  await object();
  const before = await map();
  for (const body of [
    null,
    { operationIds: 'save' },
    { operationIds: new Array(21).fill('save') },
    { operationIds: [12] },
    { operationIds: ['invalid/id'] },
    { checkId: 12 },
    { checkId: 'bad-check' },
  ]) {
    expect(await checked(await post('text-assistant/recover', body), 400)).toEqual({
      error: 'invalid_request',
    });
    expect(await map()).toEqual(before);
  }
  for (const body of [{ checkId: 12 }, { checkId: 'bad-check' }])
    expect(await checked(await post(`text-assistant/${session.id}/recover`, body), 400)).toEqual({
      error: 'invalid_request',
    });
  expect(
    await checked(
      await post(`text-assistant/${session.id}/retry`, { operationId: 'missing' }),
      409,
    ),
  ).toEqual({ error: 'operation_conflict' });
  expect(
    await checked(
      await post(`text-assistant/${session.id}/retry`, { operationId: 'missing', revision: 100 }),
      409,
    ),
  ).toEqual({ error: 'assistant_turn_changed' });
  expect(await map()).toEqual(before);
  await checked(await post(`text-assistant/${session.id}/stop`, {}));
  const recovered = await checked(await post('text-assistant/recover', {}));
  expect(recovered.operations).toEqual([]);
  expect(recovered.receipt).toBeUndefined();
  expect(await map()).toEqual(before);
  expect(model.requests).toEqual([]);
});

test.each([
  ['unknown tool', [modelTool('merge_objects', {})], 'assistant_unknown_tool'],
  ['mixed batch', [modelTool('submit_changes', {}), modelTool('read_map', {})], 'invalid_request'],
  ['malformed batch', [modelTool('submit_changes', { operations: [] })], 'invalid_request'],
  [
    'mixed questions',
    [modelTool('ask_questions', { questions: ['Vem?'] }), modelTool('read_map', {})],
    'invalid_request',
  ],
  [
    'mixed report',
    [modelTool('report_result', { source: 'draft' }), modelTool('read_map', {})],
    'invalid_request',
  ],
  [
    'invalid report',
    [modelTool('report_result', { source: 'save', operationId: 'missing' })],
    'invalid_request',
  ],
  [
    'invalid selected kind',
    [modelTool('show_map_item', { kind: 'type', id: 'lamp' })],
    'invalid_request',
  ],
  [
    'invalid selected identity',
    [modelTool('show_map_item', { kind: 'object', id: 'bad/id' })],
    'invalid_request',
  ],
  [
    'extra selection argument',
    [modelTool('show_map_object', { objectId: 'lamp', extra: true })],
    'invalid_request',
  ],
  [
    'missing selected object',
    [modelTool('show_map_item', { kind: 'object', id: 'missing' })],
    'assistant_object_missing',
  ],
] as const)(
  '%s provider command cannot mutate the household or claim a verified result',
  async (_name, output, error) => {
    const model = textModel(() => [...output]);
    await setup(model.provider);
    await object();
    const before = await map();
    const result = await message('Läs mitt utkast.');
    expect(result).toMatchObject({ phase: 'error', error });
    expect(result.reply).toBe(assistantFailureMessage(error));
    expect(result.receipt).toBeUndefined();
    expect(result.selection).toBeUndefined();
    expect(await map()).toEqual(before);
    expect((await (await client.get(`${path}/map/history`)).json()).history).toEqual([]);
    expect(model.requests).toHaveLength(1);
  },
);

test.each([
  { name: 'read-only operation', operation: { name: 'read_map', arguments: {} } },
  {
    name: 'caller supplied draft version',
    operation: { name: 'discard_draft', arguments: { version: 1 } },
  },
  {
    name: 'caller supplied generation',
    operation: { name: 'discard_draft', arguments: { contentVersion: 1 } },
  },
  {
    name: 'invalid ordinary schema',
    operation: { name: 'propose_object', arguments: { id: 'bad/id' } },
  },
])('batch rejects $name before applying its first valid mutation', async ({ operation }) => {
  const model = textModel((request) => {
    const input = request.input.findLast((item) => item.role === 'user');
    const { draft } = JSON.parse(String(input?.content));
    return [
      modelTool('submit_changes', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        completion: 'draft',
        operations: [{ name: 'discard_draft', arguments: {} }, operation],
      }),
    ];
  });
  await setup(model.provider);
  await object();
  const before = await map();
  expect(await message('Gör ett utkast.')).toMatchObject({
    phase: 'error',
    error: 'invalid_request',
  });
  expect(await map()).toEqual(before);
  expect(model.requests).toHaveLength(1);
});

test.each(['draft version', 'content generation', 'save with questions', 'save without consent'])(
  'batch rejects %s without losing independent proposals',
  async (scenario) => {
    const model = textModel((request) => {
      const input = request.input.findLast((item) => item.role === 'user');
      const { draft } = JSON.parse(String(input?.content));
      return [
        modelTool('submit_changes', {
          version: draft.version + Number(scenario === 'draft version'),
          contentVersion: draft.contentVersion + Number(scenario === 'content generation'),
          completion: scenario.startsWith('save') ? 'save' : 'draft',
          questions: scenario === 'save with questions' ? ['Vem använder lampan?'] : [],
          operations: [{ name: 'discard_draft', arguments: {} }],
        }),
      ];
    });
    await setup(model.provider);
    await object();
    const before = await map();
    expect(
      await message(scenario === 'save with questions' ? 'Spara hela utkastet.' : 'Läs.'),
    ).toMatchObject({
      phase: 'error',
      error:
        scenario === 'save without consent'
          ? 'assistant_save_not_requested'
          : scenario === 'save with questions'
            ? 'invalid_request'
            : 'assistant_draft_changed',
    });
    expect(await map()).toEqual(before);
    expect(model.requests).toHaveLength(1);
  },
);

test('unknown prior failures and empty history produce server wording without creating a save', async () => {
  let source = 'last_failure';
  const model = textModel(() => [modelTool('report_result', { source })]);
  await setup(model.provider);
  await object();
  const before = await map();
  expect(await message('Vad var felet?')).toMatchObject({
    phase: 'ready',
    result: { kind: 'failure', message: 'Det finns inget registrerat fel i det här samtalet.' },
    reply: 'Det finns inget registrerat fel i det här samtalet.',
  });
  source = 'latest_save';
  const result = await message('Vad sparades senast?');
  expect(result.result?.kind).toBe('history');
  expect(result.reply).toBe('Det finns inget tidigare sparande i hushållets historik.');
  expect(result.receipt).toBeUndefined();
  expect(await map()).toEqual(before);
  expect(model.requests).toHaveLength(2);
});

test.each([
  [
    'definition_in_use',
    null,
    'Typen används fortfarande av objekt, samband eller utkast. De behöver hanteras innan typen kan tas bort.',
  ],
  [
    'field_in_use',
    [],
    'Fältet innehåller fortfarande uppgifter i kartan eller utkast. De behöver hanteras innan fältet kan tas bort.',
  ],
  [
    'field_kind_in_use',
    [{ id: 'serial', name: 'Serienummer', description: '', kind: 'number' }],
    'Fältets värdeslag kan inte ändras medan det används. Ett nytt fält behövs för det nya värdeslaget.',
  ],
] as const)(
  'a real %s refusal is preserved and reported from server facts without applying the requested type mutation',
  async (error, fields, reason) => {
    let reporting = false;
    const model = textModel((request) => {
      if (reporting) return [modelTool('report_result', { source: 'last_failure' })];
      const input = request.input.findLast((item) => item.role === 'user');
      const { draft } = JSON.parse(String(input?.content));
      return [
        modelTool('propose_object_type', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          id: 'field-type',
          baseRevision: 1,
          value: fields === null ? null : { name: 'Utrustning', description: '', fields },
        }),
      ];
    });
    await setup(model.provider);
    await checked(
      await post('map/object-type', {
        id: 'field-type',
        version: 0,
        baseRevision: null,
        value: {
          name: 'Utrustning',
          description: '',
          fields: [{ id: 'serial', name: 'Serienummer', description: '', kind: 'text' }],
        },
      }),
    );
    await checked(await post('map/save', { version: 1, operationId: 'field-defined' }));
    await object('lamp', { typeId: 'field-type', customValues: { serial: 'SYNTH-42' } });
    const before = await map();
    const failed = await message('Ändra typen enligt mitt uppdrag.');
    expect(failed).toMatchObject({ phase: 'error', error });
    expect(failed.reply).toBe(assistantFailureMessage(error));
    expect(await map()).toEqual(before);
    reporting = true;
    expect(await message('Vad hindrade ändringen?')).toMatchObject({
      phase: 'ready',
      result: { kind: 'failure', message: `Det senaste registrerade felbeskedet var: ${reason}` },
      reply: `Det senaste registrerade felbeskedet var: ${reason}`,
    });
    expect(await map()).toEqual(before);
    expect(model.requests).toHaveLength(2);
  },
);

test.each(['object', 'relationship'] as const)(
  '%s selection acknowledgement checks identity, generation, draft and display outcome',
  async (kind) => {
    const model = textModel((request) =>
      lastToolResult(request)
        ? [modelMessage('Jag har kontrollerat visningen.')]
        : [modelTool('show_map_item', { kind, id: kind === 'object' ? 'lamp' : 'edge' })],
    );
    await setup(model.provider);
    await object('lamp');
    await object('garage');
    const state = await map();
    await checked(
      await post('map/relationship', {
        version: state.draft.version,
        id: 'edge',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes[0].id,
          sourceId: 'lamp',
          targetId: 'garage',
          knowledge: 'known',
        },
      }),
    );
    session = await read();
    const before = await map();
    await checked(
      await post(`text-assistant/${session.id}/messages`, messageBody('Visa posten.')),
      202,
    );
    await expect
      .poll(async () => (await read()).selection?.id)
      .toBe(kind === 'object' ? 'lamp' : 'edge');
    session = await read();
    const selected = {
      revision: session.revision,
      kind,
      id: kind === 'object' ? 'lamp' : 'edge',
      draftVersion: session.review.version,
      contentVersion: session.review.contentVersion,
      displayed: false,
    };
    for (const invalid of [
      { revision: session.revision + 1 },
      { kind: kind === 'object' ? 'relationship' : 'object' },
      { id: 'wrong' },
      { draftVersion: session.review.version + 1 },
      { contentVersion: session.review.contentVersion + 1 },
      { displayed: 'yes' },
    ]) {
      expect(
        await checked(
          await post(`text-assistant/${session.id}/selection`, { ...selected, ...invalid }),
          409,
        ),
      ).toEqual({
        error: 'assistant_turn_changed',
      });
      expect((await read()).selection).toEqual(session.selection);
    }
    await checked(await post(`text-assistant/${session.id}/selection`, selected));
    await expect.poll(async () => (await read()).phase).toBe('ready');
    const result = await read();
    expect(result.displayedSelection).toBeUndefined();
    expect(result.reply).toBeUndefined();
    expect(result.modelReply).toBe('Jag har kontrollerat visningen.');
    expect(await map()).toEqual(before);
  },
);

test('busy conversation work can be canceled without discarding queued or completed household proposals', async () => {
  let release: () => void = () => {};
  const pause = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(async () => {
    await pause;
    return [modelMessage('För sent.')];
  });
  await setup(model.provider);
  await object();
  const before = await map();
  await checked(await post(`text-assistant/${session.id}/messages`, messageBody('Läs.')), 202);
  await expect.poll(() => model.requests.length).toBe(1);
  session = await read();
  expect(
    await checked(
      await post(`text-assistant/${session.id}/messages`, messageBody('Nästa.', { queue: false })),
      409,
    ),
  ).toEqual({ error: 'assistant_busy' });
  expect(
    await checked(await post(`text-assistant/${session.id}/retry`, { operationId: 'save' }), 409),
  ).toEqual({ error: 'assistant_turn_changed' });
  expect(await checked(await post(`text-assistant/${session.id}/recover`, {}))).toMatchObject({
    phase: 'working',
  });
  expect(await checked(await post(`text-assistant/${session.id}/summarize`, {}))).toMatchObject({
    phase: 'working',
  });
  expect(await checked(await post('text-assistant/recover', {}))).toEqual({ checking: true });
  await checked(await post(`text-assistant/${session.id}/messages`, messageBody('Köad.')), 202);
  expect(
    await checked(await post(`text-assistant/${session.id}/cancel`, { revision: 999 }), 409),
  ).toEqual({ error: 'assistant_turn_changed' });
  const canceled = await checked(await post(`text-assistant/${session.id}/cancel`, { all: true }));
  expect(canceled).toMatchObject({
    phase: 'ready',
    canceled: true,
    reply: 'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.',
  });
  expect(await checked(await post(`text-assistant/${session.id}/cancel`, { all: true }))).toEqual(
    canceled,
  );
  release();
  expect(await map()).toEqual(before);
  expect(
    await checked(await post(`text-assistant/${session.id}/new`, { discard: 'yes' }), 400),
  ).toEqual({ error: 'invalid_request' });
  expect(model.requests).toHaveLength(1);
});

test.each(['object', 'relationship', 'objectType', 'relationshipType'] as const)(
  'discarding a proposed %s removal reports private restoration without saving or replaying other proposals',
  async (kind) => {
    let id = '';
    const model = textModel((request) => {
      if (lastToolResult(request)) return [modelMessage('Förslaget är granskat.')];
      const input = request.input.findLast((item) => item.role === 'user');
      const { draft } = JSON.parse(String(input?.content));
      return [
        modelTool('discard_proposal', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          kind,
          id,
        }),
      ];
    });
    await setup(model.provider);
    await object('lamp');
    await object('garage');
    let state = await map();
    await checked(
      await post('map/relationship', {
        id: 'edge',
        version: state.draft.version,
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes[0].id,
          sourceId: 'lamp',
          targetId: 'garage',
          knowledge: 'known',
        },
      }),
    );
    state = await map();
    await checked(await post('map/save', { version: state.draft.version, operationId: 'initial' }));
    state = await map();
    id =
      kind === 'object'
        ? 'lamp'
        : kind === 'relationship'
          ? 'edge'
          : kind === 'objectType'
            ? state.types[1].id
            : state.relationshipTypes[1].id;
    const removalRoute = {
      object: 'draft',
      relationship: 'relationship',
      objectType: 'object-type',
      relationshipType: 'relationship-type',
    }[kind];
    await checked(
      await post(`map/${removalRoute}`, {
        version: state.draft.version,
        id,
        baseRevision: 1,
        value: null,
      }),
    );
    await object('independent');
    const before = await map();
    const historyBefore = await (await client.get(`${path}/map/history`)).json();
    const result = await message('Kasta just borttagningsförslaget.');
    expect(result).toMatchObject({
      phase: 'ready',
      result: { kind: 'restored', message: 'Återställt i utkastet.' },
      reply: 'Återställt i utkastet.',
      modelReply: 'Förslaget är granskat.',
    });
    const after = await map();
    expect(after.objects).toEqual(before.objects);
    expect(after.relationships).toEqual(before.relationships);
    expect(after.types).toEqual(before.types);
    expect(after.relationshipTypes).toEqual(before.relationshipTypes);
    expect(after.draft.changes).toEqual(
      before.draft.changes.filter((change) => change.id === 'independent'),
    );
    expect(after.draft.relationships ?? []).toEqual([]);
    expect(after.draft.objectTypes ?? []).toEqual([]);
    expect(after.draft.relationshipTypes ?? []).toEqual([]);
    expect(await (await client.get(`${path}/map/history`)).json()).toEqual(historyBefore);
    expect(model.requests).toHaveLength(2);
  },
);

test('a mutation followed by a historical failure request retains only its verified draft change and never invents a failure report', async () => {
  let typeId = '';
  const model = textModel((request) => {
    const input = request.input.findLast((item) => item.role === 'user');
    const { draft } = JSON.parse(String(input?.content));
    return [
      modelTool('propose_object', {
        version: draft.version,
        contentVersion: draft.contentVersion,
        id: 'new-object',
        baseRevision: null,
        value: { typeId, name: 'Nytt förslag', description: '' },
      }),
      modelTool('report_result', { source: 'last_failure' }),
    ];
  });
  await setup(model.provider);
  await object();
  const before = await map();
  typeId = before.types[0].id;
  const result = await message('Lägg till mitt förslag och berätta om ett tidigare fel.');
  expect(result).toMatchObject({ phase: 'error', error: 'invalid_request' });
  expect(result.reply).toBe(assistantFailureMessage(result.error ?? 'assistant_provider_failed'));
  const after = await map();
  expect(after.objects).toEqual(before.objects);
  expect(after.draft.changes[0]).toEqual(before.draft.changes[0]);
  expect(after.draft.changes[1]).toMatchObject({
    id: 'new-object',
    after: { name: 'Nytt förslag', description: '' },
  });
  expect(after.draft.version).toBe(before.draft.version + 1);
  expect((await (await client.get(`${path}/map/history`)).json()).history).toEqual([]);
});
