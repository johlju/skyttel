import type Database from 'better-sqlite3';
import { assertContentAvailable } from './content-maintenance.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

/**
 * Conversation-local successful reads. Only revision metadata is read directly;
 * all content comes through the authorized MCP connection. Check dependencies
 * before reuse and after an asynchronous read, including edits by other clients.
 */
export function assistantReadCache(
  database: Database.Database,
  householdId: string,
  owner: string,
) {
  const entries = new Map<string, { stamp: string; value: unknown; bytes: number }>();
  // Keep dependency stamps even after result eviction: earlier facts can still
  // be present in the model's context.
  const sources = new Map<string, string>();
  const invalidated = new Set<string>();
  let bytes = 0;
  let generation = 0;
  const saved = ['object_type', 'relationship_type', 'map_object', 'map_relationship'].map(
    (table) =>
      database.prepare(`SELECT id, revision FROM ${table} WHERE householdId = ? ORDER BY id`),
  );
  const content = database.prepare('SELECT contentVersion FROM household WHERE id = ?');
  const draft = database.prepare(
    'SELECT version FROM map_draft WHERE householdId = ? AND userId = ?',
  );
  const operations = database.prepare(`SELECT operationId, status FROM map_operation
    WHERE householdId = ? AND userId = ? ORDER BY operationId`);
  const history = database.prepare('SELECT id FROM map_history WHERE householdId = ? ORDER BY id');
  function stamp(name: string) {
    assertContentAvailable(database, householdId);
    const base = content.get(householdId);
    if (name === 'search_object_icons') return JSON.stringify(base);
    if (name === 'read_map')
      return JSON.stringify([base, ...saved.map((query) => query.all(householdId))]);
    if (name === 'read_type_catalog' || name === 'read_my_draft')
      return JSON.stringify([
        base,
        ...saved.map((query) => query.all(householdId)),
        draft.get(householdId, owner),
        operations.all(householdId, owner),
      ]);
    if (
      name === 'read_my_save_operations' ||
      name === 'read_save_operation' ||
      name === 'read_history'
    )
      return JSON.stringify([base, operations.all(householdId, owner), history.all(householdId)]);
    return undefined;
  }
  const snapshot = database.transaction(stamp);
  function track(name: string, current: string) {
    const previous = sources.get(name);
    if (previous !== undefined && previous !== current) invalidated.add(name);
    sources.set(name, current);
  }
  return {
    outdated() {
      for (const name of sources.keys()) {
        const current = snapshot(name);
        if (current !== undefined) track(name, current);
      }
      const changed = [...invalidated].map((name) => ({ name }));
      invalidated.clear();
      return changed;
    },
    clear() {
      generation++;
      entries.clear();
      sources.clear();
      invalidated.clear();
      bytes = 0;
    },
    async read<T>(name: string, args: Record<string, unknown>, load: () => Promise<T>): Promise<T> {
      const before = snapshot(name);
      if (before === undefined) return load();
      track(name, before);
      const epoch = generation;
      const key = JSON.stringify([name, canonical(args)]);
      const cached = entries.get(key);
      if (cached?.stamp === before) return structuredClone(cached.value) as T;
      // Errors and reads that straddle a content change never become cached facts.
      const value = await load();
      if (epoch !== generation || before !== snapshot(name)) return value;
      const size =
        Buffer.byteLength(JSON.stringify(value)) +
        Buffer.byteLength(before) +
        Buffer.byteLength(key);
      if (size > 4 * 1024 * 1024) return value;
      const previous = entries.get(key);
      if (previous) {
        entries.delete(key);
        bytes -= previous.bytes;
      }
      while (entries.size && (entries.size >= 128 || bytes + size > 4 * 1024 * 1024)) {
        const oldest = entries.entries().next().value;
        if (!oldest) break;
        bytes -= oldest[1].bytes;
        entries.delete(oldest[0]);
      }
      entries.set(key, { stamp: before, value: structuredClone(value), bytes: size });
      bytes += size;
      return value;
    },
  };
}
