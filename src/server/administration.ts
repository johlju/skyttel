import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  Administration,
  HouseholdInvitation,
  MembershipRole,
} from '../shared/administration.js';
import { householdAccess } from './households.js';

export class AdministrationError extends Error {
  constructor(
    readonly code: string,
    readonly status: 400 | 401 | 403 | 404 | 409,
  ) {
    super(code);
  }
}

function requireAdministrator(database: Database.Database, actorId: string, householdId: string) {
  if (householdAccess(database, actorId, householdId)?.role !== 'administrator') {
    throw new AdministrationError('forbidden', 403);
  }
}

const invitationSelection = `SELECT invitation.id, invitation.userId, user.name,
  CASE WHEN invitation.status = 'pending' AND invitation.expiresAt <= ? THEN 'expired'
    ELSE invitation.status END AS status, invitation.createdAt, invitation.expiresAt
  FROM invitation JOIN user ON user.id = invitation.userId`;

export function readAdministration(
  database: Database.Database,
  actorId: string,
  householdId: string,
): Administration {
  return database.transaction(() => {
    requireAdministrator(database, actorId, householdId);
    const members = database
      .prepare(`SELECT user.id AS userId, user.name, membership.role
      FROM membership JOIN user ON user.id = membership.userId
      WHERE householdId = ? ORDER BY user.name, user.id`)
      .all(householdId) as Administration['members'];
    const invitations = database
      .prepare(`${invitationSelection}
      WHERE invitation.householdId = ? ORDER BY invitation.createdAt DESC, invitation.id`)
      .all(new Date().toISOString(), householdId) as HouseholdInvitation[];
    return { members, invitations };
  })();
}

export function createInvitation(
  database: Database.Database,
  actorId: string,
  householdId: string,
  userId: string,
) {
  return database
    .transaction(() => {
      requireAdministrator(database, actorId, householdId);
      const user = database.prepare('SELECT name FROM user WHERE id = ?').get(userId) as
        | { name: string }
        | undefined;
      if (!user) throw new AdministrationError('user_not_found', 404);
      if (householdAccess(database, userId, householdId))
        throw new AdministrationError('already_member', 409);
      const now = new Date();
      const invitation: HouseholdInvitation = {
        id: randomUUID(),
        userId,
        name: user.name,
        status: 'pending',
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const code = randomBytes(32).toString('base64url');
      // Replacing an invitation invalidates its previous code, including when
      // the client lost the creation response and needs a fresh code.
      database
        .prepare(`UPDATE invitation SET status = 'revoked'
      WHERE householdId = ? AND userId = ? AND status = 'pending'`)
        .run(householdId, userId);
      database
        .prepare(`INSERT INTO invitation
      (id, householdId, userId, codeHash, status, createdAt, expiresAt) VALUES (?, ?, ?, ?, 'pending', ?, ?)`)
        .run(
          invitation.id,
          householdId,
          userId,
          createHash('sha256').update(code).digest('hex'),
          invitation.createdAt,
          invitation.expiresAt,
        );
      return { invitation, code };
    })
    .immediate();
}

export function acceptInvitation(database: Database.Database, userId: string, code: string) {
  return database
    .transaction(() => {
      const invitation = database
        .prepare(`SELECT invitation.id, householdId, household.name FROM invitation
      JOIN household ON household.id = invitation.householdId
      WHERE codeHash = ? AND userId = ? AND status = 'pending' AND expiresAt > ?`)
        .get(createHash('sha256').update(code).digest('hex'), userId, new Date().toISOString()) as
        | { id: string; householdId: string; name: string }
        | undefined;
      if (!invitation) throw new AdministrationError('invitation_unavailable', 409);
      if (householdAccess(database, userId, invitation.householdId))
        throw new AdministrationError('already_member', 409);
      database
        .prepare(`INSERT INTO membership (householdId, userId, role) VALUES (?, ?, 'member')`)
        .run(invitation.householdId, userId);
      database.prepare(`UPDATE invitation SET status = 'accepted' WHERE id = ?`).run(invitation.id);
      return {
        household: { id: invitation.householdId, name: invitation.name, role: 'member' as const },
      };
    })
    .immediate();
}

export function revokeInvitation(
  database: Database.Database,
  actorId: string,
  householdId: string,
  invitationId: string,
) {
  return database
    .transaction(() => {
      requireAdministrator(database, actorId, householdId);
      const invitation = database
        .prepare('SELECT status FROM invitation WHERE householdId = ? AND id = ?')
        .get(householdId, invitationId) as { status: string } | undefined;
      if (!invitation) throw new AdministrationError('invitation_not_found', 404);
      if (invitation.status === 'accepted')
        throw new AdministrationError('invitation_unavailable', 409);
      database
        .prepare(`UPDATE invitation SET status = 'revoked' WHERE householdId = ? AND id = ?`)
        .run(householdId, invitationId);
      return { ok: true };
    })
    .immediate();
}

export function changeMembership(
  database: Database.Database,
  actorId: string,
  householdId: string,
  userId: string,
  role: MembershipRole | null,
) {
  return database
    .transaction(() => {
      requireAdministrator(database, actorId, householdId);
      const membership = householdAccess(database, userId, householdId);
      if (!membership) throw new AdministrationError('member_not_found', 404);
      if (membership.role === 'administrator' && role !== 'administrator') {
        const { count } = database
          .prepare(`SELECT count(*) AS count FROM membership
        WHERE householdId = ? AND role = 'administrator'`)
          .get(householdId) as { count: number };
        if (count === 1) throw new AdministrationError('last_administrator', 409);
      }
      if (role === null) {
        database
          .prepare('DELETE FROM membership WHERE householdId = ? AND userId = ?')
          .run(householdId, userId);
        database
          .prepare(`UPDATE invitation SET status = 'revoked'
        WHERE householdId = ? AND userId = ? AND status = 'pending'`)
          .run(householdId, userId);
      } else {
        database
          .prepare('UPDATE membership SET role = ? WHERE householdId = ? AND userId = ?')
          .run(role, householdId, userId);
      }
      return { ok: true };
    })
    .immediate();
}
