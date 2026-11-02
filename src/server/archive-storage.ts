import { statfsSync } from 'node:fs';
import { dirname } from 'node:path';
import type Database from 'better-sqlite3';
import { MapError } from './map-error.js';

const MiB = 1024 * 1024;
const reservations = new WeakMap<Database.Database, number>();
const budget = 2048 * MiB;
// Export: up to 128 MiB ZIP + 96 MiB parts + filesystem margin.
// Import additionally allows 4x the part sizes for SQLite rows, indexes and
// WAL growth. Existing database/WAL activity has separate headroom below.
const bytes = { import: 768 * MiB, export: 256 * MiB };

export type ArchiveReservation = { release(): void; check(): void };

/** Shared by both archive services in the single application/database instance. */
export function reserveArchiveStorage(
  database: Database.Database,
  kind: 'import' | 'export',
): ArchiveReservation {
  const amount = bytes[kind];
  function check(reserved: number) {
    try {
      const disk = statfsSync(dirname(database.name));
      // Logical pages include committed data still in WAL, unlike stat(database).
      const databaseBytes =
        (database.pragma('page_count', { simple: true }) as number) *
        (database.pragma('page_size', { simple: true }) as number);
      const headroom = Math.max(128 * MiB, 2 * databaseBytes);
      if (reserved > budget || disk.bavail * disk.bsize < reserved + headroom)
        throw new Error('insufficient_space');
    } catch {
      throw new MapError('archive_storage_unavailable', 503);
    }
  }
  // No await between capacity checking and charging: concurrent admissions
  // cannot both spend the same free bytes. Keep the full charge until removal.
  const reserved = (reservations.get(database) ?? 0) + amount;
  check(reserved);
  reservations.set(database, reserved);
  let released = false;
  return {
    check() {
      check(reservations.get(database) ?? 0);
    },
    release() {
      if (released) return;
      released = true;
      reservations.set(database, (reservations.get(database) ?? 0) - amount);
    },
  };
}
