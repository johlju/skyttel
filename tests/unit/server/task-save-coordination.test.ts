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
  'input during saving requires a fresh save request: %s',
  { tags: ['technical'] },
  async (correction) => {
    let release: (value: unknown[]) => void = () => {};
    const held = new Promise<unknown[]>((resolve) => {
      release = resolve;
    });
    let typeId = '';
    let saveRequests = 0;
    const model = textModel((body) => {
      const input = JSON.parse(
        String(body.input.findLast((item) => item.role === 'user')?.content),
      );
      const { message } = input;
      if (message === 'Spara mina ändringar.')
        return saveRequests++ === 0
          ? held
          : [
              modelTool('save_draft', {
                version: input.draft.version,
                contentVersion: input.draft.contentVersion,
              }),
            ];
      if (message === 'Spara inte.')
        return [modelMessage('Ändringarna ligger kvar i ditt utkast.')];
      if (body.input.findLast((item) => item.role !== 'developer')?.type === 'function_call_output')
        return [modelMessage('Utkastet är uppdaterat.')];
      return [
        modelTool('propose_object', {
          version: 1,
          contentVersion: 1,
          id: 'proposal',
          baseRevision: null,
          value: {
            typeId,
            name: 'Slutvärdet',
            properties: [
              { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Bevaras' },
            ],
          },
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
          value: {
            typeId,
            name: 'Första värdet',
            properties: [
              { id: 'description', label: 'Beskrivning', kind: 'text', value: 'Bevaras' },
            ],
          },
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
          text: 'Spara mina ändringar.',
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
    expect(finished.operations).toEqual([]);
    expect(finished.receipt).toBeUndefined();
    expect(history.history).toEqual([]);
    expect(state.objects).toEqual(before.objects);
    if (correction === 'Spara inte.') {
      expect(state.draft.changes).toMatchObject([
        { id: 'proposal', after: { name: 'Första värdet' } },
      ]);
    } else {
      expect(state.draft.changes).toMatchObject([
        { id: 'proposal', after: { name: 'Slutvärdet' } },
      ]);
      expect(
        (
          await post(`${path}/messages`, {
            revision: finished.revision,
            draftVersion: state.draft.version,
            contentVersion: state.contentVersion,
            requestId: 'renewed-save',
            text: 'Spara mina ändringar.',
          })
        ).status(),
      ).toBe(202);
      await expect
        .poll(async () => (await (await browser.get(`${base}/${path}`)).json()).receipt)
        .toBeDefined();
      const saved = await (await browser.get(`${base}/map`)).json();
      expect(saved.objects).toMatchObject([{ id: 'proposal', name: 'Slutvärdet' }]);
      expect(saved.draft.changes).toEqual([]);
      expect((await (await browser.get(`${base}/map/history`)).json()).history).toHaveLength(1);
    }
  },
);
