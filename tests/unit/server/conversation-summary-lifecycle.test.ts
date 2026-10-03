import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
let release = () => {};
afterEach(async () => {
  release();
  await browser?.dispose();
  await app?.close();
});

test.each(['new', 'cancel', 'stop', 'revoke'] as const)(
  'a late summary cannot replace context after %s, and the original private draft remains intact',
  async (action) => {
    let summarySignal: AbortSignal | null | undefined;
    let full = false;
    let summaryEntered = false;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const model = textModel(async (body) => {
      if (!body.tools.length) {
        summaryEntered = true;
        await waiting;
        return [modelMessage('Obsolete private summary.')];
      }
      full = true;
      return [modelMessage('Den ursprungliga dialogen.')];
    });
    app = await createInstallation(undefined, {
      modelFetch: async (input, init) => {
        if (!JSON.parse(String(init?.body)).tools.length) summarySignal = init?.signal;
        const response = await model.provider(input, init);
        if (!full) return response;
        full = false;
        const body = await response.json();
        body.usage.input_tokens = 1_040_000;
        return Response.json(body, { headers: response.headers });
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const householdPath = `${app.origin}/api/households/${household.id}`;
    const path = `${householdPath}/text-assistant`;
    const post = (url: string, data: unknown = {}) =>
      browser.post(url, { headers: { origin: app.origin }, data });
    const map = await (await browser.get(`${householdPath}/map`)).json();
    expect(
      (
        await post(`${householdPath}/map/draft`, {
          version: 0,
          contentVersion: 1,
          id: 'kept',
          baseRevision: null,
          value: { typeId: map.types[0].id, name: 'Förslaget som ligger kvar', description: '' },
        })
      ).status(),
    ).toBe(200);
    const original = await (await browser.get(`${householdPath}/map`)).json();
    const started = await post(path, approvedForVisit);
    expect(started.status()).toBe(201);
    const session = await started.json();
    const sessionPath = `${path}/${session.id}`;
    expect(
      (
        await post(`${sessionPath}/messages`, {
          revision: 0,
          draftVersion: 1,
          contentVersion: 1,
          requestId: 'first-task',
          text: 'Beskriv utkastet.',
        })
      ).status(),
    ).toBe(202);
    await expect.poll(() => summaryEntered).toBe(true);
    const summarizing = await (await browser.get(sessionPath)).json();
    expect(summarizing.contextSummaryState).toBe('summarizing');
    const stopped =
      action === 'revoke'
        ? await post(`${householdPath}/conversation-consent/revoke`)
        : await post(`${sessionPath}/${action}`, action === 'cancel' ? { all: true } : {});
    expect(stopped.status(), await stopped.text()).toBe(200);
    await expect.poll(() => summarySignal?.aborted).toBe(true);
    release();
    await expect.poll(() => model.requests.length).toBe(2);
    if (action === 'new' || action === 'cancel') {
      await expect
        .poll(async () => (await (await browser.get(sessionPath)).json()).contextSummaryState)
        .not.toBe('summarizing');
      const current = await (await browser.get(sessionPath)).json();
      expect(current.contextGeneration ?? 0).toBe(0);
      expect(current.contextSummaries ?? []).toEqual([]);
      expect(JSON.stringify(current)).not.toContain('Obsolete private summary.');
      expect(current.phase).toBe('ready');
    } else expect((await browser.get(sessionPath)).status()).toBe(action === 'revoke' ? 403 : 404);
    expect((await (await browser.get(`${householdPath}/map`)).json()).draft).toEqual(
      original.draft,
    );
    expect((await (await browser.get(`${householdPath}/map/history`)).json()).history).toEqual([]);
  },
);
