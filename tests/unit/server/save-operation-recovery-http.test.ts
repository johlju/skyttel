import { join } from 'node:path';
import { type APIRequestContext, request } from '@playwright/test';
import Database from 'better-sqlite3';
import { afterEach, expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { approvedForVisit } from '../../support/conversation.js';
import { createInstallation } from '../../support/installation.js';
import { textModel } from '../../support/text-model.js';

let app: Awaited<ReturnType<typeof createInstallation>>;
let browser: APIRequestContext;
afterEach(async () => {
  await browser?.dispose();
  await app?.close();
});

test.each(['known', 'unknown'] as const)(
  'a lost registered save response survives conversation stop and restart with a repeatable %s outcome',
  { tags: ['technical'] },
  async (outcome) => {
    let dropped = false;
    let armed = false;
    const model = textModel(() => {
      throw new Error('Recovery must not start model work');
    });
    app = await createInstallation(undefined, {
      modelFetch: model.provider,
      deliverResponse: (incoming, response) => {
        if (
          !armed ||
          incoming.method !== 'POST' ||
          !new URL(incoming.url).pathname.endsWith('/map/operations')
        )
          return response;
        armed = false;
        dropped = true;
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('Lost registered save response'));
            },
          }),
          { headers: response.headers },
        );
      },
    });
    browser = await request.newContext();
    await signIn(browser, app.origin);
    const { household } = await (await createHousehold(browser, app.origin)).json();
    const base = `${app.origin}/api/households/${household.id}`;
    const path = `${base}/map`;
    const post = (route: string, data: unknown) =>
      browser.post(`${base}/${route}`, { headers: { origin: app.origin }, data });
    const read = async (): Promise<MapState> => (await browser.get(path)).json();
    const initial = await read();
    expect(
      (
        await post('map/draft', {
          version: 0,
          contentVersion: 1,
          id: 'lo',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Lo' },
        })
      ).status(),
    ).toBe(200);
    const started = await post('text-assistant', approvedForVisit);
    expect(started.status()).toBe(201);
    const session = await started.json();
    const before = await read();
    const body = {
      operationId: 'registered-before-response-loss',
      version: before.draft.version,
      contentVersion: before.contentVersion,
    };
    if (outcome === 'unknown') {
      // Fault the actual storage adapter, not the save implementation. The
      // trigger persists across restart and prevents the atomic receipt write.
      const storage = new Database(join(app.directory, 'skyttel.db'));
      storage.exec(
        "CREATE TRIGGER receipt_unavailable BEFORE INSERT ON map_save BEGIN SELECT RAISE(ABORT, 'controlled storage outage'); END",
      );
      storage.close();
    }
    armed = true;
    await post('map/operations', body)
      .then((response) => response.text())
      .catch(() => undefined);
    expect(dropped).toBe(true);
    const registered = (await (await browser.get(`${path}/operations`)).json()).operations;
    expect(registered).toMatchObject([
      { operationId: body.operationId, status: 'pending', draftVersion: 1 },
    ]);
    expect((await post(`text-assistant/${session.id}/stop`, {})).status()).toBe(200);
    browser = await restartWithSession(browser, () => app.restart());
    expect((await browser.get(`${base}/text-assistant/${session.id}`)).status()).toBe(404);
    const check = {
      checkId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operationIds: [registered[0].operationId],
    };
    if (outcome === 'unknown') {
      for (let attempt = 0; attempt < 2; attempt++) {
        expect((await post('text-assistant/recover', check)).status()).toBe(500);
        expect((await (await browser.get(`${path}/operations`)).json()).operations).toEqual(
          registered,
        );
        expect(await read()).toEqual(before);
        expect(await (await post('map/discard', { version: 1, contentVersion: 1 })).json()).toEqual(
          { error: 'operation_pending' },
        );
        expect(
          await (
            await post('map/draft', {
              version: 1,
              contentVersion: 1,
              id: 'other',
              baseRevision: null,
              value: { typeId: initial.types[0].id, name: 'Senare ändring' },
            })
          ).json(),
        ).toEqual({ error: 'operation_pending' });
        expect((await (await browser.get(`${path}/history`)).json()).history).toEqual([]);
      }
      const storage = new Database(join(app.directory, 'skyttel.db'));
      storage.exec('DROP TRIGGER receipt_unavailable');
      storage.close();
      browser = await restartWithSession(browser, () => app.restart());
    }
    const recovered = await post('text-assistant/recover', check);
    expect(recovered.status(), await recovered.text()).toBe(200);
    const checked = await recovered.json();
    expect(checked.receipt).toMatchObject({
      operationId: body.operationId,
      draftVersion: 1,
      changes: [{ after: { id: 'lo', name: 'Lo' } }],
    });
    expect(checked.operations).toMatchObject([
      { operationId: body.operationId, status: 'succeeded' },
    ]);
    expect(await (await post('text-assistant/recover', check)).json()).toEqual(checked);
    expect(await (await post('map/save', body)).json()).toEqual({ receipt: checked.receipt });
    expect((await (await browser.get(`${path}/operations`)).json()).operations).toHaveLength(1);
    expect((await (await browser.get(`${path}/history`)).json()).history).toEqual([
      checked.receipt,
    ]);
    expect((await read()).draft).toEqual({ version: 2, changes: [] });
    expect((await read()).objects).toMatchObject([{ id: 'lo', name: 'Lo' }]);
    expect(model.requests).toEqual([]);
  },
);
