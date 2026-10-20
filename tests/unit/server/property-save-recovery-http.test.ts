import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import type { MapState } from '../../../src/shared/map.js';
import type { Property } from '../../../src/shared/properties.js';
import { restartWithSession } from '../../support/client.js';
import { createInstallation } from '../../support/installation.js';
import { createRelationshipFixture } from '../../support/relationship-fixture.js';

test('a lost mixed-property save reply replays the exact atomic history and receipt after restart', async () => {
  let loseReply = false;
  const installation = await createInstallation(undefined, {
    deliverResponse: (incoming, response) => {
      if (loseReply && incoming.url.endsWith('/map/save') && response.ok) {
        loseReply = false;
        return new Response('Synthetic lost success reply', { status: 503 });
      }
      return response;
    },
  });
  let client = await request.newContext();
  try {
    const fixture = await createRelationshipFixture(client, installation.origin);
    const properties: Property[] = [
      { id: 'zero', label: 'Samma', kind: 'number', value: 0 },
      { id: 'false', label: 'Samma', kind: 'boolean', value: false },
      { id: 'empty', label: 'Väntar', kind: 'date' },
      { id: 'untyped', label: 'Väntar' },
      { id: 'blank', label: 'Anteckning', kind: 'text', value: '' },
    ];
    const objectType = { name: 'Växt', description: 'Odling i hemmet' };
    const relationshipType = {
      name: 'Stödjer',
      description: 'Hjälp vid odling',
      forwardLabel: 'stödjer',
      reverseLabel: 'stöds av',
    };
    await fixture.post('object-type', { id: 'plant', baseRevision: null, value: objectType });
    await fixture.post('relationship-type', {
      id: 'support',
      baseRevision: null,
      value: relationshipType,
    });
    const value = { typeId: 'plant', name: 'Rosen', properties };
    await fixture.post('draft', { id: 'rose', baseRevision: null, value });
    const edge = {
      typeId: 'support',
      sourceId: 'alex',
      targetId: 'rose',

      properties,
    };
    await fixture.post('relationship', { id: 'edge', baseRevision: null, value: edge });
    const { receipt: created } = await fixture.post('save', { operationId: 'created' });
    const changed: Property[] = [
      properties[1],
      { id: 'zero', label: 'Antal', kind: 'text', value: 'Noll' },
      properties[3],
      properties[2],
    ];
    await fixture.post('draft', {
      id: 'rose',
      baseRevision: 1,
      value: { ...value, properties: changed },
    });
    await fixture.post('relationship', {
      id: 'edge',
      baseRevision: 1,
      value: { ...edge, targetId: 'alex', properties: changed },
    });
    await fixture.post('object-type', {
      id: 'plant',
      baseRevision: 1,
      value: { ...objectType, description: 'Dagens typförklaring' },
    });
    await fixture.post('relationship-type', {
      id: 'support',
      baseRevision: 1,
      value: { ...relationshipType, forwardLabel: 'vårdar', reverseLabel: 'vårdas av' },
    });
    const pending = await fixture.read();
    const body = {
      operationId: 'lost-property-save',
      version: pending.draft.version,
      contentVersion: pending.contentVersion,
    };
    expect(
      (
        await client.post(`${fixture.path}/operations`, {
          headers: { origin: installation.origin },
          data: body,
        })
      ).status(),
    ).toBe(200);
    loseReply = true;
    expect(
      (
        await client.post(`${fixture.path}/save`, {
          headers: { origin: installation.origin },
          data: body,
        })
      ).status(),
    ).toBe(503);
    client = await restartWithSession(client, () => installation.restart());
    const operation = (
      await (await client.get(`${fixture.path}/operations/${body.operationId}`)).json()
    ).operation;
    expect(operation.status).toBe('succeeded');
    const { receipt } = operation;
    expect(receipt).toMatchObject({
      operationId: body.operationId,
      draftVersion: pending.draft.version,
      actorName: 'Alex Exempel',
    });
    expect(receipt.changes).toMatchObject([
      {
        before: { id: 'rose', properties },
        after: { id: 'rose', properties: changed, revision: 2 },
        beforeType: { description: 'Odling i hemmet' },
        type: { description: 'Dagens typförklaring' },
      },
    ]);
    expect(receipt.relationships).toMatchObject([
      {
        id: 'edge',
        before: { sourceId: 'alex', targetId: 'rose', properties },
        after: { sourceId: 'alex', targetId: 'alex', properties: changed, revision: 2 },
        beforeType: relationshipType,
        type: { forwardLabel: 'vårdar', reverseLabel: 'vårdas av' },
        objectNames: { alex: 'Alex', rose: 'Rosen' },
      },
    ]);
    expect(receipt.objectTypes).toHaveLength(1);
    expect(receipt.relationshipTypes).toHaveLength(1);
    const committed: MapState = await (await client.get(fixture.path)).json();
    expect(committed.draft).toEqual({ version: pending.draft.version + 1, changes: [] });
    expect(committed.objects.find(({ id }) => id === 'rose')?.properties).toEqual(changed);
    expect(committed.relationships).toEqual([receipt.relationships[0].after]);
    expect(
      await (
        await client.post(`${fixture.path}/save`, {
          headers: { origin: installation.origin },
          data: body,
        })
      ).json(),
    ).toEqual({ receipt });
    expect(await (await client.get(fixture.path)).json()).toEqual(committed);
    expect(await (await client.get(`${fixture.path}/history`)).json()).toEqual({
      history: [receipt, created],
    });
    for (const [route, id, revision] of [
      ['draft', 'rose', 2],
      ['draft', 'alex', 1],
      ['object-type', 'plant', 2],
      ['relationship-type', 'support', 2],
    ] as const) {
      const state: MapState = await (await client.get(fixture.path)).json();
      expect(
        (
          await client.post(`${fixture.path}/${route}`, {
            headers: { origin: installation.origin },
            data: { version: state.draft.version, id, baseRevision: revision, value: null },
          })
        ).status(),
      ).toBe(200);
    }
    const removing: MapState = await (await client.get(fixture.path)).json();
    const removed = await client.post(`${fixture.path}/save`, {
      headers: { origin: installation.origin },
      data: { version: removing.draft.version, operationId: 'removed' },
    });
    expect(removed.status()).toBe(200);
    const { receipt: removal } = await removed.json();
    const remaining: MapState = await (await client.get(fixture.path)).json();
    expect(remaining.objects.map(({ id }) => id)).toEqual(['bicycle']);
    expect(remaining.relationships).toEqual([]);
    expect(remaining.types.some(({ id }) => id === 'plant')).toBe(false);
    expect(remaining.relationshipTypes.some(({ id }) => id === 'support')).toBe(false);
    expect(await (await client.get(`${fixture.path}/history`)).json()).toEqual({
      history: [removal, receipt, created],
    });
    expect(await (await client.get(fixture.path)).json()).toEqual(remaining);
  } finally {
    await client.dispose();
    await installation.close();
  }
});
