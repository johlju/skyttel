import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation, robin } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { advanceActiveLogin } from '../../support/session-time.js';
import { lastToolResult, modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
afterEach(async () => {
  vi.useRealTimers();
  await client?.dispose();
  await app?.close();
});

let time: number;
let path: string;
let assistant: {
  id: string;
  revision: number;
  review: { version: number; contentVersion: number };
};
let live: ReturnType<typeof liveProvider>;
let providerId: string;
async function setup(
  model: ReturnType<typeof textModel>,
  remaining = 1000,
  external: Pick<
    NonNullable<Parameters<typeof createInstallation>[1]>,
    'assistantDispatch' | 'liveFetch' | 'liveSideband' | 'liveProfile' | 'liveUsage'
  > = {},
) {
  time = Date.now();
  live = liveProvider();
  app = await createInstallation(undefined, {
    now: () => time,
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
    ...external,
  });
  client = await request.newContext();
  await signIn(client, app.origin);
  const { household } = await (await createHousehold(client, app.origin)).json();
  path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const state = await (await client.get(path.replace(/text-assistant$/, 'map'))).json();
  const proposed = await client.post(path.replace(/text-assistant$/, 'map/draft'), {
    headers: { origin: app.origin },
    data: {
      version: state.draft.version,
      contentVersion: state.contentVersion,
      id: 'retained',
      baseRevision: null,
      value: { typeId: state.types[0].id, name: 'Bevarat förslag', description: '' },
    },
  });
  expect(proposed.status(), await proposed.text()).toBe(200);
  // Start just before the absolute server deadline. Provider offsets and the
  // browser clock cannot move this server-owned boundary.
  await advanceActiveLogin(client, app.origin, 8 * 60 * 60_000 - remaining, (elapsed) => {
    time += elapsed;
  });
  const started = await client.post(path, {
    headers: { origin: app.origin },
    data: approvedForVisit,
  });
  expect(started.status(), await started.text()).toBe(201);
  assistant = await started.json();
}
async function connect() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const connected = await client.post(`${path}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: {
      sdp: 'synthetic-offer',
      revision: assistant.revision,
      draftVersion: assistant.review.version,
      contentVersion: assistant.review.contentVersion,
    },
  });
  expect(connected.status(), await connected.text()).toBe(201);
  providerId = [...live.channels.keys()][0];
}
async function advance(milliseconds: number) {
  time += milliseconds;
  await vi.advanceTimersByTimeAsync(milliseconds);
}
function speak(delta: string) {
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta,
    start_ms: 0,
    end_ms: 1,
  });
  live.emit(providerId, {
    type: 'session.delegation.created',
    delegation: { id: crypto.randomUUID(), target: 'client' },
    offset_ms: 1,
  });
}

test('Live stops at the exact server deadline without a poll and rejects late fragments', async () => {
  const model = textModel(() => [modelMessage('Ska inte köras.')]);
  await setup(model);
  await connect();
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'unfinished-save',
    delta: 'Spara',
    start_ms: 0,
    end_ms: 1,
  });
  live.emit(providerId, {
    type: 'session.delegation.created',
    delegation: { id: 'early-delegation', target: 'client' },
    offset_ms: 1,
  });
  await advance(999);
  expect(live.sent.some(({ event }) => event.type === 'session.close')).toBe(false);
  await advance(1);
  expect(live.sent.some(({ event }) => event.type === 'session.close')).toBe(true);
  expect(live.channels.size).toBe(0);
  live.emit(providerId, {
    type: 'session.input_transcript.delta',
    event_id: 'late-negation',
    delta: ' inte. Spara allt.',
    start_ms: 1,
    end_ms: 1,
  });
  await vi.advanceTimersByTimeAsync(2100);
  expect(model.requests).toEqual([]);
});

test.each(['discard_draft', 'save_draft'])(
  'expiry aborts active Live work and its queued voice instruction before a late %s result can mutate the retained draft',
  async (tool) => {
    let release!: (output: unknown[]) => void;
    let signal: AbortSignal | null | undefined;
    const model = textModel((_body, incomingSignal) => {
      signal = incomingSignal;
      return new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
    });
    await setup(model, 5000);
    const mapPath = path.replace(/text-assistant$/, 'map');
    const before = await (await client.get(mapPath)).json();
    await connect();
    speak(tool === 'save_draft' ? 'Spara hela utkastet.' : 'Kasta hela utkastet.');
    await advance(2000);
    await vi.waitFor(() => expect(model.requests).toHaveLength(1));
    const working = await (await client.get(`${path}/${assistant.id}`)).json();
    const queued = await client.post(`${path}/${assistant.id}/messages`, {
      headers: { origin: app.origin },
      data: {
        revision: working.revision,
        draftVersion: working.review.version,
        contentVersion: working.review.contentVersion,
        requestId: 'queued-voice',
        text: 'Spara hela utkastet.',
        voiceContext: '[]',
      },
    });
    expect(queued.status(), await queued.text()).toBe(202);
    await advance(3000);
    expect(signal?.aborted).toBe(true);
    expect(live.channels.size).toBe(0);
    release([
      modelTool(tool, {
        version: before.draft.version,
        contentVersion: before.contentVersion,
      }),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
    expect((await client.get(mapPath)).status()).toBe(401);
    await signIn(client, app.origin);
    expect(await (await client.get(mapPath)).json()).toEqual(before);
    expect(await (await client.get(`${mapPath}/operations`)).json()).toEqual({ operations: [] });
    expect(model.requests).toHaveLength(1);
    await app.restart();
    expect(await (await client.get(mapPath)).json()).toEqual(before);
    expect(model.requests).toHaveLength(1);
  },
);

test.each(['logout', 'consent', 'replacement'])(
  '%s stops a quiet Live connection immediately without its next poll',
  async (reason) => {
    const model = textModel(() => [modelMessage('Ska inte köras.')]);
    await setup(model, 60_000);
    await connect();
    vi.useRealTimers();
    if (reason === 'logout') {
      const response = await client.post(`${app.origin}/api/auth/sign-out`, {
        headers: { origin: app.origin },
        data: {},
      });
      expect(response.ok()).toBe(true);
    } else if (reason === 'replacement') {
      await signIn(client, app.origin);
    } else {
      const response = await client.post(
        path.replace(/text-assistant$/, 'conversation-consent/revoke'),
        {
          headers: { origin: app.origin },
          data: {},
        },
      );
      expect(response.ok(), await response.text()).toBe(true);
    }
    expect(live.sent.some(({ event }) => event.type === 'session.close')).toBe(true);
    expect(live.channels.size).toBe(0);
    expect(model.requests).toEqual([]);
  },
);

test('a pending provider connection is aborted at expiry before Live startup can install work', async () => {
  let entered!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signal: AbortSignal | null | undefined;
  const model = textModel(() => [modelMessage('Ska inte köras.')]);
  await setup(model, 1000, {
    liveFetch: async (input, init) => {
      signal = init?.signal;
      entered();
      await held;
      return live.provider(input, init);
    },
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const connecting = client.post(`${path}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: {
      sdp: 'synthetic-offer',
      revision: assistant.revision,
      draftVersion: assistant.review.version,
      contentVersion: assistant.review.contentVersion,
    },
  });
  try {
    await reached;
    await advance(999);
    expect(signal?.aborted).toBe(false);
    await advance(1);
    expect(signal?.aborted).toBe(true);
  } finally {
    release();
    vi.useRealTimers();
  }
  const refused = await connecting;
  expect(refused.status(), await refused.text()).toBe(401);
  expect(await refused.json()).toMatchObject({ error: 'voice_session_expired' });
  expect(live.channels.size).toBe(0);
  expect(model.requests).toEqual([]);
});

test('the synchronous domain guard rejects a voice mutation at expiry even before its timer runs', async () => {
  let crossed = false;
  const model = textModel(() => [modelTool('discard_draft', { version: 1, contentVersion: 1 })]);
  await setup(model, 5000, {
    assistantDispatch: async (incoming, dispatch) => {
      const rpc =
        incoming.method === 'POST' && new URL(incoming.url).pathname === '/mcp'
          ? await incoming.clone().json()
          : null;
      if (rpc?.params?.name === 'discard_draft') {
        // Move server time between the task's preflight and the actual domain
        // transaction, without running the active deadline timer.
        time += 3000;
        crossed = true;
      }
      return dispatch(incoming);
    },
  });
  const mapPath = path.replace(/text-assistant$/, 'map');
  const before = await (await client.get(mapPath)).json();
  await connect();
  speak('Kasta hela utkastet.');
  await advance(2000);
  await vi.waitFor(() => expect(crossed).toBe(true));
  expect(live.channels.size).toBe(0);
  vi.useRealTimers();
  await signIn(client, app.origin);
  expect(await (await client.get(mapPath)).json()).toEqual(before);
  expect(await (await client.get(`${mapPath}/operations`)).json()).toEqual({ operations: [] });
});

test('a committed save receipt survives a late negation, fresh login and restart without replay', async () => {
  const model = textModel(() => [modelMessage('Ska inte köras.')]);
  await setup(model);
  const mapPath = path.replace(/text-assistant$/, 'map');
  const proposed = await (await client.get(mapPath)).json();
  const saved = await client.post(`${mapPath}/save`, {
    headers: { origin: app.origin },
    data: {
      version: proposed.draft.version,
      contentVersion: proposed.contentVersion,
      operationId: 'committed-before-expiry',
    },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  const { receipt } = await saved.json();
  const before = await (await client.get(mapPath)).json();
  assistant = await (await client.get(`${path}/${assistant.id}`)).json();
  await connect();
  speak('Spara');
  await advance(1000);
  speak(' inte. Spara allt.');
  await vi.advanceTimersByTimeAsync(2100);
  vi.useRealTimers();
  await signIn(client, app.origin);
  client = await restartWithSession(client, () => app.restart());
  expect(await (await client.get(mapPath)).json()).toEqual(before);
  expect(
    await (await client.get(`${mapPath}/operations/committed-before-expiry`)).json(),
  ).toMatchObject({ operation: { status: 'succeeded', receipt } });
  expect(model.requests).toEqual([]);
});

test('removing membership through another administrator stops quiet Live without its next poll', async () => {
  const model = textModel(() => [modelMessage('Ska inte köras.')]);
  await setup(model, 60_000);
  const other = await request.newContext();
  try {
    const { user: alex } = await (await client.get(`${app.origin}/api/bootstrap`)).json();
    app.setIdentity(robin);
    await signIn(other, app.origin, 'microsoft');
    const { user } = await (await other.get(`${app.origin}/api/bootstrap`)).json();
    const householdPath = path.replace(/\/text-assistant$/, '');
    const issued = await client.post(`${householdPath}/invitations`, {
      headers: { origin: app.origin },
      data: { userId: user.id },
    });
    expect(issued.ok(), await issued.text()).toBe(true);
    const accepted = await other.post(`${app.origin}/api/invitations/accept`, {
      headers: { origin: app.origin },
      data: { code: (await issued.json()).code },
    });
    expect(accepted.ok(), await accepted.text()).toBe(true);
    const promoted = await client.post(`${householdPath}/members/${user.id}/role`, {
      headers: { origin: app.origin },
      data: { role: 'administrator' },
    });
    expect(promoted.ok(), await promoted.text()).toBe(true);
    await connect();
    vi.useRealTimers();
    const revoked = await other.post(`${householdPath}/members/${alex.id}/revoke`, {
      headers: { origin: app.origin },
      data: {},
    });
    expect(revoked.ok(), await revoked.text()).toBe(true);
    expect(live.channels.size).toBe(0);
    expect(live.sent.some(({ event }) => event.type === 'session.close')).toBe(true);
    expect(model.requests).toEqual([]);
  } finally {
    await other.dispose();
  }
});

test('expiry queues close for a connecting sideband and never returns an admitted voice after it opens', async () => {
  let entered!: () => void;
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const model = textModel(() => [modelMessage('Ska inte köras.')]);
  await setup(model, 1000, {
    liveSideband: (provider, id) => {
      const channel = live.attach(provider, id);
      Object.assign(channel.socket, { readyState: 0 });
      entered();
      return channel;
    },
  });
  live.configure({ finalize: false });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const connecting = client.post(`${path}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: {
      sdp: 'synthetic-offer',
      revision: assistant.revision,
      draftVersion: assistant.review.version,
      contentVersion: assistant.review.contentVersion,
    },
  });
  await reached;
  const id = [...live.channels.keys()][0];
  await advance(1000);
  expect(live.sent.some(({ event }) => event.type === 'session.close')).toBe(true);
  // Local rights have ended. Keep the SDK's pending close available until
  // opening rather than dropping its queue; the same two-second cap applies.
  expect(live.channels.size).toBe(1);
  const socket = live.sockets.get(id);
  Object.assign(socket ?? {}, { readyState: 1 });
  socket?.emit('open');
  const refused = await connecting;
  expect(refused.status(), await refused.text()).toBe(401);
  expect(await refused.json()).toMatchObject({ error: 'voice_session_expired' });
  expect(live.channels.size).toBe(0);
  expect(model.requests).toEqual([]);
});

test('the Live expiry timer retires its voice task while an already accepted text instruction can finish', async () => {
  let release!: (output: unknown[]) => void;
  let typeId = '';
  const model = textModel((body) => {
    const turn = JSON.parse(String(body.input.findLast((item) => item.role === 'user')?.content));
    if (turn.message === 'Beskriv lampan.')
      return new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
    if (lastToolResult(body)) return [modelMessage('Förslaget finns i ditt utkast.')];
    return [
      modelTool('propose_object', {
        version: 1,
        contentVersion: 1,
        id: 'accepted-text',
        baseRevision: null,
        value: { typeId, name: 'Tillåtet textförslag', description: '' },
      }),
    ];
  });
  await setup(model, 5000);
  const mapPath = path.replace(/text-assistant$/, 'map');
  const before = await (await client.get(mapPath)).json();
  typeId = before.types[0].id;
  await connect();
  speak('Beskriv lampan.');
  await advance(2000);
  await vi.waitFor(() => expect(model.requests).toHaveLength(1));
  const working = await (await client.get(`${path}/${assistant.id}`)).json();
  const queued = await client.post(`${path}/${assistant.id}/messages`, {
    headers: { origin: app.origin },
    data: {
      revision: working.revision,
      draftVersion: working.review.version,
      contentVersion: working.review.contentVersion,
      requestId: 'accepted-text',
      text: 'Lägg till ett textförslag utan att spara.',
    },
  });
  expect(queued.status(), await queued.text()).toBe(202);
  await advance(3000);
  expect(live.channels.size).toBe(0);
  await vi.waitFor(() => expect(model.requests).toHaveLength(3));
  release([modelMessage('Det sena röstsvar som inte ska återupplivas.')]);
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  await signIn(client, app.origin);
  const after = await (await client.get(mapPath)).json();
  expect(after.draft.changes.map((change: { id: string }) => change.id).sort()).toEqual([
    'accepted-text',
    'retained',
  ]);
  expect(await (await client.get(`${mapPath}/operations`)).json()).toEqual({ operations: [] });
});

test('voice context preparation aborts its own provider summary at the login deadline before creating new Live work', async () => {
  let release!: (output: unknown[]) => void;
  let signal: AbortSignal | null | undefined;
  const model = textModel((_body, incomingSignal) => {
    signal = incomingSignal;
    return new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
  });
  await setup(model, 1000, {
    liveProfile: { provider: 'openai', model: 'gpt-live-1', tokens: 600 },
  });
  await connect();
  live.emit(providerId, {
    type: 'session.output_transcript.delta',
    event_id: 'long-context',
    delta: 'Tidigare samtal. '.repeat(200),
    start_ms: 0,
    end_ms: 1,
  });
  const current = await (await client.get(`${path}/${assistant.id}`)).json();
  const connecting = client.post(`${path}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: {
      sdp: 'synthetic-offer',
      revision: current.revision,
      draftVersion: current.review.version,
      contentVersion: current.review.contentVersion,
    },
  });
  await vi.waitFor(() => expect(model.requests).toHaveLength(1));
  let refused: Awaited<typeof connecting>;
  try {
    await advance(1000);
    expect(signal?.aborted).toBe(true);
  } finally {
    release([modelMessage('En sen sammanfattning.')]);
    refused = await connecting;
  }
  expect(refused.status(), await refused.text()).toBe(401);
  expect(await refused.json()).toMatchObject({ error: 'voice_session_expired' });
  expect(live.requests).toHaveLength(1);
  expect(live.channels.size).toBe(0);
});

test('rejected voice context preparation preserves its summary error and ends the usage attempt before Live creation', async () => {
  const attempts: { outcome: string; endedAt: string | null }[] = [];
  const model = textModel(() => []);
  await setup(model, 60_000, {
    liveProfile: { provider: 'openai', model: 'gpt-live-1', tokens: 600 },
    liveUsage: (attempt) => attempts.push({ outcome: attempt.outcome, endedAt: attempt.endedAt }),
  });
  await connect();
  live.emit(providerId, {
    type: 'session.output_transcript.delta',
    event_id: 'long-context',
    delta: 'Tidigare samtal. '.repeat(200),
    start_ms: 0,
    end_ms: 1,
  });
  const current = await (await client.get(`${path}/${assistant.id}`)).json();
  const refused = await client.post(`${path}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: {
      sdp: 'synthetic-offer',
      revision: current.revision,
      draftVersion: current.review.version,
      contentVersion: current.review.contentVersion,
    },
  });
  expect(refused.status(), await refused.text()).toBe(409);
  expect(await refused.json()).toEqual({ error: 'assistant_context_summary_failed' });
  expect(live.requests).toHaveLength(1);
  expect(attempts.at(-1)).toMatchObject({ outcome: 'failed', endedAt: expect.any(String) });
});
