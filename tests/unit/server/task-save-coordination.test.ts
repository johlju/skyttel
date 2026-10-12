import { type APIRequestContext, request } from '@playwright/test';
import { afterEach, expect, test } from 'vitest';
import { createHousehold, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { modelMessage, modelTool, textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

test.each(['Rätta namnet till Slutvärdet.', 'Spara inte.'])(
  'input during saving is processed before any write: %s',
  { tags: ['technical'] },
  async (correction) => {
    let release: (value: unknown[]) => void = () => {};
    const held = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    let typeId = '';
    const model = textModel((body) => {
      const message = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      ).message;
      if (message === 'Spara hela utkastet.') return held;
      if (message === 'Spara inte.')
        return [modelMessage('Ändringarna ligger kvar i ditt utkast.')];
      if (body.input.at(-1)?.type === 'function_call_output')
        return [modelMessage('Utkastet är uppdaterat.')];
      return [
        modelTool('propose_object', {
          version: 1,
          contentVersion: 1,
          id: 'proposal',
          baseRevision: null,
          value: { typeId, name: 'Slutvärdet', description: 'Bevaras' },
        }),
      ];
    });
    app = await createInstallation(undefined, { modelFetch: model.provider });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const base = `${app.origin}/api/households/${household.id}`;
    const post = (path: string, data: unknown) =>
      browser.post(`${base}/${path}`, { headers: { origin: app.origin }, data });
    const before = await (await browser.get(`${base}/map`)).json();
    typeId = before.types[0].id;
    expect(
      (
        await post('map/draft', {
          version: 0,
          contentVersion: 1,
          id: 'proposal',
          baseRevision: null,
          value: { typeId, name: 'Första värdet', description: 'Bevaras' },
        })
      ).status(),
    ).toBe(200);
    const initial = await (await post('text-assistant', approvedForVisit)).json();
    const path = `text-assistant/${initial.id}`;
    const envelope = { revision: 0, draftVersion: 1, contentVersion: 1 };
    expect(
      (
        await post(`${path}/messages`, {
          ...envelope,
          requestId: 'save',
          text: 'Spara hela utkastet.',
        })
      ).status(),
    ).toBe(202);
    await expect.poll(() => model.requests.length).toBe(1);
    const working = await (await browser.get(`${base}/${path}`)).json();
    expect(
      (
        await post(`${path}/messages`, {
          ...envelope,
          revision: working.revision,
          requestId: 'correction',
          text: correction,
        })
      ).status(),
    ).toBe(202);
    release([modelTool('save_draft', { version: 1, contentVersion: 1 })]);
    await expect
      .poll(
        async () =>
          (await (await browser.get(`${base}/${path}/messages/correction`)).json()).taskStatus,
        { timeout: 5000 },
      )
      .toBe('completed');
    const finished = await (await browser.get(`${base}/${path}`)).json();
    const state = await (await browser.get(`${base}/map`)).json();
    const history = await (await browser.get(`${base}/map/history`)).json();
    if (correction === 'Spara inte.') {
      expect(finished.operations).toEqual([]);
      expect(history.history).toEqual([]);
      expect(state.objects).toEqual(before.objects);
      expect(state.draft.changes).toMatchObject([
        { id: 'proposal', after: { name: 'Första värdet' } },
      ]);
    } else {
      expect(finished.operations).toHaveLength(1);
      expect(finished.receipt).toBeDefined();
      expect(history.history).toHaveLength(1);
      expect(state.objects).toMatchObject([{ id: 'proposal', name: 'Slutvärdet' }]);
      expect(state.draft.changes).toEqual([]);
    }
  },
);
