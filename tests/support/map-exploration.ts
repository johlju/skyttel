import { type APIRequestContext, expect } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from './client.js';

export async function prepareMapExploration(
  client: APIRequestContext,
  origin: string,
  variant: 'base' | 'ended' | 'removed' = 'base',
) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.get(path)).json();
  const post = async (route: string, body: Record<string, unknown>) => {
    const state = await read();
    const response = await client.post(`${path}/${route}`, {
      headers: { origin },
      data: { version: state.draft.version, ...body },
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const initial = await read();
  for (const [id, name] of [
    ['alex', 'Alex Exempel'],
    ['bike', 'Blå cykel'],
    ['garage', 'Garaget'],
    ['house', 'Bostaden'],
    ['unrelated', 'Oberoende objekt'],
  ]) {
    await post('draft', {
      id,
      baseRevision: null,
      value: { typeId: initial.types[0].id, name },
    });
  }
  for (const [id, sourceId, targetId] of [
    ['uses', 'alex', 'bike'],
    ['stored', 'bike', 'garage'],
    ['belongs', 'garage', 'house'],
  ]) {
    await post('relationship', {
      id,
      baseRevision: null,
      value: { typeId: initial.relationshipTypes[0].id, sourceId, targetId },
    });
  }
  await post('save', { operationId: 'initial' });
  if (variant === 'removed') {
    const state = await read();
    const removed = state.objects.find((item) => item.id === 'unrelated');
    const bike = state.objects.find((item) => item.id === 'bike');
    if (!removed || !bike) throw new Error('Expected fixtures');
    await post('draft', { id: removed.id, baseRevision: removed.revision, value: null });
    await post('save', { operationId: 'removed' });
    await post('draft', { id: bike.id, baseRevision: bike.revision, value: null });
  } else if (variant === 'ended') {
    const state = await read();
    const bike = state.objects.find((item) => item.id === 'bike');
    if (!bike) throw new Error('Expected bicycle');
    await post('draft', {
      id: 'bike',
      baseRevision: bike.revision,
      value: { ...bike, typeId: state.types[1].id },
    });
    await post('draft', {
      id: 'ended',
      baseRevision: null,
      value: { name: 'Upphörd granne', typeId: state.types[1].id, lifecycle: 'ended' },
    });
    for (const [id, targetId, lifecycle] of [
      ['ended-object', 'ended', 'active'],
      ['ended-edge', 'unrelated', 'ended'],
    ]) {
      await post('relationship', {
        id,
        baseRevision: null,
        value: { sourceId: 'alex', targetId, typeId: state.relationshipTypes[0].id, lifecycle },
      });
    }
    await post('save', { operationId: 'lifecycle' });
    const alex = (await read()).objects.find((item) => item.id === 'alex');
    if (!alex) throw new Error('Expected Alex');
    await post('draft', {
      id: 'alex',
      baseRevision: alex.revision,
      value: {
        ...alex,
        properties: [
          { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: 'Nytt förslag' },
        ],
      },
    });
  }
  return { read, post, household, initial };
}
