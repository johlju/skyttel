import { type APIRequestContext, expect } from '@playwright/test';
import type { MapState, SaveOperation } from '../../src/shared/map.js';
import type { Property } from '../../src/shared/properties.js';
import { createHousehold, signIn } from './client.js';

export async function prepareDraftSave(client: APIRequestContext, origin: string) {
  await signIn(client, origin);
  const { household } = await (await createHousehold(client, origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await client.get(path)).json();
  const initial = await read();
  expect(
    (
      await client.post(`${path}/draft`, {
        headers: { origin },
        data: {
          version: initial.draft.version,
          id: 'bike',
          baseRevision: null,
          value: { typeId: initial.types[0].id, name: 'Alex blå cykel' },
        },
      })
    ).status(),
  ).toBe(200);
  return { path, read, household };
}

export async function registerPendingSave(
  client: APIRequestContext,
  path: string,
  operationId: string,
) {
  const current: MapState = await (await client.get(path)).json();
  const response = await client.post(`${path}/operations`, {
    headers: { origin: new URL(path).origin },
    data: {
      operationId,
      version: current.draft.version,
      contentVersion: current.contentVersion,
    },
  });
  expect(response.status()).toBe(200);
  const { operation }: { operation: SaveOperation } = await response.json();
  expect(operation).toMatchObject({
    operationId,
    draftVersion: current.draft.version,
    contentVersion: current.contentVersion,
    status: 'pending',
  });
  return operation;
}

/** Mixed free-property draft for the lost-reply UI journey and its manual setup. */
export async function preparePropertyDraftSave(client: APIRequestContext, origin: string) {
  const fixture = await prepareDraftSave(client, origin);
  const properties: Property[] = [
    { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
    { id: 'false', label: 'Samma', kind: 'boolean', value: false },
    { id: 'typed-empty', label: 'Väntar', kind: 'date' },
    { id: 'untyped', label: 'Väntar' },
    { id: 'blank', label: 'Anteckning', kind: 'text', value: '' },
  ];
  let state = await fixture.read();
  expect(
    (
      await client.post(`${fixture.path}/draft`, {
        headers: { origin },
        data: {
          version: state.draft.version,
          id: 'bike',
          baseRevision: null,
          value: { ...state.draft.changes[0].after, properties },
        },
      })
    ).status(),
  ).toBe(200);
  state = await fixture.read();
  expect(
    (
      await client.post(`${fixture.path}/relationship`, {
        headers: { origin },
        data: {
          version: state.draft.version,
          id: 'self',
          baseRevision: null,
          value: {
            typeId: state.relationshipTypes[0].id,
            sourceId: 'bike',
            targetId: 'bike',
            properties,
          },
        },
      })
    ).status(),
  ).toBe(200);
  return { ...fixture, properties };
}
