import { ConfigurationError, readConfig } from '../src/server/config.js';
import { DatabaseInitializationError, openDatabase } from '../src/server/database.js';
import { seedDemo } from './seeds/demo.js';

let database: ReturnType<typeof openDatabase> | undefined;
let failure =
  'Development configuration could not be loaded. Set SKYTTEL_DEV_ENV_FILE to your private environment file; see docs/development/devcontainer.md.';
try {
  process.loadEnvFile(process.env.SKYTTEL_DEV_ENV_FILE ?? '.devcontainer/.env');
  if (process.env.NODE_ENV === 'production') {
    failure = 'db:setup is for development and cannot run with NODE_ENV=production.';
    throw new Error('production_reset_refused');
  }
  const config = readConfig();
  if (['synthetic-first-administrator', 'not-configured'].includes(config.firstAdmin.subject)) {
    throw new ConfigurationError('SKYTTEL_FIRST_ADMIN_SUBJECT');
  }
  failure = 'Database setup failed. Check database access and the demo fixtures.';
  database = openDatabase(config.databasePath);
  const connection = database;
  const household = connection
    .transaction(() => {
      // Deferral allows any table order, including installation's restrictive FK.
      // Keep the file and migration history so open server connections stay valid.
      connection.pragma('defer_foreign_keys = ON');
      const tables = connection
        .prepare<[], { name: string }>(
          `SELECT name FROM sqlite_schema
         WHERE type = 'table' AND name != 'schema_migration' AND name NOT GLOB 'sqlite_*'`,
        )
        .all();
      for (const { name } of tables) {
        connection.exec(`DELETE FROM "${name.replaceAll('"', '""')}"`);
      }
      return seedDemo(connection, config);
    })
    .immediate();
  console.log(`Development database reset and seeded with ${household.name}.`);
  console.log('Start npm run dev:all and sign in with the configured first administrator.');
} catch (error) {
  console.error(
    error instanceof ConfigurationError
      ? error.message
      : error instanceof DatabaseInitializationError
        ? `Database setup failed: ${error.reason}.`
        : failure,
  );
  process.exitCode = 1;
} finally {
  database?.close();
}
