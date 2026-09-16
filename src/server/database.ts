import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

interface MigrationRecord {
  version: number;
  name: string;
  checksum: string;
}

type DatabaseFailure = 'database_unavailable' | 'migration_failed' | 'migration_files_missing'
  | 'invalid_migration_sequence' | 'migration_history_mismatch';

export class DatabaseInitializationError extends Error {
  constructor(readonly reason: DatabaseFailure) {
    super('database_initialization_failed');
  }
}

export function openDatabase(
  path: string,
  { migrationsDirectory = resolve('migrations') }: { migrationsDirectory?: string } = {},
): Database.Database {
  let database: Database.Database | undefined;
  let reason: DatabaseFailure = 'database_unavailable';
  try {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    database = new Database(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    const journalMode = database.pragma('journal_mode = WAL', { simple: true });
    if (path !== ':memory:' && journalMode !== 'wal') throw new DatabaseInitializationError(reason);
    database.pragma('synchronous = FULL');
    reason = 'migration_failed';
    migrate(database, migrationsDirectory);
    return database;
  } catch (error) {
    database?.close();
    throw error instanceof DatabaseInitializationError ? error : new DatabaseInitializationError(reason);
  }
}

function migrate(database: Database.Database, directory: string) {
  const files = readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
  if (files.length === 0) throw new DatabaseInitializationError('migration_files_missing');
  const migrations = files.map((name, index) => {
    const match = /^(\d{3})_[a-z0-9_]+\.sql$/.exec(name);
    const version = Number(match?.[1]);
    if (!match || version !== index + 1) throw new DatabaseInitializationError('invalid_migration_sequence');
    const sql = readFileSync(join(directory, name), 'utf8');
    return { version, name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });

  database.exec(`CREATE TABLE IF NOT EXISTS schema_migration (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    appliedAt TEXT NOT NULL
  )`);
  database.transaction(() => {
    const applied = database.prepare('SELECT version, name, checksum FROM schema_migration ORDER BY version').all() as MigrationRecord[];
    for (const [index, record] of applied.entries()) {
      const migration = migrations[index];
      if (!migration || record.version !== migration.version || record.name !== migration.name || record.checksum !== migration.checksum) {
        throw new DatabaseInitializationError('migration_history_mismatch');
      }
    }
    const recordMigration = database.prepare('INSERT INTO schema_migration (version, name, checksum, appliedAt) VALUES (?, ?, ?, ?)');
    for (const migration of migrations.slice(applied.length)) {
      database.exec(migration.sql);
      recordMigration.run(migration.version, migration.name, migration.checksum, new Date().toISOString());
    }
  }).immediate();
}
