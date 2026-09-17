import { afterEach, describe, expect, test, vi } from 'vitest';
import { ConfigurationError, readConfig } from '../../../src/server/config.js';
import { configurationEnvironment } from './fixture.js';

afterEach(() => vi.unstubAllEnvs());

describe('installation configuration', () => {
  test('reads a complete configuration with the default listener', () => {
    expect(readConfig(configurationEnvironment())).toEqual({
      origin: 'http://localhost:3000',
      databasePath: '/synthetic/skyttel.sqlite',
      firstAdmin: { provider: 'google', subject: 'synthetic-admin' },
      authSecret: 'synthetic-unit-test-secret-at-least-32-characters',
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
