import { type APIRequestContext, expect } from '@playwright/test';
import type { MapState, ObjectValue, RelationshipValue } from '../../src/shared/map.js';
import { createHousehold, signIn } from './client.js';
import { createInstallation, robin } from './installation.js';

export async function collaborators(
  first: APIRequestContext,
  second: APIRequestContext,
  seeds = [
    ['lo', 'Lo Exempel'],
    ['service', 'Molnmusik'],
  ],
) {
  const installation = await createInstallation();
  await signIn(first, installation.origin);
  const { household } = await (await createHousehold(first, installation.origin)).json();
  const path = `${installation.origin}/api/households/${household.id}/map`;
  const post = (client: APIRequestContext, route: string, data: unknown) =>
    client.post(`${path}/${route}`, { headers: { origin: installation.origin }, data });
  const read = async (client = first): Promise<MapState> => (await client.get(path)).json();
  async function propose(
    client: APIRequestContext,
    kind: 'draft' | 'relationship',
    id: string,
    value: ObjectValue | RelationshipValue | null,
  ) {
    const state = await read(client);
    const previous = (kind === 'draft' ? state.objects : state.relationships).find(
      (item) => item.id === id,
    );
    expect(
      (
        await post(client, kind, {
          version: state.draft.version,
          id,
          baseRevision: previous?.revision ?? null,
          value,
        })
      ).status(),
    ).toBe(200);
  }
  const save = async (client: APIRequestContext, operationId: string) =>
    post(client, 'save', { version: (await read(client)).draft.version, operationId });
  installation.setIdentity(robin);
  await signIn(second, installation.origin);
  const { user } = await (await second.get(`${installation.origin}/api/bootstrap`)).json();
  const { code } = await (
    await first.post(`${installation.origin}/api/households/${household.id}/invitations`, {
      headers: { origin: installation.origin },
      data: { userId: user.id },
    })
  ).json();
  expect(
    (
      await second.post(`${installation.origin}/api/invitations/accept`, {
        headers: { origin: installation.origin },
        data: { code },
      })
    ).status(),
  ).toBe(200);
  const state = await read();
  for (const [id, name] of seeds) {
    await propose(first, 'draft', id, { typeId: state.types[0].id, name });
  }
  expect((await save(first, 'initial')).status()).toBe(200);
  return { installation, path, post, read, propose, save, userId: user.id };
}
