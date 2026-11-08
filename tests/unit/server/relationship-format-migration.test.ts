import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import type { MapState, RelationshipType } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

test.each([false, true])(
  'upgrade preserves installation and household data with existing objects: %s',
  async (populated) => {
    const directory = mkdtempSync(join(tmpdir(), 'skyttel-legacy-verbs-'));
    const migrations = join(directory, 'migrations');
    mkdirSync(migrations);
    for (const file of readdirSync(resolve('migrations')).filter(
      (name) => Number(name.slice(0, 3)) < 48,
    ))
      copyFileSync(resolve('migrations', file), join(migrations, file));
    let old: Awaited<ReturnType<typeof applicationFixture>> | undefined;
    let upgraded: Awaited<ReturnType<typeof applicationFixture>> | undefined;
    try {
      old = await applicationFixture({ migrationsDirectory: migrations });
      const client = old.client();
      await client.signIn();
      const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
      const type = old.database
        .prepare("SELECT * FROM relationship_type WHERE householdId = ? AND name = 'Använder'")
        .get(household.id) as RelationshipType;
      old.database
        .prepare('UPDATE relationship_type SET description = ? WHERE id = ?')
        .run('Hushållets egna förklaring', type.id);
      old.database
        .prepare('INSERT INTO relationship_type_labels VALUES (?, ?, ?)')
        .run(type.id, 'driver', 'drivs av');
      const accounts = old.database.prepare('SELECT * FROM account').all();
      const installation = old.database.prepare('SELECT * FROM installation').all();
      const objectTypes = old.database.prepare('SELECT * FROM object_type ORDER BY id').all();
      const membership = old.database.prepare('SELECT * FROM membership').all();
      const history = old.database.prepare('SELECT * FROM schema_migration').all();
      const objectType = old.database
        .prepare('SELECT id FROM object_type WHERE householdId = ? LIMIT 1')
        .get(household.id) as { id: string };
      if (populated)
        for (const id of ['source', 'target'])
          old.database
            .prepare(
              'INSERT INTO map_object (id, householdId, typeId, revision, name) VALUES (?, ?, ?, 1, ?)',
            )
            .run(id, household.id, objectType.id, id);
      if (populated)
        old.database
          .prepare(
            'INSERT INTO map_relationship (id, householdId, typeId, revision, sourceId, targetId) VALUES (?, ?, ?, 1, ?, ?)',
          )
          .run('legacy-edge', household.id, type.id, 'source', 'target');
      const { user } = await (await client.request('/api/bootstrap')).json();
      const owner = old.database
        .prepare('SELECT id FROM content_identity WHERE householdId = ? AND userId = ?')
        .get(household.id, user.id) as { id: string };
      const before = {
        id: 'legacy-edge',
        householdId: household.id,
        revision: 1,
        typeId: type.id,
        sourceId: 'source',
        targetId: 'target',
      };
      const change = {
        id: 'legacy-edge',
        before,
        after: { ...before, lifecycle: 'ended' },
        beforeType: {
          ...type,
          description: 'Hushållets egna förklaring',
          forwardLabel: 'driver',
          reverseLabel: 'drivs av',
        },
        type: {
          ...type,
          description: 'Hushållets egna förklaring',
          forwardLabel: 'reglerar',
          reverseLabel: 'regleras av',
        },
      };
      if (populated)
        old.database
          .prepare(
            'INSERT INTO map_draft (householdId, userId, version, changes, relationships) VALUES (?, ?, 1, ?, ?)',
          )
          .run(household.id, owner.id, '[]', JSON.stringify([change]));
      if (populated) {
        const receipt = {
          operationId: 'retained-history',
          householdId: household.id,
          userId: owner.id,
          draftVersion: 0,
          contentVersion: 1,
          savedAt: '2026-11-08T12:00:00Z',
          changes: [],
          relationships: [{ id: before.id, before: null, after: before, type: change.beforeType }],
        };
        old.database
          .prepare(
            'INSERT INTO map_save (operationId, householdId, userId, draftVersion, receipt) VALUES (?, ?, ?, ?, ?)',
          )
          .run(receipt.operationId, household.id, owner.id, 0, JSON.stringify(receipt));
        old.database
          .prepare(
            'INSERT INTO map_history (householdId, userId, operationId, savedAt, changes) VALUES (?, ?, ?, ?, ?)',
          )
          .run(household.id, owner.id, receipt.operationId, receipt.savedAt, '[]');
      }
      const snapshot = join(directory, 'snapshot.sqlite');
      await old.database.backup(snapshot);
      old.close();
      old = undefined;
      upgraded = await applicationFixture({ databaseSnapshot: snapshot });
      expect(upgraded.database.prepare('SELECT * FROM account').all()).toEqual(accounts);
      const currentClient = upgraded.client();
      await currentClient.signIn();
      const state: MapState = await (
        await currentClient.request(`/api/households/${household.id}/map`)
      ).json();
      expect(upgraded.database.prepare('SELECT * FROM installation').all()).toEqual(installation);
      expect(upgraded.database.prepare('SELECT * FROM object_type ORDER BY id').all()).toEqual(
        objectTypes,
      );
      expect(upgraded.database.prepare('SELECT * FROM membership').all()).toEqual(membership);
      expect(
        upgraded.database.prepare('SELECT * FROM schema_migration WHERE version < 48').all(),
      ).toEqual(history);
      expect(
        upgraded.database
          .prepare("SELECT name FROM sqlite_schema WHERE name = 'relationship_type_labels'")
          .all(),
      ).toEqual([]);
      expect(state.objects).toHaveLength(populated ? 2 : 0);
      if (populated) {
        expect(state.relationships[0]).toMatchObject({ verb: 'driver', reverseVerb: 'drivs av' });
        expect(state.draft.relationships?.[0].before).toMatchObject({
          verb: 'driver',
          reverseVerb: 'drivs av',
        });
        expect(state.draft.relationships?.[0].after).toMatchObject({
          verb: 'reglerar',
          reverseVerb: 'regleras av',
          lifecycle: 'ended',
        });
        expect(state.draft.relationships?.[0].before?.revision).toBe(1);
        expect(state.draft.relationships?.[0].type).not.toHaveProperty('forwardLabel');
        const { history: receipts } = await (
          await currentClient.request(`/api/households/${household.id}/map/history`)
        ).json();
        expect(receipts[0].relationships[0]).toMatchObject({
          after: { verb: 'driver', reverseVerb: 'drivs av' },
          type: { description: 'Hushållets egna förklaring' },
        });
        expect(receipts[0].relationships[0].type).not.toHaveProperty('reverseLabel');
        const exportResponse = await currentClient.json(
          `/api/households/${household.id}/exports`,
          {},
        );
        expect(exportResponse.status).toBe(201);
      } else {
        expect(state.relationships).toEqual([]);
        expect(state.draft).toEqual({ version: 0, changes: [] });
      }
      expect(state.relationshipTypes.find((item) => item.name === 'Betalar')?.description).toBe(
        'Gruppering för betalning.',
      );
      expect(
        state.relationshipTypes.every(
          (item) => !('forwardLabel' in item) && !('reverseLabel' in item),
        ),
      ).toBe(true);
      upgraded.database
        .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
        .run('new-home', 'New', '2026-11-08');
      const fresh = upgraded.database
        .prepare('SELECT * FROM relationship_type WHERE householdId = ?')
        .all('new-home') as RelationshipType[];
      expect(fresh).toHaveLength(state.relationshipTypes.length);
      expect(fresh.every((item) => item.description.startsWith('Gruppering för '))).toBe(true);
      expect(state.relationshipTypes.find((item) => item.id === type.id)?.description).toBe(
        'Hushållets egna förklaring',
      );
    } finally {
      old?.close();
      upgraded?.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
