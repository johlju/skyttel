import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import {
  backendTaskObservationContext,
  type ObserveAssistant,
} from '../../../src/server/assistant-observation.js';
import { langSmithDelivery } from '../../../src/server/langsmith-delivery.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

type Ingested = {
  method: string;
  path: string;
  body: Record<string, unknown>;
  bytes: number;
  closed: boolean;
  closedAt?: number;
  accepted: boolean;
};
type Ingestion = Awaited<ReturnType<typeof ingestion>>;
let app: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
let endpoint: Ingestion;
afterEach(async () => {
  vi.useRealTimers();
  await client?.dispose();
  await app?.close();
  await endpoint?.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function ingestion(
  respond: (request: IncomingMessage, response: ServerResponse) => void = (_request, response) =>
    response.writeHead(204).end(),
) {
  const received: Ingested[] = [];
  let active = 0;
  let maximumActive = 0;
  const server = createServer(async (request, response) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    let finished = false;
    const finish = () => {
      if (!finished) {
        finished = true;
        active--;
      }
    };
    response.once('finish', finish);
    response.once('close', finish);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const entry: Ingested = {
      method: request.method ?? '',
      path: request.url ?? '',
      body: JSON.parse(bytes.toString()),
      bytes: bytes.length,
      closed: false,
      accepted: false,
    };
    received.push(entry);
    response.once('finish', () => {
      entry.accepted = response.statusCode >= 200 && response.statusCode < 300;
    });
    response.once('close', () => {
      entry.closed = true;
      entry.closedAt = performance.now();
    });
    respond(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing ingestion address');
  return {
    received,
    get maximumActive() {
      return maximumActive;
    },
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

async function setup(
  options: Parameters<typeof createInstallation>[1] = {},
  respond?: Parameters<typeof ingestion>[0],
) {
  endpoint = await ingestion(respond);
  let turn = 0;
  app = await createInstallation(undefined, {
    modelFetch: textModel(() =>
      turn++ === 0 ? [modelTool('read_map', { query: 'Lina' })] : [modelMessage('Lina är läst.')],
    ).provider,
    traceDelivery: langSmithDelivery({
      endpoint: endpoint.url,
      project: 'synthetic-diagnostics',
      apiKey: 'synthetic-trace-secret',
      now: options.now,
    }),
    ...options,
  });
  client = await request.newContext();
  await signIn(client, app.origin);
  const { household } = await (await createHousehold(client, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}`;
  const start = await client.post(`${path}/text-assistant`, {
    headers: { origin: app.origin },
    data:
      options.consentTextVersion === undefined
        ? approvedForVisit
        : { consent: { textVersion: options.consentTextVersion } },
  });
  expect(start.status(), await start.text()).toBe(201);
  return { path, session: await start.json() };
}

async function send(
  path: string,
  session: {
    id: string;
    revision: number;
    review: {
      version: number;
      contentVersion: number;
    };
  },
  requestId = 'read-lina',
  text = 'Läs Lina.',
  browser = client,
) {
  const response = await browser.post(`${path}/text-assistant/${session.id}/messages`, {
    headers: { origin: app.origin },
    data: {
      requestId,
      revision: session.revision,
      draftVersion: session.review.version,
      contentVersion: session.review.contentVersion,
      text,
    },
  });
  expect(response.status(), await response.text()).toBe(202);
  await expect
    .poll(
      async () =>
        (
          await (
            await browser.get(`${path}/text-assistant/${session.id}/messages/${requestId}`)
          ).json()
        ).taskStatus,
      { timeout: 20000 },
    )
    .toBe('completed');
  return (await browser.get(`${path}/text-assistant/${session.id}`)).json();
}

async function restart(duringShutdown?: () => void) {
  // A fresh process has fresh TCP connections; browser cookies survive it.
  const state = await client.storageState();
  await client.dispose();
  const restarting = app.restart();
  duringShutdown?.();
  await restarting;
  client = await request.newContext({ storageState: state });
}

test('complete text evidence preserves the exact model exchange and all actions under one task', async () => {
  const actions = [
    modelTool('read_map', { query: 'Lina' }),
    modelTool('read_map', { query: 'Eken' }),
  ];
  const reasoning = {
    type: 'reasoning',
    id: 'reasoning_example',
    summary: [{ type: 'summary_text', text: 'Läs båda namnen.' }],
    encrypted_content: 'excluded-provider-encrypted',
  };
  const reply = modelMessage('Lina och Eken är lästa.\n"Exakt" åäö 🌌');
  const costs: unknown[] = [];
  let turn = 0;
  const model = textModel(() =>
    (turn++ === 0 ? [reasoning, ...actions] : [reply]).map((item) => ({
      ...item,
      provider_metadata: 'excluded-provider-metadata',
      audio: 'excluded-raw-audio',
      headers: { authorization: 'excluded-provider-credential' },
    })),
  );
  const { path, session } = await setup({
    modelFetch: model.provider,
    modelUsage: (attempt) => costs.push(structuredClone(attempt)),
  });
  const result = await send(path, session);
  expect(result.modelReply).toBe('Lina och Eken är lästa.\n"Exakt" åäö 🌌');
  await expect
    .poll(
      () =>
        endpoint.received.filter(
          (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
        ).length,
    )
    .toBe(1);
  const root = endpoint.received.find(
    (item) => item.method === 'POST' && item.body.parent_run_id === undefined,
  )!.body;
  expect(root.inputs).toMatchObject({ request: { text: 'Läs Lina.' } });
  expect(
    endpoint.received.find((item) => item.path === `/runs/${root.id}`)?.body.outputs,
  ).toMatchObject({ view: { modelReply: result.modelReply } });
  const attempts = endpoint.received.filter(
    (item) => item.method === 'POST' && item.body.run_type === 'llm',
  );
  expect(attempts).toHaveLength(2);
  expect(attempts[0].body.inputs).toEqual(model.requests[0]);
  expect(attempts[1].body.inputs).toMatchObject({
    model: model.requests[1].model,
    instructions: model.requests[1].instructions,
  });
  const firstEnding = endpoint.received.find(
    (item) => item.path === `/runs/${attempts[0].body.id}`,
  )!.body;
  expect(firstEnding.outputs).toMatchObject({
    output: [
      {
        type: 'reasoning',
        id: 'reasoning_example',
        summary: [{ type: 'summary_text', text: 'Läs båda namnen.' }],
      },
      ...actions,
    ],
  });
  const secondEnding = endpoint.received.find(
    (item) => item.path === `/runs/${attempts[1].body.id}`,
  )!.body;
  expect(secondEnding.outputs).toMatchObject({
    output: [{ ...reply, content: [{ type: 'output_text', text: result.modelReply }] }],
  });
  expect(
    attempts.every((item) => item.body.parent_run_id === root.id && item.body.trace_id === root.id),
  ).toBe(true);
  expect(new Set(attempts.map((item) => item.body.id)).size).toBe(2);
  expect(JSON.stringify(endpoint.received)).not.toMatch(
    /excluded-provider|excluded-raw-audio|synthetic-model-key|synthetic-trace-secret/,
  );
  expect(
    JSON.stringify(await (await client.get(`${app.origin}/api/operator/tracing`)).json()),
  ).not.toMatch(
    /Lina|Eken|excluded-provider|excluded-raw-audio|synthetic-model-key|synthetic-trace-secret/,
  );
  expect(costs).toHaveLength(4);
  expect(JSON.stringify(costs)).not.toMatch(/instructions|Lina|Eken|arguments|excluded-provider/);
});

test('later current acceptance never makes an old conversation eligible for live evidence', async () => {
  const observed: { consentTextVersion?: number }[] = [];
  const { path, session } = await setup({
    consentTextVersion: 2,
    observe: (event) => observed.push(event),
  });
  const current = await send(path, session, 'old-before');
  expect(endpoint.received).toEqual([]);
  const { user, household } = await (await client.get(`${app.origin}/api/bootstrap`)).json();
  app.seedConversationConsent(user.id, household.id, 3);
  expect(await (await client.get(`${path}/conversation-consent`)).json()).toMatchObject({
    saved: { textVersion: 3 },
  });
  await send(path, current, 'old-after');
  expect(endpoint.received).toEqual([]);
  expect(observed.length).toBeGreaterThan(0);
  expect(observed.every((event) => event.consentTextVersion === 2)).toBe(true);
});

test.each(['large text', 'many content parts'])(
  'oversized model %s is lost as one event while the public task remains authoritative',
  async (shape) => {
    const message = modelMessage(
      shape === 'large text' ? 'model-oversize-marker'.repeat(60000) : 'exact-part',
    );
    if (shape === 'many content parts')
      message.content = Array.from({ length: 60000 }, () => ({
        type: 'output_text',
        text: 'exact-part',
        annotations: [],
      }));
    const { path, session } = await setup({ modelFetch: textModel(() => [message]).provider });
    const result = await send(path, session);
    expect(result.phase).toBe('ready');
    expect(result.modelReply).toBe(
      shape === 'large text' ? 'model-oversize-marker'.repeat(60000) : 'exact-part'.repeat(60000),
    );
    const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
    expect(health).toMatchObject({ state: 'sending', lastError: 'oversized' });
    expect(health.droppedEvents).toBeGreaterThan(0);
    const attempt = endpoint.received.find(
      (item) => item.method === 'POST' && item.body.run_type === 'llm',
    )!;
    expect(attempt).toBeDefined();
    expect(endpoint.received.filter((item) => item.path === `/runs/${attempt.body.id}`)).toEqual(
      [],
    );
    expect(JSON.stringify(endpoint.received)).not.toContain('model-oversize-marker');
    expect(endpoint.received.every((item) => item.bytes <= 1024 * 1024)).toBe(true);
  },
  20000,
);

test.each(['healthy', 'disabled', 'failing'])(
  'writing, saving and waiting work stay authoritative with %s tracing',
  async (delivery) => {
    let typeId = '';
    let turn = 0;
    const callerPending: unknown[] = [];
    const model = textModel((request) => {
      const input = JSON.parse(
        String(request.input.findLast((item) => item.role === 'user')?.content),
      );
      if (turn++ === 0)
        return [
          modelTool('submit_changes', {
            version: input.draft.version,
            contentVersion: input.draft.contentVersion,
            completion: 'draft',
            questions: [
              {
                kind: 'information',
                request: 'Hitta hjälmen',
                question: 'Vilken hjälm?',
                dependsOnDraft: false,
              },
            ],
            operations: [
              {
                name: 'propose_object',
                arguments: {
                  id: 'diagnostic-bike',
                  baseRevision: null,
                  value: { typeId, name: 'Blå cykeln' },
                },
              },
            ],
          }),
        ];
      if (turn === 2) return [modelMessage('Utkastet är färdigt.')];
      return [
        modelTool('save_draft', {
          version: input.draft.version,
          contentVersion: input.draft.contentVersion,
          operationId: 'model-cannot-repeat-save',
        }),
      ];
    });
    const { path, session } = await setup(
      {
        modelFetch: model.provider,
        observe: (event) => {
          const content = event.data as {
            input?: { instructions?: string };
            view?: { pendingParts?: unknown[] };
          };
          if (content.input)
            content.input.instructions = 'caller mutation cannot change provider input';
          if (event.kind === 'task_completed' && content.view?.pendingParts) {
            callerPending.push(structuredClone(content.view.pendingParts));
            content.view.pendingParts.splice(0);
          }
        },
      },
      (_request, response) => response.writeHead(delivery === 'failing' ? 503 : 204).end(),
    );
    if (delivery === 'disabled')
      await client.post(`${app.origin}/api/operator/tracing`, {
        headers: { origin: app.origin },
        data: { action: 'disable' },
      });
    const map = await (await client.get(`${path}/map`)).json();
    typeId = map.types[0].id;
    const draft = await send(
      path,
      session,
      'create-draft',
      'Lägg till Blå cykeln och hitta hjälmen.',
    );
    expect(draft.review.changes).toMatchObject([
      { id: 'diagnostic-bike', after: { name: 'Blå cykeln' } },
    ]);
    expect(draft.pendingParts).toMatchObject([
      { kind: 'information', status: 'waiting', question: 'Vilken hjälm?' },
    ]);
    expect(callerPending[0]).toMatchObject([
      { kind: 'information', status: 'waiting', question: 'Vilken hjälm?' },
    ]);
    expect(model.requests[0].instructions).not.toContain('caller mutation');
    expect(draft.receipt).toBeUndefined();
    expect((await (await client.get(`${path}/map`)).json()).objects).toEqual([]);
    const saved = await send(path, draft, 'save-once', 'Spara hela utkastet.');
    expect(saved.receipt).toMatchObject({ operationId: expect.any(String), contentVersion: 1 });
    expect(saved.pendingParts).toEqual(draft.pendingParts);
    const operation = await (
      await client.get(`${path}/map/operations/${saved.receipt.operationId}`)
    ).json();
    expect(operation).toMatchObject({ operation: { status: 'succeeded', receipt: saved.receipt } });
    const after = await (await client.get(`${path}/map`)).json();
    expect(after.objects).toMatchObject([{ id: 'diagnostic-bike', name: 'Blå cykeln' }]);
    expect(after.draft.changes).toEqual([]);
    // Replay the same accepted request, then let a model try to reuse expired
    // save authority under a new request. Neither may create another save.
    await send(path, draft, 'save-once', 'Spara hela utkastet.');
    expect(model.requests).toHaveLength(2);
    const refused = await send(path, saved, 'no-new-save', 'Berätta vad som finns kvar.');
    expect(refused).toMatchObject({ phase: 'error', error: 'assistant_save_not_requested' });
    expect(refused.receipt).toBeUndefined();
    expect((await (await client.get(`${path}/map/history`)).json()).history).toHaveLength(1);
    expect(await (await client.get(`${path}/map`)).json()).toEqual(after);
    expect(
      await (
        await client.get(
          `${app.origin}/api/operator/costs?month=${new Date().toISOString().slice(0, 7)}`,
        )
      ).json(),
    ).toMatchObject({
      terra: { attempts: 3, usage: { input: { known: 360 }, output: { known: 90 } } },
    });
    if (delivery === 'healthy') {
      await expect
        .poll(
          () =>
            endpoint.received.filter(
              (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
            ).length,
        )
        .toBe(3);
      const roots = endpoint.received.filter(
        (item) => item.method === 'POST' && item.body.parent_run_id === undefined,
      );
      expect(roots).toHaveLength(3);
      const created = roots.find(
        (item) =>
          (item.body.extra as { metadata: { request_id: string } }).metadata.request_id ===
          'create-draft',
      )!;
      expect(
        endpoint.received.find((item) => item.path === `/runs/${created.body.id}`)?.body.outputs,
      ).toMatchObject({
        view: {
          pendingParts: [{ kind: 'information', status: 'waiting', question: 'Vilken hjälm?' }],
        },
      });
      const saving = roots.find(
        (item) =>
          (item.body.extra as { metadata: { request_id: string } }).metadata.request_id ===
          'save-once',
      )!;
      expect(
        endpoint.received.find((item) => item.path === `/runs/${saving.body.id}`)?.body.outputs,
      ).toMatchObject({
        view: {
          receipt: { operationId: saved.receipt.operationId, contentVersion: 1, draftVersion: 1 },
        },
      });
      expect(
        new Set(
          endpoint.received.filter((item) => item.method === 'POST').map((item) => item.body.id),
        ).size,
      ).toBe(endpoint.received.filter((item) => item.method === 'POST').length);
    } else if (delivery === 'disabled') expect(endpoint.received).toEqual([]);
    else
      expect(
        (await (await client.get(`${app.origin}/api/operator/tracing`)).json()).lastError,
      ).toBe('network');
  },
  20000,
);

test('overlapping devices keep separate task evidence and a canceled late model cannot finish another task', async () => {
  const reached: string[] = [];
  const releases = new Map<string, () => void>();
  const model = textModel(async (request) => {
    const input = JSON.parse(
      String(request.input.findLast((item) => item.role === 'user')?.content),
    );
    reached.push(input.message);
    await new Promise<void>((resolve) => releases.set(input.message, resolve));
    return [modelMessage(`Svar för ${input.message}`)];
  });
  const { path, session } = await setup({ modelFetch: model.provider });
  const other = await request.newContext();
  try {
    await signIn(other, app.origin);
    const started = await other.post(`${path}/text-assistant`, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    });
    expect(started.status(), await started.text()).toBe(201);
    const second = await started.json();
    const submitted = await client.post(`${path}/text-assistant/${session.id}/messages`, {
      headers: { origin: app.origin },
      data: {
        requestId: 'same-request',
        revision: session.revision,
        draftVersion: session.review.version,
        contentVersion: session.review.contentVersion,
        text: 'Alfa',
      },
    });
    expect(submitted.status()).toBe(202);
    const beta = send(path, second, 'same-request', 'Beta', other);
    await expect.poll(() => reached.length).toBe(2);
    await expect
      .poll(
        () =>
          endpoint.received.filter((item) => item.method === 'POST' && item.body.run_type === 'llm')
            .length,
      )
      .toBe(2);
    const roots = endpoint.received.filter(
      (item) => item.method === 'POST' && item.body.parent_run_id === undefined,
    );
    expect(roots).toHaveLength(2);
    expect(new Set(roots.map((item) => item.body.id)).size).toBe(2);
    expect(roots.every((item) => item.body.end_time === undefined)).toBe(true);
    expect(
      endpoint.received.filter(
        (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
      ),
    ).toEqual([]);
    const canceled = await client.post(`${path}/text-assistant/${session.id}/cancel`, {
      headers: { origin: app.origin },
      data: { all: true },
    });
    expect(canceled.status()).toBe(200);
    releases.get('Beta')!();
    expect(await beta).toMatchObject({ phase: 'ready', modelReply: 'Svar för Beta' });
    releases.get('Alfa')!();
    await expect
      .poll(
        () =>
          endpoint.received.filter(
            (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
          ).length,
      )
      .toBe(2);
    const byConversation = (conversation: string) =>
      roots.find(
        (item) =>
          (item.body.extra as { metadata: { conversation_id: string } }).metadata
            .conversation_id === conversation,
      )!.body.id;
    const alphaRoot = byConversation(session.id);
    const betaRoot = byConversation(second.id);
    expect(
      endpoint.received.find((item) => item.path === `/runs/${alphaRoot}`)?.body,
    ).toMatchObject({ error: 'observed_canceled', extra: { metadata: { status: 'canceled' } } });
    expect(endpoint.received.find((item) => item.path === `/runs/${betaRoot}`)?.body).toMatchObject(
      {
        extra: { metadata: { status: 'completed' } },
        outputs: { view: { modelReply: 'Svar för Beta' } },
      },
    );
    for (const conversation of [session.id, second.id]) {
      const rootId = byConversation(conversation);
      const attempt = endpoint.received.find(
        (item) =>
          item.method === 'POST' && item.body.run_type === 'llm' && item.body.trace_id === rootId,
      )!;
      expect(attempt.body.parent_run_id).toBe(rootId);
      expect(attempt.body.inputs).toMatchObject({ input: expect.any(Array) });
      expect(
        endpoint.received.filter((item) => item.path === `/runs/${attempt.body.id}`),
      ).toHaveLength(1);
    }
    const late = await (
      await client.get(`${path}/text-assistant/${session.id}/messages/same-request`)
    ).json();
    expect(late).toMatchObject({ taskStatus: 'canceled', canceled: true });
    expect(JSON.stringify(late)).not.toContain('Svar för Alfa');
    expect(
      endpoint.received.filter((item) => item.method === 'POST' && item.body.run_type === 'llm'),
    ).toHaveLength(2);
  } finally {
    for (const release of releases.values()) release();
    await other.dispose();
  }
});

test('an authenticated task reaches ingestion through the real SDK with one backend owner and honest lifecycle', async () => {
  const { path, session } = await setup();
  const before = await (await client.get(`${path}/map`)).json();
  expect(await send(path, session)).toMatchObject({ phase: 'ready', modelReply: 'Lina är läst.' });
  await expect
    .poll(
      () =>
        endpoint.received.filter(
          (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
        ).length,
    )
    .toBe(1);
  const roots = endpoint.received.filter(
    (item) => item.method === 'POST' && item.body.parent_run_id === undefined,
  );
  expect(roots).toHaveLength(1);
  const root = roots[0].body;
  expect(root).toMatchObject({
    name: 'Skyttel backend task',
    run_type: 'chain',
    session_name: 'synthetic-diagnostics',
    extra: {
      metadata: {
        owner: 'backend',
        conversation_id: session.id,
        request_id: 'read-lina',
        status: 'incomplete',
      },
    },
  });
  expect(root.id).toBe(root.trace_id);
  expect(root.end_time).toBeUndefined();
  expect(endpoint.received.find((item) => item.path === `/runs/${root.id}`)?.body).toMatchObject({
    extra: { metadata: { status: 'completed' } },
  });
  expect(endpoint.received.every((item) => item.bytes <= 1024 * 1024)).toBe(true);
  expect(JSON.stringify(endpoint.received)).not.toMatch(
    /synthetic-trace-secret|synthetic-model-key|runtime|LANGSMITH/,
  );
  expect(await (await client.get(`${path}/map`)).json()).toEqual(before);
  expect(
    await (
      await client.get(
        `${app.origin}/api/operator/costs?month=${new Date().toISOString().slice(0, 7)}`,
      )
    ).json(),
  ).toMatchObject({
    terra: {
      attempts: 2,
      usage: {
        input: { known: 240 },
        output: { known: 60 },
      },
    },
  });
  const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
  expect(health).toMatchObject({ state: 'sending', droppedEvents: 0, lastError: null });
  expect(health.lastSuccessfulDelivery).toBeTypeOf('number');
});

test('disabled sending survives restart while the same task outcome and costs remain available', async () => {
  const { path } = await setup();
  expect(
    (
      await client.post(`${app.origin}/api/operator/tracing`, {
        headers: { origin: app.origin },
        data: { action: 'disable' },
      })
    ).status(),
  ).toBe(200);
  await restart();
  const start = await client.post(`${path}/text-assistant`, {
    headers: { origin: app.origin },
    data: approvedForVisit,
  });
  const before = await (await client.get(`${path}/map`)).json();
  expect(await send(path, await start.json())).toMatchObject({
    phase: 'ready',
    modelReply: 'Lina är läst.',
  });
  expect(await (await client.get(`${path}/map`)).json()).toEqual(before);
  expect(
    await (
      await client.get(
        `${app.origin}/api/operator/costs?month=${new Date().toISOString().slice(0, 7)}`,
      )
    ).json(),
  ).toMatchObject({
    terra: {
      attempts: 2,
      usage: {
        input: { known: 240 },
        output: { known: 60 },
      },
    },
  });
  expect(endpoint.received).toEqual([]);
  expect(await (await client.get(`${app.origin}/api/operator/tracing`)).json()).toMatchObject({
    state: 'disabled',
    droppedEvents: 0,
    lastError: null,
  });
});

test('temporary ingestion failure gets at most two retries per event without changing work or costs', async () => {
  const spool = await mkdtemp(join(tmpdir(), 'synthetic-sdk-spool-'));
  vi.stubEnv('LANGSMITH_FAILED_TRACES_DIR', spool);
  try {
    const { path, session } = await setup({}, (_request, response) =>
      response.writeHead(503).end('synthetic provider payload and credential details'),
    );
    const before = await (await client.get(`${path}/map`)).json();
    expect(await send(path, session)).toMatchObject({
      phase: 'ready',
      modelReply: 'Lina är läst.',
    });
    await expect
      .poll(
        () =>
          endpoint.received.filter(
            (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
          ).length,
      )
      .toBe(3);
    const starts = endpoint.received.filter(
      (item) => item.method === 'POST' && item.body.parent_run_id === undefined,
    );
    expect(starts).toHaveLength(3);
    expect(new Set(starts.map((item) => item.body.id)).size).toBe(1);
    expect(
      endpoint.received.filter((item) => item.path === `/runs/${starts[0].body.id}`),
    ).toHaveLength(3);
    const attempts = endpoint.received.filter(
      (item) => item.method === 'POST' && item.body.run_type === 'llm',
    );
    const identities = new Set(attempts.map((item) => item.body.id));
    expect(identities.size).toBe(2);
    for (const id of identities)
      expect(attempts.filter((item) => item.body.id === id)).toHaveLength(3);
    expect(await (await client.get(`${path}/map`)).json()).toEqual(before);
    const costs = await (
      await client.get(
        `${app.origin}/api/operator/costs?month=${new Date().toISOString().slice(0, 7)}`,
      )
    ).json();
    expect(costs.terra).toMatchObject({
      attempts: 2,
      usage: {
        input: { known: 240 },
        output: { known: 60 },
      },
    });
    const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
    expect(health).toMatchObject({ lastError: 'network', lastSuccessfulDelivery: null });
    expect(endpoint.maximumActive).toBe(1);
    expect(JSON.stringify(health)).not.toMatch(/synthetic|provider|payload|credential/);
    expect(await readdir(spool)).toEqual([]);
  } finally {
    await rm(spool, { recursive: true, force: true });
  }
});

test('operator opt-out cancels active delivery and re-enabling never replays discarded events', async () => {
  let blocked = true;
  const { path, session } = await setup({}, (_request, response) => {
    if (!blocked) response.writeHead(204).end();
  });
  expect(await send(path, session)).toMatchObject({ phase: 'ready' });
  await expect.poll(() => endpoint.received.length).toBe(1);
  const oldRoot = endpoint.received[0].body.id;
  const change = (action: string) =>
    client.post(`${app.origin}/api/operator/tracing`, {
      headers: { origin: app.origin },
      data: { action },
    });
  expect((await change('disable')).status()).toBe(200);
  await expect.poll(() => endpoint.received[0].closed).toBe(true);
  blocked = false;
  expect((await change('enable')).status()).toBe(200);
  const current = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
  expect(await send(path, current, 'new-request')).toMatchObject({ phase: 'ready' });
  await expect
    .poll(
      () =>
        endpoint.received.filter(
          (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
        ).length,
    )
    .toBe(1);
  expect(endpoint.received.some((item) => item.path === `/runs/${oldRoot}`)).toBe(false);
  expect(endpoint.received.filter((item) => item.body.id === oldRoot)).toHaveLength(1);
  const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
  expect(health.droppedEvents).toBeGreaterThanOrEqual(2);
  expect(health.lastError).toBeNull();
});

test.each(['LANGSMITH_AGENT_ID', 'LANGSMITH_AGENT_ENVIRONMENT'])(
  'unsupported ambient %s never leaks through SDK constructor diagnostics',
  async (name) => {
    const warnings: unknown[][] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warnings.push(args);
    });
    vi.stubEnv('LANGSMITH_AGENT_ID', 'synthetic-agent');
    vi.stubEnv('LANGSMITH_AGENT_ENVIRONMENT', 'production');
    vi.stubEnv(name, 'synthetic-ambient-secret /invalid');
    const { path, session } = await setup();
    expect(await send(path, session)).toMatchObject({ phase: 'ready' });
    expect(JSON.stringify(warnings)).not.toContain('synthetic-ambient-secret');
    const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
    expect(health).toMatchObject({ connected: false, state: 'not_connected', lastError: 'export' });
    expect(endpoint.received).toEqual([]);
  },
);

test.each([
  { apiKey: '' },
  { apiKey: '""' },
  { apiKey: "'   '" },
  { project: '' },
  { endpoint: '' },
  { endpoint: "'   '" },
  { endpoint: '\'""\'' },
])(
  'invalid explicit sending configuration %j cannot fall back to SDK defaults',
  async (invalid) => {
    vi.stubEnv('LANGSMITH_API_KEY', 'synthetic-ambient-key');
    vi.stubEnv('LANGSMITH_PROJECT', 'synthetic-ambient-project');
    const { path, session } = await setup({
      traceDelivery: (sending) =>
        langSmithDelivery({
          endpoint: endpoint.url,
          project: 'synthetic-diagnostics',
          apiKey: 'synthetic-trace-secret',
          ...invalid,
        })(sending),
    });
    expect(await send(path, session)).toMatchObject({ phase: 'ready' });
    const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
    expect(health).toMatchObject({ connected: false, state: 'not_connected', lastError: 'export' });
    expect(endpoint.received).toEqual([]);
  },
);

test.each(['\'""\'', '\'"   "\''])(
  'nested quoted-empty key %j cannot activate a CLI profile credential',
  async (apiKey) => {
    const directory = await mkdtemp(join(tmpdir(), 'synthetic-sdk-profile-'));
    const profile = join(directory, 'config.json');
    const contents = JSON.stringify({
      current_profile: 'default',
      profiles: {
        default: {
          api_url: 'http://127.0.0.1:9',
          api_key: 'synthetic-cli-profile-key',
        },
      },
    });
    await writeFile(profile, contents);
    vi.stubEnv('LANGSMITH_CONFIG_FILE', profile);
    vi.stubEnv('LANGSMITH_API_KEY', '');
    vi.stubEnv('LANGCHAIN_API_KEY', '');
    const requestedKeys: unknown[] = [];
    try {
      const { path, session } = await setup(
        {
          traceDelivery: (sending) =>
            langSmithDelivery({ endpoint: endpoint.url, project: 'synthetic-diagnostics', apiKey })(
              sending,
            ),
        },
        (request, response) => {
          requestedKeys.push(request.headers['x-api-key']);
          response.writeHead(204).end();
        },
      );
      expect(await send(path, session)).toMatchObject({ phase: 'ready' });
      expect(requestedKeys).not.toContain('synthetic-cli-profile-key');
      expect(await (await client.get(`${app.origin}/api/operator/tracing`)).json()).toMatchObject({
        connected: false,
        state: 'not_connected',
        lastError: 'export',
      });
      expect(endpoint.received).toEqual([]);
      expect(await readFile(profile, 'utf8')).toBe(contents);
      expect(await readdir(directory)).toEqual(['config.json']);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test.each([
  { status: 401, reason: 'credentials' },
  { status: 403, reason: 'credentials' },
  { status: 429, reason: 'quota' },
])(
  'ingestion $status suspends durably without backlog until explicit operator recovery',
  async ({ status, reason }) => {
    let failing = true;
    const { path, session } = await setup({}, (_request, response) =>
      response
        .writeHead(failing ? status : 204)
        .end(failing ? 'synthetic-secret-error' : undefined),
    );
    expect(await send(path, session)).toMatchObject({ phase: 'ready' });
    const health = async () => (await client.get(`${app.origin}/api/operator/tracing`)).json();
    await expect.poll(async () => (await health()).state).toBe('suspended');
    expect(await health()).toMatchObject({ suspension: reason, lastError: reason });
    expect(endpoint.received).toHaveLength(1);
    const oldRoot = endpoint.received[0].body.id;
    await restart();
    expect(await health()).toMatchObject({
      state: 'suspended',
      suspension: reason,
      droppedEvents: 0,
      lastError: null,
      lastSuccessfulDelivery: null,
    });
    const change = (action: string) =>
      client.post(`${app.origin}/api/operator/tracing`, {
        headers: { origin: app.origin },
        data: { action },
      });
    failing = false;
    await change('enable');
    expect((await health()).state).toBe('suspended');
    const start = await client.post(`${path}/text-assistant`, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    });
    const fresh = await start.json();
    expect(await send(path, fresh, 'suspended-request')).toMatchObject({ phase: 'ready' });
    expect(endpoint.received).toHaveLength(1);
    expect((await change('restart')).status()).toBe(200);
    const current = await (await client.get(`${path}/text-assistant/${fresh.id}`)).json();
    expect(await send(path, current, 'recovered-request')).toMatchObject({ phase: 'ready' });
    await expect
      .poll(
        () =>
          endpoint.received.filter(
            (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
          ).length,
      )
      .toBe(1);
    expect(endpoint.received.some((item) => item.path === `/runs/${oldRoot}`)).toBe(false);
    expect((await health()).lastSuccessfulDelivery).toBeTypeOf('number');
  },
);

test.each(['throw', 'reject', 'mutate'])(
  'a caller observer can %s without changing the independent SDK projection or application result',
  async (failure) => {
    const { path, session } = await setup({
      observe: (event) => {
        if (failure === 'throw') throw new Error('synthetic-observer-secret');
        if (failure === 'reject') return Promise.reject(new Error('synthetic-observer-secret'));
        event.data = { secret: 'synthetic-mutated-content' };
        if (event.context) event.context.spanId = 'synthetic-mutated-id';
      },
    });
    expect(await send(path, session)).toMatchObject({
      phase: 'ready',
      modelReply: 'Lina är läst.',
    });
    await expect
      .poll(() =>
        endpoint.received.some(
          (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
        ),
      )
      .toBe(true);
    expect(endpoint.received.some((item) => item.body.name === 'read_map')).toBe(true);
    expect(JSON.stringify(endpoint.received)).not.toMatch(/synthetic-observer|synthetic-mutated/);
    expect(await (await client.get(`${app.origin}/api/operator/tracing`)).json()).toMatchObject({
      droppedEvents: 0,
      lastError: null,
    });
  },
);

test('non-JSON content fails through the production delivery hook without SDK substitution or persistence', async () => {
  let observe!: ObserveAssistant;
  const { path, session } = await setup({
    traceDelivery: (sending) => {
      const adapter = langSmithDelivery({
        endpoint: endpoint.url,
        project: 'synthetic-diagnostics',
        apiKey: 'synthetic-trace-secret',
      })(sending);
      observe = adapter.observe!;
      return adapter;
    },
  });
  // These values cannot cross JSON HTTP/MCP; invoke the same exported delivery
  // hook used by application composition, then inspect health over real HTTP.
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  for (const args of [cyclic, { invalid: BigInt(1) }])
    observe({
      at: Date.now(),
      sessionId: session.id,
      taskId: 'synthetic-invalid-task',
      context: backendTaskObservationContext(session.id, 'invalid-json', 0),
      kind: 'mcp_started',
      data: { name: 'synthetic-invalid-content', args },
    });
  expect(await (await client.get(`${app.origin}/api/operator/tracing`)).json()).toMatchObject({
    droppedEvents: 2,
    lastError: 'export',
  });
  expect(await send(path, session)).toMatchObject({ phase: 'ready' });
  await expect
    .poll(() =>
      endpoint.received.some(
        (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
      ),
    )
    .toBe(true);
  expect(JSON.stringify(endpoint.received)).not.toContain('synthetic-invalid-content');
});

test('explicit SDK settings prevent ambient masking, sampling, metadata and destination changes', async () => {
  for (const [name, value] of Object.entries({
    LANGSMITH_HIDE_INPUTS: 'true',
    LANGSMITH_HIDE_OUTPUTS: 'true',
    LANGSMITH_TRACING_SAMPLING_RATE: '0',
    LANGSMITH_TRACING_MODE: 'otel',
    LANGSMITH_METADATA: '{"secret":"synthetic-ambient-metadata"}',
    LANGSMITH_REVISION_ID: 'synthetic-ambient-revision',
    LANGSMITH_DEBUG: 'true',
    LANGSMITH_PROJECT: 'synthetic-ambient-project',
    LANGSMITH_ENDPOINT: 'http://invalid.local',
  }))
    vi.stubEnv(name, value);
  const { path, session } = await setup();
  expect(await send(path, session)).toMatchObject({ phase: 'ready' });
  await expect
    .poll(() =>
      endpoint.received.some(
        (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
      ),
    )
    .toBe(true);
  const tool = endpoint.received.find((item) => item.body.name === 'read_map');
  expect(tool?.body.inputs).toEqual({ query: 'Lina' });
  expect(
    endpoint.received.find((item) => item.path === `/runs/${tool?.body.id}`)?.body.outputs,
  ).toMatchObject({ content: [{ type: 'text' }] });
  expect(JSON.stringify(endpoint.received)).not.toMatch(/synthetic-ambient|runtime/);
});

test('a stale credential response after disable and enable cannot suspend new delivery', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  const { path, session } = await setup({
    traceDelivery: (sending) =>
      langSmithDelivery({
        endpoint: endpoint.url,
        project: 'synthetic-diagnostics',
        apiKey: 'synthetic-trace-secret',
        fetch: async (input, init) => {
          const response = await fetch(input, init);
          if (!first) return response;
          first = false;
          await response.body?.cancel();
          await waiting;
          return new Response(null, { status: 401 });
        },
      })(sending),
  });
  try {
    await send(path, session);
    await expect.poll(() => endpoint.received.length).toBe(1);
    const oldRoot = endpoint.received[0].body.id;
    for (const action of ['disable', 'enable'])
      expect(
        (
          await client.post(`${app.origin}/api/operator/tracing`, {
            headers: { origin: app.origin },
            data: { action },
          })
        ).status(),
      ).toBe(200);
    release();
    const current = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
    await send(path, current, 'fresh-generation');
    await expect
      .poll(() =>
        endpoint.received.some(
          (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
        ),
      )
      .toBe(true);
    expect(endpoint.received.filter((item) => item.body.trace_id === oldRoot)).toHaveLength(1);
    expect(await (await client.get(`${app.origin}/api/operator/tracing`)).json()).toMatchObject({
      state: 'sending',
      suspension: null,
      lastError: null,
    });
  } finally {
    release();
  }
});

test('streaming ingestion response content is canceled without collecting or logging it', async () => {
  const { path, session } = await setup({}, (_request, response) => {
    response.writeHead(503);
    response.write('synthetic-streaming-response-secret');
  });
  expect(await send(path, session)).toMatchObject({ phase: 'ready' });
  await expect
    .poll(
      () =>
        endpoint.received.filter(
          (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
        ).length,
    )
    .toBe(3);
  expect(endpoint.received.every((item) => item.closed)).toBe(true);
  expect(endpoint.maximumActive).toBe(1);
  expect(
    JSON.stringify(await (await client.get(`${app.origin}/api/operator/tracing`)).json()),
  ).not.toContain('synthetic-streaming-response-secret');
});

test('the upload timeout also bounds a response body that never finishes cancellation', async () => {
  let first = true;
  const { path, session } = await setup({
    traceDelivery: (sending) =>
      langSmithDelivery({
        endpoint: endpoint.url,
        project: 'synthetic-diagnostics',
        apiKey: 'synthetic-trace-secret',
        fetch: async (input, init) => {
          if (!first) return fetch(input, init);
          first = false;
          return new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }));
        },
      })(sending),
  });
  expect(await send(path, session)).toMatchObject({ phase: 'ready' });
  await expect
    .poll(
      () =>
        endpoint.received.some(
          (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
        ),
      { timeout: 6500 },
    )
    .toBe(true);
  expect(await (await client.get(`${app.origin}/api/operator/tracing`)).json()).toMatchObject({
    lastError: 'timeout',
    droppedEvents: 0,
  });
}, 10000);

test('a failed provider task ends its own SDK span as failed without exposing provider errors', async () => {
  const { path, session } = await setup({
    modelFetch: async () => new Response('synthetic-provider-failure-secret', { status: 503 }),
  });
  const before = await (await client.get(`${path}/map`)).json();
  expect(
    (
      await client.post(`${path}/text-assistant/${session.id}/messages`, {
        headers: { origin: app.origin },
        data: {
          requestId: 'failed-provider',
          revision: session.revision,
          draftVersion: session.review.version,
          contentVersion: session.review.contentVersion,
          text: 'Läs Lina.',
        },
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(() =>
      endpoint.received.some(
        (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
      ),
    )
    .toBe(true);
  expect(
    endpoint.received.find(
      (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
    )?.body,
  ).toMatchObject({ error: 'observed_failed', extra: { metadata: { status: 'failed' } } });
  expect(
    await (
      await client.get(`${path}/text-assistant/${session.id}/messages/failed-provider`)
    ).json(),
  ).toMatchObject({ taskStatus: 'completed', phase: 'error', error: 'assistant_provider_failed' });
  expect(await (await client.get(`${path}/map`)).json()).toEqual(before);
  expect(JSON.stringify(endpoint.received)).not.toContain('synthetic-provider-failure-secret');
  const attempt = endpoint.received.find(
    (item) => item.method === 'POST' && item.body.run_type === 'llm',
  )!;
  expect(attempt.body.inputs).toMatchObject({
    instructions: expect.any(String),
    input: expect.any(Array),
  });
  expect(
    endpoint.received.find((item) => item.path === `/runs/${attempt.body.id}`)?.body,
  ).toMatchObject({ error: 'observed_failed', extra: { metadata: { outcome: 'failed' } } });
});

test('an incomplete model output remains incomplete evidence and cannot execute its returned save action', async () => {
  const action = modelTool('save_draft', {
    version: 0,
    contentVersion: 1,
    operationId: 'incomplete-must-not-save',
  });
  const { path, session } = await setup({
    modelFetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      return Response.json(
        {
          id: 'resp_incomplete',
          status: 'incomplete',
          model: request.model,
          output: [action],
          incomplete_details: { reason: 'max_output_tokens' },
          metadata: { credential: 'excluded-partial-secret' },
          error: { message: 'excluded-partial-error' },
        },
        {
          headers: {
            'x-request-id': 'request_incomplete',
            authorization: 'excluded-partial-header',
          },
        },
      );
    },
  });
  const result = await send(path, session);
  expect(result).toMatchObject({ phase: 'error', error: 'assistant_provider_failed' });
  expect(result.receipt).toBeUndefined();
  await expect
    .poll(() =>
      endpoint.received.some(
        (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
      ),
    )
    .toBe(true);
  const attempt = endpoint.received.find(
    (item) => item.method === 'POST' && item.body.run_type === 'llm',
  )!;
  expect(
    endpoint.received.find((item) => item.path === `/runs/${attempt.body.id}`)?.body,
  ).toMatchObject({
    error: 'observed_incomplete',
    extra: { metadata: { status: 'incomplete', outcome: 'incomplete' } },
    outputs: { status: 'incomplete', output: [action] },
  });
  expect(endpoint.received.some((item) => item.body.name === 'save_draft')).toBe(false);
  expect((await (await client.get(`${path}/map/history`)).json()).history).toEqual([]);
  expect(JSON.stringify(endpoint.received)).not.toContain('excluded-partial');
});

test.each(['complete', 'cancel'])(
  'the five-second exporter deadline leaves a slow model free to %s under its caller signal',
  async (ending) => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let modelSignal: AbortSignal | null | undefined;
    const held: ServerResponse[] = [];
    let blocked = true;
    const model = textModel(async (_body, signal) => {
      modelSignal = signal;
      await waiting;
      return [modelMessage('Ett långsamt svar.')];
    });
    const { path, session } = await setup({ modelFetch: model.provider }, (_request, response) => {
      if (blocked) held.push(response);
      else response.writeHead(204).end();
    });
    try {
      expect(
        (
          await client.post(`${path}/text-assistant/${session.id}/messages`, {
            headers: { origin: app.origin },
            data: {
              requestId: 'slow-model',
              revision: session.revision,
              draftVersion: session.review.version,
              contentVersion: session.review.contentVersion,
              text: 'Svara när du är klar.',
            },
          })
        ).status(),
      ).toBe(202);
      await expect.poll(() => modelSignal !== undefined).toBe(true);
      await expect.poll(() => endpoint.received.length).toBe(1);
      await expect.poll(() => endpoint.received[0].closed, { timeout: 6500 }).toBe(true);
      expect(modelSignal?.aborted).toBe(false);
      expect((await (await client.get(`${path}/text-assistant/${session.id}`)).json()).phase).toBe(
        'working',
      );
      const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
      expect(health.lastError).toBe('timeout');
      blocked = false;
      for (const response of held) if (!response.destroyed) response.writeHead(204).end();
      if (ending === 'cancel') {
        expect(
          (
            await client.post(`${path}/text-assistant/${session.id}/cancel`, {
              headers: { origin: app.origin },
              data: { all: true },
            })
          ).status(),
        ).toBe(200);
        expect(modelSignal?.aborted).toBe(true);
      }
    } finally {
      release();
    }
    await expect
      .poll(
        () =>
          endpoint.received.filter(
            (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
          ).length,
      )
      .toBe(1);
    expect(
      endpoint.received.find(
        (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
      )?.body.extra,
    ).toMatchObject({ metadata: { status: ending === 'cancel' ? 'canceled' : 'completed' } });
    const result = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
    if (ending === 'complete')
      expect(result).toMatchObject({ phase: 'ready', modelReply: 'Ett långsamt svar.' });
    else {
      const receipt = await (
        await client.get(`${path}/text-assistant/${session.id}/messages/slow-model`)
      ).json();
      expect(receipt).toMatchObject({ taskStatus: 'canceled', canceled: true });
      expect(JSON.stringify(receipt)).not.toContain('Ett långsamt svar.');
    }
  },
  20000,
);

test.each(['deliver', 'discard'])(
  'shutdown can %s accepted events within two seconds and restart never replays a backlog',
  async (ending) => {
    const held: ServerResponse[] = [];
    let blocked = true;
    const { path, session } = await setup({}, (_request, response) => {
      if (blocked) held.push(response);
      else response.writeHead(204).end();
    });
    expect(await send(path, session)).toMatchObject({ phase: 'ready' });
    await expect.poll(() => endpoint.received.length).toBe(1);
    const rootId = endpoint.received[0].body.id;
    const started = performance.now();
    await restart(() => {
      if (ending === 'deliver') {
        blocked = false;
        for (const response of held) if (!response.destroyed) response.writeHead(204).end();
      }
    });
    expect(performance.now() - started).toBeLessThan(2500);
    await expect.poll(() => endpoint.received[0].closed).toBe(true);
    expect((endpoint.received[0].closedAt ?? Infinity) - started).toBeLessThan(2500);
    expect(endpoint.received.filter((item) => item.path === `/runs/${rootId}`)).toHaveLength(
      ending === 'deliver' ? 1 : 0,
    );
    blocked = false;
    const start = await client.post(`${path}/text-assistant`, {
      headers: { origin: app.origin },
      data: approvedForVisit,
    });
    expect(await send(path, await start.json(), 'after-restart')).toMatchObject({ phase: 'ready' });
    await expect
      .poll(
        () =>
          endpoint.received.filter(
            (item) =>
              item.method === 'PATCH' &&
              item.body.parent_run_id === undefined &&
              item.path !== `/runs/${rootId}`,
          ).length,
      )
      .toBe(1);
    expect(endpoint.received.filter((item) => item.path === `/runs/${rootId}`)).toHaveLength(
      ending === 'deliver' ? 1 : 0,
    );
  },
  10000,
);

test('reviewed MCP text and model attempts keep exact content, explicit parentage and final serialized bytes', async () => {
  const text = 'å😀"\\\n'.repeat(4000);
  let admitted = '';
  const { path, session } = await setup({
    assistantDispatch: async (incoming, dispatch) => {
      const rpc = await incoming
        .clone()
        .json()
        .catch(() => null);
      const response = await dispatch(incoming);
      if (rpc?.params?.name !== 'read_map' || rpc.params.arguments?.query !== 'Lina')
        return response;
      const envelope = await response.json();
      admitted = JSON.stringify({ ...JSON.parse(envelope.result.content[0].text), summary: text });
      envelope.result.content[0].text = admitted;
      envelope.result._meta = { headers: 'synthetic-transport-secret', audio: 'synthetic-audio' };
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      return Response.json(envelope, { status: response.status, headers });
    },
  });
  expect(await send(path, session)).toMatchObject({ phase: 'ready' });
  await expect
    .poll(() =>
      endpoint.received.some(
        (item) =>
          (item.body.outputs as { content?: { text?: string }[] })?.content?.[0]?.text ===
            admitted && admitted.length > 0,
      ),
    )
    .toBe(true);
  const root = endpoint.received.find((item) => item.body.name === 'Skyttel backend task')?.body;
  const tool = endpoint.received.find(
    (item) => item.method === 'POST' && item.body.name === 'read_map',
  )?.body;
  expect(tool).toMatchObject({
    run_type: 'tool',
    parent_run_id: root?.id,
    trace_id: root?.id,
    inputs: { query: 'Lina' },
  });
  const result = endpoint.received.find((item) => item.path === `/runs/${tool?.id}`);
  expect(result?.body.outputs).toMatchObject({ content: [{ type: 'text', text: admitted }] });
  expect(result?.bytes).toBe(Buffer.byteLength(JSON.stringify(result?.body)));
  expect(result?.bytes).toBeGreaterThan(Buffer.byteLength(text));
  const models = endpoint.received.filter(
    (item) => item.method === 'POST' && item.body.run_type === 'llm',
  );
  expect(models).toHaveLength(2);
  for (const model of models) {
    expect(model.body).toMatchObject({ parent_run_id: root?.id, trace_id: root?.id });
    expect(endpoint.received.filter((item) => item.path === `/runs/${model.body.id}`)).toHaveLength(
      1,
    );
  }
  expect(JSON.stringify(endpoint.received)).not.toMatch(
    /synthetic-transport-secret|synthetic-audio|unreviewed/,
  );
});

test('an oversized MCP event is dropped with a gap instead of shortening or uploading its content', async () => {
  const oversized = 'synthetic-large-text-'.repeat(60000);
  let admitted = '';
  let turn = 0;
  const model = textModel(() =>
    turn++ === 0 ? [modelTool('read_map', { query: 'Lina' })] : [modelMessage('Lina är läst.')],
  );
  const { path, session } = await setup({
    modelFetch: model.provider,
    assistantDispatch: async (incoming, dispatch) => {
      const rpc = await incoming
        .clone()
        .json()
        .catch(() => null);
      const response = await dispatch(incoming);
      if (rpc?.params?.name !== 'read_map' || rpc.params.arguments?.query !== 'Lina')
        return response;
      const envelope = await response.json();
      admitted = JSON.stringify({
        ...JSON.parse(envelope.result.content[0].text),
        summary: oversized,
      });
      envelope.result.content[0].text = admitted;
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      return Response.json(envelope, { status: response.status, headers });
    },
  });
  await send(path, session);
  const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
  // The same exact MCP text also enters the following model request. Both
  // complete evidence events exceed the limit; neither may be shortened.
  expect(health).toMatchObject({ droppedEvents: 2, lastError: 'oversized' });
  expect(Buffer.byteLength(JSON.stringify(model.requests[1]))).toBeGreaterThan(1024 * 1024);
  expect(JSON.stringify(model.requests[1].input)).toContain(
    admitted.replaceAll('"', '\\"').slice(0, 50),
  );
  expect(Buffer.byteLength(admitted)).toBeGreaterThan(1024 * 1024);
  expect(endpoint.received.every((item) => item.bytes <= 1024 * 1024)).toBe(true);
  expect(
    endpoint.received.some((item) => JSON.stringify(item.body).includes('synthetic-large-text-')),
  ).toBe(false);
  const tool = endpoint.received.find(
    (item) => item.method === 'POST' && item.body.name === 'read_map',
  );
  expect(tool?.body.extra).toMatchObject({ metadata: { status: 'incomplete' } });
  expect(endpoint.received.some((item) => item.path === `/runs/${tool?.body.id}`)).toBe(false);
  expect(JSON.stringify(health)).not.toContain('synthetic-large-text-');
  await expect
    .poll(
      () =>
        endpoint.received.filter(
          (item) => item.method === 'PATCH' && item.body.parent_run_id === undefined,
        ).length,
    )
    .toBe(1);
  expect(
    endpoint.received.filter((item) => item.method === 'POST' && item.body.run_type === 'llm'),
  ).toHaveLength(1);
  expect(
    endpoint.received.filter(
      (item) =>
        item.method === 'PATCH' &&
        (item.body.extra as { metadata?: { provider_call_id?: string } })?.metadata
          ?.provider_call_id,
    ),
  ).toHaveLength(2);
});

test('many small MCP text entries exceed one event budget as a whole without changing the task', async () => {
  const { path, session } = await setup({
    assistantDispatch: async (incoming, dispatch) => {
      const rpc = await incoming
        .clone()
        .json()
        .catch(() => null);
      const response = await dispatch(incoming);
      if (rpc?.params?.name !== 'read_map' || rpc.params.arguments?.query !== 'Lina')
        return response;
      const envelope = await response.json();
      envelope.result.content.push(
        ...Array.from({ length: 60000 }, () => ({ type: 'text', text: 'x' })),
      );
      const headers = new Headers(response.headers);
      headers.delete('content-length');
      return Response.json(envelope, { status: response.status, headers });
    },
  });
  expect(await send(path, session)).toMatchObject({ phase: 'ready' });
  const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
  expect(health).toMatchObject({ droppedEvents: 1, lastError: 'oversized' });
  expect(endpoint.received.every((item) => item.bytes <= 1024 * 1024)).toBe(true);
  const tool = endpoint.received.find(
    (item) => item.method === 'POST' && item.body.name === 'read_map',
  );
  expect(endpoint.received.some((item) => item.path === `/runs/${tool?.body.id}`)).toBe(false);
});

test.each([
  { resource: 'events', calls: 600, textBytes: 0 },
  { resource: 'serialized bytes', calls: 220, textBytes: 80 * 1024 },
])(
  'the $resource capacity includes pending and active SDK work without blocking the task',
  async ({ resource, calls, textBytes }) => {
    const clock = Date.now();
    const held: ServerResponse[] = [];
    let finishTask = () => {};
    const taskCompleted = new Promise<void>((resolve) => {
      finishTask = resolve;
    });
    let blocked = true;
    let observed = 0;
    let turn = 0;
    const model = textModel(() =>
      turn++ === 0
        ? Array.from({ length: calls }, (_, index) =>
            modelTool('read_map', { query: `capacity-${index}` }),
          )
        : [modelMessage('Läst.')],
    );
    const { path, session } = await setup(
      {
        now: () => clock,
        modelFetch: model.provider,
        observe: (event) => {
          if (
            event.context?.owner === 'backend' &&
            event.taskId &&
            [
              'task_started',
              'task_completed',
              'model_attempt',
              'mcp_started',
              'mcp_completed',
              'mcp_failed',
            ].includes(event.kind)
          )
            observed++;
          if (event.kind === 'task_completed') finishTask();
        },
        assistantDispatch: async (incoming, dispatch) => {
          const rpc = await incoming
            .clone()
            .json()
            .catch(() => null);
          const response = await dispatch(incoming);
          if (
            !textBytes ||
            rpc?.params?.name !== 'read_map' ||
            !String(rpc.params.arguments?.query).startsWith('capacity-')
          )
            return response;
          const envelope = await response.json();
          envelope.result.content[0].text = JSON.stringify({
            ...JSON.parse(envelope.result.content[0].text),
            summary: 'x'.repeat(textBytes),
          });
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          return Response.json(envelope, { status: response.status, headers });
        },
      },
      (_request, response) => {
        if (blocked) held.push(response);
        else response.writeHead(204).end();
      },
    );
    // Capacity is independent of how long real HTTP/MCP work takes under
    // coverage. Keep both exporter and SDK deadlines on the paused test clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(
        () => controller.abort(new DOMException('Synthetic timeout', 'TimeoutError')),
        milliseconds,
      ).unref();
      return controller.signal;
    });
    const requestId = 'read-capacity';
    expect(
      (
        await client.post(`${path}/text-assistant/${session.id}/messages`, {
          headers: { origin: app.origin },
          data: {
            requestId,
            revision: session.revision,
            draftVersion: session.review.version,
            contentVersion: session.review.contentVersion,
            text: 'Läs Lina.',
          },
        })
      ).status(),
    ).toBe(202);
    // Vitest polling advances fake timers. Await the existing observation
    // boundary instead, then verify completion through authenticated HTTP.
    await taskCompleted;
    expect(
      await (await client.get(`${path}/text-assistant/${session.id}/messages/${requestId}`)).json(),
    ).toMatchObject({ taskStatus: 'completed' });
    const health = async () => (await client.get(`${app.origin}/api/operator/tracing`)).json();
    const before = await health();
    expect(before.lastError).toBe('capacity');
    expect(before.droppedEvents).toBeGreaterThan(0);
    if (resource === 'events') {
      expect(observed).toBeGreaterThan(1000);
      expect(before.droppedEvents).toBe(observed - 1000);
    } else expect(observed).toBeLessThan(1000);
    blocked = false;
    for (const response of held) if (!response.destroyed) response.writeHead(204).end();
    const accepted = () =>
      new Map(
        endpoint.received
          .filter((item) => item.accepted)
          .map((item) => [`${item.method}:${item.body.id ?? item.path}`, item]),
      );
    await expect
      .poll(async () => accepted().size + (await health()).droppedEvents, { timeout: 15000 })
      .toBe(observed);
    if (resource === 'events') expect(accepted().size).toBe(1000);
    expect([...accepted().values()].reduce((sum, item) => sum + item.bytes, 0)).toBeLessThanOrEqual(
      16 * 1024 * 1024,
    );
    expect(endpoint.received.every((item) => item.bytes <= 1024 * 1024)).toBe(true);
    expect(endpoint.maximumActive).toBe(1);
  },
  40000,
);

test('sixty-second expiry discards pending and active old evidence before admitting new work', async () => {
  let clock = Date.now();
  let blocked = true;
  const held: ServerResponse[] = [];
  const { path, session } = await setup({ now: () => clock }, (_request, response) => {
    if (blocked) held.push(response);
    else response.writeHead(204).end();
  });
  expect(await send(path, session)).toMatchObject({ phase: 'ready' });
  await expect.poll(() => endpoint.received.length).toBe(1);
  const oldRoot = endpoint.received[0].body.id;
  clock += 60001;
  const current = await (await client.get(`${path}/text-assistant/${session.id}`)).json();
  expect(await send(path, current, 'fresh-after-expiry')).toMatchObject({ phase: 'ready' });
  await expect.poll(() => endpoint.received[0].closed).toBe(true);
  const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
  expect(health.droppedEvents).toBeGreaterThanOrEqual(2);
  expect(health.lastError).toBe('expired');
  blocked = false;
  for (const response of held) if (!response.destroyed) response.writeHead(204).end();
  await expect
    .poll(() =>
      endpoint.received.some(
        (item) =>
          item.method === 'PATCH' &&
          item.body.parent_run_id === undefined &&
          item.path !== `/runs/${oldRoot}`,
      ),
    )
    .toBe(true);
  expect(endpoint.received.filter((item) => item.body.trace_id === oldRoot)).toHaveLength(1);
});

test.each([
  { status: 401, reason: 'credentials' },
  { status: 403, reason: 'credentials' },
  { status: 429, reason: 'quota' },
])(
  'known ingestion $status remains authoritative when response-body cancellation fails',
  async ({ status, reason }) => {
    let attempts = 0;
    const { path, session } = await setup({
      traceDelivery: (sending) =>
        langSmithDelivery({
          endpoint: endpoint.url,
          project: 'synthetic-diagnostics',
          apiKey: 'synthetic-trace-secret',
          fetch: async () => {
            attempts++;
            return new Response(
              new ReadableStream({
                cancel() {
                  throw new Error('synthetic-body-cleanup-secret');
                },
              }),
              { status },
            );
          },
        })(sending),
    });
    expect(await send(path, session)).toMatchObject({ phase: 'ready' });
    await expect
      .poll(
        async () => (await (await client.get(`${app.origin}/api/operator/tracing`)).json()).state,
      )
      .toBe('suspended');
    const health = await (await client.get(`${app.origin}/api/operator/tracing`)).json();
    expect(health).toMatchObject({ suspension: reason, lastError: reason });
    expect(attempts).toBe(1);
    expect(JSON.stringify(health)).not.toContain('synthetic-body-cleanup-secret');
  },
);
