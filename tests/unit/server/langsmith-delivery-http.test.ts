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
    data: approvedForVisit,
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
) {
  const response = await client.post(`${path}/text-assistant/${session.id}/messages`, {
    headers: { origin: app.origin },
    data: {
      requestId,
      revision: session.revision,
      draftVersion: session.review.version,
      contentVersion: session.review.contentVersion,
      text: 'Läs Lina.',
    },
  });
  expect(response.status(), await response.text()).toBe(202);
  await expect
    .poll(
      async () =>
        (
          await (
            await client.get(`${path}/text-assistant/${session.id}/messages/${requestId}`)
          ).json()
        ).taskStatus,
      { timeout: 20000 },
    )
    .toBe('completed');
  return (await client.get(`${path}/text-assistant/${session.id}`)).json();
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
  expect(health).toMatchObject({ droppedEvents: 1, lastError: 'oversized' });
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
