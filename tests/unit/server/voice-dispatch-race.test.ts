import { randomUUID } from 'node:crypto';
import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

test.each(['new speech', 'connection loss'])(
  '%s at the provider response boundary cancels the original delegation before its returned tool can persist',
  async (interruption) => {
    const live = liveProvider();
    let providerId = '';
    let typeId = '';
    let providerSignal: AbortSignal | null | undefined;
    const model = textModel((_body, signal) => {
      if (model.requests.length > 1) return [modelMessage('Det nya uppdraget är förstått.')];
      providerSignal = signal;
      // This event is delivered inside the external provider callback, before
      // its response is available to the SDK/application. No internal route,
      // work function or database method is replaced or paused.
      if (interruption === 'new speech') {
        live.emit(providerId, {
          type: 'session.input_transcript.delta',
          event_id: randomUUID(),
          delta: 'Nej, vänta. Förklara bara.',
          start_ms: 101,
          end_ms: 200,
        });
      } else live.channels.get(providerId)?.emit('close', 1006, '', []);
      return [
        modelTool('propose_object', {
          version: 0,
          contentVersion: 1,
          id: 'obsolete-proposal',
          baseRevision: null,
          value: { typeId, name: 'Förslaget som avbröts', description: '' },
        }),
      ];
    });
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const householdPath = `${app.origin}/api/households/${household.id}`;
    const map = await (await browser.get(`${householdPath}/map`)).json();
    typeId = map.types[0].id;
    const response = await browser.post(`${householdPath}/text-assistant`, {
      headers: { origin: app.origin },
      data: { externalAi: true, mapWork: true },
    });
    expect(response.status()).toBe(201);
    const assistant = await response.json();
    const path = `${householdPath}/text-assistant/${assistant.id}`;
    const started = await browser.post(`${path}/voice`, {
      headers: { origin: app.origin },
      data: { sdp: 'synthetic-offer', revision: 0, draftVersion: 0, contentVersion: 1 },
    });
    expect(started.status(), await started.text()).toBe(201);
    providerId = [...live.channels.keys()][0];
    live.emit(providerId, {
      type: 'session.input_transcript.delta',
      event_id: randomUUID(),
      delta: 'Lägg till förslaget.',
      start_ms: 0,
      end_ms: 100,
    });
    const firstDelegation = randomUUID();
    live.emit(providerId, {
      type: 'session.delegation.created',
      event_id: randomUUID(),
      offset_ms: 100,
      delegation: { id: firstDelegation, type: 'delegation', target: 'client' },
    });
    await expect.poll(() => model.requests.length).toBe(1);
    await expect.poll(() => providerSignal?.aborted).toBe(true);
    await expect.poll(async () => (await (await browser.get(path)).json()).phase).toBe('ready');
    expect(await (await browser.get(`${householdPath}/map`)).json()).toEqual(map);
    expect(
      live.sent.filter(
        ({ event }) =>
          event.type === 'session.commentary.append' && event.delegation_id === firstDelegation,
      ),
    ).toEqual([]);

    if (interruption === 'new speech') {
      live.emit(providerId, {
        type: 'session.delegation.created',
        event_id: randomUUID(),
        offset_ms: 200,
        delegation: { id: randomUUID(), type: 'delegation', target: 'client' },
      });
      await expect
        .poll(async () => (await (await browser.get(path)).json()).modelReply)
        .toBe('Det nya uppdraget är förstått.');
      expect(model.requests).toHaveLength(2);
      expect(await (await browser.get(`${householdPath}/map`)).json()).toEqual(map);
    } else await expect.poll(() => live.channels.size).toBe(0);
  },
);
