import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { internalEmail } from '../../src/server/auth.js';
import type { Config } from '../../src/server/config.js';
import { createHousehold } from '../../src/server/households.js';
import { householdMap } from '../../src/server/map.js';

// Add new demo data here, or call additional fixture modules from this function.
// The setup command wraps all fixtures in the same transaction as the reset.
export function seedDemo(database: Database.Database, config: Config) {
  const administratorId = randomUUID();
  const now = Date.now();
  const { provider, subject } = config.firstAdmin;
  const { email } = internalEmail(provider, subject);
  database
    .prepare('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(administratorId, 'Development administrator', email, now, now);
  database
    .prepare(
      `INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), subject, provider, administratorId, now, now);
  const result = createHousehold(database, config, administratorId, 'TestHousehold');
  if ('error' in result) throw new Error('demo_household_setup_failed');
  const map = householdMap(database, administratorId, result.household.id);
  const typeId = map.read().types[0].id;
  const id = randomUUID();
  map.propose({
    version: 0,
    id,
    baseRevision: null,
    value: { typeId, name: 'Lo Exempel', description: 'Påhittad person för att prova kartan.' },
  });
  map.save({ version: 1, operationId: randomUUID() });
  map.propose({
    version: 2,
    id,
    baseRevision: 1,
    value: {
      typeId,
      name: 'Lo Lind',
      description: 'Påhittad rättelse. Granska och välj att spara eller kasta hela utkastet.',
    },
  });
  return result.household;
}
