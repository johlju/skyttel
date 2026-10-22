import {
  type ClientAddressPolicy,
  clientAddressHeader,
  trustedPeerList,
} from './client-address.js';

export type Provider = 'google' | 'microsoft';

export type AuthorityFence = {
  generation: string;
  restore?: { fromGeneration: string; confirmedAt: number; erasureReviewed: true };
};

export const authorityGenerationPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export function validAuthorityFence(fence: AuthorityFence | undefined) {
  if (!fence || !authorityGenerationPattern.test(fence.generation)) return false;
  const restore = fence.restore;
  return (
    !restore ||
    ((restore.fromGeneration === 'legacy' ||
      authorityGenerationPattern.test(restore.fromGeneration)) &&
      restore.fromGeneration !== fence.generation &&
      restore.erasureReviewed === true &&
      Number.isSafeInteger(restore.confirmedAt) &&
      restore.confirmedAt > 0 &&
      restore.confirmedAt <= Date.now())
  );
}

export interface Config {
  clientAddress: ClientAddressPolicy;
  origin: string;
  databasePath: string;
  firstAdmin: { provider: Provider; subject: string };
  authSecret: string;
  authorityFence: AuthorityFence;
  google: { clientId: string; clientSecret: string };
  microsoft: { clientId: string; clientSecret: string };
  port: number;
  host: string;
  openaiApiKey?: string;
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
  if (
    url.origin !== origin ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
  ) {
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

  const generation = required('SKYTTEL_AUTHORITY_GENERATION');
  if (!authorityGenerationPattern.test(generation))
    throw new ConfigurationError('SKYTTEL_AUTHORITY_GENERATION');
  const authorityFence: AuthorityFence = { generation };
  if (
    environment.SKYTTEL_RESTORE_FROM_GENERATION !== undefined ||
    environment.SKYTTEL_RESTORE_CONFIRMED_AT !== undefined ||
    environment.SKYTTEL_RESTORE_ERASURE_REVIEWED !== undefined
  ) {
    const fromGeneration = required('SKYTTEL_RESTORE_FROM_GENERATION');
    if (
      (fromGeneration !== 'legacy' && !authorityGenerationPattern.test(fromGeneration)) ||
      fromGeneration === generation
    )
      throw new ConfigurationError('SKYTTEL_RESTORE_FROM_GENERATION');
    const declaredAt = required('SKYTTEL_RESTORE_CONFIRMED_AT');
    const confirmedAt = Date.parse(declaredAt);
    if (!Number.isFinite(confirmedAt) || confirmedAt <= 0 || confirmedAt > Date.now())
      throw new ConfigurationError('SKYTTEL_RESTORE_CONFIRMED_AT');
    if (required('SKYTTEL_RESTORE_ERASURE_REVIEWED') !== 'true')
      throw new ConfigurationError('SKYTTEL_RESTORE_ERASURE_REVIEWED');
    authorityFence.restore = { fromGeneration, confirmedAt, erasureReviewed: true };
  }

  return {
    clientAddress: readClientAddressPolicy(environment),
    origin,
    databasePath,
    firstAdmin: { provider, subject: required('SKYTTEL_FIRST_ADMIN_SUBJECT') },
    authSecret,
    authorityFence,
    google: {
      clientId: required('GOOGLE_CLIENT_ID'),
      clientSecret: required('GOOGLE_CLIENT_SECRET'),
    },
    microsoft: {
      clientId: required('MICROSOFT_CLIENT_ID'),
      clientSecret: required('MICROSOFT_CLIENT_SECRET'),
    },
    port,
    host: environment.HOST ?? '0.0.0.0',
    openaiApiKey: environment.OPENAI_API_KEY || undefined,
  };
}

function readClientAddressPolicy(environment: NodeJS.ProcessEnv): ClientAddressPolicy {
  const mode =
    environment.SKYTTEL_CLIENT_ADDRESS_MODE ??
    (environment.NODE_ENV === 'production' ? undefined : 'direct');
  const header = environment.SKYTTEL_CLIENT_ADDRESS_HEADER;
  const trust = environment.SKYTTEL_CLIENT_ADDRESS_TRUST;
  const declaredPeers = environment.SKYTTEL_CLIENT_ADDRESS_PEERS;
  if (mode !== 'direct' && mode !== 'header')
    throw new ConfigurationError('SKYTTEL_CLIENT_ADDRESS_MODE');
  if (mode === 'direct') {
    for (const key of [
      'SKYTTEL_CLIENT_ADDRESS_HEADER',
      'SKYTTEL_CLIENT_ADDRESS_TRUST',
      'SKYTTEL_CLIENT_ADDRESS_PEERS',
    ])
      if (environment[key] !== undefined) throw new ConfigurationError(key);
    return { mode };
  }
  if (
    !header ||
    !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(header) ||
    header.toLowerCase() === clientAddressHeader
  )
    throw new ConfigurationError('SKYTTEL_CLIENT_ADDRESS_HEADER');
  if (trust !== 'peers' && trust !== 'protected-origin')
    throw new ConfigurationError('SKYTTEL_CLIENT_ADDRESS_TRUST');
  if (trust === 'protected-origin') {
    if (declaredPeers !== undefined) throw new ConfigurationError('SKYTTEL_CLIENT_ADDRESS_PEERS');
    return { mode, header: header.toLowerCase(), trust };
  }
  const peers = declaredPeers?.split(',').map((peer) => peer.trim());
  if (!peers?.length) throw new ConfigurationError('SKYTTEL_CLIENT_ADDRESS_PEERS');
  try {
    trustedPeerList(peers);
  } catch {
    throw new ConfigurationError('SKYTTEL_CLIENT_ADDRESS_PEERS');
  }
  return { mode, header: header.toLowerCase(), trust, peers };
}
