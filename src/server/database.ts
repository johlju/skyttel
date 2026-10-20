import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { type AuthorityFence, validAuthorityFence } from './config.js';

interface MigrationRecord {
  version: number;
  name: string;
  checksum: string;
}

type Migration = MigrationRecord & { sql: string };

type DatabaseFailure =
  | 'database_unavailable'
  | 'unsupported_database_format'
  | 'migration_failed'
  | 'migration_files_missing'
  | 'invalid_migration_sequence'
  | 'migration_history_mismatch';

export class DatabaseInitializationError extends Error {
  constructor(readonly reason: DatabaseFailure) {
    super('database_initialization_failed');
  }
}

// Ordinary startup upgrades only the recognized previous preview once.
const applicationId = 0x534b5954;
const formatVersion = 2;
const previousPreviewVersion = 34;
const migrationTable = `CREATE TABLE IF NOT EXISTS schema_migration (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    appliedAt TEXT NOT NULL
  )`;

function checkFormat(
  database: Database.Database,
  directory: string,
  authorityFence?: AuthorityFence,
) {
  const application = database.pragma('application_id', { simple: true });
  const version = database.pragma('user_version', { simple: true });
  if (application === applicationId && version === formatVersion) return false;
  const empty = !database.prepare('SELECT 1 FROM sqlite_schema LIMIT 1').get();
  if (application === 0 && version === 0 && empty) return false;
  if (application === 0 && version === 0 && authorityFence) {
    verifyPreviousPreview(database, readMigrations(directory), authorityFence);
    return true;
  }
  throw new DatabaseInitializationError('unsupported_database_format');
}

export function openDatabase(
  path: string,
  {
    migrationsDirectory = resolve('migrations'),
    authorityFence,
  }: { migrationsDirectory?: string; authorityFence?: AuthorityFence } = {},
): Database.Database {
  let database: Database.Database | undefined;
  let reason: DatabaseFailure = 'database_unavailable';
  try {
    if (path !== ':memory:' && existsSync(path)) {
      // Inspect before opening a writer, changing permissions or journal mode.
      const reader = new Database(path, { readonly: true, fileMustExist: true });
      try {
        checkFormat(reader, migrationsDirectory, authorityFence);
      } finally {
        reader.close();
      }
    }
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    database = new Database(path);
    checkFormat(database, migrationsDirectory, authorityFence);
    if (path !== ':memory:') chmodSync(path, 0o600);
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    const journalMode = database.pragma('journal_mode = WAL', { simple: true });
    if (path !== ':memory:' && journalMode !== 'wal') throw new DatabaseInitializationError(reason);
    database.pragma('synchronous = FULL');
    reason = 'migration_failed';
    migrate(database, migrationsDirectory, authorityFence);
    return database;
  } catch (error) {
    database?.close();
    throw error instanceof DatabaseInitializationError
      ? error
      : new DatabaseInitializationError(reason);
  }
}

function readMigrations(directory: string): Migration[] {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  if (files.length === 0) throw new DatabaseInitializationError('migration_files_missing');
  return files.map((name, index) => {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
    const version = Number(match?.[1]);
    if (!match || version !== index + 1)
      throw new DatabaseInitializationError('invalid_migration_sequence');
    const sql = readFileSync(join(directory, name), 'utf8');
    return { version, name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
}

function schema(database: Database.Database) {
  return database
    .prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
      WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name`)
    .all();
}

function verifyPreviousPreview(
  database: Database.Database,
  migrations: Migration[],
  authorityFence: AuthorityFence,
) {
  const unsupported = () => new DatabaseInitializationError('unsupported_database_format');
  if (!validAuthorityFence(authorityFence) || authorityFence.restore) throw unsupported();
  try {
    const applied = database
      .prepare('SELECT version, name, checksum FROM schema_migration ORDER BY version')
      .all() as MigrationRecord[];
    const targetMigrations = [
      '035_object_properties.sql',
      '036_relationship_properties.sql',
      '037_free_property_contract.sql',
    ];
    if (
      applied.length !== previousPreviewVersion ||
      targetMigrations.some(
        (name, index) => migrations[previousPreviewVersion + index]?.name !== name,
      )
    )
      throw unsupported();
    verifyMigrationHistory(applied, migrations);
    const expected = new Database(':memory:');
    try {
      expected.exec(migrationTable);
      for (const migration of migrations.slice(0, previousPreviewVersion))
        expected.exec(migration.sql);
      if (JSON.stringify(schema(database)) !== JSON.stringify(schema(expected)))
        throw unsupported();
    } finally {
      expected.close();
    }
    const authority = database
      .prepare(
        'SELECT generation, restoredFrom, restoredAt FROM installation_authority WHERE id = 1',
      )
      .get() as
      | { generation: string; restoredFrom: string | null; restoredAt: number | null }
      | undefined;
    if (
      authority?.generation !== authorityFence.generation ||
      authority.restoredFrom !== null ||
      authority.restoredAt !== null
    )
      throw unsupported();
    if ((database.pragma('foreign_key_check') as unknown[]).length) throw unsupported();
  } catch (error) {
    if (error instanceof DatabaseInitializationError) throw error;
    throw unsupported();
  }
}

function resetPreviousPreviewContent(database: Database.Database) {
  if (
    database
      .prepare(`SELECT 1 FROM household WHERE typeof(contentVersion) != 'integer'
      OR contentVersion < 1 OR contentVersion >= 9007199254740991 LIMIT 1`)
      .get()
  )
    throw new DatabaseInitializationError('migration_failed');
  // Retain only opaque operation IDs as fences, never their old content payloads.
  for (const table of ['map_operation', 'map_save', 'map_history', 'historical_operation'])
    database.exec(`INSERT OR IGNORE INTO retired_operation (householdId, operationId)
      SELECT householdId, operationId FROM ${table}`);
  database.exec('UPDATE household SET contentVersion = contentVersion + 1');
  for (const table of [
    'relationship_form_attempt',
    'content_maintenance',
    'map_operation',
    'historical_operation',
    'map_save',
    'map_history',
    'map_draft',
    'map_relationship',
    'map_object',
    'profile_image',
    'personal_position',
    'object_type_fields',
    'relationship_type_fields',
  ])
    database.exec(`DELETE FROM ${table}`);
  // Archive-only owner labels no longer describe any retained content.
  database.exec(`DELETE FROM personal_view_settings WHERE EXISTS (
    SELECT 1 FROM content_identity identity WHERE identity.householdId = personal_view_settings.householdId
      AND identity.id = personal_view_settings.userId AND identity.userId IS NULL);
    DELETE FROM content_identity WHERE userId IS NULL`);
}

function verifyMigrationHistory(applied: MigrationRecord[], migrations: Migration[]) {
  for (const [index, record] of applied.entries()) {
    const migration = migrations[index];
    if (
      !migration ||
      record.version !== migration.version ||
      record.name !== migration.name ||
      record.checksum !== migration.checksum
    )
      throw new DatabaseInitializationError('migration_history_mismatch');
  }
}

function migrate(database: Database.Database, directory: string, authorityFence?: AuthorityFence) {
  const migrations = readMigrations(directory);
  // SQLite table replacement requires foreign keys disabled before BEGIN.
  // Check the entire resulting graph before committing any schema or data.
  database.pragma('foreign_keys = OFF');
  try {
    database
      .transaction(() => {
        // Recheck under the write lock before any destructive statement.
        const resetContent = checkFormat(database, directory, authorityFence);
        database.exec(migrationTable);
        const applied = database
          .prepare('SELECT version, name, checksum FROM schema_migration ORDER BY version')
          .all() as MigrationRecord[];
        verifyMigrationHistory(applied, migrations);
        if (resetContent) resetPreviousPreviewContent(database);
        const recordMigration = database.prepare(
          'INSERT INTO schema_migration (version, name, checksum, appliedAt) VALUES (?, ?, ?, ?)',
        );
        for (const migration of migrations.slice(applied.length)) {
          database.exec(migration.sql);
          recordMigration.run(
            migration.version,
            migration.name,
            migration.checksum,
            new Date().toISOString(),
          );
        }
        if ((database.pragma('foreign_key_check') as unknown[]).length)
          throw new DatabaseInitializationError('migration_failed');
        database.pragma(`application_id = ${applicationId}`);
        database.pragma(`user_version = ${formatVersion}`);
      })
      .immediate();
  } finally {
    database.pragma('foreign_keys = ON');
  }
}
