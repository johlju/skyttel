import type Database from 'better-sqlite3';
import { sessionDeadline } from './browser-binding.js';

const batchSize = 100;

// Better Auth's SQLite dates and supported historical fixtures use epoch
// milliseconds or ISO text. Keep exact millisecond boundaries for both.
function milliseconds(column: string) {
  return `(CASE WHEN typeof(${column}) IN ('integer', 'real') THEN ${column}
    ELSE CAST(round((julianday(${column}) - 2440587.5) * 86400000) AS INTEGER) END)`;
}

/** Installation lifecycle: no browser request is needed to remove obsolete
 * authentication records. Missing positive records never grant authority. */
export function authenticationCleanup({
  database,
  now,
  revalidate,
}: {
  database: Database.Database;
  now: () => number;
  revalidate: () => void;
}) {
  const hasResults = !!database
    .prepare("SELECT 1 FROM sqlite_master WHERE name = 'storage_action_result'")
    .get();
  const hasTasks = (
    database.prepare('PRAGMA table_info(assistant_connection)').all() as { name: string }[]
  ).some((column) => column.name === 'taskExpiresAt');
  let closed = false;
  let running = false;
  let continuation: NodeJS.Immediate | undefined;
  let retry: NodeJS.Timeout | undefined;
  let cursor = '';
  let phase = 0;
  function remove(
    table: string,
    primaryKey: string,
    predicate: string,
    ...parameters: (number | string)[]
  ) {
    return (
      database
        .prepare(`DELETE FROM "${table}" WHERE "${primaryKey}" IN
      (SELECT "${primaryKey}" FROM "${table}" WHERE ${predicate} LIMIT ${batchSize})`)
        .run(...parameters).changes === batchSize
    );
  }
  function removePrivate(startup = false) {
    if (!hasTasks) return false;
    const grants = database
      .prepare(`SELECT id, clientId FROM assistant_connection
      WHERE browserSessionId IS NOT NULL ${startup ? '' : 'AND coalesce(taskExpiresAt, 0) <= ?'}
      LIMIT ${batchSize}`)
      .all(...(startup ? [] : [now()])) as { id: string; clientId: string }[];
    for (const grant of grants) {
      database.prepare('DELETE FROM oauthAccessToken WHERE referenceId = ?').run(grant.id);
      database.prepare('DELETE FROM oauthRefreshToken WHERE referenceId = ?').run(grant.id);
      database.prepare('DELETE FROM oauthConsent WHERE referenceId = ?').run(grant.id);
      database.prepare('DELETE FROM assistant_connection WHERE id = ?').run(grant.id);
      database
        .prepare(`DELETE FROM oauthClient WHERE clientId = ? AND NOT EXISTS
        (SELECT 1 FROM assistant_connection WHERE clientId = ?)`)
        .run(grant.clientId, grant.clientId);
    }
    return grants.length === batchSize;
  }
  // Before the app can accept requests, no private conversation belongs to this
  // process. Revoke crash remnants without replaying model work. Each startup
  // transaction is bounded; ordinary sweeps yield between their batches.
  if (hasTasks) {
    try {
      if (database.inTransaction) throw new Error('cleanup_busy');
      while (database.transaction(() => removePrivate(true)).immediate()) {
        /* next bounded batch */
      }
    } catch {
      console.error(JSON.stringify({ event: 'authentication_cleanup_failed' }));
      throw new Error('authentication_cleanup_failed');
    }
  }
  const steps = [
    () => {
      const sessions = database
        .prepare('SELECT * FROM session WHERE id > ? ORDER BY id LIMIT ?')
        .all(cursor, batchSize) as (Parameters<typeof sessionDeadline>[0] & { id: string })[];
      for (const session of sessions) {
        const deadline = sessionDeadline(session);
        if (Number.isFinite(deadline) && deadline <= now())
          database.prepare('DELETE FROM session WHERE id = ?').run(session.id);
      }
      cursor = sessions.at(-1)?.id ?? cursor;
      return sessions.length === batchSize;
    },
    () => removePrivate(),
    () => remove('browser_binding_attempt', 'state', 'expiresAt <= ?', now()),
    () =>
      remove(
        'browser_binding',
        'id',
        `expiresAt <= ?
      AND NOT EXISTS (SELECT 1 FROM session WHERE session.id = browser_binding.sessionId)
      ${
        hasTasks
          ? `AND NOT EXISTS (SELECT 1 FROM assistant_connection
        WHERE browserBindingId = browser_binding.id AND taskExpiresAt > ?)`
          : ''
      }`,
        ...(hasTasks ? [now(), now()] : [now()]),
      ),
    () => hasResults && remove('storage_action_result', 'id', 'checkUntil <= ?', now()),
    () => remove('verification', 'id', `${milliseconds('expiresAt')} <= ?`, now()),
    () => remove('login_link', 'sessionId', 'expiresAt <= ?', now()),
    () => remove('oauthClientAssertion', 'id', `${milliseconds('expiresAt')} <= ?`, now()),
    () =>
      remove(
        'oauthAccessToken',
        'id',
        `revoked IS NOT NULL
      OR ${milliseconds('expiresAt')} <= ?
      OR (referenceId IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM assistant_connection WHERE id = oauthAccessToken.referenceId))`,
        now(),
      ),
    () =>
      remove(
        'oauthRefreshToken',
        'id',
        `(
      (${milliseconds('expiresAt')} <= ? OR (revoked IS NOT NULL AND
        (rotatedAt IS NULL OR (NOT EXISTS (
          SELECT 1 FROM oauthRefreshToken live WHERE live.clientId = oauthRefreshToken.clientId
          AND live.userId = oauthRefreshToken.userId AND live.revoked IS NULL
          AND ${milliseconds('live.expiresAt')} > ?
        ) AND NOT EXISTS (
          SELECT 1 FROM oauthAccessToken live WHERE live.clientId = oauthRefreshToken.clientId
          AND live.userId = oauthRefreshToken.userId AND live.revoked IS NULL
          AND ${milliseconds('live.expiresAt')} > ?
        )))))
      AND NOT EXISTS (SELECT 1 FROM oauthAccessToken live
        WHERE live.refreshId = oauthRefreshToken.id AND live.revoked IS NULL
        AND ${milliseconds('live.expiresAt')} > ?)
      ) OR (referenceId IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM assistant_connection WHERE id = oauthRefreshToken.referenceId))`,
        now(),
        now(),
        now(),
        now(),
      ),
    () =>
      database
        .prepare(`UPDATE oauthRefreshToken SET
      rotationReplayResponse = NULL, rotationReplayExpiresAt = NULL WHERE id IN
      (SELECT id FROM oauthRefreshToken WHERE rotationReplayResponse IS NOT NULL
      AND (rotationReplayExpiresAt IS NULL OR ${milliseconds('rotationReplayExpiresAt')} <= ?)
      LIMIT ${batchSize})`)
        .run(now()).changes === batchSize,
    () =>
      remove(
        'oauthConsent',
        'id',
        `referenceId IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM assistant_connection WHERE id = oauthConsent.referenceId)`,
      ),
  ];
  function drain() {
    continuation = undefined;
    retry = undefined;
    if (closed || !database.open) {
      running = false;
      stop();
      return;
    }
    // The library can own an async SQLite transaction. Never nest cleanup in
    // it, publish callback staging, or hold a transaction over an await.
    if (database.inTransaction) {
      retry = setTimeout(drain, 100);
      retry.unref();
      return;
    }
    try {
      if (!database.transaction(steps[phase]).immediate()) phase++;
      revalidate();
      if (phase < steps.length) {
        continuation = setImmediate(drain);
        continuation.unref();
      } else running = false;
    } catch {
      running = false;
      console.error(JSON.stringify({ event: 'authentication_cleanup_failed' }));
    }
  }
  function begin() {
    if (closed || running) return;
    if (!database.open) {
      stop();
      return;
    }
    cursor = '';
    phase = 0;
    running = true;
    drain();
  }
  begin();
  const timer = setInterval(begin, 60_000);
  timer.unref();
  function stop() {
    closed = true;
    clearInterval(timer);
    if (continuation) clearImmediate(continuation);
    if (retry) clearTimeout(retry);
  }
  return stop;
}
