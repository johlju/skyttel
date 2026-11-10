import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation, robin } from '../../support/installation.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
const clients: APIRequestContext[] = [];
const releases: (() => void)[] = [];
let base: string;
type Conversation = { client: APIRequestContext; path: string; initial: TextAssistantView };
type AssistantDispatch = NonNullable<
  NonNullable<Parameters<typeof createInstallation>[1]>['assistantDispatch']
>;
function heldResponse() {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
    releases.push(resolve);
  });
  return { pending, release };
}
function heldDraftRead() {
  const { pending, release } = heldResponse();
  let holdNext = false;
  let entered = false;
  let followingReads = 0;
  const dispatch: AssistantDispatch = async (incoming, dispatch) => {
    const rpc = await incoming
      .clone()
      .json()
      .catch(() => null);
    const response = await dispatch(incoming);
    if (rpc?.params?.name === 'read_my_draft') {
      if (holdNext) {
        holdNext = false;
        entered = true;
        await pending;
      } else if (entered) followingReads++;
    }
    return response;
  };
  return {
    dispatch,
    hold: () => {
      holdNext = true;
    },
    release,
    get held() {
      return entered;
    },
    get followingReads() {
      return followingReads;
    },
  };
}
function proposeObject(
  draft: Pick<TextAssistantView['review'], 'version' | 'contentVersion'>,
  id: string,
  value: { typeId: string; name: string },
  completion: 'draft' | 'save' = 'draft',
) {
  return modelTool('submit_changes', {
    version: draft.version,
    contentVersion: draft.contentVersion,
    completion,
    operations: [{ name: 'propose_object', arguments: { id, baseRevision: null, value } }],
  });
}
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const client of clients.splice(0)) await client.dispose();
  await app?.close();
});
const post = (client: APIRequestContext, path: string, data: unknown) =>
  client.post(path, { headers: { origin: app.origin }, data });
async function conversation(
  client?: APIRequestContext,
  householdPath = base,
): Promise<Conversation> {
  if (!client) {
    client = await request.newContext();
    clients.push(client);
    await signIn(client, app.origin);
  }
  const response = await post(client, `${householdPath}/text-assistant`, approvedForVisit);
  expect(response.status()).toBe(201);
  const initial: TextAssistantView = await response.json();
  return { client, initial, path: `${householdPath}/text-assistant/${initial.id}` };
}
async function arrange(modelFetch: typeof fetch, assistantDispatch?: AssistantDispatch) {
  app = await createInstallation(undefined, { modelFetch, assistantDispatch });
  const client = await request.newContext();
  clients.push(client);
  await signIn(client, app.origin);
  const { household } = await (await createHousehold(client, app.origin)).json();
  base = `${app.origin}/api/households/${household.id}`;
  return conversation(client);
}
async function read(value: Conversation): Promise<TextAssistantView> {
  return (await value.client.get(value.path)).json();
}
async function map(value: Conversation): Promise<MapState> {
  return (await value.client.get(`${value.path.split('/text-assistant/')[0]}/map`)).json();
}
async function send(value: Conversation, text: string, requestId: string = crypto.randomUUID()) {
  const current = await read(value);
  const response = await post(value.client, `${value.path}/messages`, {
    revision: current.revision,
    draftVersion: current.review.version,
    contentVersion: current.review.contentVersion,
    requestId,
    text,
  });
  expect(response.status(), await response.text()).toBe(202);
  return requestId;
}
async function completed(value: Conversation, id: string) {
  let result!: TextAssistantView;
  await expect
    .poll(async () => {
      result = await (await value.client.get(`${value.path}/messages/${id}`)).json();
      return result.taskStatus;
    })
    .toBe('completed');
  return result;
}
async function seed(value: Conversation, name = 'Stolen') {
  const state = await map(value);
  const response = await post(value.client, `${base}/map/draft`, {
    version: state.draft.version,
    contentVersion: state.contentVersion,
    id: 'chair',
    baseRevision: null,
    value: { typeId: state.types[0].id, name },
  });
  expect(response.status()).toBe(200);
}

async function resetAndDiscard(value: Conversation, endpoint: 'messages' | 'new') {
  const current = await read(value);
  const response = await post(
    value.client,
    `${value.path}/${endpoint}`,
    endpoint === 'new'
      ? { discard: true }
      : {
          revision: current.revision,
          draftVersion: current.review.version,
          contentVersion: current.review.contentVersion,
          requestId: crypto.randomUUID(),
          text: 'Nytt samtal och kasta utkastet.',
        },
  );
  expect(response.status(), await response.text()).toBe(200);
}

test('an earlier message held in preparation keeps its position before another conversation', async () => {
  const readGate = heldDraftRead();
  const { pending: heldModel, release: releaseModel } = heldResponse();
  let typeId = '';
  const model = textModel(async (body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    await heldModel;
    const first = input.message === 'Lägg till Lampan A.';
    return [
      proposeObject(input.draft, first ? 'lamp-a' : 'lamp-b', {
        typeId,
        name: first ? 'Lampan A' : 'Lampan B',
      }),
    ];
  });
  const first = await arrange(model.provider, readGate.dispatch);
  const current = await read(first);
  await seed(first);
  const state = await map(first);
  typeId = state.types[0].id;
  const second = await conversation();
  const firstId = crypto.randomUUID();
  readGate.hold();
  const preparing = post(first.client, `${first.path}/messages`, {
    revision: current.revision,
    draftVersion: state.draft.version,
    contentVersion: state.contentVersion,
    requestId: firstId,
    text: 'Lägg till Lampan A.',
  });
  await expect.poll(() => readGate.held).toBe(true);
  const secondId = await send(second, 'Lägg till Lampan B.');
  const waiting: TextAssistantView = await (
    await second.client.get(`${second.path}/messages/${secondId}`)
  ).json();
  expect(waiting.taskStatus).toBe('queued');
  readGate.release();
  expect((await preparing).status()).toBe(202);
  releaseModel();
  expect((await completed(first, firstId)).error).toBeUndefined();
  expect((await completed(second, secondId)).error).toBeUndefined();
  expect((await map(second)).draft.changes).toMatchObject([
    { id: 'chair' },
    { id: 'lamp-a', after: { name: 'Lampan A' } },
    { id: 'lamp-b', after: { name: 'Lampan B' } },
  ]);
});

test.each([
  { barrier: 'executing', replacement: false },
  { barrier: 'executing', replacement: true },
  { barrier: 'preparation', replacement: false },
  { barrier: 'preparation', replacement: true },
  { barrier: 'target-preparation', replacement: false },
  { barrier: 'target-preparation', replacement: true },
])(
  'queued target stays bound across conversations with $barrier and replacement=$replacement',
  async ({ barrier, replacement }) => {
    const readGate = heldDraftRead();
    const { pending: heldModel, release: releaseModel } = heldResponse();
    const correction = 'Byt namnet på Stolen till Klar stol. Spara inte.';
    let correctionEntered = false;
    const model = textModel(
      async (body) => {
        const input = JSON.parse(
          String(body.input.findLast((item) => item.role === 'user')?.content),
        );
        if (input.message !== correction) {
          await heldModel;
          return [modelMessage('Läsningen är klar.')];
        }
        correctionEntered = true;
        const draft = lastToolResult(body);
        if (!draft) return [modelTool('read_my_draft', {})];
        const target =
          draft.changes.find(
            (item: { after?: { name: string } }) => item.after?.name === 'Stolen',
          ) ?? draft.changes[0];
        return [proposeObject(draft, target.id, { ...target.after, name: 'Klar stol' })];
      },
      (body) => {
        if (body.instructions.startsWith('SKYTTEL_TURN_SCOPE')) {
          const { current } = JSON.parse(String(body.input[0].content));
          return [
            modelMessage(
              JSON.stringify({
                mode: current === correction ? 'work' : 'read',
                request: current,
                responseRequired: false,
              }),
            ),
          ];
        }
        const { data, operations } = JSON.parse(String(body.input[0].content)).untrusted;
        const reference = data.queuedReference;
        // Without original server facts the provider would accept the current
        // apparent target, reproducing the lost binding rather than guessing it.
        if (!reference)
          return [modelMessage('{"decision":"allow","complete":true,"fulfillsRequest":true}')];
        const original = reference.draft.changes.find(
          (item: { id: string }) => item.id === operations[0].arguments.id,
        );
        const matches = data.draft.changes.filter(
          (item: { after?: { name: string } }) => item.after?.name === 'Stolen',
        );
        return [
          modelMessage(
            JSON.stringify(
              original?.after?.name === 'Stolen' &&
                matches.length === 1 &&
                matches[0].id === original.id
                ? { decision: 'allow', complete: true, fulfillsRequest: true }
                : { decision: 'clarify', operation: 0, question: 'Menar du Lo Manuell?' },
            ),
          ),
        ];
      },
    );
    const first = await arrange(model.provider, readGate.dispatch);
    await seed(first);
    const second = await conversation();
    const initial = await read(first);
    const addMarker = async (id: string) => {
      const state = await map(first);
      expect(
        (
          await post(first.client, `${base}/map/draft`, {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            id,
            baseRevision: null,
            value: { typeId: state.types[0].id, name: 'Oberoende markör' },
          })
        ).status(),
      ).toBe(200);
      return map(first);
    };
    const arrival = barrier === 'preparation' ? await addMarker('first-marker') : await map(first);
    const earlierId = crypto.randomUUID();
    if (barrier === 'preparation') readGate.hold();
    const earlier = post(first.client, `${first.path}/messages`, {
      revision: initial.revision,
      draftVersion: arrival.draft.version,
      contentVersion: arrival.contentVersion,
      requestId: earlierId,
      text: 'Läs färdigt först.',
    });
    if (barrier === 'preparation') await expect.poll(() => readGate.held).toBe(true);
    else {
      expect((await earlier).status()).toBe(202);
      await expect.poll(() => model.requests.length).toBe(1);
    }
    if (barrier === 'target-preparation') await send(second, 'Läs sedan.');
    const admitted = await read(second);
    const targetArrival =
      barrier === 'target-preparation' ? await addMarker('target-marker') : await map(second);
    const targetId = crypto.randomUUID();
    if (barrier === 'target-preparation') readGate.hold();
    const target = post(second.client, `${second.path}/messages`, {
      revision: admitted.revision,
      draftVersion: targetArrival.draft.version,
      contentVersion: targetArrival.contentVersion,
      requestId: targetId,
      text: correction,
    });
    if (barrier === 'target-preparation') await expect.poll(() => readGate.held).toBe(true);
    else expect((await target).status()).toBe(202);
    await seed(first, 'Manuellt nytt namn');
    if (replacement) {
      const state = await map(first);
      expect(
        (
          await post(first.client, `${base}/map/draft`, {
            version: state.draft.version,
            contentVersion: state.contentVersion,
            id: 'replacement-chair',
            baseRevision: null,
            value: { typeId: state.types[0].id, name: 'Stolen' },
          })
        ).status(),
      ).toBe(200);
    }
    const before = await map(first);
    readGate.release();
    const earlierResponse = await earlier;
    if (barrier === 'preparation') {
      expect(earlierResponse.status()).toBe(409);
      expect(await earlierResponse.json()).toEqual({ error: 'assistant_draft_changed' });
    } else expect(earlierResponse.status()).toBe(202);
    expect((await target).status()).toBe(202);
    releaseModel();
    const final = await completed(second, targetId);
    expect(correctionEntered).toBe(true);
    expect(final).toMatchObject({ phase: 'error', error: 'assistant_scope_unclear' });
    expect(await map(second)).toEqual(before);
    expect((await (await second.client.get(`${base}/map/history`)).json()).history).toEqual([]);
  },
);

test.each([
  { preparing: true, manualChange: false },
  { preparing: true, manualChange: true },
  { preparing: false, manualChange: false },
])(
  'preparation accepts only verified predecessor advancement during its reservation (preparing=$preparing, manual=$manualChange)',
  async ({ preparing, manualChange }) => {
    const readGate = heldDraftRead();
    const { pending: heldModel, release: releaseModel } = heldResponse();
    let typeId = '';
    const model = textModel(async (body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      await heldModel;
      return [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
    });
    const first = await arrange(model.provider, readGate.dispatch);
    const second = await conversation();
    await seed(first);
    const state = await map(first);
    typeId = state.types[0].id;
    const running = await send(first, 'Lägg till Lampan.');
    await expect.poll(() => model.requests.length).toBe(1);
    const body = {
      revision: second.initial.revision,
      draftVersion: state.draft.version,
      contentVersion: state.contentVersion,
      requestId: crypto.randomUUID(),
      text: 'Kasta utkastet.',
    };
    const prepare = () => post(second.client, `${second.path}/messages`, body);
    let pending: ReturnType<typeof prepare> | undefined;
    if (preparing) {
      readGate.hold();
      pending = prepare();
      await expect.poll(() => readGate.held).toBe(true);
    }
    releaseModel();
    expect((await completed(first, running)).error).toBeUndefined();
    if (manualChange) {
      await seed(second, 'Manuellt bevarad stol');
    }
    readGate.release();
    const accepted = await (pending ?? prepare());
    if (!preparing || manualChange) {
      expect(accepted.status()).toBe(409);
      expect(await accepted.json()).toEqual({ error: 'assistant_draft_changed' });
      expect((await map(second)).draft.changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'lamp',
            after: expect.objectContaining({ name: 'Lampan' }),
          }),
          expect.objectContaining({
            id: 'chair',
            after: expect.objectContaining({
              name: manualChange ? 'Manuellt bevarad stol' : 'Stolen',
            }),
          }),
        ]),
      );
      return;
    }
    expect(accepted.status(), await accepted.text()).toBe(202);
    expect((await completed(second, body.requestId)).discarded).toBe(true);
    expect((await map(second)).draft.changes).toEqual([]);
    const retry = await post(second.client, `${second.path}/messages`, body);
    expect(retry.status(), await retry.text()).toBe(202);
    const changedRetry = await post(second.client, `${second.path}/messages`, {
      ...body,
      draftVersion: body.draftVersion + 1,
    });
    expect(changedRetry.status()).toBe(409);
    expect(await changedRetry.json()).toEqual({ error: 'assistant_turn_changed' });
  },
);

test.each(['executing', 'preparation', 'registered-save'] as const)(
  'capacity restatement waits for the shared draft barrier %s',
  async (barrier) => {
    const readGate = heldDraftRead();
    const { pending: held, release } = heldResponse();
    const narrower = 'Beskriv aktuellt utkast. Spara inte.';
    let restatementEntered = false;
    let saveRegistered = false;
    let overflow = true;
    const model = textModel(async (body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (input.message === narrower) {
        restatementEntered = true;
        if (barrier === 'registered-save')
          expect(input.saveOperations).toContainEqual(
            expect.objectContaining({ status: 'succeeded' }),
          );
        return [modelMessage('Det aktuella underlaget är läst.')];
      }
      if (input.message === 'Spara hela utkastet.')
        return [
          modelTool('save_draft', {
            version: input.draft.version,
            contentVersion: input.draft.contentVersion,
          }),
        ];
      await held;
      return [modelMessage('Den tidigare läsningen är klar.')];
    });
    const first = await arrange(
      async (input, init) => {
        const body = JSON.parse(String(init?.body));
        if (body.tools.length && overflow) {
          overflow = false;
          return Response.json(
            { error: { code: 'context_length_exceeded', message: 'Controlled capacity stop.' } },
            { status: 400 },
          );
        }
        return model.provider(input, init);
      },
      (incoming, dispatch) =>
        readGate.dispatch(incoming, async (request) => {
          const rpc = await request
            .clone()
            .json()
            .catch(() => null);
          const response = await dispatch(request);
          if (rpc?.params?.name === 'prepare_save' && barrier === 'registered-save') {
            saveRegistered = true;
            await held;
          }
          return response;
        }),
    );
    await seed(first);
    const stopped = await completed(first, await send(first, 'Ett för stort uppdrag.'));
    expect(stopped).toMatchObject({ phase: 'error', capacityPaused: true });
    const second = await conversation();
    const current = await read(second);
    await seed(first, 'Manuellt aktuell stol');
    const state = await map(second);
    if (barrier === 'preparation') readGate.hold();
    const earlier = post(second.client, `${second.path}/messages`, {
      revision: current.revision,
      draftVersion: state.draft.version,
      contentVersion: state.contentVersion,
      requestId: crypto.randomUUID(),
      text: barrier === 'registered-save' ? 'Spara hela utkastet.' : 'Håll läsningen.',
    });
    if (barrier === 'preparation') await expect.poll(() => readGate.held).toBe(true);
    else {
      expect((await earlier).status()).toBe(202);
      await expect
        .poll(() => (barrier === 'registered-save' ? saveRegistered : model.requests.length === 1))
        .toBe(true);
    }
    const paused = await read(first);
    const restatementId = crypto.randomUUID();
    const accepted = await post(first.client, `${first.path}/messages`, {
      revision: paused.revision,
      draftVersion: paused.review.version,
      contentVersion: paused.review.contentVersion,
      requestId: restatementId,
      text: narrower,
      restate: true,
    });
    expect(accepted.status()).toBe(202);
    expect((await accepted.json()).taskStatus).toBe('queued');
    expect(restatementEntered).toBe(false);
    if (barrier === 'registered-save')
      expect((await post(second.client, `${second.path}/cancel`, { all: true })).status()).toBe(
        200,
      );
    readGate.release();
    release();
    expect((await earlier).status()).toBe(202);
    expect((await completed(first, restatementId)).error).toBeUndefined();
    expect(restatementEntered).toBe(true);
    const final = await map(first);
    if (barrier === 'registered-save') {
      expect(final.objects).toMatchObject([{ id: 'chair', name: 'Manuellt aktuell stol' }]);
      expect(final.draft.changes).toEqual([]);
    } else {
      expect(final.objects).toEqual([]);
      expect(final.draft.changes).toMatchObject([
        { id: 'chair', after: { name: 'Manuellt aktuell stol' } },
      ]);
    }
  },
);

test.each([false, true])(
  'admission rereads a held snapshot advanced by a verified predecessor (manual=%s)',
  async (manualChange) => {
    const middlewareGate = heldDraftRead();
    const admissionGate = heldDraftRead();
    const { pending: firstModel, release: releaseFirst } = heldResponse();
    const { pending: secondModel, release: releaseSecond } = heldResponse();
    let typeId = '';
    const model = textModel(async (body) => {
      const previous = lastToolResult(body);
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      await (previous ? secondModel : firstModel);
      const draft = previous?.review ?? input.draft;
      return [
        modelTool('submit_changes', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          completion: 'draft',
          continueResponse: !previous,
          operations: [
            {
              name: 'propose_object',
              arguments: {
                id: previous ? 'table' : 'lamp',
                baseRevision: null,
                value: { typeId, name: previous ? 'Bordet' : 'Lampan' },
              },
            },
          ],
        }),
      ];
    });
    const first = await arrange(model.provider, (incoming, dispatch) =>
      middlewareGate.dispatch(incoming, (request) => admissionGate.dispatch(request, dispatch)),
    );
    const second = await conversation();
    await seed(first);
    const state = await map(first);
    typeId = state.types[0].id;
    const running = await send(first, 'Lägg till Lampan och Bordet.');
    await expect.poll(() => model.requests.length).toBe(1);
    const body = {
      revision: second.initial.revision,
      draftVersion: state.draft.version,
      contentVersion: state.contentVersion,
      requestId: crypto.randomUUID(),
      text: 'Kasta utkastet.',
    };
    const cookies = (await second.client.storageState()).cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    let finishBody!: () => void;
    const controller = new AbortController();
    releases.push(() => controller.abort());
    middlewareGate.hold();
    const preparing = fetch(`${second.path}/messages`, {
      method: 'POST',
      headers: {
        Origin: app.origin,
        Cookie: cookies,
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(JSON.stringify(body))),
      },
      signal: controller.signal,
      body: new ReadableStream({
        start(stream) {
          const encoder = new TextEncoder();
          stream.enqueue(encoder.encode('{'));
          finishBody = () => {
            stream.enqueue(encoder.encode(JSON.stringify(body).slice(1)));
            stream.close();
          };
        },
      }),
      duplex: 'half',
    } as RequestInit);
    void preparing.catch(() => undefined);
    await expect.poll(() => middlewareGate.held).toBe(true);
    middlewareGate.release();
    releaseFirst();
    await expect.poll(() => model.requests.length).toBe(2);
    admissionGate.hold();
    finishBody();
    await expect.poll(() => admissionGate.held).toBe(true);
    releaseSecond();
    expect((await completed(first, running)).error).toBeUndefined();
    if (manualChange) {
      await seed(second, 'Manuellt bevarad stol');
    }
    admissionGate.release();
    const accepted = await preparing;
    if (manualChange) {
      expect(accepted.status).toBe(409);
      expect(await accepted.json()).toEqual({ error: 'assistant_draft_changed' });
      const changes = (await map(second)).draft.changes;
      expect(changes).toHaveLength(3);
      expect(changes.find((change) => change.id === 'chair')?.after?.name).toBe(
        'Manuellt bevarad stol',
      );
    } else {
      expect(accepted.status, await accepted.text()).toBe(202);
      expect((await completed(second, body.requestId)).discarded).toBe(true);
      expect((await map(second)).draft.changes).toEqual([]);
    }
  },
);

test('repeated draft changes during admission refuse the request without expiring its conversation', async () => {
  const firstRead = heldDraftRead();
  const retryRead = heldDraftRead();
  const model = textModel(() => [modelMessage('Utkastet finns kvar.')]);
  const value = await arrange(model.provider, (incoming, dispatch) =>
    firstRead.dispatch(incoming, (request) => retryRead.dispatch(request, dispatch)),
  );
  await seed(value);
  const initial = await map(value);
  firstRead.hold();
  const preparing = post(value.client, `${value.path}/messages`, {
    revision: value.initial.revision,
    draftVersion: initial.draft.version,
    contentVersion: initial.contentVersion,
    requestId: crypto.randomUUID(),
    text: 'Kasta utkastet.',
  });
  await expect.poll(() => firstRead.held).toBe(true);
  await seed(value, 'Första manuella rättelsen');
  retryRead.hold();
  firstRead.release();
  await expect.poll(() => retryRead.held).toBe(true);
  await seed(value, 'Andra manuella rättelsen');
  const retained = await map(value);
  retryRead.release();
  const rejected = await preparing;
  expect(rejected.status(), await rejected.text()).toBe(409);
  expect(await rejected.json()).toEqual({ error: 'assistant_draft_changed' });
  const response = await value.client.get(value.path);
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toMatchObject({
    review: {
      version: retained.draft.version,
      changes: [{ id: 'chair', after: { name: 'Andra manuella rättelsen' } }],
    },
  });
  expect(model.requests).toEqual([]);
  expect(await map(value)).toEqual(retained);
  expect((await (await value.client.get(`${base}/map/history`)).json()).history).toEqual([]);
});

test.each(['messages', 'new'] as const)(
  'a held %s reset discards before a later conversation proposal',
  async (endpoint) => {
    const readGate = heldDraftRead();
    const { pending: heldModel, release: releaseModel } = heldResponse();
    let typeId = '';
    const model = textModel(async (body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      await heldModel;
      return [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
    });
    const first = await arrange(model.provider, readGate.dispatch);
    await seed(first);
    typeId = (await map(first)).types[0].id;
    await read(first);
    const second = await conversation();
    readGate.hold();
    const resetting = resetAndDiscard(first, endpoint);
    await expect.poll(() => readGate.held).toBe(true);
    const id = await send(second, 'Lägg till Lampan.');
    const waiting: TextAssistantView = await (
      await second.client.get(`${second.path}/messages/${id}`)
    ).json();
    expect(waiting.taskStatus).toBe('queued');
    readGate.release();
    await resetting;
    releaseModel();
    expect((await completed(second, id)).error).toBeUndefined();
    expect((await map(second)).draft.changes).toMatchObject([
      { id: 'lamp', after: { name: 'Lampan' } },
    ]);
    expect((await read(first)).discarded).toBe(true);
  },
);

test.each([
  { earlierSave: false, cancelLater: false },
  { earlierSave: true, cancelLater: false },
  { earlierSave: true, cancelLater: true },
])(
  'save authority follows arrival order when earlier preparation finishes later (earlier save=$earlierSave, cancel later=$cancelLater)',
  async ({ earlierSave, cancelLater }) => {
    const readGate = heldDraftRead();
    let typeId = '';
    const earlierText = earlierSave ? 'Lägg till Lampan och spara.' : 'Lägg till Lampan.';
    const laterText = earlierSave ? 'Beskriv mitt utkast.' : 'Spara hela utkastet.';
    const model = textModel((body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (input.message === earlierText)
        return [
          proposeObject(
            input.draft,
            'lamp',
            { typeId, name: 'Lampan' },
            earlierSave ? 'save' : 'draft',
          ),
        ];
      if (!earlierSave)
        return [
          modelTool('save_draft', {
            version: input.draft.version,
            contentVersion: input.draft.contentVersion,
          }),
        ];
      return [modelMessage('Förslagen ligger i utkastet.')];
    });
    const first = await arrange(model.provider, readGate.dispatch);
    const current = await read(first);
    await seed(first);
    const state = await map(first);
    typeId = state.types[0].id;
    const second = await conversation();
    const earlierId = crypto.randomUUID();
    readGate.hold();
    const preparing = post(first.client, `${first.path}/messages`, {
      revision: current.revision,
      draftVersion: state.draft.version,
      contentVersion: state.contentVersion,
      requestId: earlierId,
      text: earlierText,
    });
    await expect.poll(() => readGate.held).toBe(true);
    const laterId = await send(second, laterText);
    if (cancelLater)
      expect((await post(second.client, `${second.path}/cancel`, { all: true })).status()).toBe(
        200,
      );
    readGate.release();
    expect((await preparing).status()).toBe(202);
    const earlier = await completed(first, earlierId);
    const later = cancelLater ? undefined : await completed(second, laterId);
    const final = await map(second);
    if (earlierSave) {
      expect(earlier.receipt).toBeUndefined();
      expect(final.objects).toEqual([]);
      expect(final.draft.changes).toHaveLength(2);
      expect((await (await second.client.get(`${base}/map/history`)).json()).history).toEqual([]);
    } else {
      expect(later?.receipt).toBeDefined();
      expect(final.objects).toHaveLength(2);
      expect(final.objects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'chair' }),
          expect.objectContaining({ id: 'lamp' }),
        ]),
      );
      expect(final.draft.changes).toEqual([]);
    }
  },
);

test('a duplicate during preparation keeps the original order without revoking a later save', async () => {
  const readGate = heldDraftRead();
  let typeId = '';
  const model = textModel((body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    return input.message === 'Spara hela utkastet.'
      ? [
          modelTool('save_draft', {
            version: input.draft.version,
            contentVersion: input.draft.contentVersion,
          }),
        ]
      : [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
  });
  const first = await arrange(model.provider, readGate.dispatch);
  const current = await read(first);
  await seed(first);
  const state = await map(first);
  typeId = state.types[0].id;
  const second = await conversation();
  const body = {
    revision: current.revision,
    draftVersion: state.draft.version,
    contentVersion: state.contentVersion,
    requestId: crypto.randomUUID(),
    text: 'Lägg till Lampan.',
  };
  readGate.hold();
  const preparing = post(first.client, `${first.path}/messages`, body);
  await expect.poll(() => readGate.held).toBe(true);
  const saveId = await send(second, 'Spara hela utkastet.');
  const retrying = post(first.client, `${first.path}/messages`, body);
  await expect.poll(() => readGate.followingReads > 0).toBe(true);
  readGate.release();
  expect((await preparing).status()).toBe(202);
  expect((await retrying).status()).toBe(202);
  expect((await completed(first, body.requestId)).error).toBeUndefined();
  expect((await completed(second, saveId)).receipt).toBeDefined();
  const final = await map(second);
  expect(final.objects).toHaveLength(2);
  expect(final.objects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'chair' }),
      expect.objectContaining({ id: 'lamp' }),
    ]),
  );
  expect(final.draft.changes).toEqual([]);
  expect((await (await second.client.get(`${base}/map/history`)).json()).history).toHaveLength(1);
});

test.each([false, true])(
  'a queued ordinary discard respects verified predecessor and manual versions (manual=%s)',
  async (manualChange) => {
    const { pending: heldModel, release: releaseModel } = heldResponse();
    const { pending: heldSummary, release: releaseSummary } = heldResponse();
    let summaryHeld = false;
    let typeId = '';
    const model = textModel(async (body) => {
      if (!body.tools.length) {
        summaryHeld = true;
        await heldSummary;
        return [modelMessage('Stolen finns i utkastet.')];
      }
      await heldModel;
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
    });
    const first = await arrange(async (input, init) => {
      const body = JSON.parse(String(init?.body));
      const response = await model.provider(input, init);
      if (!body.tools.length || body.instructions.startsWith('SKYTTEL_TURN_')) return response;
      const result = await response.json();
      result.usage.input_tokens = 1_040_000;
      return Response.json(result, { headers: response.headers });
    });
    await seed(first);
    typeId = (await map(first)).types[0].id;
    const second = await conversation();
    const running = await send(first, 'Lägg till Lampan.');
    await expect.poll(() => model.requests.length).toBe(1);
    const discard = await send(second, 'Kasta utkastet.');
    releaseModel();
    await expect.poll(() => summaryHeld).toBe(true);
    if (manualChange) {
      const state = await map(second);
      const changed = await post(second.client, `${base}/map/draft`, {
        version: state.draft.version,
        contentVersion: state.contentVersion,
        id: 'chair',
        baseRevision: null,
        value: { typeId: state.types[0].id, name: 'Manuellt bevarad stol' },
      });
      expect(changed.status()).toBe(200);
    }
    releaseSummary();
    await completed(first, running);
    const result = await completed(second, discard);
    if (manualChange) {
      expect(result.error).toBe('assistant_draft_changed');
      const changes = (await map(second)).draft.changes;
      expect(changes).toHaveLength(2);
      expect(changes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'chair',
            after: expect.objectContaining({ name: 'Manuellt bevarad stol' }),
          }),
          expect.objectContaining({
            id: 'lamp',
            after: expect.objectContaining({ name: 'Lampan' }),
          }),
        ]),
      );
    } else {
      expect(result.discarded).toBe(true);
      expect((await map(second)).draft.changes).toEqual([]);
    }
  },
);

test.each(['rejected', 'stop', 'new reset', 'end', 'abort'] as const)(
  'a %s preparation releases later conversation work without reviving the earlier message',
  async (ending) => {
    const readGate = heldDraftRead();
    let typeId = '';
    const model = textModel((body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
    });
    const first = await arrange(model.provider, readGate.dispatch);
    const current = await read(first);
    await seed(first);
    const state = await map(first);
    typeId = state.types[0].id;
    const second = await conversation();
    const body = {
      revision: current.revision,
      draftVersion: state.draft.version,
      contentVersion: state.contentVersion,
      requestId: crypto.randomUUID(),
      text: ending === 'rejected' ? '' : 'Lägg till Felaktiga lampan.',
    };
    const controller = new AbortController();
    const cookies = (await first.client.storageState()).cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    readGate.hold();
    const preparing =
      ending === 'abort'
        ? fetch(`${first.path}/messages`, {
            method: 'POST',
            headers: { Origin: app.origin, Cookie: cookies, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          }).catch((error: unknown) => error)
        : post(first.client, `${first.path}/messages`, body);
    await expect.poll(() => readGate.held).toBe(true);
    const later = await send(second, 'Lägg till Lampan.');
    if (ending === 'rejected') readGate.release();
    else if (ending === 'abort') controller.abort();
    else {
      const endpoint = ending === 'stop' ? 'cancel' : ending === 'new reset' ? 'new' : 'stop';
      const result = await post(
        first.client,
        `${first.path}/${endpoint}`,
        ending === 'stop' ? { all: true } : {},
      );
      expect(result.status()).toBe(200);
    }
    expect((await completed(second, later)).error).toBeUndefined();
    readGate.release();
    const earlier = await preparing;
    if (ending === 'abort') expect(earlier).toBeInstanceOf(Error);
    else {
      expect((earlier as Awaited<ReturnType<typeof post>>).status()).toBe(
        ending === 'rejected' ? 400 : ending === 'end' ? 404 : 409,
      );
    }
    expect((await map(second)).draft.changes).toMatchObject([{ id: 'chair' }, { id: 'lamp' }]);
    expect(model.requests).toHaveLength(1);
    if (ending === 'stop') {
      const stopped = await read(first);
      expect(stopped.canceled).toBe(true);
      expect(stopped.reply).toBe('Avbrutet. Föreslagna ändringar ligger kvar i utkastet.');
    }
  },
);

test.each(['messages', 'new'] as const)(
  'stop during a %s reset refresh prevents late discard and releases other conversation work',
  async (endpoint) => {
    const readGate = heldDraftRead();
    const { pending: heldModel, release: releaseModel } = heldResponse();
    const model = textModel(async (body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (input.message === 'Beskriv Stolen.') await heldModel;
      return [modelMessage('Stolen finns kvar i utkastet.')];
    });
    const first = await arrange(model.provider, readGate.dispatch);
    await seed(first);
    const second = await conversation();
    await send(first, 'Beskriv Stolen.');
    await expect.poll(() => model.requests.length).toBe(1);
    const current = await read(first);
    readGate.hold();
    const resetting = post(
      first.client,
      `${first.path}/${endpoint}`,
      endpoint === 'new'
        ? { discard: true }
        : {
            revision: current.revision,
            draftVersion: current.review.version,
            contentVersion: current.review.contentVersion,
            requestId: crypto.randomUUID(),
            text: 'Nytt samtal och kasta utkastet.',
          },
    );
    await expect.poll(() => readGate.held).toBe(true);
    const queued = await send(second, 'Beskriv mitt utkast.');
    const stopped = await post(first.client, `${first.path}/cancel`, { all: true });
    expect(stopped.status()).toBe(200);
    expect((await stopped.json()).canceled).toBe(true);
    expect((await completed(second, queued)).modelReply).toBe('Stolen finns kvar i utkastet.');
    readGate.release();
    const superseded = await resetting;
    expect(superseded.status()).toBe(409);
    expect(await superseded.json()).toEqual({ error: 'assistant_turn_changed' });
    expect((await map(first)).draft.changes).toMatchObject([{ id: 'chair' }]);
    const final = await read(first);
    expect(final.canceled).toBe(true);
    expect(final.discarded).not.toBe(true);
    expect(final.reply).toBe('Avbrutet. Föreslagna ändringar ligger kvar i utkastet.');
    releaseModel();
  },
);

test.each(['new reset', 'session end'] as const)(
  '%s retires an older reset before its delayed discard can start',
  async (replacement) => {
    const readGate = heldDraftRead();
    const model = textModel(() => [modelMessage('Stolen finns kvar i utkastet.')]);
    const first = await arrange(model.provider, readGate.dispatch);
    await seed(first);
    await read(first);
    const second = await conversation();
    readGate.hold();
    const resetting = post(first.client, `${first.path}/new`, { discard: true });
    await expect.poll(() => readGate.held).toBe(true);
    const replacing = await post(
      first.client,
      `${first.path}/${replacement === 'new reset' ? 'new' : 'stop'}`,
      {},
    );
    expect(replacing.status()).toBe(200);
    readGate.release();
    const superseded = await resetting;
    expect(superseded.status()).toBe(replacement === 'new reset' ? 409 : 404);
    expect(await superseded.json()).toEqual({
      error: replacement === 'new reset' ? 'assistant_turn_changed' : 'assistant_session_expired',
    });
    expect((await map(second)).draft.changes).toMatchObject([{ id: 'chair' }]);
    expect((await completed(second, await send(second, 'Beskriv mitt utkast.'))).modelReply).toBe(
      'Stolen finns kvar i utkastet.',
    );
  },
);

test('a registered save status result does not revoke a reset waiting for its draft read', async () => {
  const { pending: heldSave, release: releaseSave } = heldResponse();
  const readGate = heldDraftRead();
  let saveHeld = false;
  const model = textModel((body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    return input.message === 'Spara hela utkastet.'
      ? [
          modelTool('save_draft', {
            version: input.draft.version,
            contentVersion: input.draft.contentVersion,
          }),
        ]
      : [modelMessage('Det tidigare sparandet är kontrollerat.')];
  });
  const first = await arrange(model.provider, async (incoming, dispatch) => {
    const rpc = await incoming
      .clone()
      .json()
      .catch(() => null);
    const response = await readGate.dispatch(incoming, dispatch);
    if (rpc?.params?.name === 'prepare_save') {
      saveHeld = true;
      await heldSave;
    }
    return response;
  });
  await seed(first);
  const second = await conversation();
  await send(first, 'Spara hela utkastet.');
  await expect.poll(() => saveHeld).toBe(true);
  const queued = await send(second, 'Beskriv mitt utkast.');
  await read(first);
  readGate.hold();
  const resetting = post(first.client, `${first.path}/new`, { discard: true });
  await expect.poll(() => readGate.held).toBe(true);
  releaseSave();
  expect((await completed(second, queued)).error).toBeUndefined();
  expect((await map(second)).objects).toMatchObject([{ id: 'chair', name: 'Stolen' }]);
  readGate.release();
  const renewed = await resetting;
  expect(renewed.status(), await renewed.text()).toBe(200);
  await expect.poll(async () => (await read(first)).discarded).toBe(true);
  expect((await map(first)).draft.changes).toEqual([]);
  expect((await (await first.client.get(`${base}/map/history`)).json()).history).toHaveLength(1);
});

test('reset rereads the draft when an earlier batch completes during the reset refresh', async () => {
  const { pending: heldModel, release: releaseModel } = heldResponse();
  const readGate = heldDraftRead();
  let typeId = '';
  const model = textModel(async (body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    await heldModel;
    return [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
  });
  const first = await arrange(model.provider, readGate.dispatch);
  typeId = (await map(first)).types[0].id;
  await seed(first);
  const second = await conversation();
  const firstId = await send(first, 'Lägg till Lampan.');
  await expect.poll(() => model.requests.length).toBe(1);
  readGate.hold();
  const resetting = post(second.client, `${second.path}/new`, { discard: true });
  await expect.poll(() => readGate.held).toBe(true);
  releaseModel();
  expect((await completed(first, firstId)).error).toBeUndefined();
  readGate.release();
  expect((await resetting).status()).toBe(200);
  await expect.poll(async () => (await read(second)).phase).not.toBe('working');
  expect((await read(second)).error).toBeUndefined();
  expect((await read(second)).discarded).toBe(true);
  expect((await map(second)).draft.changes).toEqual([]);
});

test.each(['messages', 'new'] as const)(
  '%s reset discards after an earlier conversation batch without invalidating it',
  async (endpoint) => {
    const { pending: held, release } = heldResponse();
    let typeId = '';
    const model = textModel(async (body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      await held;
      return [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
    });
    const first = await arrange(model.provider);
    typeId = (await map(first)).types[0].id;
    await seed(first);
    const second = await conversation();
    const firstId = await send(first, 'Lägg till Lampan.');
    await expect.poll(() => model.requests.length).toBe(1);
    await resetAndDiscard(second, endpoint);
    expect((await map(second)).draft.changes).toMatchObject([{ id: 'chair' }]);
    expect((await read(second)).queuedMessages).toBe(1);
    expect((await read(second)).discarded).not.toBe(true);
    expect((await read(second)).reply).not.toContain('Utkastet är tomt');
    release();
    expect((await completed(first, firstId)).error).toBeUndefined();
    await expect.poll(async () => (await read(second)).phase).toBe('ready');
    expect((await map(second)).draft.changes).toEqual([]);
    expect((await read(second)).discarded).toBe(true);
    expect(model.requests).toHaveLength(1);
  },
);

test.each(['messages', 'new'] as const)(
  '%s reset waits for the registered save outcome before discarding',
  async (endpoint) => {
    const { pending: held, release } = heldResponse();
    const model = textModel((body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      return [
        modelTool('save_draft', {
          version: input.draft.version,
          contentVersion: input.draft.contentVersion,
        }),
      ];
    });
    const first = await arrange(model.provider, async (incoming, dispatch) => {
      const rpc = await incoming
        .clone()
        .json()
        .catch(() => null);
      const response = await dispatch(incoming);
      if (rpc?.params?.name === 'prepare_save') await held;
      return response;
    });
    await seed(first);
    const second = await conversation();
    await send(first, 'Spara hela utkastet.');
    await expect.poll(async () => (await read(first)).saving).toBe(true);
    const registered = (await read(first)).operations[0];
    await resetAndDiscard(second, endpoint);
    expect((await read(second)).queuedMessages).toBe(1);
    expect((await read(second)).discarded).not.toBe(true);
    expect((await map(second)).draft.changes).toHaveLength(1);
    expect((await post(first.client, `${first.path}/cancel`, { all: true })).status()).toBe(200);
    await expect.poll(async () => (await read(second)).discarded).toBe(true);
    expect((await read(first)).receipt?.operationId).toBe(registered.operationId);
    expect((await map(second)).objects).toMatchObject([{ id: 'chair', name: 'Stolen' }]);
    expect((await map(second)).draft.changes).toEqual([]);
    expect((await (await first.client.get(`${base}/map/history`)).json()).history).toMatchObject([
      { operationId: registered.operationId },
    ]);
    release();
    expect(model.requests).toHaveLength(1);
  },
);

test.each(['messages', 'new'] as const)(
  'stopping a queued %s reset preserves the earlier batch and other conversation queue',
  async (endpoint) => {
    const { pending: held, release } = heldResponse();
    let typeId = '';
    const model = textModel(async (body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      if (input.message === 'Beskriv mitt utkast.')
        return [modelMessage('Båda förslagen finns kvar.')];
      await held;
      return [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
    });
    const first = await arrange(model.provider);
    typeId = (await map(first)).types[0].id;
    await seed(first);
    const second = await conversation();
    const third = await conversation();
    const firstId = await send(first, 'Lägg till Lampan.');
    await expect.poll(() => model.requests.length).toBe(1);
    await resetAndDiscard(second, endpoint);
    const thirdId = await send(third, 'Beskriv mitt utkast.');
    expect((await post(second.client, `${second.path}/cancel`, { all: true })).status()).toBe(200);
    expect((await read(second)).tasks).toMatchObject([{ status: 'canceled' }]);
    expect((await read(third)).queuedMessages).toBe(1);
    release();
    expect((await completed(first, firstId)).error).toBeUndefined();
    expect((await completed(third, thirdId)).modelReply).toBe('Båda förslagen finns kvar.');
    expect((await read(second)).discarded).not.toBe(true);
    expect((await map(third)).draft.changes).toMatchObject([{ id: 'chair' }, { id: 'lamp' }]);
    expect(model.requests).toHaveLength(2);
  },
);

test('two devices serialize their conversations against one draft and dequeue current data', async () => {
  const { pending: held, release } = heldResponse();
  let typeId = '';
  let secondDraft: TextAssistantView['review'] | undefined;
  const model = textModel(async (body) => {
    const previous = lastToolResult(body);
    if (previous?.review) return [modelMessage('Utkastet är uppdaterat.')];
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (input.message === 'Lägg till Stolen.') await held;
    else {
      if (!previous) return [modelTool('read_my_draft', {})];
      secondDraft = previous;
    }
    return [
      proposeObject(
        previous ?? input.draft,
        input.message === 'Lägg till Stolen.' ? 'chair' : 'lamp',
        {
          typeId,
          name: input.message === 'Lägg till Stolen.' ? 'Stolen' : 'Lampan',
        },
      ),
    ];
  });
  const first = await arrange(model.provider);
  typeId = (await map(first)).types[0].id;
  const second = await conversation();
  const firstId = await send(first, 'Lägg till Stolen.');
  await expect.poll(() => model.requests.length).toBe(1);
  const secondId = await send(second, 'Lägg till Lampan.');
  expect(await read(second)).toMatchObject({ queuedMessages: 1 });
  expect(model.requests).toHaveLength(1);
  release();
  await completed(first, firstId);
  await completed(second, secondId);
  expect((await map(first)).draft.changes).toMatchObject([
    { id: 'chair', after: { name: 'Stolen' } },
    { id: 'lamp', after: { name: 'Lampan' } },
  ]);
  expect(secondDraft?.changes).toMatchObject([{ id: 'chair', after: { name: 'Stolen' } }]);
  expect((await read(first)).completedReplies?.map((reply) => reply.request)).toEqual([
    'Lägg till Stolen.',
  ]);
});

test('new input in another conversation revokes a save before registration', async () => {
  let release!: (output: unknown[]) => void;
  const held = new Promise<unknown[]>((resolve) => {
    release = resolve;
    releases.push(() => resolve([modelMessage('Avbrutet prov.')]));
  });
  const model = textModel((body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    return input.message === 'Spara hela utkastet.'
      ? held
      : [modelMessage('Stolen ligger kvar i ditt utkast.')];
  });
  const first = await arrange(model.provider);
  await seed(first);
  const second = await conversation();
  const firstId = await send(first, 'Spara hela utkastet.');
  await expect.poll(() => model.requests.length).toBe(1);
  const secondId = await send(second, 'Beskriv mitt utkast.');
  release([modelTool('save_draft', { version: 1, contentVersion: 1 })]);
  await completed(first, firstId);
  await completed(second, secondId);
  const history = await (await first.client.get(`${base}/map/history`)).json();
  expect(history.history).toEqual([]);
  expect((await map(first)).draft.changes).toMatchObject([
    { id: 'chair', after: { name: 'Stolen' } },
  ]);
  expect((await read(first)).operations).toEqual([]);
  expect((await read(first)).receipt).toBeUndefined();
  expect((await read(first)).phase).not.toBe('recovery');
  expect((await read(first)).reply).toContain('Be om sparande igen');
});

test('stopping one conversation releases other devices and preserves completed batches', async () => {
  const { pending: held, release } = heldResponse();
  let typeId = '';
  const model = textModel(async (body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (input.message === 'Lägg till Lampan.') await held;
    const [id, name] =
      input.message === 'Lägg till Stolen.'
        ? ['chair', 'Stolen']
        : input.message === 'Lägg till Lampan.'
          ? ['lamp', 'Lampan']
          : ['table', 'Bordet'];
    return [proposeObject(input.draft, id, { typeId, name })];
  });
  const first = await arrange(model.provider);
  typeId = (await map(first)).types[0].id;
  await completed(first, await send(first, 'Lägg till Stolen.'));
  const second = await conversation();
  const stoppedId = await send(first, 'Lägg till Lampan.');
  await expect.poll(() => model.requests.length).toBe(2);
  const canceledId = await send(first, 'Gör inte det köade uppdraget.');
  const otherId = await send(second, 'Lägg till Bordet.');
  const response = await post(first.client, `${first.path}/cancel`, { all: true });
  expect(response.status()).toBe(200);
  await completed(second, otherId);
  expect(
    (await read(first)).tasks?.filter((task) => [stoppedId, canceledId].includes(task.id)),
  ).toEqual([
    expect.objectContaining({ id: stoppedId, status: 'canceled' }),
    expect.objectContaining({ id: canceledId, status: 'canceled' }),
  ]);
  release();
  await expect.poll(() => model.requests.length).toBe(3);
  expect((await map(first)).draft.changes).toMatchObject([
    { id: 'chair', after: { name: 'Stolen' } },
    { id: 'table', after: { name: 'Bordet' } },
  ]);
  expect((await map(first)).draft.changes.some((change) => change.id === 'lamp')).toBe(false);
});

test('a stopped registered save is checked before another conversation can mutate the draft', async () => {
  const { pending: held, release } = heldResponse();
  let typeId = '';
  const model = textModel((body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (input.message === 'Spara hela utkastet.')
      return [modelTool('save_draft', { version: input.draft.version, contentVersion: 1 })];
    return [proposeObject(input.draft, 'lamp', { typeId, name: 'Lampan' })];
  });
  const first = await arrange(model.provider, async (incoming, dispatch) => {
    const rpc = await incoming
      .clone()
      .json()
      .catch(() => null);
    const response = await dispatch(incoming);
    if (rpc?.params?.name === 'prepare_save') await held;
    return response;
  });
  typeId = (await map(first)).types[0].id;
  await seed(first);
  const second = await conversation();
  await send(first, 'Spara hela utkastet.');
  await expect.poll(async () => (await read(first)).saving).toBe(true);
  const registered = (await read(first)).operations[0];
  const secondId = await send(second, 'Lägg till Lampan.');
  expect((await post(first.client, `${first.path}/cancel`, { all: true })).status()).toBe(200);
  await completed(second, secondId);
  expect((await read(first)).receipt?.operationId).toBe(registered.operationId);
  release();
  const state = await map(second);
  expect(state.objects).toMatchObject([{ id: 'chair', name: 'Stolen' }]);
  expect(state.draft.changes).toMatchObject([{ id: 'lamp', after: { name: 'Lampan' } }]);
  const history = await (await second.client.get(`${base}/map/history`)).json();
  expect(history.history).toMatchObject([{ operationId: registered.operationId }]);
  expect((await read(second)).operations).toHaveLength(1);
});

test('an older queued save cannot regain authority when its turn starts', async () => {
  const { pending: held, release } = heldResponse();
  const model = textModel(async (body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (input.message === 'Förklara.') await held;
    return input.message === 'Spara hela utkastet.'
      ? [modelTool('save_draft', { version: input.draft.version, contentVersion: 1 })]
      : [modelMessage('Utkastet är oförändrat.')];
  });
  const first = await arrange(model.provider);
  await seed(first);
  await send(first, 'Förklara.');
  await expect.poll(() => model.requests.length).toBe(1);
  const oldSave = await send(first, 'Spara hela utkastet.');
  const newer = await send(first, 'Beskriv mitt utkast.');
  release();
  await completed(first, newer);
  expect((await completed(first, oldSave)).requiredNotice).toContain('Be om sparande igen');
  expect((await (await first.client.get(`${base}/map/history`)).json()).history).toEqual([]);
  expect((await map(first)).draft.changes).toHaveLength(1);
  const saved = await completed(first, await send(first, 'Spara hela utkastet.'));
  expect(saved.receipt).toBeDefined();
  expect((await (await first.client.get(`${base}/map/history`)).json()).history).toHaveLength(1);
});

test('another user and another household do not wait for or receive the occupied draft', async () => {
  const { pending: held, release } = heldResponse();
  const model = textModel(async (body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (input.message === 'Håll min kö.') await held;
    return [modelMessage('Läsningen är klar.')];
  });
  const first = await arrange(model.provider);
  await seed(first);
  const { user } = await (await first.client.get(`${app.origin}/api/bootstrap`)).json();
  const anotherId = crypto.randomUUID();
  app.seedMembership(user.id, anotherId, 'Ett annat hushåll');
  const elsewhere = await conversation(first.client, `${app.origin}/api/households/${anotherId}`);
  const otherClient = await request.newContext();
  clients.push(otherClient);
  app.setIdentity(robin);
  await signIn(otherClient, app.origin, 'microsoft');
  const { user: otherUser } = await (await otherClient.get(`${app.origin}/api/bootstrap`)).json();
  const invitation = await post(first.client, `${base}/invitations`, { userId: otherUser.id });
  expect(invitation.status()).toBe(201);
  const accepted = await post(otherClient, `${app.origin}/api/invitations/accept`, {
    code: (await invitation.json()).code,
  });
  expect(accepted.status()).toBe(200);
  const otherUserConversation = await conversation(otherClient);
  const occupied = await send(first, 'Håll min kö.');
  await expect.poll(() => model.requests.length).toBe(1);
  await completed(elsewhere, await send(elsewhere, 'Läs det andra hushållet.'));
  await completed(
    otherUserConversation,
    await send(otherUserConversation, 'Läs mitt eget utkast.'),
  );
  expect((await read(first)).tasks).toContainEqual(
    expect.objectContaining({ id: occupied, status: 'working' }),
  );
  expect((await map(elsewhere)).draft.changes).toEqual([]);
  expect((await map(otherUserConversation)).draft.changes).toEqual([]);
  for (const body of model.requests.slice(1)) {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    expect(input.draft.changes).toEqual([]);
  }
  release();
  await completed(first, occupied);
  expect((await map(first)).draft.changes).toMatchObject([
    { id: 'chair', after: { name: 'Stolen' } },
  ]);
});

test('stop after the atomic batch commits reports the actual retained draft without undo', async () => {
  const { pending: held, release } = heldResponse();
  let typeId = '';
  const model = textModel((body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    return [
      proposeObject({ version: input.draft.version, contentVersion: 1 }, 'lamp', {
        typeId,
        name: 'Lampan',
      }),
    ];
  });
  const first = await arrange(model.provider, async (incoming, dispatch) => {
    const rpc = await incoming
      .clone()
      .json()
      .catch(() => null);
    const response = await dispatch(incoming);
    if (rpc?.params?.name === 'apply_draft_batch') await held;
    return response;
  });
  typeId = (await map(first)).types[0].id;
  await send(first, 'Lägg till Lampan.');
  await expect.poll(async () => (await map(first)).draft.changes.length).toBe(1);
  const response = await post(first.client, `${first.path}/cancel`, { all: true });
  expect(response.status()).toBe(200);
  const stopped: TextAssistantView = await response.json();
  expect(stopped.review.changes).toMatchObject([{ id: 'lamp', after: { name: 'Lampan' } }]);
  expect(stopped.reply).toContain('ligger kvar i utkastet');
  expect(stopped.receipt).toBeUndefined();
  release();
  expect((await map(first)).draft).toMatchObject({ version: 1, changes: [{ id: 'lamp' }] });
  expect((await (await first.client.get(`${base}/map/history`)).json()).history).toEqual([]);
});

test('a queued save includes a verified predecessor batch in another conversation', async () => {
  const { pending: held, release } = heldResponse();
  let typeId = '';
  const model = textModel(async (body) => {
    const input = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (input.message === 'Spara hela utkastet.')
      return [modelTool('save_draft', { version: input.draft.version, contentVersion: 1 })];
    await held;
    return [
      proposeObject({ version: input.draft.version, contentVersion: 1 }, 'chair', {
        typeId,
        name: 'Stolen',
      }),
    ];
  });
  const first = await arrange(model.provider);
  typeId = (await map(first)).types[0].id;
  const second = await conversation();
  await send(first, 'Lägg till Stolen.');
  await expect.poll(() => model.requests.length).toBe(1);
  const saveId = await send(second, 'Spara hela utkastet.');
  release();
  const saved = await completed(second, saveId);
  expect(saved.receipt).toBeDefined();
  expect((await map(second)).objects).toMatchObject([{ id: 'chair', name: 'Stolen' }]);
  expect((await map(second)).draft.changes).toEqual([]);
  expect((await (await second.client.get(`${base}/map/history`)).json()).history).toHaveLength(1);
});
