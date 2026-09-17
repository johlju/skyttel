import { mkdirSync, mkdtempSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { DatabaseInitializationError, openDatabase } from '../../../src/server/database.js';

let directory: string;
let path: string;
let migrationsDirectory: string;
const databases = new Set<ReturnType<typeof openDatabase>>();
function open() {
  const database = openDatabase(path, { migrationsDirectory });
  databases.add(database);
  return database;
}
function migration(name: string, sql: string) {
  writeFileSync(join(migrationsDirectory, name), sql);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'skyttel-database-unit-'));
  path = join(directory, 'private', 'household.sqlite');
  migrationsDirectory = join(directory, 'migrations');
  mkdirSync(migrationsDirectory);
});
afterEach(() => {
  for (const database of databases) if (database.open) database.close();
  databases.clear();
  rmSync(directory, { recursive: true, force: true });
});

describe('persistent database initialization', () => {
  test('applies migrations once, preserves data across reopen, and restricts file access', () => {
    migration(
      '001_initial.sql',
      "CREATE TABLE item (name TEXT NOT NULL); INSERT INTO item VALUES ('Linden');",
    );
    const database = open();
    expect(database.prepare('SELECT name FROM item').all()).toEqual([{ name: 'Linden' }]);
    database.prepare('INSERT INTO item VALUES (?)').run('Örnen');
    database.close();
    expect(open().prepare('SELECT name FROM item ORDER BY name').all()).toEqual([
      { name: 'Linden' },
      { name: 'Örnen' },
    ]);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test('adds new migrations while retaining existing household data', () => {
    migration(
      '001_initial.sql',
      "CREATE TABLE item (name TEXT); INSERT INTO item VALUES ('Linden');",
    );
    open().close();
    migration(
      '002_membership.sql',
      "ALTER TABLE item ADD COLUMN role TEXT NOT NULL DEFAULT 'member';",
    );
    expect(open().prepare('SELECT name, role FROM item').get()).toEqual({
      name: 'Linden',
      role: 'member',
    });
  });

  test('rolls back a failing migration and can recover after it is corrected', () => {
    migration('001_initial.sql', 'CREATE TABLE item (name TEXT);');
    open().close();
    migration('002_membership.sql', "INSERT INTO item VALUES ('Linden'); INVALID SQL;");
    expect(open).toThrow(new DatabaseInitializationError('migration_failed'));
    migration('002_membership.sql', "INSERT INTO item VALUES ('Linden');");
    expect(open().prepare('SELECT name FROM item').all()).toEqual([{ name: 'Linden' }]);
  });

  test.each(['002_gap.sql', 'invalid.sql', '000_zero.sql'])(
    'rejects an invalid migration sequence: %s',
    (name) => {
      migration(name, 'CREATE TABLE item (name TEXT);');
      expect(open).toThrow(new DatabaseInitializationError('invalid_migration_sequence'));
    },
  );

  test('reports an empty migration directory explicitly', () => {
    expect(open).toThrow(new DatabaseInitializationError('migration_files_missing'));
  });

  test.each(['changed', 'renamed', 'removed'])(
    'rejects %s migration history instead of accepting drift',
    (change) => {
      migration('001_initial.sql', 'CREATE TABLE item (name TEXT);');
      migration('002_more.sql', "INSERT INTO item VALUES ('Linden');");
      open().close();
      if (change === 'changed') migration('002_more.sql', "INSERT INTO item VALUES ('Örnen');");
      if (change === 'renamed')
        renameSync(
          join(migrationsDirectory, '002_more.sql'),
          join(migrationsDirectory, '002_renamed.sql'),
        );
      if (change === 'removed') rmSync(join(migrationsDirectory, '002_more.sql'));
      expect(open).toThrow(new DatabaseInitializationError('migration_history_mismatch'));
    },
  );

  test('reports inaccessible storage without disclosing the underlying path', () => {
    writeFileSync(join(directory, 'private'), 'A file cannot contain a database');
    expect(open).toThrow(new DatabaseInitializationError('database_unavailable'));
  });

  test('enforces foreign keys on each reopened connection', () => {
    migration(
      '001_initial.sql',
      'CREATE TABLE parent (id TEXT PRIMARY KEY); CREATE TABLE child (parentId TEXT REFERENCES parent(id));',
    );
    open().close();
    expect(() => open().prepare('INSERT INTO child VALUES (?)').run('missing')).toThrow(
      /FOREIGN KEY/,
    );
  });
});
