import type Database from 'better-sqlite3';
import { type ConversationState, discardConversationDraftParts } from './conversation-state.js';
import { MapError } from './map-error.js';
import { pendingParts } from './pending-parts.js';

export const conversationLifetime = 7 * 24 * 60 * 60_000;
export const conversationStorageConsentVersion = 4;
const clocks = new WeakMap<Database.Database, () => number>();
type Accepted = ConversationState['accepted'] extends Map<string, infer Value> ? Value : never;
type StoredState = Omit<ConversationState, 'accepted' | 'pendingPartsLedger'> & {
  accepted: [string, Accepted][];
  pendingPartsLedger: Omit<ConversationState['pendingPartsLedger'], 'applied'> & {
    applied: string[];
  };
};
function available(database: Database.Database) {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE name = 'conversation' AND type = 'table'")
      .get(),
  );
}

/** A browser's expired authentication can rotate without merging conversations. */
export function transferConversationBinding(
  database: Database.Database,
  previous: string,
  next: string,
) {
  if (available(database))
    database
      .prepare('UPDATE conversation SET browserBindingId = ? WHERE browserBindingId = ?')
      .run(next, previous);
}

/** Existing registered attempts are checked before this guard by their owner. */
export function conversationSaveBlocked(
  database: Database.Database,
  owner: string,
  householdId: string,
) {
  if (!available(database)) return false;
  const blocked = database
    .prepare(`SELECT 1 FROM conversation AS c,
    json_each(c.state, '$.pendingPartsLedger.parts') AS part
    JOIN household h ON h.id = c.householdId
    WHERE c.owner = ? AND c.householdId = ? AND c.contentVersion = h.contentVersion
    AND c.expiresAt > ? AND json_extract(part.value, '$.kind') = 'change'
    AND json_extract(part.value, '$.status') IN ('waiting', 'ready') LIMIT 1`)
    .get(owner, householdId, (clocks.get(database) ?? Date.now)());
  return Boolean(blocked);
}
export function assertConversationSaveAllowed(
  database: Database.Database,
  owner: string,
  householdId: string,
) {
  if (conversationSaveBlocked(database, owner, householdId))
    throw new MapError('assistant_questions_pending', 409);
}

export function conversationBatchPending(
  database: Database.Database,
  owner: string,
  householdId: string,
) {
  if (!available(database)) return false;
  return Boolean(
    database
      .prepare(`SELECT 1 FROM conversation c JOIN household h ON h.id = c.householdId
    WHERE c.owner = ? AND c.householdId = ? AND c.contentVersion = h.contentVersion
    AND c.expiresAt > ? AND json_type(c.state, '$.pendingBatch') = 'object' LIMIT 1`)
      .get(owner, householdId, (clocks.get(database) ?? Date.now)()),
  );
}

/** Domain snapshots contain no process resources or provider-owned continuation. */
export function conversationStorage(database: Database.Database, now: () => number) {
  clocks.set(database, now);
  const enabled = available(database);
  const erase = (id: string) =>
    enabled && database.prepare('DELETE FROM conversation WHERE id = ?').run(id);
  function sweep() {
    if (enabled) database.prepare('DELETE FROM conversation WHERE expiresAt <= ?').run(now());
  }
  sweep();
  const timer = setInterval(sweep, 60_000).unref();
  const storage = {
    erase,
    sweep,
    close: () => clearInterval(timer),
    binding(browserSessionId: string) {
      if (!enabled) return;
      return (
        database
          .prepare('SELECT id FROM browser_binding WHERE sessionId = ?')
          .get(browserSessionId) as { id: string } | undefined
      )?.id;
    },
    write(state: ConversationState, browserBindingId: string) {
      if (!enabled || !state.storageConsentVersion || !state.expiresAt || state.expiresAt <= now())
        return;
      const serialized = JSON.stringify({
        ...state,
        accepted: [...state.accepted],
        pendingPartsLedger: {
          ...state.pendingPartsLedger,
          applied: [...state.pendingPartsLedger.applied],
        },
      });
      database
        .prepare(`INSERT INTO conversation
        (id, householdId, userId, browserBindingId, owner, contentVersion, expiresAt, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        expiresAt = excluded.expiresAt, state = excluded.state`)
        .run(
          state.id,
          state.householdId,
          state.actorId,
          browserBindingId,
          state.owner,
          state.review.contentVersion,
          state.expiresAt,
          serialized,
        );
    },
    read(actorId: string, householdId: string, browserBindingId: string, id?: string) {
      if (!enabled) return;
      sweep();
      const row = database
        .prepare(`SELECT id, state FROM conversation WHERE userId = ?
        AND householdId = ? ${id ? 'AND id = ?' : 'AND browserBindingId = ?'}
        ORDER BY expiresAt DESC LIMIT 1`)
        .get(actorId, householdId, id ?? browserBindingId) as
        | { id: string; state: string }
        | undefined;
      if (!row) return;
      try {
        const stored = JSON.parse(row.state) as StoredState;
        if (
          stored.id !== row.id ||
          stored.actorId !== actorId ||
          stored.householdId !== householdId ||
          !Array.isArray(stored.accepted) ||
          !Array.isArray(stored.pendingPartsLedger?.applied) ||
          !Array.isArray(stored.pendingPartsLedger.parts) ||
          !Array.isArray(stored.conversation) ||
          !Array.isArray(stored.unfinishedRequests) ||
          !Array.isArray(stored.queue)
        )
          throw new Error('invalid_conversation');
        return {
          ...stored,
          accepted: new Map(stored.accepted),
          pendingPartsLedger: {
            ...stored.pendingPartsLedger,
            applied: new Set(stored.pendingPartsLedger.applied),
          },
        };
      } catch {
        erase(row.id);
        return;
      }
    },
    /** A whole-draft discard also retires dependent parts while their conversation is unloaded. */
    discardDraftParts(owner: string, householdId: string, version: number): void {
      if (!enabled) return;
      database
        .transaction(() => {
          const rows = database
            .prepare(`SELECT c.id, c.userId, c.browserBindingId FROM conversation c
          JOIN household h ON h.id = c.householdId
          WHERE c.owner = ? AND c.householdId = ? AND c.contentVersion = h.contentVersion
          AND c.expiresAt > ?`)
            .all(owner, householdId, now()) as {
            id: string;
            userId: string;
            browserBindingId: string;
          }[];
          for (const row of rows) {
            const state = storage.read(row.userId, householdId, row.browserBindingId, row.id);
            if (!state) continue;
            discardConversationDraftParts(state, pendingParts(state.pendingPartsLedger), version);
            storage.write(state, row.browserBindingId);
          }
        })
        .immediate();
    },
    eraseActor(actorId: string, householdId: string) {
      if (enabled)
        database
          .prepare('DELETE FROM conversation WHERE userId = ? AND householdId = ?')
          .run(actorId, householdId);
    },
    pausedWork(actorId: string, householdId: string, exceptId?: string) {
      if (!enabled) return false;
      return Boolean(
        database
          .prepare(`SELECT 1 FROM conversation WHERE userId = ?
        AND householdId = ? AND id != ? AND expiresAt > ? AND json_extract(state, '$.paused') = 1
        AND (json_type(state, '$.activeMessage') = 'object' OR json_array_length(state, '$.queue') > 0
        OR json_array_length(state, '$.unfinishedRequests') > 0)
        LIMIT 1`)
          .get(actorId, householdId, exceptId ?? '', now()),
      );
    },
  };
  return storage;
}
