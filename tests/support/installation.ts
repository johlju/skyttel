import { serve, type ServerType } from '@hono/node-server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app.js';
import { createAuth, verifyAuthSchema } from '../../src/server/auth.js';
import { openDatabase } from '../../src/server/database.js';
import type { Config } from '../../src/server/config.js';

export type Identity = {
  subject: string;
  name: string;
  email: string;
};

export const alex: Identity = { subject: 'alex-google', name: 'Alex Exempel', email: 'alex@example.test' };
export const robin: Identity = { subject: 'robin-microsoft', name: 'Robin Exempel', email: 'robin@example.test' };

export async function createInstallation(firstAdmin = { provider: 'google' as 'google' | 'microsoft', subject: alex.subject }) {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-test-'));
  const config: Config = {
    origin: 'http://127.0.0.1',
    databasePath: join(directory, 'skyttel.db'),
    firstAdmin,
    authSecret: 'synthetic-test-secret-with-at-least-32-characters',
    google: { clientId: 'fake-google', clientSecret: 'fake-secret' },
    microsoft: { clientId: 'fake-microsoft', clientSecret: 'fake-secret' },
    port: 0,
    host: '127.0.0.1',
  };
  let identity = alex;
  let providerFails = false;
  let consentDenied = false;
  let database: ReturnType<typeof openDatabase>;
  let server: ServerType;
  async function start() {
    let handle: (request: Request) => Response | Promise<Response> = () => new Response(null, { status: 503 });
    server = serve({ fetch: (request) => handle(request), hostname: config.host, port: config.port });
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test address');
    config.port = address.port;
    config.origin = `http://127.0.0.1:${address.port}`;
    database = openDatabase(config.databasePath);
    const auth = createAuth(config, database);
    await verifyAuthSchema(auth);
    const context = await auth.$context;
    for (const provider of context.socialProviders) {
      // Only the external provider is replaced. Better Auth still processes
      // state, callbacks, account binding and real persistent sessions.
      provider.createAuthorizationURL = async ({ state, redirectURI }) => {
        const callback = new URL(redirectURI);
        callback.searchParams.set('state', state);
        if (consentDenied) callback.searchParams.set('error', 'access_denied');
        else callback.searchParams.set('code', 'synthetic-authorization-code');
        return callback;
      };
      provider.validateAuthorizationCode = async () => {
        if (providerFails) throw new Error('Synthetic provider outage');
        return { accessToken: 'synthetic-provider-token', tokenType: 'bearer' };
      };
      provider.getUserInfo = async () => {
        const profile = {
          sub: identity.subject, oid: identity.subject,
          name: identity.name, email: identity.email, email_verified: true,
        };
        // Preserve the application's profile mapping while substituting only
        // the provider response, as the real provider adapter does.
        const mapped = await provider.options?.mapProfileToUser?.(profile);
        return {
          user: { name: profile.name, email: profile.email, emailVerified: true, ...mapped },
          data: profile,
        };
      };
    }
    handle = createApp({ config, database, auth }).fetch;
  }
  async function stop() {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    database.close();
  }
  await start();
  return {
    origin: config.origin,
    directory,
    setIdentity(value: Identity) { identity = value; },
    failProvider(value: boolean) { providerFails = value; },
    denyConsent(value: boolean) { consentDenied = value; },
    // Arrangement for access scenarios whose administration UI is a later issue.
    seedMembership(userId: string, householdId: string, name: string) {
      database.transaction(() => {
        database.prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
          .run(householdId, name, '2026-01-01T00:00:00Z');
        database.prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
          .run(householdId, userId, 'member');
      })();
    },
    revokeMembership(userId: string) {
      database.prepare('DELETE FROM membership WHERE userId = ?').run(userId);
    },
    async saveDatabase(destination: string) { await database.backup(destination); },
    async restart() { await stop(); await start(); },
    async close() {
      await stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
