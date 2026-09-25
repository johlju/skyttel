import { expect, test } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn } from '../support/client.js';
import { createInstallation } from '../support/installation.js';

test('IMPORT-07: historical field meanings survive replacement and fresh whole-save undo', async ({
  page,
}) => {
  const installation = await createInstallation();
  try {
    await signIn(page.request, installation.origin);
    const { household } = await (await createHousehold(page.request, installation.origin)).json();
    const householdPath = `${installation.origin}/api/households/${household.id}`;
    const path = `${householdPath}/map`;
    const headers = { origin: installation.origin };
    const read = async (): Promise<MapState> => (await page.request.get(path)).json();
    const post = async (route: string, body: Record<string, unknown>) => {
      const state = await read();
      const response = await page.request.post(`${path}/${route}`, {
        headers,
        data: { version: state.draft.version, contentVersion: state.contentVersion, ...body },
      });
      expect(response.status(), await response.text()).toBe(200);
      return response;
    };
    const save = async (operationId: string): Promise<SaveReceipt> =>
      (await (await post('save', { operationId })).json()).receipt;
    const typeId = (await read()).types[0].id;
    const define = async (kind: 'number' | 'text') => {
      const type = (await read()).types.find((value) => value.id === typeId);
      expect(type).toBeDefined();
      await post('object-type', {
        id: typeId,
        baseRevision: type?.revision,
        value: {
          ...type,
          fields: [{ id: 'serial', name: 'Serienummer', description: '', kind }],
        },
      });
    };
    await define('text');
    await save('text-definition');
    await define('number');
    await post('draft', {
      id: 'measured-object',
      baseRevision: null,
      value: { typeId, name: 'Mätare', description: '', customValues: { serial: 42 } },
    });
    const addition = await save('number-and-object');
    await post('undo', { userId: addition.userId, operationId: addition.operationId });
    const inverse = await save('restore-text-definition');
    expect(inverse.changes[0].before?.customValues).toEqual({ serial: 42 });
    expect(inverse.changes[0].beforeType?.fields?.[0].kind).toBe('number');
    expect(inverse.changes[0].type.fields?.[0].kind).toBe('text');
    expect((await read()).objects).toEqual([]);
    const history = (await (await page.request.get(`${path}/history`)).json()).history;

    const prepared = await page.request.post(`${householdPath}/exports`, { headers, data: {} });
    expect(prepared.status()).toBe(201);
    const exportId = (await prepared.json()).id;
    const downloaded = await page.request.get(`${householdPath}/exports/${exportId}`);
    expect(downloaded.status()).toBe(200);
    const imported = await page.request.post(`${householdPath}/imports`, {
      headers: {
        ...headers,
        'content-type': 'application/zip',
        'X-Skyttel-Content-Version': String((await read()).contentVersion),
      },
      data: await downloaded.body(),
    });
    expect(imported.status(), await imported.text()).toBe(201);
    const ready = await imported.json();
    const confirmed = await page.request.post(`${householdPath}/imports/${ready.id}/confirm`, {
      headers,
      data: { contentVersion: ready.contentVersion, confirmed: true },
    });
    expect(confirmed.status(), await confirmed.text()).toBe(200);
    expect(await confirmed.json()).toMatchObject({ status: 'completed', contentVersion: 2 });
    await installation.restart();
    expect((await (await page.request.get(`${path}/history`)).json()).history).toEqual(history);
    await post('undo', { userId: inverse.userId, operationId: inverse.operationId });
    await save('fresh-restoration');
    await installation.restart();
    const restored = await read();
    expect(restored.objects).toEqual([
      expect.objectContaining({ id: 'measured-object', customValues: { serial: 42 } }),
    ]);
    expect(restored.types.find((value) => value.id === typeId)?.fields?.[0].kind).toBe('number');
    const finalHistory = (await (await page.request.get(`${path}/history`)).json()).history;
    expect(finalHistory).toContainEqual(inverse);
    expect(finalHistory).toContainEqual(addition);
  } finally {
    await installation.close();
  }
});
