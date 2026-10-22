import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const execute = promisify(execFile);

test.each([
  'single',
  'ingress',
  'missing',
  'encoded',
  'malformed',
  'untrusted',
  'direct',
  'normalization',
  'login',
  'protected-origin',
])(
  'production authentication address policy: %s',
  async (scenario) => {
    const result = await execute(
      process.execPath,
      ['--import', 'tsx', 'tests/support/auth-rate-limit-scenario.ts', scenario],
      { env: { ...process.env, NODE_ENV: 'production', TEST: 'false' }, timeout: 30_000 },
    );
    expect(result.stdout).toContain(`PASS ${scenario}`);
    const reason = ['missing', 'encoded'].includes(scenario)
      ? 'missing_header'
      : scenario === 'malformed'
        ? 'invalid_header'
        : ['untrusted', 'ingress'].includes(scenario)
          ? 'untrusted_peer'
          : undefined;
    if (reason) {
      expect(result.stderr.trim().split('\n')).toEqual([
        JSON.stringify({ event: 'auth_client_address_unavailable', reason }),
      ]);
    } else expect(result.stderr).toBe('');
  },
  35_000,
);
