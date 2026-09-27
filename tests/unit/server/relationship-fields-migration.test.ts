import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { openDatabase } from '../../../src/server/database.js';
import type { MapState, ObjectType, RelationshipType } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

test('schema 18 saved relationships and genuine legacy private snapshots upgrade without a false conflict', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-relationship-upgrade-'));
  for (const name of readdirSync('migrations').filter(
    (name) => name.endsWith('.sql') && name < '019',
  ))
    copyFileSync(join('migrations', name), join(directory, name));
  const fixture = await applicationFixture({ migrationsDirectory: directory });
  try {
    const client = fixture.client();
    await client.signIn();
    const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
    const { user } = await (await client.request('/api/bootstrap')).json();
    const type = fixture.database
      .prepare('SELECT * FROM relationship_type WHERE householdId = ? LIMIT 1')
      .get(household.id) as RelationshipType;
    const objectType = fixture.database
      .prepare('SELECT * FROM object_type WHERE householdId = ? LIMIT 1')
      .get(household.id) as ObjectType;
    for (const id of ['bike', 'garage'])
      fixture.database
        .prepare(
          'INSERT INTO map_object (id, householdId, typeId, revision, name, description, iconId) VALUES (?, ?, ?, 1, ?, ?, ?)',
        )
        .run(id, household.id, objectType.id, id, '', 'bike');
    const before = {
      id: 'edge',
      householdId: household.id,
      revision: 1,
      typeId: type.id,
      sourceId: 'bike',
      targetId: 'garage',
      knowledge: 'known',
    };
    fixture.database
      .prepare(
        'INSERT INTO map_relationship (id, householdId, revision, typeId, sourceId, targetId, knowledge) VALUES (?, ?, 1, ?, ?, ?, ?)',
      )
      .run('edge', household.id, type.id, 'bike', 'garage', 'known');
    fixture.database
      .prepare(
        'INSERT INTO map_draft (householdId, userId, version, changes, relationships) VALUES (?, ?, 1, ?, ?)',
      )
      .run(
        household.id,
        user.id,
        '[]',
        JSON.stringify([
          {
            id: 'edge',
            before,
            after: {
              typeId: type.id,
              sourceId: 'bike',
              targetId: 'garage',
              knowledge: 'uncertain',
            },
            type,
          },
        ]),
      );
    openDatabase(fixture.config.databasePath).close();
    const path = `/api/households/${household.id}/map`;
    const state: MapState = await (await client.request(path)).json();
    expect(state.relationships).toEqual([before]);
    expect(state.relationshipTypes.find(({ id }) => id === type.id)).toEqual(type);
    expect(state.draft.relationships?.[0].before).toEqual(before);
    const saved = await client.json(`${path}/save`, { version: 1, operationId: 'legacy' });
    expect(saved.status, await saved.clone().text()).toBe(200);
    expect((await saved.json()).receipt.relationships[0].after).toMatchObject({
      knowledge: 'uncertain',
    });
    openDatabase(fixture.config.databasePath).close();
    const current: MapState = await (await client.request(path)).json();
    expect(current.relationships[0].customValues).toBeUndefined();
    expect(current.objects.every((object) => object.iconId === 'bike')).toBe(true);
  } finally {
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
