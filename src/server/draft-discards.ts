import type Database from 'better-sqlite3';

type Discard = { householdId: string; userId: string; version: number };
const listeners = new WeakMap<Database.Database, Set<(event: Discard) => void>>();
const transactions = new WeakMap<Database.Database, Discard[]>();

/** Only committed whole-draft discards retire draft-dependent conversation parts. */
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
      const pending = transactions.get(database);
      if (pending) {
        pending.push(event);
        return;
      }
      for (const listener of current) listener(event);
    },
    /** Notify conversations only after the entire synchronous draft batch commits. */
    atomic<T>(action: () => T): T {
      if (transactions.has(database)) throw new Error('nested_draft_batch');
      const pending: Discard[] = [];
      transactions.set(database, pending);
      let result: T;
      try {
        result = database.transaction(action).immediate();
      } finally {
        transactions.delete(database);
      }
      for (const event of pending) for (const listener of current) listener(event);
      return result;
    },
  };
}
