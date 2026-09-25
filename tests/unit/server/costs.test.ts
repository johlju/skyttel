import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, expect, test, vi } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { costProvider } from '../../support/cost-provider.js';
import { createInstallation, robin } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
const otherClients: APIRequestContext[] = [];
afterEach(async () => {
  await Promise.all(otherClients.splice(0).map((client) => client.dispose()));
  await browser?.dispose();
  await app?.close();
  vi.useRealTimers();
});

const month = () => new Date().toISOString().slice(0, 7);
const headers = () => ({ origin: app.origin });
async function costs(period = month()) {
  const response = await browser.get(`${app.origin}/api/operator/costs?month=${period}`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function setup(
  modelFetch = textModel(() => [modelMessage('Syntetiskt svar.')]).provider,
  liveFetch?: typeof fetch,
) {
  const live = liveProvider();
  app = await createInstallation(undefined, {
    modelFetch,
    liveFetch: liveFetch ?? live.provider,
    liveSideband: live.attach,
  });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const householdPath = `${app.origin}/api/households/${household.id}`;
  const path = `${householdPath}/text-assistant`;
  const started = await browser.post(path, {
    headers: headers(),
    data: { externalAi: true, mapWork: true },
  });
  expect(started.status()).toBe(201);
  const assistant = await started.json();
  async function message() {
    const current = await (await browser.get(`${path}/${assistant.id}`)).json();
    const response = await browser.post(`${path}/${assistant.id}/messages`, {
      headers: headers(),
      data: {
        revision: current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
        requestId: crypto.randomUUID(),
        text: 'Privat provfråga som inte får lagras i mätningen.',
      },
    });
    expect(response.status(), await response.text()).toBe(202);
    return response;
  }
  async function settled() {
    await expect
      .poll(async () => (await (await browser.get(`${path}/${assistant.id}`)).json()).phase)
      .not.toBe('working');
  }
  async function startVoice() {
    const current = await (await browser.get(`${path}/${assistant.id}`)).json();
    const response = await browser.post(`${path}/${assistant.id}/voice`, {
      headers: headers(),
      data: {
        sdp: 'synthetic-offer',
        revision: current.revision,
        draftVersion: current.review.version,
        contentVersion: current.review.contentVersion,
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    const { voice } = await response.json();
    const providerId = [...live.channels.keys()].at(-1);
    if (!providerId) throw new Error('Missing synthetic Live channel');
    return { providerId, path: `${path}/${assistant.id}/voice/${voice.id}` };
  }
  return { live, householdPath, path, assistant, message, settled, startVoice };
}

test('a missing effective model displays the requested Terra pricing assumption', async () => {
  const provider = costProvider();
  const scene = await setup(async (input, init) => {
    const response = await provider.provider(input, init);
    const body = await response.json();
    delete body.model;
    return Response.json(body);
  });
  await scene.message();
  await scene.settled();
  expect((await costs()).terra).toMatchObject({
    estimatedUsd: 0.229,
    unpricedAttempts: 0,
    issues: [{ code: 'assumed_requested_model', count: 1 }],
  });
});

test('an aborted Terra request remains a durable unknown attempt', async () => {
  let held = false;
  const provider = costProvider(() => {
    held = true;
  });
  provider.textMode('held');
  const scene = await setup(provider.provider);
  await scene.message();
  await expect.poll(() => held).toBe(true);
  expect((await costs()).terra.attempts).toBe(1);
  const cancelled = await browser.post(`${scene.path}/${scene.assistant.id}/cancel`, {
    headers: headers(),
    data: { revision: 1 },
  });
  expect(cancelled.status(), await cancelled.text()).toBe(200);
  await scene.settled();
  await app.restart();
  expect((await costs()).terra).toMatchObject({
    attempts: 1,
    uncertainAttempts: 1,
    unpricedAttempts: 1,
    usage: { input: { known: 0, missing: 1 } },
  });
});

test('a failed Live creation retains unknown duration without inventing the minimum charge', async () => {
  const scene = await setup(undefined, async () => {
    throw new Error('synthetic private provider failure');
  });
  const started = await browser.post(`${scene.path}/${scene.assistant.id}/voice`, {
    headers: headers(),
    data: { sdp: 'synthetic-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
  });
  expect(started.status()).toBe(503);
  const measured = await costs();
  expect(measured.live).toMatchObject({
    attempts: 1,
    uncertainAttempts: 1,
    unpricedAttempts: 1,
    seconds: { known: 0, missing: 1 },
    estimatedBillableSeconds: 0,
  });
  expect(JSON.stringify(measured)).not.toContain('synthetic private provider failure');
  await app.restart();
  expect((await costs()).live).toEqual(measured.live);
});

test('a confirmed short Live session keeps measured seconds distinct from its credited minimum estimate', async () => {
  const scene = await setup();
  const voice = await scene.startVoice();
  scene.live.configure({ seconds: 2.5 });
  expect(
    (await browser.post(`${voice.path}/stop`, { headers: headers(), data: {} })).status(),
  ).toBe(200);
  expect((await costs()).live).toMatchObject({
    attempts: 1,
    uncertainAttempts: 0,
    unpricedAttempts: 0,
    seconds: { known: 2.5, missing: 0 },
    estimatedBillableSeconds: 15,
    estimatedUsd: 0.0125,
  });
});

test('permanent household erasure and restart retain the global cost ledger and assumptions', async () => {
  const scene = await setup();
  const map = await (await browser.get(`${scene.householdPath}/map`)).json();
  expect(
    (
      await browser.post(`${scene.householdPath}/map/draft`, {
        headers: headers(),
        data: {
          version: 0,
          contentVersion: 1,
          id: 'erase-this-content',
          baseRevision: null,
          value: { typeId: map.types[0].id, name: 'Syntetiskt raderingsprov', description: '' },
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await browser.post(`${scene.householdPath}/map/save`, {
        headers: headers(),
        data: { version: 1, contentVersion: 1, operationId: 'saved-before-erasure' },
      })
    ).status(),
  ).toBe(200);
  await scene.message();
  await scene.settled();
  const before = await costs();
  const selection = [{ kind: 'object', id: 'erase-this-content' }];
  const reviewed = await browser.post(`${scene.householdPath}/erasure/review`, {
    headers: headers(),
    data: { selection },
  });
  expect(reviewed.status(), await reviewed.text()).toBe(200);
  const { token } = await reviewed.json();
  const erased = await browser.post(`${scene.householdPath}/erasure/execute`, {
    headers: headers(),
    data: {
      selection,
      token,
      operationId: 'erase-with-global-usage',
      confirmation: 'RADERA PERMANENT',
    },
  });
  expect(erased.status(), await erased.text()).toBe(200);
  expect(await erased.json()).toMatchObject({ status: { phase: 'completed' } });
  expect((await (await browser.get(`${scene.householdPath}/map`)).json()).objects).toEqual([]);
  const after = await costs();
  expect(after.terra).toEqual(before.terra);
  expect(after.assumptionHistory).toEqual(before.assumptionHistory);
  expect(after.coverageStartedAt).toBe(before.coverageStartedAt);
  await app.restart();
  expect((await costs()).terra).toEqual(before.terra);
});

test('the operator reads separate measured Terra cost and Render assumptions after a real model response and restart', async () => {
  const model = textModel(() => [modelMessage('Privat syntetiskt svar.')]);
  app = await createInstallation(undefined, { modelFetch: model.provider });
  browser = await request.newContext();
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const started = await browser.post(path, {
    headers: { origin: app.origin },
    data: { externalAi: true, mapWork: true },
  });
  const assistant = await started.json();
  expect(
    (
      await browser.post(`${path}/${assistant.id}/messages`, {
        headers: { origin: app.origin },
        data: {
          revision: 0,
          draftVersion: 0,
          contentVersion: 1,
          requestId: 'costed-reply',
          text: 'Privat syntetisk fråga.',
        },
      })
    ).status(),
  ).toBe(202);
  await expect
    .poll(async () => (await (await browser.get(`${path}/${assistant.id}`)).json()).phase)
    .not.toBe('working');
  const month = new Date().toISOString().slice(0, 7);
  const costPath = `${app.origin}/api/operator/costs?month=${month}`;
  const response = await browser.get(costPath);
  expect(response.status(), await response.text()).toBe(200);
  const costs = await response.json();
  expect(costs.render).toEqual({ estimatedUsd: 7.25, estimatedSek: 72.5 });
  expect(costs.terra).toMatchObject({
    attempts: 1,
    uncertainAttempts: 0,
    unpricedAttempts: 0,
    estimatedUsd: 0.000564,
  });
  expect(costs.terra.usage).toMatchObject({
    input: { known: 120, missing: 0 },
    cached: { known: 20, missing: 0 },
    cacheWrite: { known: 0, missing: 0 },
    output: { known: 30, missing: 0 },
    reasoning: { known: 10, missing: 0 },
  });
  expect(costs.live.attempts).toBe(0);
  expect(costs.total.estimatedUsd).toBeCloseTo(7.250564, 9);
  expect(JSON.stringify(costs)).not.toMatch(/Privat syntetisk|synthetic-model-key|access_token/);
  await app.restart();
  const restored = await (await browser.get(costPath)).json();
  expect(restored.terra).toEqual(costs.terra);
  expect(restored.coverageStartedAt).toBe(costs.coverageStartedAt);
});

test('only the configured verified installation operator may read or revise costs even without household membership', async () => {
  const scene = await setup();
  const anonymous = await request.newContext();
  const member = await request.newContext();
  otherClients.push(anonymous, member);
  app.setIdentity(robin);
  await signIn(member, app.origin, 'microsoft');
  const { user } = await (await member.get(`${app.origin}/api/bootstrap`)).json();
  const { code } = await (
    await browser.post(`${scene.householdPath}/invitations`, {
      headers: headers(),
      data: { userId: user.id },
    })
  ).json();
  expect(
    (
      await member.post(`${app.origin}/api/invitations/accept`, {
        headers: headers(),
        data: { code },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await browser.post(`${scene.householdPath}/members/${user.id}/role`, {
        headers: headers(),
        data: { role: 'administrator' },
      })
    ).status(),
  ).toBe(200);
  const body = { month: month(), ...(await costs()).assumptions };
  delete body.updatedAt;
  for (const [client, status] of [
    [anonymous, 401],
    [member, 403],
  ] as const) {
    expect((await client.get(`${app.origin}/api/operator/costs?month=${month()}`)).status()).toBe(
      status,
    );
    expect(
      (
        await client.post(`${app.origin}/api/operator/costs/assumptions`, {
          headers: headers(),
          data: body,
        })
      ).status(),
    ).toBe(status);
  }
  expect((await (await member.get(`${app.origin}/api/bootstrap`)).json()).operator).toBe(false);
  const { user: operator } = await (await browser.get(`${app.origin}/api/bootstrap`)).json();
  expect(
    (
      await member.post(`${scene.householdPath}/members/${operator.id}/revoke`, {
        headers: headers(),
        data: {},
      })
    ).status(),
  ).toBe(200);
  expect(await (await browser.get(`${app.origin}/api/bootstrap`)).json()).toMatchObject({
    status: 'forbidden',
    operator: true,
  });
  expect((await costs()).render.estimatedUsd).toBe(7.25);
});

test('monthly operator assumptions retain their revisions, reject stale and invalid writes, and survive restart', async () => {
  await setup();
  const original = await costs();
  const { updatedAt: _updatedAt, ...settings } = original.assumptions;
  const url = `${app.origin}/api/operator/costs/assumptions`;
  const body = {
    ...settings,
    month: month(),
    sekPerUsd: 11,
    workspace: 'pro',
    workspaceUsd: 25,
    diskGb: 2,
  };
  const changed = await browser.post(url, { headers: headers(), data: body });
  expect(changed.status(), await changed.text()).toBe(200);
  expect(await changed.json()).toMatchObject({
    assumptions: { version: 2, sekPerUsd: 11 },
    render: { estimatedUsd: 32.5, estimatedSek: 357.5 },
  });
  expect((await browser.post(url, { headers: headers(), data: body })).status()).toBe(409);
  for (const invalid of [
    { ...body, sekPerUsd: 0 },
    { ...body, diskGb: -1 },
    { ...body, computeUsd: '7' },
    { ...body, month: '2026-13' },
    { ...body, extra: 'unaccepted' },
  ])
    expect((await browser.post(url, { headers: headers(), data: invalid })).status()).toBe(400);
  expect(
    (
      await browser.post(url, { headers: { origin: 'https://wrong.example.test' }, data: body })
    ).status(),
  ).toBe(403);
  expect((await browser.post(url, { headers: headers(), data: '{' })).status()).toBe(400);
  const second = await browser.post(url, {
    headers: headers(),
    data: { ...body, version: 2, sekPerUsd: 12 },
  });
  expect(second.status()).toBe(200);
  await app.restart();
  const restored = await costs();
  expect(restored.assumptionHistory).toMatchObject([
    { version: 3, sekPerUsd: 12 },
    { version: 2, sekPerUsd: 11 },
    { version: 1, sekPerUsd: 10 },
  ]);
  expect(restored.render.estimatedSek).toBe(390);
  expect((await costs('2000-01')).assumptions.version).toBe(1);
  expect((await costs('2000-01')).coverageIncomplete).toBe(true);
});

test.each([true, false])(
  'Live cumulative snapshots are deduplicated and final confirmation=%s remains explicit after restart',
  async (finalize) => {
    const scene = await setup();
    const voice = await scene.startVoice();
    scene.live.configure({ finalize, seconds: 15 });
    for (const seconds of [12, 15, 15])
      scene.live.emit(voice.providerId, {
        type: 'session.usage.updated',
        event_id: crypto.randomUUID(),
        usage: { seconds },
      });
    expect((await costs()).live).toMatchObject({
      attempts: 1,
      seconds: { known: 15, missing: 0 },
      uncertainAttempts: 1,
      estimatedUsd: 0.0125,
    });
    expect(
      (await browser.post(`${voice.path}/stop`, { headers: headers(), data: {} })).status(),
    ).toBe(200);
    const saved = await costs();
    expect(saved.live).toMatchObject({
      attempts: 1,
      seconds: { known: 15, missing: 0 },
      estimatedBillableSeconds: 15,
      estimatedUsd: 0.0125,
      uncertainAttempts: finalize ? 0 : 1,
    });
    await app.restart();
    expect((await costs()).live).toEqual(saved.live);
  },
);

const measured = {
  input_tokens: 100,
  output_tokens: 30,
  input_tokens_details: { cached_tokens: 20, cache_write_tokens: 10 },
  output_tokens_details: { reasoning_tokens: 5 },
};
test.each([
  {
    name: 'cache writes replace ordinary input and reasoning is already output',
    usage: measured,
    usd: 0.000529,
    uncertain: 0,
    unpriced: 0,
  },
  {
    name: '272000 input uses short context rates',
    usage: {
      ...measured,
      input_tokens: 272000,
      output_tokens: 10,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    },
    usd: 0.54412,
    uncertain: 0,
    unpriced: 0,
  },
  {
    name: '272001 input uses long context rates for the whole call',
    usage: {
      ...measured,
      input_tokens: 272001,
      output_tokens: 10,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    },
    usd: 1.088184,
    uncertain: 0,
    unpriced: 0,
  },
  {
    name: 'missing cache partition prices only known output',
    usage: { ...measured, input_tokens_details: { cached_tokens: 20 } },
    usd: 0.00036,
    uncertain: 1,
    unpriced: 1,
  },
  {
    name: 'missing reasoning detail does not hide a known output price',
    usage: { ...measured, output_tokens_details: {} },
    usd: 0.000529,
    uncertain: 1,
    unpriced: 0,
  },
  {
    name: 'overlapping cache counts are unpriced',
    usage: { ...measured, input_tokens_details: { cached_tokens: 100, cache_write_tokens: 10 } },
    usd: 0,
    uncertain: 1,
    unpriced: 1,
  },
  {
    name: 'reasoning greater than output is inconsistent',
    usage: { ...measured, output_tokens_details: { reasoning_tokens: 31 } },
    usd: 0,
    uncertain: 1,
    unpriced: 1,
  },
  {
    name: 'missing usage is unknown rather than confirmed zero',
    usage: undefined,
    usd: 0,
    uncertain: 1,
    unpriced: 1,
  },
  {
    name: 'invalid input count cannot establish the price threshold',
    usage: { ...measured, input_tokens: -1 },
    usd: 0,
    uncertain: 1,
    unpriced: 1,
  },
  {
    name: 'confirmed zero usage remains distinguishable from missing',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
    usd: 0,
    uncertain: 0,
    unpriced: 0,
  },
])('$name', async ({ usage, usd, uncertain, unpriced }) => {
  const provider = textModel(() => [modelMessage('Privat svar.')]).provider;
  const scene = await setup(async (input, init) => {
    const response = await provider(input, init);
    return Response.json({ ...(await response.json()), usage, service_tier: 'default' });
  });
  await scene.message();
  await scene.settled();
  const result = await costs();
  expect(result.terra).toMatchObject({
    attempts: 1,
    uncertainAttempts: uncertain,
    unpricedAttempts: unpriced,
  });
  expect(result.terra.estimatedUsd).toBeCloseTo(usd, 10);
});

test.each([
  { providerMetadata: { service_tier: 'priority' }, issue: 'unsupported_tier' },
  { providerMetadata: { model: 'untrusted-private-provider-field' }, issue: 'unsupported_model' },
])(
  'an unsupported provider response reports $issue without inventing a price or storing response text',
  async ({ providerMetadata, issue }) => {
    const provider = textModel(() => [modelMessage('Privat svar.')]).provider;
    const scene = await setup(async (input, init) => {
      const response = await provider(input, init);
      return Response.json({
        ...(await response.json()),
        usage: measured,
        service_tier: 'default',
        ...providerMetadata,
      });
    });
    await scene.message();
    await scene.settled();
    const result = await costs();
    expect(result.terra).toMatchObject({
      attempts: 1,
      estimatedUsd: 0,
      uncertainAttempts: 1,
      unpricedAttempts: 1,
      issues: [{ code: issue, count: 1 }],
    });
    expect(JSON.stringify(result)).not.toContain('untrusted-private-provider-field');
  },
);

test('an unfinished provider attempt is visible before its reply and a retry is a distinct measured attempt', async () => {
  let release!: (output: unknown[]) => void;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const scene = await setup(model.provider);
  await scene.message();
  await expect.poll(() => model.requests.length).toBe(1);
  expect((await costs()).terra).toMatchObject({
    attempts: 1,
    uncertainAttempts: 1,
    unpricedAttempts: 1,
    usage: { input: { known: 0, missing: 1 } },
  });
  release([modelMessage('Första svaret.')]);
  await scene.settled();
  expect((await costs()).terra).toMatchObject({ attempts: 1, uncertainAttempts: 0 });
  await scene.message();
  await expect.poll(() => model.requests.length).toBe(2);
  release([modelMessage('Andra svaret.')]);
  await scene.settled();
  expect((await costs()).terra).toMatchObject({
    attempts: 2,
    uncertainAttempts: 0,
    estimatedUsd: 0.001128,
  });
});

test('a provider call spanning a UTC month remains in its start month for both Live and Terra', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T23:59:59.900Z'));
  let release!: (output: unknown[]) => void;
  const model = textModel(
    () =>
      new Promise<unknown[]>((resolve) => {
        release = resolve;
      }),
  );
  const scene = await setup(model.provider);
  const voice = await scene.startVoice();
  await scene.message();
  await expect.poll(() => model.requests.length).toBe(1);
  vi.setSystemTime(new Date('2026-10-01T00:00:01.000Z'));
  release([modelMessage('Svaret efter månadsskiftet.')]);
  await scene.settled();
  scene.live.configure({ seconds: 15 });
  expect(
    (await browser.post(`${voice.path}/stop`, { headers: headers(), data: {} })).status(),
  ).toBe(200);
  const september = await costs('2026-09');
  expect(september.terra).toMatchObject({ attempts: 1, uncertainAttempts: 0 });
  expect(september.live).toMatchObject({
    attempts: 1,
    uncertainAttempts: 0,
    seconds: { known: 15, missing: 0 },
  });
  const october = await costs('2026-10');
  expect(october.terra.attempts).toBe(0);
  expect(october.live.attempts).toBe(0);
});

test('a failed initial ledger write prevents both billable providers while ordinary draft work remains available', async () => {
  const model = textModel(() => [modelMessage('Detta ska inte anropas.')]);
  const scene = await setup(model.provider);
  const fault = new Database(join(app.directory, 'skyttel.db'));
  try {
    fault.exec(
      "CREATE TRIGGER fail_cost_start BEFORE INSERT ON cost_attempt BEGIN SELECT RAISE(FAIL, 'synthetic ledger outage'); END",
    );
    await scene.message();
    await scene.settled();
    expect(model.requests).toEqual([]);
    const current = await (await browser.get(`${scene.path}/${scene.assistant.id}`)).json();
    const voice = await browser.post(`${scene.path}/${scene.assistant.id}/voice`, {
      headers: headers(),
      data: {
        sdp: 'synthetic-offer',
        revision: current.revision,
        draftVersion: 0,
        contentVersion: 1,
      },
    });
    expect(voice.status(), await voice.text()).toBe(503);
    expect(scene.live.requests).toEqual([]);
    const result = await costs();
    expect(result).toMatchObject({
      recordingUnavailable: true,
      total: { incomplete: true },
      terra: { attempts: 0 },
      live: { attempts: 0 },
    });
    const map = await (await browser.get(`${scene.householdPath}/map`)).json();
    expect(
      (
        await browser.post(`${scene.householdPath}/map/draft`, {
          headers: headers(),
          data: {
            version: 0,
            contentVersion: 1,
            id: 'manual-during-outage',
            baseRevision: null,
            value: { typeId: map.types[0].id, name: 'Manuellt förslag', description: '' },
          },
        })
      ).status(),
    ).toBe(200);
  } finally {
    fault.exec('DROP TRIGGER fail_cost_start');
    fault.close();
  }
});

test('a failed terminal ledger write preserves the initial unknown attempt and the verified saved map across restart', async () => {
  const model = textModel(() => [
    modelTool('save_draft', {
      version: 1,
      contentVersion: 1,
      operationId: 'untrusted-provider-id',
    }),
  ]);
  const scene = await setup(model.provider);
  const fault = new Database(join(app.directory, 'skyttel.db'));
  const logs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const map = await (await browser.get(`${scene.householdPath}/map`)).json();
    expect(
      (
        await browser.post(`${scene.householdPath}/map/draft`, {
          headers: headers(),
          data: {
            version: 0,
            contentVersion: 1,
            id: 'retained-receipt',
            baseRevision: null,
            value: {
              typeId: map.types[0].id,
              name: 'Privat karttext utanför mätningen',
              description: '',
            },
          },
        })
      ).status(),
    ).toBe(200);
    fault.exec(
      "CREATE TRIGGER fail_cost_finish BEFORE UPDATE ON cost_attempt BEGIN SELECT RAISE(FAIL, 'private synthetic failure'); END",
    );
    const current = await (await browser.get(`${scene.path}/${scene.assistant.id}`)).json();
    const response = await browser.post(`${scene.path}/${scene.assistant.id}/messages`, {
      headers: headers(),
      data: {
        revision: current.revision,
        draftVersion: 1,
        contentVersion: 1,
        requestId: 'save-through-cost-outage',
        text: 'Spara hela utkastet.',
      },
    });
    expect(response.status()).toBe(202);
    await scene.settled();
    const saved = await (await browser.get(`${scene.path}/${scene.assistant.id}`)).json();
    expect(saved.receipt).toMatchObject({
      changes: [{ after: { name: 'Privat karttext utanför mätningen' } }],
    });
    expect((await costs()).terra).toMatchObject({
      attempts: 1,
      uncertainAttempts: 1,
      unpricedAttempts: 1,
      usage: { input: { known: 0, missing: 1 } },
    });
    expect(
      JSON.stringify(fault.prepare('SELECT measurement, rates FROM cost_attempt').all()),
    ).not.toMatch(/Privat karttext|private synthetic|synthetic-model-key|Spara hela/);
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/private synthetic|Privat karttext/);
    fault.exec('DROP TRIGGER fail_cost_finish');
    await app.restart();
    expect((await costs()).terra).toMatchObject({
      attempts: 1,
      uncertainAttempts: 1,
      unpricedAttempts: 1,
    });
    const operation = await (
      await browser.get(`${scene.householdPath}/map/operations/${saved.receipt.operationId}`)
    ).json();
    expect(operation.operation).toMatchObject({ status: 'succeeded', receipt: saved.receipt });
  } finally {
    fault.exec('DROP TRIGGER IF EXISTS fail_cost_finish');
    fault.close();
    logs.mockRestore();
  }
});
