import { type APIRequestContext, request } from '@playwright/test';
import { expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import { createHousehold, restartWithSession, signIn } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';

async function arrange(context: () => APIRequestContext, origin: string) {
  await signIn(context(), origin);
  const { household } = await (await createHousehold(context(), origin)).json();
  const path = `${origin}/api/households/${household.id}/map`;
  const read = async (): Promise<MapState> => (await context().get(path)).json();
  const post = (route: string, data: unknown) =>
    context().post(`${path}/${route}`, { headers: { origin }, data });
  const state = await read();
  for (const [id, name, type] of [
    ['subscription', 'Familjemusik', 'Abonnemang'],
    ['person', 'Lo Exempel', 'Person'],
    ['service', 'Molnmusik', 'Tjänst'],
  ]) {
    expect(
      (
        await post('draft', {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: {
            name,
            typeId: state.types.find((item) => item.name === type)?.id,
          },
        })
      ).ok(),
    ).toBe(true);
  }
  for (const [id, sourceId, targetId] of [
    ['incoming', 'person', 'subscription'],
    ['outgoing', 'subscription', 'service'],
  ]) {
    expect(
      (
        await post('relationship', {
          version: (await read()).draft.version,
          id,
          baseRevision: null,
          value: {
            sourceId,
            targetId,
            typeId: state.relationshipTypes.find((item) => item.name === 'Använder')?.id,
          },
        })
      ).ok(),
    ).toBe(true);
  }
  const save = async () =>
    post('save', { version: (await read()).draft.version, operationId: crypto.randomUUID() });
  expect((await save()).ok()).toBe(true);
  return { read, post, save, path };
}

test('direct lifecycle date and current-versus-previous staging preserves original public request guards', {
  tags: ['technical'],
}, async () => {
  const installation = await createInstallation();
  let client = await request.newContext();
  try {
    const { read, post, save, path } = await arrange(() => client, installation.origin);
    {
      const initial = await read();
      for (const id of ['subscription', 'person']) {
        const object = initial.objects.find((item) => item.id === id);
        expect(
          (
            await post('draft', {
              version: (await read()).draft.version,
              id,
              baseRevision: object?.revision,
              value: {
                ...object,
                properties: [{ id: 'date', label: 'Slutdatum', kind: 'date', value: '2031-03-12' }],
              },
            })
          ).ok(),
        ).toBe(true);
      }
      expect((await save()).ok()).toBe(true);
      const dated = await read();
      for (const id of ['subscription', 'person']) {
        expect(dated.objects.find((item) => item.id === id)?.properties).toEqual([
          { id: 'date', label: 'Slutdatum', kind: 'date', value: '2031-03-12' },
        ]);
        expect(dated.objects.find((item) => item.id === id)?.lifecycle).toBeUndefined();
      }
    }
    const initial = await read();
    const incoming = initial.relationships.find((edge) => edge.id === 'incoming');
    const pays = initial.relationshipTypes.find((type) => type.name === 'Betalar');
    expect(
      (
        await post('relationship', {
          version: initial.draft.version,
          id: 'incoming',
          baseRevision: incoming?.revision,
          value: {
            ...incoming,
            lifecycle: 'ended',
          },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await post('relationship', {
          version: (await read()).draft.version,
          id: 'previous-incoming',
          baseRevision: null,
          value: {
            sourceId: 'service',
            targetId: 'person',
            typeId: pays?.id,

            lifecycle: 'active',
          },
        })
      ).ok(),
    ).toBe(true);
    expect((await save()).ok()).toBe(true);
    const saved = await read();
    const ended = saved.relationships.find((edge) => edge.id === 'incoming');
    expect(
      (
        await post('relationship', {
          version: saved.draft.version,
          id: 'incoming',
          baseRevision: ended?.revision,
          value: {
            sourceId: 'service',
            targetId: 'subscription',
            typeId: pays?.id,

            lifecycle: 'active',
          },
        })
      ).ok(),
    ).toBe(true);
    const privateProposal = await read();
    expect(privateProposal.relationships).toEqual(saved.relationships);
    expect(privateProposal.draft.relationships?.find(({ id }) => id === 'incoming')?.after).toEqual(
      {
        sourceId: 'service',
        targetId: 'subscription',
        typeId: pays?.id,

        lifecycle: 'active',
      },
    );
    const history = await (await client.get(`${path}/history`)).json();
    client = await restartWithSession(client, () => installation.restart());
    expect(await read()).toEqual(privateProposal);
    expect(await (await client.get(`${path}/history`)).json()).toEqual(history);
  } finally {
    await client.dispose();
    await installation.close();
  }
});
