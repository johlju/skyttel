import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../../src/server/app.js';
import { createAuth, verifyAuthSchema } from '../../../src/server/auth.js';
import { readConfig } from '../../../src/server/config.js';
import { openDatabase } from '../../../src/server/database.js';
import { adoptLegacyInstallationAuthority } from '../../../src/server/legacy-login-upgrade.js';
import { legacyAuth } from '../../support/legacy-auth.js';

export function configurationEnvironment(databasePath = '/synthetic/skyttel.sqlite') {
  return {
    SKYTTEL_ORIGIN: 'http://localhost:3000',
    SKYTTEL_DATABASE_PATH: databasePath,
    SKYTTEL_FIRST_ADMIN_PROVIDER: 'google',
    SKYTTEL_FIRST_ADMIN_SUBJECT: 'synthetic-admin',
    BETTER_AUTH_SECRET: 'synthetic-unit-test-secret-at-least-32-characters',
    SKYTTEL_AUTHORITY_GENERATION: '11111111-1111-4111-8111-111111111111',
    GOOGLE_CLIENT_ID: 'synthetic-google',
    GOOGLE_CLIENT_SECRET: 'synthetic-secret',
    MICROSOFT_CLIENT_ID: 'synthetic-microsoft',
    MICROSOFT_CLIENT_SECRET: 'synthetic-secret',
  };
}

export async function applicationFixture({
  migrationsDirectory,
  identity,
  databaseSnapshot,
  now,
  origin,
}: {
  migrationsDirectory?: string;
  identity?: { version: string; commit: string };
  databaseSnapshot?: string;
  now?: () => number;
  origin?: string;
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-unit-'));
  const config = readConfig({
    ...configurationEnvironment(join(directory, 'skyttel.sqlite')),
    ...(origin ? { SKYTTEL_ORIGIN: origin } : {}),
  });
  if (databaseSnapshot) copyFileSync(databaseSnapshot, config.databasePath);
  const database = openDatabase(config.databasePath, { migrationsDirectory });
  const hasAuthority = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'installation_authority'")
    .get();
  let auth = hasAuthority ? createAuth(config, database) : legacyAuth(config, database);
  let subject: unknown = config.firstAdmin.subject;
  let providerFails = false;
  let callbackFailure: 'response' | 'redirect' | undefined;
  let providerPause: { entered: () => void; wait: Promise<void> } | undefined;
  async function configureAuth() {
    await verifyAuthSchema(auth);
    const handleAuth = auth.handler;
    auth.handler = async (request: Request) => {
      const response = await handleAuth(request);
      if (!callbackFailure || !new URL(request.url).pathname.startsWith('/api/auth/callback/'))
        return response;
      const failure = callbackFailure;
      callbackFailure = undefined;
      const headers = new Headers(response.headers);
      if (failure === 'redirect') headers.set('location', `${config.origin}/?authError=1`);
      return new Response(null, { status: failure === 'response' ? 500 : 302, headers });
    };
    const context = await auth.$context;
    for (const provider of context.socialProviders) {
      // Substitute only the external identity provider; authentication and
      // SQLite persistence remain the actual application implementation.
      provider.createAuthorizationURL = async ({ state, redirectURI }) => {
        const callback = new URL(redirectURI);
        callback.searchParams.set('state', state);
        callback.searchParams.set('code', 'synthetic-code');
        return callback;
      };
      provider.validateAuthorizationCode = async () => {
        if (providerPause) {
          providerPause.entered();
          await providerPause.wait;
        }
        if (providerFails) throw new Error('Synthetic provider outage');
        return { accessToken: 'synthetic-token', tokenType: 'bearer' };
      };
      provider.getUserInfo = async () => {
        const profile = {
          sub: subject,
          oid: subject,
          name: 'Alex Exempel',
          email: 'alex@example.test',
        };
        const mapped = await provider.options?.mapProfileToUser?.(profile);
        return {
          user: { name: profile.name, email: profile.email, emailVerified: true, ...mapped },
          data: profile,
        };
      };
    }
  }
  await configureAuth();
  let app = createApp({ config, database, auth, identity, now });
  function client() {
    const cookies = new Map<string, string>();
    async function request(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (cookies.size)
        headers.set('cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '));
      const response = await app.request(new URL(path, config.origin).href, { ...init, headers });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';', 1)[0];
        const separator = pair.indexOf('=');
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
      }
      return response;
    }
    async function json(path: string, body: unknown, headers: Record<string, string> = {}) {
      return request(path, {
        method: 'POST',
        headers: { origin: config.origin, 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    }
    return {
      request,
      json,
      async registerBinding(binding: { cookieName: string; candidate: string }) {
        // The browser writes only this explicit candidate before registration.
        cookies.set(binding.cookieName, binding.candidate);
        return json('/api/browser-binding/register', {});
      },
      async signIn(provider = 'google') {
        if (database.prepare("SELECT 1 FROM sqlite_master WHERE name = 'browser_binding'").get()) {
          const headers: Record<string, string> = identity
            ? { 'X-Skyttel-Build': `${identity.commit}:${identity.version}` }
            : {};
          const candidate = await json('/api/browser-binding/candidate', {}, headers);
          const binding = (await candidate.json()) as { cookieName: string; candidate: string };
          cookies.set(binding.cookieName, binding.candidate);
          await json('/api/browser-binding/register', {}, headers);
        }
        const response = await json('/api/auth/sign-in/social', { provider, callbackURL: '/' });
        const result = (await response.json()) as { url: string };
        return request(result.url);
      },
    };
  }
  return {
    config,
    database,
    get auth() {
      return auth;
    },
    get app() {
      return app;
    },
    async restart() {
      await app.close();
      app = createApp({ config, database, auth, identity, now });
    },
    async upgradeLegacyLogin() {
      // Tests invoke the same stopped-process boundary as the operator command.
      await app.close();
      openDatabase(config.databasePath).close();
      adoptLegacyInstallationAuthority(database, config.authorityFence.generation);
      auth = createAuth(config, database);
      await configureAuth();
      app = createApp({ config, database, auth, identity, now });
    },
    client,
    setSubject(value: unknown) {
      subject = value;
    },
    failProvider() {
      providerFails = true;
    },
    failNextCallbackAfterAuthentication(mode: 'response' | 'redirect') {
      callbackFailure = mode;
    },
    pauseProvider() {
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
    close() {
      // Stop the app's background lifecycle before removing its database.
      void app.close();
      if (database.open) database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
