import { createRequire } from 'node:module';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider, voiceAnswerParts } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

type Socket = {
  on(event: 'message' | 'open' | 'error' | 'close', callback: (data: unknown) => void): void;
  send(text: string): void;
  close(): void;
};
const WebSocket = createRequire(import.meta.url)('ws') as new (
  url: string,
  options: { headers: Record<string, string> },
) => Socket;
let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
const sockets: Socket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await browser?.dispose();
  await app?.close();
  vi.useRealTimers();
});
async function connect(path: string) {
  const cookies = (await browser.storageState()).cookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const socket = new WebSocket(path.replace('http', 'ws'), {
    headers: { Cookie: cookies, Origin: app.origin },
  });
  sockets.push(socket);
  const messages: Record<string, unknown>[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(String(data))));
  socket.on('error', () => messages.push({ type: 'rejected' }));
  await expect.poll(() => messages[0]?.type, { timeout: 1500 }).toBe('connected');
  return { socket, messages, id: messages[0].id };
}

async function rejectedConnection(path: string, cookies?: string, origin = app.origin) {
  const socket = new WebSocket(path.replace('http', 'ws'), {
    headers: {
      Cookie:
        cookies ??
        (await browser.storageState()).cookies
          .map((cookie) => `${cookie.name}=${cookie.value}`)
          .join('; '),
      Origin: origin,
    },
  });
  sockets.push(socket);
  let rejected = false;
  let connected = false;
  socket.on('error', () => {
    rejected = true;
  });
  socket.on('message', () => {
    connected = true;
  });
  await expect.poll(() => rejected).toBe(true);
  expect(connected).toBe(false);
}

async function arrange(
  model: ReturnType<typeof textModel>,
  remaining = 60_000,
  external: Pick<
    NonNullable<Parameters<typeof createInstallation>[1]>,
    'liveFetch' | 'liveSideband' | 'assistantDispatch'
  > = {},
) {
  const started = Date.now();
  let clock = started;
  app = await createInstallation(undefined, {
    now: () => clock,
    modelFetch: model.provider,
    ...external,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  clock += 8 * 60 * 60_000 - remaining;
  const session = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    })
  ).json();
  const endpoint = `${path}/${session.id}`;
  const channel = await connect(`${endpoint}/delivery`);
  return {
    endpoint,
    channel,
    advance(milliseconds: number) {
      clock += milliseconds;
    },
    post(requestId = 'answer', extra: Record<string, unknown> = {}) {
      return browser.post(`${endpoint}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId,
          revision: 0,
          draftVersion: 0,
          contentVersion: 1,
          text: 'Beskriv hela svaret.',
          deliveryConnectionId: channel.id,
          ...extra,
        },
      });
    },
  };
}

test('missing transport receipt fails after five seconds without waiting for reading or reconnect', async () => {
  const fixture = await arrange(textModel(() => [modelMessage('Hela svaret.')]));
  expect((await fixture.post()).status()).toBe(202);
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'awaiting-receipt'))
    .toBe(true);
  fixture.advance(4999);
  await browser.get(`${app.origin}/api/bootstrap`);
  expect(fixture.channel.messages.some((item) => item.state === 'failed')).toBe(false);
  fixture.advance(1);
  await browser.get(`${app.origin}/api/bootstrap`);
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'failed'))
    .toBe(true);
  const current = await (await browser.get(fixture.endpoint)).json();
  expect(current.tasks).toMatchObject([{ status: 'completed', delivery: { state: 'failed' } }]);
});

test('an incomplete provider answer fails delivery and never presents its prefix as a complete result', async () => {
  const model = textModel(() => [modelMessage('Bara en början av svaret.')]);
  const fixture = await arrange({
    ...model,
    provider: async (input, init) => {
      const original = await model.provider(input, init);
      return Response.json({ ...(await original.json()), status: 'incomplete' });
    },
  });
  expect((await fixture.post()).status()).toBe(202);
  await expect
    .poll(async () => (await (await browser.get(fixture.endpoint)).json()).phase)
    .toBe('error');
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'failed'))
    .toBe(true);
  expect(
    fixture.channel.messages.some(
      (item) => item.state === 'awaiting-receipt' || item.state === 'received',
    ),
  ).toBe(false);
});

test('the complete frozen fallback contains every follow-up, conversation part and verified draft/save status', async () => {
  let turn = 0;
  const fixture = await arrange(
    textModel(() =>
      ++turn === 1
        ? [
            modelTool('ask_questions', {
              questions: ['Vem använder cykeln?', 'Var finns hjälmen?'],
              continueResponse: true,
            }),
          ]
        : [modelMessage('Hela förklaringen med båda frågorna.')],
    ),
  );
  expect((await fixture.post('questions', { deliveryAudio: true })).status()).toBe(202);
  await expect
    .poll(() => fixture.channel.messages.find((item) => item.state === 'awaiting-receipt'))
    .toBeTruthy();
  const full = fixture.channel.messages.find((item) => item.state === 'awaiting-receipt');
  expect(full?.audio).toBe(true);
  expect(full?.text).toContain('Hela förklaringen med båda frågorna.');
  expect(full?.text).toContain('Vem använder cykeln?');
  expect(full?.text).toContain('Var finns hjälmen?');
  expect(full?.text).toContain('Utkast: 0 osparade förslag.');
  expect(full?.text).toContain('Inget nytt sparande är bekräftat.');
  fixture.channel.socket.send(
    JSON.stringify({ type: 'received', taskId: 'questions', text: full?.text }),
  );
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'received'))
    .toBe(true);
});

test('partial text cannot acknowledge a full frozen answer and disconnect ends delivery', async () => {
  const fixture = await arrange(textModel(() => [modelMessage('Första delen. Hela sista delen.')]));
  expect((await fixture.post()).status()).toBe(202);
  await expect
    .poll(() => fixture.channel.messages.find((item) => item.state === 'awaiting-receipt'))
    .toBeTruthy();
  fixture.channel.socket.send(
    JSON.stringify({ type: 'received', taskId: 'answer', text: 'Första delen.' }),
  );
  await expect
    .poll(async () => (await (await browser.get(fixture.endpoint)).json()).tasks[0].delivery.state)
    .toBe('failed');
  expect(fixture.channel.messages.some((item) => item.state === 'received')).toBe(false);
});

test('explicit cancellation ends an already completed task’s outstanding delivery', async () => {
  const fixture = await arrange(textModel(() => [modelMessage('Färdigt men ännu inte mottaget.')]));
  expect((await fixture.post()).status()).toBe(202);
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'awaiting-receipt'))
    .toBe(true);
  expect(
    (
      await browser.post(`${fixture.endpoint}/cancel`, {
        headers: { origin: app.origin },
        data: { all: true },
      })
    ).status(),
  ).toBe(200);
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'failed'))
    .toBe(true);
  expect((await (await browser.get(fixture.endpoint)).json()).tasks[0].delivery.state).toBe(
    'failed',
  );
});

test('an exact whole receipt at the original task deadline is rejected and a new expired connection cannot join', async () => {
  let release: (output: unknown[]) => void = () => {};
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const fixture = await arrange(model);
  expect((await fixture.post()).status()).toBe(202);
  await expect.poll(() => model.requests.length).toBe(1);
  fixture.advance(30 * 60_000 - 1);
  release([modelMessage('Sluttext precis före gränsen.')]);
  await expect
    .poll(() => fixture.channel.messages.find((item) => item.state === 'awaiting-receipt'))
    .toBeTruthy();
  const full = fixture.channel.messages.find((item) => item.state === 'awaiting-receipt');
  fixture.advance(1);
  fixture.channel.socket.send(
    JSON.stringify({ type: 'received', taskId: 'answer', text: full?.text }),
  );
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'failed'))
    .toBe(true);
  expect(fixture.channel.messages.some((item) => item.state === 'received')).toBe(false);
  await rejectedConnection(`${fixture.endpoint}/delivery`);
  expect((await browser.get(fixture.endpoint)).status()).toBe(401);
});

test('disconnect fails immediately while accepted work can finish without waiting for reconnect', async () => {
  let release: (output: unknown[]) => void = () => {};
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const fixture = await arrange(model);
  expect((await fixture.post()).status()).toBe(202);
  await expect.poll(() => model.requests.length).toBe(1);
  fixture.channel.socket.close();
  await expect
    .poll(async () => (await (await browser.get(fixture.endpoint)).json()).tasks[0].delivery.state)
    .toBe('failed');
  release([modelMessage('Serverns färdiga svar.')]);
  await expect
    .poll(async () => (await (await browser.get(fixture.endpoint)).json()).tasks[0])
    .toMatchObject({ status: 'completed', delivery: { state: 'failed' } });
  const other = await connect(`${fixture.endpoint}/delivery`);
  expect((await fixture.post('answer', { deliveryConnectionId: other.id })).status()).toBe(202);
  expect(other.messages.some((item) => item.type === 'delivery')).toBe(false);
  expect(model.requests).toHaveLength(1);
});

test('later queued work does not replace frozen text or revoke the earlier task’s receipt', async () => {
  const held: ((output: unknown[]) => void)[] = [];
  const model = textModel(() => new Promise<unknown[]>((resolve) => held.push(resolve)));
  const fixture = await arrange(model);
  expect((await fixture.post('first')).status()).toBe(202);
  await expect.poll(() => held.length).toBe(1);
  fixture.advance(1000);
  expect((await fixture.post('second', { text: 'En annan fråga.', queue: true })).status()).toBe(
    202,
  );
  held[0]([modelMessage('Första hela svaret.')]);
  await expect.poll(() => held.length).toBe(2);
  held[1]([modelMessage('Andra hela svaret.')]);
  await expect
    .poll(() => fixture.channel.messages.filter((item) => item.state === 'awaiting-receipt').length)
    .toBe(2);
  const first = fixture.channel.messages.find(
    (item) => item.taskId === 'first' && item.state === 'awaiting-receipt',
  );
  const second = fixture.channel.messages.find(
    (item) => item.taskId === 'second' && item.state === 'awaiting-receipt',
  );
  expect(first?.text).toContain('Första hela svaret.');
  expect(first?.text).not.toContain('Andra hela svaret.');
  expect(second?.text).toContain('Andra hela svaret.');
  expect(Number(second?.deadline) - Number(first?.deadline)).toBe(1000);
  for (const result of [first, second])
    fixture.channel.socket.send(
      JSON.stringify({ type: 'received', taskId: result?.taskId, text: result?.text }),
    );
  await expect
    .poll(() => fixture.channel.messages.filter((item) => item.state === 'received').length)
    .toBe(2);
});

test('delivery failure and restart preserve the actual stored draft without stored conversation text', async () => {
  let typeId = '';
  const fixture = await arrange(
    textModel(() => [
      modelTool('submit_changes', {
        version: 0,
        contentVersion: 1,
        completion: 'draft',
        operations: [
          {
            name: 'propose_object',
            arguments: {
              id: 'retained-delivery',
              baseRevision: null,
              value: { typeId, name: 'Bevarat leveransförslag', description: '' },
            },
          },
        ],
      }),
    ]),
  );
  const mapPath = fixture.endpoint.replace(/text-assistant\/[^/]+$/, 'map');
  typeId = (await (await browser.get(mapPath)).json()).types[0].id;
  expect((await fixture.post()).status()).toBe(202);
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'awaiting-receipt'))
    .toBe(true);
  fixture.channel.socket.close();
  await expect
    .poll(async () => (await (await browser.get(fixture.endpoint)).json()).tasks[0].delivery.state)
    .toBe('failed');
  expect((await (await browser.get(mapPath)).json()).draft.changes).toMatchObject([
    { id: 'retained-delivery', after: { name: 'Bevarat leveransförslag' } },
  ]);
  browser = await restartWithSession(browser, () => app.restart());
  expect((await (await browser.get(mapPath)).json()).draft.changes).toMatchObject([
    { id: 'retained-delivery', after: { name: 'Bevarat leveransförslag' } },
  ]);
  expect((await browser.get(fixture.endpoint)).status()).toBe(404);
});

test('a task with no already open delivery channel fails delivery immediately and does not wait for one', async () => {
  const fixture = await arrange(textModel(() => [modelMessage('Hela vanliga HTTP-svaret.')]));
  const accepted = await fixture.post('no-channel', { deliveryConnectionId: undefined });
  expect(accepted.status()).toBe(202);
  expect((await accepted.json()).tasks[0].delivery.state).toBe('failed');
  await expect
    .poll(async () => (await (await browser.get(fixture.endpoint)).json()).tasks[0].status)
    .toBe('completed');
  expect(fixture.channel.messages.some((item) => item.type === 'delivery')).toBe(false);
});

test('restart retires the connection and cannot recover old task IDs or replay model work', async () => {
  const model = textModel(() => [modelMessage('Ett tillfälligt svar.')]);
  const fixture = await arrange(model);
  expect((await fixture.post()).status()).toBe(202);
  await expect
    .poll(() => fixture.channel.messages.find((item) => item.state === 'awaiting-receipt'))
    .toBeTruthy();
  browser = await restartWithSession(browser, () => app.restart());
  await rejectedConnection(`${fixture.endpoint}/delivery`);
  expect((await browser.get(fixture.endpoint)).status()).toBe(404);
  expect(model.requests).toHaveLength(1);
});

test('handshake requires the exact origin and browser binding, and OFF preserves only the already open channel', async () => {
  let release: (output: unknown[]) => void = () => {};
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const fixture = await arrange(model);
  const originalCookies = (await browser.storageState()).cookies;
  const original = originalCookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  await rejectedConnection(`${fixture.endpoint}/delivery`, original, 'https://other.example');
  await rejectedConnection(
    `${fixture.endpoint}/delivery`,
    originalCookies
      .filter((cookie) => cookie.name !== 'skyttel_binding')
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; '),
  );
  expect((await fixture.post()).status()).toBe(202);
  await expect.poll(() => model.requests.length).toBe(1);
  const revoked = await browser.post(`${app.origin}/api/browser-binding/revoke`, {
    headers: { origin: app.origin },
    data: { id: crypto.randomUUID() },
  });
  expect(revoked.status()).toBe(200);
  const replacement = await revoked.json();
  await browser.addCookies([
    {
      name: replacement.cookieName,
      value: replacement.candidate,
      url: app.origin,
      sameSite: 'Lax',
    },
  ]);
  expect(
    (
      await browser.post(`${app.origin}/api/browser-binding/register`, {
        headers: { origin: app.origin },
        data: {},
      })
    ).status(),
  ).toBe(200);
  await rejectedConnection(`${fixture.endpoint}/delivery`, original);
  release([modelMessage('Den redan bundna uppgiften får sitt hela svar.')]);
  await expect
    .poll(() => fixture.channel.messages.find((item) => item.state === 'awaiting-receipt'))
    .toBeTruthy();
  const full = fixture.channel.messages.find((item) => item.state === 'awaiting-receipt');
  fixture.channel.socket.send(
    JSON.stringify({ type: 'received', taskId: 'answer', text: full?.text }),
  );
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'received'))
    .toBe(true);
});

test.each(['logout', 'replacement', 'consent', 'reset', 'stop'])(
  '%s retires the original delivery and a late model result cannot recreate it',
  async (reason) => {
    let release: (output: unknown[]) => void = () => {};
    const model = textModel(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = resolve;
        }),
    );
    const fixture = await arrange(model);
    expect((await fixture.post()).status()).toBe(202);
    await expect.poll(() => model.requests.length).toBe(1);
    if (reason === 'replacement') await signIn(browser, app.origin);
    else {
      const url =
        reason === 'logout'
          ? `${app.origin}/api/auth/sign-out`
          : reason === 'consent'
            ? fixture.endpoint.replace(/text-assistant\/[^/]+$/, 'conversation-consent/revoke')
            : `${fixture.endpoint}/${reason === 'reset' ? 'new' : 'stop'}`;
      expect(
        (await browser.post(url, { headers: { origin: app.origin }, data: {} })).status(),
      ).toBe(200);
    }
    await expect
      .poll(() => fixture.channel.messages.some((item) => item.type === 'retired'))
      .toBe(true);
    release([modelMessage('Ett försenat svar som inte får publiceras.')]);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(
      fixture.channel.messages.some(
        (item) => item.state === 'awaiting-receipt' || item.state === 'received',
      ),
    ).toBe(false);
    expect(model.requests).toHaveLength(1);
  },
);

test('free Live can deliver whole text before expiry but its outstanding receipt has no TEXT exception', async () => {
  let release: (output: unknown[]) => void = () => {};
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const live = liveProvider();
  const fixture = await arrange(model, 60_000, {
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  expect(
    (
      await browser.post(`${fixture.endpoint}/voice`, {
        headers: { origin: app.origin },
        data: {
          sdp: 'synthetic-offer',
          revision: 0,
          draftVersion: 0,
          contentVersion: 1,
          deliveryConnectionId: fixture.channel.id,
        },
      })
    ).status(),
  ).toBe(201);
  const id = [...live.channels.keys()][0];
  live.emit(id, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: 'Beskriv hela svaret.',
    start_ms: 0,
    end_ms: 10,
  });
  live.emit(id, {
    type: 'session.delegation.created',
    delegation: { id: crypto.randomUUID(), target: 'client' },
    offset_ms: 10,
  });
  fixture.advance(2000);
  await expect.poll(() => model.requests.length).toBe(1);
  fixture.advance(57_999);
  release([modelMessage('Hela röstsvarstexten före inloggningens utgång.')]);
  await expect
    .poll(() => fixture.channel.messages.find((item) => item.state === 'awaiting-receipt'))
    .toBeTruthy();
  const full = fixture.channel.messages.find((item) => item.state === 'awaiting-receipt');
  expect(full?.audio).toBe(true);
  expect(full?.text).toContain('Hela röstsvarstexten före inloggningens utgång.');
  fixture.advance(1);
  fixture.channel.socket.send(
    JSON.stringify({ type: 'received', taskId: full?.taskId, text: full?.text }),
  );
  await expect
    .poll(() => fixture.channel.messages.some((item) => item.state === 'failed'))
    .toBe(true);
  expect(fixture.channel.messages.some((item) => item.state === 'received')).toBe(false);
});

test('the exact Live expiry timer fails an already completed voice delivery without ACK or HTTP traffic', async () => {
  let expired = false;
  const lateRequests: string[] = [];
  let release: (output: unknown[]) => void = () => {};
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const live = liveProvider();
  const fixture = await arrange(model, 2500, {
    liveFetch: live.provider,
    liveSideband: live.attach,
    assistantDispatch(request, dispatch) {
      if (expired) lateRequests.push(new URL(request.url).pathname);
      return dispatch(request);
    },
  });
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  expect(
    (
      await browser.post(`${fixture.endpoint}/voice`, {
        headers: { origin: app.origin },
        data: {
          sdp: 'synthetic-offer',
          revision: 0,
          draftVersion: 0,
          contentVersion: 1,
          deliveryConnectionId: fixture.channel.id,
        },
      })
    ).status(),
  ).toBe(201);
  const id = [...live.channels.keys()][0];
  live.emit(id, {
    type: 'session.input_transcript.delta',
    event_id: crypto.randomUUID(),
    delta: 'Beskriv hela svaret.',
    start_ms: 0,
    end_ms: 10,
  });
  live.emit(id, {
    type: 'session.delegation.created',
    delegation: { id: crypto.randomUUID(), target: 'client' },
    offset_ms: 10,
  });
  fixture.advance(2000);
  await vi.advanceTimersByTimeAsync(2000);
  await vi.waitFor(() => expect(model.requests).toHaveLength(1));
  fixture.advance(499);
  await vi.advanceTimersByTimeAsync(499);
  release([modelMessage('Hela röstsvarstexten precis före utgång.')]);
  await vi.waitFor(() =>
    expect(fixture.channel.messages.some((item) => item.state === 'awaiting-receipt')).toBe(true),
  );
  // Let the provider-facing answer finish too: no later HTTP poll may be
  // the trigger for the delivery's expiry outcome.
  await vi.waitFor(() =>
    expect(voiceAnswerParts(live.sent).join('')).toContain(
      'Hela röstsvarstexten precis före utgång.',
    ),
  );
  expect(fixture.channel.messages.some((item) => item.state === 'failed')).toBe(false);
  expired = true;
  fixture.advance(1);
  await vi.advanceTimersByTimeAsync(1);
  await vi.waitFor(() =>
    expect(fixture.channel.messages.some((item) => item.state === 'failed')).toBe(true),
  );
  expect(fixture.channel.messages.some((item) => item.state === 'received')).toBe(false);
  // Transport shutdown may send DELETE /mcp to release its private grant;
  // no new application request or acknowledgement triggers the outcome.
  expect(lateRequests.filter((path) => path !== '/mcp')).toEqual([]);
});

test('the bound browser receives the whole long answer after natural expiry and acknowledges only that frozen text', async () => {
  const started = Date.now();
  let clock = started;
  let release: (output: unknown[]) => void = () => {};
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  app = await createInstallation(undefined, { now: () => clock, modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  clock += 8 * 60 * 60_000 - 1;
  const session = await (
    await browser.post(path, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    })
  ).json();
  const channel = await connect(`${path}/${session.id}/delivery`);
  const other = await connect(`${path}/${session.id}/delivery`);
  expect(
    (
      await browser.post(`${path}/${session.id}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId: 'whole',
          revision: 0,
          draftVersion: 0,
          contentVersion: 1,
          text: 'Beskriv hela svaret.',
          deliveryConnectionId: channel.id,
        },
      })
    ).status(),
  ).toBe(202);
  await expect.poll(() => model.requests.length).toBe(1);
  clock++;
  const full = `${'Detta är en lång sammanhängande förklaring. '.repeat(100)}Sista frågan: vem använder cykeln?`;
  release([modelMessage(full)]);
  await expect
    .poll(() => channel.messages.find((item) => item.state === 'awaiting-receipt'))
    .toBeTruthy();
  const result = channel.messages.find((item) => item.state === 'awaiting-receipt');
  expect(result?.text).toContain(full);
  expect(result?.text).toContain('Inget nytt sparande är bekräftat.');
  expect((await browser.get(`${path}/${session.id}`)).status()).toBe(401);
  other.socket.send(JSON.stringify({ type: 'received', taskId: 'whole', text: result?.text }));
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(channel.messages.some((item) => item.state === 'received')).toBe(false);
  channel.socket.send(JSON.stringify({ type: 'received', taskId: 'whole', text: result?.text }));
  await expect.poll(() => channel.messages.some((item) => item.state === 'received')).toBe(true);
});
