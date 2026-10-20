import { type APIRequestContext, expect } from '@playwright/test';
import type { MapState } from '../../src/shared/map.js';
import { createHousehold, signIn } from './client.js';

/** Create the connected synthetic map used by appearance checks and profiling.
 * Keep browser navigation and personal view preparation in each caller. */
export async function createBackgroundMapFixture(
  client: APIRequestContext,
  origin: string,
  count: number,
  fixture: 'appearance' | 'measurement',
) {
  await signIn(client, origin);
  const created = await createHousehold(client, origin);
  if (fixture === 'appearance') expect(created.ok()).toBe(true);
  else expect(created.status()).toBe(201);
  const { household } = await created.json();
  const path = `${origin}/api/households/${household.id}/map`;
  const state: MapState = await (await client.get(path)).json();
  const { prefix, description, operationId, initialVersion } = {
    appearance: {
      prefix: 'background',
      description: 'Påhittat underlag för bakgrundsbedömning.',
      operationId: 'background-fixture',
      initialVersion: 0,
    },
    measurement: {
      prefix: 'profile',
      description: 'Påhittat mätunderlag.',
      operationId: `profile-${count}`,
      initialVersion: state.draft.version,
    },
  }[fixture];
  let version = initialVersion;
  for (let index = 0; index < count; index += 1) {
    expect(
      (
        await client.post(`${path}/draft`, {
          headers: { origin },
          data: {
            version: version++,
            id: `${prefix}-${index}`,
            baseRevision: null,
            value: {
              name: `Provobjekt ${String(index).padStart(2, '0')}`,
              typeId: state.types[index % state.types.length].id,
              properties: [
                {
                  id: 'description',
                  label: 'Beskrivning',
                  kind: 'text' as const,
                  value: description,
                },
              ],
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  for (let index = 1; index < count; index += 1) {
    expect(
      (
        await client.post(`${path}/relationship`, {
          headers: { origin },
          data: {
            version: version++,
            id: `${prefix}-edge-${index}`,
            baseRevision: null,
            value: {
              sourceId: `${prefix}-${index - 1}`,
              targetId: `${prefix}-${index}`,
              typeId: state.relationshipTypes[0].id,
            },
          },
        })
      ).ok(),
    ).toBe(true);
  }
  expect(
    (
      await client.post(`${path}/save`, {
        headers: { origin },
        data: { version, operationId },
      })
    ).ok(),
  ).toBe(true);
  return { path, household };
}
