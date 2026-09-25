import { randomUUID } from 'node:crypto';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import type { LiveUsage, LiveUsageAttempt } from '../../../src/server/live-provider.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation, robin } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
const clients: APIRequestContext[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.dispose()));
  await browser?.dispose();
  await app?.close();
});

async function setup(
  modelFetch = textModel(() => [modelMessage('Ett provsvar.')]).provider,
  reportUsage?: LiveUsage,
) {
  const live = liveProvider();
  const usage: LiveUsageAttempt[] = [];
  app = await createInstallation(undefined, {
    modelFetch,
    liveFetch: live.provider,
    liveSideband: live.attach,
    liveUsage: (attempt) => {
      usage.push(attempt);
      reportUsage?.(attempt);
    },
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const householdPath = `${app.origin}/api/households/${household.id}`;
  const path = `${householdPath}/text-assistant`;
  async function start() {
    const consent = await browser.post(path, {
      headers: { origin: app.origin },
      data: { externalAi: true, mapWork: true },
    });
    expect(consent.status(), await consent.text()).toBe(201);
    const assistant: TextAssistantView = await consent.json();
    const startBody = {
      sdp: 'synthetic-offer',
      revision: assistant.revision,
      draftVersion: assistant.review.version,
      contentVersion: assistant.review.contentVersion,
    };
    const startPath = `${path}/${assistant.id}/voice`;
    const response = await browser.post(startPath, {
      headers: { origin: app.origin },
      data: startBody,
    });
    expect(response.status(), await response.text()).toBe(201);
    const { voice } = await response.json();
    const voicePath = `${startPath}/${voice.id}`;
    const attachedId = [...live.channels.keys()].at(-1);
    if (!attachedId) throw new Error('The successful voice start did not attach its provider');
    const providerId = attachedId;
    const post = (action: string, data: unknown = {}) =>
      browser.post(`${voicePath}/${action}`, { headers: { origin: app.origin }, data });
    async function poll() {
      const response = await post('poll', startBody);
      expect(response.status(), await response.text()).toBe(200);
      return response.json();
    }
    function delegate(text: string) {
      live.emit(providerId, {
        type: 'session.input_transcript.delta',
        event_id: randomUUID(),
        delta: text,
        start_ms: 0,
        end_ms: 100,
      });
      live.emit(providerId, {
        type: 'session.delegation.created',
        event_id: randomUUID(),
        offset_ms: 100,
        delegation: { id: randomUUID(), type: 'delegation', target: 'client' },
      });
    }
    return { assistant, startBody, startPath, voicePath, providerId, post, poll, delegate };
  }
  return { live, usage, householdPath, path, start };
}

async function proposal(householdPath: string, id = 'retained-draft') {
  const map = await (await browser.get(`${householdPath}/map`)).json();
  const value = { typeId: map.types[0].id, name: id, description: 'Privat syntetiskt utkast' };
  const response = await browser.post(`${householdPath}/map/draft`, {
    headers: { origin: app.origin },
    data: {
      version: map.draft.version,
      contentVersion: map.contentVersion,
      id,
      baseRevision: null,
      value,
    },
  });
  expect(response.status(), await response.text()).toBe(200);
  return value;
}

test.each([true, false])(
  'cumulative voice usage remains 15 seconds, with final confirmation only when closure arrives: %s',
  async (finalize) => {
    const scene = await setup();
    const voice = await scene.start();
    scene.live.configure({ finalize, seconds: 15 });
    for (const seconds of [12, 15, 15]) {
      scene.live.emit(voice.providerId, {
        type: 'session.usage.updated',
        event_id: randomUUID(),
        usage: { seconds },
      });
    }
    expect((await voice.poll()).voice).toMatchObject({ seconds: 15, usageFinal: false });
    const stopped = await voice.post('stop');
    expect(stopped.status(), await stopped.text()).toBe(200);
    expect((await stopped.json()).voice).toMatchObject({
      phase: 'closed',
      seconds: 15,
      usageFinal: finalize,
    });
    expect(scene.usage[0]).toMatchObject({ seconds: null, final: false, outcome: 'starting' });
    expect(scene.usage.at(-1)).toMatchObject({
      seconds: 15,
      final: finalize,
      outcome: finalize ? 'closed' : 'interrupted',
      endedAt: expect.any(String),
    });
    expect(new Set(scene.usage.map((attempt) => attempt.attemptId)).size).toBe(1);
    expect(JSON.stringify(scene.usage)).not.toMatch(
      /synthetic-offer|synthetic-answer|Bearer|token/,
    );
    expect(scene.live.channels.size).toBe(0);
  },
);

test('malformed and decreasing provider usage cannot replace known duration, and a different session cannot finalize it', async () => {
  const scene = await setup();
  const voice = await scene.start();
  scene.live.emit(voice.providerId, {
    type: 'session.usage.updated',
    event_id: randomUUID(),
    usage: { seconds: 12 },
  });
  for (const seconds of [
    undefined,
    null,
    -1,
    Number.NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '15',
    9,
  ]) {
    scene.live.emit(voice.providerId, {
      type: 'session.usage.updated',
      event_id: randomUUID(),
      usage: { seconds },
    });
    expect((await voice.poll()).voice).toMatchObject({
      phase: 'listening',
      seconds: 12,
      usageFinal: false,
    });
  }
  scene.live.emit(voice.providerId, {
    type: 'session.usage.updated',
    event_id: randomUUID(),
  });
  scene.live.emit(voice.providerId, {
    type: 'session.closed',
    event_id: randomUUID(),
    usage: { seconds: 99 },
  });
  scene.live.emit(voice.providerId, {
    type: 'session.closed',
    event_id: randomUUID(),
    session: { id: 'other-provider-session' },
    usage: { seconds: 99 },
  });
  expect((await voice.poll()).voice).toMatchObject({
    phase: 'listening',
    seconds: 12,
    usageFinal: false,
  });
  scene.live.configure({ seconds: 15 });
  expect((await (await voice.post('stop')).json()).voice).toMatchObject({
    phase: 'closed',
    seconds: 15,
    usageFinal: true,
  });
  expect(scene.usage.at(-1)).toMatchObject({ seconds: 15, final: true, outcome: 'closed' });
});

test.each([
  ['missing', undefined],
  ['unrepresentable', Number.MAX_SAFE_INTEGER + 1],
  ['decreasing', 9],
] as const)(
  'a %s final duration closes the session with known usage still provisional',
  async (_label, seconds) => {
    const scene = await setup();
    const voice = await scene.start();
    scene.live.configure({ finalize: false });
    scene.live.emit(voice.providerId, {
      type: 'session.usage.updated',
      event_id: randomUUID(),
      usage: { seconds: 12 },
    });
    scene.live.emit(voice.providerId, {
      type: 'session.closed',
      event_id: randomUUID(),
      reason: 'connection_lost',
      session: { id: voice.providerId },
      usage: { seconds },
    });
    expect((await voice.poll()).voice).toMatchObject({
      phase: 'closed',
      seconds: 12,
      usageFinal: false,
    });
    expect(scene.usage.at(-1)).toMatchObject({
      seconds: 12,
      final: false,
      outcome: 'interrupted',
      endedAt: expect.any(String),
    });
    expect(scene.live.channels.size).toBe(0);
  },
);

test('late usage after the final provider event cannot change a confirmed duration or its metadata', async () => {
  const scene = await setup();
  const voice = await scene.start();
  const channel = scene.live.channels.get(voice.providerId);
  if (!channel) throw new Error('Missing synthetic provider channel');
  scene.live.configure({ seconds: 15 });
  expect((await voice.post('stop')).status()).toBe(200);
  expect((await voice.poll()).voice).toMatchObject({
    phase: 'closed',
    seconds: 15,
    usageFinal: true,
  });
  const finalMetadata = structuredClone(scene.usage);
  // A retained external emitter models an event already queued when the
  // transport closed; the fixture's channel lookup has now been removed.
  channel.emit('session.usage.updated', {
    type: 'session.usage.updated',
    event_id: randomUUID(),
    usage: { seconds: 999 },
  });
  expect((await voice.poll()).voice).toMatchObject({
    phase: 'closed',
    seconds: 15,
    usageFinal: true,
  });
  expect(scene.usage).toEqual(finalMetadata);
});

test.each([true, false])(
  'a late terminal provider event cannot change usage after bounded closure with final confirmation: %s',
  async (finalize) => {
    const scene = await setup();
    const voice = await scene.start();
    const channel = scene.live.channels.get(voice.providerId);
    if (!channel) throw new Error('Missing synthetic provider channel');
    scene.live.configure({ finalize, seconds: 15 });
    scene.live.emit(voice.providerId, {
      type: 'session.usage.updated',
      event_id: randomUUID(),
      usage: { seconds: 15 },
    });
    expect((await voice.post('stop')).status()).toBe(200);
    const closed = (await voice.poll()).voice;
    expect(closed).toMatchObject({ phase: 'closed', seconds: 15, usageFinal: finalize });
    const finalMetadata = structuredClone(scene.usage);
    channel.emit('session.closed', {
      type: 'session.closed',
      event_id: randomUUID(),
      reason: 'connection_lost',
      session: { id: voice.providerId },
      usage: { seconds: 30 },
    });
    expect(scene.usage).toEqual(finalMetadata);
    expect((await voice.poll()).voice).toEqual(closed);
  },
);

test('a failing usage callback cannot break an authorized voice save or disclose its private error details', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const model = textModel(() => [
      modelTool('save_draft', { version: 1, contentVersion: 1, operationId: 'untrusted-model-id' }),
    ]);
    const scene = await setup(model.provider, () => {
      throw new Error('Private sink detail: synthetic-model-key, retained-draft');
    });
    await proposal(scene.householdPath);
    const voice = await scene.start();
    scene.live.emit(voice.providerId, {
      type: 'session.usage.updated',
      event_id: randomUUID(),
      usage: { seconds: 12 },
    });
    voice.delegate('Spara hela utkastet.');
    await expect
      .poll(async () => (await voice.poll()).assistant.receipt)
      .toMatchObject({
        draftVersion: 1,
        changes: [{ after: { name: 'retained-draft' } }],
      });
    const saved = (await voice.poll()).assistant.receipt;
    expect(saved.operationId).not.toBe('untrusted-model-id');
    scene.live.configure({ seconds: 15 });
    const stopped = await voice.post('stop');
    expect(stopped.status(), await stopped.text()).toBe(200);
    expect((await stopped.json()).voice).toMatchObject({
      phase: 'closed',
      seconds: 15,
      usageFinal: true,
    });
    const map = await (await browser.get(`${scene.householdPath}/map`)).json();
    expect(map.objects).toMatchObject([{ id: 'retained-draft', name: 'retained-draft' }]);
    expect(map.draft.changes).toEqual([]);
    const operation = await (
      await browser.get(`${scene.householdPath}/map/operations/${saved.operationId}`)
    ).json();
    expect(operation.operation).toMatchObject({ status: 'succeeded', receipt: saved });
    expect(scene.live.channels.size).toBe(0);
    expect(scene.usage.at(-1)).toMatchObject({ seconds: 15, final: true, outcome: 'closed' });
    expect(JSON.stringify(scene.usage)).not.toMatch(
      /retained-draft|synthetic-model-key|Private sink/,
    );
    expect(log).toHaveBeenCalled();
    expect(log.mock.calls.flat()).toEqual(
      expect.arrayContaining([JSON.stringify({ event: 'live_usage_unavailable' })]),
    );
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /Private sink|synthetic-model-key|retained-draft|Privat syntetiskt/,
    );
  } finally {
    log.mockRestore();
  }
});

test.each(['stop', 'transport loss'] as const)(
  '%s cancels held delegated work before a late proposal and retains the earlier draft',
  async (interruption) => {
    let release!: (value: unknown[]) => void;
    let signal: AbortSignal | null | undefined;
    const model = textModel((_body, requestSignal) => {
      signal = requestSignal;
      return new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
    });
    const scene = await setup(model.provider);
    const value = await proposal(scene.householdPath);
    const before = await (await browser.get(`${scene.householdPath}/map`)).json();
    const voice = await scene.start();
    voice.delegate('Ändra namnet i mitt utkast.');
    await expect.poll(() => model.requests.length).toBe(1);
    expect((await voice.poll()).assistant.phase).toBe('working');
    if (interruption === 'stop') {
      expect((await voice.post('stop')).status()).toBe(200);
    } else {
      scene.live.configure({ finalize: false });
      scene.live.emit(voice.providerId, { type: 'close' });
    }
    await expect.poll(() => signal?.aborted).toBe(true);
    release([
      modelTool('propose_object', {
        version: 1,
        contentVersion: 1,
        id: 'retained-draft',
        baseRevision: null,
        value: { ...value, name: 'För sent ändrat' },
      }),
    ]);
    await expect
      .poll(async () => (await voice.poll()).voice.phase, { timeout: 4000 })
      .toBe(interruption === 'stop' ? 'closed' : 'error');
    expect(await (await browser.get(`${scene.householdPath}/map`)).json()).toEqual(before);
    expect(
      scene.live.sent.filter(({ event }) => event.type === 'session.commentary.append'),
    ).toEqual([]);
    expect(scene.live.channels.size).toBe(0);
    if (interruption === 'transport loss')
      expect(scene.usage.at(-1)).toMatchObject({
        seconds: null,
        final: false,
        outcome: 'interrupted',
      });
  },
);

test.each(['grant revocation', 'content replacement'] as const)(
  '%s closes voice and cancels held work without exposing a late private result',
  async (invalidation) => {
    let release!: (value: unknown[]) => void;
    let signal: AbortSignal | null | undefined;
    const model = textModel((_body, requestSignal) => {
      signal = requestSignal;
      return new Promise<unknown[]>((resolve) => {
        release = resolve;
      });
    });
    const scene = await setup(model.provider);
    await proposal(scene.householdPath);
    const before = await (await browser.get(`${scene.householdPath}/map`)).json();
    const voice = await scene.start();
    voice.delegate('Läs mitt privata utkast.');
    await expect.poll(() => model.requests.length).toBe(1);
    expect((await voice.poll()).assistant.phase).toBe('working');
    if (invalidation === 'grant revocation') {
      const { connections } = await (
        await browser.get(`${app.origin}/api/assistants/context`)
      ).json();
      expect(connections).toHaveLength(1);
      expect(
        (
          await browser.post(`${app.origin}/api/assistants/${connections[0].id}/revoke`, {
            headers: { origin: app.origin },
            data: {},
          })
        ).status(),
      ).toBe(200);
    } else {
      const exported = await browser.post(`${scene.householdPath}/exports`, {
        headers: { origin: app.origin },
        data: {},
      });
      expect(exported.status()).toBe(201);
      const { id } = await exported.json();
      const archive = await (await browser.get(`${scene.householdPath}/exports/${id}`)).body();
      const uploaded = await browser.post(`${scene.householdPath}/imports`, {
        headers: {
          origin: app.origin,
          'content-type': 'application/zip',
          'X-Skyttel-Content-Version': '1',
        },
        data: archive,
      });
      expect(uploaded.status(), await uploaded.text()).toBe(201);
      const ready = await uploaded.json();
      const confirmed = await browser.post(`${scene.householdPath}/imports/${ready.id}/confirm`, {
        headers: { origin: app.origin },
        data: { confirmed: true, contentVersion: 1 },
      });
      expect(await confirmed.json()).toMatchObject({ status: 'completed' });
    }
    await expect.poll(() => signal?.aborted).toBe(true);
    release([modelMessage('Sent privat svar som inte får höras.')]);
    await expect.poll(() => scene.live.channels.size).toBe(0);
    const denied = await voice.post('poll', voice.startBody);
    expect(denied.status(), await denied.text()).toBe(404);
    expect(await denied.text()).not.toMatch(/Privat syntetiskt|Sent privat/);
    expect(
      scene.live.sent.filter(({ event }) => event.type === 'session.commentary.append'),
    ).toEqual([]);
    const after = await (await browser.get(`${scene.householdPath}/map`)).json();
    expect(after.draft).toEqual(before.draft);
    expect(after.objects).toEqual(before.objects);
    expect(after.contentVersion).toBe(invalidation === 'content replacement' ? 2 : 1);
    expect(model.requests).toHaveLength(1);
  },
);

test('restart expires the voice session while its household draft and exact durable save receipt remain readable', async () => {
  const scene = await setup();
  await proposal(scene.householdPath, 'already-saved');
  const saveBody = { version: 1, contentVersion: 1, operationId: 'save-before-voice-restart' };
  const saved = await browser.post(`${scene.householdPath}/map/save`, {
    headers: { origin: app.origin },
    data: saveBody,
  });
  expect(saved.status(), await saved.text()).toBe(200);
  await proposal(scene.householdPath, 'unsaved-after-receipt');
  const mapPath = `${scene.householdPath}/map`;
  const receiptPath = `${mapPath}/operations/${saveBody.operationId}`;
  const before = await (await browser.get(mapPath)).json();
  const history = await (await browser.get(`${mapPath}/history`)).json();
  const receipt = await (await browser.get(receiptPath)).json();
  expect(receipt.operation).toMatchObject({
    status: 'succeeded',
    operationId: saveBody.operationId,
  });
  const voice = await scene.start();
  scene.live.configure({ seconds: 15 });
  await app.restart();
  expect(scene.live.channels.size).toBe(0);
  for (const action of ['poll', 'stop']) {
    const old = await voice.post(action, voice.startBody);
    expect(old.status(), await old.text()).toBe(404);
  }
  expect(await (await browser.get(mapPath)).json()).toEqual(before);
  expect(await (await browser.get(`${mapPath}/history`)).json()).toEqual(history);
  expect(await (await browser.get(receiptPath)).json()).toEqual(receipt);
  const fresh = await scene.start();
  expect(fresh.assistant.id).not.toBe(voice.assistant.id);
  expect(fresh.assistant.review.changes).toMatchObject([
    { id: 'unsaved-after-receipt', after: { name: 'unsaved-after-receipt' } },
  ]);
  expect(fresh.assistant.operations).toContainEqual(
    expect.objectContaining({ status: 'succeeded', operationId: saveBody.operationId }),
  );
});

test('voice start and controls deny anonymous, other-member, revoked-member and wrong-household access without replacing the owner session', async () => {
  const scene = await setup();
  await proposal(scene.householdPath);
  const voice = await scene.start();
  const anonymous = await request.newContext();
  const member = await request.newContext();
  clients.push(anonymous, member);
  app.setIdentity(robin);
  await signIn(member, app.origin, 'microsoft');
  const { user } = await (await member.get(`${app.origin}/api/bootstrap`)).json();
  const invited = await browser.post(`${scene.householdPath}/invitations`, {
    headers: { origin: app.origin },
    data: { userId: user.id },
  });
  const { code } = await invited.json();
  expect(
    (
      await member.post(`${app.origin}/api/invitations/accept`, {
        headers: { origin: app.origin },
        data: { code },
      })
    ).status(),
  ).toBe(200);
  const requests = [
    [voice.startPath, voice.startBody],
    [`${voice.voicePath}/poll`, voice.startBody],
    [`${voice.voicePath}/stop`, {}],
  ] as const;
  for (const [client, status] of [
    [anonymous, 401],
    [member, 404],
  ] as const) {
    for (const [url, data] of requests) {
      const response = await client.post(url, { headers: { origin: app.origin }, data });
      expect(response.status(), await response.text()).toBe(status);
      expect(await response.text()).not.toContain('Privat syntetiskt');
    }
  }
  expect(
    (
      await browser.post(`${scene.householdPath}/members/${user.id}/revoke`, {
        headers: { origin: app.origin },
        data: {},
      })
    ).status(),
  ).toBe(200);
  for (const [url, data] of requests) {
    expect((await member.post(url, { headers: { origin: app.origin }, data })).status()).toBe(403);
    const wrongHousehold = url.replace(scene.householdPath, `${app.origin}/api/households/wrong`);
    expect(
      (
        await browser.post(wrongHousehold, {
          headers: { origin: app.origin },
          data,
        })
      ).status(),
    ).toBe(403);
  }
  expect((await voice.poll()).voice.phase).toBe('listening');
  expect(scene.live.requests).toHaveLength(1);
});

test('malformed offers, invalid polling anchors and wrong origins cannot spend a new voice session or close the active one', async () => {
  const scene = await setup();
  const voice = await scene.start();
  for (const data of [
    null,
    {},
    { ...voice.startBody, sdp: '' },
    { ...voice.startBody, sdp: 7 },
    { ...voice.startBody, sdp: 'x'.repeat(12_001) },
  ]) {
    const response = await browser.post(voice.startPath, {
      headers: { origin: app.origin },
      data,
    });
    expect(response.status(), await response.text()).toBe(400);
  }
  for (const url of [voice.startPath, `${voice.voicePath}/poll`]) {
    const response = await browser.post(url, {
      headers: { origin: app.origin, 'content-type': 'application/json' },
      data: '{',
    });
    expect(response.status(), await response.text()).toBe(400);
  }
  for (const data of [
    {},
    { ...voice.startBody, revision: -1 },
    { ...voice.startBody, revision: 0.5 },
    { ...voice.startBody, draftVersion: -1 },
    { ...voice.startBody, contentVersion: 0 },
  ]) {
    const response = await voice.post('poll', data);
    expect(response.status(), await response.text()).toBe(400);
  }
  for (const origin of ['', 'https://other.example.test']) {
    for (const url of [voice.startPath, `${voice.voicePath}/poll`, `${voice.voicePath}/stop`]) {
      const response = await browser.post(url, {
        headers: { origin },
        data: voice.startBody,
      });
      expect(response.status(), await response.text()).toBe(403);
    }
  }
  const stale = await browser.post(voice.startPath, {
    headers: { origin: app.origin },
    data: { ...voice.startBody, contentVersion: 2 },
  });
  expect(stale.status(), await stale.text()).toBe(409);
  expect((await voice.post('unknown')).status()).toBe(404);
  expect((await voice.poll()).voice.phase).toBe('listening');
  expect(scene.live.requests).toHaveLength(1);
});
