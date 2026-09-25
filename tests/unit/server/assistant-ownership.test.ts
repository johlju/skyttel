import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import type { TextAssistantView } from '../../../src/shared/text-assistant.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';
import { liveProvider } from '../../support/live-provider.js';
import { modelTool, textModel } from '../../support/text-model.js';

type Installation = Awaited<ReturnType<typeof createInstallation>>;
const installations: Installation[] = [];
const browsers: APIRequestContext[] = [];
afterEach(async () => {
  for (const browser of browsers.splice(0)) await browser.dispose();
  for (const app of installations.splice(0)) await app.close();
});

async function installation(options?: Parameters<typeof createInstallation>[1]) {
  const app = await createInstallation(undefined, options);
  installations.push(app);
  const browser = await request.newContext();
  browsers.push(browser);
  await signIn(browser, app.origin);
  const { household } = await (await createHousehold(browser, app.origin)).json();
  const path = `${app.origin}/api/households/${household.id}`;
  const post = (suffix: string, data: unknown) =>
    browser.post(`${path}/${suffix}`, { headers: { origin: app.origin }, data });
  return { app, browser, path, post };
}

/** Real archive restoration and explicit administrator assignment, no identity injection. */
async function restored(options: Parameters<typeof createInstallation>[1]) {
  const source = await installation();
  const original: MapState = await (await source.browser.get(`${source.path}/map`)).json();
  const proposal = await source.post('map/draft', {
    id: 'restored-bike',
    version: 0,
    contentVersion: 1,
    baseRevision: null,
    value: {
      typeId: original.types[0].id,
      name: 'Cykel från gamla installationen',
      description: '',
    },
  });
  expect(proposal.status(), await proposal.text()).toBe(200);
  const prepared = await (await source.post('exports', {})).json();
  const archive = await (await source.browser.get(`${source.path}/exports/${prepared.id}`)).body();
  const target = await installation(options);
  const uploaded = await target.browser.post(`${target.path}/imports`, {
    headers: {
      origin: target.app.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    data: archive,
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const ready = await uploaded.json();
  const confirmed = await target.post(`imports/${ready.id}/confirm`, {
    confirmed: true,
    contentVersion: 1,
  });
  expect((await confirmed.json()).status).toBe('completed');
  const { user } = await (await target.browser.get(`${target.app.origin}/api/bootstrap`)).json();
  expect(user.id).not.toBe(original.userId);
  const before: MapState = await (await target.browser.get(`${target.path}/map`)).json();
  expect(before.draft.changes).toEqual([]);
  const assigned = await target.post('content-owners/assign', {
    identityId: original.userId,
    userId: user.id,
    confirmed: true,
    contentVersion: before.contentVersion,
  });
  expect(assigned.status(), await assigned.text()).toBe(200);
  const state: MapState = await (await target.browser.get(`${target.path}/map`)).json();
  expect(state).toMatchObject({
    userId: original.userId,
    contentVersion: 3,
    draft: { changes: [{ id: 'restored-bike' }] },
  });
  return { ...target, ownerId: original.userId, actorId: user.id as string, state };
}

test.each(['text', 'voice'] as const)(
  '%s confirms an imported owner save immediately and retries only the same pending receipt',
  async (mode) => {
    const live = liveProvider();
    const model = textModel((body) => {
      const input = body.input.filter((item) => item.role === 'user').at(-1);
      const { draft } = JSON.parse(String(input?.content));
      return [
        modelTool('save_draft', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          operationId: 'provider-save',
        }),
      ];
    });
    const fixture = await restored({
      modelFetch: model.provider,
      liveFetch: live.provider,
      liveSideband: live.attach,
    });
    const { browser, post, path, ownerId, actorId, state } = fixture;
    const started = await post('text-assistant', { externalAi: true, mapWork: true });
    expect(started.status(), await started.text()).toBe(201);
    const session: TextAssistantView = await started.json();
    let route = `text-assistant/${session.id}`;
    let offset = 0;
    let spoken = 0;
    if (mode === 'voice') {
      const voice = await post(`${route}/voice`, {
        sdp: 'synthetic-offer',
        revision: 0,
        draftVersion: state.draft.version,
        contentVersion: state.contentVersion,
      });
      expect(voice.status(), await voice.text()).toBe(201);
    }
    async function say(text: string) {
      if (mode === 'text') {
        const current: TextAssistantView = await (await browser.get(`${path}/${route}`)).json();
        const response = await post(`${route}/messages`, {
          revision: current.revision,
          draftVersion: current.review.version,
          contentVersion: current.review.contentVersion,
          requestId: crypto.randomUUID(),
          text,
        });
        expect(response.status(), await response.text()).toBe(202);
      } else {
        const providerId = [...live.channels.keys()][0];
        live.emit(providerId, {
          type: 'session.input_transcript.delta',
          event_id: crypto.randomUUID(),
          delta: text,
          start_ms: offset,
          end_ms: ++offset,
        });
        live.emit(providerId, {
          type: 'session.delegation.created',
          event_id: crypto.randomUUID(),
          offset_ms: offset,
          delegation: { id: crypto.randomUUID(), type: 'delegation', target: 'client' },
        });
        await expect
          .poll(
            () =>
              live.sent.filter(({ event }) => event.type === 'session.commentary.append').length,
          )
          .toBe(++spoken);
      }
      let status = session;
      await expect
        .poll(async () => {
          status = await (await browser.get(`${path}/${route}`)).json();
          return status.phase;
        })
        .not.toBe('working');
      return status;
    }
    const saved = await say('Spara ändringarna.');
    expect(saved).toMatchObject({
      phase: 'ready',
      reply: 'Sparat. Hela utkastet finns i hushållets karta.',
      receipt: {
        userId: ownerId,
        householdId: path.split('/').at(-1),
        contentVersion: 3,
        changes: [{ after: { id: 'restored-bike' } }],
      },
    });
    expect(saved.error).toBeUndefined();
    expect(saved.receipt?.userId).not.toBe(actorId);
    expect(saved.review.changes).toEqual([]);
    expect((await (await browser.get(`${path}/map/history`)).json()).history).toEqual([
      saved.receipt,
    ]);
    // A later durable attempt belongs to the same restored owner. Exact retry
    // must acknowledge its receipt immediately, without another model decision.
    const map: MapState = await (await browser.get(`${path}/map`)).json();
    expect(
      (
        await post('map/draft', {
          id: 'helmet',
          version: map.draft.version,
          contentVersion: map.contentVersion,
          baseRevision: null,
          value: { typeId: map.types[0].id, name: 'Hjälmen', description: '' },
        })
      ).status(),
    ).toBe(200);
    const proposed: MapState = await (await browser.get(`${path}/map`)).json();
    const attempt = {
      operationId: 'restored-owner-retry',
      version: proposed.draft.version,
      contentVersion: proposed.contentVersion,
    };
    expect((await post('map/operations', attempt)).status()).toBe(200);
    // Start a fresh authorized executor so pending work is checked first.
    await post(`${route}/stop`, {});
    const resumed: TextAssistantView = await (
      await post('text-assistant', { externalAi: true, mapWork: true })
    ).json();
    expect(resumed.phase).toBe('recovery');
    route = `text-assistant/${resumed.id}`;
    let result: TextAssistantView;
    if (mode === 'voice') {
      expect(
        (
          await post(`${route}/voice`, {
            sdp: 'synthetic-offer',
            revision: resumed.revision,
            draftVersion: resumed.review.version,
            contentVersion: resumed.review.contentVersion,
          })
        ).status(),
      ).toBe(201);
      result = await say('Slutför samma sparförsök.');
    } else
      result = await (
        await post(`${route}/retry`, {
          operationId: attempt.operationId,
          revision: resumed.revision,
        })
      ).json();
    expect(result).toMatchObject({
      phase: 'ready',
      receipt: {
        operationId: attempt.operationId,
        userId: ownerId,
        changes: [{ after: { id: 'helmet' } }],
      },
    });
    expect(result.error).toBeUndefined();
    const repeated = await post(`text-assistant/${resumed.id}/retry`, {
      operationId: attempt.operationId,
    });
    expect((await repeated.json()).receipt).toEqual(result.receipt);
    const { history } = await (await browser.get(`${path}/map/history`)).json();
    expect(history).toHaveLength(2);
    expect(history).toContainEqual(result.receipt);
    expect(model.requests).toHaveLength(1);
  },
);

test.each(['login actor', 'other owner', 'other household', 'other content generation'])(
  'a save response for the %s cannot confirm the restored owner operation',
  async (mismatch) => {
    let actorId = '';
    let tampered = false;
    const model = textModel((body) => {
      const input = body.input.filter((item) => item.role === 'user').at(-1);
      const { draft } = JSON.parse(String(input?.content));
      return [
        modelTool('save_draft', {
          version: draft.version,
          contentVersion: draft.contentVersion,
          operationId: 'provider-save',
        }),
      ];
    });
    const fixture = await restored({
      modelFetch: model.provider,
      assistantDispatch: async (request, dispatch) => {
        const rpc =
          request.method === 'POST' && new URL(request.url).pathname === '/mcp'
            ? await request.clone().json()
            : null;
        const response = await dispatch(request);
        if (rpc?.params?.name !== 'save_draft') return response;
        const body = await response.json();
        const content = body.result.content.find((item: { type: string }) => item.type === 'text');
        const result = JSON.parse(content.text);
        if (mismatch === 'login actor') result.receipt.userId = actorId;
        else if (mismatch === 'other owner') result.receipt.userId = 'unrelated-content-owner';
        else if (mismatch === 'other household') result.receipt.householdId = 'unrelated-household';
        else result.receipt.contentVersion++;
        content.text = JSON.stringify(result);
        tampered = true;
        return Response.json(body);
      },
    });
    actorId = fixture.actorId;
    const { browser, path, post } = fixture;
    const session: TextAssistantView = await (
      await post('text-assistant', { externalAi: true, mapWork: true })
    ).json();
    const route = `text-assistant/${session.id}`;
    expect(
      (
        await post(`${route}/messages`, {
          revision: session.revision,
          draftVersion: session.review.version,
          contentVersion: session.review.contentVersion,
          requestId: 'save-restored',
          text: 'Spara.',
        })
      ).status(),
    ).toBe(202);
    let status = session;
    await expect
      .poll(async () => {
        status = await (await browser.get(`${path}/${route}`)).json();
        return status.phase;
      })
      .not.toBe('working');
    expect(tampered).toBe(true);
    expect(status).toMatchObject({ phase: 'recovery', error: 'assistant_provider_failed' });
    expect(status.receipt).toBeUndefined();
    expect(status.reply).toBeUndefined();
    const recovered: TextAssistantView = await (await post(`${route}/recover`, {})).json();
    expect(recovered).toMatchObject({
      phase: 'ready',
      receipt: { userId: fixture.ownerId, contentVersion: 3 },
    });
    expect((await (await browser.get(`${path}/map/history`)).json()).history).toEqual([
      recovered.receipt,
    ]);
    expect(model.requests).toHaveLength(1);
  },
);
