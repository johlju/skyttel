import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test, vi } from 'vitest';
import { sessionWarningMessage } from '../../../src/shared/session-activity.js';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelMessage, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let client: APIRequestContext;
afterEach(async () => {
  vi.useRealTimers();
  await client?.dispose();
  await app?.close();
});

test('Live warning waits for both sides to pause and is requested once without changing the absolute end', async () => {
  let clock = Date.now();
  const end = clock + 7 * 86_400_000;
  const live = liveProvider();
  const model = textModel(() => [modelMessage('Inga ändringar.')]);
  app = await createInstallation(undefined, {
    now: () => clock,
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  client = await request.newContext();
  await signIn(client, app.origin);
  const started = await client.post(`${app.origin}/api/auth/sign-in/social`, {
    headers: { origin: app.origin },
    data: { provider: 'google', callbackURL: '/', rememberMe: true, informationVersion: 1 },
  });
  await client.get((await started.json()).url);
  const { household } = await (await createHousehold(client, app.origin)).json();
  clock = end - 300_001;
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const assistant = await (
    await client.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
  ).json();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const connected = await client.post(`${path}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: { sdp: 'synthetic-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
  });
  expect(connected.status(), await connected.text()).toBe(201);
  const voice = (await connected.json()).voice;
  const poll = (microphoneActive: boolean, speakerActive: boolean) =>
    client.post(`${path}/${assistant.id}/voice/${voice.id}/poll`, {
      headers: { origin: app.origin },
      data: {
        revision: 0,
        draftVersion: 0,
        contentVersion: 1,
        microphoneOn: true,
        microphoneActive,
        speakerActive,
      },
    });
  const warnings = () =>
    live.sent.filter(
      ({ event }) =>
        event.type === 'session.commentary.append' && event.content.includes(sessionWarningMessage),
    );
  await poll(true, true);
  clock += 1;
  await vi.advanceTimersByTimeAsync(1);
  expect(warnings()).toHaveLength(0);
  await poll(false, true);
  expect(warnings()).toHaveLength(0);
  await poll(false, false);
  expect(warnings()).toHaveLength(1);
  await poll(false, false);
  expect(warnings()).toHaveLength(1);
  const policy = await (
    await client.post(`${app.origin}/api/browser-binding/status`, {
      headers: { origin: app.origin },
      data: {},
    })
  ).json();
  expect(policy.expiresAt).toBe(end);
  expect(model.requests).toHaveLength(0);
});

test('warning and silent Live polling neither renew ordinary inactivity nor authorize a model or tool instruction', async () => {
  let clock = Date.now();
  const end = clock + 30 * 60_000;
  const live = liveProvider();
  const model = textModel(() => [modelMessage('Detta ska inte köras.')]);
  app = await createInstallation(undefined, {
    now: () => clock,
    modelFetch: model.provider,
    liveFetch: live.provider,
    liveSideband: live.attach,
  });
  client = await request.newContext();
  await signIn(client, app.origin);
  const { household } = await (await createHousehold(client, app.origin)).json();
  clock += 25 * 60_000;
  const path = `${app.origin}/api/households/${household.id}/text-assistant`;
  const assistant = await (
    await client.post(path, { headers: { origin: app.origin }, data: approvedForVisit })
  ).json();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const connected = await client.post(`${path}/${assistant.id}/voice`, {
    headers: { origin: app.origin },
    data: { sdp: 'synthetic-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
  });
  expect(connected.status(), await connected.text()).toBe(201);
  const voice = (await connected.json()).voice;
  const poll = () =>
    client.post(`${path}/${assistant.id}/voice/${voice.id}/poll`, {
      headers: { origin: app.origin },
      data: {
        revision: 0,
        draftVersion: 0,
        contentVersion: 1,
        microphoneOn: true,
        microphoneActive: false,
        speakerActive: false,
      },
    });
  expect((await poll()).status()).toBe(200);
  expect(
    live.sent.filter(
      ({ event }) =>
        event.type === 'session.commentary.append' && event.content.includes(sessionWarningMessage),
    ),
  ).toHaveLength(1);
  const providerId = [...live.channels.keys()][0];
  live.emit(providerId, {
    type: 'session.delegation.created',
    delegation: { id: 'warning-is-no-instruction', target: 'client' },
    offset_ms: 0,
  });
  await vi.advanceTimersByTimeAsync(2100);
  const policy = await (
    await client.post(`${app.origin}/api/browser-binding/status`, {
      headers: { origin: app.origin },
      data: {},
    })
  ).json();
  expect(policy.expiresAt).toBe(end);
  expect(policy.reason).toBe('inactivity');
  clock = end;
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(live.sent.some(({ event }) => event.type === 'session.close')).toBe(true);
  expect(model.requests).toHaveLength(0);
  expect((await (await client.get(`${app.origin}/api/bootstrap`)).json()).status).toBe('anonymous');
});
