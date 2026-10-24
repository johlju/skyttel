import type Database from 'better-sqlite3';

type Discard = { householdId: string; userId: string; version: number };
const listeners = new WeakMap<Database.Database, Set<(event: Discard) => void>>();

/** Process-local conversations end on restart; only committed whole-draft discards matter. */
export function draftDiscards(database: Database.Database) {
  let current = listeners.get(database);
  if (!current) {
    current = new Set();
    listeners.set(database, current);
  }
  return {
    subscribe(listener: (event: Discard) => void) {
      current.add(listener);
      return () => current.delete(listener);
    },
    committed(event: Discard) {
      for (const listener of current) listener(event);
    },
  };
}
