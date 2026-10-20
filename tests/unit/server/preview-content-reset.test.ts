import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { serializeSigned } from 'hono/utils/cookie';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createAuth, verifyAuthSchema } from '../../../src/server/auth.js';
import { readConfig } from '../../../src/server/config.js';
import { openDatabase } from '../../../src/server/database.js';
import { householdMap } from '../../../src/server/map.js';
import { effectiveRelationships } from '../../../src/shared/map.js';
import { configurationEnvironment } from './fixture.js';

const generation = '11111111-1111-4111-8111-111111111111';
const authorityFence = { generation };
let directory: string;
let path: string;
let database: Database.Database | undefined;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'skyttel-preview-reset-'));
  path = join(directory, 'skyttel.sqlite');
  const previous = new Database(path);
  previous.exec('BEGIN');
  // Reproduce the deployed preview through its real, checksummed migration history.
  previous.exec(`CREATE TABLE schema_migration (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    appliedAt TEXT NOT NULL
  )`);
  for (const [index, name] of readdirSync(resolve('migrations')).sort().slice(0, 34).entries()) {
    const sql = readFileSync(resolve('migrations', name), 'utf8');
    previous.exec(sql);
    previous
      .prepare('INSERT INTO schema_migration VALUES (?, ?, ?, ?)')
      .run(index + 1, name, createHash('sha256').update(sql).digest('hex'), '2026-01-01T00:00:00Z');
  }
  previous.exec(`
    INSERT INTO user VALUES ('alex', 'Alex', 'alex@example.test', 1, NULL, 1, 1);
    INSERT INTO household (id, name, createdAt) VALUES ('home', 'Linden', '2026-01-01');
    INSERT INTO membership VALUES ('home', 'alex', 'administrator');
    INSERT INTO installation VALUES (1, 'home');
    INSERT INTO installation_authority VALUES (1, '${generation}', NULL, NULL);
    INSERT INTO object_type VALUES ('type', 'home', 1, 'Cykel', 'En cykel');
    INSERT INTO map_object (id, householdId, typeId, revision, name, description)
      VALUES ('bike', 'home', 'type', 1, 'Blå cykel', 'Gammalt innehåll');
    INSERT INTO map_draft (householdId, userId, version, changes)
      VALUES ('home', 'alex', 4, '[{"old":"draft"}]');
    INSERT INTO relationship_type VALUES ('edge-type', 'home', 2, 'Äger', 'Äger cykeln');
    INSERT INTO relationship_type_labels VALUES ('edge-type', 'äger', 'ägs av');
    INSERT INTO map_relationship (id, householdId, typeId, revision, sourceId, knowledge)
      VALUES ('edge', 'home', 'edge-type', 1, 'bike', 'unknown');
    INSERT INTO object_type_fields (typeId, fields) VALUES ('type', '[{"old":"field"}]');
    INSERT INTO relationship_type_fields (typeId, fields) VALUES ('edge-type', '[{"old":"field"}]');
    INSERT INTO profile_image VALUES ('picture', 'home', 'bike', 'alex', X'010203', 1, 1);
    UPDATE map_object SET profileImageId = 'picture' WHERE id = 'bike';
    INSERT INTO map_save VALUES ('saved', 'home', 'alex', 1, '{"old":"receipt"}');
    INSERT INTO map_history VALUES (1, 'home', 'alex', 'saved', '2026-01-01', '[{"old":"history"}]');
    INSERT INTO map_operation (operationId, householdId, userId, draftVersion, contentVersion, createdAt, status, draftHash)
      VALUES ('pending', 'home', 'alex', 4, 1, '2026-01-01', 'pending', 'old-hash');
    INSERT INTO historical_operation (operationId, householdId, userId, draftVersion, contentVersion, createdAt, status, error)
      VALUES ('historical', 'home', 'alex', 3, 1, '2026-01-01', 'rejected', 'old-error');
    INSERT INTO retired_operation VALUES ('home', 'already-retired');
    INSERT INTO content_maintenance VALUES ('old-import', 'home', 'alex', 'import', 'prepared', 1, 'old-hash', '{"old":"import"}', '{}', NULL, '2026-01-01', '2026-01-01');
    INSERT INTO relationship_form_attempt VALUES ('home', 'alex', 1, 'old-form', '{"old":"submission"}', '{"old":"outcome"}');
    INSERT INTO personal_position VALUES ('home', 'alex', 'bike', 1, 1, 2, 3);
    INSERT INTO personal_view_settings (householdId, userId, version, settings) VALUES ('home', 'alex', 1, '{"allLabels":true}');
    INSERT INTO content_identity VALUES ('home', 'unbound', 'Tidigare ägare', NULL);
    INSERT INTO theme_preferences VALUES ('alex', 'dark');
    INSERT INTO conversation_preferences (userId, showDraftOnStart) VALUES ('alex', 1);
    INSERT INTO conversation_consent VALUES ('home', 'alex', 1, '2026-01-01');
    INSERT INTO policy_contact VALUES (1, 'operator@example.test');
    INSERT INTO cost_attempt VALUES ('cost', 'terra', '2026-01', '2026-01-01', NULL, '{}', '{}');
    INSERT INTO cost_assumptions VALUES ('2026-01', 1, '2026-01-01', '{}');
    INSERT INTO account (id, accountId, providerId, userId, accessToken, createdAt, updatedAt)
      VALUES ('provider', 'provider-subject', 'google', 'alex', 'retained-token', 1, 1);
    INSERT INTO session (id, expiresAt, token, createdAt, updatedAt, userId)
      VALUES ('login', 9999999999999, 'session-token', 1, 1, 'alex');
    INSERT INTO browser_binding VALUES ('binding', 1, 2, 'login', 9999999999999);
    COMMIT;
  `);
  previous.close();
});

afterEach(() => {
  database?.close();
  database = undefined;
  rmSync(directory, { recursive: true, force: true });
});

test('automatic preview migration keeps the household and its administrator while discarding old content', async () => {
  const retainedTables = [
    'user',
    'membership',
    'installation',
    'installation_authority',
    'account',
    'session',
    'browser_binding',
    'object_type',
    'relationship_type',
    'relationship_type_labels',
    'theme_preferences',
    'conversation_preferences',
    'conversation_consent',
    'personal_view_settings',
    'policy_contact',
    'cost_attempt',
    'cost_assumptions',
    'cost_coverage',
  ];
  const previous = new Database(path, { readonly: true });
  const retained = retainedTables.map((table) => previous.prepare(`SELECT * FROM ${table}`).all());
  previous.close();
  expect(() => openDatabase(path)).toThrow(
    expect.objectContaining({ reason: 'unsupported_database_format' }),
  );
  database = openDatabase(path, { authorityFence });
  expect(database.prepare('SELECT * FROM installation').get()).toEqual({
    id: 1,
    householdId: 'home',
  });
  expect(database.prepare('SELECT * FROM membership').get()).toEqual({
    householdId: 'home',
    userId: 'alex',
    role: 'administrator',
  });
  expect(householdMap(database, 'alex', 'home').read()).toMatchObject({
    contentVersion: 2,
    objects: [],
    relationships: [],
    draft: { version: 0, changes: [] },
  });
  expect(database.pragma('application_id', { simple: true })).toBe(0x534b5954);
  expect(database.pragma('user_version', { simple: true })).toBe(2);
  expect(retainedTables.map((table) => database?.prepare(`SELECT * FROM ${table}`).all())).toEqual(
    retained,
  );
  for (const table of [
    'map_object',
    'map_relationship',
    'profile_image',
    'map_draft',
    'map_save',
    'map_history',
    'map_operation',
    'historical_operation',
    'content_maintenance',
    'relationship_form_attempt',
    'personal_position',
  ])
    expect(database.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
  expect(database.prepare('SELECT id FROM content_identity').all()).toEqual([{ id: 'alex' }]);
  expect(
    database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE name IN ('object_type_fields', 'relationship_type_fields')",
      )
      .all(),
  ).toEqual([]);
  const config = readConfig(configurationEnvironment(path));
  await verifyAuthSchema(createAuth(config, database));
});

test('old save requests cannot replay even when they claim the new content version', () => {
  database = openDatabase(path, { authorityFence });
  const map = householdMap(database, 'alex', 'home');
  expect(map.history()).toEqual({ history: [] });
  expect(map.operations()).toEqual({ operations: [] });
  for (const operationId of ['pending', 'saved', 'historical', 'already-retired']) {
    expect(map.operation(operationId)).toEqual({ operation: null });
    expect(() => map.save({ operationId, version: 0, contentVersion: 2 })).toThrow(
      expect.objectContaining({ code: 'content_conflict' }),
    );
  }
  expect(() => map.save({ operationId: 'late-browser', version: 0, contentVersion: 1 })).toThrow(
    expect.objectContaining({ code: 'content_conflict' }),
  );
});

test('later restarts and releases preserve new content after the one-time preview migration', () => {
  database = openDatabase(path, { authorityFence });
  const map = householdMap(database, 'alex', 'home');
  const draft = map.propose({
    version: 0,
    contentVersion: 2,
    id: 'new-bike',
    baseRevision: null,
    value: {
      typeId: 'type',
      name: 'Ny cykel',
      properties: [{ id: 'colour', label: 'Färg', kind: 'text', value: 'Blå' }],
    },
  });
  map.save({ operationId: 'new-save', version: draft.version, contentVersion: 2 });
  database.close();
  database = openDatabase(path, { authorityFence });
  const retained = householdMap(database, 'alex', 'home');
  expect(retained.read().objects).toMatchObject([{ id: 'new-bike', name: 'Ny cykel' }]);
  expect(retained.read().contentVersion).toBe(2);
  expect(retained.operation('new-save')).toMatchObject({ operation: { status: 'succeeded' } });
  const retainedMap = retained.read();
  const retainedHistory = retained.history();
  const migrationsDirectory = join(directory, 'later-release');
  cpSync(resolve('migrations'), migrationsDirectory, { recursive: true });
  writeFileSync(
    join(migrationsDirectory, '038_next_release.sql'),
    'CREATE TABLE next_release_setting (name TEXT PRIMARY KEY);',
  );
  database.close();
  database = openDatabase(path, { authorityFence, migrationsDirectory });
  const upgraded = householdMap(database, 'alex', 'home');
  expect(database.prepare('SELECT MAX(version) AS version FROM schema_migration').get()).toEqual({
    version: 38,
  });
  expect(upgraded.read()).toEqual(retainedMap);
  expect(upgraded.history()).toEqual(retainedHistory);
  expect(upgraded.operation('new-save')).toMatchObject({ operation: { status: 'succeeded' } });
});

test.each([
  ['unknown table', 'CREATE TABLE unknown_content (payload TEXT)'],
  ['changed column', 'ALTER TABLE map_object ADD COLUMN unknown TEXT'],
  ['wrong markers', 'PRAGMA application_id = 123'],
  ['newer format', 'PRAGMA user_version = 3'],
  ['changed history', "UPDATE schema_migration SET checksum = 'wrong' WHERE version = 34"],
  ['older history', 'DELETE FROM schema_migration WHERE version = 34'],
  ['missing history', 'DROP TABLE schema_migration'],
  ['absent authority', 'DELETE FROM installation_authority'],
  [
    'different authority',
    "UPDATE installation_authority SET generation = '22222222-2222-4222-8222-222222222222'",
  ],
  [
    'unacknowledged restore',
    "UPDATE installation_authority SET restoredFrom = 'legacy', restoredAt = 1",
  ],
  ['incomplete restore', 'UPDATE installation_authority SET restoredAt = 1'],
  ['invalid references', "UPDATE map_object SET typeId = 'missing'"],
])('refuses %s before modifying the old database', (_name, alteration) => {
  const previous = new Database(path);
  previous.pragma('foreign_keys = OFF');
  previous.exec(alteration);
  previous.close();
  const before = readFileSync(path);
  const files = readdirSync(directory);
  expect(() => openDatabase(path, { authorityFence })).toThrow();
  expect(readFileSync(path)).toEqual(before);
  expect(readdirSync(directory)).toEqual(files);
});

test('invalid installation authority and unavailable source history cannot authorize deletion', () => {
  const before = readFileSync(path);
  expect(() => openDatabase(path, { authorityFence: { generation: 'invalid' } })).toThrow(
    expect.objectContaining({ reason: 'unsupported_database_format' }),
  );
  const migrationsDirectory = join(directory, 'incomplete-migrations');
  cpSync(resolve('migrations'), migrationsDirectory, { recursive: true });
  for (const name of readdirSync(migrationsDirectory).slice(33))
    rmSync(join(migrationsDirectory, name));
  expect(() => openDatabase(path, { migrationsDirectory, authorityFence })).toThrow(
    expect.objectContaining({ reason: 'unsupported_database_format' }),
  );
  expect(readFileSync(path)).toEqual(before);
});

test.each(['legacy', generation])(
  'a declared restore from %s refuses the old preview without changing its content',
  (fromGeneration) => {
    const before = readFileSync(path);
    const restoreFence = {
      generation: fromGeneration === 'legacy' ? generation : '22222222-2222-4222-8222-222222222222',
      restore: { fromGeneration, confirmedAt: Date.now(), erasureReviewed: true as const },
    };
    expect(() => openDatabase(path, { authorityFence: restoreFence })).toThrow(
      expect.objectContaining({ reason: 'unsupported_database_format' }),
    );
    expect(readFileSync(path)).toEqual(before);
  },
);

test('a declared restore of the new format retains household content and applies normal authority fencing', async () => {
  database = openDatabase(path, { authorityFence });
  const map = householdMap(database, 'alex', 'home');
  const draft = map.propose({
    version: 0,
    contentVersion: 2,
    id: 'retained-bike',
    baseRevision: null,
    value: { typeId: 'type', name: 'Bevarad cykel', properties: [] },
  });
  map.save({ operationId: 'retained-save', version: draft.version, contentVersion: 2 });
  const content = map.read();
  const history = map.history();
  database.close();
  const config = readConfig({
    ...configurationEnvironment(path),
    SKYTTEL_AUTHORITY_GENERATION: '22222222-2222-4222-8222-222222222222',
    SKYTTEL_RESTORE_FROM_GENERATION: generation,
    SKYTTEL_RESTORE_CONFIRMED_AT: '2026-01-01T00:00:00.000Z',
    SKYTTEL_RESTORE_ERASURE_REVIEWED: 'true',
  });
  database = openDatabase(path, { authorityFence: config.authorityFence });
  await verifyAuthSchema(createAuth(config, database));
  const restored = householdMap(database, 'alex', 'home');
  expect(restored.read()).toEqual(content);
  expect(restored.history()).toEqual(history);
  expect(restored.operation('retained-save')).toMatchObject({ operation: { status: 'succeeded' } });
  expect(database.prepare('SELECT * FROM session').all()).toEqual([]);
  expect(database.prepare('SELECT * FROM installation_authority').get()).toEqual({
    id: 1,
    generation: config.authorityFence.generation,
    restoredFrom: generation,
    restoredAt: Date.parse('2026-01-01T00:00:00.000Z'),
  });
});

test.each([34, 35, 36, 'renamed'] as const)(
  'incomplete target migration artifact %s cannot authorize the preview reset',
  (target) => {
    const migrationsDirectory = join(directory, 'incomplete-target');
    cpSync(resolve('migrations'), migrationsDirectory, { recursive: true });
    if (target === 'renamed')
      renameSync(
        join(migrationsDirectory, '037_free_property_contract.sql'),
        join(migrationsDirectory, '037_other.sql'),
      );
    else
      for (const name of readdirSync(migrationsDirectory).sort().slice(target))
        rmSync(join(migrationsDirectory, name));
    const before = readFileSync(path);
    expect(() => openDatabase(path, { migrationsDirectory, authorityFence })).toThrow(
      expect.objectContaining({ reason: 'unsupported_database_format' }),
    );
    expect(readFileSync(path)).toEqual(before);
  },
);

test('an exhausted content version refuses the reset without removing existing content', () => {
  const previous = new Database(path);
  previous.exec('UPDATE household SET contentVersion = 9007199254740991');
  previous.close();
  expect(() => openDatabase(path, { authorityFence })).toThrow(
    expect.objectContaining({ reason: 'migration_failed' }),
  );
  const unchanged = new Database(path, { readonly: true });
  expect(unchanged.prepare('SELECT name FROM map_object').all()).toEqual([{ name: 'Blå cykel' }]);
  expect(unchanged.pragma('user_version', { simple: true })).toBe(0);
  unchanged.close();
});

test('ordinary startup initializes a new installation normally', () => {
  rmSync(path);
  database = openDatabase(path, { authorityFence });
  expect(database.pragma('user_version', { simple: true })).toBe(2);
  expect(database.prepare('SELECT * FROM household').all()).toEqual([]);
});

test.each([
  ['execution', 'SELECT no_such_function();'],
  ['foreign-key', "INSERT INTO membership VALUES ('home', 'missing-user', 'member');"],
])(
  'a %s failure after content removal leaves the old schema, records and format markers intact',
  (_kind, failure) => {
    const migrationsDirectory = join(directory, 'migrations');
    cpSync(resolve('migrations'), migrationsDirectory, { recursive: true });
    writeFileSync(join(migrationsDirectory, '038_failure.sql'), failure);
    const previous = new Database(path, { readonly: true });
    const before = previous.serialize();
    previous.close();
    expect(() => openDatabase(path, { migrationsDirectory, authorityFence })).toThrow(
      expect.objectContaining({ reason: 'migration_failed' }),
    );
    const unchanged = new Database(path, { readonly: true });
    // Serialize canonical state using the same journal mode: a failed writer may
    // change WAL housekeeping, but no content, schema or format identity commits.
    const original = new Database(before);
    expect(unchanged.prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema').all()).toEqual(
      original.prepare('SELECT type, name, tbl_name, sql FROM sqlite_schema').all(),
    );
    const tables = original
      .prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all() as {
      name: string;
    }[];
    for (const { name } of tables)
      expect(unchanged.prepare(`SELECT * FROM "${name}"`).all()).toEqual(
        original.prepare(`SELECT * FROM "${name}"`).all(),
      );
    expect(unchanged.pragma('application_id', { simple: true })).toBe(0);
    expect(unchanged.pragma('user_version', { simple: true })).toBe(0);
    unchanged.close();
    original.close();
  },
);

test('runtime startup automatically upgrades the preview, retains browser access, and clears old archive files before readiness', async () => {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('listener_address_unavailable');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  const origin = `http://127.0.0.1:${port}`;
  const environment = { ...configurationEnvironment(path), SKYTTEL_ORIGIN: origin };
  const previous = new Database(path);
  const now = Date.now();
  const binding = 'a'.repeat(64);
  previous
    .prepare(`UPDATE session SET createdAt = ?, updatedAt = ?, expiresAt = ?,
    ordinaryStartedAt = ?, lastActivityAt = ?, absoluteExpiresAt = ? WHERE id = 'login'`)
    .run(now, now, now + 3600000, now, now, now + 3600000);
  previous
    .prepare('UPDATE browser_binding SET id = ?')
    .run(createHash('sha256').update(binding).digest('hex'));
  previous.close();
  for (const name of ['.skyttel-exports', '.skyttel-imports']) {
    mkdirSync(join(directory, name));
    writeFileSync(join(directory, name, 'old-content.zip'), 'obsolete private household content');
  }
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    env: {
      PATH: process.env.PATH,
      ...environment,
      PORT: String(port),
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stopped = new Promise<void>((resolve) => child.once('close', () => resolve()));
  let output = '';
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`startup_timeout: ${output}`)), 10000);
      child.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timeout);
        reject(new Error(`startup_failed: ${output}`));
      });
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (output.includes('"event":"server_ready"')) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    for (const name of ['.skyttel-exports', '.skyttel-imports'])
      expect(readdirSync(join(directory, name))).toEqual([]);
    expect(await (await fetch(`${origin}/healthz`)).json()).toEqual({ status: 'ok' });
    const signed = await serializeSigned(
      'better-auth.session_token',
      'session-token',
      environment.BETTER_AUTH_SECRET,
    );
    const headers = { cookie: `${signed.split(';', 1)[0]}; skyttel_binding=${binding}` };
    expect(await (await fetch(`${origin}/api/bootstrap`, { headers })).json()).toMatchObject({
      status: 'ready',
      user: { id: 'alex', name: 'Alex' },
      household: { id: 'home', name: 'Linden', role: 'administrator' },
    });
    expect(
      await (await fetch(`${origin}/api/households/home/map`, { headers })).json(),
    ).toMatchObject({
      objects: [],
      relationships: [],
      contentVersion: 2,
    });
  } finally {
    child.kill('SIGTERM');
    await stopped;
  }
}, 15000);

test.each([
  ['scripts/migrate-development-database.ts'],
  ['src/server/upgrade-legacy-login.ts', '--confirm-legacy-upgrade', '--confirm-service-stopped'],
])('maintenance command %s never performs the automatic runtime content reset', (...command) => {
  const envFile = join(directory, '.env');
  writeFileSync(envFile, '');
  const before = readFileSync(path);
  const result = spawnSync(process.execPath, ['--import', 'tsx', ...command], {
    env: {
      PATH: process.env.PATH,
      ...configurationEnvironment(path),
      NODE_ENV: 'development',
      SKYTTEL_DEV_ENV_FILE: envFile,
    },
    encoding: 'utf8',
    timeout: 10000,
  });
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).toContain('unsupported_database_format');
  expect(readFileSync(path)).toEqual(before);
});

test('db:setup upgrades the previous development preview and can repeatedly seed the new model', () => {
  const envFile = join(directory, '.env');
  writeFileSync(envFile, '');
  let previousHousehold = 'home';
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync('npm', ['run', 'db:setup'], {
      env: {
        PATH: process.env.PATH,
        ...configurationEnvironment(path),
        NODE_ENV: 'development',
        SKYTTEL_DEV_ENV_FILE: envFile,
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Development database reset and seeded with TestHousehold.');
    database = openDatabase(path);
    const administrator = database
      .prepare(`SELECT m.userId, m.householdId, m.role FROM membership m
        JOIN account a ON a.userId = m.userId WHERE a.providerId = 'google' AND a.accountId = ?`)
      .get(configurationEnvironment(path).SKYTTEL_FIRST_ADMIN_SUBJECT) as {
      userId: string;
      householdId: string;
      role: string;
    };
    expect(administrator.role).toBe('administrator');
    expect(administrator.householdId).not.toBe(previousHousehold);
    const map = householdMap(database, administrator.userId, administrator.householdId);
    const state = map.read();
    expect(state.objects).toHaveLength(16);
    expect(state.relationships).toHaveLength(21);
    expect(state.objects.find(({ name }) => name === 'Alex blå cykel')?.properties).toEqual(
      expect.arrayContaining([
        { id: expect.any(String), label: 'Extrahjul', kind: 'number', value: 0 },
        { id: expect.any(String), label: 'Elcykel', kind: 'boolean', value: false },
        { id: expect.any(String), label: 'Kontrolldatum', kind: 'date', value: '2026-04-03' },
        { id: expect.any(String), label: 'Ramfärg', kind: 'text', value: 'Blå' },
      ]),
    );
    const service = state.objects.find(({ name }) => name === 'Molnmusik');
    expect(
      state.relationships.find(({ sourceId }) => sourceId === service?.id)?.properties,
    ).toEqual([
      { id: expect.any(String), label: 'Osäkert uppgivet', kind: 'boolean', value: true },
    ]);
    const ids = new Set(state.objects.map(({ id }) => id));
    const effective = [...effectiveRelationships(state).values()];
    expect(effective).toHaveLength(21);
    for (const relationship of [...state.relationships, ...effective]) {
      expect(ids.has(relationship.sourceId)).toBe(true);
      expect(ids.has(relationship.targetId)).toBe(true);
    }
    expect(state.draft.changes).toMatchObject([{ after: { name: 'Lo Lind' } }]);
    expect(state.draft.relationships).toHaveLength(1);
    expect(state.draft.relationships?.[0].after?.targetId).toBe(
      state.objects.find(({ name }) => name === 'musik@example.test')?.id,
    );
    expect(map.history().history.map(({ actorName }) => actorName)).toEqual([
      'Robin Demo',
      'Development administrator',
    ]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM household').get()).toEqual({ count: 1 });
    previousHousehold = administrator.householdId;
    database.close();
    database = undefined;
  }
}, 15000);

test.each(['production', 'declared restore'])(
  'db:setup refuses a %s preview without resetting its database',
  (mode) => {
    const envFile = join(directory, '.env');
    writeFileSync(envFile, '');
    const before = readFileSync(path);
    const result = spawnSync('npm', ['run', 'db:setup'], {
      env: {
        PATH: process.env.PATH,
        ...configurationEnvironment(path),
        NODE_ENV: mode === 'production' ? 'production' : 'development',
        SKYTTEL_DEV_ENV_FILE: envFile,
        ...(mode === 'declared restore'
          ? {
              SKYTTEL_RESTORE_FROM_GENERATION: 'legacy',
              SKYTTEL_RESTORE_CONFIRMED_AT: '2026-01-01T00:00:00.000Z',
              SKYTTEL_RESTORE_ERASURE_REVIEWED: 'true',
            }
          : {}),
      },
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain(
      mode === 'production'
        ? 'db:setup is for development and cannot run with NODE_ENV=production.'
        : 'unsupported_database_format',
    );
    expect(readFileSync(path)).toEqual(before);
  },
);
