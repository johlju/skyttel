import { AsyncLocalStorage } from 'node:async_hooks';
import Database from 'better-sqlite3';

// Better Auth owns provider validation, token encryption and cookie issuance.
// Its async adapter cannot join our synchronous SQLite commit. Give callbacks
// an isolated auth-only workspace, then publish their changes under the binding
// guard. No transaction on the live database spans an await or provider call.
const tables = [
  'user',
  'account',
  'session',
  'verification',
  'login_link',
  'jwks',
  // The OAuth plugin resumes a pending authorization after browser sign-in.
  // Its client/resource/consent checks are part of that same callback.
  'oauthClient',
  'oauthResource',
  'oauthClientResource',
  'oauthConsent',
] as const;
type Row = Record<string, unknown>;
const callbacks = new AsyncLocalStorage<Map<Database.Database, Database.Database>>();

export function authDatabase(database: Database.Database): Database.Database {
  return new Proxy(database, {
    get(target, property) {
      const selected = callbacks.getStore()?.get(target) ?? target;
      const value = Reflect.get(selected, property, selected);
      return typeof value === 'function' ? value.bind(selected) : value;
    },
  });
}

function rows(database: Database.Database, table: string) {
  const primary = table === 'login_link' ? 'sessionId' : 'id';
  return new Map(
    (database.prepare(`SELECT * FROM "${table}" ORDER BY "${primary}"`).all() as Row[]).map(
      (row) => [row[primary] as string, row],
    ),
  );
}

function same(first: Row | undefined, second: Row | undefined) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export async function stageAuthCallback<T>(
  database: Database.Database,
  operation: () => Promise<T>,
  finish: (result: T, commit: (selected?: readonly string[]) => void) => Promise<T>,
) {
  if (database.inTransaction) throw new Error('auth_callback_busy');
  const staged = new Database(':memory:');
  staged.pragma('temp_store = MEMORY');
  const before = new Map<string, Map<string, Row>>();
  try {
    for (const table of tables) {
      const schema = database
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table) as { sql: string } | undefined;
      if (!schema) continue;
      staged.exec(schema.sql);
      const original = rows(database, table);
      before.set(table, original);
      for (const row of original.values()) {
        const columns = Object.keys(row);
        staged
          .prepare(
            `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          )
          .run(...Object.values(row));
      }
    }
    return await callbacks.run(new Map([[database, staged]]), async () => {
      const result = await operation();
      // The caller runs this publication and its authorization changes in one
      // synchronous live transaction. Optimistic comparisons also protect
      // identity updates made concurrently from another browser binding.
      const commit = (selected: readonly string[] = tables) => {
        const changes = [...before].filter(([table]) => selected.includes(table));
        for (const [table, original] of changes) {
          const primary = table === 'login_link' ? 'sessionId' : 'id';
          const updated = rows(staged, table);
          for (const id of new Set([...original.keys(), ...updated.keys()])) {
            const old = original.get(id);
            const next = updated.get(id);
            if (same(old, next)) continue;
            const current = database
              .prepare(`SELECT * FROM "${table}" WHERE "${primary}" = ?`)
              .get(id) as Row | undefined;
            if (!same(old, current)) throw new Error('auth_callback_conflict');
          }
        }
        for (const [table, original] of changes) {
          const primary = table === 'login_link' ? 'sessionId' : 'id';
          const updated = rows(staged, table);
          for (const [id, next] of updated) {
            const old = original.get(id);
            if (same(old, next)) continue;
            const columns = Object.keys(next);
            if (!old)
              database
                .prepare(
                  `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
                )
                .run(...Object.values(next));
            else
              database
                .prepare(
                  `UPDATE "${table}" SET ${columns.map((column) => `"${column}" = ?`).join(',')} WHERE "${primary}" = ?`,
                )
                .run(...Object.values(next), id);
          }
        }
        // Delete children before parents. The callback normally only consumes
        // verification rows; this ordering also preserves foreign-key safety.
        for (const [table, original] of changes.reverse()) {
          const primary = table === 'login_link' ? 'sessionId' : 'id';
          const updated = rows(staged, table);
          for (const id of original.keys())
            if (!updated.has(id))
              database.prepare(`DELETE FROM "${table}" WHERE "${primary}" = ?`).run(id);
        }
      };
      return finish(result, commit);
    });
  } finally {
    staged.close();
  }
}
