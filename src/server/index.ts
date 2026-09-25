import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { createAuth, verifyAuthSchema } from './auth.js';
import { ConfigurationError, readConfig } from './config.js';
import { DatabaseInitializationError, openDatabase } from './database.js';

async function main() {
  const config = readConfig();
  const database = openDatabase(config.databasePath);
  try {
    const auth = createAuth(config, database);
    await verifyAuthSchema(auth);
    const app = createApp({ config, database, auth });
    const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, () => {
      console.info(JSON.stringify({ event: 'server_ready' }));
    });
    server.on('error', async () => {
      console.error(JSON.stringify({ event: 'listener_failed' }));
      await app.close();
      database.close();
      process.exitCode = 1;
    });
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      server.close(async () => {
        await app.close();
        database.close();
        process.exitCode = 0;
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  } catch (error) {
    database.close();
    throw error;
  }
}

main().catch((error: unknown) => {
  const status =
    error instanceof ConfigurationError
      ? { event: 'configuration_invalid', variable: error.variable }
      : error instanceof DatabaseInitializationError
        ? { event: 'database_initialization_failed', reason: error.reason }
        : { event: 'startup_failed' };
  console.error(JSON.stringify(status));
  process.exitCode = 1;
});
