import type Database from 'better-sqlite3';
import { assistantFactMention, assistantFactRelevanceText } from './assistant-start-facts.js';
import { assertContentAvailable } from './content-maintenance.js';
import { MapError } from './map-error.js';

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

/** A read has the same identity in cached results and provider context. */
export function assistantReadKey(name: string, args: unknown) {
  return JSON.stringify([name, canonical(args)]);
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
  const pending = new Map<string, { stamp: string; epoch: number; result: Promise<unknown> }>();
  // Keep dependency stamps even after result eviction: earlier facts can still
  // be present in the model's context.
  const sources = new Map<string, string>();
  const invalidated = new Set<string>();
  // Calls completed since the last invalidation check can already contain the
  // replacement facts. Older calls need no exemption from the next change.
  const completedCalls = new Map<string, { name: string; stamp: string }>();
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
  const combinedStamp = database.transaction(() =>
    JSON.stringify([stamp('read_my_draft'), stamp('read_history')]),
  );
  function track(name: string, current: string) {
    const previous = sources.get(name);
    if (previous !== undefined && previous !== current) invalidated.add(name);
    sources.set(name, current);
  }
  return {
    facts(message: string, earlier: readonly string[] = [], references: readonly string[] = []) {
      const text = assistantFactRelevanceText(message, earlier, references);
      const facts: { name: string; args: Record<string, unknown>; value: unknown }[] = [];
      let size = 0;
      for (const [key, entry] of [...entries].reverse()) {
        const [name, args] = JSON.parse(key) as [string, Record<string, unknown>];
        // Reuse a bounded, explicitly relevant query, never an available whole map.
        if (
          name !== 'read_map' ||
          !['query', 'objectId'].some((field) => {
            const value = args[field];
            return typeof value === 'string' && assistantFactMention(text, value);
          }) ||
          entry.stamp !== snapshot(name)
        )
          continue;
        const fact = { name, args, value: entry.value };
        const bytes = Buffer.byteLength(JSON.stringify(fact));
        if (size + bytes > 32_768 || facts.length >= 16) continue;
        facts.push(structuredClone(fact));
        size += bytes;
      }
      return facts;
    },
    async consistent<T>(load: () => Promise<T>): Promise<T> {
      const before = combinedStamp();
      const epoch = generation;
      const value = await load();
      if (epoch !== generation || before !== combinedStamp())
        throw new MapError('assistant_draft_changed', 409);
      return value;
    },
    outdated() {
      for (const name of sources.keys()) {
        const current = snapshot(name);
        if (current !== undefined) track(name, current);
      }
      const changed = [...invalidated].map((name) => {
        const currentCalls = [...completedCalls]
          .filter(([, read]) => read.name === name && read.stamp === sources.get(name))
          .map(([id]) => id);
        return { name, ...(currentCalls.length ? { currentCalls } : {}) };
      });
      invalidated.clear();
      completedCalls.clear();
      return changed;
    },
    clear() {
      generation++;
      entries.clear();
      pending.clear();
      sources.clear();
      invalidated.clear();
      completedCalls.clear();
      bytes = 0;
    },
    async read<T>(
      name: string,
      args: Record<string, unknown>,
      load: () => Promise<T>,
      policy: 'shared' | 'lifecycle' = 'shared',
      contextCallId?: string,
    ): Promise<T> {
      // Lifecycle requests can retire the work that owns an outstanding read.
      // Reuse completed facts, but never wait for that work's transport response.
      // A changed snapshot gets one fresh attempt; it cannot become model facts.
      for (let attempt = 0; ; attempt++) {
        const before = snapshot(name);
        if (before === undefined) return load();
        track(name, before);
        const epoch = generation;
        const key = assistantReadKey(name, args);
        const cached = entries.get(key);
        if (cached?.stamp === before) {
          if (contextCallId) completedCalls.set(contextCallId, { name, stamp: before });
          return structuredClone(cached.value) as T;
        }
        // Errors and reads that straddle a content change never become cached facts.
        let loading = policy === 'lifecycle' ? undefined : pending.get(key);
        if (loading?.stamp !== before || loading.epoch !== epoch) {
          loading = { stamp: before, epoch, result: load() };
          if (policy === 'shared') pending.set(key, loading);
        }
        let value: T;
        try {
          value = structuredClone(await loading.result) as T;
        } finally {
          if (pending.get(key) === loading) pending.delete(key);
        }
        if (epoch !== generation || before !== snapshot(name)) {
          if (policy === 'lifecycle' && attempt === 0) continue;
          throw new MapError('assistant_draft_changed', 409);
        }
        // Only a successful, snapshot-checked result can replace old context
        // facts. Keep its call identity until the next invalidation check, even
        // when the result is too large to cache or is subsequently evicted.
        if (contextCallId) completedCalls.set(contextCallId, { name, stamp: before });
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
      }
    },
  };
}
