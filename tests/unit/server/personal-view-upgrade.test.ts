import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { openDatabase } from '../../../src/server/database.js';
import { personalView } from '../../../src/server/personal-view.js';
import { applicationFixture } from './fixture.js';

test('background upgrade preserves explicit and implicit legacy choices and never overwrites later choices', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-background-upgrade-'));
  const migrationsDirectory = join(directory, 'migrations');
  mkdirSync(migrationsDirectory);
  for (const name of readdirSync(resolve('migrations')).filter(
    (name) => Number(name.slice(0, 3)) <= 33,
  ))
    copyFileSync(join('migrations', name), join(migrationsDirectory, name));
  const fixture = await applicationFixture({ migrationsDirectory });
  try {
    const client = fixture.client();
    await client.signIn();
    const { user } = await (await client.request('/api/bootstrap')).json();
    const households: string[] = [];
    const legacy = {
      invertX: true,
      invertY: false,
      axisCorner: 'top-left',
      axisPinned: true,
      stars: false,
      allLabels: true,
    };
    for (const [index, name] of ['Off', 'On', 'Positions', 'Access only'].entries()) {
      const household = { id: `legacy-${index}` };
      fixture.database
        .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
        .run(household.id, name, '2026-01-01');
      fixture.database
        .prepare('INSERT INTO membership VALUES (?, ?, ?)')
        .run(household.id, user.id, 'administrator');
      households.push(household.id);
      if (index < 2)
        fixture.database
          .prepare('INSERT INTO personal_view_settings VALUES (?, ?, 7, ?)')
          .run(household.id, user.id, JSON.stringify({ ...legacy, stars: index === 1 }));
      if (index === 2)
        fixture.database
          .prepare('INSERT INTO personal_position VALUES (?, ?, ?, 4, 2, 3, 5)')
          .run(household.id, user.id, 'old-object');
    }
    const database = openDatabase(fixture.database.name);
    try {
      for (const [index, householdId] of households.entries()) {
        const view = personalView(database, user.id, householdId).read();
        expect(view.settings).toMatchObject({
          background: index === 1,
          lightBackground: 'pearl',
          darkBackground: index === 1 ? 'mist' : 'atmosphere',
          panStrength: 0.7,
          zoomStrength: 0.7,
          layerDistance: 1,
          version: index < 2 ? 7 : 0,
        });
        expect(view.settings).not.toHaveProperty('stars');
        if (index < 2)
          expect(view.settings).toMatchObject({ invertX: true, axisPinned: true, allLabels: true });
      }
      expect(database.prepare('SELECT x, y, z, version FROM personal_position').all()).toEqual([
        { x: 2, y: 3, z: 5, version: 4 },
      ]);
      const own = personalView(database, user.id, households[1]);
      const { version, ...settings } = own.read().settings;
      own.configure({
        version,
        settings: { ...settings, background: false, darkBackground: 'atmosphere' },
      });
    } finally {
      database.close();
    }
    const reopened = openDatabase(fixture.database.name);
    try {
      expect(personalView(reopened, user.id, households[1]).read().settings).toMatchObject({
        background: false,
        darkBackground: 'atmosphere',
        version: 8,
      });
    } finally {
      reopened.close();
    }
  } finally {
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
