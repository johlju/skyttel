import { request } from '@playwright/test';
import { expect, test } from 'vitest';
import { prepareDraftReview } from '../../support/draft-review.js';
import { createInstallation } from '../../support/installation.js';

for (const kind of ['objectType', 'relationshipType'] as const) {
  test(`direct ${kind} removal setup preserves the original public proposal routes and values`, {
    tags: ['technical'],
  }, async () => {
    const client = await request.newContext();
    const installation = await createInstallation();
    try {
      const data = await prepareDraftReview(client, installation.origin);
      const initial = await data.read();
      const history = await (await client.get(`${data.path}/history`)).json();
      await data.post(kind === 'objectType' ? 'object-type' : 'relationship-type', {
        id: 'discard-type',
        baseRevision: null,
        value: {
          name: 'Tillfällig typ',
          description: '',

          ...(kind === 'relationshipType'
            ? { forwardLabel: 'granskar', reverseLabel: 'granskas av' }
            : {}),
        },
      });
      await data.post(kind === 'objectType' ? 'draft' : 'relationship', {
        id: 'typed-proposal',
        baseRevision: null,
        value:
          kind === 'objectType'
            ? { name: 'Tillfälligt föremål', typeId: 'discard-type' }
            : {
                sourceId: 'draft-bike',
                targetId: 'draft-bike',
                typeId: 'discard-type',
              },
      });
      const after = await data.read();
      const type = (
        kind === 'objectType' ? after.draft.objectTypes : after.draft.relationshipTypes
      )?.find(({ id }) => id === 'discard-type');
      expect(type?.after).toEqual({
        id: 'discard-type',
        householdId: data.household.id,
        revision: 1,
        name: 'Tillfällig typ',
        description: '',
        ...(kind === 'relationshipType'
          ? { forwardLabel: 'granskar', reverseLabel: 'granskas av' }
          : {}),
      });
      const changes = kind === 'objectType' ? after.draft.changes : after.draft.relationships;
      expect(changes?.find(({ id }) => id === 'typed-proposal')?.after).toEqual(
        kind === 'objectType'
          ? { name: 'Tillfälligt föremål', typeId: 'discard-type' }
          : {
              sourceId: 'draft-bike',
              targetId: 'draft-bike',
              typeId: 'discard-type',
            },
      );
      expect(after.draft.changes.filter(({ id }) => id !== 'typed-proposal')).toEqual(
        initial.draft.changes,
      );
      expect(after.draft.relationships?.filter(({ id }) => id !== 'typed-proposal')).toEqual(
        initial.draft.relationships,
      );
      expect(after.objects).toEqual(initial.objects);
      expect(after.relationships).toEqual(initial.relationships);
      expect(await (await client.get(`${data.path}/history`)).json()).toEqual(history);
    } finally {
      await client.dispose();
      await installation.close();
    }
  });
}
