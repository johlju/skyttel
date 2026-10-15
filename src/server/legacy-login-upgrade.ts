import type Database from 'better-sqlite3';
import { hasInstallationState, invalidateInstallationAuthority } from './installation-authority.js';

/** Run only while the installation is stopped, before its first fenced start. */
export function adoptLegacyInstallationAuthority(database: Database.Database, generation: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(generation))
    throw new Error('invalid_authority_generation');
  database
    .transaction(() => {
      if (database.prepare('SELECT 1 FROM installation_authority').get())
        throw new Error('legacy_login_upgrade_already_applied');
      if (!hasInstallationState(database))
        throw new Error('legacy_login_upgrade_requires_existing_installation');
      invalidateInstallationAuthority(database);
      database
        .prepare('INSERT INTO installation_authority (id, generation) VALUES (1, ?)')
        .run(generation);
    })
    .exclusive();
}
