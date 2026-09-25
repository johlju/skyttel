import { ConfigurationError, readConfig } from '../src/server/config.js';
import { DatabaseInitializationError, openDatabase } from '../src/server/database.js';

let database: ReturnType<typeof openDatabase> | undefined;
let failure =
  'Development configuration could not be loaded. Set SKYTTEL_DEV_ENV_FILE to your private environment file; see docs/development/devcontainer.md.';
try {
  process.loadEnvFile(process.env.SKYTTEL_DEV_ENV_FILE ?? '.devcontainer/.env');
  if (process.env.NODE_ENV === 'production') {
    failure = 'db:migrate is for development and cannot run with NODE_ENV=production.';
    throw new Error('production_migration_refused');
  }
  const config = readConfig();
  failure = 'Development database migration failed. Check database access and migration files.';
  database = openDatabase(config.databasePath);
  console.log('Development database migrations applied; existing application data retained.');
} catch (error) {
  console.error(
    error instanceof ConfigurationError
      ? error.message
      : error instanceof DatabaseInitializationError
        ? `Development database migration failed: ${error.reason}.`
        : failure,
  );
  process.exitCode = 1;
} finally {
  database?.close();
}
