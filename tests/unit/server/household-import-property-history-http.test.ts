import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import type { MapState, SaveReceipt } from '../../../src/shared/map.js';
import { createHousehold, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';
import { propertyValues } from '../../support/property-controls.js';

test('historical property kinds and exact receipts survive replacement and ordinary corrections', {
  tags: ['technical'],
}, async () => {
  const client = await request.newContext();
  const installation = await createInstallation();
  try {
    await signIn(client, installation.origin);
    const { household } = await (await createHousehold(client, installation.origin)).json();
    const householdPath = `${installation.origin}/api/households/${household.id}`;
    const path = `${householdPath}/map`;
    const headers = { origin: installation.origin };
    const read = async (): Promise<MapState> => (await client.get(path)).json();
    const post = async (route: string, body: Record<string, unknown>) => {
      const state = await read();
      const response = await client.post(`${path}/${route}`, {
        headers,
        data: { version: state.draft.version, contentVersion: state.contentVersion, ...body },
      });
      expect(response.status(), await response.text()).toBe(200);
      return response;
    };
    const save = async (operationId: string): Promise<SaveReceipt> =>
      (await (await post('save', { operationId })).json()).receipt;
    const typeId = (await read()).types[0].id;
    const define = async (meaning: string) => {
      const type = (await read()).types.find((value) => value.id === typeId);
      expect(type).toBeDefined();
      await post('object-type', {
        id: typeId,
        baseRevision: type?.revision,
        value: { ...type, description: meaning },
      });
    };
    await define('Första betydelsen');
    await save('text-definition');
    await define('Senare betydelsen');
    await post('draft', {
      id: 'measured-object',
      baseRevision: null,
      value: {
        typeId,
        name: 'Mätare',
        properties: [{ id: 'serial', label: 'Ramnummer', kind: 'number' as const, value: 42 }],
      },
    });
    const addition = await save('number-and-object');
    const removed = (await read()).objects.find((value) => value.id === 'measured-object');
    await post('draft', { id: 'measured-object', baseRevision: removed?.revision, value: null });
    await define('Första betydelsen');
    const inverse = await save('remove-object-and-use-text');
    expect(propertyValues(inverse.changes[0].before)).toEqual({ serial: 42 });
    expect(inverse.changes[0].before?.properties).toEqual([
      { id: 'serial', label: 'Ramnummer', kind: 'number', value: 42 },
    ]);
    expect(inverse.changes[0].type.description).toBe('Första betydelsen');
    expect((await read()).objects).toEqual([]);
    const history = (await (await client.get(`${path}/history`)).json()).history;

    const prepared = await client.post(`${householdPath}/exports`, { headers, data: {} });
    expect(prepared.status()).toBe(201);
    const exportId = (await prepared.json()).id;
    const downloaded = await client.get(`${householdPath}/exports/${exportId}`);
    expect(downloaded.status()).toBe(200);
    const imported = await client.post(`${householdPath}/imports`, {
      headers: {
        ...headers,
        'content-type': 'application/zip',
        'X-Skyttel-Content-Version': String((await read()).contentVersion),
      },
      data: await downloaded.body(),
    });
    expect(imported.status(), await imported.text()).toBe(201);
    const ready = await imported.json();
    const confirmed = await client.post(`${householdPath}/imports/${ready.id}/confirm`, {
      headers,
      data: { contentVersion: ready.contentVersion, confirmed: true },
    });
    expect(confirmed.status(), await confirmed.text()).toBe(200);
    expect(await confirmed.json()).toMatchObject({ status: 'completed', contentVersion: 2 });
    await installation.restart();
    expect((await (await client.get(`${path}/history`)).json()).history).toEqual(history);
    await define('Senare betydelsen');
    await post('draft', {
      id: 'new-measured-object',
      baseRevision: null,
      value: {
        typeId,
        name: 'Ny mätare',
        properties: [{ id: 'serial', label: 'Ramnummer', kind: 'number' as const, value: 43 }],
      },
    });
    const correction = await save('ordinary-correction');
    await installation.restart();
    const restored = await read();
    expect(restored.objects).toEqual([
      expect.objectContaining({
        id: 'new-measured-object',
        properties: [{ id: 'serial', label: 'Ramnummer', kind: 'number' as const, value: 43 }],
      }),
    ]);
    expect(restored.types.find((value) => value.id === typeId)?.description).toBe(
      'Senare betydelsen',
    );
    const finalHistory = (await (await client.get(`${path}/history`)).json()).history;
    expect(finalHistory).toContainEqual(inverse);
    expect(finalHistory).toContainEqual(addition);
    expect(finalHistory).toContainEqual(correction);
  } finally {
    await client.dispose();
    await installation.close();
  }
});
