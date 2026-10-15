import type Database from 'better-sqlite3';
import { type AuthorityFence, validAuthorityFence } from './config.js';

type Authority = { generation: string; restoredFrom: string | null; restoredAt: number | null };

export class InstallationAuthorityError extends Error {
  constructor(
    readonly reason: 'authority_initialization_required' | 'restore_declaration_required',
  ) {
    super(reason);
  }
}

/** Migration-provided defaults are not household or login state. These roots
 * cover stored household content, people and authority, including attempts
 * made before a first successful provider sign-in. */
export function hasInstallationState(database: Database.Database) {
  return [
    'user',
    'household',
    'verification',
    'oauthClient',
    'jwks',
    'browser_binding',
    'browser_binding_attempt',
    'session',
    'assistant_connection',
  ].some((table) => database.prepare(`SELECT 1 FROM "${table}" LIMIT 1`).get());
}

/** Call only while the installation is stopped, inside the caller's immediate
 * transaction. Identity links and durable household outcomes are not authority. */
export function invalidateInstallationAuthority(database: Database.Database) {
  for (const table of [
    'browser_binding_attempt',
    'browser_binding',
    'login_link',
    'verification',
    'oauthAccessToken',
    'oauthRefreshToken',
    'oauthConsent',
    'assistant_connection',
    'oauthClientAssertion',
    'oauthClient',
    'jwks',
    'session',
  ])
    database.exec(`DELETE FROM "${table}"`);
  database.exec(`UPDATE account SET accessToken = NULL, refreshToken = NULL,
    idToken = NULL, accessTokenExpiresAt = NULL, refreshTokenExpiresAt = NULL,
    password = NULL`);
}

/** Must run before an auth factory can cache keys or accept callbacks. The
 * independent host declaration is the authority; this database row is only
 * an acknowledgement. An undeclared same-generation disk rollback cannot be
 * detected here: operators must rotate the host generation before each copy. */
export function prepareInstallationAuthority(database: Database.Database, fence: AuthorityFence) {
  if (!validAuthorityFence(fence))
    throw new InstallationAuthorityError('restore_declaration_required');
  return database
    .transaction(() => {
      const current = database
        .prepare(
          'SELECT generation, restoredFrom, restoredAt FROM installation_authority WHERE id = 1',
        )
        .get() as Authority | undefined;
      if (current?.generation === fence.generation) {
        if (
          current.restoredFrom !== (fence.restore?.fromGeneration ?? null) ||
          current.restoredAt !== (fence.restore?.confirmedAt ?? null)
        )
          throw new InstallationAuthorityError('restore_declaration_required');
        return current;
      }
      if (!current) {
        const legacyRestore = fence.restore?.fromGeneration === 'legacy';
        if ((fence.restore && !legacyRestore) || (!legacyRestore && hasInstallationState(database)))
          throw new InstallationAuthorityError('authority_initialization_required');
        invalidateInstallationAuthority(database);
        database
          .prepare(
            'INSERT INTO installation_authority (id, generation, restoredFrom, restoredAt) VALUES (1, ?, ?, ?)',
          )
          .run(
            fence.generation,
            fence.restore?.fromGeneration ?? null,
            fence.restore?.confirmedAt ?? null,
          );
        return {
          generation: fence.generation,
          restoredFrom: fence.restore?.fromGeneration ?? null,
          restoredAt: fence.restore?.confirmedAt ?? null,
        };
      }
      const restore = fence.restore;
      if (
        !restore ||
        restore.fromGeneration !== current.generation ||
        restore.erasureReviewed !== true ||
        !Number.isSafeInteger(restore.confirmedAt) ||
        restore.confirmedAt <= 0 ||
        restore.confirmedAt > Date.now()
      )
        throw new InstallationAuthorityError('restore_declaration_required');
      invalidateInstallationAuthority(database);
      database
        .prepare(`UPDATE installation_authority SET generation = ?, restoredFrom = ?,
      restoredAt = ? WHERE id = 1`)
        .run(fence.generation, restore.fromGeneration, restore.confirmedAt);
      return {
        generation: fence.generation,
        restoredFrom: restore.fromGeneration,
        restoredAt: restore.confirmedAt,
      };
    })
    .immediate();
}

export function installationAuthority(database: Database.Database) {
  // Historical test factories can intentionally serve an older schema. The
  // production factory separately requires preparation against the full schema.
  if (
    !database
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'installation_authority'",
      )
      .get()
  )
    return undefined;
  return database
    .prepare('SELECT generation, restoredFrom, restoredAt FROM installation_authority WHERE id = 1')
    .get() as Authority | undefined;
}
