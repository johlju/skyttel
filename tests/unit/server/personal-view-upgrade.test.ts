import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { openDatabase } from '../../../src/server/database.js';
import { personalView } from '../../../src/server/personal-view.js';
import { defaultViewSettings } from '../../../src/shared/personal-view.js';

test('removing the obsolete reference preference preserves accounts, active preferences and migration history across restarts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-reference-preference-upgrade-'));
  const migrationsDirectory = join(directory, 'migrations');
  mkdirSync(migrationsDirectory);
  for (const name of readdirSync(resolve('migrations')).filter(
    (name) => Number(name.slice(0, 3)) <= 49,
  ))
    copyFileSync(join('migrations', name), join(migrationsDirectory, name));
  const path = join(directory, 'skyttel.sqlite');
  const historical = openDatabase(path, { migrationsDirectory });
  const settings = {
    ...defaultViewSettings,
    invertX: true,
    invertY: true,
    axisCorner: 'top-left',
    axisPinned: true,
    background: false,
    lightBackground: 'dawn',
    darkBackground: 'ocean',
    panStrength: 0.35,
    zoomStrength: 0.85,
    layerDistance: 1.7,
    allLabels: true,
    zeroReferenceVariant: 'lines',
    zeroReferenceWeight: 'prominent',
    zeroReferenceAlwaysVisible: true,
    zeroReferenceOnMovement: true,
    zeroReferenceTint: 37,
  };
  const retainedTables = ['user', 'account', 'membership', 'theme_preferences'];
  let retained: unknown[];
  let migrationHistory: unknown[];
  let currentSettings: string;
  try {
    historical.exec(`
      INSERT INTO user (id, name, email, createdAt, updatedAt)
        VALUES ('alex', 'Alex', 'alex@example.test', 1, 1);
      INSERT INTO account (id, accountId, providerId, userId, accessToken, createdAt, updatedAt)
        VALUES ('provider', 'provider-subject', 'google', 'alex', 'retained-token', 1, 1);
      INSERT INTO theme_preferences VALUES ('alex', 'dark');
    `);
    for (const [index, obsolete] of [true, false, null, undefined, undefined].entries()) {
      const householdId = `home-${index}`;
      historical
        .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
        .run(householdId, `Home ${index}`, '2026-01-01');
      historical
        .prepare('INSERT INTO membership VALUES (?, ?, ?)')
        .run(householdId, 'alex', 'administrator');
      if (index < 4)
        historical
          .prepare(`INSERT INTO personal_view_settings
            (householdId, userId, version, settings, backgroundVersion) VALUES (?, 'alex', ?, ?, 1)`)
          .run(
            householdId,
            7 + index,
            JSON.stringify({ ...settings, zeroReferenceKeepSize: obsolete }, null, 2),
          );
    }
    retained = retainedTables.map((table) => historical.prepare(`SELECT * FROM ${table}`).all());
    migrationHistory = historical.prepare('SELECT * FROM schema_migration ORDER BY version').all();
    currentSettings = (
      historical
        .prepare("SELECT settings FROM personal_view_settings WHERE householdId = 'home-3'")
        .get() as { settings: string }
    ).settings;
  } finally {
    historical.close();
  }
  try {
    for (let restart = 0; restart < 2; restart++) {
      const database = openDatabase(path);
      try {
        expect(
          retainedTables.map((table) => database.prepare(`SELECT * FROM ${table}`).all()),
        ).toEqual(retained);
        expect(
          database
            .prepare('SELECT * FROM schema_migration WHERE version <= 49 ORDER BY version')
            .all(),
        ).toEqual(migrationHistory);
        expect(
          database.prepare('SELECT version FROM schema_migration WHERE version = 50').get(),
        ).toEqual({ version: 50 });
        for (let index = 0; index < 4; index++) {
          expect(personalView(database, 'alex', `home-${index}`).read().settings).toEqual({
            ...settings,
            version: 7 + index,
          });
          expect(
            database
              .prepare(
                'SELECT version, backgroundVersion FROM personal_view_settings WHERE householdId = ?',
              )
              .get(`home-${index}`),
          ).toEqual({ version: 7 + index, backgroundVersion: 1 });
        }
        expect(
          database
            .prepare("SELECT settings FROM personal_view_settings WHERE householdId = 'home-3'")
            .get(),
        ).toEqual({ settings: currentSettings });
        expect(personalView(database, 'alex', 'home-4').read().settings).toEqual({
          ...defaultViewSettings,
          version: 0,
        });
        expect(
          database.prepare('SELECT COUNT(*) AS count FROM personal_view_settings').get(),
        ).toEqual({ count: 4 });
      } finally {
        database.close();
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('background upgrade preserves explicit and implicit legacy choices and never overwrites later choices', () => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-background-upgrade-'));
  const migrationsDirectory = join(directory, 'migrations');
  mkdirSync(migrationsDirectory);
  for (const name of readdirSync(resolve('migrations')).filter(
    (name) => Number(name.slice(0, 3)) <= 33,
  ))
    copyFileSync(join('migrations', name), join(migrationsDirectory, name));
  const historical = openDatabase(join(directory, 'skyttel.sqlite'), { migrationsDirectory });
  try {
    // Arrange the historical data without requiring today's authentication schema.
    const user = { id: 'legacy-user' };
    historical
      .prepare(`INSERT INTO user (id, name, email, createdAt, updatedAt)
        VALUES (?, 'Alex Exempel', 'alex@example.test', '2026-01-01', '2026-01-01')`)
      .run(user.id);
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
      historical
        .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
        .run(household.id, name, '2026-01-01');
      historical
        .prepare('INSERT INTO membership VALUES (?, ?, ?)')
        .run(household.id, user.id, 'administrator');
      households.push(household.id);
      if (index < 2)
        historical
          .prepare('INSERT INTO personal_view_settings VALUES (?, ?, 7, ?)')
          .run(household.id, user.id, JSON.stringify({ ...legacy, stars: index === 1 }));
      if (index === 2)
        historical
          .prepare('INSERT INTO personal_position VALUES (?, ?, ?, 4, 2, 3, 5)')
          .run(household.id, user.id, 'old-object');
    }
    const database = openDatabase(historical.name);
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
          zeroReferenceVariant: 'circle',
          zeroReferenceWeight: 'subtle',
          zeroReferenceAlwaysVisible: false,
          zeroReferenceOnMovement: false,
          zeroReferenceTint: 0,
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
        settings: {
          ...settings,
          background: false,
          darkBackground: 'atmosphere',
          zeroReferenceVariant: 'oval',
          zeroReferenceWeight: 'prominent',
          zeroReferenceAlwaysVisible: true,
          zeroReferenceOnMovement: true,
          zeroReferenceTint: 37,
        },
      });
    } finally {
      database.close();
    }
    const reopened = openDatabase(historical.name);
    try {
      expect(personalView(reopened, user.id, households[1]).read().settings).toMatchObject({
        background: false,
        darkBackground: 'atmosphere',
        version: 8,
        zeroReferenceVariant: 'oval',
        zeroReferenceWeight: 'prominent',
        zeroReferenceAlwaysVisible: true,
        zeroReferenceOnMovement: true,
        zeroReferenceTint: 37,
      });
    } finally {
      reopened.close();
    }
  } finally {
    historical.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
