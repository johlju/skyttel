import type Database from 'better-sqlite3';
import { openDatabase } from '../../src/server/database.js';

/** Build an owned old-schema fixture without running today's readers on that schema. */
export async function legacyDatabaseSnapshot(
  source: Database.Database,
  path: string,
  migrationsDirectory: string,
) {
  const old = openDatabase(':memory:', { migrationsDirectory });
  const current = openDatabase(':memory:');
  const objects = (database: Database.Database) =>
    database
      .prepare(
        "SELECT type, name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND sql IS NOT NULL",
      )
      .all() as { type: string; name: string; sql: string }[];
  const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
  try {
    // Authentication creates additional tables at runtime. Keep those unchanged;
    // tables introduced by later application migrations must stay absent.
    const migrationNames = new Set(objects(current).map(({ name }) => name));
    const runtime = objects(source).filter(({ name }) => !migrationNames.has(name));
    for (const item of runtime.filter(({ type }) => type === 'table')) old.exec(item.sql);
    const triggers = objects(old).filter(({ type }) => type === 'trigger');
    for (const { name } of triggers) old.exec(`DROP TRIGGER ${quote(name)}`);
    old.pragma('foreign_keys = OFF');
    old.transaction(() => {
      for (const { name } of objects(old).filter(({ type }) => type === 'table')) {
        if (name === 'schema_migration') continue;
        const sourceColumns = new Set(
          (source.pragma(`table_info(${quote(name)})`) as { name: string }[]).map(
            ({ name }) => name,
          ),
        );
        const columns = (old.pragma(`table_info(${quote(name)})`) as { name: string }[])
          .map(({ name }) => name)
          .filter((name) => sourceColumns.has(name));
        old.exec(`DELETE FROM ${quote(name)}`);
        if (!columns.length) continue;
        const names = columns.map(quote).join(', ');
        const rows = source.prepare(`SELECT ${names} FROM ${quote(name)}`).all() as Record<
          string,
          unknown
        >[];
        const insert = old.prepare(
          `INSERT INTO ${quote(name)} (${names}) VALUES (${columns.map(() => '?').join(', ')})`,
        );
        for (const row of rows) insert.run(...columns.map((name) => row[name]));
      }
    })();
    for (const { sql } of triggers) old.exec(sql);
    for (const item of runtime.filter(({ type }) => type !== 'table')) old.exec(item.sql);
    old.pragma('foreign_keys = ON');
    if ((old.pragma('foreign_key_check') as unknown[]).length)
      throw new Error('Invalid legacy fixture references');
    await old.backup(path);
  } finally {
    old.close();
    current.close();
  }
}
