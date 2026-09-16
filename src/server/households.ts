import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Config } from './config.js';

export interface Household {
  id: string;
  name: string;
  role: 'administrator' | 'member';
}

export function householdAccess(database: Database.Database, userId: string, householdId?: string): Household | undefined {
  const query = `SELECT household.id, household.name, membership.role FROM household
    JOIN membership ON membership.householdId = household.id
    WHERE membership.userId = ?`;
  return (householdId === undefined
    ? database.prepare(`${query} ORDER BY household.createdAt, household.id LIMIT 1`).get(userId)
    : database.prepare(`${query} AND household.id = ?`).get(userId, householdId)) as Household | undefined;
}

export function isFirstAdmin(database: Database.Database, userId: string, config: Config): boolean {
  return Boolean(database.prepare('SELECT 1 FROM account WHERE userId = ? AND providerId = ? AND accountId = ?')
    .get(userId, config.firstAdmin.provider, config.firstAdmin.subject));
}

export function isInitialized(database: Database.Database): boolean {
  return Boolean(database.prepare('SELECT 1 FROM installation WHERE id = 1').get());
}

export function createHousehold(database: Database.Database, config: Config, userId: string, name: string) {
  return database.transaction(() => {
    if (!isFirstAdmin(database, userId, config)) return { error: 'forbidden' } as const;
    if (isInitialized(database)) return { error: 'already_initialized' } as const;
    const household: Household = { id: randomUUID(), name, role: 'administrator' };
    database.prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
      .run(household.id, name, new Date().toISOString());
    database.prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
      .run(household.id, userId, household.role);
    database.prepare('INSERT INTO installation (id, householdId) VALUES (1, ?)').run(household.id);
    return { household };
  }).immediate();
}
