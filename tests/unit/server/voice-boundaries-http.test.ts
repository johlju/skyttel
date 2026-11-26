import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { Tiktoken } from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/o200k_base';
import type { LiveCreateParams } from 'openai/resources/live/live';
import { afterEach, expect, test, vi } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import {
  isVoiceAnswerRelease,
  liveProvider,
  speak,
  voiceAnswerParts,
} from '../../support/live-provider.js';
import {
  lastToolResult,
  modelMessage,
  modelTool,
  readOnlyScope,
  textModel,
} from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
vi.setConfig({ expect: { poll: { timeout: 5000 } } });
let client: APIRequestContext;
let path: string;
let session: TextAssistantView;
let live: ReturnType<typeof liveProvider>;
let voicePath: string;
let providerId: string;
const post = (route: string, data: unknown = {}) =>
  client.post(`${path}/${route}`, { headers: { origin: app.origin }, data });
const readMap = async (): Promise<MapState> => (await client.get(`${path}/map`)).json();
async function setup(
  provider = textModel(() => [modelMessage('Ett svar.')]).provider,
  assistantDispatch?: NonNullable<Parameters<typeof createInstallation>[1]>['assistantDispatch'],
  inspectLiveRequest?: (request: LiveCreateParams) => Response | undefined,
) {
  live = liveProvider();
  app = await createInstallation(undefined, {
    modelFetch: provider,
    liveFetch: async (input, init) =>
      inspectLiveRequest?.(JSON.parse(String(init?.body))) ?? live.provider(input, init),
    liveSideband: live.attach,
    assistantDispatch,
  });
  client = await request.newContext();
  await signIn(client, app.origin);
  const { household } = await (await createHousehold(client, app.origin)).json();
  path = `${app.origin}/api/households/${household.id}`;
  session = await (await post('text-assistant', approvedForVisit)).json();
  const state = await readMap();
  const proposed = await post('map/draft', {
    version: state.draft.version,
    id: 'independent',
    baseRevision: null,
    value: {
      typeId: state.types[0].id,
      name: 'Privat lampa',
      properties: [{ id: 'description', label: 'Beskrivning', kind: 'text', value: 'Bevaras' }],
    },
  });
  expect(proposed.status()).toBe(200);
  session = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
}
function startBody(extra: Record<string, unknown> = {}) {
  return {
    sdp: 'synthetic-offer',
    revision: session.revision,
    draftVersion: session.review.version,
    contentVersion: session.review.contentVersion,
    ...extra,
  };
}
async function start() {
  const response = await post(`text-assistant/${session.id}/voice`, startBody());
  expect(response.status(), await response.text()).toBe(201);
  const result = await response.json();
  voicePath = `text-assistant/${session.id}/voice/${result.voice.id}`;
  providerId = [...live.channels.keys()][0];
}
async function poll(microphoneOn = true) {
  const current: TextAssistantView = await (
    await client.get(`${path}/text-assistant/${session.id}`)
  ).json();
  return (
    await post(`${voicePath}/poll`, {
      revision: current.revision,
      draftVersion: current.review.version,
      contentVersion: current.review.contentVersion,
      microphoneOn,
    })
  ).json();
}
afterEach(async () => {
  await client?.dispose();
  await app?.close();
});

test('a voice request refused during save recovery leaves queued work intact', {
  tags: ['technical'],
  timeout: 15_000,
}, async () => {
  let releaseSave!: () => void;
  const heldSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let releaseVoiceAdmission!: () => void;
  const heldVoiceAdmission = new Promise<void>((resolve) => {
    releaseVoiceAdmission = resolve;
  });
  let reachedSave = false;
  let reachedVoiceAdmission = false;
  let refused: { status: number; body: unknown } | undefined;
  let cancellation = false;
  const model = textModel(() => [modelMessage('Kontrollerar utkastet.')]);
  await setup(model.provider, async (incoming, dispatch) => {
    const pathname = new URL(incoming.url).pathname;
    if (incoming.method === 'POST' && pathname === '/mcp') {
      const rpc = await incoming.clone().json();
      if (rpc?.params?.name === 'save_draft') {
        reachedSave = true;
        await heldSave;
        throw new TypeError('Synthetic save response lost');
      }
    }
    if (incoming.method === 'POST' && pathname.endsWith('/messages')) {
      reachedVoiceAdmission = true;
      await heldVoiceAdmission;
      const result = await dispatch(incoming);
      refused = { status: result.status, body: await result.clone().json() };
      return result;
    }
    if (incoming.method === 'POST' && pathname.endsWith('/cancel')) cancellation = true;
    return dispatch(incoming);
  });
  const conversation = `text-assistant/${session.id}`;
  const readConversation = async (): Promise<TextAssistantView> =>
    (await client.get(`${path}/${conversation}`)).json();
  const send = async (requestId: string, text: string) => {
    const view = await readConversation();
    return post(`${conversation}/messages`, {
      requestId,
      text,
      revision: view.revision,
      draftVersion: view.review.version,
      contentVersion: view.review.contentVersion,
    });
  };
  await start();
  try {
    expect((await send('save', 'Spara hela utkastet.')).status()).toBe(202);
    await expect.poll(() => reachedSave).toBe(true);
    expect((await send('queued', 'Berätta vad som finns på kartan.')).status()).toBe(202);
    speak(live, 'Vad är kvar att göra?');
    await expect.poll(() => reachedVoiceAdmission).toBe(true);
    releaseSave();
    await expect.poll(async () => (await readConversation()).phase).toBe('recovery');
    releaseVoiceAdmission();
    await expect
      .poll(() => refused)
      .toEqual({
        status: 409,
        body: { error: 'operation_pending' },
      });
    await expect.poll(() => voiceAnswerParts(live.sent).join('')).toMatch(/spar/iu);
    const queued = await (await client.get(`${path}/${conversation}/messages/queued`)).json();
    expect(queued.taskStatus).toBe('queued');
    expect(cancellation).toBe(false);
    expect((await poll()).voice.refusal?.text).toContain(
      'Det tidigare sparförsöket behöver kontrolleras',
    );
    expect(model.requests).toHaveLength(1);
    expect((await readMap()).objects).toEqual([]);
  } finally {
    releaseSave();
    releaseVoiceAdmission();
  }
});

test('oversized waiting work keeps its exact parts available to a new voice connection', {
  tags: ['technical'],
  timeout: 15_000,
}, async () => {
  const answer = 'Den första inventeringen gäller hallen.';
  const firstQuestion = 'I vilket rum gäller inventering 1?';
  const model = textModel((body) => {
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (turn.message === answer) {
      const part = turn.pendingParts.find(
        ({ question }: { question: string }) => question === firstQuestion,
      );
      expect(turn.answerTo).toContainEqual({ id: part.id, revision: part.revision });
      return [
        modelTool('ask_questions', {
          questions: [],
          updates: [
            {
              id: part.id,
              revision: part.revision,
              messageId: turn.messageId,
              action: 'clarify',
              evidence: answer,
              answer: 'Hallen.',
            },
          ],
        }),
      ];
    }
    const sequence = Number(turn.message.split(' ')[1]);
    return [
      modelTool('ask_questions', {
        questions: [
          {
            kind: 'information',
            request: `Beskriv inventering ${sequence}.`,
            question: `I vilket rum gäller inventering ${sequence}?`,
            dependsOnDraft: false,
          },
        ],
      }),
    ];
  });
  await setup(model.provider);
  const conversation = `text-assistant/${session.id}`;
  const read = async (): Promise<TextAssistantView> =>
    (await client.get(`${path}/${conversation}`)).json();
  for (let sequence = 1; sequence <= 5; sequence++) {
    const requestId = `inventory-${sequence}`;
    const text = `Inventering ${sequence} har dessa syntetiska artikelnummer: ${'Å#7$çµ,4 '.repeat(390)}`;
    const sent = await post(`${conversation}/messages`, {
      ...startBody(),
      text,
      requestId,
    });
    expect(sent.status(), await sent.text()).toBe(202);
    await expect
      .poll(
        async () =>
          (await (await client.get(`${path}/${conversation}/messages/${requestId}`)).json())
            .taskStatus,
      )
      .toBe('completed');
    session = await read();
  }
  const outstanding = session.pendingParts?.filter(({ status }) => status === 'waiting') ?? [];
  expect(outstanding).toHaveLength(5);
  await start();
  expect(JSON.stringify(live.requests.at(-1)?.session.input)).toContain(
    'Delegera frågor om pågående uppdrag',
  );
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'answer-first-question',
    delta: answer,
    start_ms: 0,
    end_ms: 100,
  });
  await expect
    .poll(
      async () =>
        (await read()).pendingParts?.find(({ question }) => question === firstQuestion)?.status,
    )
    .toBe('completed');
  expect((await read()).pendingParts?.filter(({ status }) => status === 'waiting')).toEqual(
    outstanding.slice(1),
  );
});

test.each(['large receipt', 'many fragments'])(
  'voice reconnects with recent conversation and verified save references after %s',
  { tags: ['technical'], timeout: 12_000 },
  async (condition) => {
    // Enforce the visible provider limits. The real Live renderer's
    // framing may add tokens beyond this offline count of its text.
    const encoder = new Tiktoken(ranks);
    await setup(undefined, undefined, ({ session }) => {
      if (
        (session.input?.length ?? 0) > 128 ||
        (session.input ?? []).reduce(
          (tokens, item) => tokens + encoder.encode(item.content[0].text).length,
          0,
        ) > 8192
      )
        return Response.json({ error: { message: 'Initial history too large.' } }, { status: 400 });
    });
    const map = await readMap();
    const archivedMarker = 'Arkivfält 73.';
    const description = `${archivedMarker} ${condition === 'large receipt' ? 'Påhittad data, fält 42. '.repeat(410) : 'Kort beskrivning.'}`;
    expect(
      (
        await post('map/draft', {
          version: map.draft.version,
          id: 'archived-music-service',
          baseRevision: null,
          value: {
            typeId: map.types[0].id,
            name: 'Exempeltjänsten',
            properties: Array.from({ length: 4 }, (_, index) => ({
              id: `notes-${index}`,
              label: `Anteckning ${index}`,
              kind: 'text',
              value: description,
            })),
          },
        })
      ).status(),
    ).toBe(200);
    const proposal = await readMap();
    expect(
      (
        await post('map/save', {
          version: proposal.draft.version,
          operationId: 'previous-map-save',
        })
      ).status(),
    ).toBe(200);
    session = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
    const operations = session.operations;
    expect(operations).toMatchObject([{ operationId: 'previous-map-save', status: 'succeeded' }]);
    await start();
    for (let index = 0; index < (condition === 'many fragments' ? 140 : 0); index++)
      live.emit(providerId, {
        type: `session.${index % 2 === 0 ? 'input' : 'output'}_transcript.delta`,
        event_id: `fragment-${index}`,
        delta: index % 2 === 0 ? ' Fråga.' : ' Svar.',
        start_ms: index * 100,
        end_ms: index * 100 + 100,
      });
    const latest = 'Vilken musik vill du kunna spela i huset?';
    live.emit(providerId, {
      type: 'session.input_transcript.delta',
      event_id: 'retained-last-question',
      delta: latest,
      start_ms: 15_000,
      end_ms: 15_100,
    });
    expect((await post(`${voicePath}/stop`)).status()).toBe(200);
    session = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
    await start();
    const seeded = JSON.stringify(live.requests.at(-1)?.session.input);
    expect(seeded).toContain(latest);
    expect(seeded).toContain('previous-map-save');
    expect(seeded).not.toContain(archivedMarker);
    if (condition === 'many fragments')
      expect(seeded).toContain('Delegera frågor om äldre uppgifter');
    speak(live, 'Vad finns i kartan?');
    await expect.poll(() => voiceAnswerParts(live.sent).join('')).toContain('Ett svar.');
    expect((await poll()).assistant.operations).toEqual(operations);
  },
);

test('a spoken proposal reaches a retained draft when the request counter is missing', {
  tags: ['technical'],
  timeout: 15_000,
}, async () => {
  let typeId: string;
  let delegatedStatus: number | undefined;
  const model = textModel((body) => {
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (turn.message === 'Vilka saker föreslog vi i utkastet?')
      return [modelMessage('Cykeln och lampan finns i utkastet.')];
    return [
      modelTool('submit_changes', {
        version: turn.draft.version,
        contentVersion: turn.draft.contentVersion,
        completion: 'draft',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'spoken-bike',
              baseRevision: null,
              value: { typeId, name: 'Blå cykel' },
            },
          },
        ],
      }),
    ];
  });
  await setup(model.provider, async (incoming, dispatch) => {
    const result = await dispatch(incoming);
    if (incoming.method === 'POST' && new URL(incoming.url).pathname.endsWith('/messages'))
      delegatedStatus = result.status;
    return result;
  });
  const before = await readMap();
  typeId = before.types[0].id;
  await start();
  // Reproduce the database left by the development reset in an isolated fixture.
  const fixture = new Database(join(app.directory, 'skyttel.db'));
  try {
    fixture.prepare('DELETE FROM conversation_request_order').run();
  } finally {
    fixture.close();
  }
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'proposal-fragment',
    delta: 'Lägg till en blå cykel i utkastet.',
    start_ms: 0,
    end_ms: 1000,
  });
  live.emit(providerId, {
    type: 'session.delegation.created',
    offset_ms: 1000,
    delegation: { id: 'proposal-task', target: 'client' },
  });
  await expect.poll(() => delegatedStatus).toBe(202);
  await expect.poll(() => voiceAnswerParts(live.sent).join('')).toContain('Blå cykel');
  const after = await readMap();
  expect(after.draft.changes).toMatchObject([
    { id: 'independent', after: { name: 'Privat lampa' } },
    { id: 'spoken-bike', after: { name: 'Blå cykel' } },
  ]);
  expect(after.objects).toEqual(before.objects);

  const endpoint = `text-assistant/${session.id}`;
  const view: TextAssistantView = await (await client.get(`${path}/${endpoint}`)).json();
  const followUp = await post(`${endpoint}/messages`, {
    revision: view.revision,
    draftVersion: view.review.version,
    contentVersion: view.review.contentVersion,
    requestId: 'read-the-draft',
    text: 'Vilka saker föreslog vi i utkastet?',
  });
  expect(followUp.status(), await followUp.text()).toBe(202);
  await expect
    .poll(async () => {
      const result: TextAssistantView = await (
        await client.get(`${path}/${endpoint}/messages/read-the-draft`)
      ).json();
      return result.taskStatus;
    })
    .toBe('completed');
  expect(await readMap()).toEqual(after);
});

test.each([false, true])(
  'a completed long typed reply is consumed once with capture enabled: %s',
  async (microphoneOn) => {
    const text = 'Lampan hör till entrén. 💡 '.repeat(70);
    const model = textModel(() => [modelMessage(text)]);
    await setup(model.provider);
    await start();
    const before = await readMap();
    const sent = await post(`text-assistant/${session.id}/messages`, {
      revision: session.revision,
      draftVersion: session.review.version,
      contentVersion: session.review.contentVersion,
      requestId: 'long-typed-reply',
      text: 'Beskriv bara lampan.',
    });
    expect(sent.status(), await sent.text()).toBe(202);
    await expect
      .poll(
        async () => (await (await client.get(`${path}/text-assistant/${session.id}`)).json()).phase,
      )
      .toBe('ready');
    const completed: TextAssistantView = await (
      await client.get(`${path}/text-assistant/${session.id}`)
    ).json();
    expect(completed.completedReplies).toMatchObject([
      { id: 'long-typed-reply', source: 'text', text },
    ]);
    let consumed = await poll(microphoneOn);
    await expect
      .poll(async () => {
        consumed = await poll(microphoneOn);
        return consumed.voice.replyDelivery;
      })
      .toEqual([{ id: 'long-typed-reply', voiced: microphoneOn }]);
    const commentary = voiceAnswerParts(live.sent);
    if (microphoneOn) {
      expect(commentary.length).toBeGreaterThan(1);
      expect(commentary.join('')).toBe(`Samtal (obekräftat): ${JSON.stringify(text)}`);
      for (const part of commentary) {
        expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(480);
        expect(part).not.toContain('\ufffd');
      }
      expect(consumed.voice.response.text).toBe(text);
    } else expect(commentary).toEqual([]);
    await poll(false);
    const replay = await poll(true);
    expect(replay.voice.replyDelivery).toEqual(consumed.voice.replyDelivery);
    expect(live.sent.filter(({ event }) => isVoiceAnswerRelease(event))).toHaveLength(
      microphoneOn ? 1 : 0,
    );
    expect(await readMap()).toEqual(before);
    expect(await (await client.get(`${path}/map/history`)).json()).toEqual({ history: [] });
  },
);

test.each([5, 300])(
  'a delegated utterance retains conversation history beyond the recent fragment window with %s-character fragments',
  async (characters) => {
    const model = textModel(() => [modelMessage('Det är fortfarande privat.')]);
    await setup(model.provider);
    await start();
    const before = await readMap();
    for (let index = 0; index < 45; index++)
      live.emit(providerId, {
        type: 'session.output_transcript.delta',
        event_id: `old-${index}`,
        delta: `Historik ${index}: ${'å'.repeat(characters)}`,
        start_ms: index,
        end_ms: index + 1,
      });
    live.emit(providerId, {
      type: 'session.input_transcript.delta',
      event_id: 'new-user-command',
      delta: 'Beskriv lampan utan att spara.',
      start_ms: 50,
      end_ms: 60,
    });
    live.emit(providerId, {
      type: 'session.delegation.created',
      delegation: { id: 'bounded-context', target: 'client' },
      offset_ms: 60,
    });
    await expect.poll(() => model.requests.length).toBe(1);
    const turn = JSON.parse(
      String(model.requests[0].input.findLast((item) => item.role === 'user')?.content),
    );
    expect(turn.message).toBe('Beskriv lampan utan att spara.');
    expect(turn.voiceContext).toContain('Historik 0:');
    expect(turn.voiceContext).toContain('Historik 44:');
    expect(turn.voiceContext).toContain('Beskriv lampan utan att spara.');
    expect(JSON.parse(turn.voiceContext)).toHaveLength(46);
    await expect
      .poll(async () => (await poll()).voice.response?.text)
      .toBe('Utkast: 1 osparat förslag.\nDet är fortfarande privat.');
    expect(voiceAnswerParts(live.sent).join('')).toBe(
      'Utkast: 1 osparat förslag.\nSamtal (obekräftat): "Det är fortfarande privat."',
    );
    expect(await readMap()).toEqual(before);
  },
);

test('an explicit typed cancellation consumes the outstanding spoken task without publishing its later provider answer', async () => {
  let release: ((value: unknown[]) => void) | undefined;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  await setup(model.provider);
  await start();
  const before = await readMap();
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'held-command',
    delta: 'Beskriv lampan.',
    start_ms: 0,
    end_ms: 10,
  });
  live.emit(providerId, {
    type: 'session.delegation.created',
    delegation: { id: 'held-task', target: 'client' },
    offset_ms: 10,
  });
  await expect.poll(() => model.requests.length).toBe(1);
  const working: TextAssistantView = await (
    await client.get(`${path}/text-assistant/${session.id}`)
  ).json();
  expect(working).toMatchObject({ phase: 'working', taskSource: 'voice' });
  const canceled = await post(`text-assistant/${session.id}/cancel`, {
    revision: working.revision,
  });
  expect(canceled.status(), await canceled.text()).toBe(200);
  expect(await canceled.json()).toMatchObject({
    phase: 'ready',
    canceled: true,
    reply: 'Avbrutet. Föreslagna ändringar ligger kvar i utkastet.',
  });
  await expect.poll(async () => (await poll()).voice.summaryReady).toBe(true);
  release?.([modelMessage('Ett svar som kom efter avbrottet.')]);
  const stopped = await poll();
  expect(stopped.voice).toMatchObject({ phase: 'listening', summaryReady: true });
  expect(stopped.assistant.modelReply).toBeUndefined();
  expect(live.sent.filter(({ event }) => isVoiceAnswerRelease(event, true))).toEqual([]);
  expect(await readMap()).toEqual(before);
});

test('new speech can supersede a spoken reply without keeping its finished draft work active', {
  tags: ['technical'],
  timeout: 15_000,
}, async () => {
  let finish: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let typeId: string;
  const typedAnswer = 'Förslagen finns kvar i ditt utkast.';
  const model = textModel(async (body) => {
    if (model.requests.length > 1) return [modelMessage(typedAnswer)];
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    await held;
    return [
      modelTool('submit_changes', {
        version: turn.draft.version,
        contentVersion: turn.draft.contentVersion,
        completion: 'draft',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'finished-voice-proposal',
              baseRevision: null,
              value: { typeId, name: 'Blå cykel' },
            },
          },
        ],
      }),
    ];
  });
  await setup(model.provider);
  const before = await readMap();
  typeId = before.types[0].id;
  await start();
  try {
    speak(live, 'Lägg till en blå cykel i utkastet.');
    await expect.poll(async () => (await poll()).voice.phase).toBe('working');
    live.emit(providerId, {
      type: 'session.input_transcript.delta',
      event_id: 'unfinished-follow-up',
      delta: 'Jag skulle vilja koppla…',
      start_ms: 3000,
      end_ms: 3400,
    });
    finish();
    await expect
      .poll(async () => (await poll()).assistant)
      .toMatchObject({
        phase: 'ready',
        result: { changes: [expect.objectContaining({ objectId: 'finished-voice-proposal' })] },
      });
    await expect
      .poll(async () => (await poll()).voice)
      .toMatchObject({
        phase: 'listening',
        summaryReady: false,
      });
    expect((await poll()).voice.response).toBeUndefined();
    expect(voiceAnswerParts(live.sent)).toEqual([]);
    const updated = await readMap();
    expect(updated.draft.changes.map((change) => change.id)).toEqual([
      'independent',
      'finished-voice-proposal',
    ]);
    expect(updated.objects).toEqual(before.objects);

    const { assistant } = await poll();
    const response = await post(`text-assistant/${session.id}/messages`, {
      revision: assistant.revision,
      draftVersion: assistant.review.version,
      contentVersion: assistant.review.contentVersion,
      requestId: 'typed-follow-up',
      text: 'Finns förslagen kvar i mitt utkast?',
    });
    expect(response.status(), await response.text()).toBe(202);
    await expect.poll(async () => (await poll()).voice.response?.text).toBe(typedAnswer);
    expect(model.requests).toHaveLength(2);
    expect(await readMap()).toEqual(updated);
  } finally {
    finish();
  }
});

test.each(['read', 'external edit', 'spoken edit', 'save'])(
  'a spoken follow-up across a checked proposal preserves its authority: %s',
  { tags: ['technical'], timeout: 15_000 },
  async (followUp) => {
    let finish: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let typeId: string;
    const initialRequest = 'Lägg till Blå cykel i mitt utkast.';
    const read = 'Var finns Blå cykel?';
    const edit = 'Lägg till en ny lampa.';
    const model = textModel(
      async (body) => {
        const turn = JSON.parse(
          String(body.input.findLast(({ role }) => role === 'user')?.content),
        );
        if (turn.message === read) return [modelMessage('Blå cykel ligger i ditt utkast.')];
        if (turn.message === initialRequest) await held;
        const first = turn.message === initialRequest;
        return [
          modelTool('submit_changes', {
            version: turn.draft.version,
            contentVersion: turn.draft.contentVersion,
            completion: 'draft',
            operations: [
              {
                name: 'propose_object',
                arguments: {
                  id: first ? 'new-bike' : 'new-lamp',
                  baseRevision: null,
                  value: { typeId, name: first ? 'Blå cykel' : 'Ny lampa' },
                },
              },
            ],
          }),
        ];
      },
      (body) => {
        if (!body.instructions.startsWith('SKYTTEL_TURN_SCOPE'))
          return [modelMessage('{"decision":"allow","complete":true,"fulfillsRequest":true}')];
        const { current } = JSON.parse(String(body.input[0].content));
        return current === read
          ? readOnlyScope()
          : [
              modelMessage(
                JSON.stringify({ mode: 'work', request: current, responseRequired: false }),
              ),
            ];
      },
    );
    await setup(model.provider);
    const before = await readMap();
    typeId = before.types[0].id;
    await start();
    const fragment = (delta: string, startMs: number) =>
      live.emit(providerId, {
        type: 'session.input_transcript.delta',
        event_id: crypto.randomUUID(),
        delta,
        start_ms: startMs,
        end_ms: startMs + 100,
      });
    try {
      speak(live, initialRequest);
      await expect.poll(async () => (await poll()).voice.phase).toBe('working');
      const [first, rest] =
        followUp === 'save'
          ? ['Spara ', 'hela utkastet.']
          : followUp === 'spoken edit'
            ? ['Lägg till ', 'en ny lampa.']
            : ['Var finns ', 'Blå cykel?'];
      fragment(first, 1000);
      finish();
      await expect.poll(async () => (await poll()).voice.phase).toBe('listening');
      let externallyEditedDraft: MapState['draft'] | undefined;
      if (followUp === 'external edit') {
        const { draft } = await readMap();
        const changed = await post('map/draft', {
          version: draft.version,
          id: 'outside-voice',
          baseRevision: null,
          value: { typeId, name: 'Svart cykel' },
        });
        expect(changed.status(), await changed.text()).toBe(200);
        externallyEditedDraft = (await readMap()).draft;
        expect(externallyEditedDraft.changes.map(({ id }) => id)).toContain('outside-voice');
      }
      await poll();
      fragment(rest, 2000);
      live.emit(providerId, {
        type: 'session.delegation.created',
        offset_ms: 2100,
        delegation: { id: 'follow-up', target: 'client' },
      });
      if (followUp === 'read') {
        await expect
          .poll(async () => (await poll()).voice.response?.text)
          .toContain('Blå cykel ligger i ditt utkast.');
        expect(model.requests).toHaveLength(2);
        const turn = JSON.parse(
          String(model.requests[1].input.findLast(({ role }) => role === 'user')?.content),
        );
        expect(turn).toMatchObject({ message: read });
      } else {
        // A poll can surface the external edit through the conversation
        // revision or through the draft version before dispatch.
        const refusalMessage =
          followUp === 'external edit'
            ? /Säg hela uppdraget igen|Samtalet har hunnit ändras/u
            : /Säg hela uppdraget igen/u;
        await expect
          .poll(async () => {
            const { voice } = await poll();
            return voice.refusal?.text ?? voice.response?.text ?? '';
          })
          .toMatch(refusalMessage);
        expect(model.requests).toHaveLength(1);
        expect((await readMap()).draft.changes.map(({ id }) => id)).not.toContain('new-lamp');
        if (followUp === 'spoken edit') {
          speak(live, edit, 4000);
          await expect
            .poll(async () => (await readMap()).draft.changes.map(({ id }) => id))
            .toContain('new-lamp');
          expect(model.requests).toHaveLength(2);
        }
      }
      const current = await readMap();
      if (followUp === 'external edit') expect(current.draft).toEqual(externallyEditedDraft);
      expect(current.draft.changes.map(({ id }) => id)).toContain('new-bike');
      expect(current.objects).toEqual(before.objects);
      const final = await poll();
      expect(final.assistant.operations).toEqual([]);
      expect(final.assistant.saving).toBe(false);
      expect(final.assistant.phase).not.toBe('recovery');
    } finally {
      finish();
    }
  },
);

test.each([Number.NaN, 7])(
  'external usage %s at close cannot reduce checked voice usage or claim a finalized charge',
  async (closingSeconds) => {
    await setup();
    live.configure({ finalize: false });
    await start();
    const before = await readMap();
    for (const seconds of [Number.NaN, -1, Number.MAX_SAFE_INTEGER + 1, 8, 3])
      live.emit(providerId, { type: 'session.usage.updated', usage: { seconds } });
    expect((await poll()).voice).toMatchObject({
      phase: 'listening',
      seconds: 8,
      usageFinal: false,
    });
    live.emit(providerId, {
      type: 'session.closed',
      session: { id: 'a-different-provider-session' },
      usage: { seconds: 99 },
    });
    expect((await poll()).voice).toMatchObject({
      phase: 'listening',
      seconds: 8,
      usageFinal: false,
    });
    live.emit(providerId, {
      type: 'session.closed',
      session: { id: providerId },
      usage: { seconds: closingSeconds },
    });
    const closed = await poll();
    expect(closed.voice).toMatchObject({ phase: 'closed', seconds: 8, usageFinal: false });
    expect(closed.assistant.phase).toBe('ready');
    expect(await readMap()).toEqual(before);
  },
);

test('invalid voice control envelopes preserve the connection, checked conversation and complete private map', async () => {
  await setup();
  await start();
  const before = await readMap();
  const current: TextAssistantView = await (
    await client.get(`${path}/text-assistant/${session.id}`)
  ).json();
  const valid = {
    revision: current.revision,
    draftVersion: current.review.version,
    contentVersion: current.review.contentVersion,
    microphoneOn: true,
  };
  for (const invalid of [
    { revision: -1 },
    { revision: 0.5 },
    { revision: '0' },
    { draftVersion: -1 },
    { draftVersion: 0.5 },
    { contentVersion: 0 },
    { contentVersion: 1.5 },
    { contentVersion: '1' },
  ]) {
    const refused = await post(`${voicePath}/poll`, { ...valid, ...invalid });
    expect(refused.status(), await refused.text()).toBe(400);
    expect(await refused.json()).toEqual({ error: 'invalid_request' });
    expect(await readMap()).toEqual(before);
    expect(await (await client.get(`${path}/text-assistant/${session.id}`)).json()).toEqual(
      current,
    );
  }
  const foreignOrigin = await client.post(`${path}/${voicePath}/poll`, {
    headers: { origin: 'https://foreign.example.test' },
    data: valid,
  });
  expect(foreignOrigin.status()).toBe(403);
  expect(await foreignOrigin.json()).toEqual({ error: 'forbidden' });
  const missing = await post(`${voicePath}/unknown-action`, valid);
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toEqual({ error: 'not_found' });
  expect((await poll()).voice.phase).toBe('listening');
  expect(await readMap()).toEqual(before);
});

test('a checked unsaved outcome is spoken once without creating a new attempt or claiming a save', async () => {
  const model = textModel(() => [modelMessage('Det får inte köras.')]);
  await setup(model.provider);
  await start();
  const before = await readMap();
  const checkId = crypto.randomUUID();
  const response = await post(`text-assistant/${session.id}/recover`, { checkId });
  expect(response.status(), await response.text()).toBe(200);
  const checked = await response.json();
  const reply = 'Kontrollen visar att utkastet inte sparades. Dina osparade ändringar ligger kvar.';
  expect(checked).toMatchObject({
    phase: 'ready',
    saveCheck: { id: checkId, reply, operations: [] },
    reply,
  });
  expect(checked.receipt).toBeUndefined();
  const delivered = await poll();
  expect(delivered.voice.response).toMatchObject({ text: reply, questionPending: false });
  expect(delivered.voice.replyDelivery).toEqual([{ id: `check-${checkId}`, voiced: true }]);
  expect(live.sent.filter(({ event }) => isVoiceAnswerRelease(event))).toMatchObject([
    { event: { delegation_id: null, content: reply } },
  ]);
  const repeated = await post(`text-assistant/${session.id}/recover`, { checkId });
  expect(await repeated.json()).toEqual(checked);
  await poll();
  expect(live.sent.filter(({ event }) => isVoiceAnswerRelease(event))).toHaveLength(1);
  expect(await readMap()).toEqual(before);
  expect(model.requests).toEqual([]);
});

test('an explicit new conversation aborts a context handoff waiting on an unfinished spoken fragment and preserves the draft', async () => {
  const model = textModel(() => [modelMessage('Det får inte köras som ett uppdrag.')]);
  let refreshReadsUntilHold = 0;
  let markHeld = () => {};
  const held = new Promise<void>((resolve) => {
    markHeld = resolve;
  });
  let releaseRefresh = () => {};
  const refreshDelivery = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  await setup(model.provider, async (incoming, dispatch) => {
    const rpc =
      incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
        ? await incoming.clone().json()
        : null;
    if (
      rpc?.params?.name === 'read_my_draft' &&
      refreshReadsUntilHold > 0 &&
      --refreshReadsUntilHold === 0
    ) {
      markHeld();
      await refreshDelivery;
    }
    return dispatch(incoming);
  });
  try {
    await start();
    const before = await readMap();
    live.emit(providerId, {
      type: 'session.input_transcript.delta',
      event_id: 'unfinished',
      delta: 'Spara',
      start_ms: 0,
      end_ms: 10,
    });
    live.emit(providerId, {
      type: 'session.usage.updated',
      usage: { seconds: 1 },
      context_window: { usage_ratio: 0.95 },
    });
    expect((await poll()).voice.summaryReady).toBe(false);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const handingOff = post(`text-assistant/${session.id}/summarize`);
    await vi.waitFor(async () => {
      const current = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
      expect(current.contextSummaryState).toBe('summarizing');
    });
    // Reset clears the read cache before refreshing the authoritative draft.
    // Hold that real MCP delivery while the canceled handoff observes its abort.
    refreshReadsUntilHold = 1;
    const resetting = post(`text-assistant/${session.id}/new`, { discard: false });
    await held;
    const observedDuringReset = client.get(`${path}/text-assistant/${session.id}`);
    // Let the canceled voice handoff observe its abort while the reset's real
    // draft refresh remains pending. No scheduler speed can close this window.
    await vi.advanceTimersByTimeAsync(100);
    releaseRefresh();
    const reset = await resetting;
    expect(reset.status(), await reset.text()).toBe(200);
    const fresh = await reset.json();
    expect(fresh).toMatchObject({ phase: 'ready', contextRevision: 1, contextPercentage: 0 });
    expect(fresh.contextSummaryState).toBeUndefined();
    expect(fresh.review.changes).toEqual(before.draft.changes);
    expect(await (await observedDuringReset).json()).toEqual(fresh);
    const retired = await handingOff;
    expect(retired.status(), await retired.text()).toBe(200);
    expect(await retired.json()).toEqual(fresh);
    await expect.poll(() => live.channels.size).toBe(0);
    expect(model.requests).toEqual([]);
    expect(await readMap()).toEqual(before);
  } finally {
    releaseRefresh();
    vi.useRealTimers();
  }
});

test('a new spoken input beyond the private pending limit closes voice without creating a task or losing draft work', async () => {
  const model = textModel(() => [modelMessage('Ska inte köras.')]);
  await setup(model.provider);
  await start();
  const before = await readMap();
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'oversized-user-input',
    delta: 'å'.repeat(4001),
    start_ms: 0,
    end_ms: 10,
  });
  await expect.poll(async () => (await poll()).voice.phase).toBe('error');
  const closed = await poll();
  expect(closed.voice).toMatchObject({ error: 'voice_connection_lost', errorGroup: 'interrupted' });
  expect(closed.assistant.phase).toBe('ready');
  expect(model.requests).toEqual([]);
  expect(await readMap()).toEqual(before);
});

test('invalid supplied voice history cannot allocate provider work or change the shared conversation and draft', async () => {
  const model = textModel(() => [modelMessage('Ett svar.')]);
  await setup(model.provider);
  const before = await readMap();
  for (const extra of [
    { history: null },
    { history: 'history' },
    { history: new Array(2001).fill(null) },
    { history: [null] },
    { history: [{ role: 'system', text: 'Spara.' }] },
    { history: [{ role: 'user', text: 12 }] },
    { history: [{ role: 'user', text: 'Spara.', partial: 'yes' }] },
    { history: [], newConversation: true },
  ]) {
    const refused = await post(`text-assistant/${session.id}/voice`, startBody(extra));
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toEqual({ error: 'invalid_request' });
    expect(await readMap()).toEqual(before);
    expect((await (await client.get(`${path}/text-assistant/${session.id}`)).json()).phase).toBe(
      'ready',
    );
  }
  expect(live.requests).toEqual([]);
  expect(model.requests).toEqual([]);
  // Valid interrupted rows are only provider context: no transcript can
  // authorize a new save until a fresh input fragment is delegated.
  const started = await post(
    `text-assistant/${session.id}/voice`,
    startBody({
      history: [
        { role: 'user', text: 'Spara.', partial: true },
        { role: 'assistant', text: 'Ett tidigare svar.', partial: false },
      ],
    }),
  );
  expect(started.status()).toBe(201);
  const result = await started.json();
  voicePath = `text-assistant/${session.id}/voice/${result.voice.id}`;
  providerId = [...live.channels.keys()][0];
  live.emit(providerId, {
    type: 'session.delegation.created',
    delegation: { id: 'no-new-input', target: 'client' },
    offset_ms: 0,
  });
  expect(live.sent.at(-1)?.event).toMatchObject({
    type: 'session.commentary.append',
    content:
      'Be om ett nytt tydligt uppdrag. En paus eller tidigare repliker är inget nytt sparbesked.',
  });
  expect(model.requests).toEqual([]);
  expect(await readMap()).toEqual(before);
});

test.each([
  { event_id: 12 },
  { event_id: '' },
  { event_id: 'bad/id' },
  { event_id: 'x'.repeat(201) },
  { delta: null },
  { start_ms: -1 },
  { start_ms: Number.NaN },
  { end_ms: Number.NaN },
])(
  'invalid external transcript $event_id/$delta/$start_ms/$end_ms closes only voice and preserves private work',
  async (invalid) => {
    const model = textModel(() => [modelMessage('Ett svar.')]);
    await setup(model.provider);
    await start();
    const before = await readMap();
    live.emit(providerId, {
      type: 'session.input_transcript.delta',
      event_id: 'fragment',
      delta: 'Spara.',
      start_ms: 0,
      end_ms: 1,
      ...invalid,
    });
    await expect.poll(() => live.channels.size).toBe(0);
    expect((await poll()).voice).toMatchObject({ phase: 'error', error: 'voice_connection_lost' });
    expect(await readMap()).toEqual(before);
    expect(model.requests).toEqual([]);
    expect((await (await client.get(`${path}/text-assistant/${session.id}`)).json()).phase).toBe(
      'ready',
    );
  },
);

test.each([
  { delegation: { id: 12, target: 'client' }, offset_ms: 0 },
  { delegation: { id: 'valid', target: 'client' }, offset_ms: Number.NaN },
])(
  'invalid external delegation $offset_ms cannot turn retained speech into a save',
  async (invalid) => {
    const model = textModel(() => [modelMessage('Ett svar.')]);
    await setup(model.provider);
    await start();
    const before = await readMap();
    live.emit(providerId, { type: 'session.delegation.created', ...invalid });
    await expect.poll(() => live.channels.size).toBe(0);
    expect((await poll()).voice.phase).toBe('error');
    expect(await readMap()).toEqual(before);
    expect(model.requests).toEqual([]);
  },
);

test('external transcript capacity stops only the affected voice without dispatching a household mutation and permits restarting voice', async () => {
  const model = textModel(() => [modelMessage('Ett svar.')]);
  await setup(model.provider);
  const before = await readMap();
  await start();
  const emit = (index: number) =>
    live.emit(providerId, {
      type: 'session.output_transcript.delta',
      event_id: `fragment-${index}`,
      delta: '',
      start_ms: index,
      end_ms: index,
    });
  for (let index = 0; index < 2000; index++) emit(index);
  expect((await poll()).voice.phase).toBe('listening');
  emit(2000);
  await expect.poll(() => live.channels.size).toBe(0);
  expect((await poll()).voice.phase).toBe('error');
  await start();
  expect(live.channels.has(providerId)).toBe(true);
  expect(model.requests).toEqual([]);
  expect(await readMap()).toEqual(before);
}, 15_000);

test('external delegation capacity stops only the affected voice without dispatching a household mutation', async () => {
  const model = textModel(() => [modelMessage('Ett svar.')]);
  await setup(model.provider);
  const before = await readMap();
  await start();
  live.emit(providerId, {
    type: 'session.delegation.created',
    delegation: { id: 'ignored-provider-task', target: 'provider' },
    offset_ms: 0,
  });
  expect(live.sent.filter(({ event }) => isVoiceAnswerRelease(event, true))).toEqual([]);
  const emit = (index: number) =>
    live.emit(providerId, {
      type: 'session.delegation.created',
      delegation: { id: `delegate-${index}`, target: 'client' },
      offset_ms: 0,
    });
  for (let index = 0; index < 500; index++) emit(index);
  expect((await poll()).voice.phase).toBe('listening');
  emit(500);
  await expect.poll(() => live.channels.size).toBe(0);
  expect((await poll()).voice.phase).toBe('error');
  expect(model.requests).toEqual([]);
  expect(await readMap()).toEqual(before);
});

test('a spoken saved relationship selection waits for actual acknowledgement and speaks its verified relationship result', async () => {
  const model = textModel((body) =>
    lastToolResult(body)
      ? [modelMessage('Här finns sambandet.')]
      : [modelTool('show_map_item', { kind: 'relationship', id: 'edge' })],
  );
  await setup(model.provider);
  let state = await readMap();
  expect(
    (
      await post('map/draft', {
        version: state.draft.version,
        id: 'target',
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Garaget' },
      })
    ).status(),
  ).toBe(200);
  state = await readMap();
  expect(
    (
      await post('map/relationship', {
        version: state.draft.version,
        id: 'edge',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes[0].id,
          sourceId: 'independent',
          targetId: 'target',
        },
      })
    ).status(),
  ).toBe(200);
  state = await readMap();
  expect(
    (await post('map/save', { version: state.draft.version, operationId: 'initial' })).status(),
  ).toBe(200);
  const before = await readMap();
  session = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
  await start();
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'show-edge',
    delta: 'Visa sambandet.',
    start_ms: 0,
    end_ms: 10,
  });
  live.emit(providerId, {
    type: 'session.delegation.created',
    delegation: { id: 'show-task', target: 'client' },
    offset_ms: 10,
  });
  await expect
    .poll(
      async () =>
        (await (await client.get(`${path}/text-assistant/${session.id}`)).json()).selection?.id,
    )
    .toBe('edge');
  const selected: TextAssistantView = await (
    await client.get(`${path}/text-assistant/${session.id}`)
  ).json();
  expect(live.sent.filter(({ event }) => isVoiceAnswerRelease(event, true))).toEqual([]);
  expect(
    (
      await post(`text-assistant/${session.id}/selection`, {
        revision: selected.revision,
        kind: 'relationship',
        id: 'edge',
        draftVersion: selected.review.version,
        contentVersion: selected.review.contentVersion,
        displayed: true,
      })
    ).status(),
  ).toBe(200);
  await expect
    .poll(() => live.sent.filter(({ event }) => isVoiceAnswerRelease(event)).length)
    .toBe(1);
  expect(live.sent.at(-1)?.event).toMatchObject({
    type: 'session.instructions.append',
  });
  expect(voiceAnswerParts(live.sent).join('')).toBe(
    'Skyttels resultat (verifierat): Sambandet är markerat.\nSamtal (obekräftat): "Här finns sambandet."',
  );
  expect((await poll()).assistant.displayedItem).toEqual({ kind: 'relationship', id: 'edge' });
  expect(await readMap()).toEqual(before);
});
