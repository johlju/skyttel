import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer as createHttpsServer } from 'node:https';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ServerType, serve } from '@hono/node-server';
import { seedDemo } from '../../scripts/seeds/demo.js';
import { createApp } from '../../src/server/app.js';
import { createAuth, verifyAuthSchema } from '../../src/server/auth.js';
import { clientAddressBoundary } from '../../src/server/client-address.js';
import type { Config } from '../../src/server/config.js';
import { openDatabase } from '../../src/server/database.js';
import { adoptLegacyInstallationAuthority } from '../../src/server/legacy-login-upgrade.js';
import type { LiveSidebandFactory, LiveUsage } from '../../src/server/live-provider.js';
import { attachTaskDelivery } from '../../src/server/task-delivery-transport.js';
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
    consentTextVersion?: number;
    assistantDispatch?: Parameters<typeof createApp>[0]['assistantDispatch'];
    modelProfile?: Parameters<typeof createApp>[0]['modelProfile'];
    liveProfile?: Parameters<typeof createApp>[0]['liveProfile'];
    observe?: Parameters<typeof createApp>[0]['observe'];
    https?: boolean;
    now?: () => number;
    deliverResponse?: (request: Request, response: Response) => Response | Promise<Response>;
    authorityFence?: Config['authorityFence'];
    clientAddress?: Config['clientAddress'];
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'skyttel-test-'));
  let tls: { key: Buffer; cert: Buffer } | undefined;
  if (databaseOptions.https) {
    const key = join(directory, 'tls.key');
    const certificate = join(directory, 'tls.crt');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        key,
        '-out',
        certificate,
        '-days',
        '1',
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=IP:127.0.0.1,DNS:localhost',
      ],
      { stdio: 'ignore' },
    );
    tls = { key: readFileSync(key), cert: readFileSync(certificate) };
  }
  const config: Config = {
    clientAddress: databaseOptions.clientAddress ?? { mode: 'direct' },
    origin: 'http://127.0.0.1',
    databasePath: databaseOptions.databasePath ?? join(directory, 'skyttel.db'),
    firstAdmin,
    authSecret: 'synthetic-test-secret-with-at-least-32-characters',
    authorityFence: databaseOptions.authorityFence ?? {
      generation: '11111111-1111-4111-8111-111111111111',
    },
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
  let providerPause: { entered: () => void; wait: Promise<void> } | undefined;
  let database: ReturnType<typeof openDatabase>;
  let server: ServerType;
  const sockets = new Set<Socket>();
  let activeRequests = 0;
  let drainConnections: (() => void) | undefined;
  let closeApp: () => Promise<void>;
  let summarizeForEvaluation: ReturnType<typeof createApp>['summarizeForEvaluation'];
  let handle: (request: Request) => Response | Promise<Response> = () =>
    new Response(null, { status: 503 });
  async function start() {
    server = serve({
      fetch: clientAddressBoundary(config.clientAddress, (request) => handle(request)),
      hostname: config.host,
      port: config.port,
      ...(tls ? { createServer: createHttpsServer, serverOptions: tls } : {}),
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    server.prependListener('request', (_request, response) => {
      activeRequests++;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        activeRequests--;
        drainConnections?.();
      };
      response.once('finish', finish);
      response.once('close', finish);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No test address');
    config.port = address.port;
    config.origin = `${tls ? 'https' : 'http'}://127.0.0.1:${address.port}`;
    database = openDatabase(config.databasePath, databaseOptions);
    const hasAuthority = database
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'installation_authority'",
      )
      .get();
    // Historical migration exercises explicitly use their historical factory.
    // The production factory always requires the current authority barrier.
    const auth =
      hasAuthority && !databaseOptions.legacyAuthCallbacks
        ? createAuth(config, database)
        : legacyAuth(config, database);
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
        const selected = identity;
        const pause = providerPause;
        providerPause = undefined;
        if (pause) {
          pause.entered();
          await pause.wait;
        }
        const profile = {
          sub: selected.subject,
          oid: selected.subject,
          name: selected.name,
          email: selected.email,
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
      modelProfile: databaseOptions.modelProfile,
      liveProfile: databaseOptions.liveProfile,
      observe: databaseOptions.observe,
      consentTextVersion: databaseOptions.consentTextVersion,
      now: databaseOptions.now,
    });
    closeApp = app.close;
    attachTaskDelivery(server, config.origin, app.prepareTaskDelivery);
    summarizeForEvaluation = app.summarizeForEvaluation;
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
      return databaseOptions.deliverResponse
        ? databaseOptions.deliverResponse(request, response)
        : response;
    };
  }
  async function stop() {
    await closeApp();
    await new Promise<void>((resolve, reject) => {
      drainConnections = () => {
        // Unused browser preconnections do not participate in HTTP draining.
        // Let admitted responses finish before releasing the remaining sockets,
        // including upgraded WebSockets, and closing the fixture's database.
        for (const socket of sockets)
          if (activeRequests === 0 || socket.bytesRead === 0) socket.destroy();
      };
      server.close((error) => {
        drainConnections = undefined;
        if (error) reject(error);
        else resolve();
      });
      // Stop accepting first so no new connection can race this cleanup.
      drainConnections();
    });
    database.close();
  }
  await start();
  return {
    origin: config.origin,
    fetch: (request: Request) => handle(request),
    summarizeForEvaluation: (...args: Parameters<typeof summarizeForEvaluation>) =>
      summarizeForEvaluation(...args),
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
    pauseNextProvider() {
      let entered: () => void = () => {};
      let resume: () => void = () => {};
      const reached = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const wait = new Promise<void>((resolve) => {
        resume = resolve;
      });
      providerPause = { entered, wait };
      return { reached, resume };
    },
    failProvider(value: boolean) {
      providerFails = value;
    },
    denyConsent(value: boolean) {
      consentDenied = value;
    },
    setConversationAvailable(value: boolean) {
      config.openaiApiKey = value ? 'synthetic-model-key' : undefined;
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
    // A controlled operator action: stop every old connection, restore a real
    // SQLite backup, and supply host configuration that is outside that copy.
    async restoreDatabase(source: string, authorityFence: Config['authorityFence']) {
      await stop();
      await copyFile(source, config.databasePath);
      config.authorityFence = authorityFence;
      await start();
    },
    async upgradeLegacyLogin() {
      // Explicit operator maintenance, never an automatic fixture startup step.
      await stop();
      const upgraded = openDatabase(config.databasePath, databaseOptions);
      try {
        adoptLegacyInstallationAuthority(upgraded, config.authorityFence.generation);
      } finally {
        upgraded.close();
      }
      databaseOptions.legacyAuthCallbacks = false;
      await start();
    },
    async close() {
      await stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
