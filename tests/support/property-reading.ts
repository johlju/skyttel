import { type APIRequestContext, expect } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import type { Property } from '../../src/shared/properties.js';
import { createHousehold, signIn } from './client.js';

/** Synthetic saved and proposed content prepared through ordinary HTTP. */
export async function preparePropertyReading(client: APIRequestContext, origin: string) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.get(path)).json();
  const post = async (route: string, data: object) => {
    const state = await read();
    const response = await client.post(`${path}/${route}`, {
      headers: { origin },
      data: { version: state.draft.version, contentVersion: state.contentVersion, ...data },
    });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  const state = await read();
  await post('object-type', {
    id: 'reading-object',
    baseRevision: null,
    value: { name: 'Läsobjekt', description: '' },
  });
  const properties: Property[] = [
    { id: 'empty', label: 'Ramnummer' },
    { id: 'color', label: 'Ramnummer', kind: 'text', value: 'Röd' },
    { id: 'zero', label: 'Antal', kind: 'number', value: 0 },
    { id: 'false', label: 'Kontrollerad', kind: 'boolean', value: false },
    { id: 'date', label: 'Slutdatum', kind: 'date', value: '2000-01-01' },
  ];
  for (const [id, name, values] of [
    ['alex', 'Alex', []],
    ['one', 'Cykel', properties],
    [
      'two',
      'Cykel',
      [
        { id: 'blue', label: 'Ramnummer', kind: 'text', value: 'Blå' },
        { id: 'typed-empty', label: 'Antal', kind: 'number' },
      ],
    ],
  ] as const)
    await post('draft', {
      id,
      baseRevision: null,
      value: { name, typeId: 'reading-object', properties: values },
    });
  await post('relationship', {
    id: 'edge',
    baseRevision: null,
    value: {
      sourceId: 'alex',
      targetId: 'one',
      typeId: state.relationshipTypes[0].id,
      properties: [
        { id: 'a', label: 'Avtal' },
        { id: 'b', label: 'Avtal', kind: 'boolean', value: false },
      ],
    },
  });
  await post('save', { operationId: 'reading-setup' });
  const saved = await read();
  const first = saved.objects.find(({ id }) => id === 'one');
  const edge = saved.relationships[0];
  if (!first) throw new Error('Missing reading fixture');
  await post('draft', {
    id: 'one',
    baseRevision: first.revision,
    value: {
      ...first,
      properties: properties.map((property) =>
        property.id === 'color' ? { ...property, kind: 'text', value: 'Grön' } : property,
      ),
    },
  });
  await post('relationship', {
    id: 'edge',
    baseRevision: edge.revision,
    value: {
      ...edge,
      properties: [
        { id: 'b', label: 'Avtal', kind: 'boolean', value: false },
        { id: 'a', label: 'Avtal', kind: 'text' },
      ],
    },
  });
  return { read, post, path };
}
