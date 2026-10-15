import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { openDatabase } from '../../../src/server/database.js';

let directory: string;
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test('maintenance command requires both confirmations and refuses restore declarations and repeated adoption without clearing new authority', () => {
  directory = mkdtempSync(join(tmpdir(), 'skyttel-upgrade-command-'));
  const path = join(directory, 'skyttel.db');
  const environment = {
    SKYTTEL_ORIGIN: 'https://skyttel.example',
    SKYTTEL_DATABASE_PATH: path,
    SKYTTEL_AUTHORITY_GENERATION: '33333333-3333-4333-8333-333333333333',
    SKYTTEL_FIRST_ADMIN_PROVIDER: 'google',
    SKYTTEL_FIRST_ADMIN_SUBJECT: 'old-subject',
    BETTER_AUTH_SECRET: 'synthetic-upgrade-secret-at-least-32-characters',
    GOOGLE_CLIENT_ID: 'synthetic-google',
    GOOGLE_CLIENT_SECRET: 'synthetic-secret',
    MICROSOFT_CLIENT_ID: 'synthetic-microsoft',
    MICROSOFT_CLIENT_SECRET: 'synthetic-secret',
  };
  const run = (flags: string[], extra: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/server/upgrade-legacy-login.ts', ...flags],
      {
        env: { ...environment, ...extra },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
  const flags = ['--confirm-legacy-upgrade', '--confirm-service-stopped'];
  expect(run(flags).status).toBe(1);
  expect(existsSync(path)).toBe(false);
  const database = openDatabase(path);
  try {
    expect(run(flags).status).toBe(1);
    expect(database.prepare('SELECT 1 FROM installation_authority').get()).toBeUndefined();
    database
      .prepare(`INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt)
      VALUES ('owner','Alex','owner@example.test',0,?,?)`)
      .run(Date.now(), Date.now());
    database
      .prepare(`INSERT INTO session (id,token,userId,expiresAt,createdAt,updatedAt)
      VALUES ('old','old-key','owner',?,?,?)`)
      .run(Date.now() + 60_000, Date.now(), Date.now());
    const count = () =>
      (database.prepare('SELECT count(*) AS count FROM session').get() as { count: number }).count;
    expect(run([]).status).toBe(1);
    expect(run([flags[0]]).status).toBe(1);
    expect(
      run(flags, {
        SKYTTEL_RESTORE_FROM_GENERATION: '44444444-4444-4444-8444-444444444444',
        SKYTTEL_RESTORE_CONFIRMED_AT: '2026-01-01T00:00:00Z',
        SKYTTEL_RESTORE_ERASURE_REVIEWED: 'true',
      }).status,
    ).toBe(1);
    expect(count()).toBe(1);
    const upgraded = run(flags);
    expect(upgraded.stderr).toBe('');
    expect(upgraded.status).toBe(0);
    expect(upgraded.stdout).toContain('legacy_login_upgrade_completed');
    expect(count()).toBe(0);
    expect(database.prepare('SELECT id FROM user').all()).toEqual([{ id: 'owner' }]);
    expect(
      database
        .prepare('SELECT generation, restoredFrom, restoredAt FROM installation_authority')
        .get(),
    ).toEqual({
      generation: environment.SKYTTEL_AUTHORITY_GENERATION,
      restoredFrom: null,
      restoredAt: null,
    });
    database
      .prepare(`INSERT INTO session (id,token,userId,expiresAt,createdAt,updatedAt)
      VALUES ('new','new-key','owner',?,?,?)`)
      .run(Date.now() + 60_000, Date.now(), Date.now());
    expect(run(flags).status).toBe(1);
    expect(count()).toBe(1);
  } finally {
    database.close();
  }
});
