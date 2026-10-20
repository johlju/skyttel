import { type APIRequestContext, expect } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from './client.js';

/** Synthetic public-HTTP data for the nonvisual Alex → bicycle → garage chain. */
export async function prepareHouseholdReading(
  client: APIRequestContext,
  origin: string,
  fillers = true,
) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.get(path)).json();
  const post = async (route: string, data: object) => {
    const current = await read();
    const response = await client.post(`${path}/${route}`, {
      headers: { origin },
      data: { version: current.draft.version, contentVersion: current.contentVersion, ...data },
    });
    expect(response.status(), await response.text()).toBe(200);
    return response.json();
  };
  await post('object-type', {
    id: 'read-type',
    baseRevision: null,
    value: { name: 'Läsobjekt', description: '' },
  });
  for (const [id, name, extra] of [
    ['alex', 'Alex', {}],
    [
      'bike',
      'Cykel',
      {
        iconId: 'bike',
        properties: [
          {
            id: 'hidden',
            label: 'Dold egen uppgift',
            kind: 'text' as const,
            value: 'Ramens märkning är ett påhittat exempel',
          },
          { id: 'price', label: 'Pris', kind: 'text' as const, value: '2000 SEK' },
          { id: 'debt', label: 'Senast uppgiven skuld', kind: 'text' as const },
          {
            id: 'debt-certainty',
            label: 'Senast uppgiven skuld: uppgiftens säkerhet',
            kind: 'text' as const,
            value: 'Uttryckligen inget',
          },
          { id: 'endDate', label: 'Slutdatum', kind: 'text' as const },
          {
            id: 'endDate-certainty',
            label: 'Slutdatum: uppgiftens säkerhet',
            kind: 'text' as const,
            value: 'Okänt',
          },
        ],
      },
    ],
    ['garage', 'Garage', { identity: 'unspecified' }],
    ...(fillers
      ? Array.from({ length: 53 }, (_, index) => [`filler-${index}`, `A ${index + 1}`, {}])
      : []),
  ] as const)
    await post('draft', {
      id,
      baseRevision: null,
      value: {
        name,
        typeId: 'read-type',
        ...extra,
        properties: [
          ...('properties' in extra ? extra.properties : []),
          {
            id: 'description',
            label: 'Beskrivning',
            kind: 'text' as const,
            value: `Hela beskrivningen för ${name}. `.repeat(15),
          },
        ],
      },
    });
  for (const [id, name] of [
    ['uses', 'Använder'],
    ['storage', 'Förvaras i'],
    ['none', 'Har ingen'],
    ['unknown', 'Okänd koppling'],
  ])
    await post('relationship-type', {
      id,
      baseRevision: null,
      value: {
        name,
        description: '',
        forwardLabel: name.toLocaleLowerCase('sv'),
        reverseLabel:
          id === 'uses'
            ? 'används av'
            : id === 'storage'
              ? 'förvarar'
              : name.toLocaleLowerCase('sv'),
      },
    });
  for (const [id, typeId, sourceId, targetId, certainty, extra] of [
    ['alex-bike', 'uses', 'alex', 'bike', 'Bekräftat', {}],
    [
      'bike-garage',
      'storage',
      'bike',
      'garage',
      'Osäkert uppgivet',
      {
        lifecycle: 'ended',
        properties: [
          {
            id: 'note',
            label: 'Dold sambandsuppgift',
            kind: 'text' as const,
            value: 'Sparad dold sambandsuppgift',
          },
          { id: 'endDate', label: 'Slutdatum', kind: 'date' as const, value: '2024-12-31' },
        ],
      },
    ],
    ['bike-none', 'none', 'bike', 'bike', 'Uttryckligen inget', {}],
    ['bike-unknown', 'unknown', 'bike', 'bike', 'Okänt', {}],
  ] as const)
    await post('relationship', {
      id,
      baseRevision: null,
      value: {
        typeId,
        sourceId,
        targetId,
        ...extra,
        properties: [
          ...('properties' in extra ? extra.properties : []),
          {
            id: 'certainty',
            label: 'Uppgiftens säkerhet',
            kind: 'text' as const,
            value: certainty,
          },
        ],
      },
    });
  await post('save', { operationId: 'read-fixture-save' });
  const saved = await read();
  const bike = saved.objects.find((value) => value.id === 'bike');
  const edge = saved.relationships.find((value) => value.id === 'bike-garage');
  if (!bike || !edge) throw new Error('Missing read fixture');
  await post('draft', {
    id: 'bike',
    baseRevision: bike.revision,
    value: {
      ...bike,
      properties: [
        ...(bike.properties ?? []).filter((property) => !['price'].includes(property.id)),
        { id: 'price', label: 'Pris', kind: 'text' as const, value: '2500 SEK' },
      ],
    },
  });
  await post('relationship', {
    id: edge.id,
    baseRevision: edge.revision,
    value: {
      ...edge,
      properties: [
        ...(edge.properties ?? []).filter(({ id }) => id !== 'note'),
        {
          id: 'note',
          label: 'Dold sambandsuppgift',
          kind: 'text' as const,
          value: 'Föreslagen dold sambandsuppgift',
        },
      ],
    },
  });
  return { path, read, post };
}
