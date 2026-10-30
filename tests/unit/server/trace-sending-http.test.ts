import { unzipSync } from 'fflate';
import { afterEach, expect, test } from 'vitest';
import type { TraceSending } from '../../../src/server/trace-sending.js';
import { applicationFixture } from './fixture.js';

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
afterEach(() => fixture?.close());
const path = '/api/operator/tracing';

test('only the installation operator can read and change trace sending, with origin and strict request checks', async () => {
  fixture = await applicationFixture();
  const anonymous = fixture.client();
  expect((await anonymous.request(path)).status).toBe(401);
  expect((await anonymous.json(path, { action: 'disable' })).status).toBe(401);
  const operator = fixture.client();
  await operator.signIn();
  expect(await (await operator.request(path)).json()).toEqual({
    connected: false,
    enabled: true,
    state: 'not_connected',
    suspension: null,
    lastSuccessfulDelivery: null,
    droppedEvents: 0,
    lastError: null,
  });
  expect((await operator.json(path, { action: 'restart' })).status).toBe(409);
  expect((await operator.json(path, { action: 'disable', payload: 'unreviewed' })).status).toBe(
    400,
  );
  expect(
    (await operator.json(path, { action: 'disable' }, { origin: 'https://attacker.example' }))
      .status,
  ).toBe(403);
  fixture.setSubject('another-household-administrator');
  const other = fixture.client();
  await other.signIn();
  expect((await other.request(path)).status).toBe(403);
  expect((await other.json(path, { action: 'disable' })).status).toBe(403);
  expect((await operator.json(path, { action: 'disable' })).status).toBe(200);
  await fixture.restart();
  expect(await (await operator.request(path)).json()).toMatchObject({
    enabled: false,
    state: 'disabled',
  });
});

test('opt-out stops and discards delivery, suspension survives restart, explicit recovery starts only new events', async () => {
  let sending!: TraceSending;
  let pending: string[] = [];
  let delivered: string[] = [];
  let stops = 0;
  const timestamp = Date.now();
  fixture = await applicationFixture({
    now: () => timestamp,
    traceDelivery: (control) => {
      sending = control;
      return {
        start() {},
        stop() {
          stops++;
          pending = [];
        },
      };
    },
  });
  const operator = fixture.client();
  await operator.signIn();
  const admit = (value: string) => {
    if (sending.canSend()) pending.push(value);
  };
  const flush = () => {
    if (sending.canSend()) {
      delivered = delivered.concat(pending);
      pending = [];
      sending.delivered();
    }
  };
  admit('discarded');
  expect((await operator.json(path, { action: 'disable' })).status).toBe(200);
  expect(stops).toBe(1);
  admit('disabled');
  await operator.json(path, { action: 'enable' });
  flush();
  expect(delivered).toEqual([]);
  admit('new synthetic event');
  flush();
  expect(delivered).toEqual(['new synthetic event']);
  sending.dropped('oversized', 2);
  expect(await (await operator.request(path)).json()).toMatchObject({
    state: 'sending',
    lastSuccessfulDelivery: timestamp,
    droppedEvents: 2,
    lastError: 'oversized',
  });
  for (const reason of ['quota', 'credentials'] as const) {
    admit('pending');
    sending.suspend(reason);
    expect(pending).toEqual([]);
    await fixture.restart();
    expect(sending.canSend()).toBe(false);
    expect(await (await operator.request(path)).json()).toMatchObject({
      state: 'suspended',
      suspension: reason,
      lastSuccessfulDelivery: null,
      droppedEvents: 0,
      lastError: null,
    });
    await operator.json(path, { action: 'enable' });
    expect(sending.canSend()).toBe(false);
    expect((await operator.json(path, { action: 'restart' })).status).toBe(200);
    expect(sending.canSend()).toBe(true);
  }
});

test('delivery adapter exceptions expose only a safe category and leave operator requests and shutdown available', async () => {
  fixture = await applicationFixture({
    traceDelivery: () => ({
      start() {
        throw new Error('secret-provider-body');
      },
      stop() {
        throw new Error('household secret');
      },
    }),
  });
  const operator = fixture.client();
  await operator.signIn();
  expect(await (await operator.request(path)).json()).toMatchObject({
    connected: false,
    state: 'not_connected',
    lastError: 'export',
  });
  const response = await operator.json(path, { action: 'disable' });
  expect(response.status).toBe(200);
  expect(JSON.stringify(await response.json())).not.toMatch(/secret|household|provider/);
  await fixture.restart();
});

test('a failed suspension write still fences new uploads and stops active delivery', async () => {
  let sending!: TraceSending;
  let stops = 0;
  fixture = await applicationFixture({
    traceDelivery: (control) => {
      sending = control;
      return {
        start() {},
        stop() {
          stops++;
        },
      };
    },
  });
  const operator = fixture.client();
  await operator.signIn();
  fixture.database.exec(
    "CREATE TRIGGER synthetic_trace_write_failure BEFORE INSERT ON trace_sending BEGIN SELECT RAISE(FAIL, 'synthetic storage unavailable'); END",
  );
  expect(() => sending.suspend('quota')).toThrow();
  expect(sending.canSend()).toBe(false);
  expect(stops).toBe(1);
  expect(await (await operator.request(path)).json()).toMatchObject({
    state: 'suspended',
    suspension: 'quota',
  });
});

test('household archive roundtrip preserves local opt-out and suspension without diagnostic payloads', async () => {
  let sending!: TraceSending;
  fixture = await applicationFixture({
    traceDelivery: (control) => {
      sending = control;
      return { start() {}, stop() {} };
    },
  });
  const operator = fixture.client();
  await operator.signIn();
  const { household } = await (
    await operator.json('/api/households', { name: 'Kontrollhushåll' })
  ).json();
  const householdPath = `/api/households/${household.id}`;
  sending.delivered();
  sending.dropped('oversized', 7);
  const prepared = await (await operator.json(`${householdPath}/exports`, {})).json();
  const archive = new Uint8Array(
    await (await operator.request(`${householdPath}/exports/${prepared.id}`)).arrayBuffer(),
  );
  const parts = unzipSync(archive);
  expect(JSON.parse(Buffer.from(parts['manifest.json']).toString()).schemaVersion).toBe(38);
  const encoded = Buffer.from(parts['content.json']).toString();
  for (const field of [
    'trace_sending',
    'traceSending',
    'suspension',
    'droppedEvents',
    'lastSuccessfulDelivery',
    'lastError',
  ])
    expect(encoded).not.toContain(field);
  sending.suspend('quota');
  expect((await operator.json(path, { action: 'disable' })).status).toBe(200);
  const uploaded = await operator.request(`${householdPath}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'x-skyttel-content-version': '1',
    },
    body: archive,
  });
  expect(uploaded.status).toBe(201);
  const ready = await uploaded.json();
  expect(
    (
      await operator.json(`${householdPath}/imports/${ready.id}/confirm`, {
        confirmed: true,
        contentVersion: 1,
      })
    ).status,
  ).toBe(200);
  expect(await (await operator.request(path)).json()).toMatchObject({
    enabled: false,
    suspension: 'quota',
    droppedEvents: 7,
  });
  await fixture.restart();
  expect(await (await operator.request(path)).json()).toMatchObject({
    enabled: false,
    suspension: 'quota',
    droppedEvents: 0,
    lastSuccessfulDelivery: null,
  });
});
