export type Provider = 'google' | 'microsoft';

export interface Config {
  origin: string;
  databasePath: string;
  firstAdmin: { provider: Provider; subject: string };
  authSecret: string;
  google: { clientId: string; clientSecret: string };
  microsoft: { clientId: string; clientSecret: string };
  port: number;
  host: string;
}

export class ConfigurationError extends Error {
  constructor(readonly variable: string) {
    super(`Invalid or missing configuration: ${variable}`);
  }
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): Config {
  const required = (key: string) => {
    const value = environment[key];
    if (!value || value.trim() !== value) throw new ConfigurationError(key);
    return value;
  };
  const origin = required('SKYTTEL_ORIGIN');
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new ConfigurationError('SKYTTEL_ORIGIN');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new ConfigurationError('SKYTTEL_ORIGIN');
  }
  const provider = required('SKYTTEL_FIRST_ADMIN_PROVIDER');
  if (provider !== 'google' && provider !== 'microsoft') {
    throw new ConfigurationError('SKYTTEL_FIRST_ADMIN_PROVIDER');
  }
  const authSecret = required('BETTER_AUTH_SECRET');
  if (authSecret.length < 32) throw new ConfigurationError('BETTER_AUTH_SECRET');
  const port = Number(environment.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigurationError('PORT');
  const databasePath = required('SKYTTEL_DATABASE_PATH');
  if (databasePath === ':memory:') throw new ConfigurationError('SKYTTEL_DATABASE_PATH');

  return {
    origin,
    databasePath,
    firstAdmin: { provider, subject: required('SKYTTEL_FIRST_ADMIN_SUBJECT') },
    authSecret,
    google: { clientId: required('GOOGLE_CLIENT_ID'), clientSecret: required('GOOGLE_CLIENT_SECRET') },
    microsoft: { clientId: required('MICROSOFT_CLIENT_ID'), clientSecret: required('MICROSOFT_CLIENT_SECRET') },
    port,
    host: environment.HOST ?? '0.0.0.0',
  };
}
