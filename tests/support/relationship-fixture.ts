import { type APIRequestContext, expect } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from './client.js';

/** A new household with two independently staged objects, through public HTTP only. */
export async function createRelationshipFixture(
  client: APIRequestContext,
  origin: string,
  {
    targetName = 'Blå cykeln',
    objectDescription,
  }: { targetName?: string; objectDescription?: string } = {},
) {
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
  const initial = await read();
  for (const [id, name, typeName, description] of [
    ['alex', 'Alex', 'Person', objectDescription ?? 'Personen i hushållet'],
    ['bicycle', targetName, 'Fordon', objectDescription ?? 'Cykeln i garaget'],
  ])
    await post('draft', {
      id,
      baseRevision: null,
      value: {
        name,
        typeId: initial.types.find((type) => type.name === typeName)?.id,
        properties: [
          { id: 'description', label: 'Beskrivning', kind: 'text' as const, value: description },
        ],
      },
    });
  return { path, read, post, household };
}
