import { mkdtempSync, rmSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { reserveArchiveStorage } from '../../../src/server/archive-storage.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, statfsSync: vi.fn(actual.statfsSync) };
});

let directory: string;
let database: Database.Database;
beforeEach(() => {
  vi.mocked(statfsSync).mockReset();
  directory = mkdtempSync(join(tmpdir(), 'archive-storage-'));
  database = new Database(join(directory, 'test.sqlite'));
  database.exec('CREATE TABLE example (value BLOB)');
});

afterEach(() => vi.restoreAllMocks());
afterEach(() => {
  database.close();
  rmSync(directory, { recursive: true, force: true });
});

test('a small volume rejects an import before consuming database headroom', () => {
  const actual = statfsSync(directory);
  vi.mocked(statfsSync).mockReturnValue({ ...actual, bsize: 1024, bavail: 800 * 1024 });
  expect(() => reserveArchiveStorage(database, 'import')).toThrow('archive_storage_unavailable');
});

test('the shared byte budget rejects concurrent reservations even with ample free disk', () => {
  const first = reserveArchiveStorage(database, 'import');
  const second = reserveArchiveStorage(database, 'import');
  const third = reserveArchiveStorage(database, 'export');
  const fourth = reserveArchiveStorage(database, 'export');
  expect(() => reserveArchiveStorage(database, 'export')).toThrow('archive_storage_unavailable');
  first.release();
  first.release();
  const replacement = reserveArchiveStorage(database, 'import');
  expect(() => reserveArchiveStorage(database, 'export')).toThrow('archive_storage_unavailable');
  for (const reservation of [second, third, fourth, replacement]) reservation.release();
});

test('rechecking protects logical database growth still held in WAL', () => {
  const actual = statfsSync(directory);
  vi.mocked(statfsSync).mockReturnValue({ ...actual, bsize: 1024, bavail: 950 * 1024 });
  database.pragma('journal_mode = WAL');
  database.pragma('wal_autocheckpoint = 0');
  const reservation = reserveArchiveStorage(database, 'import');
  database.prepare('INSERT INTO example VALUES (zeroblob(?))').run(100 * 1024 * 1024);
  expect(() => reservation.check()).toThrow('archive_storage_unavailable');
  reservation.release();
});

test('unavailable filesystem capacity fails admission closed', () => {
  vi.mocked(statfsSync).mockImplementation(() => {
    throw new Error('synthetic filesystem failure');
  });
  expect(() => reserveArchiveStorage(database, 'export')).toThrow('archive_storage_unavailable');
});
