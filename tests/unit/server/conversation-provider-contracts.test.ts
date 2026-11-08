import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import {
  type ModelRequest,
  modelMessage,
  modelTool,
  pendingUpdate,
  readOnlyScope,
  textModel,
} from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
const peers: APIRequestContext[] = [];
let base: string;
let release = () => {};
afterEach(async () => {
  release();
  for (const peer of peers.splice(0)) await peer.dispose();
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
async function seedUnrelatedTable(session: TextAssistantView) {
  const before = await readMap();
  const added = await post(`${base}/map/draft`, {
    version: before.draft.version,
    contentVersion: before.contentVersion,
    id: 'a',
    baseRevision: null,
    value: {
      typeId: before.types[0].id,
      name: 'Annat bord',
      properties: [
        {
          id: 'private-detail',
          label: 'Beskrivning',
          kind: 'text',
          value: 'Orelaterad bordsuppgift',
        },
      ],
    },
  });
  expect(added.status(), await added.text()).toBe(200);
  return (
    await browser.get(`${base}/text-assistant/${session.id}`)
  ).json() as Promise<TextAssistantView>;
}
async function send(
  session: TextAssistantView,
  text = 'Beskriv mitt utkast.',
  extra: Record<string, unknown> = {},
  client = browser,
) {
  const response = await client.post(`${base}/text-assistant/${session.id}/messages`, {
    headers: { origin: app.origin },
    data: {
      revision: session.revision,
      draftVersion: session.review.version,
      contentVersion: session.review.contentVersion,
      requestId: crypto.randomUUID(),
      text,
      ...extra,
    },
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

async function seedPeople(session: TextAssistantView, source: string, names = ['Lo', 'Lina']) {
  for (const [index, id, date] of [
    [0, 'lo', '1980-01-01'],
    [1, 'lina', '1990-02-03'],
  ] as const) {
    const map = await readMap();
    const response = await post(`${base}/map/draft`, {
      version: map.draft.version,
      contentVersion: map.contentVersion,
      id,
      baseRevision: null,
      value: {
        typeId: map.types[0].id,
        name: names[index],
        properties: [{ id: `${id}-date`, label: 'Födelsedatum', kind: 'date', value: date }],
      },
    });
    expect(response.status(), await response.text()).toBe(200);
  }
  if (source === 'saved') await saveMap('seed-people');
  return (
    await browser.get(`${base}/text-assistant/${session.id}`)
  ).json() as Promise<TextAssistantView>;
}

async function saveMap(operationId: string) {
  const map = await readMap();
  const response = await post(`${base}/map/save`, {
    version: map.draft.version,
    contentVersion: map.contentVersion,
    operationId,
  });
  expect(response.status(), await response.text()).toBe(200);
}

async function invalidateConversation(change: string) {
  if (change === 'grant revocation') {
    const { connections } = await (
      await browser.get(`${app.origin}/api/assistants/context`)
    ).json();
    const revoked = await post(`${app.origin}/api/assistants/${connections[0].id}/revoke`, {});
    expect(revoked.status(), await revoked.text()).toBe(200);
  } else {
    const prepared = await (await post(`${base}/exports`, {})).json();
    const archive = await (await browser.get(`${base}/exports/${prepared.id}`)).body();
    const uploaded = await browser.post(`${base}/imports`, {
      headers: {
        origin: app.origin,
        'content-type': 'application/zip',
        'X-Skyttel-Content-Version': '1',
      },
      data: archive,
    });
    expect(uploaded.status(), await uploaded.text()).toBe(201);
    const ready = await uploaded.json();
    const confirmed = await post(`${base}/imports/${ready.id}/confirm`, {
      confirmed: true,
      contentVersion: 1,
    });
    expect(confirmed.status(), await confirmed.text()).toBe(200);
    expect(await confirmed.json()).toMatchObject({ status: 'completed' });
  }
}

function startEnvelope(request: ModelRequest) {
  return JSON.parse(String(request.input.findLast((item) => item.role === 'user')?.content));
}

function suppliedObjects(request: ModelRequest, source: string) {
  const current = startEnvelope(request);
  const outputs = request.input
    .filter((item) => item.type === 'function_call_output')
    .map((item) => JSON.parse(String(item.output)));
  return source === 'draft'
    ? [current.draft, ...outputs].flatMap((value) =>
        (value.changes ?? []).flatMap((change: { id: string; after: object | null }) =>
          change.after ? [{ ...change.after, id: change.id }] : [],
        ),
      )
    : [...current.verifiedReads.map((fact: { value: unknown }) => fact.value), ...outputs].flatMap(
        (value) => value.objects ?? [],
      );
}

const readScope = () => [
  modelMessage(
    JSON.stringify({ mode: 'read', request: 'Besvara den aktuella frågan utan ändringar.' }),
  ),
];

test('ordinary conversation requests select the 30-minute minimum prompt lifetime without persistent provider state', async () => {
  const model = textModel(() => [modelMessage('Utkastet ligger kvar osparat.')]);
  const session = await setup({ modelFetch: model.provider });
  const final = await settled(await send(session));
  expect(final.modelReply).toBe('Utkastet ligger kvar osparat.');
  expect(model.requests).toHaveLength(1);
  expect(model.authorizationRequests).toHaveLength(1);
  for (const request of [...model.requests, ...model.authorizationRequests]) {
    expect(request).toMatchObject({
      store: false,
      prompt_cache_options: { ttl: '30m' },
    });
    expect(request).not.toHaveProperty('prompt_cache_retention');
    expect(request).not.toHaveProperty('conversation');
    expect(request).not.toHaveProperty('previous_response_id');
  }
  expect((await readMap()).objects).toEqual([]);
});

test('a manual edit during summary prevents another work request with the older draft snapshot', async () => {
  let releaseSummary = () => {};
  let summarizing = false;
  const held = new Promise<unknown[]>((resolve) => {
    releaseSummary = () => resolve([modelMessage('Avslutad diskussion är sammanfattad.')]);
  });
  const model = textModel((request) => {
    if (!request.tools.length) {
      summarizing = true;
      return held;
    }
    return model.requests.filter((request) => request.tools.length).length === 1
      ? [modelTool('read_map', {})]
      : [modelMessage('Ett svar utifrån äldre utkastuppgifter.')];
  });
  const session = await setup({
    modelFetch: async (input, init) => {
      const response = await model.provider(input, init);
      const value = await response.json();
      const request = JSON.parse(String(init?.body));
      if (
        request.tools.length &&
        model.requests.filter((request) => request.tools.length).length === 1
      )
        value.usage.input_tokens = 1_040_000;
      return Response.json(value);
    },
  });
  const exact =
    'Beskriv Min stol och vilka personer som är sparade i kartan. Spara inte och behåll beskrivningen oförändrad.';
  const working = await send(session, exact);
  try {
    await expect.poll(() => summarizing, { timeout: 5000 }).toBe(true);
    const current = await readMap();
    const edited = await post(`${base}/map/draft`, {
      version: current.draft.version,
      contentVersion: current.contentVersion,
      id: 'private-chair',
      baseRevision: null,
      value: { ...current.draft.changes[0].after, name: 'Manuell efter sammanfattning' },
    });
    expect(edited.status(), await edited.text()).toBe(200);
    releaseSummary();
    const final = await settled(working);
    expect(final).toMatchObject({ phase: 'error', error: 'assistant_draft_changed' });
    expect(final.completedReplies?.at(-1)?.request).toBe(exact);
    expect(model.requests.filter((request) => request.tools.length)).toHaveLength(1);
    expect((await readMap()).draft.changes[0].after?.name).toBe('Manuell efter sammanfattning');
    expect((await readMap()).objects).toEqual([]);
  } finally {
    releaseSummary();
  }
});

test('verified relevant start facts answer directly while unrelated draft details remain unread', async () => {
  const model = textModel((request) => {
    const current = startEnvelope(request);
    const chair = current.draft.changes.find(
      (change: { id: string }) => change.id === 'private-chair',
    );
    return chair
      ? [modelMessage(`Stolen heter ${chair.after.name}.`)]
      : [modelTool('read_my_draft', {})];
  });
  const session = await setup({ modelFetch: model.provider });
  const fresh = await seedUnrelatedTable(session);
  const final = await settled(await send(fresh, 'Vad heter Min stol i mitt utkast?'));
  expect(final).toMatchObject({ phase: 'ready', modelReply: 'Stolen heter Min stol.' });
  expect(model.requests).toHaveLength(1);
  expect(JSON.stringify(model.requests[0].input)).not.toContain('Orelaterad bordsuppgift');
  expect((await readMap()).draft.changes).toHaveLength(2);
  expect((await readMap()).objects).toEqual([]);
});

test.each(['batch', 'single'])(
  'continued %s work and renewed Live context retain current relevant facts without unrelated draft details',
  async (mode) => {
    const live = liveProvider();
    const model = textModel((request) => {
      const current = startEnvelope(request);
      if (model.requests.length > 1) return [modelMessage('Stolen är rättad.')];
      if (mode === 'single')
        return [
          modelTool('propose_object', {
            version: current.draft.version,
            contentVersion: current.draft.contentVersion,
            id: 'private-chair',
            baseRevision: null,
            value: { ...current.draft.changes[0].after, name: 'Min stol Klar' },
          }),
        ];
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
                value: { ...current.draft.changes[0].after, name: 'Min stol Klar' },
              },
            },
          ],
        }),
      ];
    });
    const session = await setup({
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    const fresh = await seedUnrelatedTable(session);
    const final = await settled(
      await send(fresh, 'Rätta Min stol till Min stol Klar och beskriv resultatet. Spara inte.'),
    );
    expect(final).toMatchObject({ phase: 'ready', modelReply: 'Stolen är rättad.' });
    expect.soft(JSON.stringify(model.requests[1].input)).not.toContain('Orelaterad bordsuppgift');
    for (let index = 0; index < 2; index++) {
      const started = await post(`${base}/text-assistant/${session.id}/voice`, {
        sdp: 'synthetic-offer',
        revision: final.revision,
        draftVersion: final.review.version,
        contentVersion: final.review.contentVersion,
      });
      expect(started.status(), await started.text()).toBe(201);
      const { voice } = await started.json();
      const stopped = await post(`${base}/text-assistant/${session.id}/voice/${voice.id}/stop`, {});
      expect(stopped.status()).toBe(200);
    }
    expect(live.requests).toHaveLength(2);
    expect.soft(JSON.stringify(live.requests)).not.toContain('Orelaterad bordsuppgift');
    expect(JSON.stringify(live.requests[1].session.input)).toContain('Min stol Klar');
    expect(
      (await readMap()).draft.changes.find((change) => change.id === 'private-chair')?.after?.name,
    ).toBe('Min stol Klar');
    expect((await readMap()).draft.changes).toHaveLength(2);
    expect((await readMap()).objects).toEqual([]);
  },
);

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

test('successive single corrections supersede obsolete draft pictures and preserve checked batch evidence', async () => {
  const model = textModel((request) => {
    const current = startEnvelope(request);
    const step = model.requests.length;
    const operation = {
      name: 'propose_object',
      arguments: {
        id: 'private-chair',
        baseRevision: null,
        value: {
          ...current.draft.changes[0].after,
          name: ['Kontrollerad stol', 'Första rättelsen', 'Slutlig stol'][step - 1],
        },
      },
    };
    if (step === 1)
      return [
        modelTool('submit_changes', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          completion: 'draft',
          continueResponse: true,
          operations: [operation],
        }),
      ];
    if (step <= 3)
      return [
        modelTool(operation.name, {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          ...operation.arguments,
        }),
      ];
    return [modelMessage('Den sista rättelsen är klar och kontrollerad.')];
  });
  const session = await setup({ modelFetch: model.provider });
  const final = await settled(
    await send(
      session,
      'Rätta Min stol i tre steg till Kontrollerad stol, Första rättelsen och Slutlig stol. Spara inte.',
    ),
  );
  expect(final).toMatchObject({
    phase: 'ready',
    modelReply: 'Den sista rättelsen är klar och kontrollerad.',
  });
  expect(model.requests).toHaveLength(4);
  expect(model.authorizationRequests).toHaveLength(4);
  const input = model.requests[3].input;
  const current = startEnvelope(model.requests[3]);
  const results = input
    .filter((item) => item.type === 'function_call_output')
    .map((item) => JSON.parse(String(item.output)));
  expect(results).toHaveLength(3);
  expect(results[0]).toMatchObject({
    result: {
      kind: 'draft',
      changes: [{ subject: 'Min stol', action: 'bytte namn till Kontrollerad stol' }],
    },
    review: { version: 2, contentVersion: 1, superseded: true },
  });
  expect(results[1]).toEqual({ version: 3, contentVersion: 1, superseded: true });
  expect(results[2]).toMatchObject({
    version: 4,
    changes: [{ after: { name: 'Slutlig stol' } }],
  });
  expect(current.draft.changes[0].after.name).toBe('Slutlig stol');
  expect((await readMap()).draft.changes[0].after?.name).toBe('Slutlig stol');
  expect((await readMap()).objects).toEqual([]);
});

test.each(['saved', 'draft'])(
  'a completed human follow-up starts with bounded current %s facts without another read round',
  async (source) => {
    const model = textModel((request) => {
      const current = startEnvelope(request);
      const target = current.message.startsWith('Finns Lo') ? 'Lo' : 'Lina';
      const last = request.input.findLast((item) => item.type === 'function_call_output');
      const read = last && JSON.parse(String(last.output));
      const objects =
        source === 'draft'
          ? (read?.changes ?? current.draft.changes).map(
              (change: { after: unknown }) => change.after,
            )
          : current.verifiedReads
              .flatMap((fact: { value: { objects: unknown[] } }) => fact.value.objects)
              .concat(read?.objects ?? []);
      const person = objects.find((object: { name: string }) => object?.name === target);
      if (!person)
        return [
          modelTool(
            source === 'saved' ? 'read_map' : 'read_my_draft',
            source === 'saved' ? { query: target } : {},
          ),
        ];
      return [
        modelMessage(
          current.message.startsWith('Finns')
            ? `${target} finns.`
            : `Födelsedatum är ${person.properties.find((property: { label: string }) => property.label === 'Födelsedatum').value}.`,
        ),
      ];
    }, readScope);
    const session = await setup({ modelFetch: model.provider });
    const fresh = await seedPeople(session, source);
    const first = await settled(await send(fresh, 'Finns Lo?'));
    expect(first).toMatchObject({ phase: 'ready', modelReply: 'Lo finns.' });
    const second = await settled(await send(first, 'Finns Lina?'));
    expect(second).toMatchObject({ phase: 'ready', modelReply: 'Lina finns.' });
    const before = model.requests.length;
    const final = await settled(await send(second, 'Vilket födelsedatum har hon?'));
    expect(final).toMatchObject({ phase: 'ready', modelReply: 'Födelsedatum är 1990-02-03.' });
    expect(model.requests).toHaveLength(before + 1);
    const current = startEnvelope(model.requests[before]);
    expect(JSON.stringify({ draft: current.draft, reads: current.verifiedReads })).toContain(
      '1990-02-03',
    );
    expect(JSON.stringify({ draft: current.draft, reads: current.verifiedReads })).not.toContain(
      '1980-01-01',
    );
    expect((await readMap()).draft.changes).toHaveLength(source === 'draft' ? 3 : 0);
  },
);

test('superseding a duplicate relationship draft picture preserves its real existing identity', async () => {
  let typeId = '';
  const model = textModel((request) => {
    const current = startEnvelope(request);
    if (model.requests.length === 1)
      return [
        modelTool('propose_relationship', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          id: 'duplicate-link',
          baseRevision: null,
          value: { typeId, sourceId: 'private-chair', targetId: 'lo', properties: [] },
        }),
      ];
    if (model.requests.length === 2)
      return [
        modelTool('propose_object', {
          version: current.draft.version,
          contentVersion: current.draft.contentVersion,
          id: 'private-chair',
          baseRevision: null,
          value: {
            ...current.draft.changes.find((change: { id: string }) => change.id === 'private-chair')
              .after,
            name: 'Slutlig stol',
          },
        }),
      ];
    return [modelMessage('Den befintliga kopplingen finns kvar och stolen är rättad.')];
  });
  const initial = await setup({ modelFetch: model.provider });
  const fresh = await seedPeople(initial, 'draft');
  const map = await readMap();
  typeId = map.relationshipTypes[0].id;
  const linked = await post(`${base}/map/relationship`, {
    version: map.draft.version,
    contentVersion: map.contentVersion,
    id: 'chair-lo',
    baseRevision: null,
    value: { typeId, sourceId: 'private-chair', targetId: 'lo', properties: [] },
  });
  expect(linked.status(), await linked.text()).toBe(200);
  const current = await (await browser.get(`${base}/text-assistant/${fresh.id}`)).json();
  const before = await readMap();
  const final = await settled(
    await send(
      current,
      'Kontrollera den befintliga kopplingen mellan Min stol och Lo, och rätta Min stol till Slutlig stol. Spara inte.',
    ),
  );
  expect(final).toMatchObject({
    phase: 'ready',
    modelReply: 'Den befintliga kopplingen finns kvar och stolen är rättad.',
  });
  expect(model.requests).toHaveLength(3);
  const results = model.requests[2].input
    .filter((item) => item.type === 'function_call_output')
    .map((item) => JSON.parse(String(item.output)));
  expect(results[0]).toEqual({
    version: before.draft.version,
    contentVersion: 1,
    existingId: 'chair-lo',
    superseded: true,
  });
  expect(results[1]).toMatchObject({
    version: before.draft.version + 1,
    changes: expect.arrayContaining([
      expect.objectContaining({
        id: 'private-chair',
        after: expect.objectContaining({ name: 'Slutlig stol' }),
      }),
    ]),
  });
  const after = await readMap();
  expect(after.draft.relationships).toEqual(before.draft.relationships);
  expect(after.draft.relationships).toHaveLength(1);
  expect(after.objects).toEqual([]);
  expect(model.authorizationRequests).toHaveLength(3);
});

test('a bare pending answer reuses verified saved facts after unrelated completed questions', async () => {
  const question = 'Vilket telefonnummer vill du jämföra?';
  const exact = 'Jämför ett telefonnummer med uppgifterna för Lina utan att ändra något.';
  const answer = 'Lina är född 1990-02-03. Telefonnumret finns inte bland hennes uppgifter.';
  const model = textModel((request) => {
    const current = startEnvelope(request);
    if (current.message === 'Tack.') return [modelMessage('Varsågod.')];
    const target = current.message.startsWith('Finns') ? 'lo' : 'lina';
    if (!suppliedObjects(request, 'saved').some((object) => object.id === target))
      return [modelTool('read_map', { query: target === 'lo' ? 'Lo' : 'Lina' })];
    if (current.message.startsWith('Finns')) return [modelMessage('Lo finns.')];
    if (current.message === exact)
      return [
        modelTool('ask_questions', {
          questions: [{ kind: 'information', request: exact, question, dependsOnDraft: false }],
        }),
      ];
    if (current.pendingParts.some((part: { status: string }) => part.status === 'waiting'))
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [pendingUpdate(request, question, { answer })],
          continueResponse: true,
        }),
      ];
    return [modelMessage(answer)];
  }, readScope);
  const fresh = await seedPeople(await setup({ modelFetch: model.provider }), 'saved');
  let view = await settled(await send(fresh, exact));
  expect(view).toMatchObject({ phase: 'ready', questionPending: true, questions: [question] });
  const pending = view.pendingParts?.find((part) => part.question === question);
  expect(pending).toMatchObject({ request: exact, status: 'waiting', revision: 0 });
  for (let turn = 0; turn < 3; turn++) {
    view = await settled(await send(view, 'Finns Lo?'));
    expect(view).toMatchObject({ phase: 'ready', questionPending: true, modelReply: 'Lo finns.' });
  }
  const next = model.requests.length;
  const before = await readMap();
  const final = await settled(await send(view, '0700123456'));
  expect(final).toMatchObject({ phase: 'ready', questionPending: false, modelReply: answer });
  expect(model.requests).toHaveLength(next + 2);
  for (const request of model.requests.slice(next)) {
    const current = startEnvelope(request);
    expect(current.verifiedReads).toEqual([
      expect.objectContaining({
        name: 'read_map',
        args: { query: 'Lina' },
        value: expect.objectContaining({
          objects: [expect.objectContaining({ id: 'lina', revision: 1 })],
        }),
      }),
    ]);
    expect(JSON.stringify(current.verifiedReads)).not.toContain('1980-01-01');
    expect(JSON.stringify(current.verifiedReads)).not.toContain('Privat förslag');
  }
  expect(final.pendingParts).toContainEqual(
    expect.objectContaining({ id: pending?.id, request: exact, status: 'completed', revision: 1 }),
  );
  expect(final.receipt).toBeUndefined();
  expect(await readMap()).toEqual(before);
  const completed = model.requests.length;
  const thanks = await settled(await send(final, 'Tack.'));
  expect(thanks).toMatchObject({ phase: 'ready', modelReply: 'Varsågod.' });
  expect(model.requests).toHaveLength(completed + 1);
  expect(startEnvelope(model.requests[completed]).verifiedReads).toEqual([]);
  expect(await readMap()).toEqual(before);
});

test.each(['saved revision', 'duplicate name'])(
  'a bare pending answer preserves current saved candidates after a %s',
  async (change) => {
    const exact = 'Jämför ett datum med födelsedatum för Lina utan att ändra något.';
    const question = 'Vilket datum vill du jämföra?';
    const ambiguity = 'Menar du Lina född 1980-01-01 eller Lina född 1990-02-03?';
    const answer = 'Lina är född 2001-04-05.';
    const model = textModel((request) => {
      const current = startEnvelope(request);
      const objects = [
        ...new Map(suppliedObjects(request, 'saved').map((object) => [object.id, object])).values(),
      ];
      if (!objects.length) return [modelTool('read_map', { query: 'Lina' })];
      if (current.message === exact)
        return [
          modelTool('ask_questions', {
            questions: [{ kind: 'information', request: exact, question, dependsOnDraft: false }],
          }),
        ];
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [
            pendingUpdate(
              request,
              question,
              objects.length > 1 ? { action: 'rephrase', question: ambiguity } : { answer },
            ),
          ],
        }),
      ];
    }, readScope);
    const fresh = await seedPeople(
      await setup({ modelFetch: model.provider }),
      'saved',
      change === 'duplicate name' ? ['Lina', 'Lina'] : undefined,
    );
    let view = await settled(await send(fresh, exact));
    expect(view).toMatchObject({ phase: 'ready', questionPending: true, questions: [question] });
    const pending = view.pendingParts?.find((part) => part.question === question);
    if (change === 'saved revision') {
      const map = await readMap();
      const person = map.objects.find((object) => object.id === 'lina');
      const changed = await post(`${base}/map/draft`, {
        version: map.draft.version,
        contentVersion: map.contentVersion,
        id: 'lina',
        baseRevision: person?.revision,
        value: {
          typeId: person?.typeId,
          name: 'Lina',
          properties: [
            { id: 'lina-date', label: 'Födelsedatum', kind: 'date', value: '2001-04-05' },
          ],
        },
      });
      expect(changed.status(), await changed.text()).toBe(200);
      await saveMap('pending-birthday');
      view = await (await browser.get(`${base}/text-assistant/${view.id}`)).json();
    }
    const next = model.requests.length;
    const before = await readMap();
    const final = await settled(await send(view, '2001-04-05'));
    expect(model.requests).toHaveLength(next + (change === 'saved revision' ? 2 : 1));
    if (change === 'saved revision') {
      expect(startEnvelope(model.requests[next]).verifiedReads).toEqual([]);
      expect(JSON.stringify(model.requests.slice(next))).not.toContain('1990-02-03');
      expect(final).toMatchObject({ phase: 'ready', questionPending: false, modelReply: answer });
      expect(final.pendingParts).toContainEqual(
        expect.objectContaining({
          id: pending?.id,
          request: exact,
          status: 'completed',
          revision: 1,
        }),
      );
    } else {
      expect(
        suppliedObjects(model.requests[next], 'saved')
          .map((object) => object.id)
          .sort(),
      ).toEqual(['lina', 'lo']);
      expect(final).toMatchObject({
        phase: 'ready',
        questionPending: true,
        questions: [ambiguity],
      });
      expect(final.pendingParts).toContainEqual(
        expect.objectContaining({
          id: pending?.id,
          request: exact,
          status: 'waiting',
          revision: 1,
        }),
      );
    }
    expect(final.receipt).toBeUndefined();
    expect(await readMap()).toEqual(before);
  },
);

test.each(['count', 'bytes'])(
  'a bare pending answer keeps the %s limit and excludes a cached whole map',
  async (limit) => {
    const names = Array.from({ length: 17 }, (_, index) => `Person${index}`);
    const exact = `Jämför ett telefonnummer med ${names.join(', ')} utan att ändra något.`;
    const question = 'Vilket telefonnummer vill du jämföra?';
    const model = textModel((request) => {
      const current = startEnvelope(request);
      if (current.message !== exact) return [modelMessage('Ingen uppgift ändras.')];
      if (!request.input.some((item) => item.type === 'function_call_output'))
        return [
          modelTool('read_map', {}),
          ...names.map((query) => modelTool('read_map', { query })),
        ];
      return [
        modelTool('ask_questions', {
          questions: [{ kind: 'information', request: exact, question, dependsOnDraft: false }],
        }),
      ];
    }, readScope);
    let view = await setup({ modelFetch: model.provider });
    for (const name of names) {
      const map = await readMap();
      const added = await post(`${base}/map/draft`, {
        version: map.draft.version,
        contentVersion: map.contentVersion,
        id: name,
        baseRevision: null,
        value: {
          typeId: map.types[0].id,
          name,
          properties: [
            {
              id: 'detail',
              label: 'Beskrivning',
              kind: 'text',
              value: limit === 'bytes' ? 'x'.repeat(3000) : 'Kort uppgift',
            },
          ],
        },
      });
      expect(added.status(), await added.text()).toBe(200);
    }
    await saveMap(`seed-${limit}`);
    view = await (await browser.get(`${base}/text-assistant/${view.id}`)).json();
    const asked = await settled(await send(view, exact));
    expect(asked).toMatchObject({ phase: 'ready', questionPending: true, questions: [question] });
    const next = model.requests.length;
    const before = await readMap();
    const final = await settled(await send(asked, '0700123456'));
    expect(final).toMatchObject({
      phase: 'ready',
      questionPending: true,
      modelReply: 'Ingen uppgift ändras.',
    });
    expect(model.requests).toHaveLength(next + 1);
    const facts = startEnvelope(model.requests[next]).verifiedReads;
    expect(facts.length).toBeGreaterThan(0);
    if (limit === 'count') expect(facts).toHaveLength(16);
    else expect(facts.length).toBeLessThan(16);
    expect(
      facts.reduce(
        (bytes: number, fact: unknown) => bytes + Buffer.byteLength(JSON.stringify(fact)),
        0,
      ),
    ).toBeLessThanOrEqual(32_768);
    expect(
      facts.every((fact: { args: { query?: string } }) => names.includes(fact.args.query ?? '')),
    ).toBe(true);
    expect(JSON.stringify(facts)).not.toContain('Privat förslag');
    expect(final.receipt).toBeUndefined();
    expect(await readMap()).toEqual(before);
  },
);

test.each(['grant revocation', 'content replacement'])(
  'a bare pending answer rejects verified saved facts after %s',
  async (change) => {
    const exact = 'Jämför ett telefonnummer med uppgifterna för Lina utan att ändra något.';
    const question = 'Vilket telefonnummer vill du jämföra?';
    let entered = false;
    const held = new Promise<unknown[]>((resolve) => {
      release = () => resolve([modelMessage('Lina är född 1990-02-03. Ett inaktuellt svar.')]);
    });
    const model = textModel((request) => {
      const current = startEnvelope(request);
      if (current.message !== exact) {
        entered = true;
        return held;
      }
      if (!suppliedObjects(request, 'saved').length)
        return [modelTool('read_map', { query: 'Lina' })];
      return [
        modelTool('ask_questions', {
          questions: [{ kind: 'information', request: exact, question, dependsOnDraft: false }],
        }),
      ];
    }, readScope);
    const fresh = await seedPeople(await setup({ modelFetch: model.provider }), 'saved');
    const asked = await settled(await send(fresh, exact));
    expect(asked).toMatchObject({ phase: 'ready', questionPending: true, questions: [question] });
    const next = model.requests.length;
    const working = await send(asked, '0700123456');
    await expect.poll(() => entered).toBe(true);
    expect(JSON.stringify(startEnvelope(model.requests[next]).verifiedReads)).toContain(
      '1990-02-03',
    );
    await invalidateConversation(change);
    release();
    await expect
      .poll(async () => (await browser.get(`${base}/text-assistant/${working.id}`)).status())
      .toBe(404);
    expect(await (await browser.get(`${base}/text-assistant/${working.id}`)).text()).not.toContain(
      '1990-02-03',
    );
    expect(model.requests).toHaveLength(next + 1);
    const started = await post(`${base}/text-assistant`, approvedForVisit);
    expect(started.status(), await started.text()).toBe(201);
    expect(await started.json()).toMatchObject({ pendingParts: [] });
  },
);

test.each(['saved', 'draft'])(
  'plural follow-ups retain both bounded %s candidates and singular ambiguity asks which person',
  async (source) => {
    const question = 'Menar du Lina eller Lo?';
    const model = textModel((request) => {
      const current = startEnvelope(request);
      const objects = suppliedObjects(request, source);
      if (!['lo', 'lina'].every((id) => objects.some((object) => object.id === id)))
        return source === 'saved'
          ? [modelTool('read_map', { query: 'Lina' }), modelTool('read_map', { query: 'Lo' })]
          : [modelTool('read_my_draft', {})];
      if (current.message.startsWith('Finns')) return [modelMessage('Lina och Lo finns.')];
      if (current.message.includes('hon'))
        return [modelTool('ask_questions', { questions: [question] })];
      return [modelMessage('Lo är född 1980-01-01 och Lina är född 1990-02-03.')];
    }, readScope);
    const fresh = await seedPeople(await setup({ modelFetch: model.provider }), source);
    const initial = await settled(await send(fresh, 'Finns Lina och Lo?'));
    expect(initial).toMatchObject({ phase: 'ready', modelReply: 'Lina och Lo finns.' });
    let next = model.requests.length;
    const plural = await settled(await send(initial, 'Vilka födelsedatum har de?'));
    expect(plural).toMatchObject({
      phase: 'ready',
      modelReply: 'Lo är född 1980-01-01 och Lina är född 1990-02-03.',
    });
    expect(model.requests).toHaveLength(next + 1);
    const pluralFacts = startEnvelope(model.requests[next]);
    expect(
      JSON.stringify({ draft: pluralFacts.draft, reads: pluralFacts.verifiedReads }),
    ).toContain('1980-01-01');
    expect(
      JSON.stringify({ draft: pluralFacts.draft, reads: pluralFacts.verifiedReads }),
    ).toContain('1990-02-03');
    expect(
      JSON.stringify({ draft: pluralFacts.draft, reads: pluralFacts.verifiedReads }),
    ).not.toContain('Privat förslag');
    next = model.requests.length;
    const before = await readMap();
    const ambiguous = await settled(await send(plural, 'Vilket födelsedatum har hon?'));
    expect(ambiguous).toMatchObject({
      phase: 'ready',
      questionPending: true,
      questions: [question],
    });
    expect(model.requests).toHaveLength(next + 1);
    const candidates = suppliedObjects(model.requests[next], source);
    expect(candidates.map((object) => object.id).sort()).toEqual(['lina', 'lo']);
    expect(ambiguous.receipt).toBeUndefined();
    expect(await readMap()).toEqual(before);
  },
);

test.each(['saved', 'draft'])(
  'an indirect %s follow-up preserves two people with the same name for clarification',
  async (source) => {
    const question = 'Menar du Lina född 1980-01-01 eller Lina född 1990-02-03?';
    const model = textModel((request) => {
      const current = startEnvelope(request);
      if (suppliedObjects(request, source).length < 2)
        return [
          modelTool(
            source === 'saved' ? 'read_map' : 'read_my_draft',
            source === 'saved' ? { query: 'Lina' } : {},
          ),
        ];
      return current.message.startsWith('Finns')
        ? [modelMessage('Det finns två personer som heter Lina.')]
        : [modelTool('ask_questions', { questions: [question] })];
    }, readScope);
    const fresh = await seedPeople(await setup({ modelFetch: model.provider }), source, [
      'Lina',
      'Lina',
    ]);
    const initial = await settled(await send(fresh, 'Finns Lina?'));
    expect(initial).toMatchObject({
      phase: 'ready',
      modelReply: 'Det finns två personer som heter Lina.',
    });
    const next = model.requests.length;
    const before = await readMap();
    const final = await settled(await send(initial, 'Vilket födelsedatum har hon?'));
    expect(final).toMatchObject({ phase: 'ready', questionPending: true, questions: [question] });
    expect(model.requests).toHaveLength(next + 1);
    expect(
      suppliedObjects(model.requests[next], source)
        .map((object) => object.id)
        .sort(),
    ).toEqual(['lina', 'lo']);
    expect(final.receipt).toBeUndefined();
    expect(await readMap()).toEqual(before);
  },
);

test('an initial human reference without a prior target cannot select an unrelated sole proposal', async () => {
  const question = 'Vilken person menar du?';
  const model = textModel(() => [modelTool('ask_questions', { questions: [question] })], readScope);
  const session = await setup({ modelFetch: model.provider });
  const before = await readMap();
  const final = await settled(await send(session, 'Vilket födelsedatum har hon?'));
  expect(final).toMatchObject({ phase: 'ready', questionPending: true, questions: [question] });
  expect(model.requests).toHaveLength(1);
  expect(startEnvelope(model.requests[0])).toMatchObject({
    draft: { complete: false, totals: { changes: 1 }, changes: [] },
    verifiedReads: [],
  });
  expect(JSON.stringify(model.requests[0].input)).not.toContain('Privat förslag');
  expect(await readMap()).toEqual(before);
});

test.each(['saved', 'draft'])(
  'an indirect follow-up after a %s revision uses the new date and never the obsolete cached value',
  async (source) => {
    const model = textModel((request) => {
      const current = startEnvelope(request);
      const person = suppliedObjects(request, source).find((object) => object.id === 'lina');
      if (!person)
        return [
          modelTool(
            source === 'saved' ? 'read_map' : 'read_my_draft',
            source === 'saved' ? { query: 'Lina' } : {},
          ),
        ];
      return [
        modelMessage(
          current.message.startsWith('Finns')
            ? 'Lina finns.'
            : `Födelsedatum är ${person.properties.find((property: { label: string }) => property.label === 'Födelsedatum').value}.`,
        ),
      ];
    }, readScope);
    const fresh = await seedPeople(await setup({ modelFetch: model.provider }), source);
    const initial = await settled(await send(fresh, 'Finns Lina?'));
    expect(initial).toMatchObject({ phase: 'ready', modelReply: 'Lina finns.' });
    const map = await readMap();
    const object =
      source === 'saved'
        ? map.objects.find((object) => object.id === 'lina')
        : map.draft.changes.find((change) => change.id === 'lina')?.after;
    expect(object).toBeDefined();
    const changed = await post(`${base}/map/draft`, {
      version: map.draft.version,
      contentVersion: map.contentVersion,
      id: 'lina',
      baseRevision:
        source === 'saved' ? map.objects.find((object) => object.id === 'lina')?.revision : null,
      value: {
        typeId: object?.typeId,
        name: object?.name,
        properties: object?.properties?.map((property) => ({ ...property, value: '2001-04-05' })),
      },
    });
    expect(changed.status(), await changed.text()).toBe(200);
    if (source === 'saved') await saveMap('change-birthday');
    const current = await (await browser.get(`${base}/text-assistant/${initial.id}`)).json();
    const next = model.requests.length;
    const before = await readMap();
    const final = await settled(await send(current, 'Vilket födelsedatum har hon?'));
    expect(final).toMatchObject({ phase: 'ready', modelReply: 'Födelsedatum är 2001-04-05.' });
    expect(model.requests).toHaveLength(next + (source === 'saved' ? 2 : 1));
    expect(JSON.stringify(model.requests.slice(next))).not.toContain('1990-02-03');
    if (source === 'saved') expect(startEnvelope(model.requests[next]).verifiedReads).toEqual([]);
    else expect(JSON.stringify(startEnvelope(model.requests[next]).draft)).toContain('2001-04-05');
    expect(await readMap()).toEqual(before);
  },
);

test.each(['grant revocation', 'content replacement'])(
  '%s rejects a held indirect cached-fact reply and a new conversation inherits no prior referent',
  async (change) => {
    let entered = false;
    const held = new Promise<unknown[]>((resolve) => {
      release = () => resolve([modelMessage('Födelsedatum är 1990-02-03. Ett inaktuellt svar.')]);
    });
    const model = textModel((request) => {
      const current = startEnvelope(request);
      if (current.message.startsWith('Finns'))
        return suppliedObjects(request, 'saved').length
          ? [modelMessage('Lina finns.')]
          : [modelTool('read_map', { query: 'Lina' })];
      if (model.requests.length === 3) {
        entered = true;
        return held;
      }
      return [modelTool('ask_questions', { questions: ['Vilken person menar du?'] })];
    }, readScope);
    const fresh = await seedPeople(await setup({ modelFetch: model.provider }), 'saved');
    const initial = await settled(await send(fresh, 'Finns Lina?'));
    expect(initial).toMatchObject({ phase: 'ready', modelReply: 'Lina finns.' });
    expect(model.requests).toHaveLength(2);
    const working = await send(initial, 'Vilket födelsedatum har hon?');
    await expect.poll(() => entered).toBe(true);
    expect(JSON.stringify(startEnvelope(model.requests[2]).verifiedReads)).toContain('1990-02-03');
    await invalidateConversation(change);
    release();
    await expect
      .poll(async () => (await browser.get(`${base}/text-assistant/${working.id}`)).status())
      .toBe(404);
    const stopped = await browser.get(`${base}/text-assistant/${working.id}`);
    expect(await stopped.text()).not.toContain('1990-02-03');
    expect(model.requests).toHaveLength(3);
    const started = await post(`${base}/text-assistant`, approvedForVisit);
    expect(started.status(), await started.text()).toBe(201);
    const final = await settled(await send(await started.json(), 'Vilket födelsedatum har hon?'));
    expect(final).toMatchObject({
      phase: 'ready',
      questionPending: true,
      questions: ['Vilken person menar du?'],
    });
    expect(model.requests).toHaveLength(4);
    expect(startEnvelope(model.requests[3])).toMatchObject({
      draft: { changes: [] },
      verifiedReads: [],
    });
    expect(JSON.stringify(model.requests[3].input)).not.toContain('1990-02-03');
  },
);

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
      if (current.message === 'Spara hela utkastet.')
        return [
          modelTool('save_draft', {
            version: current.draft.version,
            contentVersion: current.draft.contentVersion,
          }),
        ];
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
        return [modelMessage('{"decision":"allow","complete":true,"fulfillsRequest":true}')];
      const { current, earlier } = JSON.parse(String(request.input[0].content));
      if (current !== original && current !== 'Spara hela utkastet.') {
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
              : { mode: 'work', request: current, responseRequired: false },
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
  const peer = await request.newContext();
  peers.push(peer);
  await signIn(peer, app.origin);
  const otherResponse = await peer.post(`${base}/text-assistant`, {
    headers: { origin: app.origin },
    data: approvedForVisit,
  });
  expect(otherResponse.status()).toBe(201);
  const other: TextAssistantView = await otherResponse.json();
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
  await send(other, 'Spara hela utkastet.', { requestId: 'cross-session-paused-save' }, peer);
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
  const stillWaiting: TextAssistantView = await (
    await peer.get(`${base}/text-assistant/${other.id}`)
  ).json();
  expect(stillWaiting.tasks).toContainEqual(
    expect.objectContaining({ id: 'cross-session-paused-save', status: 'queued' }),
  );
  expect((await post(`${base}/text-assistant/${session.id}/cancel`, { all: true })).status()).toBe(
    200,
  );
  let resumedSave = stillWaiting;
  await expect
    .poll(async () => {
      resumedSave = await (await peer.get(`${base}/text-assistant/${other.id}`)).json();
      return resumedSave.tasks?.find((task) => task.id === 'cross-session-paused-save')?.status;
    })
    .toBe('completed');
  expect(resumedSave).toMatchObject({
    phase: 'ready',
    requiredNotice: expect.stringContaining('Be om sparande igen'),
  });
  expect(resumedSave.receipt).toBeUndefined();
  expect((await readMap()).objects).toEqual([]);
  expect((await (await browser.get(`${base}/map/history`)).json()).history).toEqual([]);
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
                responseRequired: false,
              }),
            ),
          ];
        }
        const { operations, data } = JSON.parse(String(request.input[0].content)).untrusted;
        const bound = data.queuedReference;
        // A missing server reference deliberately tempts the old implementation.
        if (!bound)
          return [modelMessage('{"decision":"allow","complete":true,"fulfillsRequest":true}')];
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
                ? { decision: 'allow', complete: true, fulfillsRequest: true }
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
    const model = textModel(
      () => [
        modelTool('report_result', {
          source,
          ...(source === 'save' ? { operationId: 'never-saved', userId: 'unknown-owner' } : {}),
        }),
      ],
      readOnlyScope,
    );
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
    const model = textModel(
      () =>
        model.requests.length === 1
          ? [modelTool('read_type_catalog', {})]
          : [modelTool('report_result', { source: 'last_failure' })],
      (body) => {
        const { current } = JSON.parse(String(body.input[0].content));
        if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE') && current === 'Vad var felet?')
          return readOnlyScope();
        return [
          modelMessage(
            JSON.stringify(
              body.instructions.startsWith('SKYTTEL_TURN_SCOPE')
                ? { mode: 'work', request: current, responseRequired: false }
                : { decision: 'allow', complete: true, fulfillsRequest: false },
            ),
          ),
        ];
      },
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
