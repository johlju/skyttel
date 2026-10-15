import { statSync } from 'node:fs';
import { ConfigurationError, readConfig } from './config.js';
import { DatabaseInitializationError, openDatabase } from './database.js';
import { adoptLegacyInstallationAuthority } from './legacy-login-upgrade.js';

let database: ReturnType<typeof openDatabase> | undefined;
try {
  const flags = process.argv.slice(2);
  if (
    flags.length !== 2 ||
    !flags.includes('--confirm-legacy-upgrade') ||
    !flags.includes('--confirm-service-stopped')
  )
    throw new Error('legacy_login_upgrade_confirmation_required');
  const config = readConfig();
  if (config.authorityFence.restore)
    throw new Error('legacy_login_upgrade_restore_declaration_refused');
  const existing = statSync(config.databasePath);
  if (!existing.isFile() || existing.size === 0)
    throw new Error('legacy_login_upgrade_requires_existing_database');
  database = openDatabase(config.databasePath);
  adoptLegacyInstallationAuthority(database, config.authorityFence.generation);
  console.info(JSON.stringify({ event: 'legacy_login_upgrade_completed' }));
} catch (error) {
  console.error(
    JSON.stringify(
      error instanceof ConfigurationError
        ? { event: 'configuration_invalid', variable: error.variable }
        : error instanceof DatabaseInitializationError
          ? { event: 'database_initialization_failed', reason: error.reason }
          : { event: 'legacy_login_upgrade_failed' },
    ),
  );
  process.exitCode = 1;
} finally {
  database?.close();
}
