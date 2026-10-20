import { createHousehold, signIn } from '../support/client.js';
import { approvedForVisit } from '../support/conversation.js';
import { createInstallation } from '../support/installation.js';
import { expect, test } from '../support/test.js';
import { modelTool, textModel } from '../support/text-model.js';

test('an accepted text tool waiting at MCP cannot write at its original deadline', {
  tag: '@technical',
}, async ({ request }) => {
  let clock = Date.now();
  let typeId: string;
  let toolReached = false;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = textModel(() => [
    modelTool('submit_changes', {
      version: 0,
      contentVersion: 1,
      completion: 'draft',
      operations: [
        {
          name: 'propose_object',
          arguments: {
            id: 'late-tool',
            baseRevision: null,
            value: { typeId, name: 'För sent verktyg' },
          },
        },
      ],
    }),
  ]);
  const app = await createInstallation(undefined, {
    now: () => clock,
    modelFetch: model.provider,
    assistantDispatch: async (incoming, dispatch) => {
      const rpc = await incoming
        .clone()
        .json()
        .catch(() => null);
      if (rpc?.params?.name === 'propose_object') {
        toolReached = true;
        await waiting;
      }
      return dispatch(incoming);
    },
  });
  try {
    await signIn(request, app.origin);
    const { household } = await (await createHousehold(request, app.origin)).json();
    const mapPath = `${app.origin}/api/households/${household.id}/map`;
    typeId = (await (await request.get(mapPath)).json()).types[0].id;
    const path = `${app.origin}/api/households/${household.id}/text-assistant`;
    const session = await (
      await request.post(path, {
        headers: { origin: app.origin },
        data: approvedForVisit,
      })
    ).json();
    const accepted = await request.post(`${path}/${session.id}/messages`, {
      headers: { origin: app.origin },
      data: {
        requestId: 'bounded-tool',
        revision: 0,
        draftVersion: 0,
        contentVersion: 1,
        text: 'Lägg till För sent verktyg.',
      },
    });
    expect(accepted.status()).toBe(202);
    await expect.poll(() => toolReached).toBe(true);
    clock += 30 * 60_000;
    release();
    await expect
      .poll(async () => (await (await request.get(`${path}/${session.id}`)).json()).phase)
      .not.toBe('working');
    expect((await (await request.get(mapPath)).json()).draft.changes).toEqual([]);
  } finally {
    release();
    await app.close();
  }
});
