import { afterEach, describe, expect, test, vi } from 'vitest';
import { ConfigurationError, readConfig } from '../../../src/server/config.js';
import { configurationEnvironment } from './fixture.js';

afterEach(() => vi.unstubAllEnvs());

describe('installation configuration', () => {
  test('diagnostic settings come only from the explicit Skyttel configuration', () => {
    vi.stubEnv('LANGSMITH_API_KEY', 'synthetic-ambient-key');
    vi.stubEnv('SKYTTEL_LANGSMITH_API_KEY', 'synthetic-process-key');
    expect(readConfig(configurationEnvironment()).langSmith).toBeUndefined();
    expect(
      readConfig({
        ...configurationEnvironment(),
        SKYTTEL_LANGSMITH_ENDPOINT: 'https://eu.api.smith.langchain.com',
        SKYTTEL_LANGSMITH_PROJECT: 'synthetic-production',
        SKYTTEL_LANGSMITH_API_KEY: 'synthetic-trace-key',
        SKYTTEL_LANGSMITH_WORKSPACE_ID: 'synthetic-workspace',
      }).langSmith,
    ).toEqual({
      endpoint: 'https://eu.api.smith.langchain.com',
      project: 'synthetic-production',
      apiKey: 'synthetic-trace-key',
      workspaceId: 'synthetic-workspace',
    });
    // Partial/empty configuration must reach the optional boundary as invalid,
    // rather than selecting SDK defaults or blocking household startup.
    expect(
      readConfig({ ...configurationEnvironment(), SKYTTEL_LANGSMITH_API_KEY: '' }).langSmith,
    ).toEqual({ endpoint: '', project: '', apiKey: '', workspaceId: undefined });
  });
  test('requires an explicit client address policy in production and validates ingress trust', () => {
    const environment = { ...configurationEnvironment(), NODE_ENV: 'production' };
    expect(() => readConfig(environment)).toThrow(
      new ConfigurationError('SKYTTEL_CLIENT_ADDRESS_MODE'),
    );
    expect(
      readConfig({ ...environment, SKYTTEL_CLIENT_ADDRESS_MODE: 'direct' }).clientAddress,
    ).toEqual({ mode: 'direct' });
    const ingress = {
      ...environment,
      SKYTTEL_CLIENT_ADDRESS_MODE: 'header',
      SKYTTEL_CLIENT_ADDRESS_HEADER: 'CF-Connecting-IP',
      SKYTTEL_CLIENT_ADDRESS_TRUST: 'peers',
      SKYTTEL_CLIENT_ADDRESS_PEERS: '127.0.0.1/32,2001:db8::/48',
    };
    expect(readConfig(ingress).clientAddress).toEqual({
      mode: 'header',
      header: 'cf-connecting-ip',
      trust: 'peers',
      peers: ['127.0.0.1/32', '2001:db8::/48'],
    });
    for (const [key, value] of [
      ['SKYTTEL_CLIENT_ADDRESS_MODE', 'automatic'],
      ['SKYTTEL_CLIENT_ADDRESS_HEADER', undefined],
      ['SKYTTEL_CLIENT_ADDRESS_HEADER', 'x-skyttel-client-address'],
      ['SKYTTEL_CLIENT_ADDRESS_HEADER', 'bad header'],
      ['SKYTTEL_CLIENT_ADDRESS_TRUST', undefined],
      ['SKYTTEL_CLIENT_ADDRESS_PEERS', ''],
      ['SKYTTEL_CLIENT_ADDRESS_PEERS', '127.0.0.1/33'],
      ['SKYTTEL_CLIENT_ADDRESS_PEERS', '2001:db8::/129'],
      ['SKYTTEL_CLIENT_ADDRESS_PEERS', '127.0.0.1,'],
    ] as const)
      expect(() => readConfig({ ...ingress, [key]: value })).toThrow(new ConfigurationError(key));
    expect(
      readConfig({
        ...ingress,
        SKYTTEL_CLIENT_ADDRESS_TRUST: 'protected-origin',
        SKYTTEL_CLIENT_ADDRESS_PEERS: undefined,
      }).clientAddress,
    ).toEqual({ mode: 'header', header: 'cf-connecting-ip', trust: 'protected-origin' });
    expect(() => readConfig({ ...ingress, SKYTTEL_CLIENT_ADDRESS_MODE: 'direct' })).toThrow(
      new ConfigurationError('SKYTTEL_CLIENT_ADDRESS_HEADER'),
    );
  });
  test('requires a separately managed authority generation and rejects incomplete restore declarations', () => {
    expect(() =>
      readConfig({ ...configurationEnvironment(), SKYTTEL_AUTHORITY_GENERATION: undefined }),
    ).toThrow(new ConfigurationError('SKYTTEL_AUTHORITY_GENERATION'));
    expect(() =>
      readConfig({
        ...configurationEnvironment(),
        SKYTTEL_RESTORE_FROM_GENERATION: '22222222-2222-4222-8222-222222222222',
      }),
    ).toThrow(new ConfigurationError('SKYTTEL_RESTORE_CONFIRMED_AT'));
  });

  test('validates the complete external legacy restore declaration', () => {
    const environment = {
      ...configurationEnvironment(),
      SKYTTEL_RESTORE_FROM_GENERATION: 'legacy',
      SKYTTEL_RESTORE_CONFIRMED_AT: '2026-01-01T00:00:00.000Z',
      SKYTTEL_RESTORE_ERASURE_REVIEWED: 'true',
    };
    expect(readConfig(environment).authorityFence.restore).toEqual({
      fromGeneration: 'legacy',
      confirmedAt: 1767225600000,
      erasureReviewed: true,
    });
    for (const value of [undefined, 'false'])
      expect(() => readConfig({ ...environment, SKYTTEL_RESTORE_ERASURE_REVIEWED: value })).toThrow(
        new ConfigurationError('SKYTTEL_RESTORE_ERASURE_REVIEWED'),
      );
    expect(() =>
      readConfig({ ...environment, SKYTTEL_RESTORE_CONFIRMED_AT: 'not-a-date' }),
    ).toThrow(new ConfigurationError('SKYTTEL_RESTORE_CONFIRMED_AT'));
  });
  test('reads a complete configuration with the default listener', () => {
    expect(readConfig(configurationEnvironment())).toEqual({
      clientAddress: { mode: 'direct' },
      origin: 'http://localhost:3000',
      databasePath: '/synthetic/skyttel.sqlite',
      firstAdmin: { provider: 'google', subject: 'synthetic-admin' },
      authSecret: 'synthetic-unit-test-secret-at-least-32-characters',
      authorityFence: { generation: '11111111-1111-4111-8111-111111111111' },
      google: { clientId: 'synthetic-google', clientSecret: 'synthetic-secret' },
      microsoft: { clientId: 'synthetic-microsoft', clientSecret: 'synthetic-secret' },
      host: '0.0.0.0',
      port: 3000,
    });
  });

  test('supports Microsoft administrators and explicit listener settings', () => {
    expect(
      readConfig({
        ...configurationEnvironment(),
        SKYTTEL_FIRST_ADMIN_PROVIDER: 'microsoft',
        PORT: '3001',
        HOST: '127.0.0.1',
      }),
    ).toMatchObject({ firstAdmin: { provider: 'microsoft' }, port: 3001, host: '127.0.0.1' });
  });

  test('reads the process environment when no explicit environment is supplied', () => {
    for (const [key, value] of Object.entries(configurationEnvironment())) vi.stubEnv(key, value);
    vi.stubEnv('PORT', '4567');
    expect(readConfig().port).toBe(4567);
  });

  test.each(Object.keys(configurationEnvironment()))(
    'identifies missing %s without exposing configured secrets',
    (key) => {
      const environment: NodeJS.ProcessEnv = configurationEnvironment();
      delete environment[key];
      expect(() => readConfig(environment)).toThrow(new ConfigurationError(key));
    },
  );

  test.each(['http://127.0.0.1:3001', 'http://[::1]:3001', 'https://skyttel.example.test'])(
    'accepts supported origin %s',
    (origin) => {
      expect(readConfig({ ...configurationEnvironment(), SKYTTEL_ORIGIN: origin }).origin).toBe(
        origin,
      );
    },
  );

  test.each([
    'not a URL',
    'http://skyttel.example.test',
    'ftp://localhost',
    'https://skyttel.example.test/',
    'https://skyttel.example.test/path',
    'https://user:password@skyttel.example.test',
    ' https://skyttel.example.test',
  ])('rejects unsafe or noncanonical origin %s', (origin) => {
    expect(() => readConfig({ ...configurationEnvironment(), SKYTTEL_ORIGIN: origin })).toThrow(
      new ConfigurationError('SKYTTEL_ORIGIN'),
    );
  });

  test.each(['0', '65536', '3.5', 'NaN', ''])('rejects invalid listener port %s', (port) => {
    expect(() => readConfig({ ...configurationEnvironment(), PORT: port })).toThrow(
      new ConfigurationError('PORT'),
    );
  });

  test.each([
    ['BETTER_AUTH_SECRET', 'too-short'],
    ['SKYTTEL_DATABASE_PATH', ':memory:'],
    ['SKYTTEL_FIRST_ADMIN_PROVIDER', 'github'],
    ['GOOGLE_CLIENT_SECRET', ' secret '],
  ])('rejects invalid %s', (key, value) => {
    expect(() => readConfig({ ...configurationEnvironment(), [key]: value })).toThrow(
      new ConfigurationError(key),
    );
  });
});
