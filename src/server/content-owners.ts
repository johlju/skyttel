import type Database from 'better-sqlite3';
import type { ContentIdentity, ContentOwners } from '../shared/content-owners.js';
import { assertContentAvailable, assertContentVersion } from './content-maintenance.js';
import { householdAccess } from './households.js';
import { MapError } from './map-error.js';

/** Explicit recovery ownership changes never grant membership or merge private work. */
export function contentOwners(database: Database.Database, householdId: string, actorId: string) {
  function authorize() {
    if (householdAccess(database, actorId, householdId)?.role !== 'administrator')
      throw new MapError('forbidden', 403);
    assertContentAvailable(database, householdId);
  }
  function read(): ContentOwners {
    authorize();
    const { contentVersion } = database
      .prepare('SELECT contentVersion FROM household WHERE id = ?')
      .get(householdId) as { contentVersion: number };
    const identities = database
      .prepare(`SELECT i.id, i.name, i.userId,
      COALESCE(json_array_length(d.changes),0) + COALESCE(json_array_length(d.relationships),0) +
      COALESCE(json_array_length(d.objectTypes),0) + COALESCE(json_array_length(d.relationshipTypes),0) AS draftChanges,
      (SELECT count(*) FROM personal_position p WHERE p.householdId=i.householdId AND p.userId=i.id) AS positions,
      EXISTS(SELECT 1 FROM personal_view_settings s WHERE s.householdId=i.householdId AND s.userId=i.id) AS hasViewSettings
      FROM content_identity i LEFT JOIN map_draft d ON d.householdId=i.householdId AND d.userId=i.id
      WHERE i.householdId=? ORDER BY i.name,i.id`)
      .all(householdId) as (Omit<ContentIdentity, 'hasViewSettings'> & {
      hasViewSettings: number;
    })[];
    const members = database
      .prepare(`SELECT u.id AS userId,u.name,m.role FROM membership m JOIN user u ON u.id=m.userId
      WHERE m.householdId=? AND EXISTS(SELECT 1 FROM account a WHERE a.userId=u.id AND a.providerId IN ('google','microsoft'))
      ORDER BY u.name,u.id`)
      .all(householdId) as ContentOwners['members'];
    const { pendingOperations } = database
      .prepare(
        "SELECT count(*) AS pendingOperations FROM map_operation WHERE householdId=? AND status='pending'",
      )
      .get(householdId) as { pendingOperations: number };
    return {
      contentVersion,
      identities: identities.map((row) => ({
        ...row,
        hasViewSettings: Boolean(row.hasViewSettings),
      })),
      members,
      pendingOperations,
    };
  }
  return {
    read: () => database.transaction(read)(),
    assign(body: Record<string, unknown>) {
      return database
        .transaction(() => {
          authorize();
          if (
            body.confirmed !== true ||
            typeof body.identityId !== 'string' ||
            !(body.userId === null || typeof body.userId === 'string') ||
            !Number.isSafeInteger(body.contentVersion) ||
            Number(body.contentVersion) < 1 ||
            Object.keys(body).some(
              (key) => !['confirmed', 'identityId', 'userId', 'contentVersion'].includes(key),
            )
          )
            throw new MapError('invalid_request', 400);
          assertContentVersion(database, householdId, body.contentVersion);
          const current = read();
          const identity = current.identities.find((item) => item.id === body.identityId);
          if (!identity) throw new MapError('identity_unavailable', 404);
          if (
            body.userId !== null &&
            !current.members.some((member) => member.userId === body.userId)
          )
            throw new MapError('verified_member_required', 409);
          if (identity.userId === body.userId) return current;
          // Keep durable attempt evidence before the generation trigger retires live
          // operations. A pending attempt never becomes a confirmed historical save.
          database
            .prepare(
              'INSERT INTO historical_operation SELECT * FROM map_operation WHERE householdId=?',
            )
            .run(householdId);
          if (body.userId !== null)
            database
              .prepare('UPDATE content_identity SET userId=NULL WHERE householdId=? AND userId=?')
              .run(householdId, body.userId);
          database
            .prepare('UPDATE content_identity SET userId=? WHERE householdId=? AND id=?')
            .run(body.userId, householdId, body.identityId);
          database
            .prepare('UPDATE household SET contentVersion=contentVersion+1 WHERE id=?')
            .run(householdId);
          return read();
        })
        .immediate();
    },
  };
}
