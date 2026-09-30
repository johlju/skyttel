import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { openDatabase } from '../../../src/server/database.js';
import type { MapState, ObjectType } from '../../../src/shared/map.js';
import { applicationFixture } from './fixture.js';

test('schema 17 definitions and private values upgrade without presentation conflicts or icon loss', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-section-upgrade-'));
  for (const name of readdirSync('migrations').filter(
    (name) => name.endsWith('.sql') && name < '018',
  ))
    copyFileSync(join('migrations', name), join(directory, name));
  const fixture = await applicationFixture({ migrationsDirectory: directory });
  try {
    const client = fixture.client();
    await client.signIn();
    const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
    const { user } = await (await client.request('/api/bootstrap')).json();
    const path = `/api/households/${household.id}/map`;
    const saved = fixture.database
      .prepare('SELECT * FROM object_type WHERE householdId = ? LIMIT 1')
      .get(household.id) as ObjectType;
    const fields = [
      { id: 'note', name: 'Anteckning', description: '', kind: 'text' },
      { id: 'power', name: 'Effekt', description: '', kind: 'number' },
      { id: 'date', name: 'Datum', description: '', kind: 'date' },
      { id: 'battery', name: 'Batteri', description: '', kind: 'boolean' },
    ];
    const beforeType = { ...saved, fields };
    const afterType = { ...beforeType, revision: 2, description: 'Privat äldre definition' };
    const customValues = { note: 'Äldre värde', power: 0, date: '2026-09-01', battery: false };
    const object = {
      id: 'object',
      householdId: household.id,
      revision: 1,
      typeId: saved.id,
      name: 'Äldre objekt',
      description: '',
      customValues,
      iconId: 'bike',
    };
    fixture.database
      .prepare('INSERT INTO object_type_fields (typeId, fields) VALUES (?, ?)')
      .run(saved.id, JSON.stringify(fields));
    fixture.database
      .prepare(
        'INSERT INTO map_object (id, householdId, typeId, revision, name, description, customValues, iconId) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
      )
      .run(
        object.id,
        household.id,
        saved.id,
        object.name,
        '',
        JSON.stringify(customValues),
        'bike',
      );
    fixture.database
      .prepare(
        'INSERT INTO map_draft (householdId, userId, version, changes, objectTypes) VALUES (?, ?, 1, ?, ?)',
      )
      .run(
        household.id,
        user.id,
        JSON.stringify([
          {
            id: object.id,
            before: object,
            after: { ...object, description: 'Äldre objektförslag' },
            type: afterType,
          },
        ]),
        JSON.stringify([{ id: saved.id, before: beforeType, after: afterType }]),
      );
    openDatabase(fixture.config.databasePath).close();
    const state: MapState = await (await client.request(path)).json();
    expect(state.types.find(({ id }) => id === saved.id)).toEqual(beforeType);
    expect(state.draft.objectTypes?.[0]).toMatchObject({ before: beforeType, after: afterType });
    expect(state.objects[0]).toMatchObject({ customValues, iconId: 'bike' });
    const response = await client.json(`${path}/save`, { version: 1, operationId: 'upgraded' });
    expect(response.status, await response.clone().text()).toBe(200);
    const { receipt } = await response.json();
    expect(receipt.objectTypes[0].after).toEqual(afterType);
    expect(receipt.changes[0].after).toMatchObject({
      customValues,
      iconId: 'bike',
      description: 'Äldre objektförslag',
    });
    openDatabase(fixture.config.databasePath).close();
    const current: MapState = await (await client.request(path)).json();
    expect(current.types.find(({ id }) => id === saved.id)).toEqual(afterType);
    expect(current.objects[0]).toMatchObject({ customValues, iconId: 'bike' });
  } finally {
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
