import { betterAuth } from 'better-auth';
import type Database from 'better-sqlite3';
import { type Auth, internalEmail } from '../../src/server/auth.js';
import type { Config } from '../../src/server/config.js';

// Historical sign-in-only provider for arranging databases from before OAuth.
// Production always uses createAuth and verifies the complete current schema.
export function legacyAuth(config: Config, database: Database.Database): Auth {
  return betterAuth({
    appName: 'Skyttel',
    baseURL: config.origin,
    basePath: '/api/auth',
    secret: config.authSecret,
    database,
    trustedOrigins: [config.origin],
    logger: { disabled: true },
    telemetry: { enabled: false },
    session: { cookieCache: { enabled: false } },
    socialProviders: {
      google: {
        ...config.google,
        mapProfileToUser: (profile) => internalEmail('google', profile.sub),
      },
      microsoft: {
        ...config.microsoft,
        mapProfileToUser: (profile) => internalEmail('microsoft', profile.oid),
      },
    },
    advanced: { database: { generateId: 'uuid' } },
  }) as unknown as Auth;
}
