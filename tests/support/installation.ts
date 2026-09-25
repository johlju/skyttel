import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ServerType, serve } from '@hono/node-server';
import { seedDemo } from '../../scripts/seeds/demo.js';
import { createApp } from '../../src/server/app.js';
import { createAuth, verifyAuthSchema } from '../../src/server/auth.js';
import type { Config } from '../../src/server/config.js';
import { openDatabase } from '../../src/server/database.js';
import type { LiveSidebandFactory, LiveUsage } from '../../src/server/live-provider.js';
import type { TextModelUsage } from '../../src/server/text-assistant-model.js';
import { seedLargeMap } from './large-map.js';
import { legacyAuth } from './legacy-auth.js';

export type Identity = {
  subject: string;
  name: string;
  email: string;
};

export const alex: Identity = {
  subject: 'alex-google',
  name: 'Alex Exempel',
  email: 'alex@example.test',
};
export const robin: Identity = {
  subject: 'robin-microsoft',
  name: 'Robin Exempel',
  email: 'robin@example.test',
};

export async function createInstallation(
  firstAdmin = { provider: 'google' as 'google' | 'microsoft', subject: alex.subject },
  databaseOptions: {
    migrationsDirectory?: string;
    legacyAuthCallbacks?: boolean;
    databasePath?: string;
    modelFetch?: typeof fetch;
    providerApiKey?: string;
    modelUsage?: TextModelUsage;
    liveFetch?: typeof fetch;
    liveSideband?: LiveSidebandFactory;
    liveUsage?: LiveUsage;
    browserProviderScript?: string;
    assistantDispatch?: Parameters<typeof createApp>[0]['assistantDispatch'];
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-test-'));
  const config: Config = {
    origin: 'http://127.0.0.1',
    databasePath: databaseOptions.databasePath ?? join(directory, 'skyttel.db'),
    firstAdmin,
    authSecret: 'synthetic-test-secret-with-at-least-32-characters',
    google: { clientId: 'fake-google', clientSecret: 'fake-secret' },
    microsoft: { clientId: 'fake-microsoft', clientSecret: 'fake-secret' },
    port: 0,
    host: '127.0.0.1',
    ...(databaseOptions.providerApiKey
      ? { openaiApiKey: databaseOptions.providerApiKey }
      : databaseOptions.modelFetch
        ? { openaiApiKey: 'synthetic-model-key' }
        : {}),
  };
  let identity = alex;
  let providerFails = false;
  let consentDenied = false;
  let database: ReturnType<typeof openDatabase>;
  let server: ServerType;
  let closeApp: () => Promise<void>;
  let handle: (request: Request) => Response | Promise<Response> = () =>
    new Response(null, { status: 503 });
  async function start() {
    server = serve({
      fetch: (request) => handle(request),
      hostname: config.host,
      port: config.port,
    });
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test address');
    config.port = address.port;
    config.origin = `http://127.0.0.1:${address.port}`;
    database = openDatabase(config.databasePath, databaseOptions);
    const hasOAuth = database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'oauthClient'")
      .get();
    const auth = hasOAuth ? createAuth(config, database) : legacyAuth(config, database);
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
          sub: identity.subject,
          oid: identity.subject,
          name: identity.name,
          email: identity.email,
          email_verified: true,
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
    const app = createApp({
      config,
      database,
      auth,
      modelFetch: databaseOptions.modelFetch,
      modelUsage: databaseOptions.modelUsage,
      liveFetch: databaseOptions.liveFetch,
      liveSideband: databaseOptions.liveSideband,
      liveUsage: databaseOptions.liveUsage,
      assistantDispatch: databaseOptions.assistantDispatch,
    });
    closeApp = app.close;
    handle = async (request) => {
      // Model the original login-only callback while arranging a legacy
      // installation. Production always applies all migrations before serving.
      if (
        databaseOptions.legacyAuthCallbacks &&
        new URL(request.url).pathname.startsWith('/api/auth/callback/')
      )
        return auth.handler(request);
      // Disposable browser-provider substitution only. Production has no asset,
      // HTML alteration or switch for this controlled microphone/WebRTC seam.
      const script = databaseOptions.browserProviderScript;
      const scriptPath = '/assets/manual-voice-provider.js';
      if (script && request.method === 'GET' && new URL(request.url).pathname === scriptPath)
        return new Response(script, {
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      const response = await app.fetch(request);
      if (
        script &&
        response.status === 200 &&
        response.headers.get('Content-Type')?.includes('text/html')
      ) {
        const headers = new Headers(response.headers);
        headers.delete('Content-Length');
        headers.delete('ETag');
        return new Response(
          (await response.text()).replace('<head>', `<head><script src="${scriptPath}"></script>`),
          {
            status: response.status,
            headers,
          },
        );
      }
      return response;
    };
  }
  async function stop() {
    await new Promise<void>((resolve, reject) => {
      // Requests already in flight can become idle after close() performs
      // its initial idle-connection sweep. Drain those too, so an open
      // browser's access polling cannot keep fixture shutdown alive.
      const drain = setInterval(() => {
        if ('closeIdleConnections' in server) server.closeIdleConnections();
      }, 25);
      server.close((error) => {
        clearInterval(drain);
        if (error) reject(error);
        else resolve();
      });
    });
    await closeApp();
    database.close();
  }
  await start();
  return {
    origin: config.origin,
    fetch: (request: Request) => handle(request),
    seedDemo() {
      return seedDemo(database, config);
    },
    seedLargeMap(userId: string, householdId: string) {
      seedLargeMap(database, userId, householdId);
    },
    directory,
    setIdentity(value: Identity) {
      identity = value;
    },
    failProvider(value: boolean) {
      providerFails = value;
    },
    denyConsent(value: boolean) {
      consentDenied = value;
    },
    // Arrange another household on the same installation for boundary checks.
    seedMembership(userId: string, householdId: string, name: string, role = 'member') {
      database.transaction(() => {
        database
          .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
          .run(householdId, name, '2026-01-01T00:00:00Z');
        database
          .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
          .run(householdId, userId, role);
      })();
    },
    revokeMembership(userId: string) {
      database.prepare('DELETE FROM membership WHERE userId = ?').run(userId);
    },
    async saveDatabase(destination: string) {
      await database.backup(destination);
    },
    async restart() {
      await stop();
      await start();
    },
    async close() {
      await stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
