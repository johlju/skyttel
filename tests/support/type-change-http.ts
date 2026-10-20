import { type APIRequestContext, expect } from '@playwright/test';
import type { MapState, SaveReceipt } from '../../src/shared/map.js';
import { createHousehold, signIn } from './client.js';

export async function typeChangeHousehold(client: APIRequestContext, origin: string) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (actor = client): Promise<MapState> => (await actor.get(path)).json();
  const post = (route: string, data: unknown, actor = client) =>
    actor.post(`${path}/${route}`, { headers: { origin }, data });
  const save = async (operationId: string, actor = client): Promise<SaveReceipt> => {
    const response = await post(
      'save',
      { version: (await read(actor)).draft.version, operationId },
      actor,
    );
    expect(response.status()).toBe(200);
    return (await response.json()).receipt;
  };
  const object = async (id: string, update: Record<string, unknown>, actor = client) => {
    const state = await read(actor);
    const before = state.objects.find((item) => item.id === id);
    return post(
      'draft',
      {
        version: state.draft.version,
        id,
        baseRevision: before?.revision ?? null,
        value: { typeId: 'cycle', name: id, ...before, ...update },
      },
      actor,
    );
  };
  for (const [id, name] of [
    ['cycle', 'Cykel'],
    ['vehicle', 'Motorfordon'],
  ]) {
    expect(
      (
        await post('object-type', {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: { name, description: '' },
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await object('bike', {
        name: 'Alex blå cykel',
        identity: 'unspecified',
        iconId: 'bike',
        properties: [
          { id: 'serial', label: 'Nummer', kind: 'text', value: 'SYNTH-42' },
          { id: 'insured', label: 'Försäkrad', kind: 'boolean', value: false },
        ],
      })
    ).status(),
  ).toBe(200);
  expect((await object('garage', { name: 'Garaget' })).status()).toBe(200);
  const state = await read();
  expect(
    (
      await post('relationship', {
        version: state.draft.version,
        id: 'parking',
        baseRevision: null,
        value: {
          typeId: state.relationshipTypes[0].id,
          sourceId: 'bike',
          targetId: 'garage',
        },
      })
    ).status(),
  ).toBe(200);
  await save('setup');
  return { path, read, post, save, object };
}
