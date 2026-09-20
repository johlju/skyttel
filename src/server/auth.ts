import { createHash } from 'node:crypto';
import { betterAuth } from 'better-auth';
import type Database from 'better-sqlite3';
import type { Config } from './config.js';

export function internalEmail(provider: 'google' | 'microsoft', subject: unknown) {
  if (typeof subject !== 'string' || subject.trim().length === 0) {
    throw new Error('invalid_provider_identity');
  }
  // Better Auth requires a unique email. A contact address must neither merge
  // identities nor let an earlier sign-in reserve another identity's user.
  const key = createHash('sha256')
    .update(JSON.stringify([provider, subject]))
    .digest('hex');
  return { email: `${key}@identity.skyttel.invalid`, emailVerified: false };
}

export function createAuth(config: Config, database: Database.Database) {
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
    account: {
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
    },
    socialProviders: {
      google: {
        ...config.google,
        prompt: 'select_account',
        mapProfileToUser: (profile) => internalEmail('google', profile.sub),
      },
      microsoft: {
        ...config.microsoft,
        tenantId: 'common',
        prompt: 'select_account',
        disableDefaultScope: true,
        scope: ['openid', 'profile', 'email'],
        disableProfilePhoto: true,
        mapProfileToUser: (profile) => internalEmail('microsoft', profile.oid),
      },
    },
    advanced: { disableOriginCheck: false, database: { generateId: 'uuid' } },
    onAPIError: { errorURL: `${config.origin}/?authError=1` },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export async function verifyAuthSchema(auth: Auth) {
  const context = await auth.$context;
  await context.checkSchema?.();
}
