import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createAuth, verifyAuthSchema } from '../../../src/server/auth.js';
import { type AuthorityFence, readConfig } from '../../../src/server/config.js';
import { openDatabase } from '../../../src/server/database.js';
import { InstallationAuthorityError } from '../../../src/server/installation-authority.js';
import { configurationEnvironment } from './fixture.js';

const directory = mkdtempSync(join(tmpdir(), 'skyttel-authority-'));
let database: ReturnType<typeof openDatabase>;
afterEach(() => {
  database?.close();
  rmSync(directory, { recursive: true, force: true });
});

test('the direct production auth factory refuses a malformed host authority generation', async () => {
  const config = readConfig(configurationEnvironment(join(directory, 'installation.sqlite')));
  database = openDatabase(config.databasePath);
  let accepted: ReturnType<typeof createAuth> | undefined;
  let error: unknown;
  try {
    accepted = createAuth({ ...config, authorityFence: { generation: '-'.repeat(36) } }, database);
  } catch (failure) {
    error = failure;
  }
  if (accepted) await verifyAuthSchema(accepted);
  expect(error).toBeInstanceOf(InstallationAuthorityError);
});

test('an unfenced database with household content is not classified as a fresh empty installation', async () => {
  const config = readConfig(configurationEnvironment(join(directory, 'installation.sqlite')));
  database = openDatabase(config.databasePath);
  // An input database can contain content without a remaining login identity.
  // This is arranged on disk, not made possible through an application route.
  database
    .prepare('INSERT INTO household (id, name, createdAt) VALUES (?, ?, ?)')
    .run('retained-household', 'Bevarat hushåll', '2026-01-01T00:00:00Z');
  let accepted: ReturnType<typeof createAuth> | undefined;
  let error: unknown;
  try {
    accepted = createAuth(config, database);
  } catch (failure) {
    error = failure;
  }
  if (accepted) await verifyAuthSchema(accepted);
  expect(error).toBeInstanceOf(InstallationAuthorityError);
});

test('an unfenced database with an anonymous provider attempt requires controlled adoption', () => {
  const config = readConfig(configurationEnvironment(join(directory, 'installation.sqlite')));
  database = openDatabase(config.databasePath);
  database
    .prepare(`INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt)
    VALUES ('pending', 'synthetic-state', 'synthetic-provider-attempt', ?, ?, ?)`)
    .run(
      new Date(Date.now() + 60_000).toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    );
  expect(() => createAuth(config, database)).toThrow(
    new InstallationAuthorityError('authority_initialization_required'),
  );
});

test('a pre-fence restore still refuses absent or false external erasure clearance', () => {
  const config = readConfig(configurationEnvironment(join(directory, 'installation.sqlite')));
  database = openDatabase(config.databasePath);
  for (const erasureReviewed of [undefined, false]) {
    const fence = {
      generation: '22222222-2222-4222-8222-222222222222',
      restore: {
        fromGeneration: 'legacy',
        confirmedAt: Date.now(),
        erasureReviewed,
      },
    } as unknown as AuthorityFence;
    expect(() => createAuth({ ...config, authorityFence: fence }, database)).toThrow(
      new InstallationAuthorityError('restore_declaration_required'),
    );
  }
});

test('a changed host generation cannot reopen a copy without its matching trusted declaration', async () => {
  const config = readConfig(configurationEnvironment(join(directory, 'installation.sqlite')));
  database = openDatabase(config.databasePath);
  await verifyAuthSchema(createAuth(config, database));
  for (const fence of [
    { generation: '22222222-2222-4222-8222-222222222222' },
    {
      generation: '22222222-2222-4222-8222-222222222222',
      restore: {
        fromGeneration: '33333333-3333-4333-8333-333333333333',
        confirmedAt: Date.now(),
        erasureReviewed: true as const,
      },
    },
    {
      generation: '22222222-2222-4222-8222-222222222222',
      restore: {
        fromGeneration: config.authorityFence.generation,
        confirmedAt: Date.now() + 60_000,
        erasureReviewed: true as const,
      },
    },
    {
      generation: '22222222-2222-4222-8222-222222222222',
      restore: {
        fromGeneration: 'legacy',
        confirmedAt: Date.now(),
        erasureReviewed: true as const,
      },
    },
  ]) {
    expect(() => createAuth({ ...config, authorityFence: fence }, database)).toThrow(
      new InstallationAuthorityError('restore_declaration_required'),
    );
  }
});

test('a restarted restored installation still requires its external erasure clearance', async () => {
  const config = readConfig(configurationEnvironment(join(directory, 'installation.sqlite')));
  database = openDatabase(config.databasePath);
  await verifyAuthSchema(createAuth(config, database));
  const fence: AuthorityFence = {
    generation: '22222222-2222-4222-8222-222222222222',
    restore: {
      fromGeneration: config.authorityFence.generation,
      confirmedAt: Date.now(),
      erasureReviewed: true,
    },
  };
  await verifyAuthSchema(createAuth({ ...config, authorityFence: fence }, database));
  database.close();
  database = openDatabase(config.databasePath);
  let accepted: ReturnType<typeof createAuth> | undefined;
  let error: unknown;
  try {
    accepted = createAuth(
      {
        ...config,
        authorityFence: {
          ...fence,
          restore: { ...fence.restore, erasureReviewed: false },
        } as unknown as AuthorityFence,
      },
      database,
    );
  } catch (failure) {
    error = failure;
  }
  if (accepted) await verifyAuthSchema(accepted);
  expect(error).toBeInstanceOf(InstallationAuthorityError);
});
