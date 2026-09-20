import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../../src/server/app.js';
import { createAuth, verifyAuthSchema } from '../../../src/server/auth.js';
import { readConfig } from '../../../src/server/config.js';
import { openDatabase } from '../../../src/server/database.js';

export function configurationEnvironment(databasePath = '/synthetic/skyttel.sqlite') {
  return {
    SKYTTEL_ORIGIN: 'http://localhost:3000',
    SKYTTEL_DATABASE_PATH: databasePath,
    SKYTTEL_FIRST_ADMIN_PROVIDER: 'google',
    SKYTTEL_FIRST_ADMIN_SUBJECT: 'synthetic-admin',
    BETTER_AUTH_SECRET: 'synthetic-unit-test-secret-at-least-32-characters',
    GOOGLE_CLIENT_ID: 'synthetic-google',
    GOOGLE_CLIENT_SECRET: 'synthetic-secret',
    MICROSOFT_CLIENT_ID: 'synthetic-microsoft',
    MICROSOFT_CLIENT_SECRET: 'synthetic-secret',
  };
}

export async function applicationFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-unit-'));
  const config = readConfig(configurationEnvironment(join(directory, 'skyttel.sqlite')));
  const database = openDatabase(config.databasePath);
  const auth = createAuth(config, database);
  await verifyAuthSchema(auth);
  let subject: unknown = config.firstAdmin.subject;
  let providerFails = false;
  let providerPause: { entered: () => void; wait: Promise<void> } | undefined;
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
  const app = createApp({ config, database, auth });
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
    async function json(path: string, body: unknown) {
      return request(path, {
        method: 'POST',
        headers: { origin: config.origin, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    return {
      request,
      json,
      async signIn(provider = 'google') {
        const response = await json('/api/auth/sign-in/social', { provider, callbackURL: '/' });
        const result = (await response.json()) as { url: string };
        return request(result.url);
      },
    };
  }
  return {
    config,
    database,
    auth,
    app,
    client,
    setSubject(value: unknown) {
      subject = value;
    },
    failProvider() {
      providerFails = true;
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
      if (database.open) database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
